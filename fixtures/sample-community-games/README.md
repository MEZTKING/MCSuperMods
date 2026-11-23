# Sample community games project

The fixture of the Game and map Studio's first four game types (ADR 0132; plan `docs/PLAN-game-studio.md`, batch 1): Lifesteal, Manhunt, Bed Wars-style and Spleef, each made by its library starter, namespace `msm_sample_community_games`. All four play without mods, so the parity tests run on the content jar and on the vanilla data pack, on **26.3** and on **26.4**. Nothing in the folder will be a Mojang file: the arenas are drawn by the starters from vanilla blocks named by id, the pictures by MSM's art generator.

**Not made yet.** B721 made this folder (this README only) with its places in CI and in the parity mod, so that no later brief shares those files. B736 fills it:

- `packages/exporters/test/sample-community-games.golden.test.ts` builds the project from the four starters and checks the folder against it (`UPDATE_GOLDENS=1` rewrites it; this README is the one file written by hand). With `MSM_RUNTIME_JAR` and `MSM_SAMPLE_COMMUNITY_GAMES_OUT` it writes `msm_sample_community_games.jar` with `fabric-facts.json`, the vanilla data pack `msm_sample_community_games.zip` with `packs.json`, and `msm_sample_community_games_pack.jar` (that data pack as a Fabric mod of its own).
- `engine-mod/parity`: `SampleCommunityGamesParityTest` (filter `msm_parity_tests:sample_community_games_*`; no tests yet) on the content jar and on the vanilla data pack as a mod (`--no-runtime`).
- CI (`.github/workflows/ci.yml`, job `engine-mod`, both versions): the export, a headless Fabric server with the content jar, the vanilla data pack on a vanilla server and the two parity runs. Each of these steps runs only once the golden test above exists.

The contents table and the in-game check list for the user come with B736.
