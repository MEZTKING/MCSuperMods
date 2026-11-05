package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.DefinitionException;
import dev.mcsupermods.runtime.loader.EntitySpikeDefinition;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectionContext;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricEntityType;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.TagKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.levelgen.Heightmap;

/**
 * Registers {@code msm/<ns>/entity/*.json} definitions (spike, B110): entity type with default
 * attributes and spawn placement, spawn egg, natural spawn. GeckoLib types are reached only through
 * {@link GeckolibEntities}, after checking that GeckoLib is loaded.
 */
public final class MsmEntityRegistrar {
    public static final String GECKOLIB = "geckolib";
    // CreativeModeTabs.SPAWN_EGGS is private in 26.3; the key is built from the vanilla id.
    private static final ResourceKey<net.minecraft.world.item.CreativeModeTab> SPAWN_EGGS_TAB =
            ResourceKey.create(Registries.CREATIVE_MODE_TAB, Identifier.withDefaultNamespace("spawn_eggs"));

    private static final Map<EntityType<?>, EntitySpikeDefinition> DEFINITIONS = new IdentityHashMap<>();
    private static final Map<Identifier, EntityType<MsmEntity>> TYPES = new LinkedHashMap<>();
    private static final List<EntityType<MsmEntity>> GEO_TYPES = new ArrayList<>();

    private MsmEntityRegistrar() {}

    public static Optional<EntitySpikeDefinition> definition(EntityType<?> type) {
        return Optional.ofNullable(DEFINITIONS.get(type));
    }

    /** Every entity type registered from definitions, by id. */
    public static Map<Identifier, EntityType<MsmEntity>> types() {
        return Collections.unmodifiableMap(TYPES);
    }

    /** Types whose instances are {@code MsmGeoEntity}; the client entrypoint gives them a GeckoLib renderer. */
    public static List<EntityType<MsmEntity>> geoTypes() {
        return Collections.unmodifiableList(GEO_TYPES);
    }

    /**
     * Registers every entity definition; spawn egg ids go to {@code items} (they count as items in the
     * Phase 4 log line, ADR 0028 D5).
     */
    static void registerAll(List<RawDefinition> definitions, List<Identifier> items, List<String> errors) {
        boolean geckolib = FabricLoader.getInstance().isModLoaded(GECKOLIB);
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals("entity")) {
                continue;
            }
            try {
                EntitySpikeDefinition def = EntitySpikeDefinition.parse(raw.json());
                if (BuiltInRegistries.ENTITY_TYPE.containsKey(raw.id())) {
                    throw new DefinitionException("entity type " + raw.id() + " is already registered");
                }
                boolean geo = def.animatedModel().isPresent();
                if (geo && !geckolib) {
                    // Spike behaviour (B110): register the plain mob so the rest of the definition is testable without GeckoLib.
                    String message = raw.describe() + ": msm:animated_model needs the mod 'geckolib', which is not loaded; the entity has no renderer";
                    errors.add(message);
                    MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
                }
                boolean useGeo = geo && geckolib;
                EntityType.EntityFactory<MsmEntity> factory = useGeo ? GeckolibEntities.factory() : MsmEntity::new;
                EntityType<MsmEntity> type = register(raw.id(), def, factory);
                if (useGeo) {
                    GEO_TYPES.add(type);
                }
                if (def.spawnEgg()) {
                    items.add(registerEgg(raw.id(), type));
                }
                def.spawn().ifPresent(spawn -> addSpawn(spawn, def, type));
            } catch (DefinitionException | RuntimeException e) {
                String message = raw.describe() + ": " + e.getMessage();
                errors.add(message);
                MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message, e instanceof DefinitionException ? null : e);
            }
        }
    }

    private static EntityType<MsmEntity> register(Identifier id, EntitySpikeDefinition def, EntityType.EntityFactory<MsmEntity> factory) {
        ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, id);
        EntityType<MsmEntity> type = FabricEntityType.Builder.createMob(factory, def.category(), mob -> mob
                        .defaultAttributes(() -> attributes(def))
                        .spawnPlacement(SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, Mob::checkMobSpawnRules))
                .sized(def.width(), def.height())
                .build(key);
        // The definition must be known before the first instance exists: registerGoals runs in the constructor.
        DEFINITIONS.put(type, def);
        Registry.register(BuiltInRegistries.ENTITY_TYPE, key, type);
        TYPES.put(id, type);
        return type;
    }

    private static AttributeSupplier.Builder attributes(EntitySpikeDefinition def) {
        return Mob.createMobAttributes()
                .add(Attributes.MAX_HEALTH, def.maxHealth())
                .add(Attributes.MOVEMENT_SPEED, def.speed())
                .add(Attributes.ATTACK_DAMAGE, def.attackDamage());
    }

    private static Identifier registerEgg(Identifier id, EntityType<MsmEntity> type) throws DefinitionException {
        Identifier eggId = id.withSuffix("_spawn_egg");
        if (BuiltInRegistries.ITEM.containsKey(eggId)) {
            throw new DefinitionException("spawn egg id " + eggId + " is already registered");
        }
        ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, eggId);
        SpawnEggItem egg = Registry.register(BuiltInRegistries.ITEM, key, new SpawnEggItem(new Item.Properties().setId(key).spawnEgg(type)));
        CreativeModeTabEvents.modifyOutputEvent(SPAWN_EGGS_TAB).register(output -> output.accept(egg));
        return eggId;
    }

    /** {@code #ns:tag} entries are biome tags, other entries biome ids; the selector is their union. */
    private static void addSpawn(EntitySpikeDefinition.Spawn spawn, EntitySpikeDefinition def, EntityType<MsmEntity> type) {
        Predicate<BiomeSelectionContext> selector = ctx -> false;
        List<ResourceKey<Biome>> keys = new ArrayList<>();
        for (String entry : spawn.biomes()) {
            if (entry.startsWith("#")) {
                selector = selector.or(BiomeSelectors.tag(TagKey.create(Registries.BIOME, Identifier.parse(entry.substring(1)))));
            } else {
                keys.add(ResourceKey.create(Registries.BIOME, Identifier.parse(entry)));
            }
        }
        if (!keys.isEmpty()) {
            selector = selector.or(BiomeSelectors.includeByKey(keys));
        }
        BiomeModifications.addSpawn(selector, def.category(), type, spawn.weight(), spawn.minGroup(), spawn.maxGroup());
    }
}
