package dev.mcsupermods.runtime.gametest;

import java.util.concurrent.CompletableFuture;
import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * Waiting for the server's light engine in a GameTest. The light engine only queues the light work when a block is set;
 * the work runs later on the shared background workers (the same workers generate the chunks of the other tests), and
 * {@code getBrightness} reads the old value until it has run. The GameTest server does not pace its ticks (about 0.46 ms
 * a tick at the fastest), so a budget of ticks is only a few milliseconds of wall time: a light test asks for
 * {@link #queued} right after setting its blocks, polls with {@code succeedWhen} until the future is done and only then
 * checks the values, with a {@code maxTicks} sized in wall time (6000, about 3 s at the fastest tick; see
 * {@code SampleVillagersParityTest.moltenAmberGivesLight} in the parity mod for the measurements). A wrong value still
 * fails as a wrong value: once the future is done, the check reads the real light.
 */
final class LightWait {
    /** The {@code maxTicks} of a test that waits for the light engine: about 3 s of light delay at the fastest tick. */
    static final int MAX_TICKS = 6000;

    private LightWait() {
    }

    /**
     * A future that completes once the light engine has run the light work queued so far for the chunks of the given
     * positions (relative to the test). Ask for it after setting the blocks.
     */
    static CompletableFuture<?> queued(GameTestHelper helper, BlockPos... relative) {
        CompletableFuture<?>[] futures = new CompletableFuture<?>[relative.length];
        for (int i = 0; i < relative.length; i++) {
            BlockPos at = helper.absolutePos(relative[i]);
            futures[i] = helper.getLevel().getChunkSource().getLightEngine()
                    .waitForPendingTasks(SectionPos.blockToSectionCoord(at.getX()), SectionPos.blockToSectionCoord(at.getZ()));
        }
        return CompletableFuture.allOf(futures);
    }

    /** Fails the current {@code succeedWhen} poll until {@code run} is done. */
    static void assertRun(GameTestHelper helper, CompletableFuture<?> run) {
        helper.assertTrue(run.isDone(), "the light engine has not run the queued light work yet");
    }
}
