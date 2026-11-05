package dev.mcsupermods.runtime.gametest;

import com.geckolib.cache.GeckoLibResources;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import dev.mcsupermods.runtime.registry.MsmGeoEntity;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.random.Weighted;
import net.minecraft.world.attribute.EnvironmentAttributes;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.MobSpawnSettings;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * Entity and GeckoLib spike (B110): {@code msm/msm_spike/entity/glow_golem.json} (GeckoLib model)
 * and {@code walker.json} (no model, no goals, no egg). Every test also runs without GeckoLib on the
 * classpath ({@code -PwithoutGeckolib}); GeckoLib types are touched only inside {@link Geo}.
 */
public class MsmEntitySpikeGameTest {
    private static final Identifier GOLEM = Identifier.fromNamespaceAndPath("msm_spike", "glow_golem");
    private static final Identifier WALKER = Identifier.fromNamespaceAndPath("msm_spike", "walker");

    private static boolean geckolib() {
        return FabricLoader.getInstance().isModLoaded("geckolib");
    }

    @SuppressWarnings("unchecked")
    private static EntityType<MsmEntity> type(Identifier id) {
        return (EntityType<MsmEntity>) BuiltInRegistries.ENTITY_TYPE.getValue(id);
    }

    /** A stone floor under the test area, so mobs stand and path. */
    private static void floor(GameTestHelper helper, int size) {
        for (int x = 0; x < size; x++) {
            for (int z = 0; z < size; z++) {
                helper.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    /** GeckoLib types live here, so this test class loads without GeckoLib. */
    private static final class Geo {
        static boolean isGeo(Object entity) {
            return entity instanceof MsmGeoEntity;
        }

        static void trigger(MsmEntity entity, String animation) {
            ((MsmGeoEntity) entity).triggerAnim(MsmGeoEntity.TRIGGERED, animation);
        }

        static String lookupKey(String path) {
            return GeckoLibResources.stripPrefixAndSuffix(Identifier.fromNamespaceAndPath("msm_spike", path)).toString();
        }
    }

    @GameTest
    public void entityTypeIsRegistered(GameTestHelper helper) {
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(GOLEM), "entity type " + GOLEM + " not registered");
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(WALKER), "entity type " + WALKER + " not registered");
        EntityType<MsmEntity> golemType = type(GOLEM);
        helper.assertValueEqual(golemType.getCategory(), MobCategory.CREATURE, "category");
        helper.assertValueEqual(golemType.getWidth(), 0.9f, "width");
        helper.assertValueEqual(golemType.getHeight(), 1.6f, "height");
        floor(helper, 5);
        MsmEntity golem = helper.spawn(golemType, new BlockPos(2, 1, 2));
        MsmEntity walker = helper.spawn(type(WALKER), new BlockPos(1, 1, 1));
        if (geckolib()) {
            helper.assertTrue(Geo.isGeo(golem), "golem is not an MsmGeoEntity although GeckoLib is loaded: " + golem.getClass());
            helper.assertTrue(MsmEntityRegistrar.geoTypes().contains(golemType), "golem missing from the geo types");
        } else {
            helper.assertTrue(golem.getClass() == MsmEntity.class, "without GeckoLib the golem must be a plain MsmEntity: " + golem.getClass());
            String expected = "msm/msm_spike/entity/glow_golem.json (mod msm_runtime_gametest): msm:animated_model needs the mod 'geckolib'";
            helper.assertTrue(MsmRuntime.report().errors().stream().anyMatch(e -> e.startsWith(expected)),
                    "missing GeckoLib error: " + MsmRuntime.report().errors());
        }
        helper.assertTrue(walker.getClass() == MsmEntity.class, "walker is not a plain MsmEntity: " + walker.getClass());
        MsmRuntime.LOGGER.info("[msm_runtime] spike: {} is {}, {} is {} (geckolib loaded: {})", GOLEM, golem.getClass().getSimpleName(),
                WALKER, walker.getClass().getSimpleName(), geckolib());
        helper.succeed();
    }

    @GameTest
    public void spawnEggSpawnsTheType(GameTestHelper helper) {
        Identifier eggId = GOLEM.withSuffix("_spawn_egg");
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(eggId), "spawn egg " + eggId + " not registered");
        Item egg = BuiltInRegistries.ITEM.getValue(eggId);
        helper.assertTrue(egg instanceof SpawnEggItem, "egg is not a SpawnEggItem: " + egg);
        helper.assertTrue(SpawnEggItem.getType(new ItemStack(egg)) == type(GOLEM), "SpawnEggItem.getType is not the golem");
        helper.assertTrue(SpawnEggItem.byId(type(GOLEM)).map(Holder::value).orElse(null) == egg, "SpawnEggItem.byId does not find the egg");
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(WALKER.withSuffix("_spawn_egg")), "\"spawn_egg\": false registered an egg");
        helper.assertTrue(MsmRuntime.report().items().contains(eggId), "the egg is not counted as an item");
        MsmRuntime.LOGGER.info("[msm_runtime] spike: spawn egg {} spawns {}", eggId, SpawnEggItem.getType(new ItemStack(egg)));
        helper.succeed();
    }

    @GameTest
    public void attributesComeFromTheDefinition(GameTestHelper helper) {
        floor(helper, 5);
        MsmEntity golem = helper.spawn(type(GOLEM), new BlockPos(2, 1, 2));
        helper.assertValueEqual(golem.getMaxHealth(), 30.0f, "max health");
        helper.assertValueEqual(golem.getHealth(), 30.0f, "health");
        helper.assertValueEqual(golem.getAttributeBaseValue(Attributes.MOVEMENT_SPEED), 0.3, "movement speed");
        helper.assertValueEqual(golem.getAttributeBaseValue(Attributes.ATTACK_DAMAGE), 5.0, "attack damage");
        MsmEntity walker = helper.spawn(type(WALKER), new BlockPos(1, 1, 1));
        helper.assertValueEqual(walker.getMaxHealth(), 20.0f, "default max health");
        MsmRuntime.LOGGER.info("[msm_runtime] spike: {} has max health {}, speed {}, attack damage {}", GOLEM, golem.getMaxHealth(),
                golem.getAttributeBaseValue(Attributes.MOVEMENT_SPEED), golem.getAttributeBaseValue(Attributes.ATTACK_DAMAGE));
        helper.succeed();
    }

    @GameTest(maxTicks = 200)
    public void walkToReachesTheTarget(GameTestHelper helper) {
        floor(helper, 8);
        MsmEntity walker = helper.spawn(type(WALKER), new BlockPos(1, 1, 1));
        BlockPos target = new BlockPos(6, 1, 6);
        helper.walkTo(walker, target, 1.0f);
        helper.succeedWhen(() -> {
            double distance = walker.position().distanceTo(helper.absoluteVec(Vec3.atBottomCenterOf(target)));
            helper.assertTrue(distance <= 1.5, "walker is " + distance + " blocks from the target");
            MsmRuntime.LOGGER.info("[msm_runtime] spike: walker reached {} (distance {})", target, distance);
        });
    }

    /** The target goal picks a pig by entity type (the definition lists minecraft:pig) and the melee goal hits it. */
    @GameTest(maxTicks = 200)
    public void meleeAttackTargetsListedTypes(GameTestHelper helper) {
        floor(helper, 7);
        Pig pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(4, 1, 2));
        MsmEntity golem = helper.spawn(type(GOLEM), new BlockPos(2, 1, 2));
        float start = pig.getHealth();
        helper.succeedWhen(() -> {
            helper.assertTrue(pig.getHealth() < start || !pig.isAlive(), "pig not hurt yet (golem target: " + golem.getTarget() + ")");
            MsmRuntime.LOGGER.info("[msm_runtime] spike: golem attacked a pig ({} -> {})", start, pig.getHealth());
        });
    }

    /**
     * A mock player is not in the level (GameTestHelper.makeMockPlayer), so no target goal can find
     * it; the melee goal and {@code doHurtTarget} are driven by setting the target directly.
     */
    @GameTest(maxTicks = 200)
    public void meleeAttackHurtsAPlayer(GameTestHelper helper) {
        floor(helper, 5);
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(new BlockPos(3, 1, 2))));
        MsmEntity golem = helper.spawn(type(GOLEM), new BlockPos(2, 1, 2));
        golem.setTarget(player);
        float start = player.getHealth();
        helper.succeedWhen(() -> {
            if (golem.getTarget() == null) {
                golem.setTarget(player);
            }
            helper.assertTrue(player.getHealth() < start, "player not hurt yet (difficulty " + helper.getLevel().getDifficulty() + ")");
            MsmRuntime.LOGGER.info("[msm_runtime] spike: golem hurt a mock player ({} -> {}, difficulty {})", start, player.getHealth(),
                    helper.getLevel().getDifficulty());
        });
    }

    @GameTest
    public void triggerAnimDoesNotThrowOnTheServer(GameTestHelper helper) {
        if (!geckolib()) {
            MsmRuntime.LOGGER.info("[msm_runtime] spike: GeckoLib not loaded; triggerAnim skipped");
            helper.succeed();
            return;
        }
        floor(helper, 5);
        MsmEntity golem = helper.spawn(type(GOLEM), new BlockPos(2, 1, 2));
        Geo.trigger(golem, "attack");
        Geo.trigger(golem, "not_in_the_file");
        helper.assertValueEqual(Geo.lookupKey("geckolib/models/entity/glow_golem.geo.json"), "msm_spike:entity/glow_golem", "geo model lookup key");
        helper.assertValueEqual(Geo.lookupKey("geckolib/animations/entity/glow_golem_animations.animation.json"),
                "msm_spike:entity/glow_golem_animations", "animation lookup key");
        MsmRuntime.LOGGER.info("[msm_runtime] spike: triggerAnim(\"{}\", \"attack\") ran on the server; lookup key {}", MsmGeoEntity.TRIGGERED,
                Geo.lookupKey("geckolib/models/entity/glow_golem.geo.json"));
        helper.succeed();
    }

    /** Fabric's BiomeModifications.addSpawn on 26.3 writes the minecraft:gameplay/natural_mob_spawns attribute. */
    @GameTest
    public void naturalSpawnReachesTheBiomeAttribute(GameTestHelper helper) {
        EntityType<MsmEntity> golemType = type(GOLEM);
        var biomes = helper.getLevel().registryAccess().lookupOrThrow(Registries.BIOME);
        for (ResourceKey<Biome> key : List.of(Biomes.PLAINS, Biomes.FOREST, Biomes.BIRCH_FOREST)) {
            Biome biome = biomes.getOrThrow(key).value();
            MobSpawnSettings spawns = biome.getAttributes().applyModifier(EnvironmentAttributes.NATURAL_MOB_SPAWNS,
                    EnvironmentAttributes.NATURAL_MOB_SPAWNS.defaultValue());
            Weighted<MobSpawnSettings.SpawnerData> entry = spawns.getMobsInCategory(MobCategory.CREATURE).unwrap().stream()
                    .filter(w -> w.value().type() == golemType).findFirst().orElse(null);
            helper.assertTrue(entry != null, key.identifier() + " has no natural spawn for " + GOLEM);
            helper.assertValueEqual(entry.weight(), 6, key.identifier() + " spawn weight");
            MsmRuntime.LOGGER.info("[msm_runtime] spike: {} natural_mob_spawns has {} (weight {}, count {})", key.identifier(), GOLEM,
                    entry.weight(), entry.value().count());
        }
        Biome desert = biomes.getOrThrow(Biomes.DESERT).value();
        MobSpawnSettings desertSpawns = desert.getAttributes().applyModifier(EnvironmentAttributes.NATURAL_MOB_SPAWNS,
                EnvironmentAttributes.NATURAL_MOB_SPAWNS.defaultValue());
        helper.assertFalse(desertSpawns.getMobsInCategory(MobCategory.CREATURE).unwrap().stream().anyMatch(w -> w.value().type() == golemType),
                "desert must not spawn the golem");
        helper.succeed();
    }
}
