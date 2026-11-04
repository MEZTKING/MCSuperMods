# packages/interop — Blockbench, NBT and Minecraft installation

Phase 2 code complete: `minecraft-install/` locates `.minecraft`, lists versions and extracts preview assets, including `.png.mcmeta` animation sidecars, with fflate into `~/.msm/cache/assets/<version>/` (ADR 0011; cache `schemaVersion` 2, older caches are re-extracted), tested with a synthetic jar; `readPngHeader` reads PNG sizes. World listing and data pack install live in the app's main process. NBT and Blockbench follow in Phases 3 and 5.

## Purpose

`@msm/interop` connects MSM to files and tools outside the project: Blockbench models, structure files and the user's Minecraft installation. Importers feed the IR; they never build a parallel model.

## Contents

| Subfolder | Phase | Role |
|---|---|---|
| `minecraft-install/` | 1 | `locate.ts` (default dir, versions, jar pick), `extract.ts` (filtered `unzipSync`, including block and item `.png.mcmeta` sidecars), `cache.ts` (`ASSET_CACHE_SCHEMA_VERSION`; bump it whenever the extracted set changes), injected `InstallFileSystem`; launch helpers in Phase 4 |
| `png.ts` | 1 | `readPngHeader` (width, height) for imported textures |
| `node.ts` | 1 | Subpath `@msm/interop/node`: Node `InstallFileSystem`, `nodeEnv`, `sha1Hex` (main process only) |
| `nbt/` | 3 | Structure `.nbt` and Sponge `.schem` read/write via `prismarine-nbt` |
| `blockbench/` | 5 | `.bbmodel` → Java block/item models, or GeckoLib geo + animation JSON |

## Conventions

- Importers produce IR elements and assets through the `Importer` interface in `@msm/plugin-api`.
- Read-only on the user's game directory, except copying into `resourcepacks/` or `datapacks/` and the managed instance folder.
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
- [ROADMAP, Phases 1, 3 and 5](../../docs/ROADMAP.md)
