package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition;
import dev.mcsupermods.runtime.registry.fluid.MsmFluid;
import dev.mcsupermods.runtime.registry.fluid.MsmFluids;
import dev.mcsupermods.runtime.registry.fluid.MsmLiquidBlock;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.BucketItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.block.entity.DispenserBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for project fluids (ADR 0099 D1–D3 and the amendment after B470) on {@code msm/msm_test/fluid/*}:
 * {@code fluid_water} (water-like, tint, {@code on_entity_inside}), {@code fluid_lava} (lava-like, every default),
 * {@code fluid_custom} (water-like with its own flow 10, 2, 2, not infinite, light 9, explosion resistance 3) and
 * {@code fluid_plain} ({@code behaves_like: none}); the parser's errors are covered by {@code FluidParserTest}. The fluid
 * tags are test data ({@code data/minecraft/tags/fluid/}, both ids on 26.3), as the lowering writes them.
 *
 * <p>Flow, sources and draining run in {@code fluid_pool} (a 23 by 23 stone floor with walls three high), entities in
 * a 7 by 7 by 3 block of fluid inside it; mobs that must stay put have no AI. On 26.4 swimming, floating, sinking and
 * {@code isUnderWater} need {@code EntityFluidMixin}: {@link #entityInWaterLike} fails without it, so it is the proof
 * that the Mixin plugin applies it there.
 */
public class MsmFluidGameTest {
    private static final String POOL = "msm_runtime_gametest:fluid_pool";
    private static final BlockPos CENTRE = new BlockPos(11, 1, 11);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static MsmFluids.Entry entry(String path) {
        return MsmFluids.get(id(path)).orElseThrow(() -> new AssertionError("fluid msm_test:" + path + " is not registered"));
    }

    private static Block block(String path) {
        return entry(path).block();
    }

    private static boolean ours(FluidState state, String path) {
        MsmFluids.Fluids fluids = entry(path).fluids();
        return state.getType() == fluids.still() || state.getType() == fluids.flowing();
    }

    // registration

    @GameTest
    public void registersFluidBlockAndBucket(GameTestHelper helper) {
        List<Identifier> reported = MsmRuntime.report().fluids();
        for (String path : List.of("fluid_water", "fluid_lava", "fluid_custom", "fluid_plain")) {
            Identifier id = id(path);
            helper.assertTrue(reported.contains(id), id + " not in the report: " + reported);
            MsmFluids.Entry e = entry(path);
            for (Identifier fluidId : MsmFluid.registryIds(id)) {
                helper.assertTrue(BuiltInRegistries.FLUID.containsKey(fluidId), "fluid " + fluidId + " not registered");
            }
            helper.assertTrue(BuiltInRegistries.FLUID.getValue(id) == e.fluids().still(), id + " is not the still fluid");
            helper.assertTrue(BuiltInRegistries.BLOCK.getValue(id) == e.block(), "liquid block " + id);
            Item bucket = BuiltInRegistries.ITEM.getValue(MsmFluids.bucketId(id));
            helper.assertTrue(bucket == e.bucket(), "bucket " + MsmFluids.bucketId(id));
            helper.assertTrue(((BucketItem) bucket).getContent() == e.fluids().source(), id + " bucket holds " + ((BucketItem) bucket).getContent());
            helper.assertValueEqual(new ItemStack(bucket).getMaxStackSize(), 1, id + " bucket stack size");
            helper.assertTrue(bucket.getCraftingRemainder() != null && String.valueOf(bucket.getCraftingRemainder()).contains("bucket"),
                    id + " bucket remainder " + bucket.getCraftingRemainder());
            helper.assertTrue(DispenserBlock.DISPENSER_REGISTRY.get(bucket) == DispenserBlock.DISPENSER_REGISTRY.get(Items.WATER_BUCKET),
                    id + " bucket does not dispense as vanilla's water bucket");
            BlockState state = e.block().defaultBlockState();
            helper.assertTrue(ours(state.getFluidState(), path) && state.getFluidState().isSource(), id + " block holds " + state.getFluidState());
            helper.assertTrue(state.liquid() && state.canBeReplaced(), id + " block is not a replaceable liquid");
            helper.assertTrue(String.valueOf(e.fluids().source().getBucket()).contains(MsmFluids.bucketId(id).toString()),
                    id + " fluid names bucket " + e.fluids().source().getBucket());
        }
        helper.assertValueEqual(MsmFluid.registryIds(id("a/b")).size(), MsmFluid.MODEL.equals("two_fluids") ? 2 : 1, "registry ids");
        helper.assertValueEqual(MsmFluids.flowingId(id("a/b")), id("a/flowing_b"), "flowing id");
        // Light (ADR 0099 D1: 0, lava-like 15) and explosion resistance.
        helper.assertValueEqual(block("fluid_water").defaultBlockState().getLightEmission(), 0, "water-like light");
        helper.assertValueEqual(block("fluid_lava").defaultBlockState().getLightEmission(), 15, "lava-like default light");
        helper.assertValueEqual(block("fluid_custom").defaultBlockState().getLightEmission(), 9, "custom light");
        helper.assertValueEqual(block("fluid_custom").getExplosionResistance(), 3.0f, "custom block explosion resistance");
        helper.assertValueEqual(block("fluid_water").getExplosionResistance(), 100.0f, "default explosion resistance");
        helper.assertValueEqual(entry("fluid_custom").fluids().source().defaultFluidState().getExplosionResistance(), 3.0f,
                "custom fluid explosion resistance");
        // Pickup sounds: 26.3 overrides getPickupSound, 26.4 sets the property; the block answers from the fluid.
        helper.assertValueEqual(((MsmLiquidBlock) block("fluid_water")).getPickupSound(), Optional.of(SoundEvents.BUCKET_FILL), "water-like sound");
        helper.assertValueEqual(((MsmLiquidBlock) block("fluid_lava")).getPickupSound(), Optional.of(SoundEvents.BUCKET_FILL_LAVA), "lava-like sound");
        helper.assertValueEqual(((MsmLiquidBlock) block("fluid_plain")).getPickupSound(), Optional.of(SoundEvents.BUCKET_FILL), "none sound");
        // The test definitions load cleanly (the parser's errors are JUnit's: FluidParserTest).
        List<String> errors = MsmRuntime.report().errors().stream().filter(m -> m.contains("/fluid/")).toList();
        helper.assertValueEqual(errors, List.of(), "fluid load errors");
        helper.succeed();
    }

    /**
     * 26.4 copies drag, the fall distance multiplier and the fog from vanilla water or lava by {@code behaves_like}
     * (read through reflection: these getters exist on 26.4 only); on 26.3 there is nothing to compare.
     */
    @GameTest
    public void copiesVanillaPropertiesByBehaviour(GameTestHelper helper) throws ReflectiveOperationException {
        int compared = 0;
        for (String getter : List.of("getDrag", "getFallDistanceMultiplier", "getFogType")) {
            Method method;
            try {
                method = Fluid.class.getMethod(getter);
            } catch (NoSuchMethodException e) {
                continue;
            }
            helper.assertValueEqual(method.invoke(entry("fluid_water").fluids().source()), method.invoke(Fluids.WATER), "water-like " + getter);
            helper.assertValueEqual(method.invoke(entry("fluid_custom").fluids().source()), method.invoke(Fluids.WATER), "custom " + getter);
            helper.assertValueEqual(method.invoke(entry("fluid_lava").fluids().source()), method.invoke(Fluids.LAVA), "lava-like " + getter);
            compared++;
        }
        helper.assertValueEqual(compared, MsmFluid.MODEL.equals("one_fluid") ? 3 : 0, "properties compared");
        helper.succeed();
    }

    // flow, delay, sources, draining

    /**
     * A source in the middle of the pool: the first block east fills after the definition's {@code tick_delay}, the row
     * east ends at {@code 8 / drop_off} blocks less one with amounts falling by {@code drop_off}; once the source is
     * taken away every block of it drains.
     */
    private static void flow(GameTestHelper helper, String path) {
        FluidDefinition.Flow flow = entry(path).definition().flow();
        int delay = flow.tickDelay();
        int reach = (8 + flow.dropOff() - 1) / flow.dropOff() - 1;
        AtomicLong firstSpread = new AtomicLong(-1);
        AtomicInteger count = new AtomicInteger();
        long start = helper.getTick();
        helper.setBlock(CENTRE, block(path).defaultBlockState());
        helper.onEachTick(() -> {
            int n = 0;
            for (int x = 1; x < 22; x++) {
                for (int z = 1; z < 22; z++) {
                    if (ours(helper.getBlockState(new BlockPos(x, 1, z)).getFluidState(), path)) {
                        n++;
                    }
                }
            }
            count.set(n);
            if (firstSpread.get() < 0 && ours(helper.getBlockState(CENTRE.east()).getFluidState(), path)) {
                firstSpread.set(helper.getTick() - start);
            }
        });
        int settle = delay * (reach + 3);
        helper.runAfterDelay(settle, () -> {
            helper.assertTrue(firstSpread.get() >= delay && firstSpread.get() <= delay + 1,
                    path + " first spread after " + firstSpread.get() + " ticks, tick_delay " + delay);
            for (int dx = 0; dx <= reach; dx++) {
                FluidState s = helper.getBlockState(CENTRE.east(dx)).getFluidState();
                int expected = dx == 0 ? 8 : 8 - dx * flow.dropOff();
                helper.assertTrue(ours(s, path) && s.getAmount() == expected && s.isSource() == (dx == 0),
                        path + " at " + dx + " east: " + s + ", expected amount " + expected);
            }
            helper.assertTrue(!ours(helper.getBlockState(CENTRE.east(reach + 1)).getFluidState(), path),
                    path + " reaches past " + reach + " blocks");
            helper.setBlock(CENTRE, Blocks.AIR.defaultBlockState());
        });
        helper.runAfterDelay(settle + 1 + delay * (reach + 4L), () -> {
            helper.assertValueEqual(count.get(), 0, path + " blocks left after draining");
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 200)
    public void flowWaterLike(GameTestHelper helper) {
        flow(helper, "fluid_water");
    }

    @GameTest(structure = POOL, maxTicks = 200)
    public void flowCustomNumbers(GameTestHelper helper) {
        flow(helper, "fluid_custom");
    }

    @GameTest(structure = POOL, maxTicks = 400)
    public void flowLavaLike(GameTestHelper helper) {
        flow(helper, "fluid_lava");
    }

    @GameTest(structure = POOL, maxTicks = 200)
    public void flowNone(GameTestHelper helper) {
        flow(helper, "fluid_plain");
    }

    /**
     * {@code slope_distance}: on a platform with a hole four blocks east of the source, the first spread of water-like
     * (4) goes only towards the hole, while the custom fluid (2) does not see it and spreads both ways. Measured: a fluid
     * finds a hole up to {@code slope_distance + 1} blocks away (the custom fluid found one three blocks away). (Once the way to
     * the hole is full of the fluid, the source spreads everywhere, as vanilla water does: checked at the first spread.)
     */
    private static void slope(GameTestHelper helper, String path, boolean findsHole) {
        for (int x = 1; x < 22; x++) {
            for (int z = 1; z < 22; z++) {
                helper.setBlock(new BlockPos(x, 1, z), Blocks.STONE.defaultBlockState());
            }
        }
        BlockPos source = CENTRE.above();
        helper.setBlock(CENTRE.east(4), Blocks.AIR.defaultBlockState());
        helper.setBlock(source, block(path).defaultBlockState());
        int delay = entry(path).definition().flow().tickDelay();
        StringBuilder seen = new StringBuilder();
        helper.onEachTick(() -> {
            StringBuilder row = new StringBuilder();
            for (int dx = -3; dx <= 3; dx++) {
                FluidState f = helper.getBlockState(source.east(dx)).getFluidState();
                row.append(ours(f, path) ? String.valueOf(f.getAmount()) : ".");
            }
            row.append('|').append(helper.getBlockState(CENTRE.east(4)).isAir() ? "hole" : helper.getBlockState(CENTRE.east(4)).toString());
            if (seen.indexOf(row.toString()) < 0) {
                seen.append(' ').append(helper.getTick()).append(':').append(row);
            }
        });
        helper.runAfterDelay(delay + 1L, () -> {
            boolean west = ours(helper.getBlockState(source.west()).getFluidState(), path);
            helper.assertTrue(west != findsHole, path + (findsHole ? " spread away from the hole" : " found a hole past its slope distance") + ":" + seen);
            helper.assertTrue(ours(helper.getBlockState(source.east()).getFluidState(), path), path + " did not flow east");
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 100)
    public void slopeDistanceFindsTheHole(GameTestHelper helper) {
        slope(helper, "fluid_water", true);
    }

    @GameTest(structure = POOL, maxTicks = 100)
    public void shortSlopeDistanceMissesTheHole(GameTestHelper helper) {
        slope(helper, "fluid_custom", false);
    }

    /** Two sources one block apart: the block between becomes a source only when the fluid is infinite. */
    private static void infinite(GameTestHelper helper, String path) {
        helper.setBlock(CENTRE.west(), block(path).defaultBlockState());
        helper.setBlock(CENTRE.east(), block(path).defaultBlockState());
        boolean infinite = entry(path).definition().flow().infinite();
        helper.runAfterDelay(entry(path).definition().flow().tickDelay() * 4L, () -> {
            FluidState middle = helper.getBlockState(CENTRE).getFluidState();
            helper.assertTrue(ours(middle, path) && middle.isSource() == infinite, path + " middle " + middle + ", infinite " + infinite);
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 100)
    public void infiniteSourceWaterLike(GameTestHelper helper) {
        infinite(helper, "fluid_water");
    }

    @GameTest(structure = POOL, maxTicks = 100)
    public void noInfiniteSourceCustom(GameTestHelper helper) {
        infinite(helper, "fluid_custom");
    }

    @GameTest(structure = POOL, maxTicks = 200)
    public void noInfiniteSourceLavaLike(GameTestHelper helper) {
        infinite(helper, "fluid_lava");
    }

    // buckets and dispensers

    private static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        Vec3 eye = helper.absoluteVec(new Vec3(11.5, 2.2, 11.5));
        player.snapTo(eye.x, eye.y, eye.z, 0f, 90f);
        return player;
    }

    private static InteractionResult use(GameTestHelper helper, ServerPlayer player) {
        return player.gameMode.useItem(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
    }

    /** An empty bucket takes a source and becomes the fluid's bucket; that bucket puts the source back. */
    private static void bucket(GameTestHelper helper, String path) {
        helper.setBlock(CENTRE, block(path).defaultBlockState());
        helper.runAfterDelay(1, () -> {
            ServerPlayer player = player(helper, GameType.SURVIVAL);
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BUCKET));
            InteractionResult filled = use(helper, player);
            helper.assertTrue(filled.consumesAction(), path + " fill " + filled);
            helper.assertTrue(player.getMainHandItem().is(entry(path).bucket()), path + " hand holds " + player.getMainHandItem());
            helper.assertTrue(helper.getBlockState(CENTRE).isAir(), path + " source left " + helper.getBlockState(CENTRE));
            InteractionResult poured = use(helper, player);
            helper.assertTrue(poured.consumesAction(), path + " pour " + poured);
            helper.assertTrue(player.getMainHandItem().is(Items.BUCKET), path + " hand after pouring " + player.getMainHandItem());
            FluidState placed = helper.getBlockState(CENTRE).getFluidState();
            helper.assertTrue(ours(placed, path) && placed.isSource(), path + " poured " + placed);
            // Creative: the filled bucket goes into the inventory and the empty one stays in the hand.
            ServerPlayer creative = player(helper, GameType.CREATIVE);
            creative.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BUCKET));
            use(helper, creative);
            helper.assertTrue(creative.getMainHandItem().is(Items.BUCKET), path + " creative hand " + creative.getMainHandItem());
            helper.assertTrue(creative.getInventory().contains(new ItemStack(entry(path).bucket())), path + " creative inventory has no bucket");
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 20)
    public void bucketWaterLike(GameTestHelper helper) {
        bucket(helper, "fluid_water");
    }

    @GameTest(structure = POOL, maxTicks = 20)
    public void bucketLavaLike(GameTestHelper helper) {
        bucket(helper, "fluid_lava");
    }

    @GameTest(structure = POOL, maxTicks = 20)
    public void bucketNone(GameTestHelper helper) {
        bucket(helper, "fluid_plain");
    }

    /** A dispenser pours the fluid's bucket and keeps the empty bucket; powered again, it takes the source back. */
    private static void dispense(GameTestHelper helper, String path) {
        BlockPos at = new BlockPos(11, 1, 5);
        BlockPos front = at.south();
        BlockPos power = at.west();
        helper.setBlock(at, Blocks.DISPENSER.defaultBlockState().setValue(DispenserBlock.FACING, Direction.SOUTH));
        helper.runAfterDelay(1, () -> {
            DispenserBlockEntity dispenser = (DispenserBlockEntity) helper.getBlockEntity(at, DispenserBlockEntity.class);
            dispenser.insertItem(new ItemStack(entry(path).bucket()));
            helper.setBlock(power, Blocks.REDSTONE_BLOCK);
        });
        helper.runAfterDelay(10, () -> {
            DispenserBlockEntity dispenser = (DispenserBlockEntity) helper.getBlockEntity(at, DispenserBlockEntity.class);
            FluidState poured = helper.getBlockState(front).getFluidState();
            helper.assertTrue(ours(poured, path) && poured.isSource(), path + " dispensed " + poured);
            helper.assertTrue(dispenser.getItem(0).is(Items.BUCKET), path + " slot after pouring " + dispenser.getItem(0));
            helper.setBlock(power, Blocks.AIR);
        });
        helper.runAfterDelay(14, () -> helper.setBlock(power, Blocks.REDSTONE_BLOCK));
        helper.runAfterDelay(24, () -> {
            DispenserBlockEntity dispenser = (DispenserBlockEntity) helper.getBlockEntity(at, DispenserBlockEntity.class);
            helper.assertTrue(dispenser.getItem(0).is(entry(path).bucket()), path + " slot after taking it back " + dispenser.getItem(0));
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void dispenserWaterLike(GameTestHelper helper) {
        dispense(helper, "fluid_water");
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void dispenserLavaLike(GameTestHelper helper) {
        dispense(helper, "fluid_lava");
    }

    // entities in the fluid

    private static void fill(GameTestHelper helper, String path) {
        BlockState fill = block(path).defaultBlockState();
        for (int x = 8; x <= 14; x++) {
            for (int z = 8; z <= 14; z++) {
                for (int y = 1; y <= 3; y++) {
                    helper.setBlock(new BlockPos(x, y, z), fill);
                }
            }
        }
    }

    private static Mob still(GameTestHelper helper, double x, double z) {
        Mob cow = helper.spawn(EntityTypes.COW, new Vec3(x, 1, z));
        cow.setNoAi(true);
        return cow;
    }

    private static String damage(LivingEntity e) {
        return e.getLastDamageSource() == null ? "none" : e.getLastDamageSource().getMsgId();
    }

    /**
     * Water-like (B470's measurements, on 26.4 only with {@code EntityFluidMixin}): a pig floats up, a dropped item
     * floats, a submerged zombie is in and under water, a burning cow is put out, and a cow out of air drowns.
     */
    @GameTest(structure = POOL, maxTicks = 120)
    public void entityInWaterLike(GameTestHelper helper) {
        fill(helper, "fluid_water");
        LivingEntity pig = helper.spawn(EntityTypes.PIG, new Vec3(11.5, 1, 11.5));
        Mob zombie = helper.spawn(EntityTypes.ZOMBIE, new Vec3(9.5, 1, 9.5));
        zombie.setNoAi(true);
        ItemEntity item = helper.spawn(EntityTypes.ITEM, new Vec3(13.5, 1.2, 13.5));
        item.setItem(new ItemStack(Items.COBBLESTONE));
        item.setPickUpDelay(1000);
        Mob burning = still(helper, 12.5, 9.5);
        Mob drowning = still(helper, 9.5, 13.5);
        helper.runAfterDelay(5, () -> {
            helper.assertTrue(pig.isInWater(), "the pig is not in water");
            helper.assertTrue(zombie.isInWater() && zombie.isUnderWater(), "the zombie is in " + zombie.isInWater() + ", under " + zombie.isUnderWater());
            helper.assertFalse(zombie.isInLava(), "the zombie is in lava");
            burning.setRemainingFireTicks(200);
            drowning.setAirSupply(0);
        });
        helper.runAfterDelay(9, () -> helper.assertTrue(burning.getRemainingFireTicks() <= 0, "the cow still burns: " + burning.getRemainingFireTicks()));
        helper.runAfterDelay(80, () -> {
            helper.assertTrue(helper.relativePos(pig.blockPosition()).getY() >= 2, "the pig did not float up: " + pig.position());
            helper.assertTrue(item.getY() - helper.absoluteVec(Vec3.ZERO).y > 1.3, "the item sank: " + item.position());
            helper.assertTrue(drowning.getHealth() < drowning.getMaxHealth() && damage(drowning).equals("drown"),
                    "the cow did not drown: " + drowning.getHealth() + " " + damage(drowning));
            helper.succeed();
        });
    }

    /** Lava-like: entities are in lava, set on fire and hurt by lava (the fluid's own effects); nobody is in water. */
    @GameTest(structure = POOL, maxTicks = 60)
    public void entityInLavaLike(GameTestHelper helper) {
        fill(helper, "fluid_lava");
        Mob cow = still(helper, 11.5, 11.5);
        helper.runAfterDelay(20, () -> {
            helper.assertTrue(cow.isInLava() && !cow.isInWater(), "lava " + cow.isInLava() + ", water " + cow.isInWater());
            helper.assertTrue(cow.isOnFire(), "the cow does not burn");
            helper.assertTrue(cow.getHealth() < cow.getMaxHealth() && damage(cow).equals("lava"), "lava damage " + cow.getHealth() + " " + damage(cow));
            helper.succeed();
        });
    }

    /** {@code none}: not water, not lava; no drowning and no putting out. */
    @GameTest(structure = POOL, maxTicks = 80)
    public void entityInNone(GameTestHelper helper) {
        fill(helper, "fluid_plain");
        Mob cow = still(helper, 11.5, 11.5);
        Mob burning = still(helper, 9.5, 9.5);
        helper.runAfterDelay(5, () -> {
            helper.assertFalse(cow.isInWater() || cow.isInLava() || cow.isUnderWater(), "the cow is in a liquid");
            cow.setAirSupply(0);
            burning.setRemainingFireTicks(200);
        });
        helper.runAfterDelay(60, () -> {
            helper.assertFalse(damage(cow).equals("drown"), "the cow drowned in a none fluid");
            helper.assertTrue(burning.getRemainingFireTicks() > 0, "a none fluid put the fire out");
            helper.succeed();
        });
    }

    /**
     * {@code on_entity_inside}: fires on the server for an entity in the fluid, at most every 10 ticks however many of
     * its blocks the entity touches; the entity is the actor ({@code other}: it gets the glowing effect).
     */
    @GameTest(structure = POOL, maxTicks = 80)
    public void onEntityInsideFiresWithCooldown(GameTestHelper helper) {
        fill(helper, "fluid_water");
        Mob cow = still(helper, 11.0, 11.0); // on a corner: four blocks of the fluid at once
        List<Long> fired = new ArrayList<>();
        List<String> wrong = new ArrayList<>();
        Identifier owner = id("fluid_water");
        EventListener listener = new EventListener() {
            @Override
            public void onEvent(Identifier from, Identifier event, int depth, EventContext ctx) {
                if (from.equals(owner) && ctx.other() == cow) {
                    if (!event.equals(id("inside")) || ctx.level().isClientSide()) {
                        wrong.add(event + (ctx.level().isClientSide() ? " on the client" : ""));
                    }
                    fired.add(helper.getTick());
                }
            }
        };
        EventRunner.addListener(listener);
        helper.runAfterDelay(51, () -> {
            EventRunner.removeListener(listener);
            helper.assertTrue(wrong.isEmpty(), "unexpected firings " + wrong);
            helper.assertTrue(fired.size() >= 4 && fired.size() <= 6, "fired " + fired.size() + " times in 50 ticks: " + fired);
            for (int i = 1; i < fired.size(); i++) {
                helper.assertTrue(fired.get(i) - fired.get(i - 1) >= 10, "fired again after " + (fired.get(i) - fired.get(i - 1)) + " ticks");
            }
            helper.assertTrue(cow.hasEffect(MobEffects.GLOWING), "no glowing on the cow");
            helper.succeed();
        });
    }

    /** Light: the liquid block gives its light level (lava-like 15 by default, the custom 9) to the world. */
    @GameTest(structure = POOL, maxTicks = 40)
    public void liquidBlockLight(GameTestHelper helper) {
        BlockPos lava = new BlockPos(5, 1, 5);
        BlockPos custom = new BlockPos(17, 1, 17);
        helper.setBlock(lava, block("fluid_lava").defaultBlockState());
        helper.setBlock(custom, block("fluid_custom").defaultBlockState());
        helper.runAfterDelay(5, () -> {
            helper.assertValueEqual(helper.getLevel().getBrightness(LightLayer.BLOCK, helper.absolutePos(lava)), 15, "lava-like block light");
            helper.assertValueEqual(helper.getLevel().getBrightness(LightLayer.BLOCK, helper.absolutePos(custom)), 9, "custom block light");
            helper.assertValueEqual(helper.getLevel().getBrightness(LightLayer.BLOCK, helper.absolutePos(custom.above(2))), 7, "custom light two above");
            helper.succeed();
        });
    }

    /** The seam's source and flowing states belong to the fluid, and a flowing state's block is the liquid block. */
    @GameTest
    public void sourceAndFlowingStatesAreTheFluid(GameTestHelper helper) {
        for (String path : List.of("fluid_water", "fluid_lava", "fluid_custom")) {
            FluidState source = MsmFluid.sourceState(entry(path).fluids().source());
            FluidState flowing = MsmFluid.flowingState(entry(path).fluids().source(), 5);
            helper.assertTrue(ours(source, path) && source.isSource() && source.getAmount() == 8, path + " source " + source);
            helper.assertTrue(ours(flowing, path) && !flowing.isSource() && flowing.getAmount() == 5, path + " flowing " + flowing);
            helper.assertTrue(flowing.createLegacyBlock().is(block(path)), path + " flowing block " + flowing.createLegacyBlock());
            helper.assertFalse(ours(source, path.equals("fluid_water") ? "fluid_lava" : "fluid_water"), path + " matches another fluid");
        }
        helper.succeed();
    }
}
