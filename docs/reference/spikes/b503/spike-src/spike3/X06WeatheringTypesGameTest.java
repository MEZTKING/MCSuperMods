package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;
import static dev.mcsupermods.runtime.gametest.spike3.B503Mod.b;

import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.AttachFace;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;

/**
 * B503 spike (throwaway), X6: weathering subclasses of the runtime's rod, button, pressure plate, fence, fence gate and
 * wall classes ({@code B503Blocks.W*}, two stages each): random ticking, the ageing rate against vanilla copper (forced
 * random ticks, no neighbours), and whether the state's properties survive the change.
 */
public class X06WeatheringTypesGameTest {
    static Map<String, Object> rate(GameTestHelper helper, BlockState start, int n) {
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(new BlockPos(3, 3, 3));
        RandomSource random = RandomSource.create(4490L);
        int changes = 0;
        String into = null;
        for (int k = 0; k < n; k++) {
            level.setBlock(abs, start, 2 | 16);
            start.randomTick(level, abs, random);
            BlockState now = level.getBlockState(abs);
            if (now != start) {
                changes++;
                into = B503Help.name(now);
            }
        }
        level.setBlock(abs, Blocks.AIR.defaultBlockState(), 2 | 16);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("start", B503Help.name(start));
        m.put("isRandomlyTicking", start.isRandomlyTicking());
        m.put("rate", changes / (double) n);
        m.put("into", into);
        return m;
    }

    @GameTest(maxTicks = 40)
    public void x6Types(GameTestHelper helper) {
        int n = 20000;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("vanillaCopper", rate(helper, Blocks.COPPER_BLOCK.weathering().unaffected().defaultBlockState(), n));
        R.section("X6.rod", () -> m.put("rod", rate(helper, b("w_rod").defaultBlockState().setValue(BlockStateProperties.FACING, Direction.EAST), n)));
        R.section("X6.button", () -> m.put("button", rate(helper, b("w_button").defaultBlockState()
                .setValue(BlockStateProperties.ATTACH_FACE, AttachFace.FLOOR).setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.WEST), n)));
        R.section("X6.buttonPowered", () -> m.put("buttonPowered", rate(helper, b("w_button").defaultBlockState()
                .setValue(BlockStateProperties.ATTACH_FACE, AttachFace.FLOOR).setValue(BlockStateProperties.POWERED, true), n)));
        R.section("X6.plate", () -> m.put("plate", rate(helper, b("w_plate").defaultBlockState(), n)));
        R.section("X6.fence", () -> m.put("fence", rate(helper, b("w_fence").defaultBlockState().setValue(BlockStateProperties.NORTH, true), n)));
        R.section("X6.gate", () -> m.put("gate", rate(helper, b("w_gate").defaultBlockState()
                .setValue(BlockStateProperties.OPEN, true).setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.SOUTH), n)));
        R.section("X6.wall", () -> m.put("wall", rate(helper, b("w_wall").defaultBlockState().setValue(BlockStateProperties.UP, false), n)));
        R.section("X6.wallWaterlogged", () -> m.put("wallWaterlogged", rate(helper, b("w_wall").defaultBlockState()
                .setValue(BlockStateProperties.WATERLOGGED, true), n)));
        R.put("X6.types", m);
        helper.succeed();
    }

    /** In place: a fence between two fences ages and stays connected; a pressed plate ages while pressed. */
    @GameTest(maxTicks = 40)
    public void x6InPlace(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        R.section("X6.inPlace", () -> {
            helper.setBlock(new BlockPos(1, 1, 2), Blocks.OAK_FENCE);
            helper.setBlock(new BlockPos(2, 1, 2), b("w_fence"));
            helper.setBlock(new BlockPos(3, 1, 2), b("w_fence"));
            BlockState before = helper.getBlockState(new BlockPos(2, 1, 2));
            m.put("fenceBefore", B503Help.name(before));
            RandomSource random = RandomSource.create(1L);
            int k = 0;
            while (helper.getBlockState(new BlockPos(2, 1, 2)).is(b("w_fence")) && k < 50000) {
                helper.getBlockState(new BlockPos(2, 1, 2)).randomTick(helper.getLevel(), helper.absolutePos(new BlockPos(2, 1, 2)), random);
                k++;
            }
            m.put("fenceTicks", k);
            m.put("fenceAfter", B503Help.name(helper.getBlockState(new BlockPos(2, 1, 2))));
            m.put("neighbourAfter", B503Help.name(helper.getBlockState(new BlockPos(3, 1, 2))));
        });
        R.put("X6.inPlace", m);
        helper.succeed();
    }
}
