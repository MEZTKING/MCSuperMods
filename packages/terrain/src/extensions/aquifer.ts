/**
 * A correction to deepslate 0.27.2's aquifers (ADR 0119 D3: corrected in our own code path, never
 * by patching `node_modules`). `NoiseAquifer.computeFluid` looks at the preliminary surface of
 * the chunks around an aquifer cell, by a list of (x, z) chunk offsets; deepslate builds the
 * sample's x from the z offset (`x + (zOffset << 4)`), so it reads a diagonal of chunks instead of
 * the list. This is deepslate's method (deepslate 0.27.2, MIT, Copyright (c) Misode) with the
 * sample's x built from the x offset. Checked by observation on the worldgen parity fixture's
 * `aquifers` dimension (B581; with the aquifer noises bound, `fill.ts` `BIND_AQUIFER_NOISES`).
 *
 * `install()` replaces `computeFluid` on deepslate's `NoiseAquifer` once (the extensions' index
 * calls it).
 */

import { BlockState, FluidStatus, NoiseAquifer } from 'deepslate/worldgen';

type FluidPickerResult = { at(y: number): BlockState };

interface AquiferInternals {
  globalFluidPicker(x: number, y: number, z: number): FluidPickerResult;
  surfaceLevel(x: number, z: number): number;
  adjustSurfaceLevel(level: number): number;
  computeSurfaceLevel(
    x: number,
    y: number,
    z: number,
    globalFluid: FluidPickerResult,
    lowestSurfaceLevel: number,
    surfaceAtCenterIsUnderGlobalFluidLevel: boolean,
  ): number;
  computeFluidType(
    x: number,
    y: number,
    z: number,
    globalFluid: FluidPickerResult,
    fluidSurfaceLevel: number,
  ): BlockState;
}

/** The chunk offsets around an aquifer cell whose surface is read (deepslate's list). */
const SURFACE_SAMPLING = (NoiseAquifer as unknown as { SURFACE_SAMPLING: [number, number][] })
  .SURFACE_SAMPLING;

function computeFluid(this: AquiferInternals, x: number, y: number, z: number): unknown {
  const globalFluid = this.globalFluidPicker(x, y, z);
  let lowestPreliminarySurface = Number.MAX_SAFE_INTEGER;
  let surfaceAtCenterIsUnderGlobalFluidLevel = false;
  for (const [xOffset, zOffset] of SURFACE_SAMPLING) {
    const sampleX = x + (xOffset << 4);
    const sampleZ = z + (zOffset << 4);
    const surfaceLevel = this.surfaceLevel(sampleX, sampleZ);
    const adjustedSurfaceLevel = this.adjustSurfaceLevel(surfaceLevel);
    const start = xOffset === 0 && zOffset === 0;
    if (start && y - 12 > adjustedSurfaceLevel) return globalFluid;
    if (start || y + 12 > adjustedSurfaceLevel) {
      const globalFluidAtSurface = this.globalFluidPicker(sampleX, adjustedSurfaceLevel, sampleZ);
      if (!globalFluidAtSurface.at(adjustedSurfaceLevel).is(BlockState.AIR)) {
        if (start) surfaceAtCenterIsUnderGlobalFluidLevel = true;
        else return globalFluidAtSurface;
      }
    }
    lowestPreliminarySurface = Math.min(lowestPreliminarySurface, surfaceLevel);
  }
  const fluidSurfaceLevel = this.computeSurfaceLevel(
    x,
    y,
    z,
    globalFluid,
    lowestPreliminarySurface,
    surfaceAtCenterIsUnderGlobalFluidLevel,
  );
  return new FluidStatus(
    fluidSurfaceLevel,
    this.computeFluidType(x, y, z, globalFluid, fluidSurfaceLevel),
  );
}

let installed = false;

/** Replaces `NoiseAquifer.prototype.computeFluid` (once). */
export function install(): void {
  if (installed) return;
  installed = true;
  Object.defineProperty(NoiseAquifer.prototype, 'computeFluid', {
    configurable: true,
    writable: true,
    value: computeFluid,
  });
}
