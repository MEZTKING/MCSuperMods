/**
 * The checks of the `fall_out` mechanic of `msm:game` (ADR 0132 D2). B721 stub, filled by B726.
 */
import type { Problem } from '@msm/plugin-api';
import type { MechanicCheck } from './index';

/** Checks one `fall_out` mechanic; no problems until B726. */
export const checkFallOut: MechanicCheck = (): Problem[] => [];
