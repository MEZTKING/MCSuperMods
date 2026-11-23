/**
 * The games Studios (ADR 0117 D1), discovered by `studios/studio-registry.ts`. The games kinds
 * are registered since B549, so the list stays empty until B555 adds the World Setup, One
 * Block, Team, Objective, Timer and Area Studios (ids `msm.games.world-setup`, `one-block`,
 * `team`, `objective`, `timer`, `area`) and their Very easy section lists: until then the
 * schema-driven form edits the games kinds.
 *
 * @packageDocumentation
 */

import type { StudioEntry } from '../types';

/** The games area's Studio entries, one per kind (none until B555). */
export const studios: StudioEntry[] = [];
