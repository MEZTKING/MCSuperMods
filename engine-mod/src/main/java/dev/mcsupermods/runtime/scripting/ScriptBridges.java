package dev.mcsupermods.runtime.scripting;

import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/**
 * Fabric API events to script events (ADR 0031 D4, ADR 0032 D2), server side only. Lifecycle: the host lives from
 * {@code SERVER_STARTING} to {@code SERVER_STOPPED} and reloads on {@code END_DATA_PACK_RELOAD}. Cancelling:
 * {@code UseBlockCallback}, {@code UseItemCallback} and {@code UseEntityCallback} return {@code FAIL} (the result that
 * stops the block, the item and the client's hand loop, B130), {@code PlayerBlockBreakEvents.BEFORE} and
 * {@code ALLOW_DAMAGE} return {@code false}. After a cancelled main-hand interaction, the same click's off-hand
 * attempts and main-hand item use are refused in that tick ({@link ScriptHost#suppressed}).
 */
public final class ScriptBridges {
    private ScriptBridges() {}

    public static void register() {
        ServerLifecycleEvents.SERVER_STARTING.register(ScriptHost::start);
        ServerLifecycleEvents.SERVER_STARTED.register(ScriptBridges::serverStarted);
        ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((server, resources, success) -> {
            ScriptHost host = host(server);
            if (host != null && success) {
                host.reload();
            }
        });
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> ScriptHost.stop());
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            ScriptHost host = host(server);
            if (host != null) {
                host.tick();
            }
        });
        UseBlockCallback.EVENT.register(ScriptBridges::useBlock);
        PlayerBlockBreakEvents.BEFORE.register((level, player, pos, state, blockEntity) -> breakBlock(level, player, pos, state));
        UseItemCallback.EVENT.register(ScriptBridges::useItem);
        UseEntityCallback.EVENT.register((player, level, hand, entity, hit) -> useEntity(player, level, hand, entity));
        ServerLivingEntityEvents.ALLOW_DAMAGE.register(ScriptBridges::allowDamage);
        ServerLivingEntityEvents.AFTER_DEATH.register(ScriptBridges::afterDeath);
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> playerJoined(handler.player));
    }

    /** The running host when it belongs to {@code server}. */
    private static ScriptHost host(MinecraftServer server) {
        ScriptHost host = ScriptHost.current();
        return host != null && host.server() == server ? host : null;
    }

    private static ScriptHost host(Level level) {
        return level instanceof ServerLevel sl ? host(sl.getServer()) : null;
    }

    static void serverStarted(MinecraftServer server) {
        ScriptHost host = host(server);
        if (host != null && host.handles(ScriptEvents.SERVER_STARTED_EVENT)) {
            host.fire(ScriptEvents.SERVER_STARTED_EVENT, new ScriptEvents.ServerStarted(server.overworld()));
        }
    }

    public static InteractionResult useBlock(Player player, Level level, InteractionHand hand, BlockHitResult hit) {
        ScriptHost host = host(level);
        if (host == null || !(player instanceof ServerPlayer sp)) {
            return InteractionResult.PASS;
        }
        if (host.suppressed(sp, hand, false)) {
            return InteractionResult.FAIL;
        }
        if (!host.handles(ScriptEvents.BLOCK_INTERACT_EVENT)) {
            return InteractionResult.PASS;
        }
        ServerLevel sl = (ServerLevel) level;
        BlockPos pos = hit.getBlockPos();
        boolean cancelled = host.fire(ScriptEvents.BLOCK_INTERACT_EVENT,
                new ScriptEvents.BlockInteract(sl, new BlockRef(sl.getBlockState(pos), pos), sp, hand));
        return cancelled(host, sp, hand, cancelled);
    }

    public static InteractionResult useItem(Player player, Level level, InteractionHand hand) {
        ScriptHost host = host(level);
        if (host == null || !(player instanceof ServerPlayer sp)) {
            return InteractionResult.PASS;
        }
        if (host.suppressed(sp, hand, true)) {
            return InteractionResult.FAIL;
        }
        if (!host.handles(ScriptEvents.ITEM_USE_EVENT)) {
            return InteractionResult.PASS;
        }
        boolean cancelled = host.fire(ScriptEvents.ITEM_USE_EVENT,
                new ScriptEvents.ItemUse((ServerLevel) level, new ItemRef(sp.getItemInHand(hand)), sp, hand));
        return cancelled(host, sp, hand, cancelled);
    }

    public static InteractionResult useEntity(Player player, Level level, InteractionHand hand, Entity entity) {
        ScriptHost host = host(level);
        if (host == null || !(player instanceof ServerPlayer sp)) {
            return InteractionResult.PASS;
        }
        if (host.suppressed(sp, hand, false)) {
            return InteractionResult.FAIL;
        }
        if (!host.handles(ScriptEvents.ENTITY_INTERACT_EVENT)) {
            return InteractionResult.PASS;
        }
        boolean cancelled = host.fire(ScriptEvents.ENTITY_INTERACT_EVENT,
                new ScriptEvents.EntityInteract((ServerLevel) level, entity, sp, hand));
        return cancelled(host, sp, hand, cancelled);
    }

    private static InteractionResult cancelled(ScriptHost host, ServerPlayer player, InteractionHand hand, boolean cancelled) {
        if (!cancelled) {
            return InteractionResult.PASS;
        }
        if (hand == InteractionHand.MAIN_HAND) {
            host.mainHandCancelled(player);
        }
        return InteractionResult.FAIL;
    }

    static boolean breakBlock(Level level, Player player, BlockPos pos, BlockState state) {
        ScriptHost host = host(level);
        if (host == null || !(player instanceof ServerPlayer sp) || !host.handles(ScriptEvents.BLOCK_BREAK_EVENT)) {
            return true;
        }
        return !host.fire(ScriptEvents.BLOCK_BREAK_EVENT,
                new ScriptEvents.BlockBreak((ServerLevel) level, new BlockRef(state, pos), sp));
    }

    static boolean allowDamage(LivingEntity entity, DamageSource source, float amount) {
        ScriptHost host = host(entity.level());
        if (host == null || !host.handles(ScriptEvents.ENTITY_HURT_EVENT)) {
            return true;
        }
        return !host.fire(ScriptEvents.ENTITY_HURT_EVENT,
                new ScriptEvents.EntityHurt((ServerLevel) entity.level(), entity, amount, source.getEntity()));
    }

    static void afterDeath(LivingEntity entity, DamageSource source) {
        ScriptHost host = host(entity.level());
        if (host != null && host.handles(ScriptEvents.ENTITY_DEATH_EVENT)) {
            host.fire(ScriptEvents.ENTITY_DEATH_EVENT,
                    new ScriptEvents.EntityDeath((ServerLevel) entity.level(), entity, source.getEntity()));
        }
    }

    /**
     * {@code ServerPlayConnectionEvents.JOIN}; public so that GameTests can drive it with a mock player (the GameTest
     * server has no network connections that would fire the Fabric event).
     */
    public static void playerJoined(ServerPlayer player) {
        ScriptHost host = host(player.level());
        if (host != null && host.handles(ScriptEvents.PLAYER_JOIN_EVENT)) {
            host.fire(ScriptEvents.PLAYER_JOIN_EVENT, new ScriptEvents.PlayerJoin(player.level(), player));
        }
    }
}
