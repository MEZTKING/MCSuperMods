# MCSuperMods

MCSuperMods (MSM): desktop mod maker for Minecraft Java (Fabric-first, vanilla pack export). Current MC target 26.3. Status: Phase 2 code complete; awaiting in-game checks and first release; Phase 3 (Structures & Worldgen) next. Releases: Windows only (MIT; README "Releasing"). Toolchain: Node 24, pnpm 12.

## Directory map

- `docs/` — DESIGN.md (authoritative), ROADMAP.md, DEVLOG.md, `adr/`
- `app/` — `@msm/app`, Electron shell (`main/`, `preload/`, `renderer/`)
- `packages/core/` — `@msm/core`, IR, project load/save, command stack, lowering driver
- `packages/schemas/` — `@msm/schemas`, mcdoc adapter, `validateJson`; `@msm/schemas/mcfunction` (offline Spyglass)
- `packages/plugin-api/` — `@msm/plugin-api`, public interfaces only
- `packages/plugins/` — `@msm/plugin-<name>`, eight planned built-ins (`resourcepack`, `datapack` exist)
- `packages/exporters/` — `@msm/exporters`, vanilla-packs (resource, data, combined); later content jar, java-project
- `packages/targets/` — `@msm/target-*`, one folder per MC version (`mc-26.3/`), plus the `@msm/targets` aggregator (`all/`)
- `packages/interop/` — `@msm/interop`, Blockbench, NBT/schem, Minecraft installation
- `engine-mod/` — `msm_runtime` Fabric mod (Gradle, Java 25)
- `tools/` — dev scripts: check-deps, check-size, sync-mcdoc, sync-mcmeta, new-plugin
- `fixtures/sample-resourcepack/`, `fixtures/sample-datapack/` — sample projects for the in-game checks
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
- `packages/interop/CLAUDE.md` — Blockbench, NBT, game install access
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

- Read the latest `docs/DEVLOG.md` entry first.
- Append an entry at the end: `## YYYY-MM-DD — <agent> — <topic>`, then What / Decisions / Next.

## Commands

- `pnpm i` / `pnpm dev` (app) / `pnpm lint` (Biome + check-deps) / `pnpm typecheck` / `pnpm test` / `pnpm build`
- `pnpm --filter @msm/app smoke|e2e|dist:dir|smoke:packaged|dist` (headless: `xvfb-run -a`); `node tools/check-size/index.ts`
- engine-mod Gradle build is not wired until Phase 4.
