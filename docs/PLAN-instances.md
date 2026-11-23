# Instances for anything: plan and briefs (Plan B)

Orchestrator (Fable), 2026-11-23. Checked at commit `b0c0ae9` on `ccr-d077e76e-4gnbx2` (the head moved to `bc8fb16` during the review, a Try it fix that changes nothing here). Nothing in the repository was changed by this review but for this file and its two sisters, `docs/PLAN-game-studio.md` (Plan A) and `docs/PLAN-paper.md` (Plan C). Brief ids B760 to B779. Draft ADR 0133 is in section 8. The running plan `docs/PLAN-one-mode-rest.md` is not changed.

The user's words (2026-11-23): "if you didnt already make it so that if you have a for example prism launcher then it will give the option to make any instance required to run whatever you want to run". The aim: whenever the user plays, tests or exports something (a mod on either Minecraft version, a modpack, a map, a game, later a Paper plugin or a NeoForge mod), MSM offers to make the launcher instance or the local server it needs, with the right Minecraft version, loader and mods, and never touches the user's other instances.

## 1. What exists today, and what is missing

| # | Subject | Verified in | Finding |
|---|---|---|---|
| I1 | The managed instance | `packages/interop/src/fabric/instance.ts` (`createManagedInstance`, `managedInstanceName`, `managedMmcPack`, `MANAGED_INSTANCE_MARKER`) | One instance per Minecraft version, `MCSuperMods Test (<mc>)`, always Fabric: `instance.cfg`, an `mmc-pack.json` naming `net.minecraft` and `net.fabricmc.fabric-loader`, `minecraft/mods/` and the marker `.msm-managed.json` (`formatVersion` 1, `minecraft`, `loader`). A same-named folder without the marker is never touched (`fabric.instance-not-managed`). |
| I2 | Who can make it | `app/src/main/platform/test-in-minecraft.ts` (`findPrismRoot`, `createInstance`), `play.ts` | Only in a Prism Launcher data folder. Play makes it at the first Play without asking (ADR 0084 D1); Test in Minecraft has **Create test instance**. MultiMC shares the format but nothing writes into a MultiMC root. |
| I3 | Using the user's own instance | `fabricReadiness` in `instance.ts`; `mods-install.ts` | A Prism or MultiMC Fabric instance on the target's version: install and launch. The official launcher and CurseForge: install only, with a note. Only files recorded in `mods/.msm-installed.json` are ever replaced or removed. |
| I4 | Starting the game | `packages/interop/src/fabric/launch.ts` | `--launch <instance>` and `--dir <data folder>` for Prism and MultiMC. No `--server`, no world argument: the runtime's dev mode opens the world (ADR 0084 D2). |
| I5 | One instance for everything | `play.ts`, `test-in-minecraft.ts` `runModpack`, `removeUnlistedInstalls` | Play, Play my game, Test in Minecraft and Test modpack all use the same instance. Testing a modpack removes the content jars and extra mods of whatever was tested before. Test worlds and game worlds are kept apart by name (`msm-test-<ns>`, `msm-game-<ns>`). |
| I6 | Without the mod | the same files | There is no instance without a loader. A game that "plays without mods" is still tested with the content jar and the runtime in it, so MSM never shows it running as players without mods will have it. |
| I7 | Maps and modpacks as files | `app/src/main/platform/map-export.ts`, `packages/exporters/src/modpack/`, ADR 0116 open items | A map is a world zip or a `.mrpack`; a modpack is a `.mrpack`. Opening either in a launcher is done by hand, and whether Prism lands `overrides/saves/` as a world is still an in-game check. |
| I8 | Servers | `tools/run-fabric-server/index.ts` only | The app starts no server. The dev tool downloads the Fabric server launcher from `meta.fabricmc.net` for CI. Games for several players (Plan A) cannot be tried with a friend from the app. |
| I9 | Java | `TargetFacts.java` (25 on 26.3), `app/src/main/platform/` | The target knows the Java version it needs. The app never looks for a Java program: the launcher has always brought its own. A local server needs one. |
| I10 | Launchers known | `packages/interop/src/launchers/` (`mmc.ts`, `curseforge.ts`, `official.ts`, `discover.ts`), ADR 0019 | Discovery reads the official launcher, Prism (found by itself), MultiMC and PolyMC (folders added by hand) and CurseForge. The reader already knows the loader ids of Fabric, Quilt, Forge, NeoForge and LiteLoader. Nothing writes a CurseForge instance or an official launcher profile. |
| I11 | Downloads the app makes | `packages/interop/src/fabric/download.ts`, `modrinth/`, `geckolib-jar.ts` | Fabric API from the Fabric Maven (SHA-512 checked), Modrinth files for modpacks' extra mods (hash pinned), GeckoLib. Minecraft itself and the loader are fetched by the launcher, never by MSM. |
| I12 | Tests | `app/e2e/launchers-path.spec.ts`, `play-path.spec.ts`, `app/e2e/assets/stub-launcher.mjs` | A fake Prism folder (`PRISMLAUNCHER_DATA_DIR`) and a stub launcher that plays the runtime's part. The same method serves this plan. |

In short: the managed Prism test instance exists and is offered; an instance per purpose, an instance without mods, MultiMC and CurseForge, a local server and anything beyond Fabric do not.

## 2. Decisions taken here (vetoable defaults) and questions for the user

- **D1 Recipes.** What an action needs is worked out as a **run recipe**: the purpose (test, game, modpack, map, without mods, server), whose it is (a mod's namespace or a modpack's name), the Minecraft version, the loader (none or Fabric now; NeoForge, Quilt and a Paper server later, each one more value), the mods, the packs, the world and what to join. Recipes are pure data made in `@msm/interop` from the project, the target and the action; every screen and every launcher writer reads the same recipe.
- **D2 An instance per purpose, the test instance unchanged.** `MCSuperMods Test (<mc>)` stays exactly as it is for Play and Test in Minecraft (no migration, the marker's version 1 is read as "test, Fabric"). New managed instances: `MCSuperMods Plain (<mc>)` with no loader, for games and maps that play without mods; `MCSuperMods Pack <name> (<mc>)`, one per modpack, so testing a modpack no longer clears the test instance; and, when their plans exist, one per further loader. The marker gains `formatVersion` 2 with `purpose`, `owner` and `loaderKind`. A taken name gets `-2`, `-3`.
- **D3 Offered, then remembered.** When an action needs an instance or a server that is not there, a card says in plain words what will be made ("A Prism Launcher instance named MCSuperMods Plain (26.3), with Minecraft 26.3 and nothing else. Your other instances are not touched.") with **Make it and play**, **Use one of mine instead…** (the location picker, with each instance's readiness in words) and **Do this by itself next time**. The setting "Ask before making an instance" (the first time for each kind, always, never) starts at "the first time". Users who already have the test instance see no card for it.
- **D4 Launchers in this order.** Prism first (found by itself). MultiMC and PolyMC next, by the same writer into a folder the user added in Settings. CurseForge only by a route its own app supports (a profile file the user imports), unless the spike finds a safe way to write an instance; installing into an existing CurseForge instance stays as today. The official launcher stays install-only; a profile for it would mean editing the launcher's own profile list and is a reserve.
- **D5 Never the user's own.** MSM writes only inside a folder that holds its marker, or into `mods/` files it recorded itself (as today). A managed instance is removed only from Settings, after a question, into the recycle bin. Tests prove it: every recipe is run against a made-up launcher folder full of foreign instances, and the foreign folders must be byte for byte the same afterwards.
- **D6 Without mods, for real.** A game or map that plays without mods can be opened in the Plain instance: MSM copies the game world out of the test instance with the map export's own code (the data pack in, the dev pack out) and starts the launcher on that world. The world is still made by the game itself; `level.dat` is never written (ADR 0084).
- **D7 A local server, started and stopped in sight.** `<msmHome>/servers/<name>/` with its own marker, outside every launcher. The Fabric server launcher comes from `meta.fabricmc.net` (the source `tools/run-fabric-server` uses) into the download cache with its hash recorded; the mods are the content jar and Fabric API as for an instance. MSM starts it as a child process, shows its log with **Stop**, and stops it when the app closes (after a question). It listens on the usual port or the next free one with `online-mode` on. The game joins it through the launcher (`--server`). Dev mode stays off on servers (ADR 0084 D4), so a change needs **Restart the server**, one click.
- **D8 The Minecraft EULA is the user's to accept.** A server does not start until `eula.txt` says so. The card shows the link and a tick box; MSM writes `eula=true` only after the tick and remembers it per server folder. Nothing is ticked for the user.
- **D9 Java is found, not shipped.** A server needs the target's Java (`TargetFacts.java`). MSM looks where a launcher keeps the Java it downloaded (Prism's, the official launcher's), then `JAVA_HOME`, then the path, and checks the version. With none it says how to get one (start any instance once in Prism). No Java is bundled or downloaded by MSM.
- **D10 Sources.** Downloads come only from sources the code already uses: the Fabric Maven, Fabric's meta service, Modrinth. Minecraft, the loader and the server's own files are fetched by the launcher and by Fabric's server launcher on the user's machine. Nothing of Mojang's is bundled, cached into a project or exported.
- **D11 Both versions.** A recipe carries the project's target, so a mod on 26.4 gets its own instances beside 26.3's. When the launcher's own lists lack a version (a snapshot), the card says so and offers the user's own instance.

Questions that need the user (none blocks the spike or wave B1):

1. **Java for a local server.** D9 uses the Java a launcher already has. The alternative is to offer a download from Adoptium, which would be a new download source. Default: no download.
2. **The first-time card.** D3 asks once per kind of instance, then goes ahead by itself. Play's first test instance was made without asking until now. Default: as D3.

## 3. Rules for every brief below

These add to `docs/HANDOFF.md` "Rules" and "Rules for every brief" and to section 3 of `docs/PLAN-one-mode-rest.md`, which all apply.

- **Read first:** root `CLAUDE.md`, `packages/interop/CLAUDE.md` or `app/CLAUDE.md`, the last DEVLOG entry, ADRs 0019, 0026, 0046, 0084, 0116, draft ADR 0133 (section 8 until filed), `docs/reference/spikes/b760/README.md` once it exists, and section 10's notes.
- **Safety first.** Every write goes through the containment helpers of `launchers/paths.ts` and the marker check; a brief that adds a write adds a test that a foreign folder is refused. `@msm/interop` stays free of Node imports (the file system, downloader and hasher are injected); processes are started only in `app/src/main`.
- **No network in tests**: inject the downloader; e2e uses the stub launcher and a stub Java program.
- **Launcher facts** not confirmed by the spike or on a real machine are written "(verify at implementation)" and listed for the user's Windows check.
- **Files with one owner at a time across all plans** (named by the main session): `packages/interop/src/index.ts`, `app/src/shared/platform.ts`, the preload and IPC registration files, `app/src/main/platform/play.ts`, `test-in-minecraft.ts`, `node-platform.ts`, `components/play/`, `TestInMinecraftDialog.tsx`, `ModpacksDialog.tsx`, `ExportMapDialog.tsx`, `SettingsDialog.tsx`, `components/settings-catalogue.ts`, every existing e2e spec, `docs/guide/`, `packages/ai/src/prompt/`.
- **One mode, findable, live.** Plain words; the launcher's name, never "instance id" or a path in the default view (paths under More options). The card and the server panel are findable by search ("play with friends", "server", "instance"). The card is its own live view: it shows what will be made before anything is written.
- **Exit criteria always:** `pnpm lint`, `pnpm typecheck`, the touched packages' tests, `node tools/check-deps/index.ts`; app briefs also build and `node tools/check-size/index.ts`.
- **Models:** Opus `claude-opus-5-5` at medium unless said; Sonnet where said.

## 4. Order, and how it fits the other plans

At most five executors at once across all plans; the running plan has first call. None of this plan's package and main-process work shares a file with the running plan, so it fills free slots. The renderer wiring waits for owners: `components/play/` is B701's in the running wave 1; `TestInMinecraftDialog.tsx`, `ModpacksDialog.tsx` and `ExportMapDialog.tsx` are B716's in its wave 4.

| Wave | Briefs (model, effort) | Notes |
|---|---|---|
| B0 | **B760** spike (Opus, high) | Can start now. No Gradle. |
| B1 | **B761** recipes and managed instances (Opus, high), then **B762** the local server in interop (Opus, high) | B761 first commits the two new folders' index files and the export lines in `packages/interop/src/index.ts`; B762 starts from that commit. |
| B2 | **B763** the main-process services and channels (Opus, high) | Declares every channel later briefs use, as "not yet", so they never edit `shared/platform.ts`. |
| B3 | **B764** the offer card and Settings list (Opus, medium) · **B765** Play and Test in Minecraft through recipes (Opus, medium) · **B766** play without mods (Opus, medium) | B765 touches `components/play/` only after B701 and I1 are merged. |
| B4 | **B767** a modpack's and a map's own instance (Opus, medium) · **B768** MultiMC and CurseForge (Opus, medium) · **B769** Play with friends (Opus, medium) | B767's dialog lines after the running plan's B716. B769 after B762 and B763. |
| B5 | **B770** e2e (Opus, medium) · **B771** guide, AI helper lines, changelog (Sonnet and Opus) · **B772** close (main session) | |
| Reserve | **B773** an official launcher profile · **B774** a Java download · **B775** pick a place in the running game (for Plan A's D11) · **B776** to **B779** free | Not run without a reason. |

Against Plan A: its Test and share tab shows **Play with friends** when B769 lands and "Play it without mods" when B766 lands; its Modpack Studio (B750, B751) waits for B767. Against Plan C: the server service takes a second kind, `paper`, in Plan C's B789; nothing here waits for Plan C. A NeoForge plan would add one loader value to the recipe and one component id to the writer.

## 5. The briefs

### B760 Spike: launchers, instances and a local server (wave B0; Opus, high)

- **Purpose:** the launcher and server facts this plan rests on, from the launchers' own sources and documents and, where a launcher can be run here, by trying. *Moves: quickly, higher quality.*
- **Owner files:** new `docs/reference/spikes/b760/` (README with the answers and evidence). No code in the repository.
- **Method:** Prism Launcher's and MultiMC's public sources and wikis, Fabric's meta service, CurseForge's support articles; a Prism build run under `xvfb` if one installs here (say if not); a Fabric server started headless as `tools/run-fabric-server` does. Facts that only Windows can show go on a list for the user.
- **Questions:**
  - N1 Does a running Prism list an instance folder made while it runs, and does `--launch` start one it has not listed yet (ADR 0026's open item)?
  - N2 An `mmc-pack.json` with only `net.minecraft`: accepted? The component ids for Quilt and NeoForge; which Minecraft versions Prism's lists hold for each (26.3, the 26.4 snapshot), and what Prism does with a version it does not list.
  - N3 `--server <address>` with `--launch` (documented for Prism); a world argument (`--world`, said by ADR 0084 to be on Prism's `develop` branch: in which release?); the `instance.cfg` keys that join a server or a world on launch; the same for MultiMC.
  - N4 `--import <file>`: how many clicks it needs. (The plan writes the instance itself; this is the fall-back.)
  - N5 MultiMC and PolyMC: the same writer in their folders; their lists for Fabric on 26.x; anything that differs in `instance.cfg`.
  - N6 CurseForge: the profile file its app imports (the manifest's fields, the loader's id form, whether jars may sit in the overrides folder), the clicks an import needs, and whether writing `minecraftinstance.json` directly is safe (default: no).
  - N7 The official launcher: what a Fabric profile needs and whether its profile list can be edited while it runs. For the reserve only.
  - N8 Java: where Prism keeps the Java it downloads and its setting for the Java path; the official launcher's runtime folder on Windows (both install kinds); the cheapest sure way to read a Java's version (the `release` file).
  - N9 The Fabric server launcher: the address form on the meta service, whether a checksum is published, what its first run downloads and from where, starting offline afterwards, its arguments.
  - N10 `eula.txt`: its form; that a server with it written starts at once.
  - N11 `server.properties` on 26.x: the keys this plan sets (port, `online-mode`, the level's name, the world type by a project preset's id, packs enabled at the start, command blocks, the function permission level, spawn protection). Does a world type from a mod's or a pack's data work on a server?
  - N12 Stopping: `stop` on standard input; ending the process tree on Windows; finding a taken port.
  - N13 A map as a server's world: copying a world folder, its data pack and resource pack.
  - N14 The test instance joining `localhost`: the runtime's client side with dev files present on a multiplayer world (it must stay quiet).
  - N15 "Open to LAN" from dev mode without a click (signatures by `javap` only): a cheaper way to play with a friend on the same network, for the reserve.
  - N16 The list for the user's Windows check.
- **Exit criteria:** N1 to N16 answered with their source or evidence; a table "launcher, can MSM make an instance, how it is started, what stays by hand"; the changes it asks of section 2 and the draft ADR.

### B761 Recipes and managed instances (wave B1; Opus, high)

- **Owner files:** new `packages/interop/src/instances/` (`recipe.ts`, `names.ts`, `marker.ts`, `mmc-writer.ts`, `install.ts`, `index.ts`), `packages/interop/src/index.ts` (the export lines for `instances/` and `server/`), new `packages/interop/src/server/index.ts` (empty, for B762), tests under `packages/interop/test/instances/`. `fabric/instance.ts` is read, not changed: `createManagedInstance` keeps its behaviour and its tests.
- **Scope:** `RunRecipe` and `recipeFor(action, project facts, target facts)` for the actions test, game, modpack, map, plain and server; names and the taken-name rule (D2); the marker's version 2, reading version 1; `ensureInstance(fs, launcher root, recipe)` writing `instance.cfg` and `mmc-pack.json` from a table of component ids (none, Fabric; the others present in the table but refused until their plans), the mods, resource packs and worlds a recipe names, each recorded so only MSM's own files are ever replaced; `describeRecipe(recipe)` giving the card's sentences; `listManaged(fs, roots)`.
- **Exit criteria:** unit tests for every action on both targets; the foreign-folder test of D5 (a made-up root with ten foreign instances, every recipe run twice, the foreign folders unchanged byte for byte, a same-named unmarked folder never touched); a version 1 marker still works; no Node import (`check-deps`); lint, typecheck. *Moves: any mod, higher quality.*
- **Out of scope:** starting anything; CurseForge; the app.

### B762 The local server in interop (wave B1; Opus, high; after B761's first commit)

- **Owner files:** `packages/interop/src/server/` (`layout.ts`, `fabric-launcher.ts`, `java.ts`, `properties.ts`, `eula.ts`, `index.ts`), tests under `packages/interop/test/server/`.
- **Scope:** the server folder's layout and marker; the Fabric server launcher's address from the target's facts and the meta service, cached, its SHA-256 recorded at the first download and compared afterwards; `findJava(fs, env, wanted major)` over the places N8 found, reading the version without starting a program where it can; `server.properties` written key by key (only MSM's keys, the rest kept); the EULA record (never written without the caller passing the user's acceptance); the start command and arguments; the mods and packs a server recipe names.
- **Exit criteria:** unit tests with an injected downloader and a made-up file system (a changed launcher jar is refused; no Java found gives the plain reason; `eula=true` is written only with the acceptance flag; a user's own keys in `server.properties` survive); lint, typecheck, check-deps. *Moves: any mod.*
- **Out of scope:** Paper (Plan C's B789 adds a second kind here).

### B763 The main-process services and channels (wave B2; Opus, high)

- **Owner files:** new `app/src/main/platform/instances.ts`, `local-server.ts`; `app/src/shared/platform.ts` (the new types and channels), the preload and the IPC registration, `node-platform.ts` (the two services), `app/src/main/platform/settings.ts` (the ask setting, the servers list); tests under `app/test/`.
- **Scope:** `instances`: `plan(action)` returning the recipe, its sentences and what exists; `ensure(recipe)`; `list()`; `remove(id)` into the recycle bin after the renderer's question; `launch(recipe)` with the join arguments B760 confirmed. `localServer`: `status`, `prepare` (downloads with progress), `acceptEula`, `start`, `stop`, `restart`, a log stream capped in memory, the process ended with the app. Every later brief's channel is declared now and answers "not yet". Results are `{ ok: false, code, message }`, never throws, as Play's.
- **Exit criteria:** tests with a made-up launcher root and a stub Java program (a script that prints a server's start lines and reads `stop`); a second start while one runs is refused in words; quitting the app stops the child; nothing is written outside a marked folder (the D5 test again at this layer); lint, typecheck, app tests, build. *Moves: quickly.*

### B764 The offer card and the Settings list (wave B3; Opus, medium)

- **Owner files:** new `app/src/renderer/src/components/instances/` (`OfferCard.tsx`, `InstanceList.tsx`, `words.ts`), `app/src/renderer/src/store/instances-store.ts`, `SettingsDialog.tsx` (one section, "Instances MSM made", under Game locations), `components/settings-catalogue.ts` (its search entries), tests.
- **Scope:** the card of D3 with the recipe's sentences, the three choices and progress; the list in Settings (each managed instance and server with its purpose in words, **Show in folder**, **Remove**), and the ask setting. Paths and ids only under More options.
- **Exit criteria:** component tests for each purpose's sentences on both targets; `expectPlain` on the default view; keyboard alone works; screenshots at 1280 and 1920. *Moves: quickly.*

### B765 Play and Test in Minecraft through recipes (wave B3; Opus, medium)

- **Owner files:** `app/src/main/platform/play.ts`, `test-in-minecraft.ts`, `app/src/renderer/src/store/play-store.ts`, `components/play/PrismSetupPanel.tsx` (and `PlayControls.tsx` only for the card's opening), their tests.
- **Scope:** Play, Play my game and Test in Minecraft ask `instances.plan` and show the card when something must be made (never for an existing test instance); the no-Prism panel offers the launchers that are there (a MultiMC folder already added) before explaining how to get Prism; a project on the second target gets its own instance the same way. Behaviour with everything in place is unchanged: one progress line, no dialog.
- **Exit criteria:** the existing Play and Test in Minecraft tests pass unchanged in meaning; new tests for the first Play on each target with and without the ask setting; run (not edit) `play-path`, `launchers-path`, `games-path`. *Moves: quickly.*

### B766 Play without mods (wave B3; Opus, medium)

- **Owner files:** new `app/src/main/platform/plain-play.ts`, its channel bodies, new `app/src/renderer/src/components/instances/PlainPlay.tsx`, tests; `engine-mod` only if the second step below is taken.
- **Scope:** for a project whose session says it plays without mods: make or update the Plain instance, copy the project's game world from the test instance through the map export's code into its `saves/`, and start it on that world. When no game world exists yet, the card says to press Play my game once first. If B760 shows it is small and a client GameTest can cover it, a play request that makes the world and quits lets MSM do that step by itself; otherwise it is a line in the notes. **Open this map** after an Export as a map does the same with the exported world.
- **Exit criteria:** tests that the copied world holds the data pack and not the dev pack or the runtime's overlays, and that a project that needs the mod is refused in words; the D5 test; build. *Moves: higher quality.*

### B767 A modpack's and a map's own instance (wave B4; Opus, medium; dialog lines after the running plan's B716)

- **Owner files:** `app/src/main/platform/modpacks.ts`, `test-in-minecraft.ts` (`runModpack` only), `ModpacksDialog.tsx` and `ExportMapDialog.tsx` (the card's opening and **Open in my launcher** only), tests.
- **Scope:** Test modpack makes and uses `MCSuperMods Pack <name> (<mc>)`; the shared test instance is no longer cleared. A map that needs the mod (a `.mrpack`) gets **Open in my launcher**: its own instance with the jar and the world in `saves/`.
- **Exit criteria:** after a modpack test the test instance's `mods/` is as before; `modpacks-path` and `maps-path` green (run, not edited). *Moves: quickly.*

### B768 MultiMC and CurseForge (wave B4; Opus, medium)

- **Owner files:** `packages/interop/src/instances/mmc-writer.ts` (the MultiMC differences), new `packages/interop/src/instances/curseforge-profile.ts`, `app/src/main/platform/instances.ts` (the two launchers' branches), tests.
- **Scope:** as B760 answered: managed instances in a MultiMC or PolyMC folder the user added; for CurseForge, the profile file with the content jar and Fabric API that its app imports, with the two or three steps said on the card, or a written instance only if N6 called that safe.
- **Exit criteria:** the D5 test on a made-up MultiMC root and CurseForge root; the profile file checked against N6's fields; the facts still unconfirmed listed for the Windows check. *Moves: any mod.*

### B769 Play with friends (wave B4; Opus, medium)

- **Owner files:** new `app/src/renderer/src/components/instances/ServerPanel.tsx`, `server-words.ts`, the Play menu's entry in `components/play/` (one line), tests.
- **Scope:** **Play with friends** from the Play menu and Plan A's Test and share tab: the card (what will be made, the EULA link and tick, the Java found or the plain reason), then the panel with the server's state, its address for people on the same network in words, its log, **Join**, **Restart the server** and **Stop**. One sentence says that friends outside the home network need the user's own router set up, and nothing more: MSM opens no port.
- **Exit criteria:** component tests through the whole flow with the stub server; the EULA cannot be skipped (a test); `expectPlain`; screenshots. *Moves: any mod.*

### B770 e2e (wave B5; Opus, medium)

- **Owner files:** new `app/e2e/instances-path.spec.ts`, `local-server-path.spec.ts`, new stub `app/e2e/assets/stub-java.mjs`.
- **Exit criteria:** with a made-up Prism folder holding two foreign instances: the first Play shows the card once, makes the instance, and the foreign instances are unchanged; a data-pack-only game makes the Plain instance; a modpack makes its own; a server is prepared, the EULA ticked, started, joined and stopped; green three runs in a row; nothing loosened.

### B771 Guide, AI helper lines and changelog (wave B5; Sonnet for the guide, Opus for the prompt)

- **Owner files (when granted):** new `docs/guide/instances.md` with `playing-and-testing.md`, `modpacks.md`, `maps.md` and the sidebar entry; the AI helper's app map lines and pinned hash.
- **Exit criteria:** labels match the app; the search's golden test green with the new queries ("play with friends", "make an instance", "test without mods"); changelog lines in the notes.

### B772 Close (wave B5; main session)

- ADR 0133 to "accepted with findings" with N1 to N16; ADRs 0026 and 0084 gain a line pointing to it; the Windows check list into `docs/HANDOFF.md` "Waiting on the user"; a release on the user's standing word.

## 6. The main session's own steps

- **Before B760:** file ADR 0133 from section 8 as Proposed; add the ROADMAP section from section 9; put section 2's questions to the user.
- **After B760:** amend section 2 and the ADR; drop or reshape B768 if CurseForge has no safe route.
- **Each wave:** name the owner of each one-owner file before starting a brief; append notes to section 10; review against the exit criteria, refusing any write path without its foreign-folder test.

## 7. Limits to say in the guide

- MSM makes instances for Prism Launcher, and for MultiMC in a folder the user has added; CurseForge by importing a file; the official launcher is install-only.
- A local server runs on the user's own computer while MSM is open; it is not hosting.
- Reload works in the single-player test world only; a server needs a restart.
- A world is always made by the game; MSM copies worlds, it does not write them.

## 8. Draft ADR text

**ADR 0133: Instances and servers made from run recipes** (Proposed; the defaults are vetoable)

- *Context.* MSM makes one kind of instance: the Fabric test instance, in Prism only, one per Minecraft version, shared by Play, Test in Minecraft and modpack tests (ADRs 0026 and 0084). There is no instance without mods, none per modpack or map, nothing for MultiMC or CurseForge, and no local server. The user asked (2026-11-23) that MSM offer to make whatever instance is needed to run whatever is being made.
- *D1.* Every play, test or open action is described by a run recipe (purpose, owner, Minecraft version, loader, mods, packs, world, what to join), made by pure code in `@msm/interop`.
- *D2.* Managed instances are made per purpose from recipes: the existing test instance unchanged, a Plain instance without a loader, one instance per modpack, and one per further loader when its plan exists. The marker gains a second version.
- *D3.* MSM offers before it makes: a card says what will be made; the first time for each kind by default, then by itself.
- *D4.* Prism first, MultiMC and PolyMC by the same writer, CurseForge by its app's own import, the official launcher install-only.
- *D5.* MSM writes only inside folders that hold its marker and files it recorded; removal is by the user, into the recycle bin; tests prove foreign folders are untouched.
- *D6.* Games and maps that play without mods can be opened in the Plain instance on a world copied by the map export's code.
- *D7.* A local Fabric server under `<msmHome>/servers/`, started and stopped in sight, joined through the launcher; dev mode stays off on it.
- *D8.* The user accepts Minecraft's EULA for a server by their own tick; MSM never does it for them.
- *D9.* Java is found among what the launchers have; none is bundled or downloaded.
- *D10.* Downloads only from the Fabric Maven, Fabric's meta service and Modrinth; Mojang's files are fetched by the launcher and by Fabric's server launcher on the user's machine and never bundled.
- *Consequences.* Play's safety rule (ADR 0084 D9) now covers several marked folders. The recipe's loader and server kind are the seams a Paper server (ADR 0134) and a NeoForge instance plug into. Main gains a long-lived child process to look after.
- *Status.* Proposed.

## 9. ROADMAP text for the main session

A new section "Instances for anything (ADR 0133, `docs/PLAN-instances.md`, 2026-11-23)" with one checkbox per brief B760 to B772 by its title above and a line for the reserves. The DEVLOG entry is the one in `docs/PLAN-game-studio.md` section 10 (one entry for the three plans).

## 10. Notes from implementation

(The main session appends each executor's "Notes for the plan" here.)

### B760's answers (2026-11-23; `docs/reference/spikes/b760/README.md`, N1–N16)

Folded into the briefs before wave B1 (the main session amends the briefs' text as each starts):
- **D2:** every launcher writer builds the instance in a staging folder and renames it into place in one step (Prism lists a sub-folder only once it has `instance.cfg`; today's `createManagedInstance` makes the folder first, which is the likely cause of ADR 0026's open item: fix it in B761 first); always `InstanceType=OneSix` (MultiMC).
- **D4:** CurseForge through an imported profile .zip (Import, Import Profile .zip, All Files with its tick); the official launcher only while it is closed.
- **D6:** the Plain instance opens the copied world with the launcher's `--world` (Prism since 9.0, MultiMC; PolyMC by hand) — an exception to ADR 0084 since Plain has no runtime.
- **D7:** a local server's state is read from its log lines, never its exit status (a missing EULA and a taken port both exit 0); `server.properties` is written only while stopped; command blocks are the game rule `command_blocks_work`; about 131 MB a server folder; friends need the same mods (offer the `.mrpack`). White list default: off, with online mode on (vetoable; the alternative is on, with **Let a friend in**).
- **D9:** Java places: Prism's `<data>/java/`, the official launcher's `runtime/` (and the Store app's), `java-runtime-epsilon` for 26.x.
- **D10:** the Fabric server launcher's fall-back hosts (`meta2`, `meta3`, `maven2`, `maven3.fabricmc.net`); MSM never queries a launcher's metadata server or reads its account files.
- **D11:** a version the launcher lacks fails at start with the launcher's own message.
- **Reserve:** "Open to LAN" by the runtime (`IntegratedServer.publishServer`, same signatures on both targets).
- **N16:** 14 checks for the user's Windows machine, listed in the README.
