package dev.mcsupermods.runtime.registry.portal;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.BlockUtil;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;

/**
 * The frame rule of ADR 0077 D2, written from the ADR: a vertical rectangle on axis x or z whose inside is
 * {@value #MIN_WIDTH} to {@value #MAX_WIDTH} blocks wide and {@value #MIN_HEIGHT} to {@value #MAX_HEIGHT} high, with
 * frame blocks along all four sides (corners are never read) and only air, {@code #minecraft:fire} or the portal's own
 * block inside. The frame test is a predicate, so a tag frame is read at use time and follows {@code /reload}.
 */
public final class PortalFrame {
    public static final int MIN_WIDTH = 2;
    public static final int MAX_WIDTH = 21;
    public static final int MIN_HEIGHT = 3;
    public static final int MAX_HEIGHT = 21;

    /**
     * The flags {@link #fill} sets portal blocks with: {@code UPDATE_CLIENTS | UPDATE_KNOWN_SHAPE} (18), the flags vanilla
     * fills its own portal with (read with {@code javap -c} on 26.3 and 26.4-snapshot-7): clients are told, but no
     * neighbour or shape update runs while the inside fills, so a half-filled portal never breaks itself.
     */
    public static final int FILL_FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE;

    private PortalFrame() {}

    /**
     * The inside of a frame: {@code min} is the lowest inside block (lowest y, and lowest x for axis x or lowest z for
     * axis z); {@code width} runs along {@code axis}, {@code height} upwards.
     */
    public record Rectangle(BlockPos min, Direction.Axis axis, int width, int height) {
        public Rectangle {
            min = min.immutable();
            if (axis == Direction.Axis.Y) {
                throw new IllegalArgumentException("a portal rectangle is vertical: axis x or z");
            }
        }

        /** The direction {@code width} runs in (east for x, south for z). */
        public Direction along() {
            return PortalFrame.along(axis);
        }

        /** The inside block {@code right} blocks along the axis and {@code up} blocks above {@link #min}. */
        public BlockPos at(int right, int up) {
            return min.relative(along(), right).above(up);
        }

        /** The highest inside block, opposite {@link #min}. */
        public BlockPos max() {
            return at(width - 1, height - 1);
        }

        /** Whether {@code pos} is inside the rectangle. */
        public boolean contains(BlockPos pos) {
            BlockPos max = max();
            return pos.getX() >= min.getX() && pos.getX() <= max.getX() && pos.getY() >= min.getY() && pos.getY() <= max.getY()
                    && pos.getZ() >= min.getZ() && pos.getZ() <= max.getZ();
        }

        /** Every inside position, bottom row first. */
        public List<BlockPos> positions() {
            List<BlockPos> out = new ArrayList<>(width * height);
            for (int up = 0; up < height; up++) {
                for (int right = 0; right < width; right++) {
                    out.add(at(right, up));
                }
            }
            return out;
        }

        /** The same rectangle as vanilla's {@code BlockUtil.FoundRectangle} (axis 1 = width, axis 2 = height). */
        public BlockUtil.FoundRectangle foundRectangle() {
            return new BlockUtil.FoundRectangle(min, width, height);
        }
    }

    /** The positive horizontal direction of a portal axis. */
    public static Direction along(Direction.Axis axis) {
        return axis == Direction.Axis.X ? Direction.EAST : Direction.SOUTH;
    }

    /** What may stand inside a frame (D2): air, a block in {@code #minecraft:fire}, or the portal's own block. */
    public static boolean isEmpty(BlockState state, Block portal) {
        return state.isAir() || state.is(BlockTags.FIRE) || state.is(portal);
    }

    /** {@link #find(LevelAccessor, BlockPos, Direction.Axis, Predicate, Block)} on axis x, then axis z. */
    public static Optional<Rectangle> find(LevelAccessor level, BlockPos inside, Predicate<BlockState> isFrame, Block portal) {
        Optional<Rectangle> x = find(level, inside, Direction.Axis.X, isFrame, portal);
        return x.isPresent() ? x : find(level, inside, Direction.Axis.Z, isFrame, portal);
    }

    /**
     * The frame around {@code inside} on {@code axis}, when the rule of D2 holds: from {@code inside} down to the bottom
     * frame, then along the bottom row to both side frames, then row by row up to a row that is frame all the way across.
     * Empty when {@code inside} is not empty, a side or the bottom or top is missing, a block stands inside, or a size
     * is outside {@value #MIN_WIDTH}..{@value #MAX_WIDTH} by {@value #MIN_HEIGHT}..{@value #MAX_HEIGHT}.
     */
    public static Optional<Rectangle> find(LevelAccessor level, BlockPos inside, Direction.Axis axis, Predicate<BlockState> isFrame,
            Block portal) {
        if (axis == Direction.Axis.Y || !isEmpty(level.getBlockState(inside), portal)) {
            return Optional.empty();
        }
        Direction right = along(axis);
        Direction left = right.getOpposite();

        // Down to the bottom frame.
        int below = 1;
        BlockState state = level.getBlockState(inside.below(below));
        while (isEmpty(state, portal)) {
            if (below >= MAX_HEIGHT) {
                return Optional.empty();
            }
            below++;
            state = level.getBlockState(inside.below(below));
        }
        if (!isFrame.test(state)) {
            return Optional.empty();
        }
        BlockPos bottom = inside.below(below - 1);

        // Along the bottom row to the left frame.
        int back = 0;
        state = level.getBlockState(bottom.relative(left, 1));
        while (isEmpty(state, portal)) {
            back++;
            if (back >= MAX_WIDTH) {
                return Optional.empty();
            }
            state = level.getBlockState(bottom.relative(left, back + 1));
        }
        if (!isFrame.test(state)) {
            return Optional.empty();
        }
        BlockPos min = bottom.relative(left, back);

        // From the left frame to the right frame.
        int width = 1;
        state = level.getBlockState(min.relative(right, width));
        while (isEmpty(state, portal)) {
            width++;
            if (width > MAX_WIDTH) {
                return Optional.empty();
            }
            state = level.getBlockState(min.relative(right, width));
        }
        if (!isFrame.test(state) || width < MIN_WIDTH) {
            return Optional.empty();
        }

        // The bottom frame under every inside column.
        for (int i = 0; i < width; i++) {
            if (!isFrame.test(level.getBlockState(min.relative(right, i).below()))) {
                return Optional.empty();
            }
        }

        // Rows upwards until one is frame all the way across (the top).
        int height = 0;
        while (true) {
            BlockPos row = min.above(height);
            if (height >= MIN_HEIGHT && rowIsFrame(level, row, right, width, isFrame)) {
                return Optional.of(new Rectangle(min, axis, width, height));
            }
            if (height >= MAX_HEIGHT) {
                return Optional.empty();
            }
            if (!isFrame.test(level.getBlockState(row.relative(left))) || !isFrame.test(level.getBlockState(row.relative(right, width)))) {
                return Optional.empty();
            }
            for (int i = 0; i < width; i++) {
                if (!isEmpty(level.getBlockState(row.relative(right, i)), portal)) {
                    return Optional.empty();
                }
            }
            height++;
        }
    }

    private static boolean rowIsFrame(LevelAccessor level, BlockPos row, Direction right, int width, Predicate<BlockState> isFrame) {
        for (int i = 0; i < width; i++) {
            if (!isFrame.test(level.getBlockState(row.relative(right, i)))) {
                return false;
            }
        }
        return true;
    }

    /** Whether the whole inside is {@code portal} (a lit portal). */
    public static boolean isComplete(LevelAccessor level, Rectangle rectangle, Block portal) {
        for (BlockPos pos : rectangle.positions()) {
            if (!level.getBlockState(pos).is(portal)) {
                return false;
            }
        }
        return true;
    }

    /** Whether the inside holds no {@code portal} block yet (a frame that can be lit). */
    public static boolean isUnlit(LevelAccessor level, Rectangle rectangle, Block portal) {
        for (BlockPos pos : rectangle.positions()) {
            if (level.getBlockState(pos).is(portal)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Fills the inside with {@code portalState}, its {@code axis} property set to the rectangle's axis when the state has
     * one ({@code BlockStateProperties.HORIZONTAL_AXIS}), with {@link #FILL_FLAGS}.
     */
    public static void fill(LevelAccessor level, Rectangle rectangle, BlockState portalState) {
        BlockState state = portalState.hasProperty(BlockStateProperties.HORIZONTAL_AXIS)
                ? portalState.setValue(BlockStateProperties.HORIZONTAL_AXIS, rectangle.axis())
                : portalState;
        for (BlockPos pos : rectangle.positions()) {
            level.setBlock(pos, state, FILL_FLAGS);
        }
    }
}
