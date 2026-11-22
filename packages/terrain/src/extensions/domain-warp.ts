/**
 * The density function `domain_warp` (ADR 0119 D3; plan brief B581; a type of the newer target's
 * registry): its input sampled at the block moved by the offsets, `offset_x`, `offset_y` and
 * `offset_z` (each a density function, 0 when left out), which are computed at the block itself
 * and moved by whole blocks: each offset's fraction is dropped, towards 0.
 *
 * Learned by observation on the worldgen parity fixture's `warp_constant` and `warp_function`
 * dimensions (B581), never from a method body: with the fraction kept, the function offsets'
 * heights match in 83 % of columns (the spike B574 saw 82 %); dropped towards 0, in 100 %
 * (rounded 78 %, floored 69 %).
 */

import { DensityFunction, type Interval } from 'deepslate/worldgen';
import type { DensityFunctionType, DensityParser } from '../parser';

/** `domain_warp`. */
export class DomainWarp extends DensityFunction {
  private readonly at = { x: 0, y: 0, z: 0 };
  readonly input: DensityFunction;
  readonly offsetX: DensityFunction;
  readonly offsetY: DensityFunction;
  readonly offsetZ: DensityFunction;

  constructor(
    input: DensityFunction,
    offsetX: DensityFunction,
    offsetY: DensityFunction,
    offsetZ: DensityFunction,
  ) {
    super();
    this.input = input;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.offsetZ = offsetZ;
  }

  compute(context: DensityFunction.Context): number {
    const dx = this.offsetX.compute(context);
    const dy = this.offsetY.compute(context);
    const dz = this.offsetZ.compute(context);
    const at = this.at;
    at.x = context.x + Math.trunc(dx);
    at.y = context.y + Math.trunc(dy);
    at.z = context.z + Math.trunc(dz);
    return this.input.compute(at);
  }

  mapChildren(visitor: DensityFunction.Visitor): DensityFunction {
    return new DomainWarp(
      visitor.apply(this.input),
      visitor.apply(this.offsetX),
      visitor.apply(this.offsetY),
      visitor.apply(this.offsetZ),
    );
  }

  range(): Interval {
    return this.input.range();
  }
}

export const domainWarp: DensityFunctionType = {
  type: 'domain_warp',
  parse(json, child: DensityParser): DensityFunction {
    const offset = (value: unknown) =>
      value === undefined ? DensityFunction.Constant.ZERO : child(value);
    return new DomainWarp(
      child(json.input ?? json.argument),
      offset(json.offset_x),
      offset(json.offset_y),
      offset(json.offset_z),
    );
  },
};
