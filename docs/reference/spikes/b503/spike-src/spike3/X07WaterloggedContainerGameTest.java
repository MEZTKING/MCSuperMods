package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;
import static dev.mcsupermods.runtime.gametest.spike3.B503Mod.b;

import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.HopperBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;

/**
 * B503 spike (throwaway), X7: the runtime's container class with vanilla's {@code waterlogged} property
 * ({@code B503Blocks.WetChest}): placed into water, its block entity, menu, hoppers above and below, comparator, a bucket,
 * and breaking it.
 */
public class X07WaterloggedContainerGameTest {
    static String be(GameTestHelper helper, BlockPos rel) {
        BlockEntity be = helper.getLevel().getBlockEntity(helper.absolutePos(rel));
        if (be == null) {
            return "none";
        }
        StringBuilder b = new StringBuilder(be.getClass().getSimpleName());
        if (be instanceof Container c) {
            b.append(" [");
            for (int i = 0; i < c.getContainerSize(); i++) {
                if (!c.getItem(i).isEmpty()) {
                    b.append(i).append('=').append(c.getItem(i)).append(' ');
                }
            }
            b.append(']');
        }
        return b.toString();
    }

    @GameTest(maxTicks = 120)
    public void x7WetChest(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerPlayer player = B503Help.player(helper, new BlockPos(0, 1, 0), GameType.SURVIVAL);
        R.section("X7.place", () -> {
            helper.setBlock(new BlockPos(2, 0, 2), Blocks.STONE);
            helper.setBlock(new BlockPos(2, 1, 2), Blocks.WATER);
            m.put("placeIntoWater", String.valueOf(B503Help.use(helper, player, new BlockPos(2, 0, 2), Direction.UP, new ItemStack(B503Mod.I.get("wet_chest")))));
            BlockState s = helper.getBlockState(new BlockPos(2, 1, 2));
            m.put("placedState", B503Help.name(s));
            m.put("fluid", String.valueOf(s.getFluidState()));
            m.put("blockEntity", be(helper, new BlockPos(2, 1, 2)));
            B503Help.use(helper, player, new BlockPos(2, 1, 2), Direction.NORTH, ItemStack.EMPTY);
            m.put("menu", player.containerMenu.getClass().getSimpleName() + " slots " + player.containerMenu.slots.size());
            player.closeContainer();
            m.put("bucketPickup", String.valueOf(B503Help.use(helper, player, new BlockPos(2, 1, 2), Direction.NORTH, new ItemStack(Items.BUCKET))));
            m.put("afterBucket", B503Help.name(helper.getBlockState(new BlockPos(2, 1, 2))) + " hand " + player.getItemInHand(InteractionHand.MAIN_HAND));
            m.put("waterBucketBack", String.valueOf(B503Help.use(helper, player, new BlockPos(2, 1, 2), Direction.NORTH, new ItemStack(Items.WATER_BUCKET))));
            m.put("afterWaterBucket", B503Help.name(helper.getBlockState(new BlockPos(2, 1, 2))));
        });
        R.section("X7.hoppers", () -> {
            BlockState wet = b("wet_chest").defaultBlockState().setValue(BlockStateProperties.WATERLOGGED, true);
            helper.setBlock(new BlockPos(5, 2, 5), wet);
            helper.setBlock(new BlockPos(5, 3, 5), Blocks.HOPPER.defaultBlockState().setValue(HopperBlock.FACING, Direction.DOWN));
            helper.setBlock(new BlockPos(5, 1, 5), Blocks.HOPPER.defaultBlockState().setValue(HopperBlock.FACING, Direction.DOWN));
            helper.setBlock(new BlockPos(5, 0, 5), Blocks.STONE);
            ((Container) helper.getLevel().getBlockEntity(helper.absolutePos(new BlockPos(5, 3, 5)))).setItem(0, new ItemStack(Items.DIAMOND, 3));
            m.put("wetChestEntity", be(helper, new BlockPos(5, 2, 5)));
        });
        helper.runAfterDelay(60, () -> {
            R.section("X7.after", () -> {
                m.put("upperHopper", be(helper, new BlockPos(5, 3, 5)));
                m.put("chest", be(helper, new BlockPos(5, 2, 5)));
                m.put("lowerHopper", be(helper, new BlockPos(5, 1, 5)));
                BlockState s = helper.getBlockState(new BlockPos(5, 2, 5));
                ((Container) helper.getLevel().getBlockEntity(helper.absolutePos(new BlockPos(5, 2, 5)))).setItem(0, new ItemStack(Items.STONE, 64));
                m.put("comparator", s.getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(new BlockPos(5, 2, 5)), Direction.EAST));
                helper.getLevel().destroyBlock(helper.absolutePos(new BlockPos(5, 2, 5)), true);
                m.put("afterBreak", B503Help.name(helper.getBlockState(new BlockPos(5, 2, 5))));
            });
            R.put("X7", m);
            helper.succeed();
        });
    }
}
