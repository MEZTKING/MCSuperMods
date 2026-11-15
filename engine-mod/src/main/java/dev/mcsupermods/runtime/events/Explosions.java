package dev.mcsupermods.runtime.events;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * Explosions without scripts (ADR 0090 D6): the {@code explode} action and a vehicle's {@code health.explodes}. Vanilla's
 * explosion with a damage source naming who caused it, so kills and advancements credit the player; blocks break only
 * when asked, as vanilla's block explosions do ({@code Level.ExplosionInteraction.BLOCK}, which follows the gamerule
 * {@code block_explosion_drop_decay}); otherwise only entities are hurt.
 */
public final class Explosions {
    /** The largest {@code power} of the action (mcdoc {@code float @ 0..10}). */
    public static final float MAX_POWER = 10;

    private Explosions() {}

    /**
     * The {@code explode} action: at the event's position ({@link EventContext#origin()}: the block of a block event, the
     * entity of an entity or vehicle event, where a throwable hit, the player of an item or effect event) or, with
     * {@code at: other}, at the other entity (nothing without one). The event's entity is the explosion's direct source
     * (so a vehicle's own explosion spares it) and the player, else the entity, its cause.
     */
    public static void explode(Action.Explode a, EventContext ctx) {
        Vec3 at;
        if (a.at() == Action.ExplodeAt.OTHER) {
            if (ctx.other() == null) {
                return;
            }
            at = ctx.other().position();
        } else {
            at = ctx.origin();
        }
        Entity cause = ctx.player() != null ? ctx.player() : ctx.entity();
        explode(ctx.level(), ctx.entity(), cause, at, a.power(), a.fire(), a.breaksBlocks());
    }

    /** An explosion of {@code power} at {@code at}; {@code direct} and {@code cause} may be null. */
    public static void explode(ServerLevel level, Entity direct, Entity cause, Vec3 at, float power, boolean fire, boolean breaksBlocks) {
        DamageSource source = level.damageSources().explosion(direct, cause);
        level.explode(direct, source, null, at.x, at.y, at.z, power, fire,
                breaksBlocks ? Level.ExplosionInteraction.BLOCK : Level.ExplosionInteraction.NONE);
    }
}
