/**
 * Home's gallery of everything that can be made (ADR 0129 D1, D5; the user's layout A, "Store
 * rows"): a sticky toolbar of group chips that jump between the groups, then one sideways row
 * per group with its name, its count and **Show all N** at the right: **Featured** first (the
 * Showcase, built by the host with its one live clip), then the groups of `gallery-model.ts`.
 * **Show all** opens the whole group as a grid in place of the rows, with **Back**.
 *
 * The layout is one swappable component (`GalleryLayout`; the default `RowsLayout`), so the look
 * can change without touching the data, the chips, the lazy pictures or the actions. Cards draw
 * no clip: the Showcase's card is the one live clip on Home (ADR 0118's rule); a card's picture
 * is its example's drawn still, else the flow's own drawn picture, made only when the card comes
 * near the view (lazy per row: a card off a row's end is not near until the row scrolls), with a
 * skeleton of the same size until then (no layout shift), drawn at whole-pixel scale and shown
 * `pixelated`.
 *
 * Keyboard: the chips are a toolbar (one Tab stop, arrows move, Home and End); in a row the arrow
 * keys move between cards and the row follows; every button has a label naming its card.
 *
 * Test ids: `home-gallery`, `gallery-chips`, `gallery-chip-<group>`, `gallery-group-<group>`,
 * `gallery-row-<group>` (with `-left` and `-right`), `gallery-show-all-<group>`, `gallery-all`,
 * `gallery-all-grid`, `gallery-back`, `gallery-card-<card>`, `gallery-picture-<card>`,
 * `gallery-make-<card>`, `gallery-example-<card>`.
 *
 * @packageDocumentation
 */

import type { ExampleProject, ProjectStarter, Target } from '@msm/plugin-api';
import { ArrowLeft } from 'lucide-react';
import {
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_STILL_SIZE,
  drawnStill,
  type StillCodec,
  type StillSize,
  stillSizeFor,
} from '../../../showcase/drawn-still';
import {
  gridClass,
  pixelImageClass,
  primaryButtonClass,
  secondaryButtonClass,
  storeActionsClass,
  storeBodyClass,
  storeCardClass,
  storePictureClass,
  storeSentenceClass,
  storeTagClass,
  storeTitleClass,
} from './card-style';
import {
  FEATURED_GROUP,
  FEATURED_TITLE,
  type GalleryCard,
  type GalleryGroup,
  starterAsExample,
} from './gallery-model';
import { onCardArrows, Rail } from './Rail';

/** How far beyond the view a card starts drawing its picture, in CSS pixels. */
export const NEAR_MARGIN = 600;

/** Watches elements and reports the ids that have come near the view (they stay near). */
export type WatchNear = (
  elements: ReadonlyMap<string, Element>,
  listener: (near: ReadonlySet<string>) => void,
) => () => void;

/** The window's watcher: an intersection observer with a margin; without one, all are near. */
export const browserWatchNear: WatchNear = (elements, listener) => {
  if (typeof IntersectionObserver === 'undefined') {
    listener(new Set(elements.keys()));
    return () => {};
  }
  const idOf = new Map<Element, string>();
  for (const [id, element] of elements) idOf.set(element, id);
  const near = new Set<string>();
  const observer = new IntersectionObserver(
    (entries) => {
      let changed = false;
      for (const entry of entries) {
        const id = idOf.get(entry.target);
        if (id === undefined || !entry.isIntersecting || near.has(id)) continue;
        near.add(id);
        observer.unobserve(entry.target);
        changed = true;
      }
      if (changed) listener(new Set(near));
    },
    { rootMargin: `${NEAR_MARGIN}px ${NEAR_MARGIN / 2}px` },
  );
  for (const element of elements.values()) observer.observe(element);
  return () => observer.disconnect();
};

/** How the host draws Featured: as a row with Show all at its right, or as the whole grid. */
export type FeaturedRenderer = (variant: 'rail' | 'grid', headerEnd: ReactNode) => ReactNode;

/** What a layout gets. */
export interface GalleryLayoutProps {
  /** Featured (the host's Showcase), or `null`. */
  readonly featured: FeaturedRenderer | null;
  readonly groups: readonly GalleryGroup[];
  /** Draws one card (with its ref, picture and actions). */
  readonly renderCard: (card: GalleryCard) => ReactNode;
  /** The **Show all N** button of a group. */
  readonly showAll: (group: string, count: number, title: string) => ReactNode;
  /** A group section's ref, for the chips' jumps. */
  readonly sectionRef: (group: string) => (element: HTMLElement | null) => void;
}

/** A swappable gallery layout. */
export type GalleryLayout = ComponentType<GalleryLayoutProps>;

/** A group's heading id. */
const headingId = (group: string): string => `home-gallery-${group}-heading`;

/** The default layout (layout A): one sideways row per group, Featured first. */
export function RowsLayout(props: GalleryLayoutProps) {
  return (
    <>
      {props.featured !== null && (
        <section
          ref={props.sectionRef(FEATURED_GROUP)}
          className="flex scroll-mt-16 flex-col gap-2"
          data-testid={`gallery-group-${FEATURED_GROUP}`}
        >
          {props.featured('rail', null)}
        </section>
      )}
      {props.groups.map((group) => (
        <section
          key={group.id}
          ref={props.sectionRef(group.id)}
          aria-labelledby={headingId(group.id)}
          className="flex scroll-mt-16 flex-col gap-2"
          data-testid={`gallery-group-${group.id}`}
        >
          <div className="flex items-baseline gap-2">
            <h2 id={headingId(group.id)} className="font-semibold text-base">
              {group.title}
              <span className="ml-2 font-normal text-muted text-sm">{group.cards.length}</span>
            </h2>
            <span className="ml-auto">
              {props.showAll(group.id, group.cards.length, group.title)}
            </span>
          </div>
          <Rail label={group.title} testId={`gallery-row-${group.id}`}>
            {group.cards.map((card) => props.renderCard(card))}
          </Rail>
        </section>
      ))}
    </>
  );
}

/** Props of {@link HomeGallery}. */
export interface HomeGalleryProps {
  readonly groups: readonly GalleryGroup[];
  /** Featured: the host's Showcase as a row or a grid; absent shows no Featured. */
  readonly featured?: FeaturedRenderer | null;
  /** How many cards Featured has (its Show all). */
  readonly featuredCount?: number;
  /** The session library's starters and examples, for the pictures. */
  readonly starters: readonly ProjectStarter[];
  readonly examples: readonly ExampleProject[];
  readonly target: Target;
  /** **Make this**: opens the card's flow (or adds its starter), as its Home tile would. */
  readonly onMake: (card: GalleryCard) => void;
  /** **See the example** (only for a card with one). */
  readonly onSeeExample: (card: GalleryCard) => void;
  /** The layout (default {@link RowsLayout}). */
  readonly layout?: GalleryLayout;
  /** Test hooks. */
  readonly watchNear?: WatchNear;
  readonly codec?: StillCodec;
}

/** One card's picture: a skeleton until it is near, then its drawn still. */
function CardPicture(props: { card: GalleryCard; url: string | null; failed: boolean }) {
  return (
    <div
      role="img"
      aria-label={`Picture of ${props.card.title}`}
      className={storePictureClass}
      data-testid={`gallery-picture-${props.card.id}`}
      data-loaded={props.url === null ? 'false' : 'true'}
    >
      {props.url === null ? (
        <span
          aria-hidden
          className={`block size-full bg-border/40 ${props.failed ? '' : 'animate-pulse motion-reduce:animate-none'}`}
        />
      ) : (
        <img src={props.url} alt="" decoding="async" className={pixelImageClass} />
      )}
    </div>
  );
}

/** The gallery. */
export function HomeGallery(props: HomeGalleryProps) {
  const { groups, target, codec } = props;
  const watchNear = props.watchNear ?? browserWatchNear;
  const Layout = props.layout ?? RowsLayout;
  const featured = props.featured ?? null;

  // The size pictures are drawn at: the first card's picture, in device pixels (ADR 0128 D3).
  const root = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<StillSize>(DEFAULT_STILL_SIZE);
  useEffect(() => {
    const host = root.current;
    if (host === null) return;
    const measure = (): void => {
      const picture = host.querySelector<HTMLElement>('[data-testid^="gallery-picture-"]');
      if (picture === null) return;
      const next = stillSizeFor(
        picture.clientWidth,
        picture.clientHeight,
        typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      );
      setSize((before) =>
        before.width === next.width && before.height === next.height ? before : next,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    observer?.observe(host);
    return () => observer?.disconnect();
  }, []);

  // Show all: the group shown whole, or none.
  const [allOf, setAllOf] = useState<string | null>(null);
  const back = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (allOf === null) return;
    back.current?.focus({ preventScroll: true });
    root.current?.scrollIntoView?.({ block: 'start' });
  }, [allOf]);

  // The group sections, for the chips.
  const sections = useRef(new Map<string, HTMLElement>());
  const sectionRef = useCallback(
    (group: string) => (element: HTMLElement | null) => {
      if (element === null) sections.current.delete(group);
      else sections.current.set(group, element);
    },
    [],
  );
  const chips = useMemo(
    () => [
      ...(featured !== null ? [{ id: FEATURED_GROUP, title: FEATURED_TITLE }] : []),
      ...groups.map((group) => ({ id: group.id, title: group.title })),
    ],
    [groups, featured],
  );
  const [current, setCurrent] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const scrollTo = useCallback((group: string): void => {
    const section = sections.current.get(group);
    if (section === undefined) return;
    section.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    const heading = section.querySelector<HTMLElement>('h2, h3');
    if (heading !== null) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, []);
  useEffect(() => {
    if (pendingJump === null || allOf !== null) return;
    setPendingJump(null);
    scrollTo(pendingJump);
  }, [pendingJump, allOf, scrollTo]);
  const jump = (group: string): void => {
    setCurrent(group);
    if (allOf !== null) {
      setAllOf(null);
      setPendingJump(group);
      return;
    }
    scrollTo(group);
  };
  const chipBar = useRef<HTMLDivElement | null>(null);
  const [chipFocus, setChipFocus] = useState(0);
  const onChipKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const last = chips.length - 1;
    let next = chipFocus;
    if (event.key === 'ArrowRight') next = chipFocus >= last ? 0 : chipFocus + 1;
    else if (event.key === 'ArrowLeft') next = chipFocus <= 0 ? last : chipFocus - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    setChipFocus(next);
    chipBar.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };

  // Which cards are near the view, so their pictures are drawn.
  const elements = useRef(new Map<string, Element>());
  const cardRef = useCallback(
    (id: string) => (element: HTMLLIElement | null) => {
      if (element === null) elements.current.delete(id);
      else elements.current.set(id, element);
    },
    [],
  );
  const [near, setNear] = useState<ReadonlySet<string>>(new Set());
  const shownKey = `${allOf ?? ''}\n${groups.map((group) => group.id).join('\n')}`;
  // Watched again whenever the cards on the page change (`shownKey`).
  useEffect(() => {
    if (shownKey === '') return;
    return watchNear(new Map(elements.current), (seen) =>
      setNear((before) => {
        const next = new Set(before);
        for (const id of seen) next.add(id);
        return next.size === before.size ? before : next;
      }),
    );
  }, [watchNear, shownKey]);

  // Pictures of the near cards.
  const starters = useMemo(
    () => new Map(props.starters.map((starter) => [starter.id, starter])),
    [props.starters],
  );
  const examples = useMemo(
    () => new Map(props.examples.map((example) => [example.id, example])),
    [props.examples],
  );
  const cardsById = useMemo(
    () => new Map(groups.flatMap((group) => group.cards.map((card) => [card.id, card] as const))),
    [groups],
  );
  const [pictures, setPictures] = useState<ReadonlyMap<string, string>>(new Map());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let live = true;
    for (const id of near) {
      const card = cardsById.get(id);
      if (card === undefined) continue;
      const shown = card.exampleId === undefined ? undefined : examples.get(card.exampleId);
      const starter = starters.get(card.starterId);
      const example = shown ?? (starter === undefined ? undefined : starterAsExample(starter));
      if (example === undefined) continue;
      drawnStill(example, target, codec, size).then(
        (url) => {
          if (!live) return;
          setPictures((before) => {
            if (before.get(id) === url) return before;
            const next = new Map(before);
            next.set(id, url);
            return next;
          });
        },
        () => {
          if (live) setFailed((before) => new Set([...before, id]));
        },
      );
    }
    return () => {
      live = false;
    };
  }, [near, cardsById, examples, starters, target, codec, size]);

  const groupTitles = useMemo(
    () => new Map(groups.map((group) => [group.id, group.title])),
    [groups],
  );
  const renderCard = (card: GalleryCard): ReactNode => (
    <li
      key={card.id}
      ref={cardRef(card.id)}
      className={storeCardClass}
      data-testid={`gallery-card-${card.id}`}
    >
      <CardPicture card={card} url={pictures.get(card.id) ?? null} failed={failed.has(card.id)} />
      <div className={storeBodyClass}>
        <span className={storeTagClass}>{groupTitles.get(card.group) ?? ''}</span>
        <h3 className={storeTitleClass} title={card.title}>
          {card.title}
        </h3>
        <p className={storeSentenceClass}>{card.sentence}</p>
        <div className={storeActionsClass}>
          <button
            type="button"
            className={primaryButtonClass}
            aria-label={`Make this: ${card.title}`}
            data-testid={`gallery-make-${card.id}`}
            onClick={() => props.onMake(card)}
          >
            Make this
          </button>
          {card.exampleId !== undefined && (
            <button
              type="button"
              className={secondaryButtonClass}
              aria-label={`See the example: ${card.title}`}
              data-testid={`gallery-example-${card.id}`}
              onClick={() => props.onSeeExample(card)}
            >
              See the example
            </button>
          )}
        </div>
      </div>
    </li>
  );
  const showAll = (group: string, count: number, title: string): ReactNode => (
    <button
      type="button"
      aria-label={`Show all ${count}: ${title}`}
      className="cursor-pointer rounded px-1 font-semibold text-accent text-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      data-testid={`gallery-show-all-${group}`}
      onClick={() => {
        setCurrent(group);
        setAllOf(group);
      }}
    >
      Show all {count}
    </button>
  );

  const whole = allOf === null ? undefined : groups.find((group) => group.id === allOf);
  const wholeTitle = allOf === FEATURED_GROUP ? FEATURED_TITLE : (whole?.title ?? '');
  const featuredRenderer: FeaturedRenderer | null =
    featured === null
      ? null
      : (variant) =>
          featured(
            variant,
            variant === 'rail' && (props.featuredCount ?? 0) > 0
              ? showAll(FEATURED_GROUP, props.featuredCount ?? 0, FEATURED_TITLE)
              : null,
          );

  return (
    <div
      ref={root}
      id="home-gallery"
      className="flex w-full min-w-0 scroll-mt-2 flex-col gap-7"
      data-testid="home-gallery"
    >
      <div
        ref={chipBar}
        role="toolbar"
        aria-label="Jump to a group"
        aria-orientation="horizontal"
        className="sticky top-0 z-20 flex flex-wrap gap-1.5 border-border border-b bg-bg/95 py-2 backdrop-blur"
        data-testid="gallery-chips"
        onKeyDown={onChipKey}
      >
        {chips.map((chip, index) => (
          <button
            key={chip.id}
            type="button"
            tabIndex={index === chipFocus ? 0 : -1}
            aria-current={current === chip.id ? 'true' : undefined}
            className="cursor-pointer rounded-full border border-border bg-panel px-3 py-1 font-medium text-xs hover:border-accent focus-visible:outline-2 focus-visible:outline-accent aria-[current=true]:border-accent aria-[current=true]:bg-accent aria-[current=true]:text-panel"
            data-testid={`gallery-chip-${chip.id}`}
            onFocus={() => setChipFocus(index)}
            onClick={() => jump(chip.id)}
          >
            {chip.title}
          </button>
        ))}
      </div>
      {allOf !== null ? (
        <section
          aria-labelledby="home-gallery-all-heading"
          className="flex flex-col gap-3"
          data-testid="gallery-all"
        >
          <div className="flex items-center gap-3">
            <button
              ref={back}
              type="button"
              className={secondaryButtonClass}
              data-testid="gallery-back"
              onClick={() => {
                const was = allOf;
                setAllOf(null);
                setPendingJump(was);
              }}
            >
              <ArrowLeft size={14} aria-hidden />
              Back
            </button>
            <h2 id="home-gallery-all-heading" className="font-semibold text-lg">
              {wholeTitle}
            </h2>
          </div>
          {allOf === FEATURED_GROUP ? (
            featuredRenderer?.('grid', null)
          ) : (
            <ul className={gridClass} data-testid="gallery-all-grid" onKeyDown={onCardArrows}>
              {(whole?.cards ?? []).map((card) => renderCard(card))}
            </ul>
          )}
        </section>
      ) : (
        <Layout
          featured={featuredRenderer}
          groups={groups}
          renderCard={renderCard}
          showAll={showAll}
          sectionRef={sectionRef}
        />
      )}
    </div>
  );
}
