/** The engine's features seam (ADR 0119 D3; B583 fills it): trees, plants and ores. */

import type { Unsupported } from '../api';

/** A column window's blocks as the `features` stage sees them. */
export interface FeatureInput {
  readonly size: { x: number; y: number; z: number };
  readonly palette: readonly string[];
  readonly blocks: Uint16Array;
  readonly notes: readonly Unsupported[];
}

/** Places features into a window; until B583 it returns its input with one note. */
export function placeFeatures(input: FeatureInput): FeatureInput {
  return {
    ...input,
    notes: [
      ...input.notes,
      {
        kind: 'feature',
        type: 'all',
        where: 'features',
        drawnInstead: 'Trees, plants and ores are not drawn yet.',
      },
    ],
  };
}
