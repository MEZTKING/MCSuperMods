# ADR 0020: Templates, starters and examples as plugin contributions

## Context

On 2026-11-04 the user asked for "a template for every type, project starters, examples gallery" before Phase 3: a template for every element kind with useful starting content validated against the current target, New Project starters such as "Custom ore" and "Recipe pack", and an examples gallery with one commented example per kind, exported and validated in CI.

Until now element templates were hard-coded in the app (`app/src/renderer/src/studios/templates.ts`: 20 entries plus a generic `kind:<id>` fallback per uncovered kind). New Project created a blank project with one `pack` element. The only sample content was the two fixtures under `fixtures/`, which exist for the in-game checks and the exporter goldens, not for users. Three problems follow from that: content for a kind lives far from the plugin that owns the kind; a third-party plugin (Phase 7) cannot offer templates, although [Plugin System](../DESIGN.md#7-plugin-system) says built-ins have no private hooks; and there is no way to start from, or learn from, a complete working project inside the app.

Two constraints shape the content. A vanilla pack cannot add a block or item until Phase 4 brings the content jar ([Architecture Overview](../DESIGN.md#3-architecture-overview)). And MSM never bundles Mojang assets, so placeholder textures and sounds must come from somewhere else.

## Decision

**D1. Three new contribution points in `@msm/plugin-api` 0.4.0.** `PluginContributions` gains `elementTemplates`, `projectStarters` and `examples`. All three are additive and interpreted by the host; they carry no Node or DOM types (binaries are `Uint8Array`). The host (the app) owns pickers and dialogs; plugins own content. In `packages/plugin-api/src/library.ts`, re-exported from the package index:

- `TemplateContext`: the new element's `id`, its `namespace` and `path`; `projectNamespace` (the first project namespace other than `minecraft`, else `namespace` when it is not `minecraft`, else `my_project`), used for references to other project content; every `namespaces` of the open project; and `kindDefault`, a deep copy of the kind's `defaultData` or `undefined`.
- `ElementTemplate`: `id` (unique across plugins; the host renders `data-testid="template-<id>"`), `kind` (registered by the same plugin), `title`, `description`, `category` (a picker group in British English, for example `Recipes`, `Models`, `Tags`), optional `prefix` (prepended to the typed name: `block/`, `item/`, `blocks/`), `defaultName`, `fixedName` (one `sounds` file per namespace), `defaultNamespace` (`minecraft` for the tick and load tags), and a pure `data(context): Json`. The host validates the result like any user edit.
- `ContentBundle`: `elements` (each with `id`, `kind`, `data`, optional `notes` that become `meta.notes`, optional `tags` that become `meta.tags`) and `assets` (generated binaries, never Mojang assets, each with `namespace`, a `path` relative to `assets/<namespace>/`, and `bytes`).
- `BundleContext`: the project's `namespace` (derived from the folder name, or the open project's) and `projectName`.
- `ProjectStarter`: `id`, `title`, `description`, `category` (`blank` for no content, `pack` for one minimal layer or both, `content` for a themed bundle), `layers` (shown as badges), `requiresKinds` (the host hides a starter whose kinds are not all registered) and `build(context): ContentBundle`.
- `ExampleProject`: `id`, `title`, `description`, `kind` (the kind it teaches; the gallery's main filter), `category`, optional `tags`, `requiresKinds` and `build(context): ContentBundle`.

The host enforces these rules, with tests in the app and in `@msm/exporters`:

- A template's `kind` must be registered by the plugin that contributes it. Starters and examples may use any registered kind through `requiresKinds`, which is how one bundle spans resource-pack and data-pack kinds.
- Bundles are self-contained: every reference is a vanilla id or an id inside the same bundle. Templates reference only vanilla ids, ids derived from the element's own id (`<ns>:block/<name>`), or the project root advancement `<projectNamespace>:root`.
- The host adds `<namespace>:pack` (`minecraft:pack_mcmeta`) when a bundle has none, so every new project keeps a `pack.mcmeta`.
- Asset bytes are written immediately, as `importAssets` does, and recorded with `addAsset`; the elements go in as one undo step ("Add starter <title>" or "Copy example <title>").

`API_VERSION` becomes `0.4.0` with a CHANGELOG entry; the built-in plugins declare `^0.4.0` and `tools/new-plugin` scaffolds `^0.4.0`. As with [ADR 0017](0017-phase2-toolchain.md) (0.2.0 to 0.3.0), the bump and every plugin range change land in one brief (B60), so no release has a built-in that fails to load.

**D2. Where content lives.**

- Element templates live in the plugin that owns the kind: `packages/plugins/resourcepack/src/templates/` and `packages/plugins/datapack/src/templates/`. The app's `studios/templates.ts` keeps only host logic: merging plugin templates, the generic `kind:<id>` fallback for third-party kinds without templates, `templateElementId` and `projectNamespace`. The target is 66 templates (14 resource pack, 52 data pack) covering all 30 built-in kinds. The twenty existing template ids are kept, so the existing e2e specs and tests stay valid.
- Starters, examples and the placeholder-asset generators live in a new built-in plugin, `@msm/plugin-library` (plugin id `msm.library`, `packages/plugins/library/`, scaffolded with `tools/new-plugin`). It contributes no element kinds. It depends only on `@msm/plugin-api` (and `@msm/schemas` if needed), like every plugin. Cross-plugin validation of its bundles happens in `packages/exporters/test/`, which already loads the real plugins in tests; `tools/check-deps/layers.json` lets `@msm/exporters` use `@msm/plugin-library` as a test dependency.
- Eight starters: `blank`, `resource_pack`, `data_pack`, `combined`, `custom_ore`, `recipe_pack`, `music_disc`, `function_starter`.
- Thirty-four examples: one commented example per built-in kind (30), each self-contained, with `notes` of three to six sentences naming each field and what to change; plus the four content starters listed again under the category `Starters`.
- Examples are TypeScript data in the library plugin, which is the source of truth, and are mirrored on disk as ordinary MSM projects under `examples/` in the repository, for browsing on GitHub and opening with File > Open: `examples/all-kinds/` (every per-kind example in namespace `msm_examples`) and `examples/starters/<starter id>/` (each content starter built with namespace `msm_starter`), plus `examples/README.md`. The mirror is a golden: `UPDATE_GOLDENS=1` rewrites it and CI fails when it drifts.

**D3. Placeholders without Mojang assets.**

- Textures: a deterministic 16×16 PNG generator in `packages/plugins/library/src/assets/png.ts`, a port of the stored-deflate encoder in `fixtures/sample-resourcepack/tools/make-textures.mjs` with four patterns (`plain`, `ore`, `gem`, `disc`). It is byte-stable, so goldens pin its output. PNGs are generated at runtime, never embedded as data URIs.
- Sounds: no Ogg bytes are generated or bundled, because a valid Ogg Vorbis stream cannot be written by hand deterministically and a binary blob in source would need provenance. The music-disc starter defines its sound event `<ns>:music_disc.<song>` in `sounds.json` pointing at the vanilla sound file `minecraft:records/cat` with `stream: true`. Its notes, and later the user guide, tell the user to import their own `.ogg` under `sounds/` and change the entry. The reference validates with zero unknown ids and plays in-game, because the sound file comes from the player's own game.

**D4. "Custom ore" before Phase 4.** Because a vanilla pack cannot add a block or item, the Custom ore starter is a reskin of emerald ore as "Ruby Ore" until Phase 4: models and generated textures in the project namespace (`block/ruby_ore`, `item/ruby`); the `minecraft:emerald_ore` blockstate, the `minecraft:emerald` item definition, the `minecraft:blocks/emerald_ore` loot table and `minecraft:en_us` lang overrides in the `minecraft` namespace; and a ruby block recipe, a `gems` item tag, and a `root` plus `get_ruby` (`inventory_changed`) advancement in the project namespace. The starter description says it replaces emerald ore. Phase 4 replaces it with a real `msm:block` ore starter.

**D5. UI placement.** The change is non-breaking for existing users and tests.

- Toolbar "New" and File > New Project… keep creating a blank project directly. A split arrow on the toolbar button, File > New Project from Starter… (menu command `newProjectFromStarter`) and a palette entry open the New project dialog, which lists starters grouped by category with layer badges; submitting runs the usual folder picker and then `session.newProject({ starter })`.
- Help > Examples… (menu command `examples`) and the palette entry "Examples…" open the Examples gallery: a search box (title, kind, category, tags), a kind filter, a detail pane showing the notes, and two actions. "Open as new project" runs the folder picker, then `newProject` with the bundle. "Copy into my project" needs an open project, offers a namespace select and calls `session.addBundle`; duplicate ids are reported, not thrown.
- The New element dialog groups templates under category headings and gains a filter box. `data-testid="template-<id>"` is unchanged.
- The editor area shows `meta.notes` in a collapsible, read-only "Notes" callout when present, so a copied example keeps its explanation. Editing notes is out of scope.

**D6. Verification.**

- Every template, for every `builtInTargets` bundle: `validateJson` of `data(context)` for a test namespace yields zero errors and zero `schema.unknown-id` warnings, with the registry seeded with the derived ids; the lowered file validates too; functions pass the mcfunction service with zero errors.
- Every starter and example bundle, for every target: built into a memory project with the real plugins, saved and reloaded with `loadProject`, zero problems; resource and data packs exported with function text validated and zero problems; the `examples/` mirror equals the generated output.
- App: component tests for the three dialogs and an e2e spec `library-path.spec.ts` (Custom ore starter, export both packs, copy an example in, open an example as a new project, reopen).
- Field names inside 26.3 shapes that the plan could not confirm (the `smithing_trim` pattern field, enchantment effect values, `select` on a component, the `jukebox_playable` component syntax in commands) are "(verify at implementation)": the tests against the vendored schema and the mcfunction checker decide, and executors report every fallback.

**Decisions pending the user's veto.** The main session made three defaults on the user's behalf; each stands unless the user vetoes it:

1. The Custom ore starter is an emerald-ore reskin ("Ruby Ore") until Phase 4 adds real blocks (D4).
2. The music-disc starter references the vanilla `minecraft:records/cat` sound file (streamed) and explains how to swap in an own `.ogg`; no audio is bundled (D3). The user may instead supply an original `.ogg` to ship as the placeholder.
3. Examples are mirrored on disk under `examples/` as generated golden projects (D2). If vetoed, examples stay in-app only and the mirror test is dropped.

## Consequences

- Third-party plugins (Phase 7) can contribute templates, starters and examples through the same public API as the built-ins, keeping the "no private hooks" rule.
- Template content moves next to its kind, so a new kind and its templates land in one plugin and one test; the app keeps only the picker.
- A ninth built-in plugin, `@msm/plugin-library`, with no element kinds. It adds roughly 100–200 kB of template and bundle code to the renderer, well inside the 8 MB budget ([Bundle budget](../DESIGN.md#bundle-budget)).
- `@msm/plugin-api` goes from 0.3.0 to 0.4.0; the change is additive, and `registerPlugin` still ignores contribution fields it does not know.
- The repository gains `examples/`, about five generated projects with small generated PNGs. CI fails when the mirror drifts from the plugin's data, so the two cannot diverge silently.
- The Custom ore starter changes how emerald ore looks and drops in any world with the pack enabled; that is the price of a vanilla-only ore before Phase 4, and the starter says so.
- The music disc plays the cat record until the user imports their own sound.
- ROADMAP lists the work as "Phase 2 add-on — Templates and samples library" (briefs B60–B67). The Phase 7 "Templates and wizards" item narrows to the wizards and the Phase 4 and 5 starters (custom sword, custom mob, real ore).
- No new third-party dependencies.

## Status

Accepted and implemented (2026-11-04, B60–B68, released in v0.2.2): 66 element templates in the resource and data pack plugins, 8 project starters and 34 examples in `@msm/plugin-library`, `examples/` mirror, New project dialog, Examples gallery, grouped template picker, Notes callout. Follow-up fixes in B68: `sound_event` ids from sounds elements, type-argument dispatchers read from enclosing objects (select on `minecraft:component`), project-wide scoreboard objectives for mcfunction checks. The three defaults recorded above stand unless the user vetoes them.

Note (2026-11-05, Phase 4 Wave 3, B98): the D4 default (Custom ore as an emerald ore reskin) is superseded by Phase 4. The starter is now a real `msm:block` ruby ore with an `msm:item` ruby, a Block of Ruby and an `msm:mod` element, exported as a Fabric mod jar ([ADR 0025](0025-msm-definition-format-v1.md), [ADR 0026](0026-fabric-content-jar.md)); it no longer overrides anything in the `minecraft` namespace. The text above records the decision as it was made. Library counts now: 106 templates, 11 starters, 61 examples.
