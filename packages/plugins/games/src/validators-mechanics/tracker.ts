/**
 * The checks of the `tracker` mechanic of `msm:game` (ADR 0132 D2). B721 stub, filled by B725.
 */
import type { Problem } from '@msm/plugin-api';
import type { MechanicCheck } from './index';

/** Checks one `tracker` mechanic; no problems until B725. */
export const checkTracker: MechanicCheck = (): Problem[] => [];
