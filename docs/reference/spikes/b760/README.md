# B760 spike: launchers, instances and a local server

Answers N1 to N16 of `docs/PLAN-instances.md` (brief B760) for draft [ADR 0133](../../../adr/0133-instances-for-anything.md), found on 2026-11-23 in a cloud container (Linux, 4 cores, 15 GB) from `6381386`, for the targets mc-26.3 and mc-26.4 (26.4-snapshot-7). Nothing here is built, linted or shipped.

## What was run, and what was not

- **Launcher sources, read, not run.** Prism Launcher at its latest release tag `11.1.1` (2026-09-28; `12.0.0-pre1` came out on 2026-11-14) and at `develop`; older tags `8.4`, `9.0`, `9.4` and `10.0.0` for the `--world` option; MultiMC (`MultiMC/Launcher`, `develop`); PolyMC (`develop`). Files were read one by one from `raw.githubusercontent.com` (the session may not clone them). Quotes below are from those files.
- **Launcher metadata, read.** Prism's (`meta.prismlauncher.org/v1`), MultiMC's (`meta.multimc.org/v1`) and PolyMC's (`meta.polymc.org/v1`) public version lists, to see which Minecraft and loader versions each launcher offers. These are the launchers' own sources, read here as documents; MSM never reads them (see the changes asked of section 3).
- **No launcher was run.** Prism, MultiMC and the CurseForge app are not installed here, and the brief allows downloads only from the Fabric Maven, Fabric's meta service and Mojang's manifest, so no launcher build was fetched. Everything a running launcher does (N1's live listing, N4's clicks) is from source and is on the Windows list (N16).
- **A Fabric server, run.** The Fabric server launcher for 26.3 (loader 0.20.1, installer 1.1.2) from `meta.fabricmc.net`, in a throwaway folder in the scratch directory, with Temurin 25.0.5.1, exactly as `tools/run-fabric-server` starts it (`java -Xmx1G -jar fabric-server-launch.jar nogui`, commands on standard input). Five starts: the first without `eula.txt`, the second with network access cut (proxy pointed at a closed port) and a world preset from a data pack, the third on a taken port, the fourth on a copied world; plus one first start of the 26.4-snapshot-7 launcher to compare its `server.properties`. The EULA was accepted only in that throwaway folder for this test. Every server, jar and world was deleted afterwards.
- **The game's own classes, by `javap` only** (signatures, N15), from the Loom cache's merged jars of both targets.
- **CurseForge and the official launcher**: CurseForge's support articles, two third-party descriptions of its export format, and the strings of Fabric's own installer (`ProfileInstaller`, its language file).
- `results/` holds the server logs and notes (paths replaced by `<scratch>`); `spike-src/msmtest-pack/` is the data pack used for N11 (ours).

## The table

| Launcher | Can MSM make an instance? | How it is started | What stays by hand |
|---|---|---|---|
| **Prism Launcher** (auto-found) | **Yes.** `instance.cfg` (`InstanceType=OneSix`) and `mmc-pack.json` in a folder under `instances/`, made in a staging folder and moved into place with one rename (N1). Plain (only `net.minecraft`), Fabric, Quilt and NeoForge components all resolve from Prism's metadata (N2). | `prismlauncher --dir <root> --launch <folder>`; `--server <host:port>` to join a server, `--world <folder>` to open a world (Prism 9.0 and later), both turned into vanilla quick play on 26.x (N3). The same message reaches a Prism that is already running. | Signing in to an account once. Prism downloads Minecraft, the loader and Java 25 itself at the first start. |
| **MultiMC** (folder added by hand) | **Yes**, by the same writer; `InstanceType=OneSix` is required (an empty type is not a Minecraft instance in MultiMC). Its metadata lists 26.3, 26.4-snapshot-7, Fabric Loader 0.20.1 and the 26.x intermediaries (N5). | `MultiMC --dir <root> --launch <folder>`, `--server`, `--world` (quick play chosen by release date, not by traits). | Signing in; a Java 25 the user installs and picks in MultiMC (MultiMC downloads no Java, verify at implementation). |
| **PolyMC** (folder added by hand) | **Yes**, same writer. PolyMC's metadata has the 26.3 intermediary. | `polymc --dir <root> --launch <folder>` and `--server`; **no `--world`** and no instance key for a world. | Opening the world from the Singleplayer list (Plain play of a map); signing in; Java. |
| **CurseForge app** | **No** written instance (writing `minecraftinstance.json` is not safe, N6). A profile `.zip` it imports: `manifest.json` (`minecraft.version`, `modLoaders: [{ id: "fabric-<loader>", primary: true }]`) and `overrides/` with the jars in `overrides/mods/`. | Only from the CurseForge app. | The import: **Import**, **Import Profile .zip**, **Choose .zip file**, the file, then **All Files** with its acknowledgement tick (files not hosted on CurseForge), then the import (about six clicks, verify at implementation). Installing into an existing CurseForge instance stays as today (install only). |
| **Official launcher** | **No** (reserve B773 only). A Fabric profile is an entry in `launcher_profiles.json` (`launcher_profiles_microsoft_store.json` for the Store app) with `type: custom`, `lastVersionId: fabric-loader-<loader>-<mc>`, plus `versions/<id>/<id>.json` from Fabric's meta `profile/json` (N7). Fabric's own installer asks the user to close the launcher first. | Only from the launcher. | Everything but `mods/` installs, as today. |
| **A local server** | **Yes**, `<msmHome>/servers/<name>/` (D7). | `java -jar fabric-server-launch.jar nogui` in that folder, one process, `stop` on standard input (N9, N12). | Accepting the EULA (D8); router set-up for friends outside the home network. |

## N1 A running Prism and a folder made while it runs

**Answer:** yes, Prism lists it by itself, and `--launch` reaches the running Prism, but only if the folder appears **whole**. Build the instance in a staging folder and move it into place with one rename.

Evidence (Prism `11.1.1`, `launcher/InstanceList.cpp`):
- The constructor watches the instances folder: `m_watcher->addPath(m_instDir)` with `connect(m_watcher, &QFileSystemWatcher::directoryChanged, this, &InstanceList::instanceDirContentsChanged)`. The slot emits `instancesChanged`, which `providerUpdated` turns into `m_dirty = true` and, when the watch is not suspended (`m_watchLevel == 1`), `loadList()`. A suspended watch (during Prism's own copies and imports) reloads on `resumeWatch()` because `m_dirty` is set.
- `discoverInstances()` takes every sub-folder (hidden ones too) that holds `instance.cfg`; the folder name is the instance id. A folder without `instance.cfg` is skipped.
- The watcher sees only changes to the instances folder itself. A folder created first and filled afterwards (as `createManagedInstance` does today: `mkdirp(<instance>/minecraft/mods)`, then `instance.cfg`) can be scanned while it has no `instance.cfg`; the files written inside it later do not change the instances folder, so Prism does not look again until something else changes there. That is the likely cause of ADR 0026's open item. Prism itself stages new instances in `<instances>/.tmp/<random>/` and moves them in (`commitStagedInstance`).
- `--launch` to a running Prism (`launcher/Application.cpp`): the new process sends `{ command: "launch", id, server | world }` through `LocalPeer`; the running one looks up `instances()->getInstanceById(id)` and, if nothing matches, logs "Launch command requires an valid instance ID. … resolves to nothing." and does nothing. Messages that arrive while Prism is still starting are ignored ("while still initializing. It will be ignored."). When Prism is not running, the new process loads the list at start, so any finished folder is found.
- What MSM can check afterwards: Prism writes `lastLaunchTime` into `instance.cfg` when the game starts (`BaseInstance::setMinecraftRunning`, only while the global `RecordGameTime` is on, the default). A launch that changed nothing there within a few seconds can be retried once.

MultiMC (`develop`, `InstanceList.cpp`) has the same watcher and the same `instance.cfg` rule; its staging folder is `_LAUNCHER_TEMP`.

## N2 Plain instances, other loaders, and the lists

- **Only `net.minecraft`: accepted.** It is how Prism's own vanilla instances look. Prism's `net.minecraft/26.3.json` requires `org.lwjgl3` (`suggests 3.4.3`); `ComponentUpdateTask::resolveDependencies` adds a missing requirement itself as a dependency-only component (`m_dependencyOnly = true`) at the `equals` or `suggests` version, as it already adds `net.fabricmc.intermediary` for Fabric (Fabric Loader 0.20.1 requires `net.fabricmc.intermediary` with no version; the intermediary version requires `net.minecraft` `equals` the game).
- **Component ids** (Prism's metadata index, the same in MSM's `MMC_LOADER_UIDS`): Fabric `net.fabricmc.fabric-loader` (with `net.fabricmc.intermediary`), Quilt `org.quiltmc.quilt-loader` (requires `net.fabricmc.intermediary`), NeoForge `net.neoforged`, Forge `net.minecraftforge`, LiteLoader `com.mumfrey.liteloader`; Java runtimes are separate packages (`net.minecraft.java`, `net.adoptium.java`, `com.azul.java`, `com.ibm.java`).
- **What the lists hold (2026-11-23):**

| Package | 26.3 | 26.4-snapshot-7 |
|---|---|---|
| Prism `net.minecraft` | release, recommended, Java 25 (`java-runtime-epsilon`), quick play traits | snapshot (up to snapshot-10 listed), Java 25, quick play traits |
| Prism `net.fabricmc.intermediary` | yes | yes |
| Prism `net.fabricmc.fabric-loader` 0.20.1 | yes (any game version) | yes |
| Prism `net.neoforged` | yes (`26.3.0.109` to `26.3.0.115`) | none seen in the first part of the list (verify at implementation) |
| Prism `org.quiltmc.quilt-loader` | 0.30.2 (release), 0.31.0 betas; loader-only, game by intermediary | the same |
| MultiMC `net.minecraft`, `net.fabricmc.intermediary`, Fabric Loader 0.20.1 | yes, yes, yes | yes, yes, yes |
| PolyMC `net.fabricmc.intermediary` | yes | not checked |

- **A version Prism does not list:** the component update fails when the instance is started or edited, with "Could not download metadata for %1 %2. Please change the version or try again later." (or "No version list in metadata index for %1" for an unknown uid). The instance stays; the game does not start. MSM should not ask Prism's metadata server itself (a new source); the card can say that the launcher will tell if it lacks the version, and offer the user's own instance (D11).

## N3 Joining a server or a world

- **Prism:** `-s/--server <address>` and `-w/--world <world>` exist in every release from **9.0** (absent in 8.4, present in 9.0, 9.4, 10.0.0 and 11.1.1). Both need `--launch`; a server wins over a world. For 26.x the game gets `--quickPlayMultiplayer <host>:<port>` or `--quickPlaySingleplayer <world>`, because Prism's `net.minecraft` 26.3 and 26.4-snapshot-7 files carry the traits `feature:is_quick_play_multiplayer` and `feature:is_quick_play_singleplayer` (`MinecraftInstance::processMinecraftArgs`). The world is the save's folder name (vanilla quick play; verify at implementation that Prism passes it unchanged); vanilla quick play opens only an existing world (ADR 0084).
- **Prism `instance.cfg` keys** (`[General]`): `JoinServerOnLaunch=true` with `JoinServerOnLaunchAddress=<host:port>`; for a world `JoinServerOnLaunch=true`, `JoinServerOnLaunchAddress` empty and `JoinWorldOnLaunch=<world>` (a string; the world is used only when the address is empty). The command line is the better route: it does not stay in the instance.
- **MultiMC:** `--server`, `--world`, `--profile`, `--import`, `--dir`, `--launch`; quick play when the game's release date is after `quickPlayBeginsDate`, else `--server`/`--port`. Its keys differ: `JoinWorldOnLaunch` is a **bool** gate, then `JoinServerOnLaunch` and `JoinServerOnLaunchAddress`, or `JoinSingleplayerWorldOnLaunch` and `JoinSingleplayerWorldOnLaunchName`.
- **PolyMC:** `--server` only; keys `JoinServerOnLaunch`, `JoinServerOnLaunchAddress`; no world.

## N4 `--import <file>`

Prism and MultiMC accept `-I/--import <path or URL>` (PolyMC too). In a running Prism the `import` message calls `MainWindow::processURLs`: a `.zip` or `.mrpack` opens the **New Instance** dialog with the file filled in (`NewInstanceDialog … exec()`), so the user confirms once (name and group may be changed); a single mod or resource pack opens **ImportResourceDialog** to pick an instance. One confirming click for a modpack, verify at implementation. The plan writes the instance itself; this stays the fall-back and the route for a `.mrpack` map (ADR 0116's open item).

## N5 MultiMC and PolyMC with the same writer

The same files work: `instance.cfg` with `InstanceType=OneSix` (MultiMC: `OneSix` or `Nostalgia` make a Minecraft instance; a missing key defaults to `Legacy`; anything else is a null instance), `name=`, and the same `mmc-pack.json` (`formatVersion` 1, components with `uid`, `version`, `important`). Differences: the join keys (N3), PolyMC has no `--world`, MultiMC's staging folder is `_LAUNCHER_TEMP`, and MultiMC's `net.minecraft/26.3.json` has no `compatibleJavaMajors` and no quick-play traits (its quick play is by date), so MultiMC does not pick Java 25 by itself (verify at implementation). Lists for Fabric on 26.x: N2.

## N6 CurseForge

- **Import route** (CurseForge support, "Sharing Modpacks/Custom Profiles"): **Import**, **Import Profile .zip**, **Choose .zip file**. Only a `.zip` that "matches CurseForge's export structure" imports. Files not hosted on CurseForge are flagged; the user chooses **CurseForge Files Only** or **All Files**, the latter with an acknowledgement tick. So a profile carrying MSM's own jars in `overrides/mods/` imports only through **All Files**, and the user must tick that box themselves.
- **The manifest** (third-party descriptions of the export; no official schema was found, so verify at implementation): `manifest.json` and `overrides/` at the top of the zip; `manifestType: "minecraftModpack"`, `manifestVersion: 1`, `name`, `version`, `author`, `minecraft: { version, modLoaders: [{ id: "<loader>-<version>", primary: true }] }` (so `fabric-0.20.1`, matching MSM's reader's `baseModLoader.name` prefixes), `files: [{ projectID, fileID, required }]` (CurseForge ids, which need their API; ADR 0046 D8 left that out) and `overrides: "overrides"`. MSM would list no `files` and put the content jar and Fabric API in `overrides/mods/`.
- **Writing `minecraftinstance.json` directly: no.** The app owns the file (installed modpack and file records from its API, its own ids), rewrites it, and nothing documents it. Installing into an existing CurseForge instance's `mods/` stays as today.
- Whether CurseForge offers Fabric for 26.3 and 26.4 snapshots in its own lists, and the click count, are Windows checks.

## N7 The official launcher (reserve)

From Fabric's installer (the server launcher jar is the installer; `ProfileInstaller`, `ClientInstaller`, `lang/installer.properties`): the profile file is `launcher_profiles.json`, or `launcher_profiles_microsoft_store.json` for the Store app; a profile under `profiles` with `name`, `type: "custom"`, `created`, `lastUsed`, `icon`, `lastVersionId: "fabric-loader-<loader>-<mc>"`; the version file comes from `meta.fabricmc.net` `v2/versions/loader/<mc>/<loader>/profile/json` into `versions/<id>/<id>.json`. Editing while the launcher runs: Fabric's installer checks `isMojangLauncherOpen` and asks "Please close the Minecraft launcher before installation to ensure correct operation." So: never while it runs; the reserve stays a reserve.

## N8 Java

- **Prism:** global setting `JavaDir`, default `java` (relative to the data folder); a Java Prism downloads lands in `<data>/java/<name>/` (`InstallJavaDialog`: `FS::PathCombine(APPLICATION->javaPath(), meta->m_name)`). Prism's own scan looks one level down for `jre/bin/<exe>`, `bin/<exe>` or `<exe>` (`javaw.exe` on Windows, `java` elsewhere). The global `JavaPath` setting, and per instance `OverrideJavaLocation` with `JavaPath`. `AutomaticJavaSwitch` and `AutomaticJavaDownload` default to on when no global `JavaPath` is set, so after the first Play of the 26.3 test instance a Java 25 is normally in `<data>/java/` (the name of the folder, verify at implementation).
- **The official launcher** (from Prism's `JavaUtils.cpp`, which scans them): `%APPDATA%\.minecraft\runtime\` for the standalone launcher and `%LOCALAPPDATA%\Packages\Microsoft.4297127D64EC6_8wekyb3d8bbwe\LocalCache\Local\runtime\` for the Store and Xbox app, searched for a `bin` folder; the component for 26.x is `java-runtime-epsilon` (Prism's metadata). The layout below `runtime\` is verify at implementation.
- **Reading the version:** the `release` file at the Java home (`JAVA_VERSION="25.0.5.1"`, `IMPLEMENTOR`, `OS_ARCH` on Temurin; `JAVA_VERSION="21.0.12.1"` on Ubuntu's OpenJDK). Read the major from `JAVA_VERSION` (the part before the first dot). Whether Mojang's runtimes ship `release` is verify at implementation; when it is missing, `java -version` is the fall-back.

## N9 The Fabric server launcher

- **Address:** `https://meta.fabricmc.net/v2/versions/loader/<mc>/<loader>/<installer>/server/jar` (as `tools/run-fabric-server`), the installer from `v2/versions/installer` (first `stable: true`, 1.1.2 today). The file name the service gives: `fabric-server-mc.<mc>-loader.<loader>-launcher.<installer>.jar`.
- **Checksum: none published.** `.sha1`, `.sha256`, `.sha512` and `.md5` beside it answer 404, and the response has no digest header. **The bytes are stable:** two downloads today and the copy cached on 2026-11-13 have the same SHA-256 (26.3: `70446947…5d95`; 26.4-snapshot-7: `aec2a320…cd35`). The jar is the installer 1.1.2 (`Main-Class: net.fabricmc.installer.ServerLauncher`, `Implementation-Version: 1.1.2`, classes dated 2026-07-17) plus `install.properties` (`fabric-loader-version=0.20.1`, `game-version=26.3`). The installer jar on the Fabric Maven has published `.sha1`, `.sha256` and `.sha512`, so a stronger check is possible: every entry but `install.properties` equal to the Maven installer's (verify at implementation).
- **First run** (`results/n9-first-run-26.3.log`, 16 s here): "Downloading Minecraft server", "Installing Fabric Loader 0.20.1(26.3) on the server", the loader, Mixin and ASM libraries, then the server bundle unpacks its libraries. From where (the launcher's strings; a logging proxy did not see Java's traffic, so this is from the code): Mojang's `launchermeta.mojang.com/mc/game/version_manifest_v2.json`, the version JSON and the server jar (checked against the version JSON's SHA-1, `isServerJarValid`); Fabric's `meta.fabricmc.net` `v2/versions/loader/<mc>/<loader>/server/json`; libraries from `maven.fabricmc.net`. The launcher also names fall-back hosts `meta2`, `meta3`, `maven2` and `maven3.fabricmc.net`.
- **What it leaves:** `.fabric/server/<mc>-server.jar` (60 MB) and `fabric-loader-server-<loader>-minecraft-<mc>.jar`, `versions/<mc>/server-<mc>.jar` (26 MB), `libraries/` (46 MB), `mods/`, `logs/`, `server.properties`, `eula.txt`: about **131 MB per server folder** before the world.
- **Offline afterwards: yes.** The second start with the network cut started in 1.5 s with no download line (`results/n9-n11-offline-start-with-pack-preset-26.3.log`).
- **Arguments:** `java [-Xmx…] -jar fabric-server-launch.jar nogui`. The launcher reads the system properties `fabric.installer.server.gameJar` (an existing server jar), `fabric.gameJarPath` and `fabric.customLoaderPath`. It starts the game in the same JVM (Knot): one process.

## N10 `eula.txt`

- Written by the server when missing (`results/n10-eula-as-written-by-26.3.txt`): two comment lines (the EULA link `https://aka.ms/MinecraftEULA` and a timestamp) and `eula=false`; the log says "You need to agree to the EULA in order to run the server. Go to eula.txt for more info." and the process **ends with status 0**.
- A file holding `eula=true` (the single line `tools/run-fabric-server` writes, comments optional) lets the server start at once, both on a folder already installed and on a fresh one (CI's runs).

## N11 `server.properties` on 26.x

- The server writes every key on first start and **rewrites the whole file on every start**: comments are dropped, keys sorted, `:` written `\:`, and of two lines with the same key the last wins; whether a key the game does not know survives the rewrite was not tested (verify at implementation) (`results/n11-properties-rewrite-26.3.txt`, key list in `results/n11-server-properties-keys-26.3.txt`). So MSM edits it only while the server is stopped, key by key, and keeps nothing in comments.
- The keys this plan sets: `server-port` (25565), `online-mode` (true), `level-name` (`world`), `level-type` (`minecraft\:normal`; any world preset id), `initial-enabled-packs` (`vanilla`) and `initial-disabled-packs`, `function-permission-level` (2), `op-permission-level` (4), `spawn-protection` (16), `difficulty`, `gamemode`, `max-players`, `motd`, `pause-when-empty-seconds` (60). **`white-list=true` is the default on 26.3 and 26.4-snapshot-7**: with an empty list nobody can join, not even the host. **There is no `enable-command-block`**: command blocks are the game rule `command_blocks_work`. 26.4-snapshot-7 adds `allowed-connection-ids`, `enable-legacy-status` and `status-contact-details`.
- **A world type from a pack's data works on a server.** A data pack placed in `world/datapacks/msmtest/` before the first start, with `level-type=msmtest\:void_world`, was found ("Found new data pack file/msmtest, loading it automatically"), enabled, and made the overworld empty (`0 -64 0` is air). The type is used only when the world is created; a later `level-type` does not change an existing world (N13). A mod's preset (the content jar's `data/`) is in the registries the same way (not run here; the content jar's data is loaded before the world, as Play my game relies on).

## N12 Stopping, the process, the port

- `stop` on standard input: saved and ended in about 1 s.
- One process: the Fabric server launcher runs the game in its own JVM, no child JVM. Spawned directly (no shell), `child.kill()` ends it on Windows too (Node uses `TerminateProcess` on that process); with a shell between, `taskkill /PID <pid> /T /F` would be needed. Prefer `stop`, then kill after a time-out, as the dev tool does.
- **A taken port does not fail the process:** "**** FAILED TO BIND TO PORT!", "Perhaps a server is already running on that port?", a crash report in `crash-reports/`, "Stopping server", **exit status 0** (`results/n12-port-taken-26.3.log`). So MSM checks the port before the start (Node `net` listen on it, then close) and also reads the log for that line. The game itself has `HttpUtil.getAvailablePort()` and `isPortAvailable(int)` (javap), for the LAN route.
- The server listens on all interfaces (`Starting Minecraft server on *:25599`); query and RCON are off by default.

## N13 A map as a server's world

A world folder copied beside the server and named in `level-name` opened as it was, with its own `datapacks/` enabled and its own world type kept (`results/n13-copied-world-26.3.log`). For a map: copy the world folder (with its `datapacks/`, without the dev pack and the runtime's overlays, as D6) into the server folder under the name in `level-name`. A resource pack cannot be read from the world folder by a server: `resource-pack` takes a download URL (with `resource-pack-sha1`), so a map's resources reach friends only in a mod (the content jar) or by hand. Not checked here: whether `level.dat`'s `Data.Player` of a single-player map is ignored by a server (it is a single-player field; verify at implementation).

## N14 The test instance joining `localhost`

From the runtime's code (`DevMode`, `DevClient`): dev mode on the server side is off for every dedicated server; on the client, `play.json` is acted on only at the title screen with no world and no integrated server, and `reload` or `reopen` answer "The test world is not open, so nothing was reloaded." when `getSingleplayerServer()` is null. It stays quiet on a server, but two things matter for the plan:
- `status.json` then reports `state: "world"` with `world: null`. Play's service must read that as "on a server", not as the test world.
- A `play.json` left from an earlier Play could open the test world instead of joining, if the title screen shows before quick play connects. Main must not leave a play request when it starts a server join (and delete a stale one). A client GameTest could cover it (verify at implementation).
- The client and the server must carry the same content jar, runtime and Fabric API (Fabric's registry sync), so the test instance can join only the server MSM made from the same export.

## N15 "Open to LAN" without a click (reserve)

`javap`, identical on 26.3 and 26.4-snapshot-7: `IntegratedServer.publishServer(MinecraftServer.MultiplayerScope, boolean, int)` and `publishServer(MultiplayerScope, int)`, `unpublishServer()`, `isPublished()`, `getPort()`; the enum `MinecraftServer$MultiplayerScope { OFF, LAN }`; `MinecraftServer.setDefaultGameType(GameType)`; `HttpUtil.getAvailablePort()`, `isPortAvailable(int)`. A `lan` request in `request.json` handled by `DevClient` on the client thread would be small (no Mixin). Friends on the same network then join the user's own test world, with the same mods on their side. It needs no Java search and no EULA, and it stops when the user leaves the world.

## N16 The list for the user's Windows check

1. Prism (11.x) running: Play makes a new managed instance; it shows in Prism's list at once and starts without restarting Prism (staged folder and rename). Then once with Prism closed.
2. Prism: `--launch <Plain instance> --world <folder>` opens a copied game world in a Plain 26.3 instance; whether the accessibility screen or the experimental settings screen stops it (the Plain instance has no runtime to answer).
3. Prism: `--launch "MCSuperMods Test (26.3)" --server 127.0.0.1:<port>` joins the local server with a signed-in account; the chip and Reload say the right thing on a server.
4. Prism's downloaded Java: the folder under `<data>/java/` after the first 26.3 start, and its `release` file.
5. The official launcher's `runtime\java-runtime-epsilon\…` layout (standalone and Store installs) and whether it has a `release` file.
6. The Windows Firewall prompt when the server first listens (`java.exe` or `javaw.exe`), and what to say about it.
7. Stopping the server when MSM closes; a killed MSM leaving no `java.exe` behind (and the next start finding the port free).
8. A friend on the same network joining the server (white list off, online mode on), with and without the mod; a data-pack-only game on a Fabric server without mods joined by a vanilla client.
9. MultiMC in a folder added in Settings: the same instance is listed and launched; which Java it uses for 26.3.
10. PolyMC: launch, and the Plain world by hand.
11. CurseForge: the profile `.zip` imports with **All Files** and the tick; the click count; whether Fabric for 26.3 and the 26.4 snapshot is offered.
12. Prism `--import <map>.mrpack`: the clicks, and whether `overrides/saves/` lands as a world (ADR 0116's open item).
13. The test instance's `play.json` not interfering with a server join (N14).
14. A NeoForge 26.3 instance from the same writer, if a NeoForge plan starts (not needed now).

## Facts later briefs need

- **B761 (recipes, writer).** Write `instance.cfg` (`[General]`, `InstanceType=OneSix`, `name=`) and `mmc-pack.json` in `<instances>/.msm-staging/<random>/<name>/` (the staging folder has no `instance.cfg` at its top, so Prism, MultiMC and MSM's reader skip it), then rename into `<instances>/<name>`; remove a stale staging folder on the next run. Plain: `[{ important: true, uid: "net.minecraft", version }]` only. Component table: none, `net.fabricmc.fabric-loader`; present but refused: `org.quiltmc.quilt-loader`, `net.neoforged`, `net.minecraftforge`. Prism writes into the folder itself (`instance.cfg`'s `lastLaunchTime`, `totalTimePlayed`, its own keys), so `instance.cfg` is never hashed or compared as MSM's file; the marker is MSM's record. Never use Prism's `ManagedPack*` keys (they mean a modpack platform's instance). Write `onboardAccessibility:false` into the Plain instance's `options.txt` as for the test instance.
- **B762 (server in interop).** Launcher URL as above; record SHA-256 at the first download (stable bytes), optionally compare the classes with the Maven installer's SHA-512-checked jar. Start states from the log, never the exit status: `Done (` = running; `You need to agree to the EULA` = EULA missing; `FAILED TO BIND TO PORT` = port taken; exit 0 in all three. `server.properties` only while stopped. Defaults to set: `white-list` (see the changes asked), `spawn-protection=0` for games, `server-port` chosen free, `level-name`, `level-type` (a preset id; the world type of a game's world setup, placed by its pack or the content jar before the first start), `initial-enabled-packs` left alone. Command blocks by the game rule, not a key. `findJava`: the places in N8 and the `release` file. About 131 MB per server folder: one server per project at most, and **Remove** in Settings matters.
- **B763 (main).** Spawn `java` directly (no shell); `stop` then kill after a time-out; check the port before starting; read the log for the states above. After making an instance while Prism runs, wait about a second before `--launch`, and confirm by `lastLaunchTime` (retry once).
- **B765.** Join a server with `--server <host:port>` after `--launch` (Prism, MultiMC, PolyMC); never through `instance.cfg`. On a server, `status.json` says `world` with `world: null`. Remove a stale `play.json` before a join.
- **B766.** The Plain instance has no runtime, so the world is opened with `--world <folder>` (Prism 9.0 or later, MultiMC), else by the user (PolyMC); the copied world must already exist (quick play opens only existing worlds). The experimental settings screen of a game with its own world type is the user's click there.
- **B768.** MultiMC: `InstanceType=OneSix` mandatory, staging under `.msm-staging` also fine; no Java download. CurseForge: a profile `.zip` (manifest fields above, `fabric-<loader>`, no `files`, jars in `overrides/mods/`), the card naming **All Files** and the tick; no written instance.
- **B769.** Friends need the same mods: for a project that needs the jar, the card offers the friend's files (the modpack `.mrpack` of the same export); a data-pack-only game can run on a server without mods (verify that vanilla clients join a Fabric server without mods). The white list: see below.

## Changes asked of the plan

**Section 2:**
- **D2:** add "made in a staging folder and moved into place with one rename, so a running launcher lists it at once (B760 N1); `InstanceType=OneSix` always (MultiMC needs it)".
- **D4:** CurseForge by a profile `.zip` the user imports with **All Files** and its tick; writing `minecraftinstance.json` stays no (N6). B768 keeps its shape. The official launcher reserve (B773) would require the launcher closed (N7).
- **D6:** the Plain instance opens the copied world with the launcher's `--world` (Prism 9.0 and later, MultiMC); PolyMC users open it from the Singleplayer list. This is a new exception to ADR 0084's "the runtime hook instead of Prism's `--world`", for Plain only, because Plain has no runtime. The experimental settings screen is the user's click there.
- **D7:** add: the server's state is read from its log (exit status 0 on a missing EULA and on a taken port); `server.properties` is written only while stopped (the server rewrites it); the white list is on by default on 26.x, so MSM must choose (proposed default: `white-list=false` for **Play with friends**, which is for people on the same network, with online mode on; the vetoable alternative is the white list on and **Let a friend in** adding names through `whitelist add` on standard input); command blocks by game rule; about 131 MB per server; friends need the same mods (the friend's `.mrpack`).
- **D9:** the places: Prism `<data>/java/<name>/bin/javaw.exe`, the official launcher's `runtime\` (standalone and Store), then `JAVA_HOME` and the path; the version from `release`. MultiMC brings no Java.
- **D10:** say that Fabric's server launcher itself reads Mojang's version manifest and server jar (SHA-1 checked) and Fabric's meta and Maven, with fall-back hosts `meta2`, `meta3`, `maven2`, `maven3.fabricmc.net`; MSM never asks a launcher's metadata server (Prism's, MultiMC's) itself.
- **D11:** a version a launcher lacks shows as the launcher's own error at start; MSM does not check the launcher's metadata in advance.
- **Questions for the user:** add a third: the server's white list (the default above).
- **Reserve B775 or a new reserve:** "Open to LAN" from dev mode is small (N15) and needs no Java, EULA or server; worth naming as the cheaper **Play with friends** for a game in the test world.

**Section 3:**
- Add: "A launcher writer builds in a staging folder and renames into place; a test proves no half-made folder ever appears at the instance root, and that a stale staging folder is cleaned up."
- Add: "A server's state comes from its log lines, never its exit status; tests cover the EULA, port-taken and started lines."
- Add: "Never read a launcher's account files (Prism's `accounts.json`, the official launcher's account store), nor ask a launcher's metadata server."

**ADR 0133** (draft text, section 8):
- D2: "…from recipes, written in a staging folder and moved into place in one rename; …".
- D4: "…CurseForge by a profile file its app imports (the user chooses All Files), the official launcher install-only."
- D6: "…opened in the Plain instance on a world copied by the map export's code, with the launcher's own `--world`."
- D7: add "its state read from its log; the white list as the user chooses (default off, online mode on)".
- D10: add the fall-back hosts and that MSM never queries a launcher's metadata.
- Consequences: add "Friends need the same mods as the server; the modpack export carries them." and "Each server folder holds about 130 MB of the game's files."

## Sources

- Prism Launcher, tag `11.1.1` and `develop`: `launcher/Application.cpp`, `launcher/InstanceList.cpp`, `launcher/BaseInstance.cpp`, `launcher/minecraft/MinecraftInstance.cpp`, `launcher/minecraft/ComponentUpdateTask.cpp`, `launcher/ui/MainWindow.cpp`, `launcher/java/JavaUtils.cpp`, `launcher/ui/java/InstallJavaDialog.cpp`; tags `8.4`, `9.0`, `9.4`, `10.0.0` (`Application.cpp`); the releases page (GPL-3.0; read, not copied).
- MultiMC `develop`: `launcher/Application.cpp`, `launcher/InstanceList.cpp`, `launcher/minecraft/MinecraftInstance.cpp`. PolyMC `develop`: `launcher/Application.cpp`, `launcher/minecraft/MinecraftInstance.cpp`; its releases page.
- Metadata: `meta.prismlauncher.org/v1/` (`index.json`, `net.minecraft/index.json`, `net.minecraft/26.3.json`, `net.minecraft/26.4-snapshot-7.json`, `net.fabricmc.intermediary/index.json`, `net.fabricmc.fabric-loader/0.20.1.json`, `net.neoforged/index.json`, `org.quiltmc.quilt-loader/index.json`); `meta.multimc.org/v1/` (`net.minecraft/index.json`, `net.minecraft/26.3.json`, `net.fabricmc.intermediary/index.json` and `26.3.json`, `net.fabricmc.fabric-loader/0.20.1.json`); `meta.polymc.org/v1/net.fabricmc.intermediary/26.3.json`.
- Fabric: `meta.fabricmc.net/v2/versions/installer`, `…/versions/game`, the server launcher jars for 26.3 and 26.4-snapshot-7, `maven.fabricmc.net/net/fabricmc/fabric-installer/1.1.2/` checksums.
- CurseForge support: article 9000197912 "Sharing Modpacks/Custom Profiles", 9000198501 "Exporting modpacks"; GDLauncher's "modpack manifest format" and the itzg docker-minecraft-server "auto-curseforge" pages for the manifest fields (third-party).
- MSM: `packages/interop/src/fabric/instance.ts`, `launch.ts`, `launchers/mmc.ts`, `curseforge.ts`; `tools/run-fabric-server/index.ts`; `engine-mod/…/runtime/dev/DevMode.java`, `client/dev/DevClient.java`; `packages/targets/mc-26.3/src/target.ts` (`gameRules`, `packFormats`, `java`); ADRs 0019, 0026, 0046, 0084, 0116.
