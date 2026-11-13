package dev.mcsupermods.parity;

import com.mojang.authlib.GameProfile;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBlockUpdatePacket;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.network.protocol.game.ClientboundContainerSetContentPacket;
import net.minecraft.network.protocol.game.ClientboundSoundEntityPacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * A real {@link ServerPlayer} in the test level whose packets a parity test can read: a vanilla {@code Connection}
 * inside a Netty {@code EmbeddedChannel}, placed through {@code PlayerList.placeNewPlayer} as
 * {@code GameTestHelper.makeMockServerPlayerInLevel} does, but keeping the channel. The channel has no encoder, so
 * its outbound queue holds the {@code Packet} objects themselves ({@code flushOutbound}, then {@code readOutbound}).
 * Vanilla and Netty only (the runtime's {@code MsmSoundGameTest} technique, B215); nothing is subclassed. Remove the
 * player with {@link #close}.
 */
final class ParityEars implements AutoCloseable {
    final ServerPlayer player;
    private final EmbeddedChannel channel;
    private final MinecraftServer server;

    ParityEars(GameTestHelper helper, BlockPos at, GameType mode) {
        server = helper.getLevel().getServer();
        GameProfile profile = new GameProfile(UUID.randomUUID(), "msm-parity");
        CommonListenerCookie cookie = CommonListenerCookie.createInitial(profile, false);
        player = new ServerPlayer(server, helper.getLevel(), profile, cookie.clientInformation());
        Connection connection = new Connection(PacketFlow.SERVERBOUND);
        channel = new EmbeddedChannel(connection);
        server.getPlayerList().placeNewPlayer(connection, player, cookie);
        player.setGameMode(mode);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(at)));
        packets();
    }

    /** A spectator at {@code at}: no mob targets it and it steps on nothing. */
    static ParityEars listener(GameTestHelper helper, BlockPos at) {
        return new ParityEars(helper, at, GameType.SPECTATOR);
    }

    /** The packets sent since the last call, bundles opened, in order. */
    List<Packet<?>> packets() {
        channel.flushOutbound();
        List<Packet<?>> out = new ArrayList<>();
        for (Object message = channel.readOutbound(); message != null; message = channel.readOutbound()) {
            if (message instanceof Packet<?> packet) {
                open(packet, out);
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

    /** The sound events of the sound packets sent since the last read. */
    List<Identifier> heard() {
        List<Identifier> out = new ArrayList<>();
        for (Packet<?> packet : packets()) {
            switch (packet) {
                case ClientboundSoundPacket p -> out.add(p.getSound().value().location());
                case ClientboundSoundEntityPacket p -> out.add(p.getSound().value().location());
                default -> {}
            }
        }
        return out;
    }

    /**
     * The resync packets of a cancelled interaction (ADR 0058 D3) sent since the last read, as text:
     * {@code inventory <container id>} for a whole-container content packet, {@code block <x, y, z>} for a block update.
     */
    List<String> resync() {
        List<String> out = new ArrayList<>();
        for (Packet<?> packet : packets()) {
            switch (packet) {
                case ClientboundContainerSetContentPacket p -> out.add("inventory " + p.containerId());
                case ClientboundBlockUpdatePacket p -> out.add("block " + p.getPos().toShortString());
                default -> {}
            }
        }
        return out;
    }

    @Override
    public void close() {
        server.getPlayerList().remove(player);
        channel.close();
    }
}
