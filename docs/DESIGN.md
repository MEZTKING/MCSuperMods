# MCSuperMods Design

Status: Draft v1
Date: 2026-11-03 · Minecraft target: Java 26.3 "Wilderness Bound"
Scope: authoritative design for MCSuperMods (MSM); all other documents link here.

## 1. Goals and Non-Goals

MCSuperMods is a desktop application for making Minecraft Java content: resource packs, data packs, structures, worldgen, custom blocks, items and entities, and animated models. It serves complete beginners and experienced modders from the same project.

### Goals

- **Make anything possible.** Every layer of Minecraft Java customisation, from a texture swap to an animated custom mob with scripted behaviour, is reachable from one tool.
- **Two audiences, one model.** Beginners use guided "Studio" views with sensible defaults; power users edit raw JSON, write scripts and eject to Java. Both edit the same underlying elements, so switching is lossless.
- **Version-agnostic projects.** A project describes intent, not a specific game version. All version-specific facts live in target packages, so moving a project from 26.2 to 26.3 is a target switch, not a rewrite.
- **Vanilla export wherever possible.** Anything vanilla can express ships as plain resource and data packs.
- **Open plugin API.** Every built-in feature is implemented through the same public plugin API that third parties use. There are no private hooks.
- **Interoperate rather than replace.** We import Blockbench models and animations, structure `.nbt` files and Sponge `.schem` files. We use Spyglass and Misode's libraries rather than reimplementing them.

### Non-goals (v1)

| Non-goal | Reason |
|---|---|
| Bedrock Edition | Different content model and toolchain; research item post-1.0. |
| NeoForge / Forge | Architecturally possible later via a target plugin; not built in v1. |
| Minecraft versions before 26.1 | The obfuscated era doubles engine-mod work. Vanilla-only export for 1.21.x may come later via a target plugin. |
| A built-in 3D modeller | Blockbench is the modelling tool; we import its files. |
| Real-time multiplayer collaboration | Projects are git-friendly directories; collaboration happens through git. |
| Server hosting | Out of scope; we export files and launch a local test instance only. |
| Replacing Spyglass or Misode's libraries | We consume them as dependencies. |
| macOS and Linux release builds | Releases are a Windows installer only (user decision, [ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)). macOS is not planned for now; Linux builds exist only for local and CI verification and are never published. |

## 2. Users and Personas

### Personas

**Beginner Bella.** Visual thinker who has never opened a JSON file. Wants a custom ruby ore and ruby sword in her world in an afternoon. Needs templates, live 3D preview, plain-language errors and one "Test in Minecraft" button.

**Datapacker Dev.** Writes mcfunction and JSON by hand, today with Misode's generators and a text editor. Wants speed, autocomplete, project-wide validation and id refactoring.

**Modder Max.** Comfortable with Java or TypeScript, hates boilerplate. Wants to prototype quickly, script the edge cases, and eject to a real Fabric Gradle project when the mod outgrows the tool.

### Competitive landscape

| Tool | What it is | Limitation relative to MSM |
|---|---|---|
| MCreator | Desktop mod maker | Forge/NeoForge-first; generated-code lock-in; closed editor model; limited escape hatches. |
| Blockbench | Model and animation editor | Models only. A partner, not a competitor: we import `.bbmodel`. |
| Misode generators | Web forms for data pack JSON | One file at a time, no project, no assets, no mod output. We reuse Misode's `deepslate` library. |

Our differentiators: version-isolated targets, true vanilla export, an open plugin API, Blockbench interop instead of replacement, and code escape hatches (scripts, eject-to-Java) that MCreator lacks.

## 3. Architecture Overview

MSM is a **hybrid architecture**. Everything the user creates is stored as typed elements in a version-neutral intermediate representation (IR). At export time each element is **lowered** against a **target** (a specific Minecraft version) into plain files. Those files are then packaged by an **exporter**. Content vanilla can express becomes vanilla packs; content vanilla cannot express (new blocks, items, entities) becomes data-driven definitions interpreted by a generic runtime mod, `msm_runtime`.

```
+---------------------------------------------------------------+
|  App (Electron: Studio views, Raw JSON, preview, palette)     |
+---------------------------------------------------------------+
|  Plugins: element kinds, editors, importers, commands         |
+---------------------------------------------------------------+
|  Core IR: Project -> Namespace -> Element / Asset             |
|  command stack, reference index, problems                     |
+---------------------------------------------------------------+
|  Lowering: lower(element, target) -> OutputFile[]             |
+---------------------------------------------------------------+
|  Targets: mc-26.3, mc-26.2 (pack formats, mcdoc, Fabric ...)  |
+---------------------------------------------------------------+
|  Validation gate (schema model) -> Exporters                  |
+-------------------+---------------------------+---------------+
| vanilla-packs     | fabric-content-jar        | java-project  |
| .zip / folder     | jar + nested msm_runtime  | Gradle (eject)|
+-------------------+---------------------------+---------------+
```

### Content layers

| Layer | Example | Output needed |
|---|---|---|
| Resource packs | Textures, block/item models, sounds, lang | Vanilla resource pack |
| Data packs | Recipes, loot tables, advancements, tags, functions | Vanilla data pack |
| Structures | `.nbt` templates, jigsaw pools, structure sets | Vanilla data pack |
| Worldgen | Biomes, features, noise settings, dimension types | Vanilla data pack |
| Custom blocks, items, entities | Ruby ore, ruby sword, custom mob | Content jar + `msm_runtime` |
| Models and animations | Animated entity models from Blockbench | Content jar + `msm_runtime` (+ GeckoLib) |

### Why hybrid

Vanilla packs are the most portable output, so we produce them whenever possible. New registry entries need a mod. Generating Java per project would make every export a compile step and lock users into generated code. A generic runtime reading data-driven definitions keeps exports fast, keeps the project the source of truth, and still allows a one-way eject to Java (section 12).

## 4. Core Project Model (IR)

The IR lives in `@msm/core`. It knows nothing about Minecraft versions or specific element kinds; kinds are registered by plugins.

### Structure

A `Project` contains `Namespace`s; each namespace contains `Element`s and `Asset`s.

- An **element** is a typed JSON document: `{ id, kind, data, meta }`. `id` is a `ResourceLocation` (`namespace:path`), `kind` names a registered element kind, `data` is JSON typed by the kind's schema, and `meta` holds `createdAt`, `notes` and `tags`.
- An **asset** is an opaque file (`.png`, `.ogg`, `.bbmodel`, `.nbt`) referenced by project-relative path. Importers produce elements and assets, never a parallel model. Asset byte operations (import, delete) happen immediately on disk and are not undoable; changes to the `Asset` record go through undoable commands.

### Element kinds

There are two classes of element kind:

- **Vanilla kinds** map 1:1 to a data or resource pack file: `minecraft:recipe`, `minecraft:block_model`, `minecraft:biome`, and so on. Their schema comes straight from vanilla-mcdoc.
- **MSM kinds** (`msm:block`, `msm:item`, `msm:entity`, `msm:script`, ...) are higher-level. They **lower** to a set of vanilla files plus `msm/` runtime definitions at export time.

Lowering is a pure function: `lower(element, target) -> OutputFile[]`. Everything bottoms out in files, so all exporters share one pipeline: collect elements, lower against the target, validate the lowered output against the schema model, write.

### TypeScript sketch

```ts
type ResourceLocation = `${string}:${string}`;
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface Project {
  formatVersion: number;
  name: string;
  namespaces: Namespace[];
  targets: string[];          // e.g. ["mc-26.3"]
  plugins: string[];          // enabled plugin ids
  settings: Record<string, Json>;
}

interface Namespace {
  name: string;               // "mymod"
  elements: Element[];
  assets: Asset[];
}

interface Element<D extends Json = Json> {
  formatVersion: number;
  id: ResourceLocation;
  kind: string;               // "msm:block", "minecraft:recipe"
  data: D;
  meta: { createdAt: string; notes?: string; tags?: string[] };
}

interface Asset {
  path: string;               // project-relative
  mediaType: string;
}

interface OutputFile {
  path: string;               // e.g. "msm/mymod/block/ruby_ore.json"
  contents: Uint8Array | Json;
  layer: "resourcepack" | "datapack" | "msm";
}

interface ElementKind<D extends Json = Json> {
  id: string;                 // "msm:block"
  schema: string;             // mcdoc type path, resolved by @msm/schemas
  folder: string;             // kind-folder on disk, e.g. "msm/block"
  lower(element: Element<D>, target: Target): OutputFile[];
}
```

### Command stack and undo

All edits go through a command stack. A command is an Immer producer applied to the project document; Immer emits RFC 6902 JSON patches and their inverses. Undo applies the inverse patches; redo reapplies the forward patches. Patches also feed the reference index, problems panel and autosave. UI-only state (open tabs, selection, panel layout) lives in Zustand in the app and is never part of the undo history.

### References and renames

IDs are stable `namespace:path` ResourceLocations. The schema marks which fields are references (strings typed with an id registry), and `collectReferences(value, node)` in `@msm/schemas` collects them with the same walker as `validateJson`. `@msm/core` builds a **reference index** from them with `buildReferenceIndex(project, resolveSchema, textReferences?)`: for every id, which elements point at it; function bodies contribute text references by exact id-token match. A rename is an explicit refactor command, `commands.renameElement(oldId, newId, references)`, that changes the id (save moves the element file) and rewrites every referencing field and function line as one undoable command. Dangling references surface as `schema.unknown-id` and mcfunction warnings, not silent breakage ([ADR 0016](adr/0016-reference-index-and-rename.md)).

## 5. Project File Format

A project is a **directory**, designed for git: one JSON file per element, a layout mirroring Minecraft's, deterministic serialisation.

```
MyMod/
  msm.project.json                                  # formatVersion, name, namespaces, targets, plugins, settings
  content/<namespace>/<kind-folder>/<path>.json     # one element per file
  assets/<namespace>/...                            # raw binaries: textures, sounds, .bbmodel, .nbt
  scripts/<namespace>/*.ts                          # Tier-1 scripts
  .msm/                                             # cache, git-ignored: generated .d.ts, thumbnails, index, trash
```

The kind-folder is declared by the element kind: `recipe/` for `minecraft:recipe`, `msm/block/` for `msm:block`, and so on. A ruby ore block therefore lives at `content/mymod/msm/block/ruby_ore.json`. Tag kinds use `tags/<registry>/` (`content/mymod/tags/item/gems.json` for `minecraft:tag/item`). A `minecraft:function` element stores its source as `{ "lines": [...] }`, one string per line, in `content/<namespace>/function/<path>.json`, so the project stays JSON only and diffs stay line-based; it lowers to a `.mcfunction` file ([ADR 0015](adr/0015-data-pack-element-model.md)).

### Example element file

```json
{
  "data": {
    "components": {
      "msm:breakable": { "hardness": 3.0, "tool": "pickaxe", "min_tier": "iron" },
      "msm:light_emitter": { "level": 4 }
    },
    "model": "mymod:block/ruby_ore",
    "sound_type": "stone"
  },
  "formatVersion": 1,
  "id": "mymod:ruby_ore",
  "kind": "msm:block",
  "meta": {
    "createdAt": "2026-11-03T10:00:00Z",
    "notes": "Generates below y=16.",
    "tags": ["ores"]
  }
}
```

### Serialisation rules

- JSON only. No YAML, no comments.
- Two-space indentation, keys sorted on save, trailing newline. Sorted keys give stable diffs regardless of edit order.
- Binary assets are never inlined into JSON.
- `.msm/` is a disposable cache; deleting it never loses work. Removing an asset moves its bytes to `.msm/trash/<namespace>/<path>` so undo can restore them; the trash is emptied when a project is opened or created, never on save, so deleting `.msm/` loses at most the undo of asset removals ([ADR 0012](adr/0012-save-deletes-only-loaded-files.md)).
- Format version 1 is closed: unknown fields in `msm.project.json` and in element files are dropped on load. Elements whose kind no plugin registers are kept and round-trip losslessly; they are saved under `content/<namespace>/_unknown/<kind namespace>/<kind path>/`.

### Migrations

The project and each element carry `formatVersion`; `@msm/core` runs append-only migrators on load. **Target changes are not file migrations.** Moving from 26.2 to 26.3 is handled by target plugins at lowering time; for breaking cases an explicit "Upgrade project target" command rewrites affected elements and reports the changes.

## 6. Schema System (mcdoc)

We do not hand-write schemas. Vanilla file formats are described by **mcdoc**, the schema language maintained by the Spyglass project, and `SpyglassMC/vanilla-mcdoc` tracks every Minecraft release and snapshot. It is pinned by commit sha; the repository has no release tags. One tree describes many game versions through `#[since]` and `#[until]` attributes, so `@msm/schemas` filters every schema by the target's `mcVersion` ([ADR 0005](adr/0005-vanilla-mcdoc-pinning-and-loading.md)).

### Libraries

`@msm/schemas` exports our own `SchemaNode` model; Spyglass types never leak past it. This insulates the rest of the codebase from Spyglass internal API changes (section 17). It consumes the mcdoc-cli symbol export, vendored in the target package and injected into `@msm/schemas` ([ADR 0005](adr/0005-vanilla-mcdoc-pinning-and-loading.md)). Phase 1 has no Spyglass runtime dependency: `validateJson(value, node, options)` in `@msm/schemas` validates JSON against the version-gated `SchemaNode` model, live in the editor and as the export gate ([ADR 0009](adr/0009-phase1-validation-gate.md)). Phase 2 adds Spyglass for mcfunction only: the `@msm/schemas/mcfunction` subpath wraps `@spyglassmc/*` offline, fed the vendored command tree, block states and registries, and runs in the Electron main process; `validateJson` remains the JSON gate ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)). If the Spyglass JSON checker ever replaces our validator, it does so behind the same signature (section 18, question 13).

### Pins and extensions

- Each target declares one `vanilla-mcdoc` commit sha (`mcdocRef`). `tools/sync-mcdoc` regenerates the vendored symbol export in the target package; `@msm/schemas` receives it by injection.
- MSM's own kinds, components, events and actions are described in **MSM mcdoc files** under `packages/schemas/mcdoc/msm/`. These are the single source of truth: the app uses them for forms and validation, and the engine mod's definition parsing is generated from or aligned with them (Phase 4).

### Schema to form generation

The default editor for every kind is a form generated from its schema. Rules:

| mcdoc construct | Form control |
|---|---|
| `string` | Text input; with an id attribute, an autocomplete combobox. |
| Enum | Select (or segmented control for up to four values). |
| Numeric with range | Number input plus slider when bounded. |
| `boolean` | Toggle. |
| Struct | Grouped fieldset; optional fields collapsed behind "Add field". |
| List | Repeatable rows with add, remove and reorder. |
| Union | Variant picker, then the chosen variant's form. |
| Reference (registry/resource) | Autocomplete over the registry plus project elements, with "Go to definition". |
| Dispatcher (e.g. `type` fields) | Picker on the discriminator; form swaps to the dispatched schema. |

Anything the generator cannot render falls back to an inline JSON editor for that subtree.

### Registries and autocomplete

`misode/mcmeta` publishes per-version registries, block states and summaries. Each target pins an mcmeta version prefix, resolved to the tags `<version>-summary` and `<version>-registries`; `tools/sync-mcmeta` vendors the summary data in the target package ([ADR 0006](adr/0006-mcmeta-refs.md)). `@msm/schemas` loads registries for the active target and merges them with ids defined in the project, feeding autocomplete and reference validation.

### Caching

The mcdoc symbol export and mcmeta registries are vendored in each target package and injected, so schema loading needs no network and no cache. `~/.msm/cache/assets/<version>/` holds preview assets extracted from the user's client jar ([ADR 0011](adr/0011-client-jar-asset-extraction.md)); it can be deleted at any time and is rebuilt on demand.

## 7. Plugin System

Every feature beyond the core IR is a plugin. A plugin is an npm package that exports a `definePlugin` call:

```ts
export default definePlugin({
  id: "msm.blocks-items",
  apiVersion: "^1.0.0",
  contributes: {
    elementKinds: [msmBlockKind, msmItemKind],
    editors: [blockStudio],
    exporters: [],
    targets: [],
    importers: [],
    commands: [newBlockFromTemplate],
    schemas: ["mcdoc/msm/block.mcdoc"],
  },
});
```

### Contribution points

| Point | Contributes | Example |
|---|---|---|
| `elementKinds` | Kind id, schema, kind-folder, `lower()` | `minecraft:recipe`, `msm:block` |
| `editors` | React component for a kind, receiving `(element, schemaNode, commands)` | Block Studio |
| `exporters` | Packaging of `OutputFile[]` | `vanilla-packs` |
| `targets` | Version facts and migration hooks | `mc-26.3` |
| `importers` | File type to elements/assets | `.bbmodel`, `.schem` |
| `commands` | Palette entries and refactors | "New block from template" |
| `schemas` | Extra mcdoc files | MSM component definitions |

### Loading model

- **Built-in plugins** are bundled and loaded statically. They import only `@msm/plugin-api` and `@msm/schemas`.
- **Third-party plugins** (Phase 7) load from `~/.msm/plugins/` in a sandboxed context with a capability manifest (sandbox mechanism: section 18).
- **No private hooks.** Anything a built-in can do, a third-party plugin can do.

The default editor for any kind is the schema-driven form, so adding a vanilla kind requires zero UI code.

### Versioning and compatibility

`@msm/plugin-api` follows semver. Each plugin declares an `apiVersion` semver range; the loader refuses plugins whose range does not include the running API version and reports why. Breaking API changes are major versions with a migration note.

## 8. Editors and UX

### Two paths over one model

- **Beginner path: Studio views.** Curated forms over the IR with sensible defaults, live 3D preview and a "Test in Minecraft" button.
- **Power-user path.** Every element has a **Raw JSON** tab (Monaco with schema diagnostics), the command palette, scripts and eject-to-Java.

Both paths edit the same element through the same command stack, so switching between them is lossless and undo history is shared.

### Studio views by phase

| Phase | Studios |
|---|---|
| 1 | Texture Studio, Model Studio (block/item models, blockstates), Sound Studio, Lang editor, Pack settings |
| 2 | Recipe Studio, Tag editor, Function editor (Monaco + Spyglass); Loot Table and Advancement Studios are the schema form plus templates in v0.2 ([ADR 0015](adr/0015-data-pack-element-model.md)) |
| 3 | Structure Studio (import, preview, jigsaw pools), Biome Studio, Feature Studio |
| 4 | Block Studio, Item Studio |
| 5 | Entity Studio, Animation preview |
| 6 | Script editor |

### Command palette

Every plugin command is reachable from a keyboard-driven palette (create, rename, export, test, switch target), opened with Ctrl+Shift+P (`CmdOrCtrl+Shift+P`); Rename Element is F2 ([ADR 0017](adr/0017-phase2-toolchain.md)).

### Preview panel

Misode's `deepslate` renders block and item models with its own WebGL renderer ([ADR 0010](adr/0010-preview-with-deepslate.md)); later phases extend the preview to structures, worldgen and imported Blockbench entities, adding three.js only if a phase needs it. Parent models resolve through project elements, then the extracted vanilla cache (section 13), then a small set of MSM-authored fallback parents (`msm:block/cube_all`, `msm:item/generated` and others) written from scratch for preview only and never exported. Without a client jar, missing textures render as deepslate's missing-texture checker and a banner links to the Minecraft folder setting; without WebGL, the panel shows a message and the rest of the app works.

### "Test in Minecraft"

- **Phase 1:** export the resource pack and copy it into the user's `resourcepacks` folder; the user enables it in-game.
- **Phase 2:** export the data pack and copy it into a chosen world's `datapacks` folder; the user runs `/reload`.
- **Phase 4:** launch a **managed Fabric test instance** with `msm_runtime` and the current content jar installed, from inside the app.

### Error surfacing

A Problems panel lists schema violations, dangling references and lowering errors, each linked to its element and field (`elementId` plus an RFC 6901 path, or a `file` for load and export problems); function problems add a `range` within `/lines/<n>`. Schema problems are recomputed live as elements change. Schema violations are errors; unknown registry ids are warnings. Errors block export, never save; warnings block neither. Files that fail to load stay on disk as error problems until the user fixes or deletes them ([ADR 0012](adr/0012-save-deletes-only-loaded-files.md)).

## 9. Targets and Exporters

### Targets

A target is one Minecraft version's facts, packaged as `@msm/target-mc-<version>` under `packages/targets/`. No other package contains a version number.

```ts
interface Target {
  id: string;                 // "mc-26.3"
  mcVersion: string;          // "26.3"
  java: number;               // 25
  packFormats: { resource: PackFormat; data: PackFormat };
  // 26.3: resource 97.1, data 121.0 (verified 2026-11-04)
  mcdocRef: string;           // vanilla-mcdoc commit sha
  mcmetaRef: string;          // misode/mcmeta version prefix, e.g. "26.3"
  folders: {
    resource: Record<ResourceFolderKey, string>;  // vanilla folder names under assets/<ns>/ (ADR 0013)
    data: Record<DataFolderKey, string>;          // vanilla folder names under data/<ns>/ (ADR 0017)
  };
  fabric?: { loader: string; api: string; loom: string };   // required from Phase 4 (verify at implementation)
  geckolib?: string;          // required from Phase 5; 5.5+ line (verify at implementation)
  migrateFrom?(previous: Target, project: Project): MigrationReport;
}

type PackFormat = { major: number; minor: number };
```

The `Target` interface and the shared IR types it refers to live in `@msm/plugin-api` ([ADR 0008](adr/0008-ir-types-in-plugin-api.md)). The `@msm/targets` aggregator (`packages/targets/all/`) exports `builtInTargets` and `targetById(id)`, so code and tests outside `packages/targets` reach the real targets without naming a version ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)).

Support policy: the current release (26.3) and the previous one (26.2) at launch; snapshots are best-effort.

### Exporters

| Exporter | Output | Phase |
|---|---|---|
| `vanilla-packs` | Resource pack `.zip` (Phase 1), data pack `.zip`, or both zips in a folder the user picks (Phase 2; [ADR 0015](adr/0015-data-pack-element-model.md)) | 1–2 |
| `fabric-content-jar` | Jar with `assets/`, `data/`, `msm/`, `fabric.mod.json`; `msm_runtime` nested by default; GeckoLib nested when used | 4 |
| `java-project` | Standalone Gradle project with generated Java (eject) | 6 |

### Pipeline

1. **Collect** all elements in the enabled namespaces.
2. **Lower** each element against the chosen target into `OutputFile[]`.
3. **Merge** outputs; conflicts on the same path are errors.
4. **Validate** every JSON output that declares `OutputFile.schema` against the schema model derived from the target's vanilla-mcdoc and MSM mcdoc ([ADR 0009](adr/0009-phase1-validation-gate.md)), and every text output that declares `OutputFile.language` (`mcfunction`) with the injected text validator ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)).
5. **Write** via the exporter: zip, folder, jar or Gradle project. Output is deterministic (entries sorted by path, fixed zip timestamps that are identical in every timezone; [ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)), and each output includes an `msm.export.json` manifest listing target, MSM version and plugins.

### Validation gate

Step 4 is a hard gate: every lowered JSON file is validated against the schema model derived from vanilla-mcdoc, and every `.mcfunction` file with Spyglass; parse and check errors block, warnings pass. Invalid lowered output is a bug in a lowering function or target, not a user error; the export stops with a report. CI runs the same check on golden fixtures.

## 10. Engine Mod (Runtime)

`msm_runtime` is a Fabric mod (Java package `dev.mcsupermods.runtime`) that turns `msm/` definitions into real blocks, items and entities.

### Toolchain

- **Java 25**, required by Minecraft 26.1+.
- **Gradle** (current, Kotlin DSL).
- **Fabric Loom, the 26.1+ non-remapping variant** (plugin id and version: verify at implementation). Dependencies use plain `implementation`, not `modImplementation`.
- **Fabric Loader + Fabric API** for 26.3 (versions: verify at implementation).
- **Mojang names only.** 26.1+ ships unobfuscated and Fabric no longer maintains Yarn for it; we use no Yarn and no Parchment.

### The registry freeze

Minecraft registries freeze at startup. Blocks, items and entity types must be registered during mod initialisation and cannot be added on `/reload`. This constraint drives the runtime design.

### Init-time scan

During initialisation the runtime iterates `FabricLoader.getAllMods()`, calls `findPath("msm")` on each mod container and reads every `msm/**/*.json`. It accepts hand-written definitions too; it has no dependency on the app.

### Driver classes and components

Each definition is registered through a generic **driver class**: `MsmBlock`, `MsmItem` or `MsmEntity`. The driver holds a list of parsed **components** and dispatches game callbacks (use, step, break, tick, attack) to them. Behaviour is never hardcoded per definition, and the runtime does not use reflection on definitions. Definitions are parsed with Codecs aligned with the MSM mcdoc schemas.

### Frozen versus reloadable data

| Data | Where it lives | Reloadable |
|---|---|---|
| Block, item, entity definitions | `msm/` | No (registered at init) |
| Models, textures, sounds, lang | `assets/` | Yes (resource reload) |
| Loot tables, recipes, tags, advancements, functions | `data/` | Yes (`/reload`) |

Anything that can be reloadable stays in the ordinary data pack inside the content jar. For example, an `msm:block`'s drops lower to a vanilla loot table, not a runtime component.

### Distribution

The exporter produces a **content jar** whose `fabric.mod.json` depends on `msm_runtime`. By default the runtime jar is **nested** in the content jar via the `"jars"` field, so users ship one file. A "separate runtime" checkbox omits nesting for modpack makers who want one shared runtime.

### Mixin policy

Fabric API events first. Mixins only where no event exists, each with a justification comment and a GameTest covering it.

Testing uses JUnit 5 for parsing and Fabric **GameTest** for behaviour (section 16).

## 11. Behaviour Model (Components and Events)

We borrow Bedrock's proven idea: a block, item or entity definition is a bag of **components** plus **events** that chain **actions**. This gives beginners real behaviour without code.

- **Components** are named capabilities with parameters: `msm:light_emitter`, `msm:breakable`, `msm:on_interact`, `msm:food`.
- **Events** are named lists of actions, triggered by trigger components (`msm:on_interact`, `msm:on_step`) or by other events.
- **Actions** are the primitive verbs: `run_function`, `spawn_particle`, `set_block_state`, `give_item`, `play_sound`, `trigger_event`.

`run_function` calls an mcfunction in the bundled data pack, which gives beginners the full vanilla command surface for free and means the action vocabulary can stay small. Component and action vocabularies are defined once in MSM mcdoc and consumed by both the app and the runtime.

### Worked example

The `data` of an `msm:block` element for a glowing ruby ore that, when right-clicked, plays a sound, spawns particles and runs a function:

```json
{
  "components": {
    "msm:breakable": { "hardness": 3.0, "min_tier": "iron", "tool": "pickaxe" },
    "msm:light_emitter": { "level": 4 },
    "msm:on_interact": { "event": "mymod:shimmer" }
  },
  "events": {
    "mymod:shimmer": {
      "actions": [
        { "type": "play_sound", "sound": "minecraft:block.amethyst_block.chime", "volume": 1.0 },
        { "type": "spawn_particle", "particle": "minecraft:glow", "count": 12, "spread": 0.4 },
        { "type": "run_function", "function": "mymod:ruby/shimmer" }
      ]
    }
  },
  "loot": "mymod:blocks/ruby_ore",
  "model": "mymod:block/ruby_ore",
  "sound_type": "stone"
}
```

On export this lowers to `msm/mymod/block/ruby_ore.json` (the runtime definition), `assets/mymod/blockstates/ruby_ore.json` and model files, a `data/mymod/loot_table/blocks/ruby_ore.json` loot table, and the `data/mymod/function/ruby/shimmer.mcfunction` the user wrote. Exact vanilla folder names come from the target.

### Initial component list

| Phase | Area | Components |
|---|---|---|
| 4 | Blocks | `msm:light_emitter`, `msm:breakable` (hardness, tool, tier), drops via vanilla loot table, `msm:on_interact`, `msm:on_step`, `msm:redstone` (emit, react) |
| 4 | Items | `msm:food`, `msm:tool` (tier), `msm:durability`, `msm:on_use` (use actions) |
| 5 | Entities | `msm:health`, `msm:movement`, `msm:ai_goals` (vanilla goal subset: wander, look, melee attack, flee, follow), `msm:attack`, `msm:animated_model` |

A new component's MSM mcdoc and runtime implementation land in the same change.

## 12. Scripting and Escape Hatches

There are three tiers.

| Tier | Mechanism | Who it is for |
|---|---|---|
| 0 | Components + events + mcfunctions | Everyone |
| 1 | Scripts: TypeScript in the app, JavaScript in-game on Rhino | Datapacker Dev, Modder Max |
| 2 | Eject: export as a standalone Fabric Java project | Modder Max, when the mod outgrows MSM |

### Tier 1: scripts

Authors write TypeScript in `scripts/<namespace>/*.ts`. The app bundles `esbuild`, which transpiles to the ES2015 subset that **Mozilla Rhino** (ES6 mode) handles. `msm_runtime` embeds Rhino and runs the scripts in-game.

| Engine | Size | Pros | Cons | Decision |
|---|---|---|---|---|
| Rhino | ~1.5 MB | Pure Java, small, proven in Minecraft (KubeJS) | Partial ES6+ coverage | **Chosen** |
| GraalJS | ~50 MB | Modern JS, fast | Large, heavier runtime | Documented fallback |
| LuaJ | Small | Simple, sandboxable | Lua is not what users or our editors speak | Rejected |
| Kotlin script | Large | Typed, JVM-native | Compiler weight, slow start, adds Kotlin | Rejected |

### Script API sketch

```ts
import { msm } from "msm:runtime";

msm.events.on("block.interact", (e) => {
  if (e.block.id !== "mymod:ruby_ore") return;
  if (e.player.isSneaking()) {
    e.world.spawnParticle("minecraft:glow", e.pos, { count: 20 });
    e.player.give("mymod:ruby", 1);
    e.cancel();
  }
});

```

The API is a curated façade over game objects, not raw Minecraft classes.

### Typings

`.d.ts` typings are generated from the runtime API description, versioned with `msm_runtime`, and written into `.msm/` so Monaco offers completion and type checking.

### Tier 2: eject

"Export as Fabric Java project" produces a full Gradle project with generated Java sources that mirror what the runtime would have done, with no dependency on `msm_runtime`. Eject is:

- **One-way.** Edits to the generated project do not flow back into MSM.
- **Deterministic.** The same project and target produce the same sources.
- **Documented.** The generated project includes a README explaining its structure, how to build it, and that it is no longer managed by MSM.

## 13. Interop (Blockbench, NBT, Minecraft Installation)

All importers implement the plugin-api `Importer` interface and produce IR elements and assets; there is no parallel model.

### Blockbench

`.bbmodel` import:

- **Java block/item model format:** geometry and UVs become `minecraft:block_model` / `minecraft:item_model` elements plus texture assets.
- **Entity/animated format:** geometry becomes GeckoLib geo JSON and animations become GeckoLib animation JSON, referenced by an `msm:animated_model` component.

We import only documented `.bbmodel` fields and warn on unknown format versions. The original `.bbmodel` is kept as an asset and never modified.

### Structures

Structure `.nbt` (vanilla structure template) and Sponge `.schem` are read and written via `prismarine-nbt`. Imported structures become structure elements with a 3D preview and can be used in jigsaw pools.

### Minecraft installation

- **Discovery:** default `.minecraft` locations per OS: `%APPDATA%\.minecraft` on Windows, `~/Library/Application Support/minecraft` on macOS, `~/.minecraft` on Linux. Users can override the path.
- **Asset extraction:** the Electron main process reads vanilla models, blockstates, item definitions, block and item textures and `en_us` lang from `versions/<v>/<v>.jar` of the user's installed client into `~/.msm/cache/assets/<version>/` for previews, and serves them to the renderer over IPC ([ADR 0011](adr/0011-client-jar-asset-extraction.md)). The cache is keyed by the project target's `mcVersion`. Animation metadata (`.png.mcmeta`) is extracted from Phase 2: project-authored sidecars are imported beside their texture and validated against `resource:texture_meta` at export, and the preview steps through frames without interpolation (in Phase 1 animated textures previewed as their first frame). **These assets are never redistributed** and never written into exports. Tests use a synthetic jar built at test time; the repository holds no Mojang bytes.
- **Worlds:** from Phase 2 main lists worlds as `saves/<dir>/` folders containing `level.dat` and installs a data pack to `saves/<world>/datapacks/` ([ADR 0015](adr/0015-data-pack-element-model.md)).
- **Launching:** Phase 1 is manual (copy pack, user starts the game). Phase 4 adds a managed instance created with the Fabric installer and a vanilla launcher profile (verify at implementation).

We are read-only on the user's game directory, except for copying packs into `resourcepacks`/`datapacks` and managing our own instance folder.

## 14. Tech Stack

### Desktop app

We use **Electron**, not Tauri.

| Choice | Why |
|---|---|
| Electron 45 line (verified 2026-11-04; [ADR 0001](adr/0001-electron-over-tauri.md), [ADR 0004](adr/0004-phase0-toolchain.md)) | One language end to end; Chromium guarantees WebGL2 for the 3D preview (Tauri on Linux uses WebKitGTK, where WebGL is unreliable); Blockbench is Electron. |
| electron-vite, electron-builder | Build/HMR; packaging with asar. Releases are an unsigned Windows NSIS x64 installer only; a Linux `dir` build is for local and CI verification and is never published; macOS is not planned for now ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)). Auto-update deferred (section 18, question 4). |
| React 19 + TypeScript (strict), Zustand | Mainstream and typed; Zustand for UI-only state. |
| Immer + RFC 6902 patches | Command stack and undo/redo in `@msm/core`. |
| Radix primitives + Tailwind CSS | Accessible primitives; copied shadcn-style components; no runtime UI-library dependency. Icons: Lucide. |
| Monaco Editor (`monaco-editor` directly, lazy-loaded) | JSON editing with schema diagnostics in Phase 1; mcfunction and TypeScript later, with Spyglass diagnostics from Phase 2. |
| deepslate (own WebGL renderer) | 3D preview of block and item models from Phase 1; structures and worldgen later. three.js only if a later phase needs it ([ADR 0010](adr/0010-preview-with-deepslate.md)). |
| `@spyglassmc/*` (Phase 2; mcfunction, main process) | Offline mcfunction parsing, checking and completion behind `@msm/schemas/mcfunction`, loaded lazily in main; JSON stays on `validateJson` ([ADR 0009](adr/0009-phase1-validation-gate.md), [ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md), [ADR 0017](adr/0017-phase2-toolchain.md)). |
| prismarine-nbt, fflate, esbuild, zod | NBT; zip (fflate everywhere); script transpilation; IPC and config validation. |

Build and security ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)): the main build bundles the vendored target data into `out/main/vendor/` (electron-vite plugin `msm:bundle-vendored-data`), and the renderer build drops the vendored-data URLs so no vendored JSON reaches the renderer bundle; main aliases `fflate` to `fflate/browser` to avoid a `require` clash in ESM bundles. The production Content Security Policy allows scripts from `'self'` only, `style-src 'self' 'unsafe-inline'` (Monaco and Radix inject runtime styles and support no nonce) and `img-src 'self' data:` (thumbnails arrive as `data:` URLs).

### Monorepo and tooling

| Choice | Why |
|---|---|
| pnpm workspaces + Turborepo | Fast installs, task caching. |
| TypeScript project references; tsup only when publishing `@msm/plugin-api` | Enforce dependency direction; internal packages are consumed from source ([ADR 0004](adr/0004-phase0-toolchain.md)). |
| Vitest, Biome | Fast tests with golden snapshots; lint and format in one tool. |
| Node 24 (active LTS) and pnpm 12 from Phase 2; Node 22 and pnpm 10 through Phase 1 ([ADR 0004](adr/0004-phase0-toolchain.md), [ADR 0017](adr/0017-phase2-toolchain.md)) | Tooling runtime; Electron bundles its own. |

No Changesets: one developer, one version.

### Engine mod

| Choice | Why |
|---|---|
| Java 25 | Required by Minecraft 26.1+. |
| Gradle, Kotlin DSL | Fabric standard. |
| Fabric Loom (26.1+ non-remapping variant; verify at implementation) | Mojang names, no remapping. |
| Fabric Loader + Fabric API | Events over Mixins; lightweight loader. |
| GeckoLib 5.5+ (optional) | Animated entity models; base package `com.geckolib`. |
| Mozilla Rhino | Embedded scripting (section 12). |
| JUnit 5 + Fabric GameTest | Logic and in-game tests. |

### PlatformAdapter boundary

All OS access (filesystem, processes, zip, dialogs, Minecraft discovery and launch) goes through a single `PlatformAdapter` interface implemented in `app/main/`. Renderer code and packages never call Node or Electron APIs directly. This keeps `@msm/core` testable and leaves a Tauri port possible. `@msm/core` runs in the renderer; the main process implements the adapter and exposes it through a preload bridge with validated, versioned IPC channels ([ADR 0007](adr/0007-renderer-hosted-core-and-platform-adapter.md)).

### Bundle budget

Installer under 150 MB. Monaco and the 3D preview are lazy-loaded; asar packaging and dependency pruning are on by default. Size is tracked in CI from Phase 1: `tools/check-size` enforces `app.asar` at most 25 MB, the renderer output at most 8 MB and no renderer JSON file over 100 kB, and the release workflow fails a Windows installer over 150 MB. The unpacked Linux build (about 284 MB, mostly the 224 MB Electron binary) is reported only. At Phase 1 close: `app.asar` 10.2 MB, renderer 5.6 MB, Windows installer about 122 MB ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)). Phase 2 keeps the budgets; Spyglass lives only in the main bundle (about 14 MB asar expected), and `tools/check-size` also reports the main bundle size without a budget ([ADR 0017](adr/0017-phase2-toolchain.md)).

## 15. Repository Layout

```
MCSuperMods/
├── CLAUDE.md
├── README.md
├── package.json  pnpm-workspace.yaml  turbo.json  biome.json  tsconfig.base.json   (Phase 0)
├── .claude/agents/orchestrator.md  executor.md
├── docs/
│   ├── CLAUDE.md
│   ├── DESIGN.md  ROADMAP.md  DEVLOG.md
│   └── adr/
├── app/                          # @msm/app (Electron)
│   └── CLAUDE.md
├── packages/
│   ├── core/        CLAUDE.md    # @msm/core
│   ├── schemas/     CLAUDE.md    # @msm/schemas
│   ├── plugin-api/  CLAUDE.md    # @msm/plugin-api
│   ├── plugins/     CLAUDE.md    # @msm/plugin-*
│   ├── exporters/   CLAUDE.md    # @msm/exporters
│   ├── targets/     CLAUDE.md    # @msm/target-*, @msm/targets (all/)
│   └── interop/     CLAUDE.md    # @msm/interop
├── engine-mod/                   # msm_runtime (Fabric, Java 25)
│   └── CLAUDE.md
└── tools/                        # check-deps, sync-mcdoc, sync-mcmeta, new-plugin
```

Built-in plugins under `packages/plugins/`: `resourcepack/`, `datapack/`, `structures/`, `worldgen/`, `blocks-items/`, `entities/`, `models-anim/`, `scripting/`. Each is its own npm package `@msm/plugin-<name>` and depends only on `@msm/plugin-api` and `@msm/schemas`.

### Dependency direction

```
plugin-api  <-  schemas  <-  core  <-  plugins / exporters / targets / interop  <-  app
```

`@msm/plugin-api` depends on nothing internal. The `@msm/targets` aggregator sits beside the target packages and depends on them. Plugins, exporters and interop may depend on `@msm/targets` for tests only: a Biome `noRestrictedImports` override forbids it (and `@msm/target-*`) in shipped plugin and exporter source, so shipped plugins still use only `@msm/plugin-api` and `@msm/schemas` ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)). `@msm/exporters` may also use `@msm/plugin-resourcepack` and `@msm/plugin-datapack` in tests (the sample-project goldens; [ADR 0017](adr/0017-phase2-toolchain.md)); Biome forbids every `@msm/plugin-*` except `@msm/plugin-api` in exporter source, because exporters consume `OutputFile[]`, never plugins. The direction is enforced by TypeScript project references, Biome import rules and `tools/check-deps`, which checks every workspace `package.json` against a layer map and flags version literals outside `packages/targets`; it runs in `pnpm lint`, so a reverse import fails CI.

### Naming

- npm scope `@msm/*`; mod id `msm_runtime`; Java package `dev.mcsupermods.runtime`.
- Runtime definitions in jars live under `msm/`, a sibling of `assets/` and `data/`.
- Project root file: `msm.project.json`.

## 16. Testing Strategy

| Level | Tooling | What it covers |
|---|---|---|
| Unit | Vitest | IR, serialisation, migrations, patches and undo/redo, renames. |
| Lowering | Vitest golden files | Each lowering function per target, under the plugin's `test/fixtures/<target id>/expected/`; exporters add a SHA-256 golden over the sample project's zip. |
| Schema conformance | `validateJson` in CI (Spyglass checker from Phase 2 at the earliest) | Every lowered output, including golden fixtures, validated against the schema model derived from vanilla-mcdoc and MSM mcdoc. A failure is a bug. |
| mcfunction conformance | `@msm/schemas/mcfunction` over the vendored command data, in the target packages | Parse, check and lint results for known-good and known-bad commands; every exported `.mcfunction`, including the sample data pack, has zero errors ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)). |
| Engine mod logic | JUnit 5 | Definition parsing, component graph construction. |
| Engine mod behaviour | Fabric GameTest | Components and events in a running server. |
| End to end (mod) | CI headless server | From Phase 4, a "kitchen-sink" sample project is exported and loaded; load errors fail CI. |
| App | Vitest + happy-dom; Playwright for Electron | Component tests; golden-path e2e (new project, block model, texture, export zip, reopen) and smoke runs of the built and packaged app under xvfb. |

CI runs from Phase 0: Biome, type checks and unit tests on every push.

## 17. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation | Trigger to revisit |
|---|---|---|---|---|---|
| 1 | Minecraft version churn (three drops a year) | High | High | Targets package isolates version facts; mcdoc/mcmeta pinned per target; support N and N-1 only. | A release needs changes outside `packages/targets`. |
| 2 | Spyglass internal API instability | Medium | Medium | Wrap behind `@msm/schemas`; pin versions; keep a minimal own mcdoc reader as a fallback plan. | A Spyglass upgrade breaks more than `@msm/schemas`. |
| 3 | Registry freeze limits runtime registration | Medium | High | Prototype in Phase 4 week 1 before building editors; fall back to code generation (Tier 2) if dynamic registration hits limits. | Spike fails to register a block from `msm/` cleanly. |
| 4 | Scope creep ("anything possible") | High | High | MVP is resource packs only; each phase ships a usable version; non-goals written down. | A phase exceeds its estimate by 50%. |
| 5 | Shipping Mojang assets | Low | High | Never bundle; extract from the user's client jar at runtime; previews degrade gracefully. | Any export or installer contains vanilla assets. |
| 6 | GeckoLib API churn | Medium | Medium | Isolate behind the `msm:animated_model` component; MIT licence permits nesting; own minimal renderer is the fallback. | GeckoLib lags a supported target by more than one release. |
| 7 | Electron bundle size and memory | Medium | Low | 150 MB budget; asar; lazy-load Monaco and the 3D preview. | Installer exceeds budget. |
| 8 | Solo bus factor | High | High | Docs-first repo, DEVLOG per session, ADRs, CI from Phase 0. | Two sessions without a DEVLOG entry. |
| 9 | Blockbench format drift | Medium | Low | Import only documented `.bbmodel` fields; version-check and warn. | Unknown format version seen in the wild. |
| 10 | Competitor overlap (MCreator) | Medium | Medium | Differentiate: version-isolated targets, true vanilla export, open plugin API, Blockbench interop, code escape hatches. | A competitor ships equivalent vanilla export and eject. |

## 18. Open Questions

1. **Fabric Loom for 26.3:** exact plugin id and version of the non-remapping variant (verify at implementation).
2. **Rhino coverage:** whether Rhino's ES6 mode covers enough of what esbuild emits for realistic scripts, or whether we switch to GraalJS.
3. **GeckoLib versus own renderer:** whether GeckoLib remains the animated-model backend long term, given churn risk.
4. **Auto-update provider:** decided 2026-11-04: the user chose MIT and a public `MEZTKING/MCSuperMods` repository, so release builds publish to its GitHub Releases and the app updates itself with `electron-updater` using the GitHub provider. Unsigned Windows builds update fine (first install shows a SmartScreen warning). Implemented in Phase 2 ([ADR 0018](adr/0018-auto-update.md)): the installed Windows app checks a few seconds after start-up (setting "Check for updates automatically", on by default) and from Help, Check for Updates, downloads in the background and installs only when the user chooses Restart to update. The release workflow uploads the installer, its blockmap and `latest.yml` to a draft release, which the maintainer publishes by hand.
5. **Plugin sandbox mechanism:** `isolated-vm` versus an Electron utility process for third-party plugins.
6. **NeoForge:** whether to add a NeoForge target in 1.x.
7. **mcmeta branch naming:** which `misode/mcmeta` branches or refs to pin per target. Resolved: see [ADR 0006](adr/0006-mcmeta-refs.md).
8. **Electron version:** which stable Electron line to start on. Resolved: see [ADR 0001](adr/0001-electron-over-tauri.md) and [ADR 0004](adr/0004-phase0-toolchain.md).
9. **Save-time data loss:** load skipped invalid element files and save deleted `content/**/*.json` files it did not write, so saving after a failed load could delete the skipped files. Resolved: save deletes only files it loaded and is never blocked; see [ADR 0012](adr/0012-save-deletes-only-loaded-files.md).
10. **Licence:** resolved 2026-11-04 by the user: MIT for the whole repository (app, packages and the future `msm_runtime` mod), with credit through the retained copyright notice. `LICENSE` is at the repository root. Projects and packs made with MCSuperMods belong to their authors. The repository is to be made public, which unblocks auto-update via GitHub Releases (Q4).
11. **Toolchain upgrades:** when to move from pnpm 10 to pnpm 12 and `.nvmrc` from Node 22 to Node 24. Resolved: both at the start of Phase 2 (Node 24.22.2, pnpm 12.16.1); see [ADR 0017](adr/0017-phase2-toolchain.md).
12. **MSM-authored preview fallback parents:** seven parent models (`msm:block/cube`, `cube_all`, `cube_column`, `cube_bottom_top`, `cross`, `msm:item/generated`, `msm:item/handheld`) are written from scratch, used only for preview without a client jar and never exported. Decided: acceptable under "never bundle Mojang assets", pending the user's veto ([ADR 0010](adr/0010-preview-with-deepslate.md)). If vetoed, they are removed and the preview without a client jar shows only models that declare their own `elements`.
13. **Spyglass JSON checker adoption:** whether the Spyglass JSON checker replaces `validateJson` as the JSON gate. Open. Phase 2 uses Spyglass for mcfunction only ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)); revisit when loading the vendored mcdoc symbols into Spyglass for JSON and NBT inside commands proves itself.

Resolved questions become ADRs in `docs/adr/` and update this document.

## 19. Glossary

| Term | Meaning |
|---|---|
| Element | One typed JSON document in a project, identified by a ResourceLocation; stored as one file. |
| Kind | An element's type (`msm:block`), registered by a plugin with a schema and `lower()`. |
| Lowering | Pure transformation of an element into output files for a given target. |
| Target | A package holding every fact about one Minecraft version. |
| Exporter | Packages lowered output files as vanilla packs, a content jar or a Java project. |
| Component | A named, parameterised capability on a block, item or entity definition, interpreted by `msm_runtime`. |
| Event | A named list of actions triggered by a component or another event. |
| Studio | A curated beginner-friendly editor view for one area (Block Studio, Recipe Studio). |
| Runtime | `msm_runtime`, the Fabric mod that registers and drives `msm/` definitions. |
| Content jar | The exported Fabric jar with `assets/`, `data/`, `msm/` and usually a nested `msm_runtime`. |
| mcdoc | Spyglass's schema language describing Minecraft file formats; MSM extends it for its own kinds. |
| mcmeta | `misode/mcmeta`: per-version registries and block states. |
| ResourceLocation | A `namespace:path` identifier, e.g. `mymod:ruby_ore`. |
