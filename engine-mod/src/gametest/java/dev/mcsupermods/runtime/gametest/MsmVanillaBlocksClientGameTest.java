package dev.mcsupermods.runtime.gametest;

import com.mojang.blaze3d.platform.NativeImage;
import dev.mcsupermods.runtime.MsmRuntime;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotComparisonAlgorithm;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotComparisonOptions;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.InBedChatScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.client.gui.screens.inventory.SignEditScreen;
import net.minecraft.client.sounds.SoundEventListener;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.inventory.tooltip.BundleTooltip;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.SignBlockEntity;
import net.minecraft.world.level.block.entity.SignTextSlot;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;

/**
 * Client GameTest for the vanilla-parity blocks of batch 1 (ADR 0101 D6, B464) against a dedicated server made by
 * {@code createServer()}, on a flat stone pad round the player, with the {@code msm/msm_test/} test definitions:
 *
 * <ul>
 *   <li><b>Signs.</b> The player places {@code msm_test:furniture_sign} with the use key; the writing screen
 *       ({@code SignEditScreen}) opens on the client, the typed line is sent with Done and the dedicated server's sign
 *       holds it (B446 measured the text only through a mock player). Red dye and a glow ink sac, used with the use key,
 *       reach the server and come back to the client's sign; the red glowing text is found in a screenshot with
 *       {@code assertScreenshotContains}.</li>
 *   <li><b>Beds.</b> At midnight the use key on {@code msm_test:furniture_bed} opens the client's {@code InBedChatScreen},
 *       the server player sleeps at the head, Leave Bed wakes them and the bed is their spawn.</li>
 *   <li><b>Torches and lanterns.</b> The floor and wall torch ({@code furniture_torch}, {@code furniture_torch_wall}) give
 *       block light 14 and the standing and hanging lantern 15 in the client's own light engine.</li>
 *   <li><b>Bundle.</b> {@code msm_test:bag_bundle} holding diamonds and apples has vanilla's bundle tooltip; the
 *       inventory screen is shot with the cursor on it.</li>
 *   <li><b>Wax.</b> Honeycomb on {@code msm_test:weathering_tin} with the use key: the server waxes it and uses the
 *       honeycomb. The waxing player's own client shows level event 3003 (B449's open check): its particles appear for
 *       project tin as for vanilla copper, the control (B464a: the server sends 3003 with no source; see {@link #wax}).</li>
 * </ul>
 *
 * <p>Screenshots (kept in {@code build/run/clientGameTest/screenshots/}): {@code msm_vanilla_sign}, {@code msm_vanilla_bed},
 * {@code msm_vanilla_lights}, {@code msm_vanilla_bundle_tooltip}. The test definitions have no models, so the blocks
 * are drawn as the missing model; the sign's text, the bed screen, the light and the tooltip are what is checked.
 */
public class MsmVanillaBlocksClientGameTest implements FabricClientGameTest {
    /** The glowing red sign text as Mesa's software renderer draws it (measured, B464), ABGR for {@code NativeImage}. */
    private static final int GLOWING_RED_TEXT_ABGR = 0xFF0000FF;
    private static final Identifier WAX_ON = Identifier.withDefaultNamespace("item.honeycomb.wax_on");

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static ServerPlayer player(MinecraftServer server) {
        return server.getPlayerList().getPlayers().getFirst();
    }

    /** The middle of the pad (the block the player stands in). */
    private static BlockPos centre;

    @Override
    public void runTest(ClientGameTestContext context) {
        Sounds sounds = new Sounds();
        try (TestDedicatedServerContext server = context.worldBuilder().createServer()) {
            try (TestDedicatedServerConnection connection = server.connect()) {
                // Set directly, not by command: a command's chat line would cover the screenshots.
                server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
                server.runCommand("time set noon");
                server.runCommand("weather clear");
                pad(server);
                connection.waitForChunksRender();
                context.waitTicks(10);
                context.runOnClient(mc -> {
                    mc.gui.toastManager().clear();
                    mc.getSoundManager().addListener(sounds);
                });
                try {
                    sign(context, server, connection);
                    wax(context, server, sounds);
                    lights(context, server, connection);
                    bed(context, server);
                    bundle(context, server);
                } finally {
                    context.runOnClient(mc -> mc.getSoundManager().removeListener(sounds));
                }
            }
        }
    }

    /** A flat stone pad 21 by 21 with air above it, the player in its middle facing south. */
    private static void pad(TestDedicatedServerContext server) {
        centre = server.computeOnServer(s -> {
            ServerPlayer p = player(s);
            BlockPos at = p.blockPosition();
            for (int x = -10; x <= 10; x++) {
                for (int z = -10; z <= 10; z++) {
                    p.level().setBlock(at.offset(x, -1, z), Blocks.STONE.defaultBlockState(), Block.UPDATE_ALL);
                    for (int y = 0; y <= 5; y++) {
                        p.level().setBlock(at.offset(x, y, z), Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
                    }
                }
            }
            return at;
        });
        teleport(server, centre, 0, 0);
    }

    private static void teleport(TestDedicatedServerContext server, BlockPos at, float yaw, float pitch) {
        server.runOnServer(s -> player(s).connection.teleport(at.getX() + 0.5, at.getY(), at.getZ() + 0.5, yaw, pitch));
    }

    private static void hold(ClientGameTestContext context, TestDedicatedServerContext server, ItemStack stack) {
        server.runOnServer(s -> {
            ServerPlayer p = player(s);
            p.getInventory().setSelectedSlot(0);
            p.getInventory().setItem(0, stack.copy());
            p.inventoryMenu.broadcastChanges();
        });
        context.waitFor(mc -> mc.player != null && mc.player.getInventory().getSelectedItem().is(stack.getItem()), 100);
    }

    private static void setBlock(TestDedicatedServerContext server, BlockPos at, BlockState state) {
        server.runOnServer(s -> player(s).level().setBlock(at, state, Block.UPDATE_ALL));
    }

    /** The player looks at {@code at} and presses the use key once. */
    private static void use(ClientGameTestContext context, BlockPos at) {
        context.getInput().lookAt(at);
        context.waitTicks(2);
        context.getInput().pressKey(o -> o.keyUse);
        context.waitTicks(2);
    }

    // Signs

    private static void sign(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos floor = centre.offset(0, -1, 2);
        BlockPos at = floor.above();
        hold(context, server, new ItemStack(item("furniture_sign")));
        use(context, floor);
        context.waitForScreen(SignEditScreen.class);
        context.getInput().typeChars("WWWWW");
        context.clickScreenButton("gui.done");
        server.waitFor(s -> player(s).level().getBlockEntity(at) instanceof SignBlockEntity sign
                && sign.getText(SignTextSlot.FRONT).getMessages(false).get(0).getString().equals("WWWWW"), 100);
        check(server.computeOnServer(s -> player(s).level().getBlockState(at).is(block("furniture_sign"))), "no project sign on the server");
        hold(context, server, new ItemStack(Items.DYE.red()));
        use(context, at);
        server.waitFor(s -> player(s).level().getBlockEntity(at) instanceof SignBlockEntity sign
                && sign.getText(SignTextSlot.FRONT).getColor() == DyeColor.RED, 100);
        hold(context, server, new ItemStack(Items.GLOW_INK_SAC));
        use(context, at);
        server.waitFor(s -> player(s).level().getBlockEntity(at) instanceof SignBlockEntity sign
                && sign.getText(SignTextSlot.FRONT).hasGlowingText(), 100);
        context.waitFor(mc -> mc.level.getBlockEntity(at) instanceof SignBlockEntity sign
                && sign.getText(SignTextSlot.FRONT).getColor() == DyeColor.RED && sign.getText(SignTextSlot.FRONT).hasGlowingText()
                && sign.getText(SignTextSlot.FRONT).getMessages(false).get(0).getString().equals("WWWWW"), 100);
        hold(context, server, ItemStack.EMPTY);
        // Close up, facing the board, at noon.
        teleport(server, centre.offset(0, 0, 1), 0, 0);
        context.waitTicks(5);
        context.getInput().lookAt(at.above());
        context.getInput().lookAt(at);
        connection.waitForChunksRender();
        context.waitTicks(5);
        clearToasts(context);
        Path shot = context.takeScreenshot("msm_vanilla_sign");
        check(shot.toFile().isFile(), "no sign screenshot");
        NativeImage red = new NativeImage(2, 2, false);
        for (int x = 0; x < 2; x++) {
            for (int y = 0; y < 2; y++) {
                red.setPixelABGR(x, y, GLOWING_RED_TEXT_ABGR);
            }
        }
        context.assertScreenshotContains(TestScreenshotComparisonOptions.of(red)
                .withAlgorithm(TestScreenshotComparisonAlgorithm.meanSquaredDifference(0.01f))
                .saveWithFileName("msm_vanilla_sign_text_colour"));
        teleport(server, centre, 0, 0);
    }

    // Wax

    /** Records the sounds the client plays (subtitle listeners are told of every sound played). */
    private static final class Sounds implements SoundEventListener {
        final List<Identifier> played = new CopyOnWriteArrayList<>();

        @Override
        public void onPlaySound(net.minecraft.client.resources.sounds.SoundInstance sound, net.minecraft.client.sounds.WeighedSoundEvents events,
                float range) {
            played.add(sound.getIdentifier());
        }
    }

    /** Ticks after the use in which the particles are counted: the server's level event takes a round trip. */
    private static final int PARTICLE_TICKS = 10;

    /**
     * Waxes {@code from} at {@code at} with honeycomb by the use key, in survival; checks the server waxed it into
     * {@code into} and used one honeycomb; returns the most particles the client had beyond the count before the use in
     * the {@value #PARTICLE_TICKS} ticks after it (vanilla copper's appear at once, as the client predicts the use;
     * project tin's come with the server's level event).
     */
    private static int waxParticles(ClientGameTestContext context, TestDedicatedServerContext server, BlockPos at, Block from, Block into) {
        setBlock(server, at, from.defaultBlockState());
        context.waitFor(mc -> mc.level.getBlockState(at).is(from), 100);
        hold(context, server, new ItemStack(Items.HONEYCOMB, 4));
        context.waitTicks(3);
        int before = particles(context);
        use(context, at);
        int most = particles(context) - before;
        for (int tick = 0; tick < PARTICLE_TICKS; tick++) {
            context.waitTick();
            most = Math.max(most, particles(context) - before);
        }
        server.waitFor(s -> player(s).level().getBlockState(at).is(into), 100);
        context.waitFor(mc -> mc.level.getBlockState(at).is(into), 100);
        check(server.computeOnServer(s -> player(s).getMainHandItem().getCount()) == 3, from + ": the honeycomb was not used up");
        return most;
    }

    /**
     * Honeycomb on project tin and, as the control, on vanilla copper. The server waxes both. The client's own wax-on
     * effect (level event 3003: the sound and the wax particles) is measured by its particles, as the headless client has
     * no sound device: vanilla copper shows them at once (the client predicts the use), project tin when the server's
     * level event arrives. Asserted since B464a: the server sends 3003 with no source, so the player who waxed gets it
     * too (B464 found it went to everyone but that player).
     */
    private static void wax(ClientGameTestContext context, TestDedicatedServerContext server, Sounds sounds) {
        server.runOnServer(s -> player(s).setGameMode(GameType.SURVIVAL));
        sounds.played.clear();
        int tin = waxParticles(context, server, centre.offset(2, 0, 2), block("weathering_tin"), block("weathering_waxed_tin"));
        int copper = waxParticles(context, server, centre.offset(-2, 0, 2), Blocks.COPPER_BLOCK.weathering().unaffected(),
                Blocks.COPPER_BLOCK.waxed().unaffected());
        MsmRuntime.LOGGER.info("[{}] wax-on seen by the waxing player's client: project tin {} particle(s), vanilla copper {} "
                + "particle(s); sounds played {}", MsmRuntime.MOD_ID, tin, copper, sounds.played);
        check(copper > 0, "the control failed: waxing vanilla copper showed no particles on the client");
        check(tin > 0, "waxing project tin showed no particles on the waxing player's client (level event 3003)");
        if (!sounds.played.isEmpty()) {
            check(sounds.played.contains(WAX_ON), "the client played " + sounds.played + ", not " + WAX_ON);
        }
        server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
        hold(context, server, ItemStack.EMPTY);
    }

    /** The client's particle count (the number the debug screen shows). */
    private static int particles(ClientGameTestContext context) {
        return context.computeOnClient(mc -> Integer.parseInt(mc.particleEngine.countParticles().replaceAll("[^0-9]", "")));
    }

    /** Clears the toasts (new recipes, advancements) so they do not cover a screenshot. */
    private static void clearToasts(ClientGameTestContext context) {
        context.runOnClient(mc -> mc.gui.toastManager().clear());
        context.waitTick();
    }

    // Torches and lanterns

    private static void lights(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos torch = centre.offset(-3, 0, 3);
        BlockPos wall = centre.offset(-2, 1, 4);
        BlockPos wallTorch = wall.north();
        BlockPos lantern = centre.offset(-4, 0, 3);
        BlockPos ceiling = centre.offset(-5, 2, 3);
        BlockPos hanging = ceiling.below();
        setBlock(server, wall, Blocks.STONE.defaultBlockState());
        setBlock(server, ceiling, Blocks.STONE.defaultBlockState());
        setBlock(server, torch, block("furniture_torch").defaultBlockState());
        setBlock(server, wallTorch, block("furniture_torch_wall").defaultBlockState().setValue(BlockStateProperties.HORIZONTAL_FACING,
                Direction.NORTH));
        setBlock(server, lantern, block("furniture_lantern").defaultBlockState());
        setBlock(server, hanging, block("furniture_lantern").defaultBlockState().setValue(BlockStateProperties.HANGING, true));
        server.runCommand("time set midnight");
        context.waitFor(mc -> mc.level.getBlockState(hanging).is(block("furniture_lantern"))
                && mc.level.getBlockState(wallTorch).is(block("furniture_torch_wall")), 100);
        int[][] expected = {{14}, {14}, {15}, {15}};
        List<BlockPos> where = List.of(torch, wallTorch, lantern, hanging);
        context.waitFor(mc -> {
            for (int k = 0; k < where.size(); k++) {
                if (mc.level.getBrightness(LightLayer.BLOCK, where.get(k)) != expected[k][0]) {
                    return false;
                }
            }
            return true;
        }, 200);
        teleport(server, centre.offset(0, 0, -1), 0, 0);
        connection.waitForChunksRender();
        context.getInput().lookAt(lantern);
        context.waitTicks(10);
        clearToasts(context);
        check(context.takeScreenshot("msm_vanilla_lights").toFile().isFile(), "no lights screenshot");
        teleport(server, centre, 0, 0);
    }

    // Bed

    private static void bed(ClientGameTestContext context, TestDedicatedServerContext server) {
        BlockPos foot = centre.offset(3, 0, 0);
        BlockPos head = foot.south();
        BlockState state = block("furniture_bed").defaultBlockState().setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.SOUTH);
        setBlock(server, foot, state.setValue(BlockStateProperties.BED_PART, BedPart.FOOT));
        setBlock(server, head, state.setValue(BlockStateProperties.BED_PART, BedPart.HEAD));
        server.runOnServer(s -> player(s).setGameMode(GameType.SURVIVAL));
        teleport(server, centre.offset(2, 0, 1), 0, 0);
        context.waitFor(mc -> mc.level.getBlockState(head).is(block("furniture_bed")), 100);
        context.waitTicks(5);
        use(context, head);
        context.waitForScreen(InBedChatScreen.class);
        server.waitFor(s -> player(s).isSleeping(), 100);
        check(server.computeOnServer(s -> player(s).getSleepingPos().map(head::equals).orElse(false)), "not sleeping at the head");
        context.waitTicks(10);
        clearToasts(context);
        check(context.takeScreenshot("msm_vanilla_bed").toFile().isFile(), "no bed screenshot");
        context.clickScreenButton("multiplayer.stopSleeping");
        server.waitFor(s -> !player(s).isSleeping(), 100);
        check(server.computeOnServer(s -> player(s).getRespawnConfig() != null
                && player(s).getRespawnConfig().respawnData().pos().equals(head)), "the bed is not the spawn");
        context.waitFor(mc -> mc.gui.screen() == null, 100);
        server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
        server.runCommand("time set noon");
        teleport(server, centre, 0, 0);
    }

    // Bundle

    private static void bundle(ClientGameTestContext context, TestDedicatedServerContext server) {
        ItemStack bundle = new ItemStack(item("bag_bundle"));
        BundleContents.Mutable contents = new BundleContents.Mutable();
        contents.tryInsert(new ItemStack(Items.DIAMOND, 3));
        contents.tryInsert(new ItemStack(Items.APPLE, 5));
        bundle.set(DataComponents.BUNDLE_CONTENTS, contents.toImmutable());
        server.runOnServer(s -> player(s).setGameMode(GameType.SURVIVAL));
        hold(context, server, bundle);
        context.waitFor(mc -> mc.player.getInventory().getSelectedItem().has(DataComponents.BUNDLE_CONTENTS), 100);
        check(context.computeOnClient(mc -> mc.player.getInventory().getSelectedItem().getTooltipImage()
                .map(t -> t instanceof BundleTooltip).orElse(false)), "the bundle has no bundle tooltip on the client");
        context.setScreen(() -> new InventoryScreen(Minecraft.getInstance().player));
        context.waitForScreen(InventoryScreen.class);
        // Hotbar slot 0 of the 176 by 166 inventory screen is at (8, 142); the cursor goes to its middle.
        double[] cursor = context.computeOnClient(mc -> {
            int scale = mc.getWindow().getGuiScale();
            int left = (mc.getWindow().getGuiScaledWidth() - 176) / 2;
            int top = (mc.getWindow().getGuiScaledHeight() - 166) / 2;
            return new double[] {(left + 16) * (double) scale, (top + 150) * (double) scale};
        });
        context.getInput().setCursorPos(cursor[0], cursor[1]);
        context.waitTicks(5);
        clearToasts(context);
        check(context.takeScreenshot("msm_vanilla_bundle_tooltip").toFile().isFile(), "no bundle screenshot");
        context.setScreen(() -> null);
        server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
    }
}
