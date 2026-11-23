/**
 * The endless grid of **More ideas** (ADR 0128 D1, D2): the lazy chunk Home loads when More
 * ideas first comes near the view (`components/home/MoreIdeas.tsx`).
 *
 * - A windowed list: card *n* sits at its row and column; only the rows near the view
 *   (`ideasWindow`) are mounted, so however far the user scrolls the page holds a few dozen
 *   cards. The list grows as the view nears its end, and never shrinks.
 * - A mounted card rolls its idea in turn with the others (`queueIdea`, newest first) and draws
 *   its picture at the screen's whole pixel scale (`ideaPicture`); a card that goes away before
 *   its turn costs nothing.
 * - At most one card plays a clip, by the Showcase's rule (`chooseLiveClip`, used as it is):
 *   the card under the pointer or with keyboard focus, or the one whose play button was
 *   pressed; never by itself only for being in view. Reduced motion and the setting **Play
 *   showcase clips** apply as they do to the Showcase. The clip is the Showcase's `ClipView`
 *   (its lazy chunk) over the idea's bundle.
 * - The arrow keys move between cards (Up and Down by a row), Home and End to the first and
 *   the last card made; a polite line says when more ideas have come.
 *
 * Test ids: `ideas-list`, `ideas-status`, and the card's (`IdeaCard.tsx`).
 *
 * @packageDocumentation
 */

import {
  type ComponentType,
  type KeyboardEvent,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { VanillaAssetReader } from '../preview/model-chain';
import { hasWebGL } from '../preview/webgl';
import type { ClipViewProps } from '../showcase/ClipView';
import type { StillCodec } from '../showcase/drawn-still';
import type { ExampleFilesDeps } from '../showcase/example-files';
import {
  browserLiveEnvironment,
  chooseLiveClip,
  type LiveClipEnvironment,
  playsByItself,
} from '../showcase/live-clip';
import { stillKey } from '../showcase/still-cache';
import { IdeaCard } from './IdeaCard';
import {
  IDEA_CARD_WIDTH,
  IDEA_FIRST_ROWS,
  IDEA_GAP,
  IDEA_ROW,
  type IdeasView,
  ideaColumns,
  ideaSeed,
  ideasWindow,
} from './idea-seeds';
import { type Idea, type IdeaInput, ideaClipId, ideaPicture, queueIdea } from './ideas';

const LazyClipView = lazy(() => import('../showcase/ClipView'));

/** What the list reads from the browser: where it is against the view, as it scrolls. */
export interface IdeasEnvironment {
  /** Calls `listener` with the list's place now and whenever it changes; returns the stop. */
  watchView(element: HTMLElement, listener: (view: IdeasView) => void): () => void;
}

/** The nearest ancestor that scrolls, or `null` for the window. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return at;
  }
  return null;
}

/** The environment of the real window: the scroll parent's scroll and both sizes. */
export function browserIdeasEnvironment(): IdeasEnvironment {
  return {
    watchView(element, listener) {
      const parent = scrollParent(element);
      let frame = 0;
      const read = (): void => {
        frame = 0;
        const rect = element.getBoundingClientRect();
        const view =
          parent === null ? { top: 0, height: window.innerHeight } : parent.getBoundingClientRect();
        listener({ top: rect.top - view.top, height: view.height, width: rect.width });
      };
      const schedule = (): void => {
        if (frame === 0) frame = requestAnimationFrame(read);
      };
      read();
      const target: HTMLElement | Window = parent ?? window;
      target.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
      const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
      resize?.observe(element);
      if (parent !== null) resize?.observe(parent);
      return () => {
        if (frame !== 0) cancelAnimationFrame(frame);
        target.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        resize?.disconnect();
      };
    },
  };
}

/** Props of {@link IdeaList}. */
export interface IdeaListProps {
  /** The base seed (preferences' `ideasSeed`). */
  readonly baseSeed: number;
  /** What rolling an idea needs. */
  readonly input: IdeaInput;
  /** What lowering an idea's bundle for its clip needs. */
  readonly deps: ExampleFilesDeps;
  readonly vanilla?: VanillaAssetReader | null;
  readonly vanillaBlockstates?: ReadonlyMap<string, string>;
  /** The setting **Play showcase clips** (default on). */
  readonly playClips?: boolean;
  /** False while another view covers Home (default true). */
  readonly visible?: boolean;
  /** **Make this**. */
  readonly onMake: (idea: Idea) => void;
  /** Says which card plays (its clip id) or `null`, so the host keeps one clip on Home. */
  readonly onLiveChange?: (clipId: string | null) => void;
  /** Test hooks. */
  readonly environment?: IdeasEnvironment;
  readonly liveEnvironment?: LiveClipEnvironment;
  readonly webgl?: boolean;
  readonly clipView?: ComponentType<ClipViewProps>;
  readonly codec?: StillCodec;
  /** Device pixels per CSS pixel for the drawn pictures (default the window's, 1 or 2). */
  readonly scale?: number;
}

const NONE: ReadonlySet<string> = new Set();

/** Props of one mounted card. */
interface SlotProps {
  readonly index: number;
  readonly seed: number;
  readonly input: IdeaInput;
  readonly scale: number;
  readonly codec: StillCodec | undefined;
  readonly webgl: boolean;
  readonly column: number;
  readonly row: number;
  /** The live clip of this card, given its idea and picture; absent when it does not play. */
  readonly renderLive?: (idea: Idea, picture: string | null) => ReactNode;
  readonly onReady: (index: number, idea: Idea | null) => void;
  readonly onMake: (idea: Idea) => void;
  readonly onTogglePlay: (index: number) => void;
  readonly onHover: (index: number, inside: boolean) => void;
  readonly onFocusChange: (index: number, inside: boolean) => void;
  readonly onKeyDown: (index: number, event: KeyboardEvent<HTMLElement>) => void;
}

/** One mounted card: rolls its idea in turn and draws its picture. */
function IdeaSlot(props: SlotProps) {
  const { index, seed, input, scale, codec, onReady } = props;
  const [idea, setIdea] = useState<Idea | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  useEffect(() => {
    setIdea(null);
    setPicture(null);
    let live = true;
    const cancel = queueIdea(
      input,
      seed,
      (made) => {
        if (!live) return;
        setIdea(made);
        onReady(index, made);
        ideaPicture(made, scale, codec).then(
          (url) => {
            if (live) setPicture(url);
          },
          () => {
            // No picture: the card keeps its plain frame.
          },
        );
      },
      () => {
        // A seed that cannot be rolled keeps "Thinking of an idea…" (never seen in practice).
      },
    );
    return () => {
      live = false;
      cancel();
      onReady(index, null);
    };
  }, [index, seed, input, scale, codec, onReady]);
  const live = idea === null ? undefined : props.renderLive?.(idea, picture);
  return (
    <IdeaCard
      index={index}
      idea={idea}
      picture={picture}
      live={live}
      playable={props.webgl && idea !== null && idea.clip !== null}
      style={{ left: props.column * (IDEA_CARD_WIDTH + IDEA_GAP), top: props.row * IDEA_ROW }}
      onMake={props.onMake}
      onTogglePlay={() => props.onTogglePlay(index)}
      onHover={(inside) => props.onHover(index, inside)}
      onFocusChange={(inside) => props.onFocusChange(index, inside)}
      onKeyDown={(event) => props.onKeyDown(index, event)}
    />
  );
}

/** The endless grid of idea cards. */
export function IdeaList(props: IdeaListProps) {
  const { baseSeed, input } = props;
  const environment = useMemo(
    () => props.environment ?? browserIdeasEnvironment(),
    [props.environment],
  );
  const liveEnvironment = useMemo(
    () => props.liveEnvironment ?? browserLiveEnvironment(),
    [props.liveEnvironment],
  );
  const scale =
    props.scale ??
    (typeof window === 'undefined'
      ? 1
      : Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1))));

  const host = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<IdeasView | null>(null);
  const [rows, setRows] = useState(IDEA_FIRST_ROWS);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    return environment.watchView(element, setView);
  }, [environment]);

  // Shuffle: every card a new seed (the list keeps its length).
  const seenBase = useRef(baseSeed);
  useEffect(() => {
    if (seenBase.current === baseSeed) return;
    seenBase.current = baseSeed;
    setStatus('New ideas.');
  }, [baseSeed]);

  const window_ = view === null ? null : ideasWindow(view, rows);
  const columns = window_?.columns ?? ideaColumns(view?.width ?? 0);
  useEffect(() => {
    if (window_ === null || window_.rows <= rows) return;
    const added = (window_.rows - rows) * window_.columns;
    setRows(window_.rows);
    setStatus(`${added} more ideas below.`);
  }, [window_, rows]);

  // Ideas of the mounted cards, by index.
  const [ready, setReady] = useState<ReadonlyMap<number, Idea>>(new Map());
  const onReady = useCallback((index: number, idea: Idea | null) => {
    setReady((before) => {
      if (idea === null ? !before.has(index) : before.get(index) === idea) return before;
      const next = new Map(before);
      if (idea === null) next.delete(index);
      else next.set(index, idea);
      return next;
    });
  }, []);

  // One live clip at most (the Showcase's rule).
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const [stopped, setStopped] = useState<ReadonlySet<string>>(NONE);
  const [reducedMotion, setReducedMotion] = useState(() => liveEnvironment.reducedMotion());
  const [windowShown, setWindowShown] = useState(() => liveEnvironment.windowShown());
  const [webglLost, setWebglLost] = useState(false);
  const webgl = (props.webgl ?? hasWebGL()) && !webglLost;
  useEffect(() => {
    setReducedMotion(liveEnvironment.reducedMotion());
    setWindowShown(liveEnvironment.windowShown());
    const stopMotion = liveEnvironment.onReducedMotion(() =>
      setReducedMotion(liveEnvironment.reducedMotion()),
    );
    const stopShown = liveEnvironment.onWindowShown(() =>
      setWindowShown(liveEnvironment.windowShown()),
    );
    return () => {
      stopMotion();
      stopShown();
    };
  }, [liveEnvironment]);
  const playable = [...ready.entries()]
    .filter(([, idea]) => idea.clip !== null)
    .sort((a, b) => a[0] - b[0])
    .map(([index]) => String(index));
  const state = {
    cards: playable,
    hovered,
    focused,
    requested,
    // Never by itself for being in view: Home's Showcase is the one that does that.
    inView: NONE,
    stopped,
    webgl,
    reducedMotion,
    setting: props.playClips ?? true,
    paused: false,
    windowShown,
    visible: props.visible ?? true,
  };
  const liveKey = chooseLiveClip(state);
  const once = !playsByItself(state);
  const liveIdea = liveKey === null ? undefined : ready.get(Number(liveKey));
  const liveClipId = liveIdea === undefined ? null : ideaClipId(liveIdea.seed);
  const { onLiveChange } = props;
  useEffect(() => {
    onLiveChange?.(liveClipId);
  }, [liveClipId, onLiveChange]);
  useEffect(() => () => onLiveChange?.(null), [onLiveChange]);

  const toggle = useCallback(
    (index: number) => {
      const id = String(index);
      if (id === liveKey) {
        setStopped((before) => new Set([...before, id]));
        setRequested((before) => (before === id ? null : before));
        return;
      }
      setStopped((before) => {
        if (!before.has(id)) return before;
        const next = new Set(before);
        next.delete(id);
        return next;
      });
      setRequested(id);
    },
    [liveKey],
  );
  const onHover = useCallback((index: number, inside: boolean) => {
    const id = String(index);
    setHovered((before) => (inside ? id : before === id ? null : before));
  }, []);
  const onFocusChange = useCallback((index: number, inside: boolean) => {
    const id = String(index);
    setFocused((before) => (inside ? id : before === id ? null : before));
  }, []);

  const list = useRef<HTMLUListElement | null>(null);
  const last = window_ === null ? -1 : Math.min(window_.rows, window_.last + 1) * columns - 1;
  const onKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLElement>) => {
      const moves: Record<string, number> = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: columns,
        ArrowUp: -columns,
      };
      let to: number | null = null;
      if (event.key in moves) to = index + (moves[event.key] ?? 0);
      else if (event.key === 'Home' && event.ctrlKey) to = 0;
      else if (event.key === 'End' && event.ctrlKey) to = last;
      if (to === null || to < 0) return;
      const button = list.current?.querySelector<HTMLElement>(`[data-idea-index="${to}"]`);
      if (button === null || button === undefined) return;
      event.preventDefault();
      button.focus();
      button.scrollIntoView?.({ block: 'nearest' });
    },
    [columns, last],
  );

  const withJar = props.vanilla !== null && props.vanilla !== undefined;
  const View = props.clipView ?? LazyClipView;
  const renderLive = (idea: Idea, picture: string | null): ReactNode =>
    idea.clip === null ? null : (
      <Suspense
        fallback={
          picture === null ? null : (
            <img src={picture} alt="" className="block size-full [image-rendering:pixelated]" />
          )
        }
      >
        <View
          clip={idea.clip}
          example={idea.example}
          target={input.target}
          deps={props.deps}
          vanilla={props.vanilla ?? null}
          {...(props.vanillaBlockstates === undefined
            ? {}
            : { vanillaBlockstates: props.vanillaBlockstates })}
          stillKey={stillKey(idea.clip.id, input.target.id, withJar)}
          still={picture}
          once={once}
          onEnd={() => setRequested(null)}
          onWebGLUnavailable={() => setWebglLost(true)}
        />
      </Suspense>
    );

  const slots: ReactNode[] = [];
  if (window_ !== null) {
    for (let row = window_.first; row <= window_.last; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const seed = ideaSeed(baseSeed, index);
        slots.push(
          <IdeaSlot
            key={`${baseSeed}:${index}`}
            index={index}
            seed={seed}
            input={input}
            scale={scale}
            codec={props.codec}
            webgl={webgl}
            column={column}
            row={row}
            {...(String(index) === liveKey ? { renderLive } : {})}
            onReady={onReady}
            onMake={props.onMake}
            onTogglePlay={toggle}
            onHover={onHover}
            onFocusChange={onFocusChange}
            onKeyDown={onKeyDown}
          />,
        );
      }
    }
  }
  const total = window_?.rows ?? rows;
  return (
    <div ref={host} className="w-full" data-testid="ideas-list">
      <ul
        ref={list}
        aria-label="More ideas"
        className="relative m-0 mx-auto list-none p-0"
        style={{
          width: columns * (IDEA_CARD_WIDTH + IDEA_GAP) - IDEA_GAP,
          height: total * IDEA_ROW - IDEA_GAP,
        }}
      >
        {slots}
      </ul>
      <p aria-live="polite" className="sr-only" data-testid="ideas-status">
        {status}
      </p>
    </div>
  );
}

export default IdeaList;
