# ADR 0022: Worldgen element model, plugin-api 0.5.0 and project validators

## Context

Phase 3's exit criterion is "a custom biome containing a custom jigsaw structure generates in a 26.3 world" ([ROADMAP](../ROADMAP.md)). That needs the whole worldgen chain as elements: biomes, configured and placed features, dimensions, world presets, template pools, structures, structure sets and processor lists, plus the worldgen tags that connect them.

Facts checked on 2026-11-04 against the vendored data of the `mc-26.3` target (the binder table of `@spyglassmc/java-edition` 0.3.70, the vanilla-mcdoc `minecraft:resource` dispatcher with 82 members, and the mcmeta registries):

- Worldgen files live under `data/<ns>/worldgen/<registry>/`, dimensions under `data/<ns>/dimension/`.
- 26.3 renames `worldgen/configured_feature` to `worldgen/feature` and `worldgen/configured_carver` to `worldgen/carver`, and adds three data-driven registries: `worldgen/block_state_provider`, `worldgen/material_condition` and `worldgen/material_rule`. The old names are gated `until 26.3` in mcdoc, so `resource:worldgen/configured_feature` correctly fails to resolve on 26.3.
- Every Phase 3 schema ref resolves with zero unsupported nodes in the existing form model ([ADR 0015](0015-data-pack-element-model.md)), so forms need no schema-model work.
- Tag registries `tag/worldgen/biome`, `tag/worldgen/structure` and `tag/worldgen/world_preset` exist in mcmeta.

Two gaps in the plugin contract surfaced. The app derives a kind's registry from its id with an allow-list (`kindRegistry()` in the renderer), so a plugin cannot say which registry its ids belong to. And some worldgen mistakes are invisible to a per-file schema: the vanilla "Feature order cycle" crash comes from two biomes listing placed features in conflicting orders, which no single file shows.

Vanilla cannot append a biome to the existing overworld biome source from a data pack; a custom biome reaches a world through a dimension or a world preset.

## Decision

**D4. Two plugins; kind ids follow registry names.** Each kind maps one element to one JSON file through a `lowerJsonData`-style helper. Each plugin keeps its own copy of the helper, because `@msm/plugin-api` holds interfaces only.

- `@msm/plugin-structures` (`msm.structures`): `minecraft:structure_template` ([ADR 0021](0021-structure-templates-and-nbt.md)), `minecraft:worldgen/template_pool`, `minecraft:worldgen/structure`, `minecraft:worldgen/structure_set`, `minecraft:worldgen/processor_list`. Schemas are `resource:worldgen/<name>`; kind folders `worldgen/<name>` and `structure`.
- `@msm/plugin-worldgen` (`msm.worldgen`), fourteen kinds. Tier A, with templates and studios where [Editors and UX](../DESIGN.md#8-editors-and-ux) names one: `minecraft:worldgen/biome`, `minecraft:worldgen/feature` (configured feature), `minecraft:worldgen/placed_feature`, `minecraft:dimension`, `minecraft:worldgen/world_preset`. Tier B, schema form plus one template each: `minecraft:worldgen/noise_settings`, `minecraft:worldgen/density_function`, `minecraft:worldgen/noise`, `minecraft:worldgen/carver`, `minecraft:worldgen/flat_level_generator_preset`, `minecraft:worldgen/multi_noise_biome_source_parameter_list`, `minecraft:worldgen/block_state_provider`, `minecraft:worldgen/material_condition`, `minecraft:worldgen/material_rule`.
- `minecraft:dimension_type` stays in `@msm/plugin-datapack`; moving it would change the plugin list of existing projects for no gain.
- `@msm/plugin-datapack` gains three tag kinds: `minecraft:tag/worldgen/biome`, `minecraft:tag/worldgen/structure` and `minecraft:tag/worldgen/world_preset` (schema `tag:worldgen/<name>`, folder `tags/worldgen/<name>`).

**Target facts.** `Target.folders.data` gains `structure` (`structure`), `dimension` (`dimension`) and `worldgen` (`worldgen`). `worldgen` is the parent folder of `worldgen/<registry>`, exactly as `tags` is the parent of `tags/<registry>`; kinds pass the registry as the subfolder. `Target.dataVersion` (5023 for 26.3) is used to write structure files. `Target.worldgen.featureSteps` lists the eleven decoration steps in order (`raw_generation` to `top_layer_modification`; the list is checked against the 26.3 `GenerationStep.Decoration` enum at implementation, verify at implementation); the Biome Studio labels its step lists and the feature-order validator bounds step indices from it. No code outside `packages/targets` names a step.

**`@msm/plugin-api` 0.5.0.** All additions are optional except `Target.dataVersion`, which is required; the CHANGELOG notes it, and there are no third-party targets yet.

- `DataFolderKey` gains `structure`, `dimension` and `worldgen`; `Target` gains `dataVersion: number` and `worldgen: { featureSteps: readonly string[] }`.
- `ElementKind.registry?: string`: the registry that ids of elements of this kind belong to; it defaults to the kind id without `minecraft:`. The app's registry index uses it instead of an allow-list.
- `PluginContributions.validators?: ProjectValidator[]`:

```ts
/** Cross-element checks a plugin runs over the whole project. */
export interface ProjectValidator {
  /** Unique id, e.g. `msm.worldgen.feature-order`. */
  id: string;
  /** Kind ids whose elements this validator reads; the host re-runs it when any of them changes. */
  kinds: readonly string[];
  /** Pure. Problems carry `elementId` and an RFC 6901 `path` where possible; codes are `<area>.<check>`. */
  validate(input: ValidationInput): Problem[];
}
export interface ValidationInput {
  /** Every element of the project (all kinds), in a stable order. */
  elements: readonly Element[];
  target: Target;
  /** Vanilla plus project ids, as the host's registry index sees them. */
  registry: { has(registry: string, id: string): boolean; ids(registry: string): readonly string[] };
}
```

`ValidationInput` carries no Node or DOM types. `API_VERSION` becomes 0.5.0; the built-in plugins and `tools/new-plugin` declare `^0.5.0`. As with 0.3.0 and 0.4.0 ([ADR 0017](0017-phase2-toolchain.md), [ADR 0020](0020-templates-starters-examples.md)), the bump and every range change land in one brief (B70).

**D8. Project validators.** The host runs every validator whose `kinds` intersect the changed kinds, debounced after the schema checks, and merges the results into the problem list with source `validator`, so an error disables export like any other ([Error surfacing](../DESIGN.md#error-surfacing)). The exporters' library test and the sample-worldgen golden run them in CI. Unknown ids stay `schema.unknown-id` warnings from the registry index; validators do not duplicate them.

- `msm.structures` (codes `structures.*`): `set-spacing` (error: `random_spread` with `separation` not below `spacing`); `unplaced-structure` (warning: a project structure in no structure set); `pool-empty` (warning: no elements and fallback `minecraft:empty`); `jigsaw-target-missing` (warning: no jigsaw named `target` among the target pool's project pieces or its fallback chain; skipped when the pool or its pieces are vanilla); `template-too-large` (warning); `newer-data-version` (info, on import).
- `msm.worldgen` (codes `worldgen.*`): `feature-order` (error: the same placed feature at different step indices in two biomes, or two placed features in opposite order within one step in two biomes; this is the class of the vanilla "Feature order cycle" crash); `biome-unreachable` (warning: a project biome in no project dimension or world-preset biome source); `preset-not-selectable` (info: a project world preset missing from the `minecraft:normal` and `minecraft:extended` world-preset tags); `preset-missing-overworld` (error: a world preset without `minecraft:overworld`; whether the nether and end are also required is checked at implementation, verify at implementation); `placed-feature-unused` (info).

**D5. How a custom biome and structure reach a world.** The supported biome route is a **world preset**: a `worldgen/world_preset` whose `minecraft:overworld` dimension uses `minecraft:noise` with `settings: minecraft:overworld` and a `multi_noise` biome source listing an explicit parameter set (the custom biome plus enough vanilla biomes to cover the climate space), with the nether and the end as in vanilla. A `tag/worldgen/world_preset` element `minecraft:normal` adds it to `#minecraft:normal`, so it appears under World Type when creating a world. The structure route is independent: a jigsaw `worldgen/structure` whose `biomes` is a project biome tag listing the custom biome and `#minecraft:is_forest`, placed by a `worldgen/structure_set` with `random_spread`, `step: surface_structures`, `project_start_to_heightmap: WORLD_SURFACE_WG` and `terrain_adaptation: beard_thin`. Structure sets load when a world opens, so the structure also appears in new chunks of an existing world after the pack is installed and the world reopened, but not after `/reload`.

**Automated proxy for the exit criterion.** CI cannot run the game, so the exit criterion is proven by a proxy and then checked by the user:

1. Every new template and bundle validates per target with zero errors and zero unknown ids; lowered files validate; the `examples/` mirror stays a golden ([ADR 0020](0020-templates-starters-examples.md)).
2. `fixtures/sample-worldgen/` (the "Custom biome with a jigsaw structure" starter saved as a project) exports a data pack with zero problems and a pinned SHA-256. Its structure `.nbt` files parse back with the same block counts. A **chain walk** over the zip resolves every link against the zip's own files plus the vendored vanilla registries: world preset to dimensions, dimension types and biomes, then placed and configured features; structure set to structure, biome tag and biomes; structure to start pool, pools (including fallbacks), structure templates and their jigsaw pools; and every jigsaw `target` name exists in its target pool.
3. Both plugins' validators report zero errors and none of `structures.unplaced-structure`, `worldgen.biome-unreachable` or `worldgen.preset-not-selectable` on the fixture; a mutated copy with one placed feature moved to another step reports `worldgen.feature-order` as an error.
4. The e2e spec `worldgen-path.spec.ts` drives the UI: starter, zero problems, pool connections, `.nbt` import, export with the `.nbt` in the zip, a deliberate feature-order error that disables export, and undo that re-enables it.

The manual check (the user, Windows, 26.3) lives in `fixtures/sample-worldgen/README.md` and the user guide: install the data pack into an existing world, reopen it, `/locate structure` finds the structure in a forest, and `latest.log` has no `Failed to load`, `Couldn't parse` or "Feature order cycle" lines; then create a new world with the pack and the custom World Type, where F3 shows the custom biome and `/locate biome` and `/locate structure` succeed.

**D9. Content.** Templates live in the owning plugins: 9 in `msm.structures`, 17 in `msm.worldgen`, 3 tag templates in `msm.datapack` (29 new; 95 in total). `@msm/plugin-library` gains three starters (`custom_biome`, `jigsaw_structure`, `worldgen_pack` "Custom biome with a jigsaw structure", which is the exit-criterion content) and 22 examples, one per new kind; jigsaw pieces are built by a procedural box builder, never copied from vanilla. Every one validates per target with zero errors and zero unknown ids.

**Decisions pending the user's veto.** The orchestrator made two defaults on the user's behalf; each stands unless the user vetoes it:

1. `minecraft:dimension_type` stays in `@msm/plugin-datapack` rather than moving to `@msm/plugin-worldgen`.
2. The three registries new in 26.3 (`worldgen/block_state_provider`, `worldgen/material_condition`, `worldgen/material_rule`) ship as schema-form kinds with one template each, with no studio.

## Consequences

- Two new built-in plugins (five built-ins exist after Phase 3) and 22 new kinds (52 built-in kinds in total). Adding a worldgen kind needs no UI code; the schema form covers it.
- A future target that renames a worldgen folder changes only `packages/targets` and the kind's registry facts there; templates and starters never name the pre-26.3 folders.
- Plugins can now declare cross-element rules through the public API, so third-party plugins (Phase 7) can do the same. Validator problems gate export like schema errors.
- `Target.dataVersion` is a new required field; a third-party target written against 0.4.0 needs it before it loads (the CHANGELOG says so).
- The feature-order check is O(biomes × features²) per step, fine for hundreds of features; the host debounces it.
- The exit criterion is met only by the user's in-game check; CI proves the chain walk, validators and the e2e proxy.

## Status

Proposed (2026-11-04); implementation in B70 (plugin-api 0.5.0, target facts, scaffolds), B73 and B74 (kinds, lowering, validators, templates), B75 (tag kinds), B76 (starters, examples, fixture, chain walk), B77 (host validators, importers, sidebar), B79 and B80 (studios) and B82 (e2e), within B70–B82. The two defaults above stand unless the user vetoes them.
