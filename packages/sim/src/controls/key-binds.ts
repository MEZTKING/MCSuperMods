/**
 * The project's key binds as Try it reads them (B429, ADR 0088 D3): every lowered definition
 * `msm/<ns>/key_bind/<path>.json` with its defaults resolved as the runtime's
 * `KeyBindDefinition` resolves them (`when` always, no vehicle, `cooldown_ticks` 0,
 * `hold_interval_ticks` 10), its name from `en_us` (the `name` field's key, else
 * `key.<ns>.<path>` with `/` as `.`), and its events as an event owner the trigger engine runs.
 * The owner has kind `item`: the runtime runs key events with an item's context
 * (`EventContext.forItem`, the player self, other and actor).
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { readJsonFile } from '../blocks/catalogue.js';
import { type EventOwner, plainName } from '../events/definitions.js';
import type { SimFiles, SimOrigin } from '../types.js';

/** When a key works (ADR 0088 D3), checked at press time. */
export type KeyWhen = 'always' | 'on_foot' | 'in_vehicle' | 'driving';

/** `cooldown_ticks` default. */
export const DEFAULT_KEY_COOLDOWN_TICKS = 0;
/** `hold_interval_ticks` default. */
export const DEFAULT_HOLD_INTERVAL_TICKS = 10;

/** One key bind of the project, every default resolved. */
export interface CatalogueKeyBind {
  /** Its id, also the payload id the game's client sends. */
  readonly id: string;
  readonly displayName: string;
  /** The default key, a game key name such as `key.keyboard.k` or `key.mouse.4`. */
  readonly defaultKey: string;
  readonly when: KeyWhen;
  /** With `in_vehicle` or `driving`: only this vehicle type. */
  readonly vehicle?: string;
  readonly cooldownTicks: number;
  readonly holdIntervalTicks: number;
  /** The event ids of `msm:on_press`, `msm:on_release` and `msm:while_held`. */
  readonly onPress?: string;
  readonly onRelease?: string;
  readonly whileHeld?: string;
  /** The events as the trigger engine runs them. */
  readonly owner: EventOwner;
  readonly origin: SimOrigin;
}

/** The project's key binds. */
export interface KeyBindCatalogue {
  /** Key bind ids, sorted. */
  ids(): readonly string[];
  get(id: string): CatalogueKeyBind | undefined;
  /** The key binds whose default key is `key`, in id order. */
  onKey(key: string): readonly CatalogueKeyBind[];
}

const KEY_BIND_PATH = /^msm\/([a-z0-9_.-]+)\/key_bind\/([a-z0-9_./-]+)\.json$/;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const int = (value: Json | undefined, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;

const WHENS: readonly KeyWhen[] = ['always', 'on_foot', 'in_vehicle', 'driving'];

/** The events of a definition by id: each an ordered list of actions. */
function eventsOf(definition: JsonObject): Map<string, readonly JsonObject[]> {
  const out = new Map<string, readonly JsonObject[]>();
  const events = isRecord(definition.events) ? definition.events : {};
  for (const [id, event] of Object.entries(events)) {
    const actions = isRecord(event) && Array.isArray(event.actions) ? event.actions : [];
    out.set(id, Object.freeze(actions.filter(isRecord)));
  }
  return out;
}

/**
 * The words of a game key name: `key.keyboard.left.alt` is "Left Alt", `key.keyboard.k` is
 * "K", `key.mouse.left` is "Left mouse button", `key.mouse.4` is "Mouse button 4"; anything
 * else is given back as it is.
 */
export function keyLabel(name: string): string {
  const match = /^key\.(keyboard|mouse)\.(.+)$/.exec(name);
  if (match === null) return name;
  const [, device, rest = ''] = match;
  if (device === 'mouse') {
    const words: Record<string, string> = {
      left: 'Left mouse button',
      middle: 'Middle mouse button',
      right: 'Right mouse button',
    };
    return words[rest] ?? `Mouse button ${rest}`;
  }
  return rest
    .split('.')
    .map((part) => (part.length === 0 ? part : `${part[0]?.toUpperCase()}${part.slice(1)}`))
    .join(' ');
}

/** Reads every key bind definition of the lowered files. */
export function buildKeyBindCatalogue(
  files: SimFiles,
  target: { readonly folders: { readonly resource: { readonly lang: string } } },
): KeyBindCatalogue {
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
  const byId = new Map<string, CatalogueKeyBind>();
  const paths = [...files.keys()].filter((path) => KEY_BIND_PATH.test(path)).sort();
  for (const path of paths) {
    const match = KEY_BIND_PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const keyPath = match[2] as string;
    const id = `${namespace}:${keyPath}`;
    const d = readJsonFile(files, path);
    if (!isRecord(d)) continue;
    const origin: SimOrigin = Object.freeze({ elementId: id });
    const nameKey = str(d.name) ?? `key.${namespace}.${keyPath.replaceAll('/', '.')}`;
    const displayName = str(langOf(namespace)[nameKey]) ?? plainName(id);
    const when = WHENS.includes(d.when as KeyWhen) ? (d.when as KeyWhen) : 'always';
    const vehicle = when === 'in_vehicle' || when === 'driving' ? str(d.vehicle) : undefined;
    const onPress = str(d['msm:on_press']);
    const onRelease = str(d['msm:on_release']);
    const whileHeld = str(d['msm:while_held']);
    byId.set(
      id,
      Object.freeze({
        id,
        displayName,
        defaultKey: str(d.default_key) ?? 'key.keyboard.unknown',
        when,
        ...(vehicle === undefined ? {} : { vehicle }),
        cooldownTicks: int(d.cooldown_ticks, DEFAULT_KEY_COOLDOWN_TICKS, 0, 1200),
        holdIntervalTicks: int(d.hold_interval_ticks, DEFAULT_HOLD_INTERVAL_TICKS, 1, 1200),
        ...(onPress === undefined ? {} : { onPress }),
        ...(onRelease === undefined ? {} : { onRelease }),
        ...(whileHeld === undefined ? {} : { whileHeld }),
        owner: Object.freeze({
          id,
          kind: 'item' as const,
          displayName,
          events: eventsOf(d),
          triggers: new Map(),
          origin,
        }),
        origin,
      }),
    );
  }
  const ids = Object.freeze([...byId.keys()].sort());
  const byKey = new Map<string, CatalogueKeyBind[]>();
  for (const id of ids) {
    const bind = byId.get(id) as CatalogueKeyBind;
    const list = byKey.get(bind.defaultKey) ?? [];
    list.push(bind);
    byKey.set(bind.defaultKey, list);
  }
  return {
    ids: () => ids,
    get: (id) => byId.get(id),
    onKey: (key) => byKey.get(key) ?? [],
  };
}
