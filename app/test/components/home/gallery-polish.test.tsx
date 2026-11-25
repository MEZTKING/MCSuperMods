// @vitest-environment happy-dom
/**
 * Home's gallery, finished in layout A (ADR 0129 D1, D2, D5): cards read `FLOW_CARDS` (their
 * example, See the example on every vehicle card, their clip and picture); a card whose example
 * has pictures shows its drawn still, one without shows the card's drawn look; a card with a
 * clip plays it on hover and stops Featured's clip, never with the setting off or reduced motion
 * until its play button (one clip on Home, `home-live.ts`); More ideas is the last row with
 * Shuffle and Show all opening the endless grid with Back, in one place only; no ids in words.
 */

import type { ProjectStarter, Target } from '@msm/plugin-api';
import { libraryExamples, libraryStarters } from '@msm/plugin-library';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { forbiddenIn } from '../../../src/renderer/src/components/ai/ai-words';
import { clearLookStills } from '../../../src/renderer/src/components/home/gallery/card-picture';
import { exampleForStarter } from '../../../src/renderer/src/components/home/gallery/flow-examples';
import {
  type GalleryCard,
  type GalleryGroup,
  galleryGroups,
} from '../../../src/renderer/src/components/home/gallery/gallery-model';
import {
  type FeaturedRenderer,
  HomeGallery,
  type HomeGalleryProps,
  IDEAS_GROUP,
  type IdeasRenderer,
  type WatchNear,
} from '../../../src/renderer/src/components/home/gallery/HomeGallery';
import { MoreIdeas } from '../../../src/renderer/src/components/home/MoreIdeas';
import type { IdeasEnvironment } from '../../../src/renderer/src/ideas/IdeaList';
import {
  IDEA_ROW_AHEAD,
  IDEA_ROW_FIRST,
  IDEA_STEP,
  ideasRowWindow,
} from '../../../src/renderer/src/ideas/idea-seeds';
import { clearIdeas } from '../../../src/renderer/src/ideas/ideas';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import type { ClipViewProps } from '../../../src/renderer/src/showcase/ClipView';
import { clearDrawnStills, type StillCodec } from '../../../src/renderer/src/showcase/drawn-still';
import { FLOW_CARDS } from '../../../src/renderer/src/showcase/flow-clips';
import {
  createHomeLive,
  type DatedClaim,
  homeLiveOwner,
} from '../../../src/renderer/src/showcase/home-live';
import type { LiveClipEnvironment } from '../../../src/renderer/src/showcase/live-clip';
import { ShowcaseGallery } from '../../../src/renderer/src/showcase/ShowcaseGallery';
import { showcasesFor } from '../../../src/renderer/src/showcase/showcases';
import { TARGETS, theRegistry } from '../showcase/showcase-fixture';

const TARGET = TARGETS[0] as Target;
const deps = { registry: theRegistry(), plugins: builtInPlugins };

const codec: StillCodec = {
  decode: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([9, 9, 9, 255]) }),
  encode: () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
};

function starters(): ProjectStarter[] {
  const seen = new Set<string>();
  return libraryStarters.filter((starter) => {
    if (seen.has(starter.id)) return false;
    seen.add(starter.id);
    return true;
  });
}

const groups: GalleryGroup[] = galleryGroups({
  starters: starters(),
  examples: libraryExamples,
  target: TARGET,
  exampleFor: exampleForStarter,
});
const allCards: GalleryCard[] = groups.flatMap((group) => group.cards);
const examplesById = new Map(libraryExamples.map((example) => [example.id, example]));

/** Every card in view at once. */
const allNear: WatchNear = (elements, listener) => {
  listener(new Set(elements.keys()));
  return () => {};
};

function environment(reduced = false, inView: readonly string[] = []): LiveClipEnvironment {
  return {
    reducedMotion: () => reduced,
    onReducedMotion: () => () => {},
    windowShown: () => true,
    onWindowShown: () => () => {},
    watchInView: (_elements, listener) => {
      listener(new Set(inView));
      return () => {};
    },
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
  mounted.clear();
  clearDrawnStills();
  clearLookStills();
  clearIdeas();
});

function gallery(extra: Partial<HomeGalleryProps> = {}) {
  const props: HomeGalleryProps = {
    groups,
    starters: starters(),
    examples: libraryExamples,
    target: TARGET,
    onMake: vi.fn(),
    onSeeExample: vi.fn(),
    watchNear: allNear,
    codec,
    drawLook: async () => new Uint8Array([1]),
    deps,
    environment: environment(),
    webgl: true,
    clipView: FakeClipView,
    ...extra,
  };
  render(<HomeGallery {...props} />);
  return props;
}

describe('the cards read FLOW_CARDS', () => {
  it('names the flow card’s example on every card, See the example on every vehicle', () => {
    for (const card of allCards) {
      const flowCard = FLOW_CARDS[card.starterId];
      expect(flowCard, card.starterId).toBeDefined();
      if (flowCard?.exampleId !== null && examplesById.has(flowCard?.exampleId ?? '')) {
        expect(card.exampleId, card.starterId).toBe(flowCard?.exampleId);
      }
    }
    gallery({ webgl: false });
    const vehicles = groups.find((group) => group.id === 'vehicles');
    expect(vehicles?.cards.length).toBeGreaterThan(1);
    for (const card of vehicles?.cards ?? []) {
      const button = screen.getByTestId(`gallery-example-${card.id}`);
      expect(button.getAttribute('aria-label')).toBe(`See the example: ${card.title}`);
    }
  });

  it('shows the example’s still when it has pictures, else the card’s drawn picture', async () => {
    const drawLook = vi.fn(async () => new Uint8Array([1]));
    gallery({ drawLook, webgl: false });
    // Night greeting (rules) has no pictures of its own; the pet's frost wolf has.
    const plain = allCards.find((card) => card.starterId === 'game-rule') as GalleryCard;
    const pictured = allCards.find((card) => card.starterId === 'pet') as GalleryCard;
    await waitFor(
      () => {
        expect(screen.getByTestId(`gallery-picture-${plain.id}`).dataset.picture).toBe('look');
        expect(screen.getByTestId(`gallery-picture-${pictured.id}`).dataset.picture).toBe(
          'example',
        );
      },
      { timeout: 30_000 },
    );
    expect(drawLook).toHaveBeenCalledWith(FLOW_CARDS['game-rule']?.picture);
    const still = screen.getByTestId(`gallery-still-${plain.id}`);
    expect(still.className).toContain('[image-rendering:pixelated]');
  }, 60_000);
});

describe('card clips', () => {
  const withClip = allCards.filter((card) => FLOW_CARDS[card.starterId]?.clip != null);
  const [first, second] = withClip as [GalleryCard, GalleryCard];
  const clipOf = (card: GalleryCard): string => FLOW_CARDS[card.starterId]?.clip?.id ?? '';

  it('plays a card’s clip on hover and stops Featured’s', () => {
    expect(withClip.length).toBeGreaterThan(10);
    const featuredClips = showcasesFor(TARGET, libraryExamples).slice(0, 2);
    const featured: FeaturedRenderer = (variant, headerEnd) => (
      <ShowcaseGallery
        heading="Featured"
        clips={featuredClips}
        examples={libraryExamples}
        target={TARGET}
        deps={deps}
        onMake={vi.fn()}
        onSeeExample={vi.fn()}
        environment={environment(false, [featuredClips[0]?.id ?? ''])}
        webgl
        clipView={FakeClipView}
        codec={codec}
        landStill={null}
        variant={variant === 'rail' ? 'rail' : 'grid'}
        headerEnd={headerEnd}
      />
    );
    gallery({ featured, featuredCount: featuredClips.length });
    // Featured's first card plays by itself in view.
    expect([...mounted]).toEqual([featuredClips[0]?.id]);
    // Hovering a gallery card plays its clip instead: one clip on Home.
    fireEvent.pointerOver(screen.getByTestId(`gallery-card-${first.id}`));
    expect([...mounted]).toEqual([clipOf(first)]);
    expect(screen.getByTestId(`gallery-picture-${first.id}`).dataset.playing).toBe('true');
    // Another card: it plays and the first stops.
    fireEvent.pointerOver(screen.getByTestId(`gallery-card-${second.id}`));
    expect([...mounted]).toEqual([clipOf(second)]);
    // Off the cards: Featured plays again.
    fireEvent.pointerOver(screen.getByTestId('gallery-chips'));
    expect([...mounted]).toEqual([featuredClips[0]?.id]);
  });

  it('plays on focus, and nothing on hover with the setting off or reduced motion', () => {
    gallery();
    act(() => screen.getByTestId(`gallery-make-${first.id}`).focus());
    expect([...mounted]).toEqual([clipOf(first)]);
    cleanup();
    for (const extra of [{ playClips: false }, { environment: environment(true) }]) {
      gallery(extra);
      fireEvent.pointerOver(screen.getByTestId(`gallery-card-${first.id}`));
      expect(mounted.size).toBe(0);
      const picture = screen.getByTestId(`gallery-picture-${first.id}`);
      expect(picture.getAttribute('aria-label')).toBe(`Clip: ${first.title}`);
      fireEvent.click(picture);
      expect([...mounted]).toEqual([clipOf(first)]);
      cleanup();
      mounted.clear();
    }
  });

  it('shows no clip buttons without WebGL', () => {
    gallery({ webgl: false });
    expect(screen.getByTestId(`gallery-picture-${first.id}`).getAttribute('role')).toBe('img');
    expect(screen.queryAllByRole('button', { name: /^Clip: / })).toHaveLength(0);
  });
});

describe('More ideas as the last row', () => {
  // `MoreIdeas` loads the idea list as a lazy chunk. Its first import here is a cold module
  // graph (the Surprise me generator and the card code), which under a loaded machine took longer
  // than `findByTestId`'s one second (B714): the waits below are for React, not for the import.
  beforeAll(async () => {
    await import('../../../src/renderer/src/ideas/IdeaList');
  });
  const input = {
    starters: builtInPlugins.flatMap((plugin) => plugin.contributes.projectStarters ?? []),
    target: TARGET,
    isKnownKind: (kind: string) => theRegistry().get(kind) !== undefined,
    rules: true,
  };
  /** A row and a grid the test scrolls. */
  function views() {
    let row: ((view: { left: number; width: number }) => void) | null = null;
    const env: IdeasEnvironment = {
      watchView(_element, listener) {
        listener({ top: 0, height: 900, width: 1200 });
        return () => {};
      },
      watchRow(_element, listener) {
        row = listener;
        listener({ left: 0, width: 1200 });
        return () => {
          row = null;
        };
      },
    };
    return { env, scroll: (left: number) => act(() => row?.({ left, width: 1200 })) };
  }
  function withIdeas(onShuffle = vi.fn()) {
    const scroller = views();
    const ideas: IdeasRenderer = (variant, headerEnd): ReactNode => (
      <MoreIdeas
        variant={variant}
        headerEnd={headerEnd}
        baseSeed={77}
        input={input}
        deps={deps}
        onMake={vi.fn()}
        onShuffle={onShuffle}
        environment={scroller.env}
        liveEnvironment={environment()}
        webgl={false}
        codec={codec}
        scale={1}
        eager
      />
    );
    gallery({ ideas, webgl: false });
    return scroller;
  }

  it('is the last row, with Shuffle, loading more as it scrolls sideways', async () => {
    const onShuffle = vi.fn();
    const scroller = withIdeas(onShuffle);
    const gallerySections = screen
      .getByTestId('home-gallery')
      .querySelectorAll('[data-testid^="gallery-group-"]');
    expect(gallerySections[gallerySections.length - 1]?.getAttribute('data-testid')).toBe(
      `gallery-group-${IDEAS_GROUP}`,
    );
    expect(screen.getAllByTestId('more-ideas')).toHaveLength(1);
    const row = within(screen.getByTestId(`gallery-group-${IDEAS_GROUP}`));
    expect(row.getByRole('heading', { name: 'More ideas' })).toBeTruthy();
    fireEvent.click(row.getByTestId('more-ideas-shuffle'));
    expect(onShuffle).toHaveBeenCalled();
    const list = await row.findByTestId('ideas-list');
    expect(list.dataset.layout).toBe('row');
    expect(await row.findByTestId('idea-card-0')).toBeTruthy();
    expect(row.queryByTestId('idea-card-40')).toBeNull();
    scroller.scroll(40 * IDEA_STEP);
    expect(row.getByTestId('idea-card-40')).toBeTruthy();
    expect(row.queryByTestId('idea-card-0')).toBeNull();
    await waitFor(() =>
      expect(row.getByTestId('ideas-status').textContent).toMatch(/more ideas to the right/),
    );
    // A chip jumps to it.
    expect(screen.getByTestId(`gallery-chip-${IDEAS_GROUP}`).textContent).toBe('More ideas');
  });

  it('Show all opens the endless grid with Back', async () => {
    withIdeas();
    const showAll = screen.getByTestId(`gallery-show-all-${IDEAS_GROUP}`);
    expect(showAll.textContent).toBe('Show all');
    expect(showAll.getAttribute('aria-label')).toBe('Show all: More ideas');
    fireEvent.click(showAll);
    const all = screen.getByTestId('gallery-all');
    const grid = await within(all).findByTestId('ideas-list');
    expect(grid.dataset.layout).toBeUndefined();
    expect(within(all).getAllByRole('heading', { name: 'More ideas' })).toHaveLength(1);
    expect(screen.queryByTestId('gallery-row-blocks')).toBeNull();
    fireEvent.click(screen.getByTestId('gallery-back'));
    expect(screen.queryByTestId('gallery-all')).toBeNull();
    expect(screen.getByTestId(`gallery-group-${IDEAS_GROUP}`)).toBeTruthy();
  });

  it('says no ids anywhere in the gallery', () => {
    withIdeas();
    const words = screen.getByTestId('home-gallery').textContent ?? '';
    expect(forbiddenIn(words)).toEqual([]);
    const labels = [...document.querySelectorAll('[aria-label]')].map(
      (element) => element.getAttribute('aria-label') ?? '',
    );
    expect(forbiddenIn(labels.join(' '))).toEqual([]);
  });
});

describe('pure parts', () => {
  it('grows the ideas row as it scrolls and mounts only the cards near the view', () => {
    const start = ideasRowWindow({ left: 0, width: 1000 }, IDEA_ROW_FIRST);
    expect(start.first).toBe(0);
    expect(start.count).toBeGreaterThanOrEqual(IDEA_ROW_FIRST);
    const far = ideasRowWindow({ left: 100 * IDEA_STEP, width: 1000 }, start.count);
    expect(far.first).toBeGreaterThan(90);
    expect(far.last - far.first).toBeLessThan(12);
    expect(far.count).toBe(far.last + 1 + IDEA_ROW_AHEAD);
    // Never shrinks.
    expect(ideasRowWindow({ left: 0, width: 1000 }, far.count).count).toBe(far.count);
  });

  it('gives the one clip to the newest ask over a card playing by itself', () => {
    const claims = new Map<string, DatedClaim>([
      ['featured', { id: 'a', by: 'self', at: 1 }],
      ['gallery', { id: 'b', by: 'user', at: 2 }],
    ]);
    expect(homeLiveOwner(claims)).toBe('gallery');
    claims.set('ideas', { id: 'c', by: 'user', at: 3 });
    expect(homeLiveOwner(claims)).toBe('ideas');
    claims.delete('ideas');
    claims.delete('gallery');
    expect(homeLiveOwner(claims)).toBe('featured');
    const live = createHomeLive();
    const seen: (string | null)[] = [];
    live.subscribe(() => seen.push(live.owner()));
    live.report('featured', { id: 'a', by: 'self' });
    live.report('gallery', { id: 'b', by: 'user' });
    live.report('gallery', null);
    expect(seen).toEqual(['featured', 'gallery', 'featured']);
  });
});
