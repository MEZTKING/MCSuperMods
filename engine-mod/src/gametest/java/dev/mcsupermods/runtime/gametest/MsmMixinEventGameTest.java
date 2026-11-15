package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * GameTests for the Mixin-backed script events block placing and explosions (ADR 0096 D3); filled by B455.
 */
public class MsmMixinEventGameTest {
    /** Placeholder so the class registers a test until B455 replaces it. */
    @GameTest
    public void placeholder(GameTestHelper helper) {
        helper.succeed();
    }
}
