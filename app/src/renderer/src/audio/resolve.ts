/**
 * Resolves a sound event id to its entries through the project's `sounds.json`, then vanilla's
 * (ADR 0121 D2; B620 interface, B622). The rules are the game's sound manager's:
 *
 * - The project's entry for an event is added to vanilla's, unless it says `replace: true`, which
 *   drops vanilla's entries. Its subtitle wins over vanilla's.
 * - An entry is a file name (a string, or `{ name }` with `type` `file`, the default) or another
 *   event (`type: "event"`), followed once. An event entry weighs as much as the event it names
 *   (the sum of that event's weights) and, when picked, plays one of that event's files with
 *   both volumes and both pitches multiplied, streamed when either says so.
 * - A file name without a namespace is `minecraft:` (as the game parses it); its file is
 *   `assets/<namespace>/sounds/<path>.ogg`, the project's own first, else Minecraft's.
 * - Volume, pitch and weight default to 1, `stream` to false.
 *
 * Pure: no DOM and no platform.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';

/** One entry of a sound event. */
export interface SoundEntry {
  /** The name as written (`mob/wolf/bark1`, `my_mod:hum`, an event id for `type: "event"`). */
  name: string;
  type: 'file' | 'event';
  volume: number;
  pitch: number;
  /** For an event entry: the weight of the event it names (0 when it names nothing). */
  weight: number;
  stream: boolean;
  /** For an event entry: the entries of the event it names, followed once. */
  followed?: readonly SoundEntry[];
}

/** A resolved event. */
export interface ResolvedSound {
  event: string;
  /** Where the event's entries come from: the project's file (alone or added), vanilla's, none. */
  origin: 'project' | 'vanilla' | 'missing';
  subtitle?: string;
  entries: SoundEntry[];
}

/** A picked file. */
export interface PickedSound {
  /** The file entry played, its volume, pitch and stream already combined with an event entry's. */
  entry: SoundEntry;
  /** The file: `assets/<namespace>/sounds/<path>.ogg`; vanilla's when the namespace is Minecraft's. */
  file: { namespace: string; path: string; origin: 'project' | 'vanilla' };
}

type JsonObject = { [key: string]: Json };

const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

/** `namespace:path` split, with `minecraft` for a bare path. */
export function splitSoundId(id: string): { namespace: string; path: string } {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
}

const numberOr = (value: Json | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** The entries of one event registration as written (event entries not yet followed). */
function entriesOf(registration: JsonObject): SoundEntry[] {
  const list = Array.isArray(registration.sounds) ? registration.sounds : [];
  const out: SoundEntry[] = [];
  for (const raw of list) {
    if (typeof raw === 'string') {
      if (raw !== '') {
        out.push({ name: raw, type: 'file', volume: 1, pitch: 1, weight: 1, stream: false });
      }
      continue;
    }
    const object = asObject(raw);
    if (object === undefined || typeof object.name !== 'string' || object.name === '') continue;
    out.push({
      name: object.name,
      type: object.type === 'event' ? 'event' : 'file',
      volume: numberOr(object.volume, 1),
      pitch: numberOr(object.pitch, 1),
      weight: Math.max(0, Math.floor(numberOr(object.weight, 1))),
      stream: object.stream === true,
    });
  }
  return out;
}

/** An event's registrations: the project's (by the event's namespace) and vanilla's. */
function registrationsOf(
  id: string,
  projectSounds: Readonly<Record<string, Json>>,
  vanillaSounds: Json | null,
): { project?: JsonObject; vanilla?: JsonObject } {
  const { namespace, path } = splitSoundId(id);
  const project = asObject(asObject(projectSounds[namespace])?.[path]);
  const vanilla =
    namespace === 'minecraft' ? asObject(asObject(vanillaSounds ?? undefined)?.[path]) : undefined;
  return {
    ...(project === undefined ? {} : { project }),
    ...(vanilla === undefined ? {} : { vanilla }),
  };
}

/** The merged entries of an event, without following event entries. */
function mergedEntries(
  id: string,
  projectSounds: Readonly<Record<string, Json>>,
  vanillaSounds: Json | null,
): { origin: ResolvedSound['origin']; subtitle?: string; entries: SoundEntry[] } {
  const { project, vanilla } = registrationsOf(id, projectSounds, vanillaSounds);
  if (project === undefined && vanilla === undefined) return { origin: 'missing', entries: [] };
  const replace = project?.replace === true;
  const entries = [
    ...(vanilla !== undefined && !replace ? entriesOf(vanilla) : []),
    ...(project === undefined ? [] : entriesOf(project)),
  ];
  const subtitle =
    typeof project?.subtitle === 'string'
      ? project.subtitle
      : typeof vanilla?.subtitle === 'string' && !replace
        ? vanilla.subtitle
        : undefined;
  return {
    origin: project !== undefined ? 'project' : 'vanilla',
    ...(subtitle === undefined ? {} : { subtitle }),
    entries,
  };
}

/** The total weight of a list of entries. */
export const totalWeight = (entries: readonly SoundEntry[]): number =>
  entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);

/** Resolves an event; see the module comment. `projectSounds` is each namespace's `sounds.json`. */
export function resolveSoundEvent(
  id: string,
  projectSounds: Readonly<Record<string, Json>>,
  vanillaSounds: Json | null,
): ResolvedSound {
  const event = id.includes(':') ? id : `minecraft:${id}`;
  const merged = mergedEntries(event, projectSounds, vanillaSounds);
  const entries = merged.entries.map((entry): SoundEntry => {
    if (entry.type !== 'event') return entry;
    // Followed once: the named event's own event entries weigh nothing and play nothing.
    const named = mergedEntries(entry.name, projectSounds, vanillaSounds).entries.filter(
      (one) => one.type === 'file',
    );
    return { ...entry, weight: totalWeight(named), followed: named };
  });
  return {
    event,
    origin: merged.origin,
    ...(merged.subtitle === undefined ? {} : { subtitle: merged.subtitle }),
    entries,
  };
}

/** Picks one entry of `entries` by weight; `random` gives a number in [0, 1). */
function pickWeighted(
  entries: readonly SoundEntry[],
  random: () => number,
): SoundEntry | undefined {
  const total = totalWeight(entries);
  if (total <= 0) return undefined;
  let left = Math.floor(Math.min(0.999_999_999, Math.max(0, random())) * total);
  for (const entry of entries) {
    const weight = Math.max(0, entry.weight);
    if (left < weight) return entry;
    left -= weight;
  }
  return undefined;
}

/** The picked file of a file entry. */
function fileOf(entry: SoundEntry): PickedSound['file'] {
  const { namespace, path } = splitSoundId(entry.name);
  return { namespace, path, origin: namespace === 'minecraft' ? 'vanilla' : 'project' };
}

/** Picks a file by weight, as the game does; `null` when the event has nothing to play. */
export function pickEntry(resolved: ResolvedSound, random: () => number): PickedSound | null {
  const first = pickWeighted(resolved.entries, random);
  if (first === undefined) return null;
  if (first.type === 'file') return { entry: first, file: fileOf(first) };
  const inner = pickWeighted(first.followed ?? [], random);
  if (inner === undefined) return null;
  const entry: SoundEntry = {
    name: inner.name,
    type: 'file',
    volume: inner.volume * first.volume,
    pitch: inner.pitch * first.pitch,
    weight: first.weight,
    stream: inner.stream || first.stream,
  };
  return { entry, file: fileOf(entry) };
}

/** The chance (0 to 1) of each file of an event, for a view that lists them. */
export function fileChances(resolved: ResolvedSound): { name: string; chance: number }[] {
  const total = totalWeight(resolved.entries);
  if (total <= 0) return [];
  const out = new Map<string, number>();
  for (const entry of resolved.entries) {
    const share = Math.max(0, entry.weight) / total;
    if (entry.type === 'file') {
      out.set(entry.name, (out.get(entry.name) ?? 0) + share);
      continue;
    }
    const inner = totalWeight(entry.followed ?? []);
    for (const one of entry.followed ?? []) {
      if (inner <= 0) break;
      out.set(one.name, (out.get(one.name) ?? 0) + (share * Math.max(0, one.weight)) / inner);
    }
  }
  return [...out].map(([name, chance]) => ({ name, chance }));
}
