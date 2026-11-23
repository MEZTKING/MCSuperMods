/**
 * The checks of the `border` mechanic of `msm:game` (ADR 0132 D2). B721 stub, filled by B726.
 */
import type { Problem } from '@msm/plugin-api';
import type { MechanicCheck } from './index';

/** Checks one `border` mechanic; no problems until B726. */
export const checkBorder: MechanicCheck = (): Problem[] => [];
