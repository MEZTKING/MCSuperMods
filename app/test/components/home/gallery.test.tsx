// @vitest-environment happy-dom
/**
 * Home's gallery of everything that can be made (ADR 0129 D1, D5; the user's layout A): every
 * flow and starter of the library has one card on each target, under the Creator's groups in
 * order; no card says an id (Very easy and Easy); Featured holds the Showcase's cards as a row
 * and as Show all's grid; a group's Show all opens it whole with Back; the chips jump; Make this
 * opens the card's flow as its Home tile would; pictures are drawn only once a card is near.
 */

import type { ProjectStarter, Target } from '@msm/plugin-api';
import { libraryExamples, libraryStarters } from '@msm/plugin-library';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forbiddenIn } from '../../../src/renderer/src/components/ai/ai-words';
import { CREATOR_GROUPS } from '../../../src/renderer/src/components/creator/creator-model';
import {
  exampleForStarter,
  flowClipsExample,
} from '../../../src/renderer/src/components/home/gallery/flow-examples';
import {
  FEATURED_GROUP,
  firstSentence,
  type GalleryGroup,
  galleryGroups,
  galleryModName,
  STARTERS_GROUP,
  starterAsExample,
} from '../../../src/renderer/src/components/home/gallery/gallery-model';
import {
  type FeaturedRenderer,
  HomeGallery,
  type HomeGalleryProps,
  type WatchNear,
} from '../../../src/renderer/src/components/home/gallery/HomeGallery';
import { Home, type HomeProps } from '../../../src/renderer/src/components/home/Home';
import { shownTiles } from '../../../src/renderer/src/components/home/tiles';
import type { StillCodec } from '../../../src/renderer/src/showcase/drawn-still';
import { SHOWCASES, showcasesFor } from '../../../src/renderer/src/showcase/showcases';

const TARGETS: readonly Target[] = builtInTargets.map((bundle) => bundle.target);
const TARGET = TARGETS[0] as Target;

const codec: StillCodec = {
  decode: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([9, 9, 9, 255]) }),
  encode: () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
};

/** The session library's starters: first id wins. */
function starters(): ProjectStarter[] {
  const seen = new Set<string>();
  return libraryStarters.filter((starter) => {
    if (seen.has(starter.id)) return false;
    seen.add(starter.id);
    return true;
  });
}

function groupsOn(target: Target): GalleryGroup[] {
  return galleryGroups({
    starters: starters(),
    examples: libraryExamples,
    target,
    exampleFor: exampleForStarter,
  });
}

/** A near-watcher the test drives. */
function nearWatcher() {
  let listener: ((near: ReadonlySet<string>) => void) | null = null;
  let watched: string[] = [];
  const watch: WatchNear = (elements, next) => {
    watched = [...elements.keys()];
    listener = next;
    return () => {
      listener = null;
    };
  };
  return {
    watch,
    watched: () => watched,
    bring(ids: readonly string[]) {
      act(() => listener?.(new Set(ids)));
    },
  };
}

/** A Featured stand-in: the Showcase's cards by title, as a row or a grid. */
const featured: FeaturedRenderer = (variant, headerEnd) => (
  <section data-testid={`featured-${variant}`}>
    <h2>Featured</h2>
    {headerEnd}
    <ul>
      {showcasesFor(TARGET, libraryExamples).map((clip) => (
        <li key={clip.id} data-testid={`showcase-card-${clip.id}`}>
          {clip.title}
        </li>
      ))}
    </ul>
  </section>
);

function gallery(extra: Partial<HomeGalleryProps> = {}) {
  const near = nearWatcher();
  const props: HomeGalleryProps = {
    groups: groupsOn(TARGET),
    featured,
    featuredCount: showcasesFor(TARGET, libraryExamples).length,
    starters: starters(),
    examples: libraryExamples,
    target: TARGET,
    onMake: vi.fn(),
    onSeeExample: vi.fn(),
    watchNear: near.watch,
    codec,
    ...extra,
  };
  render(<HomeGallery {...props} />);
  return { props, near };
}

afterEach(cleanup);

describe('the gallery model', () => {
  it.each(TARGETS.map((target) => [target.id, target] as const))(
    'has one card for every flow and starter available on %s',
    (_id, target) => {
      const groups = groupsOn(target);
      const cards = groups.flatMap((group) => group.cards);
      const ids = cards.map((card) => card.starterId);
      expect(new Set(ids).size).toBe(ids.length);
      const available = starters().filter(
        (starter) => starter.supports === undefined || starter.supports(target),
      );
      const missing = available.filter((starter) => !ids.includes(starter.id));
      expect(missing.map((starter) => starter.id)).toEqual([]);
      expect(cards.length).toBe(available.length);
      // Flows sit under their Creator group, the rest under the starters.
      for (const card of cards) {
        const starter = available.find((one) => one.id === card.starterId);
        expect(card.group).toBe(starter?.creator?.group ?? STARTERS_GROUP);
      }
    },
  );

  it('keeps the Creator’s group order and headings, the starters last', () => {
    const groups = groupsOn(TARGET);
    const creator = CREATOR_GROUPS.map((group) => group.group);
    const order = groups.map((group) => group.id);
    expect(order.at(-1)).toBe(STARTERS_GROUP);
    const flowGroups = order.slice(0, -1);
    expect(flowGroups).toEqual(creator.filter((group) => flowGroups.includes(group)));
    for (const group of groups.slice(0, -1)) {
      expect(group.title).toBe(CREATOR_GROUPS.find((one) => one.group === group.id)?.title);
    }
  });

  it('says no ids on any card or heading (Very easy and Easy)', () => {
    const texts = groupsOn(TARGET).flatMap((group) => [
      group.title,
      ...group.cards.flatMap((card) => [card.title, card.sentence, galleryModName(card)]),
    ]);
    const found = texts
      .map((text) => ({ text, found: forbiddenIn(text) }))
      .filter((entry) => entry.found.length > 0);
    expect(found).toEqual([]);
  });

  it('makes a flow card open its flow, and a starter card its starter, as a tile would', () => {
    const cards = groupsOn(TARGET).flatMap((group) => group.cards);
    const flow = cards.find((card) => card.flow);
    const starter = cards.find((card) => !card.flow);
    if (flow === undefined || starter === undefined) throw new Error('no cards');
    const availability = {
      flowAvailable: (id: string) => id === flow.starterId,
      starterAvailable: (id: string) => id === starter.starterId,
      rules: true,
      ai: false,
    };
    const tile = (card: typeof flow) =>
      shownTiles(availability, [
        {
          id: card.id,
          label: card.title,
          sentence: card.sentence,
          group: 'start',
          action: card.action,
        },
      ])[0];
    expect(tile(flow)?.flowIds).toEqual([flow.starterId]);
    expect(tile(starter)?.starterIds).toEqual([starter.starterId]);
  });

  it('names an example for the Showcase’s flows, and reads flow-clips.ts in any of its shapes', () => {
    expect(exampleForStarter('wood-set', libraryExamples)).toBe(
      SHOWCASES.find((clip) => clip.make.type === 'flows' && clip.make.flowIds.includes('wood-set'))
        ?.exampleId,
    );
    const some = libraryExamples[0]?.id ?? '';
    expect(flowClipsExample('x', { a: { FLOW_CLIPS: { x: { exampleId: some } } } })).toBe(some);
    expect(flowClipsExample('x', { a: { FLOW_EXAMPLES: { x: some } } })).toBe(some);
    expect(flowClipsExample('x', { a: { exampleForFlow: () => some } })).toBe(some);
    expect(flowClipsExample('x', {})).toBeUndefined();
    // An example the file names that the library lacks is not used.
    expect(
      exampleForStarter('nothing', libraryExamples, { a: { FLOW_EXAMPLES: { nothing: 'gone' } } }),
    ).toBe(undefined);
  });

  it('builds a flow’s own picture from its default answers', async () => {
    const starter = starters().find((one) => one.creator !== undefined && one.parameters?.length);
    if (starter === undefined) throw new Error('no flow');
    const bundle = await starterAsExample(starter).build({
      namespace: 'showcase',
      projectName: 'showcase',
      target: TARGET,
      values: {},
    });
    expect(bundle.elements.length).toBeGreaterThan(0);
    expect(firstSentence('One. Two.')).toBe('One.');
    expect(galleryModName({ title: 'Gear set' })).toBe('Gear Set Mod');
  });
});

describe('the gallery', () => {
  it('shows Featured first as a row of the Showcase’s cards, then a row per group', () => {
    gallery();
    const sections = screen
      .getAllByTestId(/^gallery-group-/)
      .map((element) => element.dataset.testid);
    expect(sections[0]).toBe(`gallery-group-${FEATURED_GROUP}`);
    const row = screen.getByTestId('featured-rail');
    for (const clip of showcasesFor(TARGET, libraryExamples)) {
      expect(within(row).getByTestId(`showcase-card-${clip.id}`)).toBeTruthy();
    }
    for (const group of groupsOn(TARGET)) {
      const list = screen.getByTestId(`gallery-row-${group.id}`);
      expect(within(list).getAllByRole('listitem')).toHaveLength(group.cards.length);
    }
    const chips = screen.getByRole('toolbar', { name: 'Jump to a group' });
    expect(within(chips).getAllByRole('button')[0]?.textContent).toBe('Featured');
  });

  it('opens a group whole with Show all, and Back returns to the rows', async () => {
    gallery();
    const user = userEvent.setup();
    const group = groupsOn(TARGET).find((one) => one.cards.length > 4) as GalleryGroup;
    const showAll = screen.getByTestId(`gallery-show-all-${group.id}`);
    expect(showAll.textContent).toBe(`Show all ${group.cards.length}`);
    await user.click(showAll);
    const all = screen.getByTestId('gallery-all');
    expect(within(all).getByRole('heading', { name: group.title })).toBeTruthy();
    expect(within(screen.getByTestId('gallery-all-grid')).getAllByRole('listitem')).toHaveLength(
      group.cards.length,
    );
    expect(document.activeElement).toBe(screen.getByTestId('gallery-back'));
    await user.click(screen.getByTestId('gallery-back'));
    expect(screen.queryByTestId('gallery-all')).toBeNull();
    expect(screen.getByTestId(`gallery-row-${group.id}`)).toBeTruthy();
  });

  it('shows Featured whole as its grid with Show all', async () => {
    gallery();
    await userEvent.setup().click(screen.getByTestId(`gallery-show-all-${FEATURED_GROUP}`));
    expect(screen.getByTestId('featured-grid')).toBeTruthy();
    expect(screen.queryByTestId('featured-rail')).toBeNull();
  });

  it('jumps to a group from its chip, and the chips are one toolbar moved by arrows', async () => {
    const scrolled: string[] = [];
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (
      this: HTMLElement,
    ) {
      scrolled.push(this.dataset.testid ?? '');
    });
    gallery();
    const user = userEvent.setup();
    const last = groupsOn(TARGET).at(-1) as GalleryGroup;
    await user.click(screen.getByTestId(`gallery-chip-${last.id}`));
    expect(scrolled).toContain(`gallery-group-${last.id}`);
    expect(screen.getByTestId(`gallery-chip-${last.id}`).getAttribute('aria-current')).toBe('true');
    // One Tab stop; the arrows move along.
    const chips = within(screen.getByTestId('gallery-chips')).getAllByRole('button');
    expect(chips.filter((chip) => chip.tabIndex === 0)).toHaveLength(1);
    act(() => chips[0]?.focus());
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(chips[1]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(chips.at(-1));
    // From Show all, a chip goes back to the rows first.
    await user.click(screen.getByTestId(`gallery-show-all-${FEATURED_GROUP}`));
    await user.click(screen.getByTestId(`gallery-chip-${last.id}`));
    expect(screen.queryByTestId('gallery-all')).toBeNull();
    spy.mockRestore();
  });

  it('runs Make this and See the example of a deep card, with labelled buttons', async () => {
    const { props } = gallery();
    const user = userEvent.setup();
    const groups = groupsOn(TARGET);
    const deep = groups.at(-2)?.cards.at(-1);
    if (deep === undefined) throw new Error('no card');
    const make = screen.getByTestId(`gallery-make-${deep.id}`);
    expect(make.getAttribute('aria-label')).toBe(`Make this: ${deep.title}`);
    await user.click(make);
    expect(props.onMake).toHaveBeenCalledWith(deep);
    const withExample = groups.flatMap((group) => group.cards).find((card) => card.exampleId);
    if (withExample === undefined) throw new Error('no card with an example');
    await user.click(screen.getByTestId(`gallery-example-${withExample.id}`));
    expect(props.onSeeExample).toHaveBeenCalledWith(withExample);
  });

  it('moves between a row’s cards with the arrow keys', async () => {
    gallery();
    const group = groupsOn(TARGET)[0] as GalleryGroup;
    const [first, second] = group.cards;
    if (first === undefined || second === undefined) throw new Error('few cards');
    act(() => screen.getByTestId(`gallery-make-${first.id}`).focus());
    await userEvent.setup().keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByTestId(`gallery-make-${second.id}`));
  });

  it('draws a card’s picture only once it is near, with a skeleton of the same box until then', async () => {
    const { near } = gallery();
    const card = groupsOn(TARGET)[0]?.cards[0];
    if (card === undefined) throw new Error('no card');
    const picture = screen.getByTestId(`gallery-picture-${card.id}`);
    expect(picture.dataset.loaded).toBe('false');
    expect(picture.className).toContain('aspect-[16/10]');
    expect(near.watched()).toContain(card.id);
    near.bring([card.id]);
    await waitFor(() => expect(picture.dataset.loaded).toBe('true'));
    expect(picture.querySelector('img')?.className).toContain('[image-rendering:pixelated]');
    // Another card is still a skeleton.
    const other = groupsOn(TARGET)[1]?.cards[0];
    if (other === undefined) throw new Error('no card');
    expect(screen.getByTestId(`gallery-picture-${other.id}`).dataset.loaded).toBe('false');
  });
});

describe('Home without a mod', () => {
  it('has the hero with the start actions, then Your mods, the gallery and More ideas', () => {
    const props: HomeProps = {
      project: null,
      tiles: [],
      onTile: vi.fn(),
      cards: [],
      texturesFolder: 'textures',
      onOpenThing: vi.fn(),
      onRenameThing: vi.fn(),
      onDuplicateThing: vi.fn(),
      onDeleteThing: vi.fn(),
      onNewProject: vi.fn(),
      onOpenProject: vi.fn(),
      onSurprise: vi.fn(),
      onOpenRecent: vi.fn(),
      recentProjects: [],
      heroPicture: <span data-testid="the-picture" />,
      showcase: <div data-testid="the-gallery" />,
      moreIdeas: <div data-testid="the-ideas" />,
    };
    render(<Home {...props} />);
    const hero = screen.getByTestId('home-hero');
    expect(within(hero).getByText('MCSuperMods')).toBeTruthy();
    for (const id of ['home-new', 'home-open', 'home-surprise', 'the-picture']) {
      expect(within(hero).getByTestId(id)).toBeTruthy();
    }
    const order = ['home-hero', 'the-gallery', 'the-ideas'].map((id) => screen.getByTestId(id));
    for (let at = 1; at < order.length; at += 1) {
      const before = order[at - 1] as HTMLElement;
      expect(
        before.compareDocumentPosition(order[at] as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
