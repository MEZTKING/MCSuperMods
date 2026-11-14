package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.registry.container.MsmStorageBlockEntity;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Container;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ComparatorBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.ComparatorBlockEntity;

/**
 * Script API 1.2 (ADR 0076 D5, B317): {@code World.getContainer} and {@code Container} through the {@code run_script}
 * handlers of {@code msm/msm_test/script/container_api.js}, called directly on the running host with {@code e.pos} at
 * the block under test. Covers a vanilla chest (read, write, stack sizes, {@code add} filling then spilling, the
 * leftover when full, comparators updated by a write, argument errors), an MSM crate that keeps its contents (refuses
 * container items through {@code add} and {@code set}), an MSM container with {@code hoppers: false} ({@code add}
 * ignores faces), stone (no container) and a container used after its block is gone. The machine input case waits for
 * machines (B316).
 */
public class MsmContainerScriptGameTest {
    private static final BlockPos AT = new BlockPos(2, 2, 2);
    private static final String LOG = "msm_test:container_api: ";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static ScriptHost host(GameTestHelper helper) {
        ScriptHost host = ScriptHost.current();
        helper.assertTrue(host != null, "no ScriptHost: SERVER_STARTING did not load scripts");
        return host;
    }

    /** Calls the handler {@code msm_test:<handler>} with {@code e.pos} at {@code rel}. */
    private static void call(GameTestHelper helper, ScriptHost host, String handler, BlockPos rel) {
        host.action(id("container_api"), id("container_api"), id(handler),
                EventContext.forBlock(helper.getLevel(), helper.absolutePos(rel), null));
    }

    /** The last line the script logged that starts with {@code prefix}, without the script's name. */
    private static String last(GameTestHelper helper, ScriptHost host, String prefix) {
        List<String> logs = host.recentLogs();
        for (int i = logs.size() - 1; i >= 0; i--) {
            if (logs.get(i).startsWith(LOG + prefix)) {
                return logs.get(i).substring(LOG.length());
            }
        }
        helper.fail("nothing logged starting with '" + prefix + "'; recent: "
                + logs.subList(Math.max(0, logs.size() - 8), logs.size()));
        return null;
    }

    private static void assertNoErrors(GameTestHelper helper, ScriptHost host) {
        helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.startsWith("script msm_test:container_api:")),
                "container_api.js errors: " + host.handlerErrors());
    }

    private static Container container(GameTestHelper helper, BlockPos rel) {
        BlockEntity be = helper.getLevel().getBlockEntity(helper.absolutePos(rel));
        helper.assertTrue(be instanceof Container, "no container at " + rel + ": " + be);
        return (Container) be;
    }

    private static void assertStack(GameTestHelper helper, Container c, int slot, ItemStack expected) {
        ItemStack actual = c.getItem(slot);
        helper.assertTrue(ItemStack.matches(actual, expected), "slot " + slot + ": " + actual + ", expected " + expected);
    }

    /**
     * A vanilla chest: {@code size}, {@code set} (capped at the stack size), {@code get} copies, {@code count},
     * {@code add} into a new slot and over two slots, emptying a slot, and range and type errors; the chest's own
     * slots hold what the script wrote, and a comparator beside it sees the write.
     */
    @GameTest
    public void readsAndWritesAVanillaChest(GameTestHelper helper) {
        ScriptHost host = host(helper);
        ServerLevel level = helper.getLevel();
        helper.setBlock(AT.west().below(), Blocks.STONE);
        helper.setBlock(AT, Blocks.CHEST);
        helper.setBlock(AT.west(), Blocks.COMPARATOR.defaultBlockState().setValue(ComparatorBlock.FACING, Direction.EAST));
        call(helper, host, "container_chest", AT);
        assertNoErrors(helper, host);
        helper.assertValueEqual(last(helper, host, "chest "), "chest 27 true true minecraft:diamondx1 minecraft:cobblestonex64 - "
                + "64 0 - minecraft:cobblestonex10 - minecraft:stickx64 minecraft:stickx36 true - 10 minecraft:diamond "
                + "minecraft:emeraldx1 27:RangeError neg:RangeError frac:RangeError name:RangeError unknownItem:TypeError "
                + "badSpec:TypeError", "chest");
        Container chest = container(helper, AT);
        assertStack(helper, chest, 0, new ItemStack(Items.EMERALD));
        assertStack(helper, chest, 1, ItemStack.EMPTY);
        assertStack(helper, chest, 2, new ItemStack(Items.COBBLESTONE, 10));
        assertStack(helper, chest, 3, new ItemStack(Items.STICK, 64));
        assertStack(helper, chest, 4, new ItemStack(Items.STICK, 36));
        int expected = AbstractContainerMenu.getRedstoneSignalFromContainer(chest);
        helper.assertTrue(expected > 0, "signal 0 with items");
        helper.succeedWhen(() -> helper.assertValueEqual(
                ((ComparatorBlockEntity) level.getBlockEntity(helper.absolutePos(AT.west()))).getOutputSignal(), expected,
                "comparator beside the chest after the script's writes"));
    }

    /** {@code add} into a full chest tops up the one short stack and returns the rest; an item with no room comes back whole. */
    @GameTest
    public void addReturnsTheLeftoverWhenFull(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.CHEST);
        call(helper, host, "container_full", AT);
        assertNoErrors(helper, host);
        helper.assertValueEqual(last(helper, host, "full "),
                "full minecraft:stonex6 minecraft:stonex64 minecraft:dirtx1 1728 0", "full chest");
        Container chest = container(helper, AT);
        for (int i = 0; i < chest.getContainerSize(); i++) {
            assertStack(helper, chest, i, new ItemStack(Items.STONE, 64));
        }
        helper.succeed();
    }

    /**
     * An MSM crate that keeps its contents (B314's {@code container_crate}): {@code add} spills 70 iron over two slots,
     * a shulker box and the crate's own item come back from {@code add}, {@code set} refuses a shulker box and changes
     * nothing, and takes a plain item.
     */
    @GameTest
    public void keepContentsCrateRefusesContainerItems(GameTestHelper helper) {
        ScriptHost host = host(helper);
        Block crate = BuiltInRegistries.BLOCK.getValue(id("container_crate"));
        helper.setBlock(AT, crate);
        helper.assertTrue(helper.getLevel().getBlockEntity(helper.absolutePos(AT)) instanceof MsmStorageBlockEntity s
                && s.spec().keepContents(), "container_crate is not a keep-contents storage block");
        call(helper, host, "container_crate", AT);
        assertNoErrors(helper, host);
        helper.assertValueEqual(last(helper, host, "crate "), "crate 27 - minecraft:iron_ingotx64 minecraft:iron_ingotx6 "
                + "minecraft:shulker_boxx1 false - msm_test:container_cratex1 true minecraft:gold_ingotx1 70", "crate");
        Container c = container(helper, AT);
        assertStack(helper, c, 0, new ItemStack(Items.IRON_INGOT, 64));
        assertStack(helper, c, 1, new ItemStack(Items.IRON_INGOT, 6));
        assertStack(helper, c, 5, new ItemStack(Items.GOLD_INGOT));
        for (int i = 0; i < c.getContainerSize(); i++) {
            ItemStack s = c.getItem(i);
            helper.assertTrue(s.isEmpty() || s.getItem().canFitInsideContainerItems(), "container item in the crate at " + i + ": " + s);
        }
        helper.succeed();
    }

    /** An MSM container with {@code hoppers: false} still takes items from a script ({@code add} ignores faces). */
    @GameTest
    public void addIgnoresHopperFaces(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, BuiltInRegistries.BLOCK.getValue(id("container_sealed")));
        MsmStorageBlockEntity sealed = (MsmStorageBlockEntity) container(helper, AT);
        helper.assertFalse(sealed.spec().hoppers(), "container_sealed takes hoppers");
        call(helper, host, "container_sealed", AT);
        assertNoErrors(helper, host);
        helper.assertValueEqual(last(helper, host, "sealed "), "sealed " + sealed.getContainerSize() + " - minecraft:coalx5",
                "sealed");
        assertStack(helper, sealed, 0, new ItemStack(Items.COAL, 5));
        helper.succeed();
    }

    /** Stone and air have no container: {@code getContainer} gives {@code undefined}. */
    @GameTest
    public void stoneHasNoContainer(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.STONE);
        helper.setBlock(AT.above(), Blocks.AIR);
        call(helper, host, "container_none", AT);
        assertNoErrors(helper, host);
        helper.assertValueEqual(last(helper, host, "none "), "none true true", "stone");
        helper.succeed();
    }

    /** A {@code Container} kept by a script after its chest is removed: {@code size} still reads, use is an {@code Error}. */
    @GameTest
    public void containerAfterItsBlockIsGoneIsAnError(GameTestHelper helper) {
        ScriptHost host = host(helper);
        helper.setBlock(AT, Blocks.CHEST);
        call(helper, host, "container_keep", AT);
        helper.assertValueEqual(last(helper, host, "keep "), "keep minecraft:applex1", "keep");
        helper.setBlock(AT, Blocks.AIR);
        call(helper, host, "container_stale", AT);
        assertNoErrors(helper, host);
        helper.assertValueEqual(last(helper, host, "stale "), "stale 27 get:Error add:Error", "stale");
        helper.succeed();
    }
}
