/**
 * The proof test of ADR 0136 D11 on the repository's own targets: `diff-targets` finds again,
 * from the vendored data alone, what was found by hand for 26.3 to 26.4 (`removed-ids.ts`,
 * `default_block`, `base_block`, the speleothem rename) and the renames B810 found that the
 * hand list records as removals.
 */
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MOVED_REGISTRIES,
  REMOVED_IDS,
  STILL_REGISTERED_ELSEWHERE,
} from '../../../packages/targets/mc-26.4/src/removed-ids.ts';
import {
  additionsText,
  changeSetText,
  diffTargets,
  readTarget,
  type TargetData,
  type TargetDiff,
} from '../diff.ts';
import { draftText } from '../draft.ts';
import type { TargetChange } from '../types.ts';

const folder = (name: string) =>
  fileURLToPath(new URL(`../../../packages/targets/${name}`, import.meta.url));

let before: TargetData;
let after: TargetData;
let diff: TargetDiff;
let changes: TargetChange[];

const find = (id: string): TargetChange | undefined => changes.find((c) => c.id === id);

beforeAll(async () => {
  before = await readTarget(folder('mc-26.3'));
  after = await readTarget(folder('mc-26.4'));
  diff = diffTargets(before, after);
  changes = diff.changeSet.changes;
});

describe('diff-targets on mc-26.3 and mc-26.4', () => {
  it('names both ends and their pins, and compares the formats gated', () => {
    expect(diff.changeSet.from).toBe('mc-26.3');
    expect(diff.changeSet.to).toBe('mc-26.4');
    expect(diff.changeSet.refs.to).toEqual({
      mcdoc: '1a674539af7150444db0e2fa8fc46318f91ed86b',
      mcmeta: '26.4-snapshot-7',
    });
    expect(diff.mcdocMode).toBe('gated');
  });

  it('finds the removed members of removed-ids.ts exactly, the moved registry as moved', () => {
    const removed: Record<string, string[]> = {};
    for (const c of changes) {
      if (c.what !== 'member-removed') continue;
      const registry = c.registry as string;
      removed[registry] = [...(removed[registry] ?? []), c.from as string];
    }
    const expected = Object.fromEntries(
      Object.entries(REMOVED_IDS).filter(([registry]) => !(registry in MOVED_REGISTRIES)),
    );
    expect(removed).toEqual(expected);
    const moved = Object.fromEntries(
      changes.filter((c) => c.what === 'registry-moved').map((c) => [c.subject, c.to]),
    );
    expect(moved).toEqual(MOVED_REGISTRIES);
    // The table lists a moved registry's members as removed; they all live on under the new name.
    for (const [from, to] of Object.entries(MOVED_REGISTRIES)) {
      expect([...(REMOVED_IDS[from] ?? [])].sort()).toEqual(
        [...(before.registries[from] ?? [])].sort(),
      );
      expect([...(after.registries[to] ?? [])].sort()).toEqual(
        [...(before.registries[from] ?? [])].sort(),
      );
    }
  });

  it('says which removed ids another registry still has, as STILL_REGISTERED_ELSEWHERE', () => {
    const still: Record<string, Record<string, string[]>> = {};
    for (const c of changes) {
      if (c.what !== 'member-removed' || c.stillIn === undefined) continue;
      const registry = c.registry as string;
      still[registry] = { ...still[registry], [c.from as string]: c.stillIn };
    }
    expect(still).toEqual(STILL_REGISTERED_ELSEWHERE);
  });

  it('lists default_block removed from noise settings and base_block added to the large speleothem config', () => {
    expect(find('formats:minecraft:resource/worldgen/noise_settings#/default_block')).toMatchObject(
      {
        what: 'field-removed',
        registry: 'minecraft:resource',
        handling: 'manual',
        source: 'mcdoc',
      },
    );
    expect(
      find('formats:::java::data::worldgen::feature::LargeSpeleothemConfig#/base_block'),
    ).toMatchObject({ what: 'field-addedRequired', handling: 'manual' });
    expect(find('formats:minecraft:feature_config/large_dripstone')?.what).toBe('type-removed');
    expect(find('formats:minecraft:feature_config/large_speleothem')?.what).toBe('type-added');
  });

  it('proposes large_dripstone to large_speleothem with a shape that differs (a superset)', () => {
    const c = find('ids:worldgen/feature_type/large_dripstone');
    expect(c?.stillIn).toEqual(['worldgen/feature', 'worldgen/placed_feature']);
    expect(c?.candidate).toEqual({
      kind: 'rename',
      to: 'large_speleothem',
      name: 0.33,
      shape: 'superset',
    });
  });

  it('finds the renames the hand list records as removals (B810 item 16)', () => {
    const renameTo = (id: string) => find(id)?.candidate?.to;
    expect(renameTo('ids:tag/entity_type/freeze_immune_entity_types')).toBe('immune_to_freezing');
    expect(renameTo('ids:texture/gui/sprites/friends/loading')).toBe('gui/sprites/widget/loading');
    expect(renameTo('ids:texture/gui/sprites/pause_menu/social_interactions')).toBe(
      'gui/sprites/pause_menu/feedback',
    );
    const interpolated = find('ids:worldgen/density_function_type/interpolated');
    expect(interpolated?.candidate?.ambiguous).toBe(true);
    expect(interpolated?.to).toContain('upscale');
    const button = find('ids:texture/gui/sprites/friends/button');
    expect(button?.candidate?.ambiguous).toBe(true);
    expect(button?.to).toContain('gui/sprites/friends/tab');
    expect(changes.some((c) => c.what === 'member-removed' && c.registry === 'rule_test')).toBe(
      false,
    );
  });

  it('finds the format, command and block state changes nobody wrote down', () => {
    expect(find('formats:minecraft:placement_modifier/fixed_placement#/positions')?.what).toBe(
      'field-retyped',
    );
    expect(find('formats:minecraft:trunk_placer/straight_trunk_placer#/trunk_width')?.what).toBe(
      'field-addedOptional',
    );
    expect(find('formats:minecraft:block_entity/jukebox#/playlist_position')?.what).toBe(
      'field-addedRequired',
    );
    // A renamed type shows as the fields that became optional, not as a retyped field.
    expect(
      find('formats:minecraft:resource/cat_sound_variant#/adult_sounds/ambient_sound')?.what,
    ).toBe('field-madeOptional');
    // The moved registry does not echo as a retyped field.
    expect(changes.some((c) => c.subject.endsWith('::RuleTest'))).toBe(false);
    expect(find('commands:effect give <targets> <effect>')).toMatchObject({
      what: 'argument-changed',
      from: 'minecraft:resource{"registry":"minecraft:mob_effect"} exec',
      to: 'minecraft:resource_or_tag{"registry":"minecraft:mob_effect"} exec',
    });
    expect(
      find('commands:test run <tests> <numberOfTimes> <untilFailed> <rotationSteps>')?.to,
    ).toBe('brigadier:integer{"max":3,"min":0} exec');
    expect(find('block-states:jukebox#playlist_mode')?.what).toBe('property-added');
    expect(find('packs:data_pack_format')).toMatchObject({
      from: { major: 121, minor: 0 },
      to: { major: 126, minor: 0 },
      handling: 'auto',
    });
    expect(diff.changeSet.additions['ids:block']).toBe(25);
  });

  it('gives the same changes when the formats are compared by the two refs', () => {
    const refs = diffTargets(before, after, { mcdoc: 'refs' });
    expect(refs.changeSet.changes).toEqual(changes);
  });

  it('gives byte-equal files on two runs', () => {
    const again = diffTargets(before, after);
    expect(changeSetText(again)).toBe(changeSetText(diff));
    expect(additionsText(again)).toBe(additionsText(diff));
    expect(draftText(again)).toBe(draftText(diff));
  });

  it('finds nothing between a target and itself', () => {
    expect(diffTargets(after, after).changeSet.changes).toEqual([]);
  });
});
