package dev.mcsupermods.parity;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-script} (namespace {@code msm_sample_script}), against vanilla and
 * Fabric API only. Scripts are not part of the Java project eject (ADR 0033), so this class runs on content jars
 * only (ADR 0058 D4): it checks what the scripts do in the world, not how.
 *
 * <ul>
 *   <li>{@code on_entity_interact}: a main-hand use of an entity runs {@code Entity.runCommand("tag @s add
 *       msm_sample_touched")}, so the entity used carries the tag (ADR 0058 D2).
 *   <li>{@code on_block_interact}: a main-hand use of {@code spark_ore} runs {@code World.runCommand("setblock ~ ~1 ~
 *       minecraft:sea_lantern", e.block.pos)}, so the sea lantern stands on the ore, not at the world spawn point;
 *       a use of {@code warded_stone} is cancelled: nothing is placed, the held stack keeps its count, and the player
 *       is sent its inventory and the six neighbours of the placement position (ADR 0058 D3).
 *   <li>{@code kill_counter} (ADR 0062): each kill by a player adds one to {@code kills} in that player's
 *       {@code player.data} and to {@code total_kills} in {@code msm.storage}, and tells the player both
 *       ({@code Your kills: K. Everyone's: T.}); the values are read back on the next kill, also after a real
 *       {@code /reload} (in the {@code msm_parity_tests:reload} environment, a batch of its own), which reloads the
 *       scripts and clears their variables and schedules but not the saved data.
 *   <li>Script API 1.1 (ADR 0065, B255), through chat commands that start with {@code !} (said with
 *       {@link ParityEars#chat}, as the network handler does): {@code on_player_chat} cancels them, so another player
 *       sees plain chat but not a command; {@code kit_command} pays two diamonds for a named, damaged sword in slot 0, a
 *       golden helmet and a shield (inventory and item components); {@code crown_zombie} reads a zombie's main hand and
 *       crowns it (mob equipment); {@code train_command} changes experience, food and game mode, and the client is sent
 *       each (game mode at once, experience and food from the player's tick); {@code title_command} sends the title,
 *       subtitle, times, action bar and clear packets; {@code spark_bar} shows a boss bar, a respawned player takes the
 *       old player's place on it (the client is sent the bar again) and a player who leaves is taken off it ({@code
 *       on_player_respawn} and {@code on_player_leave} say so); {@code look_command} raycasts to a block face, a mob
 *       and nothing; {@code smite_command} deals magic damage with the player as the attacker, so the kill is the
 *       player's (a breeze's player-kill drop, the kill counter); {@code nether_command} teleports the player and a cow
 *       to the Nether ({@code on_player_change_dimension} says so); {@code on_player_tick} gives Luck to a player who
 *       wears a golden helmet only; {@code on_entity_damaged} reports the damage after armour, also for a killing blow
 *       (the smite), once and before {@code entity.death}.
 * </ul>
 *
 * <p>The start counter ({@code start_counter}, {@code msm.storage} across a restart) is checked by
 * {@code tools/run-fabric-server --runs 2}, since a GameTest server cannot restart.
 *
 * <p>Interactions go through {@code ServerPlayerGameMode.useItemOn} (as the network handler calls it; Fabric API's
 * {@code UseBlockCallback} fires there) and Fabric API's {@code UseEntityCallback}. Packets are read from a
 * {@link ParityEars} player. Run with {@code --gametest-filter msm_parity_tests:sample_script_*}.
 */
public class SampleScriptParityTest {
    private static final String NAMESPACE = "msm_sample_script";
    private static final BlockPos AT = new BlockPos(2, 1, 2);
    private static final String TOUCHED = "msm_sample_touched";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    private static Block block(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id(path)), "block " + id(path) + " is not registered");
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    /** A main-hand right-click on the top face of {@code rel}. */
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND, hit);
    }

    @GameTest
    public void entityRunCommandTagsTheEntityUsed(GameTestHelper helper) {
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, AT);
        Mob other = helper.spawnWithNoFreeWill(EntityTypes.PIG, AT.east(2));
        try (ParityEars ears = new ParityEars(helper, AT.west(), GameType.SURVIVAL)) {
            UseEntityCallback.EVENT.invoker().interact(ears.player, helper.getLevel(), InteractionHand.MAIN_HAND, pig,
                    new EntityHitResult(pig));
            helper.assertTrue(pig.entityTags().contains(TOUCHED), "the pig used has no tag " + TOUCHED + ": " + pig.entityTags());
            helper.assertFalse(other.entityTags().contains(TOUCHED), "@s reached another pig");
            helper.assertFalse(ears.player.entityTags().contains(TOUCHED), "@s was the player, not the entity");
        }
        pig.discard();
        other.discard();
        helper.succeed();
    }

    @GameTest
    public void worldRunCommandWithAtPlacesOnTheOre(GameTestHelper helper) {
        helper.setBlock(AT, block(helper, "spark_ore"));
        helper.assertBlockPresent(Blocks.AIR, AT.above());
        try (ParityEars ears = new ParityEars(helper, AT.west(), GameType.SURVIVAL)) {
            use(helper, ears.player, AT);
        }
        helper.assertBlockPresent(Blocks.SEA_LANTERN, AT.above());
        helper.assertBlockPresent(block(helper, "spark_ore"), AT);
        helper.succeed();
    }

    @GameTest
    public void cancelledUseOfWardedStoneChangesNothingAndResyncs(GameTestHelper helper) {
        helper.setBlock(AT, block(helper, "warded_stone"));
        try (ParityEars ears = new ParityEars(helper, AT.west(), GameType.SURVIVAL)) {
            ears.player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.OAK_DOOR, 5));
            ears.packets();
            InteractionResult result = use(helper, ears.player, AT);
            helper.assertTrue(result instanceof InteractionResult.Fail, "the use was not refused: " + result);
            helper.assertBlockPresent(Blocks.AIR, AT.above());
            helper.assertBlockPresent(Blocks.AIR, AT.above(2));
            helper.assertBlockPresent(block(helper, "warded_stone"), AT);
            helper.assertValueEqual(ears.player.getMainHandItem().getCount(), 5, "doors held after the refused use");
            List<String> expected = new ArrayList<>(List.of("inventory 0"));
            for (Direction d : Direction.values()) {
                expected.add("block " + helper.absolutePos(AT.above()).relative(d).toShortString());
            }
            helper.assertValueEqual(sorted(ears.resync()), sorted(expected), "resync after the cancelled use");

            // Control: the same use of a vanilla block places the door and sends no resync.
            helper.setBlock(AT.east(2), Blocks.STONE);
            InteractionResult control = use(helper, ears.player, AT.east(2));
            helper.assertFalse(control instanceof InteractionResult.Fail, "control was refused: " + control);
            helper.assertBlockPresent(Blocks.OAK_DOOR, AT.east(2).above());
            helper.assertValueEqual(ears.resync(), List.of(), "resync after an uncancelled use");
        }
        helper.succeed();
    }

    private static List<String> sorted(List<String> list) {
        List<String> out = new ArrayList<>(list);
        out.sort(null);
        return out;
    }
    private static final Pattern KILLS = Pattern.compile("Your kills: (\\d+)\\. Everyone's: (\\d+)\\.");

    /** The kill counter's messages to {@code ears.player} since the last read, as {kills, total} pairs. */
    private static List<int[]> killMessages(ParityEars ears) {
        List<int[]> out = new ArrayList<>();
        for (Packet<?> packet : ears.packets()) {
            if (packet instanceof ClientboundSystemChatPacket chat) {
                Matcher m = KILLS.matcher(chat.content().getString());
                if (m.matches()) {
                    out.add(new int[] {Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))});
                }
            }
        }
        return out;
    }

    private static int[] killAndRead(GameTestHelper helper, ParityEars ears, BlockPos at) {
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, at);
        ears.packets();
        pig.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(ears.player), 1000.0f);
        helper.assertFalse(pig.isAlive(), "the pig survived");
        List<int[]> messages = killMessages(ears);
        helper.assertValueEqual(messages.size(), 1, "kill counter messages after one kill");
        return messages.getFirst();
    }

    @GameTest(environment = SampleModAdditionsParityTest.RELOAD, maxTicks = 600)
    public void killCounterKeepsPlayerAndWorldDataAcrossReload(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        ParityEars ears = new ParityEars(helper, AT.west(), GameType.SURVIVAL);
        try {
            int[] first = killAndRead(helper, ears, AT);
            helper.assertValueEqual(first[0], 1, "kills after the first kill (a new player)");
            int[] second = killAndRead(helper, ears, AT.east());
            helper.assertValueEqual(second[0], 2, "kills read back on the second kill");
            helper.assertValueEqual(second[1], first[1] + 1, "world total read back on the second kill");
            CompletableFuture<Void> reload = server.reloadResources(server.getPackRepository().getSelectedIds());
            helper.startSequence()
                    .thenWaitUntil(() -> helper.assertTrue(reload.isDone(), "the reload has not finished"))
                    .thenExecute(() -> {
                        try {
                            helper.assertFalse(reload.isCompletedExceptionally(), "the reload failed");
                            int[] third = killAndRead(helper, ears, AT.east(2));
                            helper.assertValueEqual(third[0], 3, "kills after /reload");
                            helper.assertValueEqual(third[1], second[1] + 1, "world total after /reload");
                        } finally {
                            ears.close();
                        }
                    })
                    .thenSucceed();
        } catch (RuntimeException e) {
            ears.close();
            throw e;
        }
    }

    // ---- script API 1.1 (ADR 0065, B255) -------------------------------------------------------------------

    /** The entries of {@link ParityEars#read} that start with one of {@code prefixes}. */
    private static List<String> only(List<String> read, String... prefixes) {
        List<String> out = new ArrayList<>();
        for (String line : read) {
            for (String prefix : prefixes) {
                if (line.startsWith(prefix)) {
                    out.add(line);
                    break;
                }
            }
        }
        return out;
    }

    /** Vanilla's advancement announcements, which every player is sent. */
    private static final Pattern ADVANCEMENT = Pattern.compile(".+ has (made the advancement|reached the goal|completed the challenge) .+");

    /**
     * The server's chat lines to {@code ears.player} since the last read, without the {@code system } prefix and without
     * vanilla's advancement announcements (a test player earns some, such as for its first kill or the Nether).
     */
    private static List<String> said(ParityEars ears) {
        List<String> out = new ArrayList<>();
        for (String line : only(ears.read(), "system ")) {
            String text = line.substring("system ".length());
            if (!ADVANCEMENT.matcher(text).matches()) {
                out.add(text);
            }
        }
        return out;
    }

    private static int indexOfFirst(List<String> lines, String prefix) {
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).startsWith(prefix)) {
                return i;
            }
        }
        return -1;
    }

    /** Clears the column above {@code rel} up to the test area's barrier ceiling, so a ray upwards leaves the area. */
    private static void openTheSky(GameTestHelper helper, BlockPos rel) {
        for (int y = rel.getY() + 1; y <= rel.getY() + 24; y++) {
            BlockPos up = new BlockPos(rel.getX(), y, rel.getZ());
            if (helper.getBlockState(up).is(Blocks.BARRIER)) {
                helper.setBlock(up, Blocks.AIR);
            }
        }
    }

    /** {@code ears.player} at {@code rel}, looking along {@code yaw} and {@code pitch}. */
    private static void stand(GameTestHelper helper, ParityEars ears, BlockPos rel, float yaw, float pitch) {
        Vec3 at = helper.absoluteVec(Vec3.atBottomCenterOf(rel));
        ears.player.snapTo(at.x, at.y, at.z, yaw, pitch);
        ears.player.setYHeadRot(yaw);
    }

    private static Mob bareZombie(GameTestHelper helper, BlockPos at) {
        Mob zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, at);
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            zombie.setItemSlot(slot, ItemStack.EMPTY);
        }
        return zombie;
    }

    /** {@code player.chat}: a "!" command is cancelled (another player sees nothing), plain chat is broadcast. */
    @GameTest
    public void chatCommandsAreCancelledAndPlainChatIsNot(GameTestHelper helper) {
        try (ParityEars sender = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-chat-sender");
                ParityEars listener = new ParityEars(helper, AT.east(2), GameType.SURVIVAL, "msm-chat-listener")) {
            sender.chat("hello sparks");
            helper.assertValueEqual(only(listener.read(), "chat").size(), 1, "plain chat reaching the other player");
            sender.read();
            sender.chat("!help");
            helper.assertValueEqual(only(listener.read(), "chat"), List.of(), "a command reached the other player");
            List<String> answer = said(sender);
            helper.assertTrue(answer.stream().anyMatch(line -> line.startsWith("Sample commands: !help, !kit")),
                    "no command list for the sender: " + answer);
        }
        helper.succeed();
    }

    /** {@code Player.inventory} and item components through {@code !kit}. */
    @GameTest
    public void kitPaysDiamondsAndEquipsANamedSword(GameTestHelper helper) {
        try (ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-kit")) {
            ServerPlayer player = ears.player;
            player.getInventory().setItem(9, new ItemStack(Items.DIAMOND, 5));
            ears.read();
            ears.chat("!kit");
            helper.assertValueEqual(said(ears), List.of("Kit: Spark Blade (1554/1561), named \"Spark Blade\"; paid 2 diamonds, 3 left, "
                    + "the first in slot 9."), "kit answer");
            ItemStack sword = player.getInventory().getItem(0);
            helper.assertTrue(sword.is(Items.DIAMOND_SWORD), "slot 0: " + sword);
            helper.assertValueEqual(sword.getDamageValue(), 7, "sword damage");
            helper.assertTrue(sword.get(DataComponents.CUSTOM_NAME) != null
                    && sword.get(DataComponents.CUSTOM_NAME).getString().equals("Spark Blade"), "sword name: " + sword.getComponentsPatch());
            helper.assertTrue(player.getItemBySlot(EquipmentSlot.HEAD).is(Items.GOLDEN_HELMET), "head: " + player.getItemBySlot(EquipmentSlot.HEAD));
            helper.assertTrue(player.getItemBySlot(EquipmentSlot.OFFHAND).is(Items.SHIELD), "off hand: " + player.getItemBySlot(EquipmentSlot.OFFHAND));
            helper.assertValueEqual(player.getInventory().getItem(9).getCount(), 3, "diamonds left in slot 9");
            ears.chat("!kit");
            ears.chat("!kit");
            List<String> later = said(ears);
            helper.assertValueEqual(later.size(), 2, "answers to two more kits: " + later);
            helper.assertTrue(later.get(0).contains("paid 2 diamonds, 1 left"), "second kit: " + later.get(0));
            helper.assertValueEqual(later.get(1), "A kit costs two diamonds.", "third kit");
            helper.assertValueEqual(player.getInventory().countItem(Items.DIAMOND), 1, "diamonds after a refused kit");
        }
        helper.succeed();
    }

    /** {@code Entity.equipment} and {@code setEquipment} on a mob through {@code crown_zombie}. */
    @GameTest
    public void zombieShowsItsMainHandAndIsCrowned(GameTestHelper helper) {
        Mob zombie = bareZombie(helper, AT.east(2));
        zombie.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.IRON_SWORD));
        try (ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-crown")) {
            ears.read();
            UseEntityCallback.EVENT.invoker().interact(ears.player, helper.getLevel(), InteractionHand.MAIN_HAND, zombie,
                    new EntityHitResult(zombie));
            helper.assertValueEqual(said(ears), List.of("This zombie holds minecraft:iron_sword and wears a new golden helmet."), "first use");
            helper.assertTrue(zombie.getItemBySlot(EquipmentSlot.HEAD).is(Items.GOLDEN_HELMET), "zombie head: " + zombie.getItemBySlot(EquipmentSlot.HEAD));
            helper.assertTrue(zombie.getItemBySlot(EquipmentSlot.MAINHAND).is(Items.IRON_SWORD), "the sword was taken");
            UseEntityCallback.EVENT.invoker().interact(ears.player, helper.getLevel(), InteractionHand.MAIN_HAND, zombie,
                    new EntityHitResult(zombie));
            helper.assertValueEqual(said(ears), List.of("This zombie holds minecraft:iron_sword and wears minecraft:golden_helmet."), "second use");
        }
        zombie.discard();
        helper.succeed();
    }

    /** XP, food and game mode writes change the server state and reach the client (D3). */
    @GameTest
    public void trainChangesXpFoodAndGameModeAndTellsTheClient(GameTestHelper helper) {
        try (ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-train")) {
            ServerPlayer player = ears.player;
            player.doTick();
            ears.read();
            ears.chat("!train");
            List<String> now = ears.read();
            helper.assertValueEqual(only(now, "game mode"), List.of("game mode " + GameType.ADVENTURE.getId()), "sent at once");
            helper.assertValueEqual(only(now, "system "), List.of("system Trained: level 3, 5 points, food 10, saturation 2, adventure."),
                    "train answer");
            helper.assertValueEqual(player.experienceLevel, 3, "server xp level");
            helper.assertValueEqual(player.totalExperience, 5, "server total xp");
            helper.assertValueEqual(player.getFoodData().getFoodLevel(), 10, "server food");
            helper.assertValueEqual(player.getFoodData().getSaturationLevel(), 2f, "server saturation");
            helper.assertValueEqual(player.gameMode(), GameType.ADVENTURE, "server game mode");
            player.doTick(); // vanilla sends experience and food from the player's tick
            List<String> ticked = ears.read();
            helper.assertTrue(ticked.contains("xp level 3 total 5") && ticked.contains("food 10 saturation 2.0"), "sent on the next tick: " + ticked);
        }
        helper.succeed();
    }

    /** Title, subtitle, times, action bar and clear packets (D4). */
    @GameTest
    public void titleAndActionBarReachTheClient(GameTestHelper helper) {
        try (ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-title")) {
            ears.read();
            ears.chat("!title");
            helper.assertValueEqual(only(ears.read(), "times", "subtitle", "title", "actionbar", "clear"),
                    List.of("times 5 40 10", "subtitle Sample script", "title Spark!", "actionbar Sparks: ready"), "title packets");
            ears.chat("!clear");
            helper.assertValueEqual(only(ears.read(), "times", "subtitle", "title", "actionbar", "clear"), List.of("clear false"), "clear packet");
        }
        helper.succeed();
    }

    private static List<String> barAnswer(ParityEars ears, String command) {
        ears.read();
        ears.chat(command);
        return said(ears).stream().filter(line -> line.startsWith("Spark charge")).toList();
    }

    /**
     * Boss bars (D4): shown and filled; after a respawn the new player takes the old one's place (the client is sent the
     * bar again, and later updates reach it); a player who leaves is taken off the bar; the last "!bar off" removes it.
     */
    @GameTest
    public void bossBarFollowsRespawnAndLeave(GameTestHelper helper) {
        ParityEars a = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-bar-a");
        try (ParityEars b = new ParityEars(helper, AT.east(2), GameType.SURVIVAL, "msm-bar-b")) {
            try {
                a.read();
                a.chat("!bar");
                helper.assertValueEqual(only(a.read(), "boss"), List.of("boss add Spark charge 0.0 yellow notched_10", "boss progress 0.25"),
                        "bar shown");
                helper.assertValueEqual(barAnswer(b, "!bar who"), List.of("Spark charge: 1 player(s): msm-bar-a."), "who before the respawn");

                a.respawn();
                List<String> afterRespawn = a.read();
                helper.assertValueEqual(only(afterRespawn, "boss"), List.of("boss remove", "boss add Spark charge 0.25 yellow notched_10"),
                        "the respawned player is put on the bar again");
                helper.assertTrue(afterRespawn.contains("system Welcome back, msm-bar-a."), "player.respawn: " + afterRespawn);
                a.chat("!bar");
                helper.assertValueEqual(only(a.read(), "boss"), List.of("boss progress 0.5"), "an update reaches the respawned player");
                helper.assertValueEqual(barAnswer(b, "!bar who"), List.of("Spark charge: 1 player(s): msm-bar-a."), "who after the respawn");
            } finally {
                a.close();
            }
            List<String> left = said(b);
            helper.assertTrue(left.contains("msm-bar-a has left."), "player.leave: " + left);
            helper.assertValueEqual(barAnswer(b, "!bar who"), List.of("Spark charge: 0 player(s)."), "who after the leave");
            helper.assertValueEqual(barAnswer(b, "!bar off"), List.of("Spark charge removed."), "the last off removes the bar");
            helper.assertValueEqual(barAnswer(b, "!bar who"), List.of("Spark charge: 0 player(s)."), "who after the removal");
        }
        helper.succeed();
    }

    /** {@code Entity.raycast} from the eyes: a block face, a mob, nothing (D6). */
    @GameTest
    public void lookRaycastsABlockAMobAndNothing(GameTestHelper helper) {
        helper.setBlock(AT.east(3), Blocks.STONE);
        helper.setBlock(AT.east(3).above(), Blocks.STONE);
        Mob zombie = bareZombie(helper, AT.south(3));
        openTheSky(helper, AT);
        try (ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-look")) {
            stand(helper, ears, AT, -90f, 0f);
            ears.read();
            ears.chat("!look");
            helper.assertValueEqual(said(ears), List.of("You look at minecraft:stone (west face), 2.5 blocks away."), "looking east");
            stand(helper, ears, AT, 0f, 0f);
            ears.chat("!look");
            List<String> south = said(ears);
            helper.assertTrue(south.size() == 1 && south.getFirst().matches("You look at minecraft:zombie, 2\\.\\d blocks away\\."),
                    "looking south: " + south);
            stand(helper, ears, AT, 0f, -90f);
            ears.chat("!look");
            helper.assertValueEqual(said(ears), List.of("You look at nothing within 16 blocks."), "looking up");
        }
        zombie.discard();
        helper.succeed();
    }

    private static int dropped(GameTestHelper helper, Entity around, Item item) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, around.getBoundingBox().inflate(3), e -> e.getItem().is(item))
                .stream().mapToInt(e -> e.getItem().getCount()).sum();
    }

    /** {@code damage} with a type and the player as the attacker: a magic kill credited to the player (D5). */
    @GameTest
    public void smiteKillsWithThePlayerAsTheAttacker(GameTestHelper helper) {
        Mob breeze = helper.spawnWithNoFreeWill(EntityTypes.BREEZE, AT.east(3));
        openTheSky(helper, AT);
        try (ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-smite")) {
            stand(helper, ears, AT, 0f, -90f);
            ears.read();
            ears.chat("!smite");
            helper.assertValueEqual(said(ears), List.of("Nothing to smite."), "smiting the sky");
            stand(helper, ears, AT, -90f, 0f);
            float health = breeze.getHealth();
            ears.chat("!smite");
            List<String> answer = said(ears);
            helper.assertTrue(answer.contains("Smitten: minecraft:breeze fell."), "smite answer: " + answer);
            int kills = indexOfFirst(answer, "Your kills: ");
            helper.assertTrue(kills >= 0, "the kill counter did not count it: " + answer);
            // entity.damaged also fires for the killing blow, once, with what the breeze had left, before entity.death.
            String took = "minecraft:breeze took " + BigDecimal.valueOf(Math.round(health * 100) / 100.0).stripTrailingZeros().toPlainString()
                    + " damage (minecraft:magic), 0 health left.";
            helper.assertValueEqual(answer.stream().filter(line -> line.startsWith("minecraft:breeze took ")).toList(), List.of(took),
                    "entity.damaged answers for the killing blow");
            helper.assertTrue(answer.indexOf(took) < kills, "entity.damaged after entity.death: " + answer);
            helper.assertFalse(breeze.isAlive(), "the breeze survived");
            helper.assertTrue(breeze.getLastDamageSource() != null && breeze.getLastDamageSource().is(DamageTypes.MAGIC)
                    && breeze.getLastDamageSource().getEntity() == ears.player, "damage source: " + breeze.getLastDamageSource());
            helper.assertTrue(breeze.getLastHurtByPlayer() == ears.player, "kill credit: " + breeze.getLastHurtByPlayer());
            helper.assertTrue(dropped(helper, breeze, Items.BREEZE_ROD) >= 1, "the player-kill pool dropped no breeze rod");
        }
        helper.succeed();
    }

    /**
     * Cross-dimension teleport of the player and a cow (D7) and {@code player.changeDimension} (D8). Vanilla re-creates
     * the cow in the Nether (same UUID) and adds it to an entity section whose chunk the entity manager does not yet
     * track when the script's {@code setBlock} has only just loaded it, so a level lookup in the same tick does not see
     * the cow; it is visible from a later tick (seen on the next one), so the test waits for it there.
     */
    @GameTest(maxTicks = 200)
    public void netherTakesThePlayerAndACow(GameTestHelper helper) {
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, AT.east());
        ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-nether");
        ServerLevel nether;
        try {
            ears.read();
            ears.chat("!nether");
            List<String> answer = said(ears);
            helper.assertValueEqual(answer, List.of("You went from minecraft:overworld to minecraft:the_nether.",
                    "Now in minecraft:the_nether with 1 cow(s), the first now in minecraft:the_nether."), "nether answers");
            nether = (ServerLevel) ears.player.level();
            helper.assertValueEqual(nether.dimension(), Level.NETHER, "player dimension");
            helper.assertTrue(nether.getBlockState(ears.player.blockPosition().below()).is(Blocks.OBSIDIAN), "no obsidian floor");
            helper.assertTrue(cow.isRemoved() && cow.getRemovalReason() == Entity.RemovalReason.CHANGED_DIMENSION,
                    "the cow did not change dimension: " + cow.getRemovalReason());
        } catch (RuntimeException | Error e) {
            ears.close();
            throw e;
        }
        BlockPos floor = ears.player.blockPosition();
        helper.succeedWhen(() -> {
            List<Mob> cows = nether.getEntitiesOfClass(Mob.class, new AABB(floor).inflate(3), m -> m.getType() == EntityTypes.COW);
            helper.assertValueEqual(cows.size(), 1, "cows beside the player in the Nether");
            helper.assertValueEqual(cows.getFirst().getUUID(), cow.getUUID(), "the cow beside the player");
            helper.assertValueEqual(cows.getFirst().blockPosition(), floor.east(), "the cow's position");
            cows.forEach(Entity::discard);
            ears.close();
        });
    }

    /** {@code player.tick} every 20 ticks gives Luck to a player who wears a golden helmet, and to nobody else (D8). */
    @GameTest(maxTicks = 100)
    public void playerTickGivesLuckToGoldenHelmetWearersOnly(GameTestHelper helper) {
        ParityEars wearer = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-tick-gold");
        ParityEars bare = new ParityEars(helper, AT.east(2), GameType.SURVIVAL, "msm-tick-bare");
        wearer.player.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.GOLDEN_HELMET));
        bare.player.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.IRON_HELMET));
        helper.runAfterDelay(45, () -> {
            try {
                helper.assertTrue(wearer.player.hasEffect(MobEffects.LUCK), "the golden helmet wearer has no luck");
                helper.assertFalse(bare.player.hasEffect(MobEffects.LUCK), "the iron helmet wearer has luck");
            } finally {
                wearer.close();
                bare.close();
            }
            helper.succeed();
        });
    }

    /** {@code entity.damaged} carries the damage after armour (D8). */
    @GameTest
    public void entityDamagedReportsTheDamageAfterArmour(GameTestHelper helper) {
        Mob zombie = bareZombie(helper, AT.east(2));
        zombie.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.DIAMOND_CHESTPLATE));
        try (ParityEars ears = new ParityEars(helper, AT, GameType.SURVIVAL, "msm-damaged")) {
            ears.read();
            float before = zombie.getHealth();
            zombie.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(ears.player), 10);
            float taken = before - zombie.getHealth();
            helper.assertTrue(taken > 0 && taken < 10, "armour did not reduce the damage: " + taken);
            Pattern line = Pattern.compile("minecraft:zombie took ([0-9.]+) damage \\(minecraft:player_attack\\), ([0-9.]+) health left\\.");
            List<String> answer = said(ears);
            double[] seen = null;
            for (String text : answer) {
                Matcher m = line.matcher(text);
                if (m.matches()) {
                    seen = new double[] {Double.parseDouble(m.group(1)), Double.parseDouble(m.group(2))};
                }
            }
            helper.assertTrue(seen != null, "no entity.damaged answer: " + answer);
            helper.assertTrue(Math.abs(seen[0] - taken) < 0.006 && Math.abs(seen[1] - zombie.getHealth()) < 0.006,
                    "reported " + seen[0] + " taken and " + seen[1] + " left, expected " + taken + " and " + zombie.getHealth());
        }
        zombie.discard();
        helper.succeed();
    }
}
