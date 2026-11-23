/**
 * The games Studios (ADR 0117 D1), discovered by `studios/studio-registry.ts`. B548 registers
 * six empty entries so later briefs fill the components without touching a shared file: B555
 * writes the World Setup, One Block, Team, Objective, Timer and Area Studios and their Very
 * easy section lists. The games kinds are not registered until B549, so no element reaches
 * these entries yet.
 *
 * @packageDocumentation
 */

import type { StudioEntry, StudioProps } from '../types';

/** A placeholder Studio: says it is not made yet (B555 replaces each one). */
function EmptyGamesStudio({ element }: StudioProps) {
  return (
    <p className="text-muted text-sm" data-testid="games-studio-empty">
      The Studio for {element.kind} is not made yet.
    </p>
  );
}

/** The games area's Studio entries, one per kind. */
export const studios: StudioEntry[] = [
  { id: 'msm.games.world-setup', kindId: 'msm:world_setup', component: EmptyGamesStudio },
  { id: 'msm.games.one-block', kindId: 'msm:one_block', component: EmptyGamesStudio },
  { id: 'msm.games.team', kindId: 'msm:team', component: EmptyGamesStudio },
  { id: 'msm.games.objective', kindId: 'msm:objective', component: EmptyGamesStudio },
  { id: 'msm.games.timer', kindId: 'msm:timer', component: EmptyGamesStudio },
  { id: 'msm.games.area', kindId: 'msm:area', component: EmptyGamesStudio },
];
