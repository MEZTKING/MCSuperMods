package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.client.controls.ControlsClient;
import dev.mcsupermods.runtime.client.controls.ProjectKeyMappings;
import dev.mcsupermods.runtime.client.controls.RuntimeKeys;
import dev.mcsupermods.runtime.controls.HeldKeys;
import dev.mcsupermods.runtime.controls.KeyBinds.RuntimeKey;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;

/**
 * Client GameTest for project key binds and HUD elements against a dedicated server (ADR 0091 D7). The key half (B411,
 * ADR 0088 D3 to D5) checks the mappings on the title screen (names, categories, translations, vanilla's list of
 * mappings), then connects to a dedicated server made by {@code createServer()} and:
 *
 * <ul>
 *   <li>holds {@code msm_test:kb_function} for a few ticks: its press and release functions run as the player on the
 *       server (tags {@code msm_key_pressed} and {@code msm_key_released});</li>
 *   <li>taps {@code msm_test:kb_basic} for one tick ({@code pressKey}): the server sees a press and a release;</li>
 *   <li>holds the runtime key "Vehicle: fire": the server holds {@code msm_runtime:vehicle_fire} until it is let go;</li>
 *   <li>holds {@code kb_basic} and opens the chat screen: the client sends the release at once.</li>
 * </ul>
 *
 * <p>The HUD half is B416's.
 */
public class MsmControlsClientGameTest implements FabricClientGameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static ServerPlayer player(MinecraftServer server) {
        return server.getPlayerList().getPlayers().getFirst();
    }

    @Override
    public void runTest(ClientGameTestContext context) {
        mappings(context);
        try (TestDedicatedServerContext server = context.worldBuilder().createServer()) {
            try (TestDedicatedServerConnection connection = server.connect()) {
                server.runCommand("gamemode survival @a");
                server.runCommand("time set noon");
                connection.waitForChunksRender();
                context.waitTicks(5);
                Recorder recorder = new Recorder();
                EventRunner.addListener(recorder);
                try {
                    holdRunsTheFunctions(context, server);
                    aTapSendsPressAndRelease(context, server, recorder);
                    runtimeKeyIsHeldOnTheServer(context, server);
                    aScreenReleasesHeldKeys(context, server);
                } finally {
                    EventRunner.removeListener(recorder);
                }
            }
        }
    }

    /** The mappings exist before any world: names, categories, translations and vanilla's list (Controls). */
    private static void mappings(ClientGameTestContext context) {
        context.runOnClient(mc -> {
            List<KeyMapping> all = Arrays.asList(mc.options.keyMappings);
            for (String path : List.of("kb_basic", "kb_cooldown", "kb_on_foot", "kb_in_vehicle", "kb_driving_kart", "kb_function")) {
                KeyMapping mapping = ProjectKeyMappings.get(id(path));
                check(mapping != null, path + " has no key mapping");
                check(all.contains(mapping), path + " is not in Options.keyMappings (the Controls screen)");
            }
            check(ProjectKeyMappings.get(id("kb_basic")).getName().equals("key.msm_test.kb_basic"), "default name of kb_basic");
            check(ProjectKeyMappings.get(id("kb_function")).getName().equals("key.msm_test.function_key"), "name of kb_function");
            check(ProjectKeyMappings.get(id("kb_basic")).getCategory().id().equals(id("keys")), "default category");
            check(ProjectKeyMappings.get(id("kb_driving_kart")).getCategory().id().equals(id("vehicle_tests")), "named category");
            check(ProjectKeyMappings.get(id("kb_basic")).saveString().equals("key.keyboard.k"), "kb_basic default key "
                    + ProjectKeyMappings.get(id("kb_basic")).saveString());
            for (RuntimeKey key : RuntimeKey.values()) {
                KeyMapping mapping = RuntimeKeys.mapping(key);
                check(mapping != null, key + " is not registered although the test vehicles are loaded");
                check(all.contains(mapping), key + " is not in Options.keyMappings");
                check(mapping.saveString().equals(key.defaultKey()), key + " default " + mapping.saveString());
                check(!I18n.get(key.translationKey()).equals(key.translationKey()), key + " has no translation");
            }
            check(I18n.get("key.msm_runtime.vehicle_fire").equals("Vehicle: fire"), "fire is " + I18n.get("key.msm_runtime.vehicle_fire"));
            check(RuntimeKeys.mapping(RuntimeKey.FIRE).getCategory().label().getString().equals("MSM Vehicles"),
                    "category label " + RuntimeKeys.mapping(RuntimeKey.FIRE).getCategory().label().getString());
        });
    }

    private static void holdRunsTheFunctions(ClientGameTestContext context, TestDedicatedServerContext server) {
        KeyMapping mapping = context.computeOnClient(mc -> ProjectKeyMappings.get(id("kb_function")));
        context.getInput().holdKeyFor(mapping, 4);
        server.waitFor(s -> player(s).entityTags().contains("msm_key_released"), 100);
        check(server.computeOnServer(s -> player(s).entityTags().contains("msm_key_pressed")), "the press function did not run");
    }

    private static void aTapSendsPressAndRelease(ClientGameTestContext context, TestDedicatedServerContext server, Recorder recorder) {
        int sent = context.computeOnClient(mc -> ControlsClient.sent());
        KeyMapping mapping = context.computeOnClient(mc -> ProjectKeyMappings.get(id("kb_basic")));
        context.getInput().pressKey(mapping);
        server.waitFor(s -> recorder.count("kb_basic released") >= 1, 100);
        check(recorder.count("kb_basic pressed") == 1, "a tap pressed " + recorder.events);
        check(context.computeOnClient(mc -> ControlsClient.sent()) - sent == 2, "a tap sent "
                + (context.computeOnClient(mc -> ControlsClient.sent()) - sent) + " payloads");
    }

    private static void runtimeKeyIsHeldOnTheServer(ClientGameTestContext context, TestDedicatedServerContext server) {
        KeyMapping fire = context.computeOnClient(mc -> RuntimeKeys.mapping(RuntimeKey.FIRE));
        context.getInput().holdKey(fire);
        server.waitFor(s -> HeldKeys.isHeld(player(s), RuntimeKey.FIRE.id()), 100);
        check(context.computeOnClient(mc -> RuntimeKeys.isFireDown()), "isFireDown while held");
        context.getInput().releaseKey(fire);
        server.waitFor(s -> !HeldKeys.isHeld(player(s), RuntimeKey.FIRE.id()), 100);
    }

    private static void aScreenReleasesHeldKeys(ClientGameTestContext context, TestDedicatedServerContext server) {
        KeyMapping mapping = context.computeOnClient(mc -> ProjectKeyMappings.get(id("kb_basic")));
        context.getInput().holdKey(mapping);
        server.waitFor(s -> HeldKeys.isHeld(player(s), id("kb_basic")), 100);
        context.setScreen(() -> new ChatScreen("", false));
        server.waitFor(s -> !HeldKeys.isHeld(player(s), id("kb_basic")), 100);
        context.getInput().releaseKey(mapping);
        context.setScreen(() -> null);
        context.waitTicks(2);
        check(!context.computeOnClient(mc -> ControlsClient.sentDown(id("kb_basic"))), "kb_basic still sent down");
    }

    /** The key bind events of the connected player, as {@code <key bind path> <event path>}. */
    private static final class Recorder implements EventListener {
        final List<String> events = new CopyOnWriteArrayList<>();

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.getNamespace().equals("msm_test") && owner.getPath().startsWith("kb_")) {
                events.add(owner.getPath() + " " + event.getPath());
            }
        }

        @Override
        public void onAction(Identifier owner, Identifier event, Action action, EventContext ctx) {}

        int count(String entry) {
            return (int) events.stream().filter(entry::equals).count();
        }
    }
}
