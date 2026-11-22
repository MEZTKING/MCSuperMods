/**
 * Density function types deepslate 0.27.2 parses but computes differently from the game, taken
 * over by the parser front (ADR 0119 D3). Each keeps deepslate's own class (a subclass where the
 * value changes), so the fill's per-column cache and bounds still know it.
 *
 * - `floor`, `round`, `ceil`, `truncate`: `multiple` is optional and defaults to the constant 1
 *   (the data format says so); deepslate reads a missing one as 0 and then leaves the value
 *   unrounded.
 * - `slice`: the input at the position with one axis set to `coordinate`; deepslate always reads
 *   x 0 and ignores the axis and the coordinate.
 *
 * Learned from the data format's fields and checked on the worldgen parity fixture's
 * `functions_rounding` and `functions_space` dimensions (B581).
 */

import { DensityFunction } from 'deepslate/worldgen';
import type { DensityFunctionType, DensityParser } from '../parser';

type Json = Readonly<Record<string, unknown>>;

function rounding(type: 'floor' | 'round' | 'ceil' | 'truncate'): DensityFunctionType {
  return {
    type,
    parse(json: Json, child: DensityParser): DensityFunction {
      const multiple =
        json.multiple === undefined ? DensityFunction.Constant.ONE : child(json.multiple);
      return new DensityFunction.Round(type, child(json.input ?? json.argument), multiple);
    },
  };
}

type Axis = 'x' | 'y' | 'z';

/** `slice`: the input with one coordinate fixed. */
export class SliceAt extends DensityFunction.Slice {
  constructor(axis: Axis, coordinate: number, input: DensityFunction) {
    super(axis, coordinate, input);
  }

  override compute(context: DensityFunction.Context): number {
    const { x, y, z } = context;
    switch (this.axis) {
      case 'x':
        return this.input.compute({ x: this.coordinate, y, z });
      case 'y':
        return this.input.compute({ x, y: this.coordinate, z });
      default:
        return this.input.compute({ x, y, z: this.coordinate });
    }
  }

  override mapChildren(visitor: DensityFunction.Visitor): DensityFunction {
    return new SliceAt(this.axis as Axis, this.coordinate, visitor.apply(this.input));
  }
}

const slice: DensityFunctionType = {
  type: 'slice',
  parse(json: Json, child: DensityParser): DensityFunction {
    const axis: Axis = json.axis === 'x' || json.axis === 'z' ? json.axis : 'y';
    const coordinate = typeof json.coordinate === 'number' ? Math.floor(json.coordinate) : 0;
    return new SliceAt(axis, coordinate, child(json.input));
  },
};

export const correctedTypes: readonly DensityFunctionType[] = [
  rounding('floor'),
  rounding('round'),
  rounding('ceil'),
  rounding('truncate'),
  slice,
];
