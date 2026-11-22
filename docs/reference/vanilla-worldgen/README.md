# Vanilla worldgen notes and tools — for a mod session

A small pack for an AI (or human) session that is writing **mods for vanilla Java Minecraft** — Fabric, NeoForge, or a data
pack — and needs to match or deliberately change world generation. It contains no game code, no jar, no assets: only
**findings and measurement tools**.

## What is here

```
docs/VANILLA-WORLDGEN-NOTES.md   the rules a worldgen mod has to match (seeds, ordering, heightmaps, surfaces, ores, trees,
                                 plants, structures, data formats) with the vanilla file each comes from
docs/MEASURED-TABLES.md          baseline numbers from vanilla worlds: ores a chunk, plants by biome, biome cell volumes,
                                 village pools and sizes, with the chunk sets they were measured on
tools/region.py                  a stdlib-only region reader: palette forms, packed containers, heightmaps, biome cells
tools/ore_counts.py              ores per chunk per type from a region folder
tools/nbt.py                     structure templates: size, palette, blocks, chest loot tables
tools/jar_data.py                list/print/grep the data pack inside any Minecraft jar
tools/feature_indices.txt        the feature order per decoration step (the index setFeatureSeed uses), 171 entries
tools/structure_pieces.py        dump every piece of every structure start in a generated world (id, box, rotation); reads only
```

Python 3.10+, no dependencies. Everything reads the player's own files (a world this machine generated, or a jar the player
has); nothing is bundled.

## Start here

1. `docs/VANILLA-WORLDGEN-NOTES.md` §1–§2 if your mod adds a feature, structure or biome: the seed formula and the ordering
   rules decide *where* it lands, and getting one of them wrong moves everything after it in the same step.
2. §3 if your feature is a plant, tree or anything with a heightmap: using the wrong heightmap is the single most common way a
   mod's vegetation ends up on treetops or under them.
3. §4–§5 for terrain/ore mods, §6 for trees and plants, §7 for jigsaw structures, §8 for the data formats.
4. `docs/MEASURED-TABLES.md` before claiming a difference: it gives the vanilla baseline and the sample sizes behind it.
5. `tools/` to measure your own world: generate with a fixed seed, then count.

## What this pack deliberately does not do

- It does not copy, decompile or redistribute Minecraft's code or assets, and it does not need to: every statement here is a
  behaviour or a number, with the vanilla file name that defines it so you can read the data pack yourself.
- It has nothing to do with any other project's custom content area; it is only about vanilla's own world generation.
- It makes no claim about other Minecraft versions. The numbers and rules are Minecraft 26.3 (class file 69); 1.20–1.21 agree
  on most of them and differ on the ones marked 26.x.

## The three habits that save the most time

1. Count **every palette state** (`region.state()` handles all three forms). A name-only counter reported leaf litter 13× too
   low in a forest.
2. Use **full-status chunks only** — below `minecraft:full` a chunk has terrain and no features.
3. State the **chunk set** with every average. The same plant measurement reads tens of percent apart on two sets.

## The 2026-11-22 edition (what MSM kept)

The user sent a newer edition of this pack on 2026-11-22. Its notes, tables and tools above are unchanged; it adds `tools/structure_pieces.py` (kept: it only reads a world's saved structure starts). It also brings `docs/COMBAT-NUMBERS.md`, `docs/FINDINGS-2026-11-18.md`, `docs/NAME-HASHES.md`, `docs/VANILLA-SAVE-FORMAT.md` and `tools/client_jar.py`, which are **not** kept here: those documents say they were read from Minecraft's own (decompiled) code and classes, and the tool prints method bytecode (`javap -c`). MSM's clean-room rule (no Mojang method body read, decompiled or transcribed; numbers only from observation and vanilla's data) stays as it is, by the user's choice of 2026-11-22. Where MSM needs one of those facts, a spike measures it in the game.
