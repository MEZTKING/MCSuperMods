/**
 * The day strip (ADR 0121 D6; B626): each value a timeline sets, drawn across one period
 * (`period_ticks`; B619 3S10), with each track's keyframes, the sampled value at "now", a moving
 * now marker and a time scrubber. Numbers draw as a line, true or false as bands, choices as
 * named steps and colours as a ribbon with the keyframes' swatches. Which attribute types can
 * be drawn comes from the target's own schema (`attributes.ts`); a type the strip cannot draw is
 * named. A world clock has no fields, so its view draws the timelines tied to it (the project's
 * and Minecraft's). The game's own blending is code, so the view is about right.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { createSchemaIndex, parseVanillaMcdocSymbols } from '@msm/schemas';
import { defaultTargetId, targetById } from '@msm/targets';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import { LIVE_VIEW_DEBOUNCE_MS } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import { type AttributeTable, attributeTable, type ValueType } from './attributes';
import {
  colourCss,
  colourHex,
  easingOf,
  parseColour,
  sampleTrack,
  stripSpan,
  type TimelineData,
  type Track,
  timelineOf,
  wrapTicks,
} from './strip';

/** Samples drawn across a strip. */
export const STRIP_SAMPLES = 240;

/** Ticks a second at the game's speed. */
export const GAME_TICKS_PER_SECOND = 20;

/** Seconds one period takes at the quick speed. */
export const QUICK_PERIOD_SECONDS = 20;

const PLAY_STEP_MS = 100;

/** Reads a target's attribute table; the default reads the vendored schema through main. */
export type AttributeTableLoader = (targetId: string) => Promise<AttributeTable>;

const tables = new Map<string, Promise<AttributeTable>>();

/** The default loader: the target's vendored symbols through the preload bridge, kept per target. */
export const loadAttributeTable: AttributeTableLoader = (targetId) => {
  let table = tables.get(targetId);
  if (table === undefined) {
    table = (async () => {
      const msm = (window as Partial<Window>).msm;
      if (msm === undefined) throw new Error('The MSM preload bridge is missing.');
      const bundle = targetById(targetId);
      if (bundle === undefined) throw new Error(`The target ${targetId} is not known.`);
      const bytes = await msm.targets.readVendored(targetId, 'vanillaMcdocSymbols');
      const symbols = parseVanillaMcdocSymbols(JSON.parse(new TextDecoder().decode(bytes)));
      return attributeTable(createSchemaIndex(symbols, { mcVersion: bundle.target.mcVersion }));
    })();
    table.catch(() => tables.delete(targetId));
    tables.set(targetId, table);
  }
  return table;
};

/** The value after it has stopped changing for 150 ms. */
function useSettled<T>(value: T): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const timer = setTimeout(() => setSettled(value), LIVE_VIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, settled]);
  return settled;
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** A percentage with at most two decimals, as the markers' `data-x` carries it. */
export function percentOf(ticks: number, span: number): number {
  return Math.round((ticks / span) * 10_000) / 100;
}

function shortId(id: string): string {
  return id.replace(/^minecraft:/, '');
}

function valueWords(value: Json | null, type: ValueType | null): string {
  if (value === null) return 'none';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '');
  }
  if (type?.kind === 'colour') {
    const colour = parseColour(value, type.alpha === true);
    if (colour !== null) return colourHex(colour, type.alpha === true);
  }
  return typeof value === 'string' ? shortId(value) : JSON.stringify(value);
}

/** The kind a value would draw as without the schema (it could not be read). */
function guessType(track: Track): ValueType {
  const value = track.keyframes[0]?.value;
  if (typeof value === 'boolean') return { kind: 'boolean', words: 'true or false' };
  if (typeof value === 'number') return { kind: 'number', words: 'a number' };
  if (typeof value === 'string' && parseColour(value) !== null) {
    return { kind: 'colour', alpha: value.replace('#', '').length === 8, words: 'a colour' };
  }
  if (typeof value === 'string') return { kind: 'choice', words: 'a value' };
  return { kind: 'structured', words: 'a structured value' };
}

const CHOICE_FILLS = ['#5b8def', '#e0a73a', '#4caf7d', '#c46bd1', '#e06a5b', '#46b5c4', '#9c8f5a'];

function choiceFill(value: Json | null): string {
  const text = JSON.stringify(value);
  let hash = 0;
  for (const char of text) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return CHOICE_FILLS[hash % CHOICE_FILLS.length] as string;
}

/** One drawable row worked out from a track. */
interface Row {
  readonly attribute: string;
  readonly track: Track | null;
  /** The type the keyframes are drawn as, or `null` when the strip cannot draw them. */
  readonly type: ValueType | null;
  /** Why it is not drawn, in plain words. */
  readonly why?: string;
  readonly easing: string;
  readonly easingKnown: boolean;
}

function rowsOf(timeline: TimelineData, table: AttributeTable | null, target: string): Row[] {
  return timeline.tracks.map(({ attribute, track }) => {
    const easing = easingOf(track?.ease);
    const base = { attribute, track, easing: easing.name, easingKnown: easing.known };
    if (track === null || track.keyframes.length === 0) {
      return { ...base, type: null, why: 'it has no keyframes' };
    }
    if (table === null) return { ...base, type: guessType(track) };
    const info = table.attributes.get(attribute);
    if (info === undefined) {
      return { ...base, type: null, why: `it is not an environment attribute of ${target}` };
    }
    const type = table.keyframeType(attribute, track.modifier) ?? info.value;
    if (type.kind === 'structured') {
      const under = track.modifier === undefined ? '' : ` under the modifier ${track.modifier}`;
      return { ...base, type: null, why: `its value${under} is ${type.words}` };
    }
    return { ...base, type };
  });
}

/** The sampled values across the span. */
function samples(row: Row, span: number, period: number | undefined): (Json | null)[] {
  if (row.track === null || row.type === null) return [];
  const out: (Json | null)[] = [];
  for (let index = 0; index < STRIP_SAMPLES; index += 1) {
    const ticks = ((index + 0.5) / STRIP_SAMPLES) * span;
    out.push(sampleTrack(row.track, ticks, period, row.type.kind));
  }
  return out;
}

/** Runs of equal values, as `[start, end)` sample indexes. */
function runs(
  values: readonly (Json | null)[],
): { start: number; end: number; value: Json | null }[] {
  const out: { start: number; end: number; value: Json | null }[] = [];
  values.forEach((value, index) => {
    const last = out[out.length - 1];
    if (last !== undefined && JSON.stringify(last.value) === JSON.stringify(value))
      last.end = index + 1;
    else out.push({ start: index, end: index + 1, value });
  });
  return out;
}

const STRIP_WIDTH = 1000;
const STRIP_HEIGHT = 28;

function StripBody({ row, values }: { row: Row; values: readonly (Json | null)[] }) {
  const type = row.type;
  if (type === null) return null;
  const width = STRIP_WIDTH / STRIP_SAMPLES;
  if (type.kind === 'number') {
    const numbers = values.filter((value): value is number => typeof value === 'number');
    const keyed = (row.track?.keyframes ?? [])
      .map((keyframe) => keyframe.value)
      .filter((value): value is number => typeof value === 'number');
    const low = Math.min(...numbers, ...keyed);
    const high = Math.max(...numbers, ...keyed);
    const range = high - low || 1;
    const points = values
      .map((value, index) =>
        typeof value === 'number'
          ? `${((index + 0.5) * width).toFixed(1)},${(STRIP_HEIGHT - 3 - ((value - low) / range) * (STRIP_HEIGHT - 6)).toFixed(1)}`
          : null,
      )
      .filter((point) => point !== null)
      .join(' ');
    return (
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent, #5b8def)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (type.kind === 'colour') {
    return (
      <>
        {values.map((value, index) => {
          const colour = parseColour(value ?? undefined, type.alpha === true);
          return (
            <rect
              key={index}
              x={index * width}
              y={0}
              width={width + 0.5}
              height={STRIP_HEIGHT}
              fill={colour === null ? 'transparent' : colourCss(colour)}
            />
          );
        })}
      </>
    );
  }
  return (
    <>
      {runs(values).map((run) => {
        const on = type.kind === 'boolean' ? run.value === true : run.value !== null;
        if (!on) return null;
        const fill =
          type.kind === 'boolean' ? 'var(--color-accent, #5b8def)' : choiceFill(run.value);
        return (
          <g key={run.start}>
            <rect
              x={run.start * width}
              y={type.kind === 'boolean' ? 6 : 2}
              width={(run.end - run.start) * width}
              height={type.kind === 'boolean' ? STRIP_HEIGHT - 12 : STRIP_HEIGHT - 4}
              fill={fill}
              opacity={0.8}
            >
              <title>{valueWords(run.value, type)}</title>
            </rect>
            {type.kind === 'choice' && (run.end - run.start) * width > 80 && (
              <text
                x={(run.start + 0.5) * width + 4}
                y={STRIP_HEIGHT / 2 + 4}
                fontSize={11}
                fill="#fff"
              >
                {valueWords(run.value, type)}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

function TrackRow(props: { row: Row; span: number; period: number | undefined; now: number }) {
  const { row, span, period, now } = props;
  const values = useMemo(() => samples(row, span, period), [row, span, period]);
  const nowValue =
    row.track !== null && row.type !== null
      ? sampleTrack(row.track, now, period, row.type.kind)
      : null;
  const nowX = (wrapTicks(now, span) / span) * STRIP_WIDTH;
  const modifier = row.track?.modifier;
  const relative = modifier !== undefined && modifier !== 'override';
  return (
    <li
      data-testid="day-track"
      data-attribute={row.attribute}
      data-kind={row.type?.kind ?? 'undrawable'}
      className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,6rem)] items-center gap-2"
    >
      <div className="flex min-w-0 flex-col text-xs">
        <span className="truncate font-medium" title={row.attribute}>
          {shortId(row.attribute)}
        </span>
        <span className="truncate text-muted">
          {row.easing}
          {modifier !== undefined && ` · ${modifier}`}
          {relative && ' (changes the base value)'}
        </span>
      </div>
      {row.type === null ? (
        <p
          data-testid="day-undrawable"
          className="col-span-2 text-xs text-muted [overflow-wrap:anywhere]"
        >
          {`The strip cannot draw ${shortId(row.attribute)}: ${row.why ?? 'its value is not drawable'}.`}
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${STRIP_WIDTH} ${STRIP_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-7 w-full rounded border border-border"
            role="img"
            aria-label={`${shortId(row.attribute)} across the day`}
          >
            <StripBody row={row} values={values} />
            {(row.track?.keyframes ?? []).map((keyframe, index) => {
              const x = (wrapTicks(keyframe.ticks, span) / span) * STRIP_WIDTH;
              return (
                <line
                  key={index}
                  data-testid="day-keyframe"
                  data-ticks={keyframe.ticks}
                  data-x={percentOf(wrapTicks(keyframe.ticks, span), span)}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={STRIP_HEIGHT}
                  stroke="currentColor"
                  strokeDasharray="3 2"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{`Tick ${keyframe.ticks}: ${valueWords(keyframe.value, row.type)}`}</title>
                </line>
              );
            })}
            <line
              data-testid="day-now-line"
              x1={nowX}
              x2={nowX}
              y1={0}
              y2={STRIP_HEIGHT}
              stroke="var(--color-warning, #e0a73a)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div data-testid="day-now-value" className="flex min-w-0 items-center gap-1 text-xs">
            {row.type.kind === 'colour' && nowValue !== null && (
              <span
                className="inline-block size-3 shrink-0 rounded-sm border border-border"
                style={{
                  background: colourCss(
                    parseColour(nowValue, row.type.alpha === true) ?? { a: 0, r: 0, g: 0, b: 0 },
                  ),
                }}
              />
            )}
            <span className="truncate">{valueWords(nowValue, row.type)}</span>
          </div>
          {row.type.kind === 'colour' && (
            <ul
              aria-label={`${shortId(row.attribute)} keyframe colours`}
              className="col-start-2 flex flex-wrap gap-1"
            >
              {(row.track?.keyframes ?? []).map((keyframe, index) => {
                const colour = parseColour(keyframe.value, row.type?.alpha === true);
                return (
                  <li
                    key={index}
                    data-testid="day-swatch"
                    title={`Tick ${keyframe.ticks}: ${valueWords(keyframe.value, row.type)}`}
                    className="size-4 rounded-sm border border-border"
                    style={{ background: colour === null ? 'transparent' : colourCss(colour) }}
                  />
                );
              })}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

/** One timeline's strip with its axis, time markers and tracks. */
function TimelineStrip(props: {
  id: string;
  timeline: TimelineData;
  table: AttributeTable | null;
  target: string;
  now: number;
  onNow(ticks: number): void;
  showTitle: boolean;
  source?: string;
}) {
  const { id, timeline, table, target, now, onNow, showTitle, source } = props;
  const span = stripSpan(timeline);
  const rows = useMemo(() => rowsOf(timeline, table, target), [timeline, table, target]);
  const dragging = useRef(false);
  const seek = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const fraction = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    onNow(Math.round(fraction * span) % span);
  };
  return (
    <section
      data-testid="day-timeline"
      data-id={id}
      aria-label={`Timeline ${shortId(id)}`}
      className="flex flex-col gap-2"
    >
      {showTitle && (
        <h4 className="text-xs font-medium">
          {shortId(id)}
          {source !== undefined && <span className="text-muted">{` · ${source}`}</span>}
        </h4>
      )}
      <p className="text-xs text-muted">
        <span data-testid="day-period" data-span={span} data-period={timeline.period ?? ''}>
          {timeline.period === undefined
            ? `Does not repeat; drawn from tick 0 to ${span}.`
            : `One period: ${span} ticks (${(span / GAME_TICKS_PER_SECOND / 60).toFixed(1)} minutes at the game's speed).`}
        </span>
        {timeline.clock !== undefined && ` Clock: ${shortId(timeline.clock)}.`}
      </p>
      <div className="relative grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,6rem)] gap-2 text-xs text-muted">
        <span />
        <div
          data-testid="day-axis"
          className="relative h-5 cursor-ew-resize touch-none border-b border-border"
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            seek(event);
          }}
          onPointerMove={(event) => {
            if (dragging.current) seek(event);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
        >
          {timeline.markers.map((marker) => (
            <span
              key={marker.name}
              data-testid="day-marker"
              data-name={marker.name}
              data-x={percentOf(wrapTicks(marker.ticks, span), span)}
              title={`${shortId(marker.name)}: tick ${marker.ticks}`}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${(wrapTicks(marker.ticks, span) / span) * 100}%` }}
            >
              {shortId(marker.name)}
            </span>
          ))}
          <span
            data-testid="day-now"
            data-ticks={Math.round(wrapTicks(now, span))}
            data-x={percentOf(wrapTicks(now, span), span)}
            className="absolute bottom-0 h-2 w-0.5 -translate-x-1/2 bg-warning"
            style={{ left: `${(wrapTicks(now, span) / span) * 100}%` }}
          />
        </div>
        <span>{`now ${Math.round(wrapTicks(now, span))}`}</span>
      </div>
      {rows.length === 0 ? (
        <p data-testid="day-empty" className="text-sm text-muted">
          This timeline sets no values yet. Add a track to see it across the day.
        </p>
      ) : (
        <ul aria-label="Tracks" className="flex flex-col gap-2">
          {rows.map((row) => (
            <TrackRow
              key={row.attribute}
              row={row}
              span={span}
              period={timeline.period}
              now={now}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** A timeline to draw: its id, data and where it comes from. */
interface Shown {
  readonly id: string;
  readonly data: Json;
  readonly source?: string;
}

function projectTimelines(project: Project): Element[] {
  return project.namespaces.flatMap((namespace) =>
    namespace.elements.filter((element) => element.kind === 'minecraft:timeline'),
  );
}

/** Extra props for tests: the schema loader. */
export interface DayStripOptions {
  readonly loadAttributes?: AttributeTableLoader;
}

type TableState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly table: AttributeTable }
  | { readonly status: 'error'; readonly message: string };

type VanillaState =
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly files: Readonly<Record<string, Json>> }
  | { readonly status: 'not_set_up' };

/** The day strip with its schema loader. */
export function DayStripView(props: LiveViewProps & DayStripOptions) {
  const { project, element, vanilla, onSetup } = props;
  const loader = props.loadAttributes ?? loadAttributeTable;
  const targetId = project.targets[0] ?? defaultTargetId;
  const isClock = element.kind === 'minecraft:world_clock';
  const settledProject = useSettled(project);
  const settledData = useSettled(element.data as Json);

  const [tableState, setTableState] = useState<TableState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setTableState({ status: 'loading' });
    loader(targetId).then(
      (table) => live && setTableState({ status: 'ready', table }),
      (error: unknown) =>
        live &&
        setTableState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      live = false;
    };
  }, [loader, targetId]);

  const [vanillaState, setVanillaState] = useState<VanillaState>({ status: 'none' });
  useEffect(() => {
    if (!isClock) {
      setVanillaState({ status: 'none' });
      return;
    }
    let live = true;
    setVanillaState({ status: 'loading' });
    vanilla.folder('timeline').then(
      (answer) =>
        live &&
        setVanillaState(
          answer.status === 'ready'
            ? { status: 'ready', files: answer.files }
            : { status: 'not_set_up' },
        ),
      () => live && setVanillaState({ status: 'not_set_up' }),
    );
    return () => {
      live = false;
    };
  }, [isClock, vanilla]);

  const shown: Shown[] = useMemo(() => {
    if (!isClock) return [{ id: element.id, data: settledData }];
    const out = new Map<string, Shown>();
    if (vanillaState.status === 'ready') {
      for (const [id, data] of Object.entries(vanillaState.files)) {
        if (timelineOf(data).clock === element.id) out.set(id, { id, data, source: 'Minecraft' });
      }
    }
    for (const timeline of projectTimelines(settledProject)) {
      if (timelineOf(timeline.data as Json).clock === element.id) {
        out.set(timeline.id, {
          id: timeline.id,
          data: timeline.data as Json,
          source: 'your project',
        });
      }
    }
    return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [isClock, element.id, settledData, settledProject, vanillaState]);

  const timelines = useMemo(
    () => shown.map((entry) => ({ ...entry, timeline: timelineOf(entry.data) })),
    [shown],
  );
  const longest = Math.max(1, ...timelines.map((entry) => stripSpan(entry.timeline)));

  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(() => !reducedMotion());
  const [quick, setQuick] = useState(true);
  const perSecond = quick ? longest / QUICK_PERIOD_SECONDS : GAME_TICKS_PER_SECOND;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setNow((old) => wrapTicks(old + (perSecond * PLAY_STEP_MS) / 1000, longest));
    }, PLAY_STEP_MS);
    return () => clearInterval(timer);
  }, [playing, perSecond, longest]);
  const pick = (ticks: number) => {
    setPlaying(false);
    setNow(ticks);
  };

  const table = tableState.status === 'ready' ? tableState.table : null;
  const notes: string[] = [
    'The game blends the values in its own code; the strip follows the schema’s easings, so it is about right.',
  ];
  if (tableState.status === 'error') {
    notes.push(
      `The ${targetId} schema could not be read (${tableState.message}); each value is drawn by its look.`,
    );
  }
  const undrawn = new Set<string>();
  const easings = new Set<string>();
  let relative = false;
  for (const { timeline } of timelines) {
    if (timeline.period === undefined && timeline.tracks.length > 0) {
      notes.push(
        'A timeline without period_ticks does not repeat: it holds its first value before its first keyframe and its last after.',
      );
    }
    for (const row of rowsOf(timeline, table, targetId)) {
      if (row.type === null && row.why !== undefined)
        undrawn.add(`${shortId(row.attribute)}: ${row.why}`);
      if (!row.easingKnown) easings.add(row.easing);
      if (row.track?.modifier !== undefined && row.track.modifier !== 'override') relative = true;
    }
  }
  if (relative)
    notes.push(
      'A track with a modifier changes the value set elsewhere (by the dimension or biome); the strip shows its own keyframes.',
    );
  for (const easing of easings)
    notes.push(`The easing ${easing} is not one the strip knows; drawn linear.`);
  for (const line of undrawn) notes.push(`Not drawn: ${line}.`);

  const namesVanilla = isClock && element.id.startsWith('minecraft:');
  const controls = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Button onClick={() => setPlaying((old) => !old)} aria-pressed={playing}>
        {playing ? 'Pause' : 'Play'}
      </Button>
      <label className="flex items-center gap-1">
        <span>Speed</span>
        <select
          aria-label="Speed"
          value={quick ? 'quick' : 'game'}
          onChange={(event) => setQuick(event.target.value === 'quick')}
          className="rounded border border-border bg-panel px-1 py-0.5"
        >
          <option value="quick">{`One period in ${QUICK_PERIOD_SECONDS} seconds`}</option>
          <option value="game">The game’s speed</option>
        </select>
      </label>
      <label className="flex min-w-40 flex-1 items-center gap-1">
        <span>Time</span>
        <input
          type="range"
          aria-label="Time"
          data-testid="day-scrubber"
          min={0}
          max={Math.max(0, longest - 1)}
          step={1}
          value={Math.round(now) % longest}
          onChange={(event) => pick(Number(event.target.value))}
          className="flex-1"
        />
        <span>{`tick ${Math.round(now) % longest}`}</span>
      </label>
    </div>
  );

  return (
    <LiveViewFrame
      title={isClock ? 'World clock' : 'Day strip'}
      fidelity="about_right"
      notes={[...new Set(notes)]}
      needsSetUp={needsSetUpBanner(
        vanillaState.status === 'not_set_up' ? 'not_set_up' : null,
        namesVanilla,
      )}
      onSetup={onSetup}
      controls={controls}
    >
      {isClock && (
        <p className="text-xs text-muted">
          A world clock has no settings of its own: the timelines tied to it set what changes, and
          their period sets the day’s length.
        </p>
      )}
      {timelines.length === 0 ? (
        <p data-testid="day-no-timelines" className="text-sm text-muted">
          {vanillaState.status === 'loading'
            ? 'Reading the timelines…'
            : `No timeline is tied to ${shortId(element.id)} yet. A timeline names it in its clock.`}
        </p>
      ) : (
        timelines.map((entry) => (
          <TimelineStrip
            key={entry.id}
            id={entry.id}
            timeline={entry.timeline}
            table={table}
            target={targetId}
            now={now}
            onNow={pick}
            showTitle={isClock}
            {...(entry.source !== undefined ? { source: entry.source } : {})}
          />
        ))
      )}
    </LiveViewFrame>
  );
}

/** The day strip of a timeline or world clock (the registry's entry). */
export default function DayStrip(props: LiveViewProps) {
  return <DayStripView {...props} />;
}
