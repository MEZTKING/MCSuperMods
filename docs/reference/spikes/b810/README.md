# B810 spike: what a version change really is, measured

Answers V1 to V20 of `docs/PLAN-version-upgrades.md` (brief B810) for draft [ADR 0136](../../../adr/0136-version-upgrades-noticed-moved-and-explained.md), found on 2026-11-25 in a cloud container (Linux, 4 cores, Node 24.22.2) from `fb02d22`, over the targets `mc-26.3` and `mc-26.4` (pinned to `26.4-snapshot-7`). Nothing here is built, linted or shipped; no code outside this folder was changed.

## What was run and read

- **Throwaway scripts** in `scripts/` over the two vendored target folders, `examples/` and `fixtures/` (168 projects, 3,026 elements), with the app's own `ProjectSession`, plugins and targets as `tools/check-project` runs them. Each script says at its top how to run it.
- **Public reads, never stored:** Mojang's version manifest and the launcher's patch notes (`launchercontent.mojang.com/v2/javaPatchNotes.json`, read as text to make the truth lists of V1 and V7; only ids are kept), mcmeta's tags (`git ls-remote`, tree-only fetches of the `-data` and `-assets` tags: paths and blob hashes, no file contents), mcmeta's `26.2` and `26.4-pre-1` summaries (registries, commands, blocks, version) in the scratchpad, vanilla-mcdoc's history and its newest `generated` symbol export (`c0dd53f`, MIT), Fabric meta and Maven, Modrinth. The client name sent was the app and repository only.
- **Kept here:** counts, ids, paths, hashes and our own measurements (`results/`), the scripts (`scripts/`), and the planted test project's generator (`spike-src/plant.py`). No Mojang file, patch-note text, class listing or jar content.

## The answers in one line each

| # | Answer |
|---|---|
| V1 | A throwaway differ (about 550 lines) finds again, unaided, every data change found by hand (the 17 removed members and the `rule_test` move, `default_block`, `LargeSpeleothemConfig.base_block`) plus 12 format changes, 2 command changes, 1 block state property and 3 renames nobody wrote down; what no data shows: the key rename `key.socialInteractions` → `key.otherPlayers`, Java's `SoundType`, the fluid and sound models, `minecraftDependency`, GeckoLib, the palette-key threshold and the terrain approximations. |
| V2 | For `26.4-pre-1` mcmeta tags, a vanilla-mcdoc commit and export, Fabric Loader 0.20.1 and Fabric API `0.167.1+26.4` all exist (each within about 3 hours of Mojang); Loom is not per version; GeckoLib has no 26.4 build at all (it never builds snapshots; releases get one 0.3 to 2.7 days late); the 26.4 release is not out. |
| V3 | One `symbols.json` resolved at 26.3 and 26.4: 20 of 2,464 named types and 23 of 1,748 dispatcher members differ (9 keys added, 2 removed), which are about 14 real changes once duplicates and echoes are folded; two refs at the same version differ by 1 false difference; but the tree gates on `26.4` only, so it cannot see a snapshot-to-snapshot change, which needs the two-ref diff. |
| V4 | 5 of 2,474 command nodes changed (`effect` takes tags; `test` rotation steps 0..3); the newer checker reports the tightening as an error with line and column and removed ids in function text as warnings; from `26.4-snapshot-8` mcmeta's command report has a new format that the vendored Spyglass cannot read at all. |
| V5 | 25 blocks added, none removed, one property added (`jukebox` `playlist_mode`), no default changed; projects hold block states in 91 structure templates (270 palette entries), noise settings, worldgen features, processor lists, material rules, an enchantment, 67 places in function text and 3 in Rules strings. |
| V6 | 97 % of namespaced ids in projects are whole strings (10,863); 336 sit inside strings (functions 72, scripts 78, structure SNBT 172, other SNBT 8, Rules 4, mod 2); only 1 removed 26.4 id occurs in all 168 projects (found by the walk); planted cases show the validators catch every function-text id (as warnings) and no script id. |
| V7 | Name-and-shape candidates, matched one to one, find 15 of 20 stated renames of 26.2 → 26.3 (precision 0.36 against the changelog, about 0.86 judged by hand) and 4 of 9 of 26.3 → 26.4 (7 of 9 counting ties); registry renames must be matched by member overlap because 26.3 reused `worldgen/feature` for another registry. |
| V8 | Yes, cheaply: tree-only fetches of mcmeta's `-data` and `-assets` tags take about 1 s each; 26.3 → 26.4-snapshot-7 changed 1,182 files (6.7 KB gzipped as a path list) once the 1,511 structure `.nbt` files that change every version are left out; nearly all are in folders a pack can replace. |
| V9 | The dry run is cheap: a cold worker answers in 3.0 to 4.0 s of wall time (0.4 to 1.9 s of it the dry run itself), a warm one in a median 0.12 s (largest 0.84 s) over all 168 projects; lowering costs 12 to 90 ms and need not be skipped. **Go** on the 5 s budget. |
| V10 | A second schema context costs about 8 MB of heap in the renderer and a second Spyglass service about 60 MB in the main process; a live view is a function of `(project, element)` props, so the "after" view is the same view given the moved copy and a reader for the new version, with no lowered-set seam and no Try it world. |
| V11 | On 26.3 → 26.4 the four identity keys agree (26 new problems over 168 projects, 25 true); code + element + path is the key, with paths mapped through the migration's details; the one false "new" problem comes from a checker quirk, not from identity. |
| V12 | Yes for validation problems and for removed ids (re-run the walk at the path); no check exists for script ids, curated in-game checks, behaviour notes, modpack mods without builds and Java notes, which need a manual tick or their own re-check. |
| V13 | Of 26.4's steps only renames have exact inverses; `default_block` needs the saved value; a saved report of element, pointer and value (93 bytes on the largest example) put it back after an unrelated edit, and the result equalled the original apart from that edit. |
| V14 | A stand-in third target gives the same project by a chain as by two moves (on both projects tried); the chain is one undo step, two moves are two; today one hop from 26.3 to the stand-in answers `target.no-migration-path`. |
| V15 | `.msm/` holds `trash/`, `undo/`, `exported-ids.json` and `msm-runtime.d.ts`; load and save never read it, exports never see it, `check-project` skips it but counts it toward its 25 MiB cap; a copy of `msm.project.json` and `content/` is all a move needs (the largest example is 324 KB with pictures). |
| V16 | An ejected project names the version in `gradle.properties` (four lines and GeckoLib's id), `fabric.mod.json` `depends`, `build.gradle.kts` (Java), the wrapper (Gradle), `README.md` and `LICENSE-NOTES.md`; nothing records that or where a project was ejected; a read-only scan sees those files and ids in `src/main/resources`, not the Java's use of Minecraft's API. |
| V17 | **Update mods** makes 2 requests per mod, one after another; one `POST /v2/version_files/update` with the pinned files' SHA-1s answers "which have a build for version X" in a single call (0.58 s for two mods); the limit is 300 requests a minute. |
| V18 | Put the engine at `packages/targets/migrate/` as `@msm/target-migrate` with its own exact entry in `layers.json` and the name added to `@msm/target-*`'s allowed list; `check-deps` must also start grepping that folder for version literals, and its pattern only knows `26.x`. |
| V19 | 26.3 → 26.4 is 86 changes and 830 additions: 9.2 KB gzipped with the additions listed, 2.5 KB with additions as counts; a format-change step such as 26.2 → 26.3 is 45 KB and 23 KB. Either is negligible beside the 32 MB asar. |
| V20 | Of 106 facts (one or two levels deep), 30 are derived from vendored data, 9 derived and then cut by hand, 12 from upstream services, 49 hand-verified and 6 MSM's own; 32 differ between 26.3 and 26.4 (13 derived, 8 upstream, 10 hand, 1 own). `results/v20-facts.json` and `v20-classes.json` are the seed of `VERIFY.md`. |

## Kind of change, found by which source, migrated, reported or invisible

From the 26.3 → 26.4-snapshot-7 step, checked against Mojang's notes for snapshots 1 to 7, and the 26.2 → 26.3 step for the renames.

| Kind of change | Example | Found by | Migrated today | Reported today | What the planned system can do |
|---|---|---|---|---|---|
| Registry member removed | `fluid` `flowing_water`, `particle_type` `item_snowball` | registries diff | no | the walk (whole strings, error); validators (warning); function text only by the checker (warning) | report with the change's id; search scripts too |
| Registry member renamed | `large_dripstone` → `large_speleothem`, `interpolated` → `upscale`, two entity type tags, four GUI sprites | registries diff + candidates; Mojang's notes | no | as a removal (only the speleothem has a hint) | a rename step when confirmed and the shape matches; else reported with the candidate |
| Registry renamed or moved | `rule_test` → `rule_test_type`; 26.2 → 26.3's `configured_feature` → `feature` while `feature` → `feature_type` | member overlap | not needed | correctly silent | none (ids mean the same) |
| Field removed | noise settings `default_block` | mcdoc | yes (by a target fact) | yes | drop step with a saved value |
| Field added, required | `large_speleothem` `base_block`; jukebox block entity `playlist_position` | mcdoc | no | validators (error), after the move | manual, unless one right value exists |
| Field added optional, made optional, relaxed | `trunk_width`, `placement_options`, `corner_constraint`, sound variants' sounds, `explode` particles, `gradient` anchors | mcdoc | not needed | nothing | news only ("new in this version") |
| Field tightened or retyped | `fixed_placement` needs one position | mcdoc | no | validators (error) | manual |
| Command argument changed | `effect` takes tags (relaxed); `test` rotation steps 0..3 (tightened) | commands diff | not needed | the checker, with line and column, for the tightening | news, or the checker's problem |
| Command report format | from snapshot 8: argument nested under `argument`, `brigadier:*` types renamed | commands diff (format) | — | the vendored checker breaks | an adapter in `sync-mcmeta` (V4) |
| Block state property | `jukebox` `playlist_mode` added | blocks diff | not needed | nothing | news; a removed property or value would be manual |
| Pack formats, data version | data 121 → 126, resource 97.1 → 102 | `version.json` | by lowering | — | part 4 of the report |
| Same field, new meaning | `cuboid` sizes one smaller, `steep`, ore discards | Mojang's notes only | no | invisible | a curated sentence and in-game check |
| New validation rule | placed features limited to 3 × 3 chunks; multi-noise entries may not overlap; times over 2³¹ fail | Mojang's notes only | no | invisible (the time limit is not checked by Spyglass) | curated |
| Game behaviour | undead immune to freezing; projectiles break pots | Mojang's notes only | — | invisible | curated in-game checks (D12) |
| Client names | key `key.socialInteractions` → `key.otherPlayers` | client dump (B406) | — | invisible | the `controls` fact, re-read by hand |
| Java API | `SoundType` gone (no 26.4 eject) | `javap` | — | — | curated Java notes |
| Loader, API, GeckoLib | no GeckoLib for 26.4 | Modrinth, Fabric meta | — | an export problem after the move | part 4, before the move |
| Vanilla files changed | 1,182 data and asset files | mcmeta trees | — | — | the changed-files fact (B823) |
| Undocumented changes | `rule_test` → `rule_test_type` (vanilla-mcdoc: "Undocumented change from 26.4 snap2") | data | — | — | data wins over notes |

## Go or no-go on ADR 0136's 5 s budget

**Go.** Measured with the app's `ProjectSession` in Node on 4 cores (`scripts/v9-dryrun.ts`, `scripts/v11-identity.ts`):

| Project | Elements | Cold worker, wall (start, modules, dry run) | of which dry run | After the own target is warm | Heap after |
|---|---|---|---|---|---|
| `examples/all-kinds` | 194 | 3.9 s | 1.9 s | 0.9 s | 177 MB (worker) |
| `examples/blocks-items` | 289 | 4.0 s | 1.5 s | 0.7 s | 241 MB |
| a made 300-element project | 300 | 3.7 s | 1.7 s | 0.9 s | 201 MB |
| `fixtures/structures-parity` | 306 | 3.0 s | 0.4 s | 0.2 s | 68 MB |
| all 168 projects, fully warm | 8 to 306 | — | median 0.12 s, 90 % under 0.47 s, max 0.84 s | — | — |

Copying (1 to 6 ms), opening the copy (11 to 22 ms) and migrating (3 to 27 ms) are negligible; nearly all the time is the first load of the new target's schemas and the Spyglass service and the first validation. Lowering is 12 to 90 ms, so it stays in. The user's Windows machine may be twice as slow: the cold first run could take 6 to 8 s, which the notice simply waits for (ADR 0136 D5 already says so).

The fall-back, if a slower machine shows it is needed: keep the worker alive after the first run (warm runs are under 1 s); report the migration's own counts first (they take under 30 ms) and fill in validation when it finishes.

## Shapes for B811 and B812

The draft generated change set of `scripts/v19-changeset.mjs` (`results/v19-changeset-26.3-26.4.json`) uses this shape; B812 owns the type.

```ts
interface TargetChangeSet {
  /** The target this one follows, and both ends' pins (mcdoc ref, mcmeta ref). */
  from: string;
  to: string;
  refs: { from: { mcdoc: string; mcmeta: string }; to: { mcdoc: string; mcmeta: string } };
  /** Sorted by id. */
  changes: TargetChange[];
  /** Additions as counts by kind and registry; the list itself in a lazy file beside it. */
  additions: Record<string, number>;
}

interface TargetChange {
  /** Stable: `${area}:${subject}` plus `#${field}` for a field. */
  id: string;
  area: 'ids' | 'formats' | 'commands' | 'block-states' | 'packs' | 'players' | 'java' | 'vanilla-files';
  what:
    | 'registry-moved' | 'member-removed' | 'member-renamed'
    | 'type-added' | 'type-removed' | 'type-changed'
    | 'field-removed' | 'field-addedRequired' | 'field-addedOptional'
    | 'field-madeOptional' | 'field-madeRequired' | 'field-retyped'
    | 'root-removed' | 'path-removed' | 'argument-changed'
    | 'property-added' | 'property-removed' | 'values-changed' | 'default-changed'
    | 'value-changed' | 'file-changed';
  /** Registry, or the dispatcher the subject is a member of. */
  registry?: string;
  /** What changed: a registry member, a dispatcher member (`minecraft:resource/worldgen/noise_settings`), a command path, a block. */
  subject: string;
  /** RFC 6901 pointer below the subject, for a field. */
  field?: string;
  from?: Json;
  to?: Json;
  /** Registries that still hold a removed id. */
  stillIn?: string[];
  handling: 'auto' | 'manual' | 'none';
  source: 'registries' | 'mcdoc' | 'commands' | 'blocks' | 'version' | 'mcmeta-trees' | 'curated';
  /** From diff-targets: never applied until a person confirms it in curated.ts. */
  candidate?: { kind: 'rename' | 'split' | 'merge' | 'field-move'; to: string; name: number; shape: 'same' | 'superset' | 'subset' | 'similar' | 'differs' | 'none'; ambiguous?: true };
  /** Curated only. */
  sentence?: string;
  hint?: string;
  inGameCheck?: string;
}
```

Rules the measurements ask for:

- **One change per thing a user writes:** a format change is keyed by the dispatcher member or resource and the field's pointer, compared deeply (by structure, not by type-path names); a named type is listed only when no dispatcher member reaches it. On 26.3 → 26.4 this folds 43 raw signature differences into about 14 changes.
- **Registries matched by member overlap**, one to one, best first; a same-name pair wins ties (V7).
- **Commands normalised** to one shape before diffing (the old `parser`/`properties` and the new `argument`), and argument-type id renames mapped, so a report-format change is one entry, not 758.
- **Both mcdoc diffs:** the gated diff of one tree for a step between release lines, and the diff of two refs for a re-pin within one line; the refs are recorded in the change set.
- **`MigrationChange.details`** (B812): `{ op: 'rename-id' | 'drop' | 'move' | 'set'; path: string; before?: Json; after?: Json; changeId: string }[]`. **`MigrationReport.reverses`**: `{ elementId; path; value; afterHash }[]` for every dropped value (V13).

## Changes the spike asks of ADR 0136 and the plan

1. **D2, D11 — mcdoc diff both ways.** vanilla-mcdoc gates by release (`since="26.4"`), never by snapshot, so `diff-targets` diffs one tree at two versions for a step between release lines and two refs for a re-pin within one (B826's case: the gated diff of snapshot 7 against pre-release 1 is empty; the two-ref diff finds 9 types and 6 dispatchers). Plan U8 ("exact as far as upstream is") needs that limit added.
2. **D2 — registries matched by overlap.** 26.3 reused the name `worldgen/feature` for configured features while the old `worldgen/feature` became `feature_type`; matching by name reports 43 removals and 220 additions where there are two renames.
3. **D2, D11 — commands normalised, and a sync adapter.** mcmeta's command report changed format in 26.4-snapshot-8 (Mojang's notes for that snapshot say so). The vendored Spyglass then warns "Parser %0% hasn't been supported yet" on every argument of every line. B826 (or a new brief before it) must make `sync-mcmeta` convert the new report to the shape Spyglass reads, or update Spyglass, and re-check the `commands.argumentTypes` fact (`brigadier:integer` and the rest are renamed `minecraft:integer` and so on in the `command_argument_type` registry; what this means for the runtime's command code is (verify at implementation)).
4. **D3 — the walk.** Keep the whole-string walk. Add a token search for removed ids in function text and script text that reports and does not rewrite: the checker already warns on function text with line and column, and nothing covers scripts. Skip plain-text kinds (`minecraft:lang`) in the whole-string walk; a lang value equal to a removed id was reported as an error. The "rename a command word in a function's text" step has not earned its place: no 26.4 change needs it, and no project holds a removed id in a function. Leave it out until a change needs it.
5. **D4 — warnings count, identity by code, element and path.** Removed ids in functions are warnings, so "new on the new version" must count warnings as well as errors. Use code + element + path as the key, with paths mapped through `MigrationChange.details`. Messages carry the version string, so they cannot be part of the key.
6. **D4, Consequences — the checker's snapshot gating.** On `26.4-snapshot-7` the Spyglass checker treats `since="26.4"` fields as unknown, while MSM's schema index (`compareGameVersions`) admits them. The dry run then reports false news: `Unknown key "equip_sound"` in an example's `give` line, which is clean on 26.3 and on `26.4`. Fix by passing Spyglass the release a snapshot belongs to (a follow-up below), or the snapshot target's report must say so.
7. **D5, Consequences — memory.** In the app the dry run's function checks need a second Spyglass service in the main process (about 60 MB, 0.4 s to start); the renderer's second schema context is about 8 MB. Add both to Consequences. The budget holds (go); keep the worker alive once started.
8. **D6 — the copy.** Copy only `msm.project.json` and `content/`: a move never changes `assets/`, and assets can be large (sounds up to 8 MiB each against `check-project`'s 25 MiB folder cap, which counts `.msm/`). Every example's three copies would then be under 1 MB.
9. **D7 — what the saved report holds:** per dropped value, the element id, the RFC 6901 pointer and the value, plus a hash of the element's data after the move. A value is put back when the element exists, the parent object exists and the key is absent; otherwise it is listed ("element gone", "place taken"). 26.3 has no hook today, so moving back from 26.4 answers "No migration needed"; the engine's inverse must run from the newer target's change set (the older target has nothing to say).
10. **D9 — one batched call.** Use `POST /v2/version_files/update` with the SHA-1s of the pinned files (they are in the modpack) for "which have a build for version X": one request instead of two per mod.
11. **D11 — the proof test.** Remove "the 26.4 key names" from what the differ must find unaided: neither mcmeta nor either vanilla-mcdoc ref holds them (the mcdoc `Keybind` enum has neither name). Add what the differ found that the hand list missed: the tag and sprite renames as candidates, `interpolated` → `upscale` as an ambiguous candidate, the 12 format changes, `effect` and `test`, `jukebox` `playlist_mode`.
12. **D11 — candidates from Mojang's notes as evidence.** Parsing the launcher's patch notes for "renamed" statements gave 20 net renames for 26.2 → 26.3 and 6 for 26.3 → 26.4, and found renames the data heuristics miss (`glowstone_blob` → `random_neighbor_spread`, `invert` → `reciprocal`). `new-target` (which may fetch) can store the extracted pairs, ids only, as candidate evidence; `diff-targets` stays offline. The notes are not always right: snapshot 3 states the speleothem rename the wrong way round, so a pair is evidence, never a step.
13. **D11 — changed vanilla files.** Leave structure `.nbt` files out, or compare them other than by blob hash: all 1,511 change bytes every version because they carry the data version.
14. **Consequences, check-deps (B813).** `@msm/target-migrate` needs an exact `layers.json` entry (`@msm/plugin-api`, and `@msm/schemas` if the shape test lives there) and must be added to `@msm/target-*`'s allowed list. `isVersionCheckedPath` exempts all of `packages/targets/`, so the engine must be taken back into the version grep. The grep's pattern matches `26.x` only and will miss 27.x.
15. **Section 2 question 6 and B826.** Re-pinning 26.4 needs item 3 first. The pre-release's data pack version is 128.1 and its resource pack version 104.0. It adds the registries `dispense_behavior`, `dispense_behavior_type` and `command_suggestion_type`, and the component `dispense_behavior`.
16. **B811 acceptance** gains: the candidates list `large_dripstone` → `large_speleothem` (superset shape), `freeze_immune_entity_types` → `immune_to_freezing`, `friends/loading` → `widget/loading`, `pause_menu/social_interactions` → `pause_menu/feedback`; `interpolated` → `upscale` and `friends/button` → `friends/tab` are marked ambiguous; `rule_test` is moved, not removed.

## Surprises

- mcmeta's command report changed shape in `26.4-snapshot-8`, and MSM's vendored Spyglass cannot read the new one (item 3 above). This is the first thing a 26.4 re-pin will hit.
- vanilla-mcdoc knows releases, not snapshots: one tree cannot say what changed between `26.4-snapshot-7` and `26.4-pre-1`.
- Spyglass and MSM disagree on whether `26.4-snapshot-7` is 26.4. The checker's SNBT checks on the snapshot target use 26.3's shapes (`results/v4-gate-probe.txt`). The 26.4 target has this bug today, outside any upgrade.
- ADR 0037's "the 26.3 data formats are unchanged" was not so. The differ finds 12 more format changes in 26.3 → 26.4-snapshot-7, mostly relaxations, and two tightenings (`fixed_placement` needs at least one position; `test` rotation steps 0..3).
- `removed-ids.ts` records three renames as plain removals: the entity type tags (one rename, one split), four GUI sprites and `interpolated` → `upscale`.
- Mojang's own snapshot 3 notes give the speleothem rename the wrong way round.
- 26.2 → 26.3 reused registry names (`worldgen/feature`, `worldgen/carver`, `worldgen/material_condition`, `worldgen/material_rule` each now mean something else).
- A project's removed ids in functions are warnings, so `check-project` passes a project that will not load them correctly. CI's "every example exports on 26.4" therefore does not prove that nothing changed for the examples.
- mcmeta's commit dates are Mojang's release times, so how long mcmeta lags cannot be read from git.
- vanilla-mcdoc catches most snapshots within 3 hours but some changes weeks later: the 26.4 snapshot 2 change was recorded on 2026-11-05, five weeks on.
- The change sets are tiny (2.5 to 9 KB gzipped per step); the asar is not at risk.

## V1 The throwaway differ against what was found by hand

**Method.** `scripts/differ.ts` diffs two target folders: registries (members added and removed, registries added, removed and moved, removed ids still registered elsewhere), the mcdoc tree (every named type and every dispatcher member, by a canonical signature, and every `minecraft:resource` by its deep field paths), the command tree (every node as a path with its parser and properties), block states, and `version.json`. It runs in 0.6 s. Output: `results/differ-26.3-26.4-snapshot-7.json`. The hand list is ADR 0037's Context and amendment and `mc-26.4/CHANGES.md` "What changed from 26.3". The ground truth beyond both is Mojang's notes for snapshots 1 to 7, read for this spike and not kept.

**Found again, unaided:**

- The registry count 190 → 192: `rule_test` moved to `rule_test_type` with identical members; `block_sound_set` and `tag/block_sound_set` added.
- The removed-id table exactly: 17 members in 8 registries (as `REMOVED_IDS`, less the moved `rule_test`), and `large_dripstone` still in `worldgen/feature` and `worldgen/placed_feature` (as `STILL_REGISTERED_ELSEWHERE`).
- `default_block` removed from `NoiseGeneratorSettings` and from the `worldgen/noise_settings` resource, with its two sub-paths.
- `LargeSpeleothemConfig` gains the required `base_block`; `minecraft:feature_config` loses `large_dripstone` and gains `large_speleothem` and `crevasse`. The candidate pass pairs the two with shape "superset" (V7).
- Every addition ADR 0037 lists (25 blocks, 28 items, `ice_caves`, `frostbite`, `ice_ball`, `freezing`, `visual/has_sky_occluder`, `below_heightmap`, `flurry`, `domain_warp`, `upscale`, `crevasse`) among 805 added members in 35 registries.
- Pack formats 121.0 → 126.0 and 97.1 → 102.0, data version 5023 → 5127.

**Found that nobody wrote down:**

- Format changes (mcdoc): `straight_trunk_placer` `trunk_width`; `fixed_placement` `positions` needs at least one; `gradient` coordinates accept vertical anchors; `speleothem_cluster` `placement_options`; `corner_constraint` on the four pool elements; `matching_fluids` `state`; `explode` particles and sound made optional; the sulfur cube archetype's sounds made optional and `location_based_effects` added; the sound variants of cats, chickens, cows, pigs and wolves made optional; the jukebox block entity's `playlist_position`; the zombie family's `FreezingTime` and `FrostbiteConversionTime`. All but `fixed_placement` loosen the format, so a 26.3 project stays valid.
- Commands: `effect give` and `effect clear` take tags (`resource` → `resource_or_tag`); `test run` and `test runfailed` limit rotation steps to 0..3.
- Block states: `jukebox` `playlist_mode`.
- Renames recorded as removals: `freeze_immune_entity_types` → `immune_to_freezing`, `ignores_poison_and_regen` split into `immune_to_poison` and `immune_to_regeneration`, `interpolated` → `upscale`, and the GUI sprites `friends/button` → `friends/tab`, `friends/button_highlighted` → `friends/tab_highlighted`, `friends/loading` → `widget/loading`, `pause_menu/social_interactions` → `pause_menu/feedback`.

**Written down that no data shows:**

- `key.socialInteractions` → `key.otherPlayers` (B406's client dump; Mojang's snapshot 3 notes mention the menu). Neither ref of vanilla-mcdoc has either name in its `Keybind` enum, and mcmeta's summaries have no key list.
- `javaProject` absent on 26.4 because `SoundType` is gone (Java).
- `fluidModel` `two_fluids` → `one_fluid` and `soundModel` `sound_type` → `block_sound_set` (the data shows symptoms: `flowing_*` removed, `block_sound_set` added; the model is code).
- `entities.projectileItems` gaining `ice_ball` (the entity is data; being a projectile item is code).
- `fabric.minecraftDependency` `>=26.4- <26.5-` (Fabric's semver, measured on a server), no `geckolib` (upstream), the structure palette keys by data version (measured), `terrainPreview` `approximate` (measured).
- Behaviour and meaning from Mojang's notes: `cuboid` sizes one smaller, `steep`, ore discards, placed features limited to 3 × 3 chunks, multi-noise entries may not overlap, times over 2³¹ fail, freezing rules.

## V2 Upstream today, and how far each lags

Read 2026-11-25 (`scripts/v2-upstream.sh`, `scripts/v2-lag.mjs`, `results/v2-*.tsv`). Mojang: latest release 26.3, latest snapshot `26.4-pre-1` (2026-11-24 12:48 UTC); the 26.4 release is not out.

| Upstream | `26.4-pre-1` | Lag behind Mojang, last five |
|---|---|---|
| mcmeta (`-summary`, `-registries`, `-data`, `-assets`) | all four tags | Not measurable from git: mcmeta's commit dates equal Mojang's release times. Every tag was present when read. |
| vanilla-mcdoc (main) | "26.4 pre-release 1 changes" `09a273a` | pre-1 2.7 h; snapshot 9 3.0 h (snapshot 10 needed none); snapshot 8 17 h (its one change, a key bind); snapshot 6 2.4 h; snapshot 5 2.5 h; but snapshot 7's equipment predicate fix 9 days and an "undocumented" snapshot 2 change 5 weeks later |
| vanilla-mcdoc (`generated`, the export MSM vendors) | `26eb0a4` and `c0dd53f` | about 1 minute after each main commit |
| Fabric Loader | 0.20.1 listed for `26.4-pre-1` | Fabric meta lists every snapshot; it carries no dates |
| Fabric API | `0.167.1+26.4` | pre-1 2.7 h; snapshot 10 1.6 h (snapshot 9 had none: 10 came the same day); snapshot 8 4.3 h; snapshot 7 2.3 h; snapshot 6 3.6 h. For releases the build comes before the release (release candidates are relabelled) |
| Loom | not tied to a version: newest release 1.19.4 (the targets pin 1.19.3, which built the snapshot in B151), newest 1.20.0-alpha.32 | — |
| GeckoLib (Fabric) | none | Never built for a snapshot or pre-release. After releases: 26.1 0.3 days, 26.1.2 2.7, 26.2 0.8, 26.3 0.8 |

## V3 The mcdoc field diff

**Method.** `scripts/differ.ts --mcdoc both` resolves `createSchemaIndex` three ways. "Gated": the 26.4 tree at 26.3 and at 26.4-snapshot-7. "Refs": the 26.3 tree at 26.3 and the 26.4 tree at 26.4-snapshot-7. "Drift": both trees at 26.3, so only the differing refs show. It compares a canonical shallow signature of every named type and dispatcher member, then classifies each struct's top-level fields: added required, added optional, removed, made optional, made required, retyped. It also walks every resource's deep field paths.

| Step | Mode | Named types changed | Dispatchers changed | Members changed | Keys added / removed | Resources changed (deep paths +/−/retyped) | Time |
|---|---|---|---|---|---|---|---|
| 26.3 → 26.4-snapshot-7 | gated | 20 of 2,464 | 13 of 105 | 23 of 1,748 | 9 / 2 | 8 of 78 (22 / 3 / 54) | 116 ms |
| same | refs | the same counts | | | | | 88 ms |
| same | drift (both trees at 26.3) | 1 | 0 | 0 | 0 / 0 | 0 | 79 ms |
| 26.2 → 26.3 | gated, newest tree | 274 of 2,472 | 32 of 106 | 277 | 84 / 31 | 32 (137 / 90 / 35) | — |
| 26.4-snapshot-7 → 26.4-pre-1 | gated, newest tree | **0** | 0 | 0 | 0 / 0 | 0 | — |
| same | refs | 9 (8 new types) | 6 | 6 | 7 / 0 | 9 | — |

**False differences, 26.3 → 26.4 (gated):**

- 1 echo of the registry move: `RuleTest.predicate_type` now names `rule_test_type`.
- 1 echo inside a union: `NoiseGeneratorSettingsRef`, a reference or an inline settings object, changes only because the settings did.
- 4 shallow-only retypes: the sound variants point at renamed types (`CatSounds` → `OptionalCatSounds`). The deep compare shows what really changed: the fields became optional.
- About 21 duplicates: the same change seen in a named type and in each dispatcher member that reaches it (the zombie family five times, the pool elements twice four times).

None comes from gating itself. Two refs at the same version differ by one artefact: a one-member union. The deep path walk had to record optionality apart from the path, or "made optional" looked like removed plus added (fixed in the script).

**What a diff of two refs adds:** for a release step, nothing but that artefact. For a re-pin within one line, everything: the newest tree's 57 gates all say `26.4`.

## V4 Command tree diff and the function checker

26.3 → 26.4-snapshot-7: 2,474 nodes on both sides, 94 root commands, no node added or removed, 5 changed (`results/differ-26.3-26.4-snapshot-7.json` `commands`). They matter to a function's text as follows (`scripts/v4-mcfunction.ts`, `results/v4-mcfunction.json`; the vendored checker of each target with its mcdoc):

| Probe line | 26.3 | 26.4-snapshot-7 | `26.4-pre-1` data |
|---|---|---|---|
| `effect give @s #minecraft:harmful` | error "Tags are not allowed here" | warning only (unknown tag) | — |
| `test run … 1 false 5` (rotation 5) | clean | **error, column 39** "Expected an integer between 0 and 3" | — |
| `particle minecraft:item_snowball …` | clean | warning, line 0 column 9 (undeclared symbol) | — |
| `kill @e[type=#minecraft:freeze_immune_entity_types]` | clean | warning, column 13 | — |
| `playsound minecraft:intentionally_empty …` | clean | warning, column 10 | — |
| `setblock … minecraft:jukebox[playlist_mode=true]` | error (no such property) | clean | — |
| `summon minecraft:zombie … {FreezingTime:20}` | warning | warning (should be clean: the gating quirk) | — |
| `time add 3000000000t` | clean | clean (the new limit is not checked) | — |
| every probe | | | warning "Parser %0% hasn't been supported yet" |

So the dry run covers command changes as far as Spyglass does: tightenings come as errors with line and column, removed ids as warnings, and changed limits Spyglass does not know are invisible. On pre-release 1's data the checker breaks completely, because the report's format changed: an argument's information is nested under `argument`, the `brigadier:*` types became `minecraft:bool`, `integer` and the rest, string types split into `word`, `quoted_string` and `greedy_string`, `resource_key` became `resource`, entity and score-holder properties were renamed, and nodes carry `permissions`. After normalising the shape, 758 nodes still differ, every one a representation change; no command was added or removed.

## V5 Block states

`blocks.json`: 1,286 → 1,311 blocks, 25 added, none removed, one changed (`jukebox` adds `playlist_mode`), no default state changed. Where projects hold block states (`scripts/v6-scan.ts`, `results/v6-scan.json`):

- 91 structure templates with 270 palette entries (`id` and `properties` objects);
- 40 state objects in 59 noise settings elements (`default_block`, `default_fluid`), 7 in worldgen features, 2 in processor lists, 2 in material rules and 1 in an enchantment;
- 67 bracketed states inside function lines and 3 inside Rules strings.

A removed property or value would hit these places; 26.4 removes none.

## V6 Where ids live outside whole strings

Over 168 projects and 3,026 elements, 10,863 strings are whole namespaced ids, which the present walk sees. 336 ids sit inside longer strings:

- 172 in structure templates' block entity SNBT;
- 78 in script text (73 lines);
- 72 in function text (49 lines);
- 8 in other embedded SNBT or JSON;
- 4 in Rules strings;
- 2 in a mod element.

Bare ids (`setblock ~ ~ ~ stone`) were not counted. Only one removed 26.4 id occurs anywhere: `minecraft:interpolated` as a density function's `type` in `fixtures/worldgen-parity/mc-26.3`, a whole string the walk reports.

Planted test (`spike-src/plant.py` over a copy of the custom biome starter; `results/v6-planted-check.json`; clean on 26.3):

| Planted where | The present walk | 26.4's validators |
|---|---|---|
| model `parent` `minecraft:block/cube_top` | error | warning "Unknown model id" |
| entity type tag entry `#minecraft:ignores_poison_and_regen` | error | warning |
| feature `type` `minecraft:large_dripstone` | error with the hint | error (unknown dispatcher key) and a warning |
| density function `type` `minecraft:interpolated` | error | warning, and errors for its fields |
| predicate fluid `minecraft:flowing_water` | error | warning |
| lang value `minecraft:intentionally_empty` (plain text) | **error (false)** | nothing |
| function text: particle, entity tag, sound, SNBT `type:"minecraft:item_snowball"` | nothing | 4 of 4 warnings with line and column |
| script text `"minecraft:item_snowball"` | nothing | **nothing** |

## V7 Rename candidates

**Method.** `scripts/candidates.ts`:

1. Registries are matched by member overlap (Jaccard), one to one, best first, the same name winning ties.
2. Inside each pair, every removed member is scored against every added one. The name score is the overlap of stemmed tokens, plus 0.1 for the same folder and 0.25 when one name contains the other. Where the mcdoc tree maps the registry to a dispatcher (58 found from `type` fields with an id registry beside a dispatcher spread), the field sets add a shape score: same 0.5, superset 0.4, subset or similar 0.3.
3. Pairs are taken one to one, best first. A removed member with two equal best partners is listed as ambiguous, not proposed.

`scripts/v7-score.mjs` builds the truth from Mojang's notes ("renamed" statements whose old id was a member before and whose new id is one after), ids only, in `results/v7-truth-*.json`.

| Step | Truth | Proposed (score ≥ 0.4) | Correct per the notes | Precision | Recall | Missed |
|---|---|---|---|---|---|---|
| 26.2 → 26.3 | 20 | 42 | 15 | 0.36 (about 0.86 by hand) | 0.75 | `cache_once` → `cache` (`cache_2d` took it), `glowstone_blob` → `random_neighbor_spread`, `invert` → `reciprocal` |
| 26.3 → 26.4-snapshot-7 | 9 (6 from the notes, 3 by hand) | 6 | 4 | 0.67 | 0.44, or 0.78 with the ambiguous ties | `interpolated` → `upscale` (shape differs, no shared name), the second half of the tag split |

By hand, most "wrong" proposals of 26.2 → 26.3 are true moves the notes describe in other words:

- 15 trim palettes `trims/color_palettes/*` → `palettes/trim/*` and the base palette;
- `convertable_to_mud` → `convertible_to_mud`;
- `on_trial_chambers_maps` → `on_buried_trial_chambers_maps` and two cartographer trades;
- `value_check` → `int_value_check` and `float_value_check` (a split);
- `cache_2d` → `cache` (a merge).

Four sulfur cube sound files are unconfirmed. One is wrong: `map_color` → `cushion/color`. Of 26.3 → 26.4's six, two are wrong: `pause_menu/player_reporting` → `other_players` and `block/cube_top` → `calcite_slab_top`.

Registry renames (26.2 → 26.3), all found by overlap: `configured_feature` → `feature`, `feature` → `feature_type`, `configured_carver` → `carver`, `carver` → `carver_type`, `material_condition` → `material_condition_type`, `material_rule` → `material_rule_type`, and the configured feature tags.

Field moves (26.2 → 26.3): 34 distinct candidate pairs (176 sites). 15 are among 27 field renames the notes state, for example `surface_rule` → `material_rule`, `argument1` → `left`, `firstOctave` → `base_octave`, `explodes` → `destroy_on_use` and `yScale` → `room_vertical_radius_multiplier`. Missed: renames that also change the type or the discriminator (`function` → `type`, `name` → `items`, `recipe_id` → `recipes`).

## V8 A list of changed vanilla files

`scripts/v8-files.mjs` over tree-only fetches (`git fetch --depth=1 --filter=blob:none` of mcmeta's `-data` and `-assets` tags: about 1 s each, 3.5 MB for six tags) compares paths and blob hashes (`results/v8-files-*.json`).

| Step | Data files | Assets | List size |
|---|---|---|---|
| 26.3 → 26.4-snapshot-7 | 9,889 → 10,255: +368, −2, changed 1,646 (1,511 structure `.nbt`), 1 exact rename | 16,744 → 17,175: +460, −29, changed 188, 6 exact renames | 2,693 entries, 14.6 KB gzipped; without structure `.nbt` 1,182 entries, 72 KB raw, **6.7 KB gzipped** |
| 26.4-snapshot-7 → 26.4-pre-1 | +32, changed 1,527 (1,511 structure `.nbt`) | +9, −1, changed 186 | 9.5 KB gzipped |

The changed data files other than structures fall mostly in worldgen features (27), placed features (18), biomes (13), block tags (12), worldgen tags (9), density functions (9), noise settings (7), item tags (6) and material rules (6): exactly what projects replace or add to. 2,668 of the 2,693 entries are in folders a pack can override.

## V9 The dry run's cost

See "Go or no-go" above (`results/v9-*.json`, `results/v11-identity.json`). Phases for the cold worker on `examples/all-kinds`:

- read 75 ms;
- open 33 ms;
- copy 1 ms;
- open the copy 22 ms;
- migrate 4 ms;
- apply the move, load the 26.4 schemas and the Spyglass service, and validate: 2,048 ms;
- lower 88 ms.

## V10 Two targets at once

`scripts/v10-contexts.ts` (Node, `--expose-gc`), fully resolved:

| Context | Time | Heap after |
|---|---|---|
| baseline | — | 21.2 MB |
| 26.3 schema index | 132 ms | 30.0 MB |
| 26.4 schema index | 87 ms | 38.1 MB |
| 26.3 mcfunction service | 438 ms | 97.0 MB |
| 26.4 mcfunction service | 417 ms | 155.0 MB |

In the app, the schema indexes live in the renderer (or a worker) and the mcfunction services in the main process.

`LiveViewProps` (`app/src/renderer/src/liveviews/registry.ts`) is `project`, `element`, the vanilla readers, preferences and callbacks; views read the project's target from `project.targets` and nothing from the session store. So "before and after" is the same view mounted twice: once with the project, once with the dry run's moved copy and its element, each with a `VanillaDataReader` made for its own `mcVersion`. No seam for "a lowered set" is needed. No view mounts a Try it world. Mob, piece and vehicle views each open a WebGL canvas, so B819 should keep one pair alive at a time, as ADR 0136 D13 already says.

## V11 Problem identity

`scripts/v11-identity.ts` validated each project on its own target, then the moved copy on 26.4, and compared the problems under four keys:

- K1: code + element + path;
- K2: code + element;
- K3: severity + element + message;
- K4: K1 with array indices removed.

Over 168 projects: 17 problems before, 43 after (plus 7 migration problems and 31 changes). All four keys call the same 26 new:

- 19 in the planted project;
- the removed `interpolated` and its 4 schema errors in `fixtures/worldgen-parity/mc-26.3`;
- `blocks-items.fluid-no-fog` in `fixtures/sim-parity`;
- **one false**: `Unknown key "equip_sound"` in `examples/flows/leaf_glider`, the checker's snapshot gating (V4).

No path shifted here, because no field moved. A move that relocates a field would make K1 call the old problem new, hence the mapping through `MigrationChange.details`. The migration's own messages name the version (`… in Minecraft 26.4-snapshot-7`), so K3 would break at every re-pin.

## V12 The After moving list's own checks

| Report item | Its check after the move |
|---|---|
| A validation problem new on the new version (schema, references, functions, export) | the same code at the same element and path in the normal validation pass |
| A removed id the walk found in element data | re-run the walk at that pointer (the validators also warn there, as V6 shows) |
| A removed id in function text | the checker's warning at that line |
| A removed id in a script | **none**: only a re-run of a text search can check it |
| A rename reported, not applied | the walk at the pointer |
| An export the new version cannot make (`export.no-geckolib-target`) | the export pass's problem; needs lowering (cheap, V9) |
| A curated in-game check, a behaviour note, a Java note | **none**: a manual tick |
| A modpack mod without a build | **none offline**: a new Modrinth call on a click |

## V13 Moving back

26.4's steps: renames applied only when the shape matches (none today, so nothing to invert); removed ids are only reported (nothing to invert); `default_block` is dropped (no inverse without the saved value); pack formats come from lowering (nothing to invert). A rename's inverse is exact when the shape matches both ways.

`scripts/v13-v14-chain.ts` on `examples/all-kinds` (`results/v13-v14-all-kinds.json`):

1. Move to 26.4: one change, one dropped value, a saved record of 93 bytes.
2. Edit the moved element (`sea_level` 63 → 64).
3. Move back: the 26.3 target answers "No migration needed".
4. Put the value back from the record.

The project equals the original but for the user's edit, with no error on 26.3. The record must hold the element id, the pointer and the value. The rules are: put back when the element exists, the parent object exists and the key is absent; otherwise list it ("element gone", "place taken"). A hash of the element after the move tells "edited since" apart from "as moved".

## V14 Chains

A stand-in `mc-26.5` (the 26.4 target with its own id, version `26.5-snapshot-1` and a hook) has two invented changes: feature type `minecraft:ore` → `minecraft:mineral_vein`, and `disable_mob_generation` dropped from noise settings. It reads its vendored data and Spyglass service as 26.4's, through a mapped platform: a real third target needs its own package, because `readVendored` and the mcfunction broker are keyed by target id. The results:

- The chain on an in-memory copy (each hook in order, changes applied between hops, merged per element) **equals the two moves** on both `examples/all-kinds` (1 + 3 changes, 3 elements) and `fixtures/sample-worldgen` (0 + 1).
- Two moves need two undos; the chain applied as one `upgradeTarget` is one undo, back to the original.
- The direct one hop today answers `target.no-migration-path`.

## V15 `.msm/`

What lives there today:

- `trash/` and `undo/` (asset undo, emptied when a project is opened);
- `exported-ids.json` (ADR 0102);
- `msm-runtime.d.ts` (script typings).

How each tool treats it: the loader never reads it; `saveProject` never touches it; the exporters work from the in-memory project and never see it; `check-project` skips hidden folders but counts them toward its 25 MiB folder cap (2 MiB per file, 8 MiB per sound); the repository's `.gitignore` ignores `.msm/`.

Project sizes with pictures: the largest example is `examples/games/four_kingdoms` at 324 KB, then `examples/blocks-items` at 282 KB and `examples/all-kinds` at 237 KB; the largest fixture is `fixtures/structures-parity` at 1.3 MB.

## V16 Ejected Java projects

`packages/exporters/src/java-project/` writes the version into:

- `gradle.properties`: `minecraft_version`, `loader_version`, `loom_version`, `fabric_api_version`, `geckolib_modrinth_version_id`;
- `fabric.mod.json` `depends`: the target's `minecraftDependency`, Fabric Loader, Fabric API and GeckoLib;
- `build.gradle.kts`: Java's version;
- `gradle/wrapper/gradle-wrapper.properties`: Gradle;
- `README.md`: the Minecraft and MCSuperMods versions;
- `LICENSE-NOTES.md`: Loom.

The data and assets are copied under `src/main/resources`. Nothing in the project file, `.msm/` or the app's settings records that a project was ejected or where, so the user picks the folder.

What a read-only scan can and cannot see:

- **It sees** those files' lines, and ids in the resources' JSON (the engine's walk) and `.mcfunction` text (a token search).
- **It cannot see** the Java's use of Minecraft's and Fabric's APIs (what made 26.4's eject impossible), hand edits, or whether a build passes.
- `docs/reference/eject/` holds the template-extraction notes of B517 and B537b, not ejected samples.

## V17 Modrinth

`results/v17-modrinth.json`. **Update mods** (`ModpacksDialog.tsx`, `packages/interop/src/modrinth/resolve.ts`) calls `GET /v2/project/{id}` and then `GET /v2/project/{id}/version?loaders=["fabric"]&game_versions=["<mc>"]` for each mod, one mod after another.

One `POST /v2/version_files/update` answers the question for the whole pack: the body is `{ hashes: [SHA-1 of each pinned file], algorithm: "sha1", loaders: ["fabric"], game_versions: [<new version>] }`. Tried with Fabric API `0.165.2+26.3` and GeckoLib 5.5.7 for `26.4-pre-1`: 200 in 0.58 s; Fabric API came back as `0.167.1+26.4` and GeckoLib was absent. The headers say `x-ratelimit-limit: 300` (per minute).

## V18 Where the shared engine lives

`tools/check-deps/layers.json` gives `@msm/target-*` only `@msm/plugin-api`, `@msm/schemas` and `@msm/core`. A package named `@msm/target-migrate` would match that glob; an exact key wins over a glob, so the engine can have its own narrower entry (`@msm/plugin-api`, plus `@msm/schemas` if the shape test lives in it). Target packages must be allowed to import it by adding `@msm/target-migrate` (not `@msm/target-*`, which would let targets import each other) to the glob's allowed list. `@msm/targets` already allows `@msm/target-*`.

`isVersionCheckedPath` exempts everything under `packages/targets/`, so it must take `packages/targets/migrate/` back in to prove that the engine holds no version fact. Its test fixtures should then use invented versions such as `99.0`. The pattern `VERSION_FACT` matches `26.x` only.

`packages/targets/CLAUDE.md` should say: version facts only in `mc-*` packages; the engine beside them holds none and imports no target, and `check-deps` proves both; `all/` stays the only door from outside.

## V19 Size of a generated change set

`scripts/v19-changeset.mjs` (`results/v19-sizes-*.json`, the draft set for 26.3 → 26.4 in `results/v19-changeset-26.3-26.4.json`):

| Step | Changes | Additions | Gzipped with additions | Gzipped, additions as counts |
|---|---|---|---|---|
| 26.3 → 26.4-snapshot-7 | 86: ids 20, formats 53, commands 5, block states 1, packs 7; 33 manual, 46 news, 7 automatic | 830 | 9.2 KB (169 KB raw) | 2.5 KB (22 KB raw) |
| 26.2 → 26.3 | 1,472 | 2,680 | 45 KB | 23 KB |
| 26.4-snapshot-7 → 26.4-pre-1, commands not normalised | 789 (758 of them the report format) | 23 | 11 KB | 11 KB |

Leave out of the asar the additions' list (counts in the set, the list lazily) and the raw signatures (only ids, pointers, from and to).

## V20 Facts derived against facts typed by hand

`scripts/v20-facts.ts` lists every fact of `targetFacts()` one level deep, two in the grouped facts (`results/v20-facts.json`: whether the two targets differ, sizes, the `mc-26.4/CHANGES.md` row that names it; 85 of 106 found a row, 59 of CHANGES.md's 74 rows carry a date). `results/v20-classes.json` gives each fact its kind:

| Kind | Facts | Differ 26.3 / 26.4 | Examples |
|---|---|---|---|
| Derived from vendored data | 30 | 13 | `id`, `mcVersion`, `dataVersion`, `packFormats`, `worldgen.environmentAttributes`, `noiseSettingsDefaultBlock`, `vanillaFeatureOrder`, `blocks.fluidTags`, `dev.worldDataFolders`, `commands.vanillaNames`, `stats.vanillaCustomStats` |
| Derived, then cut or extended by a person | 9 | 0 | `folders.*`, `blocks.cauldrons`, `plantSoils`, `stemTags`, `commands.argumentTypes`, `dev.gameRules`, `items.dataPackComponents` |
| From an upstream service | 12 | 8 | `java`, `fabric.*` but `minecraftDependency`, `geckolib.*` |
| Hand-verified (`javap`, server, client, jar, screen) | 49 | 10 | `fabric.minecraftDependency`, `blocks.fluidModel`, `soundModel`, `soundTypes`, `soundSetEvents`, `controls.vanillaKeys`, `entities.projectileItems`, `vanillaTradeSets`, `worldgen.terrainPreview`, `worlds.fixedPlacementShape` |
| MSM's own | 6 | 1 | `vehicles.*`, `controls.runtimeKeys`, `particles` folders |

`VERIFY.md`'s seed is the 58 hand and partly hand facts, with their rows. Two of the hand facts that differ had a data symptom the differ found: `worlds.fixedPlacementShape` matches `fixed_placement`'s new minimum, and `blocks.fluidModel` matches the removed `flowing_*` fluids. A tool can at least flag hand facts whose neighbouring data changed.

## Files

- `scripts/`: `differ.ts` (V1, V3, V4, V5), `candidates.ts` and `v7-score.mjs` (V7), `v2-upstream.sh` and `v2-lag.mjs` (V2), `v4-mcfunction.ts` and `v4-gate-probe.ts` (V4), `v6-scan.ts` (V5, V6), `v8-files.mjs` (V8), `v9-dryrun.ts` (V9, V15), `v10-contexts.ts` (V10), `v11-identity.ts` (V9, V11), `v13-v14-chain.ts` (V13, V14), `v19-changeset.mjs` (V19), `v20-facts.ts` (V20). They import the workspace's sources through `tools/shared/workspace-hooks.ts` and run with `node` from the repository root.
- `spike-src/plant.py`: the planted project of V6 (writes eight elements into a copy of `examples/starters/custom_biome`).
- `results/`: the outputs named above; scratch paths are written `<scratch>`.

The mcmeta `26.2` and `26.4-pre-1` summaries, the newest vanilla-mcdoc export, the patch notes and the git trees were kept in the session's scratch folder only and deleted when the spike ended.
