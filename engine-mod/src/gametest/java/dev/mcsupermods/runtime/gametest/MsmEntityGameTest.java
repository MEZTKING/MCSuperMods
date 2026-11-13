package dev.mcsupermods.runtime.gametest;

import com.geckolib.cache.GeckoLibResources;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmEntity;
import dev.mcsupermods.runtime.registry.MsmEntityRegistrar;
import dev.mcsupermods.runtime.registry.MsmGeoEntity;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.random.Weighted;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.attribute.EnvironmentAttributes;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.cow.Cow;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.MobSpawnSettings;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

/**
 * Runtime v1 entity GameTests (ADR 0028) on the definitions in {@code msm/msm_test/entity/}:
 * {@code kitchen_sink} (every component and goal), {@code minimal}, {@code no_egg},
 * {@code monster_spawn}, {@code future_format}, and one definition per observable goal
 * ({@code wanderer}, {@code watcher}, {@code brawler}, {@code coward}, {@code follower}).
 *
 * <p>Every entity renders through GeckoLib, so without GeckoLib ({@code -PwithoutGeckolib}) no
 * entity registers (ADR 0028 D5): the entity tests then assert the per-definition error instead.
 * GeckoLib types are touched only inside {@link Geo}. Movement tests run in the
 * {@code msm_runtime_gametest:arena} structure (stone floor, 9x9 interior, walls three high) and
 * never assert exact positions.
 */
public class MsmEntityGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final BlockPos MID = new BlockPos(5, 1, 5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static boolean geckolib() {
        return FabricLoader.getInstance().isModLoaded("geckolib");
    }

    @SuppressWarnings("unchecked")
    private static EntityType<MsmEntity> type(String path) {
        return (EntityType<MsmEntity>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    /**
     * Without GeckoLib, asserts that {@code paths} registered nothing and each logged the one
     * missing-GeckoLib error, then succeeds; returns true when the caller must stop.
     */
    private static boolean withoutGeckolib(GameTestHelper helper, String... paths) {
        if (geckolib()) {
            return false;
        }
        for (String path : paths) {
            helper.assertFalse(BuiltInRegistries.ENTITY_TYPE.containsKey(id(path)), path + " registered without GeckoLib");
            String file = "msm/msm_test/entity/" + path + ".json (mod msm_runtime_gametest): msm:animated_model needs the mod 'geckolib'";
            long count = MsmRuntime.report().errors().stream().filter(e -> e.startsWith(file)).count();
            helper.assertValueEqual(count, 1L, "missing-GeckoLib errors for " + path);
        }
        helper.succeed();
        return true;
    }

    private static void assertNear(GameTestHelper helper, double actual, double expected, String what) {
        helper.assertTrue(Math.abs(actual - expected) < 1e-5, what + ": expected " + expected + ", got " + actual);
    }

    /** A player in the level (always creative when made; vanilla goals search the level's players). Removed by {@link #remove}. */
    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer playerInLevel(GameTestHelper helper, BlockPos pos) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(pos)));
        return player;
    }

    private static void remove(GameTestHelper helper, ServerPlayer player) {
        helper.getLevel().getServer().getPlayerList().remove(player);
    }

    private static double horizontal(Vec3 a, Vec3 b) {
        return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
    }

    /** Records events of one definition; lives across ticks, next to other tests' listeners. */
    private static final class Recorder implements EventListener, AutoCloseable {
        final Identifier owner;
        final List<String> events = new ArrayList<>();
        final List<Action> actions = new ArrayList<>();
        final List<EventContext> contexts = new ArrayList<>();

        Recorder(String owner) {
            this.owner = id(owner);
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.equals(this.owner)) {
                events.add(event.getPath() + "@" + depth);
                contexts.add(ctx);
            }
        }

        @Override
        public void onAction(Identifier owner, Identifier event, Action action, EventContext ctx) {
            if (owner.equals(this.owner)) {
                actions.add(action);
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    /** GeckoLib types live here, so this test class loads without GeckoLib. */
    private static final class Geo {
        static boolean isGeo(Object entity) {
            return entity instanceof MsmGeoEntity;
        }

        static void trigger(MsmEntity entity, String controller, String animation) {
            ((MsmGeoEntity) entity).triggerAnim(controller, animation);
        }

        static String lookupKey(String path) {
            return GeckoLibResources.stripPrefixAndSuffix(Identifier.fromNamespaceAndPath("msm_test", path)).toString();
        }
    }

    // Registration

    @GameTest
    public void kitchenSinkRegistersWithAttributesAndDimensions(GameTestHelper helper) {
        if (withoutGeckolib(helper, "kitchen_sink")) {
            return;
        }
        EntityType<MsmEntity> sink = type("kitchen_sink");
        helper.assertValueEqual(sink.getCategory(), MobCategory.CREATURE, "category");
        helper.assertValueEqual(sink.getWidth(), 0.9f, "width");
        helper.assertValueEqual(sink.getHeight(), 1.6f, "height");
        helper.assertValueEqual(sink.getDimensions().eyeHeight(), 1.4f, "eye_height");
        helper.assertTrue(sink.fireImmune(), "fire_immune");
        helper.assertValueEqual(sink.getDefaultLootTable().orElseThrow().identifier(), id("entities/kitchen_sink"), "vanilla default loot id");
        helper.assertTrue(MsmRuntime.report().entities().contains(id("kitchen_sink")), "kitchen_sink missing from the report");
        MsmEntity mob = helper.spawnWithNoFreeWill(sink, MID);
        helper.assertTrue(Geo.isGeo(mob), "kitchen_sink is not an MsmGeoEntity: " + mob.getClass());
        helper.assertValueEqual(mob.getMaxHealth(), 30.0f, "msm:health max");
        helper.assertValueEqual(mob.getHealth(), 30.0f, "health");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.MOVEMENT_SPEED), 0.28, "msm:movement speed");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.FOLLOW_RANGE), 24.0, "msm:movement follow_range");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.KNOCKBACK_RESISTANCE), 0.2, "msm:movement knockback_resistance");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.ATTACK_DAMAGE), 4.0, "msm:attack damage");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.ATTACK_KNOCKBACK), 0.5, "msm:attack knockback");
        helper.assertValueEqual(mob.getLootTable().orElseThrow().identifier(), id("entities/kitchen_sink"), "Mob.getLootTable (type default)");
        helper.assertValueEqual(mob.definition().lootTable().orElseThrow(), id("entities/kitchen_sink_custom"), "definition loot_table");
        MsmRuntime.LOGGER.info("[msm_runtime] entity: {} registered as {} (health {}, speed {}, eye height {})", id("kitchen_sink"),
                mob.getClass().getSimpleName(), mob.getMaxHealth(), mob.getAttributeBaseValue(Attributes.MOVEMENT_SPEED),
                sink.getDimensions().eyeHeight());
        helper.succeed();
    }

    @GameTest
    public void minimalDefinitionUsesTheDefaults(GameTestHelper helper) {
        if (withoutGeckolib(helper, "minimal")) {
            return;
        }
        EntityType<MsmEntity> minimal = type("minimal");
        helper.assertValueEqual(minimal.getWidth(), 0.6f, "width");
        helper.assertValueEqual(minimal.getDimensions().eyeHeight(), 0.9f * 0.85f, "default eye height");
        helper.assertFalse(minimal.fireImmune(), "default not fire immune");
        helper.assertValueEqual(SpawnPlacements.getPlacementType(minimal), SpawnPlacementTypes.ON_GROUND, "default placement");
        helper.assertValueEqual(SpawnPlacements.getHeightmapType(minimal), Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, "default heightmap");
        MsmEntity mob = helper.spawnWithNoFreeWill(minimal, MID);
        helper.assertValueEqual(mob.getMaxHealth(), 20.0f, "default health");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.MOVEMENT_SPEED), 0.25, "default speed");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.FOLLOW_RANGE), 16.0, "default follow range");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.KNOCKBACK_RESISTANCE), 0.0, "default knockback resistance");
        assertNear(helper, mob.getAttributeBaseValue(Attributes.ATTACK_DAMAGE), 0.0, "no msm:attack");
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id("minimal_spawn_egg")), "absent spawn_egg registers an egg");
        helper.succeed();
    }

    @GameTest
    public void spawnEggSpawnsTheTypeAndCountsAsAnItem(GameTestHelper helper) {
        if (withoutGeckolib(helper, "kitchen_sink", "monster_spawn")) {
            return;
        }
        for (String path : List.of("kitchen_sink", "monster_spawn")) {
            Identifier eggId = id(path + "_spawn_egg");
            helper.assertTrue(BuiltInRegistries.ITEM.containsKey(eggId), "spawn egg " + eggId + " not registered");
            Item egg = BuiltInRegistries.ITEM.getValue(eggId);
            helper.assertTrue(egg instanceof SpawnEggItem, "egg is not a SpawnEggItem: " + egg);
            helper.assertTrue(SpawnEggItem.getType(new ItemStack(egg)) == type(path), "SpawnEggItem.getType is not " + path);
            helper.assertTrue(SpawnEggItem.byId(type(path)).map(Holder::value).orElse(null) == egg, "SpawnEggItem.byId does not find the egg");
            helper.assertTrue(MsmRuntime.report().items().contains(eggId), "the egg is not counted as an item");
        }
        helper.assertFalse(MsmRuntime.report().warnings().stream().anyMatch(w -> w.contains("unknown creative_tab") && w.contains("/entity/")),
                "egg tab reported unknown: " + MsmRuntime.report().warnings());
        helper.succeed();
    }

    @GameTest
    public void spawnEggFalseRegistersNoItem(GameTestHelper helper) {
        if (withoutGeckolib(helper, "no_egg")) {
            return;
        }
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(id("no_egg")), "no_egg not registered");
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("no_egg_spawn_egg")), "\"spawn_egg\": false registered an egg");
        helper.assertTrue(SpawnEggItem.byId(type("no_egg")).isEmpty(), "an egg spawns no_egg");
        helper.succeed();
    }

    @GameTest
    public void newerFormatIsRejected(GameTestHelper helper) {
        helper.assertFalse(BuiltInRegistries.ENTITY_TYPE.containsKey(id("future_format")), "format 2 entity registered");
        helper.assertTrue(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("entity/future_format.json")
                && e.contains("msm_runtime_gametest") && e.contains("format 2 is newer")), "no format error: " + MsmRuntime.report().errors());
        helper.succeed();
    }

    @GameTest
    public void geckolibDecidesWhetherEntitiesRegister(GameTestHelper helper) {
        List<String> all = List.of("kitchen_sink", "minimal", "no_egg", "monster_spawn", "wanderer", "watcher", "brawler", "coward", "follower",
                "singer", "off_key");
        if (withoutGeckolib(helper, all.toArray(String[]::new))) {
            helper.assertTrue(MsmRuntime.report().entities().isEmpty(), "entities registered without GeckoLib");
            return;
        }
        helper.assertValueEqual(MsmRuntime.report().entities().size(), all.size(), "entity types in the report");
        helper.assertValueEqual(MsmEntityRegistrar.geoTypes().size(), all.size(), "geo types");
        helper.assertFalse(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("/entity/") && !e.contains("future_format.json")),
                "entity errors: " + MsmRuntime.report().errors());
        helper.succeed();
    }

    // Goals

    /** RandomStrollGoal stops once noActionTime reaches 100, which only a nearby player resets; the test resets it each tick. */
    @GameTest(structure = ARENA, maxTicks = 1200)
    public void wanderMoves(GameTestHelper helper) {
        if (withoutGeckolib(helper, "wanderer")) {
            return;
        }
        MsmEntity mob = helper.spawn(type("wanderer"), MID);
        Vec3 start = mob.position();
        helper.onEachTick(() -> mob.setNoActionTime(0));
        helper.succeedWhen(() -> {
            double moved = horizontal(mob.position(), start);
            helper.assertTrue(moved > 1.5, "wanderer moved " + moved + " blocks");
            MsmRuntime.LOGGER.info("[msm_runtime] entity: wanderer moved {} blocks", moved);
        });
    }

    @GameTest(structure = ARENA, maxTicks = 1200)
    public void lookAtPlayerTurnsTheHead(GameTestHelper helper) {
        if (withoutGeckolib(helper, "watcher")) {
            return;
        }
        MsmEntity mob = helper.spawn(type("watcher"), MID);
        mob.setYRot(180.0f);
        mob.setYHeadRot(180.0f); // facing north; the player stands south
        ServerPlayer player = playerInLevel(helper, MID.south(3));
        float start = mob.getYHeadRot();
        helper.succeedWhen(() -> {
            double dx = player.getX() - mob.getX();
            double dz = player.getZ() - mob.getZ();
            float towards = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90.0f;
            float off = Math.abs(Mth.wrapDegrees(mob.getYHeadRot() - towards));
            helper.assertTrue(off < 30.0f, "head yaw " + mob.getYHeadRot() + " is " + off + " degrees off the player (start " + start + ")");
            MsmRuntime.LOGGER.info("[msm_runtime] entity: watcher head yaw {} -> {} (player at {} degrees)", start, mob.getYHeadRot(), towards);
            remove(helper, player);
        });
    }

    /** A mock player is not in the level, so the target is set directly (B110); doHurtTarget fires on_attack. */
    @GameTest(structure = ARENA, maxTicks = 300)
    public void meleeAttackHurtsAPlayerAndFiresOnAttack(GameTestHelper helper) {
        if (withoutGeckolib(helper, "brawler")) {
            return;
        }
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(MID.east(2))));
        MsmEntity mob = helper.spawn(type("brawler"), MID);
        mob.setTarget(player);
        float start = player.getHealth();
        Recorder recorder = new Recorder("brawler");
        helper.succeedWhen(() -> {
            if (mob.getTarget() == null) {
                mob.setTarget(player);
            }
            helper.assertTrue(player.getHealth() < start, "player not hurt yet (difficulty " + helper.getLevel().getDifficulty() + ")");
            helper.assertTrue(recorder.events.contains("hit@1"), "on_attack did not fire: " + recorder.events);
            helper.assertTrue(recorder.contexts.getFirst().player() == player, "on_attack context player is not the target");
            helper.assertTrue(recorder.actions.stream().anyMatch(a -> a instanceof Action.PlaySound), "play_sound did not run");
            recorder.close();
            MsmRuntime.LOGGER.info("[msm_runtime] entity: brawler hurt a mock player ({} -> {}) and fired {}", start, player.getHealth(),
                    recorder.events);
        });
    }

    @GameTest(structure = ARENA, maxTicks = 300)
    public void meleeAttackTargetsListedTypes(GameTestHelper helper) {
        if (withoutGeckolib(helper, "brawler")) {
            return;
        }
        Pig pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, MID.east(3));
        MsmEntity mob = helper.spawn(type("brawler"), MID.west(2));
        float start = pig.getHealth();
        helper.succeedWhen(() -> {
            helper.assertTrue(pig.getHealth() < start || !pig.isAlive(), "pig not hurt yet (target: " + mob.getTarget() + ")");
            MsmRuntime.LOGGER.info("[msm_runtime] entity: brawler attacked a pig by type ({} -> {})", start, pig.getHealth());
        });
    }

    @GameTest(structure = ARENA, maxTicks = 200)
    public void retaliateTargetsTheAttacker(GameTestHelper helper) {
        if (withoutGeckolib(helper, "brawler")) {
            return;
        }
        Cow cow = helper.spawnWithNoFreeWill(EntityTypes.COW, MID.east(3));
        MsmEntity mob = helper.spawn(type("brawler"), MID.west(2));
        // HurtByTargetGoal ignores a hurt whose timestamp equals its own (0 at first), and the mob's tick
        // count is 0 when spawned: hurt it a few ticks later.
        helper.runAfterDelay(5, () -> helper.hurt(mob, helper.getLevel().damageSources().mobAttack(cow), 1.0f));
        float start = cow.getHealth();
        // The cow is not in the brawler's targets; only HurtByTargetGoal picks it. Once picked, the
        // brawler may kill it before a later tick checks, so a hurt cow counts too.
        helper.succeedWhen(() -> {
            LivingEntity target = mob.getTarget();
            helper.assertTrue(target == cow || cow.getHealth() < start || !cow.isAlive(),
                    "brawler target is " + target + ", not the cow that hurt it");
        });
    }

    /** AvoidEntityGoal ignores creative players, so the in-level player is switched to survival. */
    @GameTest(structure = ARENA, maxTicks = 400)
    public void fleeIncreasesTheDistance(GameTestHelper helper) {
        if (withoutGeckolib(helper, "coward")) {
            return;
        }
        MsmEntity mob = helper.spawn(type("coward"), new BlockPos(4, 1, 5));
        ServerPlayer player = playerInLevel(helper, new BlockPos(2, 1, 5));
        player.setGameMode(GameType.SURVIVAL);
        double start = horizontal(mob.position(), player.position());
        helper.succeedWhen(() -> {
            double now = horizontal(mob.position(), player.position());
            helper.assertTrue(now > start + 2.0, "coward is " + now + " blocks from the player (start " + start + ")");
            MsmRuntime.LOGGER.info("[msm_runtime] entity: coward fled from {} to {} blocks", start, now);
            remove(helper, player);
        });
    }

    @GameTest(structure = ARENA, maxTicks = 400)
    public void followDecreasesTheDistance(GameTestHelper helper) {
        if (withoutGeckolib(helper, "follower")) {
            return;
        }
        MsmEntity mob = helper.spawn(type("follower"), new BlockPos(2, 1, 2));
        ServerPlayer player = playerInLevel(helper, new BlockPos(8, 1, 8));
        double start = horizontal(mob.position(), player.position());
        helper.succeedWhen(() -> {
            double now = horizontal(mob.position(), player.position());
            helper.assertTrue(now < start - 2.0, "follower is " + now + " blocks from the player (start " + start + ")");
            MsmRuntime.LOGGER.info("[msm_runtime] entity: follower closed from {} to {} blocks", start, now);
            remove(helper, player);
        });
    }

    // Triggers and actions

    @GameTest
    public void onHurtFiresWithPlayAnimation(GameTestHelper helper) {
        if (withoutGeckolib(helper, "kitchen_sink")) {
            return;
        }
        MsmEntity mob = helper.spawnWithNoFreeWill(type("kitchen_sink"), MID);
        try (Recorder r = new Recorder("kitchen_sink")) {
            helper.hurt(mob, helper.getLevel().damageSources().generic(), 1.0f);
            helper.assertValueEqual(r.events, List.of("ouch@1"), "events fired");
            helper.assertTrue(r.contexts.getFirst().entity() == mob, "context entity");
            helper.assertTrue(r.contexts.getFirst().base().equals(mob.blockPosition()), "context base is the entity's block");
            helper.assertTrue(r.actions.stream().anyMatch(a -> a instanceof Action.PlayAnimation p && p.animation().equals("flinch")
                    && p.controller().equals(EntityDefinition.TRIGGERED_CONTROLLER)), "play_animation ran: " + r.actions);
        }
        helper.assertValueEqual(mob.getHealth(), 29.0f, "health after the hit");
        helper.succeed();
    }

    @GameTest
    public void onDeathFiresAndTheLootTableDrops(GameTestHelper helper) {
        if (withoutGeckolib(helper, "kitchen_sink")) {
            return;
        }
        MsmEntity mob = helper.spawnWithNoFreeWill(type("kitchen_sink"), MID);
        try (Recorder r = new Recorder("kitchen_sink")) {
            helper.kill(mob);
            helper.assertValueEqual(r.events, List.of("shatter@1"), "events fired (no on_hurt for a lethal hit)");
        }
        helper.assertBlockPresent(Blocks.GOLD_BLOCK, MID.above());
        helper.succeedWhen(() -> {
            List<ItemEntity> drops = helper.getEntities(EntityTypes.ITEM, MID, 3.0);
            helper.assertTrue(drops.stream().anyMatch(i -> i.getItem().is(Items.EMERALD)), "loot_table did not drop an emerald: " + drops);
        });
    }

    @GameTest
    public void onInteractFiresForThePlayer(GameTestHelper helper) {
        if (withoutGeckolib(helper, "kitchen_sink")) {
            return;
        }
        MsmEntity mob = helper.spawnWithNoFreeWill(type("kitchen_sink"), MID);
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(MID.east())));
        InteractionResult result;
        try (Recorder r = new Recorder("kitchen_sink")) {
            result = mob.interact(player, InteractionHand.MAIN_HAND, mob.position());
            helper.assertValueEqual(r.events, List.of("pat@1", "ouch@2"), "events fired");
            helper.assertTrue(r.contexts.getFirst().player() == player, "context player");
        }
        helper.assertTrue(result.consumesAction(), "interaction result " + result);
        int diamonds = 0;
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack s = player.getInventory().getItem(i);
            if (s.is(Items.DIAMOND)) {
                diamonds += s.getCount();
            }
        }
        helper.assertValueEqual(diamonds, 2, "give_item diamonds");
        helper.succeed();
    }

    @GameTest
    public void playAnimationTriggersOnAGeoEntity(GameTestHelper helper) {
        if (withoutGeckolib(helper, "kitchen_sink")) {
            return;
        }
        MsmEntity mob = helper.spawnWithNoFreeWill(type("kitchen_sink"), MID);
        helper.assertValueEqual(mob.definition().triggerableAnimations().get(EntityDefinition.TRIGGERED_CONTROLLER), Set.of("idle", "walk", "attack", "flinch", "slam"),
                "triggerable animations of msm_triggered");
        mob.playAnimation(EntityDefinition.TRIGGERED_CONTROLLER, "slam");
        Geo.trigger(mob, EntityDefinition.TRIGGERED_CONTROLLER, "not_in_the_file");
        Geo.trigger(mob, "no_such_controller", "attack");
        helper.assertValueEqual(Geo.lookupKey("geckolib/models/entity/golem.geo.json"), "msm_test:entity/golem", "geo model lookup key");
        helper.assertValueEqual(Geo.lookupKey("geckolib/animations/entity/golem_animations.animation.json"), "msm_test:entity/golem_animations",
                "animation lookup key");
        helper.succeed();
    }

    @GameTest
    public void playAnimationInABlockIsDroppedWithAWarning(GameTestHelper helper) {
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("block/animated.json") && w.contains("play_animation 'wave'")),
                "no warning for play_animation in a block: " + warnings);
        BlockPos at = new BlockPos(2, 1, 2);
        helper.setBlock(at, BuiltInRegistries.BLOCK.getValue(id("animated")));
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        try (Recorder r = new Recorder("animated")) {
            helper.useBlock(at, player);
            helper.assertValueEqual(r.events, List.of("wave@1"), "the rest of the event runs");
            helper.assertFalse(r.actions.stream().anyMatch(a -> a instanceof Action.PlayAnimation), "play_animation kept: " + r.actions);
        }
        helper.assertTrue(player.getInventory().contains(new ItemStack(Items.STICK)), "give_item after the dropped action did not run");
        helper.succeed();
    }

    // Spawning and late checks

    /** Fabric's BiomeModifications.addSpawn on 26.3 writes the minecraft:gameplay/natural_mob_spawns attribute (B110). */
    @GameTest
    public void naturalSpawnsReachTheBiomes(GameTestHelper helper) {
        if (withoutGeckolib(helper, "kitchen_sink", "monster_spawn")) {
            return;
        }
        var biomes = helper.getLevel().registryAccess().lookupOrThrow(Registries.BIOME);
        for (ResourceKey<Biome> key : List.of(Biomes.PLAINS, Biomes.FOREST, Biomes.BIRCH_FOREST)) {
            Weighted<MobSpawnSettings.SpawnerData> entry = spawn(biomes.getOrThrow(key).value(), MobCategory.CREATURE, type("kitchen_sink"));
            helper.assertTrue(entry != null, key.identifier() + " has no natural spawn for kitchen_sink");
            helper.assertValueEqual(entry.weight(), 6, key.identifier() + " spawn weight");
        }
        helper.assertTrue(spawn(biomes.getOrThrow(Biomes.DESERT).value(), MobCategory.CREATURE, type("kitchen_sink")) == null,
                "desert must not spawn kitchen_sink");
        Weighted<MobSpawnSettings.SpawnerData> monster = spawn(biomes.getOrThrow(Biomes.DESERT).value(), MobCategory.MONSTER, type("monster_spawn"));
        helper.assertTrue(monster != null, "desert has no monster spawn for monster_spawn");
        helper.assertValueEqual(monster.weight(), 9, "monster spawn weight");
        helper.assertValueEqual(monster.value().count().minInclusive(), 2, "min_group");
        helper.assertValueEqual(monster.value().count().maxInclusive(), 4, "max_group");
        helper.assertValueEqual(SpawnPlacements.getHeightmapType(type("monster_spawn")), Heightmap.Types.WORLD_SURFACE, "heightmap");
        helper.assertValueEqual(SpawnPlacements.getPlacementType(type("monster_spawn")), SpawnPlacementTypes.ON_GROUND, "placement");
        MsmRuntime.LOGGER.info("[msm_runtime] entity: desert natural_mob_spawns has {} (weight {}, count {}-{})", id("monster_spawn"),
                monster.weight(), monster.value().count().minInclusive(), monster.value().count().maxInclusive());
        helper.succeed();
    }

    private static Weighted<MobSpawnSettings.SpawnerData> spawn(Biome biome, MobCategory category, EntityType<?> type) {
        MobSpawnSettings spawns = biome.getAttributes().applyModifier(EnvironmentAttributes.NATURAL_MOB_SPAWNS,
                EnvironmentAttributes.NATURAL_MOB_SPAWNS.defaultValue());
        return spawns.getMobsInCategory(category).unwrap().stream().filter(w -> w.value().type() == type).findFirst().orElse(null);
    }

    @GameTest
    public void unknownBiomesAndEntityTypesWarnAfterStartup(GameTestHelper helper) {
        if (withoutGeckolib(helper, "kitchen_sink")) {
            return;
        }
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("entity/kitchen_sink.json") && w.contains("unknown biome in spawn.biomes msm_test:no_such_biome")),
                "no warning for the unknown biome: " + warnings);
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("entity/kitchen_sink.json")
                && w.contains("unknown entity type in msm:ai_goals msm_test:no_such_mob")), "no warning for the unknown entity type: " + warnings);
        helper.assertFalse(warnings.stream().anyMatch(w -> w.contains("minecraft:plains") || w.contains("#minecraft:is_forest")
                || w.contains("minecraft:creeper") || w.contains("minecraft:desert")), "known ids reported unknown: " + warnings);
        helper.succeed();
    }
}
