/**
 * `blocks-items.*` project validators of own block sounds, set types and vanilla pairs (ADR 0105). A stub from B505: no
 * checks yet; B515 fills it in.
 */
import type { ProjectValidator } from '@msm/plugin-api';

/** Every code these validators report. */
export const SOUND_PROBLEM_CODES: readonly string[] = Object.freeze([]);

export const soundValidators: readonly ProjectValidator[] = Object.freeze([]);
