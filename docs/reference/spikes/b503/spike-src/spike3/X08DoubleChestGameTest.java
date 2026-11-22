package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;
import static dev.mcsupermods.runtime.gametest.spike3.X07WaterloggedContainerGameTest.be;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.HopperBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;

/**
 * B503 spike (throwaway), X8: a double chest on vanilla's {@code ChestBlock} with its own block entity type and block
 * models ({@code B503Blocks.DChest}): placing two side by side, one six-row menu, hoppers and comparators on each half,
 * breaking one half, sneak-placing.
 */
public class X08DoubleChestGameTest {
    @GameTest(maxTicks = 120)
    public void x8DoubleChest(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerPlayer player = B503Help.player(helper, new BlockPos(2, 1, 5), GameType.SURVIVAL);
        player.setYRot(180f);
        player.setYHeadRot(180f);
        BlockPos a = new BlockPos(2, 1, 2);
        BlockPos b = new BlockPos(3, 1, 2);
        R.section("X8.place", () -> {
            helper.setBlock(a.below(), Blocks.STONE);
            helper.setBlock(b.below(), Blocks.STONE);
            m.put("placeA", String.valueOf(B503Help.use(helper, player, a.below(), Direction.UP, new ItemStack(B503Mod.I.get("double_chest")))));
            m.put("placeB", String.valueOf(B503Help.use(helper, player, b.below(), Direction.UP, new ItemStack(B503Mod.I.get("double_chest")))));
            m.put("stateA", B503Help.name(helper.getBlockState(a)));
            m.put("stateB", B503Help.name(helper.getBlockState(b)));
            m.put("entityA", be(helper, a));
            B503Help.use(helper, player, a, Direction.SOUTH, ItemStack.EMPTY);
            if (player.containerMenu instanceof ChestMenu menu) {
                m.put("menu", "ChestMenu rows " + menu.getRowCount() + " container size " + menu.getContainer().getContainerSize()
                        + " class " + menu.getContainer().getClass().getSimpleName());
                menu.getContainer().setItem(40, new ItemStack(Items.EMERALD, 5));
                menu.getContainer().setItem(1, new ItemStack(Items.GOLD_INGOT, 2));
            } else {
                m.put("menu", String.valueOf(player.containerMenu));
            }
            player.closeContainer();
            m.put("halfA", be(helper, a));
            m.put("halfB", be(helper, b));
            m.put("comparatorA", helper.getBlockState(a).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(a), Direction.SOUTH));
            m.put("comparatorB", helper.getBlockState(b).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(b), Direction.SOUTH));
            // Hoppers: one feeding each half from above; one under half A pulling.
            helper.setBlock(a.above(), Blocks.HOPPER.defaultBlockState().setValue(HopperBlock.FACING, Direction.DOWN));
            helper.setBlock(b.above(), Blocks.HOPPER.defaultBlockState().setValue(HopperBlock.FACING, Direction.DOWN));
            ((Container) helper.getLevel().getBlockEntity(helper.absolutePos(a.above()))).setItem(0, new ItemStack(Items.DIAMOND, 1));
            ((Container) helper.getLevel().getBlockEntity(helper.absolutePos(b.above()))).setItem(0, new ItemStack(Items.COAL, 1));
        });
        helper.runAfterDelay(30, () -> {
            R.section("X8.after", () -> {
                m.put("halfAAfterHoppers", be(helper, a));
                m.put("halfBAfterHoppers", be(helper, b));
                helper.setBlock(a.above(), Blocks.AIR);
                helper.setBlock(b.above(), Blocks.AIR);
                // Break half B: what A becomes and what drops.
                helper.getLevel().destroyBlock(helper.absolutePos(b), true);
                m.put("aAfterBreakingB", B503Help.name(helper.getBlockState(a)));
                List<String> drops = helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(b)).inflate(2))
                        .stream().map(e -> e.getItem().toString()).toList();
                m.put("dropsOfB", drops);
                m.put("halfAAfterBreak", be(helper, a));
                // Sneak-place beside A: stays single.
                player.setShiftKeyDown(true);
                m.put("sneakPlace", String.valueOf(B503Help.use(helper, player, b.below(), Direction.UP, new ItemStack(B503Mod.I.get("double_chest")))));
                player.setShiftKeyDown(false);
                m.put("aAfterSneak", B503Help.name(helper.getBlockState(a)));
                m.put("bAfterSneak", B503Help.name(helper.getBlockState(b)));
                BlockState s = helper.getBlockState(a);
                m.put("renderShape", String.valueOf(s.getRenderShape()));
            });
            R.put("X8", m);
            helper.succeed();
        });
    }
}
