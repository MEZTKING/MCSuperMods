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
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.animal.pig.Pig;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.AttachFace;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

/**
 * B503 spike (throwaway), X11: an own {@code BlockSetType} (eight project sound events in the record's order) on the
 * runtime's door, trapdoor, button and pressure plate; a second one that hands cannot open; whether it must be
 * registered (26.3's name map and codec; 26.4 has neither).
 */
public class X11SetTypeGameTest {
    @GameTest(maxTicks = 120)
    public void x11SetTypes(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("facts", B503Version.setTypeFacts(B503Mod.ownSet));
        B503Help.Ears ears = new B503Help.Ears(helper, new BlockPos(4, 2, 6), GameType.SPECTATOR, "Ears");
        ServerPlayer player = B503Help.player(helper, new BlockPos(1, 1, 4), GameType.SURVIVAL);
        R.section("X11.door", () -> {
            BlockState door = b("own_door").defaultBlockState().setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.SOUTH);
            helper.setBlock(new BlockPos(1, 0, 2), Blocks.STONE);
            helper.setBlock(new BlockPos(1, 1, 2), door.setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.LOWER));
            helper.setBlock(new BlockPos(1, 2, 2), door.setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.UPPER));
            ears.heard();
            B503Help.use(helper, player, new BlockPos(1, 1, 2), Direction.SOUTH, ItemStack.EMPTY);
            m.put("door.open", ears.heard() + " open=" + helper.getBlockState(new BlockPos(1, 1, 2)).getValue(BlockStateProperties.OPEN));
            B503Help.use(helper, player, new BlockPos(1, 1, 2), Direction.SOUTH, ItemStack.EMPTY);
            m.put("door.close", ears.heard() + " open=" + helper.getBlockState(new BlockPos(1, 1, 2)).getValue(BlockStateProperties.OPEN));
            BlockState hd = b("handless_door").defaultBlockState().setValue(BlockStateProperties.HORIZONTAL_FACING, Direction.SOUTH);
            helper.setBlock(new BlockPos(3, 0, 2), Blocks.STONE);
            helper.setBlock(new BlockPos(3, 1, 2), hd.setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.LOWER));
            helper.setBlock(new BlockPos(3, 2, 2), hd.setValue(BlockStateProperties.DOUBLE_BLOCK_HALF, DoubleBlockHalf.UPPER));
            ears.heard();
            var r = B503Help.use(helper, player, new BlockPos(3, 1, 2), Direction.SOUTH, ItemStack.EMPTY);
            m.put("handlessDoor.use", r + " " + ears.heard() + " open=" + helper.getBlockState(new BlockPos(3, 1, 2)).getValue(BlockStateProperties.OPEN));
        });
        R.section("X11.trapdoor", () -> {
            helper.setBlock(new BlockPos(5, 1, 2), b("own_trapdoor"));
            ears.heard();
            B503Help.use(helper, player, new BlockPos(5, 1, 2), Direction.UP, ItemStack.EMPTY);
            m.put("trapdoor.open", String.valueOf(ears.heard()));
            B503Help.use(helper, player, new BlockPos(5, 1, 2), Direction.UP, ItemStack.EMPTY);
            m.put("trapdoor.close", String.valueOf(ears.heard()));
        });
        R.section("X11.button", () -> {
            helper.setBlock(new BlockPos(7, 0, 2), Blocks.STONE);
            helper.setBlock(new BlockPos(7, 1, 2), b("own_button").defaultBlockState().setValue(BlockStateProperties.ATTACH_FACE, AttachFace.FLOOR));
            ears.heard();
            B503Help.use(helper, player, new BlockPos(7, 1, 2), Direction.UP, ItemStack.EMPTY);
            m.put("button.press", String.valueOf(ears.heard()));
        });
        helper.setBlock(new BlockPos(6, 0, 5), Blocks.STONE);
        helper.setBlock(new BlockPos(6, 1, 5), b("own_plate"));
        Pig[] pig = new Pig[1];
        helper.runAfterDelay(2, () -> {
            ears.heard();
            pig[0] = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(6, 1, 5));
        });
        helper.runAfterDelay(30, () -> {
            m.put("button.release+plate.on", String.valueOf(ears.heard()));
            pig[0].discard();
        });
        helper.runAfterDelay(70, () -> {
            m.put("plate.off", String.valueOf(ears.heard()));
            ears.close();
            R.put("X11", m);
            helper.succeed();
        });
    }
}
