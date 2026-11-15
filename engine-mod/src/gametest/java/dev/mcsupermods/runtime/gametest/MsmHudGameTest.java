package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonParser;
import com.mojang.serialization.JsonOps;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.events.Events;
import dev.mcsupermods.runtime.hud.HudServer;
import dev.mcsupermods.runtime.hud.HudState;
import dev.mcsupermods.runtime.hud.HudSync;
import dev.mcsupermods.runtime.net.HudPayload;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.scripting.ScriptData;
import dev.mcsupermods.runtime.scripting.ScriptDataAttachment;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.ScoreHolder;

/**
 * GameTests for HUD elements on the server (ADR 0089 D1 to D6, B416): registration and the index list, the values of
 * every server source ({@code set}, {@code data} of the player and the world, {@code score} of the player and a fixed
 * holder, {@code vehicle} fuel, health, ammunition, reload and speed, a {@code max} from a score), change detection, the
 * five-tick update, the three actions with and without a player, the resend on a dimension change, forgetting on leave,
 * and the hash check a client makes ({@link HudState}). Payloads are watched with a {@link HudSync.Observer}, which sees
 * every payload built, also for the mock players that cannot receive one. Definitions in {@code msm/msm_test/hud/}.
 */
public class MsmHudGameTest {
    private static final Vec3 MID = new Vec3(3.5, 1, 3.5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static int index(String path) {
        return HudServer.index(id(path)).orElseThrow(() -> new AssertionError(path + " is not a HUD element"));
    }

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

    /** As {@code assertValueEqual}, also for null (which that method cannot take: it would stop the server). */
    private static void eq(GameTestHelper helper, Object actual, Object expected, String message) {
        helper.assertTrue(java.util.Objects.equals(actual, expected), message + ": expected " + expected + ", got " + actual);
    }

    private static Object sent(ServerPlayer player, String path) {
        return HudServer.sentValue(player, id(path));
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

    /** The payloads built for one player, with the server tick of each. */
    private static final class Watcher implements HudSync.Observer, AutoCloseable {
        final ServerPlayer player;
        final List<HudPayload> payloads = new CopyOnWriteArrayList<>();
        final List<Long> ticks = new CopyOnWriteArrayList<>();

        Watcher(ServerPlayer player) {
            this.player = player;
            HudSync.addObserver(this);
        }

        @Override
        public void built(ServerPlayer p, HudPayload payload, long serverTick) {
            if (p == player) {
                payloads.add(payload);
                ticks.add(serverTick);
            }
        }

        /** Every entry for slot {@code slot}, in the order sent. */
        List<HudPayload.Value> entries(int slot) {
            List<HudPayload.Value> out = new ArrayList<>();
            for (HudPayload p : payloads) {
                for (HudPayload.Value v : p.values()) {
                    if (v.index() == slot) {
                        out.add(v);
                    }
                }
            }
            return out;
        }

        /** The server ticks of the payloads that carried slot {@code slot}. */
        List<Long> ticksOf(int slot) {
            List<Long> out = new ArrayList<>();
            for (int i = 0; i < payloads.size(); i++) {
                for (HudPayload.Value v : payloads.get(i).values()) {
                    if (v.index() == slot) {
                        out.add(ticks.get(i));
                        break;
                    }
                }
            }
            return out;
        }

        @Override
        public void close() {
            HudSync.removeObserver(this);
        }
    }

    @GameTest
    public void theHudElementsAreRegisteredInIdOrder(GameTestHelper helper) {
        List<Identifier> ids = HudServer.ids();
        for (String path : List.of("hud_set_text", "hud_set_bar", "hud_hidden", "hud_data_player", "hud_data_world", "hud_score",
                "hud_score_fixed", "hud_veh_fuel", "hud_veh_health", "hud_veh_ammo", "hud_veh_reload", "hud_veh_speed",
                "hud_player_health", "hud_client_bar", "hud_client_sprite", "hud_client_text")) {
            helper.assertTrue(ids.contains(id(path)), path + " is not registered");
            helper.assertTrue(MsmRuntime.report().hudElements().contains(id(path)), path + " is not in the load report");
        }
        List<String> strings = ids.stream().map(Identifier::toString).toList();
        List<String> sorted = new ArrayList<>(strings);
        sorted.sort(null);
        eq(helper, strings, sorted, "the index list is sorted by id");
        eq(helper, HudServer.hash(), HudServer.hashOf(ids), "hash");
        eq(helper, HudServer.ordered().size(), ids.size(), "definitions in index order");
        helper.succeed();
    }

    @GameTest(maxTicks = 100)
    public void setValuesAreSentAtTheEndOfTheTickAndOnlyWhenTheyChange(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Watcher watcher = new Watcher(player);
        helper.assertTrue(HudServer.set(player, id("hud_set_text"), "Ready"), "set text");
        helper.assertTrue(HudServer.set(player, id("hud_set_bar"), 7.5), "set number");
        helper.assertFalse(HudServer.set(player, id("not_a_hud"), 1), "an unknown id is refused");
        helper.runAfterDelay(1, () -> {
            eq(helper, watcher.entries(index("hud_set_text")).size(), 1, "text entries");
            eq(helper, watcher.entries(index("hud_set_text")).getFirst().text(), Optional.of("Ready"), "text");
            eq(helper, watcher.entries(index("hud_set_bar")).getFirst().number(), Optional.of(7.5), "number");
            eq(helper, watcher.payloads.getFirst().hash(), HudServer.hash(), "the payload carries the hash");
            HudServer.set(player, id("hud_set_text"), "Ready");
            helper.runAfterDelay(6, () -> {
                eq(helper, watcher.entries(index("hud_set_text")).size(), 1, "the same value was sent again");
                HudServer.set(player, id("hud_set_text"), "Go");
                helper.runAfterDelay(1, () -> {
                    eq(helper, watcher.entries(index("hud_set_text")).size(), 2, "a changed value was not sent");
                    eq(helper, sent(player, "hud_set_text"), "Go", "sent value");
                    watcher.close();
                    remove(helper, player);
                    helper.succeed();
                });
            });
        });
    }

    @GameTest
    public void showAndHide(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Watcher watcher = new Watcher(player);
        HudServer.show(player, id("hud_hidden"));
        helper.runAfterDelay(1, () -> {
            List<HudPayload.Value> entries = watcher.entries(index("hud_hidden"));
            eq(helper, entries.size(), 1, "show entries");
            eq(helper, entries.getFirst().visible(), Optional.of(true), "shown");
            helper.assertTrue(entries.getFirst().number().isEmpty() && entries.getFirst().text().isEmpty(), "show carries no value");
            HudServer.hide(player, id("hud_hidden"));
            helper.runAfterDelay(1, () -> {
                eq(helper, watcher.entries(index("hud_hidden")).getLast().visible(), Optional.of(false), "hidden");
                eq(helper, HudSync.visible(player, index("hud_hidden")), false, "state");
                watcher.close();
                remove(helper, player);
                helper.succeed();
            });
        });
    }

    @GameTest
    public void theActionsRunForTheEventsPlayer(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Events events = Events.CODEC.parse(JsonOps.INSTANCE, JsonParser.parseString("""
                {"msm_test:go": {"actions": [
                  {"type": "show_hud", "hud": "msm_test:hud_hidden"},
                  {"type": "set_hud", "hud": "msm_test:hud_hidden", "value": "Shown"},
                  {"type": "set_hud", "hud": "msm_test:hud_set_bar", "value": 4},
                  {"type": "hide_hud", "hud": "msm_test:hud_set_text"},
                  {"type": "set_hud", "hud": "msm_test:not_a_hud", "value": 1}]}}""")).getOrThrow();
        eq(helper, events.errors(), List.of(), "events decode");
        Identifier owner = id("hud_action_test");
        ServerLevel level = helper.getLevel();
        EventRunner.fire(owner, events, id("go"), EventContext.forItem(level, player));
        // Without a player the actions do nothing (and log once).
        EventRunner.fire(owner, events, id("go"), EventContext.forBlock(level, helper.absolutePos(new BlockPos(1, 1, 1)), null));
        helper.runAfterDelay(1, () -> {
            eq(helper, sent(player, "hud_hidden"), "Shown", "set_hud text");
            eq(helper, sent(player, "hud_set_bar"), 4.0, "set_hud number");
            eq(helper, HudSync.visible(player, index("hud_hidden")), true, "show_hud");
            eq(helper, HudSync.visible(player, index("hud_set_text")), false, "hide_hud");
            remove(helper, player);
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 100)
    public void dataValuesOfThePlayerAndTheWorldAndAMaxFromAScore(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        MinecraftServer server = helper.getLevel().getServer();
        ScriptDataAttachment.set(player, ScriptData.of(Map.of("msm_test", "{\"mana\": 5}")));
        ScriptDataAttachment.set(ScriptDataAttachment.world(server), ScriptData.of(Map.of("msm_test", "{\"siege\": 3}")));
        Objective max = objective(server, "msm_hud_max");
        server.getScoreboard().getOrCreatePlayerScore(ScoreHolder.forNameOnly("#cap"), max).set(12);
        int count = HudServer.ids().size();
        helper.succeedWhen(() -> {
            eq(helper, sent(player, "hud_data_player"), 5.0, "player data");
            eq(helper, sent(player, "hud_data_world"), 3.0, "world data");
            eq(helper, HudSync.sent(player, count + index("hud_data_world")), 12.0, "max from a score");
            remove(helper, player);
        });
    }

    @GameTest(maxTicks = 100)
    public void scoresOfThePlayerAndOfAFixedHolder(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        MinecraftServer server = helper.getLevel().getServer();
        Objective score = objective(server, "msm_hud_score");
        server.getScoreboard().getOrCreatePlayerScore(ScoreHolder.forNameOnly(player.getScoreboardName()), score).set(7);
        server.getScoreboard().getOrCreatePlayerScore(ScoreHolder.forNameOnly("#global"), score).set(42);
        helper.succeedWhen(() -> {
            eq(helper, sent(player, "hud_score"), 7.0, "the player's score");
            eq(helper, sent(player, "hud_score_fixed"), 42.0, "a fixed holder's score");
            remove(helper, player);
        });
    }

    @GameTest(maxTicks = 100)
    public void computedValuesGoOutEveryFiveTicksAndOnlyWhenChanged(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Watcher watcher = new Watcher(player);
        int slot = index("hud_data_player");
        ScriptDataAttachment.set(player, ScriptData.of(Map.of("msm_test", "{\"mana\": 1}")));
        helper.runAfterDelay(6, () -> {
            eq(helper, watcher.entries(slot).size(), 1, "first value");
            ScriptDataAttachment.set(player, ScriptData.of(Map.of("msm_test", "{\"mana\": \"full\"}")));
            helper.runAfterDelay(16, () -> {
                List<HudPayload.Value> entries = watcher.entries(slot);
                eq(helper, entries.size(), 2, "entries after one change and three quiet updates");
                eq(helper, entries.getLast().text(), Optional.of("full"), "a text value");
                for (long tick : watcher.ticksOf(slot)) {
                    eq(helper, tick % HudSync.UPDATE_TICKS, 0L, "a computed value outside the five-tick update");
                }
                ScriptDataAttachment.set(player, ScriptData.EMPTY);
                helper.runAfterDelay(6, () -> {
                    HudPayload.Value clear = watcher.entries(slot).getLast();
                    helper.assertTrue(clear.number().isEmpty() && clear.text().isEmpty() && clear.visible().isEmpty(),
                            "a removed value is not cleared: " + clear);
                    eq(helper, sent(player, "hud_data_player"), null, "sent after removal");
                    watcher.close();
                    remove(helper, player);
                    helper.succeed();
                });
            });
        });
    }

    @GameTest(maxTicks = 100)
    public void vehicleStatsOfTheVehicleTheViewerRides(GameTestHelper helper) {
        floor(helper);
        ServerPlayer player = player(helper);
        MsmVehicle kart = vehicle(helper, "vh_kart");
        kart.fuel().setFuel(100);
        kart.setDamage(3);
        helper.assertTrue(player.startRiding(kart), "not seated in the kart");
        helper.runAfterDelay(6, () -> {
            eq(helper, sent(player, "hud_veh_fuel"), 100.0, "fuel");
            eq(helper, sent(player, "hud_veh_health"), 7.0, "health");
            eq(helper, sent(player, "hud_veh_ammo"), null, "ammo of a vehicle without weapons");
            helper.assertTrue(sent(player, "hud_veh_speed") instanceof Double, "speed: " + sent(player, "hud_veh_speed"));
            kart.setPos(kart.position().add(2, 0, 0));
            helper.runAfterDelay(5, () -> {
                helper.assertTrue(sent(player, "hud_veh_speed") instanceof Double d && d > 0, "speed after moving: "
                        + sent(player, "hud_veh_speed"));
                player.stopRiding();
                MsmVehicle tank = vehicle(helper, "vh_tank");
                tank.setAmmo(0, 4);
                tank.setReadyAt(0, helper.getLevel().getGameTime() + 100);
                helper.assertTrue(player.startRiding(tank), "not seated in the tank");
                helper.runAfterDelay(6, () -> {
                    eq(helper, sent(player, "hud_veh_fuel"), 0.0, "fuel of a vehicle without fuel");
                    eq(helper, sent(player, "hud_veh_ammo"), 4.0, "ammo");
                    helper.assertTrue(sent(player, "hud_veh_reload") instanceof Double d && d > 80 && d <= 100, "reload: "
                            + sent(player, "hud_veh_reload"));
                    player.stopRiding();
                    helper.runAfterDelay(6, () -> {
                        eq(helper, sent(player, "hud_veh_ammo"), null, "ammo on foot");
                        eq(helper, sent(player, "hud_veh_health"), null, "health on foot");
                        remove(helper, player);
                        helper.succeed();
                    });
                });
            });
        });
    }

    @GameTest
    public void aDimensionChangeResendsEverythingAndLeavingForgets(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Watcher watcher = new Watcher(player);
        HudServer.set(player, id("hud_set_text"), "Here");
        HudServer.show(player, id("hud_hidden"));
        helper.runAfterDelay(1, () -> {
            int before = watcher.entries(index("hud_set_text")).size();
            ServerLevel nether = helper.getLevel().getServer().getLevel(Level.NETHER);
            helper.assertTrue(nether != null, "no nether");
            player.teleport(new TeleportTransition(nether, new Vec3(0.5, 100, 0.5), Vec3.ZERO, 0f, 0f, TeleportTransition.DO_NOTHING));
            helper.runAfterDelay(1, () -> {
                List<HudPayload.Value> text = watcher.entries(index("hud_set_text"));
                eq(helper, text.size(), before + 1, "the value was not resent");
                eq(helper, text.getLast().text(), Optional.of("Here"), "resent value");
                eq(helper, watcher.entries(index("hud_hidden")).getLast().visible(), Optional.of(true), "resent visibility");
                helper.assertTrue(watcher.entries(index("hud_set_bar")).size() == 1, "an unset value is resent as a clear");
                watcher.close();
                helper.getLevel().getServer().getPlayerList().remove(player);
                eq(helper, sent(player, "hud_set_text"), null, "kept after leaving");
                helper.succeed();
            });
        });
    }

    @GameTest
    public void aClientIgnoresPayloadsOfAnotherHudList(GameTestHelper helper) {
        int count = HudServer.ids().size();
        int slot = index("hud_set_text");
        HudState state = new HudState(count, HudServer.hash());
        HudPayload.Value text = new HudPayload.Value(slot, Optional.empty(), Optional.of("Hi"), Optional.empty());
        helper.assertFalse(state.apply(new HudPayload(HudServer.hash() + 1, List.of(text))), "a payload of another list was applied");
        helper.assertFalse(state.apply(new HudPayload(HudServer.hash() + 1, List.of(text))), "the second one too");
        eq(helper, state.ignored(), 2, "ignored");
        eq(helper, state.value(slot), null, "value after a wrong hash");
        helper.assertTrue(state.apply(new HudPayload(HudServer.hash(), List.of(text,
                new HudPayload.Value(count + 1, Optional.of(3.0), Optional.empty(), Optional.empty()),
                new HudPayload.Value(count * 2 + 5, Optional.of(1.0), Optional.empty(), Optional.empty())))), "the right hash");
        eq(helper, state.value(slot), "Hi", "value");
        eq(helper, state.value(count + 1), 3.0, "a max slot");
        state.apply(new HudPayload(HudServer.hash(), List.of(new HudPayload.Value(slot, Optional.empty(), Optional.empty(), Optional.of(false)))));
        eq(helper, state.value(slot), "Hi", "a visibility entry keeps the value");
        eq(helper, state.visible(slot), false, "visibility");
        state.apply(new HudPayload(HudServer.hash(), List.of(new HudPayload.Value(slot, Optional.empty(), Optional.empty(), Optional.empty()))));
        eq(helper, state.value(slot), null, "an empty entry clears");
        helper.succeed();
    }

    private static Objective objective(MinecraftServer server, String name) {
        Objective existing = server.getScoreboard().getObjective(name);
        if (existing != null) {
            return existing;
        }
        server.getCommands().performPrefixedCommand(server.createCommandSourceStack().withSuppressedOutput(),
                "scoreboard objectives add " + name + " dummy");
        Objective made = server.getScoreboard().getObjective(name);
        if (made == null) {
            throw new AssertionError("could not make objective " + name);
        }
        return made;
    }
}
