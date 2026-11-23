/**
 * The games Studios (ADR 0117 D1; B555), discovered by `studios/studio-registry.ts`: the World
 * Setup, One Block, Team, Objective, Timer and Area Studios for the games kinds of
 * `@msm/plugin-games`, each loaded with `React.lazy` (a chunk of its own, so the main chunk does
 * not grow) and each with its Very easy section list (`studios/very-easy.ts`).
 *
 * @packageDocumentation
 */

import { type ComponentType, type LazyExoticComponent, lazy, Suspense } from 'react';
import type { StudioEntry, StudioProps } from '../types';
import {
  AREA_VERY_EASY_SECTIONS,
  OBJECTIVE_VERY_EASY_SECTIONS,
  ONE_BLOCK_VERY_EASY_SECTIONS,
  TEAM_VERY_EASY_SECTIONS,
  TIMER_VERY_EASY_SECTIONS,
  WORLD_SETUP_VERY_EASY_SECTIONS,
} from '../very-easy';

/** A lazy Studio behind its loading line (`<testId>-studio-loading`). */
function lazyStudio(
  Studio: LazyExoticComponent<ComponentType<StudioProps>>,
  name: string,
  testId: string,
): ComponentType<StudioProps> {
  function LazyStudio(props: StudioProps) {
    return (
      <Suspense
        fallback={
          <p className="text-muted text-sm" data-testid={`${testId}-studio-loading`}>
            Loading the {name}…
          </p>
        }
      >
        <Studio {...props} />
      </Suspense>
    );
  }
  LazyStudio.displayName = `Lazy${name.replaceAll(' ', '')}`;
  return LazyStudio;
}

/** The games area's Studio entries, one per kind. */
export const studios: StudioEntry[] = [
  {
    id: 'msm.games.world-setup',
    kindId: 'msm:world_setup',
    component: lazyStudio(
      lazy(() => import('./WorldSetupStudio')),
      'World Setup Studio',
      'world-setup',
    ),
    veryEasy: WORLD_SETUP_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.games.one-block',
    kindId: 'msm:one_block',
    component: lazyStudio(
      lazy(() => import('./OneBlockStudio')),
      'One Block Studio',
      'one-block',
    ),
    veryEasy: ONE_BLOCK_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.games.team',
    kindId: 'msm:team',
    component: lazyStudio(
      lazy(() => import('./TeamStudio')),
      'Team Studio',
      'team',
    ),
    veryEasy: TEAM_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.games.objective',
    kindId: 'msm:objective',
    component: lazyStudio(
      lazy(() => import('./ObjectiveStudio')),
      'Objective Studio',
      'objective',
    ),
    veryEasy: OBJECTIVE_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.games.timer',
    kindId: 'msm:timer',
    component: lazyStudio(
      lazy(() => import('./TimerStudio')),
      'Timer Studio',
      'timer',
    ),
    veryEasy: TIMER_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.games.area',
    kindId: 'msm:area',
    component: lazyStudio(
      lazy(() => import('./AreaStudio')),
      'Area Studio',
      'area',
    ),
    veryEasy: AREA_VERY_EASY_SECTIONS,
  },
];
