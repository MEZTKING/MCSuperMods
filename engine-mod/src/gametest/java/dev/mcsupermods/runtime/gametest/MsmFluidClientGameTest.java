package dev.mcsupermods.runtime.gametest;

import com.mojang.blaze3d.platform.NativeImage;
import dev.mcsupermods.runtime.client.fluid.FluidClient;
import dev.mcsupermods.runtime.registry.fluid.MsmFluids;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotComparisonAlgorithm;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotComparisonOptions;
import net.fabricmc.fabric.api.client.render.fluid.v1.FluidRenderingRegistry;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Client GameTest for drawing project fluids (ADR 0099 D2 and the amendment after B470), run by
 * {@code ./gradlew runClientGameTest [-Pmc=26.4]} (headless: see {@code MsmParticleClientGameTest}). In a singleplayer
 * world it checks that every test fluid has a renderer for its still and flowing fluid and the pictures of its block
 * model ({@code fluid_custom}'s model names no pictures, so it falls back to vanilla's water pictures), then:
 *
 * <ul>
 *   <li>still: a walled pool of each fluid seen from above; the screenshot holds the picture's colour times the
 *       definition's plain RGB tint ({@code fluid_water}: white times {@code 0x22CC44}; {@code fluid_lava}: orange, no
 *       tint; {@code fluid_plain}: grey times yellow). The test pictures are opaque, so the colour is exact;
 *   <li>flowing: a lava-like and a water-like source on open ground, seen from above once they have spread; the
 *       screenshot holds the flowing picture's colour ({@code fluid_lava_flow} purple, {@code fluid_water_flow} grey
 *       times the tint).
 * </ul>
 *
 * <p>The screenshots ({@code msm_fluid_still_<fluid>}, {@code msm_fluid_flowing}) land in
 * {@code build/run/clientGameTest/screenshots/}; they are the still and flowing pictures the Try it preview follows.
 */
public class MsmFluidClientGameTest implements FabricClientGameTest {
    private static final int Y = 100;
    /** The pools, west to east, 14 blocks apart. */
    private static final List<String> POOLS = List.of("fluid_water", "fluid_lava", "fluid_plain", "fluid_custom");
    /** Where the flowing check happens: open stone ground east of the pools. */
    private static final int FLOW_X = 80;

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static MsmFluids.Entry entry(String path) {
        return MsmFluids.get(id(path)).orElseThrow(() -> new AssertionError("fluid " + id(path) + " is not registered"));
    }

    private static int x0(int i) {
        return i * 14;
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    @Override
    public void runTest(ClientGameTestContext context) {
        renderers();
        try (TestSingleplayerContext world = context.worldBuilder().create()) {
            TestServerContext server = world.getServer();
            server.runCommand("time set noon");
            server.runCommand("weather clear");
            server.runOnServer(s -> player(s.getPlayerList().getPlayers()).setGameMode(GameType.CREATIVE));
            build(server);
            world.getConnection().waitForChunksRender();
            for (int i = 0; i < POOLS.size(); i++) {
                still(context, world, i);
            }
            flowing(context, world);
        }
    }

    private static ServerPlayer player(List<ServerPlayer> players) {
        return players.getFirst();
    }

    /** Every fluid has a render handler for both of its fluids, made from its model's pictures. */
    private static void renderers() {
        Map<Identifier, FluidClient.Pictures> pictures = FluidClient.pictures();
        for (String path : POOLS) {
            MsmFluids.Fluids fluids = entry(path).fluids();
            check(FluidRenderingRegistry.get(fluids.still()) != null, path + " still fluid has no renderer");
            check(FluidRenderingRegistry.get(fluids.flowing()) != null, path + " flowing fluid has no renderer");
            check(pictures.containsKey(id(path)), path + " has no pictures: " + pictures);
        }
        check(pictures.get(id("fluid_water")).equals(new FluidClient.Pictures(id("block/fluid_water_still"), id("block/fluid_water_flow"),
                id("block/fluid_water_overlay"))), "water-like pictures " + pictures.get(id("fluid_water")));
        check(pictures.get(id("fluid_lava")).overlay() == null, "lava-like overlay " + pictures.get(id("fluid_lava")));
        check(pictures.get(id("fluid_custom")).equals(new FluidClient.Pictures(Identifier.withDefaultNamespace("block/water_still"),
                Identifier.withDefaultNamespace("block/water_flow"), null)), "fallback pictures " + pictures.get(id("fluid_custom")));
    }

    /** A stone floor at y 99 with air above, one walled pool three deep per fluid, and open ground for the flow. */
    private static void build(TestServerContext server) {
        server.runOnServer(s -> {
            ServerLevel level = s.overworld();
            for (int x = -6; x <= FLOW_X + 24; x++) {
                for (int z = -12; z <= 16; z++) {
                    level.setBlock(new BlockPos(x, Y - 1, z), Blocks.STONE.defaultBlockState(), 2);
                    for (int y = Y; y <= Y + 25; y++) {
                        level.setBlock(new BlockPos(x, y, z), Blocks.AIR.defaultBlockState(), 2);
                    }
                }
            }
        });
        server.runOnServer(s -> {
            ServerLevel level = s.overworld();
            for (int i = 0; i < POOLS.size(); i++) {
                BlockState fill = entry(POOLS.get(i)).block().defaultBlockState();
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
    }

    private static void fly(TestServerContext server) {
        server.runOnServer(s -> {
            ServerPlayer p = player(s.getPlayerList().getPlayers());
            p.getAbilities().flying = true;
            p.onUpdateAbilities();
        });
    }

    /** Above {@code (x, z)} looking straight down, the world drawn, toasts cleared. */
    private static void lookDown(ClientGameTestContext context, TestSingleplayerContext world, double x, double y, double z) {
        TestServerContext server = world.getServer();
        fly(server);
        server.runCommand(String.format(Locale.ROOT, "tp @a %.2f %.2f %.2f 0 90", x, y, z));
        fly(server);
        context.waitTicks(10);
        context.getInput().lookAt(0, 90);
        world.getConnection().waitForChunksRender();
        context.waitTicks(10);
        context.runOnClient(mc -> mc.gui.toastManager().clear());
    }

    private static NativeImage solid(int r, int g, int b) {
        NativeImage image = new NativeImage(2, 2, false);
        for (int x = 0; x < 2; x++) {
            for (int y = 0; y < 2; y++) {
                image.setPixelABGR(x, y, 0xFF000000 | (b << 16) | (g << 8) | r);
            }
        }
        return image;
    }

    /** The screenshot holds a 2 by 2 patch of the colour {@code rgb} (each channel 0..255). */
    private static void assertColour(ClientGameTestContext context, String name, int[] rgb) {
        context.assertScreenshotContains(TestScreenshotComparisonOptions.of(solid(rgb[0], rgb[1], rgb[2]))
                .withAlgorithm(TestScreenshotComparisonAlgorithm.meanSquaredDifference(0.01f)).saveWithFileName(name));
    }

    /** A picture's colour times a tint, as the game multiplies them. */
    private static int[] tinted(int[] picture, int tint) {
        return new int[] {picture[0] * ((tint >> 16) & 255) / 255, picture[1] * ((tint >> 8) & 255) / 255, picture[2] * (tint & 255) / 255};
    }

    private static void still(ClientGameTestContext context, TestSingleplayerContext world, int i) {
        String path = POOLS.get(i);
        lookDown(context, world, x0(i) + 4.5, Y + 6, 4.5);
        BlockPos at = new BlockPos(x0(i) + 4, Y + 2, 4);
        boolean ours = context.computeOnClient(mc -> {
            var type = mc.level.getFluidState(at).getType();
            return type == entry(path).fluids().still() || type == entry(path).fluids().flowing();
        });
        check(ours, path + ": the client has no " + path + " at " + at);
        context.takeScreenshot("msm_fluid_still_" + path);
        int[] expected = switch (path) {
            case "fluid_water" -> tinted(new int[] {255, 255, 255}, entry(path).definition().tint().orElseThrow());
            case "fluid_lava" -> new int[] {255, 120, 0};
            case "fluid_plain" -> tinted(new int[] {200, 200, 200}, entry(path).definition().tint().orElseThrow());
            default -> null; // fluid_custom: vanilla's water pictures from the player's game, untinted; not compared
        };
        if (expected != null) {
            assertColour(context, "msm_fluid_still_tint_" + path, expected);
        }
    }

    /** A lava-like and a water-like source on open ground, spread out, seen from above: the flowing pictures. */
    private static void flowing(ClientGameTestContext context, TestSingleplayerContext world) {
        world.getServer().runOnServer(s -> {
            ServerLevel level = s.overworld();
            level.setBlock(new BlockPos(FLOW_X, Y, 0), entry("fluid_lava").block().defaultBlockState(), 3);
            level.setBlock(new BlockPos(FLOW_X + 14, Y, 0), entry("fluid_water").block().defaultBlockState(), 3);
        });
        // Lava-like spreads three blocks in 90 ticks (tick_delay 30), water-like seven in 35.
        context.waitTicks(130);
        BlockPos edge = new BlockPos(FLOW_X + 2, Y, 0);
        boolean flowingThere = context.computeOnClient(mc -> {
            var state = mc.level.getFluidState(edge);
            return state.getType() == entry("fluid_lava").fluids().flowing() && !state.isSource();
        });
        check(flowingThere, "the client has no flowing lava-like fluid at " + edge);
        lookDown(context, world, FLOW_X + 7.5, Y + 9, 0.5);
        context.takeScreenshot("msm_fluid_flowing");
        assertColour(context, "msm_fluid_flowing_lava", new int[] {120, 0, 255});
        assertColour(context, "msm_fluid_flowing_water", tinted(new int[] {128, 128, 128}, entry("fluid_water").definition().tint().orElseThrow()));
    }
}
