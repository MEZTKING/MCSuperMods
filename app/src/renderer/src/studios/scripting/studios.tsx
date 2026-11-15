/**
 * The scripting Studios (B137b), discovered by `studios/studio-registry.ts`: the Script Studio
 * for `msm:script` (TypeScript in Monaco, ADR 0032 D5), and the Command Studio for
 * `msm:command` (ADR 0096 D1).
 *
 * @packageDocumentation
 */

import type { StudioEntry } from '../types';
import { COMMAND_KIND, CommandStudio } from './CommandStudio';
import { ScriptStudio } from './ScriptStudio';
import { SCRIPT_KIND, scriptLinesOf } from './script-model';

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
  // The Command Studio (ADR 0096 D1): an empty component until B460; the kind arrives with B456.
  { id: 'msm.scripting.command', kindId: COMMAND_KIND, component: CommandStudio },
];
