package dev.mcsupermods.parity;

/**
 * Behaviour parity over {@code fixtures/sample-community-games} (namespace {@code msm_sample_community_games}, ADR 0132):
 * the Game and map Studio's first four game types (Lifesteal, Manhunt, Bed Wars-style, Spleef) as the games plugin's data
 * pack on the real server. Vanilla and Fabric API only (ADR 0033 D5). One class for both runs, filter
 * {@code msm_parity_tests:sample_community_games_*}: on the content jar and on the vanilla data pack as a mod of its own.
 *
 * <p>B721 registered the class with no tests, so that its entry in {@code fabric.mod.json} and the CI steps are in place;
 * B736 adds the tests with the stand-in players of the B720 spike (K20).
 */
public final class SampleCommunityGamesParityTest {
}
