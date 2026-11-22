/**
 * Which showcase card plays (ADR 0118 D6, D8, D9; B568): at most one clip is live.
 *
 * - Never without WebGL, while the window is hidden or out of focus, or while another view
 *   covers the gallery.
 * - With reduced motion (`prefers-reduced-motion: reduce`), with the setting **Play showcase
 *   clips** off, or after **Pause clips**, no card plays by itself: only the card whose play
 *   button was pressed, once.
 * - Otherwise: the card under the mouse, else the card with keyboard focus, else the card whose
 *   play button was pressed, else the first card fully in view (`IntersectionObserver`). A card
 *   the user paused is passed over until its play button is pressed again, and while one is
 *   paused no card starts just by being in view.
 *
 * {@link chooseLiveClip} is the pure policy; {@link browserLiveEnvironment} reads the browser
 * (media query, window visibility and focus, the observer) and is replaced in tests.
 *
 * @packageDocumentation
 */

/** What the choice depends on. */
export interface LiveClipState {
  /** The cards' clip ids, in order. */
  readonly cards: readonly string[];
  readonly hovered: string | null;
  readonly focused: string | null;
  /** The card whose play button was pressed (it plays once when clips do not play by themselves). */
  readonly requested: string | null;
  /** The cards fully in view. */
  readonly inView: ReadonlySet<string>;
  /** Cards the user paused (passed over until played again). */
  readonly stopped: ReadonlySet<string>;
  readonly webgl: boolean;
  readonly reducedMotion: boolean;
  /** The setting **Play showcase clips**. */
  readonly setting: boolean;
  /** **Pause clips** was pressed. */
  readonly paused: boolean;
  /** The window is shown and has focus. */
  readonly windowShown: boolean;
  /** Nothing covers the gallery (the host's say). */
  readonly visible: boolean;
}

/** Whether clips play by themselves in `state` (else only on the play button). */
export function playsByItself(state: LiveClipState): boolean {
  return !state.reducedMotion && state.setting && !state.paused;
}

/** The clip id of the one live card, or `null` for none. */
export function chooseLiveClip(state: LiveClipState): string | null {
  if (!state.webgl || !state.windowShown || !state.visible) return null;
  const known = (id: string | null): id is string => id !== null && state.cards.includes(id);
  if (!playsByItself(state)) return known(state.requested) ? state.requested : null;
  const free = (id: string | null): id is string => known(id) && !state.stopped.has(id);
  if (free(state.hovered)) return state.hovered;
  if (free(state.focused)) return state.focused;
  if (known(state.requested)) return state.requested;
  // After the user paused a card, nothing else starts by itself.
  if (state.stopped.size > 0) return null;
  return state.cards.find((id) => state.inView.has(id)) ?? null;
}

/** What the gallery reads from the browser. */
export interface LiveClipEnvironment {
  /** Whether the system asks for reduced motion now. */
  reducedMotion(): boolean;
  /** Calls `listener` when that changes; returns the unsubscribe. */
  onReducedMotion(listener: () => void): () => void;
  /** Whether the window is shown and has focus. */
  windowShown(): boolean;
  /** Calls `listener` when that changes; returns the unsubscribe. */
  onWindowShown(listener: () => void): () => void;
  /**
   * Watches the elements (by clip id) for being fully in view; `listener` gets the ids fully
   * in view whenever that changes. Returns the disconnect.
   */
  watchInView(
    elements: ReadonlyMap<string, Element>,
    listener: (inView: ReadonlySet<string>) => void,
  ): () => void;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** How much of a card counts as fully in view (a little slack for borders and rounding). */
export const IN_VIEW_RATIO = 0.98;

/** The environment of the real window. */
export function browserLiveEnvironment(): LiveClipEnvironment {
  const media =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_MOTION)
      : null;
  return {
    reducedMotion: () => media?.matches === true,
    onReducedMotion(listener) {
      if (media === null) return () => {};
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    },
    windowShown: () =>
      typeof document === 'undefined' ||
      (document.visibilityState !== 'hidden' &&
        (typeof document.hasFocus !== 'function' || document.hasFocus())),
    onWindowShown(listener) {
      if (typeof window === 'undefined') return () => {};
      document.addEventListener('visibilitychange', listener);
      window.addEventListener('focus', listener);
      window.addEventListener('blur', listener);
      return () => {
        document.removeEventListener('visibilitychange', listener);
        window.removeEventListener('focus', listener);
        window.removeEventListener('blur', listener);
      };
    },
    watchInView(elements, listener) {
      // Without an observer every card counts as in view, so the first one plays.
      if (typeof IntersectionObserver === 'undefined') {
        listener(new Set(elements.keys()));
        return () => {};
      }
      const idOf = new Map<Element, string>();
      for (const [id, element] of elements) idOf.set(element, id);
      const inView = new Set<string>();
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = idOf.get(entry.target);
            if (id === undefined) continue;
            if (entry.intersectionRatio >= IN_VIEW_RATIO) inView.add(id);
            else inView.delete(id);
          }
          listener(new Set(inView));
        },
        { threshold: [0, IN_VIEW_RATIO, 1] },
      );
      for (const element of elements.values()) observer.observe(element);
      return () => observer.disconnect();
    },
  };
}
