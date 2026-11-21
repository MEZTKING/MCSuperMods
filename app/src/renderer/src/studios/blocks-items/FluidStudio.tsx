/**
 * Fluid Studio (ADR 0099 D1, ADR 0101 D1) for `msm:fluid` element data. An empty component until B480 fills it in; the
 * kind itself arrives with B473, so nothing opens it before then.
 *
 * @packageDocumentation
 */

import type { StudioProps } from '../types';

/** The element kind the Fluid Studio edits. */
export const FLUID_KIND = 'msm:fluid';

/** The Fluid Studio (empty until B480). */
export function FluidStudio(_props: StudioProps) {
  return null;
}
