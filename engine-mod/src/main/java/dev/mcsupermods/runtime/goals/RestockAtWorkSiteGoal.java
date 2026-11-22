package dev.mcsupermods.runtime.goals;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.TraderParser;
import dev.mcsupermods.runtime.registry.mob.MobTrader;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;
import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.TagKey;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/**
 * Restocking at a work site (ADR 0107 D3 as amended after the B524 spike, {@code msm:trader} {@code work_site}): when
 * the trader's restock is due ({@link MobTrader#restockPending}), it looks for the nearest block matching the work site
 * (a block id or {@code #}-prefixed block tag) within {@link TraderParser.Trader#WORK_SITE_RANGE} blocks, at most once
 * every {@link #SEARCH_COOLDOWN} ticks and only in loaded chunks, walks there and restocks once its centre is within
 * {@link TraderParser.Trader#WORK_SITE_REACH} blocks ({@link MobTrader#restockAtWorkSite}). It does not run while the
 * trader trades, fights, rides or is ridden, and gives up a site after {@link #GIVE_UP_TICKS} (it searches again later).
 * Without a site in range the offers stay used up.
 */
public class RestockAtWorkSiteGoal extends Goal {
    /** Ticks between two searches. */
    public static final int SEARCH_COOLDOWN = 40;
    /** Ticks the trader walks towards one site before giving up. */
    public static final int GIVE_UP_TICKS = 1200;
    /** Ticks between two path requests while walking. */
    static final int REPATH_TICKS = 20;
    private static final double SPEED = 1.0;
    /** Work sites already warned about, so an unknown block logs once. */
    private static final Set<String> WARNED = ConcurrentHashMap.newKeySet();

    private final PathfinderMob mob;
    private final MobTrader trader;
    private final Predicate<BlockState> site;
    private BlockPos target;
    private int nextSearch;
    private int ticks;

    public RestockAtWorkSiteGoal(PathfinderMob mob, MobTrader trader, String workSite) {
        this.mob = mob;
        this.trader = trader;
        this.site = matcher(workSite, BuiltInRegistries.ENTITY_TYPE.getKey(mob.getType()).toString());
        setFlags(EnumSet.of(Flag.MOVE));
    }

    /**
     * The blocks {@code workSite} names: a {@code #}-prefixed block tag, else a block id; an id that is not a registered
     * block matches nothing and is warned about once for {@code owner}.
     */
    public static Predicate<BlockState> matcher(String workSite, String owner) {
        if (workSite.startsWith("#")) {
            TagKey<Block> tag = TagKey.create(Registries.BLOCK, Identifier.parse(workSite.substring(1)));
            return state -> state.is(tag);
        }
        Identifier id = Identifier.parse(workSite);
        Optional<Block> block = BuiltInRegistries.BLOCK.getOptional(id);
        if (block.isEmpty()) {
            if (WARNED.add(owner + " " + id)) {
                MsmRuntime.LOGGER.warn("[{}] {}: msm:trader work_site {} is not a registered block; the trader never restocks",
                        MsmRuntime.MOD_ID, owner, id);
            }
            return state -> false;
        }
        Block wanted = block.get();
        return state -> state.is(wanted);
    }

    /** The site the trader walks to now, or null; for the GameTests. */
    public BlockPos target() {
        return target;
    }

    @Override
    public boolean canUse() {
        if (!free() || mob.tickCount < nextSearch) {
            return false;
        }
        nextSearch = mob.tickCount + SEARCH_COOLDOWN;
        target = nearest(mob.level(), mob.blockPosition(), site);
        return target != null;
    }

    private boolean free() {
        return trader.restockPending() && trader.getTradingPlayer() == null && mob.getTarget() == null && !mob.isVehicle()
                && !mob.isPassenger() && !mob.isLeashed();
    }

    /**
     * The nearest block matching {@code site} within {@link TraderParser.Trader#WORK_SITE_RANGE} of {@code centre} (by
     * straight-line distance), looking only in loaded chunks; null when there is none.
     */
    public static BlockPos nearest(Level level, BlockPos centre, Predicate<BlockState> site) {
        int range = TraderParser.Trader.WORK_SITE_RANGE;
        int minY = Math.max(level.getMinY(), centre.getY() - range);
        int maxY = Math.min(level.getMaxY(), centre.getY() + range);
        BlockPos best = null;
        double bestDistance = (double) range * range;
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        for (int x = centre.getX() - range; x <= centre.getX() + range; x++) {
            for (int z = centre.getZ() - range; z <= centre.getZ() + range; z++) {
                if (!level.hasChunk(SectionPos.blockToSectionCoord(x), SectionPos.blockToSectionCoord(z))) {
                    continue;
                }
                for (int y = minY; y <= maxY; y++) {
                    pos.set(x, y, z);
                    double distance = pos.distSqr(centre);
                    if (distance <= bestDistance && site.test(level.getBlockState(pos))) {
                        if (best == null || distance < bestDistance) {
                            best = pos.immutable();
                            bestDistance = distance;
                        }
                    }
                }
            }
        }
        return best;
    }

    @Override
    public boolean canContinueToUse() {
        return target != null && free() && ticks < GIVE_UP_TICKS && site.test(mob.level().getBlockState(target));
    }

    @Override
    public void start() {
        ticks = 0;
        walk();
    }

    private void walk() {
        // Towards the top of the site: the path ends beside or on it (B524).
        mob.getNavigation().moveTo(target.getX() + 0.5, target.getY() + 1, target.getZ() + 0.5, SPEED);
    }

    @Override
    public void tick() {
        ticks++;
        double reach = TraderParser.Trader.WORK_SITE_REACH;
        if (mob.position().distanceToSqr(Vec3.atCenterOf(target)) <= reach * reach) {
            mob.getNavigation().stop();
            mob.getLookControl().setLookAt(Vec3.atCenterOf(target));
            trader.restockAtWorkSite();
            return;
        }
        if (ticks % REPATH_TICKS == 0 || mob.getNavigation().isDone()) {
            walk();
        }
    }

    @Override
    public void stop() {
        target = null;
        mob.getNavigation().stop();
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }
}
