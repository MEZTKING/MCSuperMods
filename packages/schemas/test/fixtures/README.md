# Test fixtures

## `symbols.subset.json`

A subset of the vanilla-mcdoc symbol export (`mcdoc-cli export symbols.json`), used by the
`@msm/schemas` tests. It is self-contained: tests never read the vendored export in
`packages/targets`.

- **Source:** `https://raw.githubusercontent.com/SpyglassMC/vanilla-mcdoc/generated/symbols.json`,
  downloaded 2026-11-04. Its `ref` is `0ca060a4f1631f9d5eb7198cfe94c7b77a773d32`.
- **Licence:** vanilla-mcdoc is MIT-licensed (SpyglassMC).
- **Size:** about 150 KB, 86 types, 2 dispatcher registries.

### Selection

Built with a one-off script (not committed) that:

1. keeps `ref`;
2. keeps every `mcdoc` entry whose path starts with `::java::data::recipe::` or
   `::java::assets::model::`;
3. keeps `mcdoc/dispatcher` registry `minecraft:resource` (keys `recipe` and `model` only) and
   all of `minecraft:recipe_serializer`;
4. adds, transitively, every `mcdoc` type reached through a `reference` from the kept types and
   dispatcher members;
5. writes JSON with sorted top-level and dispatcher keys, then formats it with Biome.

References into other dispatcher registries (`minecraft:item`, `minecraft:data_component`) are
left dangling on purpose: the index reports no keys for registries the export lacks.

### Version-gated fields the tests rely on

No extra types were needed; the subset already contains both kinds of attribute:

- `::java::assets::model::ModelElement` field `light_emission` is `#[since="1.21.2"]`.
- `::java::assets::model::Model` field `overrides` is `#[until="1.21.4"]`.

### Updating

Regenerate from a newer export only when a test needs it, and update the field list above. Do
not edit the JSON by hand.
