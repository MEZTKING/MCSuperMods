/**
 * B600's measured predicate cases (`docs/reference/spikes/b600/results/server-*.json`, "pred"),
 * on both targets: the fixture's predicates tried by `execute if predicate` from the console (no
 * entity) and from a player. Where the game answers no because the situation lacks something it
 * could hold (a tool, a killer, damage), MSM answers no too; where MSM's situation cannot know
 * (an enchantment's effects), MSM answers unknown, never no (ADR 0120 D4).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import { type EvalContext, type Situation, testPredicate } from '../../src/index.js';
import { REPO_ROOT } from '../lower-fixture.js';
import { B600_PREDICATES, contextFor, targetsOnce } from './helpers.js';

/** One results file per target the spike ran (`server-<version>.json`). */
const RESULTS_FOLDER = join(REPO_ROOT, 'docs/reference/spikes/b600/results');
const RESULTS = readdirSync(RESULTS_FOLDER)
  .filter((name) => /^server-.+\.json$/.test(name))
  .map((name) => {
    const file = join(RESULTS_FOLDER, name);
    return {
      version: name.slice('server-'.length, -'.json'.length),
      pred: (JSON.parse(readFileSync(file, 'utf8')) as { pred: Record<string, unknown> }).pred,
    };
  });

it('reads a results file for each target', () => {
  expect(RESULTS).toHaveLength(2);
});

const CONSOLE: Situation = { context: 'minecraft:command' };
const PLAYER: Situation = {
  context: 'minecraft:command',
  thisEntity: { type: 'minecraft:player', flags: { is_sneaking: false } },
  biome: 'minecraft:desert',
  position: [0, 7, 0],
};

let targets: readonly Target[] = [];
beforeAll(async () => {
  targets = await targetsOnce();
});

const ctxFor = (target: Target, seed = 1): EvalContext =>
  contextFor(target, { predicate: B600_PREDICATES }, {}, seed);

const answer = (target: Target, id: string, situation: Situation) =>
  testPredicate(`msm_b600:${id}`, situation, ctxFor(target)).answer;

/** The rate of yes over many samples. */
function rate(target: Target, id: string, situation: Situation, samples = 100_000): number {
  const ctx = ctxFor(target, 7);
  let yes = 0;
  for (let i = 0; i < samples; i++)
    if (testPredicate(`msm_b600:${id}`, situation, ctx).answer === 'yes') yes++;
  return yes / samples;
}

// Heavy: the random cases draw 100,000 samples each, so under a loaded machine (four shared cores) the
// default 5 s is too short (2026-11-22). An explicit timeout, never a retry.
describe.each(RESULTS)('B600 predicate cases ($version)', { timeout: 60_000 }, ({ pred }) => {
  const target = () => targets[0] as Target;
  const asGame = (value: unknown) => (value === 1 ? 'yes' : 'no');

  it('answers the deterministic cases as the game did', () => {
    for (const t of targets) {
      expect(answer(t, 'int_check', CONSOLE)).toBe(asGame(pred.int_check));
      expect(answer(t, 'inverted_zero', CONSOLE)).toBe(asGame(pred.inverted_zero));
      expect(answer(t, 'is_player', CONSOLE)).toBe(asGame(pred['is_player.console']));
      expect(answer(t, 'is_player', PLAYER)).toBe(asGame(pred['is_player.player']));
      expect(answer(t, 'sneaking', CONSOLE)).toBe(asGame(pred['sneaking.console']));
      expect(answer(t, 'sneaking', PLAYER)).toBe(asGame(pred['sneaking.playerStanding']));
      const crouching: Situation = {
        ...PLAYER,
        thisEntity: { type: 'minecraft:player', flags: { is_sneaking: true } },
      };
      expect(answer(t, 'sneaking', crouching)).toBe(asGame(pred['sneaking.playerCrouching']));
      expect(answer(t, 'tool_any', CONSOLE)).toBe(asGame(pred['tool_any.console']));
      expect(answer(t, 'tool_any', PLAYER)).toBe(asGame(pred['tool_any.player']));
      expect(answer(t, 'killed_by_player', CONSOLE)).toBe(asGame(pred['killed_by_player.console']));
      expect(answer(t, 'killed_by_player', PLAYER)).toBe(asGame(pred['killed_by_player.player']));
      expect(answer(t, 'survives_explosion', CONSOLE)).toBe(
        asGame(pred['survives_explosion.console']),
      );
      expect(answer(t, 'table_bonus', PLAYER)).toBe(asGame(pred['table_bonus.player']));
      expect(answer(t, 'damage_fire', CONSOLE)).toBe(asGame(pred['damage_fire.console']));
      expect(answer(t, 'plains', PLAYER)).toBe(asGame(pred['plains.player']));
      expect(answer(t, 'high', PLAYER)).toBe(asGame(pred['high.y7']));
      expect(answer(t, 'high', { ...PLAYER, position: [0, 150, 0] })).toBe(
        asGame(pred['high.y150']),
      );
      const scored = (score: number): Situation => ({
        ...PLAYER,
        thisEntity: { type: 'minecraft:player', scores: { b600: score } },
      });
      expect(answer(t, 'score5', scored(3))).toBe(asGame(pred['score5.at3']));
      expect(answer(t, 'score5', scored(6))).toBe(asGame(pred['score5.at6']));
      expect(answer(t, 'score5', CONSOLE)).toBe(asGame(pred['score5.console']));
      const at = (ticks: number): Situation => ({
        ...CONSOLE,
        time: { clock: 'minecraft:overworld', ticks },
      });
      expect(answer(t, 'day', at(1000))).toBe(asGame(pred['day.at1000']));
      expect(answer(t, 'day', at(13000))).toBe(asGame(pred['day.at13000']));
      expect(answer(t, 'day', at(25000))).toBe(asGame(pred['day.at25000']));
      const weather = (raining: boolean): Situation => ({
        ...CONSOLE,
        weather: { raining, thundering: false },
      });
      expect(answer(t, 'raining', weather(true))).toBe(asGame(pred['raining.after150ticks']));
      expect(answer(t, 'raining', weather(false))).toBe(asGame(pred['raining.clearAfter150ticks']));
    }
  });

  it('keeps the random cases within the 2-point tolerance of limit 2L1', () => {
    const t = target();
    expect(Math.abs(rate(t, 'chance30', CONSOLE) - (pred['chance30.rate'] as number))).toBeLessThan(
      0.02,
    );
    expect(Math.abs(rate(t, 'all_any', CONSOLE) - (pred['all_any.rate'] as number))).toBeLessThan(
      0.02,
    );
    expect(
      Math.abs(rate(t, 'list_form', CONSOLE) - (pred['list_form.rate'] as number)),
    ).toBeLessThan(0.02);
    expect(Math.abs(rate(t, 'ref', CONSOLE) - (pred['ref.rate'] as number))).toBeLessThan(0.02);
  });

  it('says unknown where the game answered from what MSM cannot know', () => {
    const t = target();
    // The game answered no from the console and a player: the check exists only inside an
    // enchantment's effects. MSM's honest answer is unknown, with the type noted.
    expect(pred['enchant_active.console']).toBe(0);
    const result = testPredicate('msm_b600:enchant_active', PLAYER, ctxFor(t));
    expect(result.answer).toBe('unknown');
    expect(result.unsupported).toEqual([
      {
        kind: 'condition',
        type: 'enchantment_active_check',
        path: 'msm_b600:enchant_active#',
        reason: 'needs_world',
      },
    ]);
    // Weather and time not set in the situation: only the game knows.
    expect(answer(t, 'raining', CONSOLE)).toBe('unknown');
    expect(answer(t, 'day', CONSOLE)).toBe('unknown');
    // A predicate id with no file (the game failed the command).
    expect(pred.missing).toBe(-1);
    const missing = testPredicate('msm_b600:nope', CONSOLE, ctxFor(t));
    expect(missing.answer).toBe('unknown');
    expect(missing.unsupported[0]).toMatchObject({ kind: 'reference', reason: 'missing_file' });
  });
});

describe('the chance of yes', () => {
  it('is worked out for the random cases', () => {
    const t = targets[0] as Target;
    const chanceOf = (id: string) =>
      testPredicate(`msm_b600:${id}`, CONSOLE, ctxFor(t)).parts.chance;
    expect(chanceOf('chance30')).toBeCloseTo(0.3);
    expect(chanceOf('all_any')).toBeCloseTo(0.5);
    expect(chanceOf('ref')).toBeCloseTo(0.3);
    expect(chanceOf('inverted_zero')).toBe(1);
    expect(chanceOf('int_check')).toBe(1);
    expect(chanceOf('raining')).toBeUndefined();
  });
});
