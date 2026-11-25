/**
 * Lifesteal's practice round (B728): Kai takes a heart from Alex, then Alex takes every heart
 * Sam and Kai have, one knock-out at a time, so the hearts move as the game moves them ("Alex
 * took a heart from Sam.") until one player is left. The numbers are the game's own (starting
 * hearts, hearts per kill); a game that never ends a round (endless, or starting again at zero)
 * plays the knock-outs and stops.
 */

import { mechanicOf, type RoundFacts } from './facts';
import { numberIn, type RoundScript, type RoundScriptStep } from './script';

/** Ticks between knock-outs: a death, the respawn a second later, and a breath. */
const BETWEEN = 30;

export const LIFESTEAL_ROUND: RoundScript = {
  type: 'lifesteal',
  starter: 'lifesteal',
  players: ['Alex', 'Sam', 'Kai'],
  steps(facts: RoundFacts): readonly RoundScriptStep[] {
    const hearts = mechanicOf(facts, 'hearts');
    const start = numberIn(hearts, 'start', 10);
    const perKill = Math.max(1, numberIn(hearts, 'per_kill', 1));
    const steps: RoundScriptStep[] = [
      { at: 0, action: { do: 'join', who: 'Alex' } },
      { at: 0, action: { do: 'join', who: 'Sam', at: { near: 'Alex', dx: 3 } } },
      { at: 0, action: { do: 'join', who: 'Kai', at: { near: 'Alex', dz: 3 } } },
    ];
    if (facts.round.start === 'command') steps.push({ at: 0, action: { do: 'start' } });
    let t = facts.round.countdown * 20 + 20;
    steps.push({ at: t, action: { do: 'walk', who: 'Kai', to: { near: 'Alex' } } });
    t += 20;
    steps.push({
      at: t,
      action: { do: 'knock_out', who: 'Alex', by: 'Kai' },
      caption: 'Kai takes a heart from Alex',
    });
    const outs: readonly [string, number][] = [
      ['Sam', Math.ceil(start / perKill)],
      ['Kai', Math.ceil((start + perKill) / perKill)],
    ];
    for (const [victim, times] of outs) {
      t += BETWEEN;
      steps.push({ at: t, action: { do: 'walk', who: 'Alex', to: { near: victim } } });
      for (let i = 0; i < times; i += 1) {
        t += BETWEEN;
        steps.push({
          at: t,
          action: { do: 'knock_out', who: victim, by: 'Alex' },
          ...(i === 0 ? { caption: `Alex takes a heart from ${victim}` } : {}),
        });
      }
    }
    return steps;
  },
};
