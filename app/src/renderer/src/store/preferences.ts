/**
 * View preferences (ADR 0047, ADR 0083 D1, ADR 0118 D1, D8): the Very easy, Easy or Advanced
 * mode, the collapsed sidebar groups and the showcase's setting and fold. Kept in the renderer's local storage: they change no file, and a
 * fresh profile (test runs) starts in Advanced mode, today's interface; a brand-new install is
 * moved to Very easy by the Welcome (`App.tsx`). Storage failures are ignored.
 *
 * @packageDocumentation
 */

import { create } from 'zustand';

/**
 * Very easy shows Home, Play and plain words only (ADR 0083); Easy hides technical content and
 * Raw JSON; Advanced shows everything.
 */
export type UiMode = 'very-easy' | 'easy' | 'advanced';

/** The modes in the order the mode switch shows them, with their labels and one sentence. */
export const UI_MODES: readonly { mode: UiMode; label: string; sentence: string }[] = [
  {
    mode: 'very-easy',
    label: 'Very easy',
    sentence: 'Big picture tiles, Play and plain words. No code and no files to look at.',
  },
  {
    mode: 'easy',
    label: 'Easy',
    sentence: 'Your things first, the files behind them folded away, the forms only.',
  },
  {
    mode: 'advanced',
    label: 'Advanced',
    sentence: 'Every file, kind ids and Raw JSON.',
  },
];

/** Whether a stored value is a mode name. */
export function isUiMode(value: unknown): value is UiMode {
  return value === 'very-easy' || value === 'easy' || value === 'advanced';
}

const STORAGE_KEY = 'msm.preferences.v1';

interface StoredPreferences {
  mode?: UiMode;
  collapsed?: string[];
  centrePreview?: boolean;
  showcaseClips?: boolean;
  showcaseOpen?: boolean;
}

/** The preferences store's shape. */
export interface PreferencesState {
  mode: UiMode;
  /** Whether a mode was ever chosen (or stored); a new install may then default to Very easy. */
  modeChosen: boolean;
  /** Sidebar group keys (`<namespace>/<group>`) the user collapsed. */
  collapsed: ReadonlySet<string>;
  /** Whether the editor shows the live preview beside the form (ADR 0047 D4). */
  centrePreview: boolean;
  /**
   * The setting **Play showcase clips** (ADR 0118 D8): clips on Home and in New project play by
   * themselves. Default on; off shows still pictures.
   */
  showcaseClips: boolean;
  /**
   * Whether Home shows **See what you can make** for a mod that already has things (ADR 0118
   * D1): folded to a **Show what you can make** link by default, remembered once opened.
   */
  showcaseOpen: boolean;
  setShowcaseClips(on: boolean): void;
  setShowcaseOpen(open: boolean): void;
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

function writeStored(
  state: Pick<
    PreferencesState,
    'mode' | 'collapsed' | 'centrePreview' | 'showcaseClips' | 'showcaseOpen'
  >,
): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: state.mode,
        collapsed: [...state.collapsed].sort(),
        centrePreview: state.centrePreview,
        showcaseClips: state.showcaseClips,
        showcaseOpen: state.showcaseOpen,
      }),
    );
  } catch {
    // Storage is unavailable: preferences last for this run only.
  }
}

const stored = readStored();

export const usePreferences = create<PreferencesState>((set, get) => ({
  mode: isUiMode(stored.mode) ? stored.mode : 'advanced',
  modeChosen: isUiMode(stored.mode),
  collapsed: new Set(
    Array.isArray(stored.collapsed)
      ? stored.collapsed.filter((key) => typeof key === 'string')
      : [],
  ),
  centrePreview: stored.centrePreview !== false,
  showcaseClips: stored.showcaseClips !== false,
  showcaseOpen: stored.showcaseOpen === true,
  setShowcaseClips(on) {
    set({ showcaseClips: on });
    writeStored(get());
  },
  setShowcaseOpen(open) {
    set({ showcaseOpen: open });
    writeStored(get());
  },
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
