/**
 * Command Studio (ADR 0096 D1, ADR 0101 D1) for `msm:command` element data. An empty component until B460 fills it in; the
 * kind itself arrives with B456, so nothing opens it before then.
 *
 * @packageDocumentation
 */

import type { StudioProps } from '../types';

/** The element kind the Command Studio edits. */
export const COMMAND_KIND = 'msm:command';

/** The Command Studio (empty until B460). */
export function CommandStudio(_props: StudioProps) {
  return null;
}
