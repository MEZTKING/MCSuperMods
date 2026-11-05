# Session handoff

Written 2026-11-05 by the main session that ran Phases 0–3, for the next main session. Read this, then the root `CLAUDE.md`, then the last three `DEVLOG.md` entries. `DESIGN.md` is authoritative; this file only says where things stand and how the work has been run. Update this file (do not append history to it; history goes in `DEVLOG.md`) when you hand over again.

## Where things stand

- `main` = the working branch tip, CI green. App version **0.3.0**. Phases 0, 1, 2 and 3 are code complete; the launcher add-on (ADR 0019) and the templates and samples library (ADR 0020) are done; recent projects is done.
- 14 packages, 1,719 tests, 7 Playwright e2e specs (`smoke`, `golden-path`, `datapack-path`, `launchers-path`, `library-path`, `recent-path`, `worldgen-path`). Milestone Log in `ROADMAP.md` has the numbers.
- **Next: Phase 4** (Engine Mod + Blocks/Items, v0.4). It opens with the one-week registry-freeze spike (ROADMAP "Phase 4"). No Phase 4 plan exists yet: write one first (see "How to run a phase").

## Waiting on the user

1. **Releases** (the session cannot push tags; see "Releases"). In order, via GitHub Actions > Release > Run workflow on branch `main`:
   - version `0.2.3`, commit `56885610ca9fb32d2a15556bbb26be64a912cbd2` (delete the old duplicate 0.2.3 drafts first, or the run stops);
   - user installs 0.2.3 by hand and publishes the draft;
   - version `0.2.4`, commit `6d48c71104d48d6d25dab061e4b6d282f2269782`; publish; the installed 0.2.3 should auto-update (first real auto-update test);
   - version `0.3.0`, commit empty.
   The manual-run path (`workflow_dispatch` with `version`/`commit` inputs, which creates the tag with `GITHUB_TOKEN`) is new and **untested**: watch the first run and fix it if it fails.
2. **In-game checks**, still pending for all phases: `fixtures/sample-resourcepack/` (stick test), `fixtures/sample-datapack/`, the Custom ore and music disc starters, and `fixtures/sample-worldgen/README.md` (hamlet via `/locate`, "Amber Woods" World Type, jigsaw orientation, 3D structure preview with real WebGL).
3. **Confirmations**: the CurseForge `Install/versions/` jar path and `baseModLoader: null`; the vetoable defaults in ADR 0020 (emerald-ore reskin, cat record, `examples/` mirror) and Phase 3 (deepslate NBT, structure templates stored as JSON, noise preview deferred, `dimension_type` in the data pack plugin, tier-B schema-form kinds); DESIGN open question 12 (fallback parent models).

## Housekeeping due now

- Phase 3 follow-ups in `ROADMAP.md` (go to definition from Studio id lists, gallery entries for the worldgen starters, full-cube culling in the structure view, `#[id(tags="implicit")]` support, B84 noise preview in reserve).

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
   pnpm turbo run test --force
   # app changes: pnpm build; xvfb-run -a pnpm --filter @msm/app e2e
   # phase close: also smoke, dist:dir, smoke:packaged, node tools/check-size/index.ts
   cd -; git worktree remove --force $W
   ```
6. Push the branch, wait for GitHub CI (about two minutes; use the GitHub MCP `actions_list` on `ci.yml`), then fast-forward `main`.
7. Append a `DEVLOG.md` entry per wave; at phase close tick the ROADMAP, add the Milestone Log row with numbers from the clean run, mark the ADRs accepted, bump `app/package.json`, update the guide pages and the scoped `CLAUDE.md` status lines.

## Releases

- The session's git proxy rejects tag pushes (403). An earlier attempt to have the workflow create tags and trigger it from the session was stopped by the session's safety check; do not retry that without the user's explicit go-ahead each time.
- `.github/workflows/release.yml`: on a `v*` tag, or a manual run with a `version`, it guards tag = `app/package.json` version, creates the tag (manual runs; never moves an existing tag), creates one draft release first (parallel uploads once split assets over two drafts), runs `electron-builder --publish always`, checks the draft has exactly the `.exe`, `.exe.blockmap` and `latest.yml`, and checks the 150 MB installer budget.
- The user publishes drafts by hand; the in-app updater only sees published releases. Bump the version in `app/package.json` in the commit to be released.

## Environment notes

- Containers differ between sessions. On 2026-11-05 the default `node` was 22; Node 24.22.1 was at `/opt/node24/bin` (put it first on PATH). `pnpm turbo ...` failed there with "Exec format error"; run `node_modules/.bin/turbo` directly. JDK 25 (Temurin 25.0.5) was installed by hand at `/root/jdk/jdk-25.0.5+8` (system Java is 21); a new container needs it again (`api.adoptium.net/v3/binary/latest/25/ga/linux/x64/jdk/hotspot/normal/eclipse`).
- Playwright: use the pre-installed Chromium; headless app runs need `xvfb-run -a`. Native Electron menus cannot be clicked in e2e: drive commands through the palette.
- The user is on Windows with Node 26 (engines `>=24 <27`), PowerShell; README "Try it" covers their setup.

## Phase 3 lessons worth keeping

- 26.3 data: loot uses `type`; pools use `condition`/`modifier`; `worldgen/feature` and `worldgen/carver` replace `configured_*`; feature configs are flat; `random_patch` is gone; biome sky, fog and water-fog colours are `minecraft:visual/*` attributes and spawns are `minecraft:gameplay/natural_mob_spawns` (from `target.worldgen.biomeAttributes`).
- deepslate 0.27.2's SNBT printer is wrong for long arrays, large doubles and bytes; the structures plugin has its own printer.
- Form coverage: worldgen JSON fallbacks went from 58 to 0; the baseline in `app/test/components/form-coverage.test.tsx` must not grow.
