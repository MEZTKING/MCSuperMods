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

- An **element** is a typed JSON document: `{ id, kind, data, meta }`. `id` is a `ResourceLocation` (`namespace:path`), unique across all kinds of a project (so linked worldgen elements such as a configured and a placed feature carry distinct ids), `kind` names a registered element kind, `data` is JSON typed by the kind's schema, and `meta` holds `createdAt`, `notes` and `tags`.
- An **asset** is an opaque file (`.png`, `.ogg`, `.bbmodel`) referenced by project-relative path. Importers produce elements and assets, never a parallel model. Asset byte operations (import, delete) happen immediately on disk and are not undoable; changes to the `Asset` record go through undoable commands.

### Element kinds

There are two classes of element kind:

- **Vanilla kinds** map 1:1 to a data or resource pack file: `minecraft:recipe`, `minecraft:block_model`, `minecraft:worldgen/biome`, and so on. Their schema comes straight from vanilla-mcdoc. Kind ids follow the registry names (`minecraft:worldgen/<registry>`, `minecraft:dimension`), and a kind may name its registry explicitly with `ElementKind.registry` ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)).
- **Structure templates** (`minecraft:structure_template`) are vanilla kinds stored as JSON, not as opaque `.nbt` assets: size, a block-state palette, block tuples, SNBT block-entity and entity data, and the jigsaw blocks lifted into a typed list, so rename and validation reach their jigsaw pools. They lower to binary `.nbt` files ([ADR 0021](adr/0021-structure-templates-and-nbt.md)).
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

IDs are stable `namespace:path` ResourceLocations. The schema marks which fields are references (strings typed with an id registry), and `collectReferences(value, node)` in `@msm/schemas` collects them with the same walker as `validateJson`. `@msm/core` builds a **reference index** from them with `buildReferenceIndex(project, resolveSchema, textReferences?)`: for every id, which elements point at it, including object keys that are ids (`Reference.key`); function bodies contribute text references by exact id-token match, with the empty registry because a token in command text is not typed. Ids under `#[id(path=...)]` are indexed with the path prefix (`minecraft:entity/banner/creeper` for `creeper`); `collectReferences` also reports the unprefixed `written` form. A rename is an explicit refactor command, `commands.renameElement(oldId, newId, references)`, that changes the id (save moves the element file) and rewrites every referencing field and function line as one undoable command. Dangling references surface as `schema.unknown-id` and mcfunction warnings, not silent breakage ([ADR 0016](adr/0016-reference-index-and-rename.md)).

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

`@msm/schemas` exports our own `SchemaNode` model; Spyglass types never leak past it. This insulates the rest of the codebase from Spyglass internal API changes (section 17). It consumes the mcdoc-cli symbol export, vendored in the target package and injected into `@msm/schemas` ([ADR 0005](adr/0005-vanilla-mcdoc-pinning-and-loading.md)). Phase 1 has no Spyglass runtime dependency: `validateJson(value, node, options)` in `@msm/schemas` validates JSON against the version-gated `SchemaNode` model, live in the editor and as the export gate ([ADR 0009](adr/0009-phase1-validation-gate.md)). Phase 2 adds Spyglass for mcfunction only: the `@msm/schemas/mcfunction` subpath wraps `@spyglassmc/*` offline, fed the vendored command tree, block states and registries, and runs in the Electron main process; `validateJson` remains the JSON gate ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)). The app also gives the service the vendored mcdoc symbols, so text components, item components and NBT inside commands are type-checked and completed (`@spyglassmc/json` and `@spyglassmc/nbt`); MSM checks block-state properties inside commands itself, because Spyglass parses them but does not check them. If the Spyglass JSON checker ever replaces our validator, it does so behind the same signature (section 18, question 13).

### Pins and extensions

- Each target declares one `vanilla-mcdoc` commit sha (`mcdocRef`). `tools/sync-mcdoc` regenerates the vendored symbol export in the target package; `@msm/schemas` receives it by injection.
- Before MSM mcdoc arrived in Phase 4, MSM-owned shapes were TypeScript `SchemaNode` extensions in `@msm/schemas` behind built-in refs: `msm:function` (`{ lines: string[] }`, [ADR 0015](adr/0015-data-pack-element-model.md)) and `msm:structure_template` (the structure template JSON, with `jigsaws[*].pool` typed as a `worldgen/template_pool` id and block-entity NBT as SNBT strings, [ADR 0021](adr/0021-structure-templates-and-nbt.md)). These two remain; compiled MSM mcdoc can replace them behind the same refs later.
- MSM's own kinds, components, events and actions are described in **MSM mcdoc files** under `packages/schemas/mcdoc/msm/`. These are the single source of truth: the app uses them for forms and validation, and the engine mod's Codecs are aligned with them through a shared conformance corpus. `tools/build-msm-mcdoc` exports them into a checked-in `symbols.json` that `createSchemaIndex` merges with the target's vanilla symbols ([ADR 0025](adr/0025-msm-definition-format-v1.md) D7).

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

`misode/mcmeta` publishes per-version registries, block states and summaries. Each target pins an mcmeta version prefix, resolved to the tags `<version>-summary` and `<version>-registries`; `tools/sync-mcmeta` vendors the summary data in the target package ([ADR 0006](adr/0006-mcmeta-refs.md)). `@msm/schemas` loads registries for the active target and merges them with ids defined in the project, feeding autocomplete and reference validation. A string under `#[id(path=...)]` keeps that prefix as `idPath` on its `SchemaNode`: the value is written unprefixed (`creeper`) and looked up as `ns:<idPath>name` (`minecraft:entity/banner/creeper`); completions strip and apply the prefix. `minecraft:`-prefixed ids are accepted wherever unprefixed ones are.

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
| `exporters` | Packaging of `OutputFile[]` | `vanilla-packs`; `structure-nbt`, `sponge-schematic` (`msm.structures`) |
| `targets` | Version facts and migration hooks | `mc-26.3` |
| `importers` | File type to elements/assets; the host picks one by file extension and inserts the result as one undo step | `.bbmodel`; `.nbt`, `.schem` (`msm.structures`) |
| `commands` | Palette entries and refactors | "New block from template" |
| `schemas` | Extra mcdoc files | MSM component definitions |
| `elementTemplates` | Entries of the New element picker for the plugin's own kinds: id, kind, category, name hints and a pure `data(context)` | "Shaped recipe", "Block model (cube all)" |
| `projectStarters` | New project starters: a category, layer badges, `requiresKinds` and `build(context)` returning a content bundle | "Custom ore", "Recipe pack" |
| `examples` | Examples gallery entries: the kind taught, category, tags, `requiresKinds` and a commented content bundle | "Loot table: block drops" |
| `validators` | Cross-element checks over the whole project: an id, the kinds read and a pure `validate(input)` returning problems; the host re-runs them when those kinds change and merges the problems ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)) | Feature order across biomes, structure set spacing |

Templates, starters and examples live in plugins; the app is only the picker. A template creates one element of a kind its own plugin registers and references only vanilla ids, ids derived from its own id, or the project root advancement. A starter or example builds a self-contained content bundle (elements with optional `meta.notes`, plus generated assets, never Mojang assets) that may span any registered kinds; the host adds a `pack` element when the bundle has none and inserts the elements as one undo step. The resource-pack, data-pack, structures and worldgen plugins carry the templates for their kinds (99 in total after Phase 3); the built-in `@msm/plugin-library` (`msm.library`) carries the starters, the examples and the placeholder-texture generator ([ADR 0020](adr/0020-templates-starters-examples.md)).

Phase 3 adds two built-ins ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)): `@msm/plugin-structures` (`msm.structures`: structure templates, template pools, structures, structure sets and processor lists, with the `.nbt` and `.schem` importers and exporters of [ADR 0021](adr/0021-structure-templates-and-nbt.md)) and `@msm/plugin-worldgen` (`msm.worldgen`: biomes, configured and placed features, dimensions, world presets and nine schema-form worldgen kinds). Both contribute validators; `@msm/plugin-datapack` adds the worldgen tag kinds and keeps `minecraft:dimension_type`.

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
| 2 | Recipe Studio, Tag editor, Function editor (Monaco + Spyglass); Loot Table and Advancement Studios are the schema form plus templates in v0.2 ([ADR 0015](adr/0015-data-pack-element-model.md)); New project starters and the Examples gallery (add-on, [ADR 0020](adr/0020-templates-starters-examples.md)) |
| 3 | Structure Studio (size, palette, jigsaw table, "Replace from file…", structure exports), Template Pool Studio (pieces table, Connections panel with each jigsaw's target pool marked project, vanilla or missing, "Used by"), Biome Studio (climate, colour pickers, feature lists per decoration step named from the target, spawners), Feature Studio as the Placed Feature Studio (feature picker, ordered placement modifiers, "Used in"); configured features and the other worldgen kinds are the schema form plus templates. Studios register per area (`studios/<area>/studios.tsx`) instead of in one shared file ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)) |
| 4 | Block Studio, Item Studio |
| 5 | Entity Studio, Animation preview |
| 6 | Script editor |

### Templates, starters and examples

Content comes from plugins ([Plugin System](#7-plugin-system)); the app only presents it ([ADR 0020](adr/0020-templates-starters-examples.md)).

- **New element.** The picker groups templates under category headings (Models, Blockstates, Recipes, Loot tables, Tags and so on) and has a filter box. Every built-in kind has at least one template with starting content that validates against the current target; a third-party kind without templates gets a generic entry built from its `defaultData`.
- **New project.** Toolbar "New" and File > New Project… still create a blank project directly. The split arrow on "New", File > New Project from Starter… and the palette open the New project dialog, which lists starters grouped as blank, pack and content, with layer badges; submitting asks for an empty folder and builds the starter there with the namespace derived from the folder name. Since Phase 4 the Custom ore starter is a real `msm:block` ruby ore with its item, loot table, recipes and `msm:mod` element, exported as a Fabric mod jar (before Phase 4 it reskinned emerald ore).
- **Examples gallery.** Help > Examples… and the palette open a gallery of one commented example per built-in kind plus the content starters, with search over title, kind, category and tags, a kind filter and a detail pane showing the notes. "Open as new project" builds the example into a new folder; "Copy into my project" adds it to the open project under a chosen namespace as one undo step, reporting ids that already exist.
- **Notes callout.** An element with `meta.notes` (every copied example) shows them in a collapsible, read-only Notes callout above its editor.

### Command palette

Every plugin command is reachable from a keyboard-driven palette (create, rename, export, test, switch target), opened with Ctrl+Shift+P (`CmdOrCtrl+Shift+P`); Rename Element is F2 ([ADR 0017](adr/0017-phase2-toolchain.md)).

### Preview panel

Misode's `deepslate` renders block and item models with its own WebGL renderer ([ADR 0010](adr/0010-preview-with-deepslate.md)); later phases extend the preview to structures, worldgen and imported Blockbench entities, adding three.js only if a phase needs it. Parent models resolve through project elements, then the extracted vanilla cache (section 13), then a small set of MSM-authored fallback parents (`msm:block/cube_all`, `msm:item/generated` and others) written from scratch for preview only and never exported. Without a client jar, missing textures render as deepslate's missing-texture checker and a banner links to the Minecraft folder setting; without WebGL, the panel shows a message and the rest of the app works.

From Phase 3 ([ADR 0023](adr/0023-structure-and-climate-previews.md)) the panel has two more modes. **Structure mode** (`previewKind: 'structure'`) renders a structure template with deepslate's `StructureRenderer`, a grid and an orbit camera fitted to its size, preparing resources for every palette block through the same model chain; block entities, entities and biome tints are not drawn. The **climate map** (`previewKind: 'climate_map'`, for dimensions and world presets with an explicit `multi_noise` biome source) is a 2D canvas outside the WebGL gate: two of the six climate parameters on the axes, sliders for the rest, each cell coloured by the biome `Climate.Parameters.find` selects. A noise-sampled biome or terrain map is not built in v0.3 ([Open Question 15](#18-open-questions)).

### "Test in Minecraft"

- **Phase 1:** export the resource pack and copy it into the user's `resourcepacks` folder; the user enables it in-game.
- **Phase 2:** export the data pack and copy it into a chosen world's `datapacks` folder; the user runs `/reload`.
- **Phase 4:** File > "Test in Minecraft…" (also in the Export menu and the palette) installs the current content jar, with `msm_runtime` nested, into a Fabric location and launches Prism or MultiMC, or creates a managed Prism test instance ([Interop](#13-interop-blockbench-nbt-minecraft-installation)).

### Error surfacing

A Problems panel lists schema violations, dangling references and lowering errors, each linked to its element and field (`elementId` plus an RFC 6901 path, or a `file` for load and export problems); function problems add a `range` within `/lines/<n>`. Schema problems are recomputed live as elements change. From Phase 3, plugin project validators ([Plugin System](#7-plugin-system)) run after the schema checks, debounced, and their problems (codes `<area>.<check>`, such as `worldgen.feature-order`) join the same list with the same severity rules. Schema violations are errors; unknown registry ids are warnings. Errors block export of the layers their elements lower to (an error in a resource-pack element leaves the data pack exportable), never save; warnings block neither. Files that fail to load stay on disk as error problems until the user fixes or deletes them ([ADR 0012](adr/0012-save-deletes-only-loaded-files.md)).

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
  dataVersion: number;        // world data version written into structure .nbt files; 26.3: 5023 (from vendored mcmeta)
  folders: {
    resource: Record<ResourceFolderKey, string>;  // vanilla folder names under assets/<ns>/ (ADR 0013)
    data: Record<DataFolderKey, string>;          // vanilla folder names under data/<ns>/ (ADR 0017);
                                                  // Phase 3 adds structure, dimension and worldgen (parent of worldgen/<registry>)
  };
  worldgen: {
    featureSteps: readonly string[];              // decoration steps in order (ADR 0022)
    biomeAttributes?: BiomeAttributeFacts;       // biome attribute ids: colours, sky colour, natural mob spawns (26.3)
  };
  fabric?: { loader: string; api: string; loom: string; minecraftDependency: string };
                              // Phase 4 (ADR 0027); 26.3: loader 0.20.1, API 0.165.2+26.3, Loom 1.19.3, "~26.3" (verified 2026-11-05)
  geckolib?: string;          // required from Phase 5; 5.5+ line (verify at implementation)
  migrateFrom?(previous: Target, project: Project): MigrationReport;
}

type PackFormat = { major: number; minor: number };
```

`folders.data.worldgen` is the parent folder of `worldgen/<registry>`, as `tags` is of `tags/<registry>`; a kind passes the registry as the subfolder, so a future rename (26.3 renamed `worldgen/configured_feature` to `worldgen/feature` and `worldgen/configured_carver` to `worldgen/carver`) changes only the target ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)). The `Target` interface and the shared IR types it refers to live in `@msm/plugin-api` ([ADR 0008](adr/0008-ir-types-in-plugin-api.md)). The `@msm/targets` aggregator (`packages/targets/all/`) exports `builtInTargets` and `targetById(id)`, so code and tests outside `packages/targets` reach the real targets without naming a version ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)).

Support policy: the current release (26.3) and the previous one (26.2) at launch; snapshots are best-effort.

### Exporters

| Exporter | Output | Phase |
|---|---|---|
| `vanilla-packs` | Resource pack `.zip` (Phase 1), data pack `.zip`, or both zips in a folder the user picks (Phase 2; [ADR 0015](adr/0015-data-pack-element-model.md)) | 1–2 |
| `fabric-content-jar` | Jar with `assets/`, `data/`, `msm/`, `fabric.mod.json`; `msm_runtime` nested by default, or left out with the "Separate runtime (for modpacks)" option ([ADR 0026](adr/0026-fabric-content-jar.md)); GeckoLib nested when used (Phase 5) | 4 (exists) |
| `java-project` | Standalone Gradle project with generated Java (eject) | 6 |

The content jar exporter lives in `@msm/exporters` (`src/fabric-content-jar/`), writes the same deterministic zip as the packs, takes its Fabric facts from `Target.fabric` and receives the runtime jar bytes from its host (`createFabricContentJarExporter({ loadRuntimeJar })`), so it has no file access. Exporters declare boolean options that the export dialog renders ([ADR 0027](adr/0027-plugin-api-0.6.md)). Files several elements contribute to (language files, tags) declare `OutputFile.merge` and are merged in step 3; other files meeting at one path are conflicts.

### Pipeline

1. **Collect** all elements in the enabled namespaces.
2. **Lower** each element against the chosen target into `OutputFile[]`.
3. **Merge** outputs: files that declare `merge` (`tag`, `object`) are combined; any other files on the same path are conflicts and errors ([ADR 0027](adr/0027-plugin-api-0.6.md)).
4. **Validate** every JSON output that declares `OutputFile.schema` against the schema model derived from the target's vanilla-mcdoc and MSM mcdoc ([ADR 0009](adr/0009-phase1-validation-gate.md)), and every text output that declares `OutputFile.language` (`mcfunction`) with the injected text validator ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)).
5. **Write** via the exporter: zip, folder, jar or Gradle project. Output is deterministic (entries sorted by path, fixed zip timestamps that are identical in every timezone; [ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)), and each output includes an `msm.export.json` manifest listing target, MSM version and plugins.

### Validation gate

Step 4 is a hard gate: every lowered JSON file is validated against the schema model derived from vanilla-mcdoc, and every `.mcfunction` file with Spyglass; parse and check errors block, warnings pass. Invalid lowered output is a bug in a lowering function or target, not a user error; the export stops with a report. CI runs the same check on golden fixtures. A struct with dispatcher spreads accepts a key only when the struct or one of its resolved spreads declares it, and reports any other key as `schema.unknown-field`; when a spread cannot be resolved to fields (an `any` member, an unknown dispatch key), every key is allowed. Project texture animation sidecars (`.png.mcmeta`) pass the same gate as `resource:texture_meta`. Binary outputs (structure `.nbt`) carry no schema; their element is validated before lowering. Project validators ([Plugin System](#7-plugin-system)) gate export through the problem list: an error from a validator blocks export like a schema error ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)).

## 10. Engine Mod (Runtime)

`msm_runtime` is a Fabric mod (Java package `dev.mcsupermods.runtime`) that turns `msm/` definitions into real blocks, items and entities.

### Toolchain

Verified on 2026-11-05 ([ADR 0024](adr/0024-runtime-registration-spike.md)):

- **Java 25**, required by Minecraft 26.1+.
- **Gradle 9.8.2** (wrapper, Kotlin DSL).
- **Fabric Loom, the 26.1+ non-remapping variant**: plugin id `net.fabricmc.fabric-loom`, release 1.19.3. Minecraft is `com.mojang:minecraft:26.3` with no mappings line; dependencies use plain `implementation`, not `modImplementation`.
- **Fabric Loader 0.20.1 and Fabric API 0.165.2+26.3** for 26.3; the same facts live in the target's `fabric` block for the exporter.
- **Mojang names only.** 26.1+ ships unobfuscated and Fabric no longer maintains Yarn for it; we use no Yarn and no Parchment.
- **Fabric API modules used:** creative tabs through `fabric-creative-tab-api-v1` (`CreativeModeTabEvents.modifyOutputEvent`, keys built with `ResourceKey.create(Registries.CREATIVE_MODE_TAB, id)`); GameTests through `fabric-gametest-api-v1` (annotation `net.fabricmc.fabric.api.gametest.v1.GameTest`, entry point `fabric-gametest`, Loom `fabricApi { configureTests {} }`, task `runGameTest`, which `./gradlew build` runs). `Block.Properties` and `Item.Properties` need `setId(ResourceKey)` before construction.

### The registry freeze

Minecraft registries freeze at startup. Blocks, items and entity types must be registered during mod initialisation and cannot be added on `/reload`. This constraint drives the runtime design.

### Init-time scan

During initialisation the runtime iterates `FabricLoader.getAllMods()`, calls `findPath("msm")` on each mod container and reads every `msm/**/*.json`. It accepts hand-written definitions too; it has no dependency on the app.

### Driver classes and components

Each definition is registered through a generic **driver class**: `MsmBlock`, `MsmItem` or `MsmEntity` (Phase 5). The driver holds a list of parsed **components** and dispatches game callbacks (use, step, break, tick, attack) to them. Behaviour is never hardcoded per definition, and the runtime does not use reflection on definitions. Definitions are parsed with Codecs aligned with the MSM mcdoc schemas (strict JSON types; a shared conformance corpus is checked by both the app's `validateJson` and the runtime's JUnit tests). The definition format v1 and the runtime's load rules are in [ADR 0025](adr/0025-msm-definition-format-v1.md).

### Frozen versus reloadable data

| Data | Where it lives | Reloadable |
|---|---|---|
| Block, item, entity definitions | `msm/` | No (registered at init) |
| Models, textures, sounds, lang | `assets/` | Yes (resource reload) |
| Loot tables, recipes, tags, advancements, functions | `data/` | Yes (`/reload`) |

Anything that can be reloadable stays in the ordinary data pack inside the content jar. For example, an `msm:block`'s drops lower to a vanilla loot table, not a runtime component.

### Distribution

The exporter produces a **content jar** whose `fabric.mod.json` depends on `msm_runtime`. By default the runtime jar is **nested** in the content jar via the `"jars"` field, so users ship one file. A "separate runtime" checkbox omits nesting for modpack makers who want one shared runtime. The runtime carries the app's version (`engine-mod/gradle.properties` `mod_version` equals `app/package.json`, checked by a test), is built by `engine-mod/` Gradle and ships with the app as `runtime/msm_runtime.jar`; content jars depend on `msm_runtime >=<version>` ([ADR 0026](adr/0026-fabric-content-jar.md)). CI starts a headless Fabric dedicated server with the kitchen-sink sample (`tools/run-fabric-server`, `fixtures/sample-mod/`) and fails on any runtime error or warning.

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

A new component's MSM mcdoc and runtime implementation land in the same change. The Phase 4 components and the six actions are implemented in `msm_runtime` v1 and edited in the Block and Item Studios; action fields, defaults and the runtime rules (dropped events, chain depth 16, strict types, `"item": false`) are in [ADR 0025](adr/0025-msm-definition-format-v1.md).

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

Structure `.nbt` (vanilla structure template) and Sponge `.schem` (Version 2 and 3) are read and written with deepslate's `nbt` module, not `prismarine-nbt`; SNBT is printed by our own printer, because deepslate 0.27.2's loses tag types ([ADR 0021](adr/0021-structure-templates-and-nbt.md)). The codec lives in `@msm/plugin-structures`, which contributes the importers (`.nbt`, `.schem`) and two exporters (structure `.nbt` files, Sponge `.schem` Version 3) through the public plugin API. An imported file becomes a `minecraft:structure_template` element stored as JSON (the original file is not kept), shown in the 3D preview, usable in jigsaw pools and lowered back to gzip `.nbt` with the target's `dataVersion`. File > Import Structure… runs the importers; the Export menu offers both structure exports.

`@msm/interop` `nbt/` reads only the world name (`Data.LevelName`) from `level.dat` for the world picker, with deepslate's NBT reader; an unreadable file falls back to the folder name.

### Minecraft installation

- **Discovery:** default `.minecraft` locations per OS: `%APPDATA%\.minecraft` on Windows, `~/Library/Application Support/minecraft` on macOS, `~/.minecraft` on Linux. Users can override the path.
- **Launcher instances** ([ADR 0019](adr/0019-game-locations-launcher-instances.md)): users who play through the CurseForge app or Prism Launcher are first-class; Windows paths come first. MSM models every place it can install into and read a client jar from as a **game location**: the official `.minecraft`, or one launcher instance. A location records its launcher (`official`, `prism`, `multimc`, `curseforge`), launcher root, instance folder name, display name, Minecraft version, mod loader, game folder (`gameDir`, holding `resourcepacks/` and `saves/`) and problems. `@msm/interop` `launchers/` reads them; settings store the manual launcher folders and the chosen install target.
  - **Prism Launcher** is auto-detected: `PRISMLAUNCHER_DATA_DIR` first, then `%APPDATA%\PrismLauncher` on Windows, `~/Library/Application Support/PrismLauncher` on macOS, `~/.local/share/PrismLauncher` on Linux (honouring `$XDG_DATA_HOME`, verify at implementation), the Flatpak folder and the Scoop folder. Portable installs are added by hand. `prismlauncher.cfg` (else `polymc.cfg`, `multimc.cfg`) gives `InstanceDir` (default `instances`, relative to the data folder) and `AdditionalInstanceDirs` (verify at implementation). An instance is a folder holding `instance.cfg` (name, `InstanceType` `OneSix`) and `mmc-pack.json` (`net.minecraft` version and loader uids); its game folder is `minecraft/`, or `.minecraft/` when only that exists; its client jar is `<data>/libraries/com/mojang/minecraft/<v>/minecraft-<v>-client.jar`.
  - **MultiMC and PolyMC** share that format and are read by the same code, but their folders are added by hand in Settings.
  - **CurseForge app:** the modding folder defaults to `%USERPROFILE%\curseforge\minecraft\` on Windows and `~/Documents/curseforge/minecraft/` on macOS; other folders are added by hand. Instances are `Instances/<name>/` folders holding `minecraftinstance.json` (`name`, `gameVersion`, `baseModLoader`; loader from the `baseModLoader.name` prefix and `null` for vanilla, verify at implementation); the instance folder is the game folder. The client jar is read from `Install/versions/<v>/<v>.jar` (verify at implementation).
  - **Install target:** the user picks one location in Settings or the toolbar Install menu; when the stored target no longer exists, MSM falls back to the official folder and says so. Packs install only into the selected `gameDir`; the real path of `gameDir` must lie inside the real instance folder and instances root (for the official launcher, inside `.minecraft`). A version mismatch between the instance and the project warns but does not block; a missing game folder blocks with "Start the instance once so its game folder exists."
  - **Jar search for extraction:** the selected location's own store first (exact version, then the prefix rule), then every other known store in discovery order (official, Prism, MultiMC, CurseForge). The cache stays keyed by `mcVersion`.
  - **Phase 4:** each location records its loader and `mods/` folder, so the content jar can be installed into a Fabric location (see Launching).
- **Asset extraction:** the Electron main process reads vanilla models, blockstates, item definitions, block and item textures and `en_us` lang from the user's installed client jar (`versions/<v>/<v>.jar` for the official launcher; launcher stores as above) into `~/.msm/cache/assets/<version>/` for previews, and serves them to the renderer over IPC ([ADR 0011](adr/0011-client-jar-asset-extraction.md)). The cache is keyed by the project target's `mcVersion`. Animation metadata (`.png.mcmeta`) is extracted from Phase 2: project-authored sidecars are imported beside their texture and validated against `resource:texture_meta` at export, and the preview steps through frames without interpolation (in Phase 1 animated textures previewed as their first frame). **These assets are never redistributed** and never written into exports. Tests use a synthetic jar built at test time; the repository holds no Mojang bytes.
- **Worlds:** from Phase 2 main lists worlds of the selected location as `<gameDir>/saves/<dir>/` folders containing `level.dat` (from Phase 3 with the world name read from it) and installs a data pack to `saves/<world>/datapacks/` ([ADR 0015](adr/0015-data-pack-element-model.md)).
- **Launching:** packs are installed and the user starts the game. From Phase 4, **Test in Minecraft** (`@msm/interop` `fabric/`, [ADR 0026](adr/0026-fabric-content-jar.md) D5) exports the content jar, installs it into a Fabric location's `mods/` as `<mod_id>.jar` and downloads Fabric API there when missing (Fabric Maven, SHA-512 checked, cached in the app's user-data folder). Only files MSM installed, recorded in `mods/.msm-installed.json`, are ever replaced. A Prism or MultiMC instance on the target's Minecraft with at least the target's Fabric Loader is launched with `--launch <instance>` (plus `--dir` for a non-default data folder); on request the app creates a managed Prism instance `MCSuperMods Test (<mc>)` naming only `net.minecraft` and `net.fabricmc.fabric-loader` (Prism adds intermediary itself). Official-launcher and CurseForge Fabric locations are install only, with a note.

We are read-only on the user's game directories and launcher folders, except for copying packs into the selected location's `resourcepacks`/`datapacks`, installing our own files into `mods/` (Test in Minecraft) and managing our own instance folder. Every write into these folders is atomic (a temporary file in the same folder, then a rename), so a game or launcher never reads a half-written file.

## 14. Tech Stack

### Desktop app

We use **Electron**, not Tauri.

| Choice | Why |
|---|---|
| Electron 45 line (verified 2026-11-04; [ADR 0001](adr/0001-electron-over-tauri.md), [ADR 0004](adr/0004-phase0-toolchain.md)) | One language end to end; Chromium guarantees WebGL2 for the 3D preview (Tauri on Linux uses WebKitGTK, where WebGL is unreliable); Blockbench is Electron. |
| electron-vite, electron-builder | Build/HMR; packaging with asar. Releases are an unsigned Windows NSIS x64 installer only; a Linux `dir` build is for local and CI verification and is never published; macOS is not planned for now ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)). Auto-update with `electron-updater` and the GitHub provider is implemented from Phase 2 ([ADR 0018](adr/0018-auto-update.md)). |
| React 19 + TypeScript (strict), Zustand | Mainstream and typed; Zustand for UI-only state. |
| Immer + RFC 6902 patches | Command stack and undo/redo in `@msm/core`. |
| Radix primitives + Tailwind CSS | Accessible primitives; copied shadcn-style components; no runtime UI-library dependency. Icons: Lucide. |
| Monaco Editor (`monaco-editor` directly, lazy-loaded) | JSON editing with schema diagnostics in Phase 1; mcfunction and TypeScript later, with Spyglass diagnostics from Phase 2. |
| deepslate (own WebGL renderer) | 3D preview of block and item models from Phase 1; structure templates and the 2D climate map from Phase 3 ([ADR 0023](adr/0023-structure-and-climate-previews.md)). three.js only if a later phase needs it ([ADR 0010](adr/0010-preview-with-deepslate.md)). |
| `@spyglassmc/*` (Phase 2; mcfunction, main process) | Offline mcfunction parsing, checking and completion behind `@msm/schemas/mcfunction`, loaded lazily in main, with mcdoc symbols for JSON and NBT inside commands; JSON files stay on `validateJson` ([ADR 0009](adr/0009-phase1-validation-gate.md), [ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md), [ADR 0017](adr/0017-phase2-toolchain.md)). |
| deepslate `nbt`, fflate, esbuild, zod | NBT (structure `.nbt`, `.schem`, `level.dat`; [ADR 0021](adr/0021-structure-templates-and-nbt.md)); zip (fflate everywhere); script transpilation; IPC and config validation. |

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

Installer under 150 MB. Monaco and the 3D preview are lazy-loaded; asar packaging and dependency pruning are on by default. Size is tracked in CI from Phase 1: `tools/check-size` enforces `app.asar` at most 25 MB, the renderer output at most 8 MB and no renderer JSON file over 100 kB, and the release workflow fails a Windows installer over 150 MB. The unpacked Linux build (about 284 MB, mostly the 224 MB Electron binary) is reported only. At Phase 1 close: `app.asar` 10.2 MB, renderer 5.6 MB, Windows installer about 122 MB ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)). Phase 2 keeps the budgets; Spyglass lives only in the main bundle, and `tools/check-size` also reports the main bundle size without a budget ([ADR 0017](adr/0017-phase2-toolchain.md)). At Phase 2 close: `app.asar` 12.7 MB (Spyglass and its mcdoc symbol support added about 1.2 MB, not the 3.5 MB estimated), renderer 5.7 MB, main `index.js` 266.2 kB with lazy chunks for Spyglass and `electron-updater`.

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
├── examples/                     # generated mirror of the library examples (all-kinds/, starters/<id>/)
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

Built-in plugins under `packages/plugins/`: `resourcepack/`, `datapack/`, `library/`, `structures/`, `worldgen/`, `blocks-items/`, `entities/`, `models-anim/`, `scripting/`. `library/` contributes no element kinds, only project starters, examples and placeholder-asset generators ([ADR 0020](adr/0020-templates-starters-examples.md)). Each is its own npm package `@msm/plugin-<name>` and depends only on `@msm/plugin-api` and `@msm/schemas` among internal packages; `@msm/plugin-structures` also uses the third-party `deepslate` (its `nbt` module only, [ADR 0021](adr/0021-structure-templates-and-nbt.md)).

### Dependency direction

```
plugin-api  <-  schemas  <-  core  <-  plugins / exporters / targets / interop  <-  app
```

`@msm/plugin-api` depends on nothing internal. The `@msm/targets` aggregator sits beside the target packages and depends on them. Plugins, exporters and interop may depend on `@msm/targets` for tests only: a Biome `noRestrictedImports` override forbids it (and `@msm/target-*`) in shipped plugin and exporter source, so shipped plugins still use only `@msm/plugin-api` and `@msm/schemas` ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)). `@msm/exporters` may also use `@msm/plugin-resourcepack`, `@msm/plugin-datapack`, `@msm/plugin-library`, `@msm/plugin-structures` and `@msm/plugin-worldgen` in tests (the sample-project goldens, [ADR 0017](adr/0017-phase2-toolchain.md); the library bundles and the `examples/` mirror, [ADR 0020](adr/0020-templates-starters-examples.md); the sample-worldgen golden and chain walk, [ADR 0022](adr/0022-worldgen-element-model-and-validators.md)); Biome forbids every `@msm/plugin-*` except `@msm/plugin-api` in exporter source, because exporters consume `OutputFile[]`, never plugins. The direction is enforced by TypeScript project references, Biome import rules and `tools/check-deps`, which checks every workspace `package.json` against a layer map and flags version literals outside `packages/targets`; it runs in `pnpm lint`, so a reverse import fails CI.

### Naming

- npm scope `@msm/*`; mod id `msm_runtime`; Java package `dev.mcsupermods.runtime`.
- Runtime definitions in jars live under `msm/`, a sibling of `assets/` and `data/`.
- Project root file: `msm.project.json`.

## 16. Testing Strategy

| Level | Tooling | What it covers |
|---|---|---|
| Unit | Vitest | IR, serialisation, migrations, patches and undo/redo, renames. |
| Lowering | Vitest golden files | Each lowering function per target, under the plugin's `test/fixtures/<target id>/expected/`; binary outputs (structure `.nbt`) are compared byte for byte and re-read to check `DataVersion`; exporters add a SHA-256 golden over the sample project's zip. |
| Worldgen chain | Vitest in the owning plugins and `@msm/exporters` | Structure codec round trips (`.nbt` and `.schem`, every NBT tag type through SNBT); each project validator's codes; `fixtures/sample-worldgen/` exports with zero problems and a pinned SHA-256, its `.nbt` files parse back with the same block counts, and a chain walk over the zip resolves every link from world preset and structure set down to structure templates and jigsaw targets against the zip and the vendored registries; a mutated copy reports `worldgen.feature-order` ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)). |
| Schema conformance | `validateJson` in CI (the Spyglass JSON checker only if section 18, question 13 adopts it) | Every lowered output, including golden fixtures, validated against the schema model derived from vanilla-mcdoc and MSM mcdoc. A failure is a bug. |
| mcfunction conformance | `@msm/schemas/mcfunction` over the vendored command data, in the target packages | Parse, check and lint results for known-good and known-bad commands; every exported `.mcfunction`, including the sample data pack, has zero errors ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)). |
| Library | Vitest in the owning plugins and `@msm/exporters` | Every element template validates with zero errors and zero unknown ids for each target, as does its lowered file; every starter and example bundle is built into a memory project with the real plugins, reloaded, exported as resource and data packs with zero problems (functions through the mcfunction checker) for each target; the `examples/` mirror equals the generated projects (`UPDATE_GOLDENS=1` rewrites it) ([ADR 0020](adr/0020-templates-starters-examples.md)). |
| Engine mod logic | JUnit 5 | Definition parsing, component graph construction. |
| Engine mod behaviour | Fabric GameTest | Components and events in a running server. |
| End to end (mod) | CI headless server | From Phase 4, a "kitchen-sink" sample project is exported and loaded; load errors fail CI. |
| App | Vitest + happy-dom; Playwright for Electron | Component tests; golden-path e2e (new project, block model, texture, export zip, reopen), data pack, launcher, library and worldgen e2e specs, and smoke runs of the built and packaged app under xvfb. |

CI runs from Phase 0: Biome, type checks and unit tests on every push.

## 17. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation | Trigger to revisit |
|---|---|---|---|---|---|
| 1 | Minecraft version churn (three drops a year) | High | High | Targets package isolates version facts; mcdoc/mcmeta pinned per target; support N and N-1 only. | A release needs changes outside `packages/targets`. |
| 2 | Spyglass internal API instability | Medium | Medium | Wrap behind `@msm/schemas`; pin versions; keep a minimal own mcdoc reader as a fallback plan. | A Spyglass upgrade breaks more than `@msm/schemas`. |
| 3 | Registry freeze limits runtime registration | Medium | High | Prototype in Phase 4 week 1 before building editors; fall back to code generation (Tier 2) if dynamic registration hits limits. | Spike fails to register a block from `msm/` cleanly. Resolved: the Phase 4 spike passed ([ADR 0024](adr/0024-runtime-registration-spike.md)). |
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
4. **Auto-update provider:** resolved 2026-11-04: the user chose MIT and a public `MEZTKING/MCSuperMods` repository, so release builds publish to its GitHub Releases and the app updates itself with `electron-updater` using the GitHub provider. Unsigned Windows builds update fine (first install shows a SmartScreen warning). Implemented in Phase 2 ([ADR 0018](adr/0018-auto-update.md)): the installed Windows app checks a few seconds after start-up (setting "Check for updates automatically", on by default) and from Help, Check for Updates, downloads in the background and installs only when the user chooses Restart to update. The release workflow uploads the installer, its blockmap and `latest.yml` to a draft release, which the maintainer publishes by hand.
5. **Plugin sandbox mechanism:** `isolated-vm` versus an Electron utility process for third-party plugins.
6. **NeoForge:** whether to add a NeoForge target in 1.x.
7. **mcmeta branch naming:** which `misode/mcmeta` branches or refs to pin per target. Resolved: see [ADR 0006](adr/0006-mcmeta-refs.md).
8. **Electron version:** which stable Electron line to start on. Resolved: see [ADR 0001](adr/0001-electron-over-tauri.md) and [ADR 0004](adr/0004-phase0-toolchain.md).
9. **Save-time data loss:** load skipped invalid element files and save deleted `content/**/*.json` files it did not write, so saving after a failed load could delete the skipped files. Resolved: save deletes only files it loaded and is never blocked; see [ADR 0012](adr/0012-save-deletes-only-loaded-files.md).
10. **Licence:** resolved 2026-11-04 by the user: MIT for the whole repository (app, packages and the future `msm_runtime` mod), with credit through the retained copyright notice. `LICENSE` is at the repository root. Projects and packs made with MCSuperMods belong to their authors. The repository is to be made public, which unblocks auto-update via GitHub Releases (Q4).
11. **Toolchain upgrades:** when to move from pnpm 10 to pnpm 12 and `.nvmrc` from Node 22 to Node 24. Resolved 2026-11-04: both at the start of Phase 2 (Node 24.22.2, pnpm 12.16.1); see [ADR 0017](adr/0017-phase2-toolchain.md).
12. **MSM-authored preview fallback parents:** seven parent models (`msm:block/cube`, `cube_all`, `cube_column`, `cube_bottom_top`, `cross`, `msm:item/generated`, `msm:item/handheld`) are written from scratch, used only for preview without a client jar and never exported. Decided: acceptable under "never bundle Mojang assets"; still awaiting the user's veto or acceptance at Phase 2 close ([ADR 0010](adr/0010-preview-with-deepslate.md)). If vetoed, they are removed and the preview without a client jar shows only models that declare their own `elements`.
13. **Spyglass JSON checker adoption:** whether the Spyglass JSON checker replaces `validateJson` as the JSON gate. Open. Phase 2 uses Spyglass for mcfunction only ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)). Loading the vendored mcdoc symbols into Spyglass for JSON and NBT inside commands works in the app at Phase 2 close; whether that justifies replacing `validateJson` for JSON files is revisited when a later phase needs it.
14. **AI assistant:** the user wants optional AI help in the future, for example through the Claude API with their own key. Open: scheduling (post-1.0 by default, see ROADMAP "Post-1.0 Ideas"), the plugin or core boundary (likely a built-in plugin contributing commands and a chat panel, operating only through `ProjectCommand`s and the validators), key storage (`safeStorage`), privacy (which project data is sent), and cost visibility. An ADR is required before work starts.

15. **Noise-sampled worldgen preview:** whether to add a Misode-style biome or terrain map sampled from noise, and whether extracting vanilla `data/minecraft/worldgen/{noise_settings,density_function,noise,biome}` JSON from the user's own client jar (cached, never exported, read like textures) fits "never bundle Mojang assets". Open. v0.3 ships the climate map only ([ADR 0023](adr/0023-structure-and-climate-previews.md)); the work is described as reserve brief B84 and needs the user's agreement and an update to ADR 0023 before it starts.

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
