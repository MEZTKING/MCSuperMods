/**
 * Vanilla-style colour ramps (ADR 0092, Proposed): a handful of shades of one colour, darkest
 * first, with uneven lightness steps and a hue shift that turns warmer in the highlights and
 * cooler in the shadows. The tuned numbers here are original and were chosen by eye; nothing
 * is copied from a Minecraft texture.
 *
 * @packageDocumentation
 */

import type { Rgb } from '../assets/png';
import { oklchToRgb, packRgb, rgbToOklch } from './colour';

/** The hue (OKLCh degrees) highlights lean towards: a warm yellow-orange. */
export const WARM_HUE = 80;

/** The hue (OKLCh degrees) shadows lean towards: a cool blue-violet. */
export const COOL_HUE = 275;

/** The default hue shift in degrees at the ends of a ramp. */
export const DEFAULT_HUE_SHIFT = 16;

/** The lightest and darkest OKLab lightness a generated shade may take. */
const L_MIN = 0.12;
const L_MAX = 0.97;

/**
 * One shade's place in a ramp, relative to the anchor shade (the colour the user chose):
 * `lightness` is an OKLab lightness offset, `chroma` a factor on the anchor's chroma.
 */
export interface ShadeStep {
  readonly lightness: number;
  readonly chroma: number;
}

/**
 * Built-in shade steps for `count` shades (2 to 8) with the anchor at `anchor` (default: one
 * below the middle, as most of a texture's area sits in the darker mid tones). Steps grow
 * towards the dark end, chroma peaks just below the anchor and fades in the highlights.
 */
export function defaultSteps(count: number, anchor?: number): ShadeStep[] {
  const n = Math.max(2, Math.min(8, Math.round(count)));
  const a = Math.max(0, Math.min(n - 1, anchor ?? Math.floor((n - 1) / 2)));
  const steps: ShadeStep[] = [];
  for (let i = 0; i < n; i += 1) {
    const d = i - a;
    let lightness = 0;
    if (d < 0) {
      // Shadows: 0.105, then a little more each step down.
      for (let k = 1; k <= -d; k += 1) lightness -= 0.095 + 0.018 * k;
    } else {
      // Highlights: 0.085, then smaller steps.
      for (let k = 1; k <= d; k += 1) lightness += 0.092 - 0.012 * k;
    }
    const chroma = d < 0 ? 1.06 - 0.09 * (-d - 1) ** 1.2 : 1 - 0.17 * d ** 1.15;
    steps.push({ lightness, chroma: Math.max(0.25, chroma) });
  }
  return steps;
}

/** Options for {@link generateRamp}. */
export interface RampOptions {
  /** The shade steps, darkest first; defaults to {@link defaultSteps} of `count`. */
  readonly steps?: readonly ShadeStep[];
  /** The number of shades when `steps` is not given; defaults to 5. */
  readonly count?: number;
  /** The index of the shade that is `target` itself; defaults to {@link defaultSteps}' anchor. */
  readonly anchor?: number;
  /** The hue shift in degrees at the ends of the ramp; defaults to {@link DEFAULT_HUE_SHIFT}. */
  readonly hueShift?: number;
}

/**
 * `hue` turned towards `toward` by at most `amount` degrees, going round the way that does not
 * pass `avoid` (so highlights never turn through the cool hue, nor shadows through the warm
 * one: a blue's highlights go towards cyan, not purple).
 */
function lean(hue: number, toward: number, amount: number, avoid: number): number {
  const up = (toward - hue + 360) % 360; // turning with increasing hue
  const avoidUp = (avoid - hue + 360) % 360;
  const direction = avoidUp > 0 && avoidUp < up ? -1 : 1;
  const distance = direction === 1 ? up : 360 - up;
  const turn = direction * Math.min(distance, Math.abs(amount));
  return (hue + turn + 360) % 360;
}

/**
 * The colour of one shade: the target's lightness moved by `step.lightness` (squeezed so the
 * ramp stays between {@link L_MIN} and {@link L_MAX}), its chroma scaled by `step.chroma`, its
 * hue leaning warm above the target and cool below it, in proportion to `lean01` (-1 to 1).
 */
export function shadeOf(
  target: Rgb,
  step: ShadeStep,
  squeeze: { up: number; down: number },
  lean01: number,
  hueShift: number = DEFAULT_HUE_SHIFT,
): Rgb {
  const [l, c, h] = rgbToOklch(target);
  const offset = step.lightness >= 0 ? step.lightness * squeeze.up : step.lightness * squeeze.down;
  const lightness = Math.max(L_MIN, Math.min(L_MAX, l + offset));
  // Greys get no hue shift: there is no hue to turn, only a tint would appear.
  const shift = c < 0.02 ? 0 : hueShift * Math.abs(lean01);
  const hue = lean01 >= 0 ? lean(h, WARM_HUE, shift, COOL_HUE) : lean(h, COOL_HUE, shift, WARM_HUE);
  return oklchToRgb([lightness, c * step.chroma, hue]);
}

/** Factors that fit offsets around `l` between the lightness limits. */
export function squeezeFor(l: number, offsets: readonly number[]): { up: number; down: number } {
  const up = Math.max(0, ...offsets);
  const down = Math.min(0, ...offsets);
  return {
    up: up > 0 && l + up > L_MAX ? Math.max(0, (L_MAX - l) / up) : 1,
    down: down < 0 && l + down < L_MIN ? Math.max(0, (l - L_MIN) / -down) : 1,
  };
}

/**
 * A vanilla-style ramp of `target`, darkest first: the same lightness steps whatever the
 * colour, hue-shifted (warmer highlights, cooler shadows), squeezed to fit for very light or
 * very dark targets, and with no two neighbouring shades equal.
 */
export function generateRamp(target: Rgb, options: RampOptions = {}): Rgb[] {
  const steps = options.steps ?? defaultSteps(options.count ?? 5, options.anchor);
  const anchorIndex =
    options.anchor ??
    steps.reduce(
      (best, step, i) =>
        Math.abs(step.lightness) < Math.abs(steps[best]?.lightness ?? 1) ? i : best,
      0,
    );
  const anchorL = steps[anchorIndex]?.lightness ?? 0;
  const relative = steps.map((step) => ({ ...step, lightness: step.lightness - anchorL }));
  const offsets = relative.map((step) => step.lightness);
  const span = Math.max(1e-6, ...offsets.map(Math.abs));
  const squeeze = squeezeFor(rgbToOklch(target)[0], offsets);
  const ramp = relative.map((step) =>
    shadeOf(target, step, squeeze, step.lightness / span, options.hueShift),
  );
  return separate(ramp);
}

/** Nudges neighbouring equal shades apart so every step of a ramp stays visible. */
function separate(ramp: Rgb[]): Rgb[] {
  const out = ramp.slice();
  for (let i = 1; i < out.length; i += 1) {
    const prev = out[i - 1] as Rgb;
    const cur = out[i] as Rgb;
    if (packRgb(prev) === packRgb(cur)) {
      const [l, c, h] = rgbToOklch(cur);
      out[i] = oklchToRgb([Math.min(1, l + 0.03), c, h]);
    }
  }
  return out;
}
