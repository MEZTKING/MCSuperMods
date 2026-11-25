# Moving to a newer Minecraft

Every mod you make in MCSuperMods is made for one Minecraft version. When a newer Minecraft comes out, MCSuperMods notices it, tries the move on a copy of your mod first, and tells you in plain words what changed in Minecraft, what it changes for you, what you need to change yourself, what your players need and what to check in the game. One button moves the mod; **Undo** puts it back. Nothing is moved until you press that button.

This page also says which Minecraft versions MCSuperMods knows and what differs between them.

## The versions MCSuperMods knows

| Minecraft | Kind | Id (under More options) |
|---|---|---|
| 26.3 | Release. New mods use it unless you choose otherwise. | `mc-26.3` |
| 26.4-snapshot-7 | Test version (a snapshot). | `mc-26.4` |

A **test version** (a snapshot or pre-release) is a Minecraft version Mojang has not released yet. MCSuperMods follows one particular build of it (here 26.4-snapshot-7), and a later MCSuperMods release can move to a newer build or to the release. A test version of Minecraft can change every week, so a mod moved to one may need moving again when MCSuperMods follows the next one. Use a test version to try your content on the coming Minecraft; use the release for mods and packs you share.

MCSuperMods supports the current Minecraft release and the next version's test builds (the release once it lands). An older release stays supported by the MCSuperMods release that was current with it.

### Choose the version of a new mod

The **New project** dialog has a **Minecraft version** select. For a starter without questions it is under the starter list; for a starter with the **Wizard** badge it is on the last step, beside the summary of your answers. It starts on the newest release. Choosing a test version shows a **snapshot** badge and the note "A snapshot target follows a Minecraft version that is not released yet; its facts may change when it is re-pinned."

A wizard lists only the versions its starter can be made for. Every mob starter, including **Custom mob**, **Pet** and **Boss**, offers both: on the 26.4 test version the mobs are drawn by the runtime's built-in renderer. **New mod…** makes a blank mod on the newest release.

### See which version a mod is made for

The status bar at the bottom of the window says "For Minecraft 26.3", with a **snapshot** badge for a test version. Home's **Your mods** says on each card which Minecraft the mod is made for.

The **Install** menu (under **More** on the toolbar) and its **Change target** submenu are something else: they choose which game folder or launcher instance installs go into (see [Getting started](getting-started.md#2-first-launch-tell-mcsupermods-where-minecraft-is)). They do not change the Minecraft version of your mod.

## When a newer Minecraft is ready

When a newer Minecraft is ready for your mod, the status bar shows a small mark beside its version and Things to fix says what would change by itself and what needs you, for example "Minecraft 26.4 is ready for this mod: 3 things change by themselves, 1 needs you." **See what changes** opens the report; **Not now** puts the note off for that mod and that version (the mark in the status bar stays, as a quiet way back to the report). Home's Your mods says which Minecraft each mod is made for and where it can move.

Only real releases are announced unless **Tell me about test versions of Minecraft** is on in Settings (under Updates). Test versions can always be chosen by hand: choose **File → Move to another Minecraft version…** (or type "new Minecraft version" or a version number such as "26.4" in search or the command palette, Ctrl+Shift+P).

## The report

The **Move to another Minecraft version** dialog says which version your mod is made for now and lists the other versions; test versions carry a **snapshot** badge. Choose one. MCSuperMods moves a copy of your mod, checks it on that version and shows the report. Nothing in your mod has changed yet. The summary at the top says how much changes, for example "1 thing changes by itself, 4 need you."

The report follows your edits: if you change your mod while it is open, it says "Checking again…" and shows the new report when it is ready, so what you move is always your mod as it is now. Empty parts are left out. The parts are:

- **What changed in Minecraft for this mod**: each change in the new Minecraft that touches your mod, said once, with the things it touches.
- **What MCSuperMods changes for you**: each thing MCSuperMods changes by itself (a renamed id, a setting the new version no longer has), with **Show me**. Under each one, **See it before and after** draws the thing's own view twice: as it is now and as it will be on the new version. World generation things show the live world map of the moved copy with **Before the move** to compare. When MCSuperMods makes the same files of the thing on both versions, it says "Looks the same: what MCSuperMods makes of it is the same on both versions."
- **What you need to change**: what MCSuperMods cannot change for you, each with **Show me** (opens the thing at the field), **Ask the helper** and, where the new version's notes say how, a line starting "How:".
- **What your players need**: the Minecraft, Java, pack format, Fabric Loader, Fabric's shared library mod, MCSuperMods runtime mod and GeckoLib versions before and after, and whether the mod can still be exported as a Java project.
- **New in this version**: how many new things Minecraft adds that your mod could use.
- **What to check in the game**: what to try once in the new Minecraft, always listed.
- **Minecraft changed these too**: Minecraft's own files that your mod replaces or adds to and that the new version changed, with **Show me**.
- **If you exported a Java project** and **Mods in this pack**: see [Eject to a Java project](eject.md#after-moving-to-a-newer-minecraft) and [below](#mods-in-a-modpack).
- **Check on other versions**: see [below](#check-on-other-versions).

A last line says how many other changes in the new Minecraft do not touch your mod. A mod nothing touches gets one sentence instead ("Nothing in your mod needs changing for Minecraft X: none of the n changes MCSuperMods knows about touches it."), with what your players need and what to check in the game. A project made from the **Custom ore** starter, for example, moves from 26.3 to the 26.4 test version with nothing to change.

**More options** at the bottom of the dialog shows the version ids, the ids and paths of the things, each step's before and after, and the counts of the changes by kind.

## Move my mod

**Move my mod to Minecraft X** moves the mod as one step (**Not now** closes the dialog and leaves it). A note says "Your mod now uses Minecraft X." and **Undo** (Ctrl+Z) moves it back with every change the move made. Before moving, MCSuperMods keeps a copy of your mod as it was, and the report, in the mod's own hidden `.msm/upgrades/` folder (the three newest are kept), so the copy is still there after the app is closed.

### After moving

What you still need to change goes to Things to fix, under **After moving to Minecraft X (n)**, with Show me, Fix it, Ask the helper and the "How:" line. Each item leaves by itself once you fix it; an item MCSuperMods cannot check (something to try in the game) has **Done** to tick it off.

**What changed when I moved**, in that group and in the move dialog, opens the report of each move you made, with the items fixed since marked done.

**Ask the helper** on an item opens the [AI helper](ai-helper.md) with it. The helper reads the report of the move, the same one you see, to explain or fix what it lists; it never tells you about a change in Minecraft the report does not list, and it cannot move your mod itself.

## Check on other versions

**Check on other versions**, at the end of the report and under More options when you save the mod as a file or export a Java project, says for each Minecraft version whether your mod works as it is, works after a move, or how many things would break. **See the report** opens that version's report.

## Moving back

Moving back to an older version puts back what the move up took away, from the record MCSuperMods kept, even over more than one move. Choose the older version in the same dialog. Before you press, the report lists first **What cannot be put back** and why, and **Changed since the move**: the things you changed after the move, which keep your changes. When nothing has to be put back, the report says "Nothing in your mod needs putting back for Minecraft X: it moves back as it is."

A move made before MCSuperMods kept records cannot be undone in full: the report lists what that move changed by itself, so you can check those things.

A world you opened in a newer Minecraft cannot go back to the older one; your mod can.

## Mods in a modpack

If your mod is in a modpack, the report shows **Mods in this pack**. MCSuperMods asks Modrinth whether each mod has a build for the new Minecraft only when you press **Check my mods**. Mods with a build are updated in the same step as the move, so Undo puts them back. A mod without a build can wait in the pack or come out of it, or the pack can stay on the old Minecraft. The next time you press Play, MCSuperMods makes a new instance for the new Minecraft and leaves the old one as it is. See [Modpacks](modpacks.md).

## What the report cannot know

- The report is about files and formats. It cannot know that a mob walks differently or a recipe book looks different in the new version: play it once.
- "Does not touch your mod" means none of the data MCSuperMods holds about the new version touches it.
- Scripts are searched for ids that went away and are not rewritten.
- A Java project you exported is yours: MCSuperMods writes notes for it and changes nothing.
- The pictures and sounds of Minecraft's own in the before and after views need that version installed. When it is not, the report says "Minecraft X is not set up on this computer, so the before (after) side uses stand-ins where it needs Minecraft's own pictures or files." Start that version once in any launcher.

## What differs per version

| What | How it follows the version |
|---|---|
| Ids and forms | Pickers, drop-downs and checks use the version's registries and data definitions. |
| Pack formats | `pack.mcmeta` gets the version's resource or data pack format; you never type a pack format. |
| File names | Pack zips are named `<project>-<target id>.zip` (and `-data.zip` for the data pack), so exports for different versions do not overwrite each other. |
| Fabric mod jar | `fabric.mod.json` names the version's Minecraft and Fabric API versions, and the nested `msm_runtime` is the build for that Minecraft version. |
| Mobs | Mobs work on both versions. 26.3 has GeckoLib; the 26.4 test version has none yet, so there the runtime draws mobs with its built-in renderer (no Molang, easings or sound and particle keyframes; see [Mob behaviours](mob-behaviours.md#choose-how-the-mob-is-drawn)). A mob whose **Renderer** is **Automatic (GeckoLib when present)** or **Built-in renderer** exports for 26.4 without GeckoLib (an info line, `export.entity-vanilla-renderer`); only a mob set to **GeckoLib only** cannot (`export.no-geckolib-target`), and **Problems** says so. |
| Java project export | **File → Export → Fabric Java project (eject)…** works for 26.3 only; for the 26.4 test version it reports `export.no-java-project-target`. |
| Preview textures | The preview uses the vanilla assets of the version's Minecraft, extracted from your own copy of the game (**Settings → Vanilla assets**). Start that version once in any launcher if they are missing. |
| Test in Minecraft | The managed test instance is named after the version, for example `MCSuperMods Test (26.3)`. |

## When 26.4 is released

When Mojang releases Minecraft 26.4, a later MCSuperMods release moves its 26.4 from the test version to the release. The id stays `mc-26.4`, so mods on it follow without a move; the status bar drops the **snapshot** badge, mobs keep using the built-in renderer until GeckoLib has a 26.4 build, when **Automatic** mobs will switch to it, and 26.4 becomes the version of new mods. Mods on 26.3 are then told that 26.4 is ready. If the release removed or renamed anything the test version had, the next check shows it in Things to fix.

The design behind this is in [ADR 0136](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/adr/0136-version-upgrades-noticed-moved-and-explained.md) (noticing, moving and explaining a newer Minecraft), [ADR 0037](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/adr/0037-second-target-mc-26.4-and-target-upgrade.md) (the second version and the first move command) and [ADR 0038](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/adr/0038-per-version-runtime-builds.md) (one `msm_runtime` build per Minecraft version).
