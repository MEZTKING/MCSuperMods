package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * GameTests for project key binds on the server (ADR 0088 D3, D4, D7; payloads fed to the receiver for mock players); filled by B411.
 */
public class MsmKeyBindGameTest {
    /** Placeholder so the class registers a test until B411 replaces it. */
    @GameTest
    public void placeholder(GameTestHelper helper) {
        helper.succeed();
    }
}
