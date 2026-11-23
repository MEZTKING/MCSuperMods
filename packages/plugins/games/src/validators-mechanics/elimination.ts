/**
 * The checks of the `elimination` mechanic of `msm:game` (ADR 0132 D2). B721 stub, filled by B726.
 */
import type { Problem } from '@msm/plugin-api';
import type { MechanicCheck } from './index';

/** Checks one `elimination` mechanic; no problems until B726. */
export const checkElimination: MechanicCheck = (): Problem[] => [];
