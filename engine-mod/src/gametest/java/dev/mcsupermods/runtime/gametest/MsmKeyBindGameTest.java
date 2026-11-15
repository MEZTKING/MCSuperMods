package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.controls.HeldKeys;
import dev.mcsupermods.runtime.controls.KeyBinds;
import dev.mcsupermods.runtime.controls.KeyBinds.RuntimeKey;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.net.InputGuard;
import dev.mcsupermods.runtime.net.KeyPayload;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import io.netty.buffer.Unpooled;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for project key binds on the server (ADR 0088 D3, D4, D7; B411). Payloads are fed to
 * {@link KeyBinds#receive} for mock players, as the network receiver does on the server thread. Definitions in
 * {@code msm/msm_test/key_bind/}: {@code kb_basic} (press, release and hold every 4 ticks), {@code kb_cooldown} (10
 * ticks), {@code kb_on_foot}, {@code kb_in_vehicle}, {@code kb_driving_kart} ({@code driving}, {@code vehicle}
 * {@code msm_test:vh_kart}) and {@code kb_function} (runs {@code msm_test:key_pressed} and {@code key_released}). Each
 * test makes its own player, so the guard's buckets and the held sets never mix between tests.
 */
public class MsmKeyBindGameTest {
    private static final Vec3 MID = new Vec3(3.5, 1, 3.5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    /** A survival player in the level at {@code at} (relative). */
    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.snapTo(helper.absoluteVec(MID));
        player.setGameMode(GameType.SURVIVAL);
        return player;
    }

    private static void remove(GameTestHelper helper, ServerPlayer player) {
        player.stopRiding();
        helper.getLevel().getServer().getPlayerList().remove(player);
    }

    private static void press(ServerPlayer player, String path) {
        KeyBinds.receive(player, new KeyPayload(id(path), true));
    }

    private static void release(ServerPlayer player, String path) {
        KeyBinds.receive(player, new KeyPayload(id(path), false));
    }

    private static void floor(GameTestHelper helper) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                helper.setBlock(x, 0, z, Blocks.STONE);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static MsmVehicle vehicle(GameTestHelper helper, String path) {
        return helper.spawn((EntityType<MsmVehicle>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path)), MID);
    }

    /** The events one player fired on key binds, as {@code <key bind path> <event path>}. */
    private static final class Recorder implements EventListener, AutoCloseable {
        final ServerPlayer player;
        final List<String> events = new ArrayList<>();
        final List<EventContext> contexts = new ArrayList<>();

        Recorder(ServerPlayer player) {
            this.player = player;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (ctx.player() == player && KeyBinds.definition(owner).isPresent()) {
                events.add(owner.getPath() + " " + event.getPath());
                contexts.add(ctx);
            }
        }

        @Override
        public void onAction(Identifier owner, Identifier event, Action action, EventContext ctx) {}

        int count(String entry) {
            return (int) events.stream().filter(entry::equals).count();
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    @GameTest
    public void theKeyBindsAreRegistered(GameTestHelper helper) {
        for (String path : List.of("kb_basic", "kb_cooldown", "kb_on_foot", "kb_in_vehicle", "kb_driving_kart", "kb_function")) {
            helper.assertTrue(KeyBinds.definition(id(path)).isPresent(), path + " is not registered");
            helper.assertTrue(MsmRuntime.report().keyBinds().contains(id(path)), path + " is not in the load report");
        }
        helper.assertValueEqual(KeyBinds.definition(id("kb_basic")).orElseThrow().holdIntervalTicks(), 4, "hold interval");
        helper.assertTrue(KeyBinds.runtimeKeysActive(), "the test vehicles turn the runtime keys on");
        for (RuntimeKey key : RuntimeKey.values()) {
            helper.assertTrue(KeyBinds.known(key.id()), key.id() + " is not accepted");
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void pressHoldAndReleaseFireTheirEvents(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Recorder recorder = new Recorder(player);
        press(player, "kb_basic");
        helper.assertValueEqual(recorder.count("kb_basic pressed"), 1, "on_press");
        helper.assertTrue(HeldKeys.isHeld(player, id("kb_basic")), "held after the press");
        press(player, "kb_basic");
        helper.assertValueEqual(recorder.count("kb_basic pressed"), 1, "a second press while held does nothing");
        EventContext ctx = recorder.contexts.getFirst();
        helper.assertTrue(ctx.other() == player && ctx.source() == EventContext.Source.ITEM, "the player is self and other");
        helper.runAfterDelay(10, () -> {
            // Every 4 ticks from one interval after the press: at +4 and +8, perhaps +12 by the time this runs.
            int held = recorder.count("kb_basic held");
            helper.assertTrue(held >= 2 && held <= 3, "while_held fired " + held + " times in 10 ticks");
            release(player, "kb_basic");
            helper.assertValueEqual(recorder.count("kb_basic released"), 1, "on_release");
            helper.assertFalse(HeldKeys.isHeld(player, id("kb_basic")), "held after the release");
            release(player, "kb_basic");
            helper.assertValueEqual(recorder.count("kb_basic released"), 1, "a release of a key not held is ignored");
            int after = recorder.count("kb_basic held");
            helper.runAfterDelay(9, () -> {
                helper.assertValueEqual(recorder.count("kb_basic held"), after, "while_held after the release");
                recorder.close();
                remove(helper, player);
                helper.succeed();
            });
        });
    }

    @GameTest(maxTicks = 40)
    public void theCooldownSkipsEarlyPresses(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Recorder recorder = new Recorder(player);
        press(player, "kb_cooldown");
        release(player, "kb_cooldown");
        press(player, "kb_cooldown");
        release(player, "kb_cooldown");
        helper.assertValueEqual(recorder.count("kb_cooldown pressed"), 1, "a press inside the cooldown fired");
        helper.assertFalse(HeldKeys.isHeld(player, id("kb_cooldown")), "a press inside the cooldown holds the key");
        helper.runAfterDelay(5, () -> {
            press(player, "kb_cooldown");
            release(player, "kb_cooldown");
            helper.assertValueEqual(recorder.count("kb_cooldown pressed"), 1, "fired 5 ticks after (cooldown 10)");
        });
        helper.runAfterDelay(11, () -> {
            press(player, "kb_cooldown");
            helper.assertValueEqual(recorder.count("kb_cooldown pressed"), 2, "fired again after the cooldown");
            recorder.close();
            remove(helper, player);
            helper.succeed();
        });
    }

    @GameTest
    public void whenOnFootAndInVehicle(GameTestHelper helper) {
        floor(helper);
        ServerPlayer player = player(helper);
        Recorder recorder = new Recorder(player);
        press(player, "kb_on_foot");
        release(player, "kb_on_foot");
        press(player, "kb_in_vehicle");
        release(player, "kb_in_vehicle");
        helper.assertValueEqual(recorder.count("kb_on_foot pressed"), 1, "on_foot on foot");
        helper.assertValueEqual(recorder.count("kb_in_vehicle pressed"), 0, "in_vehicle on foot");
        MsmVehicle raft = vehicle(helper, "vh_raft");
        helper.assertTrue(player.startRiding(raft), "not seated");
        press(player, "kb_on_foot");
        release(player, "kb_on_foot");
        press(player, "kb_in_vehicle");
        release(player, "kb_in_vehicle");
        helper.assertValueEqual(recorder.count("kb_on_foot pressed"), 1, "on_foot in a vehicle");
        helper.assertValueEqual(recorder.count("kb_in_vehicle pressed"), 1, "in_vehicle in a vehicle");
        recorder.close();
        remove(helper, player);
        raft.discard();
        helper.succeed();
    }

    @GameTest
    public void drivingNeedsTheDriversSeatOfTheNamedVehicle(GameTestHelper helper) {
        floor(helper);
        ServerPlayer driver = player(helper);
        ServerPlayer passenger = player(helper);
        Recorder drivers = new Recorder(driver);
        Recorder passengers = new Recorder(passenger);
        MsmVehicle kart = vehicle(helper, "vh_kart");
        helper.assertTrue(driver.startRiding(kart) && passenger.startRiding(kart), "not seated");
        helper.assertTrue(kart.driver() == driver, "the first rider drives");
        press(driver, "kb_driving_kart");
        press(passenger, "kb_driving_kart");
        helper.assertValueEqual(drivers.count("kb_driving_kart pressed"), 1, "the driver of the kart");
        helper.assertValueEqual(passengers.count("kb_driving_kart pressed"), 0, "a passenger of the kart");
        release(driver, "kb_driving_kart");
        driver.stopRiding();
        MsmVehicle raft = vehicle(helper, "vh_raft");
        helper.assertTrue(driver.startRiding(raft) && raft.driver() == driver, "not driving the raft");
        press(driver, "kb_driving_kart");
        helper.assertValueEqual(drivers.count("kb_driving_kart pressed"), 1, "driving another vehicle type");
        drivers.close();
        passengers.close();
        remove(helper, driver);
        remove(helper, passenger);
        kart.discard();
        raft.discard();
        helper.succeed();
    }

    @GameTest
    public void runFunctionRunsAsThePlayer(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        press(player, "kb_function");
        helper.assertTrue(player.entityTags().contains("msm_key_pressed"), "the press function did not run as the player");
        helper.assertFalse(player.entityTags().contains("msm_key_released"), "the release function ran on the press");
        release(player, "kb_function");
        helper.assertTrue(player.entityTags().contains("msm_key_released"), "the release function did not run as the player");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest
    public void unknownKeysAndBadStatesAreDroppedAndCounted(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Recorder recorder = new Recorder(player);
        InputGuard guard = KeyBinds.guard();
        long unknown = guard.dropped(InputGuard.Reason.UNKNOWN_KEY);
        long sleeping = guard.dropped(InputGuard.Reason.SLEEPING);
        KeyBinds.receive(player, new KeyPayload(id("no_such_key"), true));
        KeyBinds.receive(player, new KeyPayload(Identifier.fromNamespaceAndPath("msm_runtime", "not_a_runtime_key"), true));
        helper.assertValueEqual(guard.dropped(InputGuard.Reason.UNKNOWN_KEY) - unknown, 2L, "unknown ids dropped");
        helper.assertTrue(HeldKeys.held(player).isEmpty(), "an unknown id is held");
        // The mock player's game mode is fixed, so the spectator rule is not reachable here; sleeping goes the same way.
        player.setSleepingPos(player.blockPosition());
        helper.assertTrue(player.isSleeping(), "not asleep");
        press(player, "kb_basic");
        helper.assertValueEqual(guard.dropped(InputGuard.Reason.SLEEPING) - sleeping, 1L, "a sleeping player's press dropped");
        player.clearSleepingPos();
        helper.assertValueEqual(recorder.events.size(), 0, "events fired: " + recorder.events);
        recorder.close();
        remove(helper, player);
        helper.succeed();
    }

    @GameTest
    public void theRateLimitDropsAboveTheBurst(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        long before = KeyBinds.guard().dropped(InputGuard.Reason.RATE_LIMIT);
        // 60 packets in one tick: the burst of 40 passes, 20 are dropped.
        for (int i = 0; i < 30; i++) {
            press(player, "kb_on_foot");
            release(player, "kb_on_foot");
        }
        helper.assertValueEqual(KeyBinds.guard().dropped(InputGuard.Reason.RATE_LIMIT) - before, 20L, "packets over the burst");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest
    public void malformedPayloadsFailInTheDecoder(GameTestHelper helper) {
        var tooLong = Unpooled.buffer();
        ByteBufCodecs.stringUtf8(1024).encode(tooLong, "msm_test:" + "x".repeat(KeyPayload.MAX_ID_LENGTH));
        tooLong.writeBoolean(true);
        boolean failed = false;
        try {
            KeyPayload.CODEC.decode(tooLong);
        } catch (RuntimeException expected) {
            failed = true;
        }
        helper.assertTrue(failed, "an id over 256 characters decoded");
        var shortBody = Unpooled.buffer();
        ByteBufCodecs.stringUtf8(256).encode(shortBody, "msm_test:kb_basic");
        failed = false;
        try {
            KeyPayload.CODEC.decode(shortBody);
        } catch (RuntimeException expected) {
            failed = true;
        }
        helper.assertTrue(failed, "a payload without its boolean decoded");
        helper.succeed();
    }

    @GameTest
    public void deathClearsHeldKeysWithoutReleaseEvents(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Recorder recorder = new Recorder(player);
        press(player, "kb_basic");
        helper.assertTrue(HeldKeys.isHeld(player, id("kb_basic")), "not held");
        // The mock player does not die from damage; the death is made by hand: no health, then Fabric's death event, as
        // vanilla's death does.
        player.setHealth(0);
        ServerLivingEntityEvents.AFTER_DEATH.invoker().afterDeath(player, helper.getLevel().damageSources().genericKill());
        helper.assertTrue(player.isDeadOrDying(), "the player is not dying");
        helper.assertFalse(HeldKeys.isHeld(player, id("kb_basic")), "held after death");
        helper.assertValueEqual(recorder.count("kb_basic released"), 0, "a release event on death");
        long dead = KeyBinds.guard().dropped(InputGuard.Reason.DEAD);
        press(player, "kb_basic");
        helper.assertValueEqual(KeyBinds.guard().dropped(InputGuard.Reason.DEAD) - dead, 1L, "a dead player's press");
        int held = recorder.count("kb_basic held");
        helper.runAfterDelay(9, () -> {
            helper.assertValueEqual(recorder.count("kb_basic held"), held, "while_held after death");
            recorder.close();
            remove(helper, player);
            helper.succeed();
        });
    }

    @GameTest
    public void respawnClearsHeldKeys(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        press(player, "kb_basic");
        ServerPlayer respawned = helper.getLevel().getServer().getPlayerList().respawn(player, false, Entity.RemovalReason.KILLED);
        helper.assertFalse(HeldKeys.isHeld(respawned, id("kb_basic")), "held after a respawn");
        remove(helper, respawned);
        helper.succeed();
    }

    @GameTest
    public void leavingClearsHeldKeys(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Recorder recorder = new Recorder(player);
        press(player, "kb_basic");
        helper.getLevel().getServer().getPlayerList().remove(player);
        helper.assertFalse(HeldKeys.isHeld(player, id("kb_basic")), "held after leaving");
        helper.assertValueEqual(recorder.count("kb_basic released"), 0, "a release event on leaving");
        recorder.close();
        helper.succeed();
    }

    @GameTest
    public void aDimensionChangeClearsHeldKeys(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Recorder recorder = new Recorder(player);
        ServerLevel nether = helper.getLevel().getServer().getLevel(Level.NETHER);
        helper.assertTrue(nether != null, "no nether");
        press(player, "kb_basic");
        player.teleport(new TeleportTransition(nether, new Vec3(0.5, 100, 0.5), Vec3.ZERO, 0f, 0f, TeleportTransition.DO_NOTHING));
        helper.assertFalse(HeldKeys.isHeld(player, id("kb_basic")), "held after a dimension change");
        helper.assertValueEqual(recorder.count("kb_basic released"), 0, "a release event on a dimension change");
        recorder.close();
        helper.getLevel().getServer().getPlayerList().remove(player);
        helper.succeed();
    }

    @GameTest
    public void runtimeKeysAreHeldAndReported(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        List<String> seen = new ArrayList<>();
        KeyBinds.KeyListener listener = new KeyBinds.KeyListener() {
            @Override
            public void pressed(ServerPlayer p, Identifier key) {
                if (p == player) {
                    seen.add("pressed " + key);
                }
            }

            @Override
            public void released(ServerPlayer p, Identifier key) {
                if (p == player) {
                    seen.add("released " + key);
                }
            }
        };
        KeyBinds.addListener(listener);
        KeyBinds.receive(player, new KeyPayload(RuntimeKey.FIRE.id(), true));
        helper.assertTrue(HeldKeys.isHeld(player, RuntimeKey.FIRE.id()), "fire is not held");
        long now = helper.getLevel().getServer().getTickCount();
        helper.assertValueEqual(HeldKeys.heldTicks(player, RuntimeKey.FIRE.id(), now), 0L, "held ticks at the press");
        KeyBinds.receive(player, new KeyPayload(RuntimeKey.FIRE.id(), false));
        helper.assertFalse(HeldKeys.isHeld(player, RuntimeKey.FIRE.id()), "fire is held after the release");
        KeyBinds.removeListener(listener);
        helper.assertValueEqual(seen, List.of("pressed msm_runtime:vehicle_fire", "released msm_runtime:vehicle_fire"), "listener");
        remove(helper, player);
        helper.succeed();
    }
}
