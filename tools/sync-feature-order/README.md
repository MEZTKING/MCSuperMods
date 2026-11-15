# sync-feature-order

Vendors vanilla's placed feature order per decoration step for one target (ADR 0097 D1): the `WorldgenFacts.vanillaFeatureOrder` fact, which the worldgen and blocks-items validators read to warn about lists that run against vanilla's order.

It downloads two files from [misode/mcmeta](https://github.com/misode/mcmeta)'s tag `<version>-summary` via raw.githubusercontent.com, retrying through jsDelivr on failure:

| Upstream path | Used for |
|---|---|
| `data/worldgen/biome/data.min.json` | every vanilla biome's `features` (one list of placed feature ids per step) |
| `data/tag/worldgen/biome/data.min.json` | the order the biomes are read in: `#is_overworld`, `#is_nether`, `#is_end`, then any other biome by id |

Each (step, feature) pair is numbered by first appearance over the biomes in that order; the consecutive features of each biome's whole list are edges; a depth-first walk from every pair in (step, number) order, visiting successors in the same order, gives a post-order, and its reverse is the order. The overworld part reproduces the reference pack's measured 26.3 order, `docs/reference/vanilla-worldgen/tools/feature_indices.txt`, index for index (the test checks the vendored file against it). A cycle stops the script.

Only ids are written: `steps` (one list per step index, as in a biome's `features`) and `source` (repository, ref, files, biome order, `fetchedAt`), with sorted keys and 2-space indent, atomically. No vanilla file is bundled. Downloaded data is untrusted: it is parsed, validated and reduced to ids, never executed.

```sh
node tools/sync-feature-order/index.ts --version <version> --out packages/targets/mc-<version>/vendor/worldgen/feature-order.json
```

Re-run it with `sync-mcmeta` when a target is re-pinned. Never edit the vendored file by hand.
