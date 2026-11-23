/**
 * The games Studios (ADR 0117 D1; B555), discovered by `studios/studio-registry.ts`: the World
 * Setup, One Block, Team, Objective, Timer and Area Studios for the games kinds of
 * `@msm/plugin-games`, each loaded with `React.lazy` (a chunk of its own, so the main chunk does
 * not grow) and each with its list of common sections (`studios/plain.ts`). The Game and Kit
 * Studios of the Game and map Studio (ADR 0132; B721 stubs, B732 fills them) are listed once the
 * plugin lists their kinds (`GAME_KIND_LISTED`, `KIT_KIND_LISTED`, B722); their common sections
 * are in `game-sections/common.ts`.
 *
 * @packageDocumentation
 */

import { GAME_KIND_LISTED, KIT_KIND_LISTED } from '@msm/plugin-games';
import { type ComponentType, type LazyExoticComponent, lazy, Suspense } from 'react';
import {
  AREA_COMMON_SECTIONS,
  OBJECTIVE_COMMON_SECTIONS,
  ONE_BLOCK_COMMON_SECTIONS,
  TEAM_COMMON_SECTIONS,
  TIMER_COMMON_SECTIONS,
  WORLD_SETUP_COMMON_SECTIONS,
} from '../plain';
import type { StudioEntry, StudioProps } from '../types';
import { GAME_COMMON_SECTIONS, KIT_COMMON_SECTIONS } from './game-sections/common';

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

/** The Game Studio for `msm:game` (ADR 0132 D1). */
const gameStudio: StudioEntry = {
  id: 'msm.games.game',
  kindId: 'msm:game',
  component: lazyStudio(
    lazy(() => import('./GameStudio')),
    'Game Studio',
    'game',
  ),
  common: GAME_COMMON_SECTIONS,
};

/** The Kit Studio for `msm:kit` (ADR 0132 D3). */
const kitStudio: StudioEntry = {
  id: 'msm.games.kit',
  kindId: 'msm:kit',
  component: lazyStudio(
    lazy(() => import('./KitStudio')),
    'Kit Studio',
    'kit',
  ),
  common: KIT_COMMON_SECTIONS,
};

/** The games area's Studio entries, one per listed kind. */
export const studios: StudioEntry[] = [
  {
    id: 'msm.games.world-setup',
    kindId: 'msm:world_setup',
    component: lazyStudio(
      lazy(() => import('./WorldSetupStudio')),
      'World Setup Studio',
      'world-setup',
    ),
    common: WORLD_SETUP_COMMON_SECTIONS,
  },
  {
    id: 'msm.games.one-block',
    kindId: 'msm:one_block',
    component: lazyStudio(
      lazy(() => import('./OneBlockStudio')),
      'One Block Studio',
      'one-block',
    ),
    common: ONE_BLOCK_COMMON_SECTIONS,
  },
  {
    id: 'msm.games.team',
    kindId: 'msm:team',
    component: lazyStudio(
      lazy(() => import('./TeamStudio')),
      'Team Studio',
      'team',
    ),
    common: TEAM_COMMON_SECTIONS,
  },
  {
    id: 'msm.games.objective',
    kindId: 'msm:objective',
    component: lazyStudio(
      lazy(() => import('./ObjectiveStudio')),
      'Objective Studio',
      'objective',
    ),
    common: OBJECTIVE_COMMON_SECTIONS,
  },
  {
    id: 'msm.games.timer',
    kindId: 'msm:timer',
    component: lazyStudio(
      lazy(() => import('./TimerStudio')),
      'Timer Studio',
      'timer',
    ),
    common: TIMER_COMMON_SECTIONS,
  },
  {
    id: 'msm.games.area',
    kindId: 'msm:area',
    component: lazyStudio(
      lazy(() => import('./AreaStudio')),
      'Area Studio',
      'area',
    ),
    common: AREA_COMMON_SECTIONS,
  },
  ...(GAME_KIND_LISTED ? [gameStudio] : []),
  ...(KIT_KIND_LISTED ? [kitStudio] : []),
];
