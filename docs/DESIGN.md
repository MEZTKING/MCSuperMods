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
|  Validation gate (Spyglass) -> Exporters                      |
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
- An **asset** is an opaque file (`.png`, `.ogg`, `.bbmodel`, `.nbt`) referenced by project-relative path. Importers produce elements and assets, never a parallel model.

### Element kinds

There are two classes of element kind:

- **Vanilla kinds** map 1:1 to a data or resource pack file: `minecraft:recipe`, `minecraft:block_model`, `minecraft:biome`, and so on. Their schema comes straight from vanilla-mcdoc.
- **MSM kinds** (`msm:block`, `msm:item`, `msm:entity`, `msm:script`, ...) are higher-level. They **lower** to a set of vanilla files plus `msm/` runtime definitions at export time.

Lowering is a pure function: `lower(element, target) -> OutputFile[]`. Everything bottoms out in files, so all exporters share one pipeline: collect elements, lower against the target, validate the lowered output with Spyglass, write.

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

IDs are stable `namespace:path` ResourceLocations. The schema marks which fields are references, and `@msm/core` builds a **reference index** from them: for every id, which elements point at it. A rename is an explicit refactor command that moves the element file and rewrites every referencing field as one undoable command. Dangling references surface as problems, not silent breakage.

## 5. Project File Format

A project is a **directory**, designed for git: one JSON file per element, a layout mirroring Minecraft's, deterministic serialisation.

```
MyMod/
  msm.project.json                                  # formatVersion, name, namespaces, targets, plugins, settings
  content/<namespace>/<kind-folder>/<path>.json     # one element per file
  assets/<namespace>/...                            # raw binaries: textures, sounds, .bbmodel, .nbt
  scripts/<namespace>/*.ts                          # Tier-1 scripts
  .msm/                                             # cache, git-ignored: generated .d.ts, thumbnails, index
```

The kind-folder is declared by the element kind: `recipe/` for `minecraft:recipe`, `msm/block/` for `msm:block`, and so on. A ruby ore block therefore lives at `content/mymod/msm/block/ruby_ore.json`.

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
- `.msm/` is a disposable cache; deleting it never loses work.

### Migrations

The project and each element carry `formatVersion`; `@msm/core` runs append-only migrators on load. **Target changes are not file migrations.** Moving from 26.2 to 26.3 is handled by target plugins at lowering time; for breaking cases an explicit "Upgrade project target" command rewrites affected elements and reports the changes.

## 6. Schema System (mcdoc)

We do not hand-write schemas. Vanilla file formats are described by **mcdoc**, the schema language maintained by the Spyglass project, and `SpyglassMC/vanilla-mcdoc` tracks every Minecraft release and snapshot (a `26.3.0` tag exists).

### Libraries

`@msm/schemas` wraps `@spyglassmc/core`, `@spyglassmc/mcdoc` and `@spyglassmc/java-edition`, used as libraries. Spyglass types never leak past `@msm/schemas`; it exports our own `SchemaNode` model. This insulates the rest of the codebase from Spyglass internal API changes (section 17).

### Pins and extensions

- Each target declares one `vanilla-mcdoc` git ref. `@msm/schemas` resolves it; `tools/sync-mcdoc` updates the vendored copy.
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

`misode/mcmeta` publishes per-version registries, block states and summaries. Each target pins an mcmeta ref (branch names: verify at implementation). `@msm/schemas` loads registries for the active target and merges them with ids defined in the project, feeding autocomplete and reference validation.

### Caching

Parsed mcdoc and mcmeta data are cached in `~/.msm/cache/`, keyed by pinned refs, so later loads are fast and work offline.

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
- **Power-user path.** Every element has a **Raw JSON** tab (Monaco with Spyglass diagnostics), the command palette, scripts and eject-to-Java.

Both paths edit the same element through the same command stack, so switching between them is lossless and undo history is shared.

### Studio views by phase

| Phase | Studios |
|---|---|
| 1 | Texture Studio, Model Studio (block/item models, blockstates), Sound Studio, Lang editor, Pack settings |
| 2 | Recipe Studio, Loot Table Studio, Advancement Studio, Tag editor, Function editor |
| 3 | Structure Studio (import, preview, jigsaw pools), Biome Studio, Feature Studio |
| 4 | Block Studio, Item Studio |
| 5 | Entity Studio, Animation preview |
| 6 | Script editor |

### Command palette

Every plugin command is reachable from a keyboard-driven palette (create, rename, export, test, switch target).

### Preview panel

three.js with Misode's `deepslate` renders models, structures, worldgen and imported Blockbench entities. Vanilla textures come from the user's own client jar (section 13); without one, previews degrade to untextured geometry.

### "Test in Minecraft"

- **Phase 1:** export the resource pack and copy it into the user's `resourcepacks` folder; the user enables it in-game.
- **Phase 4:** launch a **managed Fabric test instance** with `msm_runtime` and the current content jar installed, from inside the app.

### Error surfacing

A Problems panel, fed by Spyglass, lists schema violations, dangling references and lowering errors, each linked to its element and field. Errors block export; warnings do not.

## 9. Targets and Exporters

### Targets

A target is one Minecraft version's facts, packaged as `@msm/target-mc-<version>` under `packages/targets/`. No other package contains a version number.

```ts
interface Target {
  id: string;                 // "mc-26.3"
  mcVersion: string;          // "26.3"
  java: number;               // 25
  packFormats: { resource: number; data: number };   // (verify at implementation)
  mcdocTag: string;           // vanilla-mcdoc ref, e.g. "26.3.0"
  mcmetaRef: string;          // misode/mcmeta ref (verify at implementation)
  fabric: { loader: string; api: string; loom: string };   // (verify at implementation)
  geckolib?: string;          // 5.5+ line; 26.3 build (verify at implementation)
  migrateFrom?(previous: Target, project: Project): MigrationReport;
}
```

Support policy: the current release (26.3) and the previous one (26.2) at launch; snapshots are best-effort.

### Exporters

| Exporter | Output | Phase |
|---|---|---|
| `vanilla-packs` | Resource pack `.zip`, data pack `.zip`, or a combined folder | 1 |
| `fabric-content-jar` | Jar with `assets/`, `data/`, `msm/`, `fabric.mod.json`; `msm_runtime` nested by default; GeckoLib nested when used | 4 |
| `java-project` | Standalone Gradle project with generated Java (eject) | 6 |

### Pipeline

1. **Collect** all elements in the enabled namespaces.
2. **Lower** each element against the chosen target into `OutputFile[]`.
3. **Merge** outputs; conflicts on the same path are errors.
4. **Validate** every JSON output with Spyglass against the target's vanilla-mcdoc and MSM mcdoc.
5. **Write** via the exporter: zip, folder, jar or Gradle project. Output is deterministic (stable ordering, fixed zip timestamps), and each output includes an `msm.export.json` manifest listing target, MSM version and plugins.

### Validation gate

Step 4 is a hard gate. Invalid lowered output is a bug in a lowering function or target, not a user error; the export stops with a report. CI runs the same check on golden fixtures.

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
- **Asset extraction:** vanilla textures and models are read from `versions/<v>/<v>.jar` of the user's installed client into `~/.msm/cache/` for previews. **These assets are never redistributed** and never written into exports.
- **Launching:** Phase 1 is manual (copy pack, user starts the game). Phase 4 adds a managed instance created with the Fabric installer and a vanilla launcher profile (verify at implementation).

We are read-only on the user's game directory, except for copying packs into `resourcepacks`/`datapacks` and managing our own instance folder.

## 14. Tech Stack

### Desktop app

We use **Electron**, not Tauri.

| Choice | Why |
|---|---|
| Electron (current stable; verify at implementation) | One language end to end; Chromium guarantees WebGL2 for the 3D preview (Tauri on Linux uses WebKitGTK, where WebGL is unreliable); Blockbench is Electron. |
| electron-vite, electron-builder | Build/HMR; Win/macOS/Linux packaging with asar. Auto-update deferred. |
| React 19 + TypeScript (strict), Zustand | Mainstream and typed; Zustand for UI-only state. |
| Immer + RFC 6902 patches | Command stack and undo/redo in `@msm/core`. |
| Radix primitives + Tailwind CSS | Accessible primitives; copied shadcn-style components; no runtime UI-library dependency. Icons: Lucide. |
| Monaco Editor | mcfunction, JSON and TypeScript editing with Spyglass diagnostics bridged in. |
| three.js + deepslate | 3D preview; deepslate renders block models, structures and worldgen. |
| `@spyglassmc/*`, prismarine-nbt, fflate or yauzl/yazl, esbuild, zod | Schemas and validation; NBT; zip; script transpilation; our own config validation. |

### Monorepo and tooling

| Choice | Why |
|---|---|
| pnpm workspaces + Turborepo | Fast installs, task caching. |
| TypeScript project references, tsup | Enforce dependency direction; build library packages. |
| Vitest, Biome | Fast tests with golden snapshots; lint and format in one tool. |
| Node current LTS (verify at implementation) | Tooling runtime; Electron bundles its own. |

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

All OS access (filesystem, processes, zip, dialogs, Minecraft discovery and launch) goes through a single `PlatformAdapter` interface implemented in `app/main/`. Renderer code and packages never call Node or Electron APIs directly. This keeps `@msm/core` testable and leaves a Tauri port possible.

### Bundle budget

Installer under 150 MB. Monaco and three.js are lazy-loaded; asar packaging and dependency pruning are on by default. Memory and size are tracked in CI from Phase 1.

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
│   ├── targets/     CLAUDE.md    # @msm/target-*
│   └── interop/     CLAUDE.md    # @msm/interop
├── engine-mod/                   # msm_runtime (Fabric, Java 25)
│   └── CLAUDE.md
└── tools/                        # sync-mcdoc, sync-mcmeta, new-plugin
```

Built-in plugins under `packages/plugins/`: `resourcepack/`, `datapack/`, `structures/`, `worldgen/`, `blocks-items/`, `entities/`, `models-anim/`, `scripting/`. Each is its own npm package `@msm/plugin-<name>` and depends only on `@msm/plugin-api` and `@msm/schemas`.

### Dependency direction

```
plugin-api  <-  schemas  <-  core  <-  plugins / exporters / targets / interop  <-  app
```

`@msm/plugin-api` depends on nothing internal. The direction is enforced by TypeScript project references and Biome import rules; a reverse import fails CI.

### Naming

- npm scope `@msm/*`; mod id `msm_runtime`; Java package `dev.mcsupermods.runtime`.
- Runtime definitions in jars live under `msm/`, a sibling of `assets/` and `data/`.
- Project root file: `msm.project.json`.

## 16. Testing Strategy

| Level | Tooling | What it covers |
|---|---|---|
| Unit | Vitest | IR, serialisation, migrations, patches and undo/redo, renames. |
| Lowering | Vitest golden files | Each lowering function per target, under `fixtures/<target>/expected/`. |
| Schema conformance | Spyglass in CI | Every lowered output validated against vanilla-mcdoc and MSM mcdoc. A failure is a bug. |
| Engine mod logic | JUnit 5 | Definition parsing, component graph construction. |
| Engine mod behaviour | Fabric GameTest | Components and events in a running server. |
| End to end (mod) | CI headless server | From Phase 4, a "kitchen-sink" sample project is exported and loaded; load errors fail CI. |
| App | Playwright for Electron | Golden-path smoke test: new project, add block, export. |

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
| 7 | Electron bundle size and memory | Medium | Low | 150 MB budget; asar; lazy-load Monaco and three.js. | Installer exceeds budget. |
| 8 | Solo bus factor | High | High | Docs-first repo, DEVLOG per session, ADRs, CI from Phase 0. | Two sessions without a DEVLOG entry. |
| 9 | Blockbench format drift | Medium | Low | Import only documented `.bbmodel` fields; version-check and warn. | Unknown format version seen in the wild. |
| 10 | Competitor overlap (MCreator) | Medium | Medium | Differentiate: version-isolated targets, true vanilla export, open plugin API, Blockbench interop, code escape hatches. | A competitor ships equivalent vanilla export and eject. |

## 18. Open Questions

1. **Fabric Loom for 26.3:** exact plugin id and version of the non-remapping variant (verify at implementation).
2. **Rhino coverage:** whether Rhino's ES6 mode covers enough of what esbuild emits for realistic scripts, or whether we switch to GraalJS.
3. **GeckoLib versus own renderer:** whether GeckoLib remains the animated-model backend long term, given churn risk.
4. **Auto-update provider:** which update channel electron-builder publishes to (GitHub Releases or other).
5. **Plugin sandbox mechanism:** `isolated-vm` versus an Electron utility process for third-party plugins.
6. **NeoForge:** whether to add a NeoForge target in 1.x.
7. **mcmeta branch naming:** which `misode/mcmeta` branches or refs to pin per target (verify at implementation).
8. **Electron version:** which stable Electron line to start on (verify at implementation).

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
