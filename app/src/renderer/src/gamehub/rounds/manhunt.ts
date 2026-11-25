/**
 * Manhunt's practice round (B728): the game deals the runner and the hunters; the runner runs
 * off while the hunters are held by the head start, then the first hunter follows the runner
 * (their compass points the way) and catches them, and the hunters win. The roles, the head
 * start and the countdown are the game's own.
 */

import { mechanicOf, type RoundFacts } from './facts';
import { numberIn, type RoundScript, type RoundScriptStep } from './script';

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value !== '' ? value : fallback;

export const MANHUNT_ROUND: RoundScript = {
  type: 'manhunt',
  starter: 'manhunt',
  players: ['Alex', 'Sam', 'Kai'],
  steps(facts: RoundFacts): readonly RoundScriptStep[] {
    const tracker = mechanicOf(facts, 'tracker');
    const headStart = mechanicOf(facts, 'head_start');
    const runner = text(tracker?.target, facts.roles[0] ?? 'runner');
    const hunter = text(tracker?.holder, facts.roles[1] ?? 'hunter');
    const held = numberIn(headStart, 'seconds', 0);
    const steps: RoundScriptStep[] = [
      { at: 0, action: { do: 'join', who: 'Alex' } },
      { at: 0, action: { do: 'join', who: 'Sam', at: { near: 'Alex', dx: 2 } } },
      { at: 0, action: { do: 'join', who: 'Kai', at: { near: 'Alex', dz: 2 } } },
    ];
    if (facts.round.start === 'command') steps.push({ at: 0, action: { do: 'start' } });
    const playing = facts.round.countdown * 20 + 10;
    steps.push({
      at: playing,
      action: { do: 'walk', who: { role: runner }, to: { near: { role: runner }, dx: 14, dz: 10 } },
      caption: 'The runner gets away while the hunters wait',
    });
    const free = playing + held * 20 + 20;
    steps.push({
      at: free,
      action: { do: 'walk', who: { role: hunter }, to: { near: { role: runner } } },
      caption: 'A hunter follows the compass',
    });
    steps.push({
      at: free + 100,
      action: { do: 'knock_out', who: { role: runner }, by: { role: hunter } },
      caption: 'The hunter catches the runner',
    });
    return steps;
  },
};
