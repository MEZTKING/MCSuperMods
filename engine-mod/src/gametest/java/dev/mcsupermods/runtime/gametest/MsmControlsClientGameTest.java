package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/**
 * Client GameTest for project key binds and HUD elements against a dedicated server (ADR 0091 D7); the key half is B411's, the HUD half B416's; filled by B411 and B416.
 */
public class MsmControlsClientGameTest implements FabricClientGameTest {
    /** Placeholder until B411 and B416: one client tick on the title screen. */
    @Override
    public void runTest(ClientGameTestContext context) {
        context.waitTick();
    }
}
