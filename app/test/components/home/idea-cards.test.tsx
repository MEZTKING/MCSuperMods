// @vitest-environment happy-dom
/**
 * More ideas' cards are the gallery's cards, and one arbiter keeps one clip on Home (B713):
 *
 * - an idea card has the gallery card's frame, size, picture box, type and accent **Make this**,
 *   and the row places its cards at the gallery rows' step;
 * - with no `onLiveChange` and no second check in the host, `showcase/home-live.ts` alone stops
 *   Featured while an idea card plays, in the row and in Show all's grid.
 */

import type { ProjectStarter, Target } from '@msm/plugin-api';
import { libraryExamples, libraryStarters } from '@msm/plugin-library';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement, type ReactNode, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  primaryButtonClass,
  railClass,
  STORE_CARD_GAP,
  STORE_CARD_HEIGHT,
  STORE_CARD_WIDTH,
  storeCardClass,
  storePictureClass,
  storeTitleClass,
} from '../../../src/renderer/src/components/home/gallery/card-style';
import { exampleForStarter } from '../../../src/renderer/src/components/home/gallery/flow-examples';
import { galleryGroups } from '../../../src/renderer/src/components/home/gallery/gallery-model';
import {
  type FeaturedRenderer,
  HomeGallery,
  IDEAS_GROUP,
  type IdeasRenderer,
  type WatchNear,
} from '../../../src/renderer/src/components/home/gallery/HomeGallery';
import { MoreIdeas } from '../../../src/renderer/src/components/home/MoreIdeas';
import { IdeaCard } from '../../../src/renderer/src/ideas/IdeaCard';
import type { IdeasEnvironment } from '../../../src/renderer/src/ideas/IdeaList';
import {
  IDEA_CARD_HEIGHT,
  IDEA_CARD_WIDTH,
  IDEA_GAP,
  IDEA_STEP,
} from '../../../src/renderer/src/ideas/idea-seeds';
import {
  clearIdeas,
  IDEA_PICTURE_HEIGHT,
  IDEA_PICTURE_WIDTH,
  type Idea,
} from '../../../src/renderer/src/ideas/ideas';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import type { ClipViewProps } from '../../../src/renderer/src/showcase/ClipView';
import { clearDrawnStills, type StillCodec } from '../../../src/renderer/src/showcase/drawn-still';
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
const groups = galleryGroups({
  starters: starters(),
  examples: libraryExamples,
  target: TARGET,
  exampleFor: exampleForStarter,
});
const allNear: WatchNear = (elements, listener) => {
  listener(new Set(elements.keys()));
  return () => {};
};
function environment(inView: readonly string[] = []): LiveClipEnvironment {
  return {
    reducedMotion: () => false,
    onReducedMotion: () => () => {},
    windowShown: () => true,
    onWindowShown: () => () => {},
    watchInView: (_elements, listener) => {
      listener(new Set(inView));
      return () => {};
    },
  };
}
const ideasView: IdeasEnvironment = {
  watchView(_element, listener) {
    listener({ top: 0, height: 900, width: 1200 });
    return () => {};
  },
  watchRow(_element, listener) {
    listener({ left: 0, width: 1200 });
    return () => {};
  },
};

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
  clearIdeas();
});

describe('an idea card is a gallery card', () => {
  it('has the gallery card’s frame, size, picture box, title and Make this', () => {
    const idea = {
      name: 'Frost Wolf',
      line: 'A pet that follows you.',
      makes: ['Frost Wolf', 'Frost Bone'],
    } as unknown as Idea;
    render(
      createElement(IdeaCard, {
        index: 0,
        idea,
        picture: 'data:image/png;base64,iVBORw0KGgo=',
        playable: false,
        onMake: () => {},
      }),
    );
    const card = screen.getByTestId('idea-card-0');
    for (const part of storeCardClass.split(' ')) expect(card.classList).toContain(part);
    expect(card.style.width).toBe(`${STORE_CARD_WIDTH}px`);
    expect(card.style.height).toBe(`${STORE_CARD_HEIGHT}px`);
    const picture = screen.getByTestId('idea-picture-0');
    for (const part of storePictureClass.split(' ')) expect(picture.classList).toContain(part);
    expect([IDEA_PICTURE_WIDTH, IDEA_PICTURE_HEIGHT]).toEqual([240, 150]);
    // The picture box is the card's width less its border, at 16:10.
    expect(IDEA_PICTURE_WIDTH).toBe(STORE_CARD_WIDTH - 2);
    expect(IDEA_PICTURE_HEIGHT * 16).toBe(IDEA_PICTURE_WIDTH * 10);
    const still = screen.getByTestId('idea-still-0');
    expect(still.getAttribute('width')).toBe('240');
    expect(still.getAttribute('height')).toBe('150');
    expect(still.className).toContain('[image-rendering:pixelated]');
    expect(screen.getByTestId('idea-name-0').className).toBe(storeTitleClass);
    expect(screen.getByTestId('idea-line-0').getAttribute('title')).toBe(
      'Makes Frost Wolf and Frost Bone.',
    );
    const make = screen.getByTestId('idea-make-0');
    for (const part of primaryButtonClass.split(' ')) expect(make.classList).toContain(part);
    expect(make.textContent).toBe('Make this');
  });

  it('steps at the gallery rows’ width and gap', () => {
    expect([IDEA_CARD_WIDTH, IDEA_CARD_HEIGHT, IDEA_GAP]).toEqual([
      STORE_CARD_WIDTH,
      STORE_CARD_HEIGHT,
      STORE_CARD_GAP,
    ]);
    expect(IDEA_STEP).toBe(STORE_CARD_WIDTH + STORE_CARD_GAP);
    // The rows' columns and gap: whole pixels (rem is 14 pixels in the app).
    expect(railClass).toContain(`auto-cols-[${STORE_CARD_WIDTH}px]`);
    expect(railClass).toContain(`gap-[${STORE_CARD_GAP}px]`);
  });
});

describe('one arbiter on Home', () => {
  const input = {
    starters: builtInPlugins.flatMap((plugin) => plugin.contributes.projectStarters ?? []),
    target: TARGET,
    isKnownKind: (kind: string) => theRegistry().get(kind) !== undefined,
    rules: true,
  };
  const featuredClips = showcasesFor(TARGET, libraryExamples).slice(0, 2);
  const featuredId = featuredClips[0]?.id ?? '';
  const featured: FeaturedRenderer = (variant, headerEnd) => (
    <ShowcaseGallery
      heading="Featured"
      clips={featuredClips}
      examples={libraryExamples}
      target={TARGET}
      deps={deps}
      onMake={vi.fn()}
      onSeeExample={vi.fn()}
      environment={environment([featuredId])}
      webgl
      clipView={FakeClipView}
      codec={codec}
      landStill={null}
      variant={variant === 'rail' ? 'rail' : 'grid'}
      headerEnd={headerEnd}
    />
  );
  // The host's More ideas as App.tsx builds it: no onLiveChange, the gallery's `visible` only.
  const ideas: IdeasRenderer = (variant, headerEnd): ReactNode => (
    <MoreIdeas
      variant={variant}
      headerEnd={headerEnd}
      baseSeed={77}
      input={input}
      deps={deps}
      onMake={vi.fn()}
      onShuffle={vi.fn()}
      environment={ideasView}
      liveEnvironment={environment()}
      webgl
      clipView={FakeClipView}
      codec={codec}
      scale={1}
      visible
      eager
    />
  );

  /** The first idea card (of the first `count`) in `scope` whose idea has a clip. */
  async function ideaWithClip(scope: HTMLElement, count: number): Promise<HTMLElement> {
    for (let index = 0; index < count; index += 1) {
      await waitFor(() => expect(within(scope).getByTestId(`idea-name-${index}`)).toBeTruthy(), {
        timeout: 60_000,
      });
      const picture = within(scope).getByTestId(`idea-picture-${index}`);
      if (picture.tagName === 'BUTTON') return within(scope).getByTestId(`idea-card-${index}`);
    }
    throw new Error('no idea with a clip');
  }

  it('stops Featured while an idea card plays, in the row and in Show all’s grid', async () => {
    render(
      <HomeGallery
        groups={groups}
        starters={starters()}
        examples={libraryExamples}
        target={TARGET}
        onMake={vi.fn()}
        onSeeExample={vi.fn()}
        watchNear={allNear}
        codec={codec}
        drawLook={async () => new Uint8Array([1])}
        deps={deps}
        environment={environment()}
        webgl
        clipView={FakeClipView}
        visible
        featured={featured}
        featuredCount={featuredClips.length}
        ideas={ideas}
      />,
    );
    // Featured's first card plays by itself in view.
    expect([...mounted]).toEqual([featuredId]);
    const row = screen.getByTestId(`gallery-group-${IDEAS_GROUP}`);
    const card = await ideaWithClip(row, 8);
    fireEvent.pointerEnter(card);
    await waitFor(() => expect(mounted.size).toBe(1));
    expect(mounted.has(featuredId)).toBe(false);
    fireEvent.pointerLeave(card);
    await waitFor(() => expect([...mounted]).toEqual([featuredId]));

    // Show all's grid is inside the same arbiter.
    fireEvent.click(screen.getByTestId(`gallery-show-all-${IDEAS_GROUP}`));
    const all = screen.getByTestId('gallery-all');
    const inGrid = await ideaWithClip(all, 8);
    act(() => {
      fireEvent.pointerEnter(inGrid);
    });
    await waitFor(() => expect(mounted.size).toBe(1));
    expect(mounted.has(featuredId)).toBe(false);
  }, 180_000);
});
