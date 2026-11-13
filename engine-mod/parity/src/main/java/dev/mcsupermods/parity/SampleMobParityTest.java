package dev.mcsupermods.parity;

import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.random.Weighted;
import net.minecraft.world.attribute.EnvironmentAttributes;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.MobSpawnSettings;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-mob} (namespace {@code msm_sample_mob}, entity
 * {@code glow_golem}), against vanilla and Fabric API only (ADR 0033 D5): registration and
 * dimensions, attributes, the spawn egg, the natural spawn in the biomes' spawn settings,
 * pathfinding, melee damage and the {@code on_death} effects (the function's chat line
 * {@code The glow golem fades.} and the loot table's glowstone dust). The movement tests run in
 * the {@code msm_parity_tests:arena} structure (stone floor, 9x9 interior, walls three high; a
 * copy of the runtime's GameTest arena). Since ADR 0057 the golem's ambient (every 200 ticks), hurt,
 * death and step sounds are the project sound events {@code golem.ambient}, {@code golem.hurt},
 * {@code golem.death} and {@code golem.step}, heard as the sound packets a listening
 * {@link ParityEars} spectator receives. Run with
 * {@code --gametest-filter msm_parity_tests:sample_mob_*}.
 */
public class SampleMobParityTest {
    static {
        ParityChat.register();
    }

    private static final String NAMESPACE = "msm_sample_mob";
    private static final String ARENA = "msm_parity_tests:arena";
    private static final BlockPos MID = new BlockPos(5, 1, 5);
    private static final String FADES = "The glow golem fades.";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    @SuppressWarnings("unchecked")
    private static EntityType<Mob> golem(GameTestHelper helper) {
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(id("glow_golem")), "entity type " + id("glow_golem") + " is not registered");
        return (EntityType<Mob>) BuiltInRegistries.ENTITY_TYPE.getValue(id("glow_golem"));
    }

    private static void assertNear(GameTestHelper helper, double actual, double expected, String what) {
        helper.assertTrue(Math.abs(actual - expected) < 1e-5, what + ": expected " + expected + ", got " + actual);
    }

    private static double horizontal(Vec3 a, Vec3 b) {
        return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
    }

    @GameTest
    public void golemRegistersWithDimensions(GameTestHelper helper) {
        EntityType<Mob> type = golem(helper);
        helper.assertValueEqual(type.getCategory(), MobCategory.CREATURE, "category");
        helper.assertValueEqual(type.getWidth(), 0.8f, "width");
        helper.assertValueEqual(type.getHeight(), 1.9f, "height");
        helper.assertValueEqual(type.getDimensions().eyeHeight(), 1.6f, "eye_height");
        helper.assertTrue(type.fireImmune(), "fire_immune");
        helper.assertValueEqual(SpawnPlacements.getPlacementType(type), SpawnPlacementTypes.ON_GROUND, "spawn placement");
        helper.assertValueEqual(SpawnPlacements.getHeightmapType(type), Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, "spawn heightmap");
        helper.succeed();
    }

    @GameTest
    public void golemAttributes(GameTestHelper helper) {
        Mob mob = helper.spawnWithNoFreeWill(golem(helper), MID);
        helper.assertValueEqual(mob.getMaxHealth(), 40.0f, "msm:health max");
        helper.assertValueEqual(mob.getHealth(), 40.0f, "health when spawned");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.MOVEMENT_SPEED), 0.25, "movement speed");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.FOLLOW_RANGE), 24.0, "follow range");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.KNOCKBACK_RESISTANCE), 0.4, "knockback resistance");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.ATTACK_DAMAGE), 5.0, "attack damage");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.ATTACK_KNOCKBACK), 0.5, "attack knockback");
        helper.assertValueEqual(mob.getLootTable().orElseThrow().identifier(), id("entities/glow_golem"), "loot table");
        helper.succeed();
    }

    @GameTest
    public void spawnEggSpawnsTheGolem(GameTestHelper helper) {
        EntityType<Mob> type = golem(helper);
        Identifier eggId = id("glow_golem_spawn_egg");
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(eggId), "spawn egg " + eggId + " is not registered");
        Item egg = BuiltInRegistries.ITEM.getValue(eggId);
        helper.assertTrue(egg instanceof SpawnEggItem, "egg is not a SpawnEggItem: " + egg);
        helper.assertTrue(SpawnEggItem.getType(new ItemStack(egg)) == type, "SpawnEggItem.getType is not glow_golem");
        helper.succeed();
    }

    @GameTest
    public void naturalSpawnInForestsAndPlains(GameTestHelper helper) {
        EntityType<Mob> type = golem(helper);
        var biomes = helper.getLevel().registryAccess().lookupOrThrow(Registries.BIOME);
        for (ResourceKey<Biome> key : List.of(Biomes.FOREST, Biomes.BIRCH_FOREST, Biomes.PLAINS)) {
            Weighted<MobSpawnSettings.SpawnerData> entry = spawn(biomes.getOrThrow(key).value(), type);
            helper.assertTrue(entry != null, key.identifier() + " has no natural creature spawn for glow_golem");
            helper.assertValueEqual(entry.weight(), 5, key.identifier() + " spawn weight");
            helper.assertValueEqual(entry.value().count().minInclusive(), 1, key.identifier() + " min_group");
            helper.assertValueEqual(entry.value().count().maxInclusive(), 2, key.identifier() + " max_group");
        }
        helper.assertTrue(spawn(biomes.getOrThrow(Biomes.DESERT).value(), type) == null, "desert must not spawn glow_golem");
        helper.succeed();
    }

    /** Fabric's BiomeModifications.addSpawn on 26.3 writes the minecraft:gameplay/natural_mob_spawns attribute. */
    private static Weighted<MobSpawnSettings.SpawnerData> spawn(Biome biome, EntityType<?> type) {
        MobSpawnSettings spawns = biome.getAttributes().applyModifier(EnvironmentAttributes.NATURAL_MOB_SPAWNS,
                EnvironmentAttributes.NATURAL_MOB_SPAWNS.defaultValue());
        return spawns.getMobsInCategory(MobCategory.CREATURE).unwrap().stream().filter(w -> w.value().type() == type).findFirst().orElse(null);
    }

    /** Pathfinding: the golem walks across the arena when told to (re-told whenever its path ends). */
    @GameTest(structure = ARENA, maxTicks = 400)
    public void golemWalksToTheTarget(GameTestHelper helper) {
        Mob mob = helper.spawn(golem(helper), new BlockPos(2, 1, 5));
        BlockPos target = new BlockPos(8, 1, 5);
        Vec3 goal = helper.absoluteVec(Vec3.atBottomCenterOf(target));
        helper.walkTo(mob, target, 1.0f);
        helper.onEachTick(() -> {
            if (mob.getNavigation().isDone() && horizontal(mob.position(), goal) >= 1.5) {
                mob.getNavigation().moveTo(goal.x, goal.y, goal.z, 1.0);
            }
        });
        helper.succeedWhen(() -> {
            double left = horizontal(mob.position(), goal);
            helper.assertTrue(left < 1.5, "glow_golem is " + left + " blocks from the target");
        });
    }

    /** Melee: a targeted pig (10 health, no armour) loses exactly the golem's 5 attack damage per hit. */
    @GameTest(structure = ARENA, maxTicks = 300)
    public void golemMeleeDealsItsAttackDamage(GameTestHelper helper) {
        Pig pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, MID.east(2));
        Mob mob = helper.spawn(golem(helper), MID.west(1));
        mob.setTarget(pig);
        float start = pig.getHealth();
        float[] firstHit = {Float.NaN};
        helper.onEachTick(() -> {
            if (mob.getTarget() == null && pig.isAlive()) {
                mob.setTarget(pig);
            }
            if (Float.isNaN(firstHit[0]) && pig.getHealth() < start) {
                firstHit[0] = start - pig.getHealth();
            }
        });
        helper.succeedWhen(() -> {
            helper.assertFalse(Float.isNaN(firstHit[0]), "the pig was not hit yet (target " + mob.getTarget() + ")");
            helper.assertValueEqual(firstHit[0], 5.0f, "damage of the first hit");
        });
    }

    @GameTest
    public void deathRunsTheFunctionAndDropsTheLoot(GameTestHelper helper) {
        Mob mob = helper.spawnWithNoFreeWill(golem(helper), MID);
        int mark = ParityChat.mark();
        helper.kill(mob);
        helper.assertValueEqual(ParityChat.since(mark), List.of(FADES), "chat after the golem died (run_function golem/glow_burst)");
        helper.succeedWhen(() -> {
            List<ItemEntity> drops = helper.getEntities(EntityTypes.ITEM, MID, 3.0);
            helper.assertTrue(drops.stream().anyMatch(i -> i.getItem().is(Items.GLOWSTONE_DUST)), "no glowstone dust dropped: " + drops);
        });
    }

    // Mob sounds (ADR 0057 D6)

    private static void assertHeard(GameTestHelper helper, ParityEars ears, String key, String what) {
        List<Identifier> heard = ears.heard();
        helper.assertTrue(heard.contains(id(key)), what + ": " + id(key) + " not heard; heard " + heard);
    }

    @GameTest(structure = ARENA, maxTicks = 100)
    public void golemSoundsAreTheProjectEvents(GameTestHelper helper) {
        EntityType<Mob> type = golem(helper);
        ParityEars ears = ParityEars.listener(helper, MID.above());
        try {
            Mob mob = helper.spawnWithNoFreeWill(type, MID);
            helper.assertValueEqual(mob.getAmbientSoundInterval(), 200, "ambient_interval_ticks");
            ears.heard();
            mob.playAmbientSound();
            assertHeard(helper, ears, "golem.ambient", "ambient");
            // Steps: once it stands on the floor, walk back and forth past the step distance.
            helper.runAfterDelay(5, () -> {
                try {
                    ears.heard();
                    for (int i = 0; i < 8; i++) {
                        mob.move(MoverType.SELF, new Vec3(i % 2 == 0 ? 0.4 : -0.4, -0.1, 0));
                    }
                    assertHeard(helper, ears, "golem.step", "step");
                    mob.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 1.0f);
                    assertHeard(helper, ears, "golem.hurt", "hurt");
                    // Vanilla plays the death sound only for a hit outside the invulnerable time: a second golem dies.
                    Mob doomed = helper.spawnWithNoFreeWill(type, MID);
                    ears.heard();
                    doomed.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 1000.0f);
                    assertHeard(helper, ears, "golem.death", "death");
                    mob.discard();
                } finally {
                    ears.close();
                }
                helper.succeed();
            });
        } catch (RuntimeException e) {
            ears.close();
            throw e;
        }
    }
}
