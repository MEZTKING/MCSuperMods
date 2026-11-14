package dev.mcsupermods.parity;

import com.mojang.authlib.GameProfile;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.chat.ChatType;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.PlayerChatMessage;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBlockUpdatePacket;
import net.minecraft.network.protocol.game.ClientboundBossEventPacket;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.network.protocol.game.ClientboundClearTitlesPacket;
import net.minecraft.network.protocol.game.ClientboundContainerSetContentPacket;
import net.minecraft.network.protocol.game.ClientboundDisguisedChatPacket;
import net.minecraft.network.protocol.game.ClientboundGameEventPacket;
import net.minecraft.network.protocol.game.ClientboundPlayerChatPacket;
import net.minecraft.network.protocol.game.ClientboundSetActionBarTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetExperiencePacket;
import net.minecraft.network.protocol.game.ClientboundSetHealthPacket;
import net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket;
import net.minecraft.network.protocol.game.ClientboundSoundEntityPacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.BossEvent;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * A real {@link ServerPlayer} in the test level whose packets a parity test can read: a vanilla {@code Connection}
 * inside a Netty {@code EmbeddedChannel}, placed through {@code PlayerList.placeNewPlayer} as
 * {@code GameTestHelper.makeMockServerPlayerInLevel} does, but keeping the channel. The channel has no encoder, so
 * its outbound queue holds the {@code Packet} objects themselves ({@code flushOutbound}, then {@code readOutbound}).
 * Vanilla and Netty only (the runtime's {@code MsmSoundGameTest} technique, B215); nothing is subclassed. Remove the
 * player with {@link #close}.
 *
 * <p>Such a player is not ticked by the server (its connection is not in the server's connection list), so a test calls
 * {@code player.doTick()} where vanilla sends something from the tick, such as experience and food. {@link #chat} says a
 * line as the network handler does, {@link #respawn} respawns the player as vanilla does (a new {@code ServerPlayer} on
 * the same connection), and {@link #read} describes the packets of the script API 1.1 (ADR 0065) as text.
 */
final class ParityEars implements AutoCloseable {
    /** The player; {@link #respawn} replaces it. */
    ServerPlayer player;
    private final EmbeddedChannel channel;
    private final MinecraftServer server;

    ParityEars(GameTestHelper helper, BlockPos at, GameType mode) {
        this(helper, at, mode, "msm-parity");
    }

    ParityEars(GameTestHelper helper, BlockPos at, GameType mode, String name) {
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

    /**
     * Says {@code text} in chat as the player: {@code PlayerList.broadcastChatMessage}, which the network handler calls
     * for a chat packet and where Fabric API's {@code ServerMessageEvents.ALLOW_CHAT_MESSAGE} decides.
     */
    void chat(String text) {
        server.getPlayerList().broadcastChatMessage(PlayerChatMessage.system(text), player, ChatType.bind(ChatType.CHAT, player));
    }

    /** Respawns the player as vanilla does after a death: a new {@code ServerPlayer} on the same connection. */
    ServerPlayer respawn() {
        player = server.getPlayerList().respawn(player, false, Entity.RemovalReason.KILLED);
        return player;
    }

    /**
     * The packets sent since the last read that the script API 1.1 sends or causes, as text: {@code system <text>} (chat
     * from the server), {@code chat} (a player's chat message), {@code title}, {@code subtitle}, {@code times}, {@code
     * actionbar}, {@code clear}, {@code xp level <l> total <t>}, {@code food <f> saturation <s>}, {@code game mode <id>}
     * and the boss bar operations {@code boss add|remove|progress|name|style}.
     */
    List<String> read() {
        List<String> out = new ArrayList<>();
        for (Packet<?> p : packets()) {
            switch (p) {
                case ClientboundSetTitlesAnimationPacket t -> out.add("times " + t.getFadeIn() + " " + t.getStay() + " " + t.getFadeOut());
                case ClientboundSetSubtitleTextPacket t -> out.add("subtitle " + t.text().getString());
                case ClientboundSetTitleTextPacket t -> out.add("title " + t.text().getString());
                case ClientboundSetActionBarTextPacket t -> out.add("actionbar " + t.text().getString());
                case ClientboundClearTitlesPacket t -> out.add("clear " + t.shouldResetTimes());
                case ClientboundSetExperiencePacket x -> out.add("xp level " + x.getExperienceLevel() + " total " + x.getTotalExperience());
                case ClientboundSetHealthPacket h -> out.add("food " + h.getFood() + " saturation " + h.getSaturation());
                case ClientboundGameEventPacket g when g.getEvent() == ClientboundGameEventPacket.CHANGE_GAME_MODE ->
                        out.add("game mode " + (int) g.getParam());
                case ClientboundBossEventPacket b -> b.dispatch(new ClientboundBossEventPacket.Handler() {
                    @Override
                    public void add(UUID id, Component name, float progress, BossEvent.BossBarColor color,
                            BossEvent.BossBarOverlay overlay, boolean darken, boolean music, boolean fog) {
                        out.add("boss add " + name.getString() + " " + progress + " " + color.getName() + " " + overlay.getName());
                    }

                    @Override
                    public void remove(UUID id) {
                        out.add("boss remove");
                    }

                    @Override
                    public void updateProgress(UUID id, float progress) {
                        out.add("boss progress " + progress);
                    }

                    @Override
                    public void updateName(UUID id, Component name) {
                        out.add("boss name " + name.getString());
                    }

                    @Override
                    public void updateStyle(UUID id, BossEvent.BossBarColor color, BossEvent.BossBarOverlay overlay) {
                        out.add("boss style " + color.getName() + " " + overlay.getName());
                    }
                });
                case ClientboundPlayerChatPacket c -> out.add("chat");
                case ClientboundDisguisedChatPacket c -> out.add("chat " + c.message().getString());
                case ClientboundSystemChatPacket c when !c.overlay() -> out.add("system " + c.content().getString());
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
