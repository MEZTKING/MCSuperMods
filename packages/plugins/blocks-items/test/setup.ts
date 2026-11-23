/**
 * Loads both targets' indexes before any case of a test file runs (2026-11-23). 28 of the
 * package's 30 test files read them through `indexesFor`; built inside a file's first case,
 * that case paid the whole load and outran its timeout on a busy runner. A hook carries the
 * load instead, with its own (longer) timeout.
 */

import { builtInTargets } from '@msm/targets';
import { beforeAll } from 'vitest';
import { indexesFor } from './support';

beforeAll(async () => {
  await Promise.all(builtInTargets.map((bundle) => indexesFor(bundle)));
});
