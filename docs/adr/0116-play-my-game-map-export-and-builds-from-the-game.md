# ADR 0116: Play my game, export as a map, builds from the game

## Context

Play (ADR 0084) always makes one test world. It uses the flat preset, creative mode and a test area, and stops time, weather and mob spawning (fact G16). That suits trying a block but not a Skyblock or an adventure map, and Reload works only in that world. MSM cannot ship a finished world (G17), although world backups already zip whole worlds (ADR 0102) and modpacks exist (ADR 0046). Builds come from the game as structure-block saves, which must be found on disk by hand. The Structure Studio cannot set chest contents (G6).

## Decision

- **D1 Play my game.** A second Play mode opens or makes `msm-game-<ns>` in the managed instance. The world is made with:
  - the world setup's world type: from the content jar, or, for a data-only project, from the dev data pack placed in the world folder before creation (Y15; else reserve B564);
  - its game mode and difficulty;
  - structures on and a random seed;
  - no test area, chests or game rule changes.

  Reload works in it as in the test world. "Start over" renames it as New test world does. One such world per project and target (limit M13).
- **D2 Export as a map.** "Export as a map…" copies a chosen world, either one of the managed instance's worlds or one picked through the world picker. The copy:
  - writes the project's data pack into `datapacks/` and its resource pack as `resources.zip`;
  - removes the dev data pack and the runtime overlays;
  - leaves out `playerdata/`, `advancements/`, `stats/`, `session.lock` and `level.dat_old`, unless "Keep my player data" is on (limit M11).

  A project that needs the jar exports a `.mrpack` (ADR 0046) with the world under `overrides/saves/` (Y14; limit M12). Every other project exports a world `.zip`. `level.dat` is never written: the setup's functions set game mode, rules, difficulty and spawn in game.
- **D3 Builds from the game.** "Bring builds from my test worlds" lists the structure-block saves of the managed instance's worlds (path measured by B547) and imports them as structure templates through the existing `.nbt` importer.
- **D4 Chests in the Structure Studio.** A "Chests and containers" section lists each block entity with an inventory. For each it edits the loot table, the loot seed and the items, written back as the element's SNBT.

## Consequences

- A Skyblock or map can be played as players will play it, and shipped as one file.
- Main gains a map export service beside world backups. Both reuse the same zip code and the same containment rules (writes only into the picked output file).
- Without level.dat edits a map keeps the author's world settings (cheats, seed). The guide says so.
- Found at B554 (2026-11-23): the game asks "experimental settings" every time a world with its own world type is reopened (B547 Y14). In Play my game the runtime's dev client answers it itself ("I Know What I'm Doing!", found by its translation key), only for `msm-game-` worlds and only during its own open request, so Reload and a second Play do not wait for a click; a world opened by hand still asks. Game worlds are made with commands on (B547's settings). Both are vetoable defaults, for review at the plan's close.

## Status

Proposed (2026-11-22). Vetoable defaults:
- the world name `msm-game-<ns>`;
- a random seed;
- player data left out of maps;
- `.mrpack` for maps that need the jar;
- no level.dat writing.
