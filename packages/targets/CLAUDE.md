# packages/targets — Minecraft version targets

Phase 2 code complete: `mc-26.3/` with `Target.folders.resource` and `folders.data` (plugin-api 0.3.0, ADR 0017), the vendored command tree and block states, and the `@msm/targets` aggregator in `all/` (ADR 0013). Phase 3 (plugin-api 0.5.0, ADR 0022): `dataVersion` 5023, data folders `structure`, `dimension`, `worldgen`, and `worldgen` facts: `featureSteps` (the eleven decoration steps) and `biomeAttributes` (`WorldgenFacts.biomeAttributes`: the `minecraft:visual/*` colour attributes, `skyColour`, `naturalMobSpawns` = `minecraft:gameplay/natural_mob_spawns`), verified against the vendored mcdoc and mcmeta. A second target (`mc-26.2/`) arrives in Phase 7.

## Purpose

One package per Minecraft version, `@msm/target-mc-<version>`, holding every version-specific fact and its vendored schema and registry data. This is the only place in the repo where version facts live. Support policy: the current release plus the previous one (26.3 and 26.2 at launch).

## Contents

- `mc-26.3/src/target.ts`: the `Target` object (`packFormats` as `{ major, minor }`, `mcdocRef` commit sha, `mcmetaRef` prefix, Java version, `folders.resource` and `folders.data` checked against the Spyglass URI binder; `fabric`/`geckolib` from Phases 4/5).
- `mc-26.3/src/vendored.ts`: URLs of the vendored files (incl. `mcmetaCommands`, `mcmetaBlocks`; keys mirrored by the app's `VENDORED_KEYS`); consumers read them, core and schemas never do.
- `mc-26.3/vendor/vanilla-mcdoc/`: Spyglass symbol export, `LICENSE`, `SOURCE.json` (ADR 0005).
- `mc-26.3/vendor/mcmeta/`: `version.json`, `registries.json`, `commands.json` (pretty-printed, about 583 kB), `blocks.json`, `SOURCE.json` (ADR 0006).
- `mc-26.3/CHANGES.md`: verified facts with sources, and what Mojang changed that affected us.
- `all/src/index.ts` (`@msm/targets`): `builtInTargets`, `defaultTargetId`, `targetById`, `readVendoredJson`. The only way code outside this tree reaches a target; plugin and exporter `src/` may not import it (tests only). The app's main build bundles vendored data into `out/main/vendor/`.
- Later: `migrateFrom(previousTarget)` hooks for breaking changes between versions.

## Conventions

- Data only, plus small hooks; no general logic.
- Every field is documented on the `Target` type in `@msm/plugin-api`.
- Vendored data is regenerated only by `tools/sync-mcdoc` and `tools/sync-mcmeta`; never edit it by hand.
- vanilla-mcdoc has no tags: pin a commit sha. mcmeta refs are the tags `<version>-summary` / `<version>-registries`.
- Registry ids in `registries.json` have no namespace; consumers add `minecraft:`.
- Mark every unverified value "(verify at implementation)"; record verified ones with date and source in `CHANGES.md`.
- Target changes are handled at lowering time, not by project file migrations.

## Do / Don't

- Do add a version by copying the previous folder, updating facts and pins, re-running both sync scripts, and running the tests.
- Do keep the real-data tests: schema load and coverage (zero unsupported nodes in Phase 2 and Phase 3 kinds), loot validation and the mcfunction service over the vendored data.
- Don't let version facts leak into any other package (`tools/check-deps` enforces this).
- Don't add pre-26.1 targets in v1.

## Commands

- `pnpm --filter "@msm/target-*" test`
- `node tools/sync-mcdoc/index.ts --ref <sha> --out packages/targets/mc-<version>/vendor/vanilla-mcdoc`
- `node tools/sync-mcmeta/index.ts --version <version> --out packages/targets/mc-<version>/vendor/mcmeta`

## Read next

- [DESIGN §9 Targets and Exporters](../../docs/DESIGN.md#9-targets-and-exporters)
- [DESIGN §17 Risks and Mitigations](../../docs/DESIGN.md#17-risks-and-mitigations)
- [ADR 0005](../../docs/adr/0005-vanilla-mcdoc-pinning-and-loading.md), [ADR 0006](../../docs/adr/0006-mcmeta-refs.md), [ROADMAP](../../docs/ROADMAP.md)
