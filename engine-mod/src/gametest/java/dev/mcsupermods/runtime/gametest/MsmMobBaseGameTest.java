package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.registry.MsmAnimal;
import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.MsmMonster;
import java.util.List;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LeapAtTargetGoal;
import net.minecraft.world.entity.ai.goal.PanicGoal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.goal.WrappedGoal;
import net.minecraft.world.entity.animal.cow.Cow;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * Mob bases, the renderer rule, the simple goals and the animal spawn rules (ADR 0070 D1, D5, D6; ADR 0072 D4; B286) on
 * the {@code mx_*} definitions in {@code msm/msm_test/entity/}. Bodies are told apart through the registrar's geo types and
 * the class name, so no GeckoLib class is touched and the class loads without GeckoLib.
 */
public class MsmMobBaseGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final BlockPos MID = new BlockPos(5, 1, 5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static boolean geckolib() {
        return FabricLoader.getInstance().isModLoaded("geckolib");
    }

    @SuppressWarnings("unchecked")
    private static <T extends Mob> EntityType<T> type(String path) {
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static boolean isGeoType(String path) {
        return MsmEntityRegistrar.geoTypes().contains(type(path));
    }

    private static void assertNear(GameTestHelper helper, double actual, double expected, String what) {
        helper.assertTrue(Math.abs(actual - expected) < 1e-5, what + ": expected " + expected + ", got " + actual);
    }

    private static List<Goal> goals(Mob mob, Predicate<WrappedGoal> filter) {
        return mob.getGoalSelector().getAvailableGoals().stream().filter(filter).map(WrappedGoal::getGoal).toList();
    }

    private static List<String> errorsOf(String path) {
        String file = "msm/msm_test/entity/" + path + ".json (mod msm_runtime_gametest)";
        return MsmRuntime.report().errors().stream().filter(e -> e.startsWith(file)).toList();
    }

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer playerInLevel(GameTestHelper helper, BlockPos pos) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(pos)));
        return player;
    }

    private static double horizontal(Vec3 a, Vec3 b) {
        return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
    }

    // Bases (ADR 0070 D1, D2)

    @GameTest
    public void animalBaseIsATamableAnimalWithTheDecodedAttributes(GameTestHelper helper) {
        EntityType<MsmAnimal> type = type("mx_animal");
        MsmAnimal mob = helper.spawnWithNoFreeWill(type, MID);
        helper.assertTrue(mob instanceof TamableAnimal, "mx_animal is not a TamableAnimal: " + mob.getClass());
        helper.assertFalse(mob.isTame(), "tame without msm:tameable");
        helper.assertValueEqual(isGeoType("mx_animal"), geckolib(), "geo type (renderer auto)");
        helper.assertValueEqual(mob.getClass().getSimpleName(), geckolib() ? "MsmGeoAnimal" : "MsmAnimal", "body class");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.FLYING_SPEED), 0.6, "flying_speed");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.STEP_HEIGHT), 1.0, "step_height");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.JUMP_STRENGTH), 0.7, "msm:rideable jump");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.TEMPT_RANGE), 10.0, "tempt_range");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.MAX_HEALTH), 20.0, "default health");
        helper.assertTrue(((MsmMob) mob).definition().base() == dev.mcsupermods.runtime.loader.EntityDefinition.Base.ANIMAL, "base");
        helper.succeed();
    }

    @GameTest
    public void defaultsKeepVanillaStepAndJumpAndAddFlyingSpeed(GameTestHelper helper) {
        MsmEntity mob = helper.spawnWithNoFreeWill(type("minimal"), MID);
        assertNear(helper, mob.getAttributeBaseValue(Attributes.STEP_HEIGHT), 0.6, "vanilla step_height");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.JUMP_STRENGTH), 0.42, "vanilla jump_strength");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.FLYING_SPEED), 0.4, "default flying_speed");
        Object body = mob;
        helper.assertFalse(body instanceof Monster || body instanceof TamableAnimal, "minimal is not a plain mob: " + mob.getClass());
        helper.assertValueEqual(type("minimal").clientTrackingRange(), 5, "default client tracking range (createMob)");
        helper.succeed();
    }

    @GameTest
    public void monsterBaseIsAnEnemyThatBlocksSleeping(GameTestHelper helper) {
        EntityType<MsmMonster> type = type("mx_monster");
        MsmMonster mob = helper.spawnWithNoFreeWill(type, MID);
        helper.assertTrue(mob instanceof Monster && mob instanceof Enemy, "mx_monster is not a Monster and Enemy: " + mob.getClass());
        helper.assertValueEqual(mob.getClass().getSimpleName(), geckolib() ? "MsmGeoMonster" : "MsmMonster", "body class");
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        helper.assertTrue(mob.isPreventingPlayerRest(helper.getLevel(), player), "a monster base does not block sleeping");
        helper.assertValueEqual(type.clientTrackingRange(), 10, "msm:boss_bar tracking range (the wither's)");
        MsmMonster free = helper.spawn(type, MID.east()); // spawnWithNoFreeWill removes the goals
        helper.assertTrue(goals(free, g -> true).stream().anyMatch(g -> g instanceof LeapAtTargetGoal), "no LeapAtTargetGoal");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.FOLLOW_RANGE), 16.0, "the definition's follow range, not a monster's 35");
        helper.succeed();
    }

    @GameTest
    public void tameableOnAMobBaseIsDroppedWithOneLoadError(GameTestHelper helper) {
        List<String> errors = errorsOf("mx_tame_on_mob");
        helper.assertValueEqual(errors.size(), 1, "load errors of mx_tame_on_mob: " + errors);
        helper.assertTrue(errors.getFirst().contains("msm:tameable needs base 'animal'"), errors.getFirst());
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(id("mx_tame_on_mob")), "mx_tame_on_mob not registered");
        MsmEntity mob = helper.spawnWithNoFreeWill(type("mx_tame_on_mob"), MID);
        EntityComponents c = mob.definition().components();
        helper.assertTrue(c.tameable().isEmpty(), "msm:tameable kept");
        helper.assertTrue(c.rideable().isPresent(), "msm:rideable dropped too");
        helper.succeed();
    }

    // Renderer rule (ADR 0072 D4)

    @GameTest
    public void rendererPicksTheBodyClass(GameTestHelper helper) {
        helper.assertValueEqual(BuiltInRegistries.ENTITY_TYPE.containsKey(id("mx_geckolib_only")), geckolib(), "renderer geckolib registered");
        List<String> errors = errorsOf("mx_geckolib_only");
        helper.assertValueEqual(errors.size(), geckolib() ? 0 : 1, "missing-GeckoLib errors: " + errors);
        if (!geckolib()) {
            helper.assertTrue(errors.getFirst().contains("msm:animated_model needs the mod 'geckolib'"), errors.getFirst());
        } else {
            helper.assertTrue(isGeoType("mx_geckolib_only"), "renderer geckolib is not a geo type");
        }
        helper.assertFalse(isGeoType("mx_vanilla"), "renderer vanilla is a geo type");
        MsmEntity vanilla = helper.spawnWithNoFreeWill(type("mx_vanilla"), MID);
        helper.assertValueEqual(vanilla.getClass(), MsmEntity.class, "renderer vanilla body");
        helper.assertValueEqual(isGeoType("minimal"), geckolib(), "renderer auto is a geo type exactly with GeckoLib");
        MsmEntity auto = helper.spawnWithNoFreeWill(type("minimal"), MID.east());
        helper.assertValueEqual(auto.getClass().getSimpleName(), geckolib() ? "MsmGeoEntity" : "MsmEntity", "renderer auto body");
        helper.succeed();
    }

    // Goals (ADR 0070 D5)

    @GameTest(structure = ARENA, maxTicks = 400)
    public void temptFollowsAPlayerHoldingTheItem(GameTestHelper helper) {
        MsmEntity mob = helper.spawn(type("mx_tempter"), new BlockPos(2, 1, 2));
        // ranged_attack without msm:ranged_attack adds nothing: the float goal and the tempt goal only.
        List<Goal> all = goals(mob, g -> true);
        helper.assertValueEqual(all.size(), 2, "goals: " + all);
        helper.assertTrue(all.stream().anyMatch(g -> g instanceof FloatGoal) && all.stream().anyMatch(g -> g instanceof TemptGoal),
                "goals: " + all);
        ServerPlayer player = playerInLevel(helper, new BlockPos(8, 1, 8));
        player.setGameMode(GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.WHEAT));
        double start = horizontal(mob.position(), player.position());
        helper.succeedWhen(() -> {
            double now = horizontal(mob.position(), player.position());
            helper.assertTrue(now < start - 2.0, "mx_tempter is " + now + " blocks from the player (start " + start + ")");
            helper.assertTrue(goals(mob, WrappedGoal::isRunning).stream().anyMatch(g -> g instanceof TemptGoal), "TemptGoal not running");
            MsmRuntime.LOGGER.info("[msm_runtime] entity: mx_tempter followed the wheat from {} to {} blocks", start, now);
            helper.getLevel().getServer().getPlayerList().remove(player);
        });
    }

    @GameTest(structure = ARENA, maxTicks = 200)
    public void panicRunsAfterAHit(GameTestHelper helper) {
        MsmEntity mob = helper.spawn(type("mx_panicker"), MID);
        Cow cow = helper.spawnWithNoFreeWill(EntityTypes.COW, MID.east(3));
        helper.assertFalse(goals(mob, WrappedGoal::isRunning).stream().anyMatch(g -> g instanceof PanicGoal), "panicking before a hit");
        helper.runAfterDelay(5, () -> helper.hurt(mob, helper.getLevel().damageSources().mobAttack(cow), 1.0f));
        helper.succeedWhen(() -> helper.assertTrue(goals(mob, WrappedGoal::isRunning).stream().anyMatch(g -> g instanceof PanicGoal),
                "PanicGoal not running after the hit"));
    }

    // Spawn rules (ADR 0070 D6)

    /** The light half of the check is skipped with the trial spawner reason (vanilla's only light-ignoring reason). */
    @GameTest
    public void animalSpawnRuleAcceptsGrassAndRefusesStone(GameTestHelper helper) {
        EntityType<MsmAnimal> type = type("mx_animal");
        BlockPos grass = new BlockPos(1, 2, 1);
        BlockPos stone = new BlockPos(3, 2, 1);
        helper.setBlock(grass.below(), Blocks.GRASS_BLOCK);
        helper.setBlock(stone.below(), Blocks.STONE);
        helper.setBlock(grass, Blocks.AIR);
        helper.setBlock(stone, Blocks.AIR);
        var level = helper.getLevel();
        var random = level.getRandom();
        helper.assertTrue(net.minecraft.world.entity.SpawnPlacements.checkSpawnRules(type, level, EntitySpawnReason.TRIAL_SPAWNER,
                helper.absolutePos(grass), random), "the animal rule refuses grass");
        helper.assertFalse(net.minecraft.world.entity.SpawnPlacements.checkSpawnRules(type, level, EntitySpawnReason.TRIAL_SPAWNER,
                helper.absolutePos(stone), random), "the animal rule accepts stone");
        helper.assertFalse(net.minecraft.world.entity.SpawnPlacements.checkSpawnRules(type("mx_swimmer"), level, EntitySpawnReason.NATURAL,
                helper.absolutePos(stone), random), "the water animal rule accepts dry stone");
        helper.succeed();
    }
}
