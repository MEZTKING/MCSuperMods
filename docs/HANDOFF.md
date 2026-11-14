# Session handoff

Rewritten 2026-11-14 at the close of the block types, crops, saplings and trees batch, for the next main session. Read this, then the root `CLAUDE.md`, then the last six `DEVLOG.md` entries. `DESIGN.md` is authoritative; this file only says where things stand and how the work has been run. Rewrite it (do not append history; history goes in `DEVLOG.md`) when you hand over again.

## Start here

- **Code:** `main` holds everything, fast-forwarded only after green CI. Start a fresh branch from `main`. At this close the batch (B258–B281) sits on the session branch above `main` (`main` is at B267, b974c12); push it to `main` only after the clean-worktree run and a green CI on the exact commit.
- **Access for a new account:** the repository is public (`MEZTKING/MCSuperMods`). Pushing, running workflows and releasing need write access from the owner and the Claude GitHub app on the repository. Without them a session can only read, build and test.
- **State (2026-11-14):** **1.0.0 is published.** Drafts 1.1.0, 1.2.0 and 1.3.0 await the user's Windows test; 1.4.0 is prepared on `main` but not built. Unreleased on top of it (CHANGELOG `[Unreleased]`): the runtime fixes batch, the vanilla additions batch, the potions, data kinds and Script API 1.1 batch, vanilla pack safety (ADR 0066) and the block types, crops, saplings and trees batch (ADRs 0067–0069). All ADRs up to 0069 are accepted.
- **Do first:** ask whether the Windows test of the newest draft passed. Publishing the newest draft alone delivers everything before it; to list every version, publish them in order with `publish-release.yml`. Build 1.4.0 only after that go-ahead.
- **Commits:** authored as Rakib <rakib1insta@gmail.com>, with no Co-Authored-By, Claude-Session or other credit lines (the user's rule since 2026-11-06).
- **What needs the user's own Windows PC:** only the real-key AI helper test (the key stays on their machine; `safeStorage` refuses Linux `basic_text` by design) and the in-game checks. A cloud session never needs the key.

## Where things stand

- **Published:** 1.0.0. **Drafts awaiting the user's Windows test:** 1.1.0 (`release.yml` run 17), 1.2.0 (run 18) and 1.3.0; each contains the ones before it. The 0.7.0 draft is superseded.
- **1.4.0 prepared, not built:** app and `mod_version` 1.4.0, CHANGELOG `[1.4.0] - 2026-11-13` (change the date to the release day if it differs; keep a non-empty `[Unreleased]`). Content: custom status effects and throwables (ADRs 0055, 0056), the Dimension flow (ADR 0051), launch and real pushes (ADR 0052), the Wishlist (ADR 0053), picture options and texture drag and drop (ADR 0054), the feature order fix, the Music disc `sound_id` fix, the `sound_event` check in Problems and the eject `Actions.java` fix. A release build is triggered only after the user's go-ahead on the drafts.
- **Done and unreleased** (CHANGELOG `[Unreleased]`; the version stays 1.4.0 until a release is cut; history in the DEVLOG, plans deleted):
  - Runtime fixes and sounds (B212–B228; ADRs 0057–0059).
  - Vanilla additions, triggers and saved data (B229–B242 and B144; ADRs 0060–0062). B243 stays in reserve.
  - Potions, data kinds and Script API 1.1 (B244–B257; ADRs 0063–0065).
  - Vanilla pack safety ([ADR 0066](adr/0066-vanilla-pack-safety.md), accepted 2026-11-14): data files naming mod-only ids are left out of vanilla data packs (`export.mod-only-reference`), tag entries become `required: false`, functions warn (`export.mod-only-function`). The rule lives in `@msm/exporters` (381cddf), and CI's "Headless vanilla server check (library data packs)" loads every starter, example and mirror project's vanilla data pack, mod projects included, on both targets; green in every run since.
  - **Block types, crops, saplings and trees** (B258–B281; ADRs 0067–0069 accepted 2026-11-14 with findings): a `type` field on `msm:block` with 17 types (pillar, horizontal, directional, slab, stairs, wall, fence, fence gate, door, trapdoor, button, pressure plate, pane, crop, sapling, leaves); `item.id` for seeds; `msm:flammable` (26.4 has no Fabric flammability registry, so a reflection seam) and `msm:strippable` (axe stripping through `UseBlockCallback`); leaf tint as the runtime's first client block hook; the Tree Studio and "Tree for a sapling"; Block Studio Type picker, Textures, Models and plant sections with a 3D preview; Creator flows Wood set, Stone set, Crop and Tree; Java eject of every type; plugin API 1.10.0 (`TargetFacts.blocks`); guide page `block-types-and-plants.md`; families e2e (B277); the sample mod gained a maple wood set, ruby bricks and ruby berries with 15 parity tests.
- Counts (from the plugins' contributions and the sources at close): 93 kinds, 169 templates (resourcepack 16, datapack 65, structures 9, worldgen 22, blocks-items 45, models-anim 3, entities 3, scripting 6), 36 starters, 118 examples, 64 placeholder patterns; 22-tool AI catalogue; plugin API 1.10.0; runtime 239 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4; 238 `@GameTest` methods) and 414 JUnit; parity: sample mod 83, sample mob 10, sample script 15. A full clean-worktree test run was being made by the main session at this close; record its total in the DEVLOG and the Milestone Log row before pushing to `main`.
- CI also runs the two-run restart of the sample script server, the vanilla data pack check of the sample data pack and of every library project (`tools/run-fabric-server/vanilla-packs.ts`).
- The AI helper has only run against the scripted model client and a local SSE stub.
- All phases still await the user's in-game checks; the user confirmed in game (2026-11-05): the ruby golem renders with its texture, ruby blocks, the scripted welcome message, the "Red Gold" advancement.

## Waiting on the user

1. **Windows test of the drafts (1.1.0 to 1.3.0)**, then the go-ahead to build 1.4.0 with `release.yml` and publish. Also the real-key AI helper test (save an Anthropic key in Settings > "AI helper", Test key, run one small build).
2. **In-game checks, new with this batch:** the "Block types and plants" section of `fixtures/sample-mod/README.md` (every maple member placed and drawn, Ruby Bricks wall, doors, trapdoors, gates, buttons and plates by hand and by redstone, axe stripping, the sapling growing a maple tree, leaf decay, maple trees in new forest chunks, ruby berries growing and harvested, composting, fire and lava); the **leaf tint** (a Creator Wood set with Leaf tint "Foliage colour" turns the biome's foliage colour; the client hook cannot be tested in CI); a **Creator Wood set, Stone set, Crop and Tree** of the user's own, exported and loaded; a **farmer villager** harvesting and replanting a ripe crop (on 26.3 and 26.4).
3. **Earlier in-game checks:** the sample mod items and a Creator Gear set; the effects and throwables checklist in `fixtures/sample-mod/README.md`; the feature-order confirmation; the Music disc starters; from the runtime fixes batch: own and mob sounds, the ruby spring on mobs, script commands and the cancel resync, the block shapes checklist, the villager trade; from the vanilla additions batch: ore in a **new** world, the zombie's extra drop, fuel and compost, each trigger, the golem's `on_tick` and `on_spawn`, the script counters across a quit and reopen; from the potions batch: potion names, colours and creative tab entries, brewing in a real stand, splash, lingering and tipped arrow, the Script API 1.1 sample scripts (`fixtures/sample-script/README.md`), a killing blow firing `entity.damaged` once, the wolf skin and goat horn (`fixtures/sample-datapack/README.md`), titles, action bar and boss bar, XP, hunger and game mode without a relog.
4. **Vetoable defaults of this batch** (ADRs 0067–0069): the `type` field on `msm:block` instead of a kind per family; the stairs base `minecraft:stone`; the flow names "Wood set", "Stone set", "Crop" and "Tree"; the Wood set's default members (all fifteen); untinted, pre-coloured leaves by default; "Villagers plant it" on by default; fences joining `wooden_fences` by sound type. Earlier batch: kind name `msm:potion`; variant ids `long_<id>` and `strong_<id>`; default reagents and base; flow names "Potion", "Mob skin", "Goat horn"; the `player.tick` minimum of 5 ticks; 32 boss bars per namespace; the 128-block raycast limit.
5. GitHub Pages source set to "GitHub Actions" (docs site); the npm token decision for publishing `@msm/plugin-api`; the 26.4 re-pin when Mojang releases 26.4.
6. Earlier pending checks: Blockbench comparison, Test in Minecraft with Prism, old drafts and stale branches to delete (the session proxy refuses deletes).

## Open follow-ups

- Block types (ADRs 0067–0069 findings): the dock preview (`PreviewPanel.modelFieldSubject`) ignores typed blocks; there is no general "Item id" field outside crops; crops need separate block and item names (the seeds take the block's name); no field turns off the leaves item tint and there is no `textures.item`; the AI helper's `create_texture` has no accent colour (the placeholder patterns take one); `makeMockServerPlayerInLevel` is deprecated in the GameTests; the 26.4 flammability goes through reflection on `FireBlock.setFlammable` (replace with an access widener if a 26.4 build breaks it).
- Re-sync the stale vendored mcdoc (`tools/sync-mcdoc`; its wolf sound variant lacks `step_sound`, and the trial spawner files' `IsBaby` is a number where the entity schema wants a boolean), then add `wolf_sound_variant` and `trial_spawner` back (ADR 0064 finding).
- Boss bar removal on server stop is untested (`/reload` and leave are covered).
- `on_attack` against a player runs `run_function` as the victim: decide whether the attacking mob should be the actor.
- Effect and thrown-item events could use the holder or thrower as the actor (still player-only).
- Implicit tag ids in the schema validator (then the ore starters use the replaceable tags instead of `block_match`).
- B243: the real chunk-generation check on a dedicated server (reserve).

## Next

Backlog order from `docs/COVERAGE-AUDIT.md` section 3 (B2 and B12 are closed): **B7 mob expansion**, then B8 (containers and machines), B13 (custom portal and dimension type editing), B14 (particles), B15 (client side for power users). Each needs a plan file and ADRs first. Deferred block work (signs, boats, own set-type sounds, copper weathering, stems, berry bushes, double plants, ladders, torches, lanterns, waterlogging for plain and facing blocks) is listed in the audit's Blocks row and ADR 0067 D11 and ADR 0068 D9.

## Housekeeping

- Move `@anthropic-ai/sdk` from 1.1.0 to 1.4.0 or newer after 2026-11-16 (two-week rule); verify Haiku 5.5 cache prices and `max_tokens: 16` for the key test "(verify at implementation)".
- Fix the renderer Biome override paths (`app/src/renderer/biome.json` reads root override globs relative to itself, so the Spyglass ban never applied; fixing it flags a type import in `session/mcfunction-problems.ts`).
- Plugin exporters run with default options (`runPluginExporter` passes none); the sample plugin has no exporter, so `plugins-path` does not click one.
- `release.yml` still builds only `--filter=@msm/app...`; the full build would work too, so the filter is optional.
- `app.asar` was 30.1 MB of its 32 MB budget at 1.0; re-check with `node tools/check-size/index.ts` before the 1.4.0 build (reserve idea: vendored target data outside the asar, ROADMAP follow-ups).
- JDK 25 can be installed from `api.adoptium.net` into `/root/jdk` (it worked in the 2026-11-13 session); then `JAVA_HOME=/root/jdk/<jdk-dir> ./gradlew build` in `engine-mod/` runs locally. CI (`engine-mod` job) remains the check.
- Follow-ups kept in ROADMAP Post-1.0 Ideas: 3D thrown models, return flight, custom arrows and instant effects (brewing arrived with ADR 0063).

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
- Worldgen background (reference only, user's note of 2026-11-13): the user's other project has a world generator matched to the vanilla reference on its branch `claude/parity` (draft PR #448), explained in its `docs/PARITY-DISCOVERIES.md`, `docs/parity-ledger.md` and "Vanilla Jar/tools/README.md". Useful for how feature order and seeds work (feature seed = population seed + index + 10000 x step; placed features ordered by step, then sorted across biomes, not by file order), the three block-state forms, and measurement traps (count block states, not names; use full chunks). It is not part of this repo: read it for understanding, never copy reference game files, and keep fixed-seed examples land-independent.

## Block types batch lessons

- **A "Notes from implementation" list in the plan carried facts between waves** (model slot names, helper names, seams, what a later brief must change); briefs read it before starting. At close it goes into the ADR findings, then the plan is deleted.
- **Check a Fabric module exists on every target before designing on it:** `fabric-content-registries-v0` is missing from the 26.4 build, which turned flammability into a reflection seam mid-batch.
- **Run each Creator flow with its untouched defaults in e2e:** the Crop flow's optional seeds name failed "Enter a value." and only the families e2e found it.
- **Unique ids across kinds bite generated content:** a set cannot have a block tag and an item tag with the same id; flows must pick distinct ids up front.

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
