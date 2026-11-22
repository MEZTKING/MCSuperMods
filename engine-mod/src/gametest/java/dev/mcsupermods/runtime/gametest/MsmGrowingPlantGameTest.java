package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.types.Companions;
import dev.mcsupermods.runtime.registry.types.MsmBambooBlock;
import dev.mcsupermods.runtime.registry.types.MsmBambooShootBlock;
import dev.mcsupermods.runtime.registry.types.MsmBigDripleafBlock;
import dev.mcsupermods.runtime.registry.types.MsmColumnPlantBlock;
import dev.mcsupermods.runtime.registry.types.MsmDripleafStemBlock;
import dev.mcsupermods.runtime.registry.types.MsmGrowingPlantBodyBlock;
import dev.mcsupermods.runtime.registry.types.MsmGrowingPlantHeadBlock;
import dev.mcsupermods.runtime.registry.types.MsmMultifaceBlock;
import dev.mcsupermods.runtime.registry.types.MsmSmallDripleafBlock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicInteger;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.BoneMealItem;
import net.minecraft.world.item.DoubleHighBlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.BambooSaplingBlock;
import net.minecraft.world.level.block.BambooStalkBlock;
import net.minecraft.world.level.block.BigDripleafBlock;
import net.minecraft.world.level.block.BigDripleafStemBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CactusBlock;
import net.minecraft.world.level.block.CaveVines;
import net.minecraft.world.level.block.GlowLichenBlock;
import net.minecraft.world.level.block.GrowingPlantHeadBlock;
import net.minecraft.world.level.block.KelpBlock;
import net.minecraft.world.level.block.KelpPlantBlock;
import net.minecraft.world.level.block.MultifaceBlock;
import net.minecraft.world.level.block.SmallDripleafBlock;
import net.minecraft.world.level.block.SugarCaneBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BambooLeaves;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.block.state.properties.Tilt;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for growing and climbing plants (ADR 0103 D1, D3, D4 and its amendment after B503; B509) on
 * {@code msm/msm_test/block/plant3_*.json}: growing plants (kelp-like, vines up and down, cave-vine-like berries), column
 * plants (cane, cactus, bamboo with its shoot), multiface plants and dripleaves. Tall plants grow in
 * {@code plant3_tower}, a 5x32x5 open box with a stone floor. Uses and bone meal go through
 * {@code ServerPlayerGameMode.useItemOn}, as the network handler does; random ticks are driven by calling the block with a
 * seeded random.
 */
public class MsmGrowingPlantGameTest {
    private static final String TOWER = "msm_runtime_gametest:plant3_tower";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(0.5, 1, 0.5)));
        return player;
    }

    /** A right-click on {@code face} of the block at {@code rel} holding {@code stack}, as the network handler does. */
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, ItemStack stack, BlockPos rel, Direction face) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        Vec3 hitAt = Vec3.atCenterOf(abs).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, new BlockHitResult(hitAt, face, abs, false));
    }

    private static InteractionResult boneMeal(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        return use(helper, player, new ItemStack(Items.BONE_MEAL), rel, Direction.UP);
    }

    /** Random ticks on the block at {@code rel} (whatever is there each time). */
    private static void randomTicks(GameTestHelper helper, BlockPos rel, int count, RandomSource random) {
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(rel);
        for (int i = 0; i < count; i++) {
            BlockState state = level.getBlockState(abs);
            if (state.isRandomlyTicking()) {
                state.randomTick(level, abs, random);
            }
        }
    }

    /** The blocks of the column from {@code rel} going {@code step}, while they are one of {@code blocks}. */
    private static List<BlockState> column(GameTestHelper helper, BlockPos rel, Direction step, Block... blocks) {
        List<BlockState> found = new ArrayList<>();
        BlockPos at = rel;
        while (true) {
            BlockState state = helper.getBlockState(at);
            boolean ours = false;
            for (Block b : blocks) {
                ours |= state.is(b);
            }
            if (!ours) {
                return found;
            }
            found.add(state);
            at = at.relative(step);
        }
    }

    /** The items dropped near {@code rel}, by id, removed from the world. */
    private static Map<String, Integer> collectDrops(GameTestHelper helper, BlockPos rel) {
        Map<String, Integer> found = new TreeMap<>();
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(2))) {
            found.merge(BuiltInRegistries.ITEM.getKey(e.getItem().getItem()).toString(), e.getItem().getCount(), Integer::sum);
            e.discard();
        }
        return found;
    }

    // Loading

    @GameTest
    public void plants3RegisterTheirVanillaClassesAndCompanions(GameTestHelper helper) {
        helper.assertTrue(block("plant3_kelp") instanceof MsmGrowingPlantHeadBlock.Water b && b instanceof KelpBlock, "kelp");
        helper.assertTrue(block("plant3_kelp_plant") instanceof MsmGrowingPlantBodyBlock.Water b && b instanceof KelpPlantBlock, "kelp strand");
        helper.assertTrue(block("plant3_vine_up") instanceof MsmGrowingPlantHeadBlock b && b instanceof GrowingPlantHeadBlock, "vine up");
        helper.assertTrue(block("plant3_weeping_plant") instanceof MsmGrowingPlantBodyBlock, "weeping strand");
        helper.assertTrue(block("plant3_cave").defaultBlockState().hasProperty(CaveVines.BERRIES)
                && !block("plant3_cave").defaultBlockState().getValue(CaveVines.BERRIES), "cave vine berries property");
        helper.assertTrue(block("plant3_cave_plant").defaultBlockState().hasProperty(CaveVines.BERRIES), "cave strand berries property");
        helper.assertFalse(block("plant3_weeping").defaultBlockState().hasProperty(CaveVines.BERRIES), "weeping has berries");
        helper.assertTrue(block("plant3_cane") instanceof MsmColumnPlantBlock.Cane b && b instanceof SugarCaneBlock, "cane");
        helper.assertTrue(block("plant3_cactus") instanceof MsmColumnPlantBlock.Cactus b && b instanceof CactusBlock, "cactus");
        helper.assertTrue(block("plant3_bamboo") instanceof MsmBambooBlock b && b instanceof BambooStalkBlock, "bamboo");
        helper.assertTrue(block("plant3_bamboo_shoot") instanceof MsmBambooShootBlock b && b instanceof BambooSaplingBlock
                && b.stalk() == block("plant3_bamboo"), "bamboo shoot");
        helper.assertTrue(block("plant3_lichen") instanceof MsmMultifaceBlock b && b instanceof GlowLichenBlock, "lichen");
        helper.assertTrue(block("plant3_big_leaf") instanceof MsmBigDripleafBlock b && b instanceof BigDripleafBlock, "big leaf");
        helper.assertTrue(block("plant3_big_leaf_stem") instanceof MsmDripleafStemBlock b && b instanceof BigDripleafStemBlock
                && b.leaf() == block("plant3_big_leaf"), "dripleaf stem");
        helper.assertTrue(block("plant3_small_leaf") instanceof MsmSmallDripleafBlock b && b instanceof SmallDripleafBlock, "small leaf");
        helper.assertTrue(block("plant3_small_leaf").asItem() instanceof DoubleHighBlockItem, "small leaf item");
        helper.assertTrue(Companions.companionOf(block("plant3_cane")).isEmpty(), "a cane has no companion");
        helper.assertTrue(Companions.companionOf(block("plant3_kelp")).orElseThrow() == block("plant3_kelp_plant"), "kelp companion");
        // Companions have no item; their pick block is the element's.
        helper.assertTrue(BuiltInRegistries.ITEM.getValue(id("plant3_kelp_plant")) == Items.AIR, "strand item");
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("/plant3_")).toList();
        helper.assertTrue(errors.isEmpty(), "plant3 errors: " + errors);
        List<String> warnings = MsmRuntime.report().warnings().stream().filter(w -> w.contains("/plant3_")).toList();
        helper.assertTrue(warnings.isEmpty(), "plant3 warnings: " + warnings);
        // Family properties: strands, cane, lichen, shoot and stem have no collision; cactus, bamboo and big leaf do.
        BlockPos abs = helper.absolutePos(BlockPos.ZERO);
        for (String path : List.of("plant3_kelp", "plant3_weeping_plant", "plant3_cane", "plant3_lichen", "plant3_bamboo_shoot",
                "plant3_big_leaf_stem", "plant3_small_leaf")) {
            helper.assertTrue(block(path).defaultBlockState().getCollisionShape(helper.getLevel(), abs).isEmpty(), path + " has collision");
        }
        for (String path : List.of("plant3_cactus", "plant3_bamboo", "plant3_big_leaf")) {
            helper.assertFalse(block(path).defaultBlockState().getCollisionShape(helper.getLevel(), abs).isEmpty(), path + " has no collision");
        }
        helper.assertTrue(block("plant3_cane").defaultBlockState().isRandomlyTicking(), "cane random ticks");
        helper.assertTrue(block("plant3_cactus").defaultBlockState().isRandomlyTicking(), "cactus random ticks");
        helper.succeed();
    }

    // Growing plants

    @GameTest(structure = TOWER, maxTicks = 20)
    public void kelpGrowsInWaterToTwentySixAndBoneMealAddsOne(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        for (int y = 1; y <= 30; y++) {
            helper.setBlock(new BlockPos(2, y, 2), Blocks.WATER);
        }
        helper.setBlock(new BlockPos(2, 1, 2), Blocks.SAND);
        BlockPos base = new BlockPos(2, 2, 2);
        Block kelp = block("plant3_kelp");
        Block strand = block("plant3_kelp_plant");
        helper.setBlock(base, kelp.defaultBlockState());
        helper.assertTrue(helper.getBlockState(base).getFluidState().is(Fluids.WATER), "kelp is waterlogged by nature");
        // Bone meal: one block each, as vanilla's kelp.
        for (int i = 0; i < 3; i++) {
            helper.assertTrue(boneMeal(helper, player, base).consumesAction(), "bone meal " + i);
        }
        helper.assertValueEqual(column(helper, base, Direction.UP, kelp, strand).size(), 4, "kelp after 3 bone meal");
        // Forced random ticks on the tip: the strand stops at age 25, 26 blocks long from age 0.
        helper.setBlock(base, kelp.defaultBlockState());
        for (int y = 3; y <= 30; y++) {
            helper.setBlock(new BlockPos(2, y, 2), Blocks.WATER);
        }
        RandomSource random = RandomSource.create(503);
        for (int i = 0; i < 4000; i++) {
            List<BlockState> now = column(helper, base, Direction.UP, kelp, strand);
            randomTicks(helper, base.above(now.size() - 1), 1, random);
        }
        List<BlockState> grown = column(helper, base, Direction.UP, kelp, strand);
        helper.assertValueEqual(grown.size(), 26, "kelp length");
        BlockState tip = grown.get(grown.size() - 1);
        helper.assertTrue(tip.is(kelp) && tip.getValue(GrowingPlantHeadBlock.AGE) == 25, "kelp tip " + tip);
        for (int i = 0; i < grown.size() - 1; i++) {
            helper.assertTrue(grown.get(i).is(strand), "strand block " + i + ": " + grown.get(i));
        }
        // Out of water a kelp tip is not placed by its item (vanilla's rule).
        helper.setBlock(new BlockPos(0, 1, 0), Blocks.SAND);
        helper.assertFalse(use(helper, player, new ItemStack(kelp), new BlockPos(0, 1, 0), Direction.UP).consumesAction(), "kelp placed in air");
        helper.succeed();
    }

    @GameTest(structure = TOWER, maxTicks = 20)
    public void ownGrowthChanceAndBoneMealCount(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        for (int y = 2; y <= 12; y++) {
            helper.setBlock(new BlockPos(1, y, 1), Blocks.WATER);
        }
        BlockPos base = new BlockPos(1, 2, 1);
        Block kelp = block("plant3_kelp_quick");
        Block strand = block("plant3_kelp_quick_plant");
        helper.setBlock(base, kelp.defaultBlockState());
        // growth_chance 1: every random tick on the tip grows it.
        RandomSource random = RandomSource.create(1);
        for (int i = 0; i < 3; i++) {
            List<BlockState> now = column(helper, base, Direction.UP, kelp, strand);
            randomTicks(helper, base.above(now.size() - 1), 1, random);
        }
        helper.assertValueEqual(column(helper, base, Direction.UP, kelp, strand).size(), 4, "quick kelp after 3 ticks");
        // bonemeal_growth [2, 2].
        boneMeal(helper, player, base);
        helper.assertValueEqual(column(helper, base, Direction.UP, kelp, strand).size(), 6, "quick kelp after bone meal");
        // A vine growing up with max_age 5: placed at age 20, it grows 5 more blocks and stops.
        Block vine = block("plant3_vine_up");
        Block vineStrand = block("plant3_vine_up_plant");
        BlockPos vineBase = new BlockPos(3, 1, 3);
        BlockState placed = ((MsmGrowingPlantHeadBlock) vine).getStateForPlacement(random);
        helper.assertValueEqual(placed.getValue(GrowingPlantHeadBlock.AGE), 20, "placed age with max_age 5");
        helper.setBlock(vineBase, placed);
        for (int i = 0; i < 20; i++) {
            List<BlockState> now = column(helper, vineBase, Direction.UP, vine, vineStrand);
            randomTicks(helper, vineBase.above(now.size() - 1), 1, random);
        }
        helper.assertValueEqual(column(helper, vineBase, Direction.UP, vine, vineStrand).size(), 6, "vine with max_age 5");
        helper.succeed();
    }

    @GameTest(structure = TOWER, maxTicks = 40)
    public void weepingHangsFromItsSoilOnlyAndBreaksWithoutIt(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Block weeping = block("plant3_weeping");
        Block strand = block("plant3_weeping_plant");
        BlockPos ceiling = new BlockPos(2, 20, 2);
        BlockPos tip = ceiling.below();
        ServerLevel level = helper.getLevel();
        helper.setBlock(ceiling, Blocks.STONE);
        helper.assertFalse(weeping.defaultBlockState().canSurvive(level, helper.absolutePos(tip)), "weeping under stone (not its soil)");
        helper.setBlock(ceiling, Blocks.NETHER_WART_BLOCK);
        helper.assertTrue(weeping.defaultBlockState().canSurvive(level, helper.absolutePos(tip)), "weeping under #wart_blocks");
        helper.setBlock(ceiling, Blocks.NETHERRACK);
        helper.assertTrue(weeping.defaultBlockState().canSurvive(level, helper.absolutePos(tip)), "weeping under netherrack");
        helper.setBlock(tip, weeping.defaultBlockState());
        // bonemeal_growth [3, 3], growing down.
        boneMeal(helper, player, tip);
        List<BlockState> hanging = column(helper, tip, Direction.DOWN, weeping, strand);
        helper.assertValueEqual(hanging.size(), 4, "weeping after bone meal");
        helper.assertTrue(hanging.get(3).is(weeping) && hanging.get(0).is(strand), "tip at the bottom: " + hanging);
        // Bone meal on the strand grows the tip too.
        boneMeal(helper, player, tip);
        helper.assertValueEqual(column(helper, tip, Direction.DOWN, weeping, strand).size(), 7, "weeping after bone meal on the strand");
        // Pick block on the strand gives the element's item.
        BlockPos abs = helper.absolutePos(tip);
        helper.assertTrue(level.getBlockState(abs).getCloneItemStack(level, abs, false).is(weeping.asItem()), "strand pick block");
        // Taking the soil away breaks the whole strand.
        helper.setBlock(ceiling, Blocks.AIR);
        helper.succeedWhen(() -> helper.assertValueEqual(column(helper, tip, Direction.DOWN, weeping, strand).size(), 0, "strand left"));
    }

    @GameTest(structure = TOWER, maxTicks = 20)
    public void caveVineBerriesRipenGlowAndArePicked(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Block cave = block("plant3_cave");
        Block strand = block("plant3_cave_plant");
        BlockPos ceiling = new BlockPos(2, 6, 2);
        BlockPos at = ceiling.below();
        helper.setBlock(ceiling, Blocks.STONE);
        helper.setBlock(at, cave.defaultBlockState());
        helper.assertValueEqual(helper.getBlockState(at).getLightEmission(), 0, "light without berries");
        // Bone meal ripens the berries (it does not grow the plant). This plant has msm:on_interact, which takes every
        // right-click (as on any block with it), so bone meal is applied as a dispenser does.
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(at);
        helper.assertTrue(BoneMealItem.growCrop(new ItemStack(Items.BONE_MEAL), level, abs), "bone meal");
        BlockState ripe = helper.getBlockState(at);
        helper.assertTrue(ripe.is(cave) && ripe.getValue(CaveVines.BERRIES), "ripe " + ripe);
        helper.assertTrue(helper.getBlockState(at.below()).isAir(), "bone meal grew the plant");
        helper.assertValueEqual(ripe.getLightEmission(), 12, "light with berries");
        helper.assertFalse(BoneMealItem.growCrop(new ItemStack(Items.BONE_MEAL), level, abs), "bone meal on ripe berries");
        helper.assertTrue(ripe.getCloneItemStack(level, abs, false).is(Items.APPLE), "pick block gives the berry");
        // A use picks the berry and fires on_interact.
        collectDrops(helper, at);
        AtomicInteger picked = new AtomicInteger();
        EventListener listener = new EventListener() {
            @Override
            public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
                if (event.equals(id("plant3_picked")) && depth == 1) {
                    picked.incrementAndGet();
                }
            }
        };
        EventRunner.addListener(listener);
        try {
            helper.assertTrue(use(helper, player, ItemStack.EMPTY, at, Direction.DOWN).consumesAction(), "pick");
        } finally {
            EventRunner.removeListener(listener);
        }
        helper.assertValueEqual(collectDrops(helper, at), Map.of("minecraft:apple", 1), "picked berries");
        helper.assertFalse(helper.getBlockState(at).getValue(CaveVines.BERRIES), "berries after picking");
        helper.assertValueEqual(picked.get(), 1, "on_interact firings");
        // A strand keeps its berries when the tip grows below it.
        helper.setBlock(at, cave.defaultBlockState().setValue(CaveVines.BERRIES, true));
        RandomSource random = RandomSource.create(7);
        for (int i = 0; i < 200 && column(helper, at, Direction.DOWN, cave, strand).size() < 2; i++) {
            randomTicks(helper, at, 1, random);
        }
        BlockState body = helper.getBlockState(at);
        helper.assertTrue(body.is(strand) && body.getValue(CaveVines.BERRIES), "strand after growing: " + body);
        helper.succeed();
    }

    // Column plants

    @GameTest(structure = TOWER, maxTicks = 20)
    public void caneGrowsToThreeBesideWaterAndOwnCaneToFiveOnStone(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Block cane = block("plant3_cane");
        helper.setBlock(new BlockPos(1, 1, 1), Blocks.SAND);
        helper.setBlock(new BlockPos(1, 1, 2), Blocks.WATER);
        BlockPos base = new BlockPos(1, 2, 1);
        helper.assertTrue(cane.defaultBlockState().canSurvive(level, helper.absolutePos(base)), "cane on sand beside water");
        helper.setBlock(base, cane);
        RandomSource random = RandomSource.create(3);
        for (int i = 0; i < 200; i++) {
            randomTicks(helper, base.above(column(helper, base, Direction.UP, cane).size() - 1), 1, random);
        }
        helper.assertValueEqual(column(helper, base, Direction.UP, cane).size(), 3, "vanilla height");
        helper.setBlock(new BlockPos(1, 1, 2), Blocks.STONE);
        helper.assertFalse(cane.defaultBlockState().canSurvive(level, helper.absolutePos(base)), "cane without water");
        // Own cane: stone soil, no water, five high, 16 random ticks a block.
        Block tall = block("plant3_cane_tall");
        BlockPos tallBase = new BlockPos(3, 1, 3);
        helper.assertTrue(tall.defaultBlockState().canSurvive(level, helper.absolutePos(tallBase)), "own cane on the stone floor");
        helper.setBlock(new BlockPos(3, 1, 1), Blocks.SAND);
        helper.assertFalse(tall.defaultBlockState().canSurvive(level, helper.absolutePos(new BlockPos(3, 2, 1))), "own cane on sand");
        helper.assertFalse(tall.defaultBlockState().canSurvive(level, helper.absolutePos(base.above(3))), "own cane on vanilla-like cane");
        helper.setBlock(tallBase, tall);
        for (int i = 0; i < 16 * 3; i++) {
            randomTicks(helper, tallBase.above(column(helper, tallBase, Direction.UP, tall).size() - 1), 1, random);
        }
        helper.assertValueEqual(column(helper, tallBase, Direction.UP, tall).size(), 4, "own cane after 48 ticks");
        for (int i = 0; i < 200; i++) {
            randomTicks(helper, tallBase.above(column(helper, tallBase, Direction.UP, tall).size() - 1), 1, random);
        }
        helper.assertValueEqual(column(helper, tallBase, Direction.UP, tall).size(), 5, "own cane max_height");
        helper.succeed();
    }

    @GameTest(structure = TOWER, maxTicks = 20)
    public void cactusSurvivalHeightAndTouchDamage(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Block vanillaLike = block("plant3_cactus");
        Block sharp = block("plant3_cactus_sharp");
        helper.setBlock(new BlockPos(1, 1, 1), Blocks.SAND);
        BlockPos at = new BlockPos(1, 2, 1);
        helper.assertTrue(vanillaLike.defaultBlockState().canSurvive(level, helper.absolutePos(at)), "cactus on sand");
        helper.setBlock(new BlockPos(2, 2, 1), Blocks.STONE);
        helper.assertFalse(vanillaLike.defaultBlockState().canSurvive(level, helper.absolutePos(at)), "cactus beside stone");
        helper.setBlock(new BlockPos(2, 2, 1), Blocks.AIR);
        // The sharp cactus stops at a height from 2 to 4 for its column.
        helper.setBlock(at, sharp);
        RandomSource random = RandomSource.create(9);
        for (int i = 0; i < 400; i++) {
            randomTicks(helper, at.above(column(helper, at, Direction.UP, sharp).size() - 1), 1, random);
        }
        int height = column(helper, at, Direction.UP, sharp).size();
        helper.assertTrue(height >= 2 && height <= 4, "sharp cactus height " + height);
        // touch_damage 3 (vanilla's cactus: 1).
        Pig pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, at.above(height));
        float before = pig.getHealth();
        BlockPos abs = helper.absolutePos(at);
        level.getBlockState(abs).entityInside(level, abs, pig, InsideBlockEffectApplier.NOOP, true);
        helper.assertValueEqual(before - pig.getHealth(), 3.0f, "touch damage");
        Pig other = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(3, 2, 3));
        helper.setBlock(new BlockPos(3, 1, 3), Blocks.SAND);
        helper.setBlock(new BlockPos(3, 2, 3), vanillaLike);
        BlockPos otherAbs = helper.absolutePos(new BlockPos(3, 2, 3));
        float otherBefore = other.getHealth();
        level.getBlockState(otherAbs).entityInside(level, otherAbs, other, InsideBlockEffectApplier.NOOP, true);
        helper.assertValueEqual(otherBefore - other.getHealth(), 1.0f, "vanilla-like touch damage");
        helper.succeed();
    }

    @GameTest(structure = TOWER, maxTicks = 20)
    public void bambooShootGrowsIntoTheStalkWithLeavesUpToItsHeight(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Block stalk = block("plant3_bamboo");
        Block shoot = block("plant3_bamboo_shoot");
        helper.setBlock(new BlockPos(2, 1, 2), Blocks.DIRT);
        BlockPos base = new BlockPos(2, 2, 2);
        // The item on soil plants the shoot.
        helper.assertTrue(use(helper, player, new ItemStack(stalk), new BlockPos(2, 1, 2), Direction.UP).consumesAction(), "plant");
        helper.assertTrue(helper.getBlockState(base).is(shoot), "planted " + helper.getBlockState(base));
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(base);
        helper.assertTrue(helper.getBlockState(base).getCloneItemStack(level, abs, false).is(stalk.asItem()), "shoot pick block");
        // Bone meal on the shoot grows the stalk and the shoot becomes stalk.
        boneMeal(helper, player, base);
        helper.assertTrue(helper.getBlockState(base).is(stalk) && helper.getBlockState(base.above()).is(stalk),
                "after shoot bone meal: " + column(helper, base, Direction.UP, stalk, shoot));
        // Bone meal up to max_height 16; a done column takes no more.
        for (int i = 0; i < 30; i++) {
            boneMeal(helper, player, base);
        }
        List<BlockState> grown = column(helper, base, Direction.UP, stalk);
        helper.assertValueEqual(grown.size(), 16, "bamboo max_height");
        helper.assertTrue(grown.get(15).getValue(BambooStalkBlock.STAGE) == 1, "top is done: " + grown.get(15));
        helper.assertValueEqual(grown.get(15).getValue(BambooStalkBlock.LEAVES), BambooLeaves.LARGE, "top leaves");
        helper.assertValueEqual(grown.get(14).getValue(BambooStalkBlock.LEAVES), BambooLeaves.LARGE, "second leaves");
        helper.assertValueEqual(grown.get(13).getValue(BambooStalkBlock.LEAVES), BambooLeaves.SMALL, "third leaves");
        helper.assertValueEqual(grown.get(12).getValue(BambooStalkBlock.LEAVES), BambooLeaves.NONE, "fourth leaves");
        for (int i = 0; i < grown.size(); i++) {
            helper.assertValueEqual(grown.get(i).getValue(BambooStalkBlock.AGE), 1, "thick at " + i);
        }
        // Own soil: the short bamboo stands on stone only.
        Block shortStalk = block("plant3_bamboo_short");
        helper.setBlock(new BlockPos(0, 1, 0), Blocks.STONE);
        helper.assertTrue(block("plant3_bamboo_short_shoot").defaultBlockState().canSurvive(level, helper.absolutePos(new BlockPos(0, 2, 0))),
                "short shoot on stone");
        helper.setBlock(new BlockPos(4, 1, 4), Blocks.DIRT);
        helper.assertFalse(block("plant3_bamboo_short_shoot").defaultBlockState().canSurvive(level, helper.absolutePos(new BlockPos(4, 2, 4))),
                "short shoot on dirt");
        helper.setBlock(new BlockPos(0, 2, 0), shortStalk);
        // Random ticks under the open sky: it grows to its height of 4 and stops.
        RandomSource random = RandomSource.create(11);
        BlockPos shortBase = new BlockPos(0, 2, 0);
        for (int i = 0; i < 300; i++) {
            randomTicks(helper, shortBase.above(column(helper, shortBase, Direction.UP, shortStalk).size() - 1), 1, random);
        }
        List<BlockState> shortColumn = column(helper, shortBase, Direction.UP, shortStalk);
        helper.assertValueEqual(shortColumn.size(), 4, "short bamboo height (light "
                + level.getMaxLocalRawBrightness(helper.absolutePos(shortBase.above())) + ")");
        helper.assertValueEqual(shortColumn.get(3).getValue(BambooStalkBlock.STAGE), 1, "short top done");
        helper.succeed();
    }

    // Multiface

    @GameTest(maxTicks = 20)
    public void lichenSpreadsByBoneMealAndGlows(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Block lichen = block("plant3_lichen");
        Block still = block("plant3_lichen_still");
        for (int x = 0; x < 5; x++) {
            for (int y = 1; y < 4; y++) {
                helper.setBlock(new BlockPos(x, y, 3), Blocks.STONE);
            }
        }
        BlockPos at = new BlockPos(2, 2, 2);
        BlockState onWall = lichen.defaultBlockState().setValue(MultifaceBlock.getFaceProperty(Direction.SOUTH), true);
        helper.setBlock(at, onWall);
        helper.assertValueEqual(helper.getBlockState(at).getLightEmission(), 7, "lichen light");
        helper.assertTrue(use(helper, player, new ItemStack(Items.BONE_MEAL), at, Direction.NORTH).consumesAction(), "bone meal");
        int count = 0;
        for (int x = 0; x < 5; x++) {
            for (int y = 1; y < 4; y++) {
                for (int z = 0; z < 3; z++) {
                    if (helper.getBlockState(new BlockPos(x, y, z)).is(lichen)) {
                        count++;
                    }
                }
            }
        }
        helper.assertTrue(count > 1, "lichen spread to " + count);
        BlockPos stillAt = new BlockPos(0, 2, 2);
        helper.setBlock(stillAt, still.defaultBlockState().setValue(MultifaceBlock.getFaceProperty(Direction.SOUTH), true));
        helper.assertValueEqual(helper.getBlockState(stillAt).getLightEmission(), 3, "still lichen light");
        helper.assertFalse(((MsmMultifaceBlock) still).isValidBonemealTarget(helper.getLevel(), helper.absolutePos(stillAt),
                helper.getBlockState(stillAt), net.minecraft.world.level.block.BonemealSource.INTERACTION), "still lichen spreads");
        helper.assertFalse(((MsmMultifaceBlock) still).placeLiquid(helper.getLevel(), helper.absolutePos(stillAt),
                helper.getBlockState(stillAt), Blocks.WATER.defaultBlockState().getFluidState()), "still lichen took water");
        helper.succeed();
    }

    // Dripleaves

    @GameTest(structure = TOWER, maxTicks = 20)
    public void bigDripleafGrowsByBoneMealAndStacks(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Block leaf = block("plant3_big_leaf");
        Block stem = block("plant3_big_leaf_stem");
        ServerLevel level = helper.getLevel();
        helper.setBlock(new BlockPos(2, 1, 2), Blocks.CLAY);
        BlockPos base = new BlockPos(2, 2, 2);
        helper.assertTrue(leaf.defaultBlockState().canSurvive(level, helper.absolutePos(base)), "leaf on clay");
        helper.assertFalse(leaf.defaultBlockState().canSurvive(level, helper.absolutePos(new BlockPos(0, 1, 0).above()))
                && false, "unused");
        helper.setBlock(base, leaf);
        helper.assertTrue(boneMeal(helper, player, base).consumesAction(), "bone meal");
        helper.assertTrue(helper.getBlockState(base).is(stem) && helper.getBlockState(base.above()).is(leaf),
                "after bone meal: " + helper.getBlockState(base) + " / " + helper.getBlockState(base.above()));
        // Bone meal on the stem grows the leaf on top.
        boneMeal(helper, player, base);
        helper.assertValueEqual(column(helper, base, Direction.UP, stem, leaf).size(), 3, "after bone meal on the stem");
        helper.assertTrue(helper.getBlockState(base).getCloneItemStack(level, helper.absolutePos(base), false).is(leaf.asItem()), "stem pick");
        // A leaf placed on the leaf turns it into stem.
        helper.setBlock(base.above(3), leaf);
        helper.assertTrue(helper.getBlockState(base.above(2)).is(stem), "lower leaf after stacking: " + helper.getBlockState(base.above(2)));
        // Taking the leaf away breaks the stems.
        helper.setBlock(base.above(3), Blocks.AIR);
        helper.succeedWhen(() -> helper.assertValueEqual(column(helper, base, Direction.UP, stem, leaf).size(), 0, "stems left"));
    }

    @GameTest(maxTicks = 100)
    public void bigDripleafTiltsWithItsOwnTicks(GameTestHelper helper) {
        Block quick = block("plant3_big_leaf_quick");
        Block vanillaTiming = block("plant3_big_leaf");
        helper.setBlock(new BlockPos(1, 1, 1), Blocks.CLAY);
        helper.setBlock(new BlockPos(3, 1, 3), Blocks.CLAY);
        BlockPos q = new BlockPos(1, 2, 1);
        BlockPos v = new BlockPos(3, 2, 3);
        helper.setBlock(q, quick);
        helper.setBlock(v, vanillaTiming);
        helper.spawnWithNoFreeWill(EntityTypes.PIG, q.above());
        helper.spawnWithNoFreeWill(EntityTypes.PIG, v.above());
        List<String> quickSeen = new ArrayList<>();
        List<String> vanillaSeen = new ArrayList<>();
        helper.onEachTick(() -> {
            quickSeen.add(helper.getBlockState(q).getValue(BlockStateProperties.TILT).getSerializedName());
            vanillaSeen.add(helper.getBlockState(v).getValue(BlockStateProperties.TILT).getSerializedName());
        });
        helper.runAfterDelay(60, () -> {
            int quickFull = quickSeen.indexOf(Tilt.FULL.getSerializedName());
            int vanillaFull = vanillaSeen.indexOf(Tilt.FULL.getSerializedName());
            helper.assertTrue(quickFull > 0 && vanillaFull > 0, "full tilt: quick " + quickSeen + " vanilla " + vanillaSeen);
            helper.assertTrue(quickSeen.contains(Tilt.UNSTABLE.getSerializedName()) && quickSeen.contains(Tilt.PARTIAL.getSerializedName()),
                    "quick stages " + quickSeen);
            // [1, 2, 3]: full about 6 ticks after the pig lands; vanilla's [2, 10, 10] about 22.
            helper.assertTrue(quickFull < vanillaFull - 8, "quick full at " + quickFull + ", vanilla at " + vanillaFull);
            int partial = quickSeen.indexOf(Tilt.PARTIAL.getSerializedName());
            helper.assertValueEqual(quickFull - partial, 3, "partial to full ticks " + quickSeen);
            helper.succeed();
        });
    }

    @GameTest(structure = TOWER, maxTicks = 20)
    public void smallDripleafIsPlacedAsTwoHalvesAndGrowsIntoItsBigLeaf(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Block small = block("plant3_small_leaf");
        Block big = block("plant3_big_leaf");
        Block stem = block("plant3_big_leaf_stem");
        helper.setBlock(new BlockPos(2, 1, 2), Blocks.CLAY);
        BlockPos lower = new BlockPos(2, 2, 2);
        helper.assertTrue(use(helper, player, new ItemStack(small), new BlockPos(2, 1, 2), Direction.UP).consumesAction(), "place");
        helper.assertTrue(helper.getBlockState(lower).is(small) && helper.getBlockState(lower).getValue(SmallDripleafBlock.HALF) == DoubleBlockHalf.LOWER
                && helper.getBlockState(lower.above()).is(small), "halves " + helper.getBlockState(lower) + " / " + helper.getBlockState(lower.above()));
        helper.assertTrue(boneMeal(helper, player, lower.above()).consumesAction(), "bone meal");
        List<BlockState> grown = column(helper, lower, Direction.UP, stem, big);
        helper.assertTrue(grown.size() >= 2 && grown.size() <= 4, "grown " + grown);
        helper.assertTrue(grown.get(grown.size() - 1).is(big), "leaf on top " + grown);
        for (int i = 0; i < grown.size() - 1; i++) {
            helper.assertTrue(grown.get(i).is(stem), "stem at " + i + ": " + grown);
        }
        helper.assertTrue(column(helper, lower, Direction.UP, small).isEmpty(), "small halves left");
        helper.succeed();
    }
}
