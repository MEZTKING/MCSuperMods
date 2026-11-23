/**
 * The game type Manhunt (ADR 0132; plan `docs/PLAN-game-studio.md` section 2): "One runner beats
 * the game while hunters track them with a compass." B721 stub: it builds an empty bundle and is
 * not listed; B733 fills it (the `msm:game` with its teams, areas, timers, kits, arena and world
 * setup) and lists it.
 */
import { emptyGameBundle, type GameTypeStarterSpec } from './spec';

/** The Manhunt starter. */
export const manhuntStarter: GameTypeStarterSpec = {
  listed: false,
  id: 'manhunt',
  title: 'Manhunt',
  description: 'One runner beats the game while hunters track them with a compass.',
  layers: ['datapack'],
  build: emptyGameBundle,
};
