package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition;
import dev.mcsupermods.runtime.registry.fluid.FluidMixing;
import dev.mcsupermods.runtime.registry.fluid.MsmBottleItem;
import dev.mcsupermods.runtime.registry.fluid.MsmCauldronBlock;
import dev.mcsupermods.runtime.registry.fluid.MsmCauldrons;
import dev.mcsupermods.runtime.registry.fluid.MsmFluid;
import dev.mcsupermods.runtime.registry.fluid.MsmFluids;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LayeredCauldronBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for fluid mixing, cauldrons and bottles (ADR 0108 D1–D3 and the amendment after B525) on
 * {@code msm/msm_test/fluid/}: {@code mix_lava} (lava-like; {@code water} makes crying obsidian or cobbled deepslate, and
 * the later id rule {@code msm_test:mix_goo} gold or iron; a cauldron asked for with levels, which a lava-like fluid
 * does not get), {@code mix_goo} (water-like; {@code lava} makes emerald or diamond blocks; a layered cauldron, a bottle
 * with food, speed and {@code on_drink}, and {@code on_entity_inside}), {@code mix_strict} (lava-like with only an id
 * rule, one unknown block and one unknown fluid) and {@code plain_pot} ({@code none}, a full-only cauldron and a bare
 * bottle). The other fluids of {@link MsmFluidGameTest} have none of these and keep vanilla's behaviour.
 *
 * <p>Uses go through {@code ServerPlayerGameMode.useItemOn} and {@code useItem} as the network handler does, so the
 * Fabric callbacks run as for a real click; drinking ticks the mock player as the network handler would.
 */
public class MsmFluid2GameTest {
    private static final String POOL = "msm_runtime_gametest:fluid_pool";
    private static final BlockPos A = new BlockPos(10, 1, 11);
    private static final BlockPos B = new BlockPos(11, 1, 11);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static MsmFluids.Entry entry(String path) {
        return MsmFluids.get(id(path)).orElseThrow(() -> new AssertionError("fluid msm_test:" + path + " is not registered"));
    }

    private static Block liquid(String path) {
        return entry(path).block();
    }

    private static Block cauldron(String path) {
        return MsmCauldrons.get(id(path)).orElseThrow().cauldron().block();
    }

    private static Item bottle(String path) {
        return MsmCauldrons.get(id(path)).orElseThrow().bottle();
    }

    private static Item bucket(String path) {
        return entry(path).bucket();
    }

    private static String name(BlockState state) {
        return BuiltInRegistries.BLOCK.getKey(state.getBlock()) + (state.hasProperty(LayeredCauldronBlock.LEVEL)
                ? "[level=" + state.getValue(LayeredCauldronBlock.LEVEL) + "]" : "");
    }

    private static void assertBlock(GameTestHelper helper, BlockPos pos, Block block, String what) {
        BlockState state = helper.getBlockState(pos);
        helper.assertTrue(state.is(block), what + ": " + name(state) + " instead of " + BuiltInRegistries.BLOCK.getKey(block));
    }

    // registration

    @GameTest
    public void registersCauldronsAndBottles(GameTestHelper helper) {
        helper.assertTrue(cauldron("mix_goo") instanceof MsmCauldronBlock.Layered, "mix_goo cauldron " + cauldron("mix_goo"));
        helper.assertTrue(cauldron("mix_lava") instanceof MsmCauldronBlock.Full, "a lava-like cauldron is full only: " + cauldron("mix_lava"));
        helper.assertTrue(cauldron("plain_pot") instanceof MsmCauldronBlock.Full, "plain_pot cauldron " + cauldron("plain_pot"));
        helper.assertTrue(BuiltInRegistries.BLOCK.getValue(MsmCauldrons.cauldronId(id("mix_goo"))) == cauldron("mix_goo"), "cauldron id");
        helper.assertTrue(BuiltInRegistries.ITEM.getValue(MsmCauldrons.bottleId(id("mix_goo"))) == bottle("mix_goo"), "bottle id");
        helper.assertTrue(MsmCauldrons.get(id("mix_strict")).isEmpty() && MsmCauldrons.get(id("fluid_water")).isEmpty(), "companions without asking");
        helper.assertTrue(MsmCauldrons.get(id("mix_lava")).orElseThrow().bottle() == null, "mix_lava has no bottle");
        helper.assertValueEqual(cauldron("mix_lava").defaultBlockState().getLightEmission(), 15, "lava-like cauldron light");
        helper.assertValueEqual(cauldron("mix_goo").getLootTable(), Blocks.CAULDRON.getLootTable(), "cauldron drops");
        // The bottle: a 1.6 s drink that leaves a glass bottle; food only when given.
        ItemStack goo = new ItemStack(bottle("mix_goo"));
        helper.assertValueEqual(goo.getMaxStackSize(), MsmCauldrons.BOTTLE_STACK, "bottle stack");
        helper.assertValueEqual(goo.getUseDuration(survival(helper)), Math.round(FluidDefinition.BOTTLE_DRINK_SECONDS * 20),
                "drink ticks");
        helper.assertTrue(goo.has(DataComponents.FOOD) && goo.get(DataComponents.FOOD).nutrition() == 1, "goo bottle food " + goo.get(DataComponents.FOOD));
        helper.assertTrue(String.valueOf(goo.get(DataComponents.USE_REMAINDER)).contains("glass_bottle"), "remainder " + goo.get(DataComponents.USE_REMAINDER));
        ItemStack plain = new ItemStack(bottle("plain_pot"));
        helper.assertTrue(!plain.has(DataComponents.FOOD) && plain.has(DataComponents.CONSUMABLE), "plain bottle components");
        // Clean loading: no fluid errors; the parser's warning on levels; the rules' unknown ids at start.
        List<String> errors = MsmRuntime.report().errors().stream().filter(m -> m.contains("/fluid/")).toList();
        helper.assertValueEqual(errors, List.of(), "fluid load errors");
        helper.assertTrue(MsmRuntime.report().warnings().stream().anyMatch(w -> w.contains("mix_lava") && w.contains("levels is ignored")),
                "no levels warning: " + MsmRuntime.report().warnings());
        List<String> late = FluidMixing.lateWarnings();
        helper.assertTrue(late.stream().anyMatch(w -> w.contains("mix_strict") && w.contains("msm_test:no_such_block")), "unknown block: " + late);
        helper.assertTrue(late.stream().anyMatch(w -> w.contains("mix_strict") && w.contains("msm_test:no_such_fluid")), "unknown fluid: " + late);
        helper.assertValueEqual(late.size(), 2, "late warnings " + late);
        helper.succeed();
    }

    // mixing

    /** Places {@code first} at A, then {@code second} at B beside it, and checks A and B two ticks later. */
    private static void meet(GameTestHelper helper, BlockState first, BlockState second, Block atA, Block atB) {
        helper.setBlock(A, first);
        helper.setBlock(B, second);
        helper.runAfterDelay(2, () -> {
            if (atA != null) {
                assertBlock(helper, A, atA, "A");
            }
            if (atB != null) {
                assertBlock(helper, B, atB, "B");
            }
            helper.succeed();
        });
    }

    private static BlockState source(String path) {
        return liquid(path).defaultBlockState();
    }

    private static BlockState flowing(String path, int amount) {
        return MsmFluid.flowingState(entry(path).fluids().source(), amount).createLegacyBlock();
    }

    /** A lava-like source placed beside water becomes the rule's source block; the water stays. */
    @GameTest(structure = POOL, maxTicks = 20)
    public void lavaLikeSourcePlacedBesideWater(GameTestHelper helper) {
        meet(helper, Blocks.WATER.defaultBlockState(), source("mix_lava"), Blocks.WATER, Blocks.CRYING_OBSIDIAN);
    }

    /** Water placed beside a lava-like source: the source's neighbour check turns it. */
    @GameTest(structure = POOL, maxTicks = 20)
    public void waterPlacedBesideLavaLikeSource(GameTestHelper helper) {
        meet(helper, source("mix_lava"), Blocks.WATER.defaultBlockState(), Blocks.CRYING_OBSIDIAN, Blocks.WATER);
    }

    /** Flowing lava-like fluid beside water becomes the rule's flowing block. */
    @GameTest(structure = POOL, maxTicks = 20)
    public void flowingLavaLikeBesideWater(GameTestHelper helper) {
        meet(helper, Blocks.WATER.defaultBlockState(), flowing("mix_lava", 6), Blocks.WATER, Blocks.COBBLED_DEEPSLATE);
    }

    /** A water-like project fluid counts as {@code water}: the tag rule. */
    @GameTest(structure = POOL, maxTicks = 20)
    public void lavaLikeBesideProjectWaterLike(GameTestHelper helper) {
        meet(helper, source("fluid_water"), source("mix_lava"), null, Blocks.CRYING_OBSIDIAN);
    }

    /** The id rule (second in the file) wins over the {@code water} rule (first) for a fluid in both. */
    @GameTest(structure = POOL, maxTicks = 20)
    public void idRuleBeforeTagRule(GameTestHelper helper) {
        meet(helper, source("mix_goo"), source("mix_lava"), null, Blocks.GOLD_BLOCK);
    }

    /** A water-like fluid's own {@code lava} rule: placed beside vanilla lava it becomes the rule's block. */
    @GameTest(structure = POOL, maxTicks = 20)
    public void waterLikeSourcePlacedBesideLava(GameTestHelper helper) {
        meet(helper, Blocks.LAVA.defaultBlockState(), source("mix_goo"), Blocks.LAVA, Blocks.EMERALD_BLOCK);
    }

    /** An id rule whose {@code flowing} block is unknown still makes its {@code source} block. */
    @GameTest(structure = POOL, maxTicks = 20)
    public void ruleWithAnUnknownSideKeepsTheOther(GameTestHelper helper) {
        meet(helper, source("mix_goo"), source("mix_strict"), null, Blocks.GOLD_BLOCK);
    }

    /**
     * With {@code mixing} set vanilla's own liquid checks never run: a lava-like fluid without a {@code water} rule makes
     * no obsidian, cobblestone or stone with water on either version (26.3's vanilla rule would), and still flows.
     */
    @GameTest(structure = POOL, maxTicks = 80)
    public void noVanillaMixingWhenRulesAreSet(GameTestHelper helper) {
        helper.setBlock(A, Blocks.WATER);
        helper.setBlock(B, source("mix_strict"));
        helper.runAfterDelay(60, () -> {
            List<String> solids = new ArrayList<>();
            int strict = 0;
            for (int x = 1; x <= 21; x++) {
                for (int z = 1; z <= 21; z++) {
                    BlockState s = helper.getBlockState(new BlockPos(x, 1, z));
                    if (s.is(Blocks.OBSIDIAN) || s.is(Blocks.COBBLESTONE) || s.is(Blocks.STONE) || s.is(Blocks.GOLD_BLOCK)) {
                        solids.add(name(s) + " at " + x + ", " + z);
                    }
                    if (s.is(liquid("mix_strict"))) {
                        strict++;
                    }
                }
            }
            helper.assertValueEqual(solids, List.of(), "blocks made by mixing");
            assertBlock(helper, B, liquid("mix_strict"), "the source");
            helper.assertTrue(helper.getBlockState(B).getFluidState().isSource(), "the source is not a source");
            helper.assertTrue(strict > 1, "the fluid did not flow: " + strict);
            helper.succeed();
        });
    }

    /** Without {@code mixing} nothing changes: the lava-like fluid of the first batch stays vanilla's per version. */
    @GameTest(structure = POOL, maxTicks = 20)
    public void fluidWithoutRulesKeepsVanillaBehaviour(GameTestHelper helper) {
        helper.setBlock(A, Blocks.WATER);
        helper.setBlock(B, source("fluid_lava"));
        helper.runAfterDelay(2, () -> {
            BlockState b = helper.getBlockState(B);
            boolean twoFluids = MsmFluid.MODEL.equals("two_fluids");
            // ADR 0099 findings: 26.3 lava-like fluids make obsidian by vanilla's rule, 26.4 ones do not.
            helper.assertTrue(twoFluids ? b.is(Blocks.OBSIDIAN) : b.is(liquid("fluid_lava")), MsmFluid.MODEL + ": " + name(b));
            helper.succeed();
        });
    }

    /**
     * Falling into water (vanilla's lava falling into water): the lava-like fluid flows down into a lone water source and
     * that block becomes the rule's flowing block, through the seam's {@code spreadTo}.
     */
    @GameTest(structure = POOL, maxTicks = 80)
    public void fallingIntoWaterMakesTheFlowingBlock(GameTestHelper helper) {
        BlockPos water = new BlockPos(11, 1, 11);
        BlockPos above = water.above();
        for (Direction d : Direction.Plane.HORIZONTAL) {
            helper.setBlock(water.relative(d), Blocks.STONE);
            helper.setBlock(above.relative(d), Blocks.STONE);
        }
        helper.setBlock(water, Blocks.WATER);
        helper.setBlock(above, source("mix_lava"));
        helper.succeedWhen(() -> {
            assertBlock(helper, water, Blocks.COBBLED_DEEPSLATE, "below");
            assertBlock(helper, above, liquid("mix_lava"), "above");
        });
    }

    // cauldrons

    private static ServerPlayer survival(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        return player;
    }

    /** A right click on the top of the block at {@code rel} with {@code stack} in the main hand, as the network handler does. */
    private static InteractionResult useOn(GameTestHelper helper, ServerPlayer player, BlockPos rel, ItemStack stack) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND), InteractionHand.MAIN_HAND, hit);
    }

    private static void step(GameTestHelper helper, ServerPlayer p, BlockPos at, Item item, String block, Item hand) {
        String before = name(helper.getBlockState(at));
        InteractionResult r = useOn(helper, p, at, new ItemStack(item));
        String after = name(helper.getBlockState(at));
        String what = before + " + " + BuiltInRegistries.ITEM.getKey(item) + " -> " + r + " => " + after + ", hand " + p.getMainHandItem();
        helper.assertValueEqual(after, block, what);
        helper.assertTrue(p.getMainHandItem().is(hand), what + " (hand should be " + BuiltInRegistries.ITEM.getKey(hand) + ")");
    }

    /**
     * The layered cauldron by bucket and bottle: the bucket fills vanilla's empty cauldron and takes only a full one; a
     * glass bottle takes a level at a time down to vanilla's empty cauldron, the fluid's bottle adds one up to three;
     * the comparator reads the level; buckets of other liquids replace the contents, as among vanilla's cauldrons.
     */
    @GameTest(maxTicks = 20)
    public void layeredCauldronByBucketAndBottle(GameTestHelper helper) {
        BlockPos c = new BlockPos(1, 1, 1);
        String goo = name(cauldron("mix_goo").defaultBlockState()).replaceAll("\\[.*", "");
        ServerPlayer p = survival(helper);
        helper.setBlock(c, Blocks.CAULDRON);
        step(helper, p, c, bucket("mix_goo"), goo + "[level=3]", Items.BUCKET);
        helper.assertValueEqual(helper.getBlockState(c).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(c), Direction.NORTH), 3, "comparator 3");
        step(helper, p, c, Items.GLASS_BOTTLE, goo + "[level=2]", bottle("mix_goo"));
        helper.assertValueEqual(helper.getBlockState(c).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(c), Direction.NORTH), 2, "comparator 2");
        step(helper, p, c, Items.GLASS_BOTTLE, goo + "[level=1]", bottle("mix_goo"));
        step(helper, p, c, Items.GLASS_BOTTLE, "minecraft:cauldron", bottle("mix_goo"));
        step(helper, p, c, bottle("mix_goo"), goo + "[level=1]", Items.GLASS_BOTTLE);
        step(helper, p, c, bottle("mix_goo"), goo + "[level=2]", Items.GLASS_BOTTLE);
        step(helper, p, c, Items.BUCKET, goo + "[level=2]", Items.BUCKET); // only a full one
        step(helper, p, c, bottle("mix_goo"), goo + "[level=3]", Items.GLASS_BOTTLE);
        step(helper, p, c, bottle("mix_goo"), goo + "[level=3]", bottle("mix_goo")); // full already
        step(helper, p, c, Items.BUCKET, "minecraft:cauldron", bucket("mix_goo"));
        // Other liquids' buckets.
        helper.setBlock(c, cauldron("mix_goo").defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 2));
        step(helper, p, c, Items.WATER_BUCKET, "minecraft:water_cauldron[level=3]", Items.BUCKET);
        step(helper, p, c, bucket("mix_goo"), goo + "[level=3]", Items.BUCKET); // vanilla's water cauldron takes ours
        step(helper, p, c, bucket("mix_lava"), name(cauldron("mix_lava").defaultBlockState()), Items.BUCKET);
        helper.succeed();
    }

    /** The full-only cauldron: the bucket fills and takes it whole; a glass bottle does nothing; the comparator reads 3. */
    @GameTest(maxTicks = 20)
    public void fullCauldronByBucket(GameTestHelper helper) {
        BlockPos c = new BlockPos(1, 1, 1);
        String lava = name(cauldron("mix_lava").defaultBlockState());
        ServerPlayer p = survival(helper);
        helper.setBlock(c, Blocks.CAULDRON);
        step(helper, p, c, bucket("mix_lava"), lava, Items.BUCKET);
        helper.assertValueEqual(helper.getBlockState(c).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(c), Direction.NORTH), 3, "comparator");
        step(helper, p, c, Items.GLASS_BOTTLE, lava, Items.GLASS_BOTTLE);
        step(helper, p, c, Items.BUCKET, "minecraft:cauldron", bucket("mix_lava"));
        // A bare bottle never fills from or pours into a full-only cauldron.
        helper.setBlock(c, cauldron("plain_pot"));
        step(helper, p, c, Items.GLASS_BOTTLE, name(cauldron("plain_pot").defaultBlockState()), Items.GLASS_BOTTLE);
        step(helper, p, c, Items.LAVA_BUCKET, "minecraft:lava_cauldron", Items.BUCKET);
        step(helper, p, c, bucket("plain_pot"), name(cauldron("plain_pot").defaultBlockState()), Items.BUCKET); // vanilla's lava cauldron takes ours
        helper.setBlock(c, Blocks.CAULDRON);
        step(helper, p, c, bottle("plain_pot"), "minecraft:cauldron", bottle("plain_pot")); // no layered cauldron to pour into
        helper.succeed();
    }

    /**
     * A sneaking player with an item in hand does not use a cauldron, as vanilla's block use. (Spectators are skipped
     * too, but GameTest's mock player always answers that it is no spectator, so that half is an in-game check.)
     */
    @GameTest(maxTicks = 20)
    public void sneakingSkipsCauldrons(GameTestHelper helper) {
        BlockPos c = new BlockPos(1, 1, 1);
        helper.setBlock(c, Blocks.CAULDRON);
        ServerPlayer sneaking = survival(helper);
        sneaking.setShiftKeyDown(true);
        useOn(helper, sneaking, c, new ItemStack(bucket("mix_goo")));
        assertBlock(helper, c, Blocks.CAULDRON, "after a sneaking click");
        helper.assertTrue(sneaking.getMainHandItem().is(bucket("mix_goo")), "the sneaking player's bucket " + sneaking.getMainHandItem());
        helper.succeed();
    }

    /**
     * Inside: a water-like layered cauldron puts a burning husk out and uses a level (vanilla's layered behaviour) and
     * fires {@code on_entity_inside} (glowing); a lava-like cauldron sets another husk on fire and hurts it as lava.
     */
    @GameTest(maxTicks = 60)
    public void entitiesInsideCauldrons(GameTestHelper helper) {
        BlockPos g = new BlockPos(1, 1, 1);
        BlockPos l = new BlockPos(4, 1, 1);
        helper.setBlock(g, cauldron("mix_goo").defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 3));
        helper.setBlock(l, cauldron("mix_lava"));
        // Husks: narrow enough to stand inside the walls, and never set on fire by daylight.
        Mob pig = helper.spawn(EntityTypes.HUSK, Vec3.atBottomCenterOf(g).add(0, 0.3, 0));
        pig.setNoAi(true);
        pig.igniteForSeconds(10);
        Mob cow = helper.spawn(EntityTypes.HUSK, Vec3.atBottomCenterOf(l).add(0, 0.3, 0));
        cow.setNoAi(true);
        helper.succeedWhen(() -> {
            helper.assertFalse(pig.isOnFire(), "the first husk still burns");
            helper.assertTrue(pig.hasEffect(MobEffects.GLOWING), "no on_entity_inside for the first husk");
            helper.assertValueEqual(name(helper.getBlockState(g)), name(cauldron("mix_goo").defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 2)),
                    "level after putting out");
            helper.assertTrue(cow.isOnFire(), "the second husk does not burn");
            helper.assertTrue(cow.getLastDamageSource() != null && cow.getLastDamageSource().getMsgId().equals("lava"),
                    "the second husk is not hurt by lava: " + cow.getLastDamageSource());
        });
    }

    // bottles

    /** A 3 by 3 basin of {@code fluid} at y 1 around (x0 + 1, 10), walled with stone. */
    private static void basin(GameTestHelper helper, int x0, Block fluid) {
        for (int x = x0 - 1; x <= x0 + 3; x++) {
            for (int z = 8; z <= 12; z++) {
                boolean wall = x == x0 - 1 || x == x0 + 3 || z == 8 || z == 12;
                helper.setBlock(new BlockPos(x, 1, z), wall ? Blocks.STONE : fluid);
            }
        }
    }

    /** A glass bottle used while looking straight down at the middle of the basin at {@code x0}; returns the hand. */
    private static ItemStack fill(GameTestHelper helper, ServerPlayer p, int x0) {
        p.snapTo(helper.absoluteVec(new Vec3(x0 + 1.5, 2.0, 10.5)), 0f, 90f);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.GLASS_BOTTLE));
        p.gameMode.useItem(p, helper.getLevel(), p.getMainHandItem(), InteractionHand.MAIN_HAND);
        return p.getMainHandItem().copy();
    }

    /**
     * A glass bottle on a source of a fluid with a bottle fills with that bottle and leaves the source; a water-like
     * fluid without one, and vanilla water, still give vanilla's water bottle.
     */
    @GameTest(structure = POOL, maxTicks = 20)
    public void glassBottleFillsFromSource(GameTestHelper helper) {
        basin(helper, 2, liquid("mix_goo"));
        basin(helper, 8, liquid("fluid_water"));
        basin(helper, 14, liquid("plain_pot"));
        helper.runAfterDelay(1, () -> {
            ServerPlayer p = survival(helper);
            ItemStack goo = fill(helper, p, 2);
            helper.assertTrue(goo.is(bottle("mix_goo")), "goo gave " + goo);
            helper.assertTrue(helper.getBlockState(new BlockPos(3, 1, 10)).is(liquid("mix_goo")), "the goo source is gone");
            ItemStack water = fill(helper, p, 8);
            helper.assertTrue(water.is(Items.POTION), "a water-like fluid without a bottle gave " + water);
            ItemStack plain = fill(helper, p, 14);
            helper.assertTrue(plain.is(bottle("plain_pot")), "plain_pot gave " + plain);
            helper.succeed();
        });
    }

    /**
     * Drinking the bottle to the end (1.6 s): food and effects as given, a glass bottle left, {@code on_drink} fired once
     * with the drinker as self (luck); a drink broken off fires nothing and keeps the bottle.
     */
    @GameTest(maxTicks = 80)
    public void bottleDrunkFiresOnDrink(GameTestHelper helper) {
        ServerPlayer p = survival(helper);
        p.snapTo(helper.absoluteVec(new Vec3(1.5, 1.0, 1.5)));
        p.getFoodData().setFoodLevel(10);
        List<String> fired = new ArrayList<>();
        Identifier owner = id("mix_goo");
        EventListener listener = new EventListener() {
            @Override
            public void onEvent(Identifier from, Identifier event, int depth, EventContext ctx) {
                if (from.equals(owner)) {
                    fired.add(event + (ctx.player() == p ? " by the drinker" : " by " + ctx.player()));
                }
            }
        };
        EventRunner.addListener(listener);
        // A drink broken off after 10 ticks.
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(bottle("mix_goo")));
        InteractionResult started = p.gameMode.useItem(p, helper.getLevel(), p.getMainHandItem(), InteractionHand.MAIN_HAND);
        helper.assertTrue(started.consumesAction() && p.isUsingItem(), "the drink did not start: " + started);
        int[] finishedAt = {-1};
        for (int t = 1; t <= 70; t++) {
            int tick = t;
            helper.runAfterDelay(t, () -> {
                if (tick == 10) {
                    p.releaseUsingItem();
                    helper.assertTrue(!p.isUsingItem() && p.getMainHandItem().is(bottle("mix_goo")) && fired.isEmpty(),
                            "after breaking off: using " + p.isUsingItem() + ", hand " + p.getMainHandItem() + ", fired " + fired);
                    p.gameMode.useItem(p, helper.getLevel(), p.getMainHandItem(), InteractionHand.MAIN_HAND);
                    return;
                }
                boolean using = p.isUsingItem();
                if (using) {
                    p.doTick();
                    if (!p.isUsingItem() && finishedAt[0] < 0) {
                        finishedAt[0] = tick - 10;
                    }
                }
            });
        }
        helper.runAfterDelay(75, () -> {
            EventRunner.removeListener(listener);
            int ticks = Math.round(FluidDefinition.BOTTLE_DRINK_SECONDS * 20);
            helper.assertTrue(Math.abs(finishedAt[0] - ticks) <= 1, "the drink took " + finishedAt[0] + " ticks, not " + ticks);
            helper.assertTrue(p.getMainHandItem().is(Items.GLASS_BOTTLE), "hand after drinking " + p.getMainHandItem());
            helper.assertValueEqual(p.getFoodData().getFoodLevel(), 11, "food");
            helper.assertTrue(p.hasEffect(MobEffects.SPEED) && p.getEffect(MobEffects.SPEED).getAmplifier() == 1, "speed " + p.getEffect(MobEffects.SPEED));
            helper.assertTrue(p.hasEffect(MobEffects.LUCK), "on_drink gave no luck");
            helper.assertValueEqual(fired, List.of("msm_test:drunk by the drinker"), "events fired");
            helper.succeed();
        });
    }

    /** The bottle class holds its fluid. */
    @GameTest
    public void bottleKnowsItsFluid(GameTestHelper helper) {
        helper.assertValueEqual(((MsmBottleItem) bottle("mix_goo")).fluidId(), id("mix_goo"), "fluid of the bottle");
        FluidState source = entry("mix_goo").fluids().source().defaultFluidState();
        helper.assertTrue(source.createLegacyBlock().getBlock() == liquid("mix_goo"), "legacy block of goo");
        helper.succeed();
    }
}
