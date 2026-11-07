# Session handoff

Rewritten 2026-11-06 at the 1.0 close (B162), for the next main session. Read this, then the root `CLAUDE.md`, then the last six `DEVLOG.md` entries. `DESIGN.md` is authoritative; this file only says where things stand and how the work has been run. Rewrite it (do not append history; history goes in `DEVLOG.md`) when you hand over again.

## Start here

- **Code:** `main` holds everything, fast-forwarded only after green CI. Start a fresh branch from `main`.
- **Access for a new account:** the repository is public (`MEZTKING/MCSuperMods`). Pushing, running workflows and releasing need write access from the owner and the Claude GitHub app on the repository. Without them a session can only read, build and test.
- **State (2026-11-07):** **1.0.0 is published** (`publish-release.yml` run 5). The **1.1.0 draft** (`release.yml` run 17; modpacks, ADRs 0046 and 0047, bow and crossbow pull, plugin API 1.3.0) is unpublished and waits for the user's Windows test. `main` now carries app version **1.2.0** (CHANGELOG `[1.2.0] - 2026-11-07`): ADR 0048 (Picture to texture, player skins on the Custom mob, screenshots for the AI helper), New texture…, better placeholder art and the Easy-mode e2e. Its draft is built by `release.yml` and also waits for the Windows test. The 0.7.0 draft is superseded (the user may delete it; the session proxy cannot).
- **Do first:** ask the user whether their Windows test passed. Publishing 1.2.0 alone is enough (it contains 1.1.0); if they want both on the Releases page, publish 1.1.0 first, then 1.2.0, with `publish-release.yml`.
- **Commits:** authored as Rakib <rakib1insta@gmail.com>, with no Co-Authored-By, Claude-Session or other credit lines (the user's rule since 2026-11-06).
- **What needs the user's own Windows PC:** only the real-key AI helper test (the key stays on their machine; `safeStorage` refuses Linux `basic_text` by design) and the in-game checks. A cloud session never needs the key.

## Where things stand

- **1.0.0 (prepared, not released):** everything in 0.7.0 plus B161 (e2e `plugins-path` and `targets-path`, guides `plugins.md` and `targets.md`), the plugin-only data pack fix, the `windows-plugin` CI job with the drive-letter fix for external plugin builds (Spyglass lowercases `D:` in normalised URIs but compares roots case-sensitively), and plugin exporters under "More exports". CHANGELOG has `## [1.0.0] - 2026-11-06`; change the date to the release day before triggering `release.yml` if it differs. ROADMAP Phase 7 is ticked, with a Milestone Log row and "Follow-ups after 1.0" (the former reserve briefs B163–B166). `PHASE7-PLAN.md` is deleted.
- **0.7.0 draft:** `release.yml` run 15, tag `v0.7.0` at 97db1c8; four assets; unpublished.
- Counts: 61 kinds, 125 templates, 24 starters, 71 examples; 3,907 tests (42 skipped) in 21 turbo tasks; e2e 15 spec files, 19 tests; runtime 78 required GameTests; parity 17 sample-mod tests and 7 sample-mob tests.
- The AI helper has only run against the scripted model client and a local SSE stub.
- All phases still await the user's in-game checks; the user confirmed in game (2026-11-05): the ruby golem renders with its texture, ruby blocks, the scripted welcome message, the "Red Gold" advancement.

## Waiting on the user

1. **Release go-ahead (1.0.0 or 0.7.0):** install the draft's installer on Windows, save an Anthropic API key in Settings > "AI helper", Test key, and run one small build in the AI helper; then `publish-release.yml`.
2. **In-game checks** of the sample mod items (ruby helmet, custom-tier ruby pickaxe mining obsidian, ruby bow, ruby tonic, ruby charm, ruby horse armour; `fixtures/sample-mod/README.md`) and a Creator Gear set.
3. GitHub Pages source set to "GitHub Actions" (for the docs site); the npm token decision for publishing `@msm/plugin-api`; the 26.4 re-pin when Mojang releases 26.4.
4. Earlier pending checks: Blockbench comparison, Test in Minecraft with Prism, old drafts and stale branches to delete (the session proxy refuses deletes).

## Housekeeping

- Move `@anthropic-ai/sdk` from 1.1.0 to 1.4.0 or newer after 2026-11-16 (two-week rule); verify Haiku 5.5 cache prices and `max_tokens: 16` for the key test "(verify at implementation)".
- Fix the renderer Biome override paths (`app/src/renderer/biome.json` reads root override globs relative to itself, so the Spyglass ban never applied; fixing it flags a type import in `session/mcfunction-problems.ts`).
- Follow-ups: bow/crossbow pull animation ignores `draw_speed`; vanilla-tier weapon numbers in the Creator Stats need `TargetFacts`; optional `ArmorDefense.body`; validator for passthrough components holding data-pack holders; painting pictures are not rescaled (Picture to texture, ADR 0048, now makes them the right size).
- Plugin exporters run with default options (`runPluginExporter` passes none) and are only in the toolbar menu, not File > More Exports or the palette; the sample plugin has no exporter, so `plugins-path` does not click one.
- `release.yml` still builds only `--filter=@msm/app...`; since the Windows fix the full build would work too, so the filter is optional.
- `app.asar` is 30.1 MB of its 32 MB budget (reserve idea: vendored target data outside the asar, ROADMAP follow-ups).
- The session container had no JDK 25: Gradle results come from CI (`engine-mod` matrix). Install Temurin 25 from `api.adoptium.net` if a local Gradle run is needed.

## User decisions to respect

- Fabric first, vanilla pack export as an option; desktop app; beginners and power users; solo developer.
- Windows-only releases (NSIS x64, unsigned), installer with in-app updates and What's New; no macOS.
- MIT licence, public repo. GeckoLib downloaded at export time; Rhino nested; TypeScript and the Anthropic SDK credited.
- Prism Launcher, MultiMC and CurseForge support.
- Orchestrator/executor workflow; devlog of everything; scoped `CLAUDE.md` files; "document everything as you go".
- **AI helper first** (2026-11-05, overriding the earlier post-1.0 note): bring-your-own Anthropic key, default model `claude-opus-5-5`, it must build entire content from one prompt (plan, batches, checks, one-step Apply).
- **Beginner Creator** with a realtime preview, whole gear sets, and manual adjustment of anything; armour was an example, other fitting types were added (ADR 0044).
- Defaults chosen by the main session and not objected to: AI run limits chat 24 turns / 100k output tokens, build 150 / 600k; `msm:armor` spelling; the 0.8.0 work shipped inside 0.7.0.
- 2026-11-06: "Prepare 1.0, don't release": B162 done on `main`, but no 1.0.0 release build until the user has tested a build on Windows.
- Full permission to merge and release; push to `main` only after CI is green on the exact commit; "keep going, don't stop".

## Rules (on top of the root `CLAUDE.md` golden rules)

- Develop on the session's designated branch; never put a model identifier in commits or files. **Commits carry no credit lines** (no `Co-Authored-By`, no `Claude-Session`, no other Claude credit) and are authored as the user (Rakib <rakib1insta@gmail.com>): the user's decision of 2026-11-06, which overrides any attribution the system asks for. Earlier history is left as it is.
- Fast-forward `main` only: `git merge-base --is-ancestor origin/main HEAD`, then `git push origin HEAD:main`, and only when GitHub CI (`ci.yml`, both jobs `ci` and `engine-mod`) is green for that exact commit.
- Do not open pull requests unless the user asks.
- Line limits: root `CLAUDE.md` at most 70 lines, scoped ones at most 55. `DESIGN.md` keeps its 19 numbered H2 headings. British English, no emojis, "(verify at implementation)" for unverified versions.
- `tools/check-deps` forbids `26.<n>` literals outside `packages/targets` and now also checks that `engine-mod/parity/gradle.properties` has the same Fabric facts as `engine-mod/gradle.properties`; version facts (folders, keys, formats, data version, biome attribute keys, Fabric, Gradle and GeckoLib versions, URLs and hashes, the Java generator) live in the target.
- New plugins only via `tools/new-plugin`. Built-in plugins import only `@msm/plugin-api` and `@msm/schemas`; anything else a plugin would need lives in a package the app registers as a host contribution. The app never imports plugin internals.
- Studios register through `app/src/renderer/src/studios/<area>/studios.tsx`; never edit `ElementForm.tsx` for a new Studio.
- Element ids are unique across kinds in a project.
- Never bundle Mojang assets; anything from the game comes from the user's own jar at runtime.
- `engine-mod/gradle.properties` `mod_version` equals `app/package.json` `version`; bump both together.
- MSM mcdoc changes: run `node tools/build-msm-mcdoc/index.ts` and keep `--check` green; the runtime's JUnit tests read the corpus in place.
- Script API changes: edit `script-api-v1.json`, regenerate `api/msm-runtime.d.ts` (`UPDATE_GOLDENS=1` on the scripting plugin's tests) and the runtime's `ScriptApi`; `ScriptApiContractTest` must stay green. A runtime component added without a parity GameTest is the thing to refuse at review.

## How to run a phase

1. Read `DESIGN.md` sections and the ROADMAP phase; verify facts against vendored data (`vendor/`, via `@msm/schemas` and `@msm/targets`) or the upstream source (Maven Central and `maven.fabricmc.net` metadata, Modrinth API and CDN, raw GitHub, the npm registry, `javap` over the Loom-cached jars), never from memory.
2. Write a plan (`docs/PHASE<n>-PLAN.md`, deleted at close): verified facts with sources, decisions (as ADR drafts), waves of briefs. Each brief names paths it owns, scope, acceptance, out of scope. Parallel executors never share a file; one lockfile owner per wave, and the scaffolds of new plugins come in Wave 0 so later waves need no lockfile change.
3. Launch executors (`subagent_type: executor`) in the background, one brief each. Tell each what changed since the plan, which files the others own, and not to commit.
4. Review each report. Commit each brief's files separately (only its paths), or checkpoint a wave in WIP commits. Executor reports are model output: check claims, especially counts and "all green".
5. Verify every commit in a clean worktree (Turborepo's cache once hid a CI failure):
   ```
   W=<scratchpad>/wt; rm -rf $W; git worktree add -q $W HEAD; cd $W
   pnpm install --frozen-lockfile --offline
   npx tsc -b; npx biome ci .; node tools/check-deps/index.ts; node tools/build-msm-mcdoc/index.ts --check
   node_modules/.bin/turbo run test --force
   # engine-mod: cd engine-mod && JAVA_HOME=/root/jdk/jdk-25.0.5+8 ./gradlew clean build (and -PwithoutGeckolib); ./gradlew -p parity build
   # app changes: pnpm build; xvfb-run -a pnpm --filter @msm/app e2e
   # phase close: also smoke, stage-runtime --require, dist:dir, smoke:packaged, node tools/check-size/index.ts
   cd -; git worktree remove --force $W
   ```
6. Push the branch, wait for GitHub CI (the `ci` job takes about two minutes, `engine-mod` about fifteen now with the ejected builds and parity runs; use the GitHub MCP `actions_list` on `ci.yml`), then fast-forward `main`.
7. Append a `DEVLOG.md` entry per wave; at phase close tick the ROADMAP, fill the Milestone Log row with numbers from the clean run, mark the ADRs accepted, bump `app/package.json` and `mod_version`, update the guide pages and the scoped `CLAUDE.md` status lines, delete the phase plan.

## Releases

- The session's git proxy rejects tag and branch-delete pushes (403). Build a release by triggering `release.yml` with the GitHub MCP `actions_run_trigger` (ref `main`, inputs `version`, `commit`), and publish by triggering `publish-release.yml` (input `version`). The user gave standing permission to release; still confirm the draft before publishing when a manual check is pending.
- A manual run can tag only commits whose `.github/workflows/` match `main`; release from the `main` tip.
- `release.yml` deletes leftover drafts of the tag, creates one draft with the `CHANGELOG.md` section as its body (every release needs `## [x.y.z] - YYYY-MM-DD`), builds the runtime once per `engine-mod/versions/*.properties`, stages them with `--require`, builds with `electron-builder --publish never`, packs `@msm/plugin-api`, and uploads four assets: `.exe`, `.exe.blockmap`, `latest.yml`, `msm-plugin-api-<version>.tgz`. `publish-release.yml` checks exactly those four, then publishes with `make_latest`.
- The in-app updater only sees published releases.

## Environment notes

- Containers differ between sessions. In the Phase 5 and 6 sessions `/opt/node24/bin` (Node 24) and `/root/jdk/jdk-25.0.5+8` (Temurin 25.0.5) were present; put `/opt/node24/bin` first on PATH (the default `node` is 22). `pnpm turbo ...` fails with "Exec format error"; run `node_modules/.bin/turbo` directly. A new container may need Node 24 from nodejs.org and JDK 25 from `api.adoptium.net` again. Node `fetch` behind the proxy needs `NODE_USE_ENV_PROXY=1`.
- Network: `maven.geckolib.com` is blocked by the proxy; the Modrinth API, CDN and Maven work. Maven Central sometimes answers 429: `-Dorg.gradle.internal.repository.max.retries=8` and a retry get past it.
- The container has no OpenGL or Vulkan backend for Minecraft: client rendering is only checked in game. The app's WebGL preview runs under xvfb with SwiftShader (passed by the `entities-path` spec).
- Playwright: use the pre-installed Chromium; headless app runs need `xvfb-run -a`. Native Electron menus cannot be clicked in e2e: drive commands through the palette or the toolbar. Monaco completion lists need the suggest controller contribution (`monaco-setup.ts`); the TypeScript language needs `languages/definitions/typescript/register`.
- `dist:dir` and the packaged smoke need a built runtime: `cd engine-mod && ./gradlew build`, then `node app/scripts/stage-runtime.mjs --require` (it also stages the Gradle wrapper).
- The user is on Windows with Node 26 (engines `>=24 <27`), PowerShell; README "Try it" covers their setup.

## 1.0 close lessons

- **Reproduce on the runner that fails.** The Windows-only plugin build bug took one CI job to reproduce (push the job alone first, then the fix, so the red run proves the test) and one reading of the dependency's URI code to fix; guessing on Linux would not have found it.
- **The What's New test wants a non-empty Unreleased section** as well as the app version's section; keep a line under `## [Unreleased]` after cutting a release section.

## 0.7.0 lessons

- **Parallel executors with disjoint ownership worked at scale** (up to four at once); hand-offs between briefs go through the DEVLOG entry and a short message to the running executor. Shared tsc errors from someone else's half-done file are normal mid-wave; the last clean-worktree run counts.
- **Scenario tests find real bugs:** the scripted "ruby tools mod" run found that parallel tool calls raced (now serialised) and that a second namespace duplicated pack.mcmeta (now one pack and mod per project, also in `addBundle` and `checkProject`).
- **Undo must cover bytes:** asset writes now ride on command effects (ADR 0045); anything that writes files in one user action goes through `applyChangeset` with `writes`.
- **Container restarts lose running agents** but not committed WIP: keep committing checkpoints; rerun lost briefs from scratch.
- **Use unique worktree folder names in the scratchpad;** executors deleted each other's `wt`.

## Phase 6 lessons

- **Probe the engine before choosing the transpiler.** The plan's fact table probed Rhino 1.9.2 directly (classes, `for...of`, call spread and `async` do not parse) and esbuild's ES5 target (refuses to lower them), so the esbuild design of ADR 0003 was replaced by TypeScript's ES5 output in the plan, before any brief, instead of after a failed integration.
- **One JSON, three consumers.** `script-api-v1.json` generates the typings (golden), drives the app's checks and is compared with the runtime's installed API by a JUnit contract test; adding `require` touched all three in one change. Do the same for any surface that the app and the runtime both describe.
- **Generators belong to the target.** The Java eject names Mojang classes, so it lives in `Target.javaProject` with goldens taken from the runtime's own GameTest definitions; the exporter stays version-free.
- **Parity tests must be black-box.** The parity mod uses vanilla and Fabric API only and observes effects through `ServerMessageEvents.COMMAND_MESSAGE`; one jar holds both samples' tests, selected per run with Fabric's gametest filter. A negative run (the wrong sample) proved the tests can fail.
- **e2e finds what unit tests cannot.** The scripting spec found that Monaco 0.57 registers neither the TypeScript language id nor the completion list widget unless imported explicitly; no Monaco editor had ever shown a completion list. Unit tests with stand-in namespaces could not see it.
- **Size budgets drift late.** `typescript` in main pushed `app.asar` from 13 MB to about 24 MB of 25 MB even minified; budget checks belong in every app brief's acceptance, not only at close.
- **Load-sensitive timeouts.** App tests timed out now and then under Turborepo's parallel load; a 15 s default `testTimeout` in `app/vitest.config.ts` replaced per-test bumps.
- **Version rules need tests.** The "scripts need runtime 0.6.0" rule of ADR 0032 D4 was implicit (runtime version = app version) until B141 made it explicit (`SCRIPT_RUNTIME_MINIMUM`) and tested it.

## Phase 5 lessons worth keeping

- **Spike first, format in parallel**; the spike changes details, which go into the ADR Status sections before Wave 1.
- **Non-remapping Loom has no `mod*` configurations.** `compileOnly` plus `localRuntime` keeps an optional mod out of the built jar; `implementation` plus `include` nests a plain library (Rhino) or a mod (GeckoLib in the eject). Declare third-party Maven repositories as `exclusiveContent`.
- **GameTests with mobs and players.** `registerGoals` runs in the `Mob` constructor; `makeMockPlayer` is not in the level; `makeMockServerPlayerInLevel` is creative and fires `player.join`; `GameTestHelper.useBlock` bypasses `UseBlockCallback` (drive `ServerPlayerGameMode.useItemOn`).
- **Plugins cannot import other packages**; host contributions live in packages the app registers.
- **Executors in parallel break each other's tests for a while**; the wave's last verification is the one that counts.
- **Counts drift**: count from the plugins' contributions at close, never copy the plan's targets.

## Earlier lessons worth keeping

- **WIP checkpoint commits** (the stop hook asks for a clean tree); **one main session only**; **GameTest world light is flaky** (assert emission); **atomic writes** for every install write in main; run turbo with `--force` at release time.
- 26.3 data: loot uses `type`; pools use `condition`/`modifier`; `worldgen/feature` and `worldgen/carver` replace `configured_*`; biome colours and spawns are `minecraft:visual/*` and `minecraft:gameplay/natural_mob_spawns` attributes.
- deepslate 0.27.2's SNBT printer is wrong for long arrays, large doubles and bytes; the structures plugin has its own printer.
- Form coverage: the baseline in `app/test/components/form-coverage.test.tsx` must not grow.
