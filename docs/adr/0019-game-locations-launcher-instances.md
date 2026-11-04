# ADR 0019: Game locations: launcher instances as install and extraction targets

## Context

Until now MSM knew one place on the user's machine: the official launcher's `.minecraft` folder ([Minecraft installation](../DESIGN.md#13-interop-blockbench-nbt-minecraft-installation)). It reads the client jar from `versions/<v>/<v>.jar` for preview assets ([ADR 0011](0011-client-jar-asset-extraction.md)) and installs packs into `resourcepacks/` and `saves/<world>/datapacks/` ([ADR 0015](0015-data-pack-element-model.md)).

On 2026-11-04 the user asked for support for users "extracting through CurseForge or Prism Launcher". Many players run Minecraft from the CurseForge app or Prism Launcher, where each instance has its own game folder and the client jar sits in the launcher's own store, so MSM found neither their worlds nor, often, a jar. The user's scope: the CurseForge app and Prism Launcher are first-class and auto-detected; MultiMC and PolyMC, which share Prism's instance format, are supported through a folder the user adds by hand. Releases are Windows only, so Windows paths come first; macOS and Linux defaults are recorded where known.

Facts were read from the Prism Launcher source (`develop` branch, 2026-11-04), the Prism and MultiMC wikis, the CurseForge support article "Getting started", a real `minecraftinstance.json` (2025) and an older note on the Curse client's `Install` folder. Facts not confirmed from source are marked "(verify at implementation)".

## Decision

**Game location.** A game location is one place MSM can install packs into and read a client jar for. `@msm/interop` gains a `launchers/` module, pure TypeScript over `InstallFileSystem` like `minecraft-install/`. Each location has:

- a serialisable `ref` (`launcher`: `official | prism | multimc | curseforge`; absolute launcher `root`; `instance` folder name, absent for `official`), which is what settings store;
- a DOM-safe `id` (`<launcher>:<instance|default>`, suffixed `-2`, `-3` on collision), a `displayName` (the instance's own name, falling back to the folder name; "Official launcher" for `official`);
- `mcVersion` (`null` for the official launcher, which may hold any version, or when unknown), `loader` (`fabric | quilt | forge | neoforge | liteloader | unknown` with a version, or `null`);
- `gameDir`, where `resourcepacks/` and `saves/` live; `modsDir` (`<gameDir>/mods` when a loader is present, recorded for Phase 4 and unused now);
- `problems` with codes `location.no-minecraft-component`, `location.unreadable-metadata`, `location.game-dir-missing`, `location.unsupported-instance-type`.

**Prism Launcher, MultiMC and PolyMC.** One reader serves the shared "MMC" instance format.

- Prism's data folder defaults to `%APPDATA%\PrismLauncher` on Windows, `~/Library/Application Support/PrismLauncher` on macOS and `~/.local/share/PrismLauncher` on Linux (honouring `$XDG_DATA_HOME`, verify at implementation), plus the Flatpak folder `~/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher` and the Scoop folder `%HOMEPATH%\scoop\persist\prismlauncher`. The environment variable `PRISMLAUNCHER_DATA_DIR` is checked first. Portable installs (a `UserData/` folder or `portable.txt` beside the executable) and `--dir` are not detected; the user adds that folder by hand.
- The config file is the first of `prismlauncher.cfg`, `polymc.cfg`, `multimc.cfg` (INI). `InstanceDir` (default `instances`; relative values resolve against the data folder) and `AdditionalInstanceDirs` (comma-separated, verify at implementation) name the instance roots.
- An instance is a direct child of an instance root that holds `instance.cfg`; its id is the folder name. `instance.cfg` gives `name` and `InstanceType` (empty or `OneSix`; anything else is `location.unsupported-instance-type`). The INI reader accepts files with and without a `[General]` header and Qt `\xNNNN` escapes (verify at implementation). The `.tmp` staging folder is ignored.
- `mmc-pack.json` gives the `net.minecraft` component version (`version`, else `cachedVersion`) and the loader from the known uids `net.fabricmc.fabric-loader`, `org.quiltmc.quilt-loader`, `net.minecraftforge`, `net.neoforged`, `com.mumfrey.liteloader`.
- The game folder is `<instance>/minecraft`, unless only `<instance>/.minecraft` exists.
- The client jar is the library `com.mojang:minecraft:<v>:client` at `<data>/libraries/com/mojang/minecraft/<v>/minecraft-<v>-client.jar`. An explicit `mainJar` override in a version file is rare and not followed (verify at implementation).
- Only Prism is auto-detected. MultiMC (data beside its executable) and PolyMC folders are added by hand in Settings.

**CurseForge app.**

- The modding folder defaults to `C:\Users\<user>\curseforge\minecraft\` on Windows and `~/Documents/curseforge/minecraft/` on macOS; the app has no Linux build. The user can choose another folder in the app, so Settings accepts manual CurseForge folders.
- Instances are `<root>/Instances/<name>/` folders holding `minecraftinstance.json`. The game folder is the instance folder itself. `installPath` in the file is ignored, because it goes stale when the folder moves.
- `minecraftinstance.json` gives `name`, `gameVersion` (the Minecraft version) and `baseModLoader`; the loader kind comes from the prefix of `baseModLoader.name` (`forge-`, `neoforge-`, `fabric-`, `quilt-`; verify at implementation), and a vanilla instance has `baseModLoader: null` (verify at implementation). The numeric loader `type` is not relied on.
- The client jar is read from `<root>/Install/versions/<v>/<v>.jar`, an official-launcher layout (verify at implementation). The CurseForge app may launch through the official launcher, in which case the jar is in `.minecraft` and the fallback search finds it.

**Discovery.** `discoverGameLocations(fs, env, overrides)` lists the official location first (setting, else platform default when it exists), then Prism (defaults, then manual folders), then MultiMC/PolyMC (manual), then CurseForge (defaults, then manual). Duplicate roots after normalisation are listed once; roots that do not exist are skipped silently. Instance folder names must be safe path segments. An instance folder that is a symbolic link resolving outside its instances root is skipped, the same rule Prism applies.

**Settings.** `settings.json` gains `launchers` (`prismDataDirs`, `multimcRoots`, `curseForgeRoots`: absolute paths, deduplicated, at most 16 each) and `installTarget` (a `GameLocationRef`, or `null` for the official launcher). Missing or malformed values fall back to the defaults; the file stays sorted-key JSON.

**Resolution in main.**

- The selected location is `installTarget` matched by `ref` against the discovered locations. When it no longer exists, main falls back to the official location and reports `targetMissing`.
- Resource packs install to `<gameDir>/resourcepacks/`; worlds are listed from `<gameDir>/saves/` and data packs install to `<gameDir>/saves/<world>/datapacks/`.
- Containment: for an instance, the real path of `gameDir` must lie inside the real instance folder, which must lie inside the real instances root; for the official launcher, inside the real `.minecraft`. Nothing is written outside the selected `gameDir`. Manual roots must be absolute.
- Client jar search: first the selected location's own store (official `versions/`, MMC `libraries/com/mojang/minecraft/`, CurseForge `Install/versions/`), exact version first and then the existing prefix rule; otherwise every other known store in discovery order. The asset cache stays keyed by `mcVersion` ([ADR 0011](0011-client-jar-asset-extraction.md)); its recorded jar hash already invalidates a swapped jar. Status reports which launcher's store served the jar.
- Warnings never block an install: `location.version-mismatch` ("This instance runs Minecraft X; the project targets Y.") when the instance's `mcVersion` differs from the project's, and `location.no-minecraft-component`. `location.game-dir-missing` does block install, with "Start the instance once so its game folder exists."

**IPC (contract v1, additive).** `settingsGet`/`settingsSet` carry `launchers` and `installTarget`. `minecraftStatus` gains `target`, `targetMissing`, `jar` (`versionId`, `launcher`) and `warnings`. A new channel `msm:v1:minecraft:listLocations` takes `{ mcVersion }` and returns the locations (with per-location warnings) and the selected id. `PlatformAdapter.minecraft.listLocations(mcVersion)` is added; the install and world methods keep their signatures and act on the selected location.

**UI.** Settings replaces "Minecraft folder" with "Game locations": a radio list of locations (launcher badge, name, Minecraft version, loader, game folder, problems and warnings) whose checked row is the install target, the official folder override, and buttons to add or remove Prism, MultiMC and CurseForge folders. The Vanilla assets section names the launcher whose jar is used. The toolbar Install menu shows "Install to: <launcher> — <name> (MC <version>)" and a "Change target" submenu. The world picker names the location.

**Not in scope.** Writing anything into an instance besides packs, creating instances, launching, and installing mods. `loader` and `modsDir` are recorded so Phase 4's content jar can offer "Install mod into instance" for Fabric instances.

## Consequences

- CurseForge and Prism users get previews from their launcher's own jar store and can install packs straight into an instance, without the official launcher.
- A jar from any launcher serves every project with that version, so one installed copy is enough.
- MultiMC, PolyMC and portable Prism need one manual step in Settings; CurseForge on a non-default folder does too.
- Two paths rest on older or second-hand sources: CurseForge `Install/versions/` and the `baseModLoader` prefixes. Both are marked "(verify at implementation)" and are to be confirmed on the user's machine; if `Install/versions/` is wrong, the fallback to other stores still works whenever the official launcher holds the version.
- `installTarget` survives restarts but can go stale when an instance is deleted or renamed; the official fallback and the Settings notice cover that.
- No new dependencies; the IPC changes are additive within contract v1.
- DESIGN [Minecraft installation](../DESIGN.md#13-interop-blockbench-nbt-minecraft-installation) describes the model; ROADMAP lists the work as "Phase 2 add-on — Launcher support".

## Status

Proposed (2026-11-04); implemented in the launcher add-on.
