/**
 * Creative Tab Studio (ADR 0096 D2, ADR 0101 D1) for `msm:creative_tab` element data. An empty component until B460 fills it
 * in; the kind itself arrives with B456, so nothing opens it before then.
 *
 * @packageDocumentation
 */

import type { StudioProps } from '../types';

/** The element kind the Creative Tab Studio edits. */
export const CREATIVE_TAB_KIND = 'msm:creative_tab';

/** The Creative Tab Studio (empty until B460). */
export function CreativeTabStudio(_props: StudioProps) {
  return null;
}
