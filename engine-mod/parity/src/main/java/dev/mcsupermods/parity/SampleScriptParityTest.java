package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
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
 * </ul>
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
}
