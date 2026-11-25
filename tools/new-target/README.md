# new-target

Makes a Minecraft version target from the newest one, re-pins one, or says whether Mojang has something newer (ADR 0136 D11, brief B814). It runs the vendoring tools and `tools/diff-targets`, recomputes the facts that come from vendored data, drafts the ones that come from upstream services and writes `VERIFY.md`, the checklist of everything a person must read again. It never decides a hand-verified fact and never edits the engine mod.

```
node tools/new-target/index.ts --from mc-<a> --version <new> [--mcdoc-ref <sha>] [--dry-run [--out <dir>]]
node tools/new-target/index.ts --repin mc-<b> --version <new> [--mcdoc-ref <sha>] [--dry-run [--out <dir>]]
node tools/new-target/index.ts --check
```

- `--from mc-<a> --version <new>` makes `packages/targets/mc-<line of new>/` from `mc-<a>` (the newest target). It refuses a folder that exists.
- `--repin mc-<b> --version <new>` refreshes `mc-<b>` to a newer version of its own line (a snapshot to the next, or to the release).
- `--mcdoc-ref <sha>` pins the vanilla-mcdoc commit to vendor; without it the newest commit of its default branch is read with `git ls-remote`.
- `--dry-run` writes everything into a folder outside the repository (`--out <dir>`, or a new folder in the system's temporary folder) and nothing into it.
- `--check` reads Mojang's version manifest once and prints, for each target, whether a newer version of its line exists, and each newer line no target covers, with the command that would act on it. It exits 1 when something is newer, 0 when nothing is. The main session runs it at each release cut; no scheduled job does.

Other exit codes: 1 when a run fails (nothing is written into the repository: a run builds in a work folder first), 2 for bad arguments.

## What a run does

1. Reads the base target's facts (its `src/index.ts`) and `CHANGES.md`.
2. Copies the folder into a work folder. A new target leaves out installs and the files of the previous step: `src/migrate.ts`, `src/removed-ids.ts`, `src/changes/`, their tests, `VERIFY.md`, `CHANGES-draft.md`, `drafts/`.
3. Vendors the new version: `tools/sync-mcmeta`, `tools/sync-mcdoc` (build mode) and `tools/sync-feature-order`.
4. Recomputes the derived facts (`derive.ts`: id, version, channel, data version, pack formats, refs, feature steps and order, environment attributes, dimension height, `noiseSettingsDefaultBlock`, vanilla command names, saddle tag, villager types, game rule names, custom statistics, statistic types) and prints each one that changed. On the repository's own targets every one of them equals the fact as typed (a test).
5. A new target only: sets the identity facts in `src/target.ts` (`id`, `mcVersion`, `channel`, `previous`, `mcdocRef`, `mcmetaRef`, `dataVersion`, both pack formats, `noiseSettingsDefaultBlock`), a new header comment, the package name, `src/index.ts`'s comment, and a `CHANGES.md` with no verified facts; it removes the import and the `changes` and `migrateFrom` members of the previous step. Every other fact keeps the base target's value until a person has read it again. A literal the tool cannot find exactly once is listed in `VERIFY.md` as not set.
6. Runs `tools/diff-targets` from the target's `previous` (the base, for a new target) and writes `src/changes/generated.json`, `src/changes/generated.additions.json` and `CHANGES-draft.md`. A re-pin also writes `drafts/since-<old version>.md`, the difference from the old pin.
7. Drafts the upstream facts (`fabric-meta.ts`): Fabric Loader from Fabric's meta service, Fabric API and Loom from Fabric's Maven, Java from Mojang's version JSON, and the `fabric.mod.json` range by the targets' rule (`~<line>` for a release, `>=<line>- <next>-` for a test version). Each is "(verify at implementation)"; one that cannot be read is said so and the run goes on. They go into `drafts/engine-mod.properties`, to be copied to `engine-mod/versions/<line>.properties` once checked.
8. Writes `VERIFY.md` (`verify.ts`): the derived facts before and after; the upstream drafts, and what to look up on Modrinth (the Fabric API jar, GeckoLib); every row of the base target's `CHANGES.md` as a checkbox with its last date (or its section's) and source, flagged where the change set names data in the row; hand facts no row names; facts not in the table of fact kinds; the tests, goldens, GameTests and parity fixtures to rerun; the manual work of ADR 0136 D11; and, for a new target, the wiring (`pnpm i`, tsconfig references, `@msm/targets`, the migration over `src/changes/`, `engine-mod/versions/`, check-deps and CI).
9. A real run then moves the new folder into `packages/targets/`, or copies back only a re-pin's `vendor/`, the generated change set, `CHANGES-draft.md`, `VERIFY.md` and `drafts/`: a re-pin never touches `src/target.ts`, the tests or `CHANGES.md`.

The table of fact kinds (`FACT_CLASSES` in `verify.ts`) is B810 V20's (`docs/reference/spikes/b810/results/v20-classes.json`) plus `previous`; a fact a target adds later shows in `VERIFY.md` as not classified until it is added there.

## Network

Only a run by hand fetches: Mojang's version manifest and version JSON, Fabric's meta service and Maven, and through the vendoring tools GitHub (mcmeta, vanilla-mcdoc) with jsDelivr as fallback. Requests made by this tool send the client name `MCSuperMods-new-target (+https://github.com/MEZTKING/MCSuperMods)` and nothing about the person running it. Everything fetched is data: parsed, checked and written, never executed. Every reader is injected (`CliDeps`, `RunOptions`: `fetcher`, `syncers`, `loadFacts`), so the tests run offline.

## Not done here

- Running it on the real 26.4 re-pin (B826).
- Hand-verified facts, curated sentences and renames, the runtime port and the Java project generator: listed in `VERIFY.md`, never decided by the tool.
- Wiring a new target into `@msm/targets`, the tsconfig references, the app and CI: listed, not done.
- GeckoLib and Fabric API's Modrinth facts: listed for a person to look up.

## Tests

`pnpm --filter @msm/tools test` (or `pnpm exec vitest run new-target` in `tools/`). `test/new-target.test.ts` copies the repository's newest target into a temporary repository (with `node_modules` and the referenced packages linked to the real ones) and runs the tool against fixture upstreams made from that target's own vendored files with planted changes (`test/fixture-upstream.ts`; the mcmeta step is the real `sync-mcmeta` with a fixture `fetchFile`) and recorded Fabric and Mojang answers (`test/fixtures/`): a made `mc-99.0` type-checks with `tsc` and loads with the new id, version and `previous`; a re-pin changes only vendored data, the change set and the drafts; a dry run writes nothing into the repository. `test/units.test.ts`: the derived facts of both real targets, the text edits, the Fabric drafts, `--check`, the arguments, and `VERIFY.md` listing every dated row of the newest target's `CHANGES.md`.
