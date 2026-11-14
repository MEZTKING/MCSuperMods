package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.registry.portal.ExitPortals;
import dev.mcsupermods.runtime.registry.portal.PortalFrame;
import dev.mcsupermods.runtime.registry.portal.PortalIndex;
import dev.mcsupermods.runtime.registry.portal.PortalIndexAttachment;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;

/**
 * The frame detector, the portal index and the exit builder (ADR 0077 D2, D5, D6; B333) with vanilla blocks only:
 * crying obsidian as the frame, glass as a stand-in portal block (vanilla's Nether portal where the axis matters), set
 * with flags that suppress neighbour and shape updates. Each test works in its own far corner of the GameTest world
 * (flat on every dimension), away from the test structures: frames in the overworld's open sky, exits on its flat
 * ground or on terrain the test builds, and the ceiling case in the Nether. Index entries a test adds are removed before
 * it succeeds. A save and load of the attachment is the Codec round trip here and in {@code PortalIndexTest}.
 */
public class MsmPortalFrameGameTest {
    private static final int FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE;
    private static final BlockState CRYING = Blocks.CRYING_OBSIDIAN.defaultBlockState();
    private static final BlockState AIR = Blocks.AIR.defaultBlockState();
    private static final Predicate<BlockState> IS_CRYING = s -> s.is(Blocks.CRYING_OBSIDIAN);
    private static final Block PORTAL = Blocks.GLASS;
    /** Exit tests clear up to here (the sky frames are at y 100 and far from them). */
    private static final int RESET_TOP = 120;
    private static final List<Direction.Axis> AXES = List.of(Direction.Axis.X, Direction.Axis.Z);

    /** A spot in the open sky of the overworld, {@code n} slots into test {@code test}'s own area. */
    private static BlockPos sky(int test, int n) {
        return new BlockPos(30_000 + test * 1_024 + n * 32, 100, 30_000);
    }

    /**
     * The flat ground's first free y at a column: up from the bottom through the generator's layers (bedrock, sandstone,
     * basalt) and the water a test laid on top. The GameTest world is kept between runs, so whatever an earlier run
     * built above the ground does not count.
     */
    private static int groundAir(ServerLevel level, int x, int z) {
        int y = level.getMinY();
        while (y < level.getMaxY()) {
            BlockState state = level.getBlockState(new BlockPos(x, y, z));
            if (!(state.is(Blocks.BEDROCK) || state.is(Blocks.SANDSTONE) || state.is(Blocks.BASALT) || state.is(Blocks.WATER))) {
                return y;
            }
            y++;
        }
        return y;
    }

    /**
     * Clears what an earlier run left (the world is kept between runs): air from {@code fromY} to {@code toY} within
     * {@code radius} of the column, and the glass index entries whose inside starts there.
     */
    private static void reset(ServerLevel level, int x, int z, int radius, int fromY, int toY) {
        for (int dx = -radius; dx <= radius; dx++) {
            for (int dz = -radius; dz <= radius; dz++) {
                for (int y = fromY; y <= toY; y++) {
                    BlockPos pos = new BlockPos(x + dx, y, z + dz);
                    if (!level.getBlockState(pos).isAir()) {
                        level.setBlock(pos, AIR, FLAGS);
                    }
                }
            }
        }
        for (PortalIndex.Entry entry : PortalIndexAttachment.get(level).entries()) {
            if (entry.block().equals(PortalIndexAttachment.id(PORTAL)) && Math.abs(entry.min().getX() - x) <= radius
                    && Math.abs(entry.min().getZ() - z) <= radius) {
                PortalIndexAttachment.remove(level, entry);
            }
        }
    }

    /** A frame around an inside of {@code width} by {@code height} at {@code min}, inside cleared, corners optional. */
    private static void frame(ServerLevel level, BlockPos min, Direction.Axis axis, int width, int height, BlockState frame,
            boolean corners) {
        Direction right = PortalFrame.along(axis);
        for (int i = -1; i <= width; i++) {
            for (int up = -1; up <= height; up++) {
                boolean side = i == -1 || i == width;
                boolean end = up == -1 || up == height;
                BlockState state = (side || end) && (corners || !(side && end)) ? frame : AIR;
                level.setBlock(min.relative(right, i).above(up), state, FLAGS);
            }
        }
    }

    private static Optional<PortalFrame.Rectangle> find(ServerLevel level, BlockPos inside, Direction.Axis axis) {
        return PortalFrame.find(level, inside, axis, IS_CRYING, PORTAL);
    }

    private static Direction.Axis other(Direction.Axis axis) {
        return axis == Direction.Axis.X ? Direction.Axis.Z : Direction.Axis.X;
    }

    // ---- the frame rule (D2) ----------------------------------------------------------------------------------------

    /** 2 by 3 and 21 by 21 (and the mixed extremes) are found from any inside corner, on both axes, and only on theirs. */
    @GameTest
    public void smallestAndLargestFramesAreFoundOnBothAxes(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        int n = 0;
        for (Direction.Axis axis : AXES) {
            for (int[] size : new int[][] {{2, 3}, {21, 21}, {21, 3}, {2, 21}}) {
                BlockPos min = sky(0, n++);
                frame(level, min, axis, size[0], size[1], CRYING, true);
                PortalFrame.Rectangle expected = new PortalFrame.Rectangle(min, axis, size[0], size[1]);
                for (BlockPos inside : List.of(expected.min(), expected.max(), expected.at(size[0] - 1, 0), expected.at(0, size[1] - 1))) {
                    helper.assertValueEqual(find(level, inside, axis), Optional.of(expected), axis + " " + size[0] + "x" + size[1] + " from " + inside);
                }
                helper.assertValueEqual(PortalFrame.find(level, expected.max(), IS_CRYING, PORTAL), Optional.of(expected), "either axis");
                helper.assertTrue(find(level, min, other(axis)).isEmpty(), "not found on the other axis");
                helper.assertValueEqual(expected.foundRectangle().axis1Size, size[0], "found rectangle width");
            }
        }
        helper.succeed();
    }

    /** 1 by 3, 2 by 2, 22 wide and 22 high are refused on both axes. */
    @GameTest
    public void framesOutsideTheSizesAreNotFound(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        int n = 0;
        for (Direction.Axis axis : AXES) {
            for (int[] size : new int[][] {{1, 3}, {2, 2}, {22, 3}, {2, 22}, {1, 1}}) {
                BlockPos min = sky(1, n++);
                frame(level, min, axis, size[0], size[1], CRYING, true);
                helper.assertTrue(find(level, min, axis).isEmpty(), axis + " " + size[0] + "x" + size[1] + " was found");
                helper.assertTrue(PortalFrame.find(level, min, IS_CRYING, PORTAL).isEmpty(), size[0] + "x" + size[1] + " on either axis");
            }
        }
        helper.succeed();
    }

    /** A frame with one block missing from a side, the bottom or the top is not a frame. */
    @GameTest
    public void aMissingSideIsNotFound(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        int n = 0;
        for (Direction.Axis axis : AXES) {
            for (int[] gap : new int[][] {{-1, 1}, {3, 2}, {1, -1}, {0, 4}, {2, 4}}) {
                BlockPos min = sky(2, n++);
                frame(level, min, axis, 3, 4, CRYING, true);
                PortalFrame.Rectangle rectangle = new PortalFrame.Rectangle(min, axis, 3, 4);
                level.setBlock(rectangle.at(gap[0], gap[1]), AIR, FLAGS);
                helper.assertTrue(find(level, min, axis).isEmpty(), axis + " gap at " + gap[0] + "," + gap[1]);
                helper.assertTrue(find(level, rectangle.max(), axis).isEmpty(), axis + " gap at " + gap[0] + "," + gap[1] + " from the top");
            }
        }
        helper.succeed();
    }

    /** The four corners are never read: a frame without them is found. */
    @GameTest
    public void cornersAreNotNeeded(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        int n = 0;
        for (Direction.Axis axis : AXES) {
            BlockPos min = sky(3, n++);
            frame(level, min, axis, 4, 5, CRYING, false);
            helper.assertValueEqual(find(level, min.above(), axis), Optional.of(new PortalFrame.Rectangle(min, axis, 4, 5)), axis + " without corners");
            helper.assertTrue(level.getBlockState(min.below().relative(PortalFrame.along(axis).getOpposite())).isAir(), "the corner is open");
        }
        helper.succeed();
    }

    /** A solid block inside refuses the frame; fire, soul fire and the portal's own block are accepted. */
    @GameTest
    public void onlyAirFireAndThePortalMayStandInside(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos min = sky(4, 0);
        frame(level, min, Direction.Axis.X, 2, 3, CRYING, true);
        PortalFrame.Rectangle rectangle = new PortalFrame.Rectangle(min, Direction.Axis.X, 2, 3);
        // Skip onPlace: soul fire would go out at once without soul soil under it.
        level.setBlock(rectangle.at(0, 0), Blocks.FIRE.defaultBlockState(), FLAGS | Block.UPDATE_SKIP_ON_PLACE);
        level.setBlock(rectangle.at(1, 1), Blocks.SOUL_FIRE.defaultBlockState(), FLAGS | Block.UPDATE_SKIP_ON_PLACE);
        level.setBlock(rectangle.at(0, 2), PORTAL.defaultBlockState(), FLAGS);
        helper.assertTrue(level.getBlockState(rectangle.at(0, 0)).is(Blocks.FIRE), "fire stands");
        helper.assertTrue(level.getBlockState(rectangle.at(1, 1)).is(Blocks.SOUL_FIRE), "soul fire stands");
        helper.assertValueEqual(find(level, rectangle.at(1, 0), Direction.Axis.X), Optional.of(rectangle), "fire and the portal inside");
        helper.assertValueEqual(find(level, rectangle.at(0, 0), Direction.Axis.X), Optional.of(rectangle), "from the fire");

        BlockPos blocked = sky(4, 1);
        frame(level, blocked, Direction.Axis.Z, 2, 3, CRYING, true);
        PortalFrame.Rectangle other = new PortalFrame.Rectangle(blocked, Direction.Axis.Z, 2, 3);
        level.setBlock(other.at(1, 2), Blocks.STONE.defaultBlockState(), FLAGS);
        helper.assertTrue(find(level, other.min(), Direction.Axis.Z).isEmpty(), "stone inside");
        helper.assertTrue(find(level, other.at(1, 2), Direction.Axis.Z).isEmpty(), "from the stone itself");
        level.setBlock(other.at(1, 2), Blocks.TORCH.defaultBlockState(), FLAGS);
        helper.assertTrue(find(level, other.min(), Direction.Axis.Z).isEmpty(), "a torch inside");

        level.setBlock(rectangle.at(0, 0), AIR, FLAGS);
        level.setBlock(rectangle.at(1, 1), AIR, FLAGS);
        helper.succeed();
    }

    /** A predicate for a tag (here {@code #minecraft:beacon_base_blocks}) accepts a frame of mixed blocks. */
    @GameTest
    public void aTagFrameMixesBlocks(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Predicate<BlockState> tag = s -> s.is(BlockTags.BEACON_BASE_BLOCKS);
        BlockPos min = sky(5, 0);
        frame(level, min, Direction.Axis.Z, 3, 3, Blocks.IRON_BLOCK.defaultBlockState(), false);
        PortalFrame.Rectangle rectangle = new PortalFrame.Rectangle(min, Direction.Axis.Z, 3, 3);
        level.setBlock(rectangle.at(-1, 1), Blocks.GOLD_BLOCK.defaultBlockState(), FLAGS);
        level.setBlock(rectangle.at(1, 3), Blocks.EMERALD_BLOCK.defaultBlockState(), FLAGS);
        level.setBlock(rectangle.at(2, -1), Blocks.GOLD_BLOCK.defaultBlockState(), FLAGS);
        helper.assertValueEqual(PortalFrame.find(level, min, Direction.Axis.Z, tag, PORTAL), Optional.of(rectangle), "mixed tag frame");
        helper.assertTrue(find(level, min, Direction.Axis.Z).isEmpty(), "not a crying obsidian frame");
        level.setBlock(rectangle.at(3, 2), Blocks.COAL_BLOCK.defaultBlockState(), FLAGS);
        helper.assertTrue(PortalFrame.find(level, min, Direction.Axis.Z, tag, PORTAL).isEmpty(), "coal is not in the tag");
        helper.succeed();
    }

    /**
     * {@code fill} sets the axis and suppresses shape updates: vanilla's Nether portal stays in a crying obsidian frame,
     * which its own shape check would refuse; {@code isComplete} and {@code isUnlit} follow the inside.
     */
    @GameTest
    public void fillSetsTheAxisAndIsCompleteFollowsTheInside(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        int n = 0;
        for (Direction.Axis axis : AXES) {
            BlockPos min = sky(6, n++);
            frame(level, min, axis, 3, 4, CRYING, true);
            PortalFrame.Rectangle rectangle = find(level, min, axis).orElseThrow();
            helper.assertTrue(PortalFrame.isUnlit(level, rectangle, Blocks.NETHER_PORTAL), "unlit before");
            helper.assertFalse(PortalFrame.isComplete(level, rectangle, Blocks.NETHER_PORTAL), "not complete before");
            PortalFrame.fill(level, rectangle, Blocks.NETHER_PORTAL.defaultBlockState());
            for (BlockPos pos : rectangle.positions()) {
                BlockState state = level.getBlockState(pos);
                helper.assertTrue(state.is(Blocks.NETHER_PORTAL), "portal at " + pos + ": " + state);
                helper.assertValueEqual(state.getValue(BlockStateProperties.HORIZONTAL_AXIS), axis, "axis at " + pos);
            }
            helper.assertTrue(PortalFrame.isComplete(level, rectangle, Blocks.NETHER_PORTAL), "complete");
            helper.assertFalse(PortalFrame.isUnlit(level, rectangle, Blocks.NETHER_PORTAL), "lit");
            helper.assertValueEqual(PortalFrame.find(level, rectangle.at(2, 3), axis, IS_CRYING, Blocks.NETHER_PORTAL), Optional.of(rectangle),
                    "a lit frame is still found");
            level.setBlock(rectangle.at(1, 2), AIR, FLAGS);
            helper.assertFalse(PortalFrame.isComplete(level, rectangle, Blocks.NETHER_PORTAL), "one block gone");
            for (BlockPos pos : rectangle.positions()) {
                level.setBlock(pos, AIR, FLAGS);
            }
        }
        BlockPos glass = sky(6, n);
        frame(level, glass, Direction.Axis.X, 2, 3, CRYING, true);
        PortalFrame.Rectangle rectangle = find(level, glass, Direction.Axis.X).orElseThrow();
        PortalFrame.fill(level, rectangle, PORTAL.defaultBlockState());
        helper.assertTrue(PortalFrame.isComplete(level, rectangle, PORTAL), "a state without an axis fills as it is");
        helper.succeed();
    }

    // ---- the index (D5) ---------------------------------------------------------------------------------------------

    /** Add, nearest, the square radius, a stale entry dropped, and the level's index through its saved form. */
    @GameTest
    public void theIndexFindsTheNearestPortalAndDropsStaleOnes(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos near = sky(7, 0);
        BlockPos far = sky(7, 1);
        PortalFrame.Rectangle a = new PortalFrame.Rectangle(near, Direction.Axis.X, 2, 3);
        PortalFrame.Rectangle b = new PortalFrame.Rectangle(far, Direction.Axis.Z, 2, 3);
        for (PortalFrame.Rectangle r : List.of(a, b)) {
            frame(level, r.min(), r.axis(), 2, 3, CRYING, true);
            PortalFrame.fill(level, r, PORTAL.defaultBlockState());
        }
        PortalIndex.Entry ea = PortalIndexAttachment.add(level, PORTAL, a);
        PortalIndex.Entry eb = PortalIndexAttachment.add(level, PORTAL, b);
        helper.assertTrue(PortalIndexAttachment.get(level).entries().containsAll(List.of(ea, eb)), "both indexed");

        BlockPos target = near.offset(10, 30, 0);
        helper.assertValueEqual(PortalIndexAttachment.nearest(level, ea.block(), target, 16), Optional.of(ea), "nearest");
        helper.assertValueEqual(PortalIndexAttachment.nearest(level, ea.block(), far.offset(-5, 0, 0), 16), Optional.of(eb), "nearest to b");
        helper.assertTrue(PortalIndexAttachment.nearest(level, ea.block(), target, 8).isEmpty(), "outside the radius");
        helper.assertTrue(PortalIndexAttachment.nearest(level, PortalIndexAttachment.id(Blocks.TINTED_GLASS), target, 16).isEmpty(),
                "another block never links");
        helper.assertValueEqual(PortalIndexAttachment.at(level, PORTAL, a.max()), Optional.of(ea), "at");

        Tag saved = PortalIndex.CODEC.encodeStart(NbtOps.INSTANCE, PortalIndexAttachment.get(level)).getOrThrow();
        helper.assertValueEqual(PortalIndex.CODEC.parse(NbtOps.INSTANCE, saved).getOrThrow(), PortalIndexAttachment.get(level), "saved form");

        level.setBlock(a.min(), AIR, FLAGS);
        helper.assertValueEqual(PortalIndexAttachment.nearest(level, ea.block(), target, 64), Optional.of(eb), "a is stale: b is next");
        helper.assertFalse(PortalIndexAttachment.get(level).entries().contains(ea), "the stale entry was dropped");
        level.setBlock(b.min(), Blocks.TINTED_GLASS.defaultBlockState(), FLAGS);
        helper.assertTrue(PortalIndexAttachment.at(level, PORTAL, b.min()).isEmpty(), "at drops a stale entry too");
        helper.assertFalse(PortalIndexAttachment.get(level).entries().contains(eb), "b dropped");
        helper.succeed();
    }

    // ---- exits (D6) -------------------------------------------------------------------------------------------------

    private static void assertExit(GameTestHelper helper, ServerLevel level, PortalFrame.Rectangle exit, Direction.Axis axis) {
        helper.assertValueEqual(exit.axis(), axis, "exit axis");
        helper.assertValueEqual(exit.width(), ExitPortals.EXIT_WIDTH, "exit width");
        helper.assertValueEqual(exit.height(), ExitPortals.EXIT_HEIGHT, "exit height");
        helper.assertTrue(PortalFrame.isComplete(level, exit, PORTAL), "exit filled");
        helper.assertValueEqual(find(level, exit.min(), axis), Optional.of(exit), "exit frame found");
        for (int i = -1; i <= exit.width(); i++) {
            helper.assertTrue(level.getBlockState(exit.at(i, -1)).is(Blocks.CRYING_OBSIDIAN), "bottom frame " + i);
            helper.assertTrue(level.getBlockState(exit.at(i, exit.height())).is(Blocks.CRYING_OBSIDIAN), "top frame and corners " + i);
        }
        helper.assertValueEqual(PortalIndexAttachment.at(level, PORTAL, exit.min()), Optional.of(PortalIndex.Entry.of(PortalIndexAttachment.id(PORTAL), exit)),
                "exit indexed");
    }

    /** On flat ground the exit stands at the target; a second trip from near there reuses it. */
    @GameTest
    public void anExitIsBuiltOnFlatGroundAndReused(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos column = sky(8, 0);
        reset(level, column.getX(), column.getZ(), 30, groundAir(level, column.getX(), column.getZ()), RESET_TOP);
        BlockPos target = new BlockPos(column.getX(), groundAir(level, column.getX(), column.getZ()) + 1, column.getZ());
        PortalFrame.Rectangle exit = ExitPortals.findOrBuild(level, target, Direction.Axis.Z, PORTAL, CRYING, 16);
        helper.assertValueEqual(exit.min(), target, "built at the target");
        assertExit(helper, level, exit, Direction.Axis.Z);
        int before = PortalIndexAttachment.get(level).entries().size();
        PortalFrame.Rectangle again = ExitPortals.findOrBuild(level, target.offset(9, 4, -6), Direction.Axis.X, PORTAL, CRYING, 16);
        helper.assertValueEqual(again, exit, "the indexed exit is reused");
        helper.assertValueEqual(PortalIndexAttachment.get(level).entries().size(), before, "no second exit");
        PortalIndexAttachment.remove(level, PortalIndex.Entry.of(PortalIndexAttachment.id(PORTAL), exit));
        helper.succeed();
    }

    /** At a cliff edge the exit is built on the cliff top, its whole frame on solid ground, not over the drop. */
    @GameTest
    public void anExitAtACliffEdgeStandsOnTheCliff(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos column = sky(9, 0);
        int x = column.getX();
        int z = column.getZ();
        int ground = groundAir(level, x, z);
        reset(level, x, z, 24, ground, RESET_TOP);
        BlockState stone = Blocks.STONE.defaultBlockState();
        for (int dx = -20; dx <= 0; dx++) {
            for (int dz = -20; dz <= 20; dz++) {
                for (int y = ground; y < ground + 10; y++) {
                    level.setBlock(new BlockPos(x + dx, y, z + dz), stone, FLAGS);
                }
            }
        }
        BlockPos target = new BlockPos(x + 1, ground + 11, z);
        PortalFrame.Rectangle exit = ExitPortals.findOrBuild(level, target, Direction.Axis.Z, PORTAL, CRYING, 16);
        assertExit(helper, level, exit, Direction.Axis.Z);
        helper.assertValueEqual(exit.min().getY(), ground + 11, "on the cliff top");
        helper.assertTrue(exit.min().getX() <= x, "not over the drop: " + exit.min());
        for (int i = -1; i <= exit.width(); i++) {
            helper.assertTrue(level.getBlockState(exit.at(i, -2)).is(Blocks.STONE), "stone under frame column " + i);
        }
        PortalIndexAttachment.remove(level, PortalIndex.Entry.of(PortalIndexAttachment.id(PORTAL), exit));
        helper.succeed();
    }

    /**
     * With no build site within 16 blocks (the ground under a sheet of water), the exit is forced at the target in the
     * air: a platform of the frame block, the blocks beside the inside cleared, the inside filled over what was there.
     */
    @GameTest
    public void anExitIsForcedOverAirWithAPlatform(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos column = sky(10, 0);
        int x = column.getX();
        int z = column.getZ();
        int ground = groundAir(level, x, z);
        reset(level, x, z, 22, ground, RESET_TOP);
        for (int dx = -20; dx <= 20; dx++) {
            for (int dz = -20; dz <= 20; dz++) {
                level.setBlock(new BlockPos(x + dx, ground - 1, z + dz), Blocks.WATER.defaultBlockState(), FLAGS);
            }
        }
        BlockPos target = new BlockPos(x, ground + 30, z);
        helper.assertTrue(ExitPortals.findSite(level, target, Direction.Axis.X).isEmpty(), "no site on axis x " + ExitPortals.findSite(level, target, Direction.Axis.X) + " ground " + ground + " " + level.getBlockState(ExitPortals.findSite(level, target, Direction.Axis.X).map(r -> r.min().below(2)).orElse(target)));
        helper.assertTrue(ExitPortals.findSite(level, target, Direction.Axis.Z).isEmpty(), "no site on axis z");
        Direction side = Direction.SOUTH;
        level.setBlock(target, Blocks.STONE.defaultBlockState(), FLAGS);
        level.setBlock(target.above().relative(side), Blocks.STONE.defaultBlockState(), FLAGS);
        PortalFrame.Rectangle exit = ExitPortals.findOrBuild(level, target, Direction.Axis.X, PORTAL, CRYING, 16);
        helper.assertValueEqual(exit.min(), target, "forced at the target");
        assertExit(helper, level, exit, Direction.Axis.X);
        for (int i = -1; i <= exit.width(); i++) {
            for (int s = -1; s <= 1; s++) {
                helper.assertTrue(level.getBlockState(exit.at(i, -1).relative(side, s)).is(Blocks.CRYING_OBSIDIAN), "platform " + i + "," + s);
            }
        }
        for (int i = 0; i < exit.width(); i++) {
            for (int up = 0; up < exit.height(); up++) {
                helper.assertTrue(level.getBlockState(exit.at(i, up).relative(side)).isAir(), "cleared south " + i + "," + up);
                helper.assertTrue(level.getBlockState(exit.at(i, up).relative(side.getOpposite())).isAir(), "cleared north " + i + "," + up);
            }
        }
        helper.assertTrue(level.getBlockState(exit.at(0, -2)).isAir(), "nothing under the platform");
        PortalIndexAttachment.remove(level, PortalIndex.Entry.of(PortalIndexAttachment.id(PORTAL), exit));
        helper.succeed();
    }

    /**
     * In a level with a ceiling (the Nether: logical height 128) exits stay below the top of the logical height: a
     * tempting floor at y 124 is refused (the frame would reach y 129), and a forced build from y 200 is lowered so
     * its top frame row is y 127.
     */
    @GameTest
    public void exitsInTheNetherStayBelowItsLogicalHeight(GameTestHelper helper) {
        ServerLevel nether = helper.getLevel().getServer().getLevel(Level.NETHER);
        helper.assertTrue(nether != null, "the Nether is loaded");
        int top = ExitPortals.topY(nether);
        helper.assertValueEqual(top, nether.getMinY() + nether.getLogicalHeight() - 1, "top of the logical height");
        helper.assertTrue(top < nether.getMaxY(), "the Nether's logical height is below its build height");
        int x = 30_000 + 11 * 1_024;
        int z = 30_000;
        reset(nether, x, z, 22, groundAir(nether, x, z), top);
        reset(nether, x + 64, z, 3, top - 10, top);
        for (int dx = -20; dx <= 20; dx++) {
            for (int dz = -20; dz <= 20; dz++) {
                nether.setBlock(new BlockPos(x + dx, top - 3, z + dz), Blocks.STONE.defaultBlockState(), FLAGS);
            }
        }
        PortalFrame.Rectangle exit = ExitPortals.findOrBuild(nether, new BlockPos(x, 200, z), Direction.Axis.X, PORTAL, CRYING, 16);
        assertExit(helper, nether, exit, Direction.Axis.X);
        helper.assertTrue(exit.min().getY() + exit.height() <= top, "top frame row within the logical height: " + exit.min());
        helper.assertTrue(exit.min().getY() < top - 3, "under the floor, not on it: " + exit.min());
        PortalIndexAttachment.remove(nether, PortalIndex.Entry.of(PortalIndexAttachment.id(PORTAL), exit));

        PortalFrame.Rectangle forced = ExitPortals.forceBuild(nether, new BlockPos(x + 64, 200, z), Direction.Axis.Z, PORTAL, CRYING);
        helper.assertValueEqual(forced.min().getY(), top - ExitPortals.EXIT_HEIGHT, "forced build lowered");
        assertExit(helper, nether, forced, Direction.Axis.Z);
        PortalIndexAttachment.remove(nether, PortalIndex.Entry.of(PortalIndexAttachment.id(PORTAL), forced));
        helper.succeed();
    }
}
