package dev.mcsupermods.runtime.goals;

import dev.mcsupermods.runtime.components.Goal.DigItems;
import dev.mcsupermods.runtime.registry.mob.MobHabits;
import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.level.block.state.BlockState;

/**
 * {@code dig_items} (ADR 0109 D4, sniffer-like): once its cooldown is over, the mob walks to the nearest of its
 * {@code dig_blocks} within {@link #SEARCH} blocks (looking about every {@link #SEARCH_INTERVAL} ticks), digs there for
 * {@link MobHabits#DIG_TICKS} ticks (the block's particles) and drops a roll of {@code loot_table}
 * ({@link MobHabits#digUp}), then waits {@code interval_ticks}. A walk gives up after {@link #GIVE_UP_TICKS}.
 */
public class DigForItemsGoal extends Goal {
    public static final int SEARCH = 8;
    static final int SEARCH_INTERVAL = 20;
    public static final int GIVE_UP_TICKS = 400;

    private final PathfinderMob mob;
    private final MobHabits habits;
    private final DigItems dig;
    private BlockPos site;
    private int searchIn;
    private int ticks;
    private int digging;

    public DigForItemsGoal(PathfinderMob mob, MobHabits habits, DigItems dig) {
        this.mob = mob;
        this.habits = habits;
        this.dig = dig;
        setFlags(EnumSet.of(Flag.MOVE, Flag.JUMP));
    }

    private boolean diggable(BlockPos p) {
        return habits.isDigBlock(mob.level().getBlockState(p)) && mob.level().getBlockState(p.above()).getCollisionShape(mob.level(), p.above()).isEmpty();
    }

    private BlockPos search() {
        BlockPos below = mob.getBlockPosBelowThatAffectsMyMovement();
        if (mob.onGround() && habits.isDigBlock(mob.level().getBlockState(below))) {
            return below;
        }
        if (--searchIn > 0) {
            return null;
        }
        searchIn = SEARCH_INTERVAL / 2; // the selector asks about every other tick
        BlockPos at = mob.blockPosition();
        BlockPos best = null;
        for (BlockPos p : BlockPos.betweenClosed(at.offset(-SEARCH, -3, -SEARCH), at.offset(SEARCH, 2, SEARCH))) {
            if (diggable(p) && (best == null || p.distSqr(at) < best.distSqr(at))) {
                best = p.immutable();
            }
        }
        return best;
    }

    @Override
    public boolean canUse() {
        if (habits.digCooldown() > 0 || habits.playingDead() || mob.isPassenger()) {
            return false;
        }
        site = search();
        return site != null;
    }

    @Override
    public boolean canContinueToUse() {
        return site != null && habits.digCooldown() == 0 && ticks < GIVE_UP_TICKS && habits.isDigBlock(mob.level().getBlockState(site));
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        ticks = 0;
        digging = 0;
        mob.getNavigation().moveTo(site.getX() + 0.5, site.getY() + 1, site.getZ() + 0.5, dig.speed());
    }

    @Override
    public void stop() {
        site = null;
        digging = 0;
        mob.getNavigation().stop();
    }

    /** Ticks spent digging on the current site (for the GameTests). */
    public int digging() {
        return digging;
    }

    @Override
    public void tick() {
        ticks++;
        BlockPos below = mob.getBlockPosBelowThatAffectsMyMovement();
        if (!mob.onGround() || !below.equals(site)) {
            digging = 0;
            if (mob.getNavigation().isDone()) {
                mob.getNavigation().moveTo(site.getX() + 0.5, site.getY() + 1, site.getZ() + 0.5, dig.speed());
            }
            return;
        }
        mob.getNavigation().stop();
        digging++;
        if (mob.level() instanceof ServerLevel level) {
            BlockState state = level.getBlockState(site);
            if (digging % 5 == 0) {
                level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, state), mob.getX(), site.getY() + 1.0, mob.getZ(), 4,
                        0.3, 0.05, 0.3, 0.0);
            }
            if (digging >= MobHabits.DIG_TICKS) {
                habits.digUp(level);
                site = null;
            }
        }
    }
}
