package dev.mcsupermods.runtime.gametest.spike5;

import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.ParseResults;
import com.mojang.brigadier.tree.ArgumentCommandNode;
import com.mojang.brigadier.tree.CommandNode;
import dev.mcsupermods.runtime.registry.fluid.MsmFluids;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldSave;
import net.minecraft.client.gui.screens.achievement.StatsScreen;
import net.minecraft.client.gui.screens.dialog.DialogScreen;
import net.minecraft.client.multiplayer.ClientSuggestionProvider;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.Registries;
import net.minecraft.locale.Language;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.AbstractBedBlock;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * B525 spike (throwaway) client GameTest (headless Mesa EGL). On a dedicated server: the client's command tree for
 * {@code /b525arg} before and after {@code /reload}, the client's own parse of one input per type, and a data pack
 * dialog opened from the server (X30, X34). In singleplayer: a resource pack replacing the runtime lava-like fluid's
 * pictures, then one changing its block model (X29); game rules and a statistic kept across closing and opening the
 * world, the statistics screen and the lang keys (X31, X32); a real night's sleep (X33).
 */
public class B525ClientGameTest implements FabricClientGameTest {
    static final B525Results R = B525Results.CLIENT;
    static final int Y = 100;

    static ServerPlayer player(MinecraftServer server) {
        return server.getPlayerList().getPlayers().getFirst();
    }

    @Override
    public void runTest(ClientGameTestContext context) {
        R.section("client.dedicated", () -> dedicated(context));
        R.section("client.singleplayer", () -> singleplayer(context));
    }

    // Dedicated server: commands and dialogs -------------------------------------------------------------------

    static Map<String, String> tree(ClientGameTestContext context) {
        return context.computeOnClient(mc -> {
            Map<String, String> out = new LinkedHashMap<>();
            CommandNode<ClientSuggestionProvider> root = mc.getConnection().getCommands().getRoot().getChild("b525arg");
            if (root == null) {
                out.put("b525arg", "missing");
                return out;
            }
            for (CommandNode<ClientSuggestionProvider> lit : root.getChildren()) {
                CommandNode<ClientSuggestionProvider> arg = lit.getChild("value");
                out.put(lit.getName(), arg instanceof ArgumentCommandNode<?, ?> a ? a.getType().getClass().getSimpleName() : "no argument node");
            }
            return out;
        });
    }

    static Map<String, String> clientParse(ClientGameTestContext context) {
        return context.computeOnClient(mc -> {
            Map<String, String> out = new LinkedHashMap<>();
            CommandDispatcher<ClientSuggestionProvider> d = mc.getConnection().getCommands();
            X30ArgumentGameTest.INPUTS.forEach((type, inputs) -> {
                String input = inputs.getFirst();
                ParseResults<ClientSuggestionProvider> p = d.parse("b525arg " + type + " " + input, mc.getConnection().getSuggestionsProvider());
                out.put(type + " " + input, p.getExceptions().isEmpty() ? (p.getReader().canRead() ? "unread " + p.getReader().getRemaining() : "ok")
                        : p.getExceptions().values().toString());
            });
            return out;
        });
    }

    static void dedicated(ClientGameTestContext context) {
        Map<String, Object> m = new LinkedHashMap<>();
        // Own port: another worktree's client GameTest may hold the default one.
        java.util.Properties properties = new java.util.Properties();
        properties.setProperty("server-port", "25725");
        try (TestDedicatedServerContext server = context.worldBuilder().createServer(properties)) {
            try (TestDedicatedServerConnection connection = server.connect()) {
                connection.waitForChunksRender();
                server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
                context.waitTicks(10);
                m.put("tree.beforeReload", tree(context));
                m.put("clientParse", clientParse(context));
                int builds = B525Mod.COMMAND_BUILDS.get();
                server.runCommand("reload");
                context.waitTicks(60);
                m.put("commandBuilds.beforeAfterReload", builds + " -> " + B525Mod.COMMAND_BUILDS.get());
                m.put("tree.afterReload", tree(context));
                // A dialog from the server.
                server.runOnServer(s -> {
                    var holder = s.registryAccess().lookupOrThrow(Registries.DIALOG)
                            .getOrThrow(ResourceKey.create(Registries.DIALOG, B525Mod.id("hello")));
                    player(s).openDialog(holder);
                });
                int waited = context.waitForScreen(DialogScreen.class);
                m.put("dialog.waitedTicks", waited);
                m.put("dialog.screen", context.computeOnClient(mc -> mc.gui.screen() == null ? "none"
                        : mc.gui.screen().getClass().getName() + " title " + mc.gui.screen().getTitle().getString()));
                context.waitTicks(5);
                context.runOnClient(mc -> mc.gui.toastManager().clear());
                context.waitTicks(2);
                m.put("dialog.screenshot", context.takeScreenshot("b525_dialog_" + B525Results.mc()).toString());
                context.setScreen(() -> null);
                context.waitTicks(5);
            }
        }
        R.put("client.dedicated", m);
    }

    // Singleplayer: pictures, game rules, stats, sleep ---------------------------------------------------------

    static MsmFluids.Entry lava() {
        return MsmFluids.get(Identifier.fromNamespaceAndPath("msm_test", "fluid_lava")).orElseThrow();
    }

    static void solid(Path file, int r, int g, int b) throws Exception {
        Files.createDirectories(file.getParent());
        try (NativeImage image = new NativeImage(16, 16, false)) {
            for (int x = 0; x < 16; x++) {
                for (int y = 0; y < 16; y++) {
                    image.setPixelABGR(x, y, 0xFF000000 | (b << 16) | (g << 8) | r);
                }
            }
            image.writeToFile(file);
        }
    }

    static void pack(Path dir) throws Exception {
        Files.createDirectories(dir);
        boolean snapshot = B525Results.mc().startsWith("26.4");
        String format = snapshot ? "[102, 0]" : "[97, 1]";
        String major = snapshot ? "102" : "97";
        Files.writeString(dir.resolve("pack.mcmeta"), "{\"pack\":{\"description\":\"B525 spike\",\"pack_format\":" + major + ",\"min_format\":"
                + format + ",\"max_format\":" + format + "}}", StandardCharsets.UTF_8);
    }

    /** Pixels of the screenshot clearly orange (the test lava picture) and clearly blue (the pack's). */
    static String colours(Path shot) throws Exception {
        int orange = 0;
        int blue = 0;
        int total = 0;
        try (InputStream in = Files.newInputStream(shot); NativeImage image = NativeImage.read(in)) {
            for (int y = 0; y < image.getHeight(); y++) {
                for (int x = 0; x < image.getWidth(); x++) {
                    int p = image.getPixel(x, y);
                    int r = (p >> 16) & 255;
                    int g = (p >> 8) & 255;
                    int b = p & 255;
                    total++;
                    if (r > 180 && g > 70 && g < 170 && b < 60) {
                        orange++;
                    }
                    if (b > 150 && r < 70 && g < 70) {
                        blue++;
                    }
                }
            }
        }
        return String.format(Locale.ROOT, "orange %.1f%%, blue %.1f%% of %d", 100.0 * orange / total, 100.0 * blue / total, total);
    }

    static void select(ClientGameTestContext context, List<String> add, List<String> remove) {
        var future = context.computeOnClient(mc -> {
            var repo = mc.getResourcePackRepository();
            repo.reload();
            List<String> ids = new ArrayList<>(repo.getSelectedIds());
            ids.removeAll(remove);
            for (String id : add) {
                if (!ids.contains(id)) {
                    ids.add(id);
                }
            }
            repo.setSelected(ids);
            return mc.reloadResourcePacks();
        });
        context.waitFor(mc -> future.isDone(), 2400);
        context.waitTicks(20);
    }

    static String look(ClientGameTestContext context, TestSingleplayerContext world, String name) throws Exception {
        TestServerContext server = world.getServer();
        server.runOnServer(s -> {
            ServerPlayer p = player(s);
            p.getAbilities().flying = true;
            p.onUpdateAbilities();
        });
        server.runCommand("tp @a 4.5 " + (Y + 6) + " 4.5 0 90");
        context.waitTicks(10);
        context.getInput().lookAt(0, 90);
        world.getConnection().waitForChunksRender();
        context.waitTicks(10);
        context.runOnClient(mc -> mc.gui.toastManager().clear());
        context.waitTick();
        Path shot = context.takeScreenshot(name + "_" + B525Results.mc());
        return shot.getFileName() + ": " + colours(shot);
    }

    static void singleplayer(ClientGameTestContext context) throws Exception {
        Map<String, Object> m = new LinkedHashMap<>();
        Path packs = context.computeOnClient(mc -> mc.gameDirectory.toPath().resolve("resourcepacks"));
        Path texturePack = packs.resolve("b525_textures");
        pack(texturePack);
        solid(texturePack.resolve("assets/msm_test/textures/block/fluid_lava_still.png"), 0, 0, 255);
        solid(texturePack.resolve("assets/msm_test/textures/block/fluid_lava_flow.png"), 0, 0, 255);
        Path modelPack = packs.resolve("b525_model");
        pack(modelPack);
        solid(modelPack.resolve("assets/b525pack/textures/block/blue_still.png"), 0, 0, 255);
        Files.createDirectories(modelPack.resolve("assets/msm_test/models/block"));
        Files.writeString(modelPack.resolve("assets/msm_test/models/block/fluid_lava.json"),
                "{\"textures\":{\"still\":\"b525pack:block/blue_still\",\"flowing\":\"b525pack:block/blue_still\",\"particle\":\"b525pack:block/blue_still\"}}");
        TestWorldSave save;
        try (TestSingleplayerContext world = context.worldBuilder().create()) {
            TestServerContext server = world.getServer();
            server.runCommand("time set noon");
            server.runCommand("weather clear");
            server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
            server.runOnServer(s -> {
                ServerLevel level = s.overworld();
                BlockState fill = lava().block().defaultBlockState();
                for (int x = -6; x <= 14; x++) {
                    for (int z = -6; z <= 14; z++) {
                        level.setBlock(new BlockPos(x, Y - 1, z), Blocks.STONE.defaultBlockState(), 2);
                        for (int y = Y; y <= Y + 12; y++) {
                            boolean pool = x >= 0 && x <= 9 && z >= 0 && z <= 9 && y <= Y + 2;
                            boolean edge = pool && (x == 0 || x == 9 || z == 0 || z == 9);
                            level.setBlock(new BlockPos(x, y, z), edge ? Blocks.STONE.defaultBlockState() : pool ? fill : Blocks.AIR.defaultBlockState(), 3);
                        }
                    }
                }
            });
            world.getConnection().waitForChunksRender();
            R.section("X29", () -> {
                m.put("X29.before", look(context, world, "b525_lava_before"));
                m.put("X29.packIds", context.computeOnClient(mc -> {
                    mc.getResourcePackRepository().reload();
                    return mc.getResourcePackRepository().getAvailableIds().stream().filter(i -> i.contains("b525")).toList();
                }));
                select(context, List.of("file/b525_textures"), List.of());
                m.put("X29.selectedAfterTexturePack", context.computeOnClient(mc -> List.copyOf(mc.getResourcePackRepository().getSelectedIds())));
                m.put("X29.texturePack", look(context, world, "b525_lava_texture_pack"));
                select(context, List.of("file/b525_model"), List.of("file/b525_textures"));
                m.put("X29.modelPack", look(context, world, "b525_lava_model_pack"));
                select(context, List.of(), List.of("file/b525_model"));
                m.put("X29.noPack", look(context, world, "b525_lava_no_pack"));
            });
            R.section("X31X32.set", () -> {
                server.runCommand("gamerule msm_b525:spike_count 9");
                server.runCommand("gamerule msm_b525:spike_flag false");
                server.runCommand("gamerule msm_b525:spike_vanilla true");
                server.runOnServer(s -> player(s).awardStat(B525Mod.stat("spike_stat"), 5));
                m.put("set.values", server.computeOnServer(s -> s.getGameRules().get(B525Mod.COUNT) + " " + s.getGameRules().get(B525Mod.FLAG) + " "
                        + s.getGameRules().get(B525Mod.VANILLA_FLAG) + " stat " + player(s).getStats().getValue(Stats.CUSTOM.get(B525Mod.stat("spike_stat")))));
                m.put("lang", context.computeOnClient(mc -> {
                    Map<String, String> out = new LinkedHashMap<>();
                    for (String key : List.of("stat.msm_b525.spike_stat", B525Mod.COUNT.getDescriptionId(), B525Mod.FLAG.getDescriptionId(),
                            B525Mod.VANILLA_FLAG.getDescriptionId(), B525Mod.COUNT.getDescriptionId() + ".description")) {
                        out.put(key, Language.getInstance().has(key) ? Language.getInstance().getOrDefault(key) : "(no translation)");
                    }
                    return out;
                }));
                context.setScreen(() -> new StatsScreen(null, context.computeOnClient(mc -> mc.player.getStats())));
                context.waitTicks(40);
                m.put("statsScreen.clientValue", context.computeOnClient(mc -> mc.player.getStats().getValue(Stats.CUSTOM.get(B525Mod.stat("spike_stat")))));
                context.runOnClient(mc -> mc.gui.toastManager().clear());
                context.getInput().setCursorPos(427, 240);
                List<String> statShots = new ArrayList<>();
                statShots.add(context.takeScreenshot("b525_stats_top_" + B525Results.mc()).getFileName().toString());
                context.getInput().scroll(-1000);
                context.waitTicks(5);
                statShots.add(context.takeScreenshot("b525_stats_end_" + B525Results.mc()).getFileName().toString());
                m.put("statsScreen.screenshots", statShots);
                context.setScreen(() -> null);
                context.waitTicks(5);
            });
            R.section("X33.sleep", () -> {
                server.runOnServer(s -> {
                    ServerPlayer p = player(s);
                    p.setGameMode(GameType.SURVIVAL);
                    p.getAbilities().flying = false;
                    p.onUpdateAbilities();
                    ServerLevel level = s.overworld();
                    BlockPos foot = new BlockPos(12, Y, 12);
                    BlockState footState = Blocks.BED.blue().defaultBlockState().setValue(AbstractBedBlock.FACING, Direction.SOUTH)
                            .setValue(AbstractBedBlock.PART, BedPart.FOOT);
                    level.setBlock(foot, footState, 3);
                    level.setBlock(foot.south(), footState.setValue(AbstractBedBlock.PART, BedPart.HEAD), 3);
                    p.teleportTo(11.5, Y, 12.5);
                });
                server.runCommand("time set midnight");
                context.waitTicks(5);
                int from = B525Mod.EVENTS.size();
                String use = server.computeOnServer(s -> {
                    ServerPlayer p = player(s);
                    BlockPos head = new BlockPos(12, Y, 13);
                    return String.valueOf(p.gameMode.useItemOn(p, s.overworld(), ItemStack.EMPTY, InteractionHand.MAIN_HAND,
                            new BlockHitResult(Vec3.atCenterOf(head), Direction.UP, head, false))) + " sleeping " + p.isSleeping();
                });
                m.put("sleep.use", use);
                int waited = server.waitFor(s -> !player(s).isSleeping(), 600);
                m.put("sleep.wokeAfterTicks", waited);
                List<String> ev = new ArrayList<>();
                List<String> all = List.copyOf(B525Mod.EVENTS);
                for (int i = from; i < all.size(); i++) {
                    ev.add(all.get(i));
                }
                m.put("sleep.events", ev);
                m.put("sleep.timeAfter", server.computeOnServer(s -> s.overworld().getDefaultClockTime()));
            });
            save = world.getWorldSave();
        }
        try (TestSingleplayerContext again = save.open()) {
            R.section("X31X32.reopened", () -> m.put("reopened.values", again.getServer().computeOnServer(s -> s.getGameRules().get(B525Mod.COUNT) + " "
                    + s.getGameRules().get(B525Mod.FLAG) + " " + s.getGameRules().get(B525Mod.VANILLA_FLAG) + " stat "
                    + player(s).getStats().getValue(Stats.CUSTOM.get(B525Mod.stat("spike_stat"))))));
        }
        R.put("client.singleplayer", m);
    }
}
