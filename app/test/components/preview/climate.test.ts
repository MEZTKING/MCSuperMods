import type { Project, Target } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  biomeColour,
  type ClimatePoint,
  climateGrid,
  climateIndex,
  climateSources,
  hashColour,
  projectBiomes,
  projectSkyColourAttribute,
  skyColourAttribute,
} from '../../../src/renderer/src/preview/climate';

const firstTarget = (builtInTargets[0] as { target: Target }).target;

const point = (temperature: number, humidity: number, offset = 0) => ({
  temperature,
  humidity,
  continentalness: 0,
  erosion: 0,
  depth: 0,
  weirdness: 0,
  offset,
});

const ORIGIN: ClimatePoint = {
  temperature: 0,
  humidity: 0,
  continentalness: 0,
  erosion: 0,
  depth: 0,
  weirdness: 0,
};

const multiNoise = (biomes: unknown) => ({
  type: 'minecraft:overworld',
  generator: {
    type: 'minecraft:noise',
    settings: 'minecraft:overworld',
    biome_source: { type: 'minecraft:multi_noise', biomes },
  },
});

describe('climateSources', () => {
  it('reads the explicit biome list of a dimension', () => {
    const { sources, reason } = climateSources(
      multiNoise([{ biome: 'demo:glade', parameters: point(0.2, 0.2) }, { biome: 'oops' }]),
    );
    expect(reason).toBeNull();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.dimension).toBeNull();
    expect(sources[0]?.entries.map((entry) => entry.biome)).toEqual(['demo:glade']);
  });

  it('explains why a fixed or preset source has no map', () => {
    expect(
      climateSources({
        generator: { biome_source: { type: 'minecraft:fixed', biome: 'minecraft:plains' } },
      }).reason,
    ).toMatch(/minecraft:fixed/);
    expect(
      climateSources({
        generator: { biome_source: { type: 'multi_noise', preset: 'minecraft:overworld' } },
      }).reason,
    ).toMatch(/preset minecraft:overworld/);
  });

  it('lists every multi-noise dimension of a world preset, the overworld first', () => {
    const { sources } = climateSources({
      dimensions: {
        'minecraft:the_nether': multiNoise([{ biome: 'a', parameters: point(0, 0) }]),
        'minecraft:overworld': multiNoise([{ biome: 'b', parameters: point(0, 0) }]),
        'minecraft:the_end': { generator: { biome_source: { type: 'minecraft:the_end' } } },
      },
    });
    expect(sources.map((source) => source.dimension)).toEqual([
      'minecraft:overworld',
      'minecraft:the_nether',
    ]);
  });
});

describe('climate cell assignment', () => {
  const entries = [
    { biome: 'demo:cold', parameters: point(-0.5, 0) },
    { biome: 'demo:hot', parameters: point(0.5, 0) },
  ];

  it('finds the nearest entry for a point inside each', () => {
    const index = climateIndex(entries);
    expect(index.find({ ...ORIGIN, temperature: -0.6 })).toBe('demo:cold');
    expect(index.find({ ...ORIGIN, temperature: 0.4 })).toBe('demo:hot');
  });

  it('accepts parameter ranges', () => {
    const index = climateIndex([
      { biome: 'demo:band', parameters: { ...point(0, 0), temperature: [-0.1, 0.1] } },
      { biome: 'demo:far', parameters: point(0.9, 0) },
    ]);
    expect(index.find({ ...ORIGIN, temperature: 0.1 })).toBe('demo:band');
  });

  it('breaks a tie in favour of the lower offset, as deepslate does', () => {
    const tied = [
      { biome: 'demo:offset', parameters: point(0, 0, 0.5) },
      { biome: 'demo:plain', parameters: point(0, 0, 0) },
    ];
    expect(climateIndex(tied).find(ORIGIN)).toBe('demo:plain');
    expect(climateIndex([...tied].reverse()).find(ORIGIN)).toBe('demo:plain');
  });

  it('fills the grid row by row from the top, left to right', () => {
    const cells = climateGrid(
      climateIndex([
        { biome: 'demo:left', parameters: point(-0.5, 0) },
        { biome: 'demo:right', parameters: point(0.5, 0) },
        { biome: 'demo:top', parameters: point(0, 0.9) },
      ]),
      { x: 'temperature', y: 'humidity', fixed: ORIGIN, resolution: 4 },
    );
    expect(cells).toHaveLength(16);
    expect(cells[0 * 4 + 1]).toBe('demo:top'); // top row, x = -0.25, y = 0.75
    expect(cells[3 * 4 + 0]).toBe('demo:left'); // bottom-left
    expect(cells[3 * 4 + 3]).toBe('demo:right'); // bottom-right
  });
});

describe('biome colours', () => {
  it('prefers the grass colour, then the sky colour attribute, then effects.sky_color', () => {
    const sky = skyColourAttribute(firstTarget);
    expect(sky).toBe(firstTarget.worldgen.biomeAttributes?.skyColour);
    if (sky === undefined) throw new Error('The target names no sky colour attribute.');
    expect(biomeColour('demo:a', { effects: { grass_color: 0x79c05a } }, sky)).toBe('#79c05a');
    expect(
      biomeColour('demo:a', { attributes: { [sky]: 7972607 }, effects: { water_color: 1 } }, sky),
    ).toBe('#79a6ff');
    expect(biomeColour('demo:a', { attributes: { [sky]: '#ABCDEF' } }, sky)).toBe('#abcdef');
    // Without the target's attribute id the attribute is not read.
    expect(biomeColour('demo:a', { attributes: { [sky]: '#ABCDEF' } })).toBe(hashColour('demo:a'));
    expect(biomeColour('demo:a', { effects: { sky_color: 255 } })).toBe('#0000ff');
  });

  it('falls back to a stable hash of the namespaced id', () => {
    const colour = biomeColour('plains', { effects: { water_color: 1 } });
    expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    expect(colour).toBe(hashColour('minecraft:plains'));
    expect(biomeColour('minecraft:plains', undefined)).toBe(colour);
    expect(hashColour('minecraft:desert')).not.toBe(colour);
  });

  it('finds project biomes by id', () => {
    const project = {
      namespaces: [
        {
          name: 'demo',
          assets: [],
          elements: [
            { id: 'demo:glade', kind: 'minecraft:worldgen/biome', data: { temperature: 1 } },
            { id: 'demo:glade_model', kind: 'minecraft:model', data: {} },
          ],
        },
      ],
    } as unknown as Project;
    expect([...projectBiomes(project).keys()]).toEqual(['demo:glade']);
  });

  it("reads the sky colour attribute id from the project's target", () => {
    const project = { targets: [firstTarget.id], namespaces: [] } as unknown as Project;
    expect(projectSkyColourAttribute(project)).toBe(skyColourAttribute(firstTarget));
    const unknown = { targets: ['mc-0.0'], namespaces: [] } as unknown as Project;
    expect(projectSkyColourAttribute(unknown)).toBe(skyColourAttribute(firstTarget));
  });
});
