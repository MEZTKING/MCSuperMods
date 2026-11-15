/**
 * Try it's HUD layer (B429, ADR 0089 D4, D5, ADR 0091 D6), the pure part: what each visible HUD
 * element of the simulation draws this frame (a bar's fill, a row of icons, a line of text) and
 * the vehicle dashboard's rows, as boxes placed by the HUD Studio's `hud-layout.ts` (the twin of
 * the runtime's `HudLayout`, which passes `fixtures/hud-layout/golden.json`), on the GUI size of
 * the picture. The rules follow the runtime's `MsmHudLayer` and `VehicleDashboard`: a bar or row
 * of icons whose value is a text draws nothing; one without a value draws empty; a row of icons
 * without `icon` draws nothing; `max` counts 20 until it has a number; the dashboard's rows are
 * `msm_runtime:dashboard/<n>` in the `bottom_right` stack, ordered below every project element
 * there, row 0 the lowest. Text widths use the app's own measure (`textWidth`), so text may be a
 * few pixels off the game's (the golden's README).
 *
 * @packageDocumentation
 */

import type { JsonObject } from '@msm/plugin-api';
import type { DashboardRow, HudFrameItem } from '@msm/sim';
import { HUD_DEFAULTS, textWidth } from '../../studios/controls/controls-model';
import {
  barFill,
  guiSize,
  HUD_LAYOUT,
  type HudBox,
  hudText,
  type IconRow,
  iconRow,
  layoutHud,
  type Pair,
} from '../../studios/controls/hud-layout';

/** The dashboard's numbers and colours (the runtime's `VehicleDashboard`). */
export const DASHBOARD = Object.freeze({
  barWidth: 50,
  barHeight: 5,
  /** Between a row's label and its bar. */
  labelGap: 4,
  /** The first row's `order` (`Integer.MIN_VALUE`); the rows count up from it. */
  order: -2147483648,
  colours: Object.freeze({
    health: '#d83030',
    fuel: '#e0a020',
    reloading: '#60a0ff',
    ready: '#60c060',
    back: '#202020',
  }),
});

/** The dashboard's text colour. */
const WHITE = '#ffffff';

/** One thing the layer draws. */
export type TryItHudItem =
  | {
      readonly kind: 'bar';
      readonly box: HudBox;
      readonly filled: number;
      readonly definition: JsonObject;
      readonly value: number | null;
    }
  | {
      readonly kind: 'icons';
      readonly box: HudBox;
      readonly icons: IconRow;
      readonly definition: JsonObject;
      readonly value: number | null;
    }
  | {
      readonly kind: 'text';
      readonly box: HudBox;
      readonly line: string;
      readonly colour: string;
      readonly shadow: boolean;
      readonly value: number | string | null;
    }
  | {
      readonly kind: 'dashboard';
      readonly box: HudBox;
      readonly label: string;
      /** The bar's left edge from the box's. */
      readonly barX: number;
      readonly filled: number;
      readonly colour: string;
    };

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function pair(value: unknown, fallback: readonly [number, number]): [number, number] {
  if (Array.isArray(value) && value.length === 2) {
    const [a, b] = value;
    if (typeof a === 'number' && typeof b === 'number') return [Math.trunc(a), Math.trunc(b)];
  }
  return [fallback[0], fallback[1]];
}

/** A HUD element's box fields: its anchor, order and offset. */
function boxOf(id: string, d: JsonObject, size: Pair): HudBox {
  return {
    id,
    anchor: str(d.anchor),
    order: num(d.order) === undefined ? 0 : Math.trunc(num(d.order) as number),
    size,
    offset: Array.isArray(d.offset) ? pair(d.offset, [0, 0]) : undefined,
  };
}

/**
 * What a frame item of the simulation draws, or `null` for nothing (a bar or row of icons with a
 * text value, or a row of icons without `icon`).
 */
export function hudItemOf(item: HudFrameItem, measure = textWidth): TryItHudItem | null {
  const { hud, value, max } = item;
  const d = hud.definition;
  const maxNumber = typeof max === 'number' ? max : HUD_DEFAULTS.max;
  if (hud.type === 'bar') {
    if (typeof value === 'string') return null;
    const size = pair(d.size, HUD_DEFAULTS.barSize);
    return {
      kind: 'bar',
      box: boxOf(hud.id, d, size),
      filled: barFill(value ?? 0, maxNumber, size[0]),
      definition: d,
      value,
    };
  }
  if (hud.type === 'icons') {
    if (typeof value === 'string' || str(d.icon) === undefined) return null;
    const icons = iconRow(
      value ?? 0,
      maxNumber,
      num(d.per_icon) ?? HUD_DEFAULTS.perIcon,
      str(d.half_icon) !== undefined,
      str(d.empty_icon) !== undefined,
    );
    return {
      kind: 'icons',
      box: boxOf(hud.id, d, [icons.width, HUD_LAYOUT.iconSize]),
      icons,
      definition: d,
      value,
    };
  }
  const line = hudText(hud.text, value ?? undefined, max ?? undefined);
  return {
    kind: 'text',
    box: boxOf(hud.id, d, [measure(line), HUD_LAYOUT.textHeight]),
    line,
    colour: str(d.color) ?? HUD_DEFAULTS.textColor,
    shadow: d.shadow !== false,
    value,
  };
}

/** The dashboard's items: one box per row in the `bottom_right` stack, the last row first. */
export function dashboardItems(rows: readonly DashboardRow[], measure = textWidth): TryItHudItem[] {
  if (rows.length === 0) return [];
  const labelWidth = Math.max(...rows.map((row) => measure(row.label)));
  const width = labelWidth + DASHBOARD.labelGap + DASHBOARD.barWidth;
  const out: TryItHudItem[] = [];
  for (let k = 0; k < rows.length; k += 1) {
    const row = rows[rows.length - 1 - k] as DashboardRow;
    out.push({
      kind: 'dashboard',
      box: {
        id: `msm_runtime:dashboard/${k}`,
        anchor: 'bottom_right',
        order: DASHBOARD.order + k,
        size: [width, HUD_LAYOUT.textHeight],
      },
      label: row.label,
      barX: labelWidth + DASHBOARD.labelGap,
      filled: Math.round(DASHBOARD.barWidth * Math.min(1, Math.max(0, row.fraction))),
      colour: DASHBOARD.colours[row.kind],
    });
  }
  return out;
}

/** The dashboard label colour. */
export const DASHBOARD_TEXT = WHITE;

/** A placed item. */
export type PlacedHudItem = TryItHudItem & { readonly position: Pair };

/** Places the items on a GUI of `gui` size (`hud-layout.ts`). */
export function placeHud(
  items: readonly TryItHudItem[],
  gui: readonly [number, number],
): PlacedHudItem[] {
  const positions = layoutHud(
    items.map((item) => item.box),
    gui,
  );
  return items.map((item) => ({ ...item, position: positions.get(item.box.id) ?? [0, 0] }));
}

/**
 * The game's automatic GUI scale for a window: the largest scale at which the GUI is still at
 * least 320 by 240 pixels (at least 1). Try it uses it for the picture's size in device pixels.
 */
export function autoGuiScale(window: readonly [number, number]): number {
  let scale = 1;
  while (window[0] / (scale + 1) >= 320 && window[1] / (scale + 1) >= 240) scale += 1;
  return scale;
}

/** The GUI size and scale of a picture `window` device pixels large. */
export function tryItGui(window: readonly [number, number]): { gui: Pair; scale: number } {
  const scale = autoGuiScale(window);
  return { gui: guiSize(window, scale), scale };
}
