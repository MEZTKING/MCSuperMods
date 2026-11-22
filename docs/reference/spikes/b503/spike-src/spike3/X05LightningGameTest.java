package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/**
 * B503 spike (throwaway), X5: a summoned bolt on a 7 by 7 floor of oxidized copper (the rule vanilla applies, measured),
 * on a lightning rod on that floor, on a floor of project oxidized tin (expected: untouched) and on project exposed tin
 * with the spike's {@code ServerEntityEvents.ENTITY_LOAD} listener scraping the block under the bolt (the Fabric route).
 */
public class X05LightningGameTest {
    static final String TALL = X01PlantClassesGameTest.TALL;

    static Block msm(String path) {
        return BuiltInRegistries.BLOCK.getValue(Identifier.fromNamespaceAndPath("msm_test", path));
    }

    static void floor(GameTestHelper helper, int cx, int cz, BlockState state) {
        for (int x = -3; x <= 3; x++) {
            for (int z = -3; z <= 3; z++) {
                helper.setBlock(new BlockPos(cx + x, 1, cz + z), state);
                for (int y = 2; y <= 4; y++) {
                    helper.setBlock(new BlockPos(cx + x, y, cz + z), Blocks.AIR);
                }
            }
        }
    }

    /** Changed floor cells: offset to block id. */
    static Map<String, String> changes(GameTestHelper helper, int cx, int cz, BlockState was) {
        Map<String, String> out = new TreeMap<>();
        for (int x = -3; x <= 3; x++) {
            for (int z = -3; z <= 3; z++) {
                for (int y = 1; y <= 2; y++) {
                    BlockState s = helper.getBlockState(new BlockPos(cx + x, y, cz + z));
                    if (y == 1 && s != was || y == 2 && !s.isAir() && !s.is(Blocks.FIRE)) {
                        out.put(x + "," + (y - 1) + "," + z, B503Help.id(s.getBlock()));
                    }
                }
            }
        }
        return out;
    }

    static void strike(GameTestHelper helper, BlockPos rel) {
        LightningBolt bolt = EntityTypes.LIGHTNING_BOLT.create(helper.getLevel(), EntitySpawnReason.TRIGGERED);
        bolt.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(rel)));
        helper.getLevel().addFreshEntity(bolt);
    }

    static void series(GameTestHelper helper, String key, BlockState floor, boolean rod, boolean route, int strikes, Runnable done) {
        int cx = 7;
        int cz = 7;
        List<Object> results = new ArrayList<>();
        Runnable[] next = new Runnable[1];
        int[] n = {0};
        next[0] = () -> {
            if (n[0] == strikes) {
                B503Mod.scrapeOnBolt = false;
                R.put(key, results);
                done.run();
                return;
            }
            floor(helper, cx, cz, floor);
            BlockPos at = new BlockPos(cx, 2, cz);
            if (rod) {
                helper.setBlock(at, Blocks.LIGHTNING_ROD.weathering().unaffected());
                at = at.above();
            }
            B503Mod.scrapeOnBolt = route;
            B503Mod.BOLTS.clear();
            long t0 = helper.getLevel().getGameTime();
            strike(helper, at);
            helper.runAfterDelay(12, () -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("changes", changes(helper, cx, cz, floor));
                m.put("spawnTick", t0);
                m.put("listener", new ArrayList<>(B503Mod.BOLTS));
                results.add(m);
                n[0]++;
                next[0].run();
            });
        };
        next[0].run();
    }

    @GameTest(structure = TALL, maxTicks = 900)
    public void x5Lightning(GameTestHelper helper) {
        BlockState oxidized = Blocks.COPPER_BLOCK.weathering().oxidized().defaultBlockState();
        series(helper, "X5.oxidizedCopperFloor", oxidized, false, false, 6,
                () -> series(helper, "X5.oxidizedCopperFloorWithRod", oxidized, true, false, 6,
                        () -> series(helper, "X5.projectOxidizedTinFloor", msm("weathering_oxidized_tin").defaultBlockState(), false, false, 3,
                                () -> series(helper, "X5.projectExposedTinFloor.routeOn", msm("weathering_exposed_tin").defaultBlockState(),
                                        false, true, 3, helper::succeed))));
    }
}
