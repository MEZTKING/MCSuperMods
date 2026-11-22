package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * Real {@link ServerPlayer}s for the B533 GameTests ({@code MsmScriptApi17GameTest}, {@code MsmGameRuleStatGameTest},
 * {@code MsmCommand2GameTest}): each has its own name (mock players share one, and api17.js tells test players apart by a
 * name that starts with {@code b533}) and a connection that records the packets sent to it, as
 * {@code MsmMixinEventGameTest}'s recording player does. Nothing ticks them: a test calls {@code doTick()} itself.
 */
final class RecordingPlayers {
    private RecordingPlayers() {}

    /** A connection that keeps every packet sent to its player, bundles opened. */
    static final class Recording extends Connection {
        private final List<Packet<?>> sent = new ArrayList<>();

        Recording() {
            super(PacketFlow.SERVERBOUND);
        }

        @Override
        public void send(Packet<?> packet, ChannelFutureListener listener, boolean flush) {
            open(packet);
            super.send(packet, listener, flush);
        }

        private void open(Packet<?> packet) {
            if (packet instanceof ClientboundBundlePacket bundle) {
                bundle.subPackets().forEach(this::open);
            } else {
                sent.add(packet);
            }
        }

        /** The packets sent since the last call. */
        List<Packet<?>> take() {
            List<Packet<?>> out = List.copyOf(sent);
            sent.clear();
            return out;
        }
    }

    /** A joined player and its connection; {@link #close()} takes it out of the game. */
    record Recorded(ServerPlayer player, Recording connection) implements AutoCloseable {
        @Override
        public void close() {
            player.level().getServer().getPlayerList().remove(player);
        }
    }

    /** A player named {@code name} joined in {@code mode} at {@code rel} (relative to the test), packets recorded from now on. */
    static Recorded join(GameTestHelper helper, String name, Vec3 rel, GameType mode) {
        ServerLevel level = helper.getLevel();
        CommonListenerCookie cookie = CommonListenerCookie.createInitial(new GameProfile(UUID.randomUUID(), name), false);
        ServerPlayer player = new ServerPlayer(level.getServer(), level, cookie.gameProfile(), cookie.clientInformation());
        Recording connection = new Recording();
        new EmbeddedChannel(connection);
        level.getServer().getPlayerList().placeNewPlayer(connection, player, cookie);
        player.setGameMode(mode);
        player.snapTo(helper.absoluteVec(rel));
        connection.take();
        return new Recorded(player, connection);
    }
}
