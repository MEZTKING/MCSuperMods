/**
 * The game type Lifesteal (ADR 0132; plan `docs/PLAN-game-studio.md` section 2): "Kill a player to
 * take a heart; lose them all and you are out (or banned for a while)." B721 stub: it builds an
 * empty bundle and is not listed; B733 fills it (the `msm:game` with its teams, areas, timers,
 * kits, arena and world setup) and lists it.
 */
import { emptyGameBundle, type GameTypeStarterSpec } from './spec';

/** The Lifesteal starter. */
export const lifestealStarter: GameTypeStarterSpec = {
  listed: false,
  id: 'lifesteal',
  title: 'Lifesteal',
  description:
    'Kill a player to take a heart; lose them all and you are out (or banned for a while).',
  layers: ['datapack'],
  build: emptyGameBundle,
};
