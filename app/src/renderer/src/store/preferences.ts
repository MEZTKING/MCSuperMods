/**
 * View preferences (ADR 0047, ADR 0118 D1, D8, ADR 0124 D11, ADR 0130 D1, ADR 0135 D5): the
 * collapsed sidebar groups, the live preview beside the form, the showcase's setting and fold,
 * the block picture style, **Tell me about test versions of Minecraft** (ADR 0136 D5), and the
 * search's
 * **Remember my searches** with its local history (`search/history.ts`, its own storage key).
 * Kept in the renderer's local storage: they change no file. Storage failures are ignored.
 *
 * There is one mode since ADR 0130: a mode stored by an older version (`very-easy`, `easy` or
 * `advanced`) is read once and dropped at the next write. The state of each More options is
 * kept by `components/ui/MoreOptions.tsx`.
 *
 * @packageDocumentation
 */

import { type BlockPictureStyle, setBlockPictureStyle } from '@msm/plugin-library';
import { create } from 'zustand';
import {
  EMPTY_HISTORY,
  readHistory,
  type SearchHistory,
  withChoice,
  withSearch,
  writeHistory,
} from '../search/history';

const STORAGE_KEY = 'msm.preferences.v1';

interface StoredPreferences {
  /** An older version's mode (ADR 0130 D1): read once, never written again. */
  mode?: unknown;
  collapsed?: string[];
  centrePreview?: boolean;
  showcaseClips?: boolean;
  showcaseOpen?: boolean;
  rememberSearches?: boolean;
  blockStyle?: unknown;
  testVersions?: boolean;
}

/** The preferences store's shape. */
export interface PreferencesState {
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
  /**
   * The base seed of Home's **More ideas** (ADR 0128 D1): idea card *n* is made from a seed
   * derived from it and *n*, so the list is the same each time; **Shuffle** picks a new one.
   * One per install, made on the first run and kept under its own storage key.
   */
  ideasSeed: number;
  /**
   * **Remember my searches** (ADR 0124 D11): the search keeps the last chosen results and
   * searches on this computer. Default on; off forgets them and keeps nothing more.
   */
  rememberSearches: boolean;
  /**
   * **Block picture style** (ADR 0135 D5): which generator draws block faces everywhere in the
   * app, Blockloom's recipes (the default) or MSM's own (`classic`). Kept in the library too
   * (`setBlockPictureStyle`), so every drawing that names no style follows it.
   */
  blockStyle: BlockPictureStyle;
  setBlockStyle(style: BlockPictureStyle): void;
  /**
   * **Tell me about test versions of Minecraft** (ADR 0136 D5): the notice that a newer
   * Minecraft is ready for the open mod also tells about snapshots and pre-releases. Default off:
   * only real releases are told about (test versions stay choosable by hand).
   */
  testVersions: boolean;
  setTestVersions(on: boolean): void;
  /** The local search history (empty while {@link rememberSearches} is off). */
  searchHistory: SearchHistory;
  setRememberSearches(on: boolean): void;
  /** **Clear my searches**: forgets the history (the setting stays as it is). */
  clearSearchHistory(): void;
  /** Notes a chosen result (by entry id), when searches are remembered. */
  rememberSearchChoice(id: string): void;
  /** Notes a search, when searches are remembered. */
  rememberSearchText(text: string): void;
  setShowcaseClips(on: boolean): void;
  setShowcaseOpen(open: boolean): void;
  /** **Shuffle**: a new base seed for More ideas. */
  shuffleIdeas(): void;
  toggleCentrePreview(): void;
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
    | 'collapsed'
    | 'centrePreview'
    | 'showcaseClips'
    | 'showcaseOpen'
    | 'rememberSearches'
    | 'blockStyle'
    | 'testVersions'
  >,
): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        collapsed: [...state.collapsed].sort(),
        centrePreview: state.centrePreview,
        showcaseClips: state.showcaseClips,
        showcaseOpen: state.showcaseOpen,
        rememberSearches: state.rememberSearches,
        blockStyle: state.blockStyle,
        testVersions: state.testVersions,
      }),
    );
  } catch {
    // Storage is unavailable: preferences last for this run only.
  }
}

const stored = readStored();
// One mode (ADR 0130 D1): an older version's stored mode is dropped once read.
if (stored.mode !== undefined) {
  try {
    const { mode: _dropped, ...rest } = stored;
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // Storage is unavailable: it is dropped at the next write.
  }
}

/** The stored block picture style: `classic` when chosen, else Blockloom (ADR 0135 D5). */
const storedBlockStyle: BlockPictureStyle =
  stored.blockStyle === 'classic' ? 'classic' : 'blockloom';
setBlockPictureStyle(storedBlockStyle);

const IDEAS_KEY = 'msm.ideas.v1';
/** The largest base seed of More ideas (as Surprise me's seeds). */
const MAX_IDEAS_SEED = 999_999;

/** A new base seed for More ideas, from 1 to {@link MAX_IDEAS_SEED}. */
function newIdeasSeed(): number {
  return 1 + Math.floor(Math.random() * MAX_IDEAS_SEED);
}

function writeIdeasSeed(seed: number): void {
  try {
    globalThis.localStorage?.setItem(IDEAS_KEY, JSON.stringify({ seed }));
  } catch {
    // Storage is unavailable: the seed lasts for this run only.
  }
}

/** The stored base seed, or a new one (stored at once, so it stays the same next time). */
function readIdeasSeed(): number {
  try {
    const text = globalThis.localStorage?.getItem(IDEAS_KEY);
    if (text !== null && text !== undefined) {
      const seed = (JSON.parse(text) as { seed?: unknown }).seed;
      if (typeof seed === 'number' && Number.isInteger(seed) && seed >= 1) {
        if (seed <= MAX_IDEAS_SEED) return seed;
      }
    }
  } catch {
    // Unreadable: a new seed.
  }
  const seed = newIdeasSeed();
  writeIdeasSeed(seed);
  return seed;
}

export const usePreferences = create<PreferencesState>((set, get) => ({
  collapsed: new Set(
    Array.isArray(stored.collapsed)
      ? stored.collapsed.filter((key) => typeof key === 'string')
      : [],
  ),
  centrePreview: stored.centrePreview !== false,
  showcaseClips: stored.showcaseClips !== false,
  showcaseOpen: stored.showcaseOpen === true,
  rememberSearches: stored.rememberSearches !== false,
  blockStyle: storedBlockStyle,
  testVersions: stored.testVersions === true,
  ideasSeed: readIdeasSeed(),
  searchHistory: stored.rememberSearches !== false ? readHistory() : EMPTY_HISTORY,
  setRememberSearches(on) {
    set(
      on ? { rememberSearches: true } : { rememberSearches: false, searchHistory: EMPTY_HISTORY },
    );
    if (!on) writeHistory(EMPTY_HISTORY);
    writeStored(get());
  },
  clearSearchHistory() {
    set({ searchHistory: EMPTY_HISTORY });
    writeHistory(EMPTY_HISTORY);
  },
  rememberSearchChoice(id) {
    if (!get().rememberSearches) return;
    const searchHistory = withChoice(get().searchHistory, id);
    set({ searchHistory });
    writeHistory(searchHistory);
  },
  rememberSearchText(text) {
    if (!get().rememberSearches) return;
    const searchHistory = withSearch(get().searchHistory, text);
    if (searchHistory === get().searchHistory) return;
    set({ searchHistory });
    writeHistory(searchHistory);
  },
  setBlockStyle(style) {
    const next: BlockPictureStyle = style === 'classic' ? 'classic' : 'blockloom';
    setBlockPictureStyle(next);
    set({ blockStyle: next });
    writeStored(get());
  },
  setTestVersions(on) {
    set({ testVersions: on });
    writeStored(get());
  },
  setShowcaseClips(on) {
    set({ showcaseClips: on });
    writeStored(get());
  },
  setShowcaseOpen(open) {
    set({ showcaseOpen: open });
    writeStored(get());
  },
  shuffleIdeas() {
    let next = newIdeasSeed();
    if (next === get().ideasSeed) next = (next % MAX_IDEAS_SEED) + 1;
    set({ ideasSeed: next });
    writeIdeasSeed(next);
  },
  toggleCentrePreview() {
    set({ centrePreview: !get().centrePreview });
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
