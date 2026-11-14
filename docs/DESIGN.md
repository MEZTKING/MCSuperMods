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
| Models and animations | Animated entity models from Blockbench | Content jar + `msm_runtime` (+ GeckoLib where a mob uses it; the runtime's own renderer otherwise, [ADR 0072](adr/0072-vanilla-model-renderer.md)) |
| Scripts | TypeScript handlers for game events and `run_script` actions | Content jar (transpiled to ES5) + `msm_runtime` (Rhino) |

### Why hybrid

Vanilla packs are the most portable output, so we produce them whenever possible. New registry entries need a mod. Generating Java per project would make every export a compile step and lock users into generated code. A generic runtime reading data-driven definitions keeps exports fast, keeps the project the source of truth, and still allows a one-way eject to Java (section 12; built in Phase 6 as the `java-project` exporter, [ADR 0033](adr/0033-java-project-eject-v1.md)).

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

All edits go through a command stack. A command is an Immer producer applied to the project document; Immer emits RFC 6902 JSON patches and their inverses. Undo applies the inverse patches; redo reapplies the forward patches. Patches also feed the reference index, problems panel and autosave. UI-only state (open tabs, selection, panel layout) lives in Zustand in the app and is never part of the undo history. A command may also carry effects outside the document (for example an asset byte write), which the stack records and hands to the host on execute, undo and redo; the session keeps the replaced bytes in `.msm/undo/` so one Undo restores files too ([ADR 0045](adr/0045-undoable-asset-writes.md)).

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
  .msm/                                             # cache, git-ignored: generated .d.ts, thumbnails, index, trash, undo
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
- `.msm/` is a disposable cache; deleting it never loses work. Removing an asset moves its bytes to `.msm/trash/<namespace>/<path>` so undo can restore them; the trash is emptied when a project is opened or created, never on save, so deleting `.msm/` loses at most the undo of asset removals ([ADR 0012](adr/0012-save-deletes-only-loaded-files.md)). Bytes replaced by an undoable write (the Creator's Update) wait in `.msm/undo/` under the same rule ([ADR 0045](adr/0045-undoable-asset-writes.md)).
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
| `importers` | File type to elements/assets; the host picks one by file extension and inserts the result as one undo step; the app adds host importers next to the plugins' ([ADR 0029](adr/0029-model-animation-pipeline.md) D3) | `.nbt`, `.schem` (`msm.structures`); `.bbmodel`, `.geo.json`, `.animation.json` (host importer `blockbench` from `@msm/interop`) |
| `commands` | Palette entries and refactors | "New block from template" |
| `schemas` | Extra mcdoc files | MSM component definitions |
| `elementTemplates` | Entries of the New element picker for the plugin's own kinds: id, kind, category, name hints and a pure `data(context)` | "Shaped recipe", "Block model (cube all)" |
| `projectStarters` | New project starters: a category, layer badges, `requiresKinds` and `build(context)` returning a content bundle | "Custom ore", "Recipe pack" |
| `examples` | Examples gallery entries: the kind taught, category, tags, `requiresKinds` and a commented content bundle | "Loot table: block drops" |
| `validators` | Cross-element checks over the whole project: an id, the kinds read and a pure `validate(input)` returning problems; the host re-runs them when those kinds change and merges the problems ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)) | Feature order across biomes, structure set spacing |

Templates, starters and examples live in plugins; the app is only the picker. A template creates one element of a kind its own plugin registers and references only vanilla ids, ids derived from its own id, or the project root advancement. A starter or example builds a self-contained content bundle (elements with optional `meta.notes`, plus generated assets, never Mojang assets) that may span any registered kinds; the host adds a `pack` element when the bundle has none and inserts the elements as one undo step. The kind plugins carry the templates for their kinds (99 in total after Phase 3, 106 after Phase 4, 112 after Phase 5, 116 after Phase 6, 125 in 0.7.0); the built-in `@msm/plugin-library` (`msm.library`) carries the starters, the examples and the placeholder-texture generator ([ADR 0020](adr/0020-templates-starters-examples.md)).

Phase 3 adds two built-ins ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)): `@msm/plugin-structures` (`msm.structures`: structure templates, template pools, structures, structure sets and processor lists, with the `.nbt` and `.schem` importers and exporters of [ADR 0021](adr/0021-structure-templates-and-nbt.md)) and `@msm/plugin-worldgen` (`msm.worldgen`: biomes, configured and placed features, dimensions, world presets and nine schema-form worldgen kinds). Both contribute validators; `@msm/plugin-datapack` adds the worldgen tag kinds and keeps `minecraft:dimension_type`.

Phase 4 adds `@msm/plugin-blocks-items` (`msm.blocks-items`: `msm:block`, `msm:item`, `msm:mod`; [ADR 0025](adr/0025-msm-definition-format-v1.md)). Phase 5 adds two more ([ADR 0028](adr/0028-entity-definition-format-v1.md), [ADR 0029](adr/0029-model-animation-pipeline.md)): `@msm/plugin-models-anim` (`msm.models-anim`: `msm:geo_model` and `msm:animation`, lowered to GeckoLib's `assets/<ns>/geckolib/` files, four validators with five `models-anim.*` codes) and `@msm/plugin-entities` (`msm.entities`: `msm:entity`, lowered to `msm/<ns>/entity/` plus language keys and the spawn egg's item files, eight validators with ten `entities.*` codes). Plugin API 0.7.0 turns `Target.geckolib` into `GeckolibFacts` ([ADR 0030](adr/0030-plugin-api-0.7.md)). The Blockbench importer lives in `@msm/interop` and is registered by the app as a host importer, because plugins may depend only on `@msm/plugin-api` and `@msm/schemas`.

Phase 6 adds `@msm/plugin-scripting` (`msm.scripting`: `msm:script`, `{ lines }` lowered to `msm/<ns>/script/<path>.ts` with `language: 'typescript'`; four templates under "Scripts"; validators `scripting.unknown-handler`, `scripting.duplicate-handler` and `scripting.empty-script`; [ADR 0032](adr/0032-script-api-v1-and-typings.md)). The plugin also owns the script API description `api/script-api-v1.json` and exports the generated typings (`MSM_RUNTIME_TYPINGS`), which the app writes to `.msm/` and gives to the Script Studio. Plugin API 0.8.0 adds `FabricFacts.gradle`, `Target.javaProject` and the `typescript` output language ([ADR 0034](adr/0034-plugin-api-0.8.md)); every built-in plugin declares `^0.8.0`. The project then has 59 kinds.

Phase 7 makes the API stable: **plugin API 1.0.0** ([ADR 0036](adr/0036-plugin-api-1.0-and-compatibility-policy.md)) lets `lower`, template `data`, starter and example `build` and validators return a promise (core's `lowerProjectAsync`), splits `TargetFacts` (data, with `channel: 'release' | 'snapshot'`) from `Target` (adds the hooks), gives templates and bundles the target, adds `supports?(target)` to templates, starters and examples, `ElementKind.defaultDataFor?(target)`, and starter `parameters` with `BundleContext.values` (the wizards of [ADR 0040](adr/0040-wizards-as-parameterised-starters.md)); every built-in declares `^1.0.0`. Two additive minors ship with app 0.7.0: 1.1.0 (`TargetFacts.items`, `ProjectStarter.creator`, the `set` parameter, `ElementMeta.creator`; [ADR 0042](adr/0042-armour-and-custom-tool-materials.md), [ADR 0043](adr/0043-creator-guided-flows.md)) and 1.2.0 (the `image` parameter; [ADR 0044](adr/0044-gear-weapons-and-consumables.md)). The resource pack plugin adds `minecraft:equipment` and the data pack plugin `minecraft:tag/painting_variant`, so the project has 61 kinds; the library has 24 starters (Custom sword and the Creator flows among them) and 71 examples. The `@msm/plugin-api` package is built with `tsup` and attached to every release as `msm-plugin-api-<version>.tgz`.

### Loading model

- **Built-in plugins** are bundled and loaded statically. They import only `@msm/plugin-api` and `@msm/schemas`.
- **Third-party plugins** (Phase 7, shipped in 0.7.0; [ADR 0035](adr/0035-plugin-sandbox-and-capability-manifest.md)) load from `~/.msm/plugins/<folder>/`: main scans each `msm-plugin.json` (manifest version, id, name, version, `apiVersion`, `main`, `schemas`, `capabilities`) and serves the files with path containment; the renderer, served from the privileged `msm-app://` scheme so the CSP's `'self'` no longer matches `file:` URLs, runs each plugin in its own Web Worker started from the app's bootstrap (network and storage globals removed) and builds an ordinary `Plugin` whose functions are message-passing proxies with deadlines (`plugin.*` problem codes). External plugins may contribute kinds with their mcdoc symbol exports, templates, starters, examples, validators, exporters and importers; `editors`, `commands` and `targets` are unsupported for them in 1.x. Settings "Plugins" lists each as loaded, refused or failed; changes take effect after a restart. `tools/new-plugin --external` scaffolds one and `fixtures/sample-plugin/` is the reference.
- **No private hooks.** Anything a built-in can do, a third-party plugin can do.

The default editor for any kind is the schema-driven form, so adding a vanilla kind requires zero UI code.

### Versioning and compatibility

`@msm/plugin-api` follows semver. Each plugin declares an `apiVersion` semver range; the loader refuses plugins whose range does not include the running API version and reports why (`plugin.api-incompatible`). From 1.0.0, 1.x changes are additive, anything breaking waits for 2.0, and deprecations last at least one minor ([ADR 0036](adr/0036-plugin-api-1.0-and-compatibility-policy.md) D1).

## 8. Editors and UX

### Two paths over one model

[ADR 0047](adr/0047-easy-and-advanced-mode.md) puts the two paths behind a view mode: **Easy** (Creator sets and friendly groups first, technical files under More, the form only) and **Advanced** (every group with kind ids, Raw JSON); the sidebar can be searched and folded in both, and a live preview sits beside the form for items, blocks, armour looks and armour items (a figure with a clickable parts list), recipes, models, structures and mobs. **New project with the AI helper…** starts a project from a description. [ADR 0048](adr/0048-pictures-screenshots-and-skins.md) turns pictures into content: **Picture to Texture…** converts a screenshot or any image (crop, scale, background, colours) into an item, block, armour, skin or painting texture; the Custom mob wears a player skin (64 by 64 with its overlay layer, or legacy 64 by 32); and the AI helper accepts screenshots with a message.

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
| 5 | Entity Studio (identity and hitbox, appearance with model, animation set, texture and animation names, stats, melee attack, ordered goal list, natural spawning, spawn egg, events with `play_animation`); geo model and animation preview with playback ([ADR 0029](adr/0029-model-animation-pipeline.md) D5); File > "Import Blockbench Model…". Geo models and animation sets are the schema form and the Raw JSON tab |
| 6 | Script editor |

### Templates, starters and examples

Content comes from plugins ([Plugin System](#7-plugin-system)); the app only presents it ([ADR 0020](adr/0020-templates-starters-examples.md)).

- **New element.** The picker groups templates under category headings (Models, Blockstates, Recipes, Loot tables, Tags and so on) and has a filter box. Every built-in kind has at least one template with starting content that validates against the current target; a third-party kind without templates gets a generic entry built from its `defaultData`.
- **New project.** Toolbar "New" and File > New Project… still create a blank project directly. The split arrow on "New", File > New Project from Starter… and the palette open the New project dialog, which lists starters grouped as blank, pack and content, with layer badges; submitting asks for an empty folder and builds the starter there with the namespace derived from the folder name. Since Phase 4 the Custom ore starter is a real `msm:block` ruby ore with its item, loot table, recipes and `msm:mod` element, exported as a Fabric mod jar (before Phase 4 it reskinned emerald ore). Phase 5 adds the Custom mob starter: an animated Ruby Golem (`msm:entity`, its geo model, animation set, placeholder skin and spawn egg texture, loot table and death function).
- **Examples gallery.** Help > Examples… and the palette open a gallery of one commented example per built-in kind plus the content starters, with search over title, kind, category and tags, a kind filter and a detail pane showing the notes. "Open as new project" builds the example into a new folder; "Copy into my project" adds it to the open project under a chosen namespace as one undo step, reporting ids that already exist.
- **Notes callout.** An element with `meta.notes` (every copied example) shows them in a collapsible, read-only Notes callout above its editor.

### Command palette

Every plugin command is reachable from a keyboard-driven palette (create, rename, export, test, switch target), opened with Ctrl+Shift+P (`CmdOrCtrl+Shift+P`); Rename Element is F2 ([ADR 0017](adr/0017-phase2-toolchain.md)).

### Preview panel

Misode's `deepslate` renders block and item models with its own WebGL renderer ([ADR 0010](adr/0010-preview-with-deepslate.md)); later phases extend the preview to structures and worldgen (deepslate) and to Blockbench entities (the app's own WebGL renderer, Phase 5); three.js is not used. Parent models resolve through project elements, then the extracted vanilla cache (section 13), then a small set of MSM-authored fallback parents (`msm:block/cube_all`, `msm:item/generated` and others) written from scratch for preview only and never exported. Without a client jar, missing textures render as deepslate's missing-texture checker and a banner links to the Minecraft folder setting; without WebGL, the panel shows a message and the rest of the app works.

From Phase 3 ([ADR 0023](adr/0023-structure-and-climate-previews.md)) the panel has two more modes. **Structure mode** (`previewKind: 'structure'`) renders a structure template with deepslate's `StructureRenderer`, a grid and an orbit camera fitted to its size, preparing resources for every palette block through the same model chain; block entities, entities and biome tints are not drawn. The **climate map** (`previewKind: 'climate_map'`, for dimensions and world presets with an explicit `multi_noise` biome source) is a 2D canvas outside the WebGL gate: two of the six climate parameters on the axes, sliders for the rest, each cell coloured by the biome `Climate.Parameters.find` selects. A noise-sampled biome or terrain map is not built in v0.3 ([Open Question 15](#18-open-questions)).

From Phase 5 ([ADR 0029](adr/0029-model-animation-pipeline.md) D5) **geo mode** (`previewKind` `geo_model`, `animation`, `entity`) draws Bedrock geometry with the app's own raw WebGL renderer (`preview/geo/`, gl-matrix, a lazy chunk): cubes with box or per-face UV, inflate and mirror, the bone hierarchy with Blockbench's rotation order and signs, the project texture or a checker, an orbit camera and a grid. An animation picker, play and pause and a time slider play keyframes linearly; `catmullrom` plays as linear and Molang strings as 0, each with an info notice; the game is the reference. An animation set plays on the geo model whose bones it matches, and an entity shows its model, texture and idle animation at its scale.

### "Test in Minecraft"

- **Phase 1:** export the resource pack and copy it into the user's `resourcepacks` folder; the user enables it in-game.
- **Phase 2:** export the data pack and copy it into a chosen world's `datapacks` folder; the user runs `/reload`.
- **Phase 4:** File > "Test in Minecraft…" (also in the Export menu and the palette) installs the current content jar, with `msm_runtime` nested, into a Fabric location and launches Prism or MultiMC, or creates a managed Prism test instance ([Interop](#13-interop-blockbench-nbt-minecraft-installation)).
- **Phase 5:** a project with entities also nests GeckoLib in that jar (downloaded once, [ADR 0029](adr/0029-model-animation-pipeline.md) D4); nothing else changes. Since [ADR 0072](adr/0072-vanilla-model-renderer.md) only mobs that need GeckoLib (`renderer: geckolib`, or `auto` on a target with GeckoLib) nest it.

### Error surfacing

A Problems panel lists schema violations, dangling references and lowering errors, each linked to its element and field (`elementId` plus an RFC 6901 path, or a `file` for load and export problems); function problems add a `range` within `/lines/<n>`. Schema problems are recomputed live as elements change. From Phase 3, plugin project validators ([Plugin System](#7-plugin-system)) run after the schema checks, debounced, and their problems (codes `<area>.<check>`, such as `worldgen.feature-order`) join the same list with the same severity rules. Schema violations are errors; unknown registry ids are warnings. Errors block export of the layers their elements lower to (an error in a resource-pack element leaves the data pack exportable), never save; warnings block neither. Files that fail to load stay on disk as error problems until the user fixes or deletes them ([ADR 0012](adr/0012-save-deletes-only-loaded-files.md)).

### AI helper

An optional assistant over the Claude API with the user's own key ([ADR 0041](adr/0041-ai-helper.md); pulled ahead of 1.0 on 2026-11-05 as a Phase 7 add-on, shipped in v0.7.0; user guide `docs/guide/ai-helper.md`). The key is stored by main with Electron `safeStorage` and never reaches the renderer; the SDK runs only in main as a lazy chunk, behind the pure package `@msm/ai` (protocol, tool catalogue, agent loop over a `ModelClient` seam, budgets, scripted client for tests). The loop runs in main and the tools in the renderer against the session: read-only tools (project summary, kinds and schema summaries, elements and their problems, templates and starters, target facts, script typings), proposal tools (`create_elements`, `update_element`, `delete_element`, `rename_element`, `create_texture`, `add_starter`), `run_checks` over a scratch project, and the user-decision tools `propose_plan` and `checkpoint`. Nothing is applied silently: a run accumulates a **changeset** the panel shows with before/after views and per-item accept, and Apply is one undoable command; the same changeset serves a one-line edit and a build of a whole mod. **Build mode** makes whole content from one prompt: plan first, then batches with checks after each, one-shot ("Build all") or step by step, under visible per-run limits (tool turns, output tokens, a task budget) with a Stop button and a usage and approximate-cost line. The helper lives in a third dock tab next to Preview and Problems, with "Explain this problem" and "Ask about this element" entry points; conversations are per project, in memory. Project content the helper reads is sent to Anthropic when the user sends a message; asset bytes, file paths and the key never are, and the app stays fully usable without a key. Models: `claude-opus-5-5` by default, `claude-sonnet-5-5` and `claude-haiku-5-5` selectable in Settings "AI helper" (with the key, effort per mode and the refusal fallback switch), through `@anthropic-ai/sdk` 1.1.0. As built: the tool calls of one model turn run one at a time in order, so parallel proposals see each other; `run_checks` also lowers the scratch project in memory to catch two elements writing one file; `add_starter` keeps one `pack.mcmeta` and one `msm:mod` per project and stamps Creator flows with `meta.creator`; Apply is disabled while a run is in progress; e2e and scenario tests drive a scripted model client (`MSM_E2E_AI_SCRIPT`), never the network.

### Creator

The beginner path for whole pieces of content ([ADR 0043](adr/0043-creator-guided-flows.md)): guided no-code flows with a live preview. A flow is a parameterised starter ([Plugin System](#7-plugin-system), [ADR 0040](adr/0040-wizards-as-parameterised-starters.md)) flagged with `creator` (groups gear, blocks, food, mobs, scripts); the library ships Gear set (material item, optional ore and storage block, tools, armour and optionally spear, mace, bow, crossbow, shield, horse and wolf armour, with recipes or smithing upgrades, tags, lang keys, an optional trim material and tinted placeholder textures from one colour), Weapon, Consumable, Totem, Enchantment, Painting (with an `image` parameter for the picture), Music disc, Simple block, Food, Custom ore, Custom mob and Scripted behaviour. The Creator dialog shows the flow's fields and, on every change, rebuilds the bundle in memory and previews it (item and block models through deepslate, recipes as crafting grids, armour layers on a preview humanoid plus horse and wolf layers, enchantment and painting cards, stats and effects in words, the list of elements that will be created) without applying anything; Create applies the bundle through the AI helper's changeset as one undo step. Every result is ordinary elements (Studios and Raw JSON work on each); elements carry `meta.creator` (flow, set and values), so "Edit in Creator" reopens a set, and pieces the user edited by hand are kept unless they choose to overwrite them (untouched means equal to what the flow produces for the stored values); an Update rewrites replaced texture bytes in the same undo step ([ADR 0045](adr/0045-undoable-asset-writes.md)), and reopening with unchanged values plans no change. The AI helper drives the same flows through `add_starter`. Shipped in v0.7.0; user guide `docs/guide/creator.md`. Armour and custom tool materials are added to the definition format for this ([Behaviour Model](#11-behaviour-model-components-and-events), [ADR 0042](adr/0042-armour-and-custom-tool-materials.md)); v0.8 adds the Weapon (sword, spear, mace, bow, crossbow, shield), Consumable (food with effects, drinks, charms), Totem, Enchantment, Painting and Music disc flows, more Gear set pieces (spear, mace, bow, crossbow, shield, horse and wolf armour), smithing upgrades and trim materials, and the `image` parameter type ([ADR 0044](adr/0044-gear-weapons-and-consumables.md)); planned as v0.8, they shipped in the combined v0.7.0.

Block types and plants ([ADR 0067](adr/0067-block-types-and-states.md), [ADR 0068](adr/0068-crops-saplings-trees-and-leaves.md), [ADR 0069](adr/0069-block-family-flows.md)): the Block Studio has a Type picker (changing the type is one undo step that keeps the shared fields and the look), a Textures section with the type's slots in words, a Models section for the user's own models, the per-type fields, crop, sapling and leaves sections, and a 3D preview of the models lowering generates (with a stage slider for crops). The feature form of a `minecraft:tree` feature is the Tree Studio (trunk, foliage and decorator pickers from the target's vendored registries; the leaves' state filled in for project leaves). The Creator group Blocks gains the flows Wood set, Stone set, Crop and Tree, previewed as a row of block models; "Simple block" gains a placement option. Templates: one per block type (17) and "Tree for a sapling"; user guide `docs/guide/block-types-and-plants.md`.

Mobs ([ADR 0070](adr/0070-mob-bodies-movement-and-ranged-attacks.md), [ADR 0071](adr/0071-tameable-breedable-rideable-mobs-variants-and-boss-bars.md), [ADR 0072](adr/0072-vanilla-model-renderer.md), [ADR 0073](adr/0073-mob-flows-templates-and-presets.md)): the Entity Studio has a Kind of mob picker (creature, farm animal, pet, monster, flying creature, water creature, fish, ambient; one undo step that sets base, category, placement, spawn rule and movement mode together) and sections Movement, Ranged attack, Taming, Breeding, Riding, Variants and Boss bar, plus a Renderer picker (auto, GeckoLib, built-in) with a note on the target; the entity preview has a Variant switcher and "Show as a baby" and plays the state animations by name. The Creator group Mobs gains the flows Pet, Farm animal, Mount, Flying mob, Water mob and Boss over original preset models (quadruped, bird, fish, flyer, biped, cube creature) with up to three extra variants, and Custom mob gains "Hostile archer" and a Variants step; every flow writes `renderer: "auto"` and is offered on both targets. Templates: Pet, Farm animal, Mount, Flying creature, Fish, Archer and Boss; user guide `docs/guide/mob-behaviours.md`.

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
  fabric?: { loader: string; api: string; loom: string; minecraftDependency: string; gradle: string };
                              // Phase 4 (ADR 0027); 26.3: loader 0.20.1, API 0.165.2+26.3, Loom 1.19.3, "~26.3" (verified 2026-11-05);
                              // gradle from Phase 6 (ADR 0034): 9.8.2, the engine-mod wrapper, for the ejected project
  geckolib?: GeckolibFacts;   // Phase 5 (ADR 0030): version, modId, dependency, fileName, url, sha512, modrinthVersionId;
                              // 26.3: GeckoLib 5.5.7, ">=5.5.7", Modrinth CDN jar (verified 2026-11-05)
  entities?: EntityFacts;     // plugin API 1.11.0 (ADR 0070 D7): projectileItems (namespaced ids; 26.4 adds
                              // minecraft:ice_ball), saddleTag (minecraft:can_equip_saddle)
  javaProject?: JavaProjectGenerator; // Phase 6 (ADR 0034): the Java sources of the eject, naming this version's
                              // Mojang and Fabric classes (ADR 0033 D3)
  migrateFrom?(previous: Target, project: Project): MigrationReport;
}

type PackFormat = { major: number; minor: number };
```

`folders.data.worldgen` is the parent folder of `worldgen/<registry>`, as `tags` is of `tags/<registry>`; a kind passes the registry as the subfolder, so a future rename (26.3 renamed `worldgen/configured_feature` to `worldgen/feature` and `worldgen/configured_carver` to `worldgen/carver`) changes only the target ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)). The `Target` interface and the shared IR types it refers to live in `@msm/plugin-api` ([ADR 0008](adr/0008-ir-types-in-plugin-api.md)). The `@msm/targets` aggregator (`packages/targets/all/`) exports `builtInTargets` and `targetById(id)`, so code and tests outside `packages/targets` reach the real targets without naming a version ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)).

Phase 7 adds the second target, `mc-26.4`, pinned to `26.4-snapshot-7` (`channel: 'snapshot'`, no GeckoLib and no `javaProject`; re-pinned to the release when 26.4 ships) with `migrateFrom` driven by a removed-id table tied to the vendored registries ([ADR 0037](adr/0037-second-target-mc-26.4-and-target-upgrade.md)). The aggregator lists targets newest first and `defaultTargetId` is the newest `release` target; `targetFacts(id)` gives hook-free facts for workers and the UI. Facts added in 1.x: `worldgen.noiseSettingsDefaultBlock` (26.4 dropped `default_block`), `items.armorMaterials`, `blocks` and `entities`. 26.4 has no `geckolib` fact, yet mobs work there: `renderer: auto` mobs are drawn by the runtime's built-in renderer ([ADR 0072](adr/0072-vanilla-model-renderer.md)). The app chooses the target in the New project dialog, shows it in the status bar and moves a project with File > Upgrade Project Target… (a preview of the migration report, then one undo step). The Fabric content jar nests the runtime built for the project's target ([ADR 0038](adr/0038-per-version-runtime-builds.md)).

Support policy ([ADR 0037](adr/0037-second-target-mc-26.4-and-target-upgrade.md) D1): the current release (26.3) and the next version's snapshots, replaced by its release when it lands; snapshots are best-effort.

Block facts (plugin API 1.10.0, [ADR 0067](adr/0067-block-types-and-states.md) D9): `TargetFacts.blocks?: BlockFacts` lists the MSM names of the door, trapdoor, button and plate set types and of the fence gate wood types each target supports; family tag names are checked against each target's vendored registries in the plugin tests.

### Exporters

| Exporter | Output | Phase |
|---|---|---|
| `vanilla-packs` | Resource pack `.zip` (Phase 1), data pack `.zip`, or both zips in a folder the user picks (Phase 2; [ADR 0015](adr/0015-data-pack-element-model.md)) | 1–2 |
| `fabric-content-jar` | Jar with `assets/`, `data/`, `msm/`, `fabric.mod.json`; `msm_runtime` nested by default, or left out with the "Separate runtime and GeckoLib (for modpacks)" option ([ADR 0026](adr/0026-fabric-content-jar.md)); projects with mobs that need GeckoLib (`renderer: geckolib`, or `auto` where the target has GeckoLib) also depend on it and nest its jar unless that option is on ([ADR 0029](adr/0029-model-animation-pipeline.md) D4, [ADR 0072](adr/0072-vanilla-model-renderer.md) D5) | 4–5 (exists) |
| `java-project` | Standalone Gradle project (Loom, wrapper, `fabric.mod.json` without `msm_runtime`, README, `LICENSE-NOTES.md`) with Java generated by `Target.javaProject`, written into `<picked folder>/<mod id>/`, which must be empty; scripts and `run_script` actions are left out with `export.scripts-not-ejected` ([ADR 0033](adr/0033-java-project-eject-v1.md)) | 6 (exists) |

The content jar exporter lives in `@msm/exporters` (`src/fabric-content-jar/`), writes the same deterministic zip as the packs, takes its Fabric facts from `Target.fabric` and receives the runtime and GeckoLib jar bytes from its host (`createFabricContentJarExporter({ loadRuntimeJar, loadGeckolibJar })`), so it has no file access. GeckoLib is loaded only when an entity needs it (`needsGeckolib`; before [ADR 0072](adr/0072-vanilla-model-renderer.md) any `msm/<ns>/entity/` file); without it the export fails with `export.geckolib-missing`, and for a target without GeckoLib facts a `geckolib` entity fails with `export.no-geckolib-target` (an `auto` entity there exports for the built-in renderer with the info `export.entity-vanilla-renderer`). The app's main process caches GeckoLib under `<userData>/downloads/geckolib/`, downloading it once from `Target.geckolib.url` with a SHA-512 check. Scripts (`msm`-layer files with `language: 'typescript'`) are transpiled by the host's `transpileScript` (TypeScript to ES5 CommonJS, [ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md) D2) and written as `.js`; a jar with scripts depends on `msm_runtime` at least 0.6.0 ([ADR 0032](adr/0032-script-api-v1-and-typings.md) D4). The `java-project` exporter (`createJavaProjectExporter({ loadGradleWrapper })`) owns the version-independent parts (definitions from the `msm` layer, Gradle files, README, resources, manifest) and calls the target's generator; the Gradle wrapper comes from the host (packaged `runtime/gradle-wrapper/`). Exporters declare boolean options that the export dialog renders ([ADR 0027](adr/0027-plugin-api-0.6.md)). Files several elements contribute to (language files, tags) declare `OutputFile.merge` and are merged in step 3; other files meeting at one path are conflicts.

Plugin API 1.6.0 ([ADR 0055](adr/0055-custom-status-effects.md) D9, D10): plugin API 1.6.0 adds `JavaProjectInput.effects`; the `java-project` exporter routes `msm/<ns>/effect/` files there and reports an unknown kind folder instead of treating it as an entity, and the 26.3 generator writes `ModEffects` and one `ThrownItemEntity`.

### Modpacks

A **modpack** groups projects ([ADR 0046](adr/0046-modpacks.md)): a folder with `msm.modpack.json` (name, version, summary, the Minecraft target, member project folders by path, and extra mods pinned as Modrinth files with SHA-1 and SHA-512). Projects are referenced, never copied. The app remembers modpacks in its settings and shows them in **File → Modpacks…**. A build loads each member from a read-only snapshot (main sends `msm.project.json`, `content/` and `assets/` of listed members only) into a scratch `ProjectSession` over a memory file system and runs the content-jar pipeline; members must share the modpack's target and have distinct mod ids, and any member error blocks (`modpack.*` problems). **Export modpack (.mrpack)…** writes a Modrinth modpack (`modrinth.index.json` with the target's Fabric API from `TargetFacts.fabric.apiModrinth` and the extra mods as downloads, member jars under `overrides/mods/`; `createMrpack` in `@msm/exporters`). **Test modpack in Minecraft** installs every jar and extra mod (downloaded once, SHA-512 checked) into the Test in Minecraft location and removes jars an earlier test installed that the modpack does not list. CurseForge packs, server packs and config overrides are out of scope for 1.1.

### Pipeline

1. **Collect** all elements in the enabled namespaces.
2. **Lower** each element against the chosen target into `OutputFile[]`.
3. **Merge** outputs: files that declare `merge` (`tag`, `object`) are combined; any other files on the same path are conflicts and errors ([ADR 0027](adr/0027-plugin-api-0.6.md)).
4. **Validate** every JSON output that declares `OutputFile.schema` against the schema model derived from the target's vanilla-mcdoc and MSM mcdoc ([ADR 0009](adr/0009-phase1-validation-gate.md)), and every text output that declares `OutputFile.language` (`mcfunction`, and `typescript` from Phase 6) with the injected text validator ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)).
5. **Write** via the exporter: zip, folder, jar or Gradle project. Output is deterministic (entries sorted by path, fixed zip timestamps that are identical in every timezone; [ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)), and each output includes an `msm.export.json` manifest listing target, MSM version and plugins.

### Validation gate

Step 4 is a hard gate: every lowered JSON file is validated against the schema model derived from vanilla-mcdoc, and every `.mcfunction` file with Spyglass; parse and check errors block, warnings pass. Invalid lowered output is a bug in a lowering function or target, not a user error; the export stops with a report. CI runs the same check on golden fixtures. A struct with dispatcher spreads accepts a key only when the struct or one of its resolved spreads declares it, and reports any other key as `schema.unknown-field`; when a spread cannot be resolved to fields (an `any` member, an unknown dispatch key), every key is allowed. Project texture animation sidecars (`.png.mcmeta`) pass the same gate as `resource:texture_meta`. Binary outputs (structure `.nbt`) carry no schema; their element is validated before lowering. Scripts pass the gate through the TypeScript checker in the main process: syntax errors (`typescript.syntax`) block, semantic findings against the generated typings and the curated `lib` set (`typescript.semantic`) only warn, since Rhino is duck-typed ([ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md) D5). Project validators ([Plugin System](#7-plugin-system)) gate export through the problem list: an error from a validator blocks export like a schema error ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)).

Vanilla pack safety ([ADR 0066](adr/0066-vanilla-pack-safety.md)): a vanilla server rejects a whole data pack when a registry-loaded file (recipe, loot table, advancement, worldgen and others) names an id only the Fabric mod jar registers. The vanilla data pack and the data half of the combined export therefore leave such files out with the warning `export.mod-only-reference`, make tag entries naming mod-only ids `required: false`, and keep functions with the warning `export.mod-only-function`; potions are left out by the rule of [ADR 0063](adr/0063-potions-and-brewing.md). The rule lives in `@msm/exporters` (`vanilla-packs/mod-only.ts`); the host supplies the mod-only ids from its registry view, where a block item counts under its own id (`blockItemId`, so seeds are mod-only). CI loads the vanilla data pack of every library starter, example and mirror project, those with mod content included, on a vanilla server of each target.

## 10. Engine Mod (Runtime)

`msm_runtime` is a Fabric mod (Java package `dev.mcsupermods.runtime`) that turns `msm/` definitions into real blocks, items and entities.

### Toolchain

Verified on 2026-11-05 ([ADR 0024](adr/0024-runtime-registration-spike.md)):

- **Java 25**, required by Minecraft 26.1+.
- **Gradle 9.8.2** (wrapper, Kotlin DSL).
- **Fabric Loom, the 26.1+ non-remapping variant**: plugin id `net.fabricmc.fabric-loom`, release 1.19.3. Minecraft is `com.mojang:minecraft:26.3` with no mappings line; dependencies use plain `implementation`, not `modImplementation`.
- **Fabric Loader 0.20.1 and Fabric API 0.165.2+26.3** for 26.3; the same facts live in the target's `fabric` block for the exporter.
- **Mojang names only.** 26.1+ ships unobfuscated and Fabric no longer maintains Yarn for it; we use no Yarn and no Parchment.
- **GeckoLib 5.5.7** (Phase 5, [ADR 0029](adr/0029-model-animation-pipeline.md) D6) from the Modrinth Maven (`maven.modrinth:geckolib:<version id>`, an `exclusiveContent` repository): `compileOnly` and `gametestCompileOnly` for compilation and `localRuntime` for the run tasks (`-PwithoutGeckolib` leaves it off); the built runtime jar contains no GeckoLib class and only `suggests` it.
- **Rhino 1.9.2** (Phase 6, [ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md) D1): `implementation` plus Loom `include`, so the upstream jar is nested unmodified as `META-INF/jars/rhino-1.9.2.jar` (Loom generates its `fabric.mod.json`, id `org_mozilla_rhino`); the runtime carries `META-INF/licenses/rhino-LICENSE.txt` (MPL 2.0).
- **Fabric API modules used:** creative tabs through `fabric-creative-tab-api-v1` (`CreativeModeTabEvents.modifyOutputEvent`, keys built with `ResourceKey.create(Registries.CREATIVE_MODE_TAB, id)`); GameTests through `fabric-gametest-api-v1` (annotation `net.fabricmc.fabric.api.gametest.v1.GameTest`, entry point `fabric-gametest`, Loom `fabricApi { configureTests {} }`, task `runGameTest`, which `./gradlew build` runs). `Block.Properties` and `Item.Properties` need `setId(ResourceKey)` before construction.

### The registry freeze

Minecraft registries freeze at startup. Blocks, items and entity types must be registered during mod initialisation and cannot be added on `/reload`. This constraint drives the runtime design.

### Init-time scan

During initialisation the runtime iterates `FabricLoader.getAllMods()`, calls `findPath("msm")` on each mod container and reads every `msm/**/*.json`. It accepts hand-written definitions too; it has no dependency on the app.

### Driver classes and components

Each definition is registered through a generic **driver class**: `MsmBlock`, `MsmItem` or `MsmEntity` (Phase 5). The driver holds a list of parsed **components** and dispatches game callbacks (use, step, break, tick, attack) to them. Behaviour is never hardcoded per definition, and the runtime does not use reflection on definitions. Definitions are parsed with Codecs aligned with the MSM mcdoc schemas (strict JSON types; a shared conformance corpus is checked by both the app's `validateJson` and the runtime's JUnit tests). The definition format v1 and the runtime's load rules are in [ADR 0025](adr/0025-msm-definition-format-v1.md).

`MsmEntity extends PathfinderMob` ([ADR 0028](adr/0028-entity-definition-format-v1.md) D5) takes its attributes from the components and its goals from `msm:ai_goals`, and dispatches `doHurtTarget`, `hurtServer`, `die` and `mobInteract` to the trigger components. Entity types are built with Fabric's `FabricEntityType.Builder.createMob` (default attributes and spawn placement), spawn eggs are `SpawnEggItem`s counted as items, and natural spawns go through `BiomeModifications.addSpawn`, which reaches 26.3's `natural_mob_spawns` biome attribute. GeckoLib is bridged by a separate class group (`registry/MsmGeoEntity`, `registry/GeckolibEntities`, `client/MsmGeoModel`, `client/GeckolibRenderers`) touched only after `FabricLoader.isModLoaded("geckolib")`; without GeckoLib every entity definition logs one error and registers nothing, while blocks and items still load. (Superseded for mobs by [ADR 0072](adr/0072-vanilla-model-renderer.md): only `renderer: geckolib` mobs need GeckoLib now; see Mobs below.) The runtime's **`client` entrypoint** (`client/MsmRuntimeClient`) registers a `GeoEntityRenderer` per entity type through vanilla `EntityRenderers.register` (opened by Fabric API's transitive access wideners); `environment` stays `*`. The log keeps the Phase 4 line and adds `[msm_runtime] registered K entity type(s)`.

The runtime adds a fourth definition kind, `effect`, registered before items (`MsmMobEffect extends MobEffect`, with attribute modifiers and `msm:on_start`, `msm:on_tick` and `msm:on_end` events), and an item class `MsmThrowableItem` with one projectile entity type, `msm_runtime:thrown_item` (`MsmThrownItem`), drawn by vanilla `ThrownItemRenderer`, which `MsmRuntimeClient` registers with or without GeckoLib ([ADR 0055](adr/0055-custom-status-effects.md), [ADR 0056](adr/0056-throwables.md)).

### Scripts

The `scripting/` package (Phase 6, [ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md), [ADR 0032](adr/0032-script-api-v1-and-typings.md)) runs the ES5 CommonJS scripts at `msm/<ns>/script/**.js` of every mod container (`ScriptScanner`; `DefinitionScanner` reads `.json` only, so older runtimes never see them). `ScriptHost` (one per server) loads them on `SERVER_STARTING`, reloads them on `END_DATA_PACK_RELOAD` and drops them on `SERVER_STOPPED`, and logs `[msm_runtime] loaded S script(s); E error(s)`. `MsmContextFactory` gives interpreted mode, the ES6 language level, stack depth 1000, a deny-all `ClassShutter` and a 2000 ms wall-clock budget per top-level call; every script has its own top-level scope over sealed shared standard objects, plus `msm`, `module`, `exports` and a `require` that resolves `msm:runtime` and relative ids within the same mod and namespace. `ScriptBridges` connects the nine events to Fabric API callbacks (`UseBlockCallback`, `PlayerBlockBreakEvents.BEFORE`, `UseItemCallback`, `UseEntityCallback`, `ServerLivingEntityEvents.ALLOW_DAMAGE` and `AFTER_DEATH`, `ServerPlayConnectionEvents.JOIN`, `SERVER_STARTED`, `END_SERVER_TICK`); `ScriptApi` is the `msm` tree, which `ScriptApiContractTest` compares with `script-api-v1.json`. The `run_script` action reaches `ScriptHost.runAction` through `EventRunner`. Script data is not persisted in v1.

### Frozen versus reloadable data

| Data | Where it lives | Reloadable |
|---|---|---|
| Block, item, entity definitions | `msm/` | No (registered at init) |
| Models, textures, sounds, lang | `assets/` | Yes (resource reload) |
| Loot tables, recipes, tags, advancements, functions | `data/` | Yes (`/reload`) |

Anything that can be reloadable stays in the ordinary data pack inside the content jar. For example, an `msm:block`'s drops lower to a vanilla loot table, not a runtime component.

### Distribution

The exporter produces a **content jar** whose `fabric.mod.json` depends on `msm_runtime`. By default the runtime jar is **nested** in the content jar via the `"jars"` field, so users ship one file. A "separate runtime" checkbox omits nesting for modpack makers who want one shared runtime. The runtime carries the app's version (`engine-mod/gradle.properties` `mod_version` equals `app/package.json`, checked by a test), is built by `engine-mod/` Gradle once per Minecraft version (`-Pmc=<mc>` reads `engine-mod/versions/<mc>.properties`; version-specific code sits behind seams in `src/mc/<mc>/`; jars `msm_runtime-<version>+mc<mc>.jar`; [ADR 0038](adr/0038-per-version-runtime-builds.md)) and ships with the app as `runtime/msm_runtime-mc-<mc>.jar`, one per target; content jars depend on `msm_runtime >=<version>` ([ADR 0026](adr/0026-fabric-content-jar.md)). Projects with entities also depend on GeckoLib, nested by default and left out with the same option ([ADR 0029](adr/0029-model-animation-pipeline.md) D4). CI starts a headless Fabric dedicated server with the kitchen-sink sample (`tools/run-fabric-server`, `fixtures/sample-mod/`) and, from Phase 5, with `fixtures/sample-mob/` (runtime and GeckoLib nested), and fails on any runtime error or warning or any GeckoLib warning or error. From Phase 6 it also loads `fixtures/sample-script/` (11 scripts, `loaded 11 script(s); 0 error(s)` required), builds the ejected Java projects of the two samples, and runs the parity GameTests (`engine-mod/parity/`, a black-box GameTest mod) on a production server four times: against each sample's content jar and against its ejected jar ([ADR 0033](adr/0033-java-project-eject-v1.md) D5).

### Mixin policy

Fabric API events first. Mixins only where no event exists, each with a justification comment and a GameTest covering it.

Testing uses JUnit 5 for parsing and Fabric **GameTest** for behaviour (section 16).

Additions ([ADR 0060](adr/0060-adding-to-vanilla-content.md), [ADR 0062](adr/0062-persistent-script-data.md)): the kinds `msm:biome_addition` (features and spawns into vanilla biomes through Fabric `BiomeModifications`, fixed per world load) and `msm:loot_addition` (pools added to vanilla loot tables through `LootTableEvents.MODIFY`, reloadable, never over a data pack's replacement); fuel and composting are item components, trades are plain data kinds, and no mixin is used. Persistent script data lives in a Fabric data attachment `msm_runtime:script_data`, per script namespace.

Additions ([ADR 0055](adr/0055-custom-status-effects.md), [ADR 0056](adr/0056-throwables.md)): the definition kind `msm:effect` (category, colour, attribute modifiers and the trigger components `msm:on_start`, `msm:on_tick` and `msm:on_end`), the item component `msm:throwable` (speed, gravity, damage, `after_throw`, `on_hit_entity`, `on_hit_block`), and the actions `damage` and `heal`.

Project sounds and block shapes ([ADR 0057](adr/0057-project-sound-events-and-mob-sounds.md), [ADR 0059](adr/0059-block-shapes-and-see-through-blocks.md)): the runtime registers one sound event per key of each `assets/<ns>/sounds.json` before effects, so project sounds resolve everywhere vanilla takes a sound id; entities gain `sounds` (ambient, hurt, death, step); blocks gain the component `msm:shape` (pixel boxes, collision, see-through). Render layers need no code in 26.x: the texture's pixels choose cut-out or translucent.

Potions ([ADR 0063](adr/0063-potions-and-brewing.md)): the runtime registers project potions as vanilla `Potion` entries after effects and before blocks and items, from `msm/<ns>/potion/` definitions; a potion naming an unknown effect is skipped with one error. Brewing, splash and lingering bottles, tipped arrows and the creative tabs are vanilla behaviour over the registered potions, and the brewing recipes are data. The code is shared by both versions (no seam).

Block types ([ADR 0067](adr/0067-block-types-and-states.md), [ADR 0068](adr/0068-crops-saplings-trees-and-leaves.md)): the shared behaviour of `MsmBlock` (events, triggers, cooldowns, actors, light and redstone helpers) lives in one `BlockBehaviourDriver`, and each vanilla family has a driver class in `registry/types/` that extends the vanilla class and delegates to it (stairs, slab, wall, fence, fence gate, door, trapdoor, button, pressure plate, weighted plate, pane, crop, sapling, leaves); `pillar`, `horizontal` and `directional` stay `MsmBlock` with an axis or facing property and turned shapes. Stairs register after their base block. `msm:strippable` runs through Fabric `UseBlockCallback` for any item whose `minecraft:block_transformer` is `minecraft:axe`, since vanilla stripping is a data registry a pack can only replace whole. Version differences sit behind the seams `BlockSetTypes`, `Flammability` (26.3 Fabric `FlammableBlockRegistry`; 26.4 has none, so vanilla `FireBlock.setFlammable` by reflection), `TreeGrowers` and `Leaves`. Saplings hold tree feature keys that resolve when they grow; a missing tree is one warning at server start. Leaf tint is the runtime's first client block hook (`BlockColorRegistry` in `MsmRuntimeClient`), checked only in game.

Mobs ([ADR 0070](adr/0070-mob-bodies-movement-and-ranged-attacks.md), [ADR 0071](adr/0071-tameable-breedable-rideable-mobs-variants-and-boss-bars.md), [ADR 0072](adr/0072-vanilla-model-renderer.md)): `base` picks the body, `MsmEntity` (`PathfinderMob`), `MsmAnimal` (`TamableAnimal`) or `MsmMonster` (`Monster`), each a `RangedAttackMob` and `PlayerRideableJumping` with its own synched `DATA_VARIANT` and `DATA_ANIM`, and each delegating to one `MobDriver` built from the definition with a module per feature in `registry/mob/` (`MobGoals`, `MobMovement`, `MobRanged`, `MobTaming`, `MobBreeding`, `MobRiding`, `MobVariants`, `MobBossBar`, `MobAnimations`), the pattern of `BlockBehaviourDriver`. GeckoLib bodies `MsmGeo{Entity,Animal,Monster}` share `GeoControllers`. The registrar picks the GeckoLib body for `renderer: geckolib`, or `auto` with GeckoLib loaded, and the plain body otherwise, so mobs register without GeckoLib and on 26.4. On the client, GeckoLib bodies are drawn by `GeckolibRenderers` (which applies the age scale and hides the saddle bone, as GeckoLib does not) and every other mob by the runtime's own `client/vanilla/` renderer: `GeoMeshReader` and `GeoAnimationReader` (pure Java) read the project's geo and animation files from GeckoLib's resource paths, `GeoModelBaker` builds vanilla `ModelPart`s, `GeoAnimationBaker` builds vanilla `AnimationDefinition`s, and `MsmVanillaRenderer` draws state animations from synched data and triggered ones from `DATA_ANIM` (a subset of GeckoLib: no Molang, easings or keyframe events). Riding is client-authoritative as in vanilla; boss bars are one `ServerBossEvent` per mob. The code is shared by both versions: every method whose signature differs (`canBeABaby`, `setAgeLocked`, `travelFlying`, `checkFallDamage`, `jumpInLiquid`, `ItemSteerable`, `Equippable`) is never overridden or called. The limits M1–M17 and the fact table are in ADR 0070's findings.

## 11. Behaviour Model (Components and Events)

We borrow Bedrock's proven idea: a block, item or entity definition is a bag of **components** plus **events** that chain **actions**. This gives beginners real behaviour without code.

- **Components** are named capabilities with parameters: `msm:light_emitter`, `msm:breakable`, `msm:on_interact`, `msm:food`.
- **Events** are named lists of actions, triggered by trigger components (`msm:on_interact`, `msm:on_step`; for entities also `msm:on_hurt`, `msm:on_death` and `msm:attack.on_attack`) or by other events.
- **Actions** are the primitive verbs: `run_function`, `spawn_particle`, `set_block_state`, `give_item`, `play_sound`, `trigger_event`, and from Phase 5 `play_animation` (entities only).

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
| 4 | Items | `msm:food`, `msm:tool` (a vanilla tier or a custom `ToolMaterial`, with optional attack overrides), `msm:durability`, `msm:on_use` (use actions), `msm:armor` (slot and a vanilla or custom armour material naming a `minecraft:equipment` asset; [ADR 0042](adr/0042-armour-and-custom-tool-materials.md), v0.7); v0.7 ([ADR 0044](adr/0044-gear-weapons-and-consumables.md)): `msm:consumable` (effects, animation, cooldown, container), `msm:ranged_weapon` (bow, crossbow), `msm:shield`, `msm:death_protection`, tool types `spear` and `mace`, armour slots `horse` and `wolf`, the action `apply_effect`, and `msm:components`, a passthrough of raw vanilla data components validated by the target's own mcdoc (the escape hatch for gliders, trim and banner providers, music disc items and future components) |
| 5 | Entities | `msm:health`, `msm:movement`, `msm:ai_goals` (goal subset `wander`, `look_at_player`, `look_around`, `melee_attack`, `flee`, `follow`), `msm:attack`, `msm:animated_model` (required; GeckoLib), `msm:on_hurt`, `msm:on_death`, `msm:on_interact`; plus `spawn` rules and `spawn_egg` |
| 1.x | Mobs | `base` (`mob`, `animal`, `monster`); `msm:movement` modes `fly`, `swim`, `amphibious`; `msm:ranged_attack`, `msm:tameable`, `msm:breedable`, `msm:rideable`, `msm:variants`, `msm:boss_bar`; goals `ranged_attack`, `tempt`, `panic`, `leap_at_target`; spawn rules `animal` and `water_animal`; `msm:animated_model.renderer` and the `sit`, `fly`, `swim`, `shoot` animations ([ADR 0070](adr/0070-mob-bodies-movement-and-ranged-attacks.md), [ADR 0071](adr/0071-tameable-breedable-rideable-mobs-variants-and-boss-bars.md), [ADR 0072](adr/0072-vanilla-model-renderer.md)) |

A new component's MSM mcdoc and runtime implementation land in the same change. The Phase 4 components and the six actions are implemented in `msm_runtime` v1 and edited in the Block and Item Studios; action fields, defaults and the runtime rules (dropped events, chain depth 16, strict types, `"item": false`) are in [ADR 0025](adr/0025-msm-definition-format-v1.md). The Phase 5 entity components, implemented in `msm_runtime` 0.5 and edited in the Entity Studio, are in [ADR 0028](adr/0028-entity-definition-format-v1.md): goals run in list order unless `priority` says otherwise, an undecodable goal is dropped with an error, `msm:on_hurt` fires only when the mob survives, and `play_animation` (`{ "animation", "controller"? }`, controller `msm_triggered` by default) triggers a GeckoLib animation on the event's entity; in block and item definitions it is dropped at load with a warning.

Addition ([ADR 0061](adr/0061-more-triggers.md)): ten more triggers, items `msm:on_hit`, `msm:on_use_on_block`, `msm:while_held` and `msm:while_worn`, blocks `msm:on_break`, `msm:on_place`, `msm:on_random_tick` and `msm:on_entity_inside`, entities `msm:on_tick` and `msm:on_spawn`; tick triggers have a 5-tick minimum interval and a shared cap of 2,000 firings per server tick.

Step events ([ADR 0058](adr/0058-event-actors-entity-commands-and-cancel-resync.md)): `msm:on_step` events carry the stepping entity (`self` and `other` are the stepper, so jump pads work on mobs and items), and the step cooldown is keyed per dimension.

Potions and data kinds ([ADR 0063](adr/0063-potions-and-brewing.md), [ADR 0064](adr/0064-data-kinds-sweep.md)): the definition kind `potion` (`msm:potion`, with up to 15 brewing recipes and four name keys lowered as data; potions need the Fabric mod jar, and the vanilla packs leave them out with the warning `blocks-items.potion-needs-jar`), and fifteen more data kinds (mob and sound variants, `instrument`, `enchantment_provider`, `timeline`, `world_clock`), two resource kinds (`minecraft:atlas`, `minecraft:font`) and eight tag registries that need no runtime code. `wolf_sound_variant` and `trial_spawner` wait for a re-sync of the vendored mcdoc.

Block types and plants ([ADR 0067](adr/0067-block-types-and-states.md), [ADR 0068](adr/0068-crops-saplings-trees-and-leaves.md)): `msm:block` has a `type` field (absent means `block`, unchanged) with 17 types and per-type fields (stairs base, set type, wood type, press time, weighted maximum, crop ages, stage heights, soil and bone meal range, sapling trees, leaf tint and particles), a block item id of its own (`item.id`, for seeds), and two components on every type, `msm:flammable` (burn and ignite odds; the format's `burn_odds` is vanilla's `igniteOdds`) and `msm:strippable`. `msm:shape` and `msm:redstone` are allowed only on `block`, `pillar`, `horizontal` and `directional`; a component a type does not allow is a validator error and a runtime load error that drops it. Element-only `textures` and `models` let lowering write vanilla-shaped blockstates and models; the loot presets `crop` and `leaves` lower to vanilla's wheat and oak leaves shapes; behaviour tags (`stairs`, `walls`, `wooden_fences`, `crops`, `leaves` and others) are written by lowering.

Mobs ([ADR 0070](adr/0070-mob-bodies-movement-and-ranged-attacks.md), [ADR 0071](adr/0071-tameable-breedable-rideable-mobs-variants-and-boss-bars.md)): the entity definition gains `base` (absent means `mob`, unchanged); `msm:tameable` and `msm:breedable` need `base: "animal"` (a validator error and a runtime load error that drops them otherwise). A tameable animal breeds only once tamed, as vanilla wolves and cats do. `msm:rideable` with a saddle makes lowering add the entity to `#minecraft:can_equip_saddle` (`merge: 'tag'`; optional in vanilla data packs by [ADR 0066](adr/0066-vanilla-pack-safety.md)). Variants are saved by id under `Variant`. The six new components and the four new goals are closed records; 13 `entities.*` validator codes cover them, among them `entities.vanilla-renderer-subset`.

## 12. Scripting and Escape Hatches

There are three tiers.

| Tier | Mechanism | Who it is for |
|---|---|---|
| 0 | Components + events + mcfunctions | Everyone |
| 1 | Scripts: TypeScript in the app, transpiled to ES5 JavaScript run in game on Rhino | Datapacker Dev, Modder Max |
| 2 | Eject: export as a standalone Fabric Java project | Modder Max, when the mod outgrows MSM |

### Tier 1: scripts

Authors write TypeScript as `msm:script` elements (`{ lines }`, one per source line; plugin `msm.scripting`), edited in the Script Studio with Monaco's TypeScript worker. Scripts run in game on **Mozilla Rhino 1.9.2** nested in `msm_runtime` ([ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md)). Rhino 1.9.2 cannot parse classes, `for...of`, spread in calls, array rest patterns or `async`/`await`, and esbuild cannot lower those to ES5, so **the app transpiles each script with TypeScript's `transpileModule` to ES5 CommonJS** (`downlevelIteration`, in the Electron main process, a lazy chunk) instead of the esbuild design of [ADR 0003](adr/0003-rhino-for-scripting.md). The output runs at Rhino's ES6 language level, so the ES2015 built-ins the helpers use (`Promise`, `Map`, `Symbol`) exist. The content-jar exporter writes `msm/<ns>/script/<path>.js`; the vanilla exporters skip scripts and the eject leaves them out.

| Engine | Size | Pros | Cons | Decision |
|---|---|---|---|---|
| Rhino 1.9.2 | 1.7 MB | Pure Java, small, proven in Minecraft (KubeJS); runs TypeScript's ES5 output | Parses only part of ES2015+ | **Chosen** |
| GraalJS | ~50 MB | Modern JS, fast | Large, heavier runtime | Fallback, not needed |
| LuaJ | Small | Simple, sandboxable | Lua is not what users or our editors speak | Rejected |
| Kotlin script | Large | Typed, JVM-native | Compiler weight, slow start, adds Kotlin | Rejected |

**Sandbox and lifecycle.** Safe standard objects only, a deny-all `ClassShutter` (no Java classes, packages or reflection), interpreted mode, stack depth 1000 and a 2000 ms wall-clock budget per top-level call; server thread only, no file, network or thread access. Scripts load on server start, reload on `/reload` and log `[msm_runtime] loaded S script(s); E error(s)`; a failing script or handler is logged with its id and line and the game continues (handler errors rate-limited).

**Validation.** TypeScript syntax errors block export (`typescript.syntax`); semantic findings against the typings warn (`typescript.semantic`), because Rhino is duck-typed. The same checker in main feeds the Problems panel; Monaco's worker gives completion, hover and squiggles. Validators check `run_script` handlers against `msm.actions.define` calls textually (`scripting.unknown-handler`, `scripting.duplicate-handler`).

### Script API sketch

```ts
import { msm } from "msm:runtime";

msm.events.on("block.interact", (e) => {
  if (e.block.id !== "mymod:ruby_ore" || e.hand !== "main") return;
  if (e.player.isSneaking) {
    e.world.spawnParticle("minecraft:glow", e.block.pos, { count: 20 });
    e.player.give("mymod:ruby", 1);
    e.cancel();
  }
});

msm.actions.define("mymod:chime", (e) => e.world.playSound("minecraft:block.note_block.chime", e.pos));
```

The API is a curated façade over game objects, not raw Minecraft classes. API v1 ([ADR 0032](adr/0032-script-api-v1-and-typings.md) D2): `msm.log`, `msm.events.on` over nine events (`block.interact`, `block.break`, `item.use`, `entity.interact`, `entity.hurt`, `entity.death`, `player.join`, `server.started`, `server.tick`; the first five cancellable), `msm.actions.define` (handlers for the `run_script` action of blocks, items and entities), `msm.schedule`, and the types `World`, `Entity`, `Player`, `Pos`, `BlockRef`, `ItemRef`; `require` loads another script of the same mod and namespace. The exact member names are in `packages/plugins/scripting/api/msm-runtime.d.ts`.

### Typings

The API is described once, in `packages/plugins/scripting/api/script-api-v1.json` (types, globals, events and global free functions). `generateTypings` turns it into `msm-runtime.d.ts` (a golden test pins the checked-in copy), and the runtime's `ScriptApiContractTest` checks that the installed member tree matches it. The typings carry the runtime's version, are written to `<project>/.msm/msm-runtime.d.ts` when a project is opened or created, and feed both Monaco and the export gate.

### Tier 2: eject

"Export as Fabric Java project" (the `java-project` exporter, [ADR 0033](adr/0033-java-project-eject-v1.md)) produces a full Gradle project with generated Java sources that mirror what the runtime would have done, with no dependency on `msm_runtime`: blocks, items and entities (GeckoLib nested) with every component and action. Eject is:

- **One-way.** Edits to the generated project do not flow back into MSM.
- **Deterministic.** The same project and target produce the same sources (sorted, LF, no dates; the Java comes from the target's generator, `Target.javaProject`).
- **Documented.** The generated project includes a README explaining its structure, how to build it (`./gradlew build`, JDK 25), and that it is no longer managed by MSM, plus `LICENSE-NOTES.md`.
- **Checked.** CI builds the ejected `fixtures/sample-mod`, `fixtures/sample-mob` and `fixtures/sample-creatures` with Gradle and runs the same behaviour-parity GameTests against the content jar and the ejected jar.
- **Without scripts in v0.6.** Scripts and `run_script` actions are left out with an `export.scripts-not-ejected` warning per script and a README section (reserve brief B142 would copy the runtime's `scripting/` sources and nest Rhino).

Entity commands and cancel resync ([ADR 0058](adr/0058-event-actors-entity-commands-and-cancel-resync.md)): `World.runCommand` and `World.runFunction` take an optional position, `Entity.runCommand` and `Entity.runFunction` run as and at the entity (the one-argument `World` forms run at the world spawn point with no `@s`), and a cancelled `block.interact`, `item.use`, `entity.interact` or `block.break` resends the player's inventory (and the neighbouring blocks of a placement). Script API v1 grows additively.

Addition ([ADR 0062](adr/0062-persistent-script-data.md)): `Entity.data` (so `Player.data`) and `msm.storage` are JSON key-value stores saved with the world, per script namespace; they survive `/reload`, restart, death and dimension change, while `msm.schedule` stays unsaved. This amends ADR 0032 and closes limitation L4.

Script API 1.1 ([ADR 0065](adr/0065-script-api-1-1.md)) is additive over version 1 (the contract keeps `version: 1`): item and inventory access, player state, titles and boss bars, typed damage with an attacker, raycast, cross-dimension teleport, and the events `player.tick`, `player.respawn`, `player.leave`, `player.changeDimension`, `player.chat` and `entity.damaged`. `entity.damaged` reports the health actually lost (after armour) and fires once for a killing blow too, before `entity.death`. `block.place` and `msm.commands.register` stay deferred.

Block types in the eject ([ADR 0067](adr/0067-block-types-and-states.md) D10, [ADR 0068](adr/0068-crops-saplings-trees-and-leaves.md) D8): the 26.3 generator emits family classes over the same vanilla classes, stairs after their base, door items, fire odds, a generated `BlockStripping` class, crops, saplings with a named `TreeGrower` and the start-up tree check, leaves, and a client entrypoint for leaf tints. It is stricter than the runtime in three places (a missing non-project stairs base, a `falling_particle` with options and `msm:shape` or `msm:redstone` on a family type stop start-up or generation instead of being dropped); the ejected sample mod passes the block type parity tests.

Mobs in the eject ([ADR 0070](adr/0070-mob-bodies-movement-and-ranged-attacks.md) D8, [ADR 0071](adr/0071-tameable-breedable-rideable-mobs-variants-and-boss-bars.md) D9, [ADR 0072](adr/0072-vanilla-model-renderer.md) D8): the 26.3 generator emits entity classes over the same vanilla bases with the movement controls, a copy of the runtime's ranged goal (`entity/MobRangedAttackGoal.java`), taming, breeding (with the tame-before-breed rules), riding, variants, boss bars and the GeckoLib state loop, variant textures, saddle bone hiding and baby scaling; ejected projects draw every mob through GeckoLib (`export.eject-uses-geckolib` for `vanilla` mobs). It is stricter than the runtime: unknown projectiles, unknown keys, out-of-range values, taming or breeding on a non-animal base and undeclared events fail generation. The ejected `fixtures/sample-creatures` passes the same 12 parity tests as its content jars.

## 13. Interop (Blockbench, NBT, Minecraft Installation)

All importers implement the plugin-api `Importer` interface and produce IR elements and assets; there is no parallel model.

### Blockbench

Built in Phase 5 as `@msm/interop` `blockbench/` ([ADR 0029](adr/0029-model-animation-pipeline.md) D3), registered by the app as the host importer `blockbench` (File > "Import Blockbench Model…", palette "Import Blockbench model…"):

- **Entity/animated format:** `convertBbmodel` turns a `.bbmodel` (format `4.x` and `5.x`; other versions warn) into one Bedrock geometry file (`msm:geo_model`, id `<ns>:entity/<name>`), one animation file when it has animations (`msm:animation`, `<ns>:entity/<name>_animations`) and its embedded PNGs (`textures/entity/<name>.png`), applying Blockbench's own Bedrock export conventions (x mirrored, rotations x and y negated, per-face UV with up and down flipped). Blockbench 5.0 files store groups in a top-level `groups` array and keyframes in Blockbench's orientation; both layouts are read. Cubes only; bezier keyframes become linear and sound, particle and timeline channels are left out, each with a problem. An `msm:entity` references the results through `msm:animated_model`.
- **Pass-through:** Blockbench's own `.geo.json` (geometry `1.12.0` to `1.21.x`) and `.animation.json` (`1.8.0`, `1.10.0`) exports are taken as they are after a format check; the guide recommends this path when a converted model looks wrong.
- **Java block/item model format:** not converted in v0.5 (Blockbench exports Java models itself); the importer says so (follow-up).

We import only documented `.bbmodel` fields and warn on unknown format versions. The original `.bbmodel` is kept as the asset `blockbench/<name>.bbmodel`, never modified and never exported.

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
| Monaco Editor (`monaco-editor` directly, lazy-loaded) | JSON editing with schema diagnostics in Phase 1; mcfunction with Spyglass diagnostics from Phase 2; TypeScript for scripts from Phase 6 (Monaco's TypeScript worker as a separate lazy `ts.worker` chunk, typings as an extra lib; [ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md)). |
| `typescript` 6.x (Phase 6; main process) | Script transpilation (`transpileModule` to ES5 CommonJS) and the export gate's check against the typings, in a lazy minified main chunk `scripting-engine-*.js`; pinned to 6.x because TypeScript 7 drops the ES5 target ([ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md) D2). |
| deepslate (own WebGL renderer) | 3D preview of block and item models from Phase 1; structure templates and the 2D climate map from Phase 3 ([ADR 0023](adr/0023-structure-and-climate-previews.md)). three.js only if a later phase needs it ([ADR 0010](adr/0010-preview-with-deepslate.md)). |
| `@spyglassmc/*` (Phase 2; mcfunction, main process) | Offline mcfunction parsing, checking and completion behind `@msm/schemas/mcfunction`, loaded lazily in main, with mcdoc symbols for JSON and NBT inside commands; JSON files stay on `validateJson` ([ADR 0009](adr/0009-phase1-validation-gate.md), [ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md), [ADR 0017](adr/0017-phase2-toolchain.md)). |
| deepslate `nbt`, fflate, zod | NBT (structure `.nbt`, `.schem`, `level.dat`; [ADR 0021](adr/0021-structure-templates-and-nbt.md)); zip (fflate everywhere); IPC and config validation. esbuild is not used for scripts ([ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md)). |
| `@anthropic-ai/sdk` (v0.7; main process only) | The AI helper's Claude client, imported only by `@msm/ai/sdk` and loaded by main as a lazy minified chunk (about 0.4 MB); the renderer and preload are forbidden to import it; keys through `safeStorage`'s asynchronous API ([ADR 0041](adr/0041-ai-helper.md)). Pinned to 1.1.0 in the catalog (verified 2026-11-05; the minified chunk is about 355 kB). |

Build and security ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)): the main build bundles the vendored target data into `out/main/vendor/` (electron-vite plugin `msm:bundle-vendored-data`), and the renderer build drops the vendored-data URLs so no vendored JSON reaches the renderer bundle; main aliases `fflate` to `fflate/browser` to avoid a `require` clash in ESM bundles. The production Content Security Policy allows scripts from `'self'` only, `style-src 'self' 'unsafe-inline'` (Monaco and Radix inject runtime styles and support no nonce) and `img-src 'self' data:` (thumbnails arrive as `data:` URLs).

### Monorepo and tooling

| Choice | Why |
|---|---|
| pnpm workspaces + Turborepo | Fast installs, task caching. |
| TypeScript project references; tsup only to build the published `@msm/plugin-api` tarball (from Phase 7) | Enforce dependency direction; internal packages are consumed from source ([ADR 0004](adr/0004-phase0-toolchain.md)). |
| Vitest, Biome | Fast tests with golden snapshots; lint and format in one tool. |
| VitePress 2.0.0-alpha.21 (Phase 7, `docs/site/`) | The user guide as a site with dead-link checking, deployed to GitHub Pages ([ADR 0039](adr/0039-documentation-site.md)). |
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
| Mozilla Rhino 1.9.2 (nested with Loom `include`) | Embedded scripting (section 12, [ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md)). |
| JUnit 5 + Fabric GameTest | Logic and in-game tests. |

### PlatformAdapter boundary

All OS access (filesystem, processes, zip, dialogs, Minecraft discovery and launch) goes through a single `PlatformAdapter` interface implemented in `app/main/`. Renderer code and packages never call Node or Electron APIs directly. This keeps `@msm/core` testable and leaves a Tauri port possible. `@msm/core` runs in the renderer; the main process implements the adapter and exposes it through a preload bridge with validated, versioned IPC channels ([ADR 0007](adr/0007-renderer-hosted-core-and-platform-adapter.md)).

### Bundle budget

Installer under 150 MB. Monaco and the 3D preview are lazy-loaded; asar packaging and dependency pruning are on by default. Size is tracked in CI from Phase 1: `tools/check-size` enforces `app.asar` at most 25 MB, the renderer output at most 8 MB and no renderer JSON file over 100 kB, and the release workflow fails a Windows installer over 150 MB. The unpacked Linux build (about 284 MB, mostly the 224 MB Electron binary) is reported only. At Phase 1 close: `app.asar` 10.2 MB, renderer 5.6 MB, Windows installer about 122 MB ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)). Phase 2 keeps the budgets; Spyglass lives only in the main bundle, and `tools/check-size` also reports the main bundle size without a budget ([ADR 0017](adr/0017-phase2-toolchain.md)). At Phase 2 close: `app.asar` 12.7 MB (Spyglass and its mcdoc symbol support added about 1.2 MB, not the 3.5 MB estimated), renderer 5.7 MB, main `index.js` 266.2 kB with lazy chunks for Spyglass and `electron-updater`. Phase 6 raises the renderer budget to 16 MB for the lazy Monaco TypeScript worker (`tools/check-size` requires a separate `*ts.worker*.js` chunk) and keeps `app.asar` at 25 MB with `typescript` minified into a lazy main chunk ([ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md) D6). At Phase 6 close: see the ROADMAP Milestone Log (renderer 12.9 MB, `app.asar` 23.9 MB; the asar budget is now the tight one). Phase 7 raises the `app.asar` budget to 32 MB for the second target's vendored data ([ADR 0037](adr/0037-second-target-mc-26.4-and-target-upgrade.md)); the per-target runtime jars are `extraResources` outside the asar. At 0.7.0 and 1.0: see the ROADMAP Milestone Log.

## 15. Repository Layout

```
MCSuperMods/
├── CLAUDE.md
├── README.md
├── package.json  pnpm-workspace.yaml  turbo.json  biome.json  tsconfig.base.json   (Phase 0)
├── .claude/agents/orchestrator.md  executor.md
├── docs/
│   ├── CLAUDE.md
│   ├── DESIGN.md  ROADMAP.md  DEVLOG.md  HANDOFF.md
│   ├── adr/
│   ├── guide/                    # user guide (Markdown)
│   └── site/                     # @msm/site: VitePress build of guide/ (Phase 7)
├── examples/                     # generated mirror of the library examples (all-kinds/, starters/<id>/)
├── app/                          # @msm/app (Electron)
│   └── CLAUDE.md
├── packages/
│   ├── core/        CLAUDE.md    # @msm/core
│   ├── schemas/     CLAUDE.md    # @msm/schemas
│   ├── plugin-api/  CLAUDE.md    # @msm/plugin-api
│   ├── plugins/     CLAUDE.md    # @msm/plugin-*
│   ├── exporters/   CLAUDE.md    # @msm/exporters
│   ├── targets/     CLAUDE.md    # @msm/target-* (mc-26.3/, mc-26.4/), @msm/targets (all/)
│   ├── interop/     CLAUDE.md    # @msm/interop
│   └── ai/                       # @msm/ai (v0.7.0): AI helper protocol, tools, loop; `./sdk` wraps the Claude SDK
├── fixtures/                     # sample projects for the in-game checks; sample-plugin/ (Phase 7)
├── engine-mod/                   # msm_runtime (Fabric, Java 25); versions/<mc>.properties, src/mc/<mc>/ (Phase 7)
│   └── CLAUDE.md
└── tools/                        # check-deps, sync-mcdoc, sync-mcmeta, new-plugin
```

Built-in plugins under `packages/plugins/`: `resourcepack/`, `datapack/`, `library/`, `structures/`, `worldgen/`, `blocks-items/`, `entities/`, `models-anim/`, `scripting/`. `library/` contributes no element kinds, only project starters, examples and placeholder-asset generators ([ADR 0020](adr/0020-templates-starters-examples.md)). Each is its own npm package `@msm/plugin-<name>` and depends only on `@msm/plugin-api` and `@msm/schemas` among internal packages; `@msm/plugin-structures` also uses the third-party `deepslate` (its `nbt` module only, [ADR 0021](adr/0021-structure-templates-and-nbt.md)).

### Dependency direction

```
plugin-api  <-  schemas  <-  core  <-  plugins / exporters / targets / interop  <-  app
```

`@msm/plugin-api` depends on nothing internal. The `@msm/targets` aggregator sits beside the target packages and depends on them. `@msm/ai` (v0.7) depends only on `@msm/plugin-api` types and the Claude SDK; its `./sdk` entry is the only runtime import of the SDK and Biome forbids it in the renderer and preload ([ADR 0041](adr/0041-ai-helper.md)). Plugins, exporters and interop may depend on `@msm/targets` for tests only: a Biome `noRestrictedImports` override forbids it (and `@msm/target-*`) in shipped plugin and exporter source, so shipped plugins still use only `@msm/plugin-api` and `@msm/schemas` ([ADR 0013](adr/0013-phase1-toolchain-and-packaging.md)). `@msm/exporters` may also use `@msm/plugin-resourcepack`, `@msm/plugin-datapack`, `@msm/plugin-library`, `@msm/plugin-structures` and `@msm/plugin-worldgen` in tests (the sample-project goldens, [ADR 0017](adr/0017-phase2-toolchain.md); the library bundles and the `examples/` mirror, [ADR 0020](adr/0020-templates-starters-examples.md); the sample-worldgen golden and chain walk, [ADR 0022](adr/0022-worldgen-element-model-and-validators.md)); Biome forbids every `@msm/plugin-*` except `@msm/plugin-api` in exporter source, because exporters consume `OutputFile[]`, never plugins. The direction is enforced by TypeScript project references, Biome import rules and `tools/check-deps`, which checks every workspace `package.json` against a layer map and flags version literals outside `packages/targets`; it runs in `pnpm lint`, so a reverse import fails CI.

### Naming

- npm scope `@msm/*`; mod id `msm_runtime`; Java package `dev.mcsupermods.runtime`.
- Runtime definitions in jars live under `msm/`, a sibling of `assets/` and `data/`.
- Project root file: `msm.project.json`.

## 16. Testing Strategy

| Level | Tooling | What it covers |
|---|---|---|
| Unit | Vitest | IR, serialisation, migrations, patches and undo/redo, renames. |
| Lowering | Vitest golden files | Each lowering function per target, under the plugin's `test/fixtures/<target id>/expected/`; binary outputs (structure `.nbt`) are compared byte for byte and re-read to check `DataVersion`; exporters add a SHA-256 golden over the sample project's zip. |
| Worldgen chain | Vitest in the owning plugins and `@msm/exporters` | Structure codec round trips (`.nbt` and `.schem`, every NBT tag type through SNBT); each project validator's codes; `fixtures/sample-worldgen/` exports with zero problems and a pinned SHA-256, its `.nbt` files parse back with the same block counts, and a chain walk over the zip resolves every link from world preset and structure set down to structure templates and jigsaw targets against the zip and the vendored registries; a mutated copy whose two biomes list shared placed features in opposite order within one step reports `worldgen.feature-order`, and one with a placed feature in another step only the warning `worldgen.feature-step-differs` ([ADR 0022](adr/0022-worldgen-element-model-and-validators.md)). |
| Schema conformance | `validateJson` in CI (the Spyglass JSON checker only if section 18, question 13 adopts it) | Every lowered output, including golden fixtures, validated against the schema model derived from vanilla-mcdoc and MSM mcdoc. A failure is a bug. |
| mcfunction conformance | `@msm/schemas/mcfunction` over the vendored command data, in the target packages | Parse, check and lint results for known-good and known-bad commands; every exported `.mcfunction`, including the sample data pack, has zero errors ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)). |
| Library | Vitest in the owning plugins and `@msm/exporters` | Every element template validates with zero errors and zero unknown ids for each target, as does its lowered file; every starter and example bundle is built into a memory project with the real plugins, reloaded, exported as resource and data packs with zero problems (functions through the mcfunction checker) for each target; the `examples/` mirror equals the generated projects (`UPDATE_GOLDENS=1` rewrites it) ([ADR 0020](adr/0020-templates-starters-examples.md)). |
| Engine mod logic | JUnit 5 | Definition parsing, component graph construction. |
| Engine mod behaviour | Fabric GameTest | Components and events in a running server; from Phase 5 entity registration, attributes, spawn eggs, each AI goal (walk, look, melee attack, flee, follow), each trigger, `play_animation` and natural spawns, with and without GeckoLib (`-PwithoutGeckolib`); since the mob expansion every base, movement mode, ranged attack, taming, breeding, riding, variants and boss bars. The client renderers are covered as far as JUnit goes: the pure readers and a cross-language vertex golden (`fixtures/geo-parity/`) shared with the app's preview baker ([ADR 0072](adr/0072-vanilla-model-renderer.md) D7); drawing is an in-game check. |
| Entities and models | Vitest in the owning packages | Entity lowering and template goldens and every `entities.*` validator code; geo model and animation lowering and `models-anim.*` codes; Blockbench conversion goldens (a 5.0 fixture, its 4.10 rewrite converting identically) and pass-through checks; the MSM mcdoc corpus for entities, geometry and animations; the preview's baker, keyframe evaluator and subjects; `fixtures/sample-mob/` exports with zero problems, a pinned jar SHA-256 and schema-valid definitions, geometry and animations ([ADR 0028](adr/0028-entity-definition-format-v1.md), [ADR 0029](adr/0029-model-animation-pipeline.md)). |
| Scripting | Vitest in `@msm/plugin-scripting`, `@msm/exporters` and the app; JUnit and GameTest in `engine-mod/` | The typings golden and type checks of scripts (with `msm:runtime` imports and `require`); every template, library and sample script type-checks; transpiled output is ES5 (no `class`, `=>`, `let`, `const`, template or `for...of` tokens by the TypeScript scanner); `fixtures/sample-script/` exports with zero problems and a pinned jar SHA-256; the main-process TypeScript service; `ScriptApiContractTest` (JSON against the installed API) and `MsmScriptGameTest` (sandbox, timeout, every event, cancel, `require`, `schedule`, `run_script`, reload) ([ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md), [ADR 0032](adr/0032-script-api-v1-and-typings.md)). |
| Eject | Vitest in the 26.3 target and `@msm/exporters`; Gradle and GameTest in CI | Generator goldens per kind from the runtime's GameTest definitions; tree goldens of the ejected samples; CI builds both ejected projects and runs the parity GameTests (`engine-mod/parity/`: 17 sample-mod tests in 0.7.0, 11 at Phase 6, and 7 sample-mob tests) against each content jar and each ejected jar ([ADR 0033](adr/0033-java-project-eject-v1.md)). |
| End to end (mod) | CI headless server | From Phase 4, a "kitchen-sink" sample project is exported and loaded; load errors fail CI. From Phase 5 `fixtures/sample-mob/` is loaded too, with the real runtime and GeckoLib nested, and must log one entity type with no runtime or GeckoLib warning. From Phase 6 `fixtures/sample-script/` must log `loaded 11 script(s); 0 error(s)`, and the four parity runs must pass. From Phase 7 the `engine-mod` CI job is a matrix over `engine-mod/versions/` (26.3 and 26.4): JUnit, GameTests and parity per version, ejected builds for 26.3; since the mob expansion the sample mob and `fixtures/sample-creatures` are exported, server-checked and parity-run on every version (12 sample creatures tests on the 26.3 content jar, the 26.3 ejected jar and the 26.4 content jar). |
| AI helper and Creator (v0.7) | Vitest in `@msm/ai` and the app; Playwright | The loop against a scripted model client (parallel tool results in one message, invalid tool input, `max_tokens` and `refusal` before tools, limits, cancel, append-only history, cache placement); the key store with a fake `safeStorage`; every tool against a session fixture; the changeset (scratch check, one undo step, conflicts, per-item accept); a scripted build of a multi-kind mod that exports with zero blocking problems; the Creator's reopen rule (untouched, edited, renamed, removed, new pieces); e2e `ai-path` and `creator-path` with the scripted client, no network ([ADR 0041](adr/0041-ai-helper.md), [ADR 0043](adr/0043-creator-guided-flows.md)). Armour and materials: corpus cases, runtime GameTests, generator goldens and two more parity tests over the sample mod ([ADR 0042](adr/0042-armour-and-custom-tool-materials.md)). |
| App | Vitest + happy-dom; Playwright for Electron | Component tests; golden-path e2e (new project, block model, texture, export zip, reopen), data pack (with a function completion), launcher, library, recent, worldgen, blocks-items, entities (the WebGL preview under SwiftShader), scripting (Monaco TypeScript completion and problems, the ES5 script in the jar), eject (the Java project tree from `fixtures/sample-mod`), `ai-path` (scripted build and Explain), `creator-path` (Gear set with kept edits and Undo, Painting, Weapon), `plugins-path` (the sample plugin loaded, used and refused) and `targets-path` (a wizard, then Upgrade project target and Undo) e2e specs (15 files, 19 tests at 1.0), a Windows CI job that builds the sample external plugin, and smoke runs of the built and packaged app under xvfb. |

CI runs from Phase 0: Biome, type checks and unit tests on every push.

## 17. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation | Trigger to revisit |
|---|---|---|---|---|---|
| 1 | Minecraft version churn (three drops a year) | High | High | Targets package isolates version facts; mcdoc/mcmeta pinned per target; support N and N-1 only. | A release needs changes outside `packages/targets`. Status (1.0): two targets (26.3 and the 26.4 snapshot) each with its own runtime jar, CI matrix and per-target tests; the 26.4 release re-pin is a documented procedure (ROADMAP Phase 7 follow-ups). |
| 2 | Spyglass internal API instability | Medium | Medium | Wrap behind `@msm/schemas`; pin versions; keep a minimal own mcdoc reader as a fallback plan. | A Spyglass upgrade breaks more than `@msm/schemas`. |
| 3 | Registry freeze limits runtime registration | Medium | High | Prototype in Phase 4 week 1 before building editors; fall back to code generation (Tier 2) if dynamic registration hits limits. | Spike fails to register a block from `msm/` cleanly. Resolved: the Phase 4 spike passed ([ADR 0024](adr/0024-runtime-registration-spike.md)). |
| 4 | Scope creep ("anything possible") | High | High | MVP is resource packs only; each phase ships a usable version; non-goals written down. | A phase exceeds its estimate by 50%. |
| 5 | Shipping Mojang assets | Low | High | Never bundle; extract from the user's client jar at runtime; previews degrade gracefully. | Any export or installer contains vanilla assets. |
| 6 | GeckoLib API churn | Medium | Medium | Isolate behind the `msm:animated_model` component; MIT licence permits nesting; own minimal renderer is the fallback. | GeckoLib lags a supported target by more than one release. Status (Phase 5): GeckoLib 5.5.7 exists for Fabric 26.3; its Java API is confined to the runtime's bridge classes and its version, file name, URL and hash to the target ([ADR 0029](adr/0029-model-animation-pipeline.md), [ADR 0030](adr/0030-plugin-api-0.7.md)). Status (2026-11-14): the fallback is built as the runtime's own vanilla renderer ([ADR 0072](adr/0072-vanilla-model-renderer.md)); `renderer: auto` mobs use it wherever GeckoLib is absent, which is how mobs work on 26.4. |
| 7 | Electron bundle size and memory | Medium | Low | 150 MB budget; asar; lazy-load Monaco and the 3D preview. | Installer exceeds budget. |
| 8 | Solo bus factor | High | High | Docs-first repo, DEVLOG per session, ADRs, CI from Phase 0. | Two sessions without a DEVLOG entry. |
| 9 | Blockbench format drift | Medium | Low | Import only documented `.bbmodel` fields; version-check and warn. | Unknown format version seen in the wild. |
| 10 | Competitor overlap (MCreator) | Medium | Medium | Differentiate: version-isolated targets, true vanilla export, open plugin API, Blockbench interop, code escape hatches. | A competitor ships equivalent vanilla export and eject. |
| 11 | Script engine and transpiler limits (Rhino's partial ES2015+, TypeScript 7 dropping ES5) | Medium | Medium | TypeScript 6.x `transpileModule` to ES5 CommonJS for Rhino 1.9.2 at the ES6 language level; the curated `lib` set matches what Rhino implements; the sandbox's time budget protects the server thread; GraalJS stays the fallback ([ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md)). | The repository moves to TypeScript 7 (keep a 6.x copy for the transpiler, or a superseding ADR), Rhino 2.0 parses classes and `for...of` natively (re-probe), or realistic scripts need what neither can run. |
| 12 | AI helper: the user's key, project content and cost leave the machine (v0.7) | Medium | Medium | Key only in main under `safeStorage`; nothing sent until the user sends a message; the panel and Settings say what is sent; edits never applied silently (changeset, one undo step); per-run limits, task budget, Stop, usage and approximate cost shown; no network in tests ([ADR 0041](adr/0041-ai-helper.md)). | A report of content sent without a user action, or a run that cannot be stopped. Status (0.7.0): built as described; the Linux `basic_text` keyring counts as unavailable, so no key is stored in plain text. |
| 13 | Third-party plugin code runs on the user's machine (Phase 7) | Medium | High | One Web Worker per plugin under the `msm-app://` origin with a strict CSP (no network, no `file:` access, no string evaluation), storage globals removed, deadlines per call, results checked, manifest and API range checked before any code runs; Settings names each plugin and its state; the guide says to install only plugins you trust ([ADR 0035](adr/0035-plugin-sandbox-and-capability-manifest.md)). | A probe shows a worker reaching the network, the file system or the app's IPC. |

## 18. Open Questions

1. **Fabric Loom for 26.3:** exact plugin id and version of the non-remapping variant. Resolved at Phase 4: plugin id `net.fabricmc.fabric-loom`, version from `engine-mod/versions/<mc>.properties` `loom_version` (1.19.3 for both targets at 1.0; [ADR 0024](adr/0024-runtime-registration-spike.md), [ADR 0038](adr/0038-per-version-runtime-builds.md)).
2. **Rhino coverage:** whether Rhino's ES6 mode covers enough of what esbuild emits for realistic scripts, or whether we switch to GraalJS. Resolved at Phase 6: Rhino 1.9.2 stays; it cannot parse classes, `for...of`, call spread or `async`, and esbuild cannot lower them, so scripts are transpiled by TypeScript to ES5 CommonJS, which Rhino runs; see [ADR 0031](adr/0031-rhino-runtime-and-typescript-es5-scripts.md) (partly superseding [ADR 0003](adr/0003-rhino-for-scripting.md)).
3. **GeckoLib versus own renderer:** whether GeckoLib remains the animated-model backend long term, given churn risk. Open after 1.0: GeckoLib stays for 1.x ([ADR 0029](adr/0029-model-animation-pipeline.md)); a target without a GeckoLib build (26.4 at 1.0) hides the mob starter and blocks mob export with `export.no-geckolib-target`, which is the fallback the churn risk asked for. Resolved 2026-11-14: GeckoLib stays the full-fidelity renderer where the target has it, and the runtime's own vanilla renderer draws every other mob ([ADR 0072](adr/0072-vanilla-model-renderer.md)), so 26.4 offers mobs; only `renderer: geckolib` mobs report `export.no-geckolib-target`.
4. **Auto-update provider:** resolved 2026-11-04: the user chose MIT and a public `MEZTKING/MCSuperMods` repository, so release builds publish to its GitHub Releases and the app updates itself with `electron-updater` using the GitHub provider. Unsigned Windows builds update fine (first install shows a SmartScreen warning). Implemented in Phase 2 ([ADR 0018](adr/0018-auto-update.md)): the installed Windows app checks a few seconds after start-up (setting "Check for updates automatically", on by default) and from Help, Check for Updates, downloads in the background and installs only when the user chooses Restart to update. The release workflow uploads the installer, its blockmap and `latest.yml` to a draft release, which the maintainer publishes by hand.
5. **Plugin sandbox mechanism:** `isolated-vm` versus an Electron utility process for third-party plugins. Resolved: one Web Worker per plugin in the renderer under the `msm-app://` scheme, shipped in 0.7.0; see [ADR 0035](adr/0035-plugin-sandbox-and-capability-manifest.md).
6. **NeoForge:** whether to add a NeoForge target in 1.x.
7. **mcmeta branch naming:** which `misode/mcmeta` branches or refs to pin per target. Resolved: see [ADR 0006](adr/0006-mcmeta-refs.md).
8. **Electron version:** which stable Electron line to start on. Resolved: see [ADR 0001](adr/0001-electron-over-tauri.md) and [ADR 0004](adr/0004-phase0-toolchain.md).
9. **Save-time data loss:** load skipped invalid element files and save deleted `content/**/*.json` files it did not write, so saving after a failed load could delete the skipped files. Resolved: save deletes only files it loaded and is never blocked; see [ADR 0012](adr/0012-save-deletes-only-loaded-files.md).
10. **Licence:** resolved 2026-11-04 by the user: MIT for the whole repository (app, packages and the future `msm_runtime` mod), with credit through the retained copyright notice. `LICENSE` is at the repository root. Projects and packs made with MCSuperMods belong to their authors. The repository is to be made public, which unblocks auto-update via GitHub Releases (Q4).
11. **Toolchain upgrades:** when to move from pnpm 10 to pnpm 12 and `.nvmrc` from Node 22 to Node 24. Resolved 2026-11-04: both at the start of Phase 2 (Node 24.22.2, pnpm 12.16.1); see [ADR 0017](adr/0017-phase2-toolchain.md).
12. **MSM-authored preview fallback parents:** seven parent models (`msm:block/cube`, `cube_all`, `cube_column`, `cube_bottom_top`, `cross`, `msm:item/generated`, `msm:item/handheld`) are written from scratch, used only for preview without a client jar and never exported. Decided: acceptable under "never bundle Mojang assets"; still awaiting the user's veto or acceptance at Phase 2 close ([ADR 0010](adr/0010-preview-with-deepslate.md)). If vetoed, they are removed and the preview without a client jar shows only models that declare their own `elements`.
13. **Spyglass JSON checker adoption:** whether the Spyglass JSON checker replaces `validateJson` as the JSON gate. Open. Phase 2 uses Spyglass for mcfunction only ([ADR 0014](adr/0014-mcfunction-diagnostics-with-spyglass.md)). Loading the vendored mcdoc symbols into Spyglass for JSON and NBT inside commands works in the app at Phase 2 close; whether that justifies replacing `validateJson` for JSON files is revisited when a later phase needs it.
14. **AI assistant:** resolved 2026-11-05 by the user's request to build it first: see [ADR 0041](adr/0041-ai-helper.md) and the "AI helper" subsection of [Editors and UX](#8-editors-and-ux). It is host code (a pure package `@msm/ai` plus main and renderer parts), not a plugin, because plugins have no network, no editors and no commands; it reaches plugin content only through the session; the key lives in main under `safeStorage`; project content is sent only when the user sends a message and the panel says what; edits land as one reviewable changeset applied as one undo step; cost is shown per run with limits. Shipped in v0.7.0 (2026-11-06), before 1.0, together with the Creator, armour, gear and the Phase 7 work done by then.

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
