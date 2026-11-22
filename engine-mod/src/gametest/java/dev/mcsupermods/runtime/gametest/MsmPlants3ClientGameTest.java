package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/**
 * Client GameTest for the looks of growing plants, project pots, waterlogged and double chests (ADRs 0103 and 0104), run by
 * {@code ./gradlew runClientGameTest [-Pmc=26.4]}. A placeholder from B505 (it does nothing); B520 fills it in.
 */
public class MsmPlants3ClientGameTest implements FabricClientGameTest {
    @Override
    public void runTest(ClientGameTestContext context) {}
}
