# sync-mcmeta

Vendors [misode/mcmeta](https://github.com/misode/mcmeta) summary data for one target. It downloads four files from the tag `<version>-summary` via raw.githubusercontent.com, retrying through jsDelivr on failure:

| Upstream path | Written as | Checked |
|---|---|---|
| `version.json` | `version.json` | `id` is the requested version |
| `registries/data.min.json` | `registries.json` | at least 100 registries, including `item`, `block` and `recipe_serializer` |
| `commands/data.min.json` | `commands.json` | Brigadier root node with at least 50 commands, including `execute`, `function` and `give` |
| `blocks/data.min.json` | `blocks.json` | at least 500 blocks, `stone` and `oak_stairs` as `[properties, defaults]` pairs |

Every file is written with sorted keys and 2-space indent, atomically, and only after all four pass their checks. `SOURCE.json` records the repository, the refs, the `files` list (output name and upstream path) and `fetchedAt`. Re-running for the same version changes only `SOURCE.json` `fetchedAt` unless upstream moved the tag. Downloaded data is untrusted: it is parsed and written, never executed.

```sh
node tools/sync-mcmeta/index.ts --version <version> --out packages/targets/mc-<version>/vendor/mcmeta
```

Never edit vendored files by hand: re-run this script.
