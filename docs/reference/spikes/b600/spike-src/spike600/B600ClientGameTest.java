package dev.mcsupermods.runtime.gametest.spike600;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.advancements.AdvancementNode;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.events.ContainerEventHandler;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.advancements.AdvancementsScreen;
import net.minecraft.client.gui.screens.dialog.DialogScreen;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.GameType;

/**
 * B600 spike (throwaway) client GameTest (headless Mesa EGL), 2S8 and 2S9: in singleplayer, each fixture dialog opened
 * from the server and the widgets of its screen recorded (class, x, y, width, height, message) at the window's GUI
 * scale; the client's advancement tree (which of the fixture's advancements reach the client, roots, positions) and the
 * advancements screen with the fixture tab selected. Screenshots stay in the run folder (not kept).
 */
public class B600ClientGameTest implements FabricClientGameTest {
    static final B600Results R = B600Results.CLIENT;

    static ServerPlayer player(MinecraftServer server) {
        return server.getPlayerList().getPlayers().getFirst();
    }

    static void widgets(List<? extends GuiEventListener> children, List<Object> out, int depth) {
        for (GuiEventListener l : children) {
            Map<String, Object> w = new LinkedHashMap<>();
            w.put("class", l.getClass().getSimpleName());
            w.put("depth", depth);
            if (l instanceof AbstractWidget a) {
                w.put("rect", a.getX() + "," + a.getY() + " " + a.getWidth() + "x" + a.getHeight());
                w.put("message", a.getMessage().getString());
            } else {
                var r = l.getRectangle();
                w.put("rect", r.left() + "," + r.top() + " " + r.width() + "x" + r.height());
            }
            out.add(w);
            if (l instanceof ContainerEventHandler c) {
                widgets(c.children(), out, depth + 1);
            }
        }
    }

    static Map<String, Object> screen(ClientGameTestContext context) {
        return context.computeOnClient(mc -> {
            Map<String, Object> m = new LinkedHashMap<>();
            Screen s = mc.gui.screen();
            m.put("screen", s == null ? "none" : s.getClass().getSimpleName());
            m.put("gui", mc.getWindow().getGuiScaledWidth() + "x" + mc.getWindow().getGuiScaledHeight() + " scale " + mc.getWindow().getGuiScale());
            if (s != null) {
                m.put("title", s.getTitle().getString());
                List<Object> w = new ArrayList<>();
                widgets(s.children(), w, 0);
                m.put("widgets", w);
            }
            return m;
        });
    }

    @Override
    public void runTest(ClientGameTestContext context) {
        try (TestSingleplayerContext world = context.worldBuilder().create()) {
            TestServerContext server = world.getServer();
            server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
            world.getConnection().waitForChunksRender();
            R.section("dialogs", () -> {
                for (String d : List.of("notice", "confirmation", "multi_action", "dialog_list", "server_links", "plain")) {
                    server.runOnServer(s -> player(s).openDialog(s.registryAccess().lookupOrThrow(Registries.DIALOG)
                            .getOrThrow(ResourceKey.create(Registries.DIALOG, B600Help.id(d)))));
                    context.waitForScreen(DialogScreen.class);
                    context.waitTicks(5);
                    context.runOnClient(mc -> mc.gui.toastManager().clear());
                    context.waitTicks(2);
                    R.put("dialog." + d, screen(context));
                    context.takeScreenshot("b600_dialog_" + d + "_" + B600Results.mc());
                    context.setScreen(() -> null);
                    context.waitTicks(5);
                }
            });
            R.section("advancements", () -> {
                server.runCommand("advancement grant @a only msm_b600:tab/a2x");
                context.waitTicks(10);
                Map<String, Object> tree = context.computeOnClient(mc -> {
                    Map<String, Object> m = new TreeMap<>();
                    var adv = mc.getConnection().getAdvancements();
                    List<String> roots = new ArrayList<>();
                    adv.tree().roots().forEach(r -> roots.add(r.holder().id().toString()));
                    m.put("roots", roots);
                    Map<String, Object> nodes = new TreeMap<>();
                    for (AdvancementNode n : adv.tree().nodes()) {
                        if (n.holder().id().getNamespace().equals(B600Help.NS)) {
                            nodes.put(n.holder().id().toString(), n.x() + "," + n.y());
                        }
                    }
                    m.put("ours", nodes);
                    m.put("count", adv.tree().nodes().size());
                    return m;
                });
                R.put("advancements.tree", tree);
                server.runCommand("advancement grant @a from msm_b600:tab/root");
                server.runCommand("advancement grant @a from msm_b600:plain/root");
                context.waitTicks(10);
                R.put("advancements.treeAllGranted", context.computeOnClient(mc -> {
                    Map<String, Object> m = new TreeMap<>();
                    var adv = mc.getConnection().getAdvancements();
                    List<String> roots = new ArrayList<>();
                    adv.tree().roots().forEach(r -> roots.add(r.holder().id().toString()));
                    m.put("roots", roots);
                    for (AdvancementNode n : adv.tree().nodes()) {
                        if (n.holder().id().getNamespace().equals(B600Help.NS)) {
                            m.put(n.holder().id().toString(), n.x() + "," + n.y());
                        }
                    }
                    return m;
                }));
                context.setScreen(() -> context.computeOnClient(mc -> new AdvancementsScreen(mc.getConnection().getAdvancements())));
                context.waitTicks(5);
                context.runOnClient(mc -> {
                    var adv = mc.getConnection().getAdvancements();
                    adv.setSelectedTab(adv.get(B600Help.id("tab/root")), true);
                });
                context.waitTicks(5);
                R.put("advancements.screen", screen(context));
                context.takeScreenshot("b600_advancements_" + B600Results.mc());
                context.setScreen(() -> null);
            });
        }
    }
}
