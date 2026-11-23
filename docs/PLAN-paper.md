# Paper server plugins: plan and briefs (Plan C)

Orchestrator (Fable), 2026-11-23. Checked at commit `b0c0ae9` on `ccr-d077e76e-4gnbx2` (the head moved to `bc8fb16` during the review, a Try it fix that changes nothing here). Nothing in the repository was changed by this review but for this file and its two sisters, `docs/PLAN-game-studio.md` (Plan A) and `docs/PLAN-instances.md` (Plan B). Brief ids B780 to B799. Draft ADR 0134 is in section 8. The running plan `docs/PLAN-one-mode-rest.md` is not changed.

The user's words (2026-11-23): "slowly we can start adding support for other mod loaders that are needed that cant be done in fabric". ROADMAP "Other loaders and servers (proposed)" puts Paper server plugins first, NeoForge second, a Quilt check third and legacy Forge only for old versions. This plan is Paper; NeoForge is one paragraph in section 9.

Why Paper first: the game modes of Plan A are played on servers, by players whose game has no mods. A data pack already carries most of a game there. Paper adds the few things a data pack cannot do: keeping a player out for a real length of time, stopping a block from being broken at all, menus that are clicked, a fresh arena world for each match, commands of the server's own.

## 1. What was checked, and what is true

In the code:

| # | Subject | Verified in | Finding |
|---|---|---|---|
| C1 | Exporters | `packages/exporters/src/` (`vanilla-packs`, `fabric-content-jar`, `java-project`, `modpack`), ADR 0026 | The Fabric content jar holds no Java of the project's own: it is the lowered files plus the prebuilt runtime jar nested, zipped by pure TypeScript (the runtime's bytes arrive through `loadRuntimeJar`; the jar ships with the app as `runtime/msm_runtime.jar`). A Paper export can be built the same way. |
| C2 | Loader facts | `packages/plugin-api/src/target.ts` (`FabricFacts`, line 1118; `Target.fabric?`) | Fabric is the only loader a target knows. The exporter refuses a target without it (`export.no-fabric-target`). There is no seam for a second host. |
| C3 | The runtime | `engine-mod/` (`src/main`, `src/mc/<mc>/`, `src/gametest`, `parity/`), `engine-mod/CLAUDE.md` | Fabric only, Java 25, Mojang names, version differences behind seams, 851 GameTests a variant. Nothing in it is written against a server plugin API. |
| C4 | What needs the runtime | ADRs 0082, 0113, 0115 | The six games kinds lower to data pack files only. Rules compile to scripts the runtime runs; `msm:command`, blocks, items, mobs and everything on the client need the runtime. So today a "plays without mods" game is a plain data pack, and a plain data pack can be dropped into a Paper server's world with no plugin at all. That is unverified: nothing in the repository has run on Paper. |
| C5 | Headless checks | `.github/workflows/ci.yml` job `engine-mod`, `tools/run-fabric-server/` | CI builds the runtime, starts a dedicated Fabric server with each sample, reads its log, and runs the parity GameTests on the content jars and on vanilla data packs. The same shape is wanted for Paper. |
| C6 | The app's sources | Plan B section 1, I11 | The app downloads from the Fabric Maven, Fabric's meta service and Modrinth. PaperMC's download service would be a new source. |

Outside the code (read on 2026-11-23; each is confirmed again by the spike, and anything used in code is "(verify at implementation)" until then):

- Paper publishes API documentation for 26.x (`jd.papermc.io/paper/26.2`), so Paper follows the year-numbered versions. Whether it has a build for 26.3 and for the 26.4 snapshot is question P2.
- PaperMC's downloads service is the Fill v3 service at `fill.papermc.io`; the older v2 service is no longer fed. It asks every client for a descriptive User-Agent that names a contact address, and its documentation says to take download addresses from its answers, not to build them by hand ([Downloads Service](https://docs.papermc.io/misc/downloads-service/)).
- A Paper plugin can register a data pack shipped inside its own jar through the lifecycle event for data pack discovery, from its bootstrap class only; the pack is shipped as files, not as a zip ([Datapack discovery](https://docs.papermc.io/paper/dev/lifecycle/datapacks/)).
- MockBukkit, the usual unit-test stand-in for a server, has a line for 26.1.2; its cover of the targets is question P7.
- Paper's server is under the GPL version 3 (inherited), with contributors able to offer their own patches under MIT; the licence of the API artefact a plugin compiles against is question P17.
- The vanilla server jar holds a game-test entry point (`net.minecraft.gametest.Main`) and test instances can be data; whether Paper's jar offers it is part of P7.
- Prism Launcher documents `--server <address>` with `--launch` (Plan B, N3), which is how the game would join a local Paper server.

## 2. Decisions taken here (vetoable defaults) and questions for the user

- **D1 Paper is a second host of a target, not a new target.** The same Minecraft version, another place to run. `Target.paper?: PaperFacts` sits beside `Target.fabric` in `packages/targets` (the API version to compile against, the `api-version` string, the least build): loader facts beside version facts, as the ROADMAP asks. Plugin API 1.28.0 (the next free minor when the brief runs). A target without it offers no Paper export.
- **D2 One jar a server owner drops into `plugins/`.** The Paper export is one self-contained plugin jar per mod: the prebuilt Paper runtime (staged with the app, as the Fabric runtime is), the mod's data pack as files inside it, the definitions the Paper runtime reads and a written `paper-plugin.yml`. Pure TypeScript, deterministic, nothing compiled on the user's machine. If the spike shows two such jars cannot share a server, the fall-back is one shared runtime plugin with a content file per mod.
- **D3 The API only.** The Paper runtime is written against Paper's published API and nothing else: no server internals, no remapping tools. What the API cannot do is not done on Paper, and the app says so. The clean-room rule holds by construction.
- **D4 Never silently less.** A mod with things only the Fabric mod can carry (blocks, items and mobs of its own, fluids, particles, vehicles, keys, the screen) is refused for Paper with the list in plain words; nothing is trimmed quietly. Games made of the games kinds, kits, stories, functions, advancements, loot and recipes export whole.
- **D5 What the Paper runtime does, in this order.** First: carry the data pack, and the mod's `msm:command`s as real server commands, the Rules signal command among them, so the function bridge of ADR 0115 works. Second: the extras games want and a data pack cannot give, each an optional setting on a mechanic of Plan A that only Paper acts on: kept out for a real time, blocks that cannot be broken or placed outside allowed areas, no death screen, a clicked menu for a shop, an arena world per match. Third, a later batch with its own spike: Rules on Paper, by the part of the Script API that Rules for games use, written over Paper's API.
- **D6 Tested without a screen, in CI, as the Fabric runtime is.** A Gradle project `engine-paper/` with unit tests; a tool `tools/run-paper-server` that fetches Paper into a cache, starts it headless with an exported plugin, reads its log and runs the same parity checks the vanilla data pack passes; a CI job `engine-paper` that runs only when its inputs change (the user's rule: GitHub Actions sparingly). The exact way players are stood in for is the spike's P7.
- **D7 Played through Plan B.** Play my game on Paper is Plan B's local server with a second kind, `paper`, joined by the Plain instance: no mod in the game at all.
- **D8 Paper and what is built on it; not Spigot, not Folia.** The bootstrap and lifecycle APIs this rests on are Paper's. Folia's threading is a different contract and is refused with a sentence.
- **D9 Licences.** Paper is never bundled: it is fetched on the user's machine and in CI. The Paper runtime is MSM's own code under MIT, compiled against the API. Each exported jar carries a notice for the runtime and whatever is shaded into it. The spike records the licence texts (P17) before any code is written.

Questions that need the user (the spike can run before they are answered):

1. **A new download source.** A local Paper server means the app downloads Paper from PaperMC's own service, which no code does today. Default: yes, from B789 on, and only that service.
2. **What the app calls itself to that service.** PaperMC asks for a User-Agent with a contact address. Default: the app's name, its version and the address of its public repository; nothing about the user or their mod is sent.

## 3. Rules for every brief below

These add to `docs/HANDOFF.md` "Rules" and "Rules for every brief" and to section 3 of `docs/PLAN-one-mode-rest.md`, which all apply.

- **Read first:** root `CLAUDE.md`, the scoped `CLAUDE.md` of the area (`engine-paper/CLAUDE.md` once B781 writes it), the last DEVLOG entry, ADRs 0026, 0113 to 0117, draft ADRs 0132, 0133 and 0134, `docs/reference/spikes/b780/README.md` once it exists, and section 10's notes.
- **The API only** (D3). An import of a server-internal package fails a check B781 adds to `engine-paper`'s build.
- **Version and host facts only in `packages/targets`**: Paper's API version, `api-version` and build numbers are target facts; `tools/check-deps` keeps `26.<n>` out of everything else, `engine-paper/gradle.properties` checked against the target as `engine-mod`'s is.
- **No network in tests** but for the one tool and CI job that fetch Paper into a cache; the checksum the service gives is compared before a jar is run.
- **Gradle and memory:** an `engine-paper` executor counts as one of the two that may run Gradle at once.
- **Files with one owner at a time across all plans** (named by the main session): `packages/schemas/mcdoc/msm/games.mcdoc`, `packages/plugin-api/src/target.ts` and both targets' `target.ts`, `packages/exporters/src/index.ts`, `.github/workflows/ci.yml`, `tools/check-deps/layers.json`, `pnpm-lock.yaml`, `app/scripts/stage-runtime.mjs`, `app/src/shared/platform.ts`, `docs/guide/`, `packages/ai/src/prompt/`.
- **Live view, findable, one mode.** The export adds no kind, so its live view is the card "What your server gets" (the commands, the extras that will act, what stays as the data pack does it), shown before anything is written. "paper", "server plugin" and "spigot" find the export.
- **Exit criteria always:** `pnpm lint`, `pnpm typecheck`, the touched packages' tests, `node tools/check-deps/index.ts`; `engine-paper` briefs `./gradlew build` there; app briefs build and `node tools/check-size/index.ts`.
- **Models:** Opus `claude-opus-5-5` at medium unless said; Sonnet where said.

## 4. Order, and how it fits the other plans

At most five executors at once across all plans; the running plan first, then Plan A's batch 1, then Plan B, then this plan. None of this plan's files belongs to the running plan.

| Wave | Briefs (model, effort) | Notes |
|---|---|---|
| C0 | **B780** spike (Opus, high) | Any free slot once Plan A's and Plan B's spikes have theirs. Uses Gradle. It tests with `fixtures/sample-game-modes`' vanilla data pack, so it does not wait for Plan A. |
| C1 | **B781** scaffold (Opus, medium), then **B782** plugin API and Paper facts (Opus, medium) | After the spike says go. B782 not in the same wave as Plan A's B723 (both own `target.ts`). |
| C2 | **B783** Paper runtime 1: the pack and commands (Opus, high) · **B786** the exporter (Opus, high) · **B787** `tools/run-paper-server` and CI (Opus, high) | Three different areas; B786 builds against the stub runtime jar from B781. |
| C3 | **B785** format: the Paper settings of mechanics (Opus, medium), then **B784** Paper runtime 2: the games extras (Opus, high) | After Plan A's batch 1 is closed (the mechanics exist). B785 not in the same wave as Plan A's B741 (both own `games.mcdoc`). |
| C4 | **B788** Export as a Paper plugin in the app (Opus, medium) · **B789** Play my game on a local Paper server (Opus, medium) · **B790** the games' parity on Paper (Opus, high) | B789 after Plan B's B762, B763 and B769, and after the user's answer to question 1. |
| C5 | **B791** e2e, guide, AI helper lines, changelog (Opus and Sonnet) · **B792** close (main session) | |
| Reserve | **B793** Rules on Paper (its own spike, then the build) · **B794** a lobby across servers · **B795** to **B799** free | |

## 5. The briefs

### B780 Spike: Paper for game modes (wave C0; Opus, high)

- **Purpose:** what Paper's API offers for the game types, how a plugin is built and tested with no screen, the licences, and what a data pack already covers there. *Moves: any mod, higher quality.*
- **Owner files:** new `docs/reference/spikes/b780/` (README with the answers, the throwaway plugin's source, logs). No other file; the throwaway Gradle project lives in the scratchpad and is copied into `spike-src/`.
- **Method:** a throwaway plugin against Paper's API for 26.3 (and the second target if a build exists), a Paper server fetched through the Fill service into the scratchpad and run headless, `fixtures/sample-game-modes`' vanilla data pack and its seven parity checks replayed by commands. Paper's API and documents may be read; no server internals.
- **Questions:**
  - P1 The sample's vanilla data pack on Paper: does it load clean; do the load and tick tags, the first-join advancement, `place template`, teams, timers and areas behave as on the vanilla and Fabric servers; which of the seven checks pass; anything Paper changes (the function permission level, command names, command blocks off by default).
  - P2 Which Paper builds exist for 26.3 and for the 26.4 snapshot; what "stable" means in the service's answers; the Java it needs.
  - P3 The Fill service: the calls for the newest stable build of a version, the checksum it gives, the User-Agent rule, how to cache.
  - P4 `paper-plugin.yml`: its keys (name, version, main, bootstrapper, `api-version`), and what a plugin with no code of its own but a shared runtime's classes needs.
  - P5 A data pack inside the jar: registered at bootstrap; is it on by itself in a new world and in an old one; what happens when the jar is updated or removed; two plugins with packs.
  - P6 Two exported jars on one server, each holding the same runtime classes: are they kept apart; do their commands and packs clash.
  - P7 Tests with no screen: MockBukkit's cover of the target; a real server driven by a test plugin; whether the game-test entry point is reachable; how two players are stood in for (the API has no fake players: a headless client, or logic tested under MockBukkit with the server run kept to what needs no player). Choose the CI route and estimate its minutes.
  - P8 Commands through the lifecycle event: Brigadier trees, which of ADR 0111's 44 argument types the API offers, permissions, what `/reload` does to them.
  - P9 The bridge both ways: a plugin running a data pack function, and a function running a plugin command (`msm_signal_<ns>`), at load, after a reload, as a player and as the server.
  - P10 Keeping a player out for a time: the ban API with an end time, the message shown, a player who is offline.
  - P11 Cancelling: breaking, placing, damage and dropping by area boxes; the cost with 16 players.
  - P12 A death with no death screen: what the API allows, and what happens to drops.
  - P13 Menus: a chest-like menu with clicks; the dialog API on 26.x as the other route.
  - P14 Worlds: making, unloading and deleting a world per match from a template; the time it takes; what Folia would break.
  - P15 Rules on Paper, sizing only: which Script API members Rules for games use and how each maps to the API; an estimate; go or no-go for B793.
  - P16 The Bukkit-era `plugin.yml` route: what is lost by not supporting Spigot.
  - P17 Licences: the API artefact's licence text, Rhino's, and what an exported jar must carry.
  - P18 Sizes and times: the runtime jar, a Paper server's first start and later starts in CI with a cache.
- **Exit criteria:** P1 to P18 answered for 26.3 (and the second target where a build exists) with evidence; a table "what a game wants, data pack alone, with the Paper runtime, not possible"; go or no-go for D2's one-jar design; the facts for B782; the changes it asks of section 2 and the draft ADR.

### B781 Scaffold (wave C1; Opus, medium)

- **Owner files:** new `engine-paper/` (Gradle wrapper files copied from `engine-mod`, `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`, `CLAUDE.md` of at most 55 lines, a bootstrap and a main class that log one line, the internals check of section 3, one unit test); new `packages/exporters/src/paper-plugin/` (`index.ts`, "not yet") and its line in `packages/exporters/src/index.ts`; new `tools/run-paper-server/` (`index.ts`, "not yet", `README.md`); `.github/workflows/ci.yml` (a job `engine-paper` with path filters, building only); `tools/check-deps` (the `engine-paper/gradle.properties` check and layers); `app/scripts/stage-runtime.mjs` (the Paper runtime staged as `runtime/msm_runtime_paper.jar` when built, skipped without `--require`); `app/test/runtime-version.test.ts` (the Paper runtime's version equals the app's).
- **Exit criteria:** `cd engine-paper && ./gradlew build` green with JDK 25; the jar loads on the spike's Paper server and logs its line (a manual run, reported); every existing test unchanged; lint, typecheck, check-deps; the app builds. *Moves: quickly.*

### B782 Plugin API 1.28.0 and the Paper facts (wave C1; Opus, medium)

- **Owner files:** `packages/plugin-api/src/target.ts`, the API report and version files, `packages/targets/mc-26.3/src/target.ts`, `mc-26.4/src/target.ts` (only if P2 found a build), `packages/targets/all/test/`.
- **Scope:** `PaperFacts { api, apiVersion, minBuild }` as P2 to P4 measured, `Target.paper?`; each value with its source and date in a comment, as the Fabric facts have.
- **Exit criteria:** the plugin API's tests and report; `engine-paper/gradle.properties` equals the facts (check-deps); lint, typecheck. *Moves: higher quality.*

### B783 Paper runtime 1: the pack and the commands (wave C2; Opus, high)

- **Owner files:** `engine-paper/src/main/` (`bootstrap/`, `content/`, `commands/`), `engine-paper/src/test/`.
- **Scope:** at bootstrap, read the jar's own `msm/paper/index.json` (written by the exporter), register the data pack that sits in the jar, and register each `msm:command` of the mod as a Brigadier command that runs its function or fires its signal, as the Fabric runtime's does for the forms the API offers (P8); a load report in the log in the Fabric runtime's style (`[msm_runtime] …` lines the server check reads); errors in words, never a stack trace alone.
- **Exit criteria:** unit tests for the index reader and the command builder; a server run (B787's tool, or by hand until it exists) with `fixtures/sample-game-modes` exported for Paper: the pack is on, the signal command exists, the log has no error line; `./gradlew build`. *Moves: any mod.*

### B786 The exporter (wave C2; Opus, high)

- **Owner files:** `packages/exporters/src/paper-plugin/`, `packages/exporters/test/paper-plugin*.test.ts`.
- **Scope:** `createPaperPluginExporter({ loadPaperRuntimeJar })`: takes the lowered files, refuses with `export.no-paper-target` on a target without the facts and with `export.paper.fabric-only` listing every thing only the Fabric mod can carry (D4), and otherwise writes one deterministic jar: the runtime's classes, the data pack's files under the folder P5 chose, `msm/paper/index.json`, `paper-plugin.yml` (the name from the mod's id, its version, the `api-version` fact), the notices of D9. The same zip writer and fixed timestamps as the other exporters.
- **Exit criteria:** tests that the same input gives the same bytes, that a mod with a block of its own is refused with its name, that `fixtures/sample-game-modes` exports with nothing above info, and that the written `paper-plugin.yml` parses with the keys P4 named; lint, typecheck, check-deps. *Moves: any mod.*

### B787 `tools/run-paper-server` and CI (wave C2; Opus, high)

- **Owner files:** `tools/run-paper-server/`, `.github/workflows/ci.yml` (the `engine-paper` job's steps).
- **Scope:** as `tools/run-fabric-server`: fetch Paper for the target through the Fill service with the User-Agent of question 2 into a cache keyed by build, compare the checksum, write `eula.txt` for the CI run only, start headless with an exported plugin, wait for the runtime's lines, run the checks P7 chose, stop, and fail on any `[msm_runtime]` error line. The job runs when `engine-paper/`, the exporter, the games plugin or the tool change, and is skipped otherwise.
- **Exit criteria:** the tool passes on `fixtures/sample-game-modes` here; its own unit tests with an injected downloader; the job's minutes reported against P7's estimate. *Moves: higher quality.*

### B785 Format: the Paper settings of mechanics (wave C3; Opus, medium)

- **Owner files:** `packages/schemas/mcdoc/msm/games.mcdoc`, the conformance corpus, `packages/plugins/games/src/lowering/game/paper.ts` (new: writes `msm/paper/<game>.json` on the `msm` layer), its tests.
- **Scope:** optional `on_paper` settings on the mechanics that have a better form there (kept out as a real ban, protected blocks, no death screen, a clicked shop, a world per match), each with a doc comment saying what the data pack does instead. Nothing changes in the data pack's own files.
- **Exit criteria:** `node tools/build-msm-mcdoc/index.ts --check`; the vanilla data pack and the Fabric content jar of the four games are byte for byte as before; lint, typecheck.

### B784 Paper runtime 2: the games extras (wave C3; Opus, high)

- **Owner files:** `engine-paper/src/main/games/`, its tests.
- **Scope:** read `msm/paper/<game>.json` and act on each setting through the API as P10 to P14 found; every extra calls the game's own functions and hook tags for the rest (the round engine stays the data pack's), so a game behaves the same but for the extra.
- **Exit criteria:** unit tests per extra; the four games' checks on Paper still pass with every extra on and with every extra off; `./gradlew build`. *Moves: any mod.*

### B788 Export as a Paper plugin in the app (wave C4; Opus, medium)

- **Owner files:** new `app/src/renderer/src/components/ExportPaperDialog.tsx`, `app/src/main/platform/exports.ts` and `runtime-jar.ts` (the Paper runtime's loader), the session's exporter list, the one optional More entry and Plan A's Test and share prop, tests.
- **Scope:** **Export as a Paper plugin…** with the card "What your server gets" before anything is written, the refusal list in plain words, a second pill on a game "Works on Paper servers" (computed from the exporter's own check), and one sentence on where the file goes.
- **Exit criteria:** component tests (a game exports; a mod with a block is refused with its name); `expectPlain`; build, check-size with the runtime jar's size reported; screenshots. *Moves: quickly.*

### B789 Play my game on a local Paper server (wave C4; Opus, medium)

- **Owner files:** `packages/interop/src/server/paper.ts` (new), `app/src/main/platform/local-server.ts` (the `paper` kind), `components/instances/ServerPanel.tsx` (the choice of server), tests.
- **Scope:** Plan B's server with the kind `paper`: Paper fetched as in B787, the exported plugin in `plugins/`, the same EULA tick, Java and panel; the Plain instance joins it.
- **Exit criteria:** tests with an injected downloader and the stub Java; the checksum compared before the first start; a plain reason when the target has no Paper build. *Moves: quickly.*

### B790 The games' parity on Paper (wave C4; Opus, high)

- **Owner files:** `tools/run-paper-server/checks/`, `engine-paper/src/test/` (the parity cases), the CI job's last step.
- **Scope:** the checks `SampleCommunityGamesParityTest` makes on the vanilla data pack (Plan A's B736), made on Paper by the route P7 chose, for the four games with the extras off and on.
- **Exit criteria:** each check green or listed with its reason and a limit for the guide; nothing loosened.

### B791 e2e, guide, AI helper lines and changelog (wave C5)

- **Owner files (when granted):** new `app/e2e/paper-path.spec.ts`; new `docs/guide/paper.md` with `game-studio.md`, `instances.md`, `targets.md` and the sidebar entry; the AI helper's lines and pinned hash.
- **Exit criteria:** the spec exports a game for Paper and reads the jar's `paper-plugin.yml`; the guide says what works on a plain data pack, what the plugin adds and what needs the Fabric mod; the search's golden test green with "paper plugin" and "server plugin".

### B792 Close (wave C5; main session)

- ADR 0134 to "accepted with findings" with P1 to P18; `docs/COVERAGE-AUDIT.md` gains its Paper column; the ROADMAP's "Other loaders and servers" ticked for Paper; a release on the user's standing word.

## 6. The main session's own steps

- **Before B780:** file ADR 0134 from section 8 as Proposed; add the ROADMAP lines from section 9; put section 2's questions to the user.
- **After B780:** amend section 2 and the ADR; if D2's one-jar design is a no-go, rewrite B786 and B783 for the fall-back before C1.
- **Each wave:** name the owner of each one-owner file; keep to two Gradle executors; append notes to section 10; review against the exit criteria, refusing any import of server internals and any export that leaves something out without saying so.

## 7. Limits to say in the guide

- A Paper plugin carries games, commands and data. Blocks, items and mobs of a mod's own need MSM's mod on Fabric.
- Paper and servers built on it; not Spigot, not Folia.
- Rules run with MSM's mod; on Paper they come later (reserve B793). Until then a game for Paper is made of the Game tab's own pieces.

## 8. Draft ADR text

**ADR 0134: Paper server plugins** (Proposed; the defaults are vetoable)

- *Context.* MSM exports for Fabric and as vanilla packs. The community's game modes run on Paper servers for players without mods; a data pack carries most of a game there but cannot keep a player out for a real time, protect blocks, show clicked menus, make a world per match or add commands. The user asked (2026-11-23) to add the loaders that are needed for what Fabric cannot do, slowly; the ROADMAP puts Paper first.
- *D1.* Paper is a second host of a target: `Target.paper?: PaperFacts` beside `Target.fabric` (plugin API 1.28.0).
- *D2.* The export is one self-contained plugin jar per mod, built by pure TypeScript from a prebuilt Paper runtime, the mod's data pack and a written `paper-plugin.yml`.
- *D3.* The Paper runtime (`engine-paper/`) uses Paper's published API only.
- *D4.* A mod with Fabric-only things is refused for Paper with the list; nothing is trimmed silently.
- *D5.* The Paper runtime carries the pack and the mod's commands first, the games extras second, Rules later.
- *D6.* It is tested headless in CI by a Gradle build and `tools/run-paper-server`, on the same parity checks as the vanilla data pack.
- *D7.* Play my game on Paper is the local server of ADR 0133 with the kind `paper`, joined by the Plain instance.
- *D8.* Paper and its descendants; not Spigot, not Folia.
- *D9.* Paper is fetched from PaperMC's own service on the user's machine and in CI, never bundled; the runtime is MSM's own MIT code; exported jars carry the notices.
- *Consequences.* A second runtime to keep in step with the first, kept small by D3 and D5. A new download source. The coverage audit gains a column. The seam in `packages/targets` and the exporter list is the one NeoForge will use.
- *Status.* Proposed; the spike's answers P1 to P18 join it before it is accepted.

## 9. NeoForge, Quilt and legacy Forge (not planned here)

**NeoForge** is the second loader and gets its own plan after Paper's close. It would be a third host of a target (`Target.neoforge?`), a NeoForge content jar beside the Fabric one, and a NeoForge build of `msm_runtime` from one shared Java core with per-loader seams, as the per-version seams of `engine-mod/src/mc/<mc>/` work today, still in Mojang names; Plan B's recipes already have the place for its launcher component. Its open questions, for its own spike: which NeoForge builds exist for 26.3 and for snapshots, and how fast they follow; how much of the runtime touches Fabric API (events, networking, resource loading, the GameTest hooks, the client GameTest route, the two Mixins) and what each becomes on NeoForge; whether the 851 GameTests and the parity mod can run on both loaders from one source; whether the Java eject gets a NeoForge form; how the nested runtime and GeckoLib are carried; what NeoForge can do that Fabric cannot for MSM's kinds (the list the ROADMAP asks for, from evidence); and whether the user's modpack use is served better by NeoForge support or by Fabric-on-NeoForge compatibility layers that already exist. **Quilt** is a check, not a plan: one headless run of a content jar on Quilt's loader, recorded in the guide. **Legacy Forge** is only for older Minecraft versions, if a target for them is ever added.

ROADMAP text for the main session: under "Other loaders and servers", the Paper line points to `docs/PLAN-paper.md` and ADR 0134 with one checkbox per brief B780 to B792. The DEVLOG entry is the one in `docs/PLAN-game-studio.md` section 10 (one entry for the three plans).

## 10. Notes from implementation

(The main session appends each executor's "Notes for the plan" here.)
