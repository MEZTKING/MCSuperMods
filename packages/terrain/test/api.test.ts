import { describe, expect, it } from 'vitest';
import {
  conditionTypes,
  createTerrainWorld,
  densityFunctionTypes,
  flatGenerator,
  placeFeatures,
  resolvePreset,
  ruleTypes,
  seedFromText,
} from '../src';

describe('terrain stubs', () => {
  it('throws not yet from the engine entry points', () => {
    expect(() => seedFromText('x')).toThrow('not yet');
    expect(() => createTerrainWorld({} as never)).toThrow('not yet');
  });

  it('has empty seams', () => {
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
