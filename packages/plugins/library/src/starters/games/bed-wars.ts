/**
 * The game type Bed Wars-style (ADR 0132; plan `docs/PLAN-game-studio.md` section 2): "Protect
 * your team's bed, buy gear with resources from generators, break the others' beds." B721 stub: it
 * builds an empty bundle and is not listed; B733 fills it (the `msm:game` with its teams, areas,
 * timers, kits, arena and world setup) and lists it.
 */
import { emptyGameBundle, type GameTypeStarterSpec } from './spec';

/** The Bed Wars-style starter. */
export const bedWarsStarter: GameTypeStarterSpec = {
  listed: false,
  id: 'bed-wars',
  title: 'Bed Wars-style',
  description:
    "Protect your team's bed, buy gear with resources from generators, break the others' beds.",
  layers: ['datapack'],
  build: emptyGameBundle,
};
