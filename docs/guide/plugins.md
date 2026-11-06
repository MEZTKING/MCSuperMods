# Plugins

Plugins add new kinds of content to MCSuperMods: an element kind with its own form, templates for **Add element**, starters and wizards for the **New project** dialog, examples for the Examples gallery, checks that show in **Problems**, and importers for new file types. Everything MCSuperMods makes itself (resource packs, data packs, blocks and items, worldgen, mobs, scripts) is built from the same plugin API; plugins made by other people use that API too.

Plugins are code written by third parties. MCSuperMods runs each one in a sandbox, but install plugins only from sources you trust (see [Trust and the sandbox](#trust-and-the-sandbox)).

## What a plugin can and cannot add

In plugin API 1.x a plugin can contribute:

| Contribution | Where you see it |
|---|---|
| Element kinds | New elements in the element list. Their **Form** tab is drawn from the plugin's data definitions (mcdoc), like the forms of vanilla elements, and **Raw JSON** works as usual. Each kind lowers to ordinary pack or mod files when you export. |
| Element templates | Entries in **Add element**, grouped under the plugin's own categories. |
| Project starters, including wizards | Entries in the **New project** dialog; a starter with questions carries the **Wizard** badge. |
| Examples | Entries in **Help → Examples…**, to open as a new project or copy into yours. |
| Validators | Errors and warnings in **Problems**, checked while you edit. |
| Importers | New file types in **File → Import Structure…**, which picks the importer by file extension. |
| Exporters | Entries under **More exports** in the menu next to **Export .zip**, named "<exporter name> into a folder…". Each writes its files into a folder you choose; errors in the layers it packages block it, like any export. |

A plugin cannot add its own editors or Studio views, its own commands or menu entries, or new Minecraft versions. Its kinds always use the generic form. A plugin that tries to contribute editors, commands or targets still loads, with a `plugin.capability-unsupported` warning, and those parts are ignored.

## Where plugins live

Each plugin is a folder inside the plugins folder:

- Windows: `%USERPROFILE%\.msm\plugins\<folder>\`
- macOS and Linux: `~/.msm/plugins/<folder>/`

A plugin folder holds its manifest `msm-plugin.json`, its bundle (usually `main.js`) and, when it has data definitions, `symbols.json`. The folder name does not matter; the plugin's id comes from the manifest.

MCSuperMods loads plugins once, at start-up. After you add, remove or replace a plugin folder, restart MCSuperMods.

## Install a plugin

1. Open **Settings** on the toolbar (or **File → Settings…**) and scroll to **Plugins**.
2. Choose **Open plugins folder**. MCSuperMods creates the folder if it does not exist yet and opens it in your file manager.
3. Copy the plugin's folder into it. The folder must contain `msm-plugin.json` directly, not inside another folder.
4. Restart MCSuperMods and open **Settings → Plugins** again to check the plugin's state.

To remove a plugin, delete its folder and restart. Elements of a removed plugin's kinds stay in your project and are saved unchanged; **Problems** lists each with `element.unknown-kind` until you install the plugin again.

## The Plugins section in Settings

**Settings → Plugins** lists every plugin folder MCSuperMods found, with the plugin's name, version, id and one of three states:

| State | Meaning |
|---|---|
| **Loaded** | The plugin runs and its kinds, templates, starters and examples are available. Warnings, such as unsupported contributions, are listed under it. |
| **Refused** | MCSuperMods did not run the plugin: the manifest is broken, the plugin needs a different plugin API version, a file is too large, an id clashes with another plugin, or similar. The reason is listed under it. |
| **Failed** | The plugin started but stopped working: it crashed or took too long to answer. It stays unavailable until you restart MCSuperMods. |

Each reason starts with a code such as `plugin.api-incompatible`; [Troubleshooting](#troubleshooting) explains them. With no plugins installed, the section says "No plugins installed. Copy a plugin's folder into the plugins folder to add it."

## Trust and the sandbox

Every plugin runs in a sandboxed worker of its own. It cannot read or write your files, reach the network, keep data between runs, talk to other plugins or touch other projects; it only receives the elements it is asked about and returns files and problems. Each request has a time limit: two seconds to lower an element or fill a template, five seconds for checks and starters, 30 seconds for an import and two minutes for an export. A plugin that runs over its limit is stopped.

What the sandbox does not protect against: a plugin can still produce harmful content, for example a data pack whose functions do something you did not expect, exactly like any pack or mod you download. MCSuperMods checks the shape of what a plugin exports, not its intent. Install plugins only from people and places you trust, and look at what you export before you share it.

## Walk-through: the sample plugin

The MCSuperMods repository has a small sample plugin, **Greetings** (id `sample.greetings`), in [`fixtures/sample-plugin`](https://github.com/MEZTKING/MCSuperMods/tree/main/fixtures/sample-plugin). It adds a greeting element that says hello to every player when the world loads.

1. Build it from a clone of the repository: `pnpm install`, then `pnpm --filter @msm/sample-plugin build`. The build writes `dist/main.js`, `dist/symbols.json` and `dist/msm-plugin.json`.
2. Copy the contents of `dist/` into a new folder `greetings` inside the plugins folder, so that `greetings` holds the three files.
3. Restart MCSuperMods. **Settings → Plugins** lists **Greetings** 1.0.0 as **Loaded**.
4. Open or create a project with data pack content, for example from the **Data pack** starter.
5. Choose **Add element**. The **Greetings** group offers **Greeting**. Name it `hello` and choose **Create**.
6. Select the new element. The **Form** tab shows the fields `message` and `colour` from the plugin's definitions. Type a message; leave `colour` as `gold` or use another text colour name such as `aqua`, or `#rrggbb`.
7. Export the data pack (**Export .zip** arrow → **Data pack (.zip)…**). The zip holds `data/<namespace>/function/greet_hello.mcfunction` with a `tellraw @a …` line, and `data/minecraft/tags/function/load.json` lists `<namespace>:greet_hello`, so the greeting runs when the world loads.

The plugin also adds the example **Welcome greeting** to **Help → Examples…**, and a warning in **Problems** when a greeting's message is empty.

## Make your own plugin

MCSuperMods' repository includes a generator that writes a complete plugin project:

```sh
node tools/new-plugin/index.ts <name> --external <dir>
```

`<name>` is lower case (letters, digits and `-`), becomes the plugin id and the namespace of everything the plugin contributes, and cannot be `minecraft` or `msm`. `<dir>` must not exist yet. The project contains:

| File | What it is |
|---|---|
| `msm-plugin.json` | The manifest (below). |
| `src/index.ts` | The plugin: one example kind that lowers to a language file entry, and one template. |
| `mcdoc/<name>.mcdoc` | The kind's data definition, which becomes its form. |
| `scripts/build.mjs` | The build: bundles the plugin into `dist/main.js`, exports the definitions to `dist/symbols.json` and copies the manifest to `dist/`. |
| `test/plugin.test.ts` | A first test that lowers one element. |
| `package.json`, `tsconfig.json`, `README.md` | Scripts `build`, `test` and `check`; strict TypeScript without DOM or Node types, because the plugin runs in a sandbox. |

Then:

1. Download `msm-plugin-api-<version>.tgz` from the [Releases page](https://github.com/MEZTKING/MCSuperMods/releases) (every release attaches it) and add it to the project: `pnpm add -D ../msm-plugin-api-<version>.tgz`.
2. Run `pnpm test`, `pnpm check` and `pnpm build`.
3. Copy the contents of `dist/` into `~/.msm/plugins/<name>/` and restart MCSuperMods.

The plugin's code may import only `@msm/plugin-api`; the build inlines it. Node, DOM and network APIs are not available in the sandbox.

### The manifest

`msm-plugin.json` describes the plugin before any of its code runs:

| Field | Required | Meaning |
|---|---|---|
| `manifestVersion` | yes | Always `1`. |
| `id` | yes | Lower case letters, digits, `.` and `-`, starting with a letter; must not start with `minecraft.` or `msm.`. The part before the first `.` is the plugin's namespace: every kind, template, starter, example, validator, exporter, importer and data type it contributes must use it. |
| `name` | yes | The name shown in Settings. |
| `version` | yes | The plugin's own version (semver). |
| `apiVersion` | yes | The plugin API versions the plugin works with, as a semver range, for example `^1.0.0`. |
| `main` | yes | The bundle, relative to the plugin folder (at most 4 MB). |
| `schemas` | no | Data definition exports, relative to the plugin folder (each at most 8 MB). |
| `capabilities` | yes | The contribution points the plugin uses: `elementKinds`, `elementTemplates`, `projectStarters`, `examples`, `validators`, `exporters`, `importers`. A plugin that contributes something it does not list is refused. |
| `description`, `author`, `licence`, `homepage` | no | Information about the plugin; `homepage` must be an `https:` address. |

### API versions

The plugin API follows semantic versioning. Every 1.x release only adds to the API, so a plugin built for `^1.0.0` keeps working with every 1.x version of MCSuperMods; anything that removes or changes part of the API waits for 2.0, and parts due to go are marked deprecated for at least one minor release first. A plugin whose `apiVersion` range does not include the running API version is refused with `plugin.api-incompatible`.

## Troubleshooting

| Code | What it means | What to do |
|---|---|---|
| `plugin.manifest-invalid` | `msm-plugin.json` is missing, is not JSON or breaks a rule; or the bundle or a schema file named in it is missing or outside the folder. | Check the folder contains the manifest directly, and the message for the field. |
| `plugin.api-incompatible` | The manifest's `apiVersion` does not include this version of the plugin API. | Update the plugin, or MCSuperMods. |
| `plugin.too-large` | The bundle or a schema file is over its size limit. | Ask the plugin's author. |
| `plugin.reserved-namespace` | An id uses the `minecraft` or `msm` namespace. | Ask the plugin's author. |
| `plugin.capability-missing` | The plugin contributes something its manifest does not list in `capabilities`. | Ask the plugin's author. |
| `plugin.capability-unsupported` | A warning: the plugin contributes editors, commands or targets, which are ignored. | Nothing; the rest of the plugin works. |
| `plugin.refused` | Another reason the plugin was not loaded, for example an id that another plugin already uses, or data types outside the plugin's namespace. When two folders hold the same plugin, the second copy is ignored. | Remove the duplicate or the clashing plugin. |
| `plugin.crashed` | The plugin threw an error while starting, or stopped. | Restart MCSuperMods; if it repeats, report it to the plugin's author. |
| `plugin.timeout` | The plugin took too long to start or to answer, so it was stopped. | Restart MCSuperMods; if it repeats, report it to the plugin's author. |
| `plugin.unavailable` | In **Problems**: an element belongs to a plugin that has stopped working since start-up. Exports are blocked until the plugin runs again. | Restart MCSuperMods. |
| `plugin.bad-result` | A plugin function returned something MCSuperMods cannot use. | Report it to the plugin's author. |

The design behind plugins is in [ADR 0035](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/adr/0035-plugin-sandbox-and-capability-manifest.md) (sandbox and manifest) and [ADR 0036](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/adr/0036-plugin-api-1.0-and-compatibility-policy.md) (plugin API 1.0 and its compatibility policy).
