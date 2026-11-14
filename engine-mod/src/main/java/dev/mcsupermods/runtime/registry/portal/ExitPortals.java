package dev.mcsupermods.runtime.registry.portal;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Exit portals for {@code arrival: portal} (ADR 0077 D6), written from the ADR, never from vanilla's {@code PortalForcer}:
 * the nearest indexed portal of the same block within the caller's radius; else a new exit with a
 * {@value #EXIT_WIDTH} by {@value #EXIT_HEIGHT} inside built on the closest build site within {@value #BUILD_SEARCH}
 * blocks (x and z) of the target, between the level's lowest y and the top of its logical height; else a forced build at
 * the target on a platform of the frame block with the space around the inside cleared. A built exit is indexed.
 *
 * <p>A build site for an inside whose lowest block is {@code p}: the whole frame (four columns along the axis, five
 * rows from {@code p.below()} to {@code p.above(3)}) fits in blocks that can be replaced and hold no fluid, the four
 * blocks under the frame are sturdy on top, and the two blocks on each side of the bottom two inside rows (where a
 * traveller steps out) are free the same way. The closest site to the target wins (squared distance; on a tie the column nearer in x and z, then the lower y);
 * the entry's axis is tried first, then the other one.
 */
public final class ExitPortals {
    /** How far (x and z) from the target a build site is looked for. */
    public static final int BUILD_SEARCH = 16;
    public static final int EXIT_WIDTH = 2;
    public static final int EXIT_HEIGHT = 3;
    /** Frame, platform and cleared blocks are set with {@code Block.UPDATE_ALL}; the inside with {@link PortalFrame#FILL_FLAGS}. */
    public static final int BUILD_FLAGS = Block.UPDATE_ALL;

    private ExitPortals() {}

    /** The highest y a block may take in the level: the top of its logical height, at most its build height. */
    public static int topY(ServerLevel level) {
        return Math.min(level.getMaxY(), level.getMinY() + level.getLogicalHeight() - 1);
    }

    /**
     * The exit for a traveller arriving near {@code target}: the nearest indexed portal of {@code portal} within the square
     * {@code radius} (stale entries dropped), else a new one ({@link #build}). {@code target} is first clamped to the world
     * border.
     */
    public static PortalFrame.Rectangle findOrBuild(ServerLevel level, BlockPos target, Direction.Axis axis, Block portal, BlockState frame,
            int radius) {
        BlockPos clamped = clampToBorder(level, target);
        Optional<PortalIndex.Entry> existing = PortalIndexAttachment.nearest(level, PortalIndexAttachment.id(portal), clamped, radius);
        return existing.map(PortalIndex.Entry::rectangle).orElseGet(() -> build(level, clamped, axis, portal, frame));
    }

    /**
     * Builds and indexes a new exit near {@code target}: on the closest build site ({@link #findSite}, the given axis
     * first), else forced at the target ({@link #forceBuild}).
     */
    public static PortalFrame.Rectangle build(ServerLevel level, BlockPos target, Direction.Axis axis, Block portal, BlockState frame) {
        BlockPos clamped = clampToBorder(level, target);
        Direction.Axis other = axis == Direction.Axis.X ? Direction.Axis.Z : Direction.Axis.X;
        Optional<PortalFrame.Rectangle> site = findSite(level, clamped, axis);
        if (site.isEmpty()) {
            site = findSite(level, clamped, other);
        }
        if (site.isEmpty()) {
            return forceBuild(level, clamped, axis, portal, frame);
        }
        PortalFrame.Rectangle rectangle = site.get();
        placeFrame(level, rectangle, frame);
        PortalFrame.fill(level, rectangle, portal.defaultBlockState());
        PortalIndexAttachment.add(level, portal, rectangle);
        return rectangle;
    }

    /**
     * The closest build site for an exit on {@code axis} within {@value #BUILD_SEARCH} blocks (x and z) of {@code target},
     * as a {@value #EXIT_WIDTH} by {@value #EXIT_HEIGHT} rectangle, or empty.
     */
    public static Optional<PortalFrame.Rectangle> findSite(ServerLevel level, BlockPos target, Direction.Axis axis) {
        int lowest = level.getMinY() + 2;
        int highest = topY(level) - EXIT_HEIGHT;
        if (lowest > highest) {
            return Optional.empty();
        }
        List<int[]> columns = new ArrayList<>();
        for (int dx = -BUILD_SEARCH; dx <= BUILD_SEARCH; dx++) {
            for (int dz = -BUILD_SEARCH; dz <= BUILD_SEARCH; dz++) {
                columns.add(new int[] {dx, dz});
            }
        }
        columns.sort(Comparator.comparingInt((int[] c) -> c[0] * c[0] + c[1] * c[1]).thenComparingInt(c -> c[0]).thenComparingInt(c -> c[1]));
        long best = Long.MAX_VALUE;
        BlockPos bestPos = null;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (int[] c : columns) {
            long flat = (long) c[0] * c[0] + (long) c[1] * c[1];
            if (flat > best) {
                break;
            }
            for (int y = lowest; y <= highest; y++) {
                long dy = y - target.getY();
                long distance = flat + dy * dy;
                if (distance >= best) {
                    if (y > target.getY()) {
                        break;
                    }
                    continue;
                }
                p.set(target.getX() + c[0], y, target.getZ() + c[1]);
                if (isSite(level, p, axis)) {
                    best = distance;
                    bestPos = p.immutable();
                }
            }
        }
        return bestPos == null ? Optional.empty() : Optional.of(new PortalFrame.Rectangle(bestPos, axis, EXIT_WIDTH, EXIT_HEIGHT));
    }

    /** Whether an exit with its lowest inside block at {@code min} on {@code axis} can be built there (see the class). */
    public static boolean isSite(ServerLevel level, BlockPos min, Direction.Axis axis) {
        Direction right = PortalFrame.along(axis);
        // Cheap rejections first: sturdy ground under the first frame column, free space for its bottom frame block.
        for (int i = -1; i <= EXIT_WIDTH; i++) {
            BlockPos column = min.relative(right, i);
            BlockPos ground = column.below(2);
            if (!level.getBlockState(ground).isFaceSturdy(level, ground, Direction.UP) || !isFree(level, column.below())) {
                return false;
            }
        }
        for (int i = -1; i <= EXIT_WIDTH; i++) {
            BlockPos column = min.relative(right, i);
            for (int up = 0; up <= EXIT_HEIGHT; up++) {
                if (!isFree(level, column.above(up))) {
                    return false;
                }
            }
        }
        Direction side = right.getClockWise();
        for (int i = 0; i < EXIT_WIDTH; i++) {
            for (int up = 0; up < 2; up++) {
                BlockPos inside = min.relative(right, i).above(up);
                if (!isFree(level, inside.relative(side)) || !isFree(level, inside.relative(side.getOpposite()))) {
                    return false;
                }
            }
        }
        return true;
    }

    private static boolean isFree(ServerLevel level, BlockPos pos) {
        BlockState state = level.getBlockState(pos);
        return state.canBeReplaced() && state.getFluidState().isEmpty();
    }

    /**
     * Builds and indexes an exit with its lowest inside block at {@code target} (y kept between the level's lowest y and
     * the top of its logical height): a platform of {@code frame} three blocks across under the frame, the blocks on both
     * sides of the inside cleared to air, the frame with its corners, and the inside filled with {@code portal}.
     */
    public static PortalFrame.Rectangle forceBuild(ServerLevel level, BlockPos target, Direction.Axis axis, Block portal, BlockState frame) {
        int y = Math.max(level.getMinY() + 1, Math.min(topY(level) - EXIT_HEIGHT, target.getY()));
        PortalFrame.Rectangle rectangle = new PortalFrame.Rectangle(new BlockPos(target.getX(), y, target.getZ()), axis, EXIT_WIDTH, EXIT_HEIGHT);
        Direction right = rectangle.along();
        Direction side = right.getClockWise();
        BlockState air = Blocks.AIR.defaultBlockState();
        for (int i = -1; i <= EXIT_WIDTH; i++) {
            for (int s = -1; s <= 1; s++) {
                level.setBlock(rectangle.at(i, -1).relative(side, s), frame, BUILD_FLAGS);
            }
        }
        for (int i = 0; i < EXIT_WIDTH; i++) {
            for (int up = 0; up < EXIT_HEIGHT; up++) {
                BlockPos inside = rectangle.at(i, up);
                level.setBlock(inside.relative(side), air, BUILD_FLAGS);
                level.setBlock(inside.relative(side.getOpposite()), air, BUILD_FLAGS);
            }
        }
        placeFrame(level, rectangle, frame);
        PortalFrame.fill(level, rectangle, portal.defaultBlockState());
        PortalIndexAttachment.add(level, portal, rectangle);
        return rectangle;
    }

    /** The frame around {@code rectangle}, corners included. */
    private static void placeFrame(ServerLevel level, PortalFrame.Rectangle rectangle, BlockState frame) {
        for (int i = -1; i <= rectangle.width(); i++) {
            level.setBlock(rectangle.at(i, -1), frame, BUILD_FLAGS);
            level.setBlock(rectangle.at(i, rectangle.height()), frame, BUILD_FLAGS);
        }
        for (int up = 0; up < rectangle.height(); up++) {
            level.setBlock(rectangle.at(-1, up), frame, BUILD_FLAGS);
            level.setBlock(rectangle.at(rectangle.width(), up), frame, BUILD_FLAGS);
        }
    }

    private static BlockPos clampToBorder(ServerLevel level, BlockPos target) {
        BlockPos clamped = level.getWorldBorder().clampToBounds(target.getX(), target.getY(), target.getZ());
        return new BlockPos(clamped.getX(), target.getY(), clamped.getZ());
    }
}
