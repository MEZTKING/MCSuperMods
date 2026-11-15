package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/**
 * Client GameTest for vehicles against a dedicated server: place, mount, drive, fire, screenshots (ADR 0091 D7); filled by B418.
 */
public class MsmVehicleClientGameTest implements FabricClientGameTest {
    /** Placeholder until B418: one client tick on the title screen. */
    @Override
    public void runTest(ClientGameTestContext context) {
        context.waitTick();
    }
}
