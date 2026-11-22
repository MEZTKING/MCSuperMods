package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * Script API 1.6 (ADR 0096 D4, ADR 0095 D5; plan B455) through {@code msm/msm_test/script/api16.js}: {@code Entity.ride}
 * and {@code dismount} (with {@code vehicle} and {@code passengers} of Script API 1.5 on a ridden mob),
 * {@code World.itemsNear} with the {@code DroppedItem} members, {@code ItemRef.contents} of a bag and a bundle, and the
 * {@code command} event (run through {@code Commands.performPrefixedCommand}, as typed in chat). The Mixin events
 * {@code block.place} and {@code world.explosion} are in {@link MsmMixinEventGameTest}.
 */
public class MsmScriptApi16GameTest {
    private static final String SCRIPT = "msm_test:api16: ";
    private static final Vec3 MID = new Vec3(3.5, 1, 3.5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static ScriptHost host(GameTestHelper helper) {
        ScriptHost host = ScriptHost.current();
        helper.assertTrue(host != null, "no ScriptHost: SERVER_STARTING did not load scripts");
        return host;
    }

    private static void run(GameTestHelper helper, String handler, EventContext ctx) {
        ScriptHost host = host(helper);
        host.action(id("api16"), id("api16"), id(handler), ctx);
        helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.startsWith("script msm_test:api16:")),
                "api16.js errors: " + host.handlerErrors());
    }

    /** The last {@code msm.log} line of api16.js that starts with {@code start}, without the script prefix and start. */
    static String logged(GameTestHelper helper, String start) {
        List<String> logs = ScriptLogs.of(host(helper));
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

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.snapTo(helper.absoluteVec(MID));
        player.setGameMode(GameType.SURVIVAL);
        return player;
    }

    private static void remove(GameTestHelper helper, ServerPlayer... players) {
        for (ServerPlayer player : players) {
            player.stopRiding();
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
    }

    // ---- riding ----------------------------------------------------------------------------------------

    /**
     * {@code ride} puts a zombie on a pig ({@code vehicle} and {@code passengers} see it), refuses riding itself and a
     * loop, {@code dismount} gets it off once; right after getting off, vanilla's boarding cooldown refuses a new ride.
     */
    @GameTest
    public void rideAndDismountAMobWithVehicleAndPassengers(GameTestHelper helper) {
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, MID);
        Mob zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, MID);
        run(helper, "api16_ride", EventContext.forEntity(helper.getLevel(), pig, null, zombie));
        eq(helper, logged(helper, "ride "), "ride:true minecraft:pig 1 true true again:true self:false loop:false dismount:true true 0"
                + " twice:false soon:false notEntity:TypeError missing:TypeError", "ride");
        helper.assertFalse(zombie.isPassenger(), "the zombie got off");
        helper.succeed();
    }

    /** A ride that took: the game sees the zombie on the pig after the script returns. */
    @GameTest
    public void rideReachesTheGame(GameTestHelper helper) {
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, MID);
        Mob zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, MID);
        run(helper, "api16_ride_only", EventContext.forEntity(helper.getLevel(), pig, null, zombie));
        helper.assertTrue(zombie.getVehicle() == pig && pig.getPassengers().equals(List.of(zombie)), "the zombie rides the pig");
        zombie.stopRiding();
        helper.succeed();
    }

    /** A mob that rides something and is told to ride another gets off the first and on the second. */
    @GameTest
    public void rideWhileRidingSwitchesMounts(GameTestHelper helper) {
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, MID);
        Mob zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, MID);
        helper.assertTrue(zombie.startRiding(pig), "the zombie rides the pig");
        run(helper, "api16_switch", EventContext.forEntity(helper.getLevel(), pig, null, zombie));
        eq(helper, logged(helper, "switch "), "true minecraft:cow 0 1", "switch");
        helper.succeed();
    }

    /** Nothing rides a player (as vanilla's {@code /ride}); a player rides a mob and gets off it. */
    @GameTest
    public void playersRideMobsButNotPlayers(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        ServerPlayer other = player(helper);
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, MID);
        run(helper, "api16_players", EventContext.forEntity(helper.getLevel(), pig, player, other));
        eq(helper, logged(helper, "players "), "onPlayer:false onMob:true true 1 mobOnPlayer:false off:true", "players");
        helper.assertFalse(other.isVehicle(), "nobody rides the other player");
        remove(helper, player, other);
        helper.succeed();
    }

    // ---- dropped items ---------------------------------------------------------------------------------

    private static ItemEntity drop(GameTestHelper helper, ItemStack stack, Vec3 rel) {
        Vec3 at = helper.absoluteVec(rel);
        ItemEntity item = new ItemEntity(helper.getLevel(), at.x, at.y, at.z, stack);
        item.setDeltaMovement(Vec3.ZERO);
        item.setNeverPickUp();
        helper.getLevel().addFreshEntity(item);
        return item;
    }

    /**
     * {@code itemsNear} finds the three items around the middle (not one farther away, and no living entity); the owner of
     * a thrown one is its thrower; {@code setItem} replaces a stack (capped at its stack size) and {@code remove} takes one
     * away, after which both do nothing.
     */
    @GameTest
    public void itemsNearWithRemoveAndSetItem(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        ItemEntity flesh = drop(helper, new ItemStack(Items.ROTTEN_FLESH, 5), MID.add(1, 0, 0));
        ItemEntity potato = drop(helper, new ItemStack(Items.POISONOUS_POTATO), MID.add(0, 0, 1));
        potato.setThrower(player);
        ItemEntity stick = drop(helper, new ItemStack(Items.STICK, 2), MID.add(-1, 0.5, 0));
        ItemEntity far = drop(helper, new ItemStack(Items.BONE), MID.add(4, 3, 0));
        run(helper, "api16_items", EventContext.forItem(helper.getLevel(), player));
        eq(helper, logged(helper, "items "), "minecraft:poisonous_potatox1@player,minecraft:rotten_fleshx5,minecraft:stickx2"
                + " set minecraft:leatherx2 setMissing:TypeError setBad:TypeError capped 64 removeAgain:ok setGone:ok living 1 tiny 0"
                + " assign:TypeError", "items");
        helper.assertTrue(flesh.getItem().is(Items.LEATHER) && flesh.getItem().getCount() == 64, "setItem reached the item: " + flesh.getItem());
        helper.assertTrue(potato.isRemoved(), "remove() removed the potato");
        helper.assertTrue(stick.isAlive() && stick.getItem().getCount() == 2, "the stick stays");
        Stream.of(flesh, stick, far).forEach(Entity::discard);
        remove(helper, player);
        helper.succeed();
    }

    // ---- ItemRef.contents ------------------------------------------------------------------------------

    /** {@code contents} lists a bag's stacks in slot order (empty slots left out) and a bundle's; a stick holds nothing. */
    @GameTest
    public void contentsOfABagAndABundle(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        ItemStack bag = new ItemStack(BuiltInRegistries.ITEM.getValue(id("bag_chest")));
        bag.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(List.of(new ItemStack(Items.DIAMOND, 5), ItemStack.EMPTY,
                new ItemStack(Items.APPLE, 3))));
        ItemStack bundle = new ItemStack(BuiltInRegistries.ITEM.getValue(id("bag_bundle")));
        bundle.set(DataComponents.BUNDLE_CONTENTS, BundleContents.EMPTY.copyWithContents(Stream.of(new ItemStack(Items.ARROW, 7),
                new ItemStack(Items.FEATHER))));
        player.getInventory().setSelectedSlot(0);
        player.setItemInHand(InteractionHand.MAIN_HAND, bag);
        player.setItemInHand(InteractionHand.OFF_HAND, bundle);
        player.getInventory().setItem(1, new ItemStack(Items.STICK));
        run(helper, "api16_contents", EventContext.forItem(helper.getLevel(), player));
        String bundleContents = "msm_test:bag_bundle[" + BundleContents.EMPTY.copyWithContents(Stream.of(new ItemStack(Items.ARROW, 7),
                new ItemStack(Items.FEATHER))).itemCopies().map(s -> BuiltInRegistries.ITEM.getKey(s.getItem()) + "x" + s.getCount())
                .reduce((a, b) -> a + "," + b).orElse("") + "]";
        eq(helper, logged(helper, "contents "), "msm_test:bag_chest[minecraft:diamondx5,minecraft:applex3] " + bundleContents
                + " minecraft:stick[] assign:TypeError", "contents");
        remove(helper, player);
        helper.succeed();
    }

    // ---- the command event -----------------------------------------------------------------------------

    private static void command(CommandSourceStack source, String command) {
        source.getServer().getCommands().performPrefixedCommand(source, command);
    }

    /**
     * {@code command} gets the definition id, the name, the source entity and the arguments: players as names, positions
     * as three numbers, items and blocks as ids, text with its spaces.
     */
    @GameTest
    public void commandEventGetsTheIdNameSourceAndArguments(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        player.addTag("msm_api16_cmd");
        command(player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER).withSuppressedOutput(),
                "msm_args_b @a[tag=msm_api16_cmd] 1.5 64 -2.25 3 70 -4 minecraft:stick minecraft:stone hello there");
        eq(helper, logged(helper, "command msm_test:cmd_args_b "), "msm_args_b " + player.getStringUUID() + " {\"ps\":[\""
                + player.getName().getString() + "\"],\"pos\":[1.5,64,-2.25],\"bp\":[3,70,-4],\"it\":\"minecraft:stick\","
                + "\"bl\":\"minecraft:stone\",\"t\":\"hello there\"} true", "command event");
        remove(helper, player);
        helper.succeed();
    }

    /** An alias reports the command's own name; the console has no source; an optional argument not typed is missing. */
    @GameTest
    public void commandEventByAliasFromTheConsole(GameTestHelper helper) {
        CommandSourceStack console = helper.getLevel().getServer().createCommandSourceStack().withSuppressedOutput();
        command(console, "msm_op_alias");
        eq(helper, logged(helper, "command msm_test:cmd_op "), "msm_op none {} true", "alias from the console");
        command(console, "msm_optional api16");
        eq(helper, logged(helper, "command msm_test:cmd_optional "), "msm_optional none {\"a\":\"api16\"} true", "optional left out");
        command(console, "msm_optional api16b 4");
        eq(helper, logged(helper, "command msm_test:cmd_optional "), "msm_optional none {\"a\":\"api16b\",\"b\":4} true", "optional given");
        helper.succeed();
    }
}
