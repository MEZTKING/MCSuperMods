/**
 * The round scripts of the four batch 1 types (B728, ADR 0132 D10): each plays to a win in
 * `@msm/sim` from the real lowered files of a game of its type, on both targets, with the lines
 * the mock-up shows ("Alex took a heart from Sam."). The games are hand-written here as the
 * types' starters will make them (B733); the scripts read their numbers and places from them.
 */
import type { Element, Target } from '@msm/plugin-api';
import { LocalWorldSource } from '@msm/sim';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  BED_WARS_ROUND,
  cornerFor,
  LIFESTEAL_ROUND,
  MANHUNT_ROUND,
  playRoundHeadless,
  ROUND_SCRIPTS,
  type RoundScript,
  roundFactsOf,
  roundScriptFor,
  SPLEEF_ROUND,
} from '../../../src/renderer/src/gamehub/rounds';
import { BED_STATES, BED_WARS, LIFESTEAL, lowered, MANHUNT, SPLEEF } from './round-support';

async function playType(script: RoundScript, elements: readonly Element[], target: Target) {
  const source = new LocalWorldSource({
    files: await lowered(elements, target),
    target: target as never,
    seed: 7,
    logLimit: 100_000,
    vanillaBlockstates: BED_STATES,
  });
  const facts = roundFactsOf(elements);
  if (facts === undefined) throw new Error('no game');
  return { source, run: playRoundHeadless(source, script, facts) };
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle.target] as const))(
  'round scripts on %s',
  (_id, target) => {
    it('Lifesteal: hearts move from the loser to the winner until one is left', async () => {
      const { run } = await playType(LIFESTEAL_ROUND, LIFESTEAL, target);
      expect(run.won).toBe(true);
      expect(run.lines).toContain('Kai took a heart from Alex.');
      expect(run.lines).toContain('Alex took a heart from Sam.');
      expect(run.lines).toContain('Sam has no hearts left.');
      expect(run.winners).toEqual(['Alex']);
      expect(run.lines).toContain('Alex won the round of Lifesteal!');
    });

    it('Manhunt: the runner gets away, a hunter follows and catches them', async () => {
      const { source, run } = await playType(MANHUNT_ROUND, MANHUNT, target);
      expect(run.won).toBe(true);
      const runner = ['Alex', 'Sam', 'Kai'].find((name) =>
        source.functions.state.tags.get(name)?.has('demo.game.manhunt.role.runner'),
      );
      expect(run.winners).toHaveLength(2);
      expect(run.winners).not.toContain(runner);
      expect(run.lines.some((line) => line.endsWith('won the round of Manhunt!'))).toBe(true);
    });

    it('Bed Wars-style: a bed brings a player back until it is broken; the last team wins', async () => {
      const { run } = await playType(BED_WARS_ROUND, BED_WARS, target);
      expect(run.won).toBe(true);
      expect(run.lines).toContain('Sam was slain by Alex');
      expect(run.lines).toContain('Alex was slain by Sam');
      expect(run.winners).toEqual(['Sam']);
      expect(run.lines).toContain('Sam won the round of Bed battle!');
    });

    it('Spleef: the floor goes from under the others; the last one up wins', async () => {
      const { run } = await playType(SPLEEF_ROUND, SPLEEF, target);
      expect(run.won).toBe(true);
      expect(run.lines).toContain('Sam fell out.');
      expect(run.lines).toContain('Alex fell out.');
      expect(run.winners).toEqual(['Kai']);
      expect(run.lines).toContain('Kai won the round of Spleef!');
    });
  },
);

describe('the round script registry', () => {
  it('has a script per batch 1 type, found by the game type', () => {
    expect(Object.keys(ROUND_SCRIPTS).sort()).toEqual([
      'bed-wars',
      'lifesteal',
      'manhunt',
      'spleef',
    ]);
    expect(roundScriptFor('bed_wars')).toBe(BED_WARS_ROUND);
    expect(roundScriptFor('tnt_run')).toBeUndefined();
  });

  it('fits a game’s places in the test area', () => {
    expect(
      cornerFor([
        [0, 64, 0],
        [15, 64, 15],
      ]),
    ).toEqual({ x: -16, y: 52, z: -16 });
    expect(cornerFor([])).toEqual({ x: 0, y: 0, z: 0 });
  });
});
