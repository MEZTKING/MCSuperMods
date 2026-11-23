package b720;

import com.mojang.authlib.GameProfile;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.FloatArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.ComponentArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.Connection;
import net.minecraft.network.DisconnectionDetails;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.network.protocol.game.ClientboundGameEventPacket;
import net.minecraft.network.protocol.game.ClientboundPlayerCombatKillPacket;
import net.minecraft.network.protocol.game.ClientboundSetActionBarTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.network.protocol.game.ServerboundAttackPacket;
import net.minecraft.network.protocol.game.ServerboundClientCommandPacket;
import net.minecraft.network.protocol.game.ServerboundPlayerActionPacket;
import net.minecraft.network.protocol.game.ServerboundPlayerLoadedPacket;
import net.minecraft.network.protocol.game.ServerboundUseItemOnPacket;
import net.minecraft.network.protocol.game.ServerboundUseItemPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * B720 spike (throwaway): stand-in players on a real dedicated server, driven from the console. Each is a real
 * ServerPlayer on a vanilla Connection inside a Netty EmbeddedChannel, placed by PlayerList.placeNewPlayer with the
 * offline profile of its name (so leaving and joining again loads the saved player), ticked by doTick at the end of
 * each server tick (as its network listener would), acting only through the network handlers a client's packets reach.
 * What each sees in chat, titles and the action bar is printed as "B720SEE <name> <kind> <text>".
 */
public final class B720Spike implements ModInitializer {
    static final Map<String, EmbeddedChannel> CHANNELS = new HashMap<>();
    static final List<Long> TICKS = new ArrayList<>();
    static boolean perf;
    static long tickStart;
    static int seq = 1;
    static MinecraftServer SERVER;
    static final List<String> PENDING = new ArrayList<>();
    static final List<Integer> PENDING_N = new ArrayList<>();

    /** Runs the commands queued by "b720 time" one by one, outside any other command, and prints how long each took. */
    static void runPending(MinecraftServer server) {
        List<String> todo = new ArrayList<>(PENDING);
        List<Integer> counts = new ArrayList<>(PENDING_N);
        PENDING.clear();
        PENDING_N.clear();
        for (int i = 0; i < todo.size(); i++) {
            String cmd = todo.get(i);
            int n = counts.get(i);
            long[] t = new long[n];
            for (int k = 0; k < n; k++) {
                CommandSourceStack src = server.createCommandSourceStack().withSuppressedOutput();
                long t0 = System.nanoTime();
                server.getCommands().performPrefixedCommand(src, cmd);
                t[k] = System.nanoTime() - t0;
            }
            long[] sorted = t.clone();
            Arrays.sort(sorted);
            say(String.format("time n=%d first=%.3f median=%.3f min=%.3f mean=%.3f ms /%s", n, t[0] / 1e6, sorted[n / 2] / 1e6,
                    sorted[0] / 1e6, Arrays.stream(t).average().orElse(0) / 1e6, cmd));
        }
    }

    @Override
    public void onInitialize() {
        CommandRegistrationCallback.EVENT.register((d, ctx, sel) -> register(d, ctx));
        ServerTickEvents.START_SERVER_TICK.register(s -> {
            SERVER = s;
            tickStart = System.nanoTime();
        });
        ServerTickEvents.END_SERVER_TICK.register(B720Spike::endTick);
        // K21: the hook the runtime's entity.death uses (ScriptBridges.afterDeath), observed for players.
        net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
            if (entity instanceof ServerPlayer p) {
                Entity killer = source.getEntity();
                say("AFTER_DEATH player=" + p.getScoreboardName() + " source=" + source.getMsgId() + " killer="
                        + (killer == null ? "none" : killer.getScoreboardName()) + " direct="
                        + (source.getDirectEntity() == null ? "none" : source.getDirectEntity().getType().toShortString())
                        + " killCredit=" + (p.getKillCredit() == null ? "none" : p.getKillCredit().getScoreboardName()));
            }
        });
    }

    static void endTick(MinecraftServer server) {
        for (String name : new ArrayList<>(CHANNELS.keySet())) {
            ServerPlayer p = server.getPlayerList().getPlayerByName(name);
            if (p != null && !p.isRemoved()) {
                if (!p.connection.hasClientLoaded()) {
                    p.connection.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket());
                }
                // The network listener's own tick (it runs the player's doTick, the keep-alive and the load timeout).
                p.connection.tick();
            }
        }
        long took = System.nanoTime() - tickStart;
        if (perf) {
            TICKS.add(took);
        }
        runPending(server);
        for (Map.Entry<String, EmbeddedChannel> e : CHANNELS.entrySet()) {
            EmbeddedChannel ch = e.getValue();
            ch.flushOutbound();
            for (Object m = ch.readOutbound(); m != null; m = ch.readOutbound()) {
                if (m instanceof net.minecraft.network.protocol.common.ClientboundKeepAlivePacket k) {
                    ServerPlayer p = server.getPlayerList().getPlayerByName(e.getKey());
                    if (p != null) {
                        p.connection.handleKeepAlive(new net.minecraft.network.protocol.common.ServerboundKeepAlivePacket(k.getId()));
                    }
                } else if (m instanceof net.minecraft.network.protocol.game.ClientboundPlayerPositionPacket pos) {
                    // A client confirms every teleport the server sends (as the real client does at once).
                    ServerPlayer p = server.getPlayerList().getPlayerByName(e.getKey());
                    if (p != null) {
                        p.connection.handleAcceptTeleportPacket(new net.minecraft.network.protocol.game.ServerboundAcceptTeleportationPacket(
                                pos.id(), p.getX(), p.getY(), p.getZ(), p.getYRot(), p.getXRot()));
                    }
                } else if (m instanceof Packet<?> pk) {
                    see(e.getKey(), pk);
                }
            }
        }
    }

    static void see(String name, Packet<?> pk) {
        String line = switch (pk) {
            case ClientboundBundlePacket b -> {
                b.subPackets().forEach(x -> see(name, x));
                yield null;
            }
            case ClientboundSystemChatPacket c -> (c.overlay() ? "actionbar " : "chat ") + c.content().getString();
            case ClientboundSetTitleTextPacket t -> "title " + t.text().getString();
            case ClientboundSetSubtitleTextPacket t -> "subtitle " + t.text().getString();
            case ClientboundSetActionBarTextPacket t -> "actionbar " + t.text().getString();
            case ClientboundPlayerCombatKillPacket k -> "deathscreen " + k.message().getString();
            case net.minecraft.network.protocol.game.ClientboundMerchantOffersPacket o -> "merchant offers=" + o.getOffers().size()
                    + (o.getOffers().isEmpty() ? "" : " first=" + o.getOffers().get(0).getCostA() + " -> " + o.getOffers().get(0).getResult()
                    + " " + o.getOffers().get(0).getResult().getComponentsPatch());
            case net.minecraft.network.protocol.common.ClientboundShowDialogPacket d -> "dialog " + d.dialog();
            case net.minecraft.network.protocol.common.ClientboundDisconnectPacket x -> "disconnected " + x.reason().getString();
            case ClientboundGameEventPacket g -> g.getEvent() == ClientboundGameEventPacket.CHANGE_GAME_MODE
                    ? "gamemode " + (int) g.getParam() : null;
            default -> null;
        };
        if (line != null) {
            System.out.println("B720SEE " + name + " " + line);
        }
    }

    static ServerPlayer player(CommandContext<CommandSourceStack> c, String arg) {
        String name = StringArgumentType.getString(c, arg);
        ServerPlayer p = c.getSource().getServer().getPlayerList().getPlayerByName(name);
        if (p == null) {
            throw new IllegalStateException("no player " + name);
        }
        return p;
    }

    static void say(String s) {
        System.out.println("B720 t=" + (SERVER == null ? -1 : SERVER.overworld().getGameTime()) + " " + s);
    }

    static int join(CommandContext<CommandSourceStack> c) {
        MinecraftServer server = c.getSource().getServer();
        String name = StringArgumentType.getString(c, "name");
        GameProfile profile = new GameProfile(UUIDUtil.createOfflinePlayerUUID(name), name);
        CommonListenerCookie cookie = CommonListenerCookie.createInitial(profile, false);
        ServerPlayer player = new ServerPlayer(server, server.overworld(), profile, cookie.clientInformation());
        Connection connection = new Connection(PacketFlow.SERVERBOUND);
        EmbeddedChannel channel = new EmbeddedChannel(connection);
        CHANNELS.put(name, channel);
        // A returning player's saved data, as the login does before placing the player (26.x reads it in the
        // configuration phase): PlayerList.loadPlayerData, then Entity.load.
        var saved = server.getPlayerList().loadPlayerData(new net.minecraft.server.players.NameAndId(profile));
        say("saved data for " + name + ": " + saved.isPresent());
        if (saved.isPresent()) {
            player.load(net.minecraft.world.level.storage.TagValueInput.create(net.minecraft.util.ProblemReporter.DISCARDING,
                    server.registryAccess(), saved.get()));
            say("loaded saved data for " + name + " playerGameType=" + saved.get().getInt("playerGameType") + " modeAfterLoad="
                    + player.gameMode().getName());
        }
        server.getPlayerList().placeNewPlayer(connection, player, cookie);
        ServerPlayer placed = server.getPlayerList().getPlayerByName(name);
        placed.connection.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket());
        say("joined " + name + " " + info(placed));
        return 1;
    }

    static int leave(CommandContext<CommandSourceStack> c) {
        ServerPlayer p = player(c, "name");
        String name = p.getScoreboardName();
        p.connection.onDisconnect(new DisconnectionDetails(Component.literal("Disconnected")));
        EmbeddedChannel ch = CHANNELS.remove(name);
        if (ch != null) {
            ch.close();
        }
        say("left " + name + " online=" + (c.getSource().getServer().getPlayerList().getPlayerByName(name) != null));
        return 1;
    }

    static String info(ServerPlayer p) {
        return String.format("%s hp=%.2f max=%.2f mode=%s dead=%s pos=%.2f,%.2f,%.2f dim=%s removed=%s",
                p.getScoreboardName(), p.getHealth(), p.getMaxHealth(), p.gameMode.getGameModeForPlayer().getName(),
                p.isDeadOrDying(), p.getX(), p.getY(), p.getZ(), p.level().dimension().identifier(), p.isRemoved());
    }

    static Entity tagged(CommandSourceStack src, String tag) {
        for (ServerLevel level : src.getServer().getAllLevels()) {
            for (Entity e : level.getAllEntities()) {
                if (e.entityTags().contains(tag)) {
                    return e;
                }
            }
        }
        throw new IllegalStateException("no entity tagged " + tag);
    }

    static void register(CommandDispatcher<CommandSourceStack> d, net.minecraft.commands.CommandBuildContext ctx) {
        var name = Commands.argument("name", StringArgumentType.word());
        d.register(Commands.literal("b720")
                .then(Commands.literal("join").then(Commands.argument("name", StringArgumentType.word()).executes(B720Spike::join)))
                .then(Commands.literal("leave").then(Commands.argument("name", StringArgumentType.word()).executes(B720Spike::leave)))
                .then(Commands.literal("info").then(Commands.argument("name", StringArgumentType.word()).executes(c -> {
                    say("info " + info(player(c, "name")));
                    return 1;
                })))
                .then(Commands.literal("hit").then(Commands.argument("victim", StringArgumentType.word())
                        .then(Commands.argument("attacker", StringArgumentType.word())
                                .then(Commands.argument("amount", FloatArgumentType.floatArg()).executes(c -> {
                                    ServerPlayer v = player(c, "victim");
                                    ServerPlayer a = player(c, "attacker");
                                    ServerLevel l = (ServerLevel) v.level();
                                    boolean hurt = v.hurtServer(l, l.damageSources().playerAttack(a), FloatArgumentType.getFloat(c, "amount"));
                                    say("hit " + hurt + " " + info(v));
                                    return 1;
                                })))))
                .then(Commands.literal("hitentity").then(Commands.argument("tag", StringArgumentType.word())
                        .then(Commands.argument("attacker", StringArgumentType.word())
                                .then(Commands.argument("amount", FloatArgumentType.floatArg()).executes(c -> {
                                    Entity e = tagged(c.getSource(), StringArgumentType.getString(c, "tag"));
                                    ServerPlayer a = player(c, "attacker");
                                    ServerLevel l = (ServerLevel) e.level();
                                    boolean hurt = e.hurtServer(l, l.damageSources().playerAttack(a), FloatArgumentType.getFloat(c, "amount"));
                                    say("hitentity " + hurt + " removed=" + e.isRemoved() + " alive=" + e.isAlive());
                                    return 1;
                                })))))
                .then(Commands.literal("attack").then(Commands.argument("name", StringArgumentType.word())
                        .then(Commands.argument("tag", StringArgumentType.word()).executes(c -> {
                            ServerPlayer p = player(c, "name");
                            Entity e = tagged(c.getSource(), StringArgumentType.getString(c, "tag"));
                            p.connection.handleAttack(new ServerboundAttackPacket(e.getId()));
                            say("attack removed=" + e.isRemoved() + " alive=" + e.isAlive());
                            return 1;
                        }))))
                .then(Commands.literal("interact").then(Commands.argument("name", StringArgumentType.word())
                        .then(Commands.argument("tag", StringArgumentType.word()).executes(c -> {
                            ServerPlayer p = player(c, "name");
                            Entity e = tagged(c.getSource(), StringArgumentType.getString(c, "tag"));
                            p.connection.handleInteract(new net.minecraft.network.protocol.game.ServerboundInteractPacket(e.getId(),
                                    InteractionHand.MAIN_HAND, Vec3.ZERO, false));
                            say("interact menu=" + p.containerMenu.getClass().getSimpleName());
                            return 1;
                        }))))
                .then(Commands.literal("menu").then(Commands.argument("name", StringArgumentType.word()).executes(c -> {
                    say("menu " + player(c, "name").containerMenu.getClass().getSimpleName());
                    return 1;
                })))
                .then(Commands.literal("void").then(Commands.argument("name", StringArgumentType.word()).executes(c -> {
                    ServerPlayer v = player(c, "name");
                    ServerLevel l = (ServerLevel) v.level();
                    v.hurtServer(l, l.damageSources().fellOutOfWorld(), 1000f);
                    say("void " + info(v));
                    return 1;
                })))
                .then(Commands.literal("respawn").then(Commands.argument("name", StringArgumentType.word()).executes(c -> {
                    ServerPlayer p = player(c, "name");
                    p.connection.handleClientCommand(new ServerboundClientCommandPacket(ServerboundClientCommandPacket.Action.PERFORM_RESPAWN));
                    ServerPlayer q = c.getSource().getServer().getPlayerList().getPlayerByName(p.getScoreboardName());
                    q.connection.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket());
                    say("respawned " + info(q));
                    return 1;
                })))
                .then(Commands.literal("use").then(Commands.argument("name", StringArgumentType.word()).executes(c -> {
                    ServerPlayer p = player(c, "name");
                    p.connection.handleUseItem(new ServerboundUseItemPacket(InteractionHand.MAIN_HAND, seq++, p.getYRot(), p.getXRot()));
                    say("use using=" + p.isUsingItem() + " " + info(p));
                    return 1;
                })))
                .then(Commands.literal("useon").then(Commands.argument("name", StringArgumentType.word())
                        .then(Commands.argument("x", IntegerArgumentType.integer()).then(Commands.argument("y", IntegerArgumentType.integer())
                                .then(Commands.argument("z", IntegerArgumentType.integer()).executes(c -> {
                                    ServerPlayer p = player(c, "name");
                                    BlockPos pos = new BlockPos(IntegerArgumentType.getInteger(c, "x"), IntegerArgumentType.getInteger(c, "y"),
                                            IntegerArgumentType.getInteger(c, "z"));
                                    BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(pos).add(0, 0.5, 0), Direction.UP, pos, false);
                                    p.connection.handleUseItemOn(new ServerboundUseItemOnPacket(InteractionHand.MAIN_HAND, hit, seq++));
                                    say("useon " + p.level().getBlockState(pos) + " above=" + p.level().getBlockState(pos.above()));
                                    return 1;
                                }))))))
                .then(Commands.literal("break").then(Commands.argument("name", StringArgumentType.word())
                        .then(Commands.argument("x", IntegerArgumentType.integer()).then(Commands.argument("y", IntegerArgumentType.integer())
                                .then(Commands.argument("z", IntegerArgumentType.integer()).executes(c -> {
                                    ServerPlayer p = player(c, "name");
                                    BlockPos pos = new BlockPos(IntegerArgumentType.getInteger(c, "x"), IntegerArgumentType.getInteger(c, "y"),
                                            IntegerArgumentType.getInteger(c, "z"));
                                    String before = p.level().getBlockState(pos).toString();
                                    p.connection.handlePlayerAction(new ServerboundPlayerActionPacket(
                                            ServerboundPlayerActionPacket.Action.START_DESTROY_BLOCK, pos, Direction.UP, seq++));
                                    say("break " + before + " -> " + p.level().getBlockState(pos));
                                    return 1;
                                }))))))
                .then(Commands.literal("as").then(Commands.argument("name", StringArgumentType.word())
                        .then(Commands.argument("command", StringArgumentType.greedyString()).executes(c -> {
                            ServerPlayer p = player(c, "name");
                            String cmd = StringArgumentType.getString(c, "command");
                            String who = p.getScoreboardName();
                            CommandSourceStack src = p.createCommandSourceStack().withCallback((ok, v) -> say("as " + who + " /" + cmd + " -> " + (ok ? v : -1)));
                            c.getSource().getServer().getCommands().performPrefixedCommand(src, cmd);
                            return 1;
                        }))))
                .then(Commands.literal("log").then(Commands.argument("text", ComponentArgument.textComponent(ctx)).executes(c -> {
                    long t = c.getSource().getServer().overworld().getGameTime();
                    String who = c.getSource().getEntity() == null ? "-" : c.getSource().getEntity().getScoreboardName();
                    System.out.println("B720LOG t=" + t + " as=" + who + " " + ComponentArgument.getResolvedComponent(c, "text").getString());
                    return 1;
                })))
                .then(Commands.literal("time").then(Commands.argument("n", IntegerArgumentType.integer(1))
                        .then(Commands.argument("command", StringArgumentType.greedyString()).executes(c -> {
                    String cmd = StringArgumentType.getString(c, "command");
                    PENDING.add(cmd);
                    PENDING_N.add(IntegerArgumentType.getInteger(c, "n"));
                    return 1;
                }))))
                .then(Commands.literal("perf").then(Commands.literal("start").executes(c -> {
                    TICKS.clear();
                    perf = true;
                    return 1;
                })).then(Commands.literal("stop").then(Commands.argument("label", StringArgumentType.word()).executes(c -> {
                    perf = false;
                    long[] t = TICKS.stream().mapToLong(Long::longValue).toArray();
                    Arrays.sort(t);
                    double mean = Arrays.stream(t).average().orElse(0) / 1e6;
                    say(String.format("perf %s n=%d mean=%.3f median=%.3f p95=%.3f max=%.3f", StringArgumentType.getString(c, "label"), t.length,
                            mean, t.length > 0 ? t[t.length / 2] / 1e6 : 0, t.length > 0 ? t[(int) (t.length * 0.95)] / 1e6 : 0,
                            t.length > 0 ? t[t.length - 1] / 1e6 : 0));
                    return 1;
                })))));
    }
}
