# B780 spike: Paper for game modes

Answers P1 to P18 of `docs/PLAN-paper.md` (Plan C) for [ADR 0134](../../../adr/0134-paper-server-plugins.md), measured on 2026-11-23 in a cloud container (4 cores, 15 GB) from main c29aea8. Another worker ran Gradle and a Fabric server for the games spike at the same time, so the times below are from a shared machine. Nothing here is built, linted or shipped.

**Only 26.3 was measured.** PaperMC has no build for the 26.4 snapshot (P2); the nearest version with a build is 26.3 itself (26.2 is marked unsupported).

Clean room: Paper's published API (`io.papermc.paper:paper-api`), its sources jar and PaperMC's documents were read; no Paper or Mojang internals were decompiled. The server's own log output (including its stack traces) and its data generator report were read at run time; the report (`packets.json`) is not kept. Only MSM's own code and our own measurements are kept here.

## What was run

- **Paper 26.3 build 259** (STABLE, 2026-11-23), fetched through the Fill v3 service with the User-Agent `MCSuperMods-spike/0.1 (+https://github.com/MEZTKING/MCSuperMods)`, its SHA-256 checked, run headless with JDK 25.0.5.1 and `-Xmx2G`, one server at a time, offline mode on `127.0.0.1`, console commands through a FIFO (`spike-src/tools/`). EULA accepted only in the throwaway folder.
- **The sample's vanilla data pack** (`msm_sample_game_modes.zip`, exported by `packages/exporters/test/sample-game-modes.golden.test.ts` with a stand-in runtime jar; byte-identical to the one CI exports), in two ways: in `world/datapacks` (as a server owner would drop it) and as files inside the spike plugin's jar (as D2 would ship it).
- **A throwaway Paper plugin** (`spike-src/plugin/`, Gradle 9.8.2, Java 25, `compileOnly` on the API): a bootstrapper that registers the jar's data packs and the commands a function may name; a plugin class with the games extras (ban, boxes, death, menu, dialog, worlds), probes that read state through the API, and a MockBukkit test (`src/test`). The same classes were built a second time as `msm_spike_b` for P6. A Bukkit-style `plugin.yml` jar (`spike-src/legacy/`) for P16.
- **Headless stand-in players** (`spike-src/bot/bot.mjs`, Node 24, `net` and `zlib` only): a minimal offline-mode client that logs in, finishes the configuration phase, answers keep-alives, pings and teleports, and can break a block, run a command, click a menu slot, respawn, and read chat, titles, menus, dialogs and the death screen. Packet ids come from the server's own data generator report, run once on Paper's cached Mojang jar (`java -DbundlerMainClass=net.minecraft.data.Main -jar cache/mojang_26.3.jar --reports`, 30 s). Formats are the public protocol's; the one 26.3 change found (P7) was read from the server's decode error.
- **The seven checks** of `SampleGameModesParityTest` replayed by `spike-src/bot/parity.mjs` (console commands, the plugin's probes, stand-in players), and P8 to P14 by `extras.mjs`. Results in `results/`.

## Answers

| # | Answer | Verdict |
|---|---|---|
| P1 | The vanilla data pack loads clean on Paper 26.3 and passes all seven checks (vanilla data pack column) | go |
| P2 | Builds for 26.3 (stable since build 175); none for any 26.4 snapshot; Java 25 | go for 26.3; no Paper on mc-26.4 |
| P3 | Fill v3: three calls, SHA-256 in the answer, User-Agent with a contact URL; Paper itself then fetches Mojang's server jar | go with a second download host |
| P4 | `paper-plugin.yml`: name, version, main, bootstrapper, api-version `'26.3'` (+ description, authors) | go |
| P5 | A pack in the jar, registered at bootstrap, is on by itself in new and old worlds; removing the jar ruins a World Type world | go with a limit |
| P6 | Two jars with the same runtime classes are kept apart; packs do not clash; a shared plain command label goes silently to the later plugin | go with a rule |
| P7 | A real Paper server plus headless stand-in players, in Node; MockBukkit for event logic only | go (route chosen) |
| P8 | 33 of ADR 0111's 44 argument types are native; 11 are not | go with this change |
| P9 | The bridge works both ways, as the server and as a player, and after `/minecraft:reload`, only if the command is registered in the bootstrapper | go with this change |
| P10 | Ban with an end time works online, at login and for an offline name; the message is shown | go |
| P11 | Break, place, damage and drop cancelled by box; about 130 ns a check | go |
| P12 | Cancelling the death event, or lethal damage turned into a respawn: no death screen; drops chosen | go |
| P13 | Chest menus with cancelled clicks, and the dialog API, both reach a plain client | go |
| P14 | A world per match: made in 1 to 3 s, unloaded in under 0.15 s, deleted in about 10 to 25 ms | go (not on Folia) |
| P15 | Rules on Paper is a Script API host over the API, about 60 members; estimate 1 spike and 2 to 3 high briefs | go for B793, with a cheaper first step |
| P16 | `plugin.yml` cannot register packs or function-visible commands; Spigot is lost | no-go for the Bukkit route (D8 holds) |
| P17 | Paper is GPLv3 by inheritance; the API artefact carries no licence of its own; nothing of Paper is shipped | go |
| P18 | Runtime jar tens of KB; Paper cache about 220 MB; first start about 30 s, later 13 to 20 s | go |

**D2 (one self-contained jar per mod): go.**

### P1 The sample's vanilla data pack on Paper

- **In `world/datapacks`** (run A0, `results/server-log-excerpts.txt`): "Found new data pack file/msm_sample_game_modes.zip, loading it automatically"; the World Type `msm_sample_game_modes:sky_survival` works as `level-type` in `server.properties` (the sky biome at 0 64 0, `world_setup:1b`, difficulty Normal, two teams, three objectives, the Round boss bar of 300); exactly the bridge's three functions fail to load, as on the vanilla server.
- **The seven checks**, both with the zip in `world/datapacks` (`results/parity-26.3-zip.txt`, 58 of 58) and with the pack inside the plugin jar (`results/parity-26.3.txt`, 57 of 57): the game set up at load; the island placed once at the first join with its chest naming its loot table, the spawn 5 67 3, three bread and slow falling once, not placed again for a second player, the home island area tagging a player and its reset placing the island and removing a pig; the one block refilled through 20 breaks with "Underground" and "Deep dark" once each and the phase at 2; the round timer counting down on the boss bar, ending, the title "Round over" reaching the player and `round_end` rebuilding the arena; the arena entered (tagged), left (untagged) and reset (dirt and pig gone, player kept); a kill scoring one point on Defeats; the lucky block's item unknown. The Rules effects are absent, as in the vanilla column.
- **With the bridge command registered by the plugin** (pack in the jar), the bridge's three functions load and their signals reach the plugin: 10 for the 10 breaks of phase 2 (run from the server, `executor=none`), 1 for the round's end (server), 1 for entering the arena (`executor=msmarena`, the player).
- **What Paper changes** (none breaks the pack): the function permission level is 2 and `command-blocks.permissions-level` 2, as vanilla; the game rule `command_blocks_work` is true (26.3 has no `enable-command-block` line in `server.properties`); Paper adds its own built-in data pack `paper`; command names are vanilla's (Paper's `spigot.yml` "replace-commands" keeps vanilla `setblock`, `summon`, `tellraw`); the `say` lines show "[Not Secure]" in the log; the generated `server.properties` had `white-list=true`, so the tool must set it false or list its players. There are no spawn chunks on 26.x: console checks must `forceload` first (as the Fabric parity tests do).
- The replay found one setup difference, not a Paper one: a new player is placed at the top of the world spawn's column, so after the arena (y 100) was built over the island, players joined on the arena floor. The GameTest places its mock players itself; the replay teleports them.

### P2 Builds, channels, Java

- Fill lists Paper versions `26.3` and `26.3-rc-3` in the family `26.3` (`results/fill-26.3-*.json`). Builds 3 to 259: ALPHA from build 3 (2026-09-15, the day 26.3 came out), BETA from build 134 (2026-09-28), **STABLE from build 175 (2026-10-11)**; the newest is **259, STABLE, 2026-11-23**. 85 stable builds.
- **26.4-snapshot-7: no build** (`version_not_found`). PaperMC lists no snapshot of any 26.x version, only releases and their release candidates (1.21.x also had pre-releases). The nearest version with a build is 26.3.
- "Stable" has two levels: each build has `channel` (ALPHA, BETA, STABLE); each version has `support.status` (SUPPORTED, or UNSUPPORTED with an `end` date). 26.2 became UNSUPPORTED on 2026-11-03, three weeks after 26.3's first stable build; its last build (135) is still downloadable. 26.3-rc-3 has been UNSUPPORTED since 2026-09-15.
- Java: `java.version.minimum` 25 for 26.3 (and 26.2), with a list of recommended JVM flags. The server ran on JDK 25.0.5.1.
- The API artefact on `https://repo.papermc.io/repository/maven-public/` has one version per server build: `io.papermc.paper:paper-api:26.3.build.259-stable` (alpha builds end `-alpha`). The server reports "Implementing API version 26.3.build.259-stable".

### P3 The Fill service

- Calls (all `GET`, JSON): `/v3/projects/paper` (versions by family); `/v3/projects/paper/versions/26.3` (support status, Java minimum, build ids); `/v3/projects/paper/versions/26.3/builds?channel=STABLE` (newest first; the first is the newest stable, which is how PaperMC's own example finds it); `/v3/projects/paper/versions/26.3/builds/259` (one build, for a pinned build; an unknown id is 404). `/builds/latest` gives the newest build of any channel.
- A build's `downloads["server:default"]` has `name`, `size`, `checksums.sha256` and `url`. The URL is content-addressed (`https://fill-data.papermc.io/v1/objects/<sha256>/paper-26.3-259.jar`), so the SHA-256 is the natural cache key. The 55.3 MB jar downloaded in 3.7 s; its SHA-256 matched.
- User-Agent: the documents require one that names the software, is not generic, and has a contact URL or address. Requests without one still got 200 today; the tool must send one anyway. The question-2 default (app name, version, the public repository's URL) meets the rule.
- Answers carry `Cache-Control: max-age=300` and an `ETag`. Ask once a run; cache the jar by SHA-256.
- PaperMC's documents "emphatically do not recommend using unstable builds or auto-updaters within production": pin a build per target, never fetch "latest" on a player's machine.
- **A second download host.** The Paper jar is a launcher (paperclip). On its first start it downloads Mojang's server jar from `piston-data.mojang.com` (URL and SHA-256 in the jar's `META-INF/download-context`), patches it into `versions/26.3/paper-26.3.jar` and unpacks its libraries into `libraries/`. That took about 10 s. A cache must keep `cache/`, `libraries/` and `versions/` too (about 166 MB), keyed by the build's SHA-256.

### P4 `paper-plugin.yml`

- The spike's file loaded as written: `name`, `version`, `main`, `bootstrapper`, `api-version: '26.3'`, `description`, `authors` (`spike-src/plugin/src/main/resources/paper-plugin.yml`). PaperMC's page also documents `loader` (a class that adds libraries) and `dependencies` with `bootstrap` and `server` sections.
- The plugin's `name` becomes the prefix of its data pack ids (`msm_spike/msm_pack`), its command namespace (`msm_spike:<label>`) and its data folder, so the exporter writes the mod id there.
- A jar with no code of its own cannot have a bootstrapper, so it cannot register its pack at bootstrap. A content-only jar would have to depend on a shared runtime plugin and name the runtime's bootstrap class through a `join-classpath` bootstrap dependency (not tested). D2's one-jar design needs none of this.

### P5 A data pack inside the jar

- Registered from the bootstrapper with `LifecycleEvents.DATAPACK_DISCOVERY` and `registrar.discoverPack(getResource("/msm_pack").toURI(), "msm_pack")`: the pack's id is `<plugin name>/<folder>`, its source "(plugin)". The event fires again at every `/minecraft:reload`, and the pack is found again each time.
- **New world:** "Found new data pack msm_spike/sample_pack, loading it automatically" before the world is made, so the World Type in the jar works as `level-type` at creation (the sky biome, the world start, all seven checks).
- **Old world, jar added:** a pack from a newly added jar is enabled automatically on the next start (`msm_spike_b/msm_pack` in run H).
- **Jar updated:** the next start uses the jar's new files (a changed `hello.mcfunction` ran as changed, run J). Re-added packs go on top of the pack order.
- **Jar removed (run I):** "Missing data pack ..." for each; the world loads, but a world made from the jar's World Type loses its biome: "Unknown biome, defaulting to plains" and 1,080 "Recoverable errors when loading section ... -> using default" lines. The saved chunks are rewritten as plains, and after the jar was put back, newly generated chunks were plains too (the generator settings were rewritten). Game state in command storage survived. This is the same as removing a data pack from a vanilla world, and it is permanent: a guide limit.
- **Two plugins with packs:** both enabled side by side (P6).
- The jar must hold no stray directories: an empty `data/NS/` folder left by the spike's build made the game warn "Non [a-z0-9_.-] character in namespace NS ... ignoring" at every reload.

### P6 Two exported jars on one server

- `msm_spike` and `msm_spike_b`, built from the same classes (`dev.mcsupermods.spike.paper.*`), both load as Paper plugins with their own class loaders: each has its own static counters (both counted "signal #1" on their own), its own bootstrap and its own packs (`msm_spike/msm_pack`, `msm_spike_b/msm_pack`). No warning about duplicate classes.
- Commands: each registration returns both labels (`msmshared` and `<plugin>:msmshared`). When both register the same plain label, both are told they have it, but `msmshared` then runs the **later** plugin's command only; `msm_spike:msmshared` and `msm_spike_b:msmshared` still reach each. The signal command is per namespace (`msm_signal_<ns>`), so it cannot clash; a project's own `msm:command` names can.

### P7 Tests with no screen

- **MockBukkit** (`org.mockbukkit.mockbukkit:mockbukkit-v26.3:4.124.0`, MIT, released 2026-11-22; `results/mockbukkit-v26.3-4.124.0.txt`): against paper-api build 259 every test fails at start ("Null JSON element while retrieving `minecraft:world_clock` - MockBukkit / MC version mismatch?"); against builds 230 and 250 it covers a ban with an end time, a cancelled break in a box, a menu click, and a world from a `WorldCreator`. It does not cover data packs or functions (`function` is unknown), and loading the spike plugin is skipped as unimplemented (its lifecycle handlers and data pack manager). It needs plugin classes that are not `final`. It lags Paper's newest build by days.
- **A real server driven by a test plugin and the console** covers everything a data pack and the runtime do except players.
- **The game-test entry point** is in Paper's jar (`net/minecraft/gametest/`, 82 classes) and `/test run minecraft:always_pass` ran on Paper ("All required tests passed"). Data-driven test instances could run from a pack, but there are no mock players without Java against the server's internals, which D3 refuses.
- **Players:** the API has no fake player, so they are stood in for by a headless client. Mineflayer (MIT) supports protocols only up to 26.1 (4.39.0); a Fabric client GameTest joining Paper would need a game client per player. The spike's own stand-in (`bot.mjs`, about 480 lines, no dependency) joined in 0.3 to 3 s and did everything the seven checks need. Its one 26.3 surprise: the teleport confirmation now carries the id, the position and both rotations (32 bytes after the id), found from the server's decode errors with `spike-src/tools/log4j2-debug.xml`.
- **Chosen CI route:** a real Paper server, the stand-in players inside `tools/run-paper-server` (TypeScript, Node), packet ids from the server's own report at run time (cached per Minecraft version, never committed), the few packet formats per target in the tool with a test, checks by console commands and the runtime's log lines; MockBukkit only for unit tests of event logic, pinned to an API build it supports.
- **Estimated minutes a run:** about 6 (setup 1, `engine-paper` Gradle build 1 to 2, Paper and its cache restored in seconds or about 15 s cold, the report 30 s or cached, server start 20 to 35 s, four games' checks 2 to 3 min at the seven checks' 28 s each, stop 5 s).

### P8 Commands through the lifecycle event

- Brigadier trees registered through `LifecycleEvents.COMMANDS` (`Commands.literal`, `Commands.argument`), with an optional description and aliases; `register` returns the labels it got.
- All 33 types below parsed from the console and the client stayed connected with the tree (`results/extras-26.3.txt`).

| MSM type (ADR 0111) | Paper | MSM type | Paper |
|---|---|---|---|
| integer, number, word, text, boolean | Brigadier's own | effect, enchantment | `resource(MOB_EFFECT / ENCHANTMENT)` |
| player, players, entity | `player()`, `players()`, `entities()` | biome, structure | `resourceKey(BIOME / STRUCTURE)` |
| position, block_position | `finePosition(true)`, `blockPosition()` | entity_type | `resource(ENTITY_TYPE)` |
| item, block | `itemStack()`, `blockState()` | particle | `resource(PARTICLE_TYPE)`: the type only, no options |
| dimension | `world()` | game_mode | `gameMode()` |
| time | `time()` (ticks) | text_component | `component()` |
| team_colour, hex_colour | `namedColor()`, `hexColor()` | int_range | `integerRange()` |
| rotation, angle | `rotation()`, `angle()` | identifier | `key()` |
| uuid | `uuid()` | message | `signedMessage()` |
| item_predicate, block_predicate | `itemPredicate()`, `blockInWorldPredicate()` | dialog | `resource(DIALOG)` |

- **No native type for 11:** `objective`, `score_holder`, `score_holders`, `team`, `slot`, `nbt`, `biome_or_tag`, `structure_or_tag`, `loot_table`, `advancement`, `recipe`. They can be a `word`, `key()` or `greedyString()` with server suggestions and a server-side check; the client then shows a plain argument (no client-side check or highlighting).
- **Permissions:** the API has no permission level for a source. A command with no `requires` ran for a non-operator player. In a function the sender is the console (`sender=CONSOLE`), with `execute as` the executor is the player; typed by a player, the sender is the player. The signal command needs `requires(source -> !(source.getSender() instanceof Player p) || p.hasPermission(...))` or the like.
- **`/minecraft:reload`:** the COMMANDS event fires again with cause RELOAD, for the bootstrapper's handler before the functions are parsed and for the plugin's handler after them. Bukkit's own `/reload` (reloading plugins) was not tested.

### P9 The bridge both ways

- **Function to plugin command:** at load (the pack's `#minecraft:load` reached the plugin), from the server (the one block and the timer), as a player through `execute as` (`sender=CONSOLE executor=<player>`), typed by an operator (`sender=<player>`), and after `/minecraft:reload` (the load tag ran again in 3.1 to 3.3 s and the bridge still worked).
- **Only commands registered by the bootstrapper exist when functions are parsed.** A function naming a command registered from `onEnable` (the spike's `late.mcfunction`) fails to load at start and again at every reload, because the plugin's handler runs after the functions are parsed. The same holds for a Bukkit `plugin.yml` command (P16).
- **Plugin to function:** `Bukkit.dispatchCommand(console, "function ns:f")` ran in 0.2 to 0.3 ms. A command dispatched while another command is running (inside the runtime's own command) runs only after the outer one finishes: the template placed by `make` was there a moment later, not in the same call. Read results on a later tick.

### P10 Kept out for a time

- `player.ban(reason, Duration.ofSeconds(5), source, true)` kicked the player with the reason ("Out of the game for 5 seconds (spike)"); joining again was refused at login with the translation keys `multiplayer.disconnect.banned.reason` (the reason) and `multiplayer.disconnect.banned.expiration` ("2026-11-23 at 18:19:47 UTC"), which the client puts into words; 5 s later the join was allowed.
- An offline, never-joined name: `getBanList(BanListType.PROFILE).addBan(profile, reason, Duration, source)` refused it at login and allowed it after the end. In online mode a never-seen name needs a profile lookup from Mojang's service.
- A data pack cannot: `/ban` has no end time and needs permission level 3, above a function's 2.

### P11 Cancelling by area boxes

- Breaking inside a box was cancelled (the block stayed), outside allowed; damage inside cancelled (health stayed 20); dropping an item inside cancelled. Placing was not driven (the stand-in has no "use item on" packet); `BlockPlaceEvent` is the same shape.
- Cost: 1,000,000 checks of a position against 20 boxes took 119 to 140 ms, about 130 ns each. Sixteen players breaking, placing, hitting and dropping a few times a second cost well under 0.01 ms a tick. No move event is needed.
- A data pack can only approach it with adventure mode and `can_break` and `can_place_on` on items.

### P12 A death with no death screen

- **Cancelling `PlayerDeathEvent`** (Paper makes it cancellable): no death screen packet reached the client; the player stayed alive with full health and kept the inventory (8 items, nothing dropped, although the event listed 2 drops).
- **Turning lethal damage into a respawn** (`EntityDamageEvent`, final damage at or above health): no death screen; the runtime chose the drops (2 stacks dropped at the spot), healed the player and sent it to spawn.
- **Data pack alone:** the game rule `immediate_respawn` still sends the death packet; the client skips the screen itself; drops follow `keep_inventory`.

### P13 Menus

- A 27-slot chest menu (`Bukkit.createInventory(holder, 27, title)`, `openInventory`) opened on the plain client ("Shop (spike)"); the client's click on slot 11 reached `InventoryClickEvent` (slot 11, LEFT, IRON_SWORD) and was cancelled; the player stayed connected.
- Paper's dialog API (`Dialog.create(...)`, `player.showDialog(...)`, a button with `DialogAction.customClick`) reached the client; clicks arrive as `PlayerCustomClickEvent` (not clicked by the stand-in).
- A data pack alone can show a vanilla dialog (`dialog show <player> minecraft:server_links` reached the client too) whose buttons run commands; non-operators then need `/trigger`.

### P14 A world per match

- `WorldCreator.ofKey(new NamespacedKey(mod, name))` with an empty `ChunkGenerator` made a world in 0.95 to 3.1 s (about 2 s with the arena template placed by `place template`), stored at `world/dimensions/<mod>/<name>`. `new WorldCreator(name, key)` is refused ("World name and key cannot both be specified"); 26.1 and later persist the key.
- Players were sent in by `teleport`; `Bukkit.unloadWorld(world, false)` after moving them out took 35 to 129 ms; deleting the folder (22 files) 8 to 23 ms. Three cycles, players kept connected (`results/extras-26.3-p14.txt`).
- Folia was not run. The spike's world handling uses `WorldCreator`, `unloadWorld` and the one Bukkit scheduler, the parts Folia's regionised threading replaces with a different contract; D8 holds.

### P15 Rules on Paper (sizing only)

- The Rules compiler's output uses about 60 distinct Script API names (counted in `packages/plugins/rules/src/compile/*.ts`): `msm.events.on` (player, entity, block, server and the `command` event the signals use), `msm.schedule`, `msm.players`, `msm.storage`, `msm.bossBars`, `world.runCommand` and `runFunction`, `world.setBlock`, `breakBlock`, `explode`, `spawnEntity`, `dropItem`, `playSound`, `spawnParticle`, weather, game rules and time, and entity and player reads and actions (`pos`, `look`, `type`, `uuid`, `equipment`, `vehicle`, `hurt`, `setVelocity`, `raycast`, `runCommand`, `advancement`).
- Each maps to the API: events to Bukkit events, commands to `dispatchCommand` (mind the nested-command rule of P9), the scheduler to `BukkitScheduler`, boss bars to `KeyedBossBar`, ray casts to `World.rayTrace`, sounds and particles to the world. Not mappable: the client-side steps (HUD, keys, vehicle input), which games do not use.
- Estimate: one spike brief, then two to three high-effort briefs for a Script API host on Paper (Rhino 1.9.2 shaded, MPL-2.0) and its tests. **Go for B793**, with a cheaper first step: rules on games triggers whose steps are all commands can be compiled straight into the bridge functions, which then work on any server with no plugin at all.

### P16 The Bukkit-era `plugin.yml` route

- A `plugin.yml` plugin has no bootstrapper: it cannot register a pack from its jar, and its declared commands are added after the functions are parsed. A pack function naming such a command failed to load at start and after `/minecraft:reload` ("Unknown function msm_legacy:call"), though the command worked from the console.
- So a Spigot route would lose the pack in the jar and the function bridge, which are D5's first step. What is lost by not supporting it: servers running Spigot or another Bukkit server not built on Paper. Servers built on Paper load `paper-plugin.yml`. D8 holds.

### P17 Licences

- Paper (`https://raw.githubusercontent.com/PaperMC/Paper/main/LICENSE.md`, read 2026-11-23): "Paper inherits its licensing from the included upstream projects. As such, Paper is licensed under the GNU General Public License version 3; as it inherits it from Spigot, who in turn inherits it from the original Bukkit and CraftBukkit projects." Contributors listed there release their code under MIT.
- The API artefact (`paper-api-26.3.build.259-stable.jar`, its POM and module file) carries no licence file and no licence element. It is used `compileOnly` and never shipped; the server provides it at run time.
- Paper's patched server jar carries a notice that its contents are under the Minecraft EULA and the Microsoft Services Agreement; paperclip itself is MIT. Neither is ever bundled (D9).
- Rhino (only if B793 shades it): MPL-2.0, its text already in `engine-mod/src/main/resources/META-INF/licenses/rhino-LICENSE.txt` (Rhino 1.9.2).
- MockBukkit: MIT (tests only).
- An exported jar must carry: MSM's MIT notice for the runtime; Rhino's licence if Rhino is inside; nothing of Paper or Mojang. Whether a plugin compiled against a GPL-heritage API may be MIT is the usual position of the plugin ecosystem, not a legal opinion; the user decides.
- The tool writes `eula.txt` only for its own throwaway server; the app's local server keeps Plan B's EULA tick.

### P18 Sizes and times

- The spike's jar: 29 KB of classes and its own pack; 86 KB with the sample's pack inside (the zip is 37 KB). A Paper runtime is likely tens of KB, plus about 1.4 MB if Rhino is shaded (verify at implementation).
- Paper's jar 55.3 MB; after the first start Mojang's jar (`cache/`, 60 MB), `libraries/` (76 MB) and `versions/` (30 MB): a cache of about 220 MB per build.
- First start: about 10 s for paperclip (Mojang's jar downloaded and patched), then 20 s to "Done". Later starts on an existing world: 12.7 to 19.2 s; on a new world: 20.5 to 32 s (the machine was shared). A stand-in joins in 0.3 to 3 s. The seven checks took 26 to 28 s.
- The spike plugin's Gradle build: 37 s cold, about 10 s warm; MockBukkit's tests 5 to 8 s.

## What a game wants

| A game wants | Data pack alone (any server) | With the Paper runtime | Not possible on Paper |
|---|---|---|---|
| Its World Type, start island, first-join kit, goals | yes (P1) | yes, the pack inside the jar (P5) | |
| Teams, points on the sidebar, timers on a boss bar, areas and resets, one block | yes (P1) | yes | |
| Rules reacting to areas, timers, the one block | no: the bridge's functions fail to load | the signals reach the runtime (P9); acting on them waits for Rules on Paper (B793) | |
| Commands of its own | no | yes, 33 of 44 argument types native (P8) | 11 types only as plain arguments |
| Keeping a player out for a real time | no (`/ban` has no end time and needs level 3) | yes (P10) | |
| Blocks that cannot be broken or placed outside allowed areas | partly (adventure mode, `can_break`, `can_place_on`) | yes, by boxes (P11) | |
| No death screen | the client skips it with `immediate_respawn`; drops by `keep_inventory` | yes, with chosen drops (P12) | |
| A clicked shop | dialogs with command buttons (`/trigger` for non-operators) | chest menus and API dialogs with server-side clicks (P13) | |
| A fresh arena world per match | no (reset an area in place instead) | yes, about 2 s to make (P14) | not on Folia |
| Blocks, items, mobs of its own | no | no (D4) | yes: needs the Fabric mod |
| Two-player tests | GameTest mock players on vanilla and Fabric | headless stand-ins (P7) | |

## Facts for later briefs

- **Build tool (B781):** Gradle 9.8.2 (`engine-mod`'s wrapper) with the plain `java` plugin, toolchain 25; repositories `https://repo.papermc.io/repository/maven-public/` first (it proxies Maven Central; Maven Central answered 429 once), then `mavenCentral()`; `compileOnly("io.papermc.paper:paper-api:26.3.build.259-stable")`. No paperweight or remapping. Tests: MockBukkit `org.mockbukkit.mockbukkit:mockbukkit-v26.3:4.124.0` with JUnit 6.1.3, the test classpath's API pinned to a build MockBukkit supports (250 worked, 259 did not). `includeEmptyDirs = false` on resources and jar.
- **Facts for B782** (`PaperFacts`, source: Fill v3 and the API's Maven metadata, read 2026-11-23): mc-26.3 `api` `26.3.build.259-stable`, `apiVersion` `'26.3'`, `minBuild` 259 (the newest STABLE; first STABLE was 175), Java 25. mc-26.4: no `paper` (no snapshot builds). Keep the build's SHA-256 (`5efbc6ce4b8e128bfa77fa0d3e79132dfeaaab827abe0f87dd930535e5e489fd` for 259) beside it if the tool should pin bytes.
- **Plugin layout (B783, B786):** `paper-plugin.yml` with `name` = the mod id, `version`, `main`, `bootstrapper`, `api-version`, `description`, `authors`; the runtime's classes; the pack as files under one folder (for example `msm_pack/` with `pack.mcmeta` and `data/`), which becomes the pack `<mod id>/msm_pack`; `msm/paper/index.json`; the notices. No stray directories.
- **Data pack and command registration (B783):** both in the bootstrapper's lifecycle handlers (`DATAPACK_DISCOVERY`, `COMMANDS`), never from `onEnable`, so functions can name the commands; both handlers run again at `/minecraft:reload`. The signal command needs an explicit permission check.
- **Headless test route (B787, B790):** `tools/run-paper-server` fetches through Fill (User-Agent with the repository URL), checks the SHA-256, caches the jar and Paper's `cache/`, `libraries/`, `versions/` by that SHA-256; writes `server.properties` (`online-mode=false`, `server-ip=127.0.0.1`, a free port, `white-list=false`, `level-type` for a World Type) and `eula.txt`; starts `java -Xmx2G -jar paper.jar --nogui` with stdin from a FIFO; waits for `Done (`; force-loads the game's chunks; runs the checks with stand-in players and console commands; sends `stop`. Network hosts: `fill.papermc.io`, `fill-data.papermc.io`, `piston-data.mojang.com` (paperclip), and `repo.papermc.io` for the Gradle build.
- **Licences (D9):** above, P17.

## Changes asked of the plan and the ADR

Section 2 of `docs/PLAN-paper.md`:

- **D1:** add the measured facts: `api` is the Maven version of `paper-api`, which equals the server build (`26.3.build.259-stable`); `apiVersion` `'26.3'`; `minBuild` 259; Java 25. mc-26.4 has no `paper` until 26.4 is released, because PaperMC builds no snapshots. Say that Paper supports only the newest version: a target's pinned build stays downloadable but gets no fixes a few weeks after the next release.
- **D2:** go, with: the plugin `name` is the mod id; the pack and every command a function names are registered in the bootstrapper; the jar holds no stray directories; command labels are the mod's own, because a plain label shared by two plugins goes silently to the later one (the namespaced `<mod id>:<label>` always works).
- **D4:** add to the refusal list the 11 command argument types without a native Paper argument, or let them export as plain arguments with a sentence (decide in B783); add a guide sentence that a project command whose name another plugin also uses may be taken by that plugin.
- **D5:** the first step includes the permission check on the signal command (the API has no permission level).
- **D6:** the route is chosen: a real Paper server with headless stand-in players inside `tools/run-paper-server`, packet ids from the server's own report at run time, packet formats per target in the tool; MockBukkit only for event logic. Estimate about 6 minutes a run.
- **D7:** the local server pins the target's build (PaperMC advises against auto-updaters), and Paper downloads Mojang's server jar from `piston-data.mojang.com` itself on its first start.
- **D9:** record P17's texts: Paper GPLv3 by inheritance with MIT contributions; the API artefact without a licence of its own, never shipped; the exported jar carries MSM's MIT notice and Rhino's if shaded.
- **Questions for the user:** question 1 should name both hosts the local server reaches (PaperMC's service, and Mojang's through Paper's own launcher). Question 2's default meets PaperMC's User-Agent rule.
- **Limits to say in the guide (section 7):** a world made from a Paper plugin's World Type must never be started without the plugin (its biome becomes plains for good); Paper exists only for released Minecraft versions.

Section 3 of `docs/PLAN-paper.md`:

- Add: "Packs and every command a data pack function names are registered in the bootstrapper's lifecycle handlers only (B780 P9)."
- Add: "A command run from inside another command runs after it; read its effect on a later tick (B780 P9, P14)."
- Add: "Stand-in players: packet ids come from the server's report at run time and are never committed; packet formats are kept per target in `tools/run-paper-server` with a test."
- Add: "Gradle repositories: PaperMC's first; the API is `compileOnly` and never shaded."
- Add to "No network in tests": the hosts are `fill.papermc.io`, `fill-data.papermc.io` and `piston-data.mojang.com` (through paperclip), and the cache holds Paper's `cache/`, `libraries/` and `versions/` with the jar.

ADR 0134: D1 with the facts above and "no Paper target for snapshots"; D2 "go" with the bootstrap and naming rules; D6 with the chosen route; D8 with P16's and P14's findings; D9 with P17's texts; a findings line pointing to this README.
