package dev.mcsupermods.runtime.gametest.spike5;

import static dev.mcsupermods.runtime.gametest.spike5.B525Help.R;

import dev.mcsupermods.runtime.registry.fluid.MsmFluids;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FluidState;

/**
 * B525 spike (throwaway), X25: mixing. Each test is one meeting in the runtime's {@code fluid_pool} (23 by 23 floor at
 * y 0, walls three high): what is placed first, what second, the blocks at the meeting after 2 ticks, a census of the
 * pool after the fluids have spread, and the lava fizz level events (1501) a listening player saw.
 */
public class X25MixingGameTest {
    static final String POOL = "msm_runtime_gametest:fluid_pool";
    static final BlockPos A = new BlockPos(10, 1, 11);
    static final BlockPos B = new BlockPos(11, 1, 11);

    static Block runtime(String path) {
        return MsmFluids.get(Identifier.fromNamespaceAndPath("msm_test", path)).orElseThrow().block();
    }

    static String at(GameTestHelper helper, BlockPos rel) {
        BlockState s = helper.getBlockState(rel);
        FluidState f = s.getFluidState();
        String fluid = f.isEmpty() ? "" : " fluid " + BuiltInRegistries.FLUID.getKey(f.getType()) + (f.isSource() ? " source" : " amount " + f.getAmount());
        return B525Help.name(s) + fluid;
    }

    /** Blocks in the pool's two lowest layers that are neither air, stone, glass nor a liquid, and the fluid counts. */
    static Map<String, Object> census(GameTestHelper helper) {
        Map<String, Integer> fluids = new TreeMap<>();
        List<String> solids = new ArrayList<>();
        for (int y = 1; y <= 2; y++) {
            for (int x = 1; x <= 21; x++) {
                for (int z = 1; z <= 21; z++) {
                    BlockPos p = new BlockPos(x, y, z);
                    BlockState s = helper.getBlockState(p);
                    if (s.getBlock() instanceof LiquidBlock) {
                        FluidState f = s.getFluidState();
                        fluids.merge(BuiltInRegistries.FLUID.getKey(f.getType()) + (f.isSource() ? " source" : " flowing"), 1, Integer::sum);
                    } else if (!s.isAir() && !s.is(Blocks.STONE) && !s.is(Blocks.GLASS)) {
                        solids.add(B525Help.id(s.getBlock()) + " at " + p.toShortString());
                    }
                }
            }
        }
        Map<String, Object> out = new TreeMap<>();
        out.put("fluids", fluids);
        out.put("solids", solids);
        return out;
    }

    /** Places {@code first} at {@code a}, then a tick later {@code second} at {@code b}; records as {@code X25.<name>}. */
    static void meet(GameTestHelper helper, String name, BlockPos a, BlockState first, BlockPos b, BlockState second, int settle) {
        Map<String, Object> m = new TreeMap<>();
        B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(1, 1, 1), GameType.SPECTATOR, "Ears");
        helper.setBlock(a, first);
        helper.runAfterDelay(1, () -> R.section("X25." + name, () -> {
            m.put("first", at(helper, a));
            helper.setBlock(b, second);
        }));
        helper.runAfterDelay(3, () -> R.section("X25." + name, () -> {
            m.put("after2.a", at(helper, a));
            m.put("after2.b", at(helper, b));
            m.put("after2.heard", ears.heard().stream().filter(h -> h.startsWith("levelEvent 1501")).toList());
        }));
        helper.runAfterDelay(settle, () -> {
            R.section("X25." + name, () -> {
                m.put("settled.a", at(helper, a));
                m.put("settled.b", at(helper, b));
                m.put("settled.census", census(helper));
                m.put("settled.fizzCount", ears.heard().stream().filter(h -> h.startsWith("levelEvent 1501")).count());
            });
            R.put("X25." + name, m);
            ears.close();
            helper.succeed();
        });
    }

    static BlockState flowing(Block liquid, int level) {
        return liquid.defaultBlockState().setValue(LiquidBlock.LEVEL, level);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25ProjectLavaPlacedBesideWater(GameTestHelper helper) {
        meet(helper, "projectLavaPlacedBesideWater", A, Blocks.WATER.defaultBlockState(), B, B525Mod.block("mix_lava").defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25WaterPlacedBesideProjectLava(GameTestHelper helper) {
        meet(helper, "waterPlacedBesideProjectLava", B, B525Mod.block("mix_lava").defaultBlockState(), A, Blocks.WATER.defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25FlowingProjectLavaBesideWater(GameTestHelper helper) {
        meet(helper, "flowingProjectLavaBesideWater", A, Blocks.WATER.defaultBlockState(), B, flowing(B525Mod.block("mix_lava"), 2), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25ProjectLavaBesideProjectWater(GameTestHelper helper) {
        meet(helper, "projectLavaBesideRuntimeWaterLike", A, runtime("fluid_water").defaultBlockState(), B,
                B525Mod.block("mix_lava").defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25ProjectLavaBesideGoo(GameTestHelper helper) {
        meet(helper, "projectLavaPlacedBesideGoo", A, B525Mod.block("mix_goo").defaultBlockState(), B,
                B525Mod.block("mix_lava").defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25GooPlacedBesideVanillaLava(GameTestHelper helper) {
        meet(helper, "gooPlacedBesideVanillaLava", B, Blocks.LAVA.defaultBlockState(), A, B525Mod.block("mix_goo").defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25VanillaLavaPlacedBesideGoo(GameTestHelper helper) {
        meet(helper, "vanillaLavaPlacedBesideGoo", A, B525Mod.block("mix_goo").defaultBlockState(), B, Blocks.LAVA.defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25RuntimeLavaBesideWaterControl(GameTestHelper helper) {
        meet(helper, "controlRuntimeLavaLikePlacedBesideWater", A, Blocks.WATER.defaultBlockState(), B, runtime("fluid_lava").defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25VanillaLavaBesideRuntimeWaterControl(GameTestHelper helper) {
        meet(helper, "controlVanillaLavaPlacedBesideRuntimeWaterLike", A, runtime("fluid_water").defaultBlockState(), B,
                Blocks.LAVA.defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25ProjectLavaAboveWater(GameTestHelper helper) {
        meet(helper, "projectLavaPlacedAboveWater", A, Blocks.WATER.defaultBlockState(), A.above(), B525Mod.block("mix_lava").defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25WaterPlacedAboveProjectLava(GameTestHelper helper) {
        meet(helper, "waterPlacedAboveProjectLava", A, B525Mod.block("mix_lava").defaultBlockState(), A.above(), Blocks.WATER.defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25StrictLavaBesideWater(GameTestHelper helper) {
        meet(helper, "strictLavaLikeNoWaterRulePlacedBesideWater", A, Blocks.WATER.defaultBlockState(), B,
                B525Mod.block("mix_strict").defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25StrictLavaBesideGoo(GameTestHelper helper) {
        meet(helper, "strictLavaLikePlacedBesideGoo", A, B525Mod.block("mix_goo").defaultBlockState(), B,
                B525Mod.block("mix_strict").defaultBlockState(), 100);
    }

    @GameTest(structure = POOL, maxTicks = 120)
    public void x25StrictLavaAlone(GameTestHelper helper) {
        meet(helper, "strictLavaLikeAloneSpreads", A, Blocks.STONE.defaultBlockState(), B, B525Mod.block("mix_strict").defaultBlockState(), 100);
    }

    /** Natural flow: the lava-like source and a water source five apart in a one-wide stone channel. */
    @GameTest(structure = POOL, maxTicks = 220)
    public void x25ProjectLavaFlowsTowardWater(GameTestHelper helper) {
        for (int x = 3; x <= 13; x++) {
            helper.setBlock(new BlockPos(x, 1, 10), Blocks.STONE);
            helper.setBlock(new BlockPos(x, 1, 12), Blocks.STONE);
        }
        helper.setBlock(new BlockPos(3, 1, 11), Blocks.STONE);
        helper.setBlock(new BlockPos(13, 1, 11), Blocks.STONE);
        Map<String, Object> m = new TreeMap<>();
        helper.setBlock(new BlockPos(12, 1, 11), Blocks.WATER);
        helper.setBlock(new BlockPos(4, 1, 11), B525Mod.block("mix_lava"));
        helper.runAfterDelay(200, () -> {
            R.section("X25.channel", () -> {
                List<String> row = new ArrayList<>();
                for (int x = 4; x <= 12; x++) {
                    row.add(x + ": " + at(helper, new BlockPos(x, 1, 11)));
                }
                m.put("row", row);
            });
            R.put("X25.channelProjectLavaWestWaterEast", m);
            helper.succeed();
        });
    }

    /** At the end of the batch: the liquid block's own log. */
    @GameTest(structure = POOL, maxTicks = 220)
    public void x25zLog(GameTestHelper helper) {
        helper.runAfterDelay(210, () -> {
            R.put("X25.log", List.copyOf(B525Liquid.LOG));
            R.put("startup", B525Mod.STARTUP);
            helper.succeed();
        });
    }
}
