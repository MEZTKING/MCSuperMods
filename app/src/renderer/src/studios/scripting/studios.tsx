/**
 * The scripting Studios (B137b), discovered by `studios/studio-registry.ts`: the Script Studio
 * for `msm:script` (TypeScript in Monaco, ADR 0032 D5), and the Command Studio for
 * `msm:command` (ADR 0096 D1), and the Game rule and Statistic Studios for `msm:game_rule` and
 * `msm:stat` (ADR 0111 D5, D6; B538).
 *
 * @packageDocumentation
 */

import { COMMAND_KIND } from '@msm/plugin-scripting';
import { lazy, Suspense } from 'react';
import type { StudioEntry, StudioProps } from '../types';
import { GAME_RULE_VERY_EASY_SECTIONS, STAT_VERY_EASY_SECTIONS } from '../very-easy';
import { ScriptStudio } from './ScriptStudio';
import { SCRIPT_KIND, scriptLinesOf } from './script-model';

/** The Command Studio (ADR 0096 D1, ADR 0101 D1), a chunk of its own. */
const CommandStudio = lazy(() => import('./CommandStudio'));

/** The Command Studio behind its loading fallback. */
function LazyCommandStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-xs" data-testid="command-studio-loading">
          Loading the Command Studio…
        </p>
      }
    >
      <CommandStudio {...props} />
    </Suspense>
  );
}

/** The Game rule Studio (ADR 0111 D5, ADR 0112 D1), a chunk of its own. */
const GameRuleStudio = lazy(() => import('./GameRuleStudio'));

/** The Statistic Studio (ADR 0111 D6, ADR 0112 D1), a chunk of its own. */
const StatStudio = lazy(() => import('./StatStudio'));

/** The Game rule Studio behind its loading fallback. */
function LazyGameRuleStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-xs" data-testid="game-rule-studio-loading">
          Loading the Game rule Studio…
        </p>
      }
    >
      <GameRuleStudio {...props} />
    </Suspense>
  );
}

/** The Statistic Studio behind its loading fallback. */
function LazyStatStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-xs" data-testid="stat-studio-loading">
          Loading the Statistic Studio…
        </p>
      }
    >
      <StatStudio {...props} />
    </Suspense>
  );
}

/** The Script Studio's entry id. */
export const SCRIPT_STUDIO_ID = 'msm.scripting.script';

export const studios: StudioEntry[] = [
  {
    id: SCRIPT_STUDIO_ID,
    kindId: SCRIPT_KIND,
    // Malformed data (no list of lines) stays on the schema form.
    matches: (element) => scriptLinesOf(element.data) !== undefined,
    component: ScriptStudio,
    handlesFocus: true,
  },
  // The Command Studio (ADR 0096 D1, ADR 0101 D1).
  { id: 'msm.scripting.command', kindId: COMMAND_KIND, component: LazyCommandStudio },
  // The Game rule and Statistic Studios (ADR 0111 D5, D6, ADR 0112 D1; B538).
  {
    id: 'msm.scripting.game-rule',
    kindId: 'msm:game_rule',
    component: LazyGameRuleStudio,
    veryEasy: GAME_RULE_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.scripting.stat',
    kindId: 'msm:stat',
    component: LazyStatStudio,
    veryEasy: STAT_VERY_EASY_SECTIONS,
  },
];
