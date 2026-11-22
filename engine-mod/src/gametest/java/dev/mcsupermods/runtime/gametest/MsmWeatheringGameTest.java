package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.types.MsmWaterloggedBlock;
import dev.mcsupermods.runtime.registry.weathering.Weathering;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChangeOverTimeBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.block.state.properties.Half;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for waterlogging, weathering and waxing (ADR 0094 D7 to D9; B449) on {@code msm/msm_test/block/waterlog_*} and
 * {@code weathering_*}: placing in water and bucket use, water left when broken, the stages under forced random ticks at
 * vanilla copper's rate (measured beside vanilla copper in the same test, with the same random sequence), mixed
 * neighbours of project and vanilla copper, every weathering type keeping its state properties, waxing, unwaxing and
 * scraping (the axe damaged), creative use, and the load errors of a cycle and of unknown targets.
 *
 * <p>Uses go through {@code ServerPlayerGameMode.useItemOn} (blocks) and {@code useItem} (buckets), as the network
 * handler does, so Fabric's {@code UseBlockCallback} and vanilla's items run.
 */
public class MsmWeatheringGameTest {
    private static final Block COPPER = Blocks.COPPER_BLOCK.weathering().unaffected();
    private static final Block EXPOSED_COPPER = Blocks.COPPER_BLOCK.weathering().exposed();

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper, Vec3 at, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
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

    private static void floor(GameTestHelper helper, BlockPos rel) {
        helper.setBlock(rel.below(), Blocks.STONE);
    }

    // Waterlogging (ADR 0094 D7)

    @GameTest
    public void placedInWaterItIsWaterloggedAndABucketEmptiesAndFillsIt(GameTestHelper helper) {
        BlockPos at = new BlockPos(2, 2, 2);
        floor(helper, at);
        helper.setBlock(at, Blocks.WATER);
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5), GameType.SURVIVAL);
        hold(player, new ItemStack(item("waterlog_block")));
        InteractionResult placed = use(helper, player, at.below(), Direction.UP);
        helper.assertTrue(placed.consumesAction(), "place result " + placed);
        BlockState state = helper.getBlockState(at);
        helper.assertTrue(state.is(block("waterlog_block")), "not placed: " + state);
        helper.assertTrue(state.getBlock() instanceof MsmWaterloggedBlock, "not the waterlogged class: " + state.getBlock());
        helper.assertTrue(state.getValue(BlockStateProperties.WATERLOGGED), "placed in water but dry");
        helper.assertTrue(state.getFluidState().is(Fluids.WATER) && state.getFluidState().isSource(), "holds no water source");
        // Placed in air: dry. A pillar keeps its axis beside the water.
        BlockPos dry = new BlockPos(4, 2, 2);
        floor(helper, dry);
        hold(player, new ItemStack(item("waterlog_pillar")));
        use(helper, player, dry.below(), Direction.UP);
        helper.assertTrue(helper.getBlockState(dry).is(block("waterlog_pillar")), "pillar not placed");
        helper.assertTrue(!helper.getBlockState(dry).getValue(BlockStateProperties.WATERLOGGED), "placed in air but waterlogged");
        helper.assertValueEqual(helper.getBlockState(dry).getValue(MsmBlock.AXIS), Direction.Axis.Y, "pillar axis");
        // An empty bucket takes the water, a water bucket puts it back (vanilla's BucketItem through SimpleWaterloggedBlock).
        player.setPos(helper.absoluteVec(new Vec3(2.5, 3, 4.5)));
        player.lookAt(EntityAnchorArgument.Anchor.EYES, Vec3.atCenterOf(helper.absolutePos(at)));
        hold(player, new ItemStack(Items.BUCKET));
        InteractionResult picked = player.gameMode.useItem(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
        helper.assertTrue(picked.consumesAction(), "bucket pick-up result " + picked);
        helper.assertTrue(player.getMainHandItem().is(Items.WATER_BUCKET), "the bucket holds " + player.getMainHandItem());
        helper.assertTrue(!helper.getBlockState(at).getValue(BlockStateProperties.WATERLOGGED), "still waterlogged after the bucket");
        helper.assertTrue(helper.getBlockState(at).is(block("waterlog_block")), "the bucket took the block");
        InteractionResult poured = player.gameMode.useItem(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
        helper.assertTrue(poured.consumesAction(), "bucket pour result " + poured);
        helper.assertTrue(helper.getBlockState(at).getValue(BlockStateProperties.WATERLOGGED), "the water bucket did not waterlog it");
        helper.assertTrue(player.getMainHandItem().is(Items.BUCKET), "the bucket is not empty: " + player.getMainHandItem());
        helper.succeed();
    }

    @GameTest(maxTicks = 100)
    public void brokenWaterloggedBlockLeavesFlowingWater(GameTestHelper helper) {
        BlockPos at = new BlockPos(3, 2, 3);
        for (int x = 1; x <= 5; x++) {
            for (int z = 1; z <= 5; z++) {
                helper.setBlock(new BlockPos(x, 1, z), Blocks.STONE);
            }
        }
        helper.setBlock(at, block("waterlog_block").defaultBlockState().setValue(BlockStateProperties.WATERLOGGED, true));
        ServerPlayer player = player(helper, new Vec3(3.5, 2, 5.5), GameType.SURVIVAL);
        helper.assertTrue(player.gameMode.destroyBlock(helper.absolutePos(at)), "not broken");
        helper.assertTrue(helper.getBlockState(at).is(Blocks.WATER), "no water left: " + helper.getBlockState(at));
        helper.assertTrue(helper.getBlockState(at).getFluidState().isSource(), "the water left is not a source");
        // Flowing water is not Fluids.WATER on 26.3: the water tag holds both on every version.
        helper.succeedWhen(() -> helper.assertTrue(helper.getBlockState(at.east()).getFluidState().is(FluidTags.WATER),
                "the water does not flow out"));
    }

    /** Since ADR 0104 D3 and D6 (B513, limit Q8 lifted) containers hold water and weather; other types keep vanilla's water. */
    @GameTest
    public void containersHoldWaterAndWeatherAndOtherTypesKeepVanillasWater(GameTestHelper helper) {
        helper.assertTrue(block("waterlog_container").defaultBlockState().hasProperty(BlockStateProperties.WATERLOGGED),
                "a waterloggable container cannot hold water");
        helper.assertTrue(block("weathering_container") instanceof ChangeOverTimeBlock<?>, "a weathering container does not weather");
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().noneMatch(w -> w.contains("waterlog_container") || w.contains("weathering_container")),
                "container warnings: " + warnings.stream().filter(w -> w.contains("_container")).toList());
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("waterlog_slab") && e.contains("msm:waterloggable")),
                "no error for a waterloggable slab");
        // The slab keeps vanilla's own waterlogging.
        helper.assertTrue(block("waterlog_slab").defaultBlockState().hasProperty(BlockStateProperties.WATERLOGGED), "slab lost its water");
        helper.succeed();
    }

    // Weathering (ADR 0094 D8)

    /**
     * The share of {@code n} forced random ticks that change {@code start} at the middle of a cleared 8x7x8 area, with
     * {@code neighbours} (offsets from the middle) placed first; the same seed gives the same random sequence.
     */
    private static double rate(GameTestHelper helper, BlockState start, Map<BlockPos, BlockState> neighbours, int n,
            Consumer<BlockState> into) {
        ServerLevel level = helper.getLevel();
        BlockPos c = new BlockPos(3, 3, 3);
        for (int x = 0; x < 8; x++) {
            for (int y = 1; y < 8; y++) {
                for (int z = 0; z < 8; z++) {
                    level.setBlock(helper.absolutePos(new BlockPos(x, y, z)), Blocks.AIR.defaultBlockState(), 2 | 16);
                }
            }
        }
        neighbours.forEach((rel, s) -> level.setBlock(helper.absolutePos(c.offset(rel)), s, 2 | 16));
        RandomSource random = RandomSource.create(4490L);
        BlockPos abs = helper.absolutePos(c);
        int changes = 0;
        for (int k = 0; k < n; k++) {
            level.setBlock(abs, start, 2 | 16);
            start.randomTick(level, abs, random);
            BlockState now = level.getBlockState(abs);
            if (now != start) {
                changes++;
                into.accept(now);
            }
        }
        level.setBlock(abs, Blocks.AIR.defaultBlockState(), 2 | 16);
        neighbours.keySet().forEach(rel -> level.setBlock(helper.absolutePos(c.offset(rel)), Blocks.AIR.defaultBlockState(), 2 | 16));
        return changes / (double) n;
    }

    private static void assertNear(GameTestHelper helper, double project, double vanilla, String what) {
        helper.assertTrue(vanilla > 0 ? Math.abs(project - vanilla) <= 0.15 * vanilla : project == 0,
                what + ": project " + project + ", vanilla copper " + vanilla);
    }

    @GameTest(maxTicks = 40)
    public void stagesAdvanceAtVanillaCoppersRate(GameTestHelper helper) {
        int n = 20000;
        Map<String, Double> rates = new LinkedHashMap<>();
        BlockState[] became = new BlockState[1];
        double tin = rate(helper, block("weathering_tin").defaultBlockState(), Map.of(), n, s -> became[0] = s);
        helper.assertTrue(became[0] != null && became[0].is(block("weathering_exposed_tin")), "tin aged into " + became[0]);
        double copper = rate(helper, COPPER.defaultBlockState(), Map.of(), n, s -> {});
        double exposedTin = rate(helper, block("weathering_exposed_tin").defaultBlockState(), Map.of(), n, s -> became[0] = s);
        helper.assertTrue(became[0].is(block("weathering_weathered_tin")), "exposed tin aged into " + became[0]);
        double exposedCopper = rate(helper, EXPOSED_COPPER.defaultBlockState(), Map.of(), n, s -> {});
        rates.put("tin", tin);
        rates.put("copper", copper);
        rates.put("exposed tin", exposedTin);
        rates.put("exposed copper", exposedCopper);
        MsmRuntime.LOGGER.info("[{}] B449 weathering rates over {} random ticks: {}", MsmRuntime.MOD_ID, n, rates);
        helper.assertTrue(tin > 0 && exposedTin > 0, "project stages never aged: " + rates);
        assertNear(helper, tin, copper, "unaffected (chance modifier 0.75)");
        assertNear(helper, exposedTin, exposedCopper, "exposed");
        helper.assertTrue(tin < exposedTin, "the unaffected stage is not slower: " + rates);
        // The last stage and a stage whose next is missing never random-tick.
        helper.assertTrue(!block("weathering_oxidized_tin").defaultBlockState().isRandomlyTicking(), "the last stage ticks");
        helper.assertTrue(block("weathering_tin").defaultBlockState().isRandomlyTicking(), "tin does not tick");
        helper.assertTrue(!block("weathering_waxed_tin").defaultBlockState().isRandomlyTicking(), "waxed tin ticks");
        helper.assertTrue(!(block("weathering_waxed_tin") instanceof ChangeOverTimeBlock<?>), "waxed tin weathers");
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void mixedNeighboursSlowEachOtherAsVanillaCopperDoes(GameTestHelper helper) {
        int n = 20000;
        BlockPos two = new BlockPos(2, 0, 0);
        List<BlockPos> three = List.of(new BlockPos(2, 0, 0), new BlockPos(-2, 0, 0), new BlockPos(0, 0, 2));
        BlockState tin = block("weathering_tin").defaultBlockState();
        BlockState exposedTin = block("weathering_exposed_tin").defaultBlockState();
        BlockState copper = COPPER.defaultBlockState();
        Map<String, Double> rates = new LinkedHashMap<>();
        // A lower-stage neighbour of either kind stops ageing, in both directions.
        rates.put("exposed tin + copper", rate(helper, exposedTin, Map.of(two, copper), n, s -> {}));
        rates.put("exposed copper + tin", rate(helper, EXPOSED_COPPER.defaultBlockState(), Map.of(two, tin), n, s -> {}));
        rates.put("exposed tin + tin", rate(helper, exposedTin, Map.of(two, tin), n, s -> {}));
        // Three same-stage neighbours slow it alike, whichever kind they are.
        Map<BlockPos, BlockState> threeCopper = new LinkedHashMap<>();
        Map<BlockPos, BlockState> threeTin = new LinkedHashMap<>();
        for (BlockPos p : three) {
            threeCopper.put(p, copper);
            threeTin.put(p, tin);
        }
        rates.put("tin + 3 copper", rate(helper, tin, threeCopper, n, s -> {}));
        rates.put("copper + 3 copper", rate(helper, copper, threeCopper, n, s -> {}));
        rates.put("copper + 3 tin", rate(helper, copper, threeTin, n, s -> {}));
        // A waxed copy is no neighbour at all.
        rates.put("exposed tin + waxed tin", rate(helper, exposedTin, Map.of(two, block("weathering_waxed_tin").defaultBlockState()), n,
                s -> {}));
        rates.put("exposed tin alone", rate(helper, exposedTin, Map.of(), n, s -> {}));
        MsmRuntime.LOGGER.info("[{}] B449 neighbour rates over {} random ticks: {}", MsmRuntime.MOD_ID, n, rates);
        helper.assertTrue(rates.get("exposed tin + copper") == 0, "vanilla copper does not stop project tin: " + rates);
        helper.assertTrue(rates.get("exposed copper + tin") == 0, "project tin does not stop vanilla copper: " + rates);
        helper.assertTrue(rates.get("exposed tin + tin") == 0, "lower project tin does not stop it: " + rates);
        helper.assertTrue(rates.get("copper + 3 copper") > 0 && rates.get("copper + 3 copper") < rates.get("exposed tin alone"),
                "same-stage neighbours do not slow vanilla copper: " + rates);
        assertNear(helper, rates.get("tin + 3 copper"), rates.get("copper + 3 copper"), "tin beside three copper");
        assertNear(helper, rates.get("copper + 3 tin"), rates.get("copper + 3 copper"), "copper beside three tin");
        assertNear(helper, rates.get("exposed tin + waxed tin"), rates.get("exposed tin alone"), "beside waxed tin");
        helper.succeed();
    }

    /** Forces random ticks on the block at {@code rel} until it changes (at most 20000), with a fixed seed. */
    private static BlockState ageOnce(GameTestHelper helper, BlockPos rel) {
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(rel);
        RandomSource random = RandomSource.create(449L);
        BlockState start = level.getBlockState(abs);
        for (int k = 0; k < 20000 && level.getBlockState(abs) == start; k++) {
            start.randomTick(level, abs, random);
        }
        return level.getBlockState(abs);
    }

    @GameTest
    public void everyWeatheringTypeAgesAndKeepsItsState(GameTestHelper helper) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                helper.setBlock(new BlockPos(x, 1, z), Blocks.STONE);
            }
        }
        BlockPos p = new BlockPos(1, 2, 1);
        helper.setBlock(p, block("weathering_tin_slab").defaultBlockState().setValue(BlockStateProperties.SLAB_TYPE,
                net.minecraft.world.level.block.state.properties.SlabType.TOP).setValue(BlockStateProperties.WATERLOGGED, true));
        BlockState slab = ageOnce(helper, p);
        helper.assertTrue(slab.is(block("weathering_exposed_tin_slab")), "slab aged into " + slab);
        helper.assertTrue(slab.getValue(BlockStateProperties.SLAB_TYPE) == net.minecraft.world.level.block.state.properties.SlabType.TOP
                && slab.getValue(BlockStateProperties.WATERLOGGED), "slab state lost: " + slab);

        p = new BlockPos(3, 2, 1);
        helper.setBlock(p, block("weathering_tin_stairs").defaultBlockState().setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.EAST)
                .setValue(BlockStateProperties.HALF, Half.TOP));
        BlockState stairs = ageOnce(helper, p);
        helper.assertTrue(stairs.is(block("weathering_exposed_tin_stairs")), "stairs aged into " + stairs);
        helper.assertTrue(stairs.getValue(BlockStateProperties.HORIZONTAL_FACING) == Direction.EAST
                && stairs.getValue(BlockStateProperties.HALF) == Half.TOP, "stairs state lost: " + stairs);

        p = new BlockPos(5, 2, 1);
        helper.setBlock(p, block("weathering_tin_trapdoor").defaultBlockState().setValue(BlockStateProperties.OPEN, true));
        BlockState trapdoor = ageOnce(helper, p);
        helper.assertTrue(trapdoor.is(block("weathering_exposed_tin_trapdoor")) && trapdoor.getValue(BlockStateProperties.OPEN),
                "trapdoor aged into " + trapdoor);

        p = new BlockPos(1, 2, 3);
        helper.setBlock(p, block("weathering_tin_bars"));
        BlockState bars = ageOnce(helper, p);
        helper.assertTrue(bars.is(block("weathering_exposed_tin_bars")), "bars aged into " + bars);

        p = new BlockPos(3, 2, 3);
        helper.setBlock(p, block("weathering_tin_chain").defaultBlockState().setValue(BlockStateProperties.AXIS, Direction.Axis.X));
        BlockState chain = ageOnce(helper, p);
        helper.assertTrue(chain.is(block("weathering_exposed_tin_chain")) && chain.getValue(BlockStateProperties.AXIS) == Direction.Axis.X,
                "chain aged into " + chain);

        p = new BlockPos(5, 2, 3);
        helper.setBlock(p, block("weathering_tin_lantern"));
        helper.assertValueEqual(helper.getBlockState(p).getLightEmission(), 15, "lantern light");
        BlockState lantern = ageOnce(helper, p);
        helper.assertTrue(lantern.is(block("weathering_exposed_tin_lantern")), "lantern aged into " + lantern);

        p = new BlockPos(1, 2, 5);
        helper.setBlock(p, block("weathering_wet_tin").defaultBlockState().setValue(BlockStateProperties.WATERLOGGED, true));
        BlockState wet = ageOnce(helper, p);
        helper.assertTrue(wet.is(block("weathering_wet_exposed_tin")) && wet.getValue(BlockStateProperties.WATERLOGGED),
                "waterlogged tin aged into " + wet);

        // A door: only the lower half ticks, and both halves turn together.
        p = new BlockPos(3, 2, 5);
        BlockState lower = block("weathering_tin_door").defaultBlockState().setValue(BlockStateProperties.OPEN, true);
        helper.setBlock(p.above(), lower.setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.UPPER));
        helper.setBlock(p, lower);
        helper.assertTrue(!helper.getBlockState(p.above()).isRandomlyTicking(), "the upper half ticks");
        BlockState door = ageOnce(helper, p);
        BlockState upper = helper.getBlockState(p.above());
        helper.assertTrue(door.is(block("weathering_exposed_tin_door")) && door.getValue(BlockStateProperties.OPEN), "door aged into " + door);
        helper.assertTrue(upper.is(block("weathering_exposed_tin_door"))
                && upper.getValue(BlockStateProperties.DOUBLE_BLOCK_HALF) == DoubleBlockHalf.UPPER
                && upper.getValue(BlockStateProperties.OPEN), "upper half is " + upper);
        helper.succeed();
    }

    // Waxing and scraping (ADR 0094 D9)

    @GameTest
    public void honeycombWaxesAndIsUsedUp(GameTestHelper helper) {
        BlockPos at = new BlockPos(2, 2, 2);
        floor(helper, at);
        helper.setBlock(at, block("weathering_exposed_tin"));
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5), GameType.SURVIVAL);
        hold(player, new ItemStack(Items.HONEYCOMB, 2));
        InteractionResult result = use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(result.consumesAction(), "wax result " + result);
        helper.assertTrue(helper.getBlockState(at).is(block("weathering_waxed_exposed_tin")), "not waxed: " + helper.getBlockState(at));
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "honeycomb left");
        // A waxed block is not waxed again; the honeycomb stays.
        use(helper, player, at, Direction.SOUTH);
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "honeycomb used on a waxed block");
        // A weathering block without msm:waxable is not waxed.
        helper.setBlock(at, block("weathering_weathered_tin"));
        use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(at).is(block("weathering_weathered_tin")), "waxed without msm:waxable");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "honeycomb used without msm:waxable");
        // Vanilla's honeycomb still waxes vanilla copper.
        helper.setBlock(at, COPPER);
        use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(at).is(Blocks.COPPER_BLOCK.waxed().unaffected()), "vanilla copper not waxed: " + helper.getBlockState(at));
        // Both halves of a door, keeping their state.
        BlockPos door = new BlockPos(5, 2, 2);
        floor(helper, door);
        BlockState lower = block("weathering_tin_door").defaultBlockState().setValue(BlockStateProperties.OPEN, true)
                .setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.EAST);
        helper.setBlock(door.above(), lower.setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.UPPER));
        helper.setBlock(door, lower);
        hold(player, new ItemStack(Items.HONEYCOMB, 1));
        use(helper, player, door.above(), Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(door).is(block("weathering_waxed_tin_door")) && helper.getBlockState(door.above())
                .is(block("weathering_waxed_tin_door")), "door halves " + helper.getBlockState(door) + ", " + helper.getBlockState(door.above()));
        helper.assertTrue(helper.getBlockState(door).getValue(BlockStateProperties.OPEN)
                && helper.getBlockState(door).getValue(BlockStateProperties.HORIZONTAL_FACING) == Direction.EAST, "door state lost");
        helper.assertTrue(player.getMainHandItem().isEmpty(), "the last honeycomb was not used");
        helper.succeed();
    }

    @GameTest
    public void axeUnwaxesAndScrapesAndIsDamaged(GameTestHelper helper) {
        BlockPos at = new BlockPos(2, 2, 2);
        floor(helper, at);
        helper.setBlock(at, block("weathering_waxed_exposed_tin"));
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5), GameType.SURVIVAL);
        hold(player, new ItemStack(Items.IRON_AXE));
        InteractionResult unwax = use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(unwax.consumesAction(), "unwax result " + unwax);
        helper.assertTrue(helper.getBlockState(at).is(block("weathering_exposed_tin")), "not unwaxed: " + helper.getBlockState(at));
        helper.assertValueEqual(player.getMainHandItem().getDamageValue(), 1, "axe damage after unwaxing");
        InteractionResult scrape = use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(scrape.consumesAction(), "scrape result " + scrape);
        helper.assertTrue(helper.getBlockState(at).is(block("weathering_tin")), "not scraped: " + helper.getBlockState(at));
        helper.assertValueEqual(player.getMainHandItem().getDamageValue(), 2, "axe damage after scraping");
        // The first stage has nothing to scrape back to.
        use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(at).is(block("weathering_tin")), "the first stage changed");
        helper.assertValueEqual(player.getMainHandItem().getDamageValue(), 2, "axe damaged on the first stage");
        // Stairs keep their facing when scraped.
        BlockPos stairs = new BlockPos(5, 2, 2);
        floor(helper, stairs);
        helper.setBlock(stairs, block("weathering_exposed_tin_stairs").defaultBlockState()
                .setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.WEST));
        use(helper, player, stairs, Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(stairs).is(block("weathering_tin_stairs"))
                && helper.getBlockState(stairs).getValue(BlockStateProperties.HORIZONTAL_FACING) == Direction.WEST,
                "stairs scraped into " + helper.getBlockState(stairs));
        // Vanilla's axe still scrapes vanilla copper.
        helper.setBlock(at, EXPOSED_COPPER);
        use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(at).is(COPPER), "vanilla copper not scraped: " + helper.getBlockState(at));
        // A stick does nothing.
        helper.setBlock(at, block("weathering_exposed_tin"));
        hold(player, new ItemStack(Items.STICK));
        use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(at).is(block("weathering_exposed_tin")), "a stick scraped");
        helper.succeed();
    }

    @GameTest
    public void creativeUseKeepsTheHoneycombAndTheAxe(GameTestHelper helper) {
        BlockPos at = new BlockPos(2, 2, 2);
        floor(helper, at);
        helper.setBlock(at, block("weathering_tin"));
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5), GameType.CREATIVE);
        hold(player, new ItemStack(Items.HONEYCOMB, 1));
        use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(at).is(block("weathering_waxed_tin")), "not waxed in creative");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "honeycomb used in creative");
        hold(player, new ItemStack(Items.IRON_AXE));
        use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(at).is(block("weathering_tin")), "not unwaxed in creative");
        helper.assertValueEqual(player.getMainHandItem().getDamageValue(), 0, "axe damaged in creative");
        helper.succeed();
    }

    // Load errors (ADR 0094 D8, D9)

    @GameTest
    public void aCycleAndUnknownTargetsAreLoadErrors(GameTestHelper helper) {
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("weathering_")).toList();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("cycle") && e.contains("msm_test:weathering_cycle_a")
                && e.contains("msm_test:weathering_cycle_b")), "no cycle error: " + errors);
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("msm_test:weathering_unknown_next")
                && e.contains("msm_test:weathering_missing") && e.contains("not a registered block")), "no unknown next error: " + errors);
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("msm_test:weathering_unknown_wax")
                && e.contains("msm_test:weathering_missing_waxed")), "no unknown into error: " + errors);
        helper.assertValueEqual(errors.size(), 3, "weathering errors " + errors);
        // The blocks still register; those of the cycle and the unknown next do not age, however long they tick.
        int x = 1;
        for (String path : List.of("weathering_cycle_a", "weathering_cycle_b", "weathering_unknown_next")) {
            helper.assertTrue(block(path) instanceof Weathering.Ageing, path + " is not a weathering block");
            BlockPos p = new BlockPos(x, 2, 5);
            x += 2;
            helper.setBlock(p, block(path));
            helper.assertTrue(ageOnce(helper, p).is(block(path)), path + " aged");
        }
        // A honeycomb does not wax into the missing block.
        BlockPos at = new BlockPos(2, 2, 2);
        floor(helper, at);
        helper.setBlock(at, block("weathering_unknown_wax"));
        ServerPlayer player = player(helper, new Vec3(2.5, 2, 5.5), GameType.SURVIVAL);
        hold(player, new ItemStack(Items.HONEYCOMB, 1));
        use(helper, player, at, Direction.SOUTH);
        helper.assertTrue(helper.getBlockState(at).is(block("weathering_unknown_wax")) && player.getMainHandItem().getCount() == 1,
                "waxed into a missing block");
        helper.succeed();
    }
}
