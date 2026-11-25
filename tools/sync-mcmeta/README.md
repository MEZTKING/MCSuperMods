# sync-mcmeta

Vendors [misode/mcmeta](https://github.com/misode/mcmeta) summary data for one target. It downloads four files from the tag `<version>-summary` via raw.githubusercontent.com, retrying through jsDelivr on failure:

| Upstream path | Written as | Checked |
|---|---|---|
| `version.json` | `version.json` | `id` is the requested version |
| `registries/data.min.json` | `registries.json` | at least 100 registries, including `item`, `block` and `recipe_serializer` |
| `commands/data.min.json` | `commands.json` | Brigadier root node with at least 50 commands, including `execute`, `function` and `give` |
| `blocks/data.min.json` | `blocks.json` | at least 500 blocks, `stone` and `oak_stairs` as `[properties, defaults]` pairs |

mcmeta's command report changed format at `26.4-snapshot-8`: an argument's parser and properties are nested under `argument: { type, ... }`, the argument types were renamed and reshaped, and every node carries `permissions` (`minecraft:always_pass` when it needs none) and some `custom_suggestion`. The vendored Spyglass reads only the old format, so `commands.ts` converts such a report back before it is checked and written (B831; an adapter rather than a Spyglass update, see below):

| Nested format | Written as |
|---|---|
| `minecraft:bool`, `double`, `float`, `integer`, `long` | `brigadier:bool` and the rest, `min`/`max` kept |
| `minecraft:word`, `quoted_string`, `greedy_string` | `brigadier:string` with `type` `word`, `phrase`, `greedy` |
| `minecraft:entity` `players_only`, `single_result` | `type` `players`/`entities`, `amount` `single`/`multiple` |
| `minecraft:score_holder` `multiple` | `amount` `multiple`/`single` |
| `minecraft:time` without `min` | `min` -2147483648, as the old report wrote it |
| `minecraft:resource`, `resource_or_tag` | unchanged (Mojang merged `resource_key` and `resource_or_tag_key` into them; the checker parses both alike) |
| `context`, `auto_center`, `custom_suggestion`, `always_pass` permissions | left out (the old report never had them; the checker never reads them) |

The table was checked on all 2,474 nodes of the real `26.4-snapshot-7` and `26.4-pre-1` reports (equal after the conversion but for the 13 nodes of the merged key types) and against Spyglass's own forward migration. A report already in the old format is written unchanged, and `validateCommands` refuses any argument node left without a `parser`. When a report was converted, `SOURCE.json` records `commands` (the adapter's path, the format, and how many arguments were converted, renamed and left out). Tests: `commands.test.ts` over `fixtures/commands-nested-argument.json` (40 command paths of `26.4-pre-1`'s report covering every row of the table, with `fixtures/commands-parser-properties.json` the expected result) and over both vendored reports converted to the new format and back.

Why not update Spyglass: `@spyglassmc/java-edition` 0.3.71 and later read the new format and migrate the old one, but the migration is gated by data pack format through mcmeta's version list, which the offline service does not load, the update moves four pinned Spyglass packages (ADR 0017) and changes checking on every target. The adapter keeps every target's data in one format for the pinned checker; a Spyglass update can drop it later.

Every file is written with sorted keys and 2-space indent, atomically, and only after all four pass their checks. `SOURCE.json` records the repository, the refs, the `files` list (output name and upstream path) and `fetchedAt`. Re-running for the same version changes only `SOURCE.json` `fetchedAt` unless upstream moved the tag. Downloaded data is untrusted: it is parsed and written, never executed.

It also writes `files.json`, the index of the version's own data and resource pack files (B823, `files.ts`): the trees of the tags `<version>-data` and `<version>-assets` are read with `git fetch --depth=1 --filter=blob:none` into a throwaway bare repository (about a second per tag, no file contents fetched), and every path under `data/` and `assets/` is kept with the first 12 hex digits of its git blob hash. Structure templates (`data/<namespace>/structure/<path>.nbt`) are left out, since all of them change every version. Each path must be a lowercase pack path and each side must hold at least 1,000 files, or nothing is written. The index (about 2 MB a target) is read only by `tools/diff-targets`; it is not bundled with the app. A run given a fixture `fetchFile` and no tree reader (as `tools/new-target`'s tests do) skips the index and says so.

```sh
node tools/sync-mcmeta/index.ts --version <version> --out packages/targets/mc-<version>/vendor/mcmeta
# Only the file index, leaving the summary files as they are:
node tools/sync-mcmeta/index.ts --version <version> --out packages/targets/mc-<version>/vendor/mcmeta --only files
```

Never edit vendored files by hand: re-run this script.
