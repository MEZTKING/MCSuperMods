/**
 * `blocks-items.*` project validators of boats and of fluid cauldrons and bottles (ADR 0110 D1,
 * ADR 0108 D2, D3). A stub from B526: no validators yet; B531 fills it in and lists the codes.
 */
import type { ProjectValidator } from '@msm/plugin-api';

/** Every code these validators report. */
export const BOAT_PROBLEM_CODES: readonly string[] = Object.freeze([]);

export const boatValidators: readonly ProjectValidator[] = Object.freeze([]);
