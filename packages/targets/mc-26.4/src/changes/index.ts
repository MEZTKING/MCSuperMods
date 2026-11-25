/**
 * This target's change set from `mc-26.3` (ADR 0136 D2): `generated.json`, written only by
 * `node tools/diff-targets/index.ts --from packages/targets/mc-26.3 --to packages/targets/mc-26.4
 * --out packages/targets/mc-26.4/src/changes/generated.json` and tied to the vendored data by
 * `test/changes.test.ts` (`--check`), with `curated.ts` laid over it. The additions list beside it
 * (`generated.additions.json`) is kept for the report's lazy list and is not bundled.
 *
 * `generated.vanilla-files.json`, written by the same run from both targets' file indexes
 * (`vendor/mcmeta/files.json`, B823), is the set's `vanillaFiles`: the paths of Minecraft's own
 * data and resource pack files added, removed, moved and changed since `mc-26.3`, never their
 * contents.
 */

import type { TargetChangeSet, VanillaFileChanges } from '@msm/plugin-api';
import { mergeChangeSet } from '@msm/target-migrate';
import { curated } from './curated';
import raw from './generated.json' with { type: 'json' };
import rawVanillaFiles from './generated.vanilla-files.json' with { type: 'json' };

/** The generated half, as `tools/diff-targets` wrote it. */
export const generatedChangeSet = raw as unknown as TargetChangeSet;

export { curated };

/** The vanilla files that changed since `mc-26.3`, as `tools/diff-targets` wrote them. */
export const vanillaFiles = rawVanillaFiles as VanillaFileChanges;

/** The merged change set with the vanilla files: this target's `changes` fact. */
export const changeSet: TargetChangeSet = {
  ...mergeChangeSet(generatedChangeSet, curated),
  vanillaFiles,
};
