/**
 * The local change-set type and the plugin API's (1.29.0) are the same shape: each is
 * assignable to the other (checked by `pnpm typecheck`), and a real run fits both.
 */
import type * as Api from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import type * as Local from '../types.ts';

const toApi = (set: Local.TargetChangeSet): Api.TargetChangeSet => set;
const toLocal = (set: Api.TargetChangeSet): Local.TargetChangeSet => set;
const changeToApi = (change: Local.TargetChange): Api.TargetChange => change;
const changeToLocal = (change: Api.TargetChange): Local.TargetChange => change;

describe('the local TargetChangeSet', () => {
  it('is assignable both ways to the plugin API type', () => {
    const set: Local.TargetChangeSet = {
      from: 'mc-98.0',
      to: 'mc-99.0',
      refs: { from: { mcdoc: 'a', mcmeta: '98.0' }, to: { mcdoc: 'b', mcmeta: '99.0' } },
      changes: [],
      additions: {},
    };
    expect(toLocal(toApi(set))).toBe(set);
    const change: Local.TargetChange = {
      id: 'ids:fluid/flowing_water',
      area: 'ids',
      what: 'member-removed',
      subject: 'fluid/flowing_water',
      handling: 'manual',
      source: 'registries',
      candidate: { kind: 'rename', to: 'water', name: 0.5, shape: 'none', ambiguous: true },
    };
    expect(changeToLocal(changeToApi(change))).toBe(change);
  });
});
