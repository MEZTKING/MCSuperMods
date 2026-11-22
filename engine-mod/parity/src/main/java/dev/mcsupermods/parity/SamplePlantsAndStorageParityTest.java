package dev.mcsupermods.parity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * Behaviour parity of {@code fixtures/sample-plants-and-storage} (ADRs 0103 to 0105) against vanilla's own plants, pots and
 * chests, run with {@code --gametest-filter msm_parity_tests:sample_plants_and_storage_*}. A placeholder from B505 (one
 * passing test); B520 fills it in.
 */
public class SamplePlantsAndStorageParityTest {
    @GameTest
    public void samplePlantsAndStoragePlaceholder(GameTestHelper helper) {
        helper.succeed();
    }
}
