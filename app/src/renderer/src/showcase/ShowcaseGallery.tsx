/**
 * The showcase gallery (ADR 0118 D1, D6–D9; B568): a labelled section with a heading passed in
 * (Home's and New project's **See what you can make**), **Pause clips** and the cards in a
 * wrapping row. At most one card is live (`live-clip.ts`); it mounts the lazy `ClipView` chunk,
 * and every other card shows its still: the frame taken from its clip this session, else its
 * drawn still (`drawn-still.ts`). Without WebGL no `ClipView` is ever mounted.
 *
 * Stills are drawn at the cards' picture size times the screen's pixel ratio (capped at 2,
 * `stillSizeFor`; measured with a `ResizeObserver` and again when the window is resized), so the
 * browser never scales them (ADR 0128 D3). A world card (a clip on a generated ground) has no
 * pictures, so its drawn still is its land drawn from the clip's camera (`land-still.ts`, loaded
 * lazily); a land that cannot be made leaves the plain still with the line `LAND_NOT_MADE`.
 *
 * Not wired into Home or New project here (B569 does that). Test ids: `showcase-gallery`,
 * `showcase-pause`, and the card's (`ShowcaseCard.tsx`).
 *
 * @packageDocumentation
 */

import type { ExampleProject, Target } from '@msm/plugin-api';
import {
  type ComponentType,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button } from '../components/ui/Button';
import type { VanillaAssetReader } from '../preview/model-chain';
import { hasWebGL } from '../preview/webgl';
import type { ClipViewProps } from './ClipView';
import type { ShowcaseClip } from './clip';
import {
  DEFAULT_STILL_SIZE,
  drawnStill,
  type StillCodec,
  type StillSize,
  stillSizeFor,
} from './drawn-still';
import type { ExampleFilesDeps } from './example-files';
import type { LandStillOptions } from './land-still';
import {
  browserLiveEnvironment,
  cardUnder,
  chooseLiveClip,
  type LiveClipEnvironment,
  playsByItself,
} from './live-clip';
import { LAND_NOT_MADE, ShowcaseCard } from './ShowcaseCard';
import { stillKey, stillsVersion, subscribeStills, takenStill } from './still-cache';

const LazyClipView = lazy(() => import('./ClipView'));

/** Makes a world card's land still (`land-still.ts`'s `landStill`). */
export type LandStillMaker = (
  clip: ShowcaseClip,
  example: ExampleProject,
  target: Target,
  options: LandStillOptions,
) => Promise<string>;

/** The real land still maker, loaded with its module on first use. */
const lazyLandStill: LandStillMaker = async (clip, example, target, options) => {
  const module = await import('./land-still');
  return module.landStill(clip, example, target, options);
};

/** Two sizes are the same. */
const sameSize = (a: StillSize, b: StillSize): boolean =>
  a.width === b.width && a.height === b.height;

/** Props of {@link ShowcaseGallery}. */
export interface ShowcaseGalleryProps {
  /** The section's heading, for example "See what you can make". */
  readonly heading: string;
  /** The cards, in order (already `showcasesFor` the target). */
  readonly clips: readonly ShowcaseClip[];
  /** The session library's examples; a clip whose example is missing is left out. */
  readonly examples: readonly ExampleProject[];
  readonly target: Target;
  /** What lowering an example needs (the session's registry and plugins). */
  readonly deps: ExampleFilesDeps;
  /** The user's extracted client jar, or `null`/absent. */
  readonly vanilla?: VanillaAssetReader | null;
  readonly vanillaBlockstates?: ReadonlyMap<string, string>;
  /** The setting **Play showcase clips** (default on). */
  readonly playClips?: boolean;
  /** False while another view covers the gallery (default true). */
  readonly visible?: boolean;
  /** **Make this** (not offered for a clip whose `make` is the example). */
  readonly onMake: (clip: ShowcaseClip) => void;
  /** **See the example**. */
  readonly onSeeExample: (clip: ShowcaseClip) => void;
  /** Test hooks. */
  readonly environment?: LiveClipEnvironment;
  readonly webgl?: boolean;
  readonly clipView?: ComponentType<ClipViewProps>;
  readonly codec?: StillCodec;
  /** World cards' land stills; `null` draws none (tests). Default the lazy `landStill`. */
  readonly landStill?: LandStillMaker | null;
}

const NONE: ReadonlySet<string> = new Set();

/** The gallery of showcase cards with one live clip at most. */
export function ShowcaseGallery(props: ShowcaseGalleryProps) {
  const { clips, examples, target } = props;
  const environment = useMemo(
    () => props.environment ?? browserLiveEnvironment(),
    [props.environment],
  );
  const headingId = useId();
  const byId = useMemo(() => new Map(examples.map((one) => [one.id, one])), [examples]);
  const cards = useMemo(
    () =>
      clips.flatMap((clip) => {
        const example = byId.get(clip.exampleId);
        return example === undefined ? [] : [{ clip, example }];
      }),
    [clips, byId],
  );
  const ids = useMemo(() => cards.map((card) => card.clip.id), [cards]);

  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const [stopped, setStopped] = useState<ReadonlySet<string>>(NONE);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState<ReadonlySet<string>>(NONE);
  const [reducedMotion, setReducedMotion] = useState(() => environment.reducedMotion());
  const [windowShown, setWindowShown] = useState(() => environment.windowShown());
  const [webglLost, setWebglLost] = useState(false);
  const webgl = (props.webgl ?? hasWebGL()) && !webglLost;

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

  // The hovered card, from the document's pointer events (`cardUnder` says why not React's
  // enter and leave): every over names the card under the pointer, or none.
  const root = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const section = root.current;
    if (section === null) return;
    const doc = section.ownerDocument;
    const onOver = (event: Event): void => setHovered(cardUnder(event.target, section));
    const onOut = (event: Event): void => {
      // Out of the window.
      if ((event as MouseEvent).relatedTarget === null) setHovered(null);
    };
    doc.addEventListener('pointerover', onOver);
    doc.addEventListener('pointerout', onOut);
    return () => {
      doc.removeEventListener('pointerover', onOver);
      doc.removeEventListener('pointerout', onOut);
    };
  }, []);

  // The cards' elements, for the in-view observer.
  const elements = useRef(new Map<string, Element>());
  const refFor = useCallback(
    (id: string) => (element: HTMLLIElement | null) => {
      if (element === null) elements.current.delete(id);
      else elements.current.set(id, element);
    },
    [],
  );
  const idsKey = ids.join('\n');
  // Watched again whenever the cards change (`idsKey`).
  useEffect(() => {
    const watched = new Map(elements.current);
    return environment.watchInView(watched, (seen) => setInView(seen));
  }, [environment, idsKey]);

  // The size stills are drawn at: the first card's picture, in device pixels (ADR 0128 D3).
  const list = useRef<HTMLUListElement | null>(null);
  const [size, setSize] = useState<StillSize>(DEFAULT_STILL_SIZE);
  useEffect(() => {
    const host = list.current;
    if (host === null) return;
    const measure = (): void => {
      const picture = host.querySelector<HTMLElement>('[data-testid^="showcase-picture-"]');
      if (picture === null) return;
      const next = stillSizeFor(
        picture.clientWidth,
        picture.clientHeight,
        typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      );
      setSize((before) => (sameSize(before, next) ? before : next));
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    observer?.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Drawn stills, by clip id; world cards' land stills, and the world cards whose land failed.
  const [drawn, setDrawn] = useState<ReadonlyMap<string, string>>(new Map());
  const [land, setLand] = useState<ReadonlyMap<string, string>>(new Map());
  const [landFailed, setLandFailed] = useState<ReadonlySet<string>>(NONE);
  const { codec } = props;
  // The registry and plugins, not the `deps` object, so a host's fresh object redraws nothing.
  const { registry, plugins } = props.deps;
  const makeLand = props.landStill === undefined ? lazyLandStill : props.landStill;
  useEffect(() => {
    let live = true;
    const keep =
      (set: typeof setDrawn, id: string) =>
      (url: string): void => {
        if (!live) return;
        set((before) => {
          if (before.get(id) === url) return before;
          const next = new Map(before);
          next.set(id, url);
          return next;
        });
      };
    for (const { clip, example } of cards) {
      drawnStill(example, target, codec, size).then(keep(setDrawn, clip.id), () => {
        // No pictures: the card keeps its plain ground.
      });
      if (clip.ground.kind !== 'generated' || makeLand === null) continue;
      makeLand(clip, example, target, {
        deps: { registry, plugins },
        size,
        ...(codec === undefined ? {} : { codec }),
      }).then(keep(setLand, clip.id), () => {
        if (!live) return;
        setLandFailed((before) => new Set([...before, clip.id]));
      });
    }
    return () => {
      live = false;
    };
  }, [cards, target, codec, size, registry, plugins, makeLand]);

  useSyncExternalStore(subscribeStills, stillsVersion);
  const withJar = props.vanilla !== null && props.vanilla !== undefined;
  const stillOf = (clip: ShowcaseClip): string | null =>
    takenStill(stillKey(clip.id, target.id, withJar)) ??
    land.get(clip.id) ??
    drawn.get(clip.id) ??
    null;

  const state = {
    cards: ids,
    hovered,
    focused,
    requested,
    inView,
    stopped,
    webgl,
    reducedMotion,
    setting: props.playClips ?? true,
    paused,
    windowShown,
    visible: props.visible ?? true,
  };
  const liveId = chooseLiveClip(state);
  const once = !playsByItself(state);

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

  const View = props.clipView ?? LazyClipView;
  return (
    <section
      ref={root}
      aria-labelledby={headingId}
      className="flex flex-col gap-2"
      data-testid="showcase-gallery"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="font-semibold text-base">
          {props.heading}
        </h2>
        {webgl && (
          <Button
            aria-pressed={paused}
            data-testid="showcase-pause"
            onClick={() => {
              setPaused((before) => !before);
              setRequested(null);
            }}
          >
            Pause clips
          </Button>
        )}
      </div>
      <ul ref={list} className="m-0 flex list-none flex-wrap gap-2 p-0">
        {cards.map(({ clip, example }) => {
          const still = stillOf(clip);
          const live =
            clip.id === liveId ? (
              <Suspense
                fallback={
                  still === null ? null : (
                    <img
                      src={still}
                      alt=""
                      className="block size-full object-cover [image-rendering:pixelated]"
                    />
                  )
                }
              >
                <View
                  clip={clip}
                  example={example}
                  target={target}
                  deps={props.deps}
                  vanilla={props.vanilla ?? null}
                  {...(props.vanillaBlockstates === undefined
                    ? {}
                    : { vanillaBlockstates: props.vanillaBlockstates })}
                  stillKey={stillKey(clip.id, target.id, withJar)}
                  still={still}
                  once={once}
                  onEnd={() => setRequested((before) => (before === clip.id ? null : before))}
                  onWebGLUnavailable={() => setWebglLost(true)}
                />
              </Suspense>
            ) : undefined;
          return (
            <ShowcaseCard
              key={clip.id}
              clip={clip}
              still={still}
              live={live}
              webgl={webgl}
              note={
                landFailed.has(clip.id) &&
                !land.has(clip.id) &&
                takenStill(stillKey(clip.id, target.id, withJar)) === null
                  ? LAND_NOT_MADE
                  : null
              }
              cardRef={refFor(clip.id)}
              onTogglePlay={() => toggle(clip.id)}
              {...(clip.make.type === 'example' ? {} : { onMake: () => props.onMake(clip) })}
              onSeeExample={() => props.onSeeExample(clip)}
              onFocusChange={(inside) =>
                setFocused((before) => (inside ? clip.id : before === clip.id ? null : before))
              }
            />
          );
        })}
      </ul>
    </section>
  );
}
