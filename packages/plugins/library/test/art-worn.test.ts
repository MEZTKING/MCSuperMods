/**
 * Tests for the worn, mob, icon and particle pictures drawn in B494 (ADR 0092 D7, D8, D13):
 * the armour and body armour layers cover exactly their placeholders' regions, the effect icon
 * and the particles follow the pixel rules over the property test's colours, seeds, finishes
 * and details, box skins shade their faces as D8 says in every coat, `boxesOfGeoModel` reads
 * box-UV models and refuses per-face ones, the even coat fills any size, every placeholder
 * pattern is now drawn, and each drawing equals its golden PNG in `fixtures/art/worn/`
 * (`UPDATE_GOLDENS=1`). Every picture here is MSM's own, made in code; no Minecraft texture is
 * read or stored.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { rgbToOklab } from '../src/art/colour';
import { boxSkinPixels } from '../src/assets/png';
import { bipedGeometry, cubeCreatureGeometry } from '../src/content/entities';
import {
  ART_COAT_LABELS,
  ART_COATS,
  ART_RECIPE_INFO,
  type ArtCoat,
  type ArtDetail,
  type ArtLook,
  type ArtRecipeId,
  type ArtRecipeInfo,
  artFramePngs,
  artLookPng,
  artPixels,
  artPng,
  artRecipeInfo,
  boxesOfGeoModel,
  boxFaces,
  boxSkinArtPixels,
  boxSkinArtPng,
  boxSkinPng,
  checkArtRules,
  DEFAULT_COLOUR,
  evenCoatArtPixels,
  evenCoatArtPng,
  HUMANOID_SKIN_BOXES,
  mobSkinPng,
  PATTERN_RECIPES,
  PLACEHOLDER_PATTERNS,
  type PlaceholderPattern,
  placeholderPixels,
  placeholderPng,
  type Rgb,
  type SkinBox,
} from '../src/index';

// Heavy property tests (B539, plan "Watch" under B537): each draws a recipe at 12 colours, 4 seeds,
// every finish and 3 details (hundreds of pictures, the boat bodies 128 pixels wide), which takes
// a few seconds alone and more than vitest's 5 s default when every package's tests run at once.
const HEAVY_TIMEOUT = 60_000;

const here = dirname(fileURLToPath(import.meta.url));
const goldens = join(here, 'fixtures', 'art', 'worn');
const update = process.env.UPDATE_GOLDENS === '1';
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(0, 2), 16),
  Number.parseInt(value.slice(2, 4), 16),
  Number.parseInt(value.slice(4, 6), 16),
];

/** The property test's colours (as in `art.test.ts`): the ten theme colours, grey, near-white. */
const TEST_COLOURS: readonly Rgb[] = [
  'c41c34',
  '8fd3ff',
  'e8641c',
  '4c8a2c',
  '5ab4f0',
  '5a2a8a',
  'f0c020',
  'ff7f6a',
  'de9420',
  '606878',
  '808080',
  'f0f0f0',
].map(hex);
const SEEDS = [0, 1, 2, 3] as const;
const DETAILS: readonly ArtDetail[] = ['smooth', 'normal', 'rough'];

/** The recipes B494 draws. */
const B494: readonly ArtRecipeId[] = [
  'armor_layer_1',
  'armor_layer_2',
  'horse_armor_layer',
  'wolf_armor_layer',
  'effect_icon',
  'particle_spark',
  'particle_orb',
  'particle_puff',
  'particle_leaf',
];
const owned = B494.map((id) => artRecipeInfo(id));

const finishesOf = (info: ArtRecipeInfo): readonly (string | undefined)[] =>
  info.finishes.length > 0 ? info.finishes : [undefined];

function* looks(info: ArtRecipeInfo): Generator<ArtLook> {
  for (const colour of TEST_COLOURS) {
    for (const finish of finishesOf(info)) {
      for (const detail of DETAILS) {
        for (const seed of SEEDS) yield { recipe: info.id, colour, finish, detail, seed };
      }
    }
  }
}

const alphaOf = (data: Uint8Array): number[] => {
  const out: number[] = [];
  for (let i = 3; i < data.length; i += 4) out.push(data[i] ?? 0);
  return out;
};

const writeGolden = (name: string, png: Uint8Array): void => {
  const file = join(goldens, `${name}.png`);
  if (update) {
    mkdirSync(goldens, { recursive: true });
    writeFileSync(file, png);
  }
  expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png)), name).toBe(true);
};

/** The rules a box skin is checked against: an entity picture of the texture's size. */
const skinInfo = (width: number, height: number) => ({
  id: 'armor_layer_1' as const,
  kind: 'entity' as const,
  width,
  height,
  frames: 1,
  tiles: false,
  outline: false,
});

/** The entity rows of the pattern pictures (B508), tested in `art-patterns.test.ts`. */
const PATTERN_PICTURES: readonly ArtRecipeId[] = [
  'banner_pattern',
  'shield_pattern',
  'trim_layer_1',
  'trim_layer_2',
  'glider_wings',
  'pot_pattern',
  // The boat bodies and villager clothes of B539 (`art-boats-villagers.test.ts`).
  'boat_layer',
  'chest_boat_layer',
  'villager_robe',
];

describe('every recipe and pattern is drawn (B494)', () => {
  it('has no worn, icon or particle row left as a stub', () => {
    // The pattern pictures of B508 are entity rows of their own (`art-patterns.test.ts`).
    const rows = ART_RECIPE_INFO.filter(
      (info) =>
        ['entity', 'icon', 'particle'].includes(info.kind) && !PATTERN_PICTURES.includes(info.id),
    );
    expect(rows.map((info) => info.id)).toEqual([...B494]);
    expect(rows.filter((info) => !info.drawn)).toEqual([]);
  });

  // The coverage test of ADR 0092 D13 (e): no pattern this brief owns falls back, and with
  // B492 (blocks) and B493 (items) every one of the 70 patterns is drawn. Item patterns are
  // B493's; this test names the ones still on the fallback so the last merge shows none.
  it('leaves no worn, icon or particle pattern on the placeholder fallback', () => {
    const mine = PLACEHOLDER_PATTERNS.filter((pattern) => B494.includes(PATTERN_RECIPES[pattern]));
    expect(mine).toHaveLength(9);
    for (const pattern of mine) {
      for (const frame of [0, 1, 2, 3]) {
        expect(sha256(artPng(pattern, { frame })), pattern).not.toBe(
          sha256(placeholderPng(pattern, { frame })),
        );
      }
    }
    const fallback = PLACEHOLDER_PATTERNS.filter(
      (pattern) => !artRecipeInfo(PATTERN_RECIPES[pattern]).drawn,
    );
    for (const pattern of fallback) {
      expect(artRecipeInfo(PATTERN_RECIPES[pattern]).kind, pattern).toBe('item');
    }
  });
});

describe.each(owned)('the recipe $id (ADR 0092 D8)', (info) => {
  it('follows every pixel rule over 12 colours, 4 seeds, every finish and detail', {
    timeout: HEAVY_TIMEOUT,
  }, () => {
    for (const look of looks(info)) {
      expect(checkArtRules(artPixels(look), info), JSON.stringify(look)).toEqual([]);
    }
  });

  it('gives other bytes for other seeds', () => {
    for (const look of looks(info)) {
      if (look.seed !== 0) continue;
      const bySeed = SEEDS.map((seed) => sha256(artLookPng({ ...look, seed })));
      expect(new Set(bySeed).size, JSON.stringify(look)).toBe(SEEDS.length);
    }
  });

  it.each(finishesOf(info))('equals its golden PNG (finish %s)', (finish) => {
    const png = artLookPng({ recipe: info.id, colour: DEFAULT_COLOUR, finish, seed: 0 });
    writeGolden(`${info.id}${finish === undefined ? '' : `-${finish}`}`, png);
  });
});

describe('worn layers', () => {
  const worn: readonly PlaceholderPattern[] = [
    'armor_layer_1',
    'armor_layer_2',
    'horse_armor_layer',
    'wolf_armor_layer',
  ];

  it.each(worn)('%s fills exactly the regions of its placeholder', (pattern) => {
    const placeholder = alphaOf(placeholderPixels(pattern)).map((a) => (a > 0 ? 1 : 0));
    for (const colour of TEST_COLOURS.slice(0, 4)) {
      for (const seed of SEEDS) {
        const drawn = alphaOf(artPixels({ recipe: PATTERN_RECIPES[pattern], colour, seed }).data);
        expect(drawn.map((a) => (a > 0 ? 1 : 0))).toEqual(placeholder);
        expect(new Set(drawn.filter((a) => a > 0))).toEqual(new Set([255]));
      }
    }
  });

  it('draws the helmet with a dark visor slit above the face opening', () => {
    const { data } = artPixels({ recipe: 'armor_layer_1', colour: DEFAULT_COLOUR, seed: 0 });
    const l = (x: number, y: number): number => {
      const i = (y * 64 + x) * 4;
      return rgbToOklab([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0])[0];
    };
    // The head's front face is 8..15 across and 8..15 down; the slit is its third row.
    for (let x = 9; x <= 14; x += 1) {
      expect(l(x, 10)).toBeLessThan(l(x, 9));
      expect(l(x, 10)).toBeLessThan(l(9, 12));
    }
  });
});

describe('the effect icon and the particles', () => {
  it('gives each finish of the effect icon its own symbol', () => {
    const shapes = artRecipeInfo('effect_icon').finishes.map((finish) =>
      sha256(artLookPng({ recipe: 'effect_icon', colour: DEFAULT_COLOUR, finish, seed: 0 })),
    );
    expect(new Set(shapes).size).toBe(5);
  });

  it('draws round badges, clear in the corners', () => {
    const { data } = artPixels({ recipe: 'effect_icon', colour: DEFAULT_COLOUR });
    const alpha = alphaOf(data);
    for (const [x, y] of [
      [0, 0],
      [17, 0],
      [0, 17],
      [17, 17],
    ] as const) {
      expect(alpha[y * 18 + x]).toBe(0);
    }
    expect(alpha[9 * 18 + 9]).toBe(255);
  });

  it.each(['particle_spark', 'particle_orb', 'particle_puff', 'particle_leaf'] as const)(
    '%s changes from frame to frame and uses only the fixed alpha levels',
    (recipe) => {
      for (const seed of SEEDS) {
        const frames = artFramePngs({ recipe, colour: DEFAULT_COLOUR, seed });
        expect(frames).toHaveLength(4);
        expect(new Set(frames.map(sha256)).size).toBeGreaterThanOrEqual(3);
        const used = new Set(alphaOf(artPixels({ recipe, colour: DEFAULT_COLOUR, seed }).data));
        for (const alpha of used) expect([0, 85, 170, 255]).toContain(alpha);
      }
    },
  );

  it('thins the puff out over its frames', () => {
    const { data } = artPixels({ recipe: 'particle_puff', colour: DEFAULT_COLOUR, seed: 1 });
    const cover = [0, 1, 2, 3].map((frame) =>
      alphaOf(data.subarray(frame * 256, (frame + 1) * 256)).reduce((sum, a) => sum + a, 0),
    );
    for (let f = 1; f < 4; f += 1) expect(cover[f] ?? 0).toBeLessThan(cover[f - 1] ?? 0);
  });

  it('draws the frames artPng asks for', () => {
    for (const frame of [0, 1, 2, 3]) {
      const look = { recipe: 'particle_orb' as const, colour: DEFAULT_COLOUR, seed: 0 };
      expect(sha256(artPng('particle_orb', { frame }))).toBe(
        sha256(artFramePngs(look)[frame] as Uint8Array),
      );
    }
  });
});

/** The mean OKLab lightness of the pixels of a face. */
function faceLightness(
  data: Uint8Array,
  width: number,
  face: { x: number; y: number; w: number; h: number },
): number {
  let sum = 0;
  let count = 0;
  for (let y = face.y; y < face.y + face.h; y += 1) {
    for (let x = face.x; x < face.x + face.w; x += 1) {
      const i = (y * width + x) * 4;
      sum += rgbToOklab([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0])[0];
      count += 1;
    }
  }
  return sum / count;
}

describe('box skins (ADR 0092 D7, D8)', () => {
  /** A two-box model: a body and a head with a face. */
  const TWO_BOXES: readonly SkinBox[] = [
    { u: 0, v: 0, w: 12, h: 10, d: 8 },
    { u: 0, v: 20, w: 8, h: 8, d: 8, role: 'face' },
  ];

  it.each([...ART_COATS])(
    'shades the top lighter and the bottom and sides darker than the front (%s)',
    (coat) => {
      for (const colour of TEST_COLOURS) {
        for (const seed of SEEDS) {
          const data = boxSkinArtPixels(TWO_BOXES, 64, 64, { colour, coat, seed });
          for (const box of TWO_BOXES) {
            const faces = Object.fromEntries(
              boxFaces(box).map((face) => [face.side, faceLightness(data, 64, face)]),
            ) as Record<string, number>;
            const front = faces.front ?? 0;
            const label = `${coat} ${colour.join(',')} ${seed}`;
            expect(faces.top, label).toBeGreaterThan(front);
            expect(faces.bottom, label).toBeLessThan(front);
            expect(faces.east, label).toBeLessThan(front);
            expect(faces.west, label).toBeLessThan(front);
          }
        }
      }
    },
  );

  it.each([...ART_COATS])('follows the pixel rules in every coat and detail (%s)', (coat) => {
    for (const colour of TEST_COLOURS) {
      for (const detail of DETAILS) {
        for (const seed of SEEDS) {
          for (const accent of [undefined, hex('f0e0b0')]) {
            const data = boxSkinArtPixels(HUMANOID_SKIN_BOXES, 64, 64, {
              colour,
              coat,
              detail,
              seed,
              accent,
            });
            expect(
              checkArtRules({ width: 64, height: 64, data }, skinInfo(64, 64)),
              `${coat} ${colour.join(',')} ${detail} ${seed} ${accent}`,
            ).toEqual([]);
          }
        }
      }
    }
  });

  it('gives each coat its own look, other bytes for other seeds and the same for the same', () => {
    const png = (coat: ArtCoat, seed: number) =>
      sha256(boxSkinArtPng(HUMANOID_SKIN_BOXES, 64, 64, { colour: DEFAULT_COLOUR, coat, seed }));
    expect(new Set(ART_COATS.map((coat) => png(coat, 0))).size).toBe(5);
    for (const coat of ART_COATS) {
      expect(new Set(SEEDS.map((seed) => png(coat, seed))).size, coat).toBe(4);
      expect(png(coat, 2)).toBe(png(coat, 2));
    }
    expect(Object.keys(ART_COAT_LABELS)).toEqual([...ART_COATS]);
  });

  it('is no longer the placeholder box skin and keeps its faces where the placeholder has them', () => {
    const look = { colour: [40, 150, 150] as Rgb, coat: 'fur' as const };
    expect(sha256(boxSkinArtPng(HUMANOID_SKIN_BOXES, 64, 64, look))).not.toBe(
      sha256(boxSkinPng([...HUMANOID_SKIN_BOXES], 64, 64, { colour: [40, 150, 150] })),
    );
    const ours = alphaOf(boxSkinArtPixels(HUMANOID_SKIN_BOXES, 64, 64, look));
    const placeholder = alphaOf(boxSkinPixels([...HUMANOID_SKIN_BOXES], 64, 64));
    expect(ours).toEqual(placeholder);
  });

  it('draws eyes on face and side_face boxes and the saddle in leather', () => {
    const plain = boxSkinArtPixels([{ u: 0, v: 0, w: 8, h: 8, d: 8 }], 64, 32, {
      colour: DEFAULT_COLOUR,
      coat: 'smooth',
    });
    const face = boxSkinArtPixels([{ u: 0, v: 0, w: 8, h: 8, d: 8, role: 'face' }], 64, 32, {
      colour: DEFAULT_COLOUR,
      coat: 'smooth',
    });
    const side = boxSkinArtPixels([{ u: 0, v: 0, w: 8, h: 8, d: 8, role: 'side_face' }], 64, 32, {
      colour: DEFAULT_COLOUR,
      coat: 'smooth',
    });
    const differ = (a: Uint8Array, b: Uint8Array): number[] => {
      const out: number[] = [];
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) out.push(i / 4);
      }
      return out;
    };
    // Two eyes and their glints on the front face (8..15, 8..15), row 10.
    expect(differ(plain, face).map((i) => [i % 64, Math.floor(i / 64)])).toEqual([
      [10, 10],
      [11, 10],
      [12, 10],
      [13, 10],
    ]);
    // One eye on each side face, beside the front.
    expect(differ(plain, side).map((i) => [i % 64, Math.floor(i / 64)])).toEqual([
      [6, 10],
      [17, 10],
    ]);
    const saddle = boxSkinArtPixels([{ u: 0, v: 0, w: 8, h: 8, d: 8, role: 'saddle' }], 64, 32, {
      colour: [40, 150, 150],
      coat: 'fur',
    });
    const blue = boxSkinArtPixels([{ u: 0, v: 0, w: 8, h: 8, d: 8, role: 'saddle' }], 64, 32, {
      colour: [60, 60, 200],
      coat: 'fur',
    });
    expect(sha256(saddle)).toBe(sha256(blue));
  });

  it('puts the second colour on the belly', () => {
    const box: SkinBox = { u: 0, v: 0, w: 8, h: 8, d: 8 };
    const without = boxSkinArtPixels([box], 64, 32, { colour: DEFAULT_COLOUR, coat: 'smooth' });
    const withBelly = boxSkinArtPixels([box], 64, 32, {
      colour: DEFAULT_COLOUR,
      coat: 'smooth',
      accent: [240, 224, 176],
    });
    const bottom = boxFaces(box).find((face) => face.side === 'bottom') as {
      x: number;
      y: number;
      w: number;
      h: number;
    };
    expect(faceLightness(withBelly, 64, bottom)).toBeGreaterThan(
      faceLightness(without, 64, bottom) + 0.1,
    );
  });

  it('equals its goldens (the humanoid in each coat)', () => {
    for (const coat of ART_COATS) {
      writeGolden(
        `box-skin-${coat}`,
        boxSkinArtPng(HUMANOID_SKIN_BOXES, 64, 64, { colour: DEFAULT_COLOUR, coat, seed: 0 }),
      );
    }
  });
});

describe('the even coat (plan limit A3)', () => {
  it.each([
    [64, 32],
    [64, 64],
    [128, 64],
  ])('fills %i by %i, opaque, in every coat', (width, height) => {
    for (const coat of ART_COATS) {
      for (const colour of TEST_COLOURS) {
        const data = evenCoatArtPixels(width, height, { colour, coat, seed: 1 });
        expect(data.length).toBe(width * height * 4);
        expect(new Set(alphaOf(data))).toEqual(new Set([255]));
        expect(
          checkArtRules({ width, height, data }, skinInfo(width, height)),
          `${coat} ${colour.join(',')}`,
        ).toEqual([]);
      }
    }
  });

  it('is not the placeholder checker and varies with the seed', () => {
    const look = { colour: DEFAULT_COLOUR, coat: 'fur' as const };
    expect(sha256(evenCoatArtPng(64, 32, look))).not.toBe(
      sha256(mobSkinPng(64, 32, { colour: DEFAULT_COLOUR })),
    );
    expect(sha256(evenCoatArtPng(64, 32, { ...look, seed: 1 }))).not.toBe(
      sha256(evenCoatArtPng(64, 32, look)),
    );
    writeGolden('even-coat-fur', evenCoatArtPng(64, 32, { ...look, seed: 0 }));
  });
});

describe('boxesOfGeoModel', () => {
  it('reads the Custom mob model as HUMANOID_SKIN_BOXES, the head as the face', () => {
    expect(boxesOfGeoModel(bipedGeometry('custom_mob'))).toEqual([...HUMANOID_SKIN_BOXES]);
    expect(HUMANOID_SKIN_BOXES).toEqual([
      { u: 16, v: 16, w: 8, h: 12, d: 4, role: 'plain' },
      { u: 0, v: 0, w: 8, h: 8, d: 8, role: 'face' },
      { u: 40, v: 16, w: 4, h: 12, d: 4, role: 'plain' },
      { u: 32, v: 48, w: 4, h: 12, d: 4, role: 'plain' },
      { u: 0, v: 16, w: 4, h: 12, d: 4, role: 'plain' },
      { u: 16, v: 48, w: 4, h: 12, d: 4, role: 'plain' },
    ]);
    expect(Object.isFrozen(HUMANOID_SKIN_BOXES)).toBe(true);
  });

  it('reads overlay cubes, other models, saddles and the old geometry form', () => {
    const overlay = boxesOfGeoModel(bipedGeometry('x', { overlay: true })) ?? [];
    expect(overlay).toHaveLength(12);
    expect(overlay.filter((box) => box.role === 'face')).toEqual([
      { u: 0, v: 0, w: 8, h: 8, d: 8, role: 'face' },
    ]);
    expect(boxesOfGeoModel(cubeCreatureGeometry('cube'))).toEqual([
      { u: 0, v: 0, w: 12, h: 10, d: 16, role: 'plain' },
      { u: 0, v: 26, w: 8, h: 8, d: 8, role: 'face' },
    ]);
    const old: JsonObject = {
      format_version: '1.8.0',
      'geometry.pig': {
        texturewidth: 64,
        bones: [
          { name: 'body', cubes: [{ origin: [0, 0, 0], size: [10, 16, 8.5], uv: [28, 8] }] },
          { name: 'saddle_strap', cubes: [{ size: [4, 2, 1], uv: [0, 40] }] },
          { name: 'empty' },
        ],
      },
    };
    expect(boxesOfGeoModel(old)).toEqual([
      { u: 28, v: 8, w: 10, h: 16, d: 8, role: 'plain' },
      { u: 0, v: 40, w: 4, h: 2, d: 1, role: 'saddle' },
    ]);
  });

  it('gives null for a model that maps faces one by one, or for no geometry', () => {
    const perFace: JsonObject = {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: { identifier: 'geometry.lamp', texture_width: 16, texture_height: 16 },
          bones: [
            { name: 'base', cubes: [{ origin: [0, 0, 0], size: [4, 4, 4], uv: [0, 0] }] },
            {
              name: 'shade',
              cubes: [
                {
                  origin: [0, 4, 0],
                  size: [4, 4, 4],
                  uv: {
                    north: { uv: [0, 0], uv_size: [4, 4] },
                    south: { uv: [4, 0], uv_size: [4, 4] },
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(boxesOfGeoModel(perFace)).toBeNull();
    expect(boxesOfGeoModel({})).toBeNull();
    expect(boxesOfGeoModel({ 'minecraft:geometry': [] })).toBeNull();
    expect(boxesOfGeoModel({ 'minecraft:geometry': [{ description: {}, bones: [] }] })).toEqual([]);
  });
});
