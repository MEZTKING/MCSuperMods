# sync-mcmeta

Vendors [misode/mcmeta](https://github.com/misode/mcmeta) summary data for one target. It downloads four files from the tag `<version>-summary` via raw.githubusercontent.com, retrying through jsDelivr on failure:

| Upstream path | Written as | Checked |
|---|---|---|
| `version.json` | `version.json` | `id` is the requested version |
| `registries/data.min.json` | `registries.json` | at least 100 registries, including `item`, `block` and `recipe_serializer` |
| `commands/data.min.json` | `commands.json` | Brigadier root node with at least 50 commands, including `execute`, `function` and `give` |
| `blocks/data.min.json` | `blocks.json` | at least 500 blocks, `stone` and `oak_stairs` as `[properties, defaults]` pairs |

Every file is written with sorted keys and 2-space indent, atomically, and only after all four pass their checks. `SOURCE.json` records the repository, the refs, the `files` list (output name and upstream path) and `fetchedAt`. Re-running for the same version changes only `SOURCE.json` `fetchedAt` unless upstream moved the tag. Downloaded data is untrusted: it is parsed and written, never executed.

It also writes `files.json`, the index of the version's own data and resource pack files (B823, `files.ts`): the trees of the tags `<version>-data` and `<version>-assets` are read with `git fetch --depth=1 --filter=blob:none` into a throwaway bare repository (about a second per tag, no file contents fetched), and every path under `data/` and `assets/` is kept with the first 12 hex digits of its git blob hash. Structure templates (`data/<namespace>/structure/<path>.nbt`) are left out, since all of them change every version. Each path must be a lowercase pack path and each side must hold at least 1,000 files, or nothing is written. The index (about 2 MB a target) is read only by `tools/diff-targets`; it is not bundled with the app. A run given a fixture `fetchFile` and no tree reader (as `tools/new-target`'s tests do) skips the index and says so.

```sh
node tools/sync-mcmeta/index.ts --version <version> --out packages/targets/mc-<version>/vendor/mcmeta
# Only the file index, leaving the summary files as they are:
node tools/sync-mcmeta/index.ts --version <version> --out packages/targets/mc-<version>/vendor/mcmeta --only files
```

Never edit vendored files by hand: re-run this script.
