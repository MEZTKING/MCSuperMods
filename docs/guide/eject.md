# Eject to a Java project

**Export Java project** turns a project's blocks, items and mobs into a standalone Fabric mod written in Java: a Gradle project with generated source code that builds into a mod jar of its own. The ejected mod does not need `msm_runtime`; it does what the runtime does with the same content, in plain Fabric code you can read and change.

## When to eject

Keep working in MCSuperMods while it can express what you want: the Fabric mod jar export is simpler to share, and the project stays editable in the Studios. Eject when you outgrow it:

- you want behaviour that neither components, events nor [scripts](scripting.md) can express, and are ready to write Java;
- you want to publish a mod that depends only on Fabric API (and GeckoLib for mobs), not on `msm_runtime`;
- you want to learn how Fabric mods work, starting from code that already works.

Ejecting is **one-way**. The Java project is yours: edits you make there never come back into MCSuperMods, and exporting again writes a new project instead of updating the old one. Keep the MCSuperMods project if you may want to change the content there later.

## Export the Java project

1. Open the project. Fix any errors in **Problems** first: errors block this export, as they block the Fabric mod jar.
2. Open the arrow next to **Export .zip** on the toolbar and choose **Fabric Java project (eject)…**, or use **File → Export Java Project…**, or "Export Java project…" in the command palette (Ctrl+Shift+P).
3. The **Export Java project** dialog says what the export writes: "Writes a standalone Fabric Gradle project with generated Java into a new folder. It does not depend on msm_runtime. Edits you make there do not come back into MCSuperMods. Scripts are not included." When the project has scripts, it lists them ("This script is not included in the Java project: <id>.").
4. Choose **Choose folder…** and pick a folder (the folder picker is titled "Export Java project: choose a folder"). MCSuperMods writes the project into a new folder named after the mod id inside it, for example `<picked folder>/ruby_ore/`.
5. When it is done, the status bar says "Java project written to <path>"; **Reveal** opens the folder.

The mod id's folder must not exist yet, or must be empty. Otherwise nothing is written and the export says "The folder <path> already exists and is not empty." Pick another folder, or move the old project away first.

## What the project contains

| Path | Contents |
|---|---|
| `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties` | The Gradle build, with Fabric Loom and the Minecraft, Fabric Loader and Fabric API versions of the project's target |
| `gradlew`, `gradlew.bat`, `gradle/wrapper/` | The Gradle wrapper, so you do not need to install Gradle |
| `src/main/java/<mod id>/` | The generated Java: the mod class, `ModBlocks.java`, `ModItems.java`, `ModEntities.java` and `ModEffects.java` (one constant per block, item, entity type and status effect), `ModSounds.java` (one registered sound event per key of the project's `sounds.json`), classes for content with behaviour under `block/`, `item/`, `entity/` and `effect/`, one `ThrownItemEntity.java` that every throwable uses, the event actions in `Actions.java`, `ModWorldgen.java` and `ModLoot.java` for [additions to vanilla](adding-to-vanilla.md) (world additions through Fabric's biome modifications, extra drops in a loot table listener), `TickLimiter.java` and `CooldownMap.java` for the repeating [triggers](blocks-and-items.md#triggers), and for mobs or throwables the client entrypoint (GeckoLib models under `client/` only with mobs) |
| `src/main/resources/fabric.mod.json` | The mod metadata from the `msm:mod` element, depending on Fabric Loader, Fabric API, Minecraft and, with mobs, GeckoLib (not on `msm_runtime`) |
| `src/main/resources/assets/`, `data/` | The project's models, textures, language files, loot tables, recipes, functions and other pack files, unchanged |
| `README.md` | How to build the project, its layout, and what was left out |
| `LICENSE-NOTES.md` | The licences of the libraries and tools the project uses |
| `msm.export.json` | Which MCSuperMods version and target produced the project |

The Java package is the mod id (with `-` written as `_`). Files that do not apply to the project (for example `ModEntities.java` without mobs, `ModSounds.java` without sounds of your own, `ModEffects.java` without [status effects](effects-and-throwables.md), `ModWorldgen.java` without world additions, `ModLoot.java` without extra drops) are not written. The output depends only on the project, the target and the MCSuperMods version, so exporting the same project twice gives identical files.

## Build it

You need **JDK 25** (for example Eclipse Temurin 25). Open a terminal in the project folder and run:

```
./gradlew build
```

On Windows, run `gradlew.bat build`. The first build downloads Gradle, Fabric Loom, Minecraft and Fabric API, which takes a few minutes and needs an internet connection; later builds are quick. The mod jar is `build/libs/<mod id>-<version>.jar`. Put it with Fabric API (and GeckoLib, unless it is nested; see below) into the `mods` folder of a Fabric game for the same Minecraft version, as described in [Install the mod in a Fabric game](blocks-and-items.md#install-the-mod-in-a-fabric-game).

Any Java IDE that opens Gradle projects (IntelliJ IDEA, Eclipse, Visual Studio Code with the Java extensions) can open the folder. Fabric's own documentation explains how to run the game from the IDE and how to go further.

## What is not included

- **Scripts.** `msm:script` elements and every `run_script` action are left out, so the behaviour they add is missing from the ejected mod. The export reports one warning per script ("Script <id> is not ejected; the Java project does without it (see its README)."), and the project's `README.md` lists them under **Scripts**. Port them to Java by hand if you need them.
- **The MCSuperMods project itself.** The `msm/` definitions do not appear in the output; the Java code replaces them.

Resource and data pack content (models, textures, recipes, loot tables, functions, structures, worldgen) is copied as it is and works as before.

The additions and triggers behave as with the `msm_runtime` mod: world additions apply when a world opens and reach new chunks only, extra drops skip a loot table that a world's data pack replaces and come back after `/reload` without doubling, the triggers keep the 5-tick minimum and the shared limit of 2,000 firings per server tick, and fuel and compost are item components that need no code. Villager trades are data and are copied with the rest.

## GeckoLib and licences

A project with mobs uses GeckoLib for their models and animations. The ejected project depends on GeckoLib from the Modrinth Maven, and the build nests it in the mod jar (jar-in-jar), so players do not need to install it. Loom prints a line that GeckoLib's version "is not valid semver" while building; that line is harmless.

`LICENSE-NOTES.md` lists the licences: Fabric Loader and Fabric API (Apache 2.0), Fabric Loom (MIT, build only), the Gradle wrapper (Apache 2.0) and GeckoLib (MIT). Minecraft itself is downloaded by Loom at build time under the Minecraft EULA and is not part of the project or of the built jar. The generated sources carry no licence of their own: choose one for your mod (the `license` field of `fabric.mod.json` comes from the `msm:mod` element).

## Troubleshooting

| Problem | What to do |
|---|---|
| The export says "The folder <path> already exists and is not empty." | Pick another folder, or move or delete the old project first. |
| The export is greyed out with "Fix 1 error first (see Problems)." | Fix the errors in **Problems**; warnings do not block it. |
| The build says the Java version is wrong | Install JDK 25 and make sure `java -version` prints 25 in the same terminal (or set `JAVA_HOME`). |
| The build cannot download anything | The first build needs an internet connection; run it again once you are online. |
| `./gradlew: Permission denied` (macOS, Linux) | Run `chmod +x gradlew` once, or start it as `sh gradlew build`. |
| A block, item or mob behaves differently from the Fabric mod jar export | It should not: CI builds the ejected sample projects and runs the same behaviour tests on both jars. Please report it with the project. |
| Something a script did is missing in the game | Scripts are not ejected; port them to Java (see [What is not included](#what-is-not-included)). |
