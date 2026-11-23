package dev.mcsupermods.parity;

/**
 * Parity of the live views of batch 4, assembled structures (ADR 0122 D9; plan brief B639). Stub made by B635 so that
 * the class exists before the fixture does: B639 adds the GameTests (the fixture's structures placed on the real
 * server on both versions, their statistics and the before and after blocks of each processor recorded), the {@code
 * fabric.mod.json} entrypoint line, the flag that writes {@code expectations.json} and the CI step. Until then it
 * holds no test and is not an entrypoint, so the parity build is unchanged.
 */
public final class StructuresParityTest {
  private StructuresParityTest() {}
}
