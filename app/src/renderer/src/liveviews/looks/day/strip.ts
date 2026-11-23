/**
 * A timeline track sampled across its day (ADR 0121 D6; B620 interface, B626 builds it). The
 * period is the timeline's `period_ticks`; a world clock has no fields (B619, 3S10).
 */

import type { Json } from '@msm/plugin-api';

/** One keyframe of a track. */
export interface Keyframe {
  ticks: number;
  value: Json;
}

/** One track: an environment attribute's keyframes, with an easing and a modifier. */
export interface Track {
  ease?: Json;
  modifier?: string;
  keyframes: readonly Keyframe[];
}

/** The value of a track at a tick of the period. Until B626 it answers the first keyframe. */
export function sampleTrack(
  track: Track,
  _ticks: number,
  _period: number | undefined,
): Json | null {
  return track.keyframes[0]?.value ?? null;
}
