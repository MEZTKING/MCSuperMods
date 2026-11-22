package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity of the script {@code msm_sample_mobs:mob_notes} in {@code fixtures/sample-mobs-and-commands} (Script
 * API 1.7, ADR 0111 D3 to D6; B541), on content jars only: scripts are not part of the Java project eject (ADR 0033)
 * and neither are the Mixin events of ADR 0111 D3 (limit N23), so this class has its own name, which the ejected run's
 * filter {@code sample_mobs_and_commands_parity_test_*} does not match. Black box: a {@link ParityEars} player picks
 * up, eats, crafts through a crafting table's menu, is granted an advancement and types {@code /tally}; the lines the
 * script sends it are read from its chat packets (each line goes to the event's own player, so other tests' players
 * never show up here).
 *
 * <p>Not covered: {@code player.slept} and {@code player.woke} (they need a night; the runtime's GameTest
 * {@code MsmScriptApi17GameTest} and the fixture's README check them).
 */
public class SampleMobsAndCommandsScriptParityTest {
    /** How the script's lines start (the fixture's golden test, {@code SCRIPT_TEXT}). */
    private static final java.util.regex.Pattern SCRIPT_LINE = java.util.regex.Pattern.compile(
            "You picked up |You ate |You crafted |Sleep well\\.|Good morning\\.|Well done: |Tally: ");

    private static List<String> chat(List<Packet<?>> packets) {
        List<String> out = new ArrayList<>();
        for (Packet<?> p : packets) {
            // Only the script's lines: the chat also carries joins and the GameTest server's results.
            if (p instanceof ClientboundSystemChatPacket c && !c.overlay() && SCRIPT_LINE.matcher(c.content().getString()).lookingAt()) {
                out.add(c.content().getString());
            }
        }
        return out;
    }

    /** The script's lines starting with {@code prefix} (eating, for example, can also complete an advancement). */
    private static List<String> lines(ParityEars ears, String prefix) {
        return chat(ears.packets()).stream().filter(line -> line.startsWith(prefix)).toList();
    }

    private static ParityEars join(GameTestHelper helper, String name) {
        SampleMobsAndCommandsParityTest.floor(helper);
        ParityEars ears = SampleVillagersParityTest.player(helper, new BlockPos(2, 1, 2), name);
        ears.packets();
        return ears;
    }

    @GameTest(maxTicks = 40)
    public void pickingUpEmeraldsIsOneLine(GameTestHelper helper) {
        ParityEars ears = join(helper, "msm-mc-pick");
        ServerPlayer p = ears.player;
        Vec3 at = p.position();
        ItemEntity item = new ItemEntity(helper.getLevel(), at.x, at.y, at.z, new ItemStack(Items.EMERALD, 3));
        item.setNoPickUpDelay();
        item.setDeltaMovement(Vec3.ZERO);
        helper.getLevel().addFreshEntity(item);
        for (int t = 1; t <= 10; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(12, () -> {
            helper.assertTrue(item.isRemoved(), "the emeralds were not picked up");
            helper.assertValueEqual(lines(ears, "You picked up"), List.of("You picked up 3 minecraft:emerald."), "the script's lines");
            ears.close();
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 80)
    public void breadEatenToTheEndIsOneLine(GameTestHelper helper) {
        ParityEars ears = join(helper, "msm-mc-eat");
        ServerPlayer p = ears.player;
        p.getFoodData().setFoodLevel(6);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BREAD, 2));
        p.gameMode.useItem(p, helper.getLevel(), p.getMainHandItem(), InteractionHand.MAIN_HAND);
        helper.assertTrue(p.isUsingItem(), "not eating");
        for (int t = 1; t <= 45; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(47, () -> {
            helper.assertValueEqual(p.getMainHandItem().getCount(), 1, "bread left");
            helper.assertValueEqual(lines(ears, "You ate"), List.of("You ate minecraft:bread."), "the script's lines");
            ears.close();
            helper.succeed();
        });
    }

    @GameTest
    public void craftingPlanksAtATableIsOneLine(GameTestHelper helper) {
        try (ParityEars ears = join(helper, "msm-mc-craft")) {
            ServerPlayer p = ears.player;
            BlockPos table = new BlockPos(4, 1, 4);
            helper.setBlock(table, Blocks.CRAFTING_TABLE);
            p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            BlockPos abs = helper.absolutePos(table);
            p.gameMode.useItemOn(p, helper.getLevel(), ItemStack.EMPTY, InteractionHand.MAIN_HAND,
                    new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false));
            AbstractContainerMenu menu = p.containerMenu;
            helper.assertTrue(menu != p.inventoryMenu, "the crafting table did not open");
            menu.getSlot(1).set(new ItemStack(Items.OAK_LOG, 1));
            menu.clicked(0, 0, ContainerInput.PICKUP, p);
            menu.setCarried(ItemStack.EMPTY);
            p.closeContainer();
            helper.assertValueEqual(lines(ears, "You crafted"), List.of("You crafted 4 minecraft:oak_planks."), "the script's lines");
        }
        helper.succeed();
    }

    @GameTest
    public void anAdvancementGrantedIsOneLine(GameTestHelper helper) {
        try (ParityEars ears = join(helper, "msm-mc-advance")) {
            CommandSourceStack op = ears.player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER);
            SampleMobsAndCommandsParityTest.command(op, "advancement grant @s only minecraft:story/root");
            helper.assertValueEqual(lines(ears, "Well done: minecraft:story"), List.of("Well done: minecraft:story/root."), "the script's lines");
        }
        helper.succeed();
    }

    @GameTest
    public void tallyReadsItsArgumentsTheGameRulesAndAddsToAStatistic(GameTestHelper helper) {
        try (ParityEars ears = join(helper, "msm-mc-tally")) {
            ServerPlayer p = ears.player;
            CommandSourceStack plain = p.createCommandSourceStack().withPermission(LevelBasedPermissionSet.ALL);
            helper.assertTrue(SampleMobsAndCommandsParityTest.command(plain, "tally 3 red minecraft:speed creative 1..5 minecraft:pig") > 0,
                    "/tally failed");
            helper.assertValueEqual(SampleMobsAndCommandsParityTest.command(plain, "tally 65 red minecraft:speed creative 1..5 minecraft:pig"), 0,
                    "/tally above its maximum count was accepted");
            helper.assertValueEqual(lines(ears, "Tally: "), List.of(
                    "Tally: 3 red minecraft:speed creative minecraft:pig; calm false, bonus 2, carp caught 3."), "the script's lines");
            var carp = BuiltInRegistries.CUSTOM_STAT.getValue(SampleMobsAndCommandsParityTest.id("carp_caught"));
            helper.assertValueEqual(p.getStats().getValue(Stats.CUSTOM.get(carp)), 3, "carp_caught after /tally");
        }
        helper.succeed();
    }
}
