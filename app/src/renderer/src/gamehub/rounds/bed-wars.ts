/**
 * The Bed Wars-style practice round (B728): Alex plays for the first base's team and Sam for
 * the second. Alex knocks Sam out while Sam's bed stands, so Sam waits and comes back; then Sam
 * breaks Alex's bed and knocks Alex out, and with no bed Alex is out and Sam's team, the last
 * standing, wins. The bases, the wait and the teams are the game's own.
 */

import { basesOf, mechanicOf, type RoundFacts, type WorldPos } from './facts';
import { numberIn, type RoundScript, type RoundScriptStep } from './script';

export const BED_WARS_ROUND: RoundScript = {
  type: 'bed_wars',
  starter: 'bed-wars',
  players: ['Alex', 'Sam'],
  focus(facts: RoundFacts): readonly WorldPos[] {
    return basesOf(facts)
      .slice(0, 2)
      .flatMap((base) => [base.bed, base.spawn]);
  },
  steps(facts: RoundFacts): readonly RoundScriptStep[] {
    const [first, second] = basesOf(facts);
    const wait = numberIn(mechanicOf(facts, 'team_base'), 'respawn_seconds', 5);
    const steps: RoundScriptStep[] = [
      {
        at: 0,
        action: { do: 'join', who: 'Alex', ...(first ? { at: { pos: first.spawn } } : {}) },
      },
      {
        at: 0,
        action: { do: 'join', who: 'Sam', ...(second ? { at: { pos: second.spawn } } : {}) },
      },
    ];
    if (facts.round.start === 'command') steps.push({ at: 0, action: { do: 'start' } });
    // The game splits the teams itself; the script puts each on a base's team so the round
    // reads the same every time.
    steps.push({ at: 0, action: { do: 'join', who: 'Alex', team: { base: 0 } } });
    steps.push({ at: 0, action: { do: 'join', who: 'Sam', team: { base: 1 } } });
    let t = facts.round.countdown * 20 + 20;
    steps.push({ at: t, action: { do: 'walk', who: 'Alex', to: { near: 'Sam' } } });
    t += 40;
    steps.push({
      at: t,
      action: { do: 'knock_out', who: 'Sam', by: 'Alex' },
      caption: 'Alex knocks Sam out; Sam’s bed still stands',
    });
    t += wait * 20 + 40;
    steps.push({ at: t, action: { do: 'walk', who: 'Sam', to: { bedOf: 'Alex' } } });
    t += 60;
    steps.push({
      at: t,
      action: { do: 'break', who: 'Sam', at: { bedOf: 'Alex' } },
      caption: 'Sam breaks Alex’s bed',
    });
    t += 40;
    steps.push({ at: t, action: { do: 'walk', who: 'Sam', to: { near: 'Alex' } } });
    t += 40;
    steps.push({
      at: t,
      action: { do: 'knock_out', who: 'Alex', by: 'Sam' },
      caption: 'With no bed, Alex is out',
    });
    return steps;
  },
};
