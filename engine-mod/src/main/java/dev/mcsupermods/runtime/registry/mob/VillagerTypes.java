package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.loader.VillagerTypeParser;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderSet;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.TagKey;
import net.minecraft.world.entity.npc.villager.VillagerType;
import net.minecraft.world.level.biome.Biome;

/**
 * Project villager types (ADR 0107 D5 as amended after the B524 spike, kind {@code msm:villager_type}): one entry of
 * {@code BuiltInRegistries.VILLAGER_TYPE} per {@code villager_type} definition, registered at start-up, with its biomes
 * added to vanilla's biome map ({@code VillagerType.BY_BIOME}, private and mutable, reached by reflection; a missing
 * field is warned about once and the types stay registered without biomes). Vanilla does the rest: a villager or zombie
 * villager spawned or born in one of the biomes takes the type ({@code VillagerType.byBiome}), saves it in its
 * {@code VillagerData} and keeps it when it turns into a zombie villager and back, and vanilla's renderers draw
 * {@code <ns>:textures/entity/villager/type/<path>.png} and {@code zombie_villager/type/<path>.png} with no client code
 * (lowered from the element's pictures). No trades per type (limit N11).
 *
 * <p>Biome ids are mapped at start-up and kept; a project type takes a biome from vanilla's own type (that is how a
 * desert look is replaced), and when two project types name the same biome id the first in scan order keeps it (a
 * warning for the later one). Biome tags are resolved against the world's registries when a server starts and after
 * each data pack reload; tag entries never replace an id entry or an earlier type's tag entry, and a reload first puts
 * back what the last resolution replaced. A biome id the world does not have is warned about when the server starts
 * ({@link #serverWarnings}).
 */
public final class VillagerTypes {
    private static final Map<Identifier, Registered> REGISTERED = new LinkedHashMap<>();
    /** The biomes project types took by id, and the type each now has. */
    private static final Map<ResourceKey<Biome>, ResourceKey<VillagerType>> BY_ID = new LinkedHashMap<>();
    /** What the last tag resolution replaced: the biome and its earlier type, empty when it had none. */
    private static final Map<ResourceKey<Biome>, Optional<ResourceKey<VillagerType>>> REPLACED_BY_TAGS = new HashMap<>();
    private static Map<ResourceKey<Biome>, ResourceKey<VillagerType>> byBiome;
    private static volatile List<String> serverWarnings = List.of();
    private static boolean listening;

    private VillagerTypes() {}

    /** A registered project villager type. */
    public record Registered(ResourceKey<VillagerType> key, List<String> biomes) {}

    /** The types registered at start-up, by id in scan order. */
    public static Map<Identifier, Registered> registered() {
        return Map.copyOf(REGISTERED);
    }

    /** The warnings of the last server start or data pack reload (biome ids the world does not have). */
    public static List<String> serverWarnings() {
        return serverWarnings;
    }

    /**
     * Parses the scanned {@code villager_type} definitions ({@link VillagerTypeParser#parseAll}), registers their types
     * and maps their biome ids; logs and adds the errors and warnings to the report.
     */
    public static LoadReport register(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, VillagerTypeParser.VillagerType> parsed = VillagerTypeParser.parseAll(report.definitions(), errors, warnings);
        Map<Identifier, String> files = new LinkedHashMap<>();
        for (RawDefinition raw : report.definitions()) {
            if (raw.kind().equals(VillagerTypeParser.KIND)) {
                files.put(raw.id(), raw.describe());
            }
        }
        List<Identifier> registered = new ArrayList<>();
        if (!parsed.isEmpty()) {
            Map<ResourceKey<Biome>, ResourceKey<VillagerType>> map = biomeMap(warnings);
            for (Map.Entry<Identifier, VillagerTypeParser.VillagerType> e : parsed.entrySet()) {
                Identifier id = e.getKey();
                String file = files.getOrDefault(id, "villager_type " + id);
                if (BuiltInRegistries.VILLAGER_TYPE.containsKey(id)) {
                    errors.add(file + ": villager type " + id + " is already registered; the type is not registered");
                    continue;
                }
                ResourceKey<VillagerType> key = ResourceKey.create(Registries.VILLAGER_TYPE, id);
                Registry.register(BuiltInRegistries.VILLAGER_TYPE, key, new VillagerType());
                REGISTERED.put(id, new Registered(key, e.getValue().biomes()));
                registered.add(id);
                if (map == null) {
                    continue;
                }
                for (String biome : e.getValue().biomes()) {
                    if (biome.startsWith("#")) {
                        continue; // resolved when a server starts
                    }
                    ResourceKey<Biome> biomeKey = ResourceKey.create(Registries.BIOME, Identifier.parse(biome));
                    ResourceKey<VillagerType> taken = BY_ID.get(biomeKey);
                    if (taken != null) {
                        warnings.add(file + ": biomes: " + biome + " already belongs to villager type " + taken.identifier()
                                + "; the first type keeps it");
                        continue;
                    }
                    BY_ID.put(biomeKey, key);
                    map.put(biomeKey, key);
                }
            }
            if (map != null && !listening) {
                listening = true;
                ServerLifecycleEvents.SERVER_STARTING.register(server -> resolve(server.registryAccess()));
                ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((server, resources, success) -> {
                    if (success) {
                        resolve(server.registryAccess());
                    }
                });
            }
        }
        errors.forEach(message -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message));
        warnings.forEach(message -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message));
        return report.withVillagerTypes(registered, errors, warnings);
    }

    /** Vanilla's biome map, or null (with one warning) when it cannot be reached. */
    @SuppressWarnings("unchecked")
    private static Map<ResourceKey<Biome>, ResourceKey<VillagerType>> biomeMap(List<String> warnings) {
        if (byBiome != null) {
            return byBiome;
        }
        try {
            Field field = VillagerType.class.getDeclaredField("BY_BIOME");
            field.setAccessible(true);
            Map<ResourceKey<Biome>, ResourceKey<VillagerType>> map = (Map<ResourceKey<Biome>, ResourceKey<VillagerType>>) field.get(null);
            map.putAll(Map.of()); // throws now, not per biome, when the map cannot change
            byBiome = map;
        } catch (ReflectiveOperationException | RuntimeException e) {
            warnings.add("villager types: vanilla's biome map (VillagerType.BY_BIOME) cannot be changed (" + e
                    + "); project villager types are registered without biomes");
        }
        return byBiome;
    }

    /**
     * Maps the biomes of the project types' tags in {@code access} (and checks their biome ids): puts back what the last
     * resolution replaced, then adds each tag's biomes that no id entry and no earlier tag entry has.
     */
    static synchronized void resolve(RegistryAccess access) {
        if (byBiome == null) {
            return;
        }
        REPLACED_BY_TAGS.forEach((biome, before) -> before.ifPresentOrElse(type -> byBiome.put(biome, type), () -> byBiome.remove(biome)));
        REPLACED_BY_TAGS.clear();
        Optional<Registry<Biome>> biomes = access.lookup(Registries.BIOME);
        if (biomes.isEmpty()) {
            return;
        }
        List<String> warnings = new ArrayList<>();
        for (Map.Entry<Identifier, Registered> e : REGISTERED.entrySet()) {
            for (String biome : e.getValue().biomes()) {
                if (!biome.startsWith("#")) {
                    if (!biomes.get().containsKey(Identifier.parse(biome))) {
                        warnings.add("villager_type " + e.getKey() + ": biomes: " + biome + " is not a biome of this world");
                    }
                    continue;
                }
                TagKey<Biome> tag = TagKey.create(Registries.BIOME, Identifier.parse(biome.substring(1)));
                Optional<HolderSet.Named<Biome>> members = biomes.get().get(tag);
                if (members.isEmpty()) {
                    warnings.add("villager_type " + e.getKey() + ": biomes: " + biome + " is not a biome tag of this world");
                    continue;
                }
                for (Holder<Biome> member : members.get()) {
                    Optional<ResourceKey<Biome>> key = member.unwrapKey();
                    if (key.isEmpty() || BY_ID.containsKey(key.get()) || REPLACED_BY_TAGS.containsKey(key.get())) {
                        continue;
                    }
                    REPLACED_BY_TAGS.put(key.get(), Optional.ofNullable(byBiome.get(key.get())));
                    byBiome.put(key.get(), e.getValue().key());
                }
            }
        }
        warnings.forEach(message -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message));
        serverWarnings = List.copyOf(warnings);
    }
}
