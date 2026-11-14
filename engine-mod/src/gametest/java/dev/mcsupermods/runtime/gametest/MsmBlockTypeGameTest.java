package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.types.MsmFenceBlock;
import dev.mcsupermods.runtime.registry.types.MsmFenceGateBlock;
import dev.mcsupermods.runtime.registry.types.MsmPaneBlock;
import dev.mcsupermods.runtime.registry.types.MsmSlabBlock;
import dev.mcsupermods.runtime.registry.types.MsmStairBlock;
import dev.mcsupermods.runtime.registry.types.MsmWallBlock;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FenceGateBlock;
import net.minecraft.world.level.block.FireBlock;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.WallBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.SlabType;
import net.minecraft.world.level.block.state.properties.StairsShape;
import net.minecraft.world.level.block.state.properties.WallSide;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Block type GameTests (ADR 0067 D3, D4; B263) on {@code msm/msm_test/block/type_*.json}: the rotating types
 * ({@code pillar}, {@code horizontal}, {@code directional}) with placement and turned shapes, slabs, stairs (shapes, base
 * delegation, dependency order and a missing base), walls, fences, fence gates and panes with their connections (the
 * test data pack adds the project blocks to {@code #minecraft:walls}, {@code fences}, {@code wooden_fences} and
 * {@code fence_gates}), stripping with an axe, fire odds and a component the type does not allow.
 *
 * <p>Placement goes through {@code ServerPlayerGameMode.useItemOn}, as the network handler does, so Fabric's
 * {@code UseBlockCallback} (stripping) and the block item's own placement run.
 */
public class MsmBlockTypeGameTest {
    private static final double EPS = 1e-6;

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper, Vec3 at) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(at));
        return player;
    }

    /** A right-click on {@code face} of the block at {@code rel} with the main hand, as the network handler does. */
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel, Direction face) {
        BlockPos abs = helper.absolutePos(rel);
        Vec3 hitAt = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        BlockHitResult hit = new BlockHitResult(hitAt, face, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
    }

    private static void hold(ServerPlayer player, ItemStack stack) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
    }

    private static VoxelShape outline(GameTestHelper helper, BlockPos rel) {
        return helper.getBlockState(rel).getShape(helper.getLevel(), helper.absolutePos(rel), CollisionContext.empty());
    }

    private static boolean same(AABB a, double x1, double y1, double z1, double x2, double y2, double z2) {
        return Math.abs(a.minX - x1 / 16) < EPS && Math.abs(a.minY - y1 / 16) < EPS && Math.abs(a.minZ - z1 / 16) < EPS
                && Math.abs(a.maxX - x2 / 16) < EPS && Math.abs(a.maxY - y2 / 16) < EPS && Math.abs(a.maxZ - z2 / 16) < EPS;
    }

    /** Sets the block's default state turned by vanilla's own neighbour rules, as placement would. */
    private static void placeConnected(GameTestHelper helper, BlockPos rel, Block block) {
        BlockPos abs = helper.absolutePos(rel);
        helper.setBlock(rel, Block.updateFromNeighbourShapes(block.defaultBlockState(), helper.getLevel(), abs));
    }

    // Loading

    @GameTest
    public void typesRegisterTheirVanillaClasses(GameTestHelper helper) {
        helper.assertTrue(block("type_pillar") instanceof MsmBlock, "pillar is not an MsmBlock");
        helper.assertTrue(block("type_horizontal") instanceof MsmBlock, "horizontal is not an MsmBlock");
        helper.assertTrue(block("type_directional") instanceof MsmBlock, "directional is not an MsmBlock");
        helper.assertTrue(block("type_slab") instanceof MsmSlabBlock, "slab: " + block("type_slab"));
        helper.assertTrue(block("type_stairs") instanceof MsmStairBlock, "stairs: " + block("type_stairs"));
        helper.assertTrue(block("type_wall") instanceof MsmWallBlock, "wall: " + block("type_wall"));
        helper.assertTrue(block("type_fence") instanceof MsmFenceBlock, "fence: " + block("type_fence"));
        helper.assertTrue(block("type_fence_gate") instanceof MsmFenceGateBlock, "fence gate: " + block("type_fence_gate"));
        helper.assertTrue(block("type_pane") instanceof MsmPaneBlock, "pane: " + block("type_pane"));
        // Family properties (Blocks.<clinit>): forceSolidOn on walls and fences, noOcclusion on panes.
        helper.assertTrue(block("type_wall").defaultBlockState().isSolid(), "a wall is not forced solid");
        helper.assertTrue(block("type_fence").defaultBlockState().isSolid(), "a fence is not forced solid");
        helper.assertFalse(block("type_pane").defaultBlockState().canOcclude(), "a pane occludes");
        List<String> errors = MsmRuntime.report().errors().stream()
                .filter(e -> e.contains("/type_") && !e.contains("type_stairs_unknown_base.json") && !e.contains("type_stairs_redstone.json"))
                .toList();
        helper.assertTrue(errors.isEmpty(), "type errors: " + errors);
        helper.succeed();
    }

    // pillar, horizontal, directional

    @GameTest
    public void pillarTakesTheAxisOfTheClickedFace(GameTestHelper helper) {
        BlockPos stone = new BlockPos(2, 1, 2);
        helper.setBlock(stone, Blocks.STONE);
        ServerPlayer player = player(helper, new Vec3(0.5, 1, 6.5));
        hold(player, new ItemStack(item("type_pillar"), 4));
        use(helper, player, stone, Direction.EAST);
        helper.assertBlockProperty(stone.east(), MsmBlock.AXIS, Direction.Axis.X);
        use(helper, player, stone, Direction.UP);
        helper.assertBlockProperty(stone.above(), MsmBlock.AXIS, Direction.Axis.Y);
        use(helper, player, stone, Direction.NORTH);
        helper.assertBlockProperty(stone.north(), MsmBlock.AXIS, Direction.Axis.Z);
        // Boxes written for axis y ([4, 0, 4, 12, 16, 12]) lie along the axis.
        helper.assertTrue(same(outline(helper, stone.east()).bounds(), 0, 4, 4, 16, 12, 12), "axis x: " + outline(helper, stone.east()).bounds());
        helper.assertTrue(same(outline(helper, stone.above()).bounds(), 4, 0, 4, 12, 16, 12), "axis y: " + outline(helper, stone.above()).bounds());
        helper.assertTrue(same(outline(helper, stone.north()).bounds(), 4, 4, 0, 12, 12, 16), "axis z: " + outline(helper, stone.north()).bounds());
        BlockState x = helper.getBlockState(stone.east());
        helper.assertValueEqual(x.rotate(Rotation.CLOCKWISE_90).getValue(MsmBlock.AXIS), Direction.Axis.Z, "rotated axis");
        helper.succeed();
    }

    @GameTest
    public void horizontalFacesThePlacerAndTurnsItsShape(GameTestHelper helper) {
        BlockPos stone = new BlockPos(2, 1, 1);
        helper.setBlock(stone, Blocks.STONE);
        // The player stands south of the block and looks north.
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5));
        player.setYRot(180);
        player.setXRot(0);
        hold(player, new ItemStack(item("type_horizontal")));
        use(helper, player, stone, Direction.UP);
        BlockPos at = stone.above();
        BlockState state = helper.getBlockState(at);
        helper.assertValueEqual(state.getValue(MsmBlock.HORIZONTAL_FACING), Direction.SOUTH, "facing");
        // The box [0, 0, 0, 16, 16, 8] is written facing north: facing south it is the south half.
        helper.assertTrue(same(outline(helper, at).bounds(), 0, 0, 8, 16, 16, 16), "south outline " + outline(helper, at).bounds());
        BlockState east = state.rotate(Rotation.COUNTERCLOCKWISE_90);
        helper.assertValueEqual(east.getValue(MsmBlock.HORIZONTAL_FACING), Direction.EAST, "rotated facing");
        helper.setBlock(at, east);
        helper.assertTrue(same(outline(helper, at).bounds(), 8, 0, 0, 16, 16, 16), "east outline " + outline(helper, at).bounds());
        // msm:redstone together with the facing: POWERED changes, the facing stays.
        helper.assertTrue(state.hasProperty(MsmBlock.POWERED), "no POWERED with msm:redstone");
        helper.setBlock(at.east(), Blocks.REDSTONE_BLOCK);
        helper.assertBlockProperty(at, MsmBlock.POWERED, true);
        helper.assertBlockProperty(at, MsmBlock.HORIZONTAL_FACING, Direction.EAST);
        helper.succeed();
    }

    @GameTest
    public void directionalFacesUpAndDown(GameTestHelper helper) {
        BlockPos floor = new BlockPos(2, 1, 2);
        BlockPos ceiling = new BlockPos(2, 4, 2);
        helper.setBlock(floor, Blocks.STONE);
        helper.setBlock(ceiling, Blocks.STONE);
        ServerPlayer player = player(helper, new Vec3(5.5, 1, 5.5));
        hold(player, new ItemStack(item("type_directional"), 2));
        player.setXRot(90); // looking down: the block faces up, towards the player
        use(helper, player, floor, Direction.UP);
        helper.assertBlockProperty(floor.above(), MsmBlock.FACING, Direction.UP);
        player.setXRot(-90); // looking up: the block faces down
        use(helper, player, ceiling, Direction.DOWN);
        helper.assertBlockProperty(ceiling.below(), MsmBlock.FACING, Direction.DOWN);
        // The box [0, 0, 0, 16, 16, 4] is the north face: facing up it is the top, facing down the bottom.
        helper.assertTrue(same(outline(helper, floor.above()).bounds(), 0, 12, 0, 16, 16, 16), "up " + outline(helper, floor.above()).bounds());
        helper.assertTrue(same(outline(helper, ceiling.below()).bounds(), 0, 0, 0, 16, 4, 16), "down " + outline(helper, ceiling.below()).bounds());
        helper.succeed();
    }

    // slab

    @GameTest
    public void slabBottomTopAndDouble(GameTestHelper helper) {
        BlockPos floor = new BlockPos(1, 1, 1);
        BlockPos ceiling = new BlockPos(3, 3, 1);
        helper.setBlock(floor, Blocks.STONE);
        helper.setBlock(ceiling, Blocks.STONE);
        ServerPlayer player = player(helper, new Vec3(1.5, 1, 6.5));
        hold(player, new ItemStack(item("type_slab"), 3));
        use(helper, player, floor, Direction.UP);
        helper.assertBlockProperty(floor.above(), SlabBlock.TYPE, SlabType.BOTTOM);
        use(helper, player, ceiling, Direction.DOWN);
        helper.assertBlockProperty(ceiling.below(), SlabBlock.TYPE, SlabType.TOP);
        use(helper, player, floor.above(), Direction.UP);
        helper.assertBlockProperty(floor.above(), SlabBlock.TYPE, SlabType.DOUBLE);
        // The test loot table is vanilla's slab shape: two items from a double slab.
        BlockPos abs = helper.absolutePos(floor.above());
        helper.getLevel().destroyBlock(abs, true);
        int dropped = 0;
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(abs).inflate(2))) {
            if (e.getItem().is(item("type_slab"))) {
                dropped += e.getItem().getCount();
                e.discard();
            }
        }
        helper.assertValueEqual(dropped, 2, "items from a double slab");
        helper.succeed();
    }

    @GameTest
    public void slabTakesWater(GameTestHelper helper) {
        BlockPos at = new BlockPos(2, 1, 2);
        helper.setBlock(at, block("type_slab"));
        SlabBlock slab = (SlabBlock) block("type_slab");
        boolean placed = slab.placeLiquid(helper.getLevel(), helper.absolutePos(at), helper.getBlockState(at), Fluids.WATER.defaultFluidState());
        helper.assertTrue(placed, "the slab did not take water");
        helper.assertBlockProperty(at, SlabBlock.WATERLOGGED, true);
        FluidState fluid = helper.getBlockState(at).getFluidState();
        helper.assertTrue(fluid.is(Fluids.WATER), "fluid is " + fluid);
        helper.succeed();
    }

    // stairs

    @GameTest
    public void stairsShapeIntoAnInnerCorner(GameTestHelper helper) {
        BlockPos a = new BlockPos(2, 1, 2);
        Block stairs = block("type_stairs");
        helper.setBlock(a, stairs.defaultBlockState().setValue(StairBlock.FACING, Direction.NORTH));
        helper.assertBlockProperty(a, StairBlock.SHAPE, StairsShape.STRAIGHT);
        // Another stair in front of it, facing west (counter-clockwise from north): an inner left corner.
        helper.setBlock(a.south(), stairs.defaultBlockState().setValue(StairBlock.FACING, Direction.WEST));
        helper.assertBlockProperty(a, StairBlock.SHAPE, StairsShape.INNER_LEFT);
        helper.succeed();
    }

    @GameTest
    public void stairsCopyTheirBaseRegisteredFirst(GameTestHelper helper) {
        // type_stairs sorts before type_stairs_base: the registrar still registered the base first.
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id("type_stairs")), "type_stairs not registered");
        helper.assertValueEqual(block("type_stairs").getExplosionResistance(), 42.0f, "explosion resistance of the base");
        helper.assertValueEqual(block("type_stairs_vanilla").getExplosionResistance(), Blocks.STONE.getExplosionResistance(),
                "default base minecraft:stone");
        helper.succeed();
    }

    @GameTest
    public void stairsWithAnUnknownBaseAreSkipped(GameTestHelper helper) {
        helper.assertFalse(BuiltInRegistries.BLOCK.containsKey(id("type_stairs_unknown_base")), "stairs without a base registered");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("type_stairs_unknown_base.json")
                && e.contains("base_block msm_test:no_such_block")), "no error for the unknown base: " + errors);
        helper.succeed();
    }

    @GameTest
    public void redstoneOnStairsIsDroppedWithALoadError(GameTestHelper helper) {
        Block stairs = block("type_stairs_redstone");
        helper.assertTrue(stairs instanceof MsmStairBlock, "type_stairs_redstone not registered: " + stairs);
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("type_stairs_redstone.json")
                && e.contains("msm:redstone is not allowed on type 'stairs'")), "no error for msm:redstone: " + errors);
        BlockBehaviourDriver driver = ((MsmStairBlock) stairs).driver();
        helper.assertFalse(driver.definition().components().redstone().isPresent(), "msm:redstone kept");
        helper.assertFalse(stairs.defaultBlockState().isSignalSource(), "the stairs emit a signal");
        helper.succeed();
    }

    // wall, fence, fence gate, pane

    @GameTest
    public void wallHasAPostAndConnects(GameTestHelper helper) {
        BlockPos w = new BlockPos(2, 1, 2);
        placeConnected(helper, w, block("type_wall"));
        helper.assertBlockProperty(w, WallBlock.UP, true);
        placeConnected(helper, w.east(), block("type_wall"));
        helper.setBlock(w.north(), Blocks.STONE);
        helper.assertBlockProperty(w, WallBlock.EAST, WallSide.LOW);
        helper.assertBlockProperty(w, WallBlock.NORTH, WallSide.LOW);
        helper.assertBlockProperty(w, WallBlock.WEST, WallSide.NONE);
        helper.assertBlockProperty(w.east(), WallBlock.WEST, WallSide.LOW);
        helper.succeed();
    }

    @GameTest
    public void fenceConnectsToWoodenFencesOnly(GameTestHelper helper) {
        BlockPos f = new BlockPos(2, 1, 2);
        placeConnected(helper, f, block("type_fence"));
        helper.setBlock(f.east(), Blocks.OAK_FENCE);
        helper.setBlock(f.west(), Blocks.NETHER_BRICK_FENCE);
        helper.setBlock(f.north(), Blocks.STONE);
        helper.assertBlockProperty(f, BlockStateProperties.EAST, true);
        helper.assertBlockProperty(f, BlockStateProperties.WEST, false);
        helper.assertBlockProperty(f, BlockStateProperties.NORTH, true);
        helper.assertBlockProperty(f, BlockStateProperties.SOUTH, false);
        helper.succeed();
    }

    @GameTest
    public void fenceGateOpensOnUseAndFitsAWall(GameTestHelper helper) {
        BlockPos g = new BlockPos(2, 1, 2);
        helper.setBlock(g, block("type_fence_gate").defaultBlockState().setValue(FenceGateBlock.FACING, Direction.NORTH));
        placeConnected(helper, g.east(), block("type_wall"));
        placeConnected(helper, g.west(), block("type_wall"));
        helper.assertBlockProperty(g, FenceGateBlock.IN_WALL, true);
        // msm:on_interact fires after vanilla's own toggle (ADR 0067 D3): the gate is open when the event runs.
        List<Boolean> openWhenFired = new ArrayList<>();
        BlockPos abs = helper.absolutePos(g);
        ServerLevel level = helper.getLevel();
        EventRunner.setListener(new EventListener() {
            @Override
            public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
                if (event.getPath().equals("gate_used")) {
                    openWhenFired.add(level.getBlockState(abs).getValue(FenceGateBlock.OPEN));
                }
            }
        });
        try {
            ServerPlayer player = player(helper, new Vec3(2.5, 1, 5.5));
            hold(player, ItemStack.EMPTY);
            InteractionResult result = use(helper, player, g, Direction.SOUTH);
            helper.assertTrue(result.consumesAction(), "use result " + result);
        } finally {
            EventRunner.setListener(null);
        }
        helper.assertBlockProperty(g, FenceGateBlock.OPEN, true);
        helper.assertValueEqual(openWhenFired, List.of(true), "gate state when msm:on_interact fired");
        helper.succeed();
    }

    @GameTest
    public void paneConnectsToGlassAndPanes(GameTestHelper helper) {
        BlockPos p = new BlockPos(2, 1, 2);
        placeConnected(helper, p, block("type_pane"));
        helper.setBlock(p.east(), Blocks.GLASS);
        helper.setBlock(p.north(), Blocks.GLASS_PANE);
        placeConnected(helper, p.west(), block("type_pane"));
        helper.assertBlockProperty(p, BlockStateProperties.EAST, true);
        helper.assertBlockProperty(p, BlockStateProperties.NORTH, true);
        helper.assertBlockProperty(p, BlockStateProperties.WEST, true);
        helper.assertBlockProperty(p, BlockStateProperties.SOUTH, false);
        helper.succeed();
    }

    // msm:strippable

    @GameTest
    public void axeStripsTheLogAndKeepsTheAxis(GameTestHelper helper) {
        BlockPos log = new BlockPos(2, 1, 2);
        helper.setBlock(log, block("type_log").defaultBlockState().setValue(MsmBlock.AXIS, Direction.Axis.X));
        ServerPlayer player = player(helper, new Vec3(2.5, 1, 5.5));
        ItemStack axe = new ItemStack(Items.IRON_AXE);
        helper.assertTrue(axe.has(DataComponents.BLOCK_TRANSFORMER), "a vanilla axe has no block_transformer");
        hold(player, axe);
        InteractionResult result = use(helper, player, log, Direction.SOUTH);
        helper.assertTrue(result.consumesAction(), "strip result " + result);
        BlockState stripped = helper.getBlockState(log);
        helper.assertTrue(stripped.is(block("type_stripped_log")), "not stripped: " + stripped);
        helper.assertValueEqual(stripped.getValue(MsmBlock.AXIS), Direction.Axis.X, "axis after stripping");
        helper.assertValueEqual(player.getMainHandItem().getDamageValue(), 1, "axe damage");
        helper.succeed();
    }

    @GameTest
    public void stickDoesNotStrip(GameTestHelper helper) {
        BlockPos log = new BlockPos(2, 1, 2);
        helper.setBlock(log, block("type_log"));
        ServerPlayer player = player(helper, new Vec3(2.5, 1, 5.5));
        hold(player, new ItemStack(Items.STICK));
        use(helper, player, log, Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(log).is(block("type_log")), "a stick stripped the log");
        helper.succeed();
    }

    // msm:flammable

    /**
     * The odds vanilla's fire reads ({@code FireBlock.getIgniteOdds} and {@code getBurnOdds}, private), so the check holds
     * whatever registers them (Fabric's registry on 26.3, {@code FireBlock.setFlammable} on 26.4).
     */
    private static int fireOdds(String method, Block block) throws ReflectiveOperationException {
        Method m = FireBlock.class.getDeclaredMethod(method, BlockState.class);
        m.setAccessible(true);
        return (int) m.invoke(Blocks.FIRE, block.defaultBlockState());
    }

    @GameTest
    public void flammableOddsMatchVanillaPlanksAndLogs(GameTestHelper helper) throws ReflectiveOperationException {
        // type_planks is burn_odds 5, ignite_odds 20 (vanilla planks); type_log 5 and 5 (vanilla logs).
        Map<String, Block> pairs = Map.of("type_planks", Blocks.OAK_PLANKS, "type_log", Blocks.OAK_LOG);
        for (var pair : pairs.entrySet()) {
            Block own = block(pair.getKey());
            for (String method : List.of("getIgniteOdds", "getBurnOdds")) {
                helper.assertValueEqual(fireOdds(method, own), fireOdds(method, pair.getValue()), pair.getKey() + " " + method);
            }
        }
        helper.assertValueEqual(fireOdds("getIgniteOdds", block("type_planks")), 5, "type_planks igniteOdds (burn_odds)");
        helper.assertValueEqual(fireOdds("getBurnOdds", block("type_planks")), 20, "type_planks burnOdds (ignite_odds)");
        helper.assertValueEqual(fireOdds("getBurnOdds", block("type_stripped_log")), 0, "a block without msm:flammable burns");
        helper.succeed();
    }
}
