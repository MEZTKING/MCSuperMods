package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
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
}
