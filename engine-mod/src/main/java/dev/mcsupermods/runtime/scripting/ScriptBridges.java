package dev.mcsupermods.runtime.scripting;

import net.fabricmc.fabric.api.entity.FakePlayer;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityLevelChangeEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.fabricmc.fabric.api.message.v1.ServerMessageEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.ChatType;
import net.minecraft.network.chat.PlayerChatMessage;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientGamePacketListener;
import net.minecraft.network.protocol.game.ClientboundBlockUpdatePacket;
import net.minecraft.network.protocol.game.ClientboundCooldownPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/**
 * Fabric API events to script events (ADR 0031 D4, ADR 0032 D2), server side only. Lifecycle: the host lives from
 * {@code SERVER_STARTING} to {@code SERVER_STOPPED} and reloads on {@code END_DATA_PACK_RELOAD}. Cancelling:
 * {@code UseBlockCallback}, {@code UseItemCallback} and {@code UseEntityCallback} return {@code FAIL} (the result that
 * stops the block, the item and the client's hand loop, B130), {@code PlayerBlockBreakEvents.BEFORE} and
 * {@code ALLOW_DAMAGE} return {@code false}. After a cancelled main-hand interaction, the same click's off-hand
 * attempts and main-hand item use are refused in that tick ({@link ScriptHost#suppressed}). After every cancel and
 * every such refusal the player's client is resynchronised (ADR 0058 D3): the inventory always, for
 * {@code block.interact} also the six neighbours of the placement position, for {@code item.use} also the used stack's
 * cooldown, for {@code block.break} also a block entity's data. A call no script cancelled sends nothing extra;
 * {@code entity.hurt} needs no resync.
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
        ServerPlayerEvents.AFTER_RESPAWN.register(ScriptBridges::afterRespawn);
        ServerPlayerEvents.LEAVE.register(ScriptBridges::playerLeft);
        ServerEntityLevelChangeEvents.AFTER_PLAYER_CHANGE_LEVEL.register(ScriptBridges::changedDimension);
        ServerEntityLevelChangeEvents.AFTER_ENTITY_CHANGE_LEVEL.register((from, to, origin, destination) -> EntityHandle.moved(from, to));
        ServerMessageEvents.ALLOW_CHAT_MESSAGE.register(ScriptBridges::allowChat);
        ServerLivingEntityEvents.AFTER_DAMAGE.register(ScriptBridges::afterDamage);
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

    static InteractionResult useBlock(Player player, Level level, InteractionHand hand, BlockHitResult hit) {
        ScriptHost host = host(level);
        if (host == null || !(player instanceof ServerPlayer sp)) {
            return InteractionResult.PASS;
        }
        ServerLevel sl = (ServerLevel) level;
        if (host.suppressed(sp, hand, false)) {
            resyncPlacement(sp, sl, hit);
            return InteractionResult.FAIL;
        }
        if (!host.handles(ScriptEvents.BLOCK_INTERACT_EVENT)) {
            return InteractionResult.PASS;
        }
        BlockPos pos = hit.getBlockPos();
        boolean cancelled = host.fire(ScriptEvents.BLOCK_INTERACT_EVENT,
                new ScriptEvents.BlockInteract(sl, new BlockRef(sl.getBlockState(pos), pos), sp, hand));
        if (cancelled) {
            resyncPlacement(sp, sl, hit);
        }
        return cancelled(host, sp, hand, cancelled);
    }

    static InteractionResult useItem(Player player, Level level, InteractionHand hand) {
        ScriptHost host = host(level);
        if (host == null || !(player instanceof ServerPlayer sp)) {
            return InteractionResult.PASS;
        }
        if (host.suppressed(sp, hand, true)) {
            resyncItemUse(sp, hand);
            return InteractionResult.FAIL;
        }
        if (!host.handles(ScriptEvents.ITEM_USE_EVENT)) {
            return InteractionResult.PASS;
        }
        boolean cancelled = host.fire(ScriptEvents.ITEM_USE_EVENT,
                new ScriptEvents.ItemUse((ServerLevel) level, new ItemRef(sp.getItemInHand(hand)), sp, hand));
        if (cancelled) {
            resyncItemUse(sp, hand);
        }
        return cancelled(host, sp, hand, cancelled);
    }

    static InteractionResult useEntity(Player player, Level level, InteractionHand hand, Entity entity) {
        ScriptHost host = host(level);
        if (host == null || !(player instanceof ServerPlayer sp)) {
            return InteractionResult.PASS;
        }
        if (host.suppressed(sp, hand, false)) {
            resyncInventory(sp);
            return InteractionResult.FAIL;
        }
        if (!host.handles(ScriptEvents.ENTITY_INTERACT_EVENT)) {
            return InteractionResult.PASS;
        }
        boolean cancelled = host.fire(ScriptEvents.ENTITY_INTERACT_EVENT,
                new ScriptEvents.EntityInteract((ServerLevel) level, entity, sp, hand));
        if (cancelled) {
            resyncInventory(sp);
        }
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
        boolean cancelled = host.fire(ScriptEvents.BLOCK_BREAK_EVENT,
                new ScriptEvents.BlockBreak((ServerLevel) level, new BlockRef(state, pos), sp));
        if (cancelled) {
            resyncBreak(sp, (ServerLevel) level, pos);
        }
        return !cancelled;
    }

    // ---- cancel resync (ADR 0058 D3) -----------------------------------------------------------------------

    /**
     * Whether resync packets go to {@code player}: a connected player, not a Fabric {@link FakePlayer} (whose
     * connection drops packets anyway).
     */
    private static boolean resyncs(ServerPlayer player) {
        return player.connection != null && !(player instanceof FakePlayer);
    }

    /**
     * The player's whole inventory state ({@code ClientboundContainerSetContentPacket} of the inventory menu): undoes a
     * predicted count or durability change of the held stack and anything else the client predicted in the inventory.
     */
    static void resyncInventory(ServerPlayer player) {
        if (resyncs(player)) {
            player.inventoryMenu.sendAllDataToRemote();
        }
    }

    /**
     * After a cancelled break: the inventory, and for a block with a block entity the block and then its block entity
     * data. The block state alone is sent back by vanilla ({@code ServerPlayerGameMode.destroyAndAck}) and, with its
     * 3 by 3 by 3 neighbourhood, by Fabric API's {@code PlayerBlockBreakEvents.CANCELED} listener, but neither sends
     * the block entity data, so the client would keep the empty block entity it creates for the restored block. The
     * block goes first because the client ignores data for a block entity it does not have.
     */
    static void resyncBreak(ServerPlayer player, ServerLevel level, BlockPos pos) {
        if (!resyncs(player)) {
            return;
        }
        player.inventoryMenu.sendAllDataToRemote();
        BlockEntity blockEntity = level.getBlockEntity(pos);
        Packet<ClientGamePacketListener> data = blockEntity == null ? null : blockEntity.getUpdatePacket();
        if (data != null) {
            player.connection.send(new ClientboundBlockUpdatePacket(level, pos));
            player.connection.send(data);
        }
    }

    /**
     * After a refused use on a block: the inventory, then block updates for the six neighbours of the placement
     * position (the clicked position offset by the clicked face). Vanilla's {@code handleUseItemOn} resends only the
     * clicked position and the placement position; the neighbours cover the second block of a door, bed or tall plant.
     */
    static void resyncPlacement(ServerPlayer player, ServerLevel level, BlockHitResult hit) {
        if (!resyncs(player)) {
            return;
        }
        player.inventoryMenu.sendAllDataToRemote();
        BlockPos placement = hit.getBlockPos().relative(hit.getDirection());
        for (Direction d : Direction.values()) {
            player.connection.send(new ClientboundBlockUpdatePacket(level, placement.relative(d)));
        }
    }

    /**
     * After a refused item use: the inventory, and the end of a cooldown the client may have started for the used
     * stack's cooldown group ({@code ClientboundCooldownPacket} with duration 0, which the client handles as
     * {@code removeCooldown}), unless the server has that group on cooldown itself.
     */
    static void resyncItemUse(ServerPlayer player, InteractionHand hand) {
        if (!resyncs(player)) {
            return;
        }
        player.inventoryMenu.sendAllDataToRemote();
        ItemStack stack = player.getItemInHand(hand);
        if (!stack.isEmpty() && !player.getCooldowns().isOnCooldown(stack)) {
            player.connection.send(new ClientboundCooldownPacket(player.getCooldowns().getCooldownGroup(stack), 0));
        }
    }

    static boolean allowDamage(LivingEntity entity, DamageSource source, float amount) {
        ScriptHost host = host(entity.level());
        if (host != null && host.handles(ScriptEvents.ENTITY_DAMAGED_EVENT)) {
            HEALTH_BEFORE_DAMAGE.put(entity, entity.getHealth() + entity.getAbsorptionAmount());
        }
        if (host == null || !host.handles(ScriptEvents.ENTITY_HURT_EVENT)) {
            return true;
        }
        return !host.fire(ScriptEvents.ENTITY_HURT_EVENT,
                new ScriptEvents.EntityHurt((ServerLevel) entity.level(), entity, amount, source));
    }

    static void afterDeath(LivingEntity entity, DamageSource source) {
        ScriptHost host = host(entity.level());
        if (host != null && host.handles(ScriptEvents.ENTITY_DEATH_EVENT)) {
            host.fire(ScriptEvents.ENTITY_DEATH_EVENT,
                    new ScriptEvents.EntityDeath((ServerLevel) entity.level(), entity, source.getEntity()));
        }
    }

    static void playerJoined(ServerPlayer player) {
        ScriptHost host = host(player.level());
        if (host != null && host.handles(ScriptEvents.PLAYER_JOIN_EVENT)) {
            host.fire(ScriptEvents.PLAYER_JOIN_EVENT, new ScriptEvents.PlayerJoin(player.level(), player));
        }
    }

    // ---- script API 1.1 events (ADR 0065 D8) -------------------------------------------------------------

    static void afterRespawn(ServerPlayer oldPlayer, ServerPlayer newPlayer, boolean alive) {
        ScriptHost host = host(newPlayer.level());
        if (host == null) {
            return;
        }
        host.playerRespawned(oldPlayer, newPlayer);
        if (host.handles(ScriptEvents.PLAYER_RESPAWN_EVENT)) {
            host.fire(ScriptEvents.PLAYER_RESPAWN_EVENT, new ScriptEvents.PlayerOnly(newPlayer.level(), newPlayer));
        }
    }

    /** Fires before the player is removed from the player list; the player is then taken off every boss bar. */
    static void playerLeft(ServerPlayer player) {
        ScriptHost host = host(player.level());
        if (host == null) {
            return;
        }
        if (host.handles(ScriptEvents.PLAYER_LEAVE_EVENT)) {
            host.fire(ScriptEvents.PLAYER_LEAVE_EVENT, new ScriptEvents.PlayerOnly(player.level(), player));
        }
        host.playerLeft(player);
    }

    static void changedDimension(ServerPlayer player, ServerLevel from, ServerLevel to) {
        ScriptHost host = host(to);
        if (host != null && host.handles(ScriptEvents.PLAYER_CHANGE_DIMENSION_EVENT)) {
            host.fire(ScriptEvents.PLAYER_CHANGE_DIMENSION_EVENT, new ScriptEvents.PlayerChangeDimension(player, from, to));
        }
    }

    /** {@code player.chat}: a cancelled message is not broadcast to anyone ({@code ALLOW_CHAT_MESSAGE} returns false). */
    static boolean allowChat(PlayerChatMessage message, ServerPlayer sender, ChatType.Bound params) {
        ScriptHost host = host(sender.level());
        if (host == null || !host.handles(ScriptEvents.PLAYER_CHAT_EVENT)) {
            return true;
        }
        return !host.fire(ScriptEvents.PLAYER_CHAT_EVENT,
                new ScriptEvents.PlayerChat(sender.level(), sender, message.signedContent()));
    }

    /**
     * Health plus absorption of a living entity when {@code ALLOW_DAMAGE} let its damage through, while
     * {@code entity.damaged} has handlers; weak, so a damage that never completes leaves nothing behind.
     */
    private static final Map<LivingEntity, Float> HEALTH_BEFORE_DAMAGE = new WeakHashMap<>();

    /**
     * {@code entity.damaged}: the amount is what the entity lost, health and absorption, between {@code ALLOW_DAMAGE}
     * and {@code AFTER_DAMAGE}, so after armour, effects and enchantments (Fabric's {@code damageTaken} is before
     * armour); Fabric's {@code damageTaken} only when there is no snapshot.
     */
    static void afterDamage(LivingEntity entity, DamageSource source, float baseDamageTaken, float damageTaken, boolean blocked) {
        Float before = HEALTH_BEFORE_DAMAGE.remove(entity);
        ScriptHost host = host(entity.level());
        if (host != null && host.handles(ScriptEvents.ENTITY_DAMAGED_EVENT)) {
            float amount = before == null ? damageTaken
                    : Math.max(0f, before - (entity.getHealth() + entity.getAbsorptionAmount()));
            host.fire(ScriptEvents.ENTITY_DAMAGED_EVENT,
                    new ScriptEvents.EntityDamaged((ServerLevel) entity.level(), entity, amount, source));
        }
    }
}
