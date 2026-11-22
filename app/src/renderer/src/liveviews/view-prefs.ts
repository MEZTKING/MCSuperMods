/**
 * What a live view remembers per project (ADR 0120 D2): the seed, the situation, the sample item
 * and the sample text. Kept with the app's view preferences in the renderer's local storage,
 * never in the project file; projects are keyed by their root folder and the last
 * {@link MAX_PROJECTS} are kept. Storage failures are ignored (the choice then lasts for this run).
 */

import { create } from 'zustand';

/** One project's choices. */
export interface LiveViewPrefs {
  /** The seed of a roll, as typed. A fixed default: views are pure and seeded. */
  readonly seed: string;
  /** The situation preset's id (B608); empty until the user picks one. */
  readonly situation: string;
  /** The sample item's id for item modifiers and enchantments (B610). */
  readonly sampleItem: string;
  /** The sample text for lines, chat and dialogs (B611). */
  readonly sampleText: string;
}

/** The choices of a project that has made none. */
export const DEFAULT_PREFS: LiveViewPrefs = Object.freeze({
  seed: '1',
  situation: '',
  sampleItem: '',
  sampleText: '',
});

/** Projects whose choices are kept. */
export const MAX_PROJECTS = 50;

const STORAGE_KEY = 'msm.live-view-prefs.v1';

/** Stored choices, checked; the default for anything else. */
export function readPrefs(value: unknown): LiveViewPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const v = value as Record<string, unknown>;
  const text = (key: keyof LiveViewPrefs): string =>
    typeof v[key] === 'string' ? (v[key] as string) : DEFAULT_PREFS[key];
  return {
    seed: text('seed'),
    situation: text('situation'),
    sampleItem: text('sampleItem'),
    sampleText: text('sampleText'),
  };
}

function readStored(): Map<string, LiveViewPrefs> {
  const out = new Map<string, LiveViewPrefs>();
  try {
    const text = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (text === null || text === undefined) return out;
    const parsed = JSON.parse(text) as unknown;
    const projects =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { projects?: unknown }).projects
        : null;
    if (!Array.isArray(projects)) return out;
    for (const entry of projects) {
      if (Array.isArray(entry) && typeof entry[0] === 'string') {
        out.set(entry[0], readPrefs(entry[1]));
      }
    }
  } catch {
    // Unreadable storage: start empty.
  }
  return out;
}

function writeStored(prefs: ReadonlyMap<string, LiveViewPrefs>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ projects: [...prefs] }));
  } catch {
    // Storage is unavailable: the choices last for this run only.
  }
}

/** The store's shape. */
export interface LiveViewPrefsState {
  /** Choices by project root, least recently changed first. */
  prefs: ReadonlyMap<string, LiveViewPrefs>;
  /** Changes part of a project's choices. */
  setPrefs(root: string, patch: Partial<LiveViewPrefs>): void;
  /** Forgets every stored choice (tests). */
  reset(): void;
}

export const useLiveViewPrefs = create<LiveViewPrefsState>((set, get) => ({
  prefs: readStored(),
  setPrefs(root, patch) {
    const next = new Map(get().prefs);
    const before = next.get(root) ?? DEFAULT_PREFS;
    next.delete(root);
    next.set(root, { ...before, ...patch });
    while (next.size > MAX_PROJECTS) next.delete(next.keys().next().value as string);
    set({ prefs: next });
    writeStored(next);
  },
  reset() {
    set({ prefs: new Map() });
    writeStored(new Map());
  },
}));

/** A project's choices (the default for a project with none, or no project). */
export function prefsOf(
  prefs: ReadonlyMap<string, LiveViewPrefs>,
  root: string | null,
): LiveViewPrefs {
  return (root === null ? undefined : prefs.get(root)) ?? DEFAULT_PREFS;
}
