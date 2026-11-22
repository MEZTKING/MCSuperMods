/**
 * Tests for the boat and villager look recipes of vanilla parity 3 batch 2 (B539, ADR 0092 D7,
 * D8, D13; ADR 0110, ADR 0107 D5): the boat item is a drawn item with its chest finish, the boat
 * bodies are the sizes the game reads and opaque edge to edge (every face of the model shows
 * boards, wherever it lies), the villager clothes paint only the body and coat faces of the
 * villager layout and take the second colour for the hem, and each finish equals its golden PNG
 * in `fixtures/art/looks/` (`UPDATE_GOLDENS=1`). The pixel rules over every colour, seed,
 * finish and detail run for every drawn recipe in `art.test.ts`. Every picture here is MSM's
 * own, made in code; no Minecraft texture is read or stored.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ART_RECIPE_INFO,
  type ArtRecipeId,
  artLookPng,
  artPixels,
  artRecipeInfo,
  checkArtRules,
  DEFAULT_COLOUR,
  type Rgb,
} from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const goldens = join(here, 'fixtures', 'art', 'looks');
const update = process.env.UPDATE_GOLDENS === '1';

/** The recipes B539 adds, in table order. */
const B539: readonly ArtRecipeId[] = ['boat', 'boat_layer', 'chest_boat_layer', 'villager_robe'];

const MAPLE: Rgb = [176, 104, 64];
const TEAL: Rgb = [40, 150, 150];
const GOLD: Rgb = [220, 180, 60];

/** The alpha of every pixel of a look. */
function alphas(recipe: ArtRecipeId, finish?: string, seed = 1): number[] {
  const { data } = artPixels({ recipe, colour: MAPLE, finish, seed });
  const out: number[] = [];
  for (let i = 3; i < data.length; i += 4) out.push(data[i] ?? 0);
  return out;
}

/** Whether (x, y) lies on a face of a box-UV cube at (u, v) of w by h by d. */
function onBox(
  x: number,
  y: number,
  box: { u: number; v: number; w: number; h: number; d: number },
): boolean {
  const { u, v, w, h, d } = box;
  const topRow = y >= v && y < v + d && x >= u + d && x < u + d + 2 * w;
  const sideRow = y >= v + d && y < v + d + h && x >= u && x < u + 2 * d + 2 * w;
  return topRow || sideRow;
}

describe('the boat and villager look recipes (B539)', () => {
  it('adds a drawn item and three drawn entity rows with their sizes and finishes', () => {
    const rows = ART_RECIPE_INFO.filter((info) => B539.includes(info.id));
    expect(rows.map((info) => info.id)).toEqual([...B539]);
    for (const info of rows) expect(info.drawn, info.id).toBe(true);
    const boat = artRecipeInfo('boat');
    expect([boat.kind, boat.width, boat.height, boat.outline]).toEqual(['item', 16, 16, true]);
    expect(boat.finishes).toEqual(['boat', 'chest']);
    expect([artRecipeInfo('boat_layer').width, artRecipeInfo('boat_layer').height]).toEqual([
      128, 64,
    ]);
    expect([
      artRecipeInfo('chest_boat_layer').width,
      artRecipeInfo('chest_boat_layer').height,
    ]).toEqual([128, 128]);
    const robe = artRecipeInfo('villager_robe');
    expect([robe.kind, robe.width, robe.height, robe.colours]).toEqual(['entity', 64, 64, 2]);
    expect(robe.finishes).toEqual(['hem', 'sash']);
  });

  it('covers a boat body edge to edge, so every face shows boards', () => {
    for (const recipe of ['boat_layer', 'chest_boat_layer'] as const) {
      for (const seed of [0, 1, 2]) {
        expect(
          alphas(recipe, undefined, seed).every((value) => value === 255),
          `${recipe} ${seed}`,
        ).toBe(true);
      }
    }
  });

  it('puts a chest in the chest finish of the boat item', () => {
    const plain = alphas('boat', 'boat');
    const chest = alphas('boat', 'chest');
    const count = (values: number[]): number => values.filter((value) => value > 0).length;
    expect(count(chest)).toBeGreaterThan(count(plain));
  });

  it('paints villager clothes on the body and coat faces only, the hem in the second colour', () => {
    const body = { u: 16, v: 20, w: 8, h: 12, d: 6 };
    const coat = { u: 0, v: 38, w: 8, h: 20, d: 6 };
    for (const finish of ['hem', 'sash']) {
      const values = alphas('villager_robe', finish);
      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          const inside = onBox(x, y, body) || onBox(x, y, coat);
          expect(values[y * 64 + x] === 255, `${finish} (${x}, ${y})`).toBe(inside);
        }
      }
    }
    // The coat's front face ends in the hem: its last row changes with the second colour only.
    const at = (accent: Rgb, x: number, y: number): number[] => {
      const { data } = artPixels({ recipe: 'villager_robe', colour: TEAL, accent, seed: 2 });
      const i = (y * 64 + x) * 4;
      return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
    };
    expect(at(GOLD, 9, 63)).not.toEqual(at(MAPLE, 9, 63));
    expect(at(GOLD, 9, 50)).toEqual(at(MAPLE, 9, 50));
  });

  it('follows the pixel rules at the default colour', () => {
    for (const id of B539) {
      const info = artRecipeInfo(id);
      for (const finish of info.finishes.length > 0 ? info.finishes : [undefined]) {
        const pixels = artPixels({ recipe: id, colour: DEFAULT_COLOUR, finish, seed: 0 });
        expect(checkArtRules(pixels, info), `${id} ${finish ?? ''}`).toEqual([]);
      }
    }
  });

  const goldenCases = B539.flatMap((id) => {
    const finishes = artRecipeInfo(id).finishes;
    return (finishes.length > 0 ? finishes : [undefined]).map((finish) => [id, finish] as const);
  });
  it.each(goldenCases)('%s %s equals its golden PNG', (id, finish) => {
    const png = artLookPng({ recipe: id, colour: DEFAULT_COLOUR, finish, seed: 0 });
    const file = join(goldens, `${id}${finish === undefined ? '' : `-${finish}`}.png`);
    if (update) {
      mkdirSync(goldens, { recursive: true });
      writeFileSync(file, png);
    }
    expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png))).toBe(true);
  });
});
