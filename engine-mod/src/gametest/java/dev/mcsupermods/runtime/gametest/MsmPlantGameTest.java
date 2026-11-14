package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.types.BlockTypes;
import dev.mcsupermods.runtime.registry.types.MsmCropBlock;
import dev.mcsupermods.runtime.registry.types.MsmLeavesBlock;
import dev.mcsupermods.runtime.registry.types.MsmSaplingBlock;
import dev.mcsupermods.runtime.registry.types.MsmTintedLeavesBlock;
import dev.mcsupermods.runtime.registry.types.MsmUntintedLeavesBlock;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.ItemTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.FarmlandBlock;
import net.minecraft.world.level.block.LeavesBlock;
import net.minecraft.world.level.block.SaplingBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;

/**
 * Plant block type GameTests (ADR 0068 D2, D3, D4, D6; B271) on {@code msm/msm_test/block/type_crop*.json},
 * {@code type_sapling*.json}, {@code type_leaves*.json} and {@code type_log_plant.json}, with the test data pack's
 * {@code msm_test:test_tree} and {@code test_mega_tree} features, vanilla-shaped loot tables (the leaves' sapling chance
 * is 1 so the drop is fixed) and tags ({@code minecraft:logs}, {@code maintains_farmland}, {@code villager_plantable_seeds}).
 * Random ticks and bone meal are driven by calling the block directly with a seeded random. Villagers farming a project
 * crop is an in-game check: the GameTest checks the conditions vanilla's {@code HarvestFarmland} reads (identical on
 * 26.3 and 26.4-snapshot-7). The client tint registration is compiled on both versions but not run (no client in CI).
 */
public class MsmPlantGameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static IntegerProperty age(Block block) {
        Property<?> property = block.getStateDefinition().getProperty("age");
        return (IntegerProperty) property;
    }

    /** Farmland (wet) or another soil at {@code floor}, glowstone beside the plant for light, and nothing at the plant. */
    private static BlockPos soil(GameTestHelper helper, BlockPos floor, Block soil) {
        BlockState state = soil == Blocks.FARMLAND ? Blocks.FARMLAND.defaultBlockState().setValue(FarmlandBlock.MOISTURE, 7)
                : soil.defaultBlockState();
        helper.setBlock(floor, state);
        helper.setBlock(floor.above().east(), Blocks.GLOWSTONE);
        return floor.above();
    }

    private static int count(List<ItemStack> drops, Item item) {
        return drops.stream().filter(s -> s.is(item)).mapToInt(ItemStack::getCount).sum();
    }

    private static List<ItemStack> drops(GameTestHelper helper, BlockState state, BlockPos rel, ItemStack tool) {
        return Block.getDrops(state, helper.getLevel(), helper.absolutePos(rel), null, null, tool);
    }

    // Loading

    @GameTest
    public void plantTypesRegisterTheirVanillaClasses(GameTestHelper helper) {
        helper.assertTrue(block("type_crop") instanceof MsmCropBlock crop && crop instanceof CropBlock, "crop: " + block("type_crop"));
        helper.assertTrue(block("type_crop_seven") instanceof MsmCropBlock, "crop (7): " + block("type_crop_seven"));
        helper.assertTrue(block("type_sapling") instanceof MsmSaplingBlock s && s instanceof SaplingBlock, "sapling: " + block("type_sapling"));
        helper.assertTrue(block("type_leaves") instanceof MsmTintedLeavesBlock, "tinted leaves: " + block("type_leaves"));
        helper.assertTrue(block("type_leaves_coloured") instanceof MsmTintedLeavesBlock, "coloured leaves: " + block("type_leaves_coloured"));
        helper.assertTrue(block("type_leaves_untinted") instanceof MsmUntintedLeavesBlock, "untinted leaves: " + block("type_leaves_untinted"));
        helper.assertTrue(block("type_leaves_plain") instanceof MsmLeavesBlock leaves && leaves instanceof LeavesBlock,
                "plain leaves: " + block("type_leaves_plain"));
        List<String> problems = MsmRuntime.report().errors().stream()
                .filter(e -> e.contains("/type_crop") || e.contains("/type_sapling") || e.contains("/type_leaves") || e.contains("/type_log_plant"))
                .toList();
        helper.assertTrue(problems.isEmpty(), "plant errors: " + problems);
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("type_crop_seven.json") && w.contains("stage_heights has 2 entries")),
                "no warning for the stage_heights length: " + warnings);
        // Vanilla's plant and leaves properties (Blocks.<clinit>).
        BlockState crop = block("type_crop").defaultBlockState();
        helper.assertTrue(crop.getCollisionShape(helper.getLevel(), helper.absolutePos(BlockPos.ZERO)).isEmpty(), "a crop has collision");
        helper.assertFalse(block("type_leaves").defaultBlockState().canOcclude(), "leaves occlude");
        helper.assertTrue(block("type_leaves").defaultBlockState().ignitedByLava(), "leaves are not ignited by lava");
        helper.succeed();
    }

    // Crops

    @GameTest
    public void cropAgeRangesFollowMaxAge(GameTestHelper helper) {
        MsmCropBlock three = (MsmCropBlock) block("type_crop");
        MsmCropBlock seven = (MsmCropBlock) block("type_crop_seven");
        helper.assertValueEqual(age(three).getPossibleValues(), List.of(0, 1, 2, 3), "type_crop ages");
        helper.assertValueEqual(age(seven).getPossibleValues(), List.of(0, 1, 2, 3, 4, 5, 6, 7), "type_crop_seven ages");
        helper.assertValueEqual(three.getMaxAge(), 3, "type_crop max age");
        helper.assertValueEqual(three.defaultBlockState().getValue(age(three)), 0, "default age");
        helper.assertTrue(three.isMaxAge(three.getStateForAge(3)), "age 3 is not mature");
        helper.assertFalse(three.isMaxAge(three.getStateForAge(2)), "age 2 is mature");
        helper.assertFalse(three.defaultBlockState().hasProperty(CropBlock.AGE), "vanilla's age 0..7 is on a max_age 3 crop");
        // stage_heights [3, 6, 9, 12] as written; a list of the wrong length falls back to vanilla's ramp (2..16).
        BlockPos abs = helper.absolutePos(BlockPos.ZERO);
        double h1 = three.getStateForAge(1).getShape(helper.getLevel(), abs, CollisionContext.empty()).max(Direction.Axis.Y);
        helper.assertValueEqual(Math.round(h1 * 16), 6L, "type_crop stage 1 height");
        double s0 = seven.getStateForAge(0).getShape(helper.getLevel(), abs, CollisionContext.empty()).max(Direction.Axis.Y);
        double s7 = seven.getStateForAge(7).getShape(helper.getLevel(), abs, CollisionContext.empty()).max(Direction.Axis.Y);
        helper.assertValueEqual(Math.round(s0 * 16), 2L, "type_crop_seven stage 0 height");
        helper.assertValueEqual(Math.round(s7 * 16), 16L, "type_crop_seven stage 7 height");
        helper.succeed();
    }

    @GameTest(maxTicks = 400)
    public void cropRandomTickGrowsOneStage(GameTestHelper helper) {
        MsmCropBlock crop = (MsmCropBlock) block("type_crop");
        BlockPos at = soil(helper, new BlockPos(1, 1, 1), Blocks.FARMLAND);
        helper.setBlock(at, crop.defaultBlockState());
        RandomSource random = RandomSource.create(271L);
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(at);
        helper.succeedWhen(() -> {
            BlockState before = level.getBlockState(abs);
            helper.assertTrue(before.is(crop), "the crop is gone: " + before);
            int was = before.getValue(age(crop));
            before.randomTick(level, abs, random);
            int now = level.getBlockState(abs).getValue(age(crop));
            helper.assertTrue(now - was <= 1, "one random tick grew " + was + " to " + now);
            helper.assertTrue(now >= 1, "not grown yet (age " + now + ")");
        });
    }

    @GameTest
    public void cropBonemealStaysWithinRange(GameTestHelper helper) {
        MsmCropBlock three = (MsmCropBlock) block("type_crop");
        BlockPos at = soil(helper, new BlockPos(1, 1, 1), Blocks.FARMLAND);
        BlockPos abs = helper.absolutePos(at);
        ServerLevel level = helper.getLevel();
        helper.setBlock(at, three.defaultBlockState());
        three.growCrops(level, abs, level.getBlockState(abs));
        helper.assertValueEqual(level.getBlockState(abs).getValue(age(three)), 1, "bone meal 1..1 from 0");
        three.growCrops(level, abs, level.getBlockState(abs));
        three.growCrops(level, abs, level.getBlockState(abs));
        three.growCrops(level, abs, level.getBlockState(abs));
        helper.assertValueEqual(level.getBlockState(abs).getValue(age(three)), 3, "bone meal stops at max_age");
        // bonemeal_growth { min: 3, max: 2 }: the bounds are swapped, so 2..3.
        MsmCropBlock seven = (MsmCropBlock) block("type_crop_seven");
        BlockPos at7 = soil(helper, new BlockPos(4, 1, 1), Blocks.DIRT);
        BlockPos abs7 = helper.absolutePos(at7);
        for (int i = 0; i < 20; i++) {
            helper.setBlock(at7, seven.defaultBlockState());
            seven.growCrops(level, abs7, level.getBlockState(abs7));
            int grown = level.getBlockState(abs7).getValue(age(seven));
            helper.assertTrue(grown == 2 || grown == 3, "swapped bone meal range gave " + grown);
        }
        helper.succeed();
    }

    @GameTest
    public void cropPlacementFollowsTheSoilTag(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockState three = block("type_crop").defaultBlockState();
        BlockState seven = block("type_crop_seven").defaultBlockState();
        BlockPos farm = soil(helper, new BlockPos(1, 1, 1), Blocks.FARMLAND);
        BlockPos dirt = soil(helper, new BlockPos(4, 1, 1), Blocks.DIRT);
        BlockPos stone = soil(helper, new BlockPos(1, 1, 4), Blocks.STONE);
        helper.assertTrue(three.canSurvive(level, helper.absolutePos(farm)), "default soil: not on farmland");
        helper.assertFalse(three.canSurvive(level, helper.absolutePos(dirt)), "default soil: on dirt");
        helper.assertFalse(three.canSurvive(level, helper.absolutePos(stone)), "default soil: on stone");
        helper.assertTrue(seven.canSurvive(level, helper.absolutePos(dirt)), "#minecraft:dirt soil: not on dirt");
        helper.assertFalse(seven.canSurvive(level, helper.absolutePos(farm)), "#minecraft:dirt soil: on farmland");
        helper.succeed();
    }

    @GameTest
    public void seedsPlantTheCropAndPickBlockReturnsThem(GameTestHelper helper) {
        Block crop = block("type_crop");
        Item seeds = item("type_crop_seeds");
        helper.assertTrue(seeds instanceof BlockItem b && b.getBlock() == crop, "seeds item: " + seeds);
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("type_crop")), "an item has the crop's own id");
        helper.assertValueEqual(crop.asItem(), seeds, "the crop's item");
        helper.assertValueEqual(seeds.getDescriptionId(), "item.msm_test.type_crop_seeds", "seeds name key");
        helper.assertTrue(MsmRuntime.report().items().contains(id("type_crop_seeds")), "the seeds are not counted as an item");
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("type_crop_seven")), "item: false registered an item");
        BlockPos floor = new BlockPos(1, 1, 1);
        BlockPos at = soil(helper, floor, Blocks.FARMLAND);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(1.5, 2, 3.5)));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(seeds));
        BlockPos abs = helper.absolutePos(floor);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false);
        InteractionResult result = player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
        helper.assertTrue(result.consumesAction(), "planting result " + result);
        helper.assertBlockPresent(crop, at);
        ItemStack picked = helper.getBlockState(at).getCloneItemStack(helper.getLevel(), helper.absolutePos(at), false);
        helper.assertTrue(picked.is(seeds), "pick block gave " + picked);
        helper.succeed();
    }

    @GameTest
    public void cropLootGivesProduceOnlyWhenMature(GameTestHelper helper) {
        MsmCropBlock crop = (MsmCropBlock) block("type_crop");
        Item seeds = item("type_crop_seeds");
        BlockPos at = soil(helper, new BlockPos(1, 1, 1), Blocks.FARMLAND);
        List<ItemStack> mature = drops(helper, crop.getStateForAge(3), at, ItemStack.EMPTY);
        helper.assertValueEqual(count(mature, Items.APPLE), 1, "produce at max age: " + mature);
        helper.assertTrue(count(mature, seeds) >= 0 && count(mature, seeds) <= 3, "seeds at max age: " + mature);
        List<ItemStack> young = drops(helper, crop.getStateForAge(1), at, ItemStack.EMPTY);
        helper.assertValueEqual(count(young, Items.APPLE), 0, "produce below max age: " + young);
        helper.assertValueEqual(count(young, seeds), 1, "seeds below max age: " + young);
        helper.succeed();
    }

    @GameTest
    public void blockItemIdClashIsALoadError(GameTestHelper helper) {
        helper.assertFalse(BuiltInRegistries.BLOCK.containsKey(id("seeds_clash")), "a block whose item.id clashes registered");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("seeds_clash.json")
                && e.contains("item id minecraft:wheat_seeds is already registered (item.id)")), "no clash error: " + errors);
        helper.succeed();
    }

    @GameTest
    public void villagerFarmingConditionsHold(GameTestHelper helper) {
        // HarvestFarmland (26.3 and 26.4-snapshot-7): a CropBlock at isMaxAge on a FarmlandBlock is harvested, and a
        // BlockItem in #minecraft:villager_plantable_seeds is planted. Whether a farmer does so is an in-game check.
        MsmCropBlock crop = (MsmCropBlock) block("type_crop");
        helper.assertTrue(crop.isMaxAge(crop.getStateForAge(crop.getMaxAge())), "not mature at max_age");
        ItemStack seeds = new ItemStack(item("type_crop_seeds"));
        helper.assertTrue(seeds.is(ItemTags.VILLAGER_PLANTABLE_SEEDS), "seeds not in #villager_plantable_seeds");
        helper.assertTrue(seeds.getItem() instanceof BlockItem b && b.getBlock() == crop, "seeds do not plant the crop");
        helper.succeed();
    }

    // Saplings

    @GameTest(skyAccess = true) // no barrier roof: a tree is taller than the 8-block test structure
    public void saplingGrowsTheProjectTree(GameTestHelper helper) {
        MsmSaplingBlock sapling = (MsmSaplingBlock) block("type_sapling");
        BlockPos floor = new BlockPos(3, 0, 3);
        helper.setBlock(floor, Blocks.DIRT);
        BlockPos at = floor.above();
        helper.setBlock(at, sapling.defaultBlockState());
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(at);
        RandomSource random = RandomSource.create(271L);
        sapling.advanceTree(level, abs, level.getBlockState(abs), random);
        helper.assertValueEqual(level.getBlockState(abs).getValue(SaplingBlock.STAGE), 1, "first stage");
        sapling.advanceTree(level, abs, level.getBlockState(abs), random);
        helper.assertBlockPresent(block("type_log_plant"), at);
        helper.assertBlockPresent(block("type_log_plant"), at.above(3));
        boolean leaves = BlockPos.betweenClosedStream(abs.offset(-2, 2, -2), abs.offset(2, 7, 2))
                .anyMatch(p -> level.getBlockState(p).is(block("type_leaves")));
        helper.assertTrue(leaves, "the tree has no project leaves");
        helper.succeed();
    }

    @GameTest(skyAccess = true) // no barrier roof: a tree is taller than the 8-block test structure
    public void fourSaplingsGrowTheMegaTree(GameTestHelper helper) {
        MsmSaplingBlock sapling = (MsmSaplingBlock) block("type_sapling");
        BlockState ready = sapling.defaultBlockState().setValue(SaplingBlock.STAGE, 1);
        BlockPos corner = new BlockPos(3, 1, 3);
        for (BlockPos p : List.of(corner, corner.east(), corner.south(), corner.east().south())) {
            helper.setBlock(p.below(), Blocks.DIRT);
            helper.setBlock(p, ready);
        }
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(corner);
        sapling.advanceTree(level, abs, level.getBlockState(abs), RandomSource.create(271L));
        for (BlockPos p : List.of(corner, corner.east(), corner.south(), corner.east().south())) {
            helper.assertBlockPresent(block("type_log_plant"), p);
        }
        helper.succeed();
    }

    @GameTest
    public void saplingWithAMissingTreeDoesNotGrowAndWarnsOnce(GameTestHelper helper) {
        MsmSaplingBlock sapling = (MsmSaplingBlock) block("type_sapling_missing");
        helper.setBlock(new BlockPos(1, 0, 1), Blocks.DIRT);
        BlockPos at = new BlockPos(1, 1, 1);
        helper.setBlock(at, sapling.defaultBlockState().setValue(SaplingBlock.STAGE, 1));
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(at);
        sapling.advanceTree(level, abs, level.getBlockState(abs), RandomSource.create(271L));
        helper.assertBlockPresent(sapling, at);
        List<String> warnings = MsmRuntime.report().warnings();
        long missing = warnings.stream()
                .filter(w -> w.equals("sapling msm_test:type_sapling_missing: tree feature msm_test:no_such_tree is not in any loaded data pack"))
                .count();
        helper.assertValueEqual(missing, 1L, "warnings for the missing tree: " + warnings);
        helper.assertFalse(warnings.stream().anyMatch(w -> w.startsWith("sapling msm_test:type_sapling:")),
                "the sapling with a data pack tree was reported: " + warnings);
        helper.succeed();
    }

    // Leaves

    @GameTest
    public void leavesWithoutALogDecay(GameTestHelper helper) {
        BlockPos at = new BlockPos(1, 1, 1);
        BlockState lone = block("type_leaves").defaultBlockState();
        helper.assertValueEqual(lone.getValue(LeavesBlock.DISTANCE), 7, "default distance");
        helper.assertTrue(lone.isRandomlyTicking(), "far, non-persistent leaves do not tick");
        helper.setBlock(at, lone);
        lone.randomTick(helper.getLevel(), helper.absolutePos(at), RandomSource.create(271L));
        helper.assertBlockNotPresent(block("type_leaves"), at);
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void leavesNextToAProjectLogStay(GameTestHelper helper) {
        Block leaves = block("type_leaves");
        BlockPos at = new BlockPos(1, 1, 1);
        helper.setBlock(at, leaves.defaultBlockState());
        helper.setBlock(at.east(), block("type_log_plant")); // in #minecraft:logs through the test data pack
        helper.succeedWhen(() -> {
            BlockState state = helper.getBlockState(at);
            helper.assertTrue(state.is(leaves), "the leaves are gone: " + state);
            helper.assertValueEqual(state.getValue(LeavesBlock.DISTANCE), 1, "distance next to the log");
            helper.assertFalse(state.isRandomlyTicking(), "leaves next to a log would decay");
        });
    }

    @GameTest
    public void playerPlacedLeavesPersist(GameTestHelper helper) {
        Block leaves = block("type_leaves");
        BlockPos floor = new BlockPos(1, 1, 1);
        helper.setBlock(floor, Blocks.STONE);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(1.5, 2, 3.5)));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("type_leaves")));
        BlockPos abs = helper.absolutePos(floor);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false);
        InteractionResult result = player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
        helper.assertTrue(result.consumesAction(), "leaves placement result " + result);
        BlockPos at = floor.above();
        BlockState placed = helper.getBlockState(at);
        helper.assertTrue(placed.is(leaves) && placed.getValue(LeavesBlock.PERSISTENT), "placed leaves: " + placed);
        placed.randomTick(helper.getLevel(), helper.absolutePos(at), RandomSource.create(271L));
        helper.assertBlockPresent(leaves, at);
        helper.succeed();
    }

    @GameTest
    public void leavesDropTheSaplingOrThemselvesWithShears(GameTestHelper helper) {
        Block leaves = block("type_leaves");
        Item sapling = item("type_sapling");
        BlockPos at = new BlockPos(1, 1, 1);
        BlockState state = leaves.defaultBlockState();
        List<ItemStack> sheared = drops(helper, state, at, new ItemStack(Items.SHEARS));
        helper.assertValueEqual(count(sheared, leaves.asItem()), 1, "leaves with shears: " + sheared);
        helper.assertValueEqual(count(sheared, sapling), 0, "sapling with shears: " + sheared);
        List<ItemStack> byHand = drops(helper, state, at, ItemStack.EMPTY);
        helper.assertValueEqual(count(byHand, sapling), 1, "sapling by hand (chance 1 in the test table): " + byHand);
        helper.assertValueEqual(count(byHand, leaves.asItem()), 0, "leaves by hand: " + byHand);
        helper.succeed();
    }

    @GameTest
    public void tintedLeavesAreRecordedForTheClient(GameTestHelper helper) {
        var tinted = BlockTypes.tintedLeaves();
        helper.assertValueEqual(tinted.get(block("type_leaves")), new BlockType.SourceTint(BlockType.TintSource.FOLIAGE), "foliage tint");
        helper.assertValueEqual(tinted.get(block("type_leaves_coloured")), new BlockType.ColourTint(6266528), "constant tint");
        helper.assertFalse(tinted.containsKey(block("type_leaves_untinted")), "untinted leaves recorded");
        helper.assertFalse(tinted.containsKey(block("type_leaves_plain")), "plain leaves recorded");
        helper.succeed();
    }

    // Version seams

    @GameTest
    public void plantSeamsMatchTheVersion(GameTestHelper helper) {
        String grower = PlantSeamCheck.growerProblem((MsmSaplingBlock) block("type_sapling"));
        helper.assertTrue(grower == null, String.valueOf(grower));
        String leaves = PlantSeamCheck.leavesProblem();
        helper.assertTrue(leaves == null, String.valueOf(leaves));
        // animateTick reads the ambient sound argument; on a server level it only must not fail.
        BlockPos at = new BlockPos(1, 1, 1);
        RandomSource random = RandomSource.create(271L);
        for (String path : List.of("type_leaves", "type_leaves_untinted", "type_leaves_plain")) {
            helper.setBlock(at, block(path));
            BlockState state = helper.getBlockState(at);
            for (int i = 0; i < 50; i++) {
                state.getBlock().animateTick(state, helper.getLevel(), helper.absolutePos(at), random);
            }
        }
        helper.succeed();
    }
}
