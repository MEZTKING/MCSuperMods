/**
 * Data lookups for the evaluators (B604): one over the project's lowered files, and the project
 * laid over vanilla's files from the jar (project first, as a data pack over the game's own). A
 * layered lookup keeps both layers, so tags can merge them as the game does (B600's 2S5).
 */

import type { Json } from '@msm/plugin-api';
import type { SimFiles } from '../types.js';
import type { DataLookup } from './api.js';

/** A lookup over the project's files laid over vanilla's, with both layers kept. */
export interface LayeredLookup extends DataLookup {
  readonly project: DataLookup;
  readonly vanilla: DataLookup;
}

/** `stone` means `minecraft:stone`; a leading `#` is dropped. */
export function normaliseId(id: string): string {
  const bare = id.startsWith('#') ? id.slice(1) : id;
  return bare.includes(':') ? bare : `minecraft:${bare}`;
}

/** A registry or type name without `minecraft:` (`minecraft:item` is `item`). */
export function bareName(name: string): string {
  return name.startsWith('minecraft:') ? name.slice('minecraft:'.length) : name;
}

/** A lookup that has no files (vanilla before the Minecraft folder is set up). */
export const NO_FILES: DataLookup = () => undefined;

/**
 * A lookup over lowered files (`data/<namespace>/<folder>/<path>.json`); each file is parsed
 * once. A file that does not parse answers `undefined`, as a missing one.
 */
export function filesLookup(files: SimFiles): DataLookup {
  const parsed = new Map<string, Json | undefined>();
  const decoder = new TextDecoder();
  return (folder, id) => {
    const full = normaliseId(id);
    const colon = full.indexOf(':');
    const key = `data/${full.slice(0, colon)}/${folder}/${full.slice(colon + 1)}.json`;
    if (parsed.has(key)) return parsed.get(key);
    const raw = files.get(key);
    let value: Json | undefined;
    if (raw !== undefined) {
      try {
        value = JSON.parse(typeof raw === 'string' ? raw : decoder.decode(raw)) as Json;
      } catch {
        value = undefined;
      }
    }
    parsed.set(key, value);
    return value;
  };
}

/** The project's files over vanilla's: a file in the project hides vanilla's of the same id. */
export function layeredLookup(project: DataLookup, vanilla: DataLookup): LayeredLookup {
  const lookup = (folder: string, id: string): Json | undefined =>
    project(folder, id) ?? vanilla(folder, id);
  return Object.assign(lookup, { project, vanilla });
}

/** Whether a lookup keeps its layers (made by {@link layeredLookup}). */
export function isLayered(lookup: DataLookup): lookup is LayeredLookup {
  const candidate = lookup as Partial<LayeredLookup>;
  return typeof candidate.project === 'function' && typeof candidate.vanilla === 'function';
}
