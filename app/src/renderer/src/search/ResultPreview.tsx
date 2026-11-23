/**
 * The search's live preview pane (ADR 0124 D9; B665): the live view of search. The panel draws
 * it for the selected result only (`props.preview(hit)` inside `search-preview-picture`), and the
 * doors load it lazily (the default export): nothing of it is in the first paint.
 *
 * - A plain tile is shown at once. The picture is made 150 ms after the selection or the words
 *   last changed (a new entry or new understood answers restart the wait), so a fast move down
 *   the list builds nothing; a build still running when the selection moves is dropped (its
 *   result is never shown).
 * - A flow, starter, example or template is built in memory with the understood answers
 *   (`preview-bundle.ts`) and drawn by the Creator's `CreatorPreview` over the bundle laid over
 *   the mod (`bundlePreviewProject`, read, not changed), with the line "Makes …" as Surprise me
 *   words it. Without WebGL the Creator's own fallbacks draw (textures as flat pictures). In Very
 *   easy the tabs are hidden, and a flow whose first tab would show ids keeps the plain tile and
 *   its "Makes …" line. A failed build keeps the plain tile with a line saying so.
 * - A Showcase card shows its still with a play button: one live clip (the panel's), played only
 *   when asked, once under reduced motion or with **Play showcase clips** off; without WebGL the
 *   still and the Showcase's line.
 * - A thing of the mod goes through the Preview panel's route for its kind; a picture of the mod
 *   is shown; a vanilla id's picture comes through the `ThingPictures` of the ThingPicker; a rule
 *   is a read-only rule card; a guide section shows its first paragraph; a setting, command,
 *   Rules part, Thing to fix and every other result shows its sentence.
 *
 * Reduced motion is read here (the panel does not pass its own on): the prop, else the system's
 * `prefers-reduced-motion`. Test ids: `search-result-preview` (with `data-preview-type` and
 * `data-state`: `waiting`, `building`, `drawn` or `failed`), `search-preview-tile`,
 * `search-preview-makes`, `search-preview-creator` (with `data-ms`: the build's time),
 * `search-preview-failed`, `search-preview-showcase`, `search-preview-still`,
 * `search-preview-play`, `search-preview-clip`, `search-preview-no-webgl`,
 * `search-preview-element`, `search-preview-asset`, `search-preview-vanilla`,
 * `search-preview-rule`, `search-preview-guide`, `search-preview-text`, `search-preview-choices`.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import type { ElementTemplate, ExampleProject, ProjectStarter, Target } from '@msm/plugin-api';
import {
  conditionSentence,
  type SentenceContext,
  stepsSentence,
  triggerById,
  whenSentence,
} from '@msm/plugin-rules';
import type { SearchHit, SearchMode } from '@msm/search';
import { Pause, Play } from 'lucide-react';
import {
  type ComponentType,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { CreatorPreview } from '../components/creator/CreatorPreview';
import type { CreatorTab, VanillaTools } from '../components/creator/creator-model';
import { ThingIcon, type ThingPictures } from '../components/thing-picker/ThingPicker';
import type { ThingSort } from '../components/thing-picker/thing-sources';
import { vanillaPicturePaths } from '../components/thing-picker/thing-sources';
import { pngDataUrl } from '../preview/bundle-source';
import type { ResourceFolders, VanillaAssetReader } from '../preview/model-chain';
import { isPreviewKind, modelFieldSubject, PreviewPanel } from '../preview/PreviewPanel';
import { hasWebGL } from '../preview/webgl';
import { displayNameOf } from '../session/plain-problems';
import type { ClipViewProps } from '../showcase/ClipView';
import { drawnStill, type StillCodec } from '../showcase/drawn-still';
import type { ExampleFilesDeps } from '../showcase/example-files';
import {
  browserLiveEnvironment,
  chooseLiveClip,
  type LiveClipEnvironment,
  playsByItself,
} from '../showcase/live-clip';
import { NO_MOVING_PICTURES } from '../showcase/ShowcaseCard';
import { SHOWCASES } from '../showcase/showcases';
import { stillKey, stillsVersion, subscribeStills, takenStill } from '../showcase/still-cache';
import type { WorldgenSession } from '../terrain/files';
import {
  type BuiltPreview,
  buildPreview,
  guideFirstParagraph,
  isBuilt,
  makesLine,
  PREVIEW_DEBOUNCE_MS,
  plainMarkdown,
  previewKey,
  previewOf,
  previewTab,
  ruleOf,
} from './preview-bundle';
import { SourceIcon } from './ResultRow';
import type { SearchPreviewDescriptor, VanillaSort } from './sources/shared';
import { plainText, sourceOf } from './wording';

/** "A, B and C" (the Rules sentences' joining). */
function joinWords(parts: readonly string[], word: string): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} ${word} ${parts[parts.length - 1]}`;
}

const LazyClipView = lazy(() => import('../showcase/ClipView'));

/** What the preview reads of the app (B667 wires it from the session and the stores). */
export interface ResultPreviewHost {
  readonly mode: SearchMode;
  /** The mod's target, or the default target with no mod. */
  readonly target: Target;
  /** The session library (the plugins' starters, templates and examples). */
  readonly library: {
    readonly starters: readonly ProjectStarter[];
    readonly templates: readonly ElementTemplate[];
    readonly examples: readonly ExampleProject[];
  };
  /** Whether a kind is registered. */
  readonly isKnownKind: (kind: string) => boolean;
  /** A kind's `previewKind` (the Preview panel's route). */
  readonly previewKindOf?: ((kind: string) => string | undefined) | undefined;
  /** A kind's default data (`session.kindDefault`), for templates. */
  readonly kindDefault?: ((kind: string) => Json | undefined) | undefined;
  /** The open mod, or `null`. */
  readonly project: Project | null;
  readonly folders: ResourceFolders;
  readonly readProjectAsset: (namespace: string, path: string) => Promise<Uint8Array | null>;
  /** The user's extracted client jar, or `null`. */
  readonly vanilla: VanillaAssetReader | null;
  /** The ThingPicker's pictures (vanilla ids, the mod's textures). */
  readonly pictures?: ThingPictures | null | undefined;
  /** What a Showcase clip needs; absent: stills only. */
  readonly showcase?:
    | {
        readonly deps: ExampleFilesDeps;
        /** The setting **Play showcase clips**. */
        readonly playClips: boolean;
        readonly vanillaBlockstates?: ReadonlyMap<string, string>;
      }
    | undefined;
  /** One guide page's Markdown (`platform.guide.page`). */
  readonly readGuidePage?: ((page: string) => Promise<string>) | undefined;
  /** Opens the Minecraft folder settings. */
  readonly onSetup?: (() => void) | undefined;
  readonly terrainSession?: WorldgenSession | undefined;
  readonly projectRoot?: string | null | undefined;
  readonly vanillaTools?: VanillaTools | undefined;
}

/** Props of {@link ResultPreview}. */
export interface ResultPreviewProps {
  readonly hit: SearchHit;
  readonly host: ResultPreviewHost;
  /** How long the selection rests before the picture is made (default 150 ms). */
  readonly debounceMs?: number;
  /** Reduced motion; default the system's `prefers-reduced-motion`. */
  readonly reducedMotion?: boolean | undefined;
  /** Test hooks. */
  readonly webgl?: boolean;
  readonly environment?: LiveClipEnvironment;
  readonly clipView?: ComponentType<ClipViewProps>;
  readonly codec?: StillCodec;
  readonly now?: () => number;
  /** Called once a built picture is shown, with the time from the selection (e2e timings). */
  readonly onDrawn?: (info: { readonly id: string; readonly ms: number }) => void;
}

type PreviewState = 'waiting' | 'building' | 'drawn' | 'failed';

const pictureBox =
  'relative flex aspect-video w-full items-center justify-center overflow-hidden rounded border border-border bg-bg';

/** The plain tile: the result's source picture, shown before (or instead of) a picture. */
function PlainTile({ hit, mode }: { hit: SearchHit; mode: SearchMode }) {
  const source = sourceOf(hit.entry, mode);
  return (
    <div
      aria-hidden="true"
      className={`${pictureBox} text-muted`}
      data-testid="search-preview-tile"
    >
      <span className="scale-[2.5]">
        <SourceIcon picture={source.picture} />
      </span>
    </div>
  );
}

/** A line under a picture, in Very easy's plain words. */
function Line(props: { mode: SearchMode; testId: string; text: string; muted?: boolean }) {
  const text = plainText(props.text, props.mode, { loose: true });
  if (text === null) return null;
  return (
    <p
      className={`break-words text-sm${props.muted === true ? ' text-muted' : ''}`}
      data-testid={props.testId}
    >
      {text}
    </p>
  );
}

/** The selection's key once it has rested for `delay` ms, else `null`. */
function useRested(key: string, delay: number): boolean {
  const [rested, setRested] = useState<string | null>(null);
  useEffect(() => {
    if (delay <= 0) {
      setRested(key);
      return;
    }
    const timer = setTimeout(() => setRested(key), delay);
    return () => clearTimeout(timer);
  }, [key, delay]);
  return rested === key;
}

/** The system's reduced motion, unless the prop says. */
function useReducedMotion(given: boolean | undefined, environment: LiveClipEnvironment): boolean {
  const [system, setSystem] = useState(() => environment.reducedMotion());
  useEffect(() => {
    setSystem(environment.reducedMotion());
    return environment.onReducedMotion(() => setSystem(environment.reducedMotion()));
  }, [environment]);
  return given ?? system;
}

/** The live preview of one search result. */
export function ResultPreview(props: ResultPreviewProps) {
  const { hit, host } = props;
  const descriptor = previewOf(hit);
  const key = previewKey(hit);
  const now = props.now ?? (() => performance.now());
  // When this key was first shown, for the build's timing.
  const shownAt = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  if (shownAt.current.key !== key) shownAt.current = { key, at: now() };
  const rested = useRested(key, props.debounceMs ?? PREVIEW_DEBOUNCE_MS);
  const [state, setState] = useState<{ key: string; state: PreviewState }>({
    key: '',
    state: 'waiting',
  });
  const current: PreviewState = !rested ? 'waiting' : state.key === key ? state.state : 'building';
  const body = rested ? (
    <PreviewBody
      key={key}
      hit={hit}
      descriptor={descriptor}
      host={host}
      props={props}
      startedAt={shownAt.current.at}
      now={now}
      onState={(next) => setState({ key, state: next })}
    />
  ) : (
    <PlainTile hit={hit} mode={host.mode} />
  );
  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      data-testid="search-result-preview"
      data-preview-type={descriptor.type}
      data-state={current}
      aria-busy={current === 'waiting' || current === 'building'}
    >
      {body}
    </div>
  );
}

interface BodyProps {
  readonly hit: SearchHit;
  readonly descriptor: SearchPreviewDescriptor;
  readonly host: ResultPreviewHost;
  readonly props: ResultPreviewProps;
  readonly startedAt: number;
  readonly now: () => number;
  readonly onState: (state: PreviewState) => void;
}

/** The picture of a rested selection (mounted afresh for every key). */
function PreviewBody(body: BodyProps) {
  const { hit, descriptor, host, onState } = body;
  const mode = host.mode;
  const built = isBuilt(descriptor) && hit.entry.available;
  useEffect(() => {
    if (!built) onState('drawn');
    // Once per mount: the body is keyed by the selection.
  }, []);
  if (!hit.entry.available) {
    return (
      <>
        <PlainTile hit={hit} mode={mode} />
        {hit.entry.unavailableReason !== undefined && (
          <Line mode={mode} testId="search-preview-text" text={hit.entry.unavailableReason} muted />
        )}
      </>
    );
  }
  if (built && isBuilt(descriptor)) return <BuiltBody {...body} descriptor={descriptor} />;
  switch (descriptor.type) {
    case 'showcase':
      return <ShowcaseBody {...body} card={descriptor.card} example={descriptor.example} />;
    case 'element':
      return <ElementBody {...body} element={descriptor.element} />;
    case 'asset':
      return <AssetBody {...body} namespace={descriptor.namespace} path={descriptor.path} />;
    case 'vanilla':
      return <VanillaBody {...body} id={descriptor.id} sort={descriptor.sort} />;
    case 'rule':
      return <RuleBody {...body} book={descriptor.book} index={descriptor.index} />;
    case 'guide':
      return <GuideBody {...body} page={descriptor.page} anchor={descriptor.anchor} />;
    case 'flows':
      return <ChoicesBody {...body} flows={descriptor.flows} starters={descriptor.starters} />;
    default:
      return <TextBody hit={hit} mode={mode} />;
  }
}

/** A sentence only: a setting, a command, a Rules part, a Thing to fix, a tile. */
function TextBody({ hit, mode }: { hit: SearchHit; mode: SearchMode }) {
  return (
    <>
      <PlainTile hit={hit} mode={mode} />
      {hit.entry.sentence !== undefined && hit.entry.sentence !== '' && (
        <Line mode={mode} testId="search-preview-text" text={hit.entry.sentence} />
      )}
    </>
  );
}

// Built in memory ----------------------------------------------------------------------------

type BuildOutcome =
  | { readonly status: 'building' }
  | { readonly status: 'done'; readonly built: BuiltPreview; readonly ms: number }
  | { readonly status: 'failed'; readonly message: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A flow, starter, example or template built with the answers and drawn by `CreatorPreview`. */
function BuiltBody(
  body: BodyProps & {
    descriptor: Extract<
      SearchPreviewDescriptor,
      { type: 'flow' | 'starter' | 'example' | 'template' }
    >;
  },
) {
  const { hit, host, onState, props } = body;
  const mode = host.mode;
  const veryEasy = mode === 'very-easy';
  const [outcome, setOutcome] = useState<BuildOutcome>({ status: 'building' });
  const [tab, setTab] = useState<CreatorTab | null>(null);
  // The inputs as they were when the selection rested; a later render of the same key keeps them.
  const inputs = useRef({ descriptor: body.descriptor, answers: hit.answers, host });
  useEffect(() => {
    let live = true;
    const { descriptor, answers, host: from } = inputs.current;
    onState('building');
    buildPreview(descriptor, answers, {
      target: from.target,
      library: from.library,
      isKnownKind: from.isKnownKind,
      kindDefault: from.kindDefault,
      project: from.project,
    }).then(
      (built) => {
        if (!live) return;
        const ms = Math.max(0, Math.round(body.now() - body.startedAt));
        setTab(previewTab(built.bundle, veryEasy));
        setOutcome({ status: 'done', built, ms });
        onState('drawn');
        props.onDrawn?.({ id: hit.entry.id, ms });
      },
      (error: unknown) => {
        if (!live) return;
        setOutcome({ status: 'failed', message: messageOf(error) });
        onState('failed');
      },
    );
    return () => {
      // The selection moved: this build's result is dropped.
      live = false;
    };
    // Once per mount: the body is keyed by the selection.
  }, []);

  if (outcome.status === 'building') return <PlainTile hit={hit} mode={mode} />;
  if (outcome.status === 'failed') {
    return (
      <>
        <PlainTile hit={hit} mode={mode} />
        <p className="text-muted text-sm" role="status" data-testid="search-preview-failed">
          {veryEasy
            ? 'The picture could not be made.'
            : `The picture could not be made: ${outcome.message}`}
        </p>
      </>
    );
  }
  const { built, ms } = outcome;
  const makes = makesLine(built.makes);
  return (
    <>
      {tab === null ? (
        <PlainTile hit={hit} mode={mode} />
      ) : (
        <div
          className={`flex min-h-48 min-w-0 flex-col${veryEasy ? ' [&_[role=tablist]]:hidden' : ''}`}
          data-testid="search-preview-creator"
          data-ms={ms}
        >
          <CreatorPreview
            bundle={built.bundle}
            revision={1}
            plan={built.plan}
            project={built.project}
            folders={host.folders}
            readProjectAsset={host.readProjectAsset}
            vanilla={host.vanilla}
            overwrite={NO_OVERWRITE}
            onOverwriteChange={() => {}}
            tab={tab}
            onTabChange={(next) => setTab(next)}
            {...(host.vanillaTools === undefined ? {} : { vanillaTools: host.vanillaTools })}
            {...(props.webgl === undefined ? {} : { webgl: props.webgl })}
          />
        </div>
      )}
      {makes !== null && <Line mode={mode} testId="search-preview-makes" text={makes} />}
    </>
  );
}

const NO_OVERWRITE: ReadonlySet<string> = new Set();

/** Several flows to choose from (a tile or card with a chooser): their titles. */
function ChoicesBody(
  body: BodyProps & { flows: readonly string[]; starters?: readonly string[] | undefined },
) {
  const { hit, host } = body;
  const titles = [...body.flows, ...(body.starters ?? [])].flatMap((id) => {
    const starter = host.library.starters.find((entry) => entry.id === id);
    return starter === undefined ? [] : [starter.title];
  });
  return (
    <>
      <PlainTile hit={hit} mode={host.mode} />
      {titles.length > 0 && (
        <Line
          mode={host.mode}
          testId="search-preview-choices"
          text={`Choose from ${joinWords(titles, 'or')}.`}
        />
      )}
    </>
  );
}

// The Showcase -------------------------------------------------------------------------------

/** A Showcase card's still with a play button (one live clip, played only when asked). */
function ShowcaseBody(body: BodyProps & { card: string; example: string }) {
  const { host, props } = body;
  const environment = useMemo(
    () => props.environment ?? browserLiveEnvironment(),
    [props.environment],
  );
  const reducedMotion = useReducedMotion(props.reducedMotion, environment);
  const [webglLost, setWebglLost] = useState(false);
  const webgl = (props.webgl ?? hasWebGL()) && !webglLost;
  const clip = SHOWCASES.find((entry) => entry.id === body.card);
  const example = host.library.examples.find((entry) => entry.id === body.example);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const codec = props.codec;
  useEffect(() => {
    if (example === undefined) return;
    let live = true;
    drawnStill(example, host.target, codec).then(
      (url) => {
        if (live) setDrawn(url);
      },
      () => {
        // No pictures: the plain ground stays.
      },
    );
    return () => {
      live = false;
    };
  }, [example, host.target, codec]);
  useSyncExternalStore(subscribeStills, stillsVersion);
  if (clip === undefined || example === undefined)
    return <TextBody hit={body.hit} mode={host.mode} />;
  const withJar = host.vanilla !== null;
  const key = stillKey(clip.id, host.target.id, withJar);
  const still = takenStill(key) ?? drawn;
  const state = {
    cards: [clip.id],
    hovered: null,
    focused: null,
    requested: requested ? clip.id : null,
    inView: new Set<string>(),
    stopped: new Set<string>(),
    webgl: webgl && host.showcase !== undefined,
    reducedMotion,
    setting: host.showcase?.playClips ?? true,
    paused: false,
    windowShown: environment.windowShown(),
    visible: true,
  };
  const live = chooseLiveClip(state) === clip.id;
  const View = props.clipView ?? LazyClipView;
  const picture =
    still === null ? null : (
      <img
        src={still}
        alt=""
        className="block size-full object-cover [image-rendering:pixelated]"
        data-testid="search-preview-still"
      />
    );
  return (
    <div className="flex flex-col gap-1.5" data-testid="search-preview-showcase">
      <div className={pictureBox}>
        {live && host.showcase !== undefined ? (
          <div className="size-full" data-testid="search-preview-clip">
            <Suspense fallback={picture}>
              <View
                clip={clip}
                example={example}
                target={host.target}
                deps={host.showcase.deps}
                vanilla={host.vanilla}
                {...(host.showcase.vanillaBlockstates === undefined
                  ? {}
                  : { vanillaBlockstates: host.showcase.vanillaBlockstates })}
                stillKey={key}
                still={still}
                once={!playsByItself(state)}
                onEnd={() => setRequested(false)}
                onWebGLUnavailable={() => setWebglLost(true)}
              />
            </Suspense>
          </div>
        ) : (
          picture
        )}
        <span className="pointer-events-none absolute top-1 left-1 rounded bg-black/70 px-1 py-0.5 font-medium text-[10px] text-white uppercase tracking-wide">
          Preview
        </span>
      </div>
      {state.webgl ? (
        <button
          type="button"
          aria-pressed={live}
          className="inline-flex w-fit items-center gap-1 rounded border border-border px-2 py-0.5 text-sm focus-visible:outline-2 focus-visible:outline-accent"
          data-testid="search-preview-play"
          onClick={() => setRequested((before) => !before)}
        >
          {live ? <Pause aria-hidden size={14} /> : <Play aria-hidden size={14} />}
          {live ? `Pause: ${clip.title}` : `Play: ${clip.title}`}
        </button>
      ) : (
        !webgl && (
          <p className="text-muted text-xs" data-testid="search-preview-no-webgl">
            {NO_MOVING_PICTURES}
          </p>
        )
      )}
    </div>
  );
}

// The mod's things ---------------------------------------------------------------------------

/** A thing of the mod through the Preview panel's route for its kind. */
function ElementBody(body: BodyProps & { element: string }) {
  const { hit, host, props } = body;
  const mode = host.mode;
  const project = host.project;
  const element =
    project === null
      ? undefined
      : project.namespaces
          .flatMap((namespace) => namespace.elements)
          .find((entry) => entry.id === body.element);
  if (project === null || element === undefined) return <TextBody hit={hit} mode={mode} />;
  const previewKind = host.previewKindOf?.(element.kind);
  const routed =
    isPreviewKind(previewKind) ||
    modelFieldSubject(element, project) !== null ||
    // A recipe's grid names it by id: not in Very easy.
    (element.kind === 'minecraft:recipe' && mode !== 'very-easy');
  if (!routed) return <TextBody hit={hit} mode={mode} />;
  return (
    <div className="min-w-0" data-testid="search-preview-element">
      <PreviewPanel
        project={project}
        element={element}
        previewKind={previewKind}
        folders={host.folders}
        readProjectAsset={host.readProjectAsset}
        vanilla={host.vanilla}
        onSetup={() => host.onSetup?.()}
        {...(props.webgl === undefined ? {} : { webgl: props.webgl })}
        {...(host.terrainSession === undefined ? {} : { terrainSession: host.terrainSession })}
        {...(host.projectRoot === undefined ? {} : { projectRoot: host.projectRoot })}
      />
    </div>
  );
}

/** A picture of the mod (a sound keeps its sentence). */
function AssetBody(body: BodyProps & { namespace: string; path: string }) {
  const { hit, host } = body;
  const [url, setUrl] = useState<string | null>(null);
  const isPicture = body.path.endsWith('.png');
  const { readProjectAsset } = host;
  useEffect(() => {
    if (!isPicture) return;
    let live = true;
    readProjectAsset(body.namespace, body.path).then(
      (bytes) => {
        if (live && bytes !== null) setUrl(pngDataUrl(bytes));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [isPicture, readProjectAsset, body.namespace, body.path]);
  if (url === null) return <TextBody hit={hit} mode={host.mode} />;
  return (
    <div className={pictureBox} data-testid="search-preview-asset">
      <img
        src={url}
        alt=""
        className="max-h-full max-w-full object-contain [image-rendering:pixelated]"
        style={{ width: '50%' }}
      />
    </div>
  );
}

/** The ThingPicker sort of a vanilla sort that has a picture. */
const VANILLA_PICTURE_SORTS: Readonly<Partial<Record<VanillaSort, ThingSort>>> = {
  thing: 'item',
  mob: 'mob',
  effect: 'effect',
  particle: 'particle',
};

/** A vanilla id's picture, from the user's jar through `ThingPictures`. */
function VanillaBody(body: BodyProps & { id: string; sort: VanillaSort }) {
  const { hit, host } = body;
  const sort = VANILLA_PICTURE_SORTS[body.sort];
  if (sort === undefined || host.pictures === null || host.pictures === undefined) {
    return <TextBody hit={hit} mode={host.mode} />;
  }
  const paths = vanillaPicturePaths(body.id, sort, host.folders.textures ?? 'textures');
  return (
    <div className={pictureBox} data-testid="search-preview-vanilla">
      <ThingIcon
        sort={sort}
        picture={{ from: 'vanilla', paths }}
        pictures={host.pictures}
        size={96}
      />
    </div>
  );
}

/** A rule of the mod as a read-only card: When, Only if and Do. */
function RuleBody(body: BodyProps & { book: string; index: number }) {
  const { hit, host } = body;
  const mode = host.mode;
  const rule = ruleOf(host.project, body.book, body.index);
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const namespace of host.project?.namespaces ?? []) {
      for (const element of namespace.elements) map.set(element.id, displayNameOf(element));
    }
    return (id: string) => map.get(id);
  }, [host.project]);
  if (rule === null) return <TextBody hit={hit} mode={mode} />;
  const when = typeof rule.when === 'object' && rule.when !== null ? rule.when : undefined;
  const whenObject = when as Parameters<typeof whenSentence>[0];
  const triggerId =
    whenObject !== undefined && typeof whenObject.trigger === 'string' ? whenObject.trigger : '';
  const context: SentenceContext = { names, trigger: triggerById(triggerId) };
  const onlyIf =
    typeof rule.only_if === 'object' && rule.only_if !== null && !Array.isArray(rule.only_if)
      ? (rule.only_if as { [key: string]: Json })
      : undefined;
  const conditions = Array.isArray(onlyIf?.conditions)
    ? onlyIf.conditions.flatMap((entry) =>
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
          ? [conditionSentence(entry, context)]
          : [],
      )
    : [];
  const safe = (make: () => string): string => {
    try {
      return make();
    } catch {
      return '';
    }
  };
  const rows: { label: string; text: string }[] = [
    { label: 'When', text: safe(() => whenSentence(whenObject, names)) },
    ...(conditions.length > 0
      ? [{ label: 'Only if', text: joinWords(conditions, onlyIf?.match === 'any' ? 'or' : 'and') }]
      : []),
    { label: 'Do', text: safe(() => stepsSentence(rule, 'do', context)) },
  ];
  const name = typeof rule.name === 'string' ? rule.name.trim() : '';
  return (
    <section
      aria-label={name !== '' ? name : 'Rule'}
      className="flex flex-col gap-1 rounded border border-border bg-panel p-2 text-sm"
      data-testid="search-preview-rule"
    >
      {name !== '' && <p className="font-semibold">{name}</p>}
      {rule.enabled === false && <p className="text-muted text-xs">This rule is off.</p>}
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        {rows.map((row) => (
          <RuleRow key={row.label} label={row.label} text={row.text} mode={mode} />
        ))}
      </dl>
    </section>
  );
}

function RuleRow(props: { label: string; text: string; mode: SearchMode }): ReactNode {
  const text = plainText(props.text, props.mode, { loose: true }) ?? '';
  return (
    <>
      <dt className="font-medium">{props.label}</dt>
      <dd className="m-0 break-words">{text}</dd>
    </>
  );
}

/** A guide section's first paragraph, read from its page. */
function GuideBody(body: BodyProps & { page: string; anchor: string }) {
  const { hit, host } = body;
  const [paragraph, setParagraph] = useState<string | null>(null);
  const { readGuidePage } = host;
  useEffect(() => {
    if (readGuidePage === undefined) return;
    let live = true;
    readGuidePage(body.page).then(
      (markdown) => {
        if (!live) return;
        const found = guideFirstParagraph(markdown, body.anchor);
        setParagraph(found === null ? null : plainMarkdown(found));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [readGuidePage, body.page, body.anchor]);
  if (paragraph === null) return <TextBody hit={hit} mode={host.mode} />;
  return (
    <div className="rounded border border-border bg-panel p-2" data-testid="search-preview-guide">
      <Line mode={host.mode} testId="search-preview-guide-text" text={paragraph} />
    </div>
  );
}

export default ResultPreview;
