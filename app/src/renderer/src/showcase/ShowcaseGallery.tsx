/**
 * The showcase gallery (ADR 0118 D1, D6–D9; B568): a labelled section with a heading passed in
 * (Home's and New project's **See what you can make**), **Pause clips** and the cards in a
 * wrapping row. At most one card is live (`live-clip.ts`); it mounts the lazy `ClipView` chunk,
 * and every other card shows its still: the frame taken from its clip this session, else its
 * drawn still (`drawn-still.ts`). Without WebGL no `ClipView` is ever mounted.
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
import { drawnStill, type StillCodec } from './drawn-still';
import type { ExampleFilesDeps } from './example-files';
import {
  browserLiveEnvironment,
  chooseLiveClip,
  type LiveClipEnvironment,
  playsByItself,
} from './live-clip';
import { ShowcaseCard } from './ShowcaseCard';
import { stillKey, stillsVersion, subscribeStills, takenStill } from './still-cache';

const LazyClipView = lazy(() => import('./ClipView'));

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

  // Drawn stills, by clip id.
  const [drawn, setDrawn] = useState<ReadonlyMap<string, string>>(new Map());
  const { codec } = props;
  useEffect(() => {
    let live = true;
    for (const { clip, example } of cards) {
      drawnStill(example, target, codec).then(
        (url) => {
          if (!live) return;
          setDrawn((before) => {
            if (before.get(clip.id) === url) return before;
            const next = new Map(before);
            next.set(clip.id, url);
            return next;
          });
        },
        () => {
          // No pictures: the card keeps its plain ground.
        },
      );
    }
    return () => {
      live = false;
    };
  }, [cards, target, codec]);

  useSyncExternalStore(subscribeStills, stillsVersion);
  const withJar = props.vanilla !== null && props.vanilla !== undefined;
  const stillOf = (clip: ShowcaseClip): string | null =>
    takenStill(stillKey(clip.id, target.id, withJar)) ?? drawn.get(clip.id) ?? null;

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
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {cards.map(({ clip, example }) => {
          const still = stillOf(clip);
          const live =
            clip.id === liveId ? (
              <Suspense
                fallback={
                  still === null ? null : (
                    <img src={still} alt="" className="block size-full object-cover" />
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
              cardRef={refFor(clip.id)}
              onTogglePlay={() => toggle(clip.id)}
              {...(clip.make.type === 'example' ? {} : { onMake: () => props.onMake(clip) })}
              onSeeExample={() => props.onSeeExample(clip)}
              onHover={(inside) =>
                setHovered((before) => (inside ? clip.id : before === clip.id ? null : before))
              }
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
