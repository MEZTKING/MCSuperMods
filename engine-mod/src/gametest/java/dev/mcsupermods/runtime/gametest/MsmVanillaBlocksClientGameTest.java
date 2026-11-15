package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/**
 * Client GameTest for the vanilla-parity blocks of batch 1: signs with text, beds, torches, lanterns and a bundle
 * tooltip (ADR 0101 D6); filled by B464.
 */
public class MsmVanillaBlocksClientGameTest implements FabricClientGameTest {
    /** Placeholder until B464: one client tick on the title screen. */
    @Override
    public void runTest(ClientGameTestContext context) {
        context.waitTick();
    }
}
