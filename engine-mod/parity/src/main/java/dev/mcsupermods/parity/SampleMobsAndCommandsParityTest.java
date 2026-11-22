package dev.mcsupermods.parity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * Behaviour parity of {@code fixtures/sample-mobs-and-commands} (ADRs 0107 to 0111) against vanilla's own villagers, buckets,
 * boats, cauldrons, game rules and statistics, run with {@code --gametest-filter msm_parity_tests:sample_mobs_and_commands_*}.
 * A placeholder from B526 (one passing test); B541 fills it in.
 */
public class SampleMobsAndCommandsParityTest {
    @GameTest
    public void sampleMobsAndCommandsPlaceholder(GameTestHelper helper) {
        helper.succeed();
    }
}
