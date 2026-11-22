package dev.mcsupermods.parity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;

/**
 * Behaviour parity of the rules for vanilla blocks in {@code fixtures/sample-plants-and-storage} ({@code farm_rules},
 * ADR 0105 D4; B520), on the content jars and, since B541, on the 26.3 ejected jar too: the Java project eject writes the
 * rules since B537 ({@code ModVanillaBlockRules}), so both runs use the filter {@code sample_plants_and_storage_*}, which
 * matches this class and {@link SamplePlantsAndStorageParityTest}. Vanilla and Fabric API only.
 *
 * <p>Covered: an axe strips mossy cobblestone and mossy stone bricks, a shovel flattens mud into packed mud, a hoe tills a
 * moss block into dirt and drops a moss carpet, vanilla's own pairs are untouched, and brown mushroom blocks burn where
 * cobblestone does not.
 */
public class SamplePlantsAndStorageRulesParityTest {
    private static final BlockPos AT = new BlockPos(3, 1, 3);

    private static void tool(GameTestHelper helper, ServerPlayer player, Block start, ItemStack stack, Block expected) {
        helper.setBlock(AT, start);
        helper.setBlock(AT.above(), Blocks.AIR);
        SamplePlantsAndStorageParityTest.use(helper, player, stack, AT, Direction.UP);
        Block now = helper.getBlockState(AT).getBlock();
        helper.assertTrue(now == expected, BuiltInRegistries.BLOCK.getKey(start) + " with " + stack + " became "
                + BuiltInRegistries.BLOCK.getKey(now) + ", expected " + BuiltInRegistries.BLOCK.getKey(expected));
    }

    @GameTest
    public void anAxeShovelAndHoeChangeVanillaBlocksByTheRules(GameTestHelper helper) {
        SamplePlantsAndStorageParityTest.floor(helper);
        ServerPlayer player = SamplePlantsAndStorageParityTest.player(helper, GameType.SURVIVAL);
        tool(helper, player, Blocks.MOSSY_COBBLESTONE, new ItemStack(Items.IRON_AXE), Blocks.COBBLESTONE);
        tool(helper, player, Blocks.MOSSY_STONE_BRICKS, new ItemStack(Items.IRON_AXE), Blocks.STONE_BRICKS);
        tool(helper, player, Blocks.MUD, new ItemStack(Items.IRON_SHOVEL), Blocks.PACKED_MUD);
        SamplePlantsAndStorageParityTest.takeItems(helper, AT, Items.MOSS_CARPET);
        tool(helper, player, Blocks.MOSS_BLOCK, new ItemStack(Items.IRON_HOE), Blocks.DIRT);
        helper.assertValueEqual(SamplePlantsAndStorageParityTest.takeItems(helper, AT, Items.MOSS_CARPET), 1, "moss carpets dropped");
        // Vanilla's own pairs are untouched.
        tool(helper, player, Blocks.DIRT, new ItemStack(Items.IRON_HOE), Blocks.FARMLAND);
        tool(helper, player, Blocks.OAK_LOG, new ItemStack(Items.IRON_AXE), Blocks.STRIPPED_OAK_LOG);
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void mushroomBlocksBurnAndCobblestoneDoesNot(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        for (Block target : new Block[] {Blocks.BROWN_MUSHROOM_BLOCK, Blocks.COBBLESTONE}) {
            BlockPos below = target == Blocks.COBBLESTONE ? new BlockPos(5, 1, 5) : new BlockPos(1, 1, 1);
            BlockPos fire = below.above();
            helper.setBlock(below.below(), Blocks.STONE);
            helper.setBlock(below, target);
            RandomSource random = RandomSource.create(11L);
            int k = 0;
            for (; k < 3000 && helper.getBlockState(below).is(target); k++) {
                if (!helper.getBlockState(fire).is(Blocks.FIRE)) {
                    helper.setBlock(fire, Blocks.FIRE);
                }
                helper.getBlockState(fire).tick(level, helper.absolutePos(fire), random);
            }
            boolean burnt = !helper.getBlockState(below).is(target);
            helper.assertValueEqual(burnt, target == Blocks.BROWN_MUSHROOM_BLOCK, BuiltInRegistries.BLOCK.getKey(target) + " burnt after " + k
                    + " fire ticks");
            helper.setBlock(fire, Blocks.AIR);
        }
        helper.succeed();
    }
}
