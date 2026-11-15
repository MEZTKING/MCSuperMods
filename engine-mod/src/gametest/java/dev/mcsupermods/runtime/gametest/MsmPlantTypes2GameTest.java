package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.registry.types.MsmBerryBushBlock;
import dev.mcsupermods.runtime.registry.types.MsmCakeBlock;
import dev.mcsupermods.runtime.registry.types.MsmCandleBlock;
import dev.mcsupermods.runtime.registry.types.MsmCarpetBlock;
import dev.mcsupermods.runtime.registry.types.MsmCocoaBlock;
import dev.mcsupermods.runtime.registry.types.MsmCropBlock;
import dev.mcsupermods.runtime.registry.types.MsmLayersBlock;
import dev.mcsupermods.runtime.registry.types.MsmPottedPlantBlock;
import dev.mcsupermods.runtime.registry.types.MsmSeaPickleBlock;
import dev.mcsupermods.runtime.registry.types.MsmTallPlantBlock;
import dev.mcsupermods.runtime.registry.types.MsmVineBlock;
import dev.mcsupermods.runtime.registry.types.PlantTypes;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
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
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.BonemealSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CakeBlock;
import net.minecraft.world.level.block.CandleBlock;
import net.minecraft.world.level.block.CarpetBlock;
import net.minecraft.world.level.block.CocoaBlock;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.FlowerPotBlock;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.SeaPickleBlock;
import net.minecraft.world.level.block.SnowLayerBlock;
import net.minecraft.world.level.block.SweetBerryBushBlock;
import net.minecraft.world.level.block.TallFlowerBlock;
import net.minecraft.world.level.block.VineBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;

/**
 * GameTests for the plant and food block types cake, berry_bush, tall_plant, potted_plant, vine, sea_pickle, carpet,
 * layers, cocoa and candle and the crop soil (ADR 0094 D1, D2, D4, D5; B445) on {@code msm/msm_test/block/plant2_*.json}.
 * The test data pack adds {@code plant2_vine} and {@code plant2_vine_still} to {@code #minecraft:climbable} and
 * {@code plant2_candle} (not {@code plant2_candle_untagged}) to {@code #minecraft:candles}, as the lowering does.
 * Uses go through {@code ServerPlayerGameMode.useItemOn}, as the network handler does; random ticks and bone meal are
 * driven by calling the block with a seeded random.
 */
public class MsmPlantTypes2GameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.setPos(helper.absoluteVec(new Vec3(0.5, 2, 0.5)));
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

    /** The items dropped near {@code rel}, by id, removed from the world. */
    private static Map<String, Integer> collectDrops(GameTestHelper helper, BlockPos rel) {
        Map<String, Integer> found = new TreeMap<>();
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(2))) {
            found.merge(BuiltInRegistries.ITEM.getKey(e.getItem().getItem()).toString(), e.getItem().getCount(), Integer::sum);
            e.discard();
        }
        return found;
    }

    private static int light(GameTestHelper helper, BlockState state) {
        return state.getLightEmission();
    }

    /** Records the {@code msm_test} event firings at depth 1. */
    private static final class Recorder implements EventListener, AutoCloseable {
        private final List<String> fired = Collections.synchronizedList(new ArrayList<>());
        private final ServerPlayer player;

        Recorder(ServerPlayer player) {
            this.player = player;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.getNamespace().equals("msm_test") && depth == 1 && ctx.player() == player) {
                fired.add(event.getPath() + (ctx.other() == player ? "" : " (other is not the player)"));
            }
        }

        long count(String event) {
            synchronized (fired) {
                return fired.stream().filter(event::equals).count();
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    // Loading

    @GameTest
    public void plantTypes2RegisterTheirVanillaClasses(GameTestHelper helper) {
        helper.assertTrue(block("plant2_cake") instanceof MsmCakeBlock b && b instanceof CakeBlock, "cake: " + block("plant2_cake"));
        helper.assertTrue(block("plant2_berry_bush") instanceof MsmBerryBushBlock b && b instanceof SweetBerryBushBlock, "berry bush");
        helper.assertTrue(block("plant2_tall_plant") instanceof MsmTallPlantBlock b && b instanceof TallFlowerBlock, "tall plant");
        helper.assertTrue(block("plant2_potted_sapling") instanceof MsmPottedPlantBlock b && b instanceof FlowerPotBlock, "potted plant");
        helper.assertTrue(block("plant2_vine") instanceof MsmVineBlock b && b instanceof VineBlock, "vine");
        helper.assertTrue(block("plant2_sea_pickle") instanceof MsmSeaPickleBlock b && b instanceof SeaPickleBlock, "sea pickle");
        helper.assertTrue(block("plant2_carpet") instanceof MsmCarpetBlock b && b instanceof CarpetBlock, "carpet");
        helper.assertTrue(block("plant2_layers") instanceof MsmLayersBlock b && b instanceof SnowLayerBlock, "layers");
        helper.assertTrue(block("plant2_cocoa") instanceof MsmCocoaBlock b && b instanceof CocoaBlock, "cocoa");
        helper.assertTrue(block("plant2_candle") instanceof MsmCandleBlock b && b instanceof CandleBlock, "candle");
        helper.assertTrue(block("plant2_crop_soul") instanceof MsmCropBlock, "crop");
        // The potted sapling sorts before its plant (type_sapling): registered after it, as stairs after their base.
        helper.assertTrue(((FlowerPotBlock) block("plant2_potted_sapling")).getPotted() == block("type_sapling"), "potted sapling's plant");
        helper.assertTrue(((FlowerPotBlock) block("plant2_potted_grass")).getPotted() == Blocks.SHORT_GRASS, "potted grass's plant");
        List<String> errors = MsmRuntime.report().errors().stream().filter(e -> e.contains("/plant2_")).toList();
        helper.assertTrue(errors.isEmpty(), "plant2 errors: " + errors);
        List<String> warnings = MsmRuntime.report().warnings().stream().filter(w -> w.contains("/plant2_")).toList();
        helper.assertTrue(warnings.isEmpty(), "plant2 warnings: " + warnings);
        // Family properties: no collision for bushes and plants, none for vines, pushed off by pistons.
        BlockPos abs = helper.absolutePos(BlockPos.ZERO);
        for (String path : List.of("plant2_berry_bush", "plant2_tall_plant", "plant2_vine")) {
            helper.assertTrue(block(path).defaultBlockState().getCollisionShape(helper.getLevel(), abs).isEmpty(), path + " has collision");
        }
        helper.succeed();
    }

    // Cake

    @GameTest
    public void cakeSlicesFeedTheComparatorAndFireOnEat(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(1, 2, 1);
        helper.setBlock(at.below(), Blocks.STONE);
        helper.setBlock(at, block("plant2_cake"));
        ServerLevel level = helper.getLevel();
        try (Recorder r = new Recorder(player)) {
            List<String> seen = new ArrayList<>();
            for (int slice = 1; slice <= 7; slice++) {
                player.getFoodData().setFoodLevel(2);
                player.getFoodData().setSaturation(0);
                InteractionResult result = use(helper, player, new ItemStack(Items.BREAD), at, Direction.UP);
                helper.assertTrue(result.consumesAction(), "slice " + slice + ": " + result);
                helper.assertValueEqual(player.getFoodData().getFoodLevel(), 5, "food after slice " + slice);
                helper.assertTrue(player.getFoodData().getSaturationLevel() > 2.9f && player.getFoodData().getSaturationLevel() < 3.1f,
                        "saturation 3 * 0.5 * 2 after slice " + slice + ": " + player.getFoodData().getSaturationLevel());
                BlockState state = helper.getBlockState(at);
                if (slice < 7) {
                    helper.assertValueEqual(state.getValue(CakeBlock.BITES), slice, "bites");
                    seen.add(String.valueOf(state.getAnalogOutputSignal(level, helper.absolutePos(at), Direction.NORTH)));
                } else {
                    helper.assertTrue(state.isAir(), "the last slice left " + state);
                }
            }
            helper.assertValueEqual(seen, List.of("12", "10", "8", "6", "4", "2"), "comparator by slices");
            helper.assertValueEqual(r.count("ate"), 7L, "on_eat firings");
            helper.assertValueEqual(r.count("cake_used"), 7L, "on_interact firings");
        }
        // A full player does not eat; a whole cake reads 14.
        helper.setBlock(at, block("plant2_cake_plain"));
        helper.assertValueEqual(helper.getBlockState(at).getAnalogOutputSignal(level, helper.absolutePos(at), Direction.NORTH), 14,
                "whole cake signal");
        player.getFoodData().setFoodLevel(20);
        InteractionResult full = use(helper, player, ItemStack.EMPTY, at, Direction.UP);
        helper.assertFalse(full.consumesAction(), "a full player ate: " + full);
        helper.assertValueEqual(helper.getBlockState(at).getValue(CakeBlock.BITES), 0, "bites after a full player");
        // Vanilla's slice by default: 2 food.
        player.getFoodData().setFoodLevel(10);
        use(helper, player, ItemStack.EMPTY, at, Direction.UP);
        helper.assertValueEqual(player.getFoodData().getFoodLevel(), 12, "default slice food");
        helper.succeed();
    }

    @GameTest
    public void projectCakeRefusesCandles(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(1, 2, 1);
        helper.setBlock(at.below(), Blocks.STONE);
        for (Item candle : List.of(Items.CANDLE, item("plant2_candle"))) {
            helper.setBlock(at, block("plant2_cake_plain"));
            player.getFoodData().setFoodLevel(20);
            use(helper, player, new ItemStack(candle), at, Direction.UP);
            BlockState state = helper.getBlockState(at);
            helper.assertTrue(state.is(block("plant2_cake_plain")) && state.getValue(CakeBlock.BITES) == 0,
                    BuiltInRegistries.ITEM.getKey(candle) + " on a project cake gave " + state);
        }
        helper.succeed();
    }

    // Berry bush

    @GameTest
    public void berryBushHarvestsItsBerry(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(1, 2, 1);
        helper.setBlock(at.below(), Blocks.GRASS_BLOCK);
        Block bush = block("plant2_berry_bush");
        String berries = id("plant2_berries").toString();
        helper.setBlock(at, bush.defaultBlockState().setValue(SweetBerryBushBlock.AGE, 1));
        collectDrops(helper, at);
        helper.assertFalse(use(helper, player, ItemStack.EMPTY, at, Direction.UP).consumesAction(), "age 1 harvested");
        helper.assertValueEqual(collectDrops(helper, at), Map.of(), "age 1 drops");
        helper.setBlock(at, bush.defaultBlockState().setValue(SweetBerryBushBlock.AGE, 2));
        helper.assertTrue(use(helper, player, ItemStack.EMPTY, at, Direction.UP).consumesAction(), "age 2 not harvested");
        helper.assertValueEqual(collectDrops(helper, at), Map.of(berries, 3), "ripe harvest [3, 3]");
        helper.assertValueEqual(helper.getBlockState(at).getValue(SweetBerryBushBlock.AGE), 1, "age after harvest");
        helper.setBlock(at, bush.defaultBlockState().setValue(SweetBerryBushBlock.AGE, 3));
        use(helper, player, ItemStack.EMPTY, at, Direction.UP);
        helper.assertValueEqual(collectDrops(helper, at), Map.of(berries, 5), "full harvest [5, 5]");
        ItemStack picked = helper.getBlockState(at).getCloneItemStack(helper.getLevel(), helper.absolutePos(at), false);
        helper.assertTrue(picked.is(item("plant2_berries")), "pick block gave " + picked);
        // The berries plant the bush, as sweet berries do.
        helper.setBlock(at, Blocks.AIR);
        use(helper, player, new ItemStack(item("plant2_berries")), at.below(), Direction.UP);
        helper.assertBlockPresent(bush, at);
        // Bone meal ages the young bush by one.
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(at);
        ((MsmBerryBushBlock) bush).performBonemeal(level, RandomSource.create(445L), abs, level.getBlockState(abs), BonemealSource.INTERACTION);
        helper.assertValueEqual(level.getBlockState(abs).getValue(SweetBerryBushBlock.AGE), 1, "age after bone meal");
        helper.succeed();
    }

    @GameTest
    public void berryBushDefaultHarvestCounts(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(1, 2, 1);
        helper.setBlock(at.below(), Blocks.GRASS_BLOCK);
        Block bush = block("plant2_berry_bush_soft");
        for (int age : List.of(2, 3)) {
            Map<Integer, Integer> histogram = new TreeMap<>();
            for (int n = 0; n < 60; n++) {
                helper.setBlock(at, bush.defaultBlockState().setValue(SweetBerryBushBlock.AGE, age));
                collectDrops(helper, at);
                use(helper, player, ItemStack.EMPTY, at, Direction.UP);
                Map<String, Integer> drops = collectDrops(helper, at);
                helper.assertTrue(drops.keySet().stream().allMatch("minecraft:apple"::equals), "drops " + drops);
                histogram.merge(drops.getOrDefault("minecraft:apple", 0), 1, Integer::sum);
            }
            helper.assertValueEqual(histogram.keySet(), age == 2 ? java.util.Set.of(1, 2) : java.util.Set.of(2, 3),
                    "age " + age + " counts " + histogram);
        }
        helper.succeed();
    }

    @GameTest
    public void berryBushHurtsOnlyWhenItShould(GameTestHelper helper) {
        BlockPos at = new BlockPos(1, 2, 1);
        BlockPos soft = new BlockPos(3, 2, 1);
        helper.setBlock(at.below(), Blocks.GRASS_BLOCK);
        helper.setBlock(soft.below(), Blocks.GRASS_BLOCK);
        helper.setBlock(at, block("plant2_berry_bush").defaultBlockState().setValue(SweetBerryBushBlock.AGE, 2));
        helper.setBlock(soft, block("plant2_berry_bush_soft").defaultBlockState().setValue(SweetBerryBushBlock.AGE, 2));
        Zombie hurt = helper.spawn(EntityTypes.ZOMBIE, at);
        Zombie spared = helper.spawn(EntityTypes.ZOMBIE, soft);
        ServerLevel level = helper.getLevel();
        for (Zombie z : List.of(hurt, spared)) {
            z.setNoAi(true);
            z.xOld = z.getX() - 0.5; // moved this tick
            z.zOld = z.getZ() - 0.5;
            BlockPos abs = z.blockPosition();
            level.getBlockState(abs).entityInside(level, abs, z, InsideBlockEffectApplier.NOOP, true);
        }
        helper.assertTrue(hurt.getHealth() < hurt.getMaxHealth(), "the default bush did not hurt: " + hurt.getHealth());
        helper.assertValueEqual(spared.getHealth(), spared.getMaxHealth(), "hurts: false hurt");
        helper.succeed();
    }

    // Tall plant

    @GameTest
    public void tallPlantPlacesBothHalvesAndBonemealDropsACopy(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos floor = new BlockPos(1, 1, 1);
        helper.setBlock(floor, Blocks.GRASS_BLOCK);
        Block tall = block("plant2_tall_plant");
        InteractionResult placed = use(helper, player, new ItemStack(item("plant2_tall_plant")), floor, Direction.UP);
        helper.assertTrue(placed.consumesAction(), "placing " + placed);
        helper.assertValueEqual(helper.getBlockState(floor.above()).getValue(DoublePlantBlock.HALF), DoubleBlockHalf.LOWER, "lower");
        helper.assertValueEqual(helper.getBlockState(floor.above(2)).getValue(DoublePlantBlock.HALF), DoubleBlockHalf.UPPER, "upper");
        helper.assertTrue(helper.getBlockState(floor.above(2)).is(tall), "upper half " + helper.getBlockState(floor.above(2)));
        ServerLevel level = helper.getLevel();
        BlockPos lower = helper.absolutePos(floor.above());
        collectDrops(helper, floor);
        helper.assertTrue(((MsmTallPlantBlock) tall).isValidBonemealTarget(level, lower, level.getBlockState(lower), BonemealSource.INTERACTION),
                "drop_copy takes no bone meal");
        ((MsmTallPlantBlock) tall).performBonemeal(level, RandomSource.create(1L), lower, level.getBlockState(lower), BonemealSource.INTERACTION);
        helper.assertValueEqual(collectDrops(helper, floor), Map.of(id("plant2_tall_plant").toString(), 1), "bone meal copy");
        Block grass = block("plant2_tall_grass");
        helper.setBlock(new BlockPos(3, 1, 1), Blocks.GRASS_BLOCK);
        BlockPos grassLower = helper.absolutePos(new BlockPos(3, 2, 1));
        DoublePlantBlock.placeAt(level, grass.defaultBlockState(), grassLower, Block.UPDATE_ALL);
        helper.assertFalse(((MsmTallPlantBlock) grass).isValidBonemealTarget(level, grassLower, level.getBlockState(grassLower),
                BonemealSource.INTERACTION), "bonemeal none takes bone meal");
        // Breaking the upper half takes the lower one too.
        level.destroyBlock(helper.absolutePos(floor.above(2)), false);
        helper.assertBlockNotPresent(tall, floor.above());
        helper.succeed();
    }

    // Potted plant

    @GameTest
    public void potTakesAndGivesBackTheProjectPlant(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos pot = new BlockPos(1, 2, 1);
        helper.setBlock(pot.below(), Blocks.STONE);
        for (String[] pair : List.of(new String[] {"plant2_potted_sapling", "msm_test:type_sapling"},
                new String[] {"plant2_potted_grass", "minecraft:short_grass"})) {
            Item plant = BuiltInRegistries.ITEM.getValue(Identifier.parse(pair[1]));
            helper.setBlock(pot, Blocks.FLOWER_POT);
            InteractionResult put = use(helper, player, new ItemStack(plant), pot, Direction.UP);
            helper.assertTrue(put.consumesAction(), "putting " + pair[1] + ": " + put);
            helper.assertBlockPresent(block(pair[0]), pot);
            helper.assertTrue(player.getMainHandItem().isEmpty(), "the plant stayed in the hand: " + player.getMainHandItem());
            ItemStack picked = helper.getBlockState(pot).getCloneItemStack(helper.getLevel(), helper.absolutePos(pot), false);
            helper.assertTrue(picked.is(plant), "pick block on the pot gave " + picked);
            InteractionResult take = use(helper, player, ItemStack.EMPTY, pot, Direction.UP);
            helper.assertTrue(take.consumesAction(), "taking " + pair[1] + ": " + take);
            helper.assertBlockPresent(Blocks.FLOWER_POT, pot);
            helper.assertTrue(player.getMainHandItem().is(plant), "the plant did not come back: " + player.getMainHandItem());
        }
        helper.succeed();
    }

    /**
     * The plants a pot refuses (called in place, as the registrar would, so no load error is left in the shared report):
     * a plant vanilla already pots (its pot would be taken over), an unregistered plant and a two-block plant.
     */
    @GameTest
    public void potRefusesPottedMissingAndTallPlants(GameTestHelper helper) {
        Map<String, String> refusals = Map.of(
                "minecraft:poppy", "is already potted by minecraft:potted_poppy",
                "msm_test:no_such_plant", "is not a registered block",
                "msm_test:plant2_tall_plant", "is two blocks high");
        for (Map.Entry<String, String> e : refusals.entrySet()) {
            JsonObject json = JsonParser.parseString("{\"format\": 1, \"type\": \"potted_plant\", \"plant\": \"" + e.getKey() + "\"}")
                    .getAsJsonObject();
            BlockDefinition def = DefinitionParser.parseBlock(json).definition().orElseThrow();
            try {
                PlantTypes.create(id("plant2_refused"), def, BlockBehaviour.Properties.of(), w -> {});
                helper.fail("potting " + e.getKey() + " was not refused");
            } catch (IllegalArgumentException refused) {
                helper.assertTrue(refused.getMessage().contains(e.getValue()), e.getKey() + ": " + refused.getMessage());
            }
        }
        helper.assertTrue(((FlowerPotBlock) Blocks.POTTED_POPPY).getPotted() == Blocks.POPPY, "vanilla's poppy pot changed");
        helper.succeed();
    }

    // Vine

    @GameTest(maxTicks = 200)
    public void vineSpreadsAndIsClimbed(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        RandomSource random = RandomSource.create(445L);
        for (int x : List.of(1, 5)) {
            for (int y = 1; y <= 4; y++) {
                for (int dx = -1; dx <= 1; dx++) {
                    helper.setBlock(new BlockPos(x + dx, y, 2), Blocks.STONE); // a wall to the south
                }
            }
        }
        BlockPos spreading = new BlockPos(1, 3, 1);
        BlockPos still = new BlockPos(5, 3, 1);
        helper.setBlock(spreading, block("plant2_vine").defaultBlockState().setValue(VineBlock.SOUTH, true));
        helper.setBlock(still, block("plant2_vine_still").defaultBlockState().setValue(VineBlock.SOUTH, true));
        helper.assertTrue(block("plant2_vine").defaultBlockState().isRandomlyTicking(), "a spreading vine does not tick");
        helper.assertFalse(block("plant2_vine_still").defaultBlockState().isRandomlyTicking(), "spreads: false ticks");
        for (int n = 0; n < 200; n++) {
            BlockPos abs = helper.absolutePos(spreading);
            level.getBlockState(abs).randomTick(level, abs, random);
            BlockPos absStill = helper.absolutePos(still);
            block("plant2_vine_still").defaultBlockState().setValue(VineBlock.SOUTH, true).randomTick(level, absStill, random);
        }
        int spread = 0;
        int stillCount = 0;
        for (BlockPos p : BlockPos.betweenClosed(helper.absolutePos(new BlockPos(0, 1, 0)), helper.absolutePos(new BlockPos(7, 5, 2)))) {
            if (level.getBlockState(p).is(block("plant2_vine"))) {
                spread++;
            }
            if (level.getBlockState(p).is(block("plant2_vine_still"))) {
                stillCount++;
            }
        }
        helper.assertTrue(spread > 1, "the vine did not spread: " + spread);
        helper.assertValueEqual(stillCount, 1, "the still vine spread");
        // Climbing comes from #minecraft:climbable.
        Zombie climber = helper.spawn(EntityTypes.ZOMBIE, still);
        climber.setNoAi(true);
        helper.succeedWhen(() -> helper.assertTrue(climber.onClimbable(), "not climbing the vine at " + climber.blockPosition()));
    }

    // Sea pickle

    @GameTest
    public void seaPickleCountsLightsAndSpreadsItself(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        Block pickle = block("plant2_sea_pickle");
        for (int n = 1; n <= 4; n++) {
            BlockState wet = pickle.defaultBlockState().setValue(SeaPickleBlock.PICKLES, n).setValue(SeaPickleBlock.WATERLOGGED, true);
            helper.assertValueEqual(light(helper, wet), 3 + 3 * n, n + " pickles in water");
            helper.assertValueEqual(light(helper, wet.setValue(SeaPickleBlock.WATERLOGGED, false)), 0, n + " pickles dry");
        }
        BlockPos at = new BlockPos(1, 2, 1);
        helper.setBlock(at.below(), Blocks.STONE);
        helper.setBlock(at, pickle.defaultBlockState().setValue(SeaPickleBlock.WATERLOGGED, false));
        use(helper, player, new ItemStack(item("plant2_sea_pickle"), 4), at, Direction.UP);
        helper.assertValueEqual(helper.getBlockState(at).getValue(SeaPickleBlock.PICKLES), 2, "pickles after adding one");
        // Bone meal on coral in water: only this block appears, never vanilla's pickle.
        ServerLevel level = helper.getLevel();
        for (int x = 2; x <= 6; x++) {
            for (int z = 2; z <= 6; z++) {
                helper.setBlock(new BlockPos(x, 1, z), Blocks.BRAIN_CORAL_BLOCK);
                helper.setBlock(new BlockPos(x, 2, z), Blocks.WATER);
            }
        }
        BlockPos centre = new BlockPos(4, 2, 4);
        helper.setBlock(centre, pickle.defaultBlockState().setValue(SeaPickleBlock.WATERLOGGED, true));
        BlockPos abs = helper.absolutePos(centre);
        ((MsmSeaPickleBlock) pickle).performBonemeal(level, RandomSource.create(445L), abs, level.getBlockState(abs), BonemealSource.INTERACTION);
        helper.assertValueEqual(level.getBlockState(abs).getValue(SeaPickleBlock.PICKLES), 4, "the clump after bone meal");
        int ours = 0;
        for (BlockPos p : BlockPos.betweenClosed(helper.absolutePos(new BlockPos(2, 1, 2)), helper.absolutePos(new BlockPos(6, 3, 6)))) {
            BlockState s = level.getBlockState(p);
            helper.assertFalse(s.is(Blocks.SEA_PICKLE), "vanilla's pickle grew at " + p);
            if (s.is(pickle)) {
                ours++;
            }
        }
        helper.assertTrue(ours > 1, "no pickles spread: " + ours);
        helper.succeed();
    }

    // Carpet and layers

    @GameTest
    public void carpetNeedsABlockBelow(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockState carpet = block("plant2_carpet").defaultBlockState();
        helper.setBlock(new BlockPos(1, 1, 1), Blocks.STONE);
        helper.assertTrue(carpet.canSurvive(level, helper.absolutePos(new BlockPos(1, 2, 1))), "carpet on stone");
        helper.assertFalse(carpet.canSurvive(level, helper.absolutePos(new BlockPos(3, 3, 3))), "carpet on air");
        double height = carpet.getShape(level, helper.absolutePos(BlockPos.ZERO), CollisionContext.empty()).max(Direction.Axis.Y);
        helper.assertValueEqual(Math.round(height * 16), 1L, "carpet height");
        helper.succeed();
    }

    @GameTest
    public void layersStackToEightAndDoNotMelt(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        BlockPos at = new BlockPos(1, 2, 1);
        helper.setBlock(at.below(), Blocks.STONE);
        helper.setBlock(at.east(), Blocks.GLOWSTONE); // block light 14: snow would melt
        helper.setBlock(at, block("plant2_layers"));
        for (int n = 2; n <= 8; n++) {
            use(helper, player, new ItemStack(item("plant2_layers"), 8), at, Direction.UP);
            helper.assertValueEqual(helper.getBlockState(at).getValue(SnowLayerBlock.LAYERS), n, "layers after " + (n - 1) + " uses");
        }
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(at);
        RandomSource random = RandomSource.create(445L);
        for (int n = 0; n < 50; n++) {
            block("plant2_layers").defaultBlockState().randomTick(level, abs, random);
        }
        helper.assertBlockPresent(block("plant2_layers"), at);
        helper.succeed();
    }

    // Cocoa

    @GameTest(maxTicks = 400)
    public void cocoaHangsOnItsSupportAndAges(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos support = new BlockPos(1, 2, 1);
        BlockPos at = support.east();
        BlockState west = block("plant2_cocoa").defaultBlockState().setValue(HorizontalDirectionalBlock.FACING, Direction.WEST);
        BlockState westLogs = block("plant2_cocoa_logs").defaultBlockState().setValue(HorizontalDirectionalBlock.FACING, Direction.WEST);
        helper.setBlock(support, Blocks.JUNGLE_LOG);
        helper.assertTrue(west.canSurvive(level, helper.absolutePos(at)), "default support: not on a jungle log");
        helper.setBlock(support, Blocks.OAK_LOG);
        helper.assertFalse(west.canSurvive(level, helper.absolutePos(at)), "default support: on an oak log");
        helper.assertTrue(westLogs.canSurvive(level, helper.absolutePos(at)), "#minecraft:logs support: not on an oak log");
        helper.setBlock(support, Blocks.STONE);
        helper.assertFalse(westLogs.canSurvive(level, helper.absolutePos(at)), "#minecraft:logs support: on stone");
        // Ageing on its support; bone meal adds one age.
        helper.setBlock(support, Blocks.OAK_LOG);
        helper.setBlock(at, westLogs);
        BlockPos abs = helper.absolutePos(at);
        ((MsmCocoaBlock) block("plant2_cocoa_logs")).performBonemeal(level, RandomSource.create(1L), abs, level.getBlockState(abs),
                BonemealSource.INTERACTION);
        helper.assertValueEqual(level.getBlockState(abs).getValue(CocoaBlock.AGE), 1, "age after bone meal");
        RandomSource random = RandomSource.create(445L);
        helper.succeedWhen(() -> {
            BlockState now = level.getBlockState(abs);
            helper.assertTrue(now.is(block("plant2_cocoa_logs")), "the pod is gone: " + now);
            now.randomTick(level, abs, random);
            helper.assertValueEqual(level.getBlockState(abs).getValue(CocoaBlock.AGE), 2, "age");
            // Taking the support away drops the pod.
            level.setBlock(helper.absolutePos(support), Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
            helper.assertTrue(level.getBlockState(abs).isAir(), "the pod stayed without support: " + level.getBlockState(abs));
        });
    }

    // Candle

    @GameTest
    public void candlesCountLightAndGoOut(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        ServerLevel level = helper.getLevel();
        BlockPos at = new BlockPos(1, 2, 1);
        BlockPos untagged = new BlockPos(3, 2, 1);
        helper.setBlock(at.below(), Blocks.STONE);
        helper.setBlock(untagged.below(), Blocks.STONE);
        helper.setBlock(at, block("plant2_candle"));
        helper.setBlock(untagged, block("plant2_candle_untagged"));
        for (int n = 2; n <= 4; n++) {
            use(helper, player, new ItemStack(item("plant2_candle"), 4), at, Direction.UP);
            helper.assertValueEqual(helper.getBlockState(at).getValue(CandleBlock.CANDLES), n, "candles after adding");
        }
        helper.assertValueEqual(light(helper, helper.getBlockState(at)), 0, "unlit light");
        use(helper, player, new ItemStack(Items.FLINT_AND_STEEL), at, Direction.UP);
        helper.assertTrue(helper.getBlockState(at).getValue(CandleBlock.LIT), "flint and steel did not light the candles");
        helper.assertValueEqual(light(helper, helper.getBlockState(at)), 12, "four lit candles");
        use(helper, player, new ItemStack(Items.FLINT_AND_STEEL), untagged, Direction.UP);
        helper.assertFalse(helper.getBlockState(untagged).getValue(CandleBlock.LIT), "an untagged candle lit");
        use(helper, player, ItemStack.EMPTY, at, Direction.UP);
        helper.assertFalse(helper.getBlockState(at).getValue(CandleBlock.LIT), "the candles did not go out by hand");
        helper.succeed();
    }

    // Crop soil

    @GameTest
    public void cropSoilFollowsTheTag(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockState crop = block("plant2_crop_soul").defaultBlockState();
        Map<Block, Boolean> expected = Map.of(Blocks.SOUL_SAND, true, Blocks.SOUL_SOIL, true, Blocks.FARMLAND, false, Blocks.DIRT, false);
        int x = 1;
        for (Map.Entry<Block, Boolean> e : expected.entrySet()) {
            BlockPos floor = new BlockPos(x, 1, 1);
            helper.setBlock(floor, e.getKey());
            helper.setBlock(floor.above().south(), Blocks.GLOWSTONE);
            helper.assertValueEqual(crop.canSurvive(level, helper.absolutePos(floor.above())), e.getValue(),
                    "crop on " + BuiltInRegistries.BLOCK.getKey(e.getKey()));
            x += 2;
        }
        IntegerProperty age = (IntegerProperty) crop.getBlock().getStateDefinition().getProperty("age");
        helper.assertValueEqual(age.getPossibleValues(), List.of(0, 1, 2, 3), "crop ages");
        helper.succeed();
    }
}
