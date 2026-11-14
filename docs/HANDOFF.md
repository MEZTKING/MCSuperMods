# Session handoff

Rewritten 2026-11-14 at the close of the mob expansion batch, for the next main session. Read this, then the root `CLAUDE.md`, then the last six `DEVLOG.md` entries. `DESIGN.md` is authoritative; this file only says where things stand and how the work has been run. Rewrite it (do not append history; history goes in `DEVLOG.md`) when you hand over again.

## Start here

- **Code:** `main` holds everything, fast-forwarded only after green CI. Start a fresh branch from `main`. At this close the batch (B282–B308) sits on the session branch above `main` (`main` is at 9a38c27, the wave 3 GameTest stubs); push it to `main` only after the clean-worktree run and a green CI on the exact commit.
- **Access for a new account:** the repository is public (`MEZTKING/MCSuperMods`). Pushing, running workflows and releasing need write access from the owner and the Claude GitHub app on the repository. Without them a session can only read, build and test.
- **State (2026-11-14):** **1.0.0 is published.** Drafts 1.1.0, 1.2.0 and 1.3.0 await the user's Windows test; 1.4.0 is prepared on `main` but not built. Unreleased on top of it (CHANGELOG `[Unreleased]`): the runtime fixes batch, the vanilla additions batch, the potions, data kinds and Script API 1.1 batch, vanilla pack safety (ADR 0066), the block types, crops, saplings and trees batch (ADRs 0067–0069) and the mob expansion (ADRs 0070–0073). All ADRs up to 0073 are accepted.
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
  - Vanilla pack safety ([ADR 0066](adr/0066-vanilla-pack-safety.md)): data files naming mod-only ids are left out of vanilla data packs; CI loads every library project's vanilla data pack on both targets.
  - Block types, crops, saplings and trees (B258–B281; ADRs 0067–0069).
  - **Mob expansion** (B282–B308; ADRs 0070–0073 accepted 2026-11-14 with findings): `base` (`mob`, `animal`, `monster`) picks `PathfinderMob`, `TamableAnimal` or `Monster`; movement modes `fly`, `swim`, `amphibious`; `msm:ranged_attack` with the runtime's own ranged goal; `msm:tameable` (tame before breed, as wolves and cats), `msm:breedable` with babies, `msm:rideable` with saddles, `msm:variants`, `msm:boss_bar`; goals `ranged_attack`, `tempt`, `panic`, `leap_at_target`; spawn rules `animal` and `water_animal`; `renderer` (`auto`, `geckolib`, `vanilla`) with the runtime's own vanilla renderer in `client/vanilla/`, so mobs need no GeckoLib and work on 26.4 (GeckoLib still nested on 26.3 for `auto`); `MobDriver` with feature modules; plugin API 1.11.0 (`TargetFacts.entities`); Entity Studio Kind of mob and seven sections, renderer picker, preview variant and baby; preset models; Creator flows Pet, Farm animal, Mount, Flying mob, Water mob and Boss; seven templates; six examples; Java eject of all of it; AI helper knowledge; e2e `mobs-path`; `fixtures/sample-creatures` with 12 parity tests on the 26.3 content jar, the 26.3 ejected jar and the 26.4 content jar; guide page `mob-behaviours.md`. ADR 0070's findings keep the batch's fact table (F1–F18) and limits (M1–M17).
- Counts (from the plugins' contributions and the sources at close): 94 kinds, 177 templates (resourcepack 16, datapack 66, structures 9, worldgen 22, blocks-items 45, models-anim 3, entities 10, scripting 6), 42 starters (30 Creator flows), 125 examples, 64 placeholder patterns; plugin API 1.11.0; runtime 309 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4) and 488 JUnit; parity: sample mod 83, sample mob 10, sample script 15, sample creatures 12. `app.asar` is 31.3 of its 32 MB budget. A full clean-worktree test run is made by the main session at this close; record its total in the DEVLOG and the Milestone Log row before pushing to `main`.
- CI also runs the two-run restart of the sample script server, the vanilla data pack check of the sample data pack and of every library project, and exports, server-checks and parity-runs the sample mob and sample creatures on every version (creatures also ejected on 26.3).
- The AI helper has only run against the scripted model client and a local SSE stub.
- All phases still await the user's in-game checks; the user confirmed in game (2026-11-05): the ruby golem renders with its texture, ruby blocks, the scripted welcome message, the "Red Gold" advancement.

## Waiting on the user

1. **Windows test of the drafts (1.1.0 to 1.3.0)**, then the go-ahead to build 1.4.0 with `release.yml` and publish. Also the real-key AI helper test (save an Anthropic key in Settings > "AI helper", Test key, run one small build).
2. **In-game checks, new with this batch** (on 26.3 and 26.4): the checklist in `fixtures/sample-creatures/README.md` (the pet tamed, sitting, following and defending, bred babies that belong to the owner; the mount saddled, steered, jumping, the saddle dropping and sheared off; the glider flying and shooting sparks; the fish swimming, flopping and drying out, its two variants; the archer strafing and shooting; the boss bar, its notches, music only in the End; how each is drawn by GeckoLib on 26.3 and by the built-in renderer on 26.4, wing and leg signs, babies at half size, the saddle bone shown only when saddled), and the sample mob's "On 26.4 and the two renderers" notes in `fixtures/sample-mob/README.md` (the golem drawn by the built-in renderer: shape, skin, idle, walk, attack). Also a Creator mob of each flow, exported and loaded; `launch` on a ridden mount (limit M2).
3. **Earlier in-game checks:** the "Block types and plants" section of `fixtures/sample-mod/README.md`, the leaf tint, Creator Wood set, Stone set, Crop and Tree, a farmer villager replanting; the sample mod items and a Creator Gear set; the effects and throwables checklist; the feature-order confirmation; the Music disc starters; from the runtime fixes batch: own and mob sounds, the ruby spring on mobs, script commands and the cancel resync, the block shapes checklist, the villager trade; from the vanilla additions batch: ore in a **new** world, the zombie's extra drop, fuel and compost, each trigger, the golem's `on_tick` and `on_spawn`, the script counters across a quit and reopen; from the potions batch: potion names, colours and creative tab entries, brewing, splash, lingering and tipped arrow, the Script API 1.1 sample scripts, a killing blow firing `entity.damaged` once, the wolf skin and goat horn, titles, action bar and boss bar, XP, hunger and game mode without a relog.
4. **Vetoable defaults of this batch** (ADRs 0070–0073): the field name `base` with values `mob`, `animal`, `monster`, and absent meaning `mob`; the component names `msm:ranged_attack`, `msm:tameable`, `msm:breedable`, `msm:rideable`, `msm:variants`, `msm:boss_bar`; the movement defaults (`flying_speed` 0.4, hovering on, dry out after 300 ticks); ranged defaults copying a skeleton (damage 2, speed 1.6, inaccuracy 6, 40 ticks between shots, 20 to aim, range 15); a wolf's taming defaults (chance 0.33, follow 1.0 from 10 to 2 blocks); babies at half size growing up in 24000 ticks (20 minutes); a saddle needed by default and anyone may ride; variants saved by id under `Variant`; purple progress boss bars seen by every tracking player; `renderer: auto` with GeckoLib preferred where the target has it; the renderer reading GeckoLib's resource paths; ejected projects drawing every mob with GeckoLib; the flow names "Pet", "Farm animal", "Mount", "Flying mob", "Water mob", "Boss"; a Boss spawning only from its egg; the preset shapes. Earlier batch (ADRs 0067–0069): the `type` field, the stairs base `minecraft:stone`, the flow names "Wood set", "Stone set", "Crop", "Tree", the Wood set's members, untinted leaves, "Villagers plant it" on, fences joining `wooden_fences` by sound type; and before that: `msm:potion`, `long_`/`strong_` ids, the potion flows' names, the `player.tick` minimum of 5 ticks, 32 boss bars per namespace, the 128-block raycast limit.
5. GitHub Pages source set to "GitHub Actions" (docs site); the npm token decision for publishing `@msm/plugin-api`; the 26.4 re-pin when Mojang releases 26.4.
6. Earlier pending checks: Blockbench comparison, Test in Minecraft with Prism, old drafts and stale branches to delete (the session proxy refuses deletes).

## Open follow-ups

- Mobs (ADRs 0070–0073 findings): one GeckoLib-free `registry/mob/MobStates` helper with one definition of moving, shared by `GeoControllers` and `MsmVanillaModel`; head look in the built-in renderer; forward `onSyncedDataUpdated` to `MobBossBar` so `NoAI` bosses keep their bar; `/ride` firing `on_mount` through an `addPassenger` hook in the bodies; mount fall damage reduced as a horse's; a `canMate` override in the bodies so `BreedGoal` never walks two wild pets together; a registrar load-time error for unknown projectiles (now one runtime error at the first shot); a cap or warning on ridden `speed` (the vehicle check resets moves above 10 blocks a tick); the preview's baby toggle re-fitting the camera; Creator previews passing variant and baby; flows offering project items for food and projectiles; the Fabric jar named per target (`<ns>.jar` today, so a second target's export overwrites the first); a proper `MSM_E2E_*` stub-jar hook for e2e; `fixtures/geo-parity` declared as a Gradle test input; the unused library gate `hasGeckolib` and `steps.facts.outputs.geckolib` in `ci.yml`.
- Block types (ADRs 0067–0069 findings): the dock preview (`PreviewPanel.modelFieldSubject`) ignores typed blocks; no general "Item id" field outside crops; separate crop block and item names; a switch for the leaves item tint and `textures.item`; the AI helper's `create_texture` has no accent colour; `makeMockServerPlayerInLevel` is deprecated in the GameTests; the 26.4 flammability goes through reflection on `FireBlock.setFlammable` (an access widener if a 26.4 build breaks it).
- `wolf_sound_variant` waits on vanilla-mcdoc upstream (`step_sound` missing from `WolfSounds`; the report text is in ADR 0064); `trial_spawner` is back.
- Boss bar removal on server stop is untested (`/reload` and leave are covered).
- `on_attack` against a player runs `run_function` as the victim: decide whether the attacking mob should be the actor.
- Effect and thrown-item events could use the holder or thrower as the actor (still player-only).
- Implicit tag ids in the schema validator (then the ore starters use the replaceable tags instead of `block_match`).
- B243: the real chunk-generation check on a dedicated server (reserve).

## Next

Backlog order from `docs/COVERAGE-AUDIT.md` section 3 (B2, B7 and B12 are closed): **B8 containers and machines**, then B13 (custom portal and dimension type editing), B14 (particles), B15 (client side for power users). Each needs a plan file and ADRs first. Deferred mob work (brain-driven mobs, special flight, held weapons, fish buckets, mount inventories, model variants, boss phases) is listed in ADR 0070 D9 and ADR 0071 D10; deferred block work in ADR 0067 D11 and ADR 0068 D9. With `app.asar` at 31.3 of 32 MB, the next batch that adds library content or vendored data should first move vendored target data out of the asar (audit L15).

## Housekeeping

- Move `@anthropic-ai/sdk` from 1.1.0 to 1.4.0 or newer after 2026-11-16 (two-week rule); verify Haiku 5.5 cache prices and `max_tokens: 16` for the key test "(verify at implementation)".
- Fix the renderer Biome override paths (`app/src/renderer/biome.json` reads root override globs relative to itself, so the Spyglass ban never applied; fixing it flags a type import in `session/mcfunction-problems.ts`).
- Plugin exporters run with default options (`runPluginExporter` passes none); the sample plugin has no exporter, so `plugins-path` does not click one.
- `release.yml` still builds only `--filter=@msm/app...`; the full build would work too, so the filter is optional.
- `app.asar` is 31.3 MB of its 32 MB budget after the mob expansion; re-check with `node tools/check-size/index.ts` before the 1.4.0 build and in every app or library brief (reserve idea: vendored target data outside the asar, ROADMAP follow-ups).
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

## Mob expansion lessons

- **Verify the third-party library's behaviour, not only its API:** GeckoLib 5.5.7 never applies `getAgeScale` (babies drew adult-sized) because `GeoEntityRenderer` is not a `LivingEntityRenderer`; the runtime now scales them. Read the renderer's call chain with `javap -c` before relying on a vanilla hook.
- **A cross-language golden replaces a screen:** with no OpenGL in the container, the app's preview baker and the Java `ModelPart` baker are tied by shared vertex positions (`fixtures/geo-parity/`), which found the UV and sign rules before anything was drawn.
- **Copy vanilla's rules when combining features:** taming and breeding on one mob first let wild pets breed; vanilla wolves and cats breed only once tamed, which the main session made the rule after review, with GameTests on the real right-click path.
- **Vanilla's own lookups can reserve names:** `createPartLookup` maps the root part as `root`, so animations of a bone named `root` were unreachable; bind channels by private keys.
- **Record every "verify at implementation" answer in the notes list:** the plan's open facts (bee flying speed, dry-out time, vehicle check, boss music, saddle drops, tracking range) were each answered by the brief that met them and moved into the ADR findings at close.

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
