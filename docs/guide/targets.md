# Minecraft versions (targets)

Every MCSuperMods project is made for one Minecraft version, its **target**. The target decides which ids, fields and folder names are valid, which pack formats go into `pack.mcmeta`, and which Fabric, `msm_runtime` and GeckoLib builds go into the Fabric mod jar. Your project itself is version-agnostic: when you move it to another target, MCSuperMods lowers the same elements to that version's files.

## The two targets

| Target id | Minecraft | Kind |
|---|---|---|
| `mc-26.3` | 26.3 | Release. New projects use it unless you choose otherwise. |
| `mc-26.4` | 26.4-snapshot-7 | Snapshot. |

A **snapshot** target follows a Minecraft version that Mojang has not released yet. Its facts come from one particular snapshot (here 26.4-snapshot-7) and can change when MCSuperMods moves the target to a newer snapshot or to the release. Use it to try your content on the coming version; use the release target for packs and mods you share. MCSuperMods does not promise to follow every snapshot: the target stays on the snapshot it was built against until a later MCSuperMods release moves it.

MCSuperMods supports the current Minecraft release and the next version's snapshots (the release once it lands). An older release stays supported by the MCSuperMods release that was current with it.

## Choose the target of a new project

The **New project** dialog has a **Minecraft version** select. For a starter without questions it is under the starter list; for a starter with the **Wizard** badge it is on the last step, beside the summary of your answers. It starts on the newest release target. Choosing a snapshot shows a **snapshot** badge and the note "A snapshot target follows a Minecraft version that is not released yet; its facts may change when it is re-pinned."

A wizard lists only the targets its starter can be made for. The **Custom mob** starter needs GeckoLib, which has no build for the 26.4 snapshot yet, so it offers only 26.3.

**New** on its own creates a blank project on the newest release target.

## See the target of an open project

The status bar at the bottom of the window shows the open project's target id, for example `mc-26.3`, with a **snapshot** badge when it is a snapshot target. Hover over it to see the Minecraft version.

The toolbar's **Install** menu and its **Change target** submenu are something else: they choose which game folder or launcher instance installs go into (see [Getting started](getting-started.md#2-first-launch-tell-mcsupermods-where-minecraft-is)). They do not change the project's target.

## Move a project to another target

1. Choose **File → Upgrade Project Target…** (or "Upgrade project target…" in the command palette, Ctrl+Shift+P).
2. The **Upgrade project target** dialog says which version the project exports for now and lists every other target; snapshot targets carry a **snapshot** badge. Choose one.
3. MCSuperMods checks the project against the chosen target and shows a report. Nothing has changed yet.
4. Choose **Upgrade** to move the project, or **Cancel** to leave it.

The upgrade is one step: **Undo** (Ctrl+Z) moves the project back, with every change the upgrade made. The same dialog moves a project back to an older target.

### Read the report

The report starts with a summary such as "0 changes, 0 problems.", then lists:

- **Changes**: ids MCSuperMods replaces for you because the new version renamed them, each with the element it belongs to.
- **Errors**, **Warnings** and **Notes**: what MCSuperMods found but cannot fix itself. The usual one is `target.removed-id`: an element uses an id that the new version no longer has (for example a block, item or particle that was removed). Fix those elements after the upgrade; until then they show in **Problems** and block export as usual.

After the upgrade MCSuperMods checks the whole project against the new version's definitions, so anything the report could not know about (a field the new version no longer accepts, for example) appears in **Problems** too.

A project made from the **Custom ore** starter, for example, moves from 26.3 to the 26.4 snapshot with no changes and no problems.

## What differs per target

| What | How it follows the target |
|---|---|
| Ids and forms | Pickers, drop-downs and checks use the target's registries and data definitions. |
| Pack formats | `pack.mcmeta` gets the target's resource or data pack format; you never type a pack format. |
| File names | Pack zips are named `<project>-<target id>.zip` (and `-data.zip` for the data pack), so exports for different targets do not overwrite each other. |
| Fabric mod jar | `fabric.mod.json` names the target's Minecraft and Fabric API versions, and the nested `msm_runtime` is the build for that Minecraft version. |
| Mobs | Mobs need GeckoLib. 26.3 has it; the 26.4 snapshot has none yet, so a Fabric mod jar of a project with mobs cannot be exported for it (`export.no-geckolib-target`), the **Custom mob** starter offers only 26.3, and the Creator shows its Custom mob flow as "Not available for Minecraft 26.4-snapshot-7 (this project's target)." |
| Java project export | **File → Export Java Project…** works for 26.3 only; for the 26.4 snapshot it reports `export.no-java-project-target`. |
| Preview textures | The preview uses the vanilla assets of the target's Minecraft version, extracted from your own copy of the game (**Settings → Vanilla assets**). Start that version once in any launcher if they are missing. |
| Test in Minecraft | The managed test instance is named after the version, for example `MCSuperMods Test (26.3)`. |

## When 26.4 is released

When Mojang releases Minecraft 26.4, a later MCSuperMods release moves the `mc-26.4` target from the snapshot to the release. The target id stays `mc-26.4`, so projects on it follow without an upgrade; the status bar drops the **snapshot** badge, mobs become available once GeckoLib has a 26.4 build, and 26.4 becomes the default for new projects. If the release removed or renamed anything the snapshot had, the next validation pass shows it in **Problems**.

The design behind targets is in [ADR 0037](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/adr/0037-second-target-mc-26.4-and-target-upgrade.md) (the second target and the upgrade command) and [ADR 0038](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/adr/0038-per-version-runtime-builds.md) (one `msm_runtime` build per Minecraft version).
