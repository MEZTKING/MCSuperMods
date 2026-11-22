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
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FlowerPotBlock;

/**
 * B503 spike (throwaway), X4: what a pot built on vanilla's {@code FlowerPotBlock} does to vanilla's shared plant map
 * ({@code pot_air} built with no plant, {@code pot_poppy} with vanilla's poppy, registered after vanilla's pots), and
 * whether a project pot with its own map ({@code own_pot}) leaves vanilla's pot alone.
 */
public class X04PotGameTest {
    static String use(GameTestHelper helper, ServerPlayer player, BlockPos rel, ItemStack stack) {
        String result = String.valueOf(B503Help.use(helper, player, rel, Direction.UP, stack));
        return result + " -> " + B503Help.id(helper.getBlockState(rel).getBlock()) + " hand " + player.getMainHandItem()
                + " inv " + inv(player);
    }

    static String inv(ServerPlayer player) {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack s = player.getInventory().getItem(i);
            if (!s.isEmpty()) {
                b.append(s).append(' ');
            }
        }
        player.getInventory().clearContent();
        return b.append(']').toString();
    }

    @GameTest(maxTicks = 40)
    public void x4Pots(GameTestHelper helper) {
        ServerPlayer player = B503Help.player(helper, new BlockPos(1, 1, 0), GameType.SURVIVAL);
        Map<String, Object> m = new LinkedHashMap<>();
        BlockPos at = new BlockPos(1, 1, 2);
        helper.setBlock(at.below(), Blocks.STONE);
        R.section("X4", () -> {
            helper.setBlock(at, Blocks.FLOWER_POT);
            m.put("vanillaPot+poppy", use(helper, player, at, new ItemStack(Items.POPPY)));
            m.put("vanillaPottedPoppy.emptyHand", use(helper, player, at, ItemStack.EMPTY));
            helper.setBlock(at, Blocks.FLOWER_POT);
            m.put("vanillaPot+projectFlower", use(helper, player, at, new ItemStack(B503Mod.I.get("flower"))));
            m.put("vanillaPotProjectFlower.emptyHand", use(helper, player, at, ItemStack.EMPTY));
            helper.setBlock(at, Blocks.POTTED_POPPY);
            m.put("vanillaPottedPoppy(set).emptyHand", use(helper, player, at, ItemStack.EMPTY));
            helper.setBlock(at, b("pot_air"));
            m.put("potAir+poppy", use(helper, player, at, new ItemStack(Items.POPPY)));
            helper.setBlock(at, b("pot_air"));
            m.put("potAir+projectFlower", use(helper, player, at, new ItemStack(B503Mod.I.get("flower"))));
            helper.setBlock(at, b("pot_poppy"));
            m.put("potPoppy.emptyHand", use(helper, player, at, ItemStack.EMPTY));
            m.put("vanillaPottedPoppy.getPotted", B503Help.id(((FlowerPotBlock) Blocks.POTTED_POPPY).getPotted()));
            m.put("potPoppy.getPotted", B503Help.id(((FlowerPotBlock) b("pot_poppy")).getPotted()));
            m.put("potAir.getPotted", B503Help.id(((FlowerPotBlock) b("pot_air")).getPotted()));
            m.put("vanillaPot.getPotted", B503Help.id(((FlowerPotBlock) Blocks.FLOWER_POT).getPotted()));
            m.put("potAir.cloneItem", b("pot_air").defaultBlockState().getCloneItemStack(helper.getLevel(), helper.absolutePos(at), false).toString());
            // Our own pot with its own map.
            helper.setBlock(at, b("own_pot"));
            m.put("ownPot+poppy", use(helper, player, at, new ItemStack(Items.POPPY)));
            m.put("ownPotPoppy.emptyHand", use(helper, player, at, ItemStack.EMPTY));
            m.put("ownPot+projectFlower", use(helper, player, at, new ItemStack(B503Mod.I.get("flower"))));
            m.put("ownPot+dandelion(not listed)", use(helper, player, at, new ItemStack(Items.DANDELION)));
            m.put("ownPotFlower.emptyHand", use(helper, player, at, ItemStack.EMPTY));
            helper.setBlock(at, Blocks.FLOWER_POT);
            m.put("vanillaPot+dandelion(after own pot)", use(helper, player, at, new ItemStack(Items.DANDELION)));
        });
        R.put("X4.pots", m);
        helper.succeed();
    }

    static Block air() {
        return Blocks.AIR;
    }
}
