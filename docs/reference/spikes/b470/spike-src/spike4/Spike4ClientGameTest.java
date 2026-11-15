package dev.mcsupermods.runtime.gametest.spike4;

import com.mojang.blaze3d.platform.NativeImage;
import dev.mcsupermods.runtime.gametest.SpikeFluid;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotComparisonAlgorithm;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotComparisonOptions;
import net.fabricmc.fabric.api.client.render.fluid.v1.FluidRenderingRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/**
 * B470 spike (throwaway): S14 in the real client, singleplayer and on a dedicated server ({@code createServer()} /
 * {@code connect()}). Records into {@code <gameDir>/msm-spike4/client-<mc>.json}; screenshots {@code b470_*} land in
 * {@code build/run/clientGameTest/screenshots/}.
 */
public class Spike4ClientGameTest implements FabricClientGameTest {
    private final Spike4Results r = new Spike4Results("client");
    private String mc;
    private static final String[] PATHS = {"spike_water", "spike_water_bare", "spike_lava", "spike_lava_bare", "spike_plain", "vanilla_water"};
    private static final int Y = 100;

    private static int x0(int i) {
        return i * 14;
    }

    @Override
    public void runTest(ClientGameTestContext context) {
        mc = Spike4Results.mc().replace(' ', '_');
        r.put("client.registration", new TreeMap<>(Spike4Client.CLIENT));
        try (TestSingleplayerContext sp = context.worldBuilder().create()) {
            TestServerContext server = sp.getServer();
            setup(server);
            sp.getConnection().waitForChunksRender();
            r.section("SP.draw", () -> draw(context, server, sp.getConnection(), "sp"));
            r.section("SP.flowing", () -> flowingShot(context, server, sp.getConnection(), "sp"));
            r.section("SP.fog", () -> fog(context, server, "sp"));
            r.section("SP.swim", () -> swim(context, server, "sp"));
            r.section("SP.survive", () -> survive(context, server, "sp"));
            r.section("SP.fall", () -> fall(context, server, "sp"));
        }
        try (TestDedicatedServerContext ds = context.worldBuilder().createServer(dsProperties())) {
            try (TestDedicatedServerConnection connection = ds.connect()) {
                setup(ds);
                connection.waitForChunksRender();
                r.section("DS.sync", () -> sync(context, ds));
                r.section("DS.draw", () -> draw(context, ds, connection, "ds"));
                r.section("DS.fog", () -> fog(context, ds, "ds"));
                r.section("DS.swim", () -> swim(context, ds, "ds"));
                r.section("DS.survive", () -> survive(context, ds, "ds"));
                r.section("DS.fall", () -> fall(context, ds, "ds"));
                r.section("DS.bucket", () -> bucket(context, ds, connection));
            }
        }
        r.put("log", new ArrayList<>(Spike4Mod.LOG));
        r.put("entityInside", new TreeMap<>(Spike4LiquidBlock.INSIDE).toString());
        System.out.println("[spike4] client done " + mc);
    }

    // ---------------------------------------------------------------- helpers

    /** Another spike may run its own dedicated server on 25565 at the same time. */
    private static java.util.Properties dsProperties() {
        java.util.Properties p = new java.util.Properties();
        p.setProperty("server-port", "25571");
        return p;
    }

    private static ServerPlayer player(MinecraftServer server) {
        return server.getPlayerList().getPlayers().getFirst();
    }

    private static void setup(TestServerContext server) {
        server.runCommand("gamerule send_command_feedback false");
        server.runCommand("gamerule sendCommandFeedback false");
        server.runCommand("time set noon");
        server.runCommand("weather clear");
        server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
        // Blocks set one by one (a fill command fails on any chunk that is not loaded yet).
        server.runOnServer(s -> {
            ServerLevel level = s.overworld();
            for (int x = -6; x <= 110; x++) {
                for (int z = -6; z <= 16; z++) {
                    level.setBlock(new BlockPos(x, Y - 1, z), Blocks.STONE.defaultBlockState(), 2);
                    for (int y = Y; y <= Y + 25; y++) {
                        level.setBlock(new BlockPos(x, y, z), Blocks.AIR.defaultBlockState(), 2);
                    }
                }
            }
        });
        server.runOnServer(s -> {
            ServerLevel level = s.overworld();
            for (int i = 0; i < PATHS.length; i++) {
                BlockState fill = fillOf(PATHS[i]);
                int x0 = x0(i);
                for (int x = x0 - 1; x <= x0 + 9; x++) {
                    for (int z = -1; z <= 9; z++) {
                        for (int y = Y; y <= Y + 2; y++) {
                            boolean edge = x == x0 - 1 || x == x0 + 9 || z == -1 || z == 9;
                            level.setBlock(new BlockPos(x, y, z), edge ? Blocks.STONE.defaultBlockState() : fill, 3);
                        }
                    }
                }
            }
        });
        tp(server, -3.5, Y + 1, 4.5, -90, 0);
    }

    private static BlockState fillOf(String path) {
        return path.equals("vanilla_water") ? Blocks.WATER.defaultBlockState() : Spike4Mod.BLOCKS.get(path).defaultBlockState();
    }

    private static void tp(TestServerContext server, double x, double y, double z, float yaw, float pitch) {
        server.runCommand(String.format(java.util.Locale.ROOT, "tp @a %.2f %.2f %.2f %.1f %.1f", x, y, z, yaw, pitch));
    }

    private static void fly(TestServerContext server, boolean on) {
        server.runOnServer(s -> {
            ServerPlayer p = player(s);
            p.getAbilities().flying = on;
            p.onUpdateAbilities();
        });
    }

    private static Map<String, Object> look(Entity e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("inWater", e.isInWater());
        out.put("inLava", e.isInLava());
        out.put("underWater", e.isUnderWater());
        out.put("eyeInWater", e.isEyeInFluid(FluidTags.WATER));
        out.put("swimming", e.isSwimming());
        out.put("visuallySwimming", e.isVisuallySwimming());
        out.put("onFire", e.isOnFire());
        out.put("fireTicks", e.getRemainingFireTicks());
        out.put("air", e.getAirSupply());
        out.put("pos", String.format(java.util.Locale.ROOT, "%.2f %.2f %.2f", e.getX(), e.getY(), e.getZ()));
        if (e instanceof LivingEntity l) {
            out.put("health", l.getHealth());
            out.put("lastDamage", l.getLastDamageSource() == null ? "none" : l.getLastDamageSource().getMsgId());
        }
        return out;
    }

    private static NativeImage solid(int r, int g, int b) {
        NativeImage img = new NativeImage(2, 2, false);
        for (int x = 0; x < 2; x++) {
            for (int y = 0; y < 2; y++) {
                img.setPixelABGR(x, y, 0xFF000000 | (b << 16) | (g << 8) | r);
            }
        }
        return img;
    }

    /** The screenshot's pixel at the centre, as r,g,b (NativeImage holds ABGR). */
    private static String centre(Path shot) throws Exception {
        try (InputStream in = Files.newInputStream(shot); NativeImage img = NativeImage.read(in)) {
            int w = img.getWidth();
            int h = img.getHeight();
            List<String> out = new ArrayList<>();
            for (int[] p : new int[][] {{w / 2, h / 2}, {w / 4, h / 4}, {3 * w / 4, h / 4}}) {
                int c = img.getPixel(p[0], p[1]);
                out.add(String.format("(%d,%d)=argb %08X", p[0], p[1], c));
            }
            return w + "x" + h + " " + out;
        }
    }

    // ---------------------------------------------------------------- drawing (tint) from above

    private void draw(ClientGameTestContext context, TestServerContext server, TestServerConnection conn, String where) throws Throwable {
        for (int i = 0; i < PATHS.length; i++) {
            String path = PATHS[i];
            String k = where + ".draw." + path;
            fly(server, true);
            tp(server, x0(i) + 4.5, Y + 6, 4.5, 0, 90);
            fly(server, true);
            context.waitTicks(10);
            context.getInput().lookAt(0, 90);
            conn.waitForChunksRender();
            context.waitTicks(10);
            context.runOnClient(m -> m.gui.toastManager().clear());
            Path shot = context.takeScreenshot("b470_top_" + path + "_" + where + "_" + mc);
            r.put(k + ".shot", shot.getFileName().toString());
            r.put(k + ".pixels", centre(shot));
            BlockPos at = new BlockPos(x0(i) + 4, Y + 2, 4);
            r.put(k + ".clientBlock", context.computeOnClient(m -> m.level.getBlockState(at).toString()));
            r.put(k + ".clientFluid", context.computeOnClient(m -> m.level.getFluidState(at).toString()));
            r.put(k + ".clientBlockLight", context.computeOnClient(m -> m.level.getBrightness(LightLayer.BLOCK, at.above())));
            r.put(k + ".renderHandler", context.computeOnClient(m -> String.valueOf(
                    FluidRenderingRegistry.get(m.level.getFluidState(at).getType()))));
            if (path.equals("vanilla_water")) {
                continue;
            }
            Integer tint = Spike4Mod.BY_PATH.get(path).tint();
            int[] expect = expected(path, tint);
            String name = "b470_tint_" + path + "_" + where + "_" + mc;
            try {
                var found = context.assertScreenshotContains(TestScreenshotComparisonOptions.of(solid(expect[0], expect[1], expect[2]))
                        .withAlgorithm(TestScreenshotComparisonAlgorithm.meanSquaredDifference(0.01f)).saveWithFileName(name));
                r.put(k + ".assertContains", "found " + found + " rgb " + expect[0] + "," + expect[1] + "," + expect[2]);
            } catch (Throwable t) {
                r.put(k + ".assertContains", "FAILED rgb " + expect[0] + "," + expect[1] + "," + expect[2] + ": " + t.getMessage());
            }
        }
        fly(server, false);
    }

    /** The colour a fully lit top face should show: the texture's colour times the tint's RGB. */
    private static int[] expected(String path, Integer tint) {
        int[] tex = switch (path) {
            case "spike_lava", "spike_lava_bare" -> new int[] {255, 120, 0};
            case "spike_plain" -> new int[] {200, 200, 200};
            default -> new int[] {255, 255, 255};
        };
        if (tint == null) {
            return tex;
        }
        int t = tint;
        return new int[] {tex[0] * ((t >> 16) & 255) / 255, tex[1] * ((t >> 8) & 255) / 255, tex[2] * (t & 255) / 255};
    }

    private void flowingShot(ClientGameTestContext context, TestServerContext server, TestServerConnection conn, String where) throws Throwable {
        // A source on a pillar at x=104: flowing and falling faces, seen from the side.
        server.runOnServer(s -> {
            ServerLevel level = s.overworld();
            level.setBlock(new BlockPos(104, Y, 4), Blocks.STONE.defaultBlockState(), 3);
            level.setBlock(new BlockPos(104, Y + 1, 4), Blocks.STONE.defaultBlockState(), 3);
            level.setBlock(new BlockPos(104, Y + 2, 4), Spike4Mod.BLOCKS.get("spike_water").defaultBlockState(), 3);
            level.setBlock(new BlockPos(98, Y + 2, 4), Spike4Mod.BLOCKS.get("spike_lava").defaultBlockState(), 3);
        });
        fly(server, true);
        tp(server, 101.5, Y + 4, -4.5, 0, 25);
        fly(server, true);
        context.waitTicks(200);
        context.getInput().lookAt(0, 25);
        conn.waitForChunksRender();
        context.waitTicks(5);
        r.put(where + ".flowing.shot", context.takeScreenshot("b470_flowing_" + where + "_" + mc).getFileName().toString());
        List<String> states = new ArrayList<>();
        for (int x = 94; x <= 108; x++) {
            BlockPos p = new BlockPos(x, Y, 4);
            states.add(x + ":" + context.computeOnClient(m -> m.level.getFluidState(p).toString().replaceAll("^.*?\\{", "{")));
        }
        r.put(where + ".flowing.clientRowY100", states);
        fly(server, false);
    }

    // ---------------------------------------------------------------- fog

    private void fog(ClientGameTestContext context, TestServerContext server, String where) throws Throwable {
        for (int i = 0; i < PATHS.length; i++) {
            String path = PATHS[i];
            String k = where + ".fog." + path;
            tp(server, x0(i) + 4.5, Y, 4.5, 0, 0);
            context.waitTicks(15);
            r.put(k + ".camera", context.computeOnClient(m -> SpikeFluid.fogType(m.gameRenderer.mainCamera())));
            r.put(k + ".clientPlayer", context.computeOnClient(m -> look(m.player)));
            context.runOnClient(m -> m.gui.toastManager().clear());
            r.put(k + ".shot", context.takeScreenshot("b470_fog_" + path + "_" + where + "_" + mc).getFileName().toString());
        }

    }

    private String vanillaFog(ClientGameTestContext context, TestServerContext server) throws Throwable {
        server.runCommand("fill 72 100 10 74 102 12 minecraft:water");
        tp(server, 73.5, Y, 11.5, 0, 0);
        context.waitTicks(15);
        return context.computeOnClient(m -> SpikeFluid.fogType(m.gameRenderer.mainCamera()));
    }

    // ---------------------------------------------------------------- swimming

    private void swim(ClientGameTestContext context, TestServerContext server, String where) throws Throwable {
        server.runOnServer(s -> player(s).setGameMode(GameType.SURVIVAL));
        for (int i = 0; i < PATHS.length; i++) {
            String path = PATHS[i];
            if (path.startsWith("spike_lava")) {
                continue;
            }
            String k = where + ".swim." + path;
            tp(server, x0(i) + 0.6, Y + 0.5, 4.5, -90, 0);
            context.waitTicks(10);
            context.getInput().lookAt(-90, 0);
            double startX = server.computeOnServer(s -> player(s).getX());
            context.getInput().holdKey(o -> o.keySprint);
            context.getInput().holdKey(o -> o.keyUp);
            context.waitTicks(25);
            r.put(k + ".server", server.computeOnServer(s -> look(player(s))));
            r.put(k + ".travelled25", server.computeOnServer(s -> Math.round((player(s).getX() - startX) * 100) / 100.0));
            r.put(k + ".client", context.computeOnClient(m -> look(m.player)));
            context.getInput().releaseKey(o -> o.keyUp);
            context.getInput().releaseKey(o -> o.keySprint);
            context.waitTicks(5);
        }
        server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
    }

    // ---------------------------------------------------------------- air, drowning, fire, lava (survival)

    private void survive(ClientGameTestContext context, TestServerContext server, String where) throws Throwable {
        for (int i = 0; i < PATHS.length; i++) {
            String path = PATHS[i];
            int idx = i;
            String k = where + ".survive." + path;
            server.runOnServer(s -> {
                ServerPlayer p = player(s);
                p.setGameMode(GameType.SURVIVAL);
                p.setHealth(20f);
                p.setAirSupply(p.getMaxAirSupply());
                p.clearFire();
            });
            tp(server, x0(i) + 4.5, Y, 4.5, 0, 0);
            context.waitTicks(5);
            server.runOnServer(s -> player(s).setRemainingFireTicks(200));
            context.waitTicks(5);
            r.put(k + ".t5", server.computeOnServer(s -> look(player(s))));
            if (path.startsWith("spike_lava")) {
                server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
                server.runOnServer(s -> player(s).setHealth(20f));
                tp(server, -3.5, Y + 1, 4.5, -90, 0);
                context.waitTicks(10);
                server.runOnServer(s -> player(s).clearFire());
                continue;
            }
            context.waitTicks(40);
            r.put(k + ".t45", server.computeOnServer(s -> look(player(s))));
            server.runOnServer(s -> player(s).setAirSupply(0));
            context.waitTicks(45);
            r.put(k + ".t90air0", server.computeOnServer(s -> look(player(s))));
            r.put(k + ".client", context.computeOnClient(m -> look(m.player)));
            r.put(k + ".alive", server.computeOnServer(s -> player(s).isAlive()));
            server.runOnServer(s -> {
                ServerPlayer p = player(s);
                p.setGameMode(GameType.CREATIVE);
                p.setHealth(20f);
                p.clearFire();
            });
            tp(server, -3.5, Y + 1, 4.5, -90, 0);
            context.waitTicks(5);
        }
    }

    private void fall(ClientGameTestContext context, TestServerContext server, String where) throws Throwable {
        for (int i = 0; i < PATHS.length; i++) {
            String path = PATHS[i];
            if (path.startsWith("spike_lava")) {
                continue;
            }
            int idx = i;
            server.runOnServer(s -> {
                ServerPlayer p = player(s);
                p.setGameMode(GameType.SURVIVAL);
                p.setHealth(20f);
                p.setAirSupply(p.getMaxAirSupply());
            });
            tp(server, x0(idx) + 4.5, Y + 12, 4.5, 0, 0);
            context.waitTicks(60);
            r.put(where + ".fall11." + path, server.computeOnServer(s -> look(player(s))));
        }
        server.runOnServer(s -> {
            ServerPlayer p = player(s);
            p.setGameMode(GameType.CREATIVE);
            p.setHealth(20f);
        });
        tp(server, -3.5, Y + 1, 4.5, -90, 0);
        context.waitTicks(5);
    }

    // ---------------------------------------------------------------- dedicated server: sync and the bucket by the use key

    private void sync(ClientGameTestContext context, TestServerContext server) throws Throwable {
        r.put("DS.sync.serverClass", server.computeOnServer(s -> s.getClass().getName() + " dedicated=" + s.isDedicatedServer()));
        for (int i = 0; i < PATHS.length; i++) {
            String path = PATHS[i];
            BlockPos at = new BlockPos(x0(i) + 4, Y + 1, 4);
            r.put("DS.sync." + path + ".client", context.computeOnClient(m -> m.level.getBlockState(at) + " | " + m.level.getFluidState(at)));
            r.put("DS.sync." + path + ".server", server.computeOnServer(s -> s.overworld().getBlockState(at) + " | " + s.overworld().getFluidState(at)));
            r.put("DS.sync." + path + ".blockId", context.computeOnClient(m -> net.minecraft.world.level.block.Block.getId(m.level.getBlockState(at))));
        }
    }

    private void hold(ClientGameTestContext context, TestServerContext server, ItemStack stack) throws Throwable {
        server.runOnServer(s -> {
            ServerPlayer p = player(s);
            p.getInventory().setItem(p.getInventory().getSelectedSlot(), stack.copy());
            p.containerMenu.broadcastChanges();
        });
        context.waitTicks(5);
    }

    private void bucket(ClientGameTestContext context, TestServerContext server, TestServerConnection conn) throws Throwable {
        String[] fluids = {"spike_water", "spike_lava"};
        for (int i = 0; i < fluids.length; i++) {
            String path = fluids[i];
            String k = "DS.bucket." + path;
            int bx = 30 + i * 8;
            BlockPos src = new BlockPos(bx, Y + 0, 13);
            server.runOnServer(s -> {
                player(s).setGameMode(GameType.SURVIVAL);
                s.overworld().setBlock(src, Spike4Mod.BLOCKS.get(path).defaultBlockState(), 3);
            });
            tp(server, bx + 0.5, Y, 10.5, 0, 30);
            hold(context, server, new ItemStack(Items.BUCKET));
            context.getInput().lookAt(src);
            context.waitTicks(3);
            r.put(k + ".clientHit", context.computeOnClient(m -> String.valueOf(m.hitResult == null ? "null" : m.hitResult.getType()
                    + " " + m.hitResult.getLocation())));
            context.getInput().pressKey(o -> o.keyUse);
            context.waitTicks(10);
            r.put(k + ".fill.serverHand", server.computeOnServer(s -> player(s).getMainHandItem().toString()));
            r.put(k + ".fill.clientHand", context.computeOnClient(m -> m.player.getMainHandItem().toString()));
            r.put(k + ".fill.sourceAfter", server.computeOnServer(s -> s.overworld().getBlockState(src).toString()));
            context.waitTicks(60);
            BlockPos floor = new BlockPos(bx, Y - 1, 12);
            context.getInput().lookAt(floor);
            context.waitTicks(3);
            context.getInput().pressKey(o -> o.keyUse);
            context.waitTicks(10);
            r.put(k + ".empty.serverHand", server.computeOnServer(s -> player(s).getMainHandItem().toString()));
            r.put(k + ".empty.placed", server.computeOnServer(s -> s.overworld().getBlockState(floor.above()) + " | "
                    + s.overworld().getFluidState(floor.above())));
            r.put(k + ".empty.clientPlaced", context.computeOnClient(m -> m.level.getFluidState(floor.above()).toString()));
            server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
        }
    }
}
