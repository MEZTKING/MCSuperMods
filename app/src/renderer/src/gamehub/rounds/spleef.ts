/**
 * Spleef's practice round (B728): Alex, Sam and Kai stand on the game's floor; Alex breaks the
 * block under Sam, who falls out; Kai breaks the block under Alex, who falls out too, and Kai,
 * the last one up, wins. The floor, its tool and the fall are the game's own.
 */

import { floorBox, mechanicOf, type RoundFacts, type WorldPos } from './facts';
import type { RoundScript, RoundScriptStep } from './script';

/** Where a player stands on a floor: a share of the way across and along it, on its top. */
function onFloor(
  box: { readonly from: WorldPos; readonly to: WorldPos },
  across: number,
  along: number,
): WorldPos {
  const [x0, x1] = [Math.min(box.from[0], box.to[0]), Math.max(box.from[0], box.to[0])];
  const [z0, z1] = [Math.min(box.from[2], box.to[2]), Math.max(box.from[2], box.to[2])];
  const top = Math.max(box.from[1], box.to[1]) + 1;
  return [Math.floor(x0 + (x1 - x0) * across) + 0.5, top, Math.floor(z0 + (z1 - z0) * along) + 0.5];
}

export const SPLEEF_ROUND: RoundScript = {
  type: 'spleef',
  starter: 'spleef',
  players: ['Alex', 'Sam', 'Kai'],
  steps(facts: RoundFacts): readonly RoundScriptStep[] {
    const floorMechanic = mechanicOf(facts, 'floor');
    const box = floorMechanic === undefined ? undefined : floorBox(facts, floorMechanic);
    const spot = (across: number, along: number) =>
      box === undefined ? {} : { at: { pos: onFloor(box, across, along) } };
    const steps: RoundScriptStep[] = [
      { at: 0, action: { do: 'join', who: 'Alex', ...spot(0.3, 0.3) } },
      { at: 0, action: { do: 'join', who: 'Sam', ...spot(0.7, 0.3) } },
      { at: 0, action: { do: 'join', who: 'Kai', ...spot(0.5, 0.7) } },
    ];
    if (facts.round.start === 'command') steps.push({ at: 0, action: { do: 'start' } });
    let t = facts.round.countdown * 20 + 20;
    steps.push({ at: t, action: { do: 'walk', who: 'Alex', to: { near: 'Sam', dx: -2 } } });
    t += 30;
    steps.push({
      at: t,
      action: { do: 'break_under', who: 'Alex', target: 'Sam' },
      caption: 'Alex breaks the floor under Sam',
    });
    t += 40;
    steps.push({ at: t, action: { do: 'walk', who: 'Kai', to: { near: 'Alex', dz: 2 } } });
    t += 40;
    steps.push({
      at: t,
      action: { do: 'break_under', who: 'Kai', target: 'Alex' },
      caption: 'Kai breaks the floor under Alex',
    });
    return steps;
  },
};
