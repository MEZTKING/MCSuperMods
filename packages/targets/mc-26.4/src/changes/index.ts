/**
 * This target's change set from `mc-26.3` (ADR 0136 D2): `generated.json`, written only by
 * `node tools/diff-targets/index.ts --from packages/targets/mc-26.3 --to packages/targets/mc-26.4
 * --out packages/targets/mc-26.4/src/changes/generated.json` and tied to the vendored data by
 * `test/changes.test.ts` (`--check`), with `curated.ts` laid over it. The additions list beside it
 * (`generated.additions.json`) is kept for the report's lazy list and is not bundled.
 */

import type { TargetChangeSet } from '@msm/plugin-api';
import { mergeChangeSet } from '@msm/target-migrate';
import { curated } from './curated';
import raw from './generated.json' with { type: 'json' };

/** The generated half, as `tools/diff-targets` wrote it. */
export const generatedChangeSet = raw as unknown as TargetChangeSet;

export { curated };

/** The merged change set: this target's `changes` fact. */
export const changeSet: TargetChangeSet = mergeChangeSet(generatedChangeSet, curated);
