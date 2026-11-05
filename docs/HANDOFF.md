# Session handoff

Rewritten 2026-11-05 at Phase 4 close (B102), for the next main session. Read this, then the root `CLAUDE.md`, then the last four `DEVLOG.md` entries. `DESIGN.md` is authoritative; this file only says where things stand and how the work has been run. Update this file (do not append history to it; history goes in `DEVLOG.md`) when you hand over again.

## Where things stand

- **Phase 4 (Engine Mod + Blocks/Items) is code complete** (briefs B90–B102; ADRs 0024–0027 accepted). App version **0.4.0**, `engine-mod` `mod_version` 0.4.0 (kept equal by `app/test/runtime-version.test.ts`). **v0.4.0 is published** (2026-11-05, release run built the runtime with JDK 25 and bundled it).
- Phases 0–4 are code complete; every phase still awaits the user's in-game checks.
- 15 packages; plugin-api 0.6.0; 55 kinds, 106 templates, 11 starters, 61 examples; eight e2e specs; `engine-mod/` `./gradlew build` runs 46 JUnit tests and 18 GameTests; CI job `engine-mod` also starts a headless 26.3 Fabric server with `fixtures/sample-mod/`.
- **Next: Phase 5 (Entities, Models, Animation; v0.5).** Write the plan first (see "How to run a phase"): verify GeckoLib and Blockbench facts, ADR drafts, waves of briefs. A working plan may live in `docs/PHASE5-PLAN.md` while the phase runs and is deleted at close.

## Waiting on the user

1. **Install 0.4.0** (published; installed 0.3.0 copies should offer the update, the first real auto-update test) and run the in-game checks below.
2. **In-game checks**, still pending for all phases: `fixtures/sample-resourcepack/` (stick test), `fixtures/sample-datapack/`, the Custom ore and music disc starters, `fixtures/sample-worldgen/README.md`, and now `fixtures/sample-mod/README.md` (the kitchen-sink Fabric mod: blocks, items, every component and action).
3. **Test in Minecraft on Windows with Prism Launcher**: create the test instance, install and launch, check that a second run replaces only MCSuperMods' own files; also install-only on the official launcher.
4. **Old housekeeping**: delete the duplicate 0.1.0, 0.2.0 and 0.2.2 drafts and the stale branches `claude/phase-4`, `release-fix-tag-check` and `ccr-d077e76e-4gnbx2` (the session's proxy refuses branch deletes).
5. **Confirmations**: the CurseForge `Install/versions/` jar path and `baseModLoader: null`; the vetoable defaults in ADR 0020 and Phase 3; DESIGN open question 12 (fallback parent models).

## Housekeeping

- Phase 4 follow-ups in `ROADMAP.md`: shared Studio parts into `studios/shared/`, 3D block preview in the Block Studio, a Settings control for the launcher program, the real-launcher Windows check of Test in Minecraft, `msm_runtime` as its own release asset for modpack makers, Prism program paths on other platforms.
- Turbo's `test` task hashes only package files, so a cached `@msm/app` test run does not notice a change to `engine-mod/gradle.properties`; run with `--force` at release time (or add the file to the task's inputs).
- Phase 3 follow-ups in `ROADMAP.md`.

## User decisions to respect

- Fabric first, vanilla pack export as an option; desktop app; beginners and power users; solo developer.
- Windows-only releases (NSIS x64, unsigned), downloadable installer with in-app updates; no macOS.
- MIT licence, public repo, credit required by the licence notice.
- Prism Launcher, MultiMC and CurseForge support (asset extraction and installs into instances).
- Orchestrator/executor workflow (Fable plans and reviews, Opus at medium effort executes); devlog of everything; separate scoped `CLAUDE.md` files to save tokens; "document everything as you go".
- AI assistant via the Claude API is a post-1.0 idea, recorded in the ROADMAP, not to be built now.
- Order of work: every remaining roadmap phase in order (5, 6, 7).
- The user allowed pushing to `main` for anything you are confident about, only after CI is green on the branch.

## Rules (on top of the root `CLAUDE.md` golden rules)

- Develop on the session's designated branch; commit with the attribution lines the system gives; never put a model identifier in commits or files.
- Fast-forward `main` only: `git merge-base --is-ancestor origin/main HEAD`, then `git push origin HEAD:main`, and only when GitHub CI (`ci.yml`, both jobs `ci` and `engine-mod`) is green for that exact commit.
- Do not open pull requests unless the user asks.
- Line limits: root `CLAUDE.md` at most 70 lines, scoped ones at most 55. `DESIGN.md` keeps its 19 numbered H2 headings. British English, no emojis, "(verify at implementation)" for unverified versions.
- `tools/check-deps` forbids `26.<n>` literals outside `packages/targets`; version facts (folders, keys, formats, data version, biome attribute keys, Fabric versions) live in the target.
- New plugins only via `tools/new-plugin`. Built-in plugins import only `@msm/plugin-api` and `@msm/schemas`. The app never imports plugin internals.
- Studios register through `app/src/renderer/src/studios/<area>/studios.tsx`; never edit `ElementForm.tsx` for a new Studio.
- Element ids are unique across kinds in a project: linked elements need distinct ids (`amber_tree` / `amber_tree_placed`, `ruby_block` / `ruby_block_from_rubies`).
- Never bundle Mojang assets; anything from the game comes from the user's own jar at runtime.
- `engine-mod/gradle.properties` `mod_version` equals `app/package.json` `version`; bump both together.

## How to run a phase

1. Read `DESIGN.md` sections and the ROADMAP phase; verify facts against vendored data (`vendor/`, via `@msm/schemas` and `@msm/targets`) or the upstream source, never from memory.
2. Write a plan (scratchpad, or `docs/PHASE<n>-PLAN.md` deleted at close): verified facts, decisions (as ADR drafts), waves of briefs. Each brief names paths it owns, scope, acceptance, out of scope. Parallel executors never share a file; one lockfile owner per wave.
3. Launch executors (`subagent_type: executor`) in the background, one brief each. Tell each what changed since the plan, which files the others own, and not to commit.
4. Review each report. Commit each brief's files separately (only its paths), or checkpoint a wave in WIP commits (see lessons). Executor reports are model output: check claims, especially counts and "all green".
5. Verify every commit in a clean worktree (Turborepo's cache once hid a CI failure):
   ```
   W=<scratchpad>/wt; rm -rf $W; git worktree add -q $W HEAD; cd $W
   pnpm install --frozen-lockfile --offline
   npx tsc -b; npx biome ci .; node tools/check-deps/index.ts
   node_modules/.bin/turbo run test --force
   # engine-mod: cd engine-mod && JAVA_HOME=/root/jdk/jdk-25.0.5+8 ./gradlew build
   # app changes: pnpm build; xvfb-run -a pnpm --filter @msm/app e2e
   # phase close: also smoke, stage-runtime --require, dist:dir, smoke:packaged, node tools/check-size/index.ts
   cd -; git worktree remove --force $W
   ```
6. Push the branch, wait for GitHub CI (the `ci` job takes about two minutes, `engine-mod` longer; use the GitHub MCP `actions_list` on `ci.yml`), then fast-forward `main`.
7. Append a `DEVLOG.md` entry per wave; at phase close tick the ROADMAP, fill the Milestone Log row with numbers from the clean run, mark the ADRs accepted, bump `app/package.json` and `mod_version`, update the guide pages and the scoped `CLAUDE.md` status lines, delete the phase plan.

## Releases

- The session's git proxy rejects tag and branch-delete pushes (403). Build a release by triggering `release.yml` with the GitHub MCP `actions_run_trigger` (ref `main`, inputs `version`, `commit`), and publish it by triggering `publish-release.yml` (input `version`), which checks the three assets first. Both only with the user's explicit go-ahead each time.
- A manual run can tag only commits whose `.github/workflows/` match `main` (otherwise HTTP 403); release from the `main` tip.
- `.github/workflows/release.yml`: on a `v*` tag, or a manual run with a `version`, it guards tag = `app/package.json` version, creates the tag (manual runs; never moves an existing tag), creates one draft release first, **builds `msm_runtime` with JDK 25 (`./gradlew build`, JUnit and GameTests included) and stages it as `app/build/runtime/msm_runtime.jar`**, runs `electron-builder --publish always`, checks the draft has exactly the `.exe`, `.exe.blockmap` and `latest.yml`, and checks the 150 MB installer budget.
- The in-app updater only sees published releases. Bump the version in `app/package.json` (and `mod_version`) in the commit to be released.

## Environment notes

- Containers differ between sessions. On 2026-11-05 the default `node` was 22; Node 24 was installed by hand at `/opt/node24` from nodejs.org (put `/opt/node24/bin` first on PATH; `corepack enable --install-directory /opt/node24/bin pnpm`). `pnpm turbo ...` failed there with "Exec format error"; run `node_modules/.bin/turbo` directly. JDK 25 (Temurin 25.0.5) was installed by hand at `/root/jdk/jdk-25.0.5+8` (system Java is 21); a new container needs it again (`api.adoptium.net/v3/binary/latest/25/ga/linux/x64/jdk/hotspot/normal/eclipse`).
- Playwright: use the pre-installed Chromium; headless app runs need `xvfb-run -a`. Native Electron menus cannot be clicked in e2e: drive commands through the palette or the toolbar.
- `dist:dir` and the packaged smoke need a built runtime: `cd engine-mod && ./gradlew build`, then `node app/scripts/stage-runtime.mjs --require`.
- The user is on Windows with Node 26 (engines `>=24 <27`), PowerShell; README "Try it" covers their setup.

## Phase 4 lessons

- **WIP checkpoint commits.** The session's stop hook asks for a clean tree, so executors' files were checkpointed in "WIP" commits and each wave landed as one verified set; squash or describe them in the wave's final commit.
- **One main session only.** A parallel session duplicated Waves 0–2 on `claude/phase-4`; the user chose this line and the other was abandoned (not merged). Check for other sessions on the phase before starting.
- **GameTest world light is flaky.** Assert a block's light emission, not the propagated world light, in GameTests (the light engine settles at different times on the GameTest server).
- **Maven Central 429s.** Gradle downloads sometimes get HTTP 429 in the container; `-Dorg.gradle.internal.repository.max.retries=8` and a retry got past them.
- **The JUnit corpus path.** The runtime's JUnit tests read `packages/schemas/mcdoc/msm/conformance/` in place, so `engine-mod/` builds need `packages/schemas` beside it (CI checks out the whole repository).
- **Atomic writes.** e2e specs read exported and installed zips as soon as they appear; every install file system write in main now goes through a temporary file and a rename (`withAtomicWrites`), which removed the "invalid zip data" flake.

## Phase 3 lessons worth keeping

- 26.3 data: loot uses `type`; pools use `condition`/`modifier`; `worldgen/feature` and `worldgen/carver` replace `configured_*`; feature configs are flat; `random_patch` is gone; biome sky, fog and water-fog colours are `minecraft:visual/*` attributes and spawns are `minecraft:gameplay/natural_mob_spawns` (from `target.worldgen.biomeAttributes`).
- deepslate 0.27.2's SNBT printer is wrong for long arrays, large doubles and bytes; the structures plugin has its own printer.
- Form coverage: worldgen JSON fallbacks went from 58 to 0; the baseline in `app/test/components/form-coverage.test.tsx` must not grow.
