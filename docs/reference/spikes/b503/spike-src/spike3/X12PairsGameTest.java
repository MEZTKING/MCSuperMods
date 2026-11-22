package dev.mcsupermods.runtime.gametest.spike3;

import static dev.mcsupermods.runtime.gametest.spike3.B503Help.R;
import static dev.mcsupermods.runtime.gametest.spike3.B503Mod.b;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/**
 * B503 spike (throwaway), X12: strip, flatten and till pairs for vanilla blocks through one {@code UseBlockCallback}
 * (both versions), overriding vanilla's own pairs; honeycomb on a vanilla block through the callback and, for another
 * vanilla block, through 26.3's {@code OxidizableBlocksRegistry} (26.4: the vanilla map); a next stage for vanilla's
 * oxidized copper; burning odds for vanilla stone (26.3 Fabric registry, 26.4 reflection), against cobblestone.
 */
public class X12PairsGameTest {
    static String tool(GameTestHelper helper, ServerPlayer player, BlockPos rel, Block start, ItemStack stack) {
        helper.setBlock(rel, start);
        var r = B503Help.use(helper, player, rel, Direction.UP, stack);
        ItemStack after = player.getItemInHand(InteractionHand.MAIN_HAND);
        return r + " -> " + B503Help.id(helper.getBlockState(rel).getBlock()) + " damage " + after.getDamageValue() + " count " + after.getCount();
    }

    @GameTest(maxTicks = 40)
    public void x12Tools(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("init", new ArrayList<>(B503Mod.INIT.stream().filter(l -> l.startsWith("pairs") || l.startsWith("route")).toList()));
        ServerPlayer player = B503Help.player(helper, new BlockPos(1, 2, 0), GameType.SURVIVAL);
        BlockPos at = new BlockPos(1, 1, 2);
        R.section("X12.tools", () -> {
            m.put("stone+axe", tool(helper, player, at, Blocks.STONE, new ItemStack(Items.IRON_AXE)));
            m.put("stone+shovel", tool(helper, player, at, Blocks.STONE, new ItemStack(Items.IRON_SHOVEL)));
            m.put("stone+hoe", tool(helper, player, at, Blocks.STONE, new ItemStack(Items.IRON_HOE)));
            m.put("oakLog+axe(override vanilla)", tool(helper, player, at, Blocks.OAK_LOG, new ItemStack(Items.IRON_AXE)));
            m.put("dirt+shovel(override vanilla)", tool(helper, player, at, Blocks.DIRT, new ItemStack(Items.IRON_SHOVEL)));
            m.put("dirt+hoe(override vanilla)", tool(helper, player, at, Blocks.DIRT, new ItemStack(Items.IRON_HOE)));
            m.put("grass+shovel(control, vanilla)", tool(helper, player, at, Blocks.GRASS_BLOCK, new ItemStack(Items.IRON_SHOVEL)));
            m.put("birchLog+axe(control, vanilla)", tool(helper, player, at, Blocks.BIRCH_LOG, new ItemStack(Items.IRON_AXE)));
            m.put("stone+honeycomb(callback)", tool(helper, player, at, Blocks.STONE, new ItemStack(Items.HONEYCOMB, 2)));
            m.put("tuff+honeycomb(registry)", tool(helper, player, at, Blocks.TUFF, new ItemStack(Items.HONEYCOMB, 2)));
            m.put("copper+honeycomb(control)", tool(helper, player, at, Blocks.COPPER_BLOCK.weathering().unaffected(), new ItemStack(Items.HONEYCOMB, 2)));
        });
        R.put("X12.tools", m);
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void x12AgeAndBurn(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        ServerLevel level = helper.getLevel();
        R.section("X12.age", () -> {
            BlockState ox = Blocks.COPPER_BLOCK.weathering().oxidized().defaultBlockState();
            m.put("oxidized.isRandomlyTicking", ox.isRandomlyTicking());
            BlockPos abs = helper.absolutePos(new BlockPos(1, 1, 1));
            RandomSource random = RandomSource.create(7L);
            int k = 0;
            String into = "unchanged";
            for (; k < 20000; k++) {
                level.setBlock(abs, ox, 2 | 16);
                ox.randomTick(level, abs, random);
                if (level.getBlockState(abs) != ox) {
                    into = B503Help.name(level.getBlockState(abs));
                    break;
                }
            }
            m.put("oxidized.randomTicks", k);
            m.put("oxidized.into", into);
        });
        R.section("X12.burn", () -> {
            for (Block target : new Block[] {Blocks.STONE, Blocks.COBBLESTONE}) {
                BlockPos below = target == Blocks.STONE ? new BlockPos(3, 1, 3) : new BlockPos(5, 1, 3);
                BlockPos fire = below.above();
                helper.setBlock(below, target);
                RandomSource random = RandomSource.create(11L);
                int k = 0;
                for (; k < 3000; k++) {
                    if (!helper.getBlockState(below).is(target)) {
                        break;
                    }
                    if (!helper.getBlockState(fire).is(Blocks.FIRE)) {
                        helper.setBlock(fire, Blocks.FIRE);
                    }
                    helper.getBlockState(fire).tick(level, helper.absolutePos(fire), random);
                }
                m.put("burn." + B503Help.id(target), "fire ticks " + k + " -> " + B503Help.id(helper.getBlockState(below).getBlock()));
            }
        });
        R.put("X12.ageAndBurn", m);
        helper.succeed();
    }
}
