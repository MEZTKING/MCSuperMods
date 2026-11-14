package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/**
 * Client GameTest for the dev mode (ADR 0084); empty until B374. It implements {@link FabricClientGameTest} already
 * because {@code runClientGameTest} (B356) refuses an entry point that does not.
 */
public class MsmDevClientGameTest implements FabricClientGameTest {
    @Override
    public void runTest(ClientGameTestContext context) {}
}
