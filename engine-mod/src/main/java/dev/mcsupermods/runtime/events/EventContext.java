package dev.mcsupermods.runtime.events;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * Where an event fires.
 *
 * @param level  the server level
 * @param base   the block that {@code set_block_state} offsets are relative to
 * @param origin where sounds, particles and functions run
 * @param player the player involved, or null
 * @param entity the entity whose definition fired the event (for {@code play_animation}), the holder of an effect, the
 *               thrower of a thrown item, a stepping or placing entity that is not a player (ADR 0058 D1), an attacker or
 *               holder of an item that is not a player (ADR 0061 D1), or null
 * @param block  the block whose definition fired the event (for {@code run_script}), or null
 * @param other  the other living entity of the event (the {@code apply_effect} target {@code other}, ADR 0044 D2):
 *               the player for block and item events, the player who hurts or interacts with an entity, the
 *               mob an entity hits, the holder of a mob effect (ADR 0055 D3), the living entity a thrown item hits
 *               (ADR 0056 D3), the living entity that steps on a block (ADR 0058 D1); or null
 * @param source what kind of definition fired the event (ADR 0058 D1): it selects the sound source of
 *               {@code play_sound} and who {@code run_function} runs as
 */
public record EventContext(ServerLevel level, BlockPos base, Vec3 origin, Player player, Entity entity, BlockPos block,
        LivingEntity other, Source source) {
    /** The kind of definition an event belongs to. */
    public enum Source {
        BLOCK, ITEM, ENTITY, EFFECT, THROWN
    }

    /** A block event: offsets from the block, effects at its centre. */
    public static EventContext forBlock(ServerLevel level, BlockPos pos, Player player) {
        return new EventContext(level, pos.immutable(), Vec3.atCenterOf(pos), player, null, pos.immutable(), player, Source.BLOCK);
    }

    /**
     * A block step event (ADR 0058 D1): as {@link #forBlock}, with the stepper as the player when it is one, else as
     * the entity; and as the other entity when it is living. So {@code self} and {@code other} both mean whoever
     * stepped, and {@code launch} also moves a stepping item or minecart.
     */
    public static EventContext forBlockStep(ServerLevel level, BlockPos pos, Entity stepper) {
        return forBlockActor(level, pos, stepper);
    }

    /**
     * A block event with an actor that may be any entity, or none (ADR 0058 D1 actor rule): steps, entities inside
     * ({@code msm:on_entity_inside}) and the placer of {@code msm:on_place} (ADR 0061 D2).
     */
    public static EventContext forBlockActor(ServerLevel level, BlockPos pos, Entity stepper) {
        Player player = stepper instanceof Player p ? p : null;
        return new EventContext(level, pos.immutable(), Vec3.atCenterOf(pos), player, player == null ? stepper : null, pos.immutable(),
                stepper instanceof LivingEntity living ? living : null, Source.BLOCK);
    }

    /** An item event: offsets from the block below the player, effects at the player. */
    public static EventContext forItem(ServerLevel level, Player player) {
        return new EventContext(level, player.blockPosition().below(), player.position(), player, null, null, player, Source.ITEM);
    }

    /**
     * An item hit event ({@code msm:on_hit}, ADR 0061 D1): offsets from the block below the attacker, effects at the
     * attacker; the attacker is the player when it is one and the entity otherwise, so {@code self} means the attacker;
     * {@code other} is the entity hit.
     */
    public static EventContext forItemHit(ServerLevel level, LivingEntity attacker, LivingEntity target) {
        Player player = attacker instanceof Player p ? p : null;
        return new EventContext(level, attacker.blockPosition().below(), attacker.position(), player, player == null ? attacker : null,
                null, target, Source.ITEM);
    }

    /**
     * An item used on a block ({@code msm:on_use_on_block}, ADR 0061 D1): {@code base} and {@code block} are the
     * clicked block, effects at the clicked point; the player is self and other.
     */
    public static EventContext forItemUseOn(ServerLevel level, Player player, BlockPos clicked, Vec3 at) {
        return new EventContext(level, clicked.immutable(), at, player, null, clicked.immutable(), player, Source.ITEM);
    }

    /**
     * A held or worn item's tick ({@code msm:while_held}, {@code msm:while_worn}, ADR 0061 D1): as {@link #forItem}
     * with the holder, the player when it is one and the entity otherwise; the holder is also {@code other} when living.
     */
    public static EventContext forHolder(ServerLevel level, Entity holder) {
        Player player = holder instanceof Player p ? p : null;
        return new EventContext(level, holder.blockPosition().below(), holder.position(), player, player == null ? holder : null, null,
                holder instanceof LivingEntity living ? living : null, Source.ITEM);
    }

    /** An entity event: offsets from the entity's block position, effects at the entity (ADR 0028 D2). */
    public static EventContext forEntity(ServerLevel level, Entity entity, Player player) {
        return forEntity(level, entity, player, player);
    }

    /** An entity event with another entity than the player, such as the mob an entity hits. */
    public static EventContext forEntity(ServerLevel level, Entity entity, Player player, LivingEntity other) {
        return new EventContext(level, entity.blockPosition(), entity.position(), player, entity, null, other, Source.ENTITY);
    }

    /**
     * A mob effect event (ADR 0055 D3): offsets from the holder's block, effects at the holder; the holder is the
     * entity, the other entity, and the player when it is one, so {@code self} and {@code other} both mean the holder.
     */
    public static EventContext forEffect(ServerLevel level, LivingEntity holder) {
        Player player = holder instanceof Player p ? p : null;
        return new EventContext(level, holder.blockPosition(), holder.position(), player, holder, null, holder, Source.EFFECT);
    }

    /**
     * A thrown item's hit event (ADR 0056 D3): effects at the hit point, offsets from {@code base} (the hit block, or
     * the block of the entity hit); the thrower is the player when it is one and the entity otherwise, so {@code self}
     * means the thrower; {@code other} is the living entity hit, or null. {@code block} is the hit block, or null.
     */
    public static EventContext forThrownHit(ServerLevel level, Vec3 at, BlockPos base, Entity thrower, LivingEntity hit, BlockPos block) {
        Player player = thrower instanceof Player p ? p : null;
        return new EventContext(level, base.immutable(), at, player, thrower, block == null ? null : block.immutable(), hit,
                Source.THROWN);
    }
}
