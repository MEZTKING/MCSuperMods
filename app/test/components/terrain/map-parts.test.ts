import { describe, expect, it } from 'vitest';
import {
  heightColour,
  layerIndex,
  paintLayers,
  UNKNOWN,
} from '../../../src/renderer/src/terrain/colours';
import { nextZoom, viewForKey } from '../../../src/renderer/src/terrain/controls';
import {
  filesWithHost,
  HOST_NAMESPACE,
  hostsFor,
  LIT_BLOCK,
} from '../../../src/renderer/src/terrain/hosts';
import { cutRegion, paintCut } from '../../../src/renderer/src/terrain/SideCut';
import {
  biomeShare,
  findBiome,
  groupUnsupported,
  heightSteps,
  mapRegion,
  missesVanillaFile,
  notesFor,
  paintLayerOf,
  unsupportedLine,
} from '../../../src/renderer/src/terrain/WorldMap';

const PROJECT = {
  dimension: {
    'demo:world': {
      generator: {
        type: 'minecraft:noise',
        settings: 'demo:land',
        biome_source: { type: 'minecraft:fixed', biome: 'demo:moor' },
      },
    },
    'demo:other': {
      generator: { type: 'minecraft:noise', settings: 'minecraft:overworld', biome_source: {} },
    },
  },
  'worldgen/noise_settings': { 'demo:land': { surface_rule: 'demo:rocky' } },
  'worldgen/material_rule': { 'demo:rocky': { type: 'minecraft:sequence', sequence: [] } },
  'worldgen/world_preset': {
    'demo:preset': {
      dimensions: {
        'minecraft:overworld': {
          generator: { type: 'minecraft:noise', settings: 'demo:land', biome_source: {} },
        },
        'minecraft:the_nether': { generator: { type: 'minecraft:noise', settings: 'x' } },
      },
    },
  },
};

const VANILLA = {
  'worldgen/noise_settings': { 'minecraft:overworld': { sea_level: 63, surface_rule: 'vanilla' } },
};

describe('hosts', () => {
  it('a dimension is its own world; a world preset gives one choice a dimension', () => {
    expect(
      hostsFor({ kind: 'minecraft:dimension', id: 'demo:world', data: {} }, PROJECT, null),
    ).toEqual([expect.objectContaining({ source: { dimension: 'demo:world' }, plain: false })]);
    const preset = hostsFor(
      { kind: 'minecraft:worldgen/world_preset', id: 'demo:preset', data: {} },
      PROJECT,
      null,
    );
    expect(preset.map((h) => h.source)).toEqual([
      { preset: 'demo:preset', dimension: 'minecraft:overworld' },
      { preset: 'demo:preset', dimension: 'minecraft:the_nether' },
    ]);
  });

  it('finds the worlds that lead to a surface rule through the project files, then a plain world', () => {
    const hosts = hostsFor(
      { kind: 'minecraft:worldgen/material_rule', id: 'demo:rocky', data: {} },
      PROJECT,
      VANILLA,
    );
    expect(hosts.map((h) => h.label)).toEqual([
      'demo:world',
      'minecraft:overworld of demo:preset',
      "A plain world: this rule on the overworld's land",
    ]);
    const plain = hosts[2];
    expect(plain?.plain).toBe(true);
    expect(plain?.source).toEqual({ dimension: `${HOST_NAMESPACE}:host` });
    const files = filesWithHost(PROJECT, plain as NonNullable<typeof plain>);
    expect(files['worldgen/noise_settings']?.[`${HOST_NAMESPACE}:host`]).toEqual({
      sea_level: 63,
      surface_rule: 'demo:rocky',
    });
    // The project's own files are kept; the host's are only laid over them.
    expect(files['worldgen/noise_settings']?.['demo:land']).toBeDefined();
    expect(PROJECT['worldgen/noise_settings']).not.toHaveProperty(`${HOST_NAMESPACE}:host`);
  });

  it("puts glowstone where a condition is true over the overworld's own rule", () => {
    const hosts = hostsFor(
      { kind: 'minecraft:worldgen/material_condition', id: 'demo:high', data: {} },
      PROJECT,
      VANILLA,
    );
    const plain = hosts.at(-1);
    const settings = plain?.extra['worldgen/noise_settings']?.[`${HOST_NAMESPACE}:host`] as {
      surface_rule: {
        sequence: [{ if_true: string; then_run: { result_state: { Name: string } } }, unknown];
      };
    };
    expect(settings.surface_rule.sequence[0].if_true).toBe('demo:high');
    expect(settings.surface_rule.sequence[0].then_run.result_state.Name).toBe(LIT_BLOCK);
    expect(settings.surface_rule.sequence[1]).toBe('vanilla');
  });

  it('a plain world for noise settings needs no vanilla file but the biome', () => {
    const hosts = hostsFor(
      { kind: 'minecraft:worldgen/noise_settings', id: 'demo:land', data: {} },
      PROJECT,
      null,
    );
    expect(hosts.map((h) => h.label)).toEqual([
      'demo:world',
      'minecraft:overworld of demo:preset',
      'A plain world with these settings and one biome',
    ]);
  });
});

describe('map regions and passes', () => {
  it('aligns the region so panning reuses samples', () => {
    expect(mapRegion({ x: 10, z: -10, zoom: 4 }, 4)).toEqual({
      x0: -512,
      z0: -576,
      width: 1088,
      depth: 1088,
      step: 4,
    });
  });

  it('shades Height from 16 blocks then 8 at 4 blocks a pixel', () => {
    expect(heightSteps(4)).toEqual([16, 8]);
    expect(heightSteps(1)).toEqual([4]);
    expect(heightSteps(16)).toEqual([64, 32]);
  });

  it('paints the topmost layer that has a sample, grey elsewhere', () => {
    const lower = { x0: 0, z0: 0, step: 4, columns: 1, rows: 1, rgb: new Uint8Array([1, 2, 3]) };
    const upper = {
      x0: 0,
      z0: 0,
      step: 2,
      columns: 1,
      rows: 2,
      rgb: new Uint8Array([9, 9, 9, 8, 8, 8]),
      rowDone: new Uint8Array([1, 0]),
    };
    expect(layerIndex(upper, 1, 3)).toBe(-1);
    const pixels = paintLayers([lower, upper], { left: 0, top: 0, zoom: 2, width: 3, height: 2 });
    expect([...pixels.slice(0, 4)]).toEqual([9, 9, 9, 255]);
    // Row 1 of the upper layer is not known yet: the lower layer shows.
    expect([...pixels.slice(12, 16)]).toEqual([1, 2, 3, 255]);
    // Outside both layers.
    expect([...pixels.slice(8, 11)]).toEqual([...UNKNOWN]);
  });

  it('lights one biome, gives its share and finds it', () => {
    const grid = {
      palette: ['minecraft:plains', 'demo:moor'],
      cells: new Uint16Array([0, 1, 0, 0]),
    };
    expect(biomeShare(grid, 'demo:moor')).toBe(0.25);
    const raw = {
      kind: 'biomes' as const,
      world: 'w',
      pass: 'fine' as const,
      region: { x0: 0, z0: 0, width: 8, depth: 8, step: 4 },
      biomes: grid,
    };
    const layer = paintLayerOf(raw, () => [200, 0, 0], 'demo:moor', {
      seaLevel: 63,
      minY: -64,
      height: 384,
    });
    // The other biome is dimmed, the lit one keeps its colour.
    expect([...layer.rgb.slice(3, 6)]).toEqual([200, 0, 0]);
    expect(layer.rgb[0]).toBeLessThan(200);
    expect(findBiome(layer, 'demo:moor', 100, 100)).toEqual({ x: 6, z: 2 });
  });

  it('colours water by depth and land up to white peaks', () => {
    const deep = heightColour(0, 63, -64, 320);
    const shallow = heightColour(60, 63, -64, 320);
    expect(deep[2]).toBeGreaterThan(deep[0]);
    expect(shallow[2]).toBeGreaterThan(deep[2]);
    expect(heightColour(300, 63, -64, 320)[0]).toBeGreaterThan(200);
  });
});

describe('side cut', () => {
  it('cuts west to east at the view, every block a pixel at zoom 1', () => {
    expect(cutRegion({ x: 0, z: 7, zoom: 1 }, 'x', 384)).toEqual({
      axis: 'x',
      at: 7,
      from: -128,
      to: 144,
      step: 1,
      yStep: 2,
    });
  });

  it('draws the cut top down, air as sky', () => {
    const region = { axis: 'x' as const, at: 0, from: -128, to: 128, step: 1, yStep: 1 };
    const cells = new Uint16Array(256 * 4);
    cells.fill(1, 0, 256); // the bottom row is stone, the rest air
    const picture = paintCut(
      { region, grid: { palette: ['minecraft:air', 'minecraft:stone'], cells } },
      { x: 0, z: 0, zoom: 1 },
      'x',
      { minY: 0, height: 4, seaLevel: -10 },
    );
    expect(picture.height).toBe(4);
    const bottom = picture.pixels.slice(3 * 256 * 4, 3 * 256 * 4 + 3);
    const topRow = picture.pixels.slice(0, 3);
    expect([...topRow]).not.toEqual([...bottom]);
  });
});

describe('keys and notes', () => {
  it('pans by 16 pixels, four times with Shift, and zooms between 1, 4 and 16', () => {
    expect(viewForKey({ x: 0, z: 0, zoom: 4 }, 'ArrowLeft', false)).toEqual({ x: -64 });
    expect(viewForKey({ x: 0, z: 0, zoom: 4 }, 'ArrowUp', true)).toEqual({ z: -256 });
    expect(viewForKey({ x: 0, z: 0, zoom: 4 }, 'q', false)).toBeNull();
    expect(nextZoom(1, -1)).toBe(1);
    expect(nextZoom(4, 1)).toBe(16);
  });

  it('says what is approximate on the target, from its facts, never a version', () => {
    const base = {
      summary: null,
      end: false,
      climate: true,
      mode: 'biomes' as const,
      heightStep: null,
      problems: [],
      litCondition: false,
    };
    expect(
      notesFor({ ...base, facts: { dataFolders: [], approximate: ['biome_layout', 'end'] } }),
    ).toContain('Biome borders are about right on this version.');
    expect(notesFor({ ...base, facts: { dataFolders: [], approximate: ['end'] } })).not.toContain(
      'Biome borders are about right on this version.',
    );
    const unknown = notesFor({
      ...base,
      facts: { dataFolders: [], approximate: [] },
      summary: {
        generator: 'noise',
        minY: 0,
        height: 256,
        seaLevel: 63,
        biomesKnown: false,
        seed: '1',
        unsupported: [],
        ms: 1,
      },
    });
    expect(unknown.join(' ')).toContain(
      "Vanilla's biomes show here after you have pressed Play once.",
    );
  });

  it('a missing vanilla file asks for the set-up, a missing project file does not', () => {
    const summary = (type: string) => ({
      generator: 'noise' as const,
      minY: 0,
      height: 256,
      seaLevel: 63,
      biomesKnown: true,
      seed: '1',
      ms: 1,
      unsupported: [{ kind: 'file' as const, type, where: 'demo:x', drawnInstead: 'Nothing' }],
    });
    expect(missesVanillaFile(summary('worldgen/noise_settings/minecraft:overworld'))).toBe(true);
    expect(missesVanillaFile(summary('worldgen/noise_settings/demo:typo'))).toBe(false);
  });

  it('names each unsupported type once, with how many more places use it', () => {
    const steep = (where: string) => ({
      kind: 'material_condition' as const,
      type: 'minecraft:steep',
      where,
      drawnInstead: 'Never true: the rules it guards are skipped.',
    });
    const groups = groupUnsupported([steep('a'), steep('b'), steep('c')]);
    expect(groups).toHaveLength(1);
    expect(unsupportedLine(groups[0]?.part ?? steep('x'), groups[0]?.more)).toBe(
      'This world uses steep (in a and 2 more places), which the preview cannot work out yet. Never true: the rules it guards are skipped.',
    );
  });
});
