package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * GameTests for Script API 1.7 and the events behind it, one Mixin each (ADR 0111 D3, D8), filled in by B533. A placeholder from B526 (one passing test); the brief named in the description fills it in.
 */
public final class MsmScriptApi17GameTest {
    @GameTest
    public void placeholder(GameTestHelper helper) {
        helper.succeed();
    }
}
