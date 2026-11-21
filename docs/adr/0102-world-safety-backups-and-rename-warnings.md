# ADR 0102: World safety: backups before installing, warnings before renaming exported ids

## Context

The user asked (2026-11-21) how to keep worlds safe when mods are added, removed or changed, and chose two of the offered protections: an automatic world backup before MSM installs into a real world, and a warning when an id that has already left MSM is renamed. Minecraft keeps a world's blocks, items and entities by id: a removed or renamed id turns placed blocks into air and drops items and mobs (vanilla behaviour). MSM's Play works in its own managed test world, so the risk is in the installs into the user's own game locations (ADR 0019): data packs into `saves/<world>/datapacks/` and resource packs, and the exports a user copies by hand.

## Decision

- **D1 Backup before install into a world.** Before MSM writes a data pack into `<gameDir>/saves/<world>/datapacks/`, main copies the whole world folder into `<msmHome>/backups/<location-slug>/<world-dir>/<YYYY-MM-DD_HH-mm-ss>.zip` (zip, store or deflate, written atomically through a temporary file). The install waits for the backup; a failed backup stops the install with its reason (the user can retry or turn backups off for that install). The setting `backups.beforeInstall` (default on) and `backups.keep` (default 5 per world; the oldest beyond it are deleted after a successful new backup) live in the app settings. Backups never leave the user's computer.
- **D2 What is not backed up.** Resource packs (they change no world), MSM's own managed Play instance and its test world (made by MSM, rebuilt with New test world), and exports to a folder (MSM does not know which world they go to). Mod jars are not installed into the user's own instances by MSM today; if a later flow does, it backs up the instance's worlds the same way.
- **D3 Seeing and restoring.** Settings get a "World backups" section: the folder (Open folder), the two settings, and the list of backups per world with Restore. Restore unpacks a backup beside the world as `<world-dir>-restored-<stamp>` (never over the live world), so nothing is lost by a wrong click; the guide explains how to swap them. The install message names the backup it made.
- **D4 Exported ids are remembered.** When the project is exported or installed (content jar, vanilla packs, install, Test in Minecraft, Play), the session records the game ids that left MSM in `<project>/.msm/exported-ids.json` (sorted, 2-space; ids from the same registry view the exporters use: blocks, items, entities, fluids and their generated blocks and buckets, effects, potions, enchantments, dimensions, professions, vehicles; with the date and target of the last export). `.msm/` is already the project's own folder and is not part of the lowered output.
- **D5 Rename warning.** Renaming an element whose id (or a generated id it owns: a block's item, a fluid's bucket) is in that record shows a warning in the Rename dialog before the rename: the ids that change, that worlds which already use them will lose the placed blocks, items or mobs, and a suggestion to keep the old id or rename only before anyone has worlds with it. The user can continue; Very easy shows the same in plain words. Renames of elements never exported do not warn. Deleting such an element warns the same way.
- **D6 Versions.** Nothing here is version-specific; no target facts.

## Consequences

- Installs into a world take longer by the time to zip the world (a few seconds for a small world; large worlds longer). The setting lets power users turn it off.
- Backups use disk space; `backups.keep` bounds it per world.
- The exported-ids record is per project folder; a project copied without `.msm/` loses it, and then renames do not warn (stated in the guide).

## Status

Accepted (2026-11-21, user's choice of the two protections; details by the main session).
