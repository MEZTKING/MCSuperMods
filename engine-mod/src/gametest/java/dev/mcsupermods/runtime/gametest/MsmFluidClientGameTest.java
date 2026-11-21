package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/**
 * Client GameTest for project fluids (ADR 0099 D2): still and flowing pictures and the tint, on both versions; filled by
 * B475.
 */
public class MsmFluidClientGameTest implements FabricClientGameTest {
    /** Placeholder until B475: one client tick on the title screen. */
    @Override
    public void runTest(ClientGameTestContext context) {
        context.waitTick();
    }
}
