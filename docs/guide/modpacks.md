# Modpacks

A **modpack** groups your projects. Use it to keep related mods together ("my RPG pack"), to try all of them in Minecraft at once, and to hand them to players as one file that Prism Launcher or the Modrinth app installs in a few clicks.

Each project stays in its own folder and stays an ordinary project: you open and edit it as before. A modpack only lists the project folders, so one project can be in several modpacks, and a change to a project shows up in every modpack it is in.

## Open the Modpacks dialog

Choose **File → Modpacks…**, or "Modpacks…" in the command palette (Ctrl+Shift+P). No project needs to be open.

The left side lists the modpacks MCSuperMods knows about. Select one to see its details on the right.

- **New modpack…** asks for a new, empty folder and makes the modpack there. The modpack's own file is `msm.modpack.json`; keep it next to your projects or anywhere you like.
- **Add existing modpack…** adds a modpack folder made earlier, for example one you copied from another computer.
- **Forget this modpack** removes it from the list. Its folder and the projects are not deleted.

## Details

- **Name**, **Version** and **Summary** describe the modpack. The version is free text such as `1.0.0`; it becomes part of the exported file's name.
- **Minecraft version** is the version every project in the modpack must be made for. A project made for another version is marked "made for …"; open it and use **Upgrade Project Target** ([Minecraft versions](targets.md)), or change the modpack's version.

Changes are saved when you leave a field.

## Projects

- **Add open project** adds the project you have open.
- **Add project folder…** adds any project folder.
- **Open** opens a project in the window (it asks first if your open project has unsaved changes).
- **Remove** takes a project out of the modpack; the project itself is not changed.

Every project becomes one mod. Two projects in one modpack must not use the same mod id (the id in their **Mod** element, or the one made from the project name).

## Mods from Modrinth

A modpack can include mods other people made, from [Modrinth](https://modrinth.com). Type the project's name as it appears in its Modrinth address (for example `sodium` from `modrinth.com/mod/sodium`), or paste the whole link, and choose **Add mod**. MCSuperMods picks the newest version made for Fabric and the modpack's Minecraft version and remembers that exact file.

If the mod needs other mods, the message names their Modrinth projects: add those too. Fabric API is always included, so you never need to add it. **Remove** takes a mod out again.

## Export modpack (.mrpack)…

**Export modpack (.mrpack)…** builds every project's mod jar and saves `<name>-<version>.mrpack`. Nothing is written when a project has errors, is missing, is made for another Minecraft version, or clashes with another project's mod id: the problems are listed under the buttons.

To install the file:

- **Prism Launcher**: **Add Instance**, **Import**, then choose the `.mrpack` file.
- **Modrinth app**: drag the file onto the app, or use its import option.

Both download Fabric Loader, Fabric API and your Modrinth mods by themselves. They warn that some files do not come from Modrinth: those are your own mods, which are inside the file. Accept the warning to continue.

## Test modpack in Minecraft

**Test modpack in Minecraft** builds every project's jar and installs them, Fabric API and the Modrinth mods into the game location Test in Minecraft uses ([Blocks and items, Test in Minecraft](blocks-and-items.md#test-in-minecraft)), then starts the launcher when it can. Modrinth mods are downloaded once and checked against the file that was added; later tests reuse them.

Mods an earlier test installed that are not in this modpack (for example a project you tested on its own) are removed first, so the game runs exactly the modpack. Mods you put into the `mods` folder yourself are never touched.

## Troubleshooting

| Message | What to do |
|---|---|
| "… is made for … but the modpack is for …" | Upgrade the project, or change the modpack's **Minecraft version**. |
| "… has N error(s) …" | Open the project, fix the errors shown in **Problems**, save, and try again. |
| "… both use the mod id …" | Give one project another mod id in its **Mod** element. |
| "the project folder was not found" | The project was moved or deleted: **Remove** it and add it again from its new folder. |
| "… has no Fabric version for Minecraft …" | That mod is not available for this Minecraft version yet. |
| "… does not match its pinned checksum" | The download was damaged or changed: remove the mod and add it again. |
