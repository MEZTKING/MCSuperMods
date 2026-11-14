package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.BlockSetTypes;
import dev.mcsupermods.runtime.registry.types.MsmButtonBlock;
import dev.mcsupermods.runtime.registry.types.MsmDoorBlock;
import dev.mcsupermods.runtime.registry.types.MsmPressurePlateBlock;
import dev.mcsupermods.runtime.registry.types.MsmTrapDoorBlock;
import dev.mcsupermods.runtime.registry.types.MsmWeightedPressurePlateBlock;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.item.DoubleHighBlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ButtonBlock;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.PressurePlateBlock;
import net.minecraft.world.level.block.TrapDoorBlock;
import net.minecraft.world.level.block.WeightedPressurePlateBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.AttachFace;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;

/**
 * Redstone block type GameTests (ADR 0067 D2, D4; B267) on {@code msm/msm_test/block/type_*.json}: doors (both halves
 * from a {@link DoubleHighBlockItem}, opening by hand and by redstone, one drop from either half with the test data pack's
 * vanilla-shaped loot table), trapdoors, buttons ({@code press_ticks}, arrows), pressure plates (sensitivity of the set
 * type) and weighted plates ({@code weighted_max}), the {@code set_type} seam and {@code ignitedByLava} with
 * {@code msm:flammable}.
 *
 * <p>Entities on a button or plate are handed to {@code BlockState.entityInside} directly, as an entity's movement would,
 * so the tests do not wait for item physics; the plate's own scheduled ticks then recount the entities.
 */
public class MsmRedstoneTypeGameTest {
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

    /** Places a door with the player standing south of {@code floor}, looking north; returns the lower half. */
    private static BlockPos placeDoor(GameTestHelper helper, BlockPos floor, String path) {
        helper.setBlock(floor, Blocks.STONE);
        ServerPlayer player = player(helper, new Vec3(floor.getX() + 0.5, floor.getY() + 1, floor.getZ() + 3.5));
        player.setYRot(180);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item(path)));
        InteractionResult result = use(helper, player, floor, Direction.UP);
        helper.assertTrue(result.consumesAction(), "door placement result " + result);
        return floor.above();
    }

    /** Hands {@code entity} to the block at {@code rel} as an entity moving through it would. */
    private static void inside(GameTestHelper helper, BlockPos rel, Entity entity) {
        BlockPos abs = helper.absolutePos(rel);
        helper.getBlockState(rel).entityInside(helper.getLevel(), abs, entity, InsideBlockEffectApplier.NOOP, true);
    }

    /** An item entity at rest in the middle of the block at {@code rel}, a little above its floor. */
    private static ItemEntity restingItem(GameTestHelper helper, BlockPos rel, Item item) {
        ItemEntity entity = helper.spawnItem(item, new Vec3(rel.getX() + 0.5, rel.getY() + 0.05, rel.getZ() + 0.5));
        entity.setDeltaMovement(Vec3.ZERO);
        entity.setNoGravity(true);
        return entity;
    }

    private static int dropsOf(GameTestHelper helper, BlockPos abs, Item item) {
        int count = 0;
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(abs).inflate(3))) {
            if (e.getItem().is(item)) {
                count += e.getItem().getCount();
                e.discard();
            }
        }
        return count;
    }

    // Loading

    @GameTest
    public void redstoneTypesRegisterTheirVanillaClasses(GameTestHelper helper) {
        helper.assertTrue(block("type_door") instanceof MsmDoorBlock, "door: " + block("type_door"));
        helper.assertTrue(block("type_iron_door") instanceof MsmDoorBlock, "iron door: " + block("type_iron_door"));
        helper.assertTrue(block("type_trapdoor") instanceof MsmTrapDoorBlock, "trapdoor: " + block("type_trapdoor"));
        helper.assertTrue(block("type_button") instanceof MsmButtonBlock, "button: " + block("type_button"));
        helper.assertTrue(block("type_plate") instanceof MsmPressurePlateBlock, "plate: " + block("type_plate"));
        helper.assertTrue(block("type_weighted_plate") instanceof MsmWeightedPressurePlateBlock,
                "weighted plate: " + block("type_weighted_plate"));
        helper.assertTrue(item("type_door") instanceof DoubleHighBlockItem, "door item: " + item("type_door"));
        helper.assertFalse(item("type_button") instanceof DoubleHighBlockItem, "a button item is double high");
        // Family properties (Blocks.<clinit>).
        helper.assertFalse(block("type_door").defaultBlockState().canOcclude(), "a door occludes");
        helper.assertFalse(block("type_trapdoor").defaultBlockState().canOcclude(), "a trapdoor occludes");
        helper.assertFalse(block("type_trapdoor").defaultBlockState().isValidSpawn(helper.getLevel(), helper.absolutePos(BlockPos.ZERO),
                EntityTypes.ZOMBIE), "a trapdoor is a valid spawn");
        helper.assertTrue(block("type_button").defaultBlockState().getCollisionShape(helper.getLevel(), BlockPos.ZERO,
                CollisionContext.empty()).isEmpty(), "a button has collision");
        BlockState plate = block("type_plate").defaultBlockState();
        helper.assertTrue(plate.getCollisionShape(helper.getLevel(), BlockPos.ZERO, CollisionContext.empty()).isEmpty(),
                "a plate has collision");
        helper.assertTrue(plate.isSolid(), "a plate is not forced solid");
        List<String> errors = MsmRuntime.report().errors().stream()
                .filter(e -> e.contains("type_door") || e.contains("type_iron_door") || e.contains("type_trapdoor")
                        || e.contains("button.json") || e.contains("plate.json"))
                .toList();
        helper.assertTrue(errors.isEmpty(), "redstone type errors: " + errors);
        helper.succeed();
    }

    @GameTest
    public void setTypeSeamMapsWood(GameTestHelper helper) {
        BlockSetType wood = BlockSetTypes.of(BlockType.SetType.WOOD);
        helper.assertTrue(wood == BlockSetTypeCheck.wood(), "set type wood is not BlockSetType." + BlockSetTypeCheck.WOOD_NAME);
        helper.assertTrue(((DoorBlock) block("type_door")).type() == BlockSetTypeCheck.wood(),
                "type_door is not BlockSetType." + BlockSetTypeCheck.WOOD_NAME);
        helper.assertTrue(((DoorBlock) block("type_iron_door")).type() == BlockSetType.IRON, "type_iron_door is not IRON");
        // Vanilla: iron and gold are not opened by hand (ADR 0067 D2 names only iron); arrows press the wooden ones.
        for (BlockType.SetType setType : BlockType.SetType.values()) {
            BlockSetType vanilla = BlockSetTypes.of(setType);
            boolean byHand = setType != BlockType.SetType.IRON && setType != BlockType.SetType.GOLD;
            helper.assertValueEqual(vanilla.canOpenByHand(), byHand, setType.id() + " opens by hand");
            helper.assertValueEqual(vanilla.canButtonBeActivatedByArrows(), setType.wooden(), setType.id() + " arrows");
        }
        helper.succeed();
    }

    // msm:flammable sets ignitedByLava (B263 follow-up)

    @GameTest
    public void flammableBlocksAreIgnitedByLava(GameTestHelper helper) {
        helper.assertTrue(block("type_planks").defaultBlockState().ignitedByLava(), "type_planks (msm:flammable) not ignited by lava");
        helper.assertTrue(block("type_log").defaultBlockState().ignitedByLava(), "type_log (msm:flammable) not ignited by lava");
        helper.assertFalse(block("type_stripped_log").defaultBlockState().ignitedByLava(), "type_stripped_log ignited by lava");
        helper.assertFalse(block("type_door").defaultBlockState().ignitedByLava(), "type_door (no msm:flammable) ignited by lava");
        helper.succeed();
    }

    // door

    @GameTest
    public void doorPlacesBothHalvesAndOpensByHand(GameTestHelper helper) {
        BlockPos lower = placeDoor(helper, new BlockPos(2, 1, 2), "type_door");
        BlockPos upper = lower.above();
        helper.assertBlockProperty(lower, DoorBlock.HALF, DoubleBlockHalf.LOWER);
        helper.assertBlockProperty(upper, DoorBlock.HALF, DoubleBlockHalf.UPPER);
        helper.assertTrue(helper.getBlockState(upper).is(block("type_door")), "upper half " + helper.getBlockState(upper));
        // msm:on_interact fires after vanilla's own toggle (ADR 0067 D3): the door is open when the event runs.
        List<Boolean> openWhenFired = new ArrayList<>();
        BlockPos abs = helper.absolutePos(lower);
        ServerLevel level = helper.getLevel();
        EventRunner.setListener(new EventListener() {
            @Override
            public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
                if (event.getPath().equals("door_used")) {
                    openWhenFired.add(level.getBlockState(abs).getValue(DoorBlock.OPEN));
                }
            }
        });
        try {
            ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5));
            player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            InteractionResult result = use(helper, player, upper, Direction.SOUTH);
            helper.assertTrue(result.consumesAction(), "use result " + result);
        } finally {
            EventRunner.setListener(null);
        }
        helper.assertBlockProperty(lower, DoorBlock.OPEN, true);
        helper.assertBlockProperty(upper, DoorBlock.OPEN, true);
        helper.assertValueEqual(openWhenFired, List.of(true), "door state when msm:on_interact fired");
        helper.succeed();
    }

    @GameTest
    public void ironDoorOpensByRedstoneNotByHand(GameTestHelper helper) {
        BlockPos lower = placeDoor(helper, new BlockPos(2, 1, 2), "type_iron_door");
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5));
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        use(helper, player, lower, Direction.SOUTH);
        helper.assertBlockProperty(lower, DoorBlock.OPEN, false);
        helper.setBlock(lower.east(), Blocks.REDSTONE_BLOCK);
        helper.assertBlockProperty(lower, DoorBlock.POWERED, true);
        helper.assertBlockProperty(lower, DoorBlock.OPEN, true);
        helper.assertBlockProperty(lower.above(), DoorBlock.OPEN, true);
        helper.succeed();
    }

    @GameTest
    public void doorDropsOneItemFromEitherHalf(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos a = placeDoor(helper, new BlockPos(1, 1, 1), "type_door");
        level.destroyBlock(helper.absolutePos(a.above()), true); // the upper half; the lower one goes with it
        helper.assertBlockNotPresent(block("type_door"), a);
        helper.assertValueEqual(dropsOf(helper, helper.absolutePos(a), item("type_door")), 1, "items from breaking the upper half");
        BlockPos b = placeDoor(helper, new BlockPos(4, 1, 1), "type_door");
        level.destroyBlock(helper.absolutePos(b), true); // the lower half
        helper.assertBlockNotPresent(block("type_door"), b.above());
        helper.assertValueEqual(dropsOf(helper, helper.absolutePos(b), item("type_door")), 1, "items from breaking the lower half");
        helper.succeed();
    }

    // trapdoor

    @GameTest
    public void trapdoorOpensAndTakesWater(GameTestHelper helper) {
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at, block("type_trapdoor"));
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5));
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        InteractionResult result = use(helper, player, at, Direction.UP);
        helper.assertTrue(result.consumesAction(), "use result " + result);
        helper.assertBlockProperty(at, TrapDoorBlock.OPEN, true);
        TrapDoorBlock trapdoor = (TrapDoorBlock) block("type_trapdoor");
        boolean placed = trapdoor.placeLiquid(helper.getLevel(), helper.absolutePos(at), helper.getBlockState(at),
                Fluids.WATER.defaultFluidState());
        helper.assertTrue(placed, "the trapdoor did not take water");
        helper.assertBlockProperty(at, TrapDoorBlock.WATERLOGGED, true);
        helper.succeed();
    }

    // button

    private static BlockPos floorButton(GameTestHelper helper, BlockPos floor, String path) {
        helper.setBlock(floor, Blocks.STONE);
        BlockPos at = floor.above();
        helper.setBlock(at, block(path).defaultBlockState().setValue(ButtonBlock.FACE, AttachFace.FLOOR));
        return at;
    }

    private static int signal(GameTestHelper helper, BlockPos rel) {
        return helper.getBlockState(rel).getSignal(helper.getLevel(), helper.absolutePos(rel), Direction.UP);
    }

    @GameTest(maxTicks = 60)
    public void buttonStaysPressedForPressTicks(GameTestHelper helper) {
        BlockPos stone = floorButton(helper, new BlockPos(1, 1, 2), "type_stone_button"); // press_ticks 5
        BlockPos wood = floorButton(helper, new BlockPos(4, 1, 2), "type_button"); // default 30 (wooden)
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5));
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        use(helper, player, stone, Direction.UP);
        use(helper, player, wood, Direction.UP);
        helper.assertBlockProperty(stone, ButtonBlock.POWERED, true);
        helper.assertBlockProperty(wood, ButtonBlock.POWERED, true);
        helper.assertValueEqual(signal(helper, stone), 15, "pressed button signal");
        helper.runAfterDelay(3, () -> helper.assertBlockProperty(stone, ButtonBlock.POWERED, true));
        helper.runAfterDelay(8, () -> helper.assertBlockProperty(stone, ButtonBlock.POWERED, false));
        helper.runAfterDelay(25, () -> helper.assertBlockProperty(wood, ButtonBlock.POWERED, true));
        helper.runAfterDelay(35, () -> {
            helper.assertBlockProperty(wood, ButtonBlock.POWERED, false);
            helper.assertValueEqual(signal(helper, wood), 0, "released button signal");
            helper.succeed();
        });
    }

    @GameTest
    public void arrowPressesAWoodenButtonOnly(GameTestHelper helper) {
        BlockPos wood = floorButton(helper, new BlockPos(1, 1, 2), "type_button");
        BlockPos stone = floorButton(helper, new BlockPos(4, 1, 2), "type_stone_button");
        for (BlockPos at : List.of(wood, stone)) {
            AbstractArrow arrow = helper.spawn(EntityTypes.ARROW, new Vec3(at.getX() + 0.5, at.getY() + 0.02, at.getZ() + 0.5));
            arrow.setNoGravity(true);
            arrow.setDeltaMovement(Vec3.ZERO);
            inside(helper, at, arrow);
        }
        helper.assertBlockProperty(wood, ButtonBlock.POWERED, true);
        helper.assertBlockProperty(stone, ButtonBlock.POWERED, false);
        helper.succeed();
    }

    // pressure plates

    private static BlockPos floorPlate(GameTestHelper helper, BlockPos floor, String path) {
        helper.setBlock(floor, Blocks.STONE);
        BlockPos at = floor.above();
        helper.setBlock(at, block(path));
        return at;
    }

    @GameTest
    public void woodenPlateTakesItemsStonePlateOnlyMobs(GameTestHelper helper) {
        BlockPos wood = floorPlate(helper, new BlockPos(1, 1, 2), "type_plate");
        BlockPos stone = floorPlate(helper, new BlockPos(4, 1, 2), "type_stone_plate");
        inside(helper, wood, restingItem(helper, wood, Items.STONE));
        inside(helper, stone, restingItem(helper, stone, Items.STONE));
        helper.assertBlockProperty(wood, PressurePlateBlock.POWERED, true);
        helper.assertBlockProperty(stone, PressurePlateBlock.POWERED, false);
        helper.assertValueEqual(signal(helper, wood), 15, "wooden plate signal");
        Entity cow = helper.spawnWithNoFreeWill(EntityTypes.COW, new Vec3(stone.getX() + 0.5, stone.getY(), stone.getZ() + 0.5));
        inside(helper, stone, cow);
        helper.assertBlockProperty(stone, PressurePlateBlock.POWERED, true);
        helper.succeed();
    }

    @GameTest(maxTicks = 60)
    public void weightedPlateSignalGrowsWithTheEntityCount(GameTestHelper helper) {
        // weighted_max 4: vanilla's ceil(min(count, 4) / 4 * 15), so 1 entity is 4, 2 are 8 and 4 or more are 15.
        BlockPos at = floorPlate(helper, new BlockPos(2, 1, 2), "type_weighted_plate");
        ItemEntity first = restingItem(helper, at, Items.STONE);
        inside(helper, at, first);
        helper.assertBlockProperty(at, WeightedPressurePlateBlock.POWER, 4);
        restingItem(helper, at, Items.DIRT);
        // The plate recounts on its own scheduled tick (every 10 ticks while pressed).
        helper.runAfterDelay(15, () -> {
            helper.assertBlockProperty(at, WeightedPressurePlateBlock.POWER, 8);
            for (Item more : List.of(Items.SAND, Items.GRAVEL, Items.COBBLESTONE)) {
                restingItem(helper, at, more);
            }
        });
        helper.runAfterDelay(30, () -> {
            helper.assertBlockProperty(at, WeightedPressurePlateBlock.POWER, 15);
            helper.assertValueEqual(signal(helper, at), 15, "full weighted plate signal");
            helper.succeed();
        });
    }
}
