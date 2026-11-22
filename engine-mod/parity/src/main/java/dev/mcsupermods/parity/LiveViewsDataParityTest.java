package dev.mcsupermods.parity;

/**
 * Parity of the live views of batch 2, data (ADR 0120 D9; plan brief B607). Stub made by B601 so
 * that the class exists before the fixture does: B607 adds the GameTests (10,000 rolls of each
 * table of {@code fixtures/live-views}, each predicate in set-up situations, each modifier applied,
 * each tag resolved, each function run), the {@code fabric.mod.json} entrypoint line, the flag that
 * writes {@code expectations.json} and the CI step. Until then it holds no test and is not an
 * entrypoint, so the parity build is unchanged.
 */
public final class LiveViewsDataParityTest {
  private LiveViewsDataParityTest() {}
}
