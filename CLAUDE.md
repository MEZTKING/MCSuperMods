# MCSuperMods

MCSuperMods (MSM): desktop mod maker for Minecraft Java (Fabric-first, vanilla pack export). Targets: 26.3 (default) and 26.4-snapshot-7. Status: v1.0.0 released (2026-11-06); 1.1.0 drafted and 1.2.0 prepared (app and `mod_version` 1.2.0), both pending the user's Windows test. Phases 0–7 code complete and awaiting in-game checks; Phase 7 (B150–B162): plugin API 1.0, third-party plugins in a sandboxed worker under `msm-app://`, second target with Upgrade project target, per-target runtime jars, starter wizards, docs site, `tools/new-plugin --external` (built on Windows in CI). Follow-ups in ROADMAP Phase 7. Add-ons pulled into 0.7.0 (ADRs 0041–0045): the AI helper (`@msm/ai`, bring-your-own key), armour and custom tool materials, gear, weapons and consumables (`msm:components` passthrough, `apply_effect`), the Creator (flows are starters with `creator`; live preview; `meta.creator` reopen rule), undoable asset writes. plugin-api 1.4.0 (ADR 0049 `audio` parameters; built-ins declare `^1.0.0`). In 1.1.0: Welcome and the first-mod guide, modpacks (ADR 0046: `msm.modpack.json`, File > Modpacks…, `.mrpack` export, Test modpack in Minecraft). In 1.2.0 (ADR 0048): Picture to texture, player skins on the Custom mob, screenshots for the AI helper, New texture…, better placeholder art. 61 kinds in all. Library: 125 templates (resourcepack 15, datapack 56, structures 9, worldgen 21, blocks-items 14, models-anim 3, entities 3, scripting 4), 24 starters, 71 examples. Releases: Windows only (MIT; README "Releasing"). Toolchain: Node 24, pnpm 12.

## Directory map

- `docs/` — DESIGN.md (authoritative), ROADMAP.md, DEVLOG.md, HANDOFF.md (current state for the next main session), `adr/`, `guide/` (user guide), `site/` (VitePress docs site)
- `app/` — `@msm/app`, Electron shell (`main/`, `preload/`, `renderer/`)
- `packages/core/` — `@msm/core`, IR, project load/save, command stack, lowering driver
- `packages/schemas/` — `@msm/schemas`, mcdoc adapter, `validateJson`; `@msm/schemas/mcfunction` (offline Spyglass)
- `packages/plugin-api/` — `@msm/plugin-api`, public interfaces only; `packages/ai/` — `@msm/ai`, AI helper protocol, tools, loop (`./sdk`: the Claude SDK, main only)
- `packages/plugins/` — `@msm/plugin-<name>`: `resourcepack`, `datapack`, `structures`, `worldgen`, `blocks-items`, `models-anim`, `entities` (kinds, templates, validators), `scripting` (kinds, templates, validators), `library` (starters, examples)
- `packages/exporters/` — `@msm/exporters`, vanilla-packs (resource, data, combined), fabric-content-jar, java-project (eject)
- `packages/targets/` — `@msm/target-*`, one folder per MC version (`mc-26.3/`, `mc-26.4/`), plus the `@msm/targets` aggregator (`all/`)
- `packages/interop/` — `@msm/interop`, Minecraft installation, launcher instances, `level.dat` world names, Fabric test installs (`fabric/`), Blockbench import (`blockbench/`)
- `engine-mod/` — `msm_runtime` Fabric mod (Gradle, Java 25; `-Pmc=<version>` from `versions/`); `parity/` behaviour-parity GameTest mod (separate build)
- `tools/` — dev scripts: check-deps, check-size, sync-mcdoc, sync-mcmeta, build-msm-mcdoc, new-plugin, run-fabric-server
- `fixtures/sample-resourcepack/`, `sample-datapack/`, `sample-worldgen/`, `sample-mod/`, `sample-mob/`, `sample-script/` — sample projects for the in-game checks; `sample-plugin/` — sample external plugin
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
- `cd engine-mod && ./gradlew build` and `./gradlew -p parity build` (JDK 25); CI job `engine-mod` also runs `tools/run-fabric-server` (server checks, ejected builds, parity GameTests).
