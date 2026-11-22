package dev.mcsupermods.runtime.gametest.spike5;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LevelEvent;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FlowingFluid;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.redstone.Orientation;

/**
 * B525 spike (throwaway), X25: a project liquid block with its own mixing check (ADR 0108 D1). When the block is placed
 * or a neighbour changes, the fluid it holds looks at its five neighbours other than the one below; if one holds the
 * fluid a rule names ({@code water} or {@code lava}: the fluid tag; anything else: a fluid id, both registry entries on
 * 26.3), this block becomes the rule's {@code source} block (a source) or {@code flowing} block (flowing) with the lava
 * fizz level event, and vanilla's own checks ({@code super}) do not run. Otherwise everything is vanilla's
 * {@code LiquidBlock}.
 */
public class B525Liquid extends LiquidBlock {
    /** One mixing rule: {@code with} is "water", "lava" or a fluid id. */
    public record Mix(String with, Block source, Block flowing) {}

    public static final List<String> LOG = new CopyOnWriteArrayList<>();

    private final Identifier id;
    private final List<Mix> mixes;

    /** When true, vanilla's own checks never run: the fluid tick is scheduled here instead of by {@code super}. */
    private final boolean ownChecksOnly;

    public B525Liquid(FlowingFluid fluid, Properties properties, Identifier id, List<Mix> mixes, boolean ownChecksOnly) {
        super(fluid, properties);
        this.id = id;
        this.mixes = mixes;
        this.ownChecksOnly = ownChecksOnly;
    }

    private void scheduleFluidTick(BlockState state, Level level, BlockPos pos) {
        level.scheduleTick(pos, state.getFluidState().getType(), fluid.getTickDelay(level));
    }

    static boolean matches(Mix mix, FluidState other) {
        if (other.isEmpty()) {
            return false;
        }
        return switch (mix.with()) {
            case "water" -> other.is(FluidTags.WATER);
            case "lava" -> other.is(FluidTags.LAVA);
            default -> {
                Fluid named = BuiltInRegistries.FLUID.getValue(Identifier.parse(mix.with()));
                // Same liquid on both versions: the same liquid block (26.3 has two fluids per liquid, 26.4 one, and
                // Fluid.isSame exists on 26.3 only).
                yield named != null && !named.defaultFluidState().isEmpty()
                        && other.createLegacyBlock().getBlock() == named.defaultFluidState().createLegacyBlock().getBlock();
            }
        };
    }

    /** Our check: true when this block was replaced by a rule's block. */
    boolean mix(Level level, BlockPos pos, BlockState state) {
        if (level.isClientSide()) {
            return false;
        }
        FluidState mine = state.getFluidState();
        for (Direction d : Direction.values()) {
            if (d == Direction.DOWN) {
                continue;
            }
            FluidState other = level.getFluidState(pos.relative(d));
            if (other.isEmpty() || other.createLegacyBlock().getBlock() == state.getBlock()) {
                continue;
            }
            for (Mix rule : mixes) {
                if (matches(rule, other)) {
                    Block result = mine.isSource() ? rule.source() : rule.flowing();
                    level.setBlockAndUpdate(pos, result.defaultBlockState());
                    level.levelEvent(LevelEvent.LAVA_FIZZ, pos, 0);
                    LOG.add(id.getPath() + " (" + (mine.isSource() ? "source" : "flowing " + mine.getAmount()) + ") at " + pos.toShortString()
                            + " met " + BuiltInRegistries.FLUID.getKey(other.getType()) + " on its " + d + " side -> "
                            + BuiltInRegistries.BLOCK.getKey(result) + " tick " + level.getGameTime());
                    return true;
                }
            }
        }
        return false;
    }

    @Override
    protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState old, boolean movedByPiston) {
        if (!mix(level, pos, state)) {
            if (ownChecksOnly) {
                scheduleFluidTick(state, level, pos);
            } else {
                super.onPlace(state, level, pos, old, movedByPiston);
            }
        }
    }

    @Override
    protected void neighborChanged(BlockState state, Level level, BlockPos pos, Block block, Orientation orientation, boolean movedByPiston) {
        if (!mix(level, pos, state)) {
            if (ownChecksOnly) {
                scheduleFluidTick(state, level, pos);
            } else {
                super.neighborChanged(state, level, pos, block, orientation, movedByPiston);
            }
        }
    }
}
