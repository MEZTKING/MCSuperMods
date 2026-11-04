/**
 * The Studio registry (plan D7): `ElementForm` asks {@link studioFor} which Studio edits an
 * element. The built-in Studios (language files, pack settings, functions, recipes, tags) are
 * listed by `ElementForm`; every other area adds a `studios/<area>/studios.tsx` file that
 * exports `studios: StudioEntry[]` (or a default export of the same), discovered here with
 * `import.meta.glob`, so new Studios never edit a shared file.
 *
 * @packageDocumentation
 */

import type { Element } from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import type { StudioEntry } from './types';

function isStudioEntry(value: unknown): value is StudioEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<StudioEntry>;
  return (
    typeof entry.id === 'string' &&
    entry.id !== '' &&
    (typeof entry.component === 'function' ||
      (typeof entry.component === 'object' && entry.component !== null)) &&
    (typeof entry.kindId === 'string' || typeof entry.matches === 'function')
  );
}

/**
 * The Studio entries of glob-imported area modules, by module path then entry order.
 *
 * @param modules - `import.meta.glob('./*\/studios.tsx', { eager: true })`: each module
 *   exports `studios` (or a default export) as a list of {@link StudioEntry}.
 * @throws Error If a module exports no list, or an entry lacks an id, a component, or both
 *   `kindId` and `matches`.
 */
export function collectStudios(modules: Readonly<Record<string, unknown>>): StudioEntry[] {
  const out: StudioEntry[] = [];
  for (const path of Object.keys(modules).sort()) {
    const module = modules[path] as { studios?: unknown; default?: unknown } | null | undefined;
    const list = module?.studios ?? module?.default;
    if (!Array.isArray(list)) {
      throw new Error(`${path} must export "studios", a list of Studio entries.`);
    }
    for (const entry of list) {
      if (!isStudioEntry(entry)) {
        throw new Error(
          `${path} has a Studio entry without an id, a component, or a kindId or matches.`,
        );
      }
      out.push(entry);
    }
  }
  return out;
}

/**
 * Merges Studio lists in order; the first entry with a given id wins.
 *
 * @param lists - For example the built-in Studios, then the discovered ones.
 */
export function mergeStudios(...lists: readonly (readonly StudioEntry[])[]): StudioEntry[] {
  const seen = new Set<string>();
  const out: StudioEntry[] = [];
  for (const entry of lists.flat()) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

/** Whether `entry` edits `element` of `kind`. */
export function studioMatches(entry: StudioEntry, element: Element, kind: ElementKind): boolean {
  if (entry.kindId !== undefined && entry.kindId !== element.kind) return false;
  return entry.matches === undefined || entry.matches(element, kind);
}

/**
 * The first Studio in `entries` that edits `element`, or `undefined` for the schema form.
 *
 * @param element - The selected element.
 * @param kind - Its registered kind.
 * @param entries - The Studios, in priority order.
 */
export function studioFor(
  element: Element,
  kind: ElementKind,
  entries: readonly StudioEntry[],
): StudioEntry | undefined {
  return entries.find((entry) => studioMatches(entry, element, kind));
}

/** The Studios of every `studios/<area>/studios.tsx` file. */
export const DISCOVERED_STUDIOS: readonly StudioEntry[] = Object.freeze(
  collectStudios(import.meta.glob('./*/studios.tsx', { eager: true })),
);
