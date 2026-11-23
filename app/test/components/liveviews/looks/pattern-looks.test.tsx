// @vitest-environment happy-dom
/**
 * B628's looks (ADR 0121 D5): paintings, banner and shield patterns, armour trims and pot
 * patterns. Every picture here is made by the test (MSM's own pixels, encoded with the view's
 * own PNG writer); the "jar" is a fake reader over those, so no picture of Minecraft's is in the
 * repository. The colour rules are the spike B619's 3S5 and 3S6.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { targetFacts } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LOOKS_VIEWS } from '../../../../src/renderer/src/liveviews/looks';
import BannerView from '../../../../src/renderer/src/liveviews/looks/banner/BannerView';
import {
  composeBannerPicture,
  dyeNames,
  dyeRgb,
  WOOD_COLOUR,
} from '../../../../src/renderer/src/liveviews/looks/banner/compose';
import {
  blankPixels,
  encodePng,
  fillRect,
  type Pixels,
  pixelAt,
  type Rgb,
  readPixels,
} from '../../../../src/renderer/src/liveviews/looks/banner/pixels';
import { WOOD_TEXEL } from '../../../../src/renderer/src/liveviews/looks/bodies/shapes';
import { paintingGeo } from '../../../../src/renderer/src/liveviews/looks/painting/compose';
import PaintingView from '../../../../src/renderer/src/liveviews/looks/painting/PaintingView';
import { composePotPicture } from '../../../../src/renderer/src/liveviews/looks/pot/compose';
import PotPatternView from '../../../../src/renderer/src/liveviews/looks/pot/PotPatternView';
import {
  applyTrimPalette,
  keyPaletteOf,
  paletteColours,
  trimPaletteId,
} from '../../../../src/renderer/src/liveviews/looks/trim/palette';
import TrimView from '../../../../src/renderer/src/liveviews/looks/trim/TrimView';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import type { VanillaDataReader } from '../../../../src/renderer/src/liveviews/vanilla-data';
import { armourPreviewOfEquipment } from '../../../../src/renderer/src/preview/armour-preview';
import type { VanillaAssetReader } from '../../../../src/renderer/src/preview/model-chain';
import { usePreferences } from '../../../../src/renderer/src/store/preferences';

afterEach(() => {
  cleanup();
  usePreferences.setState({ mode: 'easy' } as never);
});

const FACTS = targetFacts('mc-26.3') ?? null;
const json = (value: Json) => new TextEncoder().encode(JSON.stringify(value));
const el = (id: string, kind: string, data: Json): Element =>
  ({ id, kind, data }) as unknown as Element;

function projectOf(elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ name: 'demo', elements, assets: [] }],
    targets: [],
    plugins: [],
    settings: {},
  } as unknown as Project;
}

/** A picture of one colour. */
function solid(width: number, height: number, rgba: [number, number, number, number]): Pixels {
  const out = blankPixels(width, height);
  fillRect(out, [0, 0, width, height], rgba);
  return out;
}

/** A one-row palette picture. */
function paletteOf(colours: readonly Rgb[]): Pixels {
  const out = blankPixels(colours.length, 1);
  colours.forEach((c, i) => {
    fillRect(out, [i, 0, 1, 1], [c[0], c[1], c[2], 255]);
  });
  return out;
}

const reader =
  (files: Record<string, Uint8Array>) =>
  async (path: string): Promise<Uint8Array | null> =>
    files[path] ?? null;

function jarOf(files: Record<string, Uint8Array>): VanillaAssetReader {
  return { readAsset: reader(files) };
}

function vanillaOf(folders: Record<string, Record<string, Json>>): VanillaDataReader {
  return {
    mcVersion: '26.3',
    folder: async (folder: string) => ({
      status: 'ready' as const,
      version: '26.3',
      files: folders[folder] ?? {},
    }),
  } as unknown as VanillaDataReader;
}

function propsOf(
  project: Project,
  element: Element,
  extra: Partial<LiveViewProps> = {},
): LiveViewProps {
  return {
    project,
    element,
    vanilla: vanillaOf({}),
    vanillaAssets: null,
    preferences: {} as never,
    onPreferences() {},
    onSetup() {},
    ...extra,
  };
}

describe('the registry', () => {
  it('serves the four looks from their own files', async () => {
    for (const kind of [
      'minecraft:painting_variant',
      'minecraft:banner_pattern',
      'minecraft:trim_pattern',
      'minecraft:trim_material',
      'minecraft:decorated_pot_pattern',
    ]) {
      const loaded = await (LOOKS_VIEWS[kind] as () => Promise<{ default: unknown }>)();
      expect(typeof loaded.default, kind).toBe('function');
    }
  });
});

describe('pixels', () => {
  it('writes PNG bytes the reader reads back', () => {
    const picture = solid(5, 3, [10, 200, 30, 128]);
    const back = readPixels(encodePng(picture));
    expect(back?.width).toBe(5);
    expect(back?.height).toBe(3);
    expect(pixelAt(back as Pixels, 4, 2)).toEqual([10, 200, 30, 128]);
  });
});

describe('banner and shield layers (3S6)', () => {
  const white = solid(64, 64, [255, 255, 255, 255]);

  it('reads the sixteen dye colours from the target', () => {
    expect(dyeNames(FACTS)).toHaveLength(16);
    expect(dyeNames(FACTS)[0]).toBe('white');
    expect(dyeRgb(FACTS, 'red')).toEqual([0xb0, 0x2e, 0x26]);
    expect(dyeRgb(FACTS, 'minecraft:blue')).toEqual([0x3c, 0x44, 0xaa]);
  });

  it('colours a layer with its dye: pattern times dye, over the base colour', () => {
    for (const dye of ['red', 'blue', 'lime'] as const) {
      const rgb = dyeRgb(FACTS, dye) as Rgb;
      const picture = composeBannerPicture('banner', null, [
        { mask: null, dye: dyeRgb(FACTS, 'white') as Rgb },
        { mask: white, dye: rgb },
      ]);
      expect(pixelAt(picture, 10, 20).slice(0, 3)).toEqual([...rgb]);
    }
  });

  it('multiplies grey, blends half alpha and lets a later layer cover an earlier one', () => {
    const red = dyeRgb(FACTS, 'red') as Rgb;
    const base = dyeRgb(FACTS, 'white') as Rgb;
    const grey = composeBannerPicture('banner', null, [
      { mask: null, dye: [0, 0, 0] },
      { mask: solid(64, 64, [128, 128, 128, 255]), dye: red },
    ]);
    expect(pixelAt(grey, 5, 5)[0]).toBe(Math.round((128 * red[0]) / 255));
    const half = composeBannerPicture('shield', null, [
      { mask: null, dye: base },
      { mask: solid(64, 64, [255, 255, 255, 128]), dye: [0, 0, 0] },
    ]);
    expect(Math.abs((pixelAt(half, 5, 5)[0] ?? 0) - base[0] / 2)).toBeLessThanOrEqual(1);
    const covered = composeBannerPicture('banner', null, [
      { mask: white, dye: red },
      { mask: white, dye: [0, 0, 255] },
    ]);
    expect(pixelAt(covered, 5, 5).slice(0, 3)).toEqual([0, 0, 255]);
  });

  it('paints the wood texel the pole, bar and handle sample', () => {
    const picture = composeBannerPicture('shield', white, []);
    expect(pixelAt(picture, WOOD_TEXEL[0], WOOD_TEXEL[1])).toEqual([...WOOD_COLOUR]);
  });

  it('the view follows the dye picked, on a banner and on a shield', async () => {
    const mask = encodePng(solid(64, 64, [255, 255, 255, 255]));
    const project = projectOf([]);
    const element = el('demo:stripe', 'minecraft:banner_pattern', {
      asset_id: 'demo:stripe',
      translation_key: 'block.demo.banner.stripe',
    });
    const readProject = reader({
      'assets/demo/textures/entity/banner/stripe.png': mask,
      'assets/demo/textures/entity/shield/stripe.png': mask,
    });
    render(<BannerView {...propsOf(project, element, { readProject })} />);
    const banner = await screen.findByTestId('live-banner-banner');
    expect(banner.getAttribute('data-pattern-dye')).toBe('#1d1d21');
    fireEvent.change(screen.getByTestId('live-banner-dye'), { target: { value: 'blue' } });
    await waitFor(() =>
      expect(screen.getByTestId('live-banner-shield').getAttribute('data-pattern-dye')).toBe(
        '#3c44aa',
      ),
    );
    expect(screen.getByTestId('live-banner-banner-front').getAttribute('width')).toBe('80');
    expect(screen.queryByText(/has no banner picture/)).toBeNull();
  });
});

describe('trim colours (3S5)', () => {
  const key: Rgb[] = [
    [224, 224, 224],
    [192, 192, 192],
    [160, 160, 160],
    [128, 128, 128],
  ];
  const iron: Rgb[] = [
    [240, 240, 240],
    [210, 210, 210],
    [180, 180, 180],
    [150, 150, 150],
  ];
  const ironDarker: Rgb[] = [
    [200, 200, 200],
    [170, 170, 170],
    [140, 140, 140],
    [110, 110, 110],
  ];

  it('gives a pixel at key level i palette colour i, and passes other colours unchanged', () => {
    const pattern = blankPixels(6, 1);
    key.forEach((c, i) => {
      fillRect(pattern, [i, 0, 1, 1], [c[0], c[1], c[2], 255]);
    });
    fillRect(pattern, [4, 0, 1, 1], [255, 0, 0, 255]);
    fillRect(pattern, [5, 0, 1, 1], [key[1]?.[0] ?? 0, key[1]?.[1] ?? 0, key[1]?.[2] ?? 0, 128]);
    const out = applyTrimPalette(pattern, key, iron);
    for (let i = 0; i < 4; i += 1) {
      expect(pixelAt(out, i, 0)).toEqual([...(iron[i] as Rgb), 255]);
    }
    expect(pixelAt(out, 4, 0)).toEqual([255, 0, 0, 255]);
    // A half-clear pattern pixel shows fully.
    expect(pixelAt(out, 5, 0)).toEqual([...(iron[1] as Rgb), 255]);
    // Without a key the layer is drawn as it is.
    expect(pixelAt(applyTrimPalette(pattern, null, iron), 0, 0)).toEqual([...(key[0] as Rgb), 255]);
  });

  it('reads the key the layer’s .png.mcmeta names', () => {
    expect(keyPaletteOf({ palette: { base_palette: 'trim_base' } })).toBe('trim_base');
    expect(keyPaletteOf({ animation: {} })).toBeNull();
    expect(paletteColours(paletteOf(iron))).toEqual(iron);
  });

  it('swaps the palette when the armour’s trim_overrides name the material', () => {
    const ironArmour = {
      layers: { humanoid: [{ texture: 'minecraft:iron' }] },
      trim_overrides: [
        { palette: 'minecraft:trim/iron_darker', when: { material: 'minecraft:iron' } },
      ],
    };
    const material = { palette_id: 'minecraft:trim/iron', description: { text: 'Iron' } };
    expect(trimPaletteId('minecraft:iron', material, ironArmour)).toEqual({
      id: 'minecraft:trim/iron_darker',
      override: true,
    });
    expect(trimPaletteId('iron', material, ironArmour).id).toBe('minecraft:trim/iron_darker');
    expect(
      trimPaletteId('minecraft:gold', { palette_id: 'minecraft:trim/gold' }, ironArmour),
    ).toEqual({ id: 'minecraft:trim/gold', override: false });
    expect(trimPaletteId('minecraft:iron', material, undefined)).toEqual({
      id: 'minecraft:trim/iron',
      override: false,
    });
  });

  it('the view colours the pattern on the armour figure, with the override applied', async () => {
    const layer = blankPixels(64, 32);
    key.forEach((c, i) => {
      fillRect(layer, [i * 2, 0, 2, 2], [c[0], c[1], c[2], 255]);
    });
    const layerBytes = encodePng(layer);
    const meta = json({ palette: { base_palette: 'demo:wave_key' } });
    const readProject = reader({
      'assets/demo/textures/trims/entity/humanoid/wave.png': layerBytes,
      'assets/demo/textures/trims/entity/humanoid/wave.png.mcmeta': meta,
      'assets/demo/textures/trims/entity/humanoid_leggings/wave.png': layerBytes,
      'assets/demo/textures/trims/entity/humanoid_leggings/wave.png.mcmeta': meta,
      'assets/demo/textures/palettes/wave_key.png': encodePng(paletteOf(key)),
    });
    const ironJson = {
      layers: { humanoid: [{ texture: 'minecraft:iron' }] },
      trim_overrides: [
        { palette: 'minecraft:trim/iron_darker', when: { material: 'minecraft:iron' } },
      ],
    };
    const vanillaAssets = jarOf({
      'assets/minecraft/equipment/iron.json': json(ironJson),
      'assets/minecraft/textures/palettes/trim/iron.png': encodePng(paletteOf(iron)),
      'assets/minecraft/textures/palettes/trim/iron_darker.png': encodePng(paletteOf(ironDarker)),
    });
    const vanilla = vanillaOf({
      trim_material: { 'minecraft:iron': { palette_id: 'minecraft:trim/iron' } },
    });
    const project = projectOf([
      el('demo:wave', 'minecraft:trim_pattern', {
        asset_id: 'demo:wave',
        decal: false,
        description: { translate: 'trim_pattern.demo.wave' },
      }),
      el('demo:plate', 'minecraft:equipment', {
        layers: { humanoid: [{ texture: 'demo:plate' }] },
      }),
    ]);
    const element = project.namespaces[0]?.elements[0] as Element;
    render(<TrimView {...propsOf(project, element, { readProject, vanillaAssets, vanilla })} />);
    await waitFor(() => expect(screen.getAllByTestId('live-trim-swatch')).toHaveLength(4));
    // Iron armour wears iron trims in its darker palette.
    await waitFor(() =>
      expect(
        screen.getAllByTestId('live-trim-swatch').map((s) => s.getAttribute('data-colour')),
      ).toEqual(['#c8c8c8', '#aaaaaa', '#8c8c8c', '#6e6e6e']),
    );
    expect(screen.getByTestId('live-trim-layer-humanoid')).toBeTruthy();
    expect(screen.getByTestId('armour-preview')).toBeTruthy();
    expect(screen.getByTestId('armour-preview-trim').textContent).toContain('in iron');
    expect(screen.getByText(/in its own colours/)).toBeTruthy();
    // The project's own armour has no override: the material's own palette.
    fireEvent.change(screen.getByTestId('live-trim-armour'), { target: { value: 'demo:plate' } });
    await waitFor(() =>
      expect(
        screen.getAllByTestId('live-trim-swatch').map((s) => s.getAttribute('data-colour')),
      ).toEqual(['#f0f0f0', '#d2d2d2', '#b4b4b4', '#969696']),
    );
  });

  it('a material shows on a pattern picked from Minecraft’s, and Very easy draws no ids', async () => {
    usePreferences.setState({ mode: 'very-easy' } as never);
    const project = projectOf([
      el('demo:ruby', 'minecraft:trim_material', {
        palette_id: 'demo:trim/ruby',
        description: { text: 'Ruby', color: '#aa0000' },
      }),
    ]);
    const element = project.namespaces[0]?.elements[0] as Element;
    const vanilla = vanillaOf({
      trim_pattern: { 'minecraft:coast': { asset_id: 'minecraft:coast', decal: false } },
    });
    const layer = solid(64, 32, [224, 224, 224, 255]);
    const vanillaAssets = jarOf({
      'assets/minecraft/textures/trims/entity/humanoid/coast.png': encodePng(layer),
      'assets/minecraft/textures/trims/entity/humanoid/coast.png.mcmeta': json({
        palette: { base_palette: 'trim_base' },
      }),
      'assets/minecraft/textures/palettes/trim_base.png': encodePng(paletteOf([[224, 224, 224]])),
    });
    const readProject = reader({
      'assets/demo/textures/palettes/trim/ruby.png': encodePng(paletteOf([[170, 0, 0]])),
    });
    render(<TrimView {...propsOf(project, element, { readProject, vanillaAssets, vanilla })} />);
    await waitFor(() =>
      expect(screen.getByTestId('live-trim-swatch').getAttribute('data-colour')).toBe('#aa0000'),
    );
    expect(screen.getByTestId('live-trim-other')).toBeTruthy();
    const text = screen.getByTestId('live-view').textContent ?? '';
    expect(text).not.toMatch(/[a-z_]+:[a-z_/]+/);
    expect(text).toContain('Coast');
  });

  it('wears a vanilla armour whole', () => {
    const preview = armourPreviewOfEquipment('minecraft:iron', null, null);
    expect(preview.parts.filter((part) => part.shown).map((part) => part.id)).toEqual([
      'helmet',
      'chestplate',
      'leggings',
      'boots',
    ]);
    expect(preview.parts[0]?.texture).toBe('minecraft:iron');
  });
});

describe('pot patterns', () => {
  it('puts the pattern on the sides asked for and clay elsewhere', () => {
    const pattern = solid(16, 16, [0, 255, 0, 255]);
    const plain = solid(16, 16, [100, 50, 20, 255]);
    const picture = composePotPicture(pattern, plain, new Set(['north', 'south']));
    expect(pixelAt(picture, 8, 8)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(picture, 16 + 8, 8)).toEqual([100, 50, 20, 255]);
    expect(pixelAt(picture, 32 + 8, 8)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(picture, 40, 24)).toEqual([100, 50, 20, 255]);
  });

  it('the view draws four sides and a side can be turned off', async () => {
    const project = projectOf([]);
    const element = el('demo:leaf', 'minecraft:decorated_pot_pattern', {
      asset_id: 'demo:leaf_pottery_pattern',
    });
    const readProject = reader({
      'assets/demo/textures/entity/decorated_pot/leaf_pottery_pattern.png': encodePng(
        solid(16, 16, [0, 255, 0, 255]),
      ),
    });
    render(<PotPatternView {...propsOf(project, element, { readProject })} />);
    await waitFor(() =>
      expect(screen.getByTestId('live-pot-face-east').getAttribute('data-patterned')).toBe('true'),
    );
    fireEvent.click(screen.getByTestId('live-pot-side-east'));
    expect(screen.getByTestId('live-pot-face-east').getAttribute('data-patterned')).toBe('false');
    expect(screen.getByTestId('live-pot-face-north').getAttribute('data-patterned')).toBe('true');
  });
});

describe('paintings', () => {
  it('puts the painting on the wall at its size, the picture at its real size', () => {
    const geo = paintingGeo(2, 1, 64, 32) as {
      'minecraft:geometry': { description: { texture_width: number }; bones: { name: string }[] }[];
    };
    const geometry = geo['minecraft:geometry'][0];
    expect(geometry?.description.texture_width).toBe(80);
    expect(geometry?.bones.map((bone) => bone.name)).toEqual(['wall', 'picture']);
  });

  it('draws the painting at its size beside a player and follows an edit', async () => {
    const project = projectOf([]);
    const data = { asset_id: 'demo:sunset', width: 2, height: 1 };
    const readProject = reader({
      'assets/demo/textures/painting/sunset.png': encodePng(solid(32, 32, [200, 100, 0, 255])),
    });
    const { rerender } = render(
      <PaintingView
        {...propsOf(project, el('demo:sunset', 'minecraft:painting_variant', data), {
          readProject,
        })}
      />,
    );
    const picture = await screen.findByTestId('live-painting-picture');
    await waitFor(() =>
      expect(screen.getByTestId('live-painting-picture').getAttribute('data-found')).toBe('true'),
    );
    expect(picture.getAttribute('data-width')).toBe('2');
    expect(screen.getByTestId('live-painting-player').getAttribute('data-height')).toBe('1.8');
    expect(screen.getByText(/the game stretches it over 2 by 1 blocks/)).toBeTruthy();
    await act(async () => {
      rerender(
        <PaintingView
          {...propsOf(
            project,
            el('demo:sunset', 'minecraft:painting_variant', { ...data, width: 4, height: 3 }),
            { readProject },
          )}
        />,
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('live-painting-picture').getAttribute('data-width')).toBe('4'),
    );
    expect(screen.getByTestId('live-painting-picture').getAttribute('data-height')).toBe('3');
  });

  it('draws a blank canvas and says so when the picture is missing', async () => {
    const project = projectOf([]);
    render(
      <PaintingView
        {...propsOf(
          project,
          el('demo:empty', 'minecraft:painting_variant', {
            asset_id: 'demo:empty',
            width: 1,
            height: 1,
          }),
          { readProject: reader({}) },
        )}
      />,
    );
    expect(await screen.findByText(/has no picture yet/)).toBeTruthy();
  });
});
