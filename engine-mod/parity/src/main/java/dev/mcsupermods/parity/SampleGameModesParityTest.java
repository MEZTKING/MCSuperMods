package dev.mcsupermods.parity;

/**
 * Behaviour parity over {@code fixtures/sample-game-modes} (namespace {@code msm_sample_game_modes}, ADRs 0113 to 0117),
 * the games plugin's data pack output on the real server. Filter {@code msm_parity_tests:sample_game_modes_*}.
 *
 * <p>Stub from B548: no tests yet. B559 adds them (the island placed once at the first mock join, the kit given once,
 * the one block refilled through phases, a timer ending and firing its rule, an area entered and reset, scores in the
 * sidebar slot, the lucky block rule).
 */
public class SampleGameModesParityTest {
    static final String NAMESPACE = "msm_sample_game_modes";
}
