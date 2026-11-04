# ADR 0021: Structure templates as JSON elements and the NBT codec

## Context

Phase 3 ([ROADMAP](../ROADMAP.md)) imports and previews structures and lets them take part in jigsaw generation. A vanilla structure template is a gzip NBT file at `data/<ns>/structure/<path>.nbt` (folder `structure` since 1.21, `structures` before; checked against the binder table of `@spyglassmc/java-edition` 0.3.70). Builders also exchange Sponge Schematic files (`.schem`, Version 2 and Version 3). DESIGN said structures are "read and written via `prismarine-nbt`" and listed `.nbt` among opaque assets ([Interop](../DESIGN.md#13-interop-blockbench-nbt-minecraft-installation), [Core Project Model](../DESIGN.md#4-core-project-model-ir)), and the ROADMAP put the codec in `@msm/interop` `nbt/`.

Three facts made that plan a poor fit:

- The project is JSON only ([Project File Format](../DESIGN.md#5-project-file-format)), and the reference index, rename, the validation gate and goldens all work on element JSON. An opaque `.nbt` asset would hide the jigsaw pool ids inside it from all four.
- `@msm/exporters` passes only `textures/`, `sounds/`, `font/` and `texts/` assets into a pack, so a structure cannot ride along as an asset; it must lower to a file like every other element (`lower(element, target) -> OutputFile[]`).
- `deepslate` 0.27.2, already pinned in the catalog for the preview ([ADR 0010](0010-preview-with-deepslate.md)), ships an `nbt` module with binary read and write, automatic gzip and zlib detection through `pako`, SNBT print and parse, and a structure reader. It runs in Node and in the renderer and needs no `Buffer`. `prismarine-nbt` 2.8.0 is `Buffer`-centric and pulls in `protodef`.

The Minecraft 26.3 data version, needed to write `DataVersion` into structure files, is 5023 (`vendor/mcmeta/version.json` of the `mc-26.3` target).

## Decision

**D1. Structure templates are JSON elements lowered to `.nbt`.** `@msm/plugin-structures` (plugin id `msm.structures`) contributes the kind `minecraft:structure_template`: kind folder `structure`, registry `structure`, schema `msm:structure_template`. The schema is a TypeScript `SchemaNode` extension in `@msm/schemas` (`BUILT_IN_EXTENSIONS`), like `msm:function` ([ADR 0015](0015-data-pack-element-model.md)), until MSM mcdoc arrives in Phase 4. The element data is:

```jsonc
{
  "size": [7, 5, 7],
  "palette": ["minecraft:oak_planks", "minecraft:oak_stairs[facing=north,half=bottom]", "minecraft:jigsaw[orientation=north_up]"],
  "blocks": [[0, 0, 0, 0], [1, 0, 0, 1]],
  "block_entities": [{ "pos": [3, 1, 3], "nbt": "{Items:[{Slot:0b,id:\"minecraft:bread\",count:3}]}" }],
  "jigsaws": [{ "pos": [3, 0, 6], "pool": "ns:streets", "name": "ns:street_start", "target": "ns:street_end", "final_state": "minecraft:dirt_path", "joint": "rollable", "placement_priority": 0, "selection_priority": 0 }],
  "entities": [{ "pos": [3.5, 1.0, 3.5], "block_pos": [3, 1, 3], "nbt": "{id:\"minecraft:armor_stand\"}" }]
}
```

- `size` is `[x, y, z]`. Each axis up to 48 is the vanilla structure block limit; a larger axis is a `structures.template-too-large` warning, not an error.
- `palette` holds block-state strings; `blocks` holds `[x, y, z, paletteIndex]` tuples, sorted by y, z, x on import. A position with no entry is structure void.
- Block-entity and entity NBT travel as SNBT strings, Minecraft's own text form, so tag types survive. Jigsaw block entities are lifted out of `block_entities` into `jigsaws`, whose `pool` is typed as a `worldgen/template_pool` id, so the reference index, rename and `schema.unknown-id` see it. Palette entries and `final_state` are block-state strings, not ids.
- Lowering writes `data/<ns>/<folders.data.structure>/<path>.nbt`: gzip vanilla structure NBT with `DataVersion` set to `target.dataVersion` and jigsaws turned back into `minecraft:jigsaw` block entities. The `OutputFile` has `contents: Uint8Array`, layer `datapack` and no `schema` (binary). The bytes are deterministic (pako gzip with no header mtime), so goldens pin them.
- Import converts `.nbt` (vanilla) and `.schem` (Sponge Version 2 and 3) into this JSON. The original file is not kept as an asset, because the element represents it fully. A file whose `DataVersion` is newer than the target's gives a `structures.newer-data-version` info problem on the import result. A vanilla file with several random `palettes` imports the first one.
- Exact field names of the jigsaw block entity (`placement_priority`, `selection_priority`, `joint`) follow the mcdoc `block_entity` schema for `minecraft:jigsaw` (verify at implementation).

We store templates as JSON because the project stays JSON only, lowering stays pure, rename and validation reach the jigsaw pools, goldens stay plain text, and the preview reads element data directly.

**D2. The NBT codec is deepslate's `nbt` module, not prismarine-nbt.** `deepslate` (catalog pin 0.27.2) becomes a runtime dependency of `@msm/plugin-structures` and `@msm/interop`; both import only the `deepslate/nbt` subpath. We do not add `prismarine-nbt`. One codec then runs in the main process, in the renderer and in CI, with gzip, zlib and SNBT, and no new third-party package enters the lockfile. Round-trip fidelity of every tag type through SNBT is the one codec risk; the codec tests in B73 decide it. If a tag type does not survive, that block entity's NBT is stored as deepslate's typed JSON under `nbt_json` instead of SNBT, and this ADR's Status records it.

**D3. Where structure I/O lives.**

- `@msm/plugin-structures` `src/nbt/` holds the codec: a typed wrapper over `deepslate/nbt`, structure template JSON to and from vanilla NBT, Sponge `.schem` Version 2 and 3 read and Version 3 write (varint block data, index `x + z·Width + y·Width·Length`, `Offset` ignored on import and written as `[0, 0, 0]`), and a block-state string parser and printer with properties sorted by key.
- The plugin contributes two **importers**, `structure-nbt` (extension `nbt`) and `sponge-schematic` (extension `schem`), and two **exporters** that consume lowered `OutputFile[]`: `structure-nbt` writes `<ns>/<path>.nbt` for every structure output, and `sponge-schematic` converts each to `<ns>/<path>.schem` Version 3. These are the `importers` and `exporters` contribution points of [Plugin System](../DESIGN.md#7-plugin-system), used as DESIGN intends, so the plugin keeps to the public API.
- `@msm/interop` `nbt/` shrinks to `level-dat.ts`: it reads `Data.LevelName` from a world's `level.dat` for the world picker and never throws. This closes the Phase 2 follow-up "World names from `level.dat`".
- The host (the app) runs importers generically: `session.importFiles(files, namespace)` picks the importer by file extension, adds every element and asset as one undo step and reports `ImportResult.problems`; duplicate ids are reported as `import.duplicate-id` and skipped. File > Import Structure… (command `importStructure`) builds its file filters from the registered importers. The Export menu gains Export Structures (.nbt)… (`exportStructures`) and Export Structures as Sponge Schematics (.schem)… (`exportSchematics`), which lower the project and run the named plugin exporter into a folder chosen through the existing export IPC. No new IPC channels.

**Decisions pending the user's veto.** The orchestrator made two defaults on the user's behalf; each stands unless the user vetoes it:

1. deepslate's `nbt` module is the NBT codec instead of `prismarine-nbt` (D2).
2. Structure templates are stored as JSON elements in the project (D1). The alternative, keeping the `.nbt` file as an opaque asset, gives smaller project files for large structures but loses rename, validation and reference tracking of the jigsaw pools.

## Consequences

- Structures follow the same pipeline as every other element: lowered, merged, written, pinned by goldens (binary goldens compared byte for byte).
- Project files grow with structure size: a 48×48×48 template is at most about 110,000 block entries, roughly 3 MB of JSON. The Raw JSON tab and the command stack cope; the import warns above 48 in any axis.
- Jigsaw pools inside structures take part in rename, autocomplete and unknown-id warnings.
- Block entities, entities and random palettes beyond the first are carried but not editable in the app in v0.3; structure blocks are edited in-game and re-imported ("Replace from file…" in the Structure Studio).
- `@msm/interop` gains `deepslate` as a dependency; `prismarine-nbt` leaves the design. DESIGN [Interop](../DESIGN.md#13-interop-blockbench-nbt-minecraft-installation), [Tech Stack](../DESIGN.md#14-tech-stack) and the ROADMAP Phase 3 list change accordingly.
- `Target` gains `dataVersion` and `folders.data.structure` ([ADR 0022](0022-worldgen-element-model-and-validators.md)).
- No new third-party package: deepslate is already in the catalog and the renderer bundle.

## Status

Proposed (2026-11-04); implementation in B73 (codec, kinds, importers, exporters), B75 (`level.dat`), B77 (host import and export plumbing) and B79 (Structure Studio), within B73–B82. The two defaults above stand unless the user vetoes them.
