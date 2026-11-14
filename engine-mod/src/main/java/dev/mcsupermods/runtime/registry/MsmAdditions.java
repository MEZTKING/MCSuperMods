package dev.mcsupermods.runtime.registry;

import com.google.gson.JsonElement;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.JsonOps;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.BiomeAdditionDefinition;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.LootAdditionDefinition;
import dev.mcsupermods.runtime.loader.ParseResult;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectionContext;
import net.fabricmc.fabric.api.biome.v1.ModificationPhase;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.fabricmc.fabric.api.loot.v3.LootTableSource;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.util.valueproviders.ConstantInt;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.util.valueproviders.UniformInt;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.level.biome.MobSpawnSettings;
import net.minecraft.world.level.levelgen.GenerationStep;
import net.minecraft.world.level.levelgen.placement.PlacedFeature;
import net.minecraft.world.level.storage.loot.LootPool;
import net.minecraft.world.level.storage.loot.LootTable;

/**
 * Additions to vanilla content (ADR 0060): {@code msm/<ns>/biome_addition/*.json} through Fabric
 * {@link BiomeModifications} and {@code msm/<ns>/loot_addition/*.json} through {@link LootTableEvents#MODIFY}.
 *
 * <p>Biome additions are registered at initialisation, one modification per feature or spawn entry, and Fabric applies
 * them when a server starts (fixed per world load). Fabric's {@code addFeature} throws for a placed feature key that is
 * not in the registry, which would stop the server, so each feature modification first looks the key up and skips a
 * missing one; entity types are resolved the same way, when the modification runs. Both are reported by
 * {@link #checkAfterStart} as warnings.
 *
 * <p>Loot additions keep each pool as JSON and decode it with {@link LootPool#CODEC} over the registries of every
 * {@code MODIFY} call, so project items and data pack registries (enchantments, predicates) resolve and a {@code /reload}
 * adds each pool once to the freshly loaded table. Only built-in tables ({@link LootTableSource#isBuiltin()}: vanilla
 * and mods) are changed: a table that a data pack replaced wins. A pool that does not decode is one logged error per
 * load (however many tables it names) and is skipped.
 */
public final class MsmAdditions {
    /** One loot pool of one loot addition file. */
    private record Pool(String file, int index, JsonElement json) {}

    /** Ids checked after start-up, when the dynamic registries exist. */
    private record LateCheck(String file, String what, String id) {}

    private static final Map<Identifier, List<Pool>> POOLS = new LinkedHashMap<>();
    private static final List<LateCheck> LATE = new ArrayList<>();
    private static final Set<String> LOAD_SEEN = new HashSet<>();
    private static final List<String> LOAD_ERRORS = new ArrayList<>();
    private static volatile List<String> lastLoadErrors = List.of();
    private static boolean lootHooksInstalled;

    private MsmAdditions() {}

    /** Registers every biome addition and returns the ids of the files registered. */
    static List<Identifier> registerBiomeAdditions(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        List<Identifier> registered = new ArrayList<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals("biome_addition")) {
                continue;
            }
            ParseResult<BiomeAdditionDefinition> parsed = DefinitionParser.parseBiomeAddition(raw.json());
            MsmRegistrar.report(raw, parsed, errors, warnings);
            if (parsed.definition().isEmpty()) {
                continue;
            }
            try {
                registerBiomeAddition(raw, parsed.definition().get(), errors);
                registered.add(raw.id());
            } catch (RuntimeException e) {
                MsmRegistrar.fail(errors, raw, e);
            }
        }
        return List.copyOf(registered);
    }

    /**
     * The spawn uses {@code addSpawn(MobCategory, SpawnerData, int)}, deprecated by Fabric on 26.3 and 26.4 in favour of
     * overloads that take the category from the entity type; the definition names its category explicitly, and Fabric's
     * own {@code BiomeModifications.addSpawn} still calls this method on both versions.
     */
    @SuppressWarnings("deprecation")
    private static void registerBiomeAddition(RawDefinition raw, BiomeAdditionDefinition def, List<String> errors) {
        for (String entry : def.biomes()) {
            LATE.add(new LateCheck(raw.describe(), "biome in biomes", entry));
        }
        Predicate<BiomeSelectionContext> selector = BiomeSelection.of(def.biomes());
        for (int index = 0; index < def.features().size(); index++) {
            BiomeAdditionDefinition.Feature feature = def.features().get(index);
            ResourceKey<PlacedFeature> key = ResourceKey.create(Registries.PLACED_FEATURE, feature.feature());
            GenerationStep.Decoration step = GenerationStep.Decoration.valueOf(feature.step().name()); // same constant names
            LATE.add(new LateCheck(raw.describe(), "placed feature", feature.feature().toString()));
            BiomeModifications.create(modificationId(raw, "feature", index)).add(ModificationPhase.ADDITIONS, selector, (selection, context) -> {
                if (selection.getRegistryAccess().lookupOrThrow(Registries.PLACED_FEATURE).get(key).isPresent()) {
                    context.getGenerationSettings().addFeature(step, key);
                }
            });
        }
        for (int index = 0; index < def.spawns().size(); index++) {
            BiomeAdditionDefinition.Spawn spawn = def.spawns().get(index);
            if (spawn.minGroup() > spawn.maxGroup()) {
                String message = raw.describe() + ": spawns[" + index + "]: min_group " + spawn.minGroup() + " is above max_group "
                        + spawn.maxGroup() + "; the spawn is not added";
                errors.add(message);
                MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
                continue;
            }
            MobCategory category = MobCategory.valueOf(spawn.category().name()); // same constant names
            IntProvider count = spawn.minGroup() == spawn.maxGroup() ? ConstantInt.of(spawn.minGroup())
                    : UniformInt.of(spawn.minGroup(), spawn.maxGroup());
            Identifier entity = spawn.entity();
            LATE.add(new LateCheck(raw.describe(), "entity type", entity.toString()));
            BiomeModifications.create(modificationId(raw, "spawn", index)).add(ModificationPhase.ADDITIONS, selector, context -> {
                // Resolved when the server starts: every mod has registered its entity types by then.
                Optional<EntityType<?>> type = BuiltInRegistries.ENTITY_TYPE.getOptional(entity);
                type.ifPresent(t -> context.getMobSpawnSettings().addSpawn(category, new MobSpawnSettings.SpawnerData(t, count), spawn.weight()));
            });
        }
    }

    /** {@code <ns>:biome_addition/<path>/<feature|spawn>/<index>}. */
    private static Identifier modificationId(RawDefinition raw, String what, int index) {
        return Identifier.fromNamespaceAndPath(raw.id().getNamespace(), "biome_addition/" + raw.id().getPath() + "/" + what + "/" + index);
    }

    /** Registers every loot addition (and, once, the loot table listeners) and returns the ids of the files registered. */
    static List<Identifier> registerLootAdditions(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        List<Identifier> registered = new ArrayList<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals("loot_addition")) {
                continue;
            }
            ParseResult<LootAdditionDefinition> parsed = DefinitionParser.parseLootAddition(raw.json());
            MsmRegistrar.report(raw, parsed, errors, warnings);
            if (parsed.definition().isEmpty()) {
                continue;
            }
            LootAdditionDefinition def = parsed.definition().get();
            for (Identifier table : def.tables().stream().distinct().toList()) {
                List<Pool> pools = POOLS.computeIfAbsent(table, t -> new ArrayList<>());
                for (int index = 0; index < def.pools().size(); index++) {
                    pools.add(new Pool(raw.describe(), index, def.pools().get(index)));
                }
                LATE.add(new LateCheck(raw.describe(), "loot table", table.toString()));
            }
            registered.add(raw.id());
        }
        if (!lootHooksInstalled) {
            lootHooksInstalled = true;
            LootTableEvents.MODIFY.register(MsmAdditions::modifyLootTable);
            LootTableEvents.ALL_LOADED.register((resources, tables) -> endLoad());
        }
        return List.copyOf(registered);
    }

    /**
     * The {@code MODIFY} listener: adds the pools of every loot addition naming {@code key} to a built-in table. Public
     * for the GameTests, which call it directly to check the source rule.
     */
    public static void modifyLootTable(ResourceKey<LootTable> key, LootTable.Builder builder, LootTableSource source,
            HolderLookup.Provider registries) {
        if (!source.isBuiltin()) {
            return; // a data pack replaced the table: it wins (ADR 0060 D3)
        }
        List<Pool> pools = POOLS.get(key.identifier());
        if (pools == null) {
            return;
        }
        RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, registries);
        for (Pool pool : pools) {
            DataResult<LootPool> result = LootPool.CODEC.parse(ops, pool.json());
            if (result.result().isPresent()) {
                builder.pool(result.result().get());
                continue;
            }
            String message = pool.file() + ": pools[" + pool.index() + "]: " + result.error().map(DataResult.Error::message).orElse("invalid pool")
                    + "; the pool is not added";
            synchronized (LOAD_SEEN) {
                if (!LOAD_SEEN.add(pool.file() + "#" + pool.index())) {
                    continue; // one error per pool per load, however many tables name it
                }
                LOAD_ERRORS.add(message);
            }
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
        }
    }

    private static void endLoad() {
        synchronized (LOAD_SEEN) {
            lastLoadErrors = List.copyOf(LOAD_ERRORS);
            LOAD_ERRORS.clear();
            LOAD_SEEN.clear();
        }
    }

    /** The pool errors of the last completed loot table load (start-up or {@code /reload}). */
    public static List<String> lastLootLoadErrors() {
        return lastLoadErrors;
    }

    /** Warns about biomes, tags, placed features, entity types and loot tables that do not exist once the server runs. */
    static List<String> checkAfterStart(MinecraftServer server) {
        List<String> warnings = new ArrayList<>();
        HolderLookup.RegistryLookup<PlacedFeature> features = server.registryAccess().lookupOrThrow(Registries.PLACED_FEATURE);
        Set<Identifier> tables = new HashSet<>();
        server.reloadableRegistries().lookup().lookupOrThrow(Registries.LOOT_TABLE).listElementIds()
                .forEach(k -> tables.add(k.identifier()));
        for (LateCheck check : LATE) {
            Identifier id = check.id().startsWith("#") ? null : Identifier.parse(check.id());
            String consequence;
            boolean known = switch (check.what()) {
                case "biome in biomes" -> BiomeSelection.known(server, check.id());
                case "placed feature" -> features.get(ResourceKey.create(Registries.PLACED_FEATURE, id)).isPresent();
                case "entity type" -> BuiltInRegistries.ENTITY_TYPE.containsKey(id);
                case "loot table" -> tables.contains(id);
                default -> true;
            };
            consequence = switch (check.what()) {
                case "placed feature" -> "; the feature is not added";
                case "entity type" -> "; the spawn is not added";
                case "loot table" -> "; nothing is added to it";
                default -> "";
            };
            if (!known) {
                warnings.add(check.file() + ": unknown " + check.what() + " " + check.id() + consequence);
            }
        }
        return warnings;
    }
}
