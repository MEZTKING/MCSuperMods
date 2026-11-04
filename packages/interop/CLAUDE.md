# packages/interop — Blockbench, NBT and Minecraft installation

Phase 1 adds the package and `minecraft-install/`: locate `.minecraft`, list versions and extract preview assets with fflate into `~/.msm/cache/assets/<version>/` (ADR 0011), tested with a synthetic jar. NBT and Blockbench follow in Phases 3 and 5.

## Purpose

`@msm/interop` connects MSM to files and tools outside the project: Blockbench models, structure files and the user's Minecraft installation. Importers feed the IR; they never build a parallel model.

## Contents (planned)

| Subfolder | Phase | Role |
|---|---|---|
| `minecraft-install/` | 1 | Locate `.minecraft`, read `versions/<v>/<v>.jar` for preview assets into `~/.msm/cache/assets/<version>/`, launch helpers |
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

## Commands (planned)

Not yet wired (Phase 0).

- `pnpm --filter @msm/interop test`
- `pnpm --filter @msm/interop build`

## Read next

- [DESIGN §13 Interop (Blockbench, NBT, Minecraft Installation)](../../docs/DESIGN.md#13-interop-blockbench-nbt-minecraft-installation)
- [ROADMAP, Phases 1, 3 and 5](../../docs/ROADMAP.md)
