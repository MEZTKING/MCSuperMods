/**
 * The checks of the `head_start` mechanic of `msm:game` (ADR 0132 D2). B721 stub, filled by B725.
 */
import type { Problem } from '@msm/plugin-api';
import type { MechanicCheck } from './index';

/** Checks one `head_start` mechanic; no problems until B725. */
export const checkHeadStart: MechanicCheck = (): Problem[] => [];
