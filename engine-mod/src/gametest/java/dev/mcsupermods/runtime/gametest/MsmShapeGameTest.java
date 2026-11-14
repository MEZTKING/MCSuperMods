package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmBlock;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.BooleanOp;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * {@code msm:shape} GameTests (ADR 0059 D3) on {@code msm/msm_test/block/shape_*.json}: outline and collision bounds
 * per block, an entity standing on the slab and passing through the cross, see-through blocks that occlude nothing
 * and let sky light down, the full block without the component unchanged, and {@code msm:on_step} on a slab. Entity
 * tests run in the {@code msm_runtime_gametest:arena} structure (stone floor at y 0, 9x9 interior, open sky).
 */
public class MsmShapeGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final BlockPos AT = new BlockPos(2, 1, 2);
    private static final double EPS = 1e-6;

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static AABB px(double x1, double y1, double z1, double x2, double y2, double z2) {
        return new AABB(x1 / 16, y1 / 16, z1 / 16, x2 / 16, y2 / 16, z2 / 16);
    }

    private static boolean same(AABB a, AABB b) {
        return Math.abs(a.minX - b.minX) < EPS && Math.abs(a.minY - b.minY) < EPS && Math.abs(a.minZ - b.minZ) < EPS
                && Math.abs(a.maxX - b.maxX) < EPS && Math.abs(a.maxY - b.maxY) < EPS && Math.abs(a.maxZ - b.maxZ) < EPS;
    }

    /** Whether a point (in pixels) lies inside the shape. */
    private static boolean contains(VoxelShape shape, double x, double y, double z) {
        return shape.toAabbs().stream().anyMatch(b -> b.contains(x / 16, y / 16, z / 16));
    }

    private static boolean equal(VoxelShape a, VoxelShape b) {
        return !Shapes.joinIsNotEmpty(a, b, BooleanOp.NOT_SAME);
    }

    private record Placed(BlockState state, VoxelShape outline, VoxelShape collision) {}

    private static Placed place(GameTestHelper helper, BlockPos at, String path) {
        Block block = block(path);
        helper.assertTrue(block instanceof MsmBlock, path + " is not an MsmBlock");
        helper.setBlock(at, block);
        BlockState state = helper.getBlockState(at);
        BlockPos abs = helper.absolutePos(at);
        return new Placed(state, state.getShape(helper.getLevel(), abs, CollisionContext.empty()),
                state.getCollisionShape(helper.getLevel(), abs, CollisionContext.empty()));
    }

    // Outline and collision

    @GameTest
    public void shapesLoadWithoutErrors(GameTestHelper helper) {
        helper.assertFalse(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("shape_")),
                "shape errors: " + MsmRuntime.report().errors());
        helper.assertFalse(MsmRuntime.report().warnings().stream().anyMatch(w -> w.contains("shape_")),
                "shape warnings: " + MsmRuntime.report().warnings());
        helper.succeed();
    }

    @GameTest
    public void slabOutlineAndCollision(GameTestHelper helper) {
        Placed slab = place(helper, AT, "shape_slab");
        helper.assertTrue(same(slab.outline().bounds(), px(0, 0, 0, 16, 8, 16)), "slab outline " + slab.outline().bounds());
        helper.assertTrue(equal(slab.collision(), slab.outline()), "slab collision follows the outline: " + slab.collision());
        helper.succeed();
    }

    @GameTest
    public void carpetOutlineAndCollision(GameTestHelper helper) {
        Placed carpet = place(helper, AT, "shape_carpet");
        helper.assertTrue(same(carpet.outline().bounds(), px(0, 0, 0, 16, 1, 16)), "carpet outline " + carpet.outline().bounds());
        helper.assertTrue(equal(carpet.collision(), carpet.outline()), "carpet collision follows the outline");
        helper.succeed();
    }

    @GameTest
    public void crossHasAnOutlineAndNoCollision(GameTestHelper helper) {
        Placed cross = place(helper, AT, "shape_cross");
        helper.assertTrue(same(cross.outline().bounds(), px(2, 0, 2, 14, 16, 14)), "cross outline " + cross.outline().bounds());
        helper.assertTrue(cross.collision().isEmpty(), "cross collision is not empty: " + cross.collision());
        helper.succeed();
    }

    /** The second box is written corner to corner backwards ({@code [12, 16, 12, 4, 8, 4]}); the runtime orders each axis. */
    @GameTest
    public void twoBoxesJoinIntoOneShape(GameTestHelper helper) {
        Placed two = place(helper, AT, "shape_two_boxes");
        helper.assertTrue(same(two.outline().bounds(), px(0, 0, 0, 16, 16, 16)), "two-box bounds " + two.outline().bounds());
        helper.assertTrue(contains(two.outline(), 1, 4, 1), "the base box is missing");
        helper.assertTrue(contains(two.outline(), 8, 12, 8), "the post is missing");
        helper.assertFalse(contains(two.outline(), 1, 12, 1), "the corner above the base is filled");
        helper.assertTrue(equal(two.collision(), two.outline()), "two-box collision follows the outline");
        helper.succeed();
    }

    @GameTest
    public void fullBlockWithoutTheComponentIsUnchanged(GameTestHelper helper) {
        helper.setBlock(AT, block("defaults"));
        BlockState state = helper.getBlockState(AT);
        BlockPos abs = helper.absolutePos(AT);
        helper.assertTrue(state.getShape(helper.getLevel(), abs) == Shapes.block(), "outline is not Shapes.block()");
        helper.assertTrue(state.getCollisionShape(helper.getLevel(), abs) == Shapes.block(), "collision is not Shapes.block()");
        helper.assertTrue(state.canOcclude(), "a plain block must occlude");
        helper.assertTrue(state.isSolidRender(), "a plain block must be solid");
        helper.assertValueEqual(state.getLightDampening(), 15, "light dampening");
        helper.assertFalse(state.propagatesSkylightDown(), "a plain block lets sky light down");
        helper.assertFalse(state.skipRendering(state, Direction.UP), "a plain block skips faces against itself");
        helper.assertTrue(state.isValidSpawn(helper.getLevel(), abs, EntityTypes.ZOMBIE), "a plain block refuses a zombie spawn");
        helper.succeed();
    }

    // Entities

    @GameTest(structure = ARENA, maxTicks = 100)
    public void entityStandsAtTheSlabHeight(GameTestHelper helper) {
        BlockPos at = new BlockPos(3, 1, 5);
        helper.setBlock(at, block("shape_slab"));
        ArmorStand stand = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(3.5, 2.5, 5.5));
        double top = helper.absolutePos(at).getY() + 0.5;
        helper.succeedWhen(() -> {
            helper.assertTrue(stand.onGround(), "not on the ground yet at y " + stand.getY());
            helper.assertTrue(Math.abs(stand.getY() - top) < 1e-3, "stands at y " + stand.getY() + ", the slab top is " + top);
            stand.discard();
        });
    }

    @GameTest(structure = ARENA, maxTicks = 100)
    public void entityFallsThroughTheCross(GameTestHelper helper) {
        BlockPos at = new BlockPos(3, 1, 5);
        helper.setBlock(at, block("shape_cross"));
        ArmorStand stand = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(3.5, 2.5, 5.5));
        double floor = helper.absolutePos(at).getY();
        helper.succeedWhen(() -> {
            helper.assertTrue(stand.onGround(), "not on the ground yet at y " + stand.getY());
            helper.assertTrue(Math.abs(stand.getY() - floor) < 1e-3, "stands at y " + stand.getY() + ", the floor is " + floor);
            stand.discard();
        });
    }

    /** {@code Entity.move} applies block collision at once: through the cross the whole way, stopped by the glass-like cube. */
    @GameTest(structure = ARENA)
    public void entityWalksThroughTheCrossNotTheCube(GameTestHelper helper) {
        helper.setBlock(new BlockPos(4, 1, 3), block("shape_cross"));
        helper.setBlock(new BlockPos(4, 1, 7), block("shape_glass"));
        ArmorStand through = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(3.5, 1, 3.5));
        ArmorStand blocked = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(3.5, 1, 7.5));
        double x1 = through.getX();
        double x2 = blocked.getX();
        through.move(MoverType.SELF, new Vec3(2, 0, 0));
        blocked.move(MoverType.SELF, new Vec3(2, 0, 0));
        helper.assertTrue(Math.abs(through.getX() - (x1 + 2)) < 1e-3, "the cross stopped the entity: " + x1 + " -> " + through.getX());
        helper.assertTrue(blocked.getX() < x2 + 0.5, "the cube did not stop the entity: " + x2 + " -> " + blocked.getX());
        through.discard();
        blocked.discard();
        helper.succeed();
    }

    /** {@code msm:on_step} still fires on a slab, from the game's own movement (not a direct {@code stepOn} call). */
    @GameTest(structure = ARENA, maxTicks = 100)
    public void stepFiresOnASlab(GameTestHelper helper) {
        BlockPos at = new BlockPos(3, 1, 5);
        helper.setBlock(at, block("shape_slab"));
        List<String> events = new ArrayList<>();
        EventRunner.setListener(new EventListener() {
            @Override
            public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
                events.add(event.getPath());
            }
        });
        ArmorStand stand = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(3.5, 2.5, 5.5));
        helper.succeedWhen(() -> {
            helper.assertTrue(events.contains("slab_stepped"), "no step event yet: " + events);
            EventRunner.setListener(null);
            stand.discard();
        });
    }

    // See-through

    @GameTest
    public void seeThroughBlocksOccludeNothing(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        for (String path : List.of("shape_glass", "shape_slab", "shape_carpet", "shape_cross")) {
            Placed p = place(helper, AT, path);
            BlockPos abs = helper.absolutePos(AT);
            BlockState s = p.state();
            helper.assertFalse(s.canOcclude(), path + " occludes");
            helper.assertTrue(s.propagatesSkylightDown(), path + " stops sky light");
            helper.assertValueEqual(s.getLightDampening(), 0, path + " light dampening");
            helper.assertValueEqual(s.getShadeBrightness(level, abs), 1.0f, path + " shade brightness");
            helper.assertFalse(s.isSuffocating(level, abs), path + " suffocates");
            helper.assertFalse(s.isViewBlocking(level, abs, new AABB(abs)), path + " blocks the view");
            helper.assertFalse(s.isRedstoneConductor(level, abs), path + " conducts redstone");
            helper.assertFalse(s.isValidSpawn(level, abs, EntityTypes.ZOMBIE), path + " lets a zombie spawn on it");
            helper.assertTrue(s.getVisualShape(level, abs, CollisionContext.empty()).isEmpty(), path + " has a visual shape");
            helper.assertTrue(s.skipRendering(s, Direction.EAST), path + " draws the face against itself");
            helper.assertFalse(s.skipRendering(Blocks.STONE.defaultBlockState(), Direction.EAST), path + " skips a face against stone");
        }
        helper.succeed();
    }

    @GameTest
    public void solidShapeOccludesWithItsOwnShape(GameTestHelper helper) {
        Placed two = place(helper, AT, "shape_two_boxes");
        BlockState s = two.state();
        helper.assertTrue(s.canOcclude(), "see_through false must occlude");
        helper.assertFalse(s.isSolidRender(), "a non-full shape is not a solid render");
        helper.assertTrue(equal(s.getOcclusionShape(), two.outline()), "occlusion shape is the outline");
        helper.assertFalse(s.skipRendering(s, Direction.EAST), "a solid shape skips faces against itself");
        helper.succeed();
    }

    /** Sky light reaches the cell below a glass-like cube at full strength; below stone it is at most 14 (from the side). */
    @GameTest(structure = ARENA, maxTicks = 100)
    public void skyLightPassesASeeThroughCube(GameTestHelper helper) {
        BlockPos glass = new BlockPos(3, 2, 5);
        BlockPos stone = new BlockPos(7, 2, 5);
        helper.setBlock(glass, block("shape_glass"));
        helper.setBlock(stone, Blocks.STONE);
        ServerLevel level = helper.getLevel();
        helper.succeedWhen(() -> {
            int underGlass = level.getBrightness(LightLayer.SKY, helper.absolutePos(glass.below()));
            int underStone = level.getBrightness(LightLayer.SKY, helper.absolutePos(stone.below()));
            helper.assertValueEqual(underGlass, 15, "sky light below the see-through cube");
            helper.assertTrue(underStone < 15, "sky light below stone is " + underStone + " (light engine not updated yet)");
            MsmRuntime.LOGGER.info("[msm_runtime] shape: sky light below see-through cube {}, below stone {}", underGlass, underStone);
        });
    }
}
