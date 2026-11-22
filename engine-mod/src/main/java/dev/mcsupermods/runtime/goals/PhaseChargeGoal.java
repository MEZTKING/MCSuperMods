package dev.mcsupermods.runtime.goals;

import dev.mcsupermods.runtime.registry.mob.MobMovement;
import java.util.EnumSet;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.phys.Vec3;

/**
 * The melee attack of a {@code phase} mob (ADR 0109 D3, vex-like; B524): it flies straight at its target's eyes, through
 * blocks ({@link MobMovement#setCharging}), hits once it touches the target, then waits {@link #COOLDOWN} ticks before the
 * next charge. A charge gives up after {@link #GIVE_UP_TICKS}. Replaces {@code MeleeAttackGoal}, which paths around walls.
 */
public class PhaseChargeGoal extends Goal {
    /** Ticks between charges. */
    public static final int COOLDOWN = 20;
    /** Ticks before a charge that has not reached its target gives up. */
    public static final int GIVE_UP_TICKS = 100;

    private final PathfinderMob mob;
    private final MobMovement movement;
    private final double speed;
    private int ticks;
    private int cooldown;
    private boolean hit;

    public PhaseChargeGoal(PathfinderMob mob, MobMovement movement, double speed) {
        this.mob = mob;
        this.movement = movement;
        this.speed = speed;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    private LivingEntity target() {
        LivingEntity target = mob.getTarget();
        return target != null && target.isAlive() ? target : null;
    }

    @Override
    public boolean canUse() {
        if (cooldown > 0) {
            cooldown--;
            return false;
        }
        return target() != null;
    }

    @Override
    public boolean canContinueToUse() {
        return !hit && ticks < GIVE_UP_TICKS && target() != null;
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        ticks = 0;
        hit = false;
        movement.setCharging(true);
        mob.setAggressive(true);
        mob.getNavigation().stop();
    }

    @Override
    public void stop() {
        movement.setCharging(false);
        mob.setAggressive(false);
        cooldown = COOLDOWN;
    }

    @Override
    public void tick() {
        ticks++;
        LivingEntity target = target();
        if (target == null) {
            return;
        }
        Vec3 eyes = target.getEyePosition();
        mob.getMoveControl().setWantedPosition(eyes.x, eyes.y, eyes.z, speed);
        mob.getLookControl().setLookAt(target);
        if (mob.getBoundingBox().inflate(0.2).intersects(target.getBoundingBox()) && mob.level() instanceof ServerLevel level) {
            mob.doHurtTarget(level, target);
            hit = true;
        }
    }
}
