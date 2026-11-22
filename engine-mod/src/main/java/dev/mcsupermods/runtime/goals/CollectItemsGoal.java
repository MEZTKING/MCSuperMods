package dev.mcsupermods.runtime.goals;

import dev.mcsupermods.runtime.components.Goal.CollectItems;
import dev.mcsupermods.runtime.registry.mob.MobHabits;
import java.util.EnumSet;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/**
 * {@code collect_items} (ADR 0109 D4 as amended after B524, allay-like): once a player has given the mob an item
 * ({@link MobHabits#liked}), it fetches items of that kind lying free within {@code range} blocks (looking about every
 * {@link #SEARCH_INTERVAL} ticks; never an item it threw itself, which carries it as the thrower) and carries up to a
 * stack. When its load is full or nothing is left to fetch, it brings the load to the note block it heard within the
 * last 30 seconds ({@code note_blocks}), else to its owner, and throws it there from {@link #DROP_RANGE} blocks (to the
 * owner only that player can pick it up). The way to an item gives up after {@link #GIVE_UP_TICKS}.
 */
public class CollectItemsGoal extends Goal {
    static final int SEARCH_INTERVAL = 10;
    public static final double REACH = 1.5;
    public static final double DROP_RANGE = 2.5;
    public static final int GIVE_UP_TICKS = 200;
    /** Ticks before the owner can pick a thrown load up. */
    static final int PICKUP_DELAY = 10;

    private final PathfinderMob mob;
    /** Calls of canUse left before the next look round (the selector does not ask every tick). */
    private int searchIn;
    private final MobHabits habits;
    private final CollectItems collect;
    private ItemEntity aim;
    private int ticks;

    public CollectItemsGoal(PathfinderMob mob, MobHabits habits, CollectItems collect) {
        this.mob = mob;
        this.habits = habits;
        this.collect = collect;
        setFlags(EnumSet.of(Flag.MOVE));
    }

    private ItemEntity nearest() {
        double range = collect.range();
        List<ItemEntity> near = mob.level().getEntitiesOfClass(ItemEntity.class, mob.getBoundingBox().inflate(range), habits::wants);
        ItemEntity best = null;
        for (ItemEntity item : near) {
            if (mob.distanceToSqr(item) <= range * range && (best == null || mob.distanceToSqr(item) < mob.distanceToSqr(best))) {
                best = item;
            }
        }
        return best;
    }

    private boolean full() {
        ItemStack carried = habits.carried();
        return !carried.isEmpty() && carried.getCount() >= carried.getMaxStackSize();
    }

    /** Where the load goes now: the heard note block's top, the owner, or null. */
    private Vec3 destination() {
        BlockPos note = habits.noteBlock();
        if (note != null) {
            return Vec3.atBottomCenterOf(note.above());
        }
        Player owner = habits.owner();
        return owner != null && owner.isAlive() && !owner.isSpectator() ? owner.position() : null;
    }

    @Override
    public boolean canUse() {
        if (habits.liked().isEmpty() || habits.playingDead() || --searchIn > 0) {
            return false;
        }
        searchIn = SEARCH_INTERVAL / 2;
        aim = full() ? null : nearest();
        return aim != null || !habits.carried().isEmpty() && destination() != null;
    }

    @Override
    public boolean canContinueToUse() {
        if (habits.liked().isEmpty() || ticks >= GIVE_UP_TICKS) {
            return false;
        }
        return aim != null ? habits.wants(aim) : !habits.carried().isEmpty() && destination() != null;
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        ticks = 0;
    }

    @Override
    public void stop() {
        aim = null;
        mob.getNavigation().stop();
    }

    @Override
    public void tick() {
        ticks++;
        if (!(mob.level() instanceof ServerLevel level)) {
            return;
        }
        if (aim != null) {
            if (mob.distanceTo(aim) <= REACH) {
                take(aim);
                aim = full() ? null : nearest();
                ticks = 0;
            } else if (mob.getNavigation().isDone() || mob.tickCount % 10 == 0) {
                mob.getNavigation().moveTo(aim, collect.speed());
            }
            return;
        }
        Vec3 to = destination();
        if (to == null) {
            return;
        }
        if (mob.position().distanceTo(to) <= DROP_RANGE) {
            deliver(level, to);
            return;
        }
        if (mob.getNavigation().isDone() || mob.tickCount % 10 == 0) {
            mob.getNavigation().moveTo(to.x, to.y, to.z, collect.speed());
        }
    }

    private void take(ItemEntity item) {
        ItemStack stack = item.getItem();
        ItemStack carried = habits.carried();
        int room = carried.isEmpty() ? stack.getMaxStackSize() : carried.getMaxStackSize() - carried.getCount();
        int amount = Math.min(room, stack.getCount());
        if (amount <= 0) {
            return;
        }
        mob.take(item, amount);
        if (carried.isEmpty()) {
            habits.setCarried(stack.copyWithCount(amount));
        } else {
            carried.grow(amount);
        }
        stack.shrink(amount);
        if (stack.isEmpty()) {
            item.discard();
        }
    }

    private void deliver(ServerLevel level, Vec3 to) {
        ItemStack load = habits.carried();
        habits.setCarried(ItemStack.EMPTY);
        ItemEntity thrown = new ItemEntity(level, mob.getX(), mob.getEyeY() - 0.3, mob.getZ(), load);
        Vec3 push = to.subtract(mob.position());
        thrown.setDeltaMovement(push.lengthSqr() < 1.0e-6 ? Vec3.ZERO : push.normalize().scale(0.2).add(0, 0.1, 0));
        thrown.setPickUpDelay(PICKUP_DELAY);
        thrown.setThrower(mob);
        Player owner = habits.owner();
        if (habits.noteBlock() == null && owner != null) {
            thrown.setTarget(owner.getUUID());
        }
        level.addFreshEntity(thrown);
        mob.getNavigation().stop();
    }
}
