# ADR 0097: Vanilla's feature order as a target fact

## Context

The worldgen accuracy audit (`docs/COVERAGE-AUDIT.md` section 4.2, 2026-11-14) left four decisions:

- **W-D1.** `worldgen.feature-order` compares project biomes only, so a project biome that lists vanilla placed features against vanilla's order passes, and the game stops with "Feature order cycle" once vanilla biomes join the world (finding W-A1 was such a case).
- **W-D2.** A biome addition (Fabric `addFeature`) appends to the end of its step; a project placed feature is safe, but an addition that names a vanilla placed feature lands after features vanilla runs later and can close a cycle with vanilla biomes.
- **W-D3.** `blocks-items.duplicate-biome-feature` warns that a feature added again to a project biome "generates twice"; the audit suspected a same-step duplicate is a cycle (a crash), pending a check of Fabric's `addFeature`.
- **W-D4.** Every added feature takes an index in its step, so vanilla features after it get new decoration seeds: the same seed decorates differently with the mod.

Facts (plan F32, F33): Fabric's `BiomeModificationContextImpl.GenerationSettingsContextImpl.addFeature` (biome API 20.1.1 in Fabric API 0.165.2 for 26.3, 20.1.6 in 0.165.4 for 26.4; Fabric code, Apache 2.0, read with `javap -c`) returns without change when the step's holder set already contains the placed feature, and otherwise appends it with `HolderSet` `plus`. The reference pack holds vanilla 26.3's measured feature order (`docs/reference/vanilla-worldgen/tools/feature_indices.txt`, 171 entries); vanilla biome files list features per step and are published as data by mcmeta, which `tools/sync-mcmeta` already reads for registries.

## Decision

- **D1 A target fact.** `WorldgenFacts.vanillaFeatureOrder?: Readonly<Record<string, readonly string[]>>`: per decoration step name (`featureSteps`), the vanilla placed feature ids in the order vanilla's sorter runs them. Each target vendors it as `packages/targets/mc-<v>/vendor/worldgen/feature-order.json`, written by a new `tools/sync-feature-order` from the vanilla biome files of mcmeta's data branch at the pinned version (ids only, no Mojang file is bundled; a topological order per step over every vanilla biome's lists, ties broken by first appearance, which reproduces `feature_indices.txt` for 26.3: a test). Plugin API 1.17.0, optional ("Since 1.17.0"); a target without it skips the checks.
- **D2 Vanilla order in project biomes.** `worldgen.feature-order` adds vanilla's order as edges between vanilla features: two vanilla placed features in one step of a project biome, listed against vanilla's order, give the new warning `worldgen.vanilla-feature-order` ("Vanilla runs X before Y; a world with this biome and vanilla biomes stops with 'Feature order cycle'. Swap them."). A warning, not an error, because a biome used only in a dimension of project biomes never meets vanilla's lists.
- **D3 Additions naming vanilla features.** A biome addition whose placed feature is in the `minecraft` namespace gets the warning `blocks-items.addition-vanilla-feature` ("Added features go to the end of their step, after features vanilla runs later; this can stop worlds with 'Feature order cycle'. Make your own placed feature from the same configured feature instead."), with a quick fix that creates a project placed feature copying the vanilla one's placement (the Studio's "Make my own copy").
- **D4 Duplicates, settled by F32.** A same-step duplicate is neither a crash nor a double: Fabric skips it. `blocks-items.duplicate-biome-feature` learns the step: the same step becomes the warning "already in that step of the biome; the addition does nothing there", and a different step keeps a warning with the corrected wording "generates twice, once in each step". Not an error (the audit's proposal assumed a crash, which the check disproved).
- **D5 Guide notes** (`docs/guide/worldgen.md` and `adding-to-vanilla.md`): add your own placed features, not vanilla ones; adding any feature changes how vanilla decorates later steps for the same seed (W-D4, inherent, Fabric too); vanilla's step order and why lists must follow it.

## Consequences

- Each target sync gains one small vendored file (under 20 kB; L15's asar budget is not at risk).
- The worldgen and blocks-items validators read a target fact through the public plugin API; no plugin hard-codes vanilla ids.
- W-D1 to W-D4 are closed by B442; the audit's section 4.2 points here.

## Status

Proposed (2026-11-14). Defaults the user may veto: warnings rather than errors (D2, D3, D4); the quick fix that copies a vanilla placed feature (D3); mcmeta's data branch as the source (D1).
