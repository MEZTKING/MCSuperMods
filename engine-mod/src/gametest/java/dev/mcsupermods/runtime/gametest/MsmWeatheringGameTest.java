package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * GameTests for weathering, waxing and waterlogging (ADR 0094 D7 to D9); filled by B449.
 */
public class MsmWeatheringGameTest {
    /** Placeholder so the class registers a test until B449 replaces it. */
    @GameTest
    public void placeholder(GameTestHelper helper) {
        helper.succeed();
    }
}
