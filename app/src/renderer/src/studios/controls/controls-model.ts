/**
 * Pure helpers of the Key bind and HUD Studios (B420, ADR 0088 D3, ADR 0089 D1, D2): the
 * project's vehicles and key groups, the words of each choice, type and value-source changes that
 * leave no field of another type behind, the HUD boxes the layout preview places (sizes and the
 * sample values it draws), and the sprites a HUD element names that the project has no picture
 * for (ADR 0089 D9, reported by the app).
 *
 * @packageDocumentation
 */

import type { Element, Json, JsonObject, Project } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import {
  DEFAULT_KEY_CATEGORY,
  HUD_KIND,
  HUD_SPRITE_FIELDS,
  HUD_TYPE_FIELDS,
  hudSpritePath,
  KEY_BIND_KIND,
  VEHICLE_KIND,
} from '@msm/plugin-controls';
import { asObject } from '../blocks-items/blocks-items-model';
import { barFill, HUD_LAYOUT, type HudBox, hudText, iconRow } from './hud-layout';

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const numberOf = (value: Json | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Every element of `kind` in the project, in project order. */
export function elementsOfKind(project: Project, kind: string): Element[] {
  return project.namespaces.flatMap((namespace) =>
    namespace.elements.filter((element) => element.kind === kind),
  );
}

/** The ids of the project's vehicles (`msm:vehicle`), sorted. */
export function projectVehicles(project: Project): string[] {
  return elementsOfKind(project, VEHICLE_KIND)
    .map((element) => element.id)
    .sort();
}

// Key binds ---------------------------------------------------------------------------------

/** When a key works (ADR 0088 D3), in the order the Studio offers them. */
export const KEY_WHEN_CHOICES = ['always', 'on_foot', 'in_vehicle', 'driving'] as const;

/** The words of each `when`. */
export const KEY_WHEN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  always: 'Always',
  on_foot: 'On foot',
  in_vehicle: 'In a vehicle',
  driving: 'While driving',
});

/** Whether a `when` (or `show`) is one that a vehicle narrows. */
export const isVehicleCondition = (value: Json | undefined): boolean =>
  value === 'in_vehicle' || value === 'driving';

/** One Controls group of the project's key binds. */
export interface KeyGroup {
  /** The category path (`keys` when unset). */
  category: string;
  /** The key binds in it. */
  ids: string[];
  /** The distinct group names they give, in project order. */
  names: string[];
}

/** The category of a key bind's data (`keys` when unset). */
export const categoryOf = (data: Json | undefined): string =>
  textOf(asObject(data).category) ?? DEFAULT_KEY_CATEGORY;

/**
 * The Controls groups of the project's key binds in `namespace` (categories are per namespace:
 * `<ns>:<category>`), sorted by category.
 */
export function keyGroups(project: Project, namespace: string): KeyGroup[] {
  const groups = new Map<string, KeyGroup>();
  for (const element of elementsOfKind(project, KEY_BIND_KIND)) {
    if (!element.id.startsWith(`${namespace}:`)) continue;
    const category = categoryOf(element.data);
    const group = groups.get(category) ?? { category, ids: [], names: [] };
    group.ids.push(element.id);
    const name = textOf(asObject(element.data).category_name);
    if (name !== undefined && !group.names.includes(name)) group.names.push(name);
    groups.set(category, group);
  }
  return [...groups.values()].sort((a, b) => (a.category < b.category ? -1 : 1));
}

/**
 * The key bind data with `category` set to `next` (cleared for `keys` or empty). Keys of one
 * group share one group name, so moving into a group another key already names takes that
 * name; moving into an unnamed group keeps the key's own.
 */
export function withCategory(
  data: Json,
  next: string | undefined,
  groups: readonly KeyGroup[],
  selfId: string,
): JsonObject {
  const out: JsonObject = { ...asObject(data) };
  const category = next === undefined || next === '' ? DEFAULT_KEY_CATEGORY : next;
  if (next === undefined || next === '') delete out.category;
  else out.category = category;
  const group = groups.find((entry) => entry.category === category);
  const others = group?.ids.filter((id) => id !== selfId) ?? [];
  const name = others.length > 0 ? group?.names[0] : undefined;
  if (name !== undefined) out.category_name = name;
  return out;
}

/** The key bind data with `when` set; a vehicle is dropped when the new `when` cannot use it. */
export function withWhen(data: Json, when: string | undefined): JsonObject {
  const out: JsonObject = { ...asObject(data) };
  if (when === undefined || when === 'always') delete out.when;
  else out.when = when;
  if (!isVehicleCondition(out.when)) delete out.vehicle;
  return out;
}

/** Ticks as words: `20` is "1 second", `600` is "30 seconds", `5` is "0.25 seconds". */
export function ticksWords(ticks: number | undefined): string {
  if (ticks === undefined || ticks <= 0) return 'no wait';
  const seconds = Math.round((ticks / 20) * 100) / 100;
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

// HUD elements --------------------------------------------------------------------------------

/** How the HUD Studio offers the types: a number is a text element showing just the value. */
export const HUD_LOOKS = ['bar', 'icons', 'text', 'number'] as const;
/** One look of {@link HUD_LOOKS}. */
export type HudLook = (typeof HUD_LOOKS)[number];

/** The words of each look. */
export const HUD_LOOK_LABELS: Readonly<Record<HudLook, string>> = Object.freeze({
  bar: 'Bar',
  icons: 'Row of icons',
  text: 'Text',
  number: 'Number',
});

/** The default text of a text element (ADR 0089 D1). */
export const DEFAULT_HUD_TEXT = '{value}';
/** The text a "Text" look starts with. */
export const NEW_HUD_TEXT = 'Value: {value}';

/** The look of HUD data: `number` for a text element whose text is just the value. */
export function hudLookOf(data: Json | undefined): HudLook {
  const object = asObject(data);
  if (object.type === 'bar' || object.type === 'icons') return object.type;
  const text = object.text;
  return text === undefined || text === DEFAULT_HUD_TEXT ? 'number' : 'text';
}

/** Every field one of the types reads (`HUD_TYPE_FIELDS`). */
const TYPE_ONLY_FIELDS: ReadonlySet<string> = new Set(Object.values(HUD_TYPE_FIELDS).flat());

/**
 * The HUD data with the look `look`: the type set, and every field only another type reads
 * removed (so nothing is left unused). A row of icons without `icon` stays one (the validators
 * ask for it).
 */
export function withHudLook(data: Json, look: HudLook): JsonObject {
  const type = look === 'number' ? 'text' : look;
  const keep = new Set(HUD_TYPE_FIELDS[type] ?? []);
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(asObject(data))) {
    if (TYPE_ONLY_FIELDS.has(key) && !keep.has(key)) continue;
    out[key] = value;
  }
  out.type = type;
  if (look === 'number') delete out.text;
  if (look === 'text' && (out.text === undefined || out.text === DEFAULT_HUD_TEXT)) {
    out.text = NEW_HUD_TEXT;
  }
  return out;
}

/** The value sources (ADR 0089 D2), in the order the Studio offers them. */
export const HUD_SOURCES = ['set', 'data', 'score', 'player', 'vehicle'] as const;

/** The words of each source. */
export const HUD_SOURCE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  set: 'Set by rules, scripts and actions',
  data: 'Saved data (also Rules counters)',
  score: 'A scoreboard score',
  player: "The player's own stat",
  vehicle: "The vehicle's stat",
});

/** Player stats (read on the client). */
export const HUD_PLAYER_STATS = ['health', 'food', 'air', 'armor', 'level', 'x', 'y', 'z'] as const;
/** Their words. */
export const HUD_PLAYER_STAT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  health: 'Health',
  food: 'Food',
  air: 'Air',
  armor: 'Armour',
  level: 'Experience level',
  x: 'Position X',
  y: 'Height (Y)',
  z: 'Position Z',
});

/** Vehicle stats. */
export const HUD_VEHICLE_STATS = ['fuel', 'health', 'ammo', 'speed', 'reload'] as const;
/** Their words. */
export const HUD_VEHICLE_STAT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  fuel: 'Fuel',
  health: 'Health',
  ammo: 'Ammunition',
  speed: 'Speed (blocks a second)',
  reload: 'Reload (ticks left)',
});

/** Whether a vehicle stat names a weapon. */
export const statHasWeapon = (stat: Json | undefined): boolean =>
  stat === 'ammo' || stat === 'reload';

/**
 * A new value of `source`, with its required fields filled: script data and score values name
 * `name` (the element's own name) so they are valid at once.
 */
export function newHudValue(source: string, namespace: string, name: string): JsonObject {
  switch (source) {
    case 'data':
      return { source, scope: 'player', namespace, key: name };
    case 'score':
      return { source, objective: name };
    case 'player':
      return { source, stat: 'health' };
    case 'vehicle':
      return { source, stat: 'fuel' };
    default:
      return { source: 'set' };
  }
}

/** The places on screen, in the order of the anchor picker's nine spots plus above the hotbar. */
export const HUD_ANCHOR_LABELS: Readonly<Record<string, string>> = Object.freeze({
  top_left: 'Top left',
  top: 'Top',
  top_right: 'Top right',
  left: 'Left',
  center: 'Centre',
  right: 'Right',
  bottom_left: 'Bottom left',
  bottom: 'Bottom',
  bottom_right: 'Bottom right',
  above_hotbar: 'Above the hotbar',
});

/** When an element is drawn (ADR 0089 D1). */
export const HUD_SHOW_CHOICES = ['when_set', 'always', 'in_vehicle', 'driving'] as const;
/** Their words. */
export const HUD_SHOW_LABELS: Readonly<Record<string, string>> = Object.freeze({
  when_set: 'Once it has a value',
  always: 'Always',
  in_vehicle: 'In a vehicle',
  driving: 'While driving',
});

/** The HUD data with `show` set; a vehicle is dropped when the new `show` cannot use it. */
export function withShow(data: Json, show: string | undefined): JsonObject {
  const out: JsonObject = { ...asObject(data) };
  if (show === undefined || show === 'when_set') delete out.show;
  else out.show = show;
  if (!isVehicleCondition(out.show)) delete out.vehicle;
  return out;
}

/** The defaults the runtime draws with (ADR 0089 D1). */
export const HUD_DEFAULTS = Object.freeze({
  barSize: [81, 5] as const,
  fillColor: '#e0c040',
  backColor: '#202020',
  textColor: '#ffffff',
  max: 20,
  perIcon: 2,
});

/** The number `max`, or the default 20 when it is unset or another value. */
export function maxNumberOf(data: Json | undefined): number {
  return numberOf(asObject(data).max) ?? HUD_DEFAULTS.max;
}

/** A sample of what a value shows, for the preview. */
export function sampleValue(data: Json | undefined): number {
  const object = asObject(data);
  const value = asObject(object.value);
  const max = maxNumberOf(data);
  if (value.source === 'player') {
    const samples: Record<string, number> = {
      health: 20,
      food: 20,
      air: 20,
      armor: 10,
      level: 30,
      x: 128.5,
      y: 64,
      z: -32.25,
    };
    return samples[String(value.stat)] ?? 0;
  }
  if (value.source === 'vehicle' && value.stat === 'speed') return 5;
  return Math.round(max * 0.7 * 100) / 100;
}

/**
 * The width of a line of text in GUI pixels, after the default font's usual advances (most
 * characters 6, narrow ones less). The game measures with its own font, so the preview may be a
 * few pixels off (the golden's README).
 */
export function textWidth(line: string): number {
  let width = 0;
  for (const char of line) {
    if ("!',.:;i|".includes(char)) width += 2;
    else if ('`l'.includes(char)) width += 3;
    else if (' It[]'.includes(char)) width += 4;
    else if ('"()*<>fk{}'.includes(char)) width += 5;
    else if ('@~'.includes(char)) width += 7;
    else width += 6;
  }
  return width;
}

/** What the preview draws for one element. */
export interface HudPreviewItem {
  box: HudBox;
  type: 'bar' | 'icons' | 'text';
  /** Bars: the filled width. */
  filled: number;
  /** Icons: the row. */
  icons: ReturnType<typeof iconRow> | null;
  /** Text: the line. */
  line: string;
  data: JsonObject;
}

/** Two numbers of a `[a, b]` field, or `fallback`. */
function pairOf(value: Json | undefined, fallback: readonly [number, number]): [number, number] {
  if (Array.isArray(value) && value.length === 2) {
    const [a, b] = value;
    if (typeof a === 'number' && typeof b === 'number') return [a, b];
  }
  return [fallback[0], fallback[1]];
}

/**
 * What the preview draws for HUD element `id` with `data`, showing `value` (a sample when
 * absent).
 */
export function hudPreviewItem(id: string, data: Json | undefined, value?: number): HudPreviewItem {
  const object = asObject(data);
  const type = object.type === 'bar' || object.type === 'icons' ? object.type : 'text';
  const shown = value ?? sampleValue(data);
  const max = maxNumberOf(data);
  const base = {
    id,
    anchor: textOf(object.anchor),
    order: numberOf(object.order),
    offset: Array.isArray(object.offset) ? pairOf(object.offset, [0, 0]) : undefined,
  };
  if (type === 'bar') {
    const size = pairOf(object.size, HUD_DEFAULTS.barSize);
    return {
      box: { ...base, size },
      type,
      filled: barFill(shown, max, size[0]),
      icons: null,
      line: '',
      data: object,
    };
  }
  if (type === 'icons') {
    const row = iconRow(
      shown,
      max,
      numberOf(object.per_icon) ?? HUD_DEFAULTS.perIcon,
      textOf(object.half_icon) !== undefined,
      textOf(object.empty_icon) !== undefined,
    );
    return {
      box: { ...base, size: [row.width, row.count === 0 ? 0 : HUD_LAYOUT.iconSize] },
      type,
      filled: 0,
      icons: row,
      line: '',
      data: object,
    };
  }
  const line = hudText(textOf(object.text) ?? DEFAULT_HUD_TEXT, shown, max);
  return {
    box: { ...base, size: [textWidth(line), HUD_LAYOUT.textHeight] },
    type,
    filled: 0,
    icons: null,
    line,
    data: object,
  };
}

/** Whether the preview draws an element: vehicle-only ones only while "In a vehicle" is on. */
export function previewShows(data: Json | undefined, inVehicle: boolean): boolean {
  return inVehicle || !isVehicleCondition(asObject(data).show);
}

/** A sprite a HUD element names that the project has no picture for. */
export interface MissingSprite {
  field: string;
  sprite: string;
  /** The picture's asset path (`assets/<ns>/textures/gui/sprites/<name>.png`). */
  path: string;
}

/**
 * The project's own sprites (not `minecraft:` or without a namespace) that `data` names and the
 * project has no picture for; the game draws nothing in their place.
 */
export function missingSprites(
  project: Project,
  target: Pick<TargetFacts, 'folders'>,
  data: Json | undefined,
): MissingSprite[] {
  const object = asObject(data);
  const out: MissingSprite[] = [];
  for (const field of HUD_SPRITE_FIELDS) {
    const sprite = textOf(object[field]);
    if (sprite === undefined || !sprite.includes(':') || sprite.startsWith('minecraft:')) continue;
    const path = hudSpritePath(target, sprite);
    if (path === undefined) continue;
    const [, owner, ...rest] = path.split('/');
    const inner = rest.join('/');
    const found = project.namespaces.some(
      (entry) => entry.name === owner && entry.assets.some((asset) => asset.path === inner),
    );
    if (!found) out.push({ field, sprite, path });
  }
  return out;
}

/** Every HUD element of the project. */
export const projectHuds = (project: Project): Element[] => elementsOfKind(project, HUD_KIND);

/** Whether `value` is an object (a `max` given as another value). */
export const isValueObject = isObject;
