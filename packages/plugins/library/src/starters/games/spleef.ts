/**
 * The game type Spleef (ADR 0132; plan `docs/PLAN-game-studio.md` section 2): "Break the floor
 * under the others with your shovel; last one up wins." B721 stub: it builds an empty bundle and
 * is not listed; B733 fills it (the `msm:game` with its teams, areas, timers, kits, arena and
 * world setup) and lists it.
 */
import { emptyGameBundle, type GameTypeStarterSpec } from './spec';

/** The Spleef starter. */
export const spleefStarter: GameTypeStarterSpec = {
  listed: false,
  id: 'spleef',
  title: 'Spleef',
  description: 'Break the floor under the others with your shovel; last one up wins.',
  layers: ['datapack'],
  build: emptyGameBundle,
};
