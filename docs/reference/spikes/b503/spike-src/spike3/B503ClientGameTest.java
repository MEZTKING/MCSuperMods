package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Mod.b;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.minecraft.client.sounds.SoundEventListener;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CaveVines;
import net.minecraft.world.level.block.MultifaceBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.ChestType;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

/**
 * B503 spike (throwaway) client GameTest on a dedicated server ({@code createServer()}, headless Mesa EGL): screenshots
 * of the plants, the pots, a waterlogged container and a double chest drawn from block models; the client light of the
 * cave vines and lichen; the sounds the client plays for a block with its own sounds (place, break, step).
 */
public class B503ClientGameTest implements FabricClientGameTest {
    static final B503Results R = B503Results.CLIENT;

    private static ServerPlayer player(MinecraftServer server) {
        return server.getPlayerList().getPlayers().getFirst();
    }

    private static final class Sounds implements SoundEventListener {
        final List<Identifier> played = new CopyOnWriteArrayList<>();

        @Override
        public void onPlaySound(net.minecraft.client.resources.sounds.SoundInstance sound, net.minecraft.client.sounds.WeighedSoundEvents events,
                float range) {
            played.add(sound.getIdentifier());
        }

        List<String> take() {
            List<String> out = new ArrayList<>();
            for (Identifier id : played) {
                out.add(id.toString());
            }
            played.clear();
            return out;
        }
    }

    static void set(TestDedicatedServerContext server, BlockPos at, BlockState state) {
        server.runOnServer(s -> player(s).level().setBlock(at, state, Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE));
    }

    static void set(TestDedicatedServerContext server, BlockPos at, Block block) {
        set(server, at, block.defaultBlockState());
    }

    static BlockPos pad(TestDedicatedServerContext server, int dx) {
        return server.computeOnServer(s -> {
            ServerPlayer p = player(s);
            BlockPos at = p.blockPosition().offset(dx, 0, 0);
            for (int x = -16; x <= 16; x++) {
                for (int z = -16; z <= 16; z++) {
                    p.level().setBlock(at.offset(x, -1, z), Blocks.STONE.defaultBlockState(), Block.UPDATE_CLIENTS);
                    for (int y = 0; y <= 6; y++) {
                        p.level().setBlock(at.offset(x, y, z), Blocks.AIR.defaultBlockState(), Block.UPDATE_CLIENTS);
                    }
                }
            }
            return at;
        });
    }

    static void teleport(TestDedicatedServerContext server, BlockPos at, float yaw, float pitch) {
        server.runOnServer(s -> player(s).connection.teleport(at.getX() + 0.5, at.getY(), at.getZ() + 0.5, yaw, pitch));
    }

    static String shot(ClientGameTestContext context, TestDedicatedServerConnection connection, String name) {
        connection.waitForChunksRender();
        context.waitTicks(20);
        context.runOnClient(mc -> mc.gui.toastManager().clear());
        context.waitTick();
        String file = name + "_" + B503Results.mc();
        return context.takeScreenshot(file).toString();
    }

    @Override
    public void runTest(ClientGameTestContext context) {
        Sounds sounds = new Sounds();
        try (TestDedicatedServerContext server = context.worldBuilder().createServer()) {
            try (TestDedicatedServerConnection connection = server.connect()) {
                server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
                server.runCommand("time set noon");
                server.runCommand("weather clear");
                server.runCommand("gamerule randomTickSpeed 0");
                context.runOnClient(mc -> mc.getSoundManager().addListener(sounds));
                try {
                    R.section("client.plants", () -> plants(context, server, connection));
                    R.section("client.pots", () -> pots(context, server, connection));
                    R.section("client.chests", () -> chests(context, server, connection));
                    R.section("client.sounds", () -> sounds(context, server, connection, sounds));
                } finally {
                    context.runOnClient(mc -> mc.getSoundManager().removeListener(sounds));
                }
            }
        }
    }

    private static void plants(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos c = pad(server, 0);
        int z = 6;
        // Kelp in a glass tank.
        BlockPos k = c.offset(-6, 0, z);
        for (int y = 0; y <= 3; y++) {
            for (Direction d : Direction.Plane.HORIZONTAL) {
                set(server, k.offset(0, y, 0).relative(d), Blocks.GLASS);
            }
        }
        set(server, k, b("kelp_plant"));
        set(server, k.above(), b("kelp_plant"));
        set(server, k.above(2), b("kelp"));
        set(server, k.above(3), Blocks.WATER);
        // Weeping vines from a stone ceiling, twisting vines from the floor.
        BlockPos w = c.offset(-4, 0, z);
        set(server, w.above(3), Blocks.STONE);
        set(server, w.above(2), b("weeping_plant"));
        set(server, w.above(1), b("weeping_plant"));
        set(server, w, b("weeping"));
        BlockPos t = c.offset(-2, 0, z);
        set(server, t, b("twisting_plant"));
        set(server, t.above(), b("twisting_plant"));
        set(server, t.above(2), b("twisting"));
        // Cave vines with berries.
        BlockPos v = c.offset(0, 0, z);
        set(server, v.above(3), Blocks.STONE);
        set(server, v.above(2), b("cave_plant").defaultBlockState().setValue(CaveVines.BERRIES, true));
        set(server, v.above(1), b("cave").defaultBlockState().setValue(CaveVines.BERRIES, true));
        // Sugar cane on sand by water, cactus on sand, bamboo on dirt.
        BlockPos s = c.offset(2, 0, z);
        set(server, s.below(), Blocks.SAND);
        set(server, s.below().east(), Blocks.WATER);
        for (int y = 0; y < 3; y++) {
            set(server, s.above(y), b("cane_naked"));
        }
        BlockPos k2 = c.offset(5, 0, z);
        set(server, k2.below(), Blocks.SAND);
        set(server, k2, b("cactus_naked"));
        set(server, k2.above(), b("cactus_naked"));
        BlockPos bb = c.offset(7, 0, z);
        set(server, bb.below(), Blocks.DIRT);
        set(server, bb, b("shoot"));
        for (int y = 1; y < 4; y++) {
            set(server, bb.above(y), b("bamboo_naked"));
        }
        // Dripleaf: stem and leaf, the small one; lichen on a stone wall.
        BlockPos d = c.offset(9, 0, z);
        set(server, d.below(), Blocks.CLAY);
        set(server, d, b("leaf_stem_naked"));
        set(server, d.above(), b("big_leaf_naked"));
        BlockPos sd = c.offset(11, 0, z);
        set(server, sd.below(), Blocks.CLAY);
        BlockState lower = b("small_leaf_naked").defaultBlockState().setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.LOWER);
        set(server, sd, lower);
        set(server, sd.above(), lower.setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.UPPER));
        BlockPos l = c.offset(13, 0, z + 1);
        set(server, l, Blocks.STONE);
        set(server, l.above(), Blocks.STONE);
        set(server, l.north(), b("lichen_naked").defaultBlockState().setValue(MultifaceBlock.getFaceProperty(Direction.SOUTH), true));
        set(server, l.above().north(), b("lichen_naked").defaultBlockState().setValue(MultifaceBlock.getFaceProperty(Direction.SOUTH), true));
        teleport(server, c.offset(3, 1, -6), 0f, 12f);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("screenshot", shot(context, connection, "b503_plants"));
        BlockPos cave = v.above(1);
        BlockPos lichen = l.north();
        m.put("clientBlockLight.caveVinesWithBerries", context.computeOnClient(mc -> mc.level.getBrightness(LightLayer.BLOCK, cave)));
        m.put("clientBlockLight.lichen", context.computeOnClient(mc -> mc.level.getBrightness(LightLayer.BLOCK, lichen)));
        m.put("clientStates", context.computeOnClient(mc -> {
            List<String> out = new ArrayList<>();
            for (BlockPos p : List.of(k, k.above(2), w, t.above(2), cave, s, k2, bb, bb.above(), d.above(), sd, lichen)) {
                out.add(B503Help.name(mc.level.getBlockState(p)));
            }
            return out;
        }));
        R.put("client.plants", m);
    }

    private static void pots(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos c = pad(server, 40);
        set(server, c.offset(-2, 0, 3), b("vpot_flower"));
        set(server, c.offset(-1, 0, 3), Blocks.POTTED_POPPY);
        set(server, c.offset(0, 0, 3), b("own_pot"));
        set(server, c.offset(1, 0, 3), b("own_pot_poppy"));
        set(server, c.offset(2, 0, 3), b("own_pot_flower"));
        set(server, c.offset(3, 0, 3), b("pot_poppy"));
        teleport(server, c.offset(0, 1, 0), 0f, 30f);
        R.put("client.pots", Map.of("screenshot", shot(context, connection, "b503_pots"),
                "order", "vanilla pot + project flower, vanilla potted poppy, own pot, own pot + poppy, own pot + project flower, FlowerPotBlock(poppy) project"));
    }

    private static void chests(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection) {
        BlockPos c = pad(server, 80);
        // A glass pool with a waterlogged project container in it.
        BlockPos pool = c.offset(-2, 0, 4);
        for (int x = -1; x <= 1; x++) {
            set(server, pool.offset(x, 0, -1), Blocks.GLASS);
            set(server, pool.offset(x, 0, 1), Blocks.GLASS);
        }
        set(server, pool.offset(-1, 0, 0), Blocks.GLASS);
        set(server, pool.offset(1, 0, 0), Blocks.GLASS);
        set(server, pool, b("wet_chest").defaultBlockState().setValue(BlockStateProperties.WATERLOGGED, true));
        BlockPos left = c.offset(2, 0, 4);
        BlockState chest = b("double_chest").defaultBlockState().setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.NORTH);
        set(server, left, chest.setValue(BlockStateProperties.CHEST_TYPE, ChestType.LEFT));
        set(server, left.east(), chest.setValue(BlockStateProperties.CHEST_TYPE, ChestType.RIGHT));
        set(server, c.offset(5, 0, 4), chest);
        teleport(server, c.offset(1, 1, 0), 0f, 25f);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("screenshot", shot(context, connection, "b503_chests"));
        m.put("clientStates", context.computeOnClient(mc -> List.of(B503Help.name(mc.level.getBlockState(pool)),
                String.valueOf(mc.level.getFluidState(pool)), B503Help.name(mc.level.getBlockState(left)),
                B503Help.name(mc.level.getBlockState(left.east())))));
        R.put("client.chests", m);
    }

    private static void sounds(ClientGameTestContext context, TestDedicatedServerContext server, TestDedicatedServerConnection connection,
            Sounds sounds) {
        BlockPos c = pad(server, 120);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("clientResolved", context.computeOnClient(mc -> B503Version.soundsOf(mc.level, c, b("own_sounds"))));
        server.runOnServer(s -> player(s).setGameMode(GameType.SURVIVAL));
        // Place: hold the block, look at the floor in front, press use.
        server.runOnServer(s -> {
            ServerPlayer p = player(s);
            p.getInventory().setSelectedSlot(0);
            p.getInventory().setItem(0, new ItemStack(b("own_sounds").asItem(), 16));
            p.inventoryMenu.broadcastChanges();
        });
        teleport(server, c, 0f, 60f);
        context.waitFor(mc -> mc.player != null && mc.player.getInventory().getSelectedItem().is(b("own_sounds").asItem()), 100);
        context.waitTicks(10);
        sounds.take();
        context.getInput().pressKey(o -> o.keyUse);
        context.waitTicks(10);
        m.put("place", sounds.take());
        // Break: the server breaks the block (level event 2001 to the client).
        BlockPos placed = server.computeOnServer(s -> {
            for (int dz = 0; dz <= 3; dz++) {
                for (int dy = -1; dy <= 1; dy++) {
                    BlockPos p = c.offset(0, dy, dz);
                    if (player(s).level().getBlockState(p).is(b("own_sounds"))) {
                        return p;
                    }
                }
            }
            return null;
        });
        m.put("placedAt", String.valueOf(placed));
        if (placed != null) {
            server.runOnServer(s -> player(s).level().destroyBlock(placed, false));
            context.waitTicks(10);
            m.put("break", sounds.take());
        }
        // Step: a row of the block, the player walks along it.
        for (int dz = 1; dz <= 12; dz++) {
            set(server, c.offset(0, -1, dz), b("own_sounds"));
        }
        teleport(server, c.offset(0, 0, 1), 0f, 0f);
        context.waitTicks(10);
        sounds.take();
        context.getInput().holdKeyFor(o -> o.keyUp, 30);
        context.waitTicks(5);
        m.put("step", sounds.take());
        R.put("client.sounds", m);
    }
}
