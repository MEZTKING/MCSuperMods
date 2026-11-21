package dev.mcsupermods.runtime.goals;

import dev.mcsupermods.runtime.registry.mob.MobShoulder;
import java.util.EnumSet;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;

/**
 * The shoulder pet's way up (ADR 0098 D4, {@code msm:shoulder_riding}): when {@link MobShoulder#ownerToPerchOn} names
 * an owner, the pet walks to it and perches once within {@link MobShoulder#PERCH_REACH}. It gives up when the owner
 * no longer allows it, moves out of twice the start range, or after {@link #GIVE_UP_TICKS}.
 */
public class PerchOnOwnerGoal extends Goal {
    /** Ticks the pet tries before giving up (it may start again at once). */
    static final int GIVE_UP_TICKS = 200;

    private final TamableAnimal pet;
    private final MobShoulder shoulder;
    private final double speed;
    private Player owner;
    private int ticks;

    public PerchOnOwnerGoal(TamableAnimal pet, MobShoulder shoulder, double speed) {
        this.pet = pet;
        this.shoulder = shoulder;
        this.speed = speed;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP));
    }

    @Override
    public boolean canUse() {
        owner = shoulder.ownerToPerchOn();
        return owner != null;
    }

    @Override
    public boolean canContinueToUse() {
        double range = MobShoulder.START_RANGE * 2;
        return owner != null && ticks < GIVE_UP_TICKS && !shoulder.perched() && shoulder.refusal(owner) == null
                && pet.distanceToSqr(owner) <= range * range;
    }

    @Override
    public void start() {
        ticks = 0;
        pet.getNavigation().moveTo(owner, speed);
    }

    @Override
    public void stop() {
        owner = null;
        pet.getNavigation().stop();
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void tick() {
        ticks++;
        pet.getLookControl().setLookAt(owner, 10.0f, pet.getMaxHeadXRot());
        if (pet.distanceToSqr(owner) <= MobShoulder.PERCH_REACH * MobShoulder.PERCH_REACH) {
            shoulder.perch(owner);
            return;
        }
        if (ticks % 10 == 0) {
            pet.getNavigation().moveTo(owner, speed);
        }
    }
}
