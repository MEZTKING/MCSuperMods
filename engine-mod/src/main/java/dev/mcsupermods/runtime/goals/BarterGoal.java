package dev.mcsupermods.runtime.goals;

import dev.mcsupermods.runtime.registry.mob.MobHabits;
import java.util.EnumSet;
import java.util.List;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.item.ItemEntity;

/**
 * {@code barter} with {@code from_ground} (ADR 0109 D4, piglin-like): while the mob waits for an item
 * ({@link MobHabits#wantsBarterItem}), it walks to the nearest of its {@code item} lying free within {@link #SEARCH} blocks
 * (looking every {@link #SEARCH_INTERVAL} ticks; never one it threw) and takes one of it; the habit rolls the loot after
 * {@code ticks}. Taking from a player's hand is the habit's click, not this goal.
 */
public class BarterGoal extends Goal {
    public static final double SEARCH = 8.0;
    static final int SEARCH_INTERVAL = 10;
    static final double REACH = 1.5;

    private final PathfinderMob mob;
    /** Calls of canUse left before the next look round (the selector does not ask every tick). */
    private int searchIn;
    private final MobHabits habits;
    private final double speed;
    private ItemEntity aim;

    public BarterGoal(PathfinderMob mob, MobHabits habits, double speed) {
        this.mob = mob;
        this.habits = habits;
        this.speed = speed;
        setFlags(EnumSet.of(Flag.MOVE));
    }

    private boolean wanted(ItemEntity item) {
        return item.isAlive() && !item.hasPickUpDelay() && item.getOwner() != mob && habits.isBarterItem(item.getItem());
    }

    @Override
    public boolean canUse() {
        if (!habits.wantsBarterItem() || --searchIn > 0) {
            return false;
        }
        searchIn = SEARCH_INTERVAL / 2;
        List<ItemEntity> near = mob.level().getEntitiesOfClass(ItemEntity.class, mob.getBoundingBox().inflate(SEARCH, 4, SEARCH), this::wanted);
        aim = null;
        for (ItemEntity item : near) {
            if (aim == null || mob.distanceToSqr(item) < mob.distanceToSqr(aim)) {
                aim = item;
            }
        }
        return aim != null;
    }

    @Override
    public boolean canContinueToUse() {
        return aim != null && wanted(aim) && habits.wantsBarterItem();
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        mob.getNavigation().moveTo(aim, speed);
    }

    @Override
    public void stop() {
        aim = null;
        mob.getNavigation().stop();
    }

    @Override
    public void tick() {
        if (aim == null) {
            return;
        }
        if (mob.distanceTo(aim) <= REACH) {
            mob.take(aim, 1);
            habits.takeBarterItem(aim.getItem());
            if (aim.getItem().isEmpty()) {
                aim.discard();
            }
            aim = null;
            return;
        }
        if (mob.getNavigation().isDone()) {
            mob.getNavigation().moveTo(aim, speed);
        }
    }
}
