package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.MsmItem;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.resources.ResourceKey;

/** Registry-freeze spike (ADR 0024): definitions from msm/msm_spike/ in this test mod. */
public class MsmSpikeGameTest {
    private static final Identifier ORE = Identifier.fromNamespaceAndPath("msm_spike", "glow_ore");
    private static final Identifier SHARD = Identifier.fromNamespaceAndPath("msm_spike", "shard");

    @GameTest
    public void definitionsAreRegistered(GameTestHelper helper) {
        // msm_test/ ships six deliberately broken files (MsmRuntimeGameTest, MsmGearGameTest, MsmBlockTypeGameTest); nothing
        // else may fail,
        // except the missing-GeckoLib errors of a run with -PwithoutGeckolib (MsmEntityGameTest).
        helper.assertTrue(MsmRuntime.report().errors().stream()
                .allMatch(e -> e.contains("partly_broken.json") || e.contains("future_format.json") || e.contains("armed_helmet.json")
                        || e.contains("enchanted_blade.json") || e.contains("type_stairs_unknown_base.json")
                        || e.contains("type_stairs_redstone.json")
                        || e.contains("needs the mod 'geckolib'")),
                "load errors: " + MsmRuntime.report().errors());
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(ORE), "block " + ORE + " not registered");
        Block block = BuiltInRegistries.BLOCK.getValue(ORE);
        helper.assertTrue(block instanceof MsmBlock, "block is not an MsmBlock: " + block);

        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(ORE), "block item " + ORE + " not registered");
        Item blockItem = BuiltInRegistries.ITEM.getValue(ORE);
        helper.assertTrue(blockItem instanceof BlockItem bi && bi.getBlock() == block, "block item does not place the block");
        helper.assertValueEqual(blockItem.getDescriptionId(), "block.msm_spike.glow_ore", "block item description id");

        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(SHARD), "item " + SHARD + " not registered");
        Item shard = BuiltInRegistries.ITEM.getValue(SHARD);
        helper.assertTrue(shard instanceof MsmItem, "item is not an MsmItem: " + shard);
        helper.assertValueEqual(shard.getDefaultMaxStackSize(), 16, "shard max stack size");
        helper.assertValueEqual(shard.components().get(DataComponents.RARITY), Rarity.RARE, "shard rarity");
        helper.assertValueEqual(shard.getDescriptionId(), "item.msm_spike.shard", "shard description id");
        MsmRuntime.LOGGER.info("[msm_runtime] spike: {} and {} found in BuiltInRegistries", ORE, SHARD);
        helper.succeed();
    }

    // The runtime's job is the block's light emission, asserted below. Propagated block light in
    // the world is vanilla's light engine, which in the GameTest server sometimes never lights the
    // test area (0 after 100 ticks in two of six clean builds), so it is not asserted here.
    @GameTest
    public void placedBlockHasLightAndHardness(GameTestHelper helper) {
        Block block = BuiltInRegistries.BLOCK.getValue(ORE);
        BlockPos pos = new BlockPos(1, 2, 1);
        helper.setBlock(pos, block);
        helper.assertBlockPresent(block, pos);
        BlockState state = helper.getBlockState(pos);
        BlockPos abs = helper.absolutePos(pos);
        helper.assertValueEqual(state.getLightEmission(), 4, "light emission");
        helper.assertValueEqual(state.getDestroySpeed(helper.getLevel(), abs), 3.0f, "hardness");
        helper.assertValueEqual(block.getExplosionResistance(), 3.0f, "resistance");
        helper.assertTrue(state.requiresCorrectToolForDrops(), "requires_tool not applied");
        MsmRuntime.LOGGER.info("[msm_runtime] spike: placed {} has light emission {}, hardness {}", ORE,
                state.getLightEmission(), state.getDestroySpeed(helper.getLevel(), abs));
        helper.succeed();
    }

    @GameTest
    public void interactionRunsEvent(GameTestHelper helper) {
        Block block = BuiltInRegistries.BLOCK.getValue(ORE);
        Item shard = BuiltInRegistries.ITEM.getValue(SHARD);
        BlockPos pos = new BlockPos(1, 2, 1);
        helper.setBlock(pos, block);
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        helper.assertTrue(!player.getInventory().contains(s -> s.is(shard)), "player starts with a shard");
        helper.useBlock(pos, player);
        int count = 0;
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            if (player.getInventory().getItem(i).is(shard)) {
                count += player.getInventory().getItem(i).getCount();
            }
        }
        helper.assertValueEqual(count, 2, "shards given by msm:on_interact -> give_item");
        MsmRuntime.LOGGER.info("[msm_runtime] spike: on_interact gave {} x {}", count, SHARD);
        helper.succeed();
    }

    /** The test mod has no pack.mcmeta: its data/ must still load (tags and loot tables are reloadable data). */
    @GameTest
    public void modDataLoadsWithoutPackMcmeta(GameTestHelper helper) {
        Block block = BuiltInRegistries.BLOCK.getValue(ORE);
        helper.assertTrue(block.defaultBlockState().is(BlockTags.MINEABLE_WITH_PICKAXE), "mineable/pickaxe tag from the mod jar not applied");
        ResourceKey<LootTable> key = block.getLootTable().orElseThrow();
        helper.assertValueEqual(key.identifier().toString(), "msm_spike:blocks/glow_ore", "default loot table key");
        LootTable table = helper.getLevel().getServer().reloadableRegistries().getLootTable(key);
        helper.assertTrue(table != LootTable.EMPTY, "loot table " + key.identifier() + " from the mod jar not loaded");
        MsmRuntime.LOGGER.info("[msm_runtime] spike: mod data/ loaded without pack.mcmeta (tag and loot table {})", key.identifier());
        helper.succeed();
    }
}
