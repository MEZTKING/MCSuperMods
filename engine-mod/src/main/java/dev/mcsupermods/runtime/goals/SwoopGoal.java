package dev.mcsupermods.runtime.goals;

import java.util.EnumSet;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.phys.Vec3;

/**
 * {@code swoop} (ADR 0109 D3, phantom-like): with a target, the mob circles {@link #RADIUS} blocks round a point
 * {@code height} blocks above it for {@link #CIRCLE_TICKS} to twice that, then dives at it at twice its speed (when it can
 * see it, with {@code must_see}), hits once it touches the target and climbs back to circling. A dive gives up after
 * {@link #DIVE_TICKS} or when the mob bumps into a block.
 */
public class SwoopGoal extends Goal {
    public static final double RADIUS = 6.0;
    public static final int CIRCLE_TICKS = 60;
    public static final int DIVE_TICKS = 80;
    /** Radians the circling point moves on each tick. */
    static final double STEP = 0.08;

    private final PathfinderMob mob;
    private final double speed;
    private final double height;
    private final boolean mustSee;
    private boolean diving;
    private int ticks;
    private double angle;

    public SwoopGoal(PathfinderMob mob, double speed, double height, boolean mustSee) {
        this.mob = mob;
        this.speed = speed;
        this.height = height;
        this.mustSee = mustSee;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    private LivingEntity target() {
        LivingEntity target = mob.getTarget();
        return target != null && target.isAlive() ? target : null;
    }

    /** Whether the mob is diving now (for the GameTests). */
    public boolean diving() {
        return diving;
    }

    @Override
    public boolean canUse() {
        return target() != null;
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        circle();
        angle = Math.atan2(mob.getZ() - mob.getTarget().getZ(), mob.getX() - mob.getTarget().getX());
        mob.getNavigation().stop();
    }

    @Override
    public void stop() {
        diving = false;
        mob.setAggressive(false);
    }

    private void circle() {
        diving = false;
        ticks = CIRCLE_TICKS + mob.getRandom().nextInt(CIRCLE_TICKS + 1);
        mob.setAggressive(false);
    }

    @Override
    public void tick() {
        LivingEntity target = target();
        if (target == null) {
            return;
        }
        if (!diving) {
            angle += STEP * speed;
            double x = target.getX() + RADIUS * Math.cos(angle);
            double z = target.getZ() + RADIUS * Math.sin(angle);
            mob.getMoveControl().setWantedPosition(x, target.getY() + height, z, speed);
            if (--ticks <= 0 && (!mustSee || mob.getSensing().hasLineOfSight(target))) {
                diving = true;
                ticks = DIVE_TICKS;
                mob.setAggressive(true);
            }
            return;
        }
        Vec3 aim = target.position().add(0, target.getBbHeight() * 0.5, 0);
        mob.getMoveControl().setWantedPosition(aim.x, aim.y, aim.z, speed * 2);
        mob.getLookControl().setLookAt(target);
        if (mob.getBoundingBox().inflate(0.2).intersects(target.getBoundingBox()) && mob.level() instanceof ServerLevel level) {
            mob.doHurtTarget(level, target);
            circle();
            return;
        }
        if (--ticks <= 0 || mob.horizontalCollision) {
            circle();
        }
        mob.yBodyRot = Mth.wrapDegrees(mob.getYRot());
    }
}
