package dev.mcsupermods.parity;

import static dev.mcsupermods.parity.SampleParticlesParityTest.AT;
import static dev.mcsupermods.parity.SampleParticlesParityTest.anyNear;
import static dev.mcsupermods.parity.SampleParticlesParityTest.assertAt;
import static dev.mcsupermods.parity.SampleParticlesParityTest.assertDistances;
import static dev.mcsupermods.parity.SampleParticlesParityTest.block;
import static dev.mcsupermods.parity.SampleParticlesParityTest.id;
import static dev.mcsupermods.parity.SampleParticlesParityTest.near;

import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.game.ClientboundLevelParticlesPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity of the sample particles' script ({@code msm_sample_particles:particles}, Script API 1.3,
 * {@code World.spawnParticle}), on content jars only: scripts are not part of the Java project eject (ADR 0033), so this
 * class has its own name and filter ({@code --gametest-filter msm_parity_tests:sample_particles_script_*}), which the
 * ejected run's {@code sample_particles_parity_test_*} does not match. Black-box like {@link SampleParticlesParityTest}:
 * a real player's use of the block ({@code ServerPlayerGameMode.useItemOn}) and the particle packets it receives.
 */
public class SampleParticlesScriptParityTest {
    /** A main-hand right-click on the top face of {@code rel}, as the network handler does. */
    private static void use(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false);
        player.gameMode.useItemOn(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND, hit);
    }

    /**
     * Using the spark lamp with an empty main hand runs the script's {@code block.interact} handler: 8 petals 1.5 blocks
     * above the lamp's corner plus a half (spread 0.3), and 16 pieces of the lamp itself (a {@code minecraft:block}
     * options object naming the project block) at its centre (spread 0.4). Using stone sends neither.
     */
    @GameTest
    public void sparkLampUseSendsPetalsAndLampPieces(GameTestHelper helper) {
        Block lamp = block(helper, "spark_lamp");
        BlockPos stone = AT.east(3);
        helper.setBlock(AT, lamp);
        helper.setBlock(stone, Blocks.STONE);
        try (ParityEars ears = new ParityEars(helper, AT.west(), GameType.SURVIVAL, "msm-lamp-user")) {
            ears.particles();
            use(helper, ears.player, AT);
            List<ClientboundLevelParticlesPacket> sent = ears.particles();
            Vec3 above = helper.absoluteVec(Vec3.atLowerCornerOf(AT).add(0.5, 1.5, 0.5));
            Vec3 centre = helper.absoluteVec(Vec3.atCenterOf(AT));

            List<ClientboundLevelParticlesPacket> petals = near(sent, id("petal"), above, 0.5);
            helper.assertValueEqual(petals.size(), 1, "petal packets");
            helper.assertValueEqual(petals.getFirst().count(), 8, "petal count");
            assertAt(helper, petals.getFirst(), above, "petals");
            assertDistances(helper, petals.getFirst(), 0.3, 0.3, 0.3, "petals");
            helper.assertFalse(petals.getFirst().overrideLimiter(), "petals without force have the override flag");

            List<ClientboundLevelParticlesPacket> pieces = near(sent, Identifier.withDefaultNamespace("block"), centre, 0.5);
            helper.assertValueEqual(pieces.size(), 1, "block particle packets");
            ClientboundLevelParticlesPacket piece = pieces.getFirst();
            helper.assertValueEqual(piece.count(), 16, "block particle count");
            assertAt(helper, piece, centre, "lamp pieces");
            assertDistances(helper, piece, 0.4, 0.4, 0.4, "lamp pieces");
            helper.assertTrue(piece.particle() instanceof BlockParticleOption, "block particle options: " + piece.particle());
            helper.assertTrue(((BlockParticleOption) piece.particle()).getState().is(lamp),
                    "the pieces are not of the lamp: " + ((BlockParticleOption) piece.particle()).getState());

            use(helper, ears.player, stone);
            helper.assertValueEqual(anyNear(ears.particles(), helper.absoluteVec(Vec3.atCenterOf(stone)), 2.5), List.of(),
                    "particle packets after using stone");
        }
        helper.succeed();
    }
}
