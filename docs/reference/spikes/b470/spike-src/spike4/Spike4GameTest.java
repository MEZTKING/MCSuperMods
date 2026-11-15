package dev.mcsupermods.runtime.gametest.spike4;

import dev.mcsupermods.runtime.gametest.SpikeFluid;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.FluidTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
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
 * B470 spike (throwaway): server-side observations of S14 (ADR 0099 D3). Records rather than asserts; every test
 * succeeds and writes {@code <gameDir>/msm-spike4/server-<mc>.json}.
 */
public class Spike4GameTest {
    static final Spike4Results R = new Spike4Results("server");
    private static final String POOL = "msm_runtime_gametest:spike4_pool";
    private static final BlockPos CENTRE = new BlockPos(11, 1, 11);
    private static final TagKey<Fluid> SWIMMABLE = TagKey.create(Registries.FLUID, Identifier.withDefaultNamespace("swimmable"));
    private static final TagKey<Fluid> FLOATABLE = TagKey.create(Registries.FLUID, Identifier.withDefaultNamespace("entity_floatable"));

    private static Block block(String path) {
        return Spike4Mod.BLOCKS.get(path);
    }

    private static SpikeFluid.Made made(String path) {
        return Spike4Mod.FLUIDS.get(path);
    }

    private static String fs(FluidState state) {
        return state.isEmpty() ? "empty" : BuiltInRegistries.FLUID.getKey(state.getType()).getPath() + " amount=" + state.getAmount()
                + " source=" + state.isSource() + " " + state.toString().replaceAll("^[^\\[]*", "");
    }

    private static String bs(BlockState state) {
        return state.toString().replace("Block{", "").replace("}", "");
    }

    private static String stack(ItemStack stack) {
        return stack.isEmpty() ? "empty" : BuiltInRegistries.ITEM.getKey(stack.getItem()) + "x" + stack.getCount();
    }

    private static boolean ours(FluidState state, String path) {
        return SpikeFluid.isOf(state, made(path));
    }

    private static Map<String, Object> tags(FluidState state) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("water", state.is(FluidTags.WATER));
        out.put("lava", state.is(FluidTags.LAVA));
        out.put("swimmable", state.is(SWIMMABLE));
        out.put("entity_floatable", state.is(FLOATABLE));
        return out;
    }

    // ---------------------------------------------------------------- registry

    @GameTest(maxTicks = 20)
    public void registry(GameTestHelper helper) {
        R.section("registry", () -> {
            R.put("startup", new TreeMap<>(Spike4Mod.STARTUP));
            R.put("fluidRegistry.spike", BuiltInRegistries.FLUID.keySet().stream().map(Identifier::toString)
                    .filter(s -> s.contains("spike") || s.startsWith("minecraft:")).sorted().toList());
            R.put("vanilla.water.facts", SpikeFluid.facts(Fluids.WATER));
            R.put("vanilla.lava.facts", SpikeFluid.facts(Fluids.LAVA));
            R.put("vanilla.water.tickDelay", Fluids.WATER.getTickDelay(helper.getLevel()));
            R.put("vanilla.lava.tickDelay", Fluids.LAVA.getTickDelay(helper.getLevel()));
            for (Spike4Spec spec : Spike4Mod.SPECS) {
                String p = spec.path();
                SpikeFluid.Made m = made(p);
                Map<String, Object> f = new LinkedHashMap<>(SpikeFluid.facts(m.still()));
                FluidState src = SpikeFluid.source(m);
                FluidState flow = SpikeFluid.flowing(m, 5, false);
                f.put("source", fs(src));
                f.put("flowing5", fs(flow));
                f.put("source.tags", tags(src));
                f.put("flowing.tags", tags(flow));
                f.put("source.legacyBlock", bs(src.createLegacyBlock()));
                f.put("flowing.legacyBlock", bs(flow.createLegacyBlock()));
                f.put("idMapper.source", Fluid.FLUID_STATE_REGISTRY.getId(src));
                f.put("idMapper.flowing", Fluid.FLUID_STATE_REGISTRY.getId(flow));
                BlockState def = block(p).defaultBlockState();
                f.put("block.default", bs(def));
                f.put("block.fluidState", fs(def.getFluidState()));
                f.put("block.lightEmission", def.getLightEmission());
                f.put("block.renderShape", String.valueOf(def.getRenderShape()));
                f.put("block.liquid", def.liquid());
                f.put("block.replaceable", def.canBeReplaced());
                f.put("block.explosionResistance", block(p).getExplosionResistance());
                f.put("bucket.content", String.valueOf(BuiltInRegistries.FLUID.getKey(((net.minecraft.world.item.BucketItem) Spike4Mod.BUCKETS.get(p)).getContent())));
                f.put("bucket.craftRemainder", String.valueOf(Spike4Mod.BUCKETS.get(p).getCraftingRemainder()));
                f.put("bucket.maxStack", new ItemStack(Spike4Mod.BUCKETS.get(p)).getMaxStackSize());
                f.put("dispenser.behaviour", String.valueOf(DispenserBlock.DISPENSER_REGISTRY.get(Spike4Mod.BUCKETS.get(p))));
                R.put("fluid." + p, f);
            }
            R.put("vanilla.water.idMapper", Fluid.FLUID_STATE_REGISTRY.getId(Fluids.WATER.defaultFluidState()));
            R.put("log.startup", new ArrayList<>(Spike4Mod.LOG));
        });
        helper.succeed();
    }

    // ---------------------------------------------------------------- flow, sources, draining

    private void flow(GameTestHelper helper, String path) {
        String k = "flow." + path;
        Map<Long, Integer> counts = new TreeMap<>();
        AtomicLong firstSpread = new AtomicLong(-1);
        AtomicLong lastChange = new AtomicLong(-1);
        AtomicInteger last = new AtomicInteger(-1);
        AtomicLong removed = new AtomicLong(-1);
        AtomicLong drained = new AtomicLong(-1);
        int delay = Spike4Mod.BY_PATH.get(path).tickDelay();
        long removeAt = Math.max(120, delay * 12L);
        long end = removeAt + Math.max(120, delay * 12L);
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
            long t = helper.getTick();
            if (n != last.get()) {
                counts.put(t, n);
                lastChange.set(t);
                last.set(n);
            }
            if (firstSpread.get() < 0 && ours(helper.getBlockState(CENTRE.east()).getFluidState(), path)) {
                firstSpread.set(t);
            }
            if (removed.get() >= 0 && drained.get() < 0 && n == 0) {
                drained.set(t - removed.get());
            }
        });
        helper.runAtTickTime(removeAt - 1, () -> {
            List<String> row = new ArrayList<>();
            int reach = 0;
            for (int dx = 0; dx <= 10; dx++) {
                FluidState s = helper.getBlockState(CENTRE.east(dx)).getFluidState();
                row.add(dx + ":" + (ours(s, path) ? s.getAmount() + (s.isSource() ? "S" : "") : "-"));
                if (ours(s, path)) {
                    reach = dx;
                }
            }
            R.put(k + ".rowEast", row);
            R.put(k + ".reachEast", reach);
            R.put(k + ".stableCount", last.get());
            R.put(k + ".lastChangeTick", lastChange.get());
            R.put(k + ".firstSpreadTick", firstSpread.get());
            R.put(k + ".blockAt1", bs(helper.getBlockState(CENTRE.east())));
        });
        helper.runAtTickTime(removeAt, () -> {
            helper.setBlock(CENTRE, Blocks.AIR.defaultBlockState());
            removed.set(helper.getTick());
        });
        helper.runAtTickTime(end, () -> {
            R.put(k + ".counts", counts.toString());
            R.put(k + ".drainTicks", drained.get());
            R.put(k + ".afterDrain", last.get());
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 800)
    public void flowWater(GameTestHelper helper) {
        flow(helper, "spike_water");
    }

    @GameTest(structure = POOL, maxTicks = 800)
    public void flowWaterBare(GameTestHelper helper) {
        flow(helper, "spike_water_bare");
    }

    @GameTest(structure = POOL, maxTicks = 800)
    public void flowLava(GameTestHelper helper) {
        flow(helper, "spike_lava");
    }

    @GameTest(structure = POOL, maxTicks = 800)
    public void flowPlain(GameTestHelper helper) {
        flow(helper, "spike_plain");
    }

    @GameTest(structure = POOL, maxTicks = 200)
    public void fall(GameTestHelper helper) {
        helper.setBlock(new BlockPos(4, 4, 4), block("spike_water").defaultBlockState());
        helper.setBlock(new BlockPos(18, 4, 18), block("spike_lava").defaultBlockState());
        helper.runAtTickTime(150, () -> {
            List<String> water = new ArrayList<>();
            List<String> lava = new ArrayList<>();
            for (int y = 4; y >= 1; y--) {
                water.add(y + ": " + fs(helper.getBlockState(new BlockPos(4, y, 4)).getFluidState()) + " | " + bs(helper.getBlockState(new BlockPos(4, y, 4))));
                lava.add(y + ": " + fs(helper.getBlockState(new BlockPos(18, y, 18)).getFluidState()));
            }
            R.put("fall.spike_water.column", water);
            R.put("fall.spike_lava.column", lava);
            R.put("fall.spike_water.floorNeighbour", fs(helper.getBlockState(new BlockPos(5, 1, 4)).getFluidState()));
            helper.succeed();
        });
    }

    private void infinite(GameTestHelper helper, String path) {
        // Two sources one block apart on the floor; vanilla water makes the middle a source.
        helper.setBlock(new BlockPos(10, 1, 11), block(path).defaultBlockState());
        helper.setBlock(new BlockPos(12, 1, 11), block(path).defaultBlockState());
        int delay = Spike4Mod.BY_PATH.get(path).tickDelay();
        helper.runAtTickTime(delay * 6L + 20, () -> {
            R.put("infinite." + path + ".middle", fs(helper.getBlockState(CENTRE).getFluidState()));
            R.put("infinite." + path + ".spec", Spike4Mod.BY_PATH.get(path).infinite());
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 400)
    public void infiniteWater(GameTestHelper helper) {
        infinite(helper, "spike_water");
    }

    @GameTest(structure = POOL, maxTicks = 400)
    public void infiniteWaterBare(GameTestHelper helper) {
        infinite(helper, "spike_water_bare");
    }

    @GameTest(structure = POOL, maxTicks = 400)
    public void infiniteLava(GameTestHelper helper) {
        infinite(helper, "spike_lava");
    }

    @GameTest(structure = POOL, maxTicks = 400)
    public void infinitePlain(GameTestHelper helper) {
        infinite(helper, "spike_plain");
    }

    // ---------------------------------------------------------------- buckets (mock player) and dispensers

    private static InteractionResult use(GameTestHelper helper, Player player, ItemStack held) {
        player.setItemInHand(InteractionHand.MAIN_HAND, held);
        InteractionResult result = held.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        if (result instanceof InteractionResult.Success s && s.heldItemTransformedTo() != null) {
            player.setItemInHand(InteractionHand.MAIN_HAND, s.heldItemTransformedTo());
        }
        return result;
    }

    private void bucket(GameTestHelper helper, String path) {
        String k = "bucket." + path;
        Player player = helper.makeMockServerPlayerInLevel();
        player.getAbilities().instabuild = false;
        ((net.minecraft.server.level.ServerPlayer) player).setGameMode(GameType.SURVIVAL);
        Vec3 eye = helper.absoluteVec(new Vec3(11.5, 2.2, 11.5));
        player.snapTo(eye.x, eye.y, eye.z, 0f, 90f);
        helper.setBlock(CENTRE, block(path).defaultBlockState());
        helper.runAtTickTime(2, () -> {
            R.section(k, () -> {
                InteractionResult fill = use(helper, player, new ItemStack(Items.BUCKET));
                R.put(k + ".fill.result", String.valueOf(fill));
                R.put(k + ".fill.hand", stack(player.getMainHandItem()));
                R.put(k + ".fill.blockAfter", bs(helper.getBlockState(CENTRE)));
                InteractionResult empty = use(helper, player, player.getMainHandItem());
                R.put(k + ".empty.result", String.valueOf(empty));
                R.put(k + ".empty.hand", stack(player.getMainHandItem()));
                R.put(k + ".empty.blockAfter", bs(helper.getBlockState(CENTRE)) + " / " + fs(helper.getBlockState(CENTRE).getFluidState()));
                // Creative: the bucket stays full and the hand keeps it.
                Player creative = helper.makeMockServerPlayerInLevel();
                ((net.minecraft.server.level.ServerPlayer) creative).setGameMode(GameType.CREATIVE);
                creative.snapTo(eye.x, eye.y, eye.z, 0f, 90f);
                InteractionResult cfill = use(helper, creative, new ItemStack(Items.BUCKET));
                R.put(k + ".creativeFill.hand", stack(creative.getMainHandItem()) + " inv has bucket item "
                        + creative.getInventory().contains(new ItemStack(Spike4Mod.BUCKETS.get(path))) + " " + cfill);
            });
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void bucketWater(GameTestHelper helper) {
        bucket(helper, "spike_water");
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void bucketWaterBare(GameTestHelper helper) {
        bucket(helper, "spike_water_bare");
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void bucketLava(GameTestHelper helper) {
        bucket(helper, "spike_lava");
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void bucketLavaBare(GameTestHelper helper) {
        bucket(helper, "spike_lava_bare");
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void bucketPlain(GameTestHelper helper) {
        bucket(helper, "spike_plain");
    }

    private void dispense(GameTestHelper helper, String path) {
        String k = "dispense." + path;
        BlockPos at = new BlockPos(11, 1, 5);
        BlockPos out = at.south();
        BlockPos power = at.west();
        helper.setBlock(at, Blocks.DISPENSER.defaultBlockState().setValue(DispenserBlock.FACING, Direction.SOUTH));
        helper.runAtTickTime(1, () -> {
            DispenserBlockEntity be = (DispenserBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(at));
            be.insertItem(new ItemStack(Spike4Mod.BUCKETS.get(path)));
            helper.setBlock(power, Blocks.REDSTONE_BLOCK);
        });
        helper.runAtTickTime(10, () -> {
            DispenserBlockEntity be = (DispenserBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(at));
            R.put(k + ".first.front", bs(helper.getBlockState(out)) + " / " + fs(helper.getBlockState(out).getFluidState()));
            R.put(k + ".first.slot0", stack(be.getItem(0)));
            List<String> items = new ArrayList<>();
            for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new net.minecraft.world.phys.AABB(helper.absolutePos(out)).inflate(3))) {
                items.add(stack(e.getItem()));
            }
            R.put(k + ".first.droppedItems", items);
            helper.setBlock(power, Blocks.AIR);
        });
        helper.runAtTickTime(14, () -> helper.setBlock(power, Blocks.REDSTONE_BLOCK));
        helper.runAtTickTime(24, () -> {
            DispenserBlockEntity be = (DispenserBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(at));
            R.put(k + ".second.front", bs(helper.getBlockState(out)) + " / " + fs(helper.getBlockState(out).getFluidState()));
            R.put(k + ".second.slot0", stack(be.getItem(0)));
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void dispenseWater(GameTestHelper helper) {
        dispense(helper, "spike_water");
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void dispenseWaterBare(GameTestHelper helper) {
        dispense(helper, "spike_water_bare");
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void dispenseLava(GameTestHelper helper) {
        dispense(helper, "spike_lava");
    }

    @GameTest(structure = POOL, maxTicks = 40)
    public void dispensePlain(GameTestHelper helper) {
        dispense(helper, "spike_plain");
    }

    // ---------------------------------------------------------------- entities in the fluid

    private static Map<String, Object> look(Entity e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("inWater", e.isInWater());
        out.put("inLava", e.isInLava());
        out.put("underWater", e.isUnderWater());
        out.put("eyeInWater", e.isEyeInFluid(FluidTags.WATER));
        out.put("eyeInLava", e.isEyeInFluid(FluidTags.LAVA));
        out.put("heightWater", Math.round(e.getFluidHeight(FluidTags.WATER) * 100) / 100.0);
        out.put("heightLava", Math.round(e.getFluidHeight(FluidTags.LAVA) * 100) / 100.0);
        out.put("onFire", e.isOnFire());
        out.put("fireTicks", e.getRemainingFireTicks());
        out.put("air", e.getAirSupply());
        out.put("y", Math.round(e.getY() * 100) / 100.0);
        out.put("dy", Math.round(e.getDeltaMovement().y * 1000) / 1000.0);
        if (e instanceof LivingEntity l) {
            out.put("health", l.getHealth());
            out.put("lastDamage", l.getLastDamageSource() == null ? "none" : l.getLastDamageSource().getMsgId());
        }
        return out;
    }

    private void entity(GameTestHelper helper, String key, BlockState fill) {
        String k = "entity." + key;
        for (int x = 8; x <= 14; x++) {
            for (int z = 8; z <= 14; z++) {
                for (int y = 1; y <= 3; y++) {
                    helper.setBlock(new BlockPos(x, y, z), fill);
                }
            }
        }
        LivingEntity pig = helper.spawn(net.minecraft.world.entity.EntityTypes.PIG, new Vec3(11.5, 1, 11.5));
        LivingEntity zombie = helper.spawn(net.minecraft.world.entity.EntityTypes.ZOMBIE, new Vec3(9.5, 1, 9.5));
        ItemEntity item = helper.spawn(net.minecraft.world.entity.EntityTypes.ITEM, new Vec3(13.5, 1.2, 13.5));
        item.setItem(new ItemStack(Items.COBBLESTONE));
        item.setPickUpDelay(1000);
        net.minecraft.world.entity.Mob cow = helper.spawn(net.minecraft.world.entity.EntityTypes.COW, new Vec3(12.5, 1, 9.5));
        cow.setNoAi(true);
        helper.runAtTickTime(5, () -> R.put(k + ".t5.pig", look(pig)));
        helper.runAtTickTime(20, () -> {
            R.put(k + ".t20.cowNoAi", look(cow));
            cow.setAirSupply(0);
        });
        helper.runAtTickTime(80, () -> R.put(k + ".t80.cowNoAiAfterAir0", look(cow)));
        LivingEntity faller = helper.spawn(net.minecraft.world.entity.EntityTypes.COW, new Vec3(10.5, 17, 12.5));
        helper.runAtTickTime(70, () -> R.put(k + ".t70.cowFell16", look(faller)));
        helper.runAtTickTime(40, () -> {
            R.put(k + ".t40.pig", look(pig));
            R.put(k + ".t40.zombie", look(zombie));
            R.put(k + ".t40.item", look(item));
            zombie.setRemainingFireTicks(200);
        });
        helper.runAtTickTime(43, () -> {
            R.put(k + ".t43.zombieAfterFireSet", look(zombie));
            zombie.setAirSupply(0);
        });
        helper.runAtTickTime(90, () -> {
            R.put(k + ".t90.zombieAfterAir0", look(zombie));
            R.put(k + ".t90.pig", look(pig));
            R.put(k + ".t90.item", look(item));
            R.put(k + ".entityInside", new TreeMap<>(Spike4LiquidBlock.INSIDE).toString());
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void entityWater(GameTestHelper helper) {
        entity(helper, "spike_water", block("spike_water").defaultBlockState());
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void entityWaterBare(GameTestHelper helper) {
        entity(helper, "spike_water_bare", block("spike_water_bare").defaultBlockState());
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void entityLava(GameTestHelper helper) {
        entity(helper, "spike_lava", block("spike_lava").defaultBlockState());
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void entityLavaBare(GameTestHelper helper) {
        entity(helper, "spike_lava_bare", block("spike_lava_bare").defaultBlockState());
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void entityPlain(GameTestHelper helper) {
        entity(helper, "spike_plain", block("spike_plain").defaultBlockState());
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void entityVanillaWater(GameTestHelper helper) {
        entity(helper, "vanilla_water", Blocks.WATER.defaultBlockState());
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void entityVanillaLava(GameTestHelper helper) {
        entity(helper, "vanilla_lava", Blocks.LAVA.defaultBlockState());
    }

    // ---------------------------------------------------------------- mixing (D5 says none; what does the tag give?)

    private void mix(GameTestHelper helper, String key, BlockState a, BlockState b) {
        helper.setBlock(new BlockPos(9, 1, 11), a);
        helper.setBlock(new BlockPos(13, 1, 11), b);
        helper.runAtTickTime(160, () -> {
            Map<String, Integer> found = new TreeMap<>();
            for (int x = 1; x < 22; x++) {
                for (int z = 1; z < 22; z++) {
                    for (int y = 1; y <= 3; y++) {
                        BlockState s = helper.getBlockState(new BlockPos(x, y, z));
                        if (!s.isAir()) {
                            found.merge(BuiltInRegistries.BLOCK.getKey(s.getBlock()).getPath(), 1, Integer::sum);
                        }
                    }
                }
            }
            R.put("mix." + key, found);
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 200)
    public void mixSpikeLavaVanillaWater(GameTestHelper helper) {
        mix(helper, "spikeLava_vanillaWater", block("spike_lava").defaultBlockState(), Blocks.WATER.defaultBlockState());
    }

    @GameTest(structure = POOL, maxTicks = 200)
    public void mixVanillaLavaSpikeWater(GameTestHelper helper) {
        mix(helper, "vanillaLava_spikeWater", Blocks.LAVA.defaultBlockState(), block("spike_water").defaultBlockState());
    }

    @GameTest(structure = POOL, maxTicks = 200)
    public void mixSpikeLavaSpikeWater(GameTestHelper helper) {
        mix(helper, "spikeLava_spikeWater", block("spike_lava").defaultBlockState(), block("spike_water").defaultBlockState());
    }

    @GameTest(structure = POOL, maxTicks = 200)
    public void mixSpikeWaterVanillaWater(GameTestHelper helper) {
        mix(helper, "spikeWater_vanillaWater", block("spike_water").defaultBlockState(), Blocks.WATER.defaultBlockState());
    }
}
