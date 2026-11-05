# Session handoff

Rewritten 2026-11-05 at Phase 5 close (B122), for the next main session. Read this, then the root `CLAUDE.md`, then the last four `DEVLOG.md` entries. `DESIGN.md` is authoritative; this file only says where things stand and how the work has been run. Update this file (do not append history to it; history goes in `DEVLOG.md`) when you hand over again.

## Where things stand

- **Phase 5 (Entities, Models, Animation) is code complete** (briefs B110–B122; ADRs 0028–0030 accepted). App version **0.5.0**, `engine-mod` `mod_version` 0.5.0 (kept equal by `app/test/runtime-version.test.ts`). **v0.5.0 is not released yet**: release it with the user's go-ahead (see Releases) once the branch is verified and `main` is fast-forwarded.
- Phases 0–5 are code complete; every phase still awaits the user's in-game checks.
- 17 packages; plugin-api 0.7.0 (`Target.geckolib: GeckolibFacts`); 58 kinds, 112 templates, 12 starters, 66 examples; nine e2e specs; `engine-mod/` `./gradlew build` runs 78 JUnit tests and 38 GameTests (also with `-PwithoutGeckolib`); CI job `engine-mod` starts a headless 26.3 Fabric server with `fixtures/sample-mod/` and with `fixtures/sample-mob/` (runtime and GeckoLib 5.5.7 nested).
- **Next: Phase 6 (Scripting & Eject; v0.6).** Write the plan first, as "How to run a phase" says: DESIGN §12 and the ROADMAP Phase 6 list; Rhino (ES6 mode) inside `msm_runtime`, the script API and generated typings, `@msm/plugin-scripting` with esbuild, the Monaco script editor, and the `java-project` eject with a Gradle build check and behaviour-parity GameTests. Settle DESIGN open question 2 (Rhino coverage versus GraalJS) with a spike first; it shapes everything else. New plugins come only from `tools/new-plugin`; an API change means plugin-api 0.8.0 and an ADR.

## Waiting on the user

1. **Release 0.5.0** (go-ahead for `release.yml` and `publish-release.yml`), then install it; installed 0.4.0 copies should offer the update.
2. **In-game checks**, still pending for all phases: `fixtures/sample-resourcepack/` (stick test), `fixtures/sample-datapack/`, the Custom ore and music disc starters, `fixtures/sample-worldgen/README.md`, `fixtures/sample-mod/README.md`, and now **`fixtures/sample-mob/README.md`** (the Glow Golem: spawns, walks, attacks, animates, egg, natural spawns). Rendering and animation are only checked there: the CI container has no render backend.
3. **Blockbench comparison**: export one model from Blockbench as `.geo.json` and `.animation.json` and compare it with MSM's conversion of the same `.bbmodel` in game (the conversion signs follow Blockbench's source, which only Blockbench itself can confirm).
4. **Test in Minecraft on Windows with Prism Launcher** (from Phase 4), also with a project that has a mob (GeckoLib nested).
5. **Old housekeeping**: delete the duplicate 0.1.0, 0.2.0 and 0.2.2 drafts and the stale branches `claude/phase-4`, `release-fix-tag-check` and `ccr-d077e76e-4gnbx2` (the session's proxy refuses branch deletes).
6. **Confirmations**: the CurseForge `Install/versions/` jar path and `baseModLoader: null`; the vetoable defaults in ADR 0020 and Phase 3; DESIGN open question 12 (fallback parent models).

## Housekeeping

- Phase 5 follow-ups in `ROADMAP.md`: Molang subset and `catmullrom` in the preview (reserve B124), a client render check in CI on a runner with a GPU backend (reserve B123), GeckoLib items and armour, Java block `.bbmodel` import, a 3D egg preview, GeckoLib in the installer if users ask, a Toolbar entry for Blockbench import.
- Phase 4 follow-ups (shared Studio parts into `studios/shared/`, which the Entity Studio now also borrows from `blocks-items/`, `structures/` and `worldgen/`; 3D block preview; launcher program setting; `msm_runtime` as a release asset) and Phase 3 follow-ups in `ROADMAP.md`.
- `makeMockServerPlayerInLevel` (used by three entity GameTests) is deprecated for removal in 26.3 with no replacement; watch it on the next target.

## User decisions to respect

- Fabric first, vanilla pack export as an option; desktop app; beginners and power users; solo developer.
- Windows-only releases (NSIS x64, unsigned), downloadable installer with in-app updates; no macOS.
- MIT licence, public repo, credit required by the licence notice. GeckoLib (MIT) is credited in the README and downloaded at export time, not shipped.
- Prism Launcher, MultiMC and CurseForge support (asset extraction and installs into instances).
- Orchestrator/executor workflow (Fable plans and reviews, Opus at medium effort executes); devlog of everything; separate scoped `CLAUDE.md` files to save tokens; "document everything as you go".
- AI assistant via the Claude API is a post-1.0 idea, recorded in the ROADMAP, not to be built now.
- Order of work: every remaining roadmap phase in order (6, then 7).
- The user allowed pushing to `main` for anything you are confident about, only after CI is green on the branch.

## Rules (on top of the root `CLAUDE.md` golden rules)

- Develop on the session's designated branch; commit with the attribution lines the system gives; never put a model identifier in commits or files.
- Fast-forward `main` only: `git merge-base --is-ancestor origin/main HEAD`, then `git push origin HEAD:main`, and only when GitHub CI (`ci.yml`, both jobs `ci` and `engine-mod`) is green for that exact commit.
- Do not open pull requests unless the user asks.
- Line limits: root `CLAUDE.md` at most 70 lines, scoped ones at most 55. `DESIGN.md` keeps its 19 numbered H2 headings. British English, no emojis, "(verify at implementation)" for unverified versions.
- `tools/check-deps` forbids `26.<n>` literals outside `packages/targets`; version facts (folders, keys, formats, data version, biome attribute keys, Fabric and GeckoLib versions, URLs and hashes) live in the target.
- New plugins only via `tools/new-plugin`. Built-in plugins import only `@msm/plugin-api` and `@msm/schemas`; anything else a plugin would need (Blockbench import) lives in a package the app registers as a host contribution. The app never imports plugin internals.
- Studios register through `app/src/renderer/src/studios/<area>/studios.tsx`; never edit `ElementForm.tsx` for a new Studio.
- Element ids are unique across kinds in a project: linked elements need distinct ids (`amber_tree` / `amber_tree_placed`, `entity/ruby_golem` / `entity/ruby_golem_animations`).
- Never bundle Mojang assets; anything from the game comes from the user's own jar at runtime.
- `engine-mod/gradle.properties` `mod_version` equals `app/package.json` `version`; bump both together.
- MSM mcdoc changes: run `node tools/build-msm-mcdoc/index.ts` and keep `--check` green; the runtime's JUnit tests read the corpus in place.

## How to run a phase

1. Read `DESIGN.md` sections and the ROADMAP phase; verify facts against vendored data (`vendor/`, via `@msm/schemas` and `@msm/targets`) or the upstream source (Modrinth API and CDN, raw GitHub, `javap` over the Loom-cached jars), never from memory.
2. Write a plan (`docs/PHASE<n>-PLAN.md`, deleted at close): verified facts with sources, decisions (as ADR drafts), waves of briefs. Each brief names paths it owns, scope, acceptance, out of scope. Parallel executors never share a file; one lockfile owner per wave, and the scaffolds of new plugins come in Wave 0 so later waves need no lockfile change.
3. Launch executors (`subagent_type: executor`) in the background, one brief each. Tell each what changed since the plan, which files the others own, and not to commit.
4. Review each report. Commit each brief's files separately (only its paths), or checkpoint a wave in WIP commits (see lessons). Executor reports are model output: check claims, especially counts and "all green".
5. Verify every commit in a clean worktree (Turborepo's cache once hid a CI failure):
   ```
   W=<scratchpad>/wt; rm -rf $W; git worktree add -q $W HEAD; cd $W
   pnpm install --frozen-lockfile --offline
   npx tsc -b; npx biome ci .; node tools/check-deps/index.ts; node tools/build-msm-mcdoc/index.ts --check
   node_modules/.bin/turbo run test --force
   # engine-mod: cd engine-mod && JAVA_HOME=/root/jdk/jdk-25.0.5+8 ./gradlew clean build (and -PwithoutGeckolib)
   # app changes: pnpm build; xvfb-run -a pnpm --filter @msm/app e2e
   # phase close: also smoke, stage-runtime --require, dist:dir, smoke:packaged, node tools/check-size/index.ts
   cd -; git worktree remove --force $W
   ```
6. Push the branch, wait for GitHub CI (the `ci` job takes about two minutes, `engine-mod` longer; use the GitHub MCP `actions_list` on `ci.yml`), then fast-forward `main`.
7. Append a `DEVLOG.md` entry per wave; at phase close tick the ROADMAP, fill the Milestone Log row with numbers from the clean run, mark the ADRs accepted, bump `app/package.json` and `mod_version`, update the guide pages and the scoped `CLAUDE.md` status lines, delete the phase plan.

## Releases

- The session's git proxy rejects tag and branch-delete pushes (403). Build a release by triggering `release.yml` with the GitHub MCP `actions_run_trigger` (ref `main`, inputs `version`, `commit`), and publish it by triggering `publish-release.yml` (input `version`), which checks the three assets first. Both only with the user's explicit go-ahead each time.
- A manual run can tag only commits whose `.github/workflows/` match `main` (otherwise HTTP 403); release from the `main` tip.
- `.github/workflows/release.yml`: on a `v*` tag, or a manual run with a `version`, it guards tag = `app/package.json` version, creates the tag (manual runs; never moves an existing tag), creates one draft release first, builds `msm_runtime` with JDK 25 (`./gradlew build`, JUnit and GameTests included, GeckoLib from the Modrinth Maven) and stages it as `app/build/runtime/msm_runtime.jar`, runs `electron-builder --publish always`, checks the draft has exactly the `.exe`, `.exe.blockmap` and `latest.yml`, and checks the 150 MB installer budget. GeckoLib is not in the installer.
- The in-app updater only sees published releases. Bump the version in `app/package.json` (and `mod_version`) in the commit to be released.

## Environment notes

- Containers differ between sessions. In the Phase 5 sessions `/opt/node24/bin` (Node 24, `corepack enable --install-directory /opt/node24/bin pnpm`) and `/root/jdk/jdk-25.0.5+8` (Temurin 25.0.5) were present; put `/opt/node24/bin` first on PATH (the default `node` is 22). `pnpm turbo ...` fails with "Exec format error"; run `node_modules/.bin/turbo` directly. A new container may need Node 24 from nodejs.org and JDK 25 from `api.adoptium.net/v3/binary/latest/25/ga/linux/x64/jdk/hotspot/normal/eclipse` again.
- Network: `maven.geckolib.com` is blocked by the proxy; the Modrinth API, CDN and Maven (`https://api.modrinth.com/maven`) work. Maven Central sometimes answers 429: `-Dorg.gradle.internal.repository.max.retries=8` and a retry get past it.
- The container has no OpenGL or Vulkan backend for Minecraft: `runClient` under `xvfb-run` starts GeckoLib and the client entrypoint but cannot draw, so client rendering is only checked in game. The app's WebGL preview runs under xvfb with SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`, passed by the `entities-path` spec).
- Playwright: use the pre-installed Chromium; headless app runs need `xvfb-run -a`. Native Electron menus cannot be clicked in e2e: drive commands through the palette or the toolbar.
- `dist:dir` and the packaged smoke need a built runtime: `cd engine-mod && ./gradlew build`, then `node app/scripts/stage-runtime.mjs --require`.
- The user is on Windows with Node 26 (engines `>=24 <27`), PowerShell; README "Try it" covers their setup.

## Phase 5 lessons

- **Spike first, format in parallel.** Deciding the definition format in the plan and running the game-API spike (B110) next to the API bump (B111) and the mcdoc (B112) worked: the spike changed only details (renderer registration, mock players), which went into the ADR Status sections before Wave 1. Between B112 and B113 the runtime's corpus test had to skip the new `entity-*` files, because the JUnit tests read the corpus in place.
- **Non-remapping Loom has no `mod*` configurations.** A plain jar with a `fabric.mod.json` on the run classpath is a mod: `compileOnly` plus `localRuntime` keeps GeckoLib out of the built runtime, and a property (`-PwithoutGeckolib`) tests the runtime without it. Declare third-party Maven repositories as `exclusiveContent` so Gradle does not ask Maven Central first.
- **GameTests with mobs.** `Mob` calls `registerGoals` from its constructor, before subclass fields exist: look definitions up from a static map filled before registration. `makeMockPlayer` is not in the level (target goals cannot find it; use `setTarget`), `makeMockServerPlayerInLevel` is always creative (switch it to survival for `AvoidEntityGoal`), `RandomStrollGoal` stops after 100 ticks without a player nearby (reset `noActionTime`), `HurtByTargetGoal` ignores a hurt at tick 0, and the empty test structure has no floor.
- **Plugins cannot import other packages.** Blockbench import had to live in `@msm/interop` and be registered by the app as a host importer; the entities and library plugins copy small helpers (event checks, biped geometry) instead of importing each other.
- **Executors in parallel break each other's tests for a while.** While B118 was in flight, app tests counting plugins and importers failed in other briefs' runs; reviewers should tell such failures apart from the brief's own, and the wave's last verification is the one that counts.
- **WebGL in e2e.** The geo canvas mounts under xvfb only with SwiftShader switches; assert the canvas and transport, not pixels.
- **Counts drift.** The plan's targets (58 kinds, 112 templates, 12 starters, 66 examples) held, but were counted from the plugins' contributions at close, not copied.

## Phase 4 lessons worth keeping

- **WIP checkpoint commits.** The session's stop hook asks for a clean tree, so executors' files were checkpointed in "WIP" commits and each wave landed as one verified set; squash or describe them in the wave's final commit.
- **One main session only.** Check for other sessions on the phase before starting.
- **GameTest world light is flaky.** Assert a block's light emission, not the propagated world light.
- **Atomic writes.** Every install file system write in main goes through a temporary file and a rename (`withAtomicWrites`); e2e specs read exports as soon as they appear.
- Turbo's `@msm/app#test` inputs include `engine-mod/gradle.properties`, but run with `--force` at release time anyway.

## Phase 3 lessons worth keeping

- 26.3 data: loot uses `type`; pools use `condition`/`modifier`; `worldgen/feature` and `worldgen/carver` replace `configured_*`; feature configs are flat; `random_patch` is gone; biome sky, fog and water-fog colours are `minecraft:visual/*` attributes and spawns are `minecraft:gameplay/natural_mob_spawns` (from `target.worldgen.biomeAttributes`; Fabric's `BiomeModifications.addSpawn` writes it).
- deepslate 0.27.2's SNBT printer is wrong for long arrays, large doubles and bytes; the structures plugin has its own printer.
- Form coverage: the baseline in `app/test/components/form-coverage.test.tsx` must not grow.
