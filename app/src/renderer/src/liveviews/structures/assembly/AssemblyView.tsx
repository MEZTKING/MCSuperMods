/**
 * The assembly view (ADR 0122 D1, D4, D5, D7; B640), for two kinds:
 *
 * - **A template pool**: **Assemble from here**, a start piece of the pool and everything that
 *   joins to it, to a depth the user picks, within 80 blocks.
 * - **A jigsaw structure**: the whole assembly from its start pool at its own size and distance
 *   limit. Any other structure type says only "This kind of structure is built by the game
 *   itself." (4L2).
 *
 * The pieces are gathered on this thread (the project's laid over the user's jar, `steps.ts`)
 * and assembled in the structures worker (`client.ts`), 150 ms after an edit; the steps come back
 * in batches and play piece by piece. A seed box and dice (MSM's own picks, 4L1), **Play**,
 * **Step** (one more piece; its two jigsaw blocks that met are lit) and **Start over**; the step
 * list with each refusal's reason; the 3D view of the pieces shown on a flat floor (4L5), or
 * without WebGL the step list alone. An assembly stops at 500 pieces, and the user can raise the
 * limit (4L9). Minecraft's own pieces need the Minecraft folder (4L3: the set-up banner).
 */

import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '../../../components/ui/Button';
import { createVanillaJsonCache } from '../../../preview/model-chain';
import { hasWebGL } from '../../../preview/webgl';
import { usePreferences } from '../../../store/preferences';
import { assetReader } from '../../existing/bundle-host';
import { resourceFoldersOf } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import { SeedBox } from '../../frame/SeedBox';
import type { LiveViewProps } from '../../registry';
import type { VanillaDataReader } from '../../vanilla-data';
import {
  createVanillaPieceReader,
  NOT_SET_UP_VANILLA_PIECES,
  type VanillaPieceReader,
} from '../vanilla-pieces';
import { type JigsawStructureData, sharedAssemblyClient, type ViewStep } from './client';
import { StepList } from './StepList';
import {
  BUILDING_LINE,
  DEFAULT_PIECE_LIMIT,
  DEFAULT_POOL_DEPTH,
  FLAT_FLOOR_LINE,
  flattenPieces,
  gatherAssembly,
  jigsawStructureOf,
  MAX_PIECE_LIMIT,
  NO_WEBGL_LINE,
  NOT_JIGSAW_LINE,
  PIECE_LIMIT_STEP,
  POOL_FOLDER,
  PRIORITY_LINE,
  placedSteps,
  poolViewStructure,
  STRUCTURE_KIND,
  stepsUpTo,
  stoppedLine,
} from './steps';

const PreviewCanvas = lazy(() => import('../../../preview/PreviewCanvas'));

/** The wait after an edit before assembling again (ADR 0122 D5). */
export const ASSEMBLY_DEBOUNCE_MS = 150;
/** How often playing shows more pieces. */
export const PLAY_TICK_MS = 40;
/** Playing shows the whole assembly in about this many ticks, however many pieces it has. */
const PLAY_TICKS = 40;
/** How often the 3D view is rebuilt while playing (it waits 150 ms for changes to stop). */
const DRAW_EVERY_MS = 400;
/** Where the assembly starts: the start piece's bottom on the floor at y 0. */
const ORIGIN: readonly [number, number, number] = [0, 1, 0];

const readers = new Map<string, VanillaPieceReader>();

/** One reader of Minecraft's own templates per version, kept for the run. */
function pieceReaderFor(vanilla: VanillaDataReader): VanillaPieceReader {
  const version = vanilla.mcVersion;
  if (version === null) return NOT_SET_UP_VANILLA_PIECES;
  let reader = readers.get(version);
  if (reader === undefined) {
    reader = createVanillaPieceReader({ mcVersion: version });
    readers.set(version, reader);
  }
  return reader;
}

/** The view's state of one assembly. */
interface Run {
  readonly steps: readonly ViewStep[];
  readonly done: boolean;
  readonly stoppedAtLimit: boolean;
  readonly namesVanilla: boolean;
  readonly vanillaNotSetUp: boolean;
  readonly tooMany: boolean;
  readonly error: string | null;
}

const EMPTY_RUN: Run = {
  steps: [],
  done: false,
  stoppedAtLimit: false,
  namesVanilla: false,
  vanillaNotSetUp: false,
  tooMany: false,
  error: null,
};

let lanes = 0;

/** A lane name of its own for each assembly on screen. */
function newLane(): string {
  lanes += 1;
  return `assembly-${lanes}`;
}

/** An assembly of `structure`, with its controls, list and 3D view. */
function Assembly(
  props: LiveViewProps & {
    readonly structure: JigsawStructureData;
    readonly title: string;
    readonly depthPicker?: ReactNode;
  },
) {
  const { project, structure, vanilla, preferences, onPreferences } = props;
  const advanced = usePreferences((state) => state.mode) === 'advanced';
  const [lane] = useState(newLane);
  const [limit, setLimit] = useState(DEFAULT_PIECE_LIMIT);
  const [run, setRun] = useState<Run>(EMPTY_RUN);
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(true);
  const pieces = useMemo(() => pieceReaderFor(vanilla), [vanilla]);

  // Gather and assemble 150 ms after the inputs stop changing.
  useEffect(() => {
    let live = true;
    const client = sharedAssemblyClient();
    const timer = setTimeout(() => {
      void (async () => {
        const gathered = await gatherAssembly({
          project,
          startPool: structure.startPool,
          pieces,
          readVanillaPools: async () => {
            const answer = await vanilla.folder(POOL_FOLDER);
            return answer.status === 'ready'
              ? { status: 'ready', files: answer.files }
              : { status: 'not_set_up' };
          },
        });
        if (!live) return;
        const base: Run = {
          ...EMPTY_RUN,
          namesVanilla: gathered.namesVanilla,
          vanillaNotSetUp: gathered.vanillaNotSetUp,
          tooMany: gathered.tooMany,
        };
        setRun(base);
        setShown(0);
        setPlaying(true);
        const done = await client.run(
          lane,
          {
            structure,
            pools: gathered.pools,
            templates: gathered.templates,
            seed: preferences.seed,
            pieceLimit: limit,
            origin: ORIGIN,
          },
          (batch) => {
            if (!live) return;
            setRun((before) => ({ ...before, steps: [...before.steps, ...batch] }));
          },
        );
        if (!live || done === null) return;
        setRun((before) => ({ ...before, done: true, stoppedAtLimit: done.stoppedAtLimit }));
      })().catch((error: unknown) => {
        if (live) {
          setRun({ ...EMPTY_RUN, error: error instanceof Error ? error.message : String(error) });
        }
      });
    }, ASSEMBLY_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
      client.cancel(lane);
    };
  }, [project, structure, preferences.seed, limit, pieces, vanilla, lane]);

  const placed = useMemo(() => placedSteps(run.steps), [run.steps]);
  const total = placed.length;

  // Playing: more pieces every tick, the whole in about PLAY_TICKS ticks; the first at once.
  useEffect(() => {
    if (!playing) return;
    if (shown === 0 && total > 0) {
      setShown(1);
      return;
    }
    if (shown >= total) {
      if (run.done) setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () =>
        setShown((before) => Math.min(total, before + Math.max(1, Math.ceil(total / PLAY_TICKS)))),
      PLAY_TICK_MS,
    );
    return () => clearTimeout(timer);
  }, [playing, shown, total, run.done]);

  const step = useCallback(() => {
    setPlaying(false);
    setShown((before) => Math.min(total, before + 1));
  }, [total]);
  const startOver = useCallback(() => {
    setPlaying(false);
    setShown(Math.min(1, total));
  }, [total]);
  const play = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (shown >= total && run.done) setShown(0);
    setPlaying(true);
  }, [playing, shown, total, run.done]);

  // The 3D view follows `shown` at once when paused, and every DRAW_EVERY_MS while playing.
  const [drawn, setDrawn] = useState(0);
  const latest = useRef(shown);
  latest.current = shown;
  useEffect(() => {
    if (!playing) {
      setDrawn(shown);
      return;
    }
    const timer = setTimeout(() => setDrawn(latest.current), DRAW_EVERY_MS);
    return () => clearTimeout(timer);
  }, [playing, shown]);

  const listed = useMemo(() => stepsUpTo(run.steps, shown, run.done), [run.steps, shown, run.done]);
  const flat = useMemo(() => flattenPieces(placed, drawn), [placed, drawn]);
  const webgl = hasWebGL();
  const folders = resourceFoldersOf(project);
  const vanillaJson = useMemo(
    () => (props.vanillaAssets === null ? null : createVanillaJsonCache(props.vanillaAssets)),
    [props.vanillaAssets],
  );
  const readProjectAsset = useMemo(() => assetReader(props.readProject), [props.readProject]);
  const subject = useMemo(
    () =>
      flat === null ? null : { previewKind: 'structure' as const, id: 'msm:assembly', data: flat },
    [flat],
  );

  const notes = [BUILDING_LINE, FLAT_FLOOR_LINE, PRIORITY_LINE];
  if (!webgl) notes.push(NO_WEBGL_LINE);
  if (run.tooMany)
    notes.push('This structure reaches very many building files; only the first 2,000 are used.');

  return (
    <LiveViewFrame
      title={props.title}
      fidelity="about_right"
      notes={notes}
      needsSetUp={run.namesVanilla && run.vanillaNotSetUp}
      onSetup={props.onSetup}
      controls={
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SeedBox
              seed={preferences.seed}
              onSeed={(seed) => onPreferences({ seed })}
              rollLabel="New seed"
            />
            {props.depthPicker}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button data-testid="assembly-play" onClick={play} disabled={total === 0}>
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button data-testid="assembly-step-button" onClick={step} disabled={shown >= total}>
              Step
            </Button>
            <Button data-testid="assembly-start-over" onClick={startOver} disabled={total === 0}>
              Start over
            </Button>
            <span data-testid="assembly-count" className="text-xs text-muted tabular-nums">
              {run.done ? `${shown} of ${total} pieces` : `${shown} pieces so far`}
            </span>
          </div>
        </div>
      }
    >
      {run.error !== null && (
        <p role="alert" className="text-sm text-error">
          {`The assembly could not be worked out: ${run.error}`}
        </p>
      )}
      {run.stoppedAtLimit && (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="assembly-stopped">
          <span>{stoppedLine(limit)}</span>
          {limit < MAX_PIECE_LIMIT && (
            <Button
              data-testid="assembly-raise-limit"
              onClick={() =>
                setLimit((before) => Math.min(MAX_PIECE_LIMIT, before + PIECE_LIMIT_STEP))
              }
            >
              Raise the limit
            </Button>
          )}
        </div>
      )}
      {webgl && folders !== null && subject !== null && (
        <div className="h-72 w-full" data-testid="assembly-canvas">
          <Suspense fallback={<p className="text-sm text-muted">Loading the 3D view…</p>}>
            <PreviewCanvas
              project={project}
              folders={folders}
              subject={subject}
              readProjectAsset={readProjectAsset}
              vanilla={props.vanillaAssets}
              vanillaJson={vanillaJson}
            />
          </Suspense>
        </div>
      )}
      <StepList steps={listed} advanced={advanced} />
    </LiveViewFrame>
  );
}

/** The depth a pool's view assembles to: 1 to 20, as a structure's `size`. */
function DepthPicker(props: { readonly depth: number; onDepth(depth: number): void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      How deep
      <select
        data-testid="assembly-depth"
        className="rounded border border-border bg-bg px-1"
        value={props.depth}
        onChange={(event) => props.onDepth(Number(event.target.value))}
      >
        {Array.from({ length: 20 }, (_, i) => i + 1).map((depth) => (
          <option key={depth} value={depth}>
            {depth}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A pool's view: Assemble from here. */
function PoolAssembly(props: LiveViewProps) {
  const [depth, setDepth] = useState(DEFAULT_POOL_DEPTH);
  const structure = useMemo(
    () => poolViewStructure(props.element.id, depth),
    [props.element.id, depth],
  );
  return (
    <Assembly
      {...props}
      structure={structure}
      title="Assemble from here"
      depthPicker={<DepthPicker depth={depth} onDepth={setDepth} />}
    />
  );
}

/** A structure's view: its whole assembly, or the line of 4L2. */
function StructureAssembly(props: LiveViewProps) {
  const structure = useMemo(() => jigsawStructureOf(props.element.data), [props.element.data]);
  if (structure === null) {
    return (
      <LiveViewFrame title="Structure" fidelity="only_in_game">
        <p data-testid="assembly-not-jigsaw" className="text-sm">
          {NOT_JIGSAW_LINE}
        </p>
      </LiveViewFrame>
    );
  }
  return <Assembly {...props} structure={structure} title="Assembled" />;
}

/** The view of a template pool or a structure; see the module comment. */
export default function AssemblyView(props: LiveViewProps) {
  return props.element.kind === STRUCTURE_KIND ? (
    <StructureAssembly {...props} />
  ) : (
    <PoolAssembly {...props} />
  );
}
