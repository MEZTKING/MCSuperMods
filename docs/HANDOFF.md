# Session handoff

Rewritten 2026-11-05 by the main session that runs Phase 4 (Waves 0–2), for the next main session. Read this, then the root `CLAUDE.md`, `docs/PHASE4-PLAN.md`, then the last four `DEVLOG.md` entries. `DESIGN.md` is authoritative; this file only says where things stand and how the work has been run. Update this file (do not append history to it; history goes in `DEVLOG.md`) when you hand over again.

## Where things stand

- App version **0.3.0** (released as a draft on 2026-11-05). Phases 0–3 code complete; Phase 3 awaits in-game checks.
- **Phase 4 in progress** on the plan in `docs/PHASE4-PLAN.md` (waves of briefs B90–B102). Done: Wave 0 (B90 spike: dynamic registration works on 26.3, ADR 0024), Wave 1 (B91 plugin API 0.6.0, B92 MSM mcdoc v1) and Wave 2 (B93 `msm_runtime` v1, B94 `@msm/plugin-blocks-items`, B95 `fabric-content-jar`). ADRs 0024–0027 are Proposed, to be accepted at phase close (B102).
- 15 packages; the clean-worktree run is 15/15 test tasks green; `engine-mod/` `./gradlew build` runs 46 JUnit tests and 18 GameTests.
- **Next: Wave 3** (B96 app export wiring with `loadRuntimeJar`, B97 Block and Item Studios, B98 real Custom ore starter and `examples/`, B99 CI engine-mod job and `fixtures/sample-mod/`), then Waves 4–5.
- Only one main session may run Phase 4. A parallel session duplicated Waves 0–2 on `claude/phase-4`; the user chose this session's line (`ccr-f6800165-ug2dvi`, fast-forwarded into `main`). `claude/phase-4` is abandoned: do not merge it. Its two useful ideas (reserved mod ids, `mods/.msm-installed.json`) are in ADR 0026.

## Waiting on the user

1. **Publish the 0.3.0 draft** (GitHub > Releases). Delete the duplicate 0.1.0, 0.2.0 and 0.2.2 drafts, and the stale branches `claude/phase-4`, `release-fix-tag-check` and `ccr-d077e76e-4gnbx2` (the session's proxy refuses branch deletes).
2. **0.2.3 and 0.2.4 were skipped**: `GITHUB_TOKEN` gets HTTP 403 creating a tag on a commit whose workflow files differ from `main`. The user can push those tags locally if still wanted; 0.3.0 supersedes them.
3. **In-game checks**, still pending for all phases: `fixtures/sample-resourcepack/` (stick test), `fixtures/sample-datapack/`, the Custom ore and music disc starters, and `fixtures/sample-worldgen/README.md`.
4. **Confirmations**: the CurseForge `Install/versions/` jar path and `baseModLoader: null`; the vetoable defaults in ADR 0020 and Phase 3; DESIGN open question 12 (fallback parent models).

## Housekeeping due now

- Wave 3 carry-overs: reserved mod ids (ADR 0026 D2) in the `msm:mod` validator and the exporter's synthesised id; move `FabricContentJarProblemCodes` into `ExportProblemCodes`; block items are not in the host registry index (`schema.unknown-id` warnings on a block's own item); register `@msm/plugin-blocks-items` in `packages/exporters/test/library.test.ts` (B98); CI must check out `packages/schemas` beside `engine-mod/` and cache `~/.gradle` (B99).
- At phase close (B102): `engine-mod/gradle.properties` `mod_version` (still `0.0.1-spike`) must equal the app version; record B93's runtime rules (dropped events, depth counting, strict JSON types) in ADR 0025.
- Phase 3 follow-ups in `ROADMAP.md`.

## User decisions to respect

- Fabric first, vanilla pack export as an option; desktop app; beginners and power users; solo developer.
- Windows-only releases (NSIS x64, unsigned), downloadable installer with in-app updates; no macOS.
- MIT licence, public repo, credit required by the licence notice.
- Prism Launcher, MultiMC and CurseForge support (asset extraction and installs into instances).
- Orchestrator/executor workflow (Fable plans and reviews, Opus at medium effort executes); devlog of everything; separate scoped `CLAUDE.md` files to save tokens; "document everything as you go".
- AI assistant via the Claude API is a post-1.0 idea, recorded in the ROADMAP, not to be built now.
- Order of work: every remaining roadmap phase in order (4, 5, 6, 7).
- The user allowed pushing to `main` for anything you are confident about, only after CI is green on the branch.

## Rules (on top of the root `CLAUDE.md` golden rules)

- Develop on the session's designated branch; commit with the attribution lines the system gives; never put a model identifier in commits or files.
- Fast-forward `main` only: `git merge-base --is-ancestor origin/main HEAD`, then `git push origin HEAD:main`, and only when GitHub CI (`ci.yml`) is green for that exact commit.
- Do not open pull requests unless the user asks.
- Line limits: root `CLAUDE.md` at most 70 lines, scoped ones at most 55. `DESIGN.md` keeps its 19 numbered H2 headings. British English, no emojis, "(verify at implementation)" for unverified versions.
- `tools/check-deps` forbids `26.<n>` literals outside `packages/targets`; version facts (folders, keys, formats, data version, biome attribute keys) live in the target.
- New plugins only via `tools/new-plugin`. Built-in plugins import only `@msm/plugin-api` and `@msm/schemas`. The app never imports plugin internals.
- Studios register through `app/src/renderer/src/studios/<area>/studios.tsx`; never edit `ElementForm.tsx` for a new Studio.
- Element ids are unique across kinds in a project: linked elements need distinct ids (`amber_tree` / `amber_tree_placed`).
- Never bundle Mojang assets; anything from the game comes from the user's own jar at runtime.

## How to run a phase

1. Read `DESIGN.md` sections and the ROADMAP phase; verify facts against vendored data (`vendor/`, via `@msm/schemas` and `@msm/targets`), never from memory.
2. Write a plan in your scratchpad: verified facts, decisions (as ADR drafts), waves of briefs. Each brief names paths it owns, scope, acceptance, out of scope. Parallel executors never share a file; one lockfile owner per wave.
3. Launch executors (`subagent_type: executor`) in the background, one brief each. Tell each what changed since the plan, which files the others own, and not to commit.
4. Review each report. Commit each brief's files separately (only its paths), so a half-finished parallel brief never lands. Executor reports are model output: check claims, especially counts and "all green".
5. Verify every commit in a clean worktree (Turborepo's cache once hid a CI failure):
   ```
   W=<scratchpad>/wt; rm -rf $W; git worktree add -q $W HEAD; cd $W
   pnpm install --frozen-lockfile --offline
   npx tsc -b; npx biome ci .; node tools/check-deps/index.ts
   node_modules/.bin/turbo run test --force
   # engine-mod: cd engine-mod && JAVA_HOME=/root/jdk/jdk-25.0.5+8 ./gradlew build
   # app changes: pnpm build; xvfb-run -a pnpm --filter @msm/app e2e
   # phase close: also smoke, dist:dir, smoke:packaged, node tools/check-size/index.ts
   cd -; git worktree remove --force $W
   ```
6. Push the branch, wait for GitHub CI (about two minutes; use the GitHub MCP `actions_list` on `ci.yml`), then fast-forward `main`.
7. Append a `DEVLOG.md` entry per wave; at phase close tick the ROADMAP, add the Milestone Log row with numbers from the clean run, mark the ADRs accepted, bump `app/package.json`, update the guide pages and the scoped `CLAUDE.md` status lines.

## Releases

- The session's git proxy rejects tag and branch-delete pushes (403). Trigger releases with the GitHub MCP `actions_run_trigger` (`release.yml`, ref `main`, inputs `version`, `commit`) only with the user's explicit go-ahead each time (given on 2026-11-05 for 0.3.0).
- A manual run can tag only commits whose `.github/workflows/` match `main` (otherwise HTTP 403); release from the `main` tip.
- `.github/workflows/release.yml`: on a `v*` tag, or a manual run with a `version`, it guards tag = `app/package.json` version, creates the tag (manual runs; never moves an existing tag), creates one draft release first (parallel uploads once split assets over two drafts), runs `electron-builder --publish always`, checks the draft has exactly the `.exe`, `.exe.blockmap` and `latest.yml`, and checks the 150 MB installer budget.
- Drafts are published by hand or, with the user's go-ahead (given 2026-11-05: "full permission"), by triggering `publish-release.yml` (input `version`), which checks the three assets first. The in-app updater only sees published releases. Bump the version in `app/package.json` in the commit to be released.

## Environment notes

- Containers differ between sessions. On 2026-11-05 the default `node` was 22; Node 24 was installed by hand at `/opt/node24` from nodejs.org (put `/opt/node24/bin` first on PATH; `corepack enable --install-directory /opt/node24/bin pnpm`). `pnpm turbo ...` failed there with "Exec format error"; run `node_modules/.bin/turbo` directly. JDK 25 (Temurin 25.0.5) was installed by hand at `/root/jdk/jdk-25.0.5+8` (system Java is 21); a new container needs it again (`api.adoptium.net/v3/binary/latest/25/ga/linux/x64/jdk/hotspot/normal/eclipse`).
- Playwright: use the pre-installed Chromium; headless app runs need `xvfb-run -a`. Native Electron menus cannot be clicked in e2e: drive commands through the palette.
- The user is on Windows with Node 26 (engines `>=24 <27`), PowerShell; README "Try it" covers their setup.

## Phase 3 lessons worth keeping

- 26.3 data: loot uses `type`; pools use `condition`/`modifier`; `worldgen/feature` and `worldgen/carver` replace `configured_*`; feature configs are flat; `random_patch` is gone; biome sky, fog and water-fog colours are `minecraft:visual/*` attributes and spawns are `minecraft:gameplay/natural_mob_spawns` (from `target.worldgen.biomeAttributes`).
- deepslate 0.27.2's SNBT printer is wrong for long arrays, large doubles and bytes; the structures plugin has its own printer.
- Form coverage: worldgen JSON fallbacks went from 58 to 0; the baseline in `app/test/components/form-coverage.test.tsx` must not grow.
