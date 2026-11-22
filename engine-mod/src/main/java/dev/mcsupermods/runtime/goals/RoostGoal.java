package dev.mcsupermods.runtime.goals;

import dev.mcsupermods.runtime.components.Goal.Roost;
import dev.mcsupermods.runtime.registry.mob.MobHabits;
import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * {@code roost} (ADR 0109 D3 as amended after B524, bat-like): by day ({@code daylight}) or now and then while it has
 * nothing to do ({@code when_idle}: one chance in {@link #IDLE_CHANCE} at each goal check, and at the latest at the
 * {@link #IDLE_MAX_CHECKS}th, so an idle mob under a ceiling always roosts within about 160 ticks), a mob with a block
 * above it within {@code range} (one whose underside is sturdy) goes up under it and hangs there upside down
 * ({@link MobHabits#setRoosting}: no gravity, no motion, the box's top at the block's underside). It lets go when it is hurt, gets a target, the block goes, a player who is not a spectator
 * comes within {@link #WAKE_RANGE} blocks, or (roosting by day only) the day ends, and then waits
 * {@link MobHabits#ROOST_COOLDOWN} ticks before roosting again. A mob that cannot fly hangs only
 * from a block right over its head. The way up gives up after {@link #GIVE_UP_TICKS}.
 */
public class RoostGoal extends Goal {
    /** A player this near wakes the mob, and keeps it from roosting. */
    public static final double WAKE_RANGE = 4.0;
    public static final int GIVE_UP_TICKS = 100;
    /** One chance in this many, at each goal check (every other tick), for {@code when_idle}. */
    static final int IDLE_CHANCE = 40;
    /** The goal check at which an idle roost starts whatever the chance said (B544: the wait has an upper bound). */
    public static final int IDLE_MAX_CHECKS = 2 * IDLE_CHANCE;

    private final PathfinderMob mob;
    private final MobHabits habits;
    private final Roost roost;
    private final boolean flies;
    /** The block it hangs from. */
    private BlockPos ceiling;
    private int ticks;
    /** Whether it hung during this run of the goal (letting go then ends the goal). */
    private boolean hung;
    /** The idle goal checks since the last try, for {@link #IDLE_MAX_CHECKS}. */
    private int idleChecks;

    public RoostGoal(PathfinderMob mob, MobHabits habits, Roost roost, boolean flies) {
        this.mob = mob;
        this.habits = habits;
        this.roost = roost;
        this.flies = flies;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP));
    }

    /** The first block above the mob within {@code range} whose underside is sturdy, or null. */
    public static BlockPos ceilingAbove(PathfinderMob mob, int range) {
        Level level = mob.level();
        BlockPos head = BlockPos.containing(mob.getX(), mob.getBoundingBox().maxY - 1.0e-3, mob.getZ());
        for (int dy = 1; dy <= range; dy++) {
            BlockPos p = head.above(dy);
            if (level.getBlockState(p).isAir()) {
                continue;
            }
            return level.getBlockState(p).isFaceSturdy(level, p, Direction.DOWN) ? p : null;
        }
        return null;
    }

    private boolean playerNear() {
        return mob.level().getNearestPlayer(mob.getX(), mob.getY(), mob.getZ(), WAKE_RANGE, p -> !p.isSpectator()) != null;
    }

    private boolean wanted() {
        if (mob.getTarget() != null || mob.isPassenger() || mob.isLeashed() || playerNear()) {
            return false;
        }
        return roost.daylight() && mob.level().isBrightOutside() || roost.whenIdle();
    }

    @Override
    public boolean canUse() {
        if (habits.roosting()) {
            ceiling = ceilingAbove(mob, roost.range());
            return true; // loaded hanging, or hung by a command: carry on
        }
        if (habits.roostCooldown() > 0 || !wanted()) {
            return false;
        }
        if (!(roost.daylight() && mob.level().isBrightOutside()) && mob.getRandom().nextInt(IDLE_CHANCE) != 0
                && ++idleChecks < IDLE_MAX_CHECKS) {
            return false;
        }
        idleChecks = 0;
        ceiling = ceilingAbove(mob, flies ? roost.range() : 1);
        return ceiling != null;
    }

    @Override
    public boolean canContinueToUse() {
        if (ceiling == null || mob.level().getBlockState(ceiling).isAir()) {
            return false;
        }
        if (!habits.roosting()) {
            return !hung && ticks < GIVE_UP_TICKS && wanted();
        }
        return wanted();
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        ticks = 0;
        hung = habits.roosting();
        mob.getNavigation().stop();
    }

    @Override
    public void stop() {
        if (habits.roosting()) {
            habits.setRoosting(false, mob.position());
        }
        ceiling = null;
    }

    /** Where the mob's feet go to hang from {@link #ceiling}: under its middle, the box's top at its underside. */
    private Vec3 hangAt() {
        return new Vec3(ceiling.getX() + 0.5, ceiling.getY() - mob.getBbHeight(), ceiling.getZ() + 0.5);
    }

    @Override
    public void tick() {
        if (ceiling == null) {
            return;
        }
        Vec3 at = hangAt();
        if (habits.roosting()) {
            mob.setPos(at.x, at.y, at.z);
            mob.setDeltaMovement(Vec3.ZERO);
            return;
        }
        ticks++;
        if (!flies || mob.position().distanceToSqr(at) < 0.25) {
            habits.setRoosting(true, at);
            hung = true;
            return;
        }
        mob.getMoveControl().setWantedPosition(at.x, at.y, at.z, 1.0);
    }
}
