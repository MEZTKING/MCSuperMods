/**
 * The pixel rules of drawn pictures (ADR 0092 D8, D13 (a)), as one check every recipe's tests
 * (and other packages' tests) run: {@link checkArtRules} gives one message per broken rule and
 * an empty list when the picture follows them all. The rules look at pixels only, never at how
 * the picture was drawn, so a picture from anywhere can be checked.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../assets/png';
import { hueDelta, packRgb, rgbToOklch } from './colour';
import type { ArtPictureKind, ArtRecipeInfo } from './info';
import { COOL_HUE, WARM_HUE } from './ramp';

/** A picture to check: `frames` pictures of `width` by `height` one after the other in `data`. */
export interface ArtRulesImage {
  readonly width: number;
  readonly height: number;
  /** Defaults to 1. */
  readonly frames?: number;
  readonly data: Uint8Array;
}

/** The most colours (not counting transparent) one frame may use, by picture kind (D8). */
export const COLOUR_CAPS: Readonly<Record<ArtPictureKind, number>> = Object.freeze({
  block: 12,
  item: 10,
  entity: 16,
  icon: 12,
  particle: 8,
});

/**
 * The see-through levels particle pictures and the portal surface may use besides fully
 * transparent; every other picture has hard alpha (0 or 255).
 */
export const ALPHA_LEVELS: readonly number[] = Object.freeze([85, 170, 255]);

/** The lightest and darkest OKLab lightness a pixel may have (no pure black or white), D8. */
export const LIGHTNESS_LIMITS = Object.freeze({ min: 0.12, max: 0.97 });

/** Rounding slack on {@link LIGHTNESS_LIMITS}: shades are rounded to bytes. */
const LIGHTNESS_SLACK = 0.005;

/**
 * How much darker the bottom-right half may be on a tiling picture. A tiling face cannot be
 * lighter on one side as a whole (it would show as stripes when tiled), so its halves differ by
 * noise and by where its features fall (an ore's veins), and the rule catches a face clearly lit
 * from the bottom right; its features are lit from the top left by their own shading.
 */
const TILING_LIGHT_SLACK = 0.08;

/** How much darker the bottom-right half may be on a particle picture (round glows). */
const PARTICLE_LIGHT_SLACK = 0.05;

/**
 * How much more a tiling picture's seam may differ than its most different inside line: the
 * seam is one line among many, so it may be the largest by chance.
 */
const SEAM_FACTOR = 1.5;
const SEAM_SLACK = 0.02;

/** The share of a block's edge pixels that, all darker than inside, would make an outline. */
const BLOCK_OUTLINE_SHARE = 0.75;

/** The most colours a block's edge may use and still be a one-colour outline. */
const BLOCK_OUTLINE_COLOURS = 2;

/** Whether a recipe's pictures may be see-through (particles and the portal surface). */
export function softAlpha(info: Pick<ArtRecipeInfo, 'id' | 'kind'>): boolean {
  return info.kind === 'particle' || info.id === 'portal';
}

/** The warmth of a hue: how much nearer it is to the warm hue than to the cool one. */
const warmth = (hue: number): number =>
  Math.abs(hueDelta(hue, COOL_HUE)) - Math.abs(hueDelta(hue, WARM_HUE));

interface Lch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

/** Below this OKLCh chroma a colour counts as grey (all greys are one material). */
const GREY_CHROMA = 0.03;

/** Colours whose hues are this close (in degrees) are shades of one material. */
const MATERIAL_HUE = 20;

/**
 * The material of each colour (by packed value): greys together, and colourful colours linked
 * to every other within {@link MATERIAL_HUE} of their hue, so a hue-shifted ramp stays one
 * material and a red head and a brown handle are two.
 */
function materialGroups(colours: readonly (readonly [number, Lch])[]): Map<number, number> {
  const parent = colours.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] as number;
    return root;
  };
  for (let i = 0; i < colours.length; i += 1) {
    for (let j = i + 1; j < colours.length; j += 1) {
      const a = (colours[i] as readonly [number, Lch])[1];
      const b = (colours[j] as readonly [number, Lch])[1];
      const greyA = a.c < GREY_CHROMA;
      const greyB = b.c < GREY_CHROMA;
      const same = greyA || greyB ? greyA && greyB : Math.abs(hueDelta(a.h, b.h)) <= MATERIAL_HUE;
      if (same) parent[find(j)] = find(i);
    }
  }
  return new Map(colours.map(([key], i) => [key, find(i)]));
}

/**
 * The rules a picture breaks, as messages (empty when it follows them all):
 * - **size**: the width, height and frame count of the recipe;
 * - **colours**: at most {@link COLOUR_CAPS} colours per frame;
 * - **alpha**: 0 or 255, or for {@link softAlpha} recipes 0 and {@link ALPHA_LEVELS};
 * - **outline**: on outlined recipes every visible pixel next to transparency (or the picture's
 *   edge) is darker than each inner pixel it touches (inner pixels of the edge's own colours,
 *   where two outlines meet, count as outline), and the inside is not all edge colours; on the
 *   others the edge is not such an
 *   outline (fewer than three in four of its pixels are darker than inside, or they use more
 *   than two colours, as a bark ring does);
 * - **lightness**: no pixel darker or lighter than {@link LIGHTNESS_LIMITS};
 * - **light**: within each material (colours grouped by hue, greys together), the top-left half
 *   is lighter on average than the bottom-right half, weighed by size and not counting an
 *   outlined picture's outline (tiling pictures and particles may be a little darker there, as
 *   noise; worn pictures are skipped, since their faces are scattered over the texture);
 * - **ramp**: where two neighbouring pixels are shades of one material (alike in hue and
 *   chroma), the darker is never warmer than the lighter;
 * - **tiling**: on tiling recipes, the wrap-around seams differ no more than the most
 *   different line inside (with a margin, as the seam may be the largest line by chance).
 *
 * @param image - The picture.
 * @param info - The recipe's row (or any row-like description of what the picture should be).
 */
export function checkArtRules(
  image: ArtRulesImage,
  info: Pick<ArtRecipeInfo, 'id' | 'kind' | 'width' | 'height' | 'frames' | 'tiles' | 'outline'>,
): string[] {
  const problems: string[] = [];
  const frames = image.frames ?? 1;
  const { width, height } = image;
  if (width !== info.width || height !== info.height || frames !== info.frames) {
    problems.push(
      `size: ${width} by ${height} in ${frames} frame(s), not ${info.width} by ${info.height} in ${info.frames}`,
    );
  }
  if (image.data.length !== width * height * 4 * frames) {
    problems.push(`size: ${image.data.length} bytes, not ${width * height * 4 * frames}`);
    return problems;
  }
  const cache = new Map<number, Lch>();
  const lchOf = (rgb: Rgb): Lch => {
    const key = packRgb(rgb);
    let value = cache.get(key);
    if (value === undefined) {
      const [l, c, h] = rgbToOklch(rgb);
      value = { l, c, h };
      cache.set(key, value);
    }
    return value;
  };
  const soft = softAlpha(info);
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = frame * width * height * 4;
    const label = frames > 1 ? ` (frame ${frame})` : '';
    const alphaAt = (x: number, y: number): number =>
      x < 0 || y < 0 || x >= width || y >= height
        ? 0
        : (image.data[offset + (y * width + x) * 4 + 3] ?? 0);
    const visible = (x: number, y: number): boolean => alphaAt(x, y) > 0;
    const rgbAt = (x: number, y: number): Rgb => {
      const i = offset + (y * width + x) * 4;
      return [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0];
    };
    const lAt = (x: number, y: number): number => lchOf(rgbAt(x, y)).l;
    const isEdge = (x: number, y: number): boolean =>
      !visible(x - 1, y) || !visible(x + 1, y) || !visible(x, y - 1) || !visible(x, y + 1);

    // Colours, alpha and lightness.
    const colours = new Set<number>();
    const alphas = new Set<number>();
    let badAlpha: number | undefined;
    let badLight: string | undefined;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = alphaAt(x, y);
        if (alpha === 0) continue;
        alphas.add(alpha);
        if (soft ? !ALPHA_LEVELS.includes(alpha) : alpha !== 255) badAlpha ??= alpha;
        const rgb = rgbAt(x, y);
        colours.add(packRgb(rgb));
        const { l } = lchOf(rgb);
        if (
          badLight === undefined &&
          (l < LIGHTNESS_LIMITS.min - LIGHTNESS_SLACK || l > LIGHTNESS_LIMITS.max + LIGHTNESS_SLACK)
        ) {
          badLight = `(${x}, ${y}) has lightness ${l.toFixed(3)}`;
        }
      }
    }
    const cap = COLOUR_CAPS[info.kind];
    if (colours.size > cap) {
      problems.push(`colours${label}: ${colours.size} colours, at most ${cap} on a ${info.kind}`);
    }
    if (badAlpha !== undefined) {
      problems.push(
        soft
          ? `alpha${label}: alpha ${badAlpha} is not one of 0, ${ALPHA_LEVELS.join(', ')}`
          : `alpha${label}: alpha ${badAlpha} is not 0 or 255`,
      );
    }
    if (badLight !== undefined) {
      problems.push(
        `lightness${label}: ${badLight}, outside ${LIGHTNESS_LIMITS.min} to ${LIGHTNESS_LIMITS.max}`,
      );
    }

    // Outline. On outlined pictures every colour of the edge is an outline colour; where two
    // outlines meet they may close a gap and enclose pixels of those colours, which count as
    // outline too, so the edge is compared with the pixels inside it of other colours.
    const edgeColours = new Set<number>();
    if (info.outline) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (visible(x, y) && isEdge(x, y)) edgeColours.add(packRgb(rgbAt(x, y)));
        }
      }
    }
    let edgesWithInside = 0;
    let darkEdges = 0;
    let insidePixels = 0;
    const darkEdgeColours = new Set<number>();
    let badOutline: string | undefined;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!visible(x, y)) continue;
        if (!isEdge(x, y)) {
          if (!edgeColours.has(packRgb(rgbAt(x, y)))) insidePixels += 1;
          continue;
        }
        const own = packRgb(rgbAt(x, y));
        const inner = (
          [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ] as const
        ).filter(
          ([nx, ny]) =>
            visible(nx, ny) && !isEdge(nx, ny) && !edgeColours.has(packRgb(rgbAt(nx, ny))),
        );
        if (inner.length === 0) continue;
        edgesWithInside += 1;
        const l = lAt(x, y);
        const darker = inner.every(([nx, ny]) => l < lAt(nx, ny));
        if (darker) {
          darkEdges += 1;
          darkEdgeColours.add(own);
        } else badOutline ??= `(${x}, ${y})`;
      }
    }
    if (info.outline && badOutline !== undefined) {
      problems.push(`outline${label}: ${badOutline} is not darker than the pixels inside it`);
    }
    if (info.outline && badOutline === undefined && insidePixels === 0 && edgeColours.size > 0) {
      let anyInside = false;
      for (let y = 0; y < height && !anyInside; y += 1) {
        for (let x = 0; x < width && !anyInside; x += 1) {
          anyInside = visible(x, y) && !isEdge(x, y);
        }
      }
      if (anyInside) problems.push(`outline${label}: the inside uses only the edge's colours`);
    }
    if (
      !info.outline &&
      edgesWithInside >= 8 &&
      darkEdges / edgesWithInside >= BLOCK_OUTLINE_SHARE &&
      darkEdgeColours.size <= BLOCK_OUTLINE_COLOURS
    ) {
      problems.push(
        `outline${label}: ${darkEdges} of ${edgesWithInside} edge pixels are darker than inside, an outline`,
      );
    }

    // Light from the top left, within each material (colours grouped by hue), so a dark
    // handle in the top-left half of a pale tool does not count against the tool's light.
    if (info.kind !== 'entity') {
      const sums = new Map<number, { tl: number; tlCount: number; br: number; brCount: number }>();
      const materialOf = materialGroups(
        [...colours].map((key) => [
          key,
          lchOf([(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff]),
        ]),
      );
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (!visible(x, y) || (info.outline && isEdge(x, y))) continue;
          const side = (x + 0.5) / width + (y + 0.5) / height;
          if (side === 1) continue;
          const group = materialOf.get(packRgb(rgbAt(x, y))) ?? 0;
          const sum = sums.get(group) ?? { tl: 0, tlCount: 0, br: 0, brCount: 0 };
          if (side < 1) {
            sum.tl += lAt(x, y);
            sum.tlCount += 1;
          } else {
            sum.br += lAt(x, y);
            sum.brCount += 1;
          }
          sums.set(group, sum);
        }
      }
      let lead = 0;
      let weight = 0;
      for (const sum of sums.values()) {
        const w = Math.min(sum.tlCount, sum.brCount);
        if (w === 0) continue;
        lead += (sum.tl / sum.tlCount - sum.br / sum.brCount) * w;
        weight += w;
      }
      if (weight > 0) {
        lead /= weight;
        const slack = info.tiles
          ? TILING_LIGHT_SLACK
          : info.kind === 'particle'
            ? PARTICLE_LIGHT_SLACK
            : 0;
        if (slack > 0 ? lead < -slack : lead <= 0) {
          problems.push(
            `light${label}: the top-left half is not lighter than the bottom-right (${lead.toFixed(3)})`,
          );
        }
      }
    }

    // Ramp order.
    let badRamp: string | undefined;
    for (let y = 0; y < height && badRamp === undefined; y += 1) {
      for (let x = 0; x < width && badRamp === undefined; x += 1) {
        if (!visible(x, y)) continue;
        const a = lchOf(rgbAt(x, y));
        for (const [nx, ny] of [
          [x + 1, y],
          [x, y + 1],
        ] as const) {
          if (nx >= width || ny >= height || !visible(nx, ny)) continue;
          const b = lchOf(rgbAt(nx, ny));
          if (a.c < 0.05 || b.c < 0.05) continue;
          if (Math.abs(hueDelta(a.h, b.h)) > 15) continue;
          if (Math.max(a.c, b.c) / Math.min(a.c, b.c) > 1.6) continue;
          if (Math.abs(a.l - b.l) < 0.04) continue;
          const [dark, light] = a.l < b.l ? [a, b] : [b, a];
          if (warmth(dark.h) > warmth(light.h) + 4) {
            badRamp = `(${x}, ${y}) and (${nx}, ${ny})`;
          }
        }
      }
    }
    if (badRamp !== undefined) {
      problems.push(`ramp${label}: at ${badRamp} the darker shade is warmer than the lighter`);
    }

    // Tiling.
    if (info.tiles) {
      const lineDifference = (pairs: readonly (readonly [number, number, number, number])[]) => {
        let sum = 0;
        let count = 0;
        for (const [x0, y0, x1, y1] of pairs) {
          if (!visible(x0, y0) || !visible(x1, y1)) continue;
          sum += Math.abs(lAt(x0, y0) - lAt(x1, y1));
          count += 1;
        }
        return count === 0 ? undefined : sum / count;
      };
      const across = (x0: number, x1: number) =>
        Array.from({ length: height }, (_, y) => [x0, y, x1, y] as const);
      const down = (y0: number, y1: number) =>
        Array.from({ length: width }, (_, x) => [x, y0, x, y1] as const);
      for (const [name, line, count] of [
        ['left and right', across, width],
        ['top and bottom', down, height],
      ] as const) {
        const seam = lineDifference(line(count - 1, 0));
        let inside: number | undefined;
        for (let i = 0; i + 1 < count; i += 1) {
          const value = lineDifference(line(i, i + 1));
          if (value !== undefined) inside = Math.max(inside ?? 0, value);
        }
        if (
          seam !== undefined &&
          inside !== undefined &&
          seam > inside * SEAM_FACTOR + SEAM_SLACK
        ) {
          problems.push(
            `tiling${label}: the ${name} edges differ by ${seam.toFixed(3)}, more than any line inside (${inside.toFixed(3)})`,
          );
        }
      }
    }
  }
  return problems;
}
