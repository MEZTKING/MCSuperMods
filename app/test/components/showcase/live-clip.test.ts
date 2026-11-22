/**
 * Which showcase card plays (B568, ADR 0118 D6, D8, D9): never two; hover, then focus, then the
 * play button, then the first card fully in view; none with reduced motion, the setting off,
 * Pause clips, the window hidden or the gallery covered, except the card played by hand; never
 * one without WebGL.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserLiveEnvironment,
  chooseLiveClip,
  IN_VIEW_RATIO,
  type LiveClipState,
  playsByItself,
} from '../../../src/renderer/src/showcase/live-clip';

const base: LiveClipState = {
  cards: ['a', 'b', 'c'],
  hovered: null,
  focused: null,
  requested: null,
  inView: new Set(['b', 'c']),
  stopped: new Set(),
  webgl: true,
  reducedMotion: false,
  setting: true,
  paused: false,
  windowShown: true,
  visible: true,
};
const choose = (change: Partial<LiveClipState>): string | null =>
  chooseLiveClip({ ...base, ...change });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the live clip policy', () => {
  it('plays the first card fully in view by itself', () => {
    expect(choose({})).toBe('b');
    expect(choose({ inView: new Set() })).toBeNull();
  });

  it('prefers the hovered card, then the focused one, then the one played by hand', () => {
    expect(choose({ hovered: 'c', focused: 'a', requested: 'b' })).toBe('c');
    expect(choose({ focused: 'a', requested: 'c' })).toBe('a');
    expect(choose({ requested: 'c' })).toBe('c');
  });

  it('ignores ids that are not cards', () => {
    expect(choose({ hovered: 'x', focused: 'y', requested: 'z' })).toBe('b');
  });

  it('passes over a paused card, and starts nothing by being in view while one is paused', () => {
    expect(choose({ hovered: 'b', stopped: new Set(['b']) })).toBeNull();
    expect(choose({ hovered: 'c', stopped: new Set(['b']) })).toBe('c');
    expect(choose({ focused: 'b', stopped: new Set(['b']) })).toBeNull();
  });

  it('plays nothing by itself with reduced motion, the setting off or Pause clips', () => {
    for (const change of [{ reducedMotion: true }, { setting: false }, { paused: true }]) {
      expect(playsByItself({ ...base, ...change })).toBe(false);
      expect(choose({ ...change, hovered: 'a', focused: 'a' })).toBeNull();
      // Its play button plays it.
      expect(choose({ ...change, hovered: 'a', requested: 'c' })).toBe('c');
    }
    expect(playsByItself(base)).toBe(true);
  });

  it('plays nothing without WebGL, with the window hidden or the gallery covered', () => {
    for (const change of [{ webgl: false }, { windowShown: false }, { visible: false }]) {
      expect(choose({ ...change, hovered: 'a', requested: 'a' })).toBeNull();
    }
  });

  it('never gives two cards: one id or none for every mix of inputs', () => {
    const ids = [null, 'a', 'b', 'c'];
    for (const hovered of ids) {
      for (const focused of ids) {
        for (const requested of ids) {
          for (const reducedMotion of [false, true]) {
            const live = choose({ hovered, focused, requested, reducedMotion });
            expect(live === null || base.cards.includes(live)).toBe(true);
          }
        }
      }
    }
  });
});

describe('the browser environment', () => {
  it('reads reduced motion from the media query and hears it change', () => {
    const listeners = new Set<() => void>();
    const media = {
      matches: true,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    };
    const matchMedia = vi.fn(() => media);
    vi.stubGlobal('window', {
      matchMedia,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    const environment = browserLiveEnvironment();
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(environment.reducedMotion()).toBe(true);
    let heard = 0;
    const stop = environment.onReducedMotion(() => {
      heard += 1;
    });
    for (const listener of listeners) listener();
    expect(heard).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });

  it('counts the window as shown only while visible and focused', () => {
    const document = { visibilityState: 'visible', hasFocus: () => true };
    vi.stubGlobal('document', document);
    const environment = browserLiveEnvironment();
    expect(environment.windowShown()).toBe(true);
    document.hasFocus = () => false;
    expect(environment.windowShown()).toBe(false);
    document.hasFocus = () => true;
    document.visibilityState = 'hidden';
    expect(environment.windowShown()).toBe(false);
  });

  it('reports the cards fully in view through the observer', () => {
    type Entries = { target: object; intersectionRatio: number }[];
    const held: { callback: ((entries: Entries) => void) | null } = { callback: null };
    const observed: object[] = [];
    let disconnected = false;
    class FakeObserver {
      constructor(fn: (entries: Entries) => void) {
        held.callback = fn;
      }
      observe(element: object) {
        observed.push(element);
      }
      disconnect() {
        disconnected = true;
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const a = {};
    const b = {};
    const seen: string[][] = [];
    const stop = browserLiveEnvironment().watchInView(
      new Map([
        ['a', a as Element],
        ['b', b as Element],
      ]),
      (inView) => seen.push([...inView].sort()),
    );
    expect(observed).toEqual([a, b]);
    held.callback?.([
      { target: a, intersectionRatio: 1 },
      { target: b, intersectionRatio: 0.5 },
    ]);
    held.callback?.([{ target: b, intersectionRatio: IN_VIEW_RATIO }]);
    held.callback?.([{ target: a, intersectionRatio: 0.2 }]);
    expect(seen).toEqual([['a'], ['a', 'b'], ['b']]);
    stop();
    expect(disconnected).toBe(true);
  });

  it('counts every card in view without an observer', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const seen: string[][] = [];
    browserLiveEnvironment().watchInView(new Map([['a', {} as Element]]), (inView) =>
      seen.push([...inView]),
    );
    expect(seen).toEqual([['a']]);
  });
});
