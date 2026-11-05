# packages/interop — Blockbench, NBT and Minecraft installation

Phase 2 code complete: `minecraft-install/` locates `.minecraft`, lists versions and extracts preview assets, including `.png.mcmeta` animation sidecars, with fflate into `~/.msm/cache/assets/<version>/` (ADR 0011; cache `schemaVersion` 2, older caches are re-extracted), tested with a synthetic jar; `readPngHeader` reads PNG sizes. Launcher add-on (ADR 0019): `launchers/` discovers official, Prism/MultiMC/PolyMC and CurseForge game locations and finds client jars across their stores. World listing, location resolution and pack installs live in the app's main process. Phase 3: `nbt/level-dat.ts` reads world names (`Data.LevelName`) for the world picker with deepslate's NBT module; structure `.nbt`/`.schem` I/O lives in `@msm/plugin-structures`, not here (ADR 0021). Phase 4 code complete: `fabric/` backs Test in Minecraft (ADR 0026 D5): Fabric readiness of a location, the managed Prism instance, `mods/` installs recorded in `mods/.msm-installed.json`, the Fabric API download cache and launcher programs and arguments; the app's main process adds settings, containment, atomic writes (`withAtomicWrites` over the Node install file system) and the spawn. Prism flags and `mmc-pack.json` fields are verified against Prism's source; real-launcher runs on Windows await the user's check. Phase 5 code complete: `blockbench/` converts `.bbmodel` files (4.x and 5.x layouts) into GeckoLib geometry, animations and textures and passes `.geo.json` and `.animation.json` through; the app registers `blockbenchImporter` as a host importer (B116, ADR 0029 D3).

## Purpose

`@msm/interop` connects MSM to files and tools outside the project: Blockbench models, structure files and the user's Minecraft installation. Importers feed the IR; they never build a parallel model.

## Contents

| Subfolder | Phase | Role |
|---|---|---|
| `minecraft-install/` | 1 | `locate.ts` (default dir, versions, jar pick), `extract.ts` (filtered `unzipSync`, including block and item `.png.mcmeta` sidecars), `cache.ts` (`ASSET_CACHE_SCHEMA_VERSION`; bump it whenever the extracted set changes), injected `InstallFileSystem`; launch helpers are in `fabric/` |
| `launchers/` | 2 | ADR 0019: `discover.ts` (`discoverGameLocations`, default Prism and CurseForge roots, ids), `mmc.ts` (Prism/MultiMC/PolyMC `*.cfg`, `instance.cfg`, `mmc-pack.json`), `curseforge.ts` (`minecraftinstance.json`), `official.ts`, `client-jar.ts` (`findClientJar`: selected store first, then the rest in discovery order), `ini.ts`, `paths.ts` (containment, safe segments), `types.ts` |
| `fabric/` | 4 | ADR 0026 D5: `instance.ts` (`fabricReadiness`: launch, install-only or blocked; `createManagedInstance` writes `MCSuperMods Test (<mc>)` with `instance.cfg`, `mmc-pack.json` (`net.minecraft`, `net.fabricmc.fabric-loader`) and the `.msm-managed.json` marker), `mods-install.ts` (`installContentJar` as `<mod_id>.jar`, `ensureFabricApi`; only files recorded in `.msm-installed.json` with matching SHA-512 are replaced or removed), `download.ts` (Fabric Maven URL, `cachedFabricApi` checked against the published `.sha512`, `fetchDownloader`, `webCryptoSha512`), `launch.ts` (`launcherProgramCandidates`, `findLauncherProgram`, `launchArguments`: `--dir <root>` unless a default Prism folder, `--launch <instance>`), `types.ts` (`FabricTestError` codes). No Node imports: downloader and hasher are injected or global |
| `png.ts` | 1 | `readPngHeader` (width, height) for imported textures |
| `node.ts` | 1 | Subpath `@msm/interop/node`: Node `InstallFileSystem`, `nodeEnv`, `sha1Hex` (main process only) |
| `nbt/` | 3 | `level-dat.ts`: `readLevelName` (gzip, zlib or raw NBT; never throws). Structure files are read and written by `@msm/plugin-structures` importers and exporters (ADR 0021) |
| `blockbench/` | 5 | ADR 0029 D3: `convert.ts` (`convertBbmodel`: 4.x and 5.x projects, cubes only, Bedrock export signs, 5.x keyframes flipped, geometry 1.12.0 and animations 1.8.0, embedded PNGs; `java_block` refused), `passthrough.ts` (`.geo.json`, `.animation.json` checked, unchanged), `importer.ts` (`blockbenchImporter`: `msm:geo_model` `<ns>:entity/<name>`, `msm:animation` `<name>_animations`, `textures/entity/`, original as `blockbench/<name>.bbmodel`) |

## Conventions

- Importers produce IR elements and assets through the `Importer` interface in `@msm/plugin-api`.
- Read-only on the user's game directory, except copying into `resourcepacks/` or `datapacks/`, files the app records in `mods/.msm-installed.json`, and the managed instance folder (marked by `.msm-managed.json`). A same-named file the app did not install stops the install (`fabric.foreign-file`).
- Tests never reach the network: inject a `Downloader`.
- Launcher readers are pure over `InstallFileSystem` and an injected env; missing roots are skipped silently, unreadable metadata becomes a `location.*` problem, never a throw. Instance folder names must be safe segments; symlinked instances escaping their root are skipped.
- Facts marked "(verify at implementation)" in ADR 0019 (CurseForge `Install/versions/`, `baseModLoader` prefixes) stay marked until confirmed on a real machine.
- Extracted Mojang assets stay in the local cache for previews only.
- Import only documented `.bbmodel` fields.
- Sample files under `test/fixtures/` must be CC0 or made by us.

## Do / Don't

- Do version-check every input file and warn on unknown versions.
- Do degrade previews gracefully when no Minecraft installation is found.
- Don't redistribute extracted assets.
- Don't modify Blockbench files in place.
- Append an entry to `docs/DEVLOG.md` each session.

## Commands

- `pnpm --filter @msm/interop test` (synthetic jar built at test time; no Mojang bytes)
- `pnpm typecheck` and `pnpm lint` from the repository root

## Read next

- [DESIGN §13 Interop (Blockbench, NBT, Minecraft Installation)](../../docs/DESIGN.md#13-interop-blockbench-nbt-minecraft-installation)
- [ADR 0019](../../docs/adr/0019-game-locations-launcher-instances.md) (launcher game locations), [ADR 0026](../../docs/adr/0026-fabric-content-jar.md) D5 (Test in Minecraft), [ADR 0021](../../docs/adr/0021-structure-templates-and-nbt.md) (structure I/O)
- [ROADMAP, Phases 1, 3 and 5](../../docs/ROADMAP.md)
