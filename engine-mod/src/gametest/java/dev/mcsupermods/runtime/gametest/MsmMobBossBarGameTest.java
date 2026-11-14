package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.mob.MobBossBar;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.BundlePacket;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBossEventPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.BossEvent;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * Boss bars (ADR 0071 D5, B294) on the {@code vb_boss*} definitions in {@code msm/msm_test/entity/}: players that track
 * the mob get the boss event's add packet with the definition's style, progress follows health, death and removal take
 * the bar away, and with {@code range} a player outside it gets nothing. Players are placed as
 * {@code GameTestHelper.makeMockServerPlayerInLevel} does, with a connection that records what is sent to them, and
 * removed from the player list at the end.
 */
public class MsmMobBossBarGameTest {
    private static final BlockPos AT = new BlockPos(1, 1, 1);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static <T extends Mob> EntityType<T> type(String path) {
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static MobBossBar bar(Entity mob) {
        return ((MsmMob) mob).driver().bossBar();
    }

    /** A connection that records every packet sent to its player. */
    private static final class RecordingConnection extends Connection {
        final List<Packet<?>> sent = new ArrayList<>();

        RecordingConnection() {
            super(PacketFlow.SERVERBOUND);
        }

        @Override
        public void send(Packet<?> packet, ChannelFutureListener listener, boolean flush) {
            sent.add(packet);
            super.send(packet, listener, flush);
        }

        /** The packets of one boss event seen so far, as text (tests run side by side, so other bosses are near). */
        List<String> boss(UUID bar) {
            List<String> out = new ArrayList<>();
            for (Packet<?> p : sent) {
                collect(p, bar, out);
            }
            return out;
        }

        private static void collect(Packet<?> packet, UUID bar, List<String> out) {
            if (packet instanceof BundlePacket<?> bundle) {
                for (Packet<?> sub : bundle.subPackets()) {
                    collect(sub, bar, out);
                }
            } else if (packet instanceof ClientboundBossEventPacket b) {
                b.dispatch(new ClientboundBossEventPacket.Handler() {
                    @Override
                    public void add(UUID id, Component name, float progress, BossEvent.BossBarColor color,
                            BossEvent.BossBarOverlay overlay, boolean darken, boolean music, boolean fog) {
                        if (id.equals(bar)) out.add("add " + name.getString() + " " + progress + " " + color.getName() + " " + overlay.getName()
                                + " darken " + darken + " music " + music + " fog " + fog);
                    }

                    @Override
                    public void remove(UUID id) {
                        if (id.equals(bar)) out.add("remove");
                    }

                    @Override
                    public void updateProgress(UUID id, float progress) {
                        if (id.equals(bar)) out.add("progress " + progress);
                    }

                    @Override
                    public void updateName(UUID id, Component name) {
                        if (id.equals(bar)) out.add("name " + name.getString());
                    }
                });
            }
        }
    }

    private record Listener(ServerPlayer player, RecordingConnection connection) {
        List<String> boss(Mob mob) {
            return connection.boss(bar(mob).event().orElseThrow().getId());
        }

        boolean saw(Mob mob, String prefix) {
            return boss(mob).stream().anyMatch(s -> s.startsWith(prefix));
        }
    }

    /** A survival player in the test's level at {@code pos} (relative), with a recording connection. */
    private static Listener listener(GameTestHelper helper, String name, Vec3 pos) {
        ServerLevel level = helper.getLevel();
        CommonListenerCookie cookie = CommonListenerCookie.createInitial(new GameProfile(UUID.randomUUID(), name), false);
        ServerPlayer player = new ServerPlayer(level.getServer(), level, cookie.gameProfile(), cookie.clientInformation());
        RecordingConnection connection = new RecordingConnection();
        new EmbeddedChannel(connection);
        level.getServer().getPlayerList().placeNewPlayer(connection, player, cookie);
        player.setGameMode(GameType.SURVIVAL);
        move(helper, player, pos);
        connection.sent.clear();
        return new Listener(player, connection);
    }

    private static void move(GameTestHelper helper, ServerPlayer player, Vec3 pos) {
        Vec3 abs = helper.absoluteVec(pos);
        player.snapTo(abs.x, abs.y, abs.z);
        helper.getLevel().getChunkSource().move(player);
    }

    private static void leave(GameTestHelper helper, Listener... listeners) {
        for (Listener l : listeners) {
            helper.getLevel().getServer().getPlayerList().remove(l.player());
        }
    }

    @GameTest(maxTicks = 200)
    public void trackingPlayerGetsTheBarProgressFollowsHealthDeathRemovesIt(GameTestHelper helper) {
        Mob boss = helper.spawn(type("vb_boss"), AT);
        Listener near = listener(helper, "msm-boss-near", new Vec3(4.5, 1, 1.5));
        helper.startSequence()
                .thenWaitUntil(() -> helper.assertTrue(near.saw(boss, "add "), "no add packet yet: " + near.boss(boss)))
                .thenExecute(() -> {
                    String add = near.boss(boss).stream().filter(s -> s.startsWith("add ")).findFirst().orElseThrow();
                    helper.assertValueEqual(add, "add " + boss.getDisplayName().getString()
                            + " 1.0 red notched_10 darken true music true fog false", "add packet");
                    helper.assertTrue(bar(boss).event().orElseThrow().getPlayers().contains(near.player()), "player on the bar");
                    helper.assertTrue(boss.requiresCustomPersistence(), "a boss never despawns");
                    boss.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 5.0f);
                })
                .thenWaitUntil(() -> helper.assertTrue(near.saw(boss, "progress 0.75"), "no progress 0.75: " + near.boss(boss)))
                .thenExecute(() -> boss.setCustomName(Component.literal("Big Boss")))
                .thenWaitUntil(() -> helper.assertTrue(near.saw(boss, "name Big Boss"), "no name update: " + near.boss(boss)))
                .thenExecute(() -> boss.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 1000.0f))
                .thenWaitUntil(() -> helper.assertTrue(near.saw(boss, "remove"), "no remove packet after death: " + near.boss(boss)))
                .thenExecute(() -> {
                    helper.assertTrue(bar(boss).event().orElseThrow().getPlayers().isEmpty(), "players left on a dead boss's bar");
                    leave(helper, near);
                })
                .thenSucceed();
    }

    @GameTest(maxTicks = 200)
    public void withRangeOnlyPlayersInsideGetTheBar(GameTestHelper helper) {
        Mob boss = helper.spawn(type("vb_boss_range"), AT);
        Listener inside = listener(helper, "msm-boss-in", new Vec3(4.5, 1, 1.5));
        Listener outside = listener(helper, "msm-boss-out", new Vec3(21.5, 1, 1.5));
        helper.startSequence()
                .thenWaitUntil(() -> helper.assertTrue(inside.saw(boss, "add "), "inside: no add packet yet: " + inside.boss(boss)))
                .thenIdle(2 * MobBossBar.RANGE_INTERVAL)
                .thenExecute(() -> {
                    helper.assertValueEqual(outside.boss(boss), List.of(), "packets to the player 20 blocks away (range 8)");
                    helper.assertTrue(inside.boss(boss).getFirst().startsWith("add " + boss.getDisplayName().getString()
                            + " 1.0 purple progress darken false music false fog false"), "default style: " + inside.boss(boss));
                    move(helper, outside.player(), new Vec3(1.5, 1, 4.5));
                    move(helper, inside.player(), new Vec3(1.5, 1, 15.5));
                })
                .thenWaitUntil(() -> {
                    helper.assertTrue(outside.saw(boss, "add "), "moved in: no add packet: " + outside.boss(boss));
                    helper.assertTrue(inside.saw(boss, "remove"), "moved out: no remove packet: " + inside.boss(boss));
                })
                .thenExecute(() -> {
                    boss.discard();
                    helper.assertTrue(bar(boss).event().orElseThrow().getPlayers().isEmpty(), "players left after discard");
                    helper.assertTrue(outside.saw(boss, "remove"), "discard: no remove packet: " + outside.boss(boss));
                    leave(helper, inside, outside);
                })
                .thenSucceed();
    }

    @GameTest
    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    public void dimensionChangeAndPlainMobs(GameTestHelper helper) {
        Mob boss = helper.spawn(type("vb_boss"), AT);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        ServerBossEvent event = bar(boss).event().orElseThrow();
        boss.startSeenByPlayer(player);
        helper.assertTrue(event.getPlayers().contains(player), "startSeenByPlayer adds the player");
        boss.stopSeenByPlayer(player);
        helper.assertFalse(event.getPlayers().contains(player), "stopSeenByPlayer removes the player");
        boss.startSeenByPlayer(player);
        boss.remove(Entity.RemovalReason.CHANGED_DIMENSION);
        helper.assertTrue(event.getPlayers().isEmpty(), "players left after a dimension change");
        Mob plain = helper.spawn(type("minimal"), AT);
        helper.assertTrue(bar(plain).event().isEmpty(), "a mob without msm:boss_bar has a bar");
        helper.assertFalse(plain.requiresCustomPersistence(), "a plain mob is kept");
        plain.discard();
        helper.getLevel().getServer().getPlayerList().remove(player);
        helper.succeed();
    }
}
