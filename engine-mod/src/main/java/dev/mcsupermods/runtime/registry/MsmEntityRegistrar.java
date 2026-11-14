package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.components.Goal;
import dev.mcsupermods.runtime.loader.DefinitionException;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.loader.ParseResult;
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
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricEntityType;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementType;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.level.levelgen.Heightmap;

/**
 * Registers {@code msm/<ns>/entity/*.json} definitions (ADR 0028 D5): the entity type with default
 * attributes and spawn placement, the spawn egg and the natural spawn. Every entity renders through
 * GeckoLib, so without GeckoLib a definition logs one error and registers nothing. GeckoLib types
 * are reached only through {@link GeckolibEntities}, after checking that GeckoLib is loaded.
 */
public final class MsmEntityRegistrar {
    public static final String GECKOLIB = "geckolib";

    /** Ids checked after start-up, when every mod's content and the data packs exist. */
    private record LateCheck(String file, String what, String id) {}

    private static final Map<EntityType<?>, EntityDefinition> DEFINITIONS = new IdentityHashMap<>();
    private static final Map<Identifier, EntityType<? extends Mob>> TYPES = new LinkedHashMap<>();
    private static final List<EntityType<? extends Mob>> GEO_TYPES = new ArrayList<>();
    private static final List<LateCheck> LATE = new ArrayList<>();

    private MsmEntityRegistrar() {}

    public static Optional<EntityDefinition> definition(EntityType<?> type) {
        return Optional.ofNullable(DEFINITIONS.get(type));
    }

    /** Every entity type registered from definitions, by id. */
    public static Map<Identifier, EntityType<? extends Mob>> types() {
        return Collections.unmodifiableMap(TYPES);
    }

    /**
     * Types whose instances are geo bodies ({@code MsmGeoEntity}, and from B286 on {@code MsmGeoAnimal} and
     * {@code MsmGeoMonster}); the client entrypoint gives them a GeckoLib renderer.
     */
    public static List<EntityType<? extends Mob>> geoTypes() {
        return Collections.unmodifiableList(GEO_TYPES);
    }

    /**
     * Registers every entity definition and returns the entity type ids; spawn egg ids go to
     * {@code items} (they count as items in the Phase 4 log line, ADR 0028 D5).
     */
    static List<Identifier> registerAll(List<RawDefinition> definitions, List<Identifier> items, List<String> errors, List<String> warnings) {
        boolean geckolib = FabricLoader.getInstance().isModLoaded(GECKOLIB);
        List<Identifier> registered = new ArrayList<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals("entity")) {
                continue;
            }
            ParseResult<EntityDefinition> parsed = DefinitionParser.parseEntity(raw.json());
            MsmRegistrar.report(raw, parsed, errors, warnings);
            if (parsed.definition().isEmpty()) {
                continue;
            }
            EntityDefinition def = parsed.definition().get();
            if (!geckolib) {
                // ADR 0028 D5: the entity needs its GeckoLib renderer; content jars nest GeckoLib, so this
                // only happens with hand-made installs.
                String message = raw.describe() + ": msm:animated_model needs the mod 'geckolib', which is not loaded; entity not registered";
                errors.add(message);
                MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
                continue;
            }
            try {
                if (BuiltInRegistries.ENTITY_TYPE.containsKey(raw.id())) {
                    throw new DefinitionException("entity type " + raw.id() + " is already registered");
                }
                Identifier eggId = raw.id().withSuffix("_spawn_egg");
                if (def.spawnEgg().isPresent() && BuiltInRegistries.ITEM.containsKey(eggId)) {
                    throw new DefinitionException("spawn egg id " + eggId + " is already registered");
                }
                MsmRegistrar.checkEvents(raw, def.events(), errors);
                // Every mob is the GeckoLib creature body until the bases arrive (B286).
                EntityType<? extends Mob> type = register(raw.id(), def, GeckolibEntities.factory());
                GEO_TYPES.add(type);
                registered.add(raw.id());
                if (def.spawnEgg().isPresent()) {
                    registerEgg(raw, eggId, def.spawnEgg().get(), type);
                    items.add(eggId);
                }
                def.spawn().ifPresent(spawn -> addSpawn(raw, spawn, def, type, errors));
                def.sounds().ifPresent(sounds -> sounds.ids().stream().distinct()
                        .forEach(sound -> LATE.add(new LateCheck(raw.describe(), "sound event in sounds", sound.toString()))));
                for (Identifier entityType : Goal.entityTypes(def.components().goals()).distinct().toList()) {
                    LATE.add(new LateCheck(raw.describe(), "entity type in msm:ai_goals", entityType.toString()));
                }
            } catch (DefinitionException | RuntimeException e) {
                MsmRegistrar.fail(errors, raw, e);
            }
        }
        return registered;
    }

    private static <T extends Mob> EntityType<T> register(Identifier id, EntityDefinition def, EntityType.EntityFactory<T> factory) {
        ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, id);
        EntityDefinition.Spawn spawn = def.spawn().orElse(null);
        SpawnPlacementType placement = spawn == null ? SpawnPlacementTypes.ON_GROUND : placement(spawn.placement());
        Heightmap.Types heightmap = spawn == null ? Heightmap.Types.MOTION_BLOCKING_NO_LEAVES : heightmap(spawn.heightmap());
        SpawnPlacements.SpawnPredicate<T> rule = rule(spawn == null ? EntityDefinition.Rule.MOB : spawn.rule());
        EntityType.Builder<T> builder = FabricEntityType.Builder.createMob(factory, category(def.category()), mob -> mob
                        .defaultAttributes(() -> attributes(def.components()))
                        .spawnPlacement(placement, heightmap, rule))
                .sized(def.size().width(), def.size().height());
        if (def.eyeHeight().isPresent()) {
            builder = builder.eyeHeight(def.eyeHeight().get());
        }
        if (def.components().movementOrDefault().fireImmune()) {
            builder = builder.fireImmune();
        }
        EntityType<T> type = builder.build(key);
        // The definition must be known before the first instance exists: registerGoals runs in the constructor.
        DEFINITIONS.put(type, def);
        Registry.register(BuiltInRegistries.ENTITY_TYPE, key, type);
        TYPES.put(id, type);
        return type;
    }

    private static AttributeSupplier.Builder attributes(EntityComponents c) {
        EntityComponents.Movement movement = c.movementOrDefault();
        EntityComponents.Attack attack = c.attack().orElse(null);
        return Mob.createMobAttributes()
                .add(Attributes.MAX_HEALTH, c.maxHealth())
                .add(Attributes.MOVEMENT_SPEED, movement.speed())
                .add(Attributes.FOLLOW_RANGE, movement.followRange())
                .add(Attributes.KNOCKBACK_RESISTANCE, movement.knockbackResistance())
                .add(Attributes.ATTACK_DAMAGE, attack == null ? 0.0 : attack.damage())
                .add(Attributes.ATTACK_KNOCKBACK, attack == null ? 0.0 : attack.knockback());
    }

    private static MobCategory category(EntityDefinition.Category category) {
        return MobCategory.valueOf(category.name()); // same constant names, see EntityDefinition.Category
    }

    private static SpawnPlacementType placement(EntityDefinition.Placement placement) {
        return switch (placement) {
            case ON_GROUND -> SpawnPlacementTypes.ON_GROUND;
            case IN_WATER -> SpawnPlacementTypes.IN_WATER;
            case IN_LAVA -> SpawnPlacementTypes.IN_LAVA;
            case NO_RESTRICTIONS -> SpawnPlacementTypes.NO_RESTRICTIONS;
        };
    }

    private static Heightmap.Types heightmap(EntityDefinition.HeightmapType heightmap) {
        return switch (heightmap) {
            case MOTION_BLOCKING_NO_LEAVES -> Heightmap.Types.MOTION_BLOCKING_NO_LEAVES;
            case MOTION_BLOCKING -> Heightmap.Types.MOTION_BLOCKING;
            case WORLD_SURFACE -> Heightmap.Types.WORLD_SURFACE;
            case OCEAN_FLOOR -> Heightmap.Types.OCEAN_FLOOR;
        };
    }

    /**
     * Vanilla spawn checks. {@code Monster.checkAnyLightMonsterSpawnRules} needs a {@code Monster}
     * type, so {@code any_light_monster} repeats its body: not peaceful, plus the mob rule.
     */
    private static <T extends Mob> SpawnPlacements.SpawnPredicate<T> rule(EntityDefinition.Rule rule) {
        return switch (rule) {
            case MOB -> Mob::checkMobSpawnRules;
            case MONSTER -> Monster::checkMonsterSpawnRules;
            case SURFACE_MONSTER -> Monster::checkSurfaceMonstersSpawnRules;
            case ANY_LIGHT_MONSTER -> (type, level, reason, pos, random) ->
                    level.getDifficulty() != Difficulty.PEACEFUL && Mob.checkMobSpawnRules(type, level, reason, pos, random);
            case ALWAYS -> (type, level, reason, pos, random) -> true;
        };
    }

    private static void registerEgg(RawDefinition raw, Identifier eggId, EntityDefinition.SpawnEgg settings, EntityType<? extends Mob> type) {
        ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, eggId);
        SpawnEggItem egg = Registry.register(BuiltInRegistries.ITEM, key, new SpawnEggItem(new Item.Properties().setId(key).spawnEgg(type)));
        // CreativeModeTabs.SPAWN_EGGS is private in vanilla 26.3 and widened by Fabric API's creative tab module.
        MsmRegistrar.addToTab(raw, settings.creativeTab().orElse(CreativeModeTabs.SPAWN_EGGS.identifier()), egg);
    }

    /** {@code #ns:tag} entries are biome tags, other entries biome ids; the selector is their union. */
    private static void addSpawn(RawDefinition raw, EntityDefinition.Spawn spawn, EntityDefinition def, EntityType<? extends Mob> type,
            List<String> errors) {
        if (spawn.minGroup() > spawn.maxGroup()) {
            String message = raw.describe() + ": spawn: min_group " + spawn.minGroup() + " is above max_group " + spawn.maxGroup()
                    + "; natural spawn not registered";
            errors.add(message);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
            return;
        }
        for (String entry : spawn.biomes()) {
            LATE.add(new LateCheck(raw.describe(), "biome in spawn.biomes", entry));
        }
        Predicate<BiomeSelectionContext> selector = BiomeSelection.of(spawn.biomes());
        BiomeModifications.addSpawn(selector, category(def.category()), type, spawn.weight(), spawn.minGroup(), spawn.maxGroup());
    }

    /**
     * Warns about ids that exist only once the server runs: biomes and biome tags (data packs),
     * entity types of other mods and the sound events of {@code sounds} (ADR 0057 D6; other mods may register them
     * after this runtime). {@code play_animation} names are not checked: the animation files
     * are client resources, unknown on a server; GeckoLib plays nothing for an unknown name.
     */
    static List<String> checkAfterStart(MinecraftServer server) {
        List<String> warnings = new ArrayList<>();
        for (LateCheck check : LATE) {
            boolean known = switch (check.what()) {
                case "biome in spawn.biomes" -> BiomeSelection.known(server, check.id());
                case "entity type in msm:ai_goals" -> BuiltInRegistries.ENTITY_TYPE.containsKey(Identifier.parse(check.id()));
                case "sound event in sounds" -> BuiltInRegistries.SOUND_EVENT.containsKey(Identifier.parse(check.id()));
                default -> true;
            };
            if (!known) {
                warnings.add(check.file() + ": unknown " + check.what() + " " + check.id()
                        + (check.what().startsWith("sound") ? "; the vanilla sound stays" : ""));
            }
        }
        return warnings;
    }
}
