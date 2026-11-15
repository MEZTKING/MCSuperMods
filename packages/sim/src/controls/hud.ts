/**
 * HUD elements in Try it (B429, ADR 0089): the project's lowered `msm/<ns>/hud/<path>.json`
 * definitions, what each shows now and whether it is drawn, following the runtime's
 * `MsmHudLayer`, `HudServer` and `HudValues` (read only to match them). The view lays them out
 * and draws them; this module holds no drawing.
 *
 * - **Shown.** `show_hud` and `hide_hud` decide; before either, an element is shown unless it
 *   `starts_hidden`. A shown element is drawn when its `show` holds: `always`; `when_set` once it
 *   has a value (a `player` value always has one); `in_vehicle` while the player rides a project
 *   vehicle (of type `vehicle` when given); `driving` while the player drives one.
 * - **Values** (ADR 0089 D2): `set` only what `set_hud` sets; `player` the player's own stats
 *   (x, y and z as block coordinates; the preview has no health, food, air, armour or level, so
 *   it shows full health, food and air and no armour or levels, and says so); `vehicle` the
 *   ridden vehicle's fuel (ticks), health (its most less the damage, two decimals) and speed
 *   (blocks a second, one decimal); ammunition and reload, scores and saved data (script data
 *   and Rules counters) are kept only in the game, so they show only what `set_hud` sets, and
 *   each is said once. A `set_hud` on a computed value lasts until the computed value changes,
 *   as the runtime's next differing update replaces it; on a `player` value it does nothing
 *   (the game's client reads its own stats).
 * - **Max.** A number, or a value read as above; a bar or icons count 20 until it has a number.
 *
 * The runtime sends values every five ticks; the preview computes them whenever the view asks.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { readJsonFile } from '../blocks/catalogue.js';
import { plainName } from '../events/definitions.js';
import type { SimFiles, SimLog, SimOrigin, Vec3 } from '../types.js';
import type { CatalogueVehicle } from '../vehicles/catalogue.js';
import type { VehicleSnapshot } from '../vehicles/vehicle-world.js';

/** The three looks (ADR 0089 D1). */
export type HudType = 'text' | 'bar' | 'icons';
/** When an element is drawn. */
export type HudShow = 'always' | 'when_set' | 'in_vehicle' | 'driving';
/** What an element shows: a number, a text, or nothing yet. */
export type HudValueNow = number | string | null;

/** The default `max` of bars and icons (`HudDefinition.DEFAULT_MAX`). */
export const DEFAULT_HUD_MAX = 20;
/** The longest text a value may be (`HudPayload.MAX_TEXT`). */
export const MAX_HUD_TEXT = 256;
/** The default `text` (ADR 0089 D1). */
export const DEFAULT_HUD_TEXT_TEMPLATE = '{value}';

/**
 * What the preview shows for the player's stats it does not have: full health, food and air,
 * no armour and no levels (the game reads its own).
 */
export const UNSIMULATED_PLAYER_STATS: Readonly<Record<string, number>> = Object.freeze({
  health: 20,
  food: 20,
  air: 20,
  armor: 0,
  level: 0,
});

const STAT_WORDS: Readonly<Record<string, string>> = {
  health: 'health',
  food: 'food',
  air: 'air',
  armor: 'armour',
  level: 'experience level',
};

/** One HUD element of the project. */
export interface CatalogueHud {
  readonly id: string;
  /** Its name in plain words (HUD elements have no lang entry). */
  readonly displayName: string;
  /** The definition as lowered: the view reads its look (sizes, colours, sprites) from it. */
  readonly definition: JsonObject;
  readonly type: HudType;
  readonly show: HudShow;
  readonly vehicle?: string;
  readonly startsHidden: boolean;
  /** `text` resolved through the project's `en_us` when it names a lang key; else as written. */
  readonly text: string;
  readonly value: JsonObject;
  /** A number, or a value object. */
  readonly max: number | JsonObject;
  readonly origin: SimOrigin;
}

/** One element the view draws this frame. */
export interface HudFrameItem {
  readonly hud: CatalogueHud;
  readonly value: HudValueNow;
  /** `max` as a number or text, or `null` when read from a value that has none yet. */
  readonly max: HudValueNow;
}

/** What the HUD reads from the area. */
export interface HudHost {
  /** The player's feet. */
  position(): Vec3;
  /** The ridden vehicle's snapshot and type, or `null` on foot. */
  riding(): { readonly snapshot: VehicleSnapshot; readonly vehicle?: CatalogueVehicle } | null;
  readonly log: SimLog;
}

const HUD_PATH = /^msm\/([a-z0-9_.-]+)\/hud\/([a-z0-9_./-]+)\.json$/;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const round = (value: number, scale: number): number => Math.round(value * scale) / scale;

/** Reads every HUD element of the lowered files, sorted by id (the runtime's index order). */
export function readHudElements(
  files: SimFiles,
  target: { readonly folders: { readonly resource: { readonly lang: string } } },
): readonly CatalogueHud[] {
  const langs = new Map<string, JsonObject>();
  const langOf = (namespace: string): JsonObject => {
    let lang = langs.get(namespace);
    if (lang === undefined) {
      const json = readJsonFile(
        files,
        `assets/${namespace}/${target.folders.resource.lang}/en_us.json`,
      );
      lang = isRecord(json) ? json : {};
      langs.set(namespace, lang);
    }
    return lang;
  };
  const out: CatalogueHud[] = [];
  for (const path of [...files.keys()].filter((one) => HUD_PATH.test(one))) {
    const match = HUD_PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const id = `${namespace}:${match[2] as string}`;
    const d = readJsonFile(files, path);
    if (!isRecord(d)) continue;
    const type: HudType = d.type === 'bar' || d.type === 'icons' ? d.type : 'text';
    const show: HudShow =
      d.show === 'always' || d.show === 'in_vehicle' || d.show === 'driving' ? d.show : 'when_set';
    const vehicle = show === 'in_vehicle' || show === 'driving' ? str(d.vehicle) : undefined;
    const written = str(d.text) ?? DEFAULT_HUD_TEXT_TEMPLATE;
    const translated = written.includes(' ') ? undefined : str(langOf(namespace)[written]);
    const max = isRecord(d.max)
      ? d.max
      : typeof d.max === 'number' && Number.isFinite(d.max)
        ? d.max
        : DEFAULT_HUD_MAX;
    out.push(
      Object.freeze({
        id,
        displayName: plainName(id),
        definition: d,
        type,
        show,
        ...(vehicle === undefined ? {} : { vehicle }),
        startsHidden: d.starts_hidden === true,
        text: translated ?? written,
        value: isRecord(d.value) ? d.value : { source: 'set' },
        max,
        origin: Object.freeze({ elementId: id }),
      }),
    );
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return Object.freeze(out);
}

/** A value set by `set_hud`, with the computed value it was set over. */
interface SetValue {
  readonly value: number | string;
  readonly over: HudValueNow;
}

/** The HUD of one area; see the module comment. */
export class SimHud {
  private elementsNow: readonly CatalogueHud[];
  private byId: Map<string, CatalogueHud>;
  private readonly host: HudHost;
  private readonly visible = new Map<string, boolean>();
  private readonly setValues = new Map<string, SetValue>();
  private revisionCount = 0;

  constructor(elements: readonly CatalogueHud[], host: HudHost) {
    this.host = host;
    this.elementsNow = elements;
    this.byId = new Map(elements.map((one) => [one.id, one]));
    this.sayUnsimulated();
  }

  /** The project's HUD elements, by id. */
  get elements(): readonly CatalogueHud[] {
    return this.elementsNow;
  }

  /** Grows by one on every show, hide and set (the view redraws). */
  get revision(): number {
    return this.revisionCount;
  }

  /** Takes the elements of new files; shown, hidden and set values of kept ids stay. */
  setElements(elements: readonly CatalogueHud[]): void {
    this.elementsNow = elements;
    this.byId = new Map(elements.map((one) => [one.id, one]));
    for (const id of [...this.visible.keys()]) if (!this.byId.has(id)) this.visible.delete(id);
    for (const id of [...this.setValues.keys()]) if (!this.byId.has(id)) this.setValues.delete(id);
    this.sayUnsimulated();
    this.revisionCount += 1;
  }

  /** The element `id`, if the project has it. */
  get(id: string): CatalogueHud | undefined {
    return this.byId.get(id);
  }

  /** `show_hud`: false for an id the project has no element for. */
  show(id: string): boolean {
    if (!this.byId.has(id)) return false;
    this.visible.set(id, true);
    this.revisionCount += 1;
    return true;
  }

  /** `hide_hud`: false for an unknown id. */
  hide(id: string): boolean {
    if (!this.byId.has(id)) return false;
    this.visible.set(id, false);
    this.revisionCount += 1;
    return true;
  }

  /** `set_hud`: false for an unknown id or a number that is not finite; texts are cut to 256. */
  set(id: string, value: number | string): boolean {
    const hud = this.byId.get(id);
    if (hud === undefined) return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    const kept = typeof value === 'string' ? value.slice(0, MAX_HUD_TEXT) : value;
    this.setValues.set(id, { value: kept, over: this.computed(hud.value) });
    this.revisionCount += 1;
    return true;
  }

  /** Forgets shown, hidden and set values ("Clear the area"). */
  clear(): void {
    this.visible.clear();
    this.setValues.clear();
    this.revisionCount += 1;
  }

  /** What element `id` shows now (`null` for nothing or an unknown id). */
  valueOf(id: string): HudValueNow {
    const hud = this.byId.get(id);
    return hud === undefined ? null : this.current(hud);
  }

  /** The elements drawn now, in index (id) order. */
  frame(): HudFrameItem[] {
    const out: HudFrameItem[] = [];
    for (const hud of this.elementsNow) {
      const value = this.current(hud);
      if (!this.drawn(hud, value)) continue;
      const max = typeof hud.max === 'number' ? hud.max : this.computedOrSet(hud.max, undefined);
      out.push({ hud, value, max });
    }
    return out;
  }

  private drawn(hud: CatalogueHud, value: HudValueNow): boolean {
    const shown = this.visible.get(hud.id);
    if (shown !== undefined ? !shown : hud.startsHidden) return false;
    const riding = this.host.riding();
    const matches =
      riding !== null && (hud.vehicle === undefined || hud.vehicle === riding.snapshot.type);
    switch (hud.show) {
      case 'always':
        return true;
      case 'in_vehicle':
        return matches;
      case 'driving':
        return matches && riding?.snapshot.driven === true;
      default:
        return value !== null;
    }
  }

  private current(hud: CatalogueHud): HudValueNow {
    return this.computedOrSet(hud.value, hud.id);
  }

  /** A value's computed value, replaced by a set one until the computed one changes. */
  private computedOrSet(value: JsonObject, id: string | undefined): HudValueNow {
    const computed = this.computed(value);
    if (value.source === 'player') return computed;
    if (id === undefined) return computed;
    const set = this.setValues.get(id);
    if (set === undefined) return computed;
    if (set.over !== computed) {
      this.setValues.delete(id);
      return computed;
    }
    return set.value;
  }

  /** What a value is now in the preview (`null` for nothing to show). */
  private computed(value: JsonObject): HudValueNow {
    switch (value.source) {
      case 'player': {
        const stat = str(value.stat) ?? 'health';
        const feet = this.host.position();
        if (stat === 'x') return Math.floor(feet.x);
        if (stat === 'y') return Math.floor(feet.y);
        if (stat === 'z') return Math.floor(feet.z);
        return UNSIMULATED_PLAYER_STATS[stat] ?? null;
      }
      case 'vehicle': {
        const riding = this.host.riding();
        if (riding === null) return null;
        const { snapshot } = riding;
        switch (value.stat) {
          case 'fuel':
            return snapshot.fuel;
          case 'health':
            return round(Math.max(0, snapshot.maxHealth - snapshot.damage), 100);
          case 'speed': {
            const p = snapshot.position;
            const q = snapshot.previousPosition;
            return round(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) * 20, 10);
          }
          default:
            return null;
        }
      }
      default:
        return null;
    }
  }

  /** Says once what each element shows that the preview does not keep. */
  private sayUnsimulated(): void {
    for (const hud of this.elementsNow) {
      for (const [value, which] of [
        [hud.value, 'shows'],
        ...(typeof hud.max === 'number' ? [] : [[hud.max, 'counts its most from'] as const]),
      ] as const) {
        const line = unsimulatedLine(hud.displayName, which, value);
        if (line !== undefined) this.host.log.onlyInMinecraft(line, hud.origin);
      }
    }
  }
}

/** The "Only in Minecraft" line of a value the preview does not keep, if it is one. */
function unsimulatedLine(name: string, which: string, value: JsonObject): string | undefined {
  switch (value.source) {
    case 'score':
      return `${name} ${which} the score ${str(value.objective) ?? ''}: scores are kept only in the game, so the preview shows only what an action sets`;
    case 'data':
      return `${name} ${which} saved data ${str(value.namespace) ?? ''}:${str(value.key) ?? ''}: saved data and Rules counters are kept only in the game, so the preview shows only what an action sets`;
    case 'player': {
      const stat = str(value.stat) ?? 'health';
      const shown = UNSIMULATED_PLAYER_STATS[stat];
      if (shown === undefined) return undefined;
      return `${name} ${which} your ${STAT_WORDS[stat] ?? stat}: the preview has none, so it shows ${shown}`;
    }
    case 'vehicle':
      if (value.stat === 'ammo' || value.stat === 'reload') {
        return `${name} ${which} a vehicle's ${value.stat === 'ammo' ? 'ammunition' : 'reload time'}: weapons are only in the game, so the preview shows only what an action sets`;
      }
      return undefined;
    default:
      return undefined;
  }
}
