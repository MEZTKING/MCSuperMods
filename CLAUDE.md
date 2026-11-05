# MCSuperMods

MCSuperMods (MSM): desktop mod maker for Minecraft Java (Fabric-first, vanilla pack export). Current MC target 26.3. Status: Phase 4 code complete, awaiting in-game checks; Phase 5 next (plan to write first). Phase 4 (Engine Mod + Blocks/Items; ADRs 0024–0027; v0.4.0): plugin-api 0.6.0, MSM mcdoc, `msm_runtime` v1, `@msm/plugin-blocks-items`, `fabric-content-jar`, Block/Item Studios, Export Fabric mod jar, Test in Minecraft, real Custom ore starter, CI headless server check. Done before: Phases 0–3 (awaiting in-game checks), two add-ons (launcher support, ADR 0019; templates and samples library, ADR 0020). 55 kinds in all. Library: 106 templates (resourcepack 14, datapack 55, structures 9, worldgen 21, blocks-items 7), 11 starters, 61 examples. Releases: Windows only (MIT; README "Releasing"). Toolchain: Node 24, pnpm 12.

## Directory map

- `docs/` — DESIGN.md (authoritative), ROADMAP.md, DEVLOG.md, HANDOFF.md (current state for the next main session), `adr/`, `guide/` (user guide)
- `app/` — `@msm/app`, Electron shell (`main/`, `preload/`, `renderer/`)
- `packages/core/` — `@msm/core`, IR, project load/save, command stack, lowering driver
- `packages/schemas/` — `@msm/schemas`, mcdoc adapter, `validateJson`; `@msm/schemas/mcfunction` (offline Spyglass)
- `packages/plugin-api/` — `@msm/plugin-api`, public interfaces only
- `packages/plugins/` — `@msm/plugin-<name>`: `resourcepack`, `datapack`, `structures`, `worldgen`, `blocks-items` (kinds, templates, validators), `library` (starters, examples); more planned (entities from Phase 5)
- `packages/exporters/` — `@msm/exporters`, vanilla-packs (resource, data, combined), fabric-content-jar; later java-project
- `packages/targets/` — `@msm/target-*`, one folder per MC version (`mc-26.3/`), plus the `@msm/targets` aggregator (`all/`)
- `packages/interop/` — `@msm/interop`, Minecraft installation, launcher instances, `level.dat` world names, Fabric test installs (`fabric/`); Blockbench later
- `engine-mod/` — `msm_runtime` Fabric mod (Gradle, Java 25)
- `tools/` — dev scripts: check-deps, check-size, sync-mcdoc, sync-mcmeta, new-plugin, run-fabric-server
- `fixtures/sample-resourcepack/`, `sample-datapack/`, `sample-worldgen/`, `sample-mod/` — sample projects for the in-game checks
- `examples/` — generated mirror of the library's starters and examples (golden; `UPDATE_GOLDENS=1`)
- `.claude/agents/` — `orchestrator.md`, `executor.md`

## Scoped guides

Read only the one for the area you work in, plus docs/DESIGN.md sections it links.

- `docs/CLAUDE.md` — design docs, roadmap, ADR conventions
- `app/CLAUDE.md` — Electron shell, UI, IPC rules
- `packages/core/CLAUDE.md` — IR, persistence, undo, lowering driver
- `packages/schemas/CLAUDE.md` — mcdoc schemas and form models
- `packages/plugin-api/CLAUDE.md` — public plugin interfaces, versioning rules
- `packages/plugins/CLAUDE.md` — built-in plugins, kinds, lowering
- `packages/exporters/CLAUDE.md` — packs, content jar, Java eject
- `packages/targets/CLAUDE.md` — per-version Minecraft facts and migrations
- `packages/interop/CLAUDE.md` — Blockbench, NBT, game install and launcher instance access
- `engine-mod/CLAUDE.md` — Fabric runtime mod, Java conventions

## Golden rules

- Version-specific facts live only in `packages/targets`.
- `@msm/plugin-api` has no internal dependencies.
- Built-in plugins use only the public plugin API (plus `@msm/schemas`).
- Everything lowers to files: `lower(element, target) -> OutputFile[]`.
- Never bundle Mojang assets; extract from the user's client jar at runtime.
- Project files are JSON only, 2-space, sorted keys.
- British English in docs. No emojis.
- TypeScript strict everywhere.
- engine-mod: Java 25 and Mojang names only (no Yarn).
- Write "(verify at implementation)" rather than guessing versions.
- When a decision changes, update DESIGN.md/ROADMAP.md and add an ADR in `docs/adr/`.

## Agent workflow

- Fable = orchestrator/planner: reads DESIGN + ROADMAP, decides, writes briefs, reviews.
- Opus at medium effort = executor: implements one brief, runs tests, reports.
- Briefs name files, paths and exit criteria.
- Executors do not change architecture without an ADR.
- Parallel executors never touch the same file.

## Every session

- Main sessions: read `docs/HANDOFF.md` first. Everyone: read the latest `docs/DEVLOG.md` entry.
- Append an entry at the end: `## YYYY-MM-DD — <agent> — <topic>`, then What / Decisions / Next.

## Commands

- `pnpm i` / `pnpm dev` (app) / `pnpm lint` (Biome + check-deps) / `pnpm typecheck` / `pnpm test` / `pnpm build`
- `pnpm --filter @msm/app smoke|e2e|dist:dir|smoke:packaged|dist` (headless: `xvfb-run -a`); `node tools/check-size/index.ts`
- `cd engine-mod && ./gradlew build` (JDK 25); CI job `engine-mod` also runs `tools/run-fabric-server`.
