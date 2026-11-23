// @vitest-environment happy-dom
/**
 * Home's More ideas (ADR 0128 D1, D2) with a fake view (where the list is as it scrolls), a
 * stand-in clip view and picture codec: the section's heading and Shuffle; cards rolled from
 * the base seed (Make this gives the idea of card n's seed); scrolling far mounts new cards and
 * unmounts the far ones, the mounted cards staying few; Shuffle changes the seeds; the polite
 * line; the arrow keys; hovering a card with a clip plays one clip at most, never with the
 * setting off or reduced motion until its play button; no ids in the words.
 */

import type { ProjectStarter, Target } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MoreIdeas } from '../../../src/renderer/src/components/home/MoreIdeas';
import type { IdeasEnvironment } from '../../../src/renderer/src/ideas/IdeaList';
import {
  IDEA_OVERSCAN,
  IDEA_ROW,
  type IdeasView,
  ideaColumns,
  ideaSeed,
} from '../../../src/renderer/src/ideas/idea-seeds';
import { clearIdeas, type Idea } from '../../../src/renderer/src/ideas/ideas';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import type { ClipViewProps } from '../../../src/renderer/src/showcase/ClipView';
import type { StillCodec } from '../../../src/renderer/src/showcase/drawn-still';
import type { LiveClipEnvironment } from '../../../src/renderer/src/showcase/live-clip';
import { TARGETS, theRegistry } from '../showcase/showcase-fixture';

const starters: ProjectStarter[] = builtInPlugins.flatMap(
  (plugin) => plugin.contributes.projectStarters ?? [],
);
const target = TARGETS[0] as Target;
const input = {
  starters,
  target,
  isKnownKind: (kind: string) => theRegistry().get(kind) !== undefined,
  rules: true,
};
const deps = { registry: theRegistry(), plugins: builtInPlugins };

const codec: StillCodec = {
  decode: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([9, 9, 9, 255]) }),
  encode: () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
};

/** A view the test scrolls. */
function view(start: IdeasView) {
  let report: ((view: IdeasView) => void) | null = null;
  const env: IdeasEnvironment = {
    watchView(_element, listener) {
      report = listener;
      listener(start);
      return () => {
        report = null;
      };
    },
  };
  return {
    env,
    scroll(next: IdeasView) {
      act(() => report?.(next));
    },
  };
}

function liveEnv(reduced = false): LiveClipEnvironment {
  return {
    reducedMotion: () => reduced,
    onReducedMotion: () => () => {},
    windowShown: () => true,
    onWindowShown: () => () => {},
    watchInView: () => () => {},
  };
}

const mounted = new Set<string>();
function FakeClipView(props: ClipViewProps) {
  useEffect(() => {
    mounted.add(props.clip.id);
    return () => {
      mounted.delete(props.clip.id);
    };
  }, [props.clip.id]);
  return <span data-testid={`live-${props.clip.id}`} />;
}

afterEach(() => {
  cleanup();
  clearIdeas();
  mounted.clear();
});

const cards = (): HTMLElement[] => screen.queryAllByTestId(/^idea-card-\d+$/);
const indices = (): number[] =>
  cards()
    .map((card) => Number(card.dataset.testid?.slice('idea-card-'.length)))
    .sort((a, b) => a - b);

function ideas(
  start: IdeasView,
  extra: Partial<Parameters<typeof MoreIdeas>[0]> = {},
  base = 1234,
) {
  const scroller = view(start);
  const onMake = vi.fn<(idea: Idea) => void>();
  const onShuffle = vi.fn();
  const props = {
    baseSeed: base,
    input,
    deps,
    onMake,
    onShuffle,
    environment: scroller.env,
    liveEnvironment: liveEnv(),
    webgl: false,
    codec,
    scale: 1,
    eager: true,
    ...extra,
  };
  const utils = render(<MoreIdeas {...props} />);
  return { ...utils, props, scroller, onMake, onShuffle };
}

/** Waits until card `index`'s idea is in, and returns its Make this. */
async function made(index: number): Promise<HTMLElement> {
  const button = await screen.findByTestId(`idea-make-${index}`);
  await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('false'), {
    timeout: 30_000,
  });
  return button;
}

describe('More ideas', () => {
  it('heads the section with Shuffle and makes card n from its seed', async () => {
    const { onMake, onShuffle } = ideas({ top: 0, height: 300, width: 300 });
    expect(screen.getByRole('heading', { name: 'More ideas' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('more-ideas-shuffle'));
    expect(onShuffle).toHaveBeenCalled();
    fireEvent.click(await made(1));
    expect(onMake).toHaveBeenCalledTimes(1);
    expect(onMake.mock.calls[0]?.[0].seed).toBe(ideaSeed(1234, 1));
    const card = screen.getByTestId('idea-card-1');
    // Named after its lead thing ("Frost Wolf"), not "<Theme> Mod" (ADR 0129 D3).
    expect(screen.getByTestId('idea-name-1').textContent).toMatch(/^[A-Z][a-z]+ [A-Z]/);
    expect(screen.getByTestId('idea-name-1').textContent).not.toMatch(/ Mod$/);
    // Very easy shows no ids.
    expect(card.textContent).not.toMatch(/[a-z0-9_]+:[a-z0-9_/]+/);
    await waitFor(() => expect(screen.getByTestId('idea-still-1')).toBeTruthy());
  }, 60_000);

  it('mounts new cards as the view scrolls and unmounts the far ones', async () => {
    // The cards of the rows within the overscan of a 900-high view, one cut at each end.
    const most = ideaColumns(1200) * (Math.ceil((900 + 2 * IDEA_OVERSCAN) / IDEA_ROW) + 1);
    const { scroller } = ideas({ top: 0, height: 900, width: 1200 });
    const first = indices();
    expect(first[0]).toBe(0);
    expect(first.length).toBeLessThanOrEqual(24);
    scroller.scroll({ top: -40_000, height: 900, width: 1200 });
    const far = indices();
    expect(far[0]).toBeGreaterThan(400);
    expect(far.length).toBeLessThanOrEqual(most);
    expect(screen.queryByTestId('idea-card-0')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('ideas-status').textContent).toMatch(/more ideas below/),
    );
    scroller.scroll({ top: -200_000, height: 900, width: 1200 });
    const further = indices();
    expect(further[0]).toBeGreaterThan(2400);
    expect(further.length).toBeLessThanOrEqual(most);
    // The list keeps its height for the cards scrolled past.
    const list = screen.getByRole('list', { name: 'More ideas' });
    expect(Number.parseInt(list.style.height, 10)).toBeGreaterThan(200_000);
  }, 60_000);

  it('Shuffle (a new base seed) changes every card’s seed', async () => {
    const { rerender, props, onMake } = ideas({ top: 0, height: 300, width: 300 });
    fireEvent.click(await made(0));
    rerender(<MoreIdeas {...props} baseSeed={98_765} />);
    await waitFor(() => expect(screen.getByTestId('ideas-status').textContent).toBe('New ideas.'));
    fireEvent.click(await made(0));
    expect(onMake.mock.calls.map((call) => call[0].seed)).toEqual([
      ideaSeed(1234, 0),
      ideaSeed(98_765, 0),
    ]);
  }, 60_000);

  it('moves between cards with the arrow keys', async () => {
    ideas({ top: 0, height: 900, width: 1200 });
    const start = screen.getByTestId('idea-make-0');
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('idea-make-1'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('idea-make-5'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByTestId('idea-make-1'));
    expect(screen.getByTestId('idea-make-1').getAttribute('aria-label')).toMatch(/^Make this/);
  });

  /** The first card (of the first `count`) whose idea has a clip, once rolled. */
  async function cardWithClip(count: number): Promise<number> {
    for (let index = 0; index < count; index += 1) {
      await made(index);
      if (screen.queryAllByRole('button', { name: /^Clip: / }).length > 0) {
        const button = screen.getAllByRole('button', { name: /^Clip: / })[0] as HTMLElement;
        return Number(button.dataset.testid?.slice('idea-picture-'.length));
      }
    }
    throw new Error('no idea with a clip');
  }

  it('plays one clip on hover, through the Showcase’s rule', async () => {
    ideas({ top: 0, height: 2000, width: 300 }, { webgl: true, clipView: FakeClipView });
    const index = await cardWithClip(6);
    expect(mounted.size).toBe(0);
    fireEvent.pointerEnter(screen.getByTestId(`idea-card-${index}`));
    expect(mounted.size).toBe(1);
    fireEvent.pointerLeave(screen.getByTestId(`idea-card-${index}`));
    expect(mounted.size).toBe(0);
  }, 90_000);

  it('plays nothing by itself with the setting off or reduced motion, until the play button', async () => {
    for (const extra of [{ playClips: false }, { liveEnvironment: liveEnv(true) }]) {
      ideas(
        { top: 0, height: 2000, width: 300 },
        { webgl: true, clipView: FakeClipView, ...extra },
      );
      const index = await cardWithClip(6);
      fireEvent.pointerEnter(screen.getByTestId(`idea-card-${index}`));
      expect(mounted.size).toBe(0);
      fireEvent.click(screen.getByTestId(`idea-picture-${index}`));
      expect(mounted.size).toBe(1);
      cleanup();
      clearIdeas();
      mounted.clear();
    }
  }, 120_000);

  it('loads the list only when the section comes near the view', () => {
    const observed: Element[] = [];
    let callback: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    const original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        callback = cb;
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    try {
      ideas({ top: 0, height: 300, width: 300 }, { eager: false });
      expect(screen.queryByTestId('ideas-list')).toBeNull();
      expect(observed).toHaveLength(1);
      act(() => callback?.([{ isIntersecting: true }]));
      return waitFor(() => expect(screen.getByTestId('ideas-list')).toBeTruthy());
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });
});
