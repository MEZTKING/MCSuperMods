import { describe, expect, it } from 'vitest';
import {
  conditionTypes,
  createTerrainWorld,
  densityFunctionTypes,
  flatGenerator,
  placeFeatures,
  resolvePreset,
  ruleTypes,
  sampleBiomes,
} from '../src';

describe('terrain entry points and seams', () => {
  it('refuses a world it did not make', () => {
    const fake = {
      generator: 'noise',
      minY: 0,
      height: 1,
      seaLevel: 0,
      biomesKnown: true,
      unsupported: () => [],
    } as const;
    expect(() => sampleBiomes(fake, { x0: 0, z0: 0, width: 4, depth: 4, step: 4 })).toThrow();
    expect(
      createTerrainWorld({
        files: { vanilla: null, project: {} },
        source: { dimension: 'msm:x' },
        seed: 0n,
        facts: { dataFolders: [], approximate: [] },
      }).unsupported(),
    ).toHaveLength(1);
  });

  it('has empty seams until B581 and B583', () => {
    expect(densityFunctionTypes).toEqual([]);
    expect(ruleTypes).toEqual([]);
    expect(conditionTypes).toEqual([]);
    expect(flatGenerator).toBeNull();
    expect(resolvePreset({ vanilla: null, project: {} }, 'x')).toBeNull();
    const out = placeFeatures({
      size: { x: 1, y: 1, z: 1 },
      palette: [],
      blocks: new Uint16Array(1),
      notes: [],
    });
    expect(out.notes).toHaveLength(1);
  });
});
