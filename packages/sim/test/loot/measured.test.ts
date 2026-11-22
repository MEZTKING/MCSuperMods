/**
 * The odds against the game (B605; ADR 0120 D9, limit 2L1): every loot case the B600 spike
 * measured on the real server (10,000 rolls each, `docs/reference/spikes/b600/results/server-*.json`,
 * both targets) is rolled 100,000 times by MSM's evaluator at a seed, and every outcome (an item
 * and its count) must be within 2 percentage points of the game's share, 3 for the explosion cases
 * (2,000 rolls). The tables are MSM's own fixture (`b600-pack.json`, written by the spike's
 * `make_pack.py`).
 *
 * The three enchanting cases need vanilla's enchantments: they run only where a Minecraft client
 * jar is in the Loom cache, read at test time and never kept (as `packages/terrain/test` does).
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json, Target } from '@msm/plugin-api';
import { afterAll, describe, expect, it } from 'vitest';
import type { Situation } from '../../src/index.js';
import type { WorkStack } from '../../src/loot/state.js';
import { newState } from '../../src/loot/state.js';
import { rollTable } from '../../src/loot/table.js';
import { builtInTargets, REPO_ROOT } from '../lower-fixture.js';
import { type FakeFiles, fakeContext, spikeKey } from './helpers.js';
import { loomJars, readJarData } from './vanilla-jar.js';

interface Observed {
  readonly n: number;
  readonly hist?: Record<string, Record<string, number> | number>;
  readonly total?: Record<string, number>;
  readonly marginal?: Record<string, number>;
}

const PACK = JSON.parse(
  readFileSync(new URL('./b600-pack.json', import.meta.url), 'utf8'),
) as FakeFiles;
// The fixture's `lime_wool` names vanilla's `minecraft:tool/can_silk_touch`; a self-written
// stand-in with the same meaning (a tool with Silk Touch) is given here.
PACK.predicate = { ...PACK.predicate };
PACK.predicate['minecraft:tool/can_silk_touch'] = {
  type: 'minecraft:match_tool',
  predicate: {
    predicates: {
      'minecraft:enchantments': [{ enchantments: 'minecraft:silk_touch', levels: { min: 1 } }],
    },
  },
};

const RESULTS_DIR = join(REPO_ROOT, 'docs/reference/spikes/b600/results');

/**
 * The spike's results file of a target (`server-<version>.json`), found by listing so no version
 * is named here: the version before any `-` matches the target's.
 */
function resultsFile(target: Target): string | undefined {
  const base = (version: string): string => version.split('-')[0] ?? version;
  return readdirSync(RESULTS_DIR)
    .filter((name) => /^server-.+\.json$/.test(name))
    .find((name) => base(name.slice('server-'.length, -'.json'.length)) === base(target.mcVersion));
}

const TARGETS = await builtInTargets();
const ROLLS = Number(process.env.B605_ROLLS ?? 100_000);
const TOLERANCE = 2;
const EXPLOSION_TOLERANCE = 3;
const SWORD = 'minecraft:diamond_sword';

function observed(file: string): Record<string, Observed> {
  return JSON.parse(readFileSync(join(RESULTS_DIR, file), 'utf8')) as Record<string, Observed>;
}

const sword = (looting: number): Situation['killer'] => ({
  type: 'minecraft:player',
  player: true,
  weapon: { id: SWORD, count: 1, enchantments: { 'minecraft:looting': looting } },
});

/** The table and situation of a case name, as the spike rolled it. */
function caseOf(name: string): { table: string; situation: Situation; explosion: boolean } | null {
  let m = /^loot\.(.+?)(\.preparsed|\.player2|\.console)?$/.exec(name);
  if (m)
    return {
      table: `msm_b600:${m[1]}`,
      situation: { context: 'minecraft:chest' },
      explosion: false,
    };
  m = /^mine\.(.+)\.(hand|pick|fortune(\d)|silk)$/.exec(name);
  if (m) {
    const tool = m[2] as string;
    const enchantments: Record<string, number> = m[3]
      ? { 'minecraft:fortune': Number(m[3]) }
      : tool === 'silk'
        ? { 'minecraft:silk_touch': 1 }
        : {};
    const situation: Situation =
      tool === 'hand'
        ? { context: 'minecraft:block' }
        : {
            context: 'minecraft:block',
            tool: { id: 'minecraft:diamond_pickaxe', count: 1, enchantments },
          };
    return { table: `minecraft:blocks/${m[1]}`, situation, explosion: false };
  }
  m = /^kill\.(.+)\.(player\.looting(\d)|console)$/.exec(name);
  if (m) {
    const killer = m[3] === undefined ? undefined : sword(Number(m[3]));
    const situation: Situation = killer
      ? { context: 'minecraft:entity', killer }
      : { context: 'minecraft:entity' };
    return { table: `msm_b600:${m[1]}`, situation, explosion: false };
  }
  m = /^explode\.(.+)\.(block|tnt)\.(\d)$/.exec(name);
  if (m) {
    return {
      table: `minecraft:blocks/${m[1]}`,
      situation: {
        context: 'minecraft:block',
        explosion: { power: Number(m[3]), decays: m[2] === 'block' },
      },
      explosion: true,
    };
  }
  return null;
}

/** Rolls a table `n` times and counts each key's per-roll count, as the spike's results do. */
function simulate(
  files: FakeFiles,
  target: Target,
  table: string,
  situation: Situation,
  n: number,
  seed: number,
): Record<string, Record<string, number>> {
  const ctx = fakeContext(files, target, seed);
  const state = newState(ctx, situation);
  const maxDamage = target.items?.vanillaTools?.diamond?.sword?.durability;
  const hist: Record<string, Record<string, number>> = {};
  for (let i = 0; i < n; i += 1) {
    const out: WorkStack[] = [];
    rollTable(state, table, '', out);
    const got: Record<string, number> = {};
    for (const s of out) {
      const key = spikeKey(s, s.id === SWORD ? maxDamage : undefined);
      got[key] = (got[key] ?? 0) + s.count;
    }
    for (const [key, count] of Object.entries(got)) {
      const h = hist[key] ?? {};
      hist[key] = h;
      h[count] = (h[count] ?? 0) + 1;
    }
  }
  for (const h of Object.values(hist)) {
    const some = Object.values(h).reduce((a, b) => a + b, 0);
    if (some < n) h[0] = (h[0] ?? 0) + n - some;
  }
  return hist;
}

/** The largest difference in points over every outcome (key and count). */
function worstCell(
  game: Record<string, Record<string, number>>,
  gameN: number,
  ours: Record<string, Record<string, number>>,
  oursN: number,
): { points: number; at: string } {
  let worst = { points: 0, at: '' };
  for (const key of new Set([...Object.keys(game), ...Object.keys(ours)])) {
    const g = game[key] ?? { 0: gameN };
    const o = ours[key] ?? { 0: oursN };
    for (const count of new Set([...Object.keys(g), ...Object.keys(o)])) {
      const points = Math.abs((g[count] ?? 0) / gameN - (o[count] ?? 0) / oursN) * 100;
      if (points > worst.points) worst = { points, at: `${key} x${count}` };
    }
  }
  return worst;
}

/** Shares of each part of a key (an item, or an enchantment with its level) over the rolls. */
function marginals(
  hist: Record<string, Record<string, number>>,
  n: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, h] of Object.entries(hist)) {
    const some = n - (h[0] ?? 0);
    const [item = '', rest = ''] = key.split('|');
    for (const part of rest ? rest.split(',') : []) {
      const k = `${item}|${part}`;
      out[k] = (out[k] ?? 0) + some / n;
    }
  }
  return out;
}

/** The worst outcome of each case in points, written to `B605_REPORT` (a file path) when set. */
const measuredReport: Record<string, Record<string, number>> = {};
function note(target: string, name: string, points: number): void {
  const byCase = measuredReport[target] ?? {};
  measuredReport[target] = byCase;
  byCase[name] = Math.round(points * 100) / 100;
}
afterAll(() => {
  const out = process.env.B605_REPORT;
  if (out) writeFileSync(out, `${JSON.stringify(measuredReport, null, 1)}\n`);
});

for (const target of TARGETS) {
  const file = resultsFile(target);
  if (!file) continue;
  const game = observed(file);
  const cases = Object.keys(game)
    .map((name) => ({ name, spec: caseOf(name) }))
    .filter((c) => c.spec !== null && !c.name.startsWith('loot.enchant_'));

  describe(`the measured loot cases on ${target.id}`, () => {
    it('covers every roll case of the spike but the enchanting ones', () => {
      expect(cases.length).toBeGreaterThanOrEqual(80);
    });

    for (const [i, { name, spec }] of cases.entries()) {
      if (!spec) continue;
      it(`${name} is within ${spec.explosion ? EXPLOSION_TOLERANCE : TOLERANCE} points`, () => {
        const obs = game[name] as Observed;
        let hist = obs.hist as Record<string, Record<string, number>>;
        // The explosion results count apples only, as one histogram.
        if (spec.explosion)
          hist = { 'minecraft:apple': obs.hist as unknown as Record<string, number> };
        const ours = simulate(PACK, target, spec.table, spec.situation, ROLLS, 1000 + i);
        const worst = worstCell(hist, obs.n, ours, ROLLS);
        note(target.id, name, worst.points);
        expect(worst.points, worst.at).toBeLessThanOrEqual(
          spec.explosion ? EXPLOSION_TOLERANCE : TOLERANCE,
        );
      });
    }
  });

  const jar = loomJars().find((j) => j.version === target.mcVersion);
  describe.skipIf(!jar)(`the enchanting cases on ${target.id} (vanilla data from the jar)`, () => {
    const files = (): FakeFiles => {
      const vanilla = readJarData(jar?.path ?? '', [
        'enchantment',
        'tags/enchantment',
        'tags/item',
      ]);
      const merged: FakeFiles = { ...vanilla };
      for (const [folder, byId] of Object.entries(PACK)) {
        merged[folder] = { ...(merged[folder] ?? {}), ...byId };
      }
      // The project's `minecraft:curse` merges into vanilla's (replace false).
      const curse = vanilla['tags/enchantment']?.['minecraft:curse'] as { values: Json[] };
      const ours = PACK['tags/enchantment']?.['minecraft:curse'] as { values: Json[] };
      (merged['tags/enchantment'] as Record<string, Json>)['minecraft:curse'] = {
        values: [...curse.values, ...ours.values],
      };
      return merged;
    };

    for (const name of [
      'loot.enchant_randomly_book',
      'loot.enchant_levels_book',
      'loot.enchant_levels_sword',
    ]) {
      it(`${name}: each enchantment and level within ${TOLERANCE} points`, () => {
        const obs = game[name] as Observed;
        const gameShares = Object.fromEntries(
          Object.entries(obs.marginal ?? obs.total ?? {}).map(([k, v]) => [k, v / obs.n]),
        );
        const n = ROLLS;
        const ours = marginals(
          simulate(
            files(),
            target,
            `msm_b600:${name.slice(5)}`,
            { context: 'minecraft:chest' },
            n,
            77,
          ),
          n,
        );
        let worst = { points: 0, at: '' };
        for (const key of new Set([...Object.keys(gameShares), ...Object.keys(ours)])) {
          const points = Math.abs((gameShares[key] ?? 0) - (ours[key] ?? 0)) * 100;
          if (points > worst.points) worst = { points, at: key };
        }
        note(target.id, name, worst.points);
        expect(worst.points, worst.at).toBeLessThanOrEqual(TOLERANCE);
      }, 60_000);
    }
  });
}
