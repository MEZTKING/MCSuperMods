/**
 * Speed of the odds (B605; the B600 spike's 2S6, ADR 0120 D12's budget of 1 s for 1,000 rolls):
 * the largest vanilla table and the most enchantment-heavy one rolled 1,000 times in steps of
 * 250, and every vanilla table rolled a few times in a few situations to list what the evaluator
 * names as not worked out. Vanilla's files are read from a Minecraft client jar in the Loom cache
 * at test time and never kept; without a jar these tests skip. `B605_SPEED` (a file path) gets the
 * numbers.
 */
import { writeFileSync } from 'node:fs';
import type { Json, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { lootOdds, rollLoot, type Situation } from '../../src/index.js';
import { builtInTargets } from '../lower-fixture.js';
import { fakeContext } from './helpers.js';
import { loomJars, readJarData } from './vanilla-jar.js';

const TARGETS = await builtInTargets();
const FOLDERS = [
  'loot_table',
  'predicate',
  'item_modifier',
  'enchantment',
  'enchantment_provider',
  'recipe',
  'tags/item',
  'tags/enchantment',
  'tags/block',
  'tags/entity_type',
];
const SITUATIONS: readonly Situation[] = [
  { context: 'minecraft:chest' },
  {
    context: 'minecraft:block',
    tool: { id: 'minecraft:diamond_pickaxe', count: 1, enchantments: { 'minecraft:fortune': 3 } },
  },
  {
    context: 'minecraft:entity',
    killer: {
      type: 'minecraft:player',
      player: true,
      weapon: { id: 'minecraft:diamond_sword', count: 1, enchantments: { 'minecraft:looting': 3 } },
    },
  },
];

const report: Record<string, unknown> = {};

for (const jar of loomJars()) {
  const target = TARGETS.find((t) => t.mcVersion === jar.version) as Target | undefined;
  describe.skipIf(!target)(`vanilla tables of ${jar.version}`, () => {
    const files = readJarData(jar.path, FOLDERS);
    const tables = files.loot_table ?? {};

    it('1,000 rolls of the largest table and the most enchanted one fit the budget', () => {
      const largest = Object.entries(tables).sort(
        (a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length,
      )[0]?.[0] as string;
      const timings: Record<string, number> = {};
      for (const id of [
        largest,
        'minecraft:chests/ancient_city',
        'minecraft:chests/end_city_treasure',
      ]) {
        const runs: number[] = [];
        for (let run = 0; run < 5; run += 1) {
          const ctx = fakeContext(files, target as Target, run + 1);
          const start = performance.now();
          let done = 0;
          for (const step of lootOdds(id, { context: 'minecraft:chest' }, ctx, {
            rolls: 1000,
            step: 250,
            cancel: { cancelled: false },
          })) {
            done = step.done;
          }
          runs.push(performance.now() - start);
          expect(done).toBe(1000);
        }
        runs.sort((a, b) => a - b);
        timings[id] = Math.round(runs[2] as number);
        expect(runs[2]).toBeLessThan(1000);
      }
      report[`${jar.version}.speedMs`] = timings;
    }, 120_000);

    it('every vanilla table rolls, and what it cannot work out is named', () => {
      const types = new Map<string, number>();
      for (const [id] of Object.entries(tables)) {
        for (const situation of SITUATIONS) {
          const result = rollLoot(id, situation, fakeContext(files, target as Target, 1));
          for (const u of result.unsupported) {
            const key = `${u.kind}:${u.type}:${u.reason}`;
            types.set(key, (types.get(key) ?? 0) + 1);
          }
        }
      }
      report[`${jar.version}.tables`] = Object.keys(tables).length;
      report[`${jar.version}.unsupported`] = Object.fromEntries([...types].sort());
      expect(Object.keys(tables).length).toBeGreaterThan(1000);
    }, 120_000);
  });
}

describe('the speed report', () => {
  it('is written when asked', () => {
    const out = process.env.B605_SPEED;
    if (out) writeFileSync(out, `${JSON.stringify(report as Json, null, 1)}\n`);
    expect(true).toBe(true);
  });
});
