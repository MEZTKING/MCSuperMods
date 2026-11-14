# ADR 0087: Try it grounds and reading an area of the user's own world

## Context

The user asked (2026-11-14): "make the preview import a custom flat world maybe / or a small world to test using the owned minecraft files". The preview is **Try it** ([ADR 0085](0085-try-it-in-app-test-area.md)): a 48 by 48 by 32 test area drawn inside the app, whose floor today is MSM's own grid (D7 of that ADR, chosen so a screenshot cannot pass for the game).

The app already knows the user's game folders: the official launcher folder and Prism, MultiMC and CurseForge instances ([ADR 0019](0019-game-locations-launcher-instances.md)), plus the managed Play instance ([ADR 0084](0084-one-click-play-and-reload.md)). It lists worlds of the selected location for data pack installs (`minecraft:listWorlds`, `level.dat` names through `@msm/interop` `nbt/`). It never reads region files. Mojang's assets are never bundled ([ADR 0011](0011-client-jar-asset-extraction.md)); blocks of a vanilla world drawn in Try it use the textures and models of the user's own client jar, exactly as vanilla props already do (ADR 0085 D12).

This ADR records the decisions of B404 (the reader and the IPC) and frames B405 (the picker, the flat preset and loading).

## Decision

- **D1 Grounds.** Try it offers three starting grounds:
  - **Grid**: today's floor, unchanged, and still the default.
  - **Flat world**: superflat layers bedrock, dirt, dirt and `grass_block` from the bottom, built by B405 from vanilla ids. Without the client jar these draw as MSM's fallback cubes, as vanilla props do.
  - **From my world**: an area copied from one of the user's own saves (D3).
  The strip "Preview, not the real game." stays on every ground (ADR 0085 D7). Vanilla blocks from a flat world or a save are props (ADR 0085 D5, limit L10): drawn and solid, nothing more.
- **D2 Read-only, in main, inside `saves/`.** The save is never written. Reading happens only in the main process (`app/src/main/platform/try-it-worlds.ts`). Reads are limited to the `saves/` folders of the game folders the app already knows: every discovered location (which includes the selected one and the launcher instances) and the managed Play instance once Play has reported it. Every path is resolved through its real path: the world folder must lie inside the real `saves/`, `saves/` inside the real game folder, an instance's game folder inside its instance folder, and every file read inside the real world folder, so a symlink cannot lead a read elsewhere. The renderer names a world only by the opaque id main gave it (`<game folder id>/<world folder>`); main resolves it again on every read. A world that is open in the game is still readable, because region files are read whole and Minecraft does not lock them; when a read fails, the message says so.
- **D3 The area.** The user picks a world and a centre: the world spawn from `level.dat` (default) or a typed block X and Z.
  - Width and depth are 48 (the Try it area): X and Z from the centre minus 24 to the centre plus 23.
  - Height is 32: from 8 below the highest non-air block of the centre column to 23 above it, clamped to the world's height range. The range is taken from the sections the chunks hold (`-64..319` for a default Overworld), so data pack heights work too.
  - The spawn is read from `Data.spawn { dimension, pos }` (1.21.9 and later; the exact field names verify at implementation against a 26.x save) or the older `SpawnX`, `SpawnZ`. A spawn in another dimension, or none, centres the area on X 0, Z 0 with a warning.
  - **Overworld only** in this slice. The Nether (`DIM-1/region`) and the End (`DIM1/region`), and custom dimensions under `dimensions/`, are later; the reader is written so a dimension folder can be passed in.
- **D4 Format.** `@msm/interop` `world/` reads Anvil region files (`region/r.X.Z.mca`):
  - chunk compression gzip (1), zlib (2) and uncompressed (3); LZ4 (4, a server's `region-file-compression=lz4`) and custom (127) are reported as unsupported for that chunk, because no existing dependency decodes LZ4;
  - external chunks (type bit 128) from `c.X.Z.mcc` beside the region file;
  - the 1.18+ section format: `sections[]` with `Y` and `block_states { palette, data }`, packed longs with no spanning entries, `max(4, ceil(log2 palette size))` bits per entry, no `data` for a one-entry palette;
  - worlds whose `level.dat` data version is below 2844 (21w43a, the first save with the flat chunk layout) are refused with a plain message ("Open it once in Minecraft 1.18 or later"); single chunks still in the old layout in a newer world (never visited since the upgrade) read as air with a warning;
  - block entities (`block_entities`) and entities (`entities/r.X.Z.mca`) inside the area are counted for a log line, not imported;
  - chunks not generated, not fully generated (`Status` other than `minecraft:full`) or damaged read as air with a warning;
  - block states become strings with properties sorted by name, such as `minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]`; `cave_air` and `void_air` read as `minecraft:air`.
- **D5 Result shape.** The API B405 builds on:
  ```
  type WorldArea = {
    format: 1;
    world: string;
    dataVersion: number;
    origin: { x: number; y: number; z: number };
    size: { x: 48; y: 32; z: 48 };
    palette: string[];
    blocks: Uint16Array;
    skipped: { blockEntities: number; entities: number; missingChunks: number };
    warnings: string[];
  };
  ```
  `palette[0]` is `minecraft:air`; `blocks` is indexed `(y * size.z + z) * size.x + x`; `origin` is the world position of cell (0, 0, 0); `world` is `Data.LevelName` or the folder name; `missingChunks` counts every chunk of the area that read as air (not generated, partly generated, old layout or damaged).
- **D6 No new dependency.** The reader in `@msm/interop` is pure: it takes the world folder, a `readFile(path)` callback that resolves `null` for a missing file, and an optional `inflate` callback (default `fflate`, already a dependency of the package). The main process passes Node's zlib. NBT is parsed with deepslate's NBT module, as `level.dat` already is.
- **D7 IPC.** `msm:v1:tryit:listWorlds` (no request; worlds with id, name, folder, game folder `{ id, name, selected }`, last played, version name, data version, `readable` and `icon.png` bytes up to 256 KiB) and `msm:v1:tryit:readArea` (`{ worldId, centre: 'spawn' | { x, z } }` with integer coordinates within ±30,000,000, returning `WorldArea`). Failures reject with `tryit.<code>: <sentence>`. The preload exposes them as `window.msm.tryItWorlds`.

## Alternatives considered

- **Generate a world with the real game** (a headless server or the client's world creation) and read it back: needs Java, the server jar and the EULA flow ADR 0085 D15 deferred. Rejected for now.
- **Copy the whole save, or open it live**: copying is slow and doubles the user's disk use; opening live means writing locks and session files. Reading three or four region files once is enough for 48 by 48 blocks.
- **Read in the renderer** over a generic file channel: would give the renderer a path-shaped door into the user's disk. Rejected; main resolves ids and checks every path.
- **Decode LZ4**: needs a new dependency or our own decoder for a setting only servers use. Left out; the chunk reads as air with a plain line.

## Consequences

- Try it can show the user's own landscape around their blocks. The grid stays the default, so the "cannot pass for the game" intent of ADR 0085 D7 holds unless the user chooses a world, and the strip stays on every ground.
- Vanilla blocks from a save need the client jar to look right; without it they draw as fallback cubes (B405 says so).
- `@msm/interop` gains `world/`; the app gains a read-only service and two channels. No new dependency; `fflate` and deepslate were already used.
- Old saves (before 1.18), LZ4 chunks, the Nether, the End and custom dimensions are not read in this slice.

## Status

Accepted (2026-11-14) as briefed (B404, B405); the user may still veto the defaults: three grounds with the grid as default, the flat preset's layers, the spawn as the default centre, 8 blocks below the surface, Overworld only, and old saves refused rather than upgraded.
