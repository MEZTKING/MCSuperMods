package dev.mcsupermods.runtime.gametest.spike4;

import com.mojang.authlib.GameProfile;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.network.protocol.game.ClientboundLevelEventPacket;
import net.minecraft.network.protocol.game.ClientboundSoundEntityPacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/** B524 spike (throwaway): shared helpers (mock players, uses, a listening player that keeps its packets). */
final class B524Help {
    private B524Help() {}

    static final B524Results R = B524Results.SERVER;

    static String name(BlockState s) {
        return s.toString().replace("Block{", "").replace("}", "");
    }

    static String id(Block b) {
        return BuiltInRegistries.BLOCK.getKey(b).toString();
    }

    static ServerPlayer player(GameTestHelper helper, BlockPos at, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(at)));
        return player;
    }

    /** A right click on {@code face} of the block at {@code rel} with the main hand, as the network handler does. */
    static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel, Direction face, ItemStack stack) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        Vec3 hitAt = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        BlockHitResult hit = new BlockHitResult(hitAt, face, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND), InteractionHand.MAIN_HAND, hit);
    }

    /** A real {@link ServerPlayer} whose packets are kept (vanilla Connection in a Netty EmbeddedChannel, no encoder). */
    static final class Ears implements AutoCloseable {
        ServerPlayer player;
        private final EmbeddedChannel channel;
        private final MinecraftServer server;

        Ears(GameTestHelper helper, BlockPos at, GameType mode, String name) {
            server = helper.getLevel().getServer();
            GameProfile profile = new GameProfile(UUID.randomUUID(), name);
            CommonListenerCookie cookie = CommonListenerCookie.createInitial(profile, false);
            player = new ServerPlayer(server, helper.getLevel(), profile, cookie.clientInformation());
            Connection connection = new Connection(PacketFlow.SERVERBOUND);
            channel = new EmbeddedChannel(connection);
            server.getPlayerList().placeNewPlayer(connection, player, cookie);
            player.setGameMode(mode);
            player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(at)));
            packets();
        }

        List<Packet<?>> packets() {
            channel.flushOutbound();
            List<Packet<?>> out = new ArrayList<>();
            for (Object m = channel.readOutbound(); m != null; m = channel.readOutbound()) {
                if (m instanceof Packet<?> p) {
                    open(p, out);
                }
            }
            return out;
        }

        private static void open(Packet<?> packet, List<Packet<?>> out) {
            if (packet instanceof ClientboundBundlePacket bundle) {
                bundle.subPackets().forEach(p -> open(p, out));
            } else {
                out.add(packet);
            }
        }

        /** Sound events heard and level events seen since the last read. */
        List<String> heard() {
            List<String> out = new ArrayList<>();
            for (Packet<?> packet : packets()) {
                switch (packet) {
                    case ClientboundSoundPacket p -> out.add(p.getSound().value().location().toString());
                    case ClientboundSoundEntityPacket p -> out.add(p.getSound().value().location().toString());
                    case ClientboundLevelEventPacket p -> out.add("levelEvent " + p.getType() + " data " + p.getData());
                    default -> {}
                }
            }
            return out;
        }

        ServerPlayer respawn() {
            player = server.getPlayerList().respawn(player, false, Entity.RemovalReason.KILLED);
            return player;
        }

        @Override
        public void close() {
            server.getPlayerList().remove(player);
            channel.close();
        }
    }

    static Identifier key(Block b) {
        return BuiltInRegistries.BLOCK.getKey(b);
    }
}
