package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.MsmEntity;
import java.util.List;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.control.FlyingMoveControl;
import net.minecraft.world.entity.ai.control.MoveControl;
import net.minecraft.world.entity.ai.control.SmoothSwimmingMoveControl;
import net.minecraft.world.entity.ai.goal.BreathAirGoal;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.RandomSwimmingGoal;
import net.minecraft.world.entity.ai.goal.TryFindLiquidGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomFlyingGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.WrappedGoal;
import net.minecraft.world.entity.ai.navigation.AmphibiousPathNavigation;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.entity.ai.navigation.GroundPathNavigation;
import net.minecraft.world.entity.ai.navigation.WaterBoundPathNavigation;
import net.minecraft.world.phys.Vec3;

/**
 * Movement modes (ADR 0070 D3; B290) on the {@code mv_*} definitions in {@code msm/msm_test/entity/}: {@code mv_flyer}
 * ({@code fly}), {@code mv_swimmer} ({@code swim}, {@code dry_out_ticks} 20), {@code mv_breather} ({@code swim},
 * {@code breathes_air}) and {@code mv_amphibian} ({@code amphibious}); {@code minimal} and {@code wanderer} stay
 * {@code walk}. Structures: {@code mv_sky} (a 5x10x5 glass box), {@code mv_tank} (an 11x6x5 glass tank, water y 1..4)
 * and {@code mv_pool} (water x 1..5 two deep with a step at x 5, land x 6..11 standing at y 3). Steering tests drop the
 * mob's goals and steer its navigation themselves.
 */
public class MsmMobMovementGameTest {
    private static final String SKY = "msm_runtime_gametest:mv_sky";
    private static final String TANK = "msm_runtime_gametest:mv_tank";
    private static final String POOL = "msm_runtime_gametest:mv_pool";
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final BlockPos MID = new BlockPos(5, 1, 5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static <T extends Mob> EntityType<T> type(String path) {
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static List<Goal> goals(Mob mob, Predicate<WrappedGoal> filter) {
        return mob.getGoalSelector().getAvailableGoals().stream().filter(filter).map(WrappedGoal::getGoal).toList();
    }

    private static boolean hasGoal(Mob mob, Class<?> type) {
        return goals(mob, g -> true).stream().anyMatch(type::isInstance);
    }

    private static double horizontal(Vec3 a, Vec3 b) {
        return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
    }

    /** A mob with AI but no goals, so only the test steers its navigation. */
    private static MsmEntity steerable(GameTestHelper helper, String path, BlockPos pos) {
        MsmEntity mob = helper.spawn(type(path), pos);
        mob.getGoalSelector().removeAllGoals(g -> true);
        mob.setPersistenceRequired();
        return mob;
    }

    /** Re-issues the path whenever the navigation has stopped. */
    private static void steer(Mob mob, Vec3 target) {
        if (mob.getNavigation().isDone()) {
            mob.getNavigation().moveTo(target.x, target.y, target.z, 1.0);
        }
    }

    // fly

    @GameTest
    public void flyHasNoGravityFlyingControlsAndNoFallDamage(GameTestHelper helper) {
        MsmEntity mob = helper.spawnWithNoFreeWill(type("mv_flyer"), MID);
        helper.assertTrue(mob.isNoGravity(), "a fly mob has gravity");
        helper.assertTrue(mob.getNavigation() instanceof FlyingPathNavigation, "navigation: " + mob.getNavigation().getClass());
        helper.assertTrue(mob.getMoveControl() instanceof FlyingMoveControl, "move control: " + mob.getMoveControl().getClass());
        float health = mob.getHealth();
        helper.assertFalse(mob.causeFallDamage(20.0, 1.0f, helper.getLevel().damageSources().fall()), "a fly mob takes fall damage");
        helper.assertValueEqual(mob.getHealth(), health, "health after a fall");
        MsmEntity free = helper.spawn(type("mv_flyer"), MID.east());
        helper.assertTrue(hasGoal(free, WaterAvoidingRandomFlyingGoal.class),
                "wander is not WaterAvoidingRandomFlyingGoal: " + goals(free, g -> true));
        helper.assertTrue(hasGoal(free, FloatGoal.class), "swims lost the float goal for fly");
        helper.succeed();
    }

    @GameTest(structure = SKY, maxTicks = 200)
    public void flyReachesATargetSixBlocksUp(GameTestHelper helper) {
        MsmEntity mob = steerable(helper, "mv_flyer", new BlockPos(2, 1, 2));
        Vec3 target = helper.absoluteVec(new Vec3(2.5, 7.0, 2.5));
        double startY = mob.getY();
        helper.succeedWhen(() -> {
            steer(mob, target);
            helper.assertTrue(mob.getY() >= target.y - 0.75 && horizontal(mob.position(), target) < 1.0,
                    "mv_flyer at " + mob.position() + ", target " + target);
            helper.assertTrue(mob.isNoGravity(), "gravity came back while flying");
            MsmRuntime.LOGGER.info("[msm_runtime] entity: mv_flyer rose from y {} to {}", startY, mob.getY());
        });
    }

    // swim

    @GameTest(structure = TANK, maxTicks = 100)
    public void swimHasWaterControlsAndBreathesWater(GameTestHelper helper) {
        MsmEntity mob = helper.spawnWithNoFreeWill(type("mv_swimmer"), new BlockPos(5, 1, 2));
        helper.assertTrue(mob.getNavigation() instanceof WaterBoundPathNavigation, "navigation: " + mob.getNavigation().getClass());
        helper.assertTrue(mob.getMoveControl() instanceof SmoothSwimmingMoveControl, "move control: " + mob.getMoveControl().getClass());
        helper.assertTrue(mob.canBreatheUnderwater(), "a swim mob does not breathe water");
        helper.assertFalse(mob.isPushedByFluid(), "a swim mob is pushed by water");
        helper.assertFalse(mob.isNoGravity(), "a swim mob has no gravity");
        MsmEntity free = helper.spawn(type("mv_swimmer"), new BlockPos(3, 1, 2));
        helper.assertTrue(hasGoal(free, RandomSwimmingGoal.class), "wander is not RandomSwimmingGoal: " + goals(free, g -> true));
        helper.assertFalse(hasGoal(free, FloatGoal.class), "a swim mob has the float goal");
        float max = mob.getMaxHealth();
        helper.runAfterDelay(60, () -> {
            helper.assertValueEqual(mob.getHealth(), max, "health in water");
            helper.assertValueEqual(mob.getAirSupply(), 20, "air in water (dry_out_ticks)");
            helper.succeed();
        });
    }

    @GameTest(structure = TANK, maxTicks = 200)
    public void swimReachesATargetAcrossTheTank(GameTestHelper helper) {
        MsmEntity mob = steerable(helper, "mv_swimmer", new BlockPos(1, 2, 2));
        Vec3 target = helper.absoluteVec(new Vec3(9.5, 2.5, 2.5));
        double start = horizontal(mob.position(), target);
        helper.succeedWhen(() -> {
            steer(mob, target);
            helper.assertTrue(horizontal(mob.position(), target) < 1.5, "mv_swimmer at " + mob.position() + ", target " + target);
            helper.assertTrue(mob.isInWater(), "mv_swimmer left the water");
            MsmRuntime.LOGGER.info("[msm_runtime] entity: mv_swimmer swam {} blocks", start);
        });
    }

    /** {@code dry_out_ticks} 20: the first hurt comes 20 + 20 ticks after leaving the water (vanilla's 300 + 20). */
    @GameTest(structure = ARENA, maxTicks = 100)
    public void swimDriesOutOnLandUnlessItBreathesAir(GameTestHelper helper) {
        MsmEntity swimmer = helper.spawnWithNoFreeWill(type("mv_swimmer"), new BlockPos(3, 1, 3));
        MsmEntity breather = helper.spawnWithNoFreeWill(type("mv_breather"), new BlockPos(7, 1, 7));
        float max = swimmer.getMaxHealth();
        long start = helper.getTick();
        helper.runAfterDelay(30, () -> helper.assertValueEqual(swimmer.getHealth(), max, "health 30 ticks out of water"));
        helper.succeedWhen(() -> {
            helper.assertTrue(swimmer.getHealth() < max, "mv_swimmer has not dried out");
            helper.assertTrue(helper.getTick() - start >= 35, "dried out after only " + (helper.getTick() - start) + " ticks");
            helper.assertValueEqual(breather.getHealth(), breather.getMaxHealth(), "breathes_air dried out");
        });
    }

    @GameTest(structure = TANK, maxTicks = 300)
    public void breathesAirLosesAirUnderWaterAndSurfaces(GameTestHelper helper) {
        MsmEntity mob = helper.spawn(type("mv_breather"), new BlockPos(5, 1, 2));
        mob.setPersistenceRequired();
        helper.assertFalse(mob.canBreatheUnderwater(), "breathes_air breathes water");
        helper.assertTrue(mob.getNavigation() instanceof WaterBoundPathNavigation, "navigation: " + mob.getNavigation().getClass());
        helper.assertTrue(hasGoal(mob, BreathAirGoal.class) && hasGoal(mob, TryFindLiquidGoal.class), "goals: " + goals(mob, g -> true));
        helper.assertFalse(hasGoal(mob, FloatGoal.class), "a swim mob has the float goal");
        int full = mob.getAirSupply();
        helper.runAfterDelay(20, () -> {
            helper.assertTrue(mob.getAirSupply() < full, "no air lost under water: " + mob.getAirSupply() + " of " + full);
            mob.setAirSupply(100); // below BreathAirGoal's 140
        });
        helper.runAfterDelay(21, () -> helper.succeedWhen(() -> helper.assertTrue(mob.getAirSupply() > 120,
                "mv_breather has not surfaced: air " + mob.getAirSupply() + " at " + mob.position())));
    }

    // amphibious

    @GameTest
    public void amphibiousPathsThroughWaterAndBreathesBoth(GameTestHelper helper) {
        MsmEntity mob = helper.spawn(type("mv_amphibian"), MID);
        helper.assertTrue(mob.getNavigation() instanceof AmphibiousPathNavigation, "navigation: " + mob.getNavigation().getClass());
        helper.assertValueEqual(mob.getMoveControl().getClass(), MoveControl.class, "move control");
        helper.assertTrue(mob.canBreatheUnderwater(), "an amphibious mob does not breathe water");
        helper.assertFalse(mob.isNoGravity(), "an amphibious mob has no gravity");
        helper.assertTrue(goals(mob, g -> true).stream().anyMatch(g -> g.getClass() == RandomStrollGoal.class),
                "wander is not the plain RandomStrollGoal: " + goals(mob, g -> true));
        helper.assertFalse(hasGoal(mob, FloatGoal.class), "an amphibious mob has the float goal");
        helper.succeed();
    }

    @GameTest(structure = POOL, maxTicks = 300)
    public void amphibiousWalksOutOfTheWaterOntoLand(GameTestHelper helper) {
        MsmEntity mob = steerable(helper, "mv_amphibian", new BlockPos(2, 1, 3));
        Vec3 target = helper.absoluteVec(new Vec3(9.5, 3.0, 3.5));
        helper.succeedWhen(() -> {
            steer(mob, target);
            helper.assertTrue(horizontal(mob.position(), target) < 1.5 && mob.onGround() && !mob.isInWater(),
                    "mv_amphibian at " + mob.position() + ", target " + target);
        });
    }

    @GameTest(structure = POOL, maxTicks = 300)
    public void amphibiousSwimsIntoThePool(GameTestHelper helper) {
        MsmEntity mob = steerable(helper, "mv_amphibian", new BlockPos(9, 3, 3));
        Vec3 target = helper.absoluteVec(new Vec3(2.5, 1.0, 3.5));
        helper.succeedWhen(() -> {
            steer(mob, target);
            helper.assertTrue(horizontal(mob.position(), target) < 1.5 && mob.isInWater(),
                    "mv_amphibian at " + mob.position() + ", target " + target);
            helper.assertValueEqual(mob.getHealth(), mob.getMaxHealth(), "health in water");
        });
    }

    // walk

    @GameTest
    public void walkIsUnchanged(GameTestHelper helper) {
        MsmEntity mob = helper.spawnWithNoFreeWill(type("minimal"), MID);
        helper.assertTrue(mob.getNavigation() instanceof GroundPathNavigation && !(mob.getNavigation() instanceof AmphibiousPathNavigation),
                "navigation: " + mob.getNavigation().getClass());
        helper.assertValueEqual(mob.getMoveControl().getClass(), MoveControl.class, "move control");
        helper.assertFalse(mob.isNoGravity(), "a walk mob has no gravity");
        helper.assertFalse(mob.canBreatheUnderwater(), "a walk mob breathes water");
        helper.assertTrue(mob.isPushedByFluid(), "a walk mob is not pushed by water");
        float health = mob.getHealth();
        helper.assertTrue(mob.causeFallDamage(20.0, 1.0f, helper.getLevel().damageSources().fall()), "a walk mob takes no fall damage");
        helper.assertTrue(mob.getHealth() < health, "health unchanged after a fall");
        MsmEntity wanderer = helper.spawn(type("wanderer"), MID.east(2));
        helper.assertTrue(hasGoal(wanderer, WaterAvoidingRandomStrollGoal.class), "wanderer's stroll: " + goals(wanderer, g -> true));
        helper.assertTrue(hasGoal(wanderer, FloatGoal.class), "wanderer lost the float goal");
        helper.succeed();
    }
}
