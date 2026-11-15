package dev.mcsupermods.runtime.gametest;

import com.mojang.blaze3d.platform.NativeImage;
import dev.mcsupermods.runtime.client.controls.ControlsClient;
import dev.mcsupermods.runtime.client.hud.HudClient;
import dev.mcsupermods.runtime.client.hud.HudLayout;
import dev.mcsupermods.runtime.client.hud.MsmHudLayer;
import dev.mcsupermods.runtime.client.hud.VehicleDashboard;
import dev.mcsupermods.runtime.hud.HudServer;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import java.nio.file.Path;
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
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotComparisonOptions;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;

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
 * <p>The HUD half (B416, ADR 0089 D3 to D5), on the same connection: the server sets {@code msm_test:hud_client_bar} (a
 * magenta bar, top left), {@code hud_client_sprite} (a bar of the green test sprite below it) and {@code hud_client_text}
 * (yellow text without a shadow, at the top centre, clear of the toasts); the client receives the values, the layer places the three where {@link HudLayout} says
 * on the GUI's scaled size (which is the window over the GUI scale, rounded up), and the screenshot has each one inside
 * its box. Then the player gets into {@code msm_test:vh_tank} with half its health gone: the dashboard's rows appear in
 * the {@code bottom_right} stack, the health bar half filled. The screenshot {@code msm_hud} shows all of it.
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
                    hud(context, server);
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

    private static HudLayout.Placed placed(ClientGameTestContext context, String id) {
        return context.computeOnClient(mc -> MsmHudLayer.last().stream().filter(p -> p.box().id().equals(id)).findFirst().orElse(null));
    }

    private static NativeImage solid(int w, int h, int argb) {
        NativeImage image = new NativeImage(w, h, false);
        image.fillRect(0, 0, w, h, argb);
        return image;
    }

    /** Asserts that a {@code w} by {@code h} block of {@code argb} lies inside the GUI box {@code p} (in screen pixels). */
    private static void found(ClientGameTestContext context, HudLayout.Placed p, int scale, int w, int h, int argb, String name) {
        try (NativeImage template = solid(w, h, argb)) {
            context.assertScreenshotContains(TestScreenshotComparisonOptions.of(template)
                    .withRegion(p.x() * scale, p.y() * scale, p.box().width() * scale, p.box().height() * scale)
                    .saveWithFileName("msm_hud_" + name));
        }
    }

    /** The HUD half: a bar, a sprite bar, a text and the vehicle dashboard, placed by {@link HudLayout}. */
    private static void hud(ClientGameTestContext context, TestDedicatedServerContext server) {
        check(context.computeOnClient(mc -> HudClient.layerRegistered()), "the HUD layer is not registered");
        int textSlot = HudServer.index(id("hud_client_text")).orElseThrow();
        server.runOnServer(s -> {
            ServerPlayer p = player(s);
            HudServer.set(p, id("hud_client_bar"), 20);
            HudServer.set(p, id("hud_client_sprite"), 20);
            HudServer.set(p, id("hud_client_text"), "OK");
        });
        context.waitFor(mc -> "OK".equals(HudClient.state().value(textSlot)), 100);
        // The join toasts cover the top right; the screenshots are of the HUD.
        context.runOnClient(mc -> mc.gui.toastManager().clear());
        context.waitTicks(3);
        int scale = context.computeOnClient(mc -> mc.getWindow().getGuiScale());
        int[] size = context.computeOnClient(mc -> new int[] {mc.getWindow().getWidth(), mc.getWindow().getHeight(),
                mc.getWindow().getGuiScaledWidth(), mc.getWindow().getGuiScaledHeight()});
        check(HudLayout.guiSize(size[0], scale) == size[2] && HudLayout.guiSize(size[1], scale) == size[3],
                "GUI size " + size[2] + "x" + size[3] + " is not the window " + size[0] + "x" + size[1] + " over " + scale + ", rounded up");
        HudLayout.Placed bar = placed(context, "msm_test:hud_client_bar");
        HudLayout.Placed sprite = placed(context, "msm_test:hud_client_sprite");
        HudLayout.Placed text = placed(context, "msm_test:hud_client_text");
        check(bar != null && sprite != null && text != null, "not drawn: " + context.computeOnClient(mc -> MsmHudLayer.last()));
        List<HudLayout.Placed> expected = HudLayout.place(size[2], size[3], List.of(bar.box(), sprite.box(), text.box()));
        check(bar.x() == HudLayout.MARGIN && bar.y() == HudLayout.MARGIN, "the bar is not at the top left: " + bar);
        check(expected.get(1).y() == sprite.y() && sprite.y() == bar.y() + 6 + HudLayout.GAP, "the sprite bar is not below the bar: " + sprite);
        check(text.x() == Math.floorDiv(size[2] - text.box().width(), 2) && text.y() == HudLayout.MARGIN, "the text is not at the top: " + text);
        context.takeScreenshot("msm_hud_elements");
        found(context, bar, scale, 8, 3, 0xffff00ff, "bar");
        found(context, sprite, scale, 8, 3, 0xff00ff00, "sprite");
        found(context, text, scale, 2, 2, 0xffffff00, "text");

        server.runOnServer(s -> {
            ServerPlayer p = player(s);
            @SuppressWarnings("unchecked")
            EntityType<MsmVehicle> type = (EntityType<MsmVehicle>) BuiltInRegistries.ENTITY_TYPE.getValue(id("vh_tank"));
            MsmVehicle tank = type.create(p.level(), EntitySpawnReason.COMMAND);
            tank.snapTo(p.getX(), p.getY(), p.getZ(), p.getYRot(), 0);
            tank.setDamage(15);
            p.level().addFreshEntity(tank);
            p.startRiding(tank);
        });
        context.waitFor(mc -> mc.player.getVehicle() instanceof MsmVehicle, 100);
        context.waitFor(mc -> MsmHudLayer.last().stream().anyMatch(p -> p.box().id().startsWith("msm_runtime:dashboard/")), 100);
        context.waitTicks(5);
        HudLayout.Placed health = context.computeOnClient(mc -> {
            List<HudLayout.Placed> rows = MsmHudLayer.last().stream().filter(p -> p.box().id().startsWith("msm_runtime:dashboard/")).toList();
            return rows.getLast(); // the top row
        });
        int rows = context.computeOnClient(mc -> (int) MsmHudLayer.last().stream().filter(p -> p.box().id().startsWith("msm_runtime:dashboard/"))
                .count());
        check(rows == 2, "the tank's dashboard has health and one weapon, not " + rows + " rows");
        check(health.x() + health.box().width() == size[2] - HudLayout.MARGIN, "the dashboard is not at the right edge: " + health);
        // Half the health: the bar's right half shows the back colour.
        int barX = health.x() + health.box().width() - VehicleDashboard.BAR_WIDTH;
        HudLayout.Placed backHalf = new HudLayout.Placed(new HudLayout.Box("back", health.box().anchor(), 0, 0, 0,
                VehicleDashboard.BAR_WIDTH / 2, HudLayout.TEXT_HEIGHT), barX + VehicleDashboard.BAR_WIDTH / 2, health.y());
        found(context, backHalf, scale, 6, 4, VehicleDashboard.BACK_COLOR, "dashboard_back");
        HudLayout.Placed filledHalf = new HudLayout.Placed(backHalf.box(), barX, health.y());
        found(context, filledHalf, scale, 6, 4, VehicleDashboard.HEALTH_COLOR, "dashboard_health");
        context.runOnClient(mc -> mc.gui.toastManager().clear());
        context.waitTicks(2);
        Path shot = context.takeScreenshot("msm_hud");
        check(shot.toFile().isFile(), "no HUD screenshot at " + shot);
        server.runOnServer(s -> {
            ServerPlayer p = player(s);
            if (p.getVehicle() != null) {
                Entity vehicle = p.getVehicle();
                p.stopRiding();
                vehicle.discard();
            }
        });
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
