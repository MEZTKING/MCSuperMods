package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.animal.cow.Cow;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity of the vanilla blocks sample's scripts (B462b), on content jars only: the Script API 1.6 script
 * {@code msm_sample_vanilla_blocks:script_api_1_6} (B455) and the rules of {@code vanilla_blocks_rules} that need a
 * script (B458) are not part of the Java project eject (ADR 0033, ADR 0096 D6), so this class has its own name and
 * filter ({@code --gametest-filter msm_parity_tests:sample_vanilla_blocks_script_*}), which the ejected run's {@code
 * sample_vanilla_blocks_parity_test_*} does not match. The plain rule on {@code /greet} (a cookie) is ejected and is
 * checked in {@link SampleVanillaBlocksParityTest}.
 *
 * <p>Black box, as {@link SampleVanillaBlocksParityTest}: placing through {@code ServerPlayerGameMode.useItemOn} (which
 * reaches {@code BlockItem.place}, where the runtime's placing Mixin fires {@code block.place}), uses through
 * {@code useItemOn} and {@code useItem} (Fabric API's {@code UseBlockCallback} and {@code UseItemCallback}), an entity
 * use through Fabric API's {@code UseEntityCallback} (as {@code SampleScriptParityTest} does), stepping through
 * {@code Block.stepOn}, a real creeper's explosion, commands run as a player, and the chat lines a {@link ParityEars}
 * player receives.
 *
 * <ul>
 *   <li>{@code block.place}: bedrock is not placed, the stack is kept and the player is told; stone is placed.</li>
 *   <li>Rules "No cobwebs" ({@code any_block_placed}, {@code stop_placing}): a cobweb is not placed, the player is
 *       told; the sea lamp is placed.</li>
 *   <li>{@code world.explosion} and the rule "Creepers break no blocks" ({@code caused_by} a creeper,
 *       {@code keep_blocks_safe}): a creeper's blast hurts a pig but breaks no block; the player nearby is told.</li>
 *   <li>{@code command}: {@code /greet} and {@code /hiya} each get the script's line with the command's name
 *       ({@code greet}); {@code Entity.ride} puts a player who uses a cow with an empty hand on it (not with an item in
 *       hand), and {@code Entity.dismount} takes it off at {@code /greet}.</li>
 *   <li>{@code World.itemsNear}: using the sea lamp with an empty hand removes rotten flesh and turns cobblestone into as
 *       much stone within 4 blocks; dirt nearby and cobblestone further away stay.</li>
 *   <li>{@code ItemRef.contents}: a plain use of the satchel names what it holds in slot order, or that it is empty;
 *       sneaking opens it and says nothing.</li>
 *   <li>Rules "The conveyor carries you east" ({@code block_stepped_on}, {@code is_facing} east of here, teleport to
 *       {@code in_front_of_here}): a player stepping on a conveyor that faces east is moved one block east; one that
 *       faces north does not move it.</li>
 *   <li>Rules "Kits are noted" ({@code command_used} on {@code /kit}, which runs a function, so a {@code command}
 *       listener): one line per run, also per {@code execute as} fork.</li>
 * </ul>
 *
 * <p>The script's {@code World.explode} at {@code server.started} has no readback inside a GameTest; the CI server check
 * of the sample proves it (the explosion Mixin applies at a plain start, B455).
 */
public class SampleVanillaBlocksScriptParityTest {
    private static final String NAMESPACE = SampleVanillaBlocksParityTest.NAMESPACE;
    private static final String ARENA = "msm_parity_tests:arena";

    private static final String BEDROCK_TEXT = "Bedrock stays where the world put it.";
    private static final String CREEPER_TEXT = "The creeper's blast left the blocks alone.";
    private static final String HOP_OFF_TEXT = "You hop off to say hello.";
    private static final String COW_TEXT = "Moo. Say /greet to get off.";
    private static final String SATCHEL_EMPTY_TEXT = "The satchel is empty.";
    private static final String KIT_RULE_TEXT = "Kit handed out.";
    private static final String COBWEB_TEXT = "Cobwebs are not welcome here.";

    private static Block block(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(SampleVanillaBlocksParityTest.id(path)), "block " + path + " is not registered");
        return BuiltInRegistries.BLOCK.getValue(SampleVanillaBlocksParityTest.id(path));
    }

    private static Item item(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(SampleVanillaBlocksParityTest.id(path)), "item " + path + " is not registered");
        return BuiltInRegistries.ITEM.getValue(SampleVanillaBlocksParityTest.id(path));
    }

    /** Runs a command with {@code source} and returns its result (0 when it failed or did not parse). */
    private static int command(CommandSourceStack source, String command) {
        AtomicInteger result = new AtomicInteger();
        source.getServer().getCommands().performPrefixedCommand(source.withCallback((success, value) ->
                result.set(success ? Math.max(value, 1) : 0)), command);
        return result.get();
    }

    private static String coords(GameTestHelper helper, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        return abs.getX() + " " + abs.getY() + " " + abs.getZ();
    }

    private static void setblock(GameTestHelper helper, BlockPos rel, String blockAndState) {
        ServerLevel level = helper.getLevel();
        CommandSourceStack source = level.getServer().createCommandSourceStack().withLevel(level).withSuppressedOutput();
        helper.assertTrue(command(source, "setblock " + coords(helper, rel) + " " + blockAndState) > 0, "setblock " + blockAndState + " failed");
    }

    /** Clears the arena's inside above its stone floor (y 1 to 3). */
    private static void clear(GameTestHelper helper) {
        for (int x = 1; x <= 9; x++) {
            for (int z = 1; z <= 9; z++) {
                for (int y = 1; y <= 3; y++) {
                    helper.setBlock(x, y, z, Blocks.AIR);
                }
            }
        }
    }

    /** The player clicks the top face of the block at {@code rel} with {@code stack} through the game mode, as a click does. */
    private static InteractionResult click(GameTestHelper helper, ServerPlayer player, ItemStack stack, BlockPos rel) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos abs = helper.absolutePos(rel);
        Vec3 at = Vec3.atCenterOf(abs).add(0, 0.5, 0);
        return player.gameMode.useItemOn(player, helper.getLevel(), stack, InteractionHand.MAIN_HAND, new BlockHitResult(at, Direction.UP, abs, false));
    }

    /** The system chat lines (not the action bar) in {@code packets}. */
    private static List<String> chat(List<Packet<?>> packets) {
        List<String> out = new ArrayList<>();
        for (Packet<?> p : packets) {
            if (p instanceof ClientboundSystemChatPacket c && !c.overlay()) {
                out.add(c.content().getString());
            }
        }
        return out;
    }

    private static long times(List<String> lines, String line) {
        return lines.stream().filter(line::equals).count();
    }

    // Placing (block.place, any_block_placed)

    /**
     * The script cancels placing bedrock: the floor's top stays air, the survival stack keeps its three blocks, and the
     * player is told; stone from the same player is placed.
     */
    @GameTest(structure = ARENA)
    public void theScriptCancelsPlacingBedrock(GameTestHelper helper) {
        clear(helper);
        try (ParityEars user = new ParityEars(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "msm-svbs-bedrock")) {
            ServerPlayer player = user.player;
            BlockPos floor = new BlockPos(5, 0, 5);
            user.packets();
            ItemStack bedrock = new ItemStack(Items.BEDROCK, 3);
            InteractionResult result = click(helper, player, bedrock, floor);
            helper.assertFalse(result.consumesAction(), "placing bedrock " + result);
            helper.assertTrue(helper.getBlockState(floor.above()).isAir(), "bedrock was placed: " + helper.getBlockState(floor.above()));
            helper.assertValueEqual(player.getMainHandItem().getCount(), 3, "bedrock left in the hand");
            helper.assertValueEqual(times(chat(user.packets()), BEDROCK_TEXT), 1L, "the bedrock line");
            click(helper, player, new ItemStack(Items.STONE, 3), floor);
            helper.assertTrue(helper.getBlockState(floor.above()).is(Blocks.STONE), "stone was not placed: " + helper.getBlockState(floor.above()));
            helper.assertValueEqual(times(chat(user.packets()), BEDROCK_TEXT), 0L, "the bedrock line for stone");
        }
        helper.succeed();
    }

    /** The rule "No cobwebs" stops placing a cobweb and tells the player; the sea lamp is placed. */
    @GameTest(structure = ARENA)
    public void theRuleStopsPlacingCobwebs(GameTestHelper helper) {
        clear(helper);
        try (ParityEars user = new ParityEars(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "msm-svbs-cobweb")) {
            ServerPlayer player = user.player;
            BlockPos floor = new BlockPos(5, 0, 5);
            user.packets();
            click(helper, player, new ItemStack(Items.COBWEB, 2), floor);
            helper.assertTrue(helper.getBlockState(floor.above()).isAir(), "a cobweb was placed: " + helper.getBlockState(floor.above()));
            helper.assertValueEqual(player.getMainHandItem().getCount(), 2, "cobwebs left in the hand");
            helper.assertValueEqual(times(chat(user.packets()), COBWEB_TEXT), 1L, "the cobweb line");
            click(helper, player, new ItemStack(item(helper, "sea_lamp")), floor);
            helper.assertTrue(helper.getBlockState(floor.above()).is(block(helper, "sea_lamp")), "the sea lamp was not placed");
            helper.assertValueEqual(times(chat(user.packets()), COBWEB_TEXT), 0L, "the cobweb line for the sea lamp");
        }
        helper.succeed();
    }

    // Explosions (world.explosion, explosion)

    /**
     * A creeper's blast beside glass and tin: both stay (the script's {@code keepBlocks} and the rule's "keep the blocks
     * safe"), a pig beside it is still hurt, and a creative player nearby is told by the script.
     */
    @GameTest(structure = ARENA, maxTicks = 100)
    public void aCreepersBlastKeepsTheBlocks(GameTestHelper helper) {
        clear(helper);
        BlockPos at = new BlockPos(5, 1, 5);
        BlockPos glass = new BlockPos(5, 1, 7);
        BlockPos tin = new BlockPos(7, 1, 5);
        helper.setBlock(glass, Blocks.GLASS);
        setblock(helper, tin, NAMESPACE + ":tin");
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(4, 1, 5));
        float health = pig.getHealth();
        ParityEars watcher = new ParityEars(helper, new BlockPos(1, 1, 1), GameType.CREATIVE, "msm-svbs-creeper");
        watcher.packets();
        Creeper creeper = (Creeper) helper.spawnWithNoFreeWill(EntityTypes.CREEPER, at);
        creeper.ignite();
        List<String> lines = new ArrayList<>();
        helper.succeedWhen(() -> {
            lines.addAll(chat(watcher.packets()));
            helper.assertFalse(creeper.isAlive(), "the creeper has not exploded yet");
            helper.assertTrue(helper.getBlockState(glass).is(Blocks.GLASS), "the glass broke: " + helper.getBlockState(glass));
            helper.assertTrue(helper.getBlockState(tin).is(block(helper, "tin")), "the tin broke: " + helper.getBlockState(tin));
            helper.assertTrue(helper.getBlockState(new BlockPos(5, 0, 5)).is(Blocks.STONE), "the floor broke");
            helper.assertTrue(!pig.isAlive() || pig.getHealth() < health, "the pig was not hurt");
            helper.assertValueEqual(times(lines, CREEPER_TEXT), 1L, "the creeper line " + lines);
            watcher.close();
            pig.discard();
        });
    }

    // Commands, riding (command, Entity.ride, Entity.dismount)

    /**
     * Using a cow with an item in hand does nothing; with an empty hand the player gets on it and is told; {@code /greet}
     * takes it off first ("You hop off") and answers with the command's name; {@code /hiya} answers with the same name
     * ({@code CommandEvent.name} is the command's own name, also when an alias is typed).
     */
    @GameTest(structure = ARENA)
    public void aCowCarriesThePlayerUntilGreet(GameTestHelper helper) {
        clear(helper);
        Mob mob = helper.spawnWithNoFreeWill(EntityTypes.COW, new BlockPos(5, 1, 5));
        helper.assertTrue(mob instanceof Cow, "not a cow: " + mob);
        try (ParityEars user = new ParityEars(helper, new BlockPos(4, 1, 5), GameType.SURVIVAL, "msm-svbs-ride")) {
            ServerPlayer player = user.player;
            user.packets();
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STICK));
            UseEntityCallback.EVENT.invoker().interact(player, helper.getLevel(), InteractionHand.MAIN_HAND, mob, new EntityHitResult(mob));
            helper.assertTrue(player.getVehicle() == null, "a player holding a stick got on the cow");
            player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            UseEntityCallback.EVENT.invoker().interact(player, helper.getLevel(), InteractionHand.MAIN_HAND, mob, new EntityHitResult(mob));
            helper.assertTrue(player.getVehicle() == mob, "the player did not get on the cow: " + player.getVehicle());
            helper.assertValueEqual(times(chat(user.packets()), COW_TEXT), 1L, "the cow line");
            CommandSourceStack source = player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.ALL);
            helper.assertTrue(command(source, "greet") > 0, "/greet failed");
            helper.assertTrue(player.getVehicle() == null, "/greet did not take the player off the cow");
            List<String> lines = chat(user.packets());
            helper.assertValueEqual(times(lines, HOP_OFF_TEXT), 1L, "the hop-off line " + lines);
            helper.assertValueEqual(times(lines, "The script heard /greet."), 1L, "the script's /greet line " + lines);
            helper.assertTrue(command(source, "hiya") > 0, "/hiya failed");
            lines = chat(user.packets());
            // The event's name is the command's own name, also when an alias is typed.
            helper.assertValueEqual(times(lines, "The script heard /greet."), 1L, "the script's /hiya line " + lines);
            helper.assertValueEqual(times(lines, HOP_OFF_TEXT), 0L, "a hop-off line while on foot " + lines);
        }
        mob.discard();
        helper.succeed();
    }

    /**
     * {@code /kit} runs a function, so its rule listens to the {@code command} event: one "Kit handed out." per run, to
     * the player who ran it, and one per {@code execute as} fork, to each forked player.
     */
    @GameTest(structure = ARENA)
    public void theKitRuleNotesEveryRun(GameTestHelper helper) {
        try (ParityEars a = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-svbs-kit-a");
                ParityEars b = new ParityEars(helper, new BlockPos(5, 1, 5), GameType.SURVIVAL, "msm-svbs-kit-b")) {
            CommandSourceStack op = a.player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER);
            a.packets();
            b.packets();
            helper.assertTrue(command(op, "kit @s 2") > 0, "/kit failed");
            helper.assertValueEqual(times(chat(a.packets()), KIT_RULE_TEXT), 1L, "the kit line for one run");
            helper.assertValueEqual(times(chat(b.packets()), KIT_RULE_TEXT), 0L, "the kit line for a player who did not run it");
            a.player.addTag("msm_svbs_fork");
            b.player.addTag("msm_svbs_fork");
            command(op, "execute as @a[tag=msm_svbs_fork] run kit @s 1");
            helper.assertValueEqual(times(chat(a.packets()), KIT_RULE_TEXT), 1L, "the first fork's kit line");
            helper.assertValueEqual(times(chat(b.packets()), KIT_RULE_TEXT), 1L, "the second fork's kit line");
        }
        helper.succeed();
    }

    // Items lying around (World.itemsNear, DroppedItem.remove and setItem)

    private static ItemEntity drop(GameTestHelper helper, BlockPos rel, ItemStack stack) {
        Vec3 at = helper.absoluteVec(Vec3.atBottomCenterOf(rel));
        ItemEntity entity = new ItemEntity(helper.getLevel(), at.x, at.y, at.z, stack, 0, 0, 0);
        helper.getLevel().addFreshEntity(entity);
        return entity;
    }

    /**
     * Using the sea lamp with an empty hand: rotten flesh within 4 blocks is removed, cobblestone there becomes the same
     * count of stone, dirt there and cobblestone 6 blocks away stay; the player is told the counts. With an item in hand
     * nothing happens.
     */
    @GameTest(structure = ARENA)
    public void theSeaLampTidiesTheItemsNearby(GameTestHelper helper) {
        clear(helper);
        BlockPos lamp = new BlockPos(5, 1, 5);
        setblock(helper, lamp, NAMESPACE + ":sea_lamp");
        try (ParityEars user = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-svbs-lamp")) {
            ItemEntity flesh = drop(helper, new BlockPos(5, 1, 7), new ItemStack(Items.ROTTEN_FLESH, 3));
            ItemEntity cobble = drop(helper, new BlockPos(7, 1, 5), new ItemStack(Items.COBBLESTONE, 5));
            ItemEntity dirt = drop(helper, new BlockPos(3, 1, 5), new ItemStack(Items.DIRT, 2));
            ItemEntity farCobble = drop(helper, new BlockPos(5, 1, 11), new ItemStack(Items.COBBLESTONE, 4));
            user.packets();
            click(helper, user.player, new ItemStack(Items.STICK), lamp);
            helper.assertTrue(flesh.isAlive(), "the rotten flesh went with a stick in hand");
            helper.assertValueEqual(chat(user.packets()).stream().filter(l -> l.startsWith("The sea lamp tidied")).count(), 0L,
                    "a tidy line with a stick in hand");
            click(helper, user.player, ItemStack.EMPTY, lamp);
            helper.assertFalse(flesh.isAlive(), "the rotten flesh is still there");
            helper.assertTrue(cobble.isAlive() && cobble.getItem().is(Items.STONE), "the cobblestone became " + cobble.getItem());
            helper.assertValueEqual(cobble.getItem().getCount(), 5, "stone from five cobblestone");
            helper.assertTrue(dirt.isAlive() && dirt.getItem().is(Items.DIRT) && dirt.getItem().getCount() == 2, "the dirt changed: " + dirt.getItem());
            helper.assertTrue(farCobble.isAlive() && farCobble.getItem().is(Items.COBBLESTONE), "the far cobblestone changed: " + farCobble.getItem());
            List<String> lines = chat(user.packets());
            helper.assertValueEqual(times(lines, "The sea lamp tidied 1 and polished 1 stack(s)."), 1L, "the tidy line " + lines);
            for (ItemEntity entity : List.of(cobble, dirt, farCobble)) {
                entity.discard();
            }
        }
        helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(lamp)).inflate(8)).forEach(ItemEntity::discard);
        helper.succeed();
    }

    // What a bag holds (ItemRef.contents)

    /**
     * A plain use of the satchel names its contents in slot order ("5 minecraft:diamond, 2 minecraft:stick"), an empty
     * one says so, and sneak and use opens it without a line.
     */
    @GameTest(structure = ARENA)
    public void theSatchelSaysWhatItHolds(GameTestHelper helper) {
        try (ParityEars user = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-svbs-satchel")) {
            ServerPlayer player = user.player;
            player.getInventory().clearContent();
            ItemStack satchel = new ItemStack(item(helper, "satchel"));
            satchel.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(List.of(new ItemStack(Items.DIAMOND, 5),
                    ItemStack.EMPTY, new ItemStack(Items.STICK, 2))));
            player.getInventory().setItem(0, satchel);
            player.getInventory().setSelectedSlot(0);
            user.packets();
            player.gameMode.useItem(player, player.level(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
            List<String> lines = chat(user.packets());
            helper.assertValueEqual(times(lines, "The satchel holds 5 minecraft:diamond, 2 minecraft:stick."), 1L, "the satchel line " + lines);
            helper.assertTrue(player.containerMenu == player.inventoryMenu, "a plain use opened the satchel");
            player.setShiftKeyDown(true);
            player.gameMode.useItem(player, player.level(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
            player.setShiftKeyDown(false);
            helper.assertTrue(player.containerMenu != player.inventoryMenu, "sneak and use did not open the satchel");
            player.closeContainer();
            lines = chat(user.packets());
            helper.assertValueEqual(lines.stream().filter(l -> l.startsWith("The satchel")).count(), 0L, "a satchel line while sneaking " + lines);
            player.getInventory().setItem(0, new ItemStack(item(helper, "satchel")));
            player.gameMode.useItem(player, player.level(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
            lines = chat(user.packets());
            helper.assertValueEqual(times(lines, SATCHEL_EMPTY_TEXT), 1L, "the empty satchel line " + lines);
        }
        helper.succeed();
    }

    // The conveyor (block_stepped_on, is_facing, in_front_of_here)

    /**
     * A player stepping on the conveyor facing east is moved to the block east of it; on the conveyor facing north it
     * stays where it is.
     */
    @GameTest(structure = ARENA)
    public void theConveyorCarriesPlayersEastOnlyWhileFacingEast(GameTestHelper helper) {
        clear(helper);
        Block conveyor = block(helper, "conveyor");
        BlockPos east = new BlockPos(3, 1, 3);
        BlockPos north = new BlockPos(3, 1, 7);
        setblock(helper, east, NAMESPACE + ":conveyor[facing=east]");
        setblock(helper, north, NAMESPACE + ":conveyor[facing=north]");
        try (ParityEars user = new ParityEars(helper, east.above(), GameType.SURVIVAL, "msm-svbs-conveyor")) {
            ServerPlayer player = user.player;
            BlockState state = helper.getBlockState(east);
            conveyor.stepOn(helper.getLevel(), helper.absolutePos(east), state, player);
            helper.assertValueEqual(player.blockPosition(), helper.absolutePos(east.east()), "where the east conveyor put the player");
            player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(north.above())));
            BlockPos before = player.blockPosition();
            conveyor.stepOn(helper.getLevel(), helper.absolutePos(north), helper.getBlockState(north), player);
            helper.assertValueEqual(player.blockPosition(), before, "where the north conveyor left the player");
        }
        helper.succeed();
    }
}
