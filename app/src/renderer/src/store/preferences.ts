/**
 * View preferences (ADR 0047): the Easy or Advanced mode and the collapsed sidebar groups.
 * Kept in the renderer's local storage: they change no file, and a fresh profile (test runs)
 * starts in Advanced mode, today's interface. Storage failures are ignored.
 *
 * @packageDocumentation
 */

import { create } from 'zustand';

/** Easy hides technical content and Raw JSON; Advanced shows everything. */
export type UiMode = 'easy' | 'advanced';

const STORAGE_KEY = 'msm.preferences.v1';

interface StoredPreferences {
  mode?: UiMode;
  collapsed?: string[];
  centrePreview?: boolean;
}

/** The preferences store's shape. */
export interface PreferencesState {
  mode: UiMode;
  /** Whether a mode was ever chosen (or stored); a new install may then default to Easy. */
  modeChosen: boolean;
  /** Sidebar group keys (`<namespace>/<group>`) the user collapsed. */
  collapsed: ReadonlySet<string>;
  /** Whether the editor shows the live preview beside the form (ADR 0047 D4). */
  centrePreview: boolean;
  toggleCentrePreview(): void;
  setMode(mode: UiMode): void;
  toggleCollapsed(key: string): void;
}

function readStored(): StoredPreferences {
  try {
    const text = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (text === null || text === undefined) return {};
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as StoredPreferences) : {};
  } catch {
    return {};
  }
}

function writeStored(state: Pick<PreferencesState, 'mode' | 'collapsed' | 'centrePreview'>): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: state.mode,
        collapsed: [...state.collapsed].sort(),
        centrePreview: state.centrePreview,
      }),
    );
  } catch {
    // Storage is unavailable: preferences last for this run only.
  }
}

const stored = readStored();

export const usePreferences = create<PreferencesState>((set, get) => ({
  mode: stored.mode === 'easy' ? 'easy' : 'advanced',
  modeChosen: stored.mode === 'easy' || stored.mode === 'advanced',
  collapsed: new Set(
    Array.isArray(stored.collapsed)
      ? stored.collapsed.filter((key) => typeof key === 'string')
      : [],
  ),
  centrePreview: stored.centrePreview !== false,
  toggleCentrePreview() {
    set({ centrePreview: !get().centrePreview });
    writeStored(get());
  },
  setMode(mode) {
    set({ mode, modeChosen: true });
    writeStored(get());
  },
  toggleCollapsed(key) {
    const collapsed = new Set(get().collapsed);
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    set({ collapsed });
    writeStored(get());
  },
}));
