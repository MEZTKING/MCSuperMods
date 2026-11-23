/**
 * The processor list view (ADR 0122 D6, 4L4; B641): a building the user picks, before and after
 * the list, with a swipe line through it and a seed, and how many blocks each processor
 * changed, each with how faithful it is (B638's 18 exact rows, 4 about right and 3 named only;
 * exact ones are shown as checked where the structures parity fixture measured them).
 *
 * The buildings offered are first those a pool of the mod places with this list, then the mod's
 * other buildings; Minecraft's own come from the user's jar (4L3). The list runs in the
 * structures worker (`client.ts`, `host.ts`) 100 ms after an edit. What surrounds the building
 * and its floor's height are rarer settings, under More options, with the ids.
 */

import type { Json } from '@msm/plugin-api';
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { MoreOptions, usePlain } from '../../../components/ui/MoreOptions';
import { createVanillaJsonCache } from '../../../preview/model-chain';
import { hasWebGL } from '../../../preview/webgl';
import { assetReader } from '../../existing/bundle-host';
import { FIDELITY_HINTS, FIDELITY_LABELS, weakest } from '../../frame/fidelity';
import { resourceFoldersOf, wordsOfPath } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import { SeedBox } from '../../frame/SeedBox';
import type { LiveViewProps } from '../../registry';
import type { VanillaDataReader } from '../../vanilla-data';
import { cleanTemplateData } from '../assembly/steps';
import {
  createVanillaPieceReader,
  NOT_SET_UP_VANILLA_PIECES,
  type PieceTemplate,
  pieceTemplateFromData,
  type VanillaPieceReader,
} from '../vanilla-pieces';
import { sharedProcessorClient } from './client';
import {
  BLOCK_TAG_FOLDER,
  changedBlocks,
  gatherTags,
  namedTags,
  namespaced,
  type ProcessedResult,
  processorWords,
  type RuleRow,
  ruleRows,
  swipeTemplate,
  TEMPLATE_KIND,
  type TemplateChoice,
  templateChoices,
} from './model';

const PreviewCanvas = lazy(() => import('../../../preview/PreviewCanvas'));

/** The wait after an edit before the list runs again (with the work, within 150 ms). */
export const PROCESSORS_DEBOUNCE_MS = 100;
/** The floor's height the building is placed at unless the user picks another. */
export const DEFAULT_HEIGHT = 64;

export const SWIPE_LINE =
  'Left of the swipe line is the building before the list; right of it, after.';
export const LEFT_OUT_LINE =
  'A block a processor leaves out shows as empty: the world’s own block stays there.';
export const SEED_LINE =
  'Random processors use this seed; the game draws its own, so the blocks picked in your world will differ.';
export const NO_WEBGL_LINE = 'Your computer cannot draw 3D here, so only the counts show.';
export const NO_TEMPLATE_LINE =
  'This mod has no buildings yet. Make or import a structure template to try this list on it.';
export const ONLY_IN_GAME_LINE =
  'A processor shown as only in the game leaves the building unchanged here.';

/** What can surround the building, in words. */
export const AROUND: readonly { readonly block: string | null; readonly words: string }[] = [
  { block: null, words: 'Air' },
  { block: 'minecraft:water', words: 'Water' },
  { block: 'minecraft:lava', words: 'Lava' },
  { block: 'minecraft:stone', words: 'Stone' },
];

const RANDOM = /random_|"minecraft:(block_rot|capped|block_age)"|linear_pos/;

/** Whether a list draws random numbers (so the seed changes what it does). */
export function listIsRandom(list: unknown): boolean {
  return RANDOM.test(JSON.stringify(list ?? null));
}

const readers = new Map<string, VanillaPieceReader>();

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

/** A building's name: words, and the id after them inside More options. */
function templateWords(id: string, advanced: boolean): string {
  const words = wordsOfPath(id) || 'Building';
  return advanced ? `${words} (${id})` : words;
}

interface Run {
  readonly template: PieceTemplate | null;
  readonly result: ProcessedResult | null;
  readonly ms: number | null;
  readonly error: string | null;
  readonly missing: boolean;
  readonly needsSetUp: boolean;
}

const EMPTY_RUN: Run = {
  template: null,
  result: null,
  ms: null,
  error: null,
  missing: false,
  needsSetUp: false,
};

let lanes = 0;

/** Props: a live view's, and the building to show when the Structure Studio picks it. */
export type ProcessorListViewProps = LiveViewProps & {
  /** The building to try the list on (the Structure Studio's own); the picker is hidden. */
  readonly template?: string;
};

/** The project's template by id, parsed; `null` when there is none or it cannot be read. */
function projectTemplate(project: LiveViewProps['project'], id: string): PieceTemplate | null {
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== TEMPLATE_KIND || namespaced(element.id) !== id) continue;
      const data = cleanTemplateData(element.data);
      return data === null ? null : pieceTemplateFromData(id, data);
    }
  }
  return null;
}

function RuleList({ rows, advanced }: { rows: readonly RuleRow[]; advanced: boolean }) {
  if (rows.length === 0) {
    return (
      <p data-testid="processors-empty" className="text-sm text-muted">
        This list has no processors, so the building stays as it is.
      </p>
    );
  }
  return (
    <ol aria-label="What each processor did" className="flex flex-col gap-1 text-sm">
      {rows.map((row, index) => (
        <li
          key={index}
          data-testid={`processors-rule-${index}`}
          data-fidelity={row.fidelity}
          data-type={row.type}
          className="flex flex-col gap-0.5 rounded border border-border px-2 py-1"
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{processorWords(row.type, advanced)}</span>
            <span className="tabular-nums">
              {row.changed === 1 ? '1 block changed' : `${row.changed} blocks changed`}
            </span>
            <span className="text-xs text-muted" title={FIDELITY_HINTS[row.fidelity]}>
              {FIDELITY_LABELS[row.fidelity]}
            </span>
          </div>
          {row.notes.map((note) => (
            <span key={note} className="text-xs text-muted [overflow-wrap:anywhere]">
              {note}
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}

/** See the module comment. */
export default function ProcessorListView(props: ProcessorListViewProps) {
  const { project, element, vanilla, preferences, onPreferences } = props;
  const advanced = !usePlain();
  const [lane] = useState(() => {
    lanes += 1;
    return `processors-${lanes}`;
  });
  const choices = useMemo(() => templateChoices(project, element.id), [project, element.id]);
  const [picked, setPicked] = useState<string | null>(null);
  const chosen: TemplateChoice | null = useMemo(() => {
    const id = props.template ?? picked;
    if (id !== null) {
      const known = choices.find((choice) => choice.id === namespaced(id));
      return known ?? { id: namespaced(id), withThisList: false, source: 'project' };
    }
    return choices[0] ?? null;
  }, [props.template, picked, choices]);
  const [around, setAround] = useState<string | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [swipe, setSwipe] = useState<number | null>(null);
  const [run, setRun] = useState<Run>(EMPTY_RUN);
  const pieces = useMemo(() => pieceReaderFor(vanilla), [vanilla]);
  const list = element.data;
  /** When the last edit (or choice) came in, for the time it took to redraw. */
  const editedAt = useRef(0);

  useEffect(() => {
    let live = true;
    editedAt.current = performance.now();
    const client = sharedProcessorClient();
    const timer = setTimeout(() => {
      void (async () => {
        if (chosen === null) {
          setRun(EMPTY_RUN);
          return;
        }
        let template: PieceTemplate | null = null;
        let needsSetUp = false;
        if (chosen.source === 'vanilla') {
          const answer = await pieces.template(chosen.id);
          if (answer.status === 'ready') template = answer.template;
          needsSetUp = answer.status === 'not_set_up';
        } else {
          template = projectTemplate(project, chosen.id);
        }
        const names = namedTags(list);
        let lookup: (id: string) => Json | undefined = () => undefined;
        if (names.length > 0) {
          const answer = await vanilla.lookup([BLOCK_TAG_FOLDER]);
          if (answer.status === 'ready') {
            lookup = (id) => answer.lookup(BLOCK_TAG_FOLDER, id);
          }
        }
        const gathered = gatherTags(project, names, lookup);
        if (gathered.namesVanilla && vanilla.mcVersion === null) needsSetUp = true;
        if (!live) return;
        if (template === null) {
          setRun({ ...EMPTY_RUN, missing: true, needsSetUp });
          return;
        }
        const done = await client.run(lane, {
          template,
          list,
          seed: preferences.seed,
          origin: [0, height, 0],
          around,
          tags: gathered.tags,
          ...(chosen.elementType === undefined ? {} : { elementType: chosen.elementType }),
        });
        if (!live || done === null) return;
        setRun({
          template,
          result: done.result,
          ms: performance.now() - editedAt.current,
          error: null,
          missing: false,
          needsSetUp,
        });
      })().catch((error: unknown) => {
        if (live) {
          setRun({ ...EMPTY_RUN, error: error instanceof Error ? error.message : String(error) });
        }
      });
    }, PROCESSORS_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
      client.cancel(lane);
    };
  }, [project, list, chosen, preferences.seed, around, height, pieces, vanilla, lane]);

  const template = run.template;
  const width = template?.size[0] ?? 0;
  const cut = Math.min(width, Math.max(0, swipe ?? Math.floor(width / 2)));
  const rows = useMemo(
    () => (run.result === null ? [] : ruleRows(run.result.rules, list)),
    [run.result, list],
  );
  const flat = useMemo(
    () => (template === null ? null : swipeTemplate(template, run.result, cut)),
    [template, run.result, cut],
  );
  const changed = useMemo(
    () => (template === null || run.result === null ? null : changedBlocks(template, run.result)),
    [template, run.result],
  );
  const total = template?.blocks?.length ?? 0;

  const webgl = hasWebGL();
  const folders = resourceFoldersOf(project);
  const vanillaJson = useMemo(
    () => (props.vanillaAssets === null ? null : createVanillaJsonCache(props.vanillaAssets)),
    [props.vanillaAssets],
  );
  const readProjectAsset = useMemo(() => assetReader(props.readProject), [props.readProject]);
  const subject = useMemo(
    () =>
      flat === null
        ? null
        : { previewKind: 'structure' as const, id: 'msm:processors', data: flat },
    [flat],
  );
  const onSwipe = useCallback((value: number) => setSwipe(value), []);
  const swipeId = useId();

  const aroundWords = AROUND.find((entry) => entry.block === around)?.words ?? 'Air';
  const notes = [
    SWIPE_LINE,
    LEFT_OUT_LINE,
    `Placed with ${aroundWords.toLowerCase()} around it, its floor at height ${height}.`,
  ];
  if (listIsRandom(list)) notes.push(SEED_LINE);
  if (rows.some((row) => row.fidelity === 'only_in_game')) notes.push(ONLY_IN_GAME_LINE);
  if (!webgl) notes.push(NO_WEBGL_LINE);
  const fidelity = weakest(rows.map((row) => row.fidelity));

  return (
    <LiveViewFrame
      title="Processors"
      fidelity={fidelity}
      notes={notes}
      needsSetUp={run.needsSetUp}
      onSetup={props.onSetup}
      controls={
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {props.template === undefined && choices.length > 0 && (
              <label className="flex min-w-0 items-center gap-2">
                Building
                <select
                  data-testid="processors-template"
                  className="min-w-0 max-w-full rounded border border-border bg-bg px-1"
                  value={chosen?.id ?? ''}
                  onChange={(event) => setPicked(event.target.value)}
                >
                  {choices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {templateWords(choice.id, advanced)}
                      {choice.withThisList ? ' (placed with this list)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <SeedBox
              seed={preferences.seed}
              onSeed={(seed) => onPreferences({ seed })}
              rollLabel="New seed"
            />
          </div>
          {width > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor={swipeId}>Swipe line</label>
              <span className="text-xs text-muted">Before</span>
              <input
                id={swipeId}
                data-testid="processors-swipe"
                type="range"
                min={0}
                max={width}
                step={1}
                value={cut}
                onChange={(event) => onSwipe(Number(event.target.value))}
                className="min-w-0 flex-1"
              />
              <span className="text-xs text-muted">After</span>
            </div>
          )}
        </div>
      }
    >
      {chosen === null && (
        <p data-testid="processors-no-template" className="text-sm">
          {NO_TEMPLATE_LINE}
        </p>
      )}
      {run.missing && chosen !== null && (
        <p data-testid="processors-missing" className="text-sm">
          {`${templateWords(chosen.id, advanced)} cannot be read here, so the list cannot be shown on it.`}
        </p>
      )}
      {run.error !== null && (
        <p role="alert" className="text-sm text-error">
          {`The processors could not be worked out here: ${run.error}`}
        </p>
      )}
      {run.result?.refused != null && (
        <p role="alert" data-testid="processors-refused" className="text-sm text-error">
          {run.result.refused}
        </p>
      )}
      {changed !== null && (
        <p data-testid="processors-changed" className="text-sm tabular-nums">
          {`${changed} of ${total} blocks changed`}
        </p>
      )}
      {run.result !== null && <RuleList rows={rows} advanced={advanced} />}
      {webgl && folders !== null && subject !== null && (
        <div className="w-full max-w-md" data-testid="processors-canvas" data-cut={cut}>
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
      <MoreOptions storageKey="processors-view">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            Around it
            <select
              data-testid="processors-around"
              className="rounded border border-border bg-bg px-1"
              value={around ?? ''}
              onChange={(event) => setAround(event.target.value === '' ? null : event.target.value)}
            >
              {AROUND.map((entry) => (
                <option key={entry.words} value={entry.block ?? ''}>
                  {entry.words}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Floor at height
            <input
              data-testid="processors-height"
              type="number"
              className="w-20 rounded border border-border bg-bg px-1 tabular-nums"
              value={height}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value)) setHeight(value);
              }}
            />
          </label>
          {chosen !== null && (
            <span data-testid="processors-template-id" className="text-xs text-muted">
              {`Building: ${chosen.id}`}
            </span>
          )}
          {rows.length > 0 && (
            <span data-testid="processors-types" className="text-xs text-muted">
              {`Processors: ${rows.map((row) => row.type).join(', ')}`}
            </span>
          )}
          {run.ms !== null && (
            <span data-testid="processors-ms" className="text-xs text-muted tabular-nums">
              {`Worked out in ${Math.round(run.ms)} ms`}
            </span>
          )}
        </div>
      </MoreOptions>
    </LiveViewFrame>
  );
}
