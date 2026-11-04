# sync-mcmeta

Vendors [misode/mcmeta](https://github.com/misode/mcmeta) summary data for one target. It downloads `version.json` and `registries/data.min.json` from the tag `<version>-summary` via raw.githubusercontent.com, retrying through jsDelivr on failure, checks that `version.json` has the requested `id` and that the registries summary has at least 100 registries including `item`, `block` and `recipe_serializer`, then writes `version.json`, `registries.json` (both sorted keys, 2-space indent) and a `SOURCE.json` provenance record into `--out`, each atomically. Re-running for the same version changes only `SOURCE.json` `fetchedAt` unless upstream moved the tag.

```sh
node tools/sync-mcmeta/index.ts --version <version> --out packages/targets/mc-<version>/vendor/mcmeta
```

Never edit vendored files by hand: re-run this script.
