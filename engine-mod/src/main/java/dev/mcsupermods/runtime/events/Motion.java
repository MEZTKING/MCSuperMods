package dev.mcsupermods.runtime.events;

import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

/**
 * Sets an entity's velocity so the game moves it smoothly, as slime blocks and wind charges do (ADR 0052): the
 * server's motion is changed and {@code syncVelocity} and {@code needsSync} make it send the new motion to the clients,
 * which is what moves a player (the 26.x names of the old {@code hurtMarked} and {@code hasImpulse}; checked in the 26.3
 * and 26.4-snapshot-7 server jars). Each component is clamped to {@link #LIMIT} blocks per tick.
 */
public final class Motion {
    /** The largest speed per axis, in blocks per tick (vanilla clamps sent motion near this). */
    public static final double LIMIT = 10.0;

    private Motion() {}

    private static double clamp(double value) {
        if (!Double.isFinite(value)) return 0.0;
        return Math.max(-LIMIT, Math.min(LIMIT, value));
    }

    /** Replaces the entity's velocity. */
    public static void set(Entity entity, double x, double y, double z) {
        entity.setDeltaMovement(clamp(x), clamp(y), clamp(z));
        entity.syncVelocity = true;
        entity.needsSync = true;
    }

    /** Adds to the entity's velocity. */
    public static void add(Entity entity, double x, double y, double z) {
        Vec3 current = entity.getDeltaMovement();
        set(entity, current.x + x, current.y + y, current.z + z);
    }
}
