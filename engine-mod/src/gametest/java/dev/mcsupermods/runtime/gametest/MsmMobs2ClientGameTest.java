package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/**
 * Client GameTest for the looks of hovering mobs, roosting and playing dead, villager types, boats and repainted fluids
 * (ADRs 0107 to 0110), run by {@code ./gradlew runClientGameTest [-Pmc=26.4]}. A placeholder from B526 (it does nothing); B532
 * fills it in.
 */
public class MsmMobs2ClientGameTest implements FabricClientGameTest {
    @Override
    public void runTest(ClientGameTestContext context) {}
}
