/**
 * Home's gallery of everything that can be made (ADR 0129 D1, D5; the user's layout A, "Store
 * rows"): a sticky toolbar of group chips that jump between the groups, then one sideways row
 * per group with its name, its count and **Show all N** at the right: **Featured** first (the
 * Showcase, built by the host with its one live clip), then the groups of `gallery-model.ts`.
 * **Show all** opens the whole group as a grid in place of the rows, with **Back**.
 *
 * The last row is **More ideas** (layout A; built by the host, `MoreIdeas.tsx` as a row with
 * **Shuffle** in its header): its **Show all** opens the endless grid with **Back**.
 *
 * The layout is one swappable component (`GalleryLayout`; the default `RowsLayout`), so the look
 * can change without touching the data, the chips, the lazy pictures or the actions.
 *
 * Cards read `showcase/flow-clips.ts`' `FLOW_CARDS` (ADR 0129 D2): a card's still is its
 * example's drawn still when the example has pictures of its own, else the card's drawn picture
 * (`card-picture.ts`), made only when the card comes near the view (lazy per row: a card off a
 * row's end is not near until the row scrolls), with a skeleton of the same size until then (no
 * layout shift), drawn at the card's device pixels with whole-pixel scale and shown `pixelated`.
 * A card with a clip plays it while it is under the pointer or has keyboard focus, or once its
 * picture (a play button) is pressed, by the Showcase's rule (`chooseLiveClip`: reduced motion
 * and **Play showcase clips** respected); one clip plays on all of Home, shared with Featured
 * and More ideas (`showcase/home-live.ts`).
 *
 * Keyboard: the chips are a toolbar (one Tab stop, arrows move, Home and End); in a row the arrow
 * keys move between cards and the row follows; every button has a label naming its card.
 *
 * Test ids: `home-gallery`, `gallery-chips`, `gallery-chip-<group>`, `gallery-group-<group>`,
 * `gallery-row-<group>` (with `-left` and `-right`), `gallery-show-all-<group>`, `gallery-all`,
 * `gallery-all-grid`, `gallery-back`, `gallery-card-<card>`, `gallery-picture-<card>` (with
 * `data-loaded` and `data-picture`: `example` or `look`), `gallery-still-<card>`,
 * `gallery-make-<card>`, `gallery-example-<card>`; the More ideas row is
 * `gallery-group-ideas`.
 *
 * @packageDocumentation
 */

import type { ExampleProject, ProjectStarter, Target } from '@msm/plugin-api';
import { ArrowLeft, Pause, Play } from 'lucide-react';
import {
  type ComponentType,
  type FocusEvent,
  type KeyboardEvent,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { VanillaAssetReader } from '../../../preview/model-chain';
import { hasWebGL } from '../../../preview/webgl';
import type { ClipViewProps } from '../../../showcase/ClipView';
import type { ShowcaseClip } from '../../../showcase/clip';
import {
  DEFAULT_STILL_SIZE,
  type StillCodec,
  type StillSize,
  stillSizeFor,
} from '../../../showcase/drawn-still';
import type { ExampleFilesDeps } from '../../../showcase/example-files';
import { FLOW_CARDS, type FlowCard } from '../../../showcase/flow-clips';
import { createHomeLive, HomeLiveContext, useHomeLive } from '../../../showcase/home-live';
import {
  browserLiveEnvironment,
  chooseLiveClip,
  type LiveClipEnvironment,
  playsByItself,
} from '../../../showcase/live-clip';
import {
  stillKey,
  stillsVersion,
  subscribeStills,
  takenStill,
} from '../../../showcase/still-cache';
import { type CardPictureSource, cardStill, type LookDrawer } from './card-picture';
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

const LazyClipView = lazy(() => import('../../../showcase/ClipView'));

/** The id of the More ideas row (its chip, section and Show all). */
export const IDEAS_GROUP = 'ideas';
/** Its heading. */
export const IDEAS_TITLE = 'More ideas';
/** The attribute that carries a gallery card's id (for the hovered card). */
const CARD_ATTRIBUTE = 'data-gallery-card';

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

/** How the host draws More ideas: as the last row with its header end, or as the whole grid. */
export type IdeasRenderer = (variant: 'row' | 'grid', headerEnd: ReactNode) => ReactNode;

/** What a layout gets. */
export interface GalleryLayoutProps {
  /** Featured (the host's Showcase), or `null`. */
  readonly featured: FeaturedRenderer | null;
  /** More ideas (the host's), the last row, or `null`. */
  readonly ideas?: ((headerEnd: ReactNode) => ReactNode) | null;
  readonly groups: readonly GalleryGroup[];
  /** Draws one card (with its ref, picture and actions). */
  readonly renderCard: (card: GalleryCard) => ReactNode;
  /** The **Show all N** button of a group (**Show all** for a count of `null`). */
  readonly showAll: (group: string, count: number | null, title: string) => ReactNode;
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
      {props.ideas !== undefined && props.ideas !== null && (
        <div
          ref={props.sectionRef(IDEAS_GROUP)}
          className="flex min-w-0 scroll-mt-16 flex-col gap-2"
          data-testid={`gallery-group-${IDEAS_GROUP}`}
        >
          {props.ideas(props.showAll(IDEAS_GROUP, null, IDEAS_TITLE))}
        </div>
      )}
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
  /** More ideas, the last row and its Show all grid; absent shows none. */
  readonly ideas?: IdeasRenderer | null;
  /** The layout (default {@link RowsLayout}). */
  readonly layout?: GalleryLayout;
  /** What lowering a card's example for its clip needs; absent plays no card clips. */
  readonly deps?: ExampleFilesDeps;
  /** The user's extracted client jar, or `null`/absent. */
  readonly vanilla?: VanillaAssetReader | null;
  readonly vanillaBlockstates?: ReadonlyMap<string, string>;
  /** The setting **Play showcase clips** (default on). */
  readonly playClips?: boolean;
  /** False while another view covers Home (default true). */
  readonly visible?: boolean;
  /** Test hooks. */
  readonly watchNear?: WatchNear;
  readonly codec?: StillCodec;
  /** The cards' examples, clips and pictures (default `FLOW_CARDS`). */
  readonly flowCards?: Readonly<Record<string, FlowCard>>;
  readonly drawLook?: LookDrawer;
  readonly environment?: LiveClipEnvironment;
  readonly webgl?: boolean;
  readonly clipView?: ComponentType<ClipViewProps>;
}

const NONE: ReadonlySet<string> = new Set();

/** What one card's picture shows. */
interface CardPictureProps {
  readonly card: GalleryCard;
  readonly url: string | null;
  readonly source: CardPictureSource | null;
  readonly failed: boolean;
  /** The live clip, when this card plays. */
  readonly live?: ReactNode;
  /** Whether the picture is a play button (the card has a clip and WebGL is there). */
  readonly playable: boolean;
  readonly onTogglePlay: () => void;
}

/**
 * One card's picture: a skeleton until it is near, then its still; the live clip while it plays.
 * With a clip it is a button named "Clip: <title>" (a click, Space or Enter plays or pauses).
 */
function CardPicture(props: CardPictureProps) {
  const { card, url, live } = props;
  const playing = live !== undefined && live !== null && live !== false;
  const inner = (
    <>
      {playing ? (
        live
      ) : url === null ? (
        <span
          aria-hidden
          className={`block size-full bg-border/40 ${props.failed ? '' : 'animate-pulse motion-reduce:animate-none'}`}
        />
      ) : (
        <img
          src={url}
          alt=""
          decoding="async"
          className={pixelImageClass}
          data-testid={`gallery-still-${card.id}`}
        />
      )}
      {props.playable && (
        <span className="pointer-events-none absolute top-1 right-1 inline-flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">
          {playing ? <Pause aria-hidden size={10} /> : <Play aria-hidden size={10} />}
          {playing ? 'Pause' : 'Play'}
        </span>
      )}
    </>
  );
  const shared = {
    'data-testid': `gallery-picture-${card.id}`,
    'data-loaded': url === null ? 'false' : 'true',
    ...(props.source === null ? {} : { 'data-picture': props.source }),
  };
  if (props.playable) {
    return (
      <button
        type="button"
        aria-label={`Clip: ${card.title}`}
        aria-pressed={playing}
        className={`${storePictureClass} cursor-pointer p-0 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2`}
        data-playing={playing ? 'true' : 'false'}
        onClick={props.onTogglePlay}
        {...shared}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      role="img"
      aria-label={`Picture of ${card.title}`}
      className={storePictureClass}
      {...shared}
    >
      {inner}
    </div>
  );
}

/** The gallery. */
export function HomeGallery(props: HomeGalleryProps) {
  const { groups, target, codec } = props;
  const watchNear = props.watchNear ?? browserWatchNear;
  const Layout = props.layout ?? RowsLayout;
  const featured = props.featured ?? null;
  const ideas = props.ideas ?? null;
  const flowCards = props.flowCards ?? FLOW_CARDS;
  // One clip on all of Home: Featured, these cards and More ideas share it.
  const [homeLive] = useState(createHomeLive);

  // Show all: the group shown whole, or none.
  const [allOf, setAllOf] = useState<string | null>(null);

  // The size pictures are drawn at: the first card's picture, in device pixels (ADR 0128 D3);
  // again when the window or the view (rows or Show all's grid) changes.
  const root = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<StillSize>(DEFAULT_STILL_SIZE);
  const measure = useCallback((): void => {
    const host = root.current;
    if (host === null) return;
    const picture = host.querySelector<HTMLElement>('[data-testid^="gallery-picture-"]');
    if (picture === null) return;
    const box = picture.getBoundingClientRect();
    const next = stillSizeFor(
      box.width,
      box.height,
      typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    );
    setSize((before) =>
      before.width === next.width && before.height === next.height ? before : next,
    );
  }, []);
  useEffect(() => {
    const host = root.current;
    if (host === null) return;
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    observer?.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);
  useEffect(() => {
    // The rows and Show all's grid draw their cards at other sizes.
    void allOf;
    measure();
  }, [allOf, measure]);
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
  const hasIdeas = ideas !== null;
  const chips = useMemo(
    () => [
      ...(featured !== null ? [{ id: FEATURED_GROUP, title: FEATURED_TITLE }] : []),
      ...groups.map((group) => ({ id: group.id, title: group.title })),
      ...(hasIdeas ? [{ id: IDEAS_GROUP, title: IDEAS_TITLE }] : []),
    ],
    [groups, featured, hasIdeas],
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
  const [pictures, setPictures] = useState<
    ReadonlyMap<string, { url: string; source: CardPictureSource }>
  >(new Map());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const { drawLook } = props;
  useEffect(() => {
    let live = true;
    for (const id of near) {
      const card = cardsById.get(id);
      if (card === undefined) continue;
      const flowCard = flowCards[card.starterId];
      const exampleId = flowCard?.exampleId ?? card.exampleId;
      const starter = starters.get(card.starterId);
      cardStill({
        flowCard,
        example:
          exampleId === undefined || exampleId === null ? undefined : examples.get(exampleId),
        fallback: starter === undefined ? undefined : starterAsExample(starter),
        target,
        size,
        codec,
        draw: drawLook,
      }).then(
        (made) => {
          if (!live || made === null) return;
          setPictures((before) => {
            const held = before.get(id);
            if (held?.url === made.url) return before;
            const next = new Map(before);
            next.set(id, made);
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
  }, [near, cardsById, examples, starters, flowCards, target, codec, size, drawLook]);

  // Card clips: the card under the pointer, with focus, or whose play button was pressed.
  const environment = useMemo(
    () => props.environment ?? browserLiveEnvironment(),
    [props.environment],
  );
  const [webglLost, setWebglLost] = useState(false);
  const webgl = props.deps !== undefined && (props.webgl ?? hasWebGL()) && !webglLost;
  const clips = useMemo(() => {
    const out = new Map<string, { clip: ShowcaseClip; example: ExampleProject }>();
    for (const card of cardsById.values()) {
      const clip = flowCards[card.starterId]?.clip ?? null;
      const example = clip === null ? undefined : examples.get(clip.exampleId);
      if (clip !== null && example !== undefined) out.set(card.id, { clip, example });
    }
    return out;
  }, [cardsById, flowCards, examples]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const [stopped, setStopped] = useState<ReadonlySet<string>>(NONE);
  const [reducedMotion, setReducedMotion] = useState(() => environment.reducedMotion());
  const [windowShown, setWindowShown] = useState(() => environment.windowShown());
  useEffect(() => {
    setReducedMotion(environment.reducedMotion());
    setWindowShown(environment.windowShown());
    const stopMotion = environment.onReducedMotion(() =>
      setReducedMotion(environment.reducedMotion()),
    );
    const stopShown = environment.onWindowShown(() => setWindowShown(environment.windowShown()));
    return () => {
      stopMotion();
      stopShown();
    };
  }, [environment]);
  // The hovered card from the document's pointer events (`live-clip.ts`'s `cardUnder` says why).
  useEffect(() => {
    const host = root.current;
    if (host === null) return;
    const doc = host.ownerDocument;
    const onOver = (event: Event): void => {
      const target = event.target as { closest?: unknown } | null;
      if (typeof target?.closest !== 'function') {
        setHovered(null);
        return;
      }
      const card = (target as Element).closest(`[${CARD_ATTRIBUTE}]`);
      setHovered(card !== null && host.contains(card) ? card.getAttribute(CARD_ATTRIBUTE) : null);
    };
    const onOut = (event: Event): void => {
      if ((event as MouseEvent).relatedTarget === null) setHovered(null);
    };
    doc.addEventListener('pointerover', onOver);
    doc.addEventListener('pointerout', onOut);
    return () => {
      doc.removeEventListener('pointerover', onOver);
      doc.removeEventListener('pointerout', onOut);
    };
  }, []);
  const liveState = {
    cards: [...clips.keys()],
    hovered,
    focused,
    requested,
    // Never by itself for being in view: Featured is the one that does that.
    inView: NONE,
    stopped,
    webgl,
    reducedMotion,
    setting: props.playClips ?? true,
    paused: false,
    windowShown,
    visible: props.visible ?? true,
  };
  const wanted = chooseLiveClip(liveState);
  const mayPlay = useHomeLive(
    wanted === null ? null : { id: `gallery-${wanted}`, by: 'user' },
    homeLive,
  );
  const liveId = mayPlay ? wanted : null;
  const once = !playsByItself(liveState);
  const toggle = (id: string): void => {
    if (id === liveId) {
      setStopped((before) => new Set([...before, id]));
      if (requested === id) setRequested(null);
      return;
    }
    setStopped((before) => {
      if (!before.has(id)) return before;
      const next = new Set(before);
      next.delete(id);
      return next;
    });
    setRequested(id);
  };
  useSyncExternalStore(subscribeStills, stillsVersion);
  const withJar = props.vanilla !== null && props.vanilla !== undefined;
  const View = props.clipView ?? LazyClipView;
  const liveOf = (card: GalleryCard, still: string | null): ReactNode => {
    const entry = card.id === liveId ? clips.get(card.id) : undefined;
    if (entry === undefined || props.deps === undefined) return undefined;
    return (
      <Suspense
        fallback={still === null ? null : <img src={still} alt="" className={pixelImageClass} />}
      >
        <View
          clip={entry.clip}
          example={entry.example}
          target={target}
          deps={props.deps}
          vanilla={props.vanilla ?? null}
          {...(props.vanillaBlockstates === undefined
            ? {}
            : { vanillaBlockstates: props.vanillaBlockstates })}
          stillKey={stillKey(entry.clip.id, target.id, withJar)}
          still={still}
          once={once}
          onEnd={() => setRequested((before) => (before === card.id ? null : before))}
          onWebGLUnavailable={() => setWebglLost(true)}
        />
      </Suspense>
    );
  };

  const groupTitles = useMemo(
    () => new Map(groups.map((group) => [group.id, group.title])),
    [groups],
  );
  const renderCard = (card: GalleryCard): ReactNode => {
    const entry = clips.get(card.id);
    const drawn = pictures.get(card.id);
    const still =
      (entry === undefined ? null : takenStill(stillKey(entry.clip.id, target.id, withJar))) ??
      drawn?.url ??
      null;
    const onBlur = (event: FocusEvent<HTMLLIElement>): void => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      setFocused((before) => (before === card.id ? null : before));
    };
    return (
      <li
        key={card.id}
        ref={cardRef(card.id)}
        className={storeCardClass}
        data-testid={`gallery-card-${card.id}`}
        {...{ [CARD_ATTRIBUTE]: card.id }}
        onFocus={() => setFocused(card.id)}
        onBlur={onBlur}
      >
        <CardPicture
          card={card}
          url={still}
          source={drawn?.source ?? null}
          failed={failed.has(card.id)}
          live={liveOf(card, still)}
          playable={webgl && entry !== undefined}
          onTogglePlay={() => toggle(card.id)}
        />
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
  };
  const showAll = (group: string, count: number | null, title: string): ReactNode => (
    <button
      type="button"
      aria-label={count === null ? `Show all: ${title}` : `Show all ${count}: ${title}`}
      className="cursor-pointer rounded px-1 font-semibold text-accent text-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      data-testid={`gallery-show-all-${group}`}
      onClick={() => {
        setCurrent(group);
        setAllOf(group);
      }}
    >
      {count === null ? 'Show all' : `Show all ${count}`}
    </button>
  );

  const whole = allOf === null ? undefined : groups.find((group) => group.id === allOf);
  const wholeTitle =
    allOf === FEATURED_GROUP
      ? FEATURED_TITLE
      : allOf === IDEAS_GROUP
        ? IDEAS_TITLE
        : (whole?.title ?? '');
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
    <HomeLiveContext.Provider value={homeLive}>
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
            {...(allOf === IDEAS_GROUP
              ? { 'aria-label': IDEAS_TITLE }
              : { 'aria-labelledby': 'home-gallery-all-heading' })}
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
              {/* More ideas' grid has its own heading with Shuffle. */}
              {allOf !== IDEAS_GROUP && (
                <h2 id="home-gallery-all-heading" className="font-semibold text-lg">
                  {wholeTitle}
                </h2>
              )}
            </div>
            {allOf === FEATURED_GROUP ? (
              featuredRenderer?.('grid', null)
            ) : allOf === IDEAS_GROUP ? (
              ideas?.('grid', null)
            ) : (
              <ul className={gridClass} data-testid="gallery-all-grid" onKeyDown={onCardArrows}>
                {(whole?.cards ?? []).map((card) => renderCard(card))}
              </ul>
            )}
          </section>
        ) : (
          <Layout
            featured={featuredRenderer}
            ideas={ideas === null ? null : (headerEnd) => ideas('row', headerEnd)}
            groups={groups}
            renderCard={renderCard}
            showAll={showAll}
            sectionRef={sectionRef}
          />
        )}
      </div>
    </HomeLiveContext.Provider>
  );
}
