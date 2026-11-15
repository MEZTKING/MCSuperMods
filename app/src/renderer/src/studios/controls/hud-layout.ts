/**
 * The HUD layout (ADR 0089 D4), a pure TypeScript twin of the runtime's `HudLayout`: where each
 * HUD element sits on a screen of a given GUI size, how a bar fills, how a row of icons is drawn
 * and how a number is written as text. Written from the rules of `fixtures/hud-layout/README.md`
 * and checked against `fixtures/hud-layout/golden.json` case for case
 * (`app/test/components/studios/controls/hud-layout.test.ts`). The HUD Studio's preview draws
 * with it; Try it's HUD layer (B429) may too.
 *
 * Everything is in GUI pixels, x to the right and y downwards from the top left corner.
 *
 * @packageDocumentation
 */

/** The layout constants (the golden's `constants`). */
export const HUD_LAYOUT = Object.freeze({
  /** From a screen edge to an edge anchor's stack. */
  margin: 2,
  /** Between two elements of one stack. */
  gap: 2,
  /** The bottom of the `above_hotbar` stack sits this far above the screen's bottom edge. */
  aboveHotbar: 52,
  /** A line of text. */
  textHeight: 9,
  iconSize: 9,
  /** Icons overlap by one pixel, as hearts do. */
  iconStep: 8,
  maxIcons: 20,
  decimals: 2,
});

/** The ten anchors (ADR 0089 D1). */
export const HUD_ANCHOR_IDS = [
  'top_left',
  'top',
  'top_right',
  'left',
  'center',
  'right',
  'bottom_left',
  'bottom',
  'bottom_right',
  'above_hotbar',
] as const;

/** One anchor. */
export type HudAnchor = (typeof HUD_ANCHOR_IDS)[number];

/** The default anchor. */
export const DEFAULT_HUD_ANCHOR: HudAnchor = 'above_hotbar';

/** How an anchor places its stack. */
export interface HudAnchorRule {
  horizontal: 'left' | 'centre' | 'right';
  vertical: 'top' | 'middle' | 'bottom' | 'above_hotbar';
}

/** The anchor table (the golden's `anchors`). */
export const HUD_ANCHORS: Readonly<Record<HudAnchor, HudAnchorRule>> = Object.freeze({
  top_left: { horizontal: 'left', vertical: 'top' },
  top: { horizontal: 'centre', vertical: 'top' },
  top_right: { horizontal: 'right', vertical: 'top' },
  left: { horizontal: 'left', vertical: 'middle' },
  center: { horizontal: 'centre', vertical: 'middle' },
  right: { horizontal: 'right', vertical: 'middle' },
  bottom_left: { horizontal: 'left', vertical: 'bottom' },
  bottom: { horizontal: 'centre', vertical: 'bottom' },
  bottom_right: { horizontal: 'right', vertical: 'bottom' },
  above_hotbar: { horizontal: 'centre', vertical: 'above_hotbar' },
});

/** Whether `value` is one of the ten anchors. */
export function isHudAnchor(value: unknown): value is HudAnchor {
  return typeof value === 'string' && Object.hasOwn(HUD_ANCHORS, value);
}

/** One element to place: its box this frame (hidden elements are left out by the caller). */
export interface HudBox {
  id: string;
  /** Defaults to `above_hotbar`; an unknown anchor counts as the default. */
  anchor?: string | undefined;
  /** Defaults to 0. */
  order?: number | undefined;
  /** `[width, height]`. */
  size: readonly [number, number];
  /** `[x, y]`, applied last; defaults to `[0, 0]`. */
  offset?: readonly [number, number] | undefined;
}

/** A pair of numbers: `[width, height]` or `[x, y]`. */
export type Pair = [number, number];

/** The GUI's scaled size: the window's size over the scale, rounded up. */
export function guiSize(window: readonly [number, number], scale: number): Pair {
  return [Math.ceil(window[0] / scale), Math.ceil(window[1] / scale)];
}

const byOrderThenId = (a: HudBox, b: HudBox): number => {
  const order = (a.order ?? 0) - (b.order ?? 0);
  if (order !== 0) return order;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * The top left corner of every box on a GUI of `gui` size, by id.
 *
 * @param boxes - The elements drawn this frame.
 * @param gui - The GUI's scaled `[width, height]` ({@link guiSize}).
 */
export function layoutHud(
  boxes: readonly HudBox[],
  gui: readonly [number, number],
): Map<string, Pair> {
  const [width, height] = gui;
  const { margin, gap, aboveHotbar } = HUD_LAYOUT;
  const stacks = new Map<HudAnchor, HudBox[]>();
  for (const box of boxes) {
    const anchor = isHudAnchor(box.anchor) ? box.anchor : DEFAULT_HUD_ANCHOR;
    const stack = stacks.get(anchor) ?? [];
    stack.push(box);
    stacks.set(anchor, stack);
  }
  const positions = new Map<string, Pair>();
  for (const [anchor, stack] of stacks) {
    stack.sort(byOrderThenId);
    const rule = HUD_ANCHORS[anchor];
    const xOf = (w: number): number =>
      rule.horizontal === 'left'
        ? margin
        : rule.horizontal === 'right'
          ? width - margin - w
          : Math.floor((width - w) / 2);
    const ys: number[] = [];
    if (rule.vertical === 'top') {
      let y = margin;
      for (const box of stack) {
        ys.push(y);
        y += box.size[1] + gap;
      }
    } else if (rule.vertical === 'middle') {
      const total =
        stack.reduce((sum, box) => sum + box.size[1], 0) + gap * Math.max(0, stack.length - 1);
      let y = Math.floor((height - total) / 2);
      for (const box of stack) {
        ys.push(y);
        y += box.size[1] + gap;
      }
    } else {
      let bottom = rule.vertical === 'bottom' ? height - margin : height - aboveHotbar;
      for (const box of stack) {
        const top = bottom - box.size[1];
        ys.push(top);
        bottom = top - gap;
      }
    }
    stack.forEach((box, index) => {
      const [dx, dy] = box.offset ?? [0, 0];
      positions.set(box.id, [xOf(box.size[0]) + dx, (ys[index] ?? 0) + dy]);
    });
  }
  return positions;
}

/** A small amount allowed against floating-point error in `ceil` and `floor`. */
const EPSILON = 1e-9;

/** The filled width of a bar: `round(width × clamp(value / max, 0, 1))`, halves up; 0 for `max <= 0`. */
export function barFill(value: number, max: number, width: number): number {
  if (!(max > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, value / max));
  return Math.floor(width * ratio + 0.5);
}

/** How a row of icons is drawn. */
export interface IconRow {
  count: number;
  /** In GUI pixels; 0 for no icons. */
  width: number;
  full: number;
  half: number;
  empty: number;
}

/**
 * A row of icons, as hearts: up to `maxIcons` icons of `perIcon` each, filled by halves.
 *
 * @param hasHalf - Whether the element has a `half_icon` (else the half rounds down).
 * @param hasEmpty - Whether the element has an `empty_icon` (else nothing is drawn there).
 */
export function iconRow(
  value: number,
  max: number,
  perIcon: number,
  hasHalf: boolean,
  hasEmpty: boolean,
): IconRow {
  const { maxIcons, iconSize, iconStep } = HUD_LAYOUT;
  const count = max > 0 && perIcon > 0 ? Math.min(maxIcons, Math.ceil(max / perIcon - EPSILON)) : 0;
  const halves =
    count === 0 ? 0 : Math.min(2 * count, Math.max(0, Math.floor((value * 2) / perIcon + EPSILON)));
  const full = Math.floor(halves / 2);
  const half = halves % 2 === 1 && hasHalf ? 1 : 0;
  const empty = hasEmpty ? count - full - half : 0;
  return { count, width: count === 0 ? 0 : iconStep * (count - 1) + iconSize, full, half, empty };
}

/**
 * A number as HUD text: rounded half away from zero to at most two decimals, trailing zeros
 * dropped, never in exponent form, and `0` rather than `-0`.
 */
export function hudNumberText(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Number(value.toFixed(HUD_LAYOUT.decimals));
  if (rounded === 0) return '0';
  if (Math.abs(rounded) < 1e21) return rounded.toString();
  return rounded.toLocaleString('en-GB', { useGrouping: false, maximumFractionDigits: 2 });
}

/**
 * A text element's line: `{value}` and `{max}` replaced (numbers through {@link hudNumberText},
 * a text value as it is, no value as nothing).
 */
export function hudText(
  template: string,
  value: number | string | undefined,
  max: number | string | undefined,
): string {
  const words = (part: number | string | undefined): string =>
    part === undefined ? '' : typeof part === 'number' ? hudNumberText(part) : part;
  return template.replaceAll('{value}', words(value)).replaceAll('{max}', words(max));
}
