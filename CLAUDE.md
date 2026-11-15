# MCSuperMods

MCSuperMods (MSM): desktop mod maker for Minecraft Java (Fabric-first, vanilla pack export). Targets: 26.3 (default) and 26.4-snapshot-7. Status: v1.0.0 published (2026-11-06); **1.5.1** (app and `mod_version` 1.5.1, CHANGELOG `[1.5.1] - 2026-11-14`) is built as a draft from main 0e14663 for the user's Windows test and supersedes the 1.1.0–1.3.0 drafts and the prepared 1.4.0 (the v1.5.0 tag on 47ad42c has no release: its build was cancelled for B379's Reload fix). 1.5.1 holds everything since 1.0.0: 1.1.0 (Welcome and the first-mod guide, modpacks, ADR 0046), 1.2.0 (Picture to texture, player skins, AI screenshots, ADR 0048), 1.3.0 (Music disc song files, the passthrough warning, vanilla tool numbers, ADRs 0049, 0050), 1.4.0 (custom status effects and throwables, ADRs 0055, 0056, with the Dimension flow, launch, Wishlist, picture options, texture drag and drop), the runtime fixes batch (ADRs 0057–0059), vanilla additions (0060–0062), potions, data kinds and Script API 1.1 (0063–0065), vanilla pack safety (0066), block types, crops, saplings and trees (0067–0069), the mob expansion (0070–0073), containers and machines (0074–0076, Script API 1.2), custom portal blocks (0077–0078), compact vendored data (0079), custom particles (0080–0081, Script API 1.3, headless client GameTests in CI), **Rules, Very easy mode and one-click Play** (ADRs 0082–0084, accepted with findings at close B384: the kind `msm:rules` compiled at lowering time by a project expander into events and generated scripts, the Rule book Studio and Rules sections, Very easy mode with Home, My things and Things to fix, Play and Reload through the managed Prism instance and the runtime's dev mode, Script API 1.4, plugin API 1.15.0, `fixtures/sample-rules`) and **Try it slice 1** (ADR 0085, B385–B391, B393–B395: the in-app preview); Try it slices 2 and 3 are merged; slice 4 waits for the user's word and the close is B403 (`docs/PLAN-test-world.md`). All ADRs up to 0091 except 0086 are accepted; every batch awaits the user's in-game checks. Phases 0–7 code complete; Phase 7 (B150–B162): plugin API 1.0, third-party plugins in a sandboxed worker under `msm-app://`, second target with Upgrade project target, per-target runtime jars, starter wizards, docs site, `tools/new-plugin --external` (built on Windows in CI); follow-ups in ROADMAP. Add-ons in 0.7.0 (ADRs 0041–0045): the AI helper (`@msm/ai`, bring-your-own key), armour and custom tool materials, gear, weapons and consumables, the Creator, undoable asset writes. Plugin API 1.17.0 (1.16.0 `TargetFacts.controls`/`vehicles`; 1.15.0 `projectExpanders`, `TargetFacts.dev`; 1.14.0 `TargetFacts.particles`; 1.13.0 `BlockFacts.portal`; built-ins declare `^1.0.0`); Script API 1.5 (members of 1.1 to 1.5 say "Since runtime 1.5.1"). 102 kinds. Library (at 3d29dc4): 241 templates (resourcepack 17, datapack 66, structures 9, worldgen 22, blocks-items 85, models-anim 3, entities 18, scripting 9, rules 6, controls 6), 57 starters (45 Creator flows), 161 examples, 70 placeholder patterns. Runtime: 663 GameTests per variant, about 1036 JUnit, client GameTests on both versions; parity: sample mod 83, sample mob 10, sample script 15, sample creatures 12, sample machines 19, sample portals 13, sample particles 12, sample rules 8, sample vehicles 15. App: 34 e2e spec files, `app.asar` 28.6 MB of 32, renderer 15.8 of 18. Releases: Windows only (MIT; README "Releasing"). Toolchain: Node 24, pnpm 12. **Vehicles and the client side** (ADRs 0088–0091, accepted with findings at close B432, plan deleted; unreleased, awaiting the in-game checks): `msm:vehicle`, `msm:key_bind`, `msm:hud`, the runtime channel, Script API 1.5, Rules for keys, vehicles and the screen (56 triggers, 44 steps, 19 conditions, 13 values, 7 places), guide pages `vehicles.md` and `keys-and-hud.md`, `fixtures/sample-vehicles`.

## Directory map

- `docs/` — DESIGN.md (authoritative), ROADMAP.md, DEVLOG.md, HANDOFF.md (current state for the next main session), `adr/`, `guide/` (user guide), `site/` (VitePress docs site)
- `app/` — `@msm/app`, Electron shell (`main/`, `preload/`, `renderer/`)
- `packages/core/` — `@msm/core`, IR, project load/save, command stack, lowering driver
- `packages/schemas/` — `@msm/schemas`, mcdoc adapter, `validateJson`; `@msm/schemas/mcfunction` (offline Spyglass)
- `packages/plugin-api/` — `@msm/plugin-api`, public interfaces only; `packages/ai/` — `@msm/ai`, AI helper protocol, tools, loop (`./sdk`: the Claude SDK, main only); `packages/sim/` — `@msm/sim`, the world, player and mobs of the Try it preview (ADR 0085)
- `packages/plugins/` — `@msm/plugin-<name>`: `resourcepack`, `datapack`, `structures`, `worldgen`, `blocks-items`, `models-anim`, `entities` (kinds, templates, validators), `scripting` (kinds, templates, validators), `rules` (`msm:rules`, the rules expander), `library` (starters, examples)
- `packages/exporters/` — `@msm/exporters`, vanilla-packs (resource, data, combined), fabric-content-jar, java-project (eject)
- `packages/targets/` — `@msm/target-*`, one folder per MC version (`mc-26.3/`, `mc-26.4/`), plus the `@msm/targets` aggregator (`all/`)
- `packages/interop/` — `@msm/interop`, Minecraft installation, launcher instances, `level.dat` world names, Fabric test installs (`fabric/`), Blockbench import (`blockbench/`)
- `engine-mod/` — `msm_runtime` Fabric mod (Gradle, Java 25; `-Pmc=<version>` from `versions/`); `parity/` behaviour-parity GameTest mod (separate build)
- `tools/` — dev scripts: check-deps, check-size, sync-mcdoc, sync-mcmeta, build-msm-mcdoc, new-plugin, run-fabric-server
- `fixtures/sample-resourcepack/`, `sample-datapack/`, `sample-worldgen/`, `sample-mod/`, `sample-mob/`, `sample-creatures/`, `sample-machines/`, `sample-portals/`, `sample-particles/`, `sample-rules/`, `sample-script/` — sample projects for the in-game checks; `sample-plugin/` — sample external plugin
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

- **Vanilla parity (user, 2026-11-14):** anything that can be made in vanilla Minecraft Java must be possible through MSM; a gap is a bug for the coverage audit (`docs/COVERAGE-AUDIT.md`).
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
- Every worker, review, root-cause and worldgen job runs on Opus (model: claude-opus-5-5) at medium effort; when a worker or review is stuck, rerun it on Opus at high effort. Sonnet (model: claude-sonnet-5-5) is still fine for the smaller or mechanical parts (docs, language files, one-file fixes, live checks, art-designer briefs).
- Commits carry no `Co-Authored-By`, `Claude-Session` or other credit lines (user's rule; see `docs/HANDOFF.md`).
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
