/**
 * Try it's state outside the view (ADR 0085 D13, B390): whether the view is open, the test area
 * itself (so switching to a Studio and back keeps it), the hotbar, the "Smaller picture" choice
 * and whether the first-run card was seen. The area is not saved; closing the project resets it.
 * Only the card and the picture choice are kept in local storage; storage failures are ignored.
 *
 * Imported by the shell, so it holds the area by type only: the simulation stays in the lazy
 * Try it chunk.
 */

import { create } from 'zustand';
import type { TryItArea } from './session-source';

const STORAGE_KEY = 'msm.tryit.v1';

interface Stored {
  cardSeen?: boolean;
  smaller?: boolean;
}

function readStored(): Stored {
  try {
    const text = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (text === null || text === undefined) return {};
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function writeStored(state: Pick<TryItState, 'cardSeen' | 'smaller'>): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        cardSeen: state.cardSeen,
        ...(state.smaller === null ? {} : { smaller: state.smaller }),
      }),
    );
  } catch {
    // Storage is unavailable: the choice lasts for this run only.
  }
}

/** What {@link TryItState.groundRequest} asks for. */
export interface GroundRequest {
  readonly kind: 'generated';
  /** The world's key as the picker lists it (`dimension:<id>`, `preset:<id>:<dim>`), or `null`. */
  readonly sourceKey: string | null;
}

/** The Try it store's shape. */
export interface TryItState {
  /** Whether the view is shown in the editor area. */
  open: boolean;
  /** The test area, made by the view on first open; `null` until then and after a reset. */
  area: TryItArea | null;
  /** The project root the area belongs to. */
  areaRoot: string | null;
  /** Hotbar slots the user filled from the picker, by slot index (0..8). */
  slots: Readonly<Record<number, string>>;
  /** The selected hotbar slot. */
  selected: number;
  /** "Smaller picture": `null` until chosen (the view then decides by the renderer). */
  smaller: boolean | null;
  /** Whether the first-run card was closed once. */
  cardSeen: boolean;
  /**
   * A ground the view should open its picker on once the area is ready (B587: a Studio's
   * **Walk in it** asks for My world generation on one of the project's worlds), or `null`.
   */
  groundRequest: GroundRequest | null;
  openView(): void;
  /** Opens the view with the ground picker on My world generation (`sourceKey`: the world). */
  walkIn(sourceKey: string | null): void;
  /** Forgets the request once the view has opened its picker. */
  clearGroundRequest(): void;
  close(): void;
  toggle(): void;
  setArea(area: TryItArea, root: string | null): void;
  /** Forgets the area (closing the project); the view is closed. */
  reset(): void;
  setSlot(index: number, id: string): void;
  select(index: number): void;
  setSmaller(smaller: boolean): void;
  seeCard(): void;
}

const stored = readStored();

export const useTryItStore = create<TryItState>((set, get) => ({
  open: false,
  area: null,
  areaRoot: null,
  slots: {},
  selected: 0,
  smaller: typeof stored.smaller === 'boolean' ? stored.smaller : null,
  cardSeen: stored.cardSeen === true,
  groundRequest: null,
  openView() {
    set({ open: true });
  },
  walkIn(sourceKey) {
    set({ open: true, groundRequest: { kind: 'generated', sourceKey } });
  },
  clearGroundRequest() {
    set({ groundRequest: null });
  },
  close() {
    set({ open: false });
  },
  toggle() {
    set({ open: !get().open });
  },
  setArea(area, root) {
    const before = get().area;
    if (before !== null && before !== area) before.dispose();
    set({ area, areaRoot: root });
  },
  reset() {
    get().area?.dispose();
    set({
      open: false,
      area: null,
      areaRoot: null,
      slots: {},
      selected: 0,
      groundRequest: null,
    });
  },
  setSlot(index, id) {
    set({ slots: { ...get().slots, [index]: id } });
  },
  select(index) {
    set({ selected: index });
  },
  setSmaller(smaller) {
    set({ smaller });
    writeStored(get());
  },
  seeCard() {
    set({ cardSeen: true });
    writeStored(get());
  },
}));
