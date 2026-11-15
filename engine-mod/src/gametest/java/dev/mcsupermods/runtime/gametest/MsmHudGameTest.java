package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * GameTests for HUD elements on the server (ADR 0089: value computation, change detection, actions); filled by B416.
 */
public class MsmHudGameTest {
    /** Placeholder so the class registers a test until B416 replaces it. */
    @GameTest
    public void placeholder(GameTestHelper helper) {
        helper.succeed();
    }
}
