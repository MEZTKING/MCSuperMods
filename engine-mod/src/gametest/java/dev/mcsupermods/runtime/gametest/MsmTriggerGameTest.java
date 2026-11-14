package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.events.TickLimiter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Triggers of ADR 0061 (B235) on {@code msm/msm_test/}: items {@code trigger_sword} ({@code msm:on_hit}),
 * {@code trigger_wand} ({@code msm:on_use} and {@code msm:on_use_on_block}), {@code held_main}, {@code held_off},
 * {@code held_either} ({@code msm:while_held}, interval 5) and {@code worn_cap} ({@code msm:while_worn}, interval 5);
 * blocks {@code trigger_block} ({@code msm:on_break}, {@code msm:on_place}), {@code tick_block} and
 * {@code tick_never} ({@code msm:on_random_tick}, chance 1 and 0) and {@code inside_block} ({@code msm:on_entity_inside},
 * cooldown 5); the entity {@code ticker} ({@code msm:on_tick}, interval 5, and {@code msm:on_spawn}, each with a
 * {@code run_function} that tags {@code @s}); the shared
 * {@link TickLimiter}.
 *
 * <p>A mock server player is not ticked by the server (its connection is not in the server's list), so the held and
 * worn tests call {@code ServerPlayer.doTick()} once per test tick, as the network handler does for a real player. That
 * runs the vanilla order under test: {@code Player.aiStep} ticks the main inventory ({@code MAINHAND} for the selected
 * slot, {@code null} for the others), then {@code LivingEntity.aiStep} ticks the equipment slots.
 */
public class MsmTriggerGameTest {
    private static final BlockPos AT = new BlockPos(1, 1, 1);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        return player;
    }

    /** One recorded firing: the event path, the game time and the context. */
    private record Firing(String event, long time, EventContext ctx) {}

    /** Records the firings of {@code msm_test} definitions whose context matches; other tests run at the same time. */
    private static final class Recorder implements EventListener, AutoCloseable {
        private final List<Firing> firings = Collections.synchronizedList(new ArrayList<>());
        private final Predicate<EventContext> filter;

        Recorder(Predicate<EventContext> filter) {
            this.filter = filter;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.getNamespace().equals("msm_test") && depth == 1 && filter.test(ctx)) {
                firings.add(new Firing(event.getPath(), ctx.level().getGameTime(), ctx));
            }
        }

        List<Firing> of(String event, Predicate<EventContext> who) {
            synchronized (firings) {
                return firings.stream().filter(f -> f.event().equals(event) && who.test(f.ctx())).toList();
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    /** The game times of {@code firings}: one per interval, never twice in a tick. Returns an error or null. */
    private static String oncePerInterval(List<Firing> firings, int interval, int atLeast) {
        if (firings.size() < atLeast) {
            return firings.size() + " firing(s), expected at least " + atLeast;
        }
        for (int n = 1; n < firings.size(); n++) {
            long gap = firings.get(n).time() - firings.get(n - 1).time();
            if (gap != interval) {
                return "gap of " + gap + " ticks between firings " + (n - 1) + " and " + n + ", expected " + interval + ": "
                        + firings.stream().map(Firing::time).toList();
            }
        }
        return null;
    }

    private static void assertOncePerInterval(GameTestHelper helper, List<Firing> firings, int interval, int atLeast, String what) {
        String error = oncePerInterval(firings, interval, atLeast);
        helper.assertTrue(error == null, what + ": " + error);
    }

    // msm:on_hit

    /** A player's hit and a mob's melee hit each fire once; self is the attacker, other the entity hit. */
    @GameTest
    public void onHitFiresForPlayerAndMob(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        Mob vindicator = helper.spawnWithNoFreeWill(EntityTypes.VINDICATOR, AT);
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT.east());
        Mob cow2 = helper.spawnWithNoFreeWill(EntityTypes.COW, AT.south());
        try (Recorder r = new Recorder(ctx -> ctx.other() == cow || ctx.other() == cow2)) {
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("trigger_sword")));
            player.attack(cow);
            List<Firing> byPlayer = r.of("hit", ctx -> ctx.player() == player);
            helper.assertValueEqual(byPlayer.size(), 1, "player on_hit firings");
            helper.assertTrue(byPlayer.getFirst().ctx().other() == cow, "other is the cow hit by the player");
            helper.assertTrue(byPlayer.getFirst().ctx().source() == EventContext.Source.ITEM, "source ITEM");

            vindicator.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(item("trigger_sword")));
            helper.assertTrue(vindicator.doHurtTarget(level, cow2), "the vindicator's hit did not land");
            List<Firing> byMob = r.of("hit", ctx -> ctx.entity() == vindicator);
            helper.assertValueEqual(byMob.size(), 1, "mob on_hit firings");
            helper.assertTrue(byMob.getFirst().ctx().player() == null, "a mob attacker is not a player");
            helper.assertTrue(byMob.getFirst().ctx().other() == cow2, "other is the cow hit by the mob");
        }
        helper.succeed();
    }

    // msm:on_use_on_block

    private static InteractionResult useOn(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
    }

    /** Fires once with the clicked block as base and block, not {@code msm:on_use} in the same click, and keeps its cooldown. */
    @GameTest(maxTicks = 40)
    public void onUseOnBlockFiresOnceAndRespectsCooldown(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        helper.setBlock(AT, Blocks.STONE);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("trigger_wand")));
        Recorder r = new Recorder(ctx -> ctx.player() == player);
        InteractionResult first = useOn(helper, player, AT);
        helper.assertTrue(first.consumesAction(), "the first click is not consumed: " + first);
        List<Firing> tapped = r.of("tapped", ctx -> true);
        helper.assertValueEqual(tapped.size(), 1, "on_use_on_block firings");
        helper.assertValueEqual(tapped.getFirst().ctx().base(), helper.absolutePos(AT), "base is the clicked block");
        helper.assertValueEqual(tapped.getFirst().ctx().block(), helper.absolutePos(AT), "block is the clicked block");
        helper.assertValueEqual(r.of("used", ctx -> true).size(), 0, "on_use fired in the same click");
        helper.assertTrue(player.getCooldowns().isOnCooldown(player.getMainHandItem()), "no cooldown after the click");
        useOn(helper, player, AT);
        helper.assertValueEqual(r.of("tapped", ctx -> true).size(), 1, "on_use_on_block fired during its cooldown");
        helper.runAfterDelay(12, () -> {
            for (int n = 0; n < 12; n++) { // a mock player's cooldowns only advance when ticked
                player.getCooldowns().tick();
            }
            useOn(helper, player, AT);
            helper.assertValueEqual(r.of("tapped", ctx -> true).size(), 2, "on_use_on_block after the cooldown");
            helper.assertValueEqual(r.of("used", ctx -> true).size(), 0, "on_use fired");
            r.close();
            helper.succeed();
        });
    }

    // msm:while_held and msm:while_worn

    /** Ticks the mock players once per test tick, as the network handler does for a real player. */
    private static void tickEachTick(GameTestHelper helper, ServerPlayer... players) {
        helper.onEachTick(() -> {
            for (ServerPlayer p : players) {
                p.doTick();
            }
        });
    }

    /**
     * The plan's open question (ADR 0061, V9): the main hand is reported by {@code Inventory.tick} only, never also by
     * {@code EntityEquipment.tick}, so {@code while_held} fires exactly once per interval there; not in the off hand
     * for {@code hand: main}, never in a backpack slot. A mob's main hand (equipment path only) also fires once.
     */
    @GameTest(maxTicks = 60)
    public void whileHeldMainHandFiresOncePerInterval(GameTestHelper helper) {
        ServerPlayer main = player(helper, GameType.SURVIVAL);
        ServerPlayer off = player(helper, GameType.SURVIVAL);
        ServerPlayer backpack = player(helper, GameType.SURVIVAL);
        Mob vindicator = helper.spawnWithNoFreeWill(EntityTypes.VINDICATOR, AT);
        main.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("held_main")));
        off.setItemInHand(InteractionHand.OFF_HAND, new ItemStack(item("held_main")));
        backpack.getInventory().setItem(9, new ItemStack(item("held_main")));
        helper.assertTrue(backpack.getInventory().getSelectedSlot() != 9, "slot 9 is selected");
        vindicator.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(item("held_main")));
        Recorder r = new Recorder(ctx -> ctx.player() == main || ctx.player() == off || ctx.player() == backpack
                || ctx.entity() == vindicator);
        tickEachTick(helper, main, off, backpack);
        helper.runAfterDelay(31, () -> {
            assertOncePerInterval(helper, r.of("held", ctx -> ctx.player() == main), 5, 5, "main hand");
            assertOncePerInterval(helper, r.of("held", ctx -> ctx.entity() == vindicator), 5, 5, "mob main hand");
            helper.assertValueEqual(r.of("held", ctx -> ctx.player() == off).size(), 0, "hand main fired in the off hand");
            helper.assertValueEqual(r.of("held", ctx -> ctx.player() == backpack).size(), 0, "fired in a backpack slot");
            r.close();
            helper.succeed();
        });
    }

    /** {@code hand: off} fires once per interval in the off hand only; {@code hand: either} in both hands, never in a backpack. */
    @GameTest(maxTicks = 60)
    public void whileHeldOffHandAndEither(GameTestHelper helper) {
        ServerPlayer off = player(helper, GameType.SURVIVAL);
        ServerPlayer offInMain = player(helper, GameType.SURVIVAL);
        ServerPlayer eitherMain = player(helper, GameType.SURVIVAL);
        ServerPlayer eitherOff = player(helper, GameType.SURVIVAL);
        ServerPlayer eitherBackpack = player(helper, GameType.SURVIVAL);
        off.setItemInHand(InteractionHand.OFF_HAND, new ItemStack(item("held_off")));
        offInMain.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("held_off")));
        eitherMain.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("held_either")));
        eitherOff.setItemInHand(InteractionHand.OFF_HAND, new ItemStack(item("held_either")));
        eitherBackpack.getInventory().setItem(20, new ItemStack(item("held_either")));
        List<ServerPlayer> all = List.of(off, offInMain, eitherMain, eitherOff, eitherBackpack);
        Recorder r = new Recorder(ctx -> ctx.player() != null && all.contains(ctx.player()));
        tickEachTick(helper, all.toArray(ServerPlayer[]::new));
        helper.runAfterDelay(31, () -> {
            assertOncePerInterval(helper, r.of("held", ctx -> ctx.player() == off), 5, 5, "off hand");
            assertOncePerInterval(helper, r.of("held", ctx -> ctx.player() == eitherMain), 5, 5, "either, main hand");
            assertOncePerInterval(helper, r.of("held", ctx -> ctx.player() == eitherOff), 5, 5, "either, off hand");
            helper.assertValueEqual(r.of("held", ctx -> ctx.player() == offInMain).size(), 0, "hand off fired in the main hand");
            helper.assertValueEqual(r.of("held", ctx -> ctx.player() == eitherBackpack).size(), 0, "fired in a backpack slot");
            r.close();
            helper.succeed();
        });
    }

    /** Fires once per interval in the head slot of a player and a mob; not in the hand, not in a backpack slot. */
    @GameTest(maxTicks = 60)
    public void whileWornOnlyInTheArmourSlot(GameTestHelper helper) {
        ServerPlayer worn = player(helper, GameType.SURVIVAL);
        ServerPlayer held = player(helper, GameType.SURVIVAL);
        ServerPlayer backpack = player(helper, GameType.SURVIVAL);
        Mob vindicator = helper.spawnWithNoFreeWill(EntityTypes.VINDICATOR, AT);
        worn.setItemSlot(EquipmentSlot.HEAD, new ItemStack(item("worn_cap")));
        held.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("worn_cap")));
        backpack.getInventory().setItem(12, new ItemStack(item("worn_cap")));
        vindicator.setItemSlot(EquipmentSlot.HEAD, new ItemStack(item("worn_cap")));
        Recorder r = new Recorder(ctx -> ctx.player() == worn || ctx.player() == held || ctx.player() == backpack
                || ctx.entity() == vindicator);
        tickEachTick(helper, worn, held, backpack);
        helper.runAfterDelay(31, () -> {
            assertOncePerInterval(helper, r.of("worn", ctx -> ctx.player() == worn), 5, 5, "player head slot");
            assertOncePerInterval(helper, r.of("worn", ctx -> ctx.entity() == vindicator), 5, 5, "mob head slot");
            helper.assertValueEqual(r.of("worn", ctx -> ctx.player() == held).size(), 0, "fired in the main hand");
            helper.assertValueEqual(r.of("worn", ctx -> ctx.player() == backpack).size(), 0, "fired in a backpack slot");
            r.close();
            helper.succeed();
        });
    }

    // msm:on_break and msm:on_place

    /** {@code playerWillDestroy} fires in survival and in creative; the player is self. */
    @GameTest
    public void onBreakFiresInSurvivalAndCreative(GameTestHelper helper) {
        ServerPlayer survival = player(helper, GameType.SURVIVAL);
        ServerPlayer creative = player(helper, GameType.CREATIVE);
        BlockPos other = AT.east(2);
        helper.setBlock(AT, block("trigger_block"));
        helper.setBlock(other, block("trigger_block"));
        try (Recorder r = new Recorder(ctx -> ctx.player() == survival || ctx.player() == creative)) {
            helper.assertTrue(survival.gameMode.destroyBlock(helper.absolutePos(AT)), "survival break failed");
            helper.assertTrue(creative.gameMode.destroyBlock(helper.absolutePos(other)), "creative break failed");
            List<Firing> s = r.of("broken", ctx -> ctx.player() == survival);
            List<Firing> c = r.of("broken", ctx -> ctx.player() == creative);
            helper.assertValueEqual(s.size(), 1, "survival on_break firings");
            helper.assertValueEqual(c.size(), 1, "creative on_break firings");
            helper.assertValueEqual(s.getFirst().ctx().base(), helper.absolutePos(AT), "base is the broken block");
        }
        helper.assertBlockNotPresent(block("trigger_block"), AT);
        helper.succeed();
    }

    /** A player placing the block item fires with the player as self; {@code setPlacedBy} without a placer fires with none. */
    @GameTest
    public void onPlaceByPlayerAndWithoutPlacer(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        helper.setBlock(AT.below(), Blocks.STONE);
        try (Recorder r = new Recorder(ctx -> ctx.player() == player
                || (ctx.player() == null && ctx.entity() == null && helper.absolutePos(AT.east(2)).equals(ctx.base())))) {
            helper.placeAt(player, new ItemStack(item("trigger_block")), AT.below(), Direction.UP);
            helper.assertBlockPresent(block("trigger_block"), AT);
            List<Firing> byPlayer = r.of("placed", ctx -> ctx.player() == player);
            helper.assertValueEqual(byPlayer.size(), 1, "on_place firings by the player");
            helper.assertTrue(byPlayer.getFirst().ctx().other() == player, "other is the placer");

            BlockPos abs = helper.absolutePos(AT.east(2));
            BlockState state = block("trigger_block").defaultBlockState();
            helper.getLevel().setBlockAndUpdate(abs, state);
            state.getBlock().setPlacedBy(helper.getLevel(), abs, state, null, ItemStack.EMPTY);
            List<Firing> byNone = r.of("placed", ctx -> ctx.player() == null);
            helper.assertValueEqual(byNone.size(), 1, "on_place firings without a placer");
            helper.assertTrue(byNone.getFirst().ctx().other() == null, "no other without a placer");
        }
        helper.succeed();
    }

    // msm:on_random_tick

    /** Random ticks only with the component; chance 1 fires on every random tick, chance 0 never. */
    @GameTest
    public void onRandomTickChanceOneAndZero(GameTestHelper helper) {
        helper.assertTrue(block("tick_block").defaultBlockState().isRandomlyTicking(), "tick_block does not tick randomly");
        helper.assertTrue(block("tick_never").defaultBlockState().isRandomlyTicking(), "tick_never does not tick randomly");
        helper.assertFalse(block("trigger_block").defaultBlockState().isRandomlyTicking(), "a block without the component ticks");
        BlockPos never = AT.east(2);
        helper.setBlock(AT, block("tick_block"));
        helper.setBlock(never, block("tick_never"));
        BlockPos at = helper.absolutePos(AT);
        BlockPos neverAt = helper.absolutePos(never);
        try (Recorder r = new Recorder(ctx -> at.equals(ctx.base()) || neverAt.equals(ctx.base()))) {
            for (int n = 0; n < 20; n++) {
                helper.randomTick(AT);
            }
            for (int n = 0; n < 50; n++) {
                helper.randomTick(never);
            }
            helper.assertValueEqual(r.of("ticked", ctx -> at.equals(ctx.base())).size(), 20, "chance 1 firings");
            helper.assertValueEqual(r.of("ticked", ctx -> neverAt.equals(ctx.base())).size(), 0, "chance 0 firings");
        }
        helper.succeed();
    }

    /** With {@code random_tick_speed} raised the level's own random ticks reach the block. */
    @GameTest(maxTicks = 100)
    public void onRandomTickWithRandomTickSpeedRaised(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        GameRules rules = level.getGameRules();
        int before = rules.get(GameRules.RANDOM_TICK_SPEED);
        player(helper, GameType.SURVIVAL); // a player nearby keeps the chunk ticking
        helper.setBlock(AT, block("tick_block"));
        BlockPos at = helper.absolutePos(AT);
        Recorder r = new Recorder(ctx -> at.equals(ctx.base()));
        rules.set(GameRules.RANDOM_TICK_SPEED, 1024, level.getServer());
        helper.succeedWhen(() -> {
            if (r.of("ticked", ctx -> true).isEmpty()) {
                helper.fail("no random tick yet");
            }
            rules.set(GameRules.RANDOM_TICK_SPEED, before, level.getServer());
            r.close();
        });
    }

    // msm:on_entity_inside

    /** A mob and an item entity inside a walk-through block each fire once per cooldown (5 ticks). */
    @GameTest(maxTicks = 60)
    public void onEntityInsideForMobAndItemWithCooldown(GameTestHelper helper) {
        helper.setBlock(AT.below(), Blocks.STONE);
        helper.setBlock(AT, block("inside_block"));
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT);
        ItemEntity drop = helper.spawnItem(Items.STICK, Vec3.atBottomCenterOf(AT).add(0, 0.05, 0));
        drop.setNeverPickUp();
        Recorder r = new Recorder(ctx -> ctx.entity() == cow || ctx.entity() == drop);
        helper.runAfterDelay(26, () -> {
            List<Firing> byCow = r.of("inside", ctx -> ctx.entity() == cow);
            List<Firing> byDrop = r.of("inside", ctx -> ctx.entity() == drop);
            assertOncePerInterval(helper, byCow, 5, 4, "cow");
            assertOncePerInterval(helper, byDrop, 5, 4, "item entity");
            helper.assertTrue(byCow.getFirst().ctx().other() == cow, "other is the mob inside");
            helper.assertTrue(byDrop.getFirst().ctx().other() == null, "an item entity is not living");
            r.close();
            helper.succeed();
        });
    }

    // msm:on_tick and msm:on_spawn (renderer auto: registered with or without GeckoLib, ADR 0072 D4)

    @SuppressWarnings("unchecked")
    private static EntityType<Mob> ticker(GameTestHelper helper) {
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(id("ticker")), "ticker not registered");
        return (EntityType<Mob>) BuiltInRegistries.ENTITY_TYPE.getValue(id("ticker"));
    }

    /** Fires once per interval (5) while the AI runs, never with {@code NoAI}. */
    @GameTest(maxTicks = 60)
    public void onTickAtTheIntervalAndNotWithNoAi(GameTestHelper helper) {
        EntityType<Mob> type = ticker(helper);
        if (type == null) {
            helper.succeed();
            return;
        }
        Mob live = helper.spawn(type, AT);
        Mob still = helper.spawn(type, AT.east(2));
        still.setNoAi(true);
        Recorder r = new Recorder(ctx -> ctx.entity() == live || ctx.entity() == still);
        helper.runAfterDelay(31, () -> {
            assertOncePerInterval(helper, r.of("pulse", ctx -> ctx.entity() == live), 5, 5, "on_tick");
            helper.assertValueEqual(r.of("pulse", ctx -> ctx.entity() == still).size(), 0, "on_tick with NoAI");
            r.close();
            helper.succeed();
        });
    }

    /** Fires once for a spawn egg spawn, and not for a copy loaded from the saved mob. */
    @GameTest(maxTicks = 40)
    public void onSpawnOnceAndNotAfterSaveAndLoad(GameTestHelper helper) {
        EntityType<Mob> type = ticker(helper);
        if (type == null) {
            helper.succeed();
            return;
        }
        ServerLevel level = helper.getLevel();
        Recorder r = new Recorder(ctx -> true);
        Mob spawned = type.spawn(level, helper.absolutePos(AT), EntitySpawnReason.SPAWN_ITEM_USE);
        helper.assertTrue(spawned != null, "no ticker spawned");
        helper.assertValueEqual(r.of("arrive", ctx -> ctx.entity() == spawned).size(), 1, "on_spawn firings for the egg spawn");
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        spawned.saveWithoutId(out);
        CompoundTag tag = out.buildResult();
        spawned.discard();
        Mob copy = type.create(level, EntitySpawnReason.LOAD);
        helper.assertTrue(copy != null, "no copy");
        copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
        level.addFreshEntity(copy);
        helper.runAfterDelay(5, () -> {
            helper.assertValueEqual(r.of("arrive", ctx -> ctx.entity() == copy).size(), 0, "on_spawn fired for the loaded copy");
            helper.assertValueEqual(r.of("arrive", ctx -> ctx.entity() == spawned).size(), 1, "on_spawn fired again");
            r.close();
            copy.discard();
            helper.succeed();
        });
    }

    /**
     * {@code run_function} in an entity's own events runs as the mob: {@code tag @s} in {@code msm:on_spawn}
     * ({@code tag_arrived}) and {@code msm:on_tick} ({@code tag_pulsed}) tags the ticker itself; a {@code NoAI} ticker
     * never gets the {@code on_tick} tag.
     */
    @GameTest(maxTicks = 40)
    public void entityEventFunctionsRunAsTheMob(GameTestHelper helper) {
        EntityType<Mob> type = ticker(helper);
        if (type == null) {
            helper.succeed();
            return;
        }
        Mob spawned = type.spawn(helper.getLevel(), helper.absolutePos(AT), EntitySpawnReason.SPAWN_ITEM_USE);
        helper.assertTrue(spawned != null, "no ticker spawned");
        helper.assertTrue(spawned.entityTags().contains("msm_arrived"), "on_spawn function did not run as the mob: "
                + spawned.entityTags());
        spawned.setPersistenceRequired(); // as GameTestHelper.spawn: a far player of another test would despawn it
        Mob still = helper.spawn(type, AT.east(2));
        still.setNoAi(true);
        Recorder r = new Recorder(ctx -> ctx.entity() == spawned);
        helper.runAfterDelay(12, () -> {
            int pulses = r.of("pulse", ctx -> true).size();
            r.close();
            helper.assertTrue(spawned.entityTags().contains("msm_pulsed"), "on_tick function did not run as the mob: "
                    + spawned.entityTags() + " after " + pulses + " pulse(s), removed " + spawned.getRemovalReason());
            helper.assertFalse(still.entityTags().contains("msm_pulsed"), "on_tick ran for the NoAI ticker");
            spawned.discard();
            helper.succeed();
        });
    }

    // Tick cost limit (ADR 0061 D4)

    /** A limiter stops at its cap within a server tick, resets on the next and logs once a minute at most. */
    @GameTest
    public void limiterStopsAtTheCapAndLogsOnce(GameTestHelper helper) {
        helper.assertValueEqual(TickLimiter.DEFAULT_CAP, 2000, "default cap");
        TickLimiter limiter = new TickLimiter(3);
        int allowed = 0;
        for (int n = 0; n < 10; n++) {
            allowed += limiter.tryFire(100) ? 1 : 0;
        }
        helper.assertValueEqual(allowed, 3, "firings allowed in one tick");
        helper.assertValueEqual(limiter.logLines(), 1, "log lines after the first skips");
        helper.assertTrue(limiter.tryFire(101), "the next tick starts a new count");
        for (int n = 0; n < 10; n++) {
            limiter.tryFire(101);
        }
        helper.assertValueEqual(limiter.logLines(), 1, "logged again within the minute");
        for (int n = 0; n < 5; n++) {
            limiter.tryFire(100 + TickLimiter.LOG_INTERVAL_TICKS);
        }
        helper.assertValueEqual(limiter.logLines(), 2, "log lines a minute later");
        helper.succeed();
    }
}
