package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.common.ClientboundShowDialogPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.AbstractBedBlock;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Script API 1.7 (ADR 0111 D3 to D6 and their amendment after B525; plan B533) through {@code msm/msm_test/script/api17.js}:
 * the four Mixin events and the two sleep events, each fired by the real path (a click on a crafting table's result, a
 * shift-click and the inventory's grid; items picked up from the ground, whole and in part; bread eaten to the end and a
 * steak left half eaten; a night in a bed, left by the leave-bed button; an advancement by its own trigger and by {@code /advancement}),
 * and the game rule, statistic and dialog members through action handlers. The players are {@link RecordingPlayers} named
 * {@code b533...}, the only players api17.js logs for, so other tests' crafting and meals never count here.
 */
public class MsmScriptApi17GameTest {
    private static final String SCRIPT = "msm_test:api17: ";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static ScriptHost host(GameTestHelper helper) {
        ScriptHost host = ScriptHost.current();
        helper.assertTrue(host != null, "no ScriptHost: SERVER_STARTING did not load scripts");
        return host;
    }

    /** Every api17.js log line that starts with {@code start} and names {@code player}, without the script prefix and start. */
    static List<String> lines(GameTestHelper helper, String start, ServerPlayer player) {
        String prefix = SCRIPT + start + player.getName().getString() + " ";
        List<String> out = new ArrayList<>();
        for (String line : host(helper).recentLogs()) {
            if (line.startsWith(prefix)) {
                out.add(line.substring(prefix.length()));
            }
        }
        return out;
    }

    /** The last api17.js log line that starts with {@code start}, without the prefix and start, or null. */
    static String logged(GameTestHelper helper, String start) {
        List<String> logs = host(helper).recentLogs();
        for (int i = logs.size() - 1; i >= 0; i--) {
            if (logs.get(i).startsWith(SCRIPT + start)) {
                return logs.get(i).substring(SCRIPT.length() + start.length());
            }
        }
        return null;
    }

    private static void eq(GameTestHelper helper, Object actual, Object expected, String message) {
        helper.assertTrue(Objects.equals(actual, expected), message + ": expected <" + expected + ">, got <" + actual + ">");
    }

    private static void run(GameTestHelper helper, String handler, ServerPlayer player) {
        ScriptHost host = host(helper);
        host.action(id("api17"), id("api17"), id(handler), EventContext.forItem(helper.getLevel(), player));
        helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.startsWith("script msm_test:api17:")),
                "api17.js errors: " + host.handlerErrors());
    }

    /** A right-click on the top face of {@code rel} with an empty hand, through {@code ServerPlayerGameMode.useItemOn}. */
    private static void use(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false);
        player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND), InteractionHand.MAIN_HAND, hit);
    }

    private static ItemEntity drop(GameTestHelper helper, Vec3 rel, ItemStack stack) {
        Vec3 at = helper.absoluteVec(rel);
        ItemEntity item = new ItemEntity(helper.getLevel(), at.x, at.y, at.z, stack);
        item.setNoPickUpDelay();
        item.setDeltaMovement(Vec3.ZERO);
        helper.getLevel().addFreshEntity(item);
        return item;
    }

    // ---- item.crafted ---------------------------------------------------------------------------------

    /**
     * A click on a crafting table's result crafts once (4 planks from a log), a shift-click with three logs crafts three
     * times (three events of 4), the inventory's 2 by 2 grid crafts once; each event's item carries the number made.
     */
    @GameTest
    public void craftingThroughTheMenusFiresItemCrafted(GameTestHelper helper) {
        BlockPos table = new BlockPos(2, 1, 2);
        helper.setBlock(table, Blocks.CRAFTING_TABLE);
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533craft", new Vec3(3.5, 1, 3.5), GameType.SURVIVAL)) {
            ServerPlayer p = r.player();
            use(helper, p, table);
            AbstractContainerMenu menu = p.containerMenu;
            helper.assertTrue(menu != p.inventoryMenu, "the crafting table did not open");
            menu.getSlot(1).set(new ItemStack(Items.OAK_LOG, 1));
            menu.clicked(0, 0, ContainerInput.PICKUP, p);
            eq(helper, lines(helper, "crafted ", p), List.of("minecraft:oak_planks 4 4 true"), "a click on the result");
            menu.setCarried(ItemStack.EMPTY);
            menu.getSlot(1).set(new ItemStack(Items.OAK_LOG, 3));
            menu.clicked(0, 0, ContainerInput.QUICK_MOVE, p);
            eq(helper, p.getInventory().countItem(Items.OAK_PLANKS), 12, "planks in the inventory after the shift-click");
            eq(helper, lines(helper, "crafted ", p).size(), 4, "one event per craft of the shift-click: " + lines(helper, "crafted ", p));
            p.closeContainer();
            AbstractContainerMenu inventory = p.inventoryMenu;
            inventory.getSlot(1).set(new ItemStack(Items.OAK_PLANKS, 1));
            inventory.getSlot(3).set(new ItemStack(Items.OAK_PLANKS, 1));
            inventory.clicked(0, 0, ContainerInput.PICKUP, p);
            eq(helper, lines(helper, "crafted ", p).getLast(), "minecraft:stick 4 4 true", "the inventory grid");
            eq(helper, lines(helper, "crafted ", p).size(), 5, "events in all");
            inventory.setCarried(ItemStack.EMPTY);
        }
        helper.succeed();
    }

    // ---- item.picked_up -------------------------------------------------------------------------------

    /**
     * Five emeralds picked up from the ground are one event of 5; with every slot full but one holding 61 diamonds, three of
     * five diamonds go in and the event says 3 (two stay on the ground).
     */
    @GameTest(maxTicks = 60)
    public void pickingUpFromTheGroundFiresItemPickedUp(GameTestHelper helper) {
        Vec3 spot = new Vec3(2.5, 1, 2.5);
        RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533pick", spot, GameType.SURVIVAL);
        ServerPlayer p = r.player();
        ItemEntity whole = drop(helper, spot, new ItemStack(Items.EMERALD, 5));
        ItemEntity[] part = new ItemEntity[1];
        for (int t = 1; t <= 10; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(12, () -> {
            eq(helper, whole.isRemoved(), true, "the emeralds were picked up");
            eq(helper, lines(helper, "picked ", p), List.of("minecraft:emerald 5 5"), "a whole pickup");
            for (int i = 0; i < 36; i++) {
                p.getInventory().setItem(i, new ItemStack(Items.STONE, 64));
            }
            p.getInventory().setItem(0, new ItemStack(Items.DIAMOND, 61));
            part[0] = drop(helper, spot, new ItemStack(Items.DIAMOND, 5));
        });
        for (int t = 13; t <= 24; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(26, () -> {
            eq(helper, part[0].isRemoved() ? 0 : part[0].getItem().getCount(), 2, "diamonds left on the ground");
            eq(helper, lines(helper, "picked ", p), List.of("minecraft:emerald 5 5", "minecraft:diamond 3 3"), "a partial pickup");
            part[0].discard();
            r.close();
            helper.succeed();
        });
    }

    // ---- player.ate -----------------------------------------------------------------------------------

    /** Bread eaten to the end fires {@code player.ate} once (one bread, the stack had two); a steak left half eaten fires nothing. */
    @GameTest(maxTicks = 120)
    public void aFinishedMealFiresPlayerAteAndAnInterruptedOneDoesNot(GameTestHelper helper) {
        RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533eat", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL);
        ServerPlayer p = r.player();
        p.getFoodData().setFoodLevel(6);
        helper.runAfterDelay(1, () -> {
            p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BREAD, 2));
            p.gameMode.useItem(p, helper.getLevel(), p.getItemInHand(InteractionHand.MAIN_HAND), InteractionHand.MAIN_HAND);
            helper.assertTrue(p.isUsingItem(), "not eating");
        });
        for (int t = 2; t <= 45; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(46, () -> {
            eq(helper, p.getItemInHand(InteractionHand.MAIN_HAND).getCount(), 1, "one bread eaten");
            eq(helper, lines(helper, "ate ", p), List.of("minecraft:bread 1"), "the bread");
            p.getFoodData().setFoodLevel(6);
            p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.COOKED_BEEF));
            p.gameMode.useItem(p, helper.getLevel(), p.getItemInHand(InteractionHand.MAIN_HAND), InteractionHand.MAIN_HAND);
        });
        for (int t = 47; t <= 56; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(57, p::releaseUsingItem);
        for (int t = 58; t <= 100; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(102, () -> {
            eq(helper, p.getItemInHand(InteractionHand.MAIN_HAND).getCount(), 1, "the steak is still there");
            eq(helper, lines(helper, "ate ", p), List.of("minecraft:bread 1"), "nothing for the steak");
            r.close();
            helper.succeed();
        });
    }

    // ---- player.slept, player.woke --------------------------------------------------------------------

    /**
     * At midnight (the test environment {@code b533_night}, its own batch) a player lies down in a bed through
     * {@code useItemOn}: {@code player.slept} at the bed's head. The player sleeps for 110 ticks (past vanilla's "slept long
     * enough") and gets up with the leave-bed button ({@code stopSleepInBed(false, true)}): {@code player.woke} at the bed.
     * {@code players_sleeping_percentage} is 101 for the test (no skip), then put back: on 26.4 a skipped night ran the
     * server through thousands of ticks at once, which pushed other tests' script lines out of the log (seen while writing
     * B533; a skipped night on 26.3 fired {@code player.woke} the same way).
     */
    @GameTest(environment = "msm_runtime_gametest:b533_night", maxTicks = 160)
    public void sleepingInABedFiresSleptAndWoke(GameTestHelper helper) {
        BlockPos foot = new BlockPos(2, 1, 2);
        BlockPos head = foot.south();
        BlockState footState = Blocks.BED.red().defaultBlockState().setValue(AbstractBedBlock.FACING, Direction.SOUTH)
                .setValue(AbstractBedBlock.PART, BedPart.FOOT);
        helper.setBlock(foot, footState);
        helper.setBlock(head, footState.setValue(AbstractBedBlock.PART, BedPart.HEAD));
        RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533sleep", new Vec3(1.5, 1, 2.5), GameType.SURVIVAL);
        ServerPlayer p = r.player();
        BlockPos abs = helper.absolutePos(head);
        String at = abs.getX() + " " + abs.getY() + " " + abs.getZ();
        // Above 100 no number of sleepers skips the night (vanilla's rule), so the test never fast-forwards the server.
        var rules = helper.getLevel().getServer().getGameRules();
        int percentage = rules.get(GameRules.PLAYERS_SLEEPING_PERCENTAGE);
        rules.set(GameRules.PLAYERS_SLEEPING_PERCENTAGE, 101, helper.getLevel().getServer());
        helper.runAfterDelay(2, () -> {
            use(helper, p, head);
            helper.assertTrue(p.isSleeping(), "the player did not lie down (is it night?)");
            eq(helper, lines(helper, "slept ", p), List.of(at), "player.slept at the bed");
        });
        for (int t = 3; t <= 112; t++) {
            helper.runAfterDelay(t, () -> {
                if (p.isSleeping()) {
                    p.doTick();
                }
            });
        }
        helper.runAfterDelay(114, () -> {
            rules.set(GameRules.PLAYERS_SLEEPING_PERCENTAGE, percentage, helper.getLevel().getServer());
            helper.assertTrue(p.isSleeping(), "the player got up by itself");
            eq(helper, lines(helper, "woke ", p), List.of(), "no player.woke while asleep");
            p.stopSleepInBed(false, true);
            helper.assertFalse(p.isSleeping(), "still in bed");
            eq(helper, lines(helper, "woke ", p), List.of(at), "player.woke at the bed");
            eq(helper, lines(helper, "slept ", p), List.of(at), "player.slept once");
            r.close();
            helper.succeed();
        });
    }

    // ---- player.advancement ---------------------------------------------------------------------------

    /** The test's own advancements a player completed, as api17.js logged them (vanilla ones left out). */
    private static List<String> ours(GameTestHelper helper, ServerPlayer player) {
        return lines(helper, "advancement ", player).stream().filter(l -> l.startsWith("msm_test:")).toList();
    }

    /** A heart of the sea in the inventory completes {@code msm_test:b533/heart} by its own trigger, once. */
    @GameTest(maxTicks = 30)
    public void anAdvancementByItsTriggerFiresPlayerAdvancement(GameTestHelper helper) {
        RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533heart", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL);
        ServerPlayer p = r.player();
        helper.runAfterDelay(1, () -> p.getInventory().add(new ItemStack(Items.HEART_OF_THE_SEA)));
        for (int t = 2; t <= 6; t++) {
            helper.runAfterDelay(t, p::doTick);
        }
        helper.runAfterDelay(8, () -> {
            helper.assertTrue(p.getAdvancements().getOrStartProgress(helper.getLevel().getServer().getAdvancements().get(id("b533/heart")))
                    .isDone(), "the advancement is not done");
            eq(helper, ours(helper, p), List.of("msm_test:b533/heart"), "player.advancement by the trigger");
            r.close();
            helper.succeed();
        });
    }

    /**
     * {@code /advancement grant} completes an advancement once (granting it again fires nothing); revoking and granting
     * again fires again; a recipe advancement ({@code minecraft:recipes/...}) fires nothing.
     */
    @GameTest
    public void anAdvancementByCommandFiresOnce(GameTestHelper helper) {
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533grant", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL)) {
            ServerPlayer p = r.player();
            CommandSourceStack source = p.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER).withSuppressedOutput();
            var commands = helper.getLevel().getServer().getCommands();
            commands.performPrefixedCommand(source, "advancement grant @s only msm_test:b533/granted");
            commands.performPrefixedCommand(source, "advancement grant @s only msm_test:b533/granted");
            eq(helper, ours(helper, p), List.of("msm_test:b533/granted"), "granted once");
            commands.performPrefixedCommand(source, "advancement revoke @s only msm_test:b533/granted");
            commands.performPrefixedCommand(source, "advancement grant @s only msm_test:b533/granted");
            eq(helper, ours(helper, p), List.of("msm_test:b533/granted", "msm_test:b533/granted"), "granted again after a revoke");
            Identifier recipe = Identifier.withDefaultNamespace("recipes/building_blocks/oak_planks");
            helper.assertTrue(helper.getLevel().getServer().getAdvancements().get(recipe) != null, "no recipe advancement " + recipe);
            commands.performPrefixedCommand(source, "advancement grant @s only " + recipe);
            helper.assertTrue(p.getAdvancements().getOrStartProgress(helper.getLevel().getServer().getAdvancements().get(recipe)).isDone(),
                    "the recipe advancement was not granted");
            helper.assertTrue(lines(helper, "advancement ", p).stream().noneMatch(l -> l.contains("recipes/")),
                    "a recipe advancement fired: " + lines(helper, "advancement ", p));
        }
        helper.succeed();
    }

    // ---- members --------------------------------------------------------------------------------------

    /**
     * {@code gameRule} reads a boolean and a number rule, {@code setGameRule} sets them (a number rounded down and kept in
     * the rule's range), a value of the other kind or an invalid id is a TypeError, an unknown id reads {@code undefined};
     * vanilla rules read too.
     */
    @GameTest
    public void gameRulesFromAScript(GameTestHelper helper) {
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533rules", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL)) {
            run(helper, "api17_rules", r.player());
        }
        eq(helper, logged(helper, "rules "), "false 2 setFlag:ok true setLevel:ok 4 high:ok 5 low:ok 1 flagNumber:TypeError levelBool:TypeError"
                + " levelNaN:TypeError unknown:ok invalid:TypeError boolean number", "game rules");
        helper.succeed();
    }

    /**
     * {@code stat} reads 0 for a statistic never counted; {@code addStat} adds (rounded down) and returns the new value, a
     * negative amount takes away but never below 0; vanilla's {@code minecraft:jump} reads; an unknown id and an infinite
     * amount are TypeErrors.
     */
    @GameTest
    public void statisticsFromAScript(GameTestHelper helper) {
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533stats", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL)) {
            run(helper, "api17_stats", r.player());
            eq(helper, logged(helper, "stats "), "0 add:3 addFraction:5 5 takeAway:4 belowZero:0 again:7 vanilla:0 unknown:TypeError"
                    + " infinite:TypeError", "statistics");
        }
        helper.succeed();
    }

    /**
     * {@code ActionEvent.args}: a {@code run_script} action inside a project command's own event sees the command's
     * arguments ({@code CommandEvents.withArgs}, as {@code MsmCommands.run} runs the event); any other action sees
     * {@code undefined}.
     */
    @GameTest
    public void anActionInACommandsEventSeesItsArgs(GameTestHelper helper) {
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533args", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL)) {
            com.google.gson.JsonObject args = new com.google.gson.JsonObject();
            args.addProperty("power", 3);
            args.addProperty("dim", "minecraft:the_nether");
            dev.mcsupermods.runtime.scripting.CommandEvents.withArgs(args, () -> run(helper, "api17_args", r.player()));
            eq(helper, logged(helper, "args b533args "), "{\"power\":3,\"dim\":\"minecraft:the_nether\"}", "inside the command's event");
            run(helper, "api17_args", r.player());
            eq(helper, logged(helper, "args b533args "), "undefined", "any other action");
        }
        helper.succeed();
    }

    /** {@code openDialog} sends the dialog to the player's screen; an unknown dialog is {@code false}, an invalid id a TypeError. */
    @GameTest
    public void openDialogShowsTheDialog(GameTestHelper helper) {
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533dialog", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL)) {
            run(helper, "api17_dialog", r.player());
            eq(helper, logged(helper, "dialog "), "open:true missing:false invalid:TypeError", "openDialog");
            List<String> shown = r.connection().take().stream().filter(ClientboundShowDialogPacket.class::isInstance)
                    .map(packet -> ((ClientboundShowDialogPacket) packet).dialog().unwrapKey().map(k -> k.identifier().toString()).orElse("inline"))
                    .toList();
            eq(helper, shown, List.of("msm_test:b533_hello"), "dialogs sent to the player");
        }
        helper.succeed();
    }
}
