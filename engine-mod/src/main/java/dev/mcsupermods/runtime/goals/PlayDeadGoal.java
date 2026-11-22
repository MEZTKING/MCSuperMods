package dev.mcsupermods.runtime.goals;

import dev.mcsupermods.runtime.registry.mob.MobHabits;
import java.util.EnumSet;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;

/**
 * {@code play_dead} (ADR 0109 D4, axolotl-like): while {@link MobHabits#playingDead()} the mob lies still. The goal takes
 * every control (move, look, jump and target), so no other goal moves or turns it, and it holds no target; the habit
 * starts it when the mob is hurt and ends it after {@code ticks}.
 */
public class PlayDeadGoal extends Goal {
    private final PathfinderMob mob;
    private final MobHabits habits;

    public PlayDeadGoal(PathfinderMob mob, MobHabits habits) {
        this.mob = mob;
        this.habits = habits;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP, Flag.TARGET));
    }

    @Override
    public boolean canUse() {
        return habits.playingDead();
    }

    @Override
    public boolean isInterruptable() {
        return false;
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        mob.getNavigation().stop();
        mob.setTarget(null);
    }

    @Override
    public void tick() {
        mob.getNavigation().stop();
        mob.setTarget(null);
        mob.setDeltaMovement(mob.getDeltaMovement().multiply(0, 1, 0));
    }
}
