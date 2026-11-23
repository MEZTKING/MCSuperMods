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

## Findings at the close (B562, 2026-11-23)

Reviewed against the merged code of B554, B555, B556 and B560: `engine-mod` `client/dev/DevWorldSettings.java`, `DevClient.java`, `DevClientFiles.java`, `dev/DevSetup.java`, `DevFiles.java` and the client GameTest `MsmPlayMyGameClientGameTest`; `@msm/interop` `fabric/dev-session.ts`, `setup-function.ts`, `fabric/structure-saves.ts` and `world/map-export.ts`; the app's `main/platform/play.ts`, `main/platform/map-export.ts`, `store/play-store.ts`, `components/play/PlayControls.tsx`, `components/ExportMapDialog.tsx`, `ImportFilesDialog.tsx` and `studios/structures/ContainersSection.tsx`; the e2e specs `maps-path` and `games-path`. Y14 and Y15 of [ADR 0117](0117-game-modes-flows-studios-try-it-and-tests.md) apply here. A small fix of B560's quirks (the chip, the import's namespace) was still under way at this close and is not reviewed here.

### Each decision's outcome

| Decision | Outcome |
|---|---|
| D1 Play my game | Built: the Play menu's **Play my game** and **Start over** (off, with the reason, without a world setup), the chip **In my game** and **Seed <n>** beside it. The request (`PlayRequest.kind` `game` with `preset`, `gameMode`, `difficulty`) opens or makes `msm-game-<ns>`; the preset is the world setup's own (its project preset for `preset`, `minecraft:normal` for `vanilla`). Changed: **main places no dev data pack before creation**, because every Play installs the content jar and a data-only project's `data/` files are in it; the runtime looks the preset up in the registries of the world being made, so a pack placed in the world folder first works too (Y15; the client GameTest covers that route). Reserve B564 was not needed. The world is not hardcore, has **commands on**, structures on, no bonus chest and a random seed reported in `status.json`; `DevSetup` runs no setup function there; Reload and the reopen work in it; Start over renames it `<world>-old-<n>`; Restart restarts into the world last played. The dev client answers the "experimental settings" screen every time it opens a `msm-game-` world itself (Y14: every reopen and second Play shows it), by the button's translation key; a world opened by hand still asks. |
| D2 Export as a map | Built: File > **Export as a Map…** (a lazy dialog: source, **Map name**, **Keep my player data**, then the world picker with `msm-game-<ns>` first); main lists the managed instance's worlds and every discovered location's, refuses a world open in the game and a map saved inside its own world, and streams through a temporary file into the one picked file (`zipTree`, shared with world backups). Changes: `session.lock` and `datapacks/msm-dev/` are always left out; the player data left out unless kept is 26.x's `players/data`, `players/advancements` and `players/stats` (Y14) with the older `playerdata/`, `advancements/`, `stats/` and `level.dat_old`; a `.mrpack` map (a project with mod-only ids, or whose vanilla data pack would leave something out) carries the jar only, with no data pack or `resources.zip` in the world, since a copied data pack would override a later jar's data; the map's folder and file name come from **Map name**. `level.dat` is never written. |
| D3 Builds from the game | Built: saves are `<world>/generated/<ns>/structure/<path>.nbt` (a redstone pulse does not save); Import Structure… gains the tab **From my test worlds** with **Bring builds from my test worlds**, through the `.nbt` importer, each element named after the save's path. |
| D4 Chests in the Structure Studio | Built (B555): **Chests and containers** lists each block entity whose type has `Items` in the target's schema or whose data names a loot table or holds items; the loot table, the loot seed (a long, checked) and the items (item, count, slot) are written back to `block_entities/<n>/nbt` through the structures plugin's `parseSnbt` and `printSnbt`, keeping every other key; one undo step per edit. |

### The questions left for this close

- **The experimental settings answer** (found at B554): kept. Without it Reload's reopen and a second Play would wait for a click in every game world with its own world type; it acts only for `msm-game-` worlds and only during the runtime's own open request. A vetoable default for the user's look on Windows.
- **Commands on in Play my game**: kept. It is the maker's own copy of the world (B547 used the same), so `/function`, `/scoreboard` and the fixture's in-game checks work in it; a map made from it keeps that setting (no `level.dat` writing), which the guide's `maps.md` says. A vetoable default.

### Open items

- In game (B547 left them open, Y14): `resources.zip` taking effect in a map opened from the world list; a `.mrpack` map's `overrides/saves/` landing as a world in Prism and the Modrinth app; whether a singleplayer map made without **Keep my player data** still starts the author's inventory from `level.dat` (`Data.Player`), which a map copies unchanged.
- The command palette has no "Export as a map" entry.
- B560's quirks: the chip may read "Starting…" rather than "Game not running" when the game stops within three minutes of its launch, and Import Structure… defaults to the project's first namespace (`minecraft` in a project with vanilla tag files); a fix was in progress at this close.

## Status

Accepted with findings (2026-11-23, close B562; briefs B554, B555's chests, B556, B560). Vetoable defaults:

- the world name `msm-game-<ns>`;
- a random seed;
- player data left out of maps, `session.lock` and the dev data pack always;
- `.mrpack` for maps that need the jar, carrying the jar only;
- no level.dat writing;
- the dev client answering the experimental settings screen in game worlds;
- commands on in game worlds;
- the preset from the content jar, with no dev data pack placed before creation.
