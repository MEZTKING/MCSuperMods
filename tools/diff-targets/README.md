# diff-targets

Diffs two target folders' vendored data into the generated half of a change set (ADR 0136 D2 and D11, brief B811): what changed in Minecraft between two targets, from data alone. Pure and offline: it reads only `vendor/mcmeta/` and `vendor/vanilla-mcdoc/` of the two folders and fetches nothing.

```
node tools/diff-targets/index.ts --from packages/targets/mc-<a> --to packages/targets/mc-<b> \
  [--out <file.json>] [--draft <CHANGES-draft.md>] [--check] [--mcdoc gated|refs]
```

- `--out` writes the change set and, beside it, the additions list (`generated.json` gives `generated.additions.json`). Without `--out` or `--draft` the change set goes to standard output.
- `--draft` writes `CHANGES-draft.md`, the change set in words for the person who writes the curated file.
- `--check` writes nothing and exits 1 when a named file differs from a fresh run (0 when all are up to date, 2 for bad arguments or unreadable folders).
- `--mcdoc` overrides how data formats are compared (below).

Both files are JSON with sorted keys and a 2-space indent; two runs give byte-equal files. B813 writes the output to `packages/targets/mc-<b>/src/changes/generated.json` and ties it to the vendored data with `--check`.

## Output

The change set has the shape of the plugin API's `TargetChangeSet` (1.29.0, B812). `types.ts` holds a structurally equal local copy until B813 joins them; `test/types.test.ts` checks that each is assignable to the other.

- `from`, `to`: target ids, `mc-` plus the version up to its first `-` (from `version.json`).
- `refs.from`, `refs.to`: `mcdoc`, the vanilla-mcdoc commit (`SOURCE.json`); `mcmeta`, the mcmeta prefix (`refs.summary` less `-summary`).
- `changes`: sorted by `id` (`${area}:${subject}`, plus `#${field}`), each with `area`, `what`, `subject`, `handling` and `source`, and as the case needs `registry`, `field`, `from`, `to`, `stillIn` and `candidate`.
- `additions`: counts. `ids:<registry>` for new members, `ids:(registries)` for new registries, `commands:(paths)` for new command paths. The list itself is the additions file (`{ from, to, additions: [{ id, area, what, registry?, subject, source }] }`, `what` one of `registry-added`, `member-added`, `path-added`), kept out of the set to keep it small (B810 V19).

What each part writes:

| Area | `what` | Subject | Other fields | Generated handling |
|---|---|---|---|---|
| `ids` | `registry-moved` | the old registry | `from`, `to` the names | none |
| `ids` | `member-removed` | `<registry>/<id>` | `registry`, `from` the id, `stillIn`, `candidate` | manual |
| `formats` | `type-added`, `type-removed` | `<dispatcher>/<key>` | `registry` the dispatcher | none, manual |
| `formats` | `field-*` | a dispatcher member or a named mcdoc type | `field` an RFC 6901 pointer (`/default_block`; `*` is any list item or map key), `from`/`to` shapes for `field-retyped`, `candidate` for a field move | manual for removed, added required, made required, retyped; none otherwise |
| `formats` | `type-changed` | a member or type that is not an object | `from`, `to` shapes | manual |
| `commands` | `root-removed`, `path-removed` | the topmost removed path (`effect give <targets> <effect>`) | | manual |
| `commands` | `argument-changed` | a node whose parser, properties, executability or redirect changed | `from`, `to` its descriptions | none |
| `block-states` | `property-added`, `property-removed`, `values-changed`, `default-changed` | the block (no namespace) | `field` the property name, `from`/`to` values | none for added, manual otherwise (values: manual only when a value went) |
| `packs` | `value-changed` | `data_pack_format`, `resource_pack_format` (`{ major, minor }`), `data_version`, `protocol_version`, `version`, `type`, `stable` | `from`, `to` | auto for the formats and the data version, none otherwise |

The handling is the generated default; the curated file (B813) overrides it, for example `default_block` is `auto` because the migration drops it.

## How it compares

- **Registries** are matched one to one by member overlap (Jaccard), best first, a same-name pair winning ties; a pair of different names needs an overlap of 0.5. A matched pair of different names is `registry-moved` and its ids keep their meaning. 26.2 to 26.3 reused `worldgen/feature` for configured features while the old one became `worldgen/feature_type`, so names alone are wrong (B810 V7). A registry with no successor gives a `member-removed` for each member. `stillIn` lists the newer registries that still hold a removed id.
- **Data formats, both ways** (B810 V3): `gated` resolves the newer target's one vanilla-mcdoc export at both versions through its `since` and `until` gates; `refs` resolves each target's own export at its own version. vanilla-mcdoc gates only on releases, so the default is `gated` across release lines (26.3 to 26.4) and `refs` within one (a snapshot re-pinned to a pre-release, where the gated diff is always empty). On 26.3 to 26.4 both give the same changes.
- **One change per thing a user writes.** A dispatcher member present at both versions is compared by its top-level fields (aliases and spreads merged); a field whose type changed is followed down to what changed, so a renamed type (`CatSounds` to `OptionalCatSounds`) shows as the fields that became optional, and a type that only changed its name is no change. A named type is listed on its own only when no such member reaches it at its top level, no other named type spreads it in or aliases it, and not only members new in the newer version reach it (a new mob's own type). Moved registries are renamed on the older side first, so `rule_test` does not echo as a retyped field. A one-member union counts as its member (the one difference two refs of one version show). Dispatcher spreads inside a struct are left out: their members are compared as dispatcher members.
- **Commands** are normalised to one shape before the diff. Every vendored report (to `26.4-snapshot-7`) has `parser` and `properties`; mcmeta's report from `26.4-snapshot-8` nests them as `argument: { type, ... }` and adds `permissions`, which are flattened and left out. The new format also renamed the argument types (`brigadier:*` to `minecraft:bool` and the rest, the string types split, `resource_key` to `resource`) and some properties; those renames are not mapped, as no vendored report has that format yet (verify at implementation, with the `sync-mcmeta` adapter B810 asks for). The draft names both reports' formats.
- **Blocks** added and removed are members of the `block` registry, so they are in the registry part, not repeated under block states.

## Candidates

Never applied: a person confirms one in the target's curated file and the shape test passes (ADR 0136 D3).

- **Renames** (`kind: 'rename'` on a `member-removed`): inside each matched registry pair every removed member is scored against every added one, by name (stemmed token overlap, plus 0.1 for the same folder and 0.25 when one name contains the other) and, where the registry selects a dispatcher in the mcdoc tree, by the two members' field sets (same 0.5, superset 0.4, subset or similar 0.3). Pairs are taken one to one, best first, and proposed from a score of 0.4. When two or three free partners share the best score (and it reaches 0.4 or the shapes could be compared), the candidate is `ambiguous`, its `to` is the first partner by code point and the change's own `to` lists them all.
- **Field moves** (`kind: 'field-move'` on a `field-removed`): a removed and an added field of the same object, of the same type (shape `same`) or a like name (0.3 or more), one to one.

## What it finds on 26.3 to 26.4-snapshot-7

124 changes (ids 18, formats 93, commands 5, block states 1, packs 7; 25 manual, 3 auto, 96 none) and 945 additions, in under a second; the set is 44.8 KB, 3.5 KB gzipped (the additions list 8.7 KB gzipped). `test/real-targets.test.ts` holds it to the hand-found facts:

- the removed members equal `mc-26.4/src/removed-ids.ts` `REMOVED_IDS` (less the moved registry), `MOVED_REGISTRIES` and `STILL_REGISTERED_ELSEWHERE` exactly;
- `default_block` removed from `minecraft:resource/worldgen/noise_settings` and `base_block` added (required) to `LargeSpeleothemConfig`;
- `large_dripstone` to `large_speleothem` proposed with shape `superset`, and the renames B810 found: `freeze_immune_entity_types` to `immune_to_freezing`, `friends/loading` to `widget/loading`, `pause_menu/social_interactions` to `pause_menu/feedback`; `interpolated` (`domain_warp` or `upscale`) and `friends/button` (`profile` or `tab`) ambiguous.

Where the data and the hand-written records differ (the test follows the data):

- `removed-ids.ts` lists `rule_test`'s ten members as removed; the data shows the registry moved to `rule_test_type` with the same members, so they are one `registry-moved`.
- `removed-ids.ts` records three renames as plain removals: the entity type tags (`freeze_immune_entity_types` renamed `immune_to_freezing`; `ignores_poison_and_regen` split into `immune_to_poison` and `immune_to_regeneration`, which scores too low to be proposed), four GUI sprites (`friends/button`, `friends/button_highlighted`, `friends/loading`, `pause_menu/social_interactions`) and `interpolated` to `upscale`. Only the speleothem is in `KNOWN_RENAMES`.
- Mojang's snapshot 3 notes state the speleothem rename the wrong way round; the data has `large_dripstone` removed and `large_speleothem` added.
- The brief expected the speleothem candidate "marked shape differs"; it is marked `superset` (B810 item 16): the new config takes every old field and the required `base_block`, which is still not the same shape, so it is never applied without a person.
- Two candidates are wrong by the notes: `pause_menu/player_reporting` to `other_players` and `block/cube_top` to `calcite_slab_top`. Candidates are evidence, never steps.
- `NoiseGeneratorSettingsRef` (a settings id or inline settings, as dimensions and world presets hold them) is listed with `/default_block` removed beside the resource: B810 counted it as an echo, but it is where inline settings live, which the 26.4 migration also strips.

## Not covered

- Facts typed by hand in `target.ts`, the key names, Java's API, behaviour and meaning: not in this data (B810 V1, V20). `tools/new-target` (B814) recomputes the derived facts.
- Mojang's changed vanilla files (B823).
- A dispatcher spread replaced by another inside one struct, and changes deeper than the comparison follows (seven levels).

## Tests

`pnpm --filter @msm/tools test` (or `pnpm exec vitest run diff-targets` in `tools/`): `test/real-targets.test.ts` on the repository's targets, `test/fixtures.test.ts` on the invented pair `test/fixtures/mc-98.0` and `mc-99.0` (a rename of the same shape, a field move, a moved registry, a command tightened and one removed, block state changes; small enough to edit by hand), with the expected files `test/fixtures/expected*.json` and `expected-draft.md` (`UPDATE_GOLDENS=1` rewrites them), and `test/types.test.ts`.
