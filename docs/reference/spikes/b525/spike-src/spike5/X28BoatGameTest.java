package dev.mcsupermods.runtime.gametest.spike5;

import static dev.mcsupermods.runtime.gametest.spike5.B525Help.R;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.vehicle.boat.Boat;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * B525 spike (throwaway), X28: a vanilla oak boat dropped onto a 7 by 7 pool, two deep, of one fluid per test (vanilla
 * water, the runtime's water-like, the spike's water-like goo, the runtime's lava-like and its {@code none} fluid), its
 * height over 60 ticks, then pushed east for 20 ticks.
 */
public class X28BoatGameTest {
    static final String POOL = X25MixingGameTest.POOL;

    /** The boat's private status (IN_WATER, ON_LAND, ...), read by reflection for the spike's record only. */
    static String status(Boat boat) {
        try {
            java.lang.reflect.Field f = net.minecraft.world.entity.vehicle.boat.AbstractBoat.class.getDeclaredField("status");
            f.setAccessible(true);
            return String.valueOf(f.get(boat));
        } catch (ReflectiveOperationException e) {
            return e.toString();
        }
    }

    static void boat(GameTestHelper helper, String name, Block fluid) {
        for (int x = 8; x <= 14; x++) {
            for (int z = 8; z <= 14; z++) {
                for (int y = 1; y <= 2; y++) {
                    helper.setBlock(new BlockPos(x, y, z), fluid);
                }
            }
        }
        Boat boat = EntityTypes.OAK_BOAT.create(helper.getLevel(), EntitySpawnReason.COMMAND);
        Vec3 start = helper.absoluteVec(new Vec3(11.5, 4.0, 11.5));
        boat.snapTo(start.x, start.y, start.z, 0f, 0f);
        helper.getLevel().addFreshEntity(boat);
        double floor = helper.absoluteVec(Vec3.ZERO).y;
        List<String> track = new ArrayList<>();
        Map<String, Object> m = new TreeMap<>();
        for (int t : new int[] {5, 10, 20, 40, 60}) {
            helper.runAfterDelay(t, () -> track.add(String.format(Locale.ROOT, "t%d y %.3f (above pool floor %.3f) dy %.3f waterAbove %.3f inWater %s"
                    + " underWater %s waterHeight %.3f lavaHeight %.3f alive %s status %s", t, boat.getY(), boat.getY() - floor, boat.getDeltaMovement().y,
                    boat.getWaterLevelAbove(), boat.isInWater(), boat.isUnderWater(), boat.getFluidHeight(FluidTags.WATER),
                    boat.getFluidHeight(FluidTags.LAVA), boat.isAlive(), status(boat))));
        }
        double[] x60 = new double[1];
        helper.runAfterDelay(61, () -> {
            x60[0] = boat.getX();
            boat.setDeltaMovement(0.4, 0, 0);
        });
        List<String> speed = new ArrayList<>();
        for (int t = 62; t <= 66; t++) {
            int tt = t;
            helper.runAfterDelay(t, () -> speed.add(String.format(Locale.ROOT, "t%d vx %.4f %s", tt, boat.getDeltaMovement().x, status(boat))));
        }
        helper.runAfterDelay(81, () -> {
            R.section("X28." + name, () -> {
                m.put("track", track);
                m.put("speedAfterPush", speed);
                m.put("pushedEastBlocks", String.format(Locale.ROOT, "%.3f", boat.getX() - x60[0]));
                m.put("yAfterPush", String.format(Locale.ROOT, "%.3f", boat.getY() - floor));
                m.put("onFire", boat.isOnFire());
                m.put("alive", boat.isAlive());
            });
            R.put("X28." + name, m);
            boat.discard();
            helper.succeed();
        });
    }

    @GameTest(structure = POOL, maxTicks = 100)
    public void x28VanillaWater(GameTestHelper helper) {
        boat(helper, "vanillaWater", Blocks.WATER);
    }

    @GameTest(structure = POOL, maxTicks = 100)
    public void x28RuntimeWaterLike(GameTestHelper helper) {
        boat(helper, "runtimeWaterLike", X25MixingGameTest.runtime("fluid_water"));
    }

    @GameTest(structure = POOL, maxTicks = 100)
    public void x28SpikeGoo(GameTestHelper helper) {
        boat(helper, "spikeGooWaterLike", B525Mod.block("mix_goo"));
    }

    @GameTest(structure = POOL, maxTicks = 100)
    public void x28RuntimeLavaLike(GameTestHelper helper) {
        boat(helper, "runtimeLavaLike", X25MixingGameTest.runtime("fluid_lava"));
    }

    @GameTest(structure = POOL, maxTicks = 100)
    public void x28VanillaLava(GameTestHelper helper) {
        boat(helper, "vanillaLava", Blocks.LAVA);
    }

    @GameTest(structure = POOL, maxTicks = 100)
    public void x28RuntimeNone(GameTestHelper helper) {
        boat(helper, "runtimeNoneFluid", X25MixingGameTest.runtime("fluid_plain"));
    }
}
