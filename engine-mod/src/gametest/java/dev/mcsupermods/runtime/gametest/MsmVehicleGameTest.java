package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * GameTests for vehicles (ADR 0090: placing, picking up, seats, fuel, damage, storage, movement without a driver, {@code explode}); filled by B412.
 */
public class MsmVehicleGameTest {
    /** Placeholder so the class registers a test until B412 replaces it. */
    @GameTest
    public void placeholder(GameTestHelper helper) {
        helper.succeed();
    }
}
