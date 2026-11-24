package dev.mcsupermods.runtime.gametest;

import java.util.List;
import java.util.Locale;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.screens.inventory.ContainerScreen;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.BoneMealItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.ChestType;
import net.minecraft.world.level.material.Fluids;

/**
 * Client GameTest for the looks of vanilla parity 3, batch 1 (ADRs 0103 and 0104; B520), run by
 * {@code ./gradlew runClientGameTest [-Pmc=26.4]} (headless: see {@code MsmParticleClientGameTest}). In a singleplayer
 * world, on a stone pad, a row of the {@code msm/msm_test/} test definitions: a kelp-like strand in water
 * ({@code plant3_kelp} grown by bone meal on its {@code plant3_kelp_plant}), a cave-vine-like strand with ripe berries ({@code plant3_cave}
 * under a stone ceiling), a cactus-like column ({@code plant3_cactus}), a project pot holding a poppy
 * ({@code pot_listed_poppy}), a double chest ({@code storage2_double}, left and right) and a waterlogged crate
 * ({@code storage2_wet_crate}). The test definitions name no models, so {@code assets/msm_test/blockstates/} gives these
 * blocks vanilla's own models (kelp, cave vines lit, cactus, potted poppy; a plank cube for the chest and a barrel for
 * the crate), which the player's game supplies; nothing is bundled.
 *
 * <p>Checked on the client: every block of the row reached the client with its state (the berries, the chest halves'
 * {@code type}, the crate's water and the kelp's water as fluid states), the ripe strand gives block light 12 in the
 * client's own light engine, and the use key on the double chest opens one six-row {@link ContainerScreen}.
 *
 * <p>Screenshots, named per version ({@code <mc>} is the Minecraft version, such as {@code 26.3}) and kept in
 * {@code build/run/clientGameTest/screenshots/}: {@code msm_plants3_row_<mc>} (the row), {@code msm_plants3_double_chest_menu_<mc>}
 * (the six-row menu).
 */
public class MsmPlants3ClientGameTest implements FabricClientGameTest {
    private static final int Y = 100;
    private static final int ROW_Z = 3;
    private static final BlockPos KELP = new BlockPos(2, Y, ROW_Z);
    private static final BlockPos VINE = new BlockPos(5, Y + 1, ROW_Z);
    private static final BlockPos CACTUS = new BlockPos(8, Y, ROW_Z);
    private static final BlockPos POT = new BlockPos(10, Y, ROW_Z);
    private static final BlockPos CHEST_LEFT = new BlockPos(12, Y, ROW_Z);
    private static final BlockPos CHEST_RIGHT = new BlockPos(13, Y, ROW_Z);
    private static final BlockPos CRATE = new BlockPos(15, Y, ROW_Z);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        Block block = BuiltInRegistries.BLOCK.getValue(id(path));
        check(BuiltInRegistries.BLOCK.containsKey(id(path)), "block " + id(path) + " is not registered");
        return block;
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static ServerPlayer player(List<ServerPlayer> players) {
        return players.getFirst();
    }

    private static String version() {
        return FabricLoader.getInstance().getModContainer("minecraft").orElseThrow().getMetadata().getVersion().getFriendlyString()
                .replaceAll("[^A-Za-z0-9.]+", "_");
    }

    @Override
    public void runTest(ClientGameTestContext context) {
        String mc = version();
        try (TestSingleplayerContext world = context.worldBuilder().create()) {
            TestServerContext server = world.getServer();
            server.runCommand("time set noon");
            server.runCommand("weather clear");
            // No random ticks: the kelp-like tip would grow on into its tank while the client is checked.
            server.runCommand("gamerule random_tick_speed 0");
            server.runOnServer(s -> player(s.getPlayerList().getPlayers()).setGameMode(GameType.CREATIVE));
            build(server);
            stand(context, world, 8.5, Y, 9.5, 180f, 15f);
            synced(context);
            context.takeScreenshot("msm_plants3_row_" + mc);
            chest(context, world, mc);
        }
    }

    /** A stone pad at y 99 with air above, and the row on it. */
    private static void build(TestServerContext server) {
        server.runOnServer(s -> {
            ServerLevel level = s.overworld();
            for (int x = -2; x <= 18; x++) {
                for (int z = -2; z <= 12; z++) {
                    level.setBlock(new BlockPos(x, Y - 1, z), Blocks.STONE.defaultBlockState(), 2);
                    for (int y = Y; y <= Y + 6; y++) {
                        level.setBlock(new BlockPos(x, y, z), Blocks.AIR.defaultBlockState(), 2);
                    }
                }
            }
            // A glass tank three deep holding the kelp-like strand, water above its tip.
            for (int x = KELP.getX() - 1; x <= KELP.getX() + 1; x++) {
                for (int z = ROW_Z - 1; z <= ROW_Z + 1; z++) {
                    for (int y = Y; y <= Y + 2; y++) {
                        boolean inside = x == KELP.getX() && z == ROW_Z;
                        level.setBlock(new BlockPos(x, y, z), inside ? Blocks.WATER.defaultBlockState() : Blocks.GLASS.defaultBlockState(), 2);
                    }
                }
            }
            // The tip, grown one block by bone meal (as vanilla kelp): the strand below it, the tip above.
            level.setBlock(KELP, block("plant3_kelp").defaultBlockState(), 3);
            check(BoneMealItem.growCrop(new ItemStack(Items.BONE_MEAL), level, KELP), "bone meal on the kelp-like tip");
            check(level.getBlockState(KELP).is(block("plant3_kelp_plant")) && level.getBlockState(KELP.above()).is(block("plant3_kelp")),
                    "the server's kelp " + level.getBlockState(KELP) + " / " + level.getBlockState(KELP.above()));
            level.setBlock(VINE.above(), Blocks.STONE.defaultBlockState(), 2);
            level.setBlock(VINE, block("plant3_cave").defaultBlockState().setValue(BlockStateProperties.BERRIES, true), 3);
            // Sand falls: stone under it.
            level.setBlock(CACTUS.below(2), Blocks.STONE.defaultBlockState(), 2);
            level.setBlock(CACTUS.below(), Blocks.SAND.defaultBlockState(), 2);
            level.setBlock(CACTUS, block("plant3_cactus").defaultBlockState(), 2);
            level.setBlock(CACTUS.above(), block("plant3_cactus").defaultBlockState(), 2);
            level.setBlock(POT, block("pot_listed_poppy").defaultBlockState(), 2);
            BlockState chest = block("storage2_double").defaultBlockState().setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.SOUTH);
            level.setBlock(CHEST_LEFT, chest.setValue(BlockStateProperties.CHEST_TYPE, ChestType.RIGHT), 3);
            level.setBlock(CHEST_RIGHT, chest.setValue(BlockStateProperties.CHEST_TYPE, ChestType.LEFT), 3);
            level.setBlock(CRATE, block("storage2_wet_crate").defaultBlockState().setValue(BlockStateProperties.WATERLOGGED, true), 3);
        });
    }

    /** The player at {@code (x, y, z)} looking at {@code yaw}, {@code pitch}, flying, the world drawn, toasts cleared. */
    private static void stand(ClientGameTestContext context, TestSingleplayerContext world, double x, double y, double z, float yaw, float pitch) {
        TestServerContext server = world.getServer();
        server.runOnServer(s -> {
            ServerPlayer p = player(s.getPlayerList().getPlayers());
            p.getAbilities().flying = true;
            p.onUpdateAbilities();
        });
        server.runCommand(String.format(Locale.ROOT, "tp @a %.2f %.2f %.2f %.1f %.1f", x, y, z, yaw, pitch));
        context.waitTicks(10);
        context.getInput().lookAt(yaw, pitch);
        world.getConnection().waitForChunksRender();
        context.waitTicks(10);
        context.runOnClient(mc -> mc.gui.toastManager().clear());
    }

    /** The row reached the client with its states, the strand's light and the water. */
    private static void synced(ClientGameTestContext context) {
        context.waitFor(mc -> mc.level != null && mc.level.getBlockState(CRATE).is(block("storage2_wet_crate")), 100);
        context.runOnClient(mc -> {
            BlockState vine = mc.level.getBlockState(VINE);
            check(vine.is(block("plant3_cave")) && vine.getValue(BlockStateProperties.BERRIES), "the client's strand " + vine);
            check(mc.level.getBrightness(LightLayer.BLOCK, VINE) == 12, "block light at the ripe strand "
                    + mc.level.getBrightness(LightLayer.BLOCK, VINE));
            check(mc.level.getBlockState(KELP.above()).is(block("plant3_kelp")), "the client's kelp tip " + mc.level.getBlockState(KELP.above())
                    + " on " + mc.level.getBlockState(KELP));
            check(mc.level.getFluidState(KELP.above()).is(Fluids.WATER), "the client's kelp holds no water");
            check(mc.level.getBlockState(POT).is(block("pot_listed_poppy")), "the client's pot " + mc.level.getBlockState(POT));
            check(mc.level.getBlockState(CHEST_LEFT).getValue(BlockStateProperties.CHEST_TYPE) == ChestType.RIGHT
                    && mc.level.getBlockState(CHEST_RIGHT).getValue(BlockStateProperties.CHEST_TYPE) == ChestType.LEFT,
                    "the client's chest halves " + mc.level.getBlockState(CHEST_LEFT) + " / " + mc.level.getBlockState(CHEST_RIGHT));
            check(mc.level.getFluidState(CRATE).is(Fluids.WATER), "the client's crate holds no water: " + mc.level.getBlockState(CRATE));
        });
    }

    /** The use key on the double chest opens one six-row chest screen. */
    private static void chest(ClientGameTestContext context, TestSingleplayerContext world, String mc) {
        stand(context, world, 12.5, Y, ROW_Z + 3.5, 180f, 30f);
        context.getInput().lookAt(CHEST_LEFT);
        context.waitTicks(2);
        context.getInput().pressKey(o -> o.keyUse);
        context.waitForScreen(ContainerScreen.class);
        int rows = context.computeOnClient(client -> client.gui.screen() instanceof ContainerScreen screen ? screen.getMenu().getRowCount() : -1);
        check(rows == 6, "the double chest's screen has " + rows + " rows");
        context.waitTicks(5);
        context.takeScreenshot("msm_plants3_double_chest_menu_" + mc);
        context.runOnClient(client -> client.player.closeContainer());
        context.waitTicks(2);
    }
}
