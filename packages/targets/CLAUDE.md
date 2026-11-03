# packages/targets — Minecraft version targets

No code yet; this directory is planned for Phase 0 (`mc-26.3/`) and Phase 7 (second target). This file describes intent and conventions.

## Purpose

One package per Minecraft version, `@msm/target-<version>`, holding every version-specific fact. This is the only place in the repo where version facts live. Support policy: the current release plus the previous one (26.3 and 26.2 at launch).

## Contents (planned)

- `mc-26.3/`, `mc-26.2/`: one folder per version.
- Facts per target: `packFormats` (resource and data), `mcdocRef`, `mcmetaRef`, Fabric Loader and Fabric API versions, Loom version, GeckoLib version, Java version (25 for 26.1+), registry quirks.
- Hook: `migrateFrom(previousTarget)` for breaking changes between versions.
- `CHANGES.md` per target.

## Conventions

- Data only, plus small hooks; no general logic.
- Every field is documented on the `Target` type in `@msm/plugin-api`.
- Mark every unverified value "(verify at implementation)"; never guess a version number.
- Adding a version: copy the previous folder, update the facts, run the golden tests, record the diffs.
- Target changes are handled at lowering time, not by project file migrations.

## Do / Don't

- Do keep a `CHANGES.md` per target describing what Mojang changed that affected us.
- Do pin `vanilla-mcdoc` and `mcmeta` refs here; `@msm/schemas` resolves them.
- Don't let version facts leak into any other package (a CI grep rule enforces this).
- Don't add pre-26.1 targets in v1.
- Append an entry to `docs/DEVLOG.md` each session.

## Commands (planned)

Not yet wired (Phase 0).

- `pnpm --filter "@msm/target-*" test`
- `pnpm --filter "@msm/target-*" build`
- `tools/sync-mcmeta` (refresh registry data for a target)

## Read next

- [DESIGN §9 Targets and Exporters](../../docs/DESIGN.md#9-targets-and-exporters)
- [DESIGN §17 Risks and Mitigations](../../docs/DESIGN.md#17-risks-and-mitigations)
- [ROADMAP, Phase 0 and Phase 7](../../docs/ROADMAP.md)
