/**
 * The screens of container and machine blocks (ADR 0074 D1, ADR 0075 D4) as Try it's mock-up
 * reads them (B398, ADR 0085 L11): which blocks open a screen when used, and its shape. The game
 * opens vanilla's menus; the preview shows a plain grid of the same slots, and no item moves.
 *
 * - `msm:container` with layout `chest` (the default): `rows` rows of nine (default 3); with
 *   `keep_contents` the shulker box screen. `hopper`: one row of five. `dispenser`: three by
 *   three. `none` is a holder without a screen, so it opens nothing.
 * - `msm:machine`: the furnace's three slots, input, fuel and output, in the screen of its
 *   `menu` (default `furnace`); `power` other than `fuel` leaves the fuel slot unused.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { SimFiles } from '../types.js';
import { readJsonFile } from './catalogue.js';

/** A container's screen. */
export interface ContainerScreen {
  readonly kind: 'container';
  /** The vanilla layout it stands for. */
  readonly layout: 'chest' | 'hopper' | 'dispenser';
  /** Rows and columns of slots. */
  readonly rows: number;
  readonly columns: number;
  /** A chest layout with `keep_contents`: the shulker box screen. */
  readonly keepContents: boolean;
}

/** A machine's screen: input, fuel and output. */
export interface MachineScreen {
  readonly kind: 'machine';
  /** The vanilla screen it stands for: `furnace`, `blast_furnace` or `smoker`. */
  readonly menu: string;
  /** How it is powered: `fuel` (the default), `redstone` or `always`. */
  readonly power: string;
}

/** The screen a block opens. */
export type ScreenSpec = ContainerScreen | MachineScreen;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const DEFINITION_PATH = /^msm\/([a-z0-9_.-]+)\/block\/(.+)\.json$/;

/** The screen a block definition opens, or `undefined` for one without a screen. */
export function screenOf(definition: Json | undefined): ScreenSpec | undefined {
  if (!isRecord(definition)) return undefined;
  const components = isRecord(definition.components) ? definition.components : {};
  const machine = components['msm:machine'];
  if (isRecord(machine)) {
    return Object.freeze({
      kind: 'machine',
      menu: typeof machine.menu === 'string' ? machine.menu : 'furnace',
      power: typeof machine.power === 'string' ? machine.power : 'fuel',
    });
  }
  const container = components['msm:container'];
  if (!isRecord(container)) return undefined;
  const layout = typeof container.layout === 'string' ? container.layout : 'chest';
  if (layout === 'hopper') {
    return Object.freeze({ kind: 'container', layout, rows: 1, columns: 5, keepContents: false });
  }
  if (layout === 'dispenser') {
    return Object.freeze({ kind: 'container', layout, rows: 3, columns: 3, keepContents: false });
  }
  if (layout !== 'chest') return undefined;
  const rows =
    typeof container.rows === 'number' && Number.isInteger(container.rows)
      ? Math.min(6, Math.max(1, container.rows))
      : 3;
  return Object.freeze({
    kind: 'container',
    layout: 'chest',
    rows,
    columns: 9,
    keepContents: container.keep_contents === true,
  });
}

/** Every project block that opens a screen, by block id. */
export function screensFromFiles(files: SimFiles): Map<string, ScreenSpec> {
  const out = new Map<string, ScreenSpec>();
  for (const path of files.keys()) {
    const match = DEFINITION_PATH.exec(path);
    if (match === null) continue;
    const screen = screenOf(readJsonFile(files, path));
    if (screen !== undefined) out.set(`${match[1]}:${match[2]}`, screen);
  }
  return out;
}
