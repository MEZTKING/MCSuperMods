/**
 * Profession Studio (ADR 0098 D2, ADR 0101 D1) for `msm:villager_profession` element data. An empty component until
 * B480 fills it in; the kind itself arrives with B473, so nothing opens it before then.
 *
 * @packageDocumentation
 */

import type { StudioProps } from '../types';

/** The element kind the Profession Studio edits. */
export const PROFESSION_KIND = 'msm:villager_profession';

/** The Profession Studio (empty until B480). */
export function ProfessionStudio(_props: StudioProps) {
  return null;
}
