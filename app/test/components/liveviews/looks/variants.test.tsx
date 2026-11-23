// @vitest-environment happy-dom
/**
 * B627's views (ADR 0121 D4; the plan's batch 3 table): the seven mob variants on their stand-in
 * bodies (the zombie nautilus as the flat sheet with its parts named), the four sound variants
 * with a Play button per sound, the sulfur cube archetype (body, bounce, sounds) and the villager
 * look and job on the villager stand-in. Pictures come from fake readers; no picture of
 * Minecraft's is in the repository, so the jar's files here are made-up bytes, and PNGs that must
 * decode are drawn by the test. WebGL is absent here, so the views draw their flat pictures; the
 * composed picture a body wears is checked through `composeSheet` on the real bodies.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { zlibSync } from 'fflate';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LiveViewClient } from '../../../../src/renderer/src/liveviews/client';
import {
  loadBody,
  scaleBody,
  sulfurCubeScale,
} from '../../../../src/renderer/src/liveviews/looks/bodies';
import {
  attributeValue,
  bounceCount,
  bounceNumbers,
  bouncePath,
} from '../../../../src/renderer/src/liveviews/looks/sulfur-cube/bounce';
import { cubeFacts } from '../../../../src/renderer/src/liveviews/looks/sulfur-cube/SulfurCubeView';
import { composeSheet } from '../../../../src/renderer/src/liveviews/looks/variant/BodyLook';
import {
  composeLayers,
  geoBoneNames,
  geoTextureSize,
  texelAt,
} from '../../../../src/renderer/src/liveviews/looks/variant/compose';
import {
  soundFieldWords,
  variantSounds,
} from '../../../../src/renderer/src/liveviews/looks/variant/SoundVariantView';
import { SpawnPlaces } from '../../../../src/renderer/src/liveviews/looks/variant/SpawnPlaces';
import {
  FLAT_SHEET_WORDS,
  hasBabyLook,
  nautilusParts,
  spawnRules,
  variantModel,
  variantTexture,
} from '../../../../src/renderer/src/liveviews/looks/variant/variant-model';
import { ProfessionLookFrame } from '../../../../src/renderer/src/liveviews/looks/villager/ProfessionLook';
import { VillagerTypeLookFrame } from '../../../../src/renderer/src/liveviews/looks/villager/VillagerTypeView';
import {
  badgePath,
  villagerLayers,
} from '../../../../src/renderer/src/liveviews/looks/villager/villager-look';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import { liveViewComponent } from '../../../../src/renderer/src/liveviews/registry';
import { createVanillaDataReader } from '../../../../src/renderer/src/liveviews/vanilla-data';
import { SIM_ENGINE } from '../../../../src/renderer/src/liveviews/worker';
import type { VanillaAssetReader } from '../../../../src/renderer/src/preview/model-chain';
import type { VanillaDataFiles } from '../../../../src/shared/platform';
import { fakePlayer, fakeVanilla, SoundHarness } from '../../audio/fake-player';
import { PRELOAD_TIMEOUT_MS, preloadChunks } from '../../lazy-chunks';
import { hostWorker } from '../frame/fakes';

afterEach(cleanup);

beforeAll(async () => {
  await preloadChunks(
    () => import('../../../../src/renderer/src/liveviews/looks/variant/VariantView'),
    () => import('../../../../src/renderer/src/liveviews/looks/variant/SoundVariantView'),
    () => import('../../../../src/renderer/src/liveviews/looks/sulfur-cube/SulfurCubeView'),
    () => import('../../../../src/renderer/src/liveviews/looks/villager/VillagerTypeView'),
    () => import('../../../../src/renderer/src/liveviews/looks/villager/ProfessionLook'),
    () => import('../../../../src/renderer/src/liveviews/existing/MerchantPart'),
  );
}, PRELOAD_TIMEOUT_MS);

// Pictures ------------------------------------------------------------------------------------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const u32 = (value: number) => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];
function chunk(type: string, data: Uint8Array): number[] {
  const body = new Uint8Array([...new TextEncoder().encode(type), ...data]);
  return [...u32(data.length), ...body, ...u32(crc(body))];
}

/** A PNG of one colour, or of `paint(x, y)` per texel. */
function png(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number],
): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const at = y * (width * 4 + 1) + 1 + x * 4;
      raw.set(paint(x, y), at);
    }
  }
  const header = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', header),
    ...chunk('IDAT', zlibSync(raw)),
    ...chunk('IEND', new Uint8Array()),
  ]);
}

const solid = (rgba: [number, number, number, number]) => () => rgba;

/** A fake jar cache: the paths it has, and every path asked. */
function jar(files: Record<string, Uint8Array>): VanillaAssetReader & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    readAsset: async (path) => {
      asked.push(path);
      return files[path] ?? null;
    },
  };
}

// Projects and props ---------------------------------------------------------------------------

const element = (id: string, kind: string, data: Json): Element =>
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

const VANILLA_BIOME_TAGS: Record<string, Json> = {
  'minecraft:is_cold': { values: ['minecraft:snowy_plains', '#minecraft:is_frozen'] },
  'minecraft:is_frozen': { values: ['minecraft:ice_spikes'] },
};

function vanillaData(setUp = true) {
  return createVanillaDataReader({
    mcVersion: '26.3',
    read: async (version, folders): Promise<VanillaDataFiles | null> =>
      setUp
        ? {
            version,
            folders: Object.fromEntries(
              folders.map((folder) => [
                folder,
                folder === 'tags/worldgen/biome' ? VANILLA_BIOME_TAGS : {},
              ]),
            ) as VanillaDataFiles['folders'],
            fileCount: 2,
          }
        : null,
  });
}

function propsOf(
  project: Project,
  subject: Element,
  vanillaAssets: VanillaAssetReader | null,
  more: Partial<LiveViewProps> = {},
): LiveViewProps {
  return {
    project,
    element: subject,
    vanilla: vanillaData(),
    vanillaAssets,
    preferences: {} as never,
    onPreferences() {},
    onSetup() {},
    ...more,
  };
}

async function viewOf(kind: string) {
  const View = liveViewComponent(kind);
  if (View === null) throw new Error(`no view for ${kind}`);
  return View;
}

const PICTURE = png(4, 4, solid([200, 100, 50, 255]));

// The seven variants ---------------------------------------------------------------------------

const VARIANTS: readonly { kind: string; data: Json; body: string; path: string }[] = [
  {
    kind: 'minecraft:wolf_variant',
    data: {
      assets: {
        wild: 'demo:entity/wolf/w',
        tame: 'demo:entity/wolf/t',
        angry: 'demo:entity/wolf/a',
      },
      baby_assets: {
        wild: 'demo:entity/wolf/wb',
        tame: 'demo:entity/wolf/tb',
        angry: 'demo:entity/wolf/ab',
      },
      spawn_conditions: [{ priority: 0 }],
    },
    body: 'wolf',
    path: 'assets/demo/textures/entity/wolf/w.png',
  },
  {
    kind: 'minecraft:cat_variant',
    data: {
      asset_id: 'demo:entity/cat/c',
      baby_asset_id: 'demo:entity/cat/cb',
      spawn_conditions: [],
    },
    body: 'cat',
    path: 'assets/demo/textures/entity/cat/c.png',
  },
  {
    kind: 'minecraft:pig_variant',
    data: { asset_id: 'demo:entity/pig/p', baby_asset_id: 'demo:entity/pig/pb', model: 'cold' },
    body: 'pig_cold',
    path: 'assets/demo/textures/entity/pig/p.png',
  },
  {
    kind: 'minecraft:cow_variant',
    data: { asset_id: 'demo:entity/cow/c', baby_asset_id: 'demo:entity/cow/cb', model: 'warm' },
    body: 'cow_warm',
    path: 'assets/demo/textures/entity/cow/c.png',
  },
  {
    kind: 'minecraft:chicken_variant',
    data: { asset_id: 'demo:entity/chicken/c', baby_asset_id: 'demo:entity/chicken/cb' },
    body: 'chicken',
    path: 'assets/demo/textures/entity/chicken/c.png',
  },
  {
    kind: 'minecraft:frog_variant',
    data: { asset_id: 'demo:entity/frog/f' },
    body: 'frog',
    path: 'assets/demo/textures/entity/frog/f.png',
  },
  {
    kind: 'minecraft:zombie_nautilus_variant',
    data: { asset_id: 'demo:entity/nautilus/z', model: 'warm' },
    body: 'flat_sheet',
    path: 'assets/demo/textures/entity/nautilus/z.png',
  },
];

describe('the variants’ data', () => {
  it('reads the picture each kind names for a look and age', () => {
    const wolf = VARIANTS[0]?.data as Json;
    expect(variantTexture('minecraft:wolf_variant', wolf, { wolf: 'angry' })).toBe(
      'demo:entity/wolf/a',
    );
    expect(variantTexture('minecraft:wolf_variant', wolf, { wolf: 'tame', baby: true })).toBe(
      'demo:entity/wolf/tb',
    );
    expect(variantTexture('minecraft:cat_variant', VARIANTS[1]?.data as Json, { baby: true })).toBe(
      'demo:entity/cat/cb',
    );
    expect(variantTexture('minecraft:frog_variant', {}, {})).toBeUndefined();
    expect(hasBabyLook('minecraft:frog_variant')).toBe(false);
    expect(hasBabyLook('minecraft:zombie_nautilus_variant')).toBe(false);
    expect(hasBabyLook('minecraft:pig_variant')).toBe(true);
    expect(variantModel({ model: 'minecraft:cold' })).toBe('cold');
    expect(variantModel({})).toBe('normal');
  });

  it('reads the spawn conditions, highest priority first', () => {
    const rules = spawnRules({
      spawn_conditions: [
        { priority: 0 },
        { priority: 2, condition: { type: 'minecraft:biome', biomes: '#minecraft:is_cold' } },
        {
          priority: 1,
          condition: { type: 'minecraft:structure', structures: ['minecraft:igloo'] },
        },
        { priority: 3, condition: { type: 'minecraft:moon_brightness', range: { min: 0.5 } } },
      ],
    });
    expect(rules.map((rule) => rule.type)).toEqual(['moon', 'biome', 'structure', 'anywhere']);
    expect(rules[1]?.ids).toEqual(['#minecraft:is_cold']);
    expect(rules[0]?.range).toEqual({ min: 0.5 });
  });

  it('opens biome tags in the worker, the project’s over vanilla’s, tags inside tags included', async () => {
    const rules = spawnRules({
      spawn_conditions: [
        {
          priority: 1,
          condition: {
            type: 'minecraft:biome',
            biomes: ['minecraft:plains', '#minecraft:is_cold'],
          },
        },
      ],
    });
    const client = () => new LiveViewClient({ createWorker: () => hostWorker(SIM_ENGINE) });
    const view = render(
      <SpawnPlaces
        project={projectOf([])}
        vanilla={vanillaData()}
        rules={rules}
        client={client()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('variant-spawn').textContent).toBe(
        'Priority 1: In Plains; Snowy plains, Ice spikes (the biomes of Is cold).',
      ),
    );
    view.unmount();
    const project = projectOf([
      element('minecraft:is_cold', 'minecraft:tag/worldgen/biome', { values: ['demo:glacier'] }),
    ]);
    const second = render(
      <SpawnPlaces project={project} vanilla={vanillaData()} rules={rules} client={client()} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('variant-spawn').textContent).toContain('Glacier'),
    );
    second.unmount();
    render(
      <SpawnPlaces
        project={projectOf([])}
        vanilla={vanillaData(false)}
        rules={rules}
        client={client()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('variant-spawn').textContent).toContain(
        'set up your Minecraft folder to list them',
      ),
    );
  });

  it('names the zombie nautilus’s measured parts, the coral on the warm model', () => {
    expect(nautilusParts('normal').map((part) => part.name)).toContain('Upper part, front');
    expect(nautilusParts('normal').some((part) => part.name.startsWith('Coral'))).toBe(false);
    expect(nautilusParts('warm').some((part) => part.name.startsWith('Coral'))).toBe(true);
  });
});

describe('the seven variant views', () => {
  it.each(VARIANTS)(
    '$kind draws $body wearing its picture and follows an edit',
    async (variant) => {
      const View = await viewOf(variant.kind);
      const subject = element('demo:look', variant.kind, variant.data);
      const assets = jar({});
      const reads: string[] = [];
      const readProject = async (path: string) => {
        reads.push(path);
        return path.startsWith('assets/demo/') ? PICTURE : null;
      };
      const view = render(
        <View {...propsOf(projectOf([subject]), subject, assets, { readProject })} />,
      );
      const words = await screen.findByTestId('variant-words');
      expect(words.getAttribute('data-body')).toBe(variant.body);
      expect(words.getAttribute('data-path')).toBe(variant.path);
      expect(screen.getByTestId('live-view-tag').textContent).toBe('Preview');
      if (variant.body === 'flat_sheet') {
        expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
          'only_in_game',
        );
        expect(screen.getByTestId('variant-flat-sheet-words').textContent).toBe(FLAT_SHEET_WORDS);
        expect(screen.getByTestId('variant-flat-sheet-parts').textContent).toContain(
          'Coral pieces',
        );
        await waitFor(() =>
          expect(screen.getByAltText('The zombie nautilus picture, flat')).toBeTruthy(),
        );
      } else {
        expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
          'about_right',
        );
        await waitFor(() =>
          expect(screen.getByTestId('variant-body').getAttribute('data-layers')).toBe(variant.path),
        );
        // Without WebGL the picture is drawn flat.
        expect(screen.getByTestId('variant-body').getAttribute('data-mode')).toBe('flat');
        expect(screen.getByTestId('variant-body-flat')).toBeTruthy();
      }
      // An edit of the picture is followed (150 ms after it).
      const edited = JSON.parse(
        JSON.stringify(variant.data).replace(
          /"demo:entity\/([a-z]+)\/([a-z]+)"/,
          '"demo:entity/$1/new_$2"',
        ),
      ) as Json;
      const next = element('demo:look', variant.kind, edited);
      const started = performance.now();
      view.rerender(<View {...propsOf(projectOf([next]), next, assets, { readProject })} />);
      const moved = variant.path.replace(/\/([a-z]+)\.png$/, '/new_$1.png');
      await waitFor(() =>
        expect(screen.getByTestId('variant-words').getAttribute('data-path')).toBe(moved),
      );
      if (variant.body !== 'flat_sheet') {
        await waitFor(() =>
          expect(screen.getByTestId('variant-body').getAttribute('data-layers')).toBe(moved),
        );
        expect(performance.now() - started).toBeLessThan(1150);
      }
    },
  );

  it('switches a wolf between wild, tame and angry, and to the pup', async () => {
    const variant = VARIANTS[0] as (typeof VARIANTS)[number];
    const View = await viewOf(variant.kind);
    const subject = element('demo:look', variant.kind, variant.data);
    render(<View {...propsOf(projectOf([subject]), subject, jar({}))} />);
    await screen.findByTestId('variant-words');
    fireEvent.click(screen.getByTestId('variant-wolf-angry'));
    expect(screen.getByTestId('variant-words').getAttribute('data-path')).toBe(
      'assets/demo/textures/entity/wolf/a.png',
    );
    fireEvent.click(screen.getByTestId('variant-age-baby'));
    expect(screen.getByTestId('variant-words').getAttribute('data-path')).toBe(
      'assets/demo/textures/entity/wolf/ab.png',
    );
    expect(screen.getByTestId('variant-words').getAttribute('data-body')).toBe('wolf_baby');
    expect(screen.getByText('A tame animal’s collar is not drawn.')).toBeTruthy();
  });

  it('reads a vanilla picture from the jar cache and names its biome tag', async () => {
    const View = await viewOf('minecraft:pig_variant');
    const subject = element('minecraft:frosty', 'minecraft:pig_variant', {
      asset_id: 'minecraft:entity/pig/pig_cold',
      model: 'cold',
      spawn_conditions: [
        { priority: 1, condition: { type: 'minecraft:biome', biomes: '#minecraft:is_cold' } },
      ],
    });
    const assets = jar({ 'assets/minecraft/textures/entity/pig/pig_cold.png': PICTURE });
    render(<View {...propsOf(projectOf([subject]), subject, assets)} />);
    await waitFor(() =>
      expect(screen.getByTestId('variant-body').getAttribute('data-layers')).toBe(
        'assets/minecraft/textures/entity/pig/pig_cold.png',
      ),
    );
    expect(screen.getByTestId('variant-spawn').textContent).toContain('the biomes of Is cold');
    expect(screen.getByTestId('variant-words').textContent).toContain('the cold body');
  });

  it('says the picture was not found, and shows the set-up banner for Minecraft’s', async () => {
    const View = await viewOf('minecraft:cow_variant');
    const subject = element('demo:x', 'minecraft:cow_variant', {
      asset_id: 'minecraft:entity/cow/gone',
    });
    render(<View {...propsOf(projectOf([subject]), subject, null)} />);
    expect(await screen.findByTestId('live-view-set-up')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('variant-body-missing')).toBeTruthy());
  });
});

describe('the bodies wear the composed picture', () => {
  it('lays layers by alpha, stretches another size and keeps to a rectangle', () => {
    const red = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(16).fill(0).map((_, i) => (i % 4 === 0 || i % 4 === 3 ? 255 : 0)),
    };
    const halfBlue = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 255, 128]),
    };
    const sheet = composeLayers(2, 2, [{ pixels: red }, { pixels: halfBlue, rect: [1, 0, 2, 2] }]);
    expect(texelAt(sheet, 2, 0, 0)).toEqual([255, 0, 0, 255]);
    const mixed = texelAt(sheet, 2, 1, 1);
    expect(mixed[3]).toBe(255);
    expect(mixed[0]).toBeGreaterThan(120);
    expect(mixed[2]).toBeGreaterThan(120);
  });

  it('dresses the villager body in base, look, job and badge, in that order', async () => {
    const geo = await loadBody('villager');
    expect(geoTextureSize(geo)).toEqual({ width: 64, height: 64 });
    const layers = villagerLayers(
      { textures: 'textures' } as never,
      { path: 'assets/demo/textures/look.png', words: 'Look' },
      { path: 'assets/demo/textures/job.png', words: 'Job' },
      3,
    );
    expect(layers.map((layer) => layer.path)).toEqual([
      'assets/minecraft/textures/entity/villager/villager.png',
      'assets/demo/textures/look.png',
      'assets/demo/textures/job.png',
      'assets/minecraft/textures/entity/villager/profession_level/gold.png',
    ]);
    // Base grey everywhere, look green on the top half, job blue on the left, badge white in one texel.
    const sheet = composeSheet(geo, layers, [
      png(64, 64, solid([90, 90, 90, 255])),
      png(64, 64, (_, y) => (y < 32 ? [0, 200, 0, 255] : [0, 0, 0, 0])),
      png(64, 64, (x) => (x < 16 ? [0, 0, 200, 255] : [0, 0, 0, 0])),
      png(64, 64, (x, y) => (x === 40 && y === 40 ? [255, 255, 255, 255] : [0, 0, 0, 0])),
    ]);
    expect(sheet).not.toBeNull();
    const at = (x: number, y: number) => texelAt(sheet?.data as Uint8ClampedArray, 64, x, y);
    expect(at(40, 60)).toEqual([90, 90, 90, 255]);
    expect(at(40, 10)).toEqual([0, 200, 0, 255]);
    expect(at(5, 10)).toEqual([0, 0, 200, 255]);
    expect(at(40, 40)).toEqual([255, 255, 255, 255]);
    expect(badgePath({ textures: 'textures' } as never, 5)).toContain('diamond.png');
    expect(geoBoneNames(geo)).toContain('hat');
  });

  it('pastes the sulfur cube’s outer and inner pictures into one sheet by their rectangles', async () => {
    const geo = scaleBody(await loadBody('sulfur_cube'), sulfurCubeScale(2));
    expect(geoTextureSize(geo)).toEqual({ width: 128, height: 128 });
    const outer = png(128, 128, (x, y) => (x < 72 && y < 36 ? [250, 200, 0, 255] : [0, 0, 0, 0]));
    const inner = png(128, 128, (x, y) =>
      x < 64 && y >= 36 && y < 68 ? [40, 160, 40, 255] : [9, 9, 9, 255],
    );
    const sheet = composeSheet(
      geo,
      [
        { path: 'o', label: 'Outer', rect: [0, 0, 72, 36] },
        { path: 'i', label: 'Inner', rect: [0, 36, 64, 68] },
      ],
      [outer, inner],
    );
    const at = (x: number, y: number) => texelAt(sheet?.data as Uint8ClampedArray, 128, x, y);
    expect(at(10, 10)).toEqual([250, 200, 0, 255]);
    expect(at(10, 50)).toEqual([40, 160, 40, 255]);
    // The inner picture's texels outside its rectangle are not pasted.
    expect(at(100, 100)).toEqual([0, 0, 0, 0]);
  });
});

// The four sound variants -------------------------------------------------------------------------

const SOUND_VARIANTS: readonly { kind: string; adult: Record<string, Json>; sounds: number }[] = [
  {
    kind: 'minecraft:cat_sound_variant',
    adult: {
      ambient_sound: 'demo:cat.ambient',
      hiss_sound: { sound_id: 'demo:cat.hiss', range: 8 },
      purr_sound: 'minecraft:entity.cat.purr',
    },
    sounds: 3,
  },
  {
    kind: 'minecraft:pig_sound_variant',
    adult: { ambient_sound: 'demo:pig.oink', eat_sound: 'demo:pig.eat' },
    sounds: 2,
  },
  { kind: 'minecraft:cow_sound_variant', adult: { ambient_sound: 'demo:cow.moo' }, sounds: 1 },
  {
    kind: 'minecraft:chicken_sound_variant',
    adult: { step_sound: 'demo:chicken.step' },
    sounds: 1,
  },
];

describe('the four sound variant views', () => {
  it('reads each set of sounds with its words', () => {
    expect(soundFieldWords('beg_for_food_sound')).toBe('Beg for food');
    expect(variantSounds({ hiss_sound: { sound_id: 'a:b', range: 8 }, x_sound: '' })).toEqual([
      { field: 'hiss_sound', words: 'Hiss', event: 'a:b', range: 8 },
      { field: 'x_sound', words: 'X' },
    ]);
  });

  it.each(SOUND_VARIANTS)('$kind has a Play button per sound, and plays one', async (variant) => {
    const View = await viewOf(variant.kind);
    const subject = element('demo:voice', variant.kind, {
      adult_sounds: variant.adult,
      baby_sounds: { ambient_sound: 'demo:baby.ambient' },
    });
    const project = projectOf([
      subject,
      element('demo:sounds', 'minecraft:sounds', {
        ...Object.fromEntries(
          Object.values(variant.adult)
            .map((value) =>
              typeof value === 'string' ? value : String((value as { sound_id: string }).sound_id),
            )
            .filter((id) => id.startsWith('demo:'))
            .map((id) => [id.slice(5), { sounds: [`demo:${id.slice(5).replace(/\./g, '_')}`] }]),
        ),
        'baby.ambient': { sounds: ['demo:baby_ambient'] },
      }),
    ]);
    const fake = fakePlayer();
    const vanilla = fakeVanilla({ 'entity.cat.purr': { sounds: ['mob/cat/purr1'] } });
    const readProjectAsset = async (namespace: string, path: string) =>
      new Uint8Array([79, 103, 103, 83, ...new TextEncoder().encode(`${namespace}:${path}`)]);
    render(
      <SoundHarness player={fake.player} sources={{ project, sounds: vanilla, readProjectAsset }}>
        <View
          {...propsOf(project, subject, null, {
            sounds: vanilla,
            readProject: async (path) => new TextEncoder().encode(path),
          })}
        />
      </SoundHarness>,
    );
    await screen.findByTestId('sound-variant-words');
    const rows = screen.getAllByTestId('sound-variant-sound');
    expect(rows).toHaveLength(variant.sounds + 1);
    for (const [field, value] of Object.entries(variant.adult)) {
      const button = screen.getByTestId(`sound-variant-play-adult_sounds-${field}`);
      expect(button.getAttribute('data-testid')).toContain(field);
      void value;
    }
    const first = Object.keys(variant.adult)[0] as string;
    await act(async () => {
      fireEvent.click(screen.getByTestId(`sound-variant-play-adult_sounds-${first}`));
    });
    await waitFor(() => expect(fake.played).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId('sound-variant-picked').textContent).toContain('played'),
    );
  });

  it('names a range and follows an edit at once', async () => {
    const View = await viewOf('minecraft:cat_sound_variant');
    const first = element('demo:voice', 'minecraft:cat_sound_variant', {
      adult_sounds: { hiss_sound: { sound_id: 'demo:cat.hiss', range: 8 } },
    });
    const view = render(<View {...propsOf(projectOf([first]), first, null)} />);
    expect((await screen.findAllByTestId('sound-variant-sound'))[0]?.textContent).toContain(
      'heard 8 blocks away',
    );
    const next = element('demo:voice', 'minecraft:cat_sound_variant', {
      adult_sounds: { hiss_sound: 'demo:cat.hiss', purr_sound: 'demo:cat.purr' },
    });
    view.rerender(<View {...propsOf(projectOf([next]), next, null)} />);
    expect(screen.getAllByTestId('sound-variant-sound')).toHaveLength(2);
  });
});

// The sulfur cube ---------------------------------------------------------------------------------

const BOUNCY: Json = {
  attribute_modifiers: [
    { amount: 0.9, attribute: 'minecraft:bounciness', id: 'x:a', operation: 'add_value' },
    {
      amount: -0.7,
      attribute: 'minecraft:friction_modifier',
      id: 'x:b',
      operation: 'add_multiplied_total',
    },
  ],
  buoyant: true,
  items: '#minecraft:sulfur_cube_archetype/bouncy',
  knockback_modifiers: { horizontal_power: 0.4125, vertical_power: 0.105 },
  sound_settings: {
    hit_sound: 'demo:cube.hit',
    push_sound: 'minecraft:entity.sulfur_cube.bouncy.push',
    push_sound_cooldown: 0.7,
    push_sound_impulse_threshold: 0.3,
  },
};

describe('the sulfur cube archetype view', () => {
  it('works out its attributes and the path of a hit', () => {
    expect(attributeValue(BOUNCY, 'bounciness', 0)).toBeCloseTo(0.9);
    expect(attributeValue(BOUNCY, 'friction_modifier', 1)).toBeCloseTo(0.3);
    const bouncy = bouncePath(bounceNumbers(BOUNCY));
    const flat = bouncePath(
      bounceNumbers({ knockback_modifiers: { horizontal_power: 0.4125, vertical_power: 0.105 } }),
    );
    expect(bounceCount(bouncy)).toBeGreaterThan(0);
    expect(bounceCount(flat)).toBe(0);
    // Less ground friction slides further.
    expect(bouncy[bouncy.length - 1]?.x ?? 0).toBeGreaterThan(flat[flat.length - 1]?.x ?? 0);
    expect(cubeFacts(projectOf([]), BOUNCY)).toEqual([
      'Takes this shape when fed an item of the group Bouncy.',
      'Floats in water.',
    ]);
  });

  it('draws the cube, its bounce and its sounds, and follows a size and an edit', async () => {
    const View = await viewOf('minecraft:sulfur_cube_archetype');
    const subject = element('demo:bouncy', 'minecraft:sulfur_cube_archetype', BOUNCY);
    const assets = jar({
      'assets/minecraft/textures/entity/sulfur_cube/sulfur_cube_outer.png': PICTURE,
      'assets/minecraft/textures/entity/sulfur_cube/sulfur_cube_inner.png': PICTURE,
    });
    const view = render(<View {...propsOf(projectOf([subject]), subject, assets)} />);
    await waitFor(() =>
      expect(screen.getByTestId('sulfur-cube-body').getAttribute('data-layers')).toBe(
        'assets/minecraft/textures/entity/sulfur_cube/sulfur_cube_outer.png|assets/minecraft/textures/entity/sulfur_cube/sulfur_cube_inner.png',
      ),
    );
    expect(
      Number(screen.getByTestId('sulfur-cube-bounce').getAttribute('data-bounces')),
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('sulfur-cube-play-hit_sound')).toBeTruthy();
    expect(screen.getByTestId('sulfur-cube-play-push_sound')).toBeTruthy();
    expect(screen.getByTestId('sulfur-cube-words').textContent).toContain('Floats in water.');
    fireEvent.click(screen.getByTestId('sulfur-cube-size-0'));
    expect(screen.getByText(/smaller pictures at the smallest size/)).toBeTruthy();
    const heavy = element('demo:bouncy', 'minecraft:sulfur_cube_archetype', {
      ...(BOUNCY as Record<string, Json>),
      attribute_modifiers: [],
      buoyant: false,
    });
    view.rerender(<View {...propsOf(projectOf([heavy]), heavy, assets)} />);
    await waitFor(() =>
      expect(screen.getByTestId('sulfur-cube-bounce').getAttribute('data-bounces')).toBe('0'),
    );
    expect(screen.getByTestId('sulfur-cube-words').textContent).not.toContain('Floats');
  });
});

// The villager ------------------------------------------------------------------------------------

describe('the villager look and job', () => {
  const look = element('demo:blossom', 'msm:villager_type', {
    biomes: ['minecraft:cherry_grove'],
    textures: { villager: 'demo:entity/villager/type/blossom' },
  });
  const job = element('demo:tinker', 'msm:villager_profession', {
    display_name: 'Tinker',
    textures: { villager: 'demo:entity/villager/profession/tinker' },
  });
  const readProject = async (path: string) => (path.startsWith('assets/demo/') ? PICTURE : null);
  const assets = () => jar({ 'assets/minecraft/textures/entity/villager/villager.png': PICTURE });

  it('dresses a villager in the look, then a job at a level, with no ids in the words', async () => {
    const project = projectOf([look, job]);
    render(
      <VillagerTypeLookFrame
        project={project}
        element={look}
        vanillaAssets={assets()}
        readProject={readProject}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('villager-type-look-body').getAttribute('data-layers')).toBe(
        'assets/minecraft/textures/entity/villager/villager.png|assets/demo/textures/entity/villager/type/blossom.png',
      ),
    );
    expect(screen.getByTestId('villager-type-look-words').textContent).toBe(
      'Blossom: the look’s clothes on a villager.',
    );
    fireEvent.change(screen.getByTestId('villager-type-look-job'), {
      target: { value: 'demo:tinker' },
    });
    fireEvent.click(screen.getByTestId('villager-type-look-level-4'));
    await waitFor(() =>
      expect(screen.getByTestId('villager-type-look-body').getAttribute('data-paths')).toBe(
        [
          'assets/minecraft/textures/entity/villager/villager.png',
          'assets/demo/textures/entity/villager/type/blossom.png',
          'assets/demo/textures/entity/villager/profession/tinker.png',
          'assets/minecraft/textures/entity/villager/profession_level/emerald.png',
        ].join('|'),
      ),
    );
    expect(screen.getByTestId('villager-type-look-words').textContent).toContain('Tinker job');
    // No id is drawn as text: options and words are names.
    const text = screen.getByTestId('live-view').textContent ?? '';
    expect(text).not.toMatch(/demo:|minecraft:/);
  });

  it('says when the look has no picture yet', async () => {
    const bare = element('demo:bare', 'msm:villager_type', { biomes: [] });
    render(
      <VillagerTypeLookFrame project={projectOf([bare])} element={bare} vanillaAssets={assets()} />,
    );
    expect((await screen.findByTestId('villager-type-look-words')).textContent).toContain(
      'no picture yet',
    );
  });

  it('draws a job over plains at each level badge, and over a project look', async () => {
    const project = projectOf([look, job]);
    render(
      <ProfessionLookFrame
        project={project}
        element={job}
        vanillaAssets={assets()}
        readProject={readProject}
      />,
    );
    const paths = () => screen.getByTestId('profession-look-body').getAttribute('data-paths');
    await waitFor(() =>
      expect(paths()).toBe(
        [
          'assets/minecraft/textures/entity/villager/villager.png',
          'assets/minecraft/textures/entity/villager/type/plains.png',
          'assets/demo/textures/entity/villager/profession/tinker.png',
          'assets/minecraft/textures/entity/villager/profession_level/stone.png',
        ].join('|'),
      ),
    );
    fireEvent.click(screen.getByTestId('profession-look-level-5'));
    await waitFor(() => expect(paths()).toContain('profession_level/diamond.png'));
    expect(screen.getByTestId('profession-look-words').textContent).toContain('Master');
    fireEvent.change(screen.getByTestId('profession-look-type'), {
      target: { value: 'demo:blossom' },
    });
    await waitFor(() =>
      expect(paths()).toContain('assets/demo/textures/entity/villager/type/blossom.png'),
    );
    const text = screen.getByTestId('live-view').textContent ?? '';
    expect(text).not.toMatch(/demo:|minecraft:/);
  });

  it('keeps the trades under the job’s look in the registry’s view', async () => {
    const View = await viewOf('msm:villager_profession');
    const project = projectOf([look, job]);
    render(<View {...propsOf(project, job, assets(), { readProject })} />);
    expect(await screen.findByTestId('profession-look-words')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Reading the trades…')).toBeNull(), {
      timeout: 4000,
    });
  });
});
