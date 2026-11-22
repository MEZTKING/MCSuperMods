/**
 * The **Value map** of a density function or a noise (ADR 0119 D7; B585): the value the engine
 * works out from the project's files, as a slice **From above** at a chosen height or a **Side
 * cut**, in a colour ramp (blue below 0, orange above), with the value under the mouse and the
 * lowest and highest value in view.
 *
 * - A noise is drawn alone (`minecraft:noise` at a scale of 1). A density function is drawn in a
 *   world that uses it (**Seen in**: a project dimension whose files lead to it, so the world's
 *   own seed and noises apply) or on its own, in a plain world made in memory whose final density
 *   is the function, so the engine names any part it cannot work out.
 * - Live as the map: the files 150 ms after the last edit, then a coarse pass and a fine one in
 *   the lane `values`. The seed and position are the project's view, shared with the map.
 */

import type { Element, Project } from '@msm/plugin-api';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { TryItWorldsPlatform } from '../../../shared/platform';
import {
  COARSE_FACTOR,
  type MapRegion,
  type SliceRegion,
  type TerrainAnswer,
  type WorldgenFileMap,
} from './client';
import type { Rgb } from './colours';
import {
  mapKeyHandler,
  PositionControls,
  PreviewTag,
  SeedControls,
  SetUpBanner,
  TerrainNotes,
} from './controls';
import type { TerrainFilesState } from './files';
import { folderOfKind, type HostElement, hostsFor, withNamespace } from './hosts';
import { cutYStep } from './SideCut';
import {
  partLines,
  useProjectView,
  useTerrainSnapshot,
  useVanillaRefresh,
  useViewWorld,
  type ViewWorldSpec,
  valueWorld,
} from './views';
import {
  MAP_PIXELS,
  missesVanillaFile,
  type TerrainSessionHandle,
  unsupportedLine,
} from './WorldMap';

/** One world a value can be drawn in. */
export interface ValueHost {
  readonly key: string;
  readonly label: string;
  readonly spec: ViewWorldSpec;
  /** The function the engine samples (an id, or inline JSON). */
  readonly fn: unknown;
}

/** The function a value map samples for an element: a density function by id, a noise inline. */
export function valueFn(element: Pick<HostElement, 'kind' | 'id'>): unknown {
  const id = withNamespace(element.id);
  if (folderOfKind(element.kind) === 'worldgen/noise') {
    return { type: 'minecraft:noise', noise: id, xz_scale: 1, y_scale: 1 };
  }
  return id;
}

/** The worlds a value can be drawn in: project worlds that use it, then on its own. */
export function valueHosts(
  element: HostElement,
  project: WorldgenFileMap,
  vanilla: WorldgenFileMap | null,
): ValueHost[] {
  const fn = valueFn(element);
  const out: ValueHost[] = [];
  if (folderOfKind(element.kind) === 'worldgen/density_function') {
    for (const host of hostsFor(element, project, vanilla)) {
      if (host.plain) continue;
      out.push({ key: host.key, label: host.label, spec: { extra: {}, source: host.source }, fn });
    }
  }
  out.push({ key: 'plain', label: 'On its own', spec: valueWorld(fn), fn });
  return out;
}

/** What the value map shows. */
export type ValueMode = 'above' | 'cut';

const MODE_LABELS: Record<ValueMode, string> = { above: 'From above', cut: 'Side cut' };

/** The region of the slice from above: the view's square at `y`, one sample a pixel. */
export function aboveRegion(view: { x: number; z: number; zoom: number }, y: number): MapRegion {
  const half = (MAP_PIXELS / 2) * view.zoom;
  return {
    x0: view.x - half,
    z0: view.z - half,
    width: MAP_PIXELS * view.zoom,
    depth: MAP_PIXELS * view.zoom,
    step: view.zoom,
    y,
  };
}

/** The side cut's region: west to east through the view's Z, the world's whole height. */
export function cutValueRegion(
  view: { x: number; z: number; zoom: number },
  height: number,
): SliceRegion {
  const half = (MAP_PIXELS / 2) * view.zoom;
  return {
    axis: 'x',
    at: view.z,
    from: view.x - half,
    to: view.x + half,
    step: view.zoom,
    yStep: cutYStep(height),
  };
}

/** The lowest and highest finite value, and the scale the ramp spans (at least 1e-6). */
export function valueRange(values: Float32Array): { min: number; max: number; scale: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min > max) return { min: 0, max: 0, scale: 1 };
  return { min, max, scale: Math.max(Math.abs(min), Math.abs(max), 1e-6) };
}

const BELOW: Rgb = [40, 90, 200];
const ZERO: Rgb = [245, 245, 240];
const ABOVE: Rgb = [205, 105, 30];

/** A value's colour: blue below 0, near white at 0, orange above, by `value / scale`. */
export function valueColour(value: number, scale: number): Rgb {
  if (!Number.isFinite(value)) return [128, 128, 128];
  const t = Math.max(-1, Math.min(1, value / scale));
  const to = t < 0 ? BELOW : ABOVE;
  const a = Math.abs(t);
  return [
    Math.round(ZERO[0] + (to[0] - ZERO[0]) * a),
    Math.round(ZERO[1] + (to[1] - ZERO[1]) * a),
    Math.round(ZERO[2] + (to[2] - ZERO[2]) * a),
  ];
}

/** A grid of values as the view keeps it (from above: `rows` along Z; a cut: rows from `minY`). */
export interface ValueLayer {
  readonly mode: ValueMode;
  readonly world: string;
  readonly pass: 'coarse' | 'fine';
  /** The first sample's block along X, and along Z (from above) or y (a cut). */
  readonly x0: number;
  readonly second0: number;
  readonly step: number;
  /** Blocks between rows (a cut's `yStep`; from above the same as `step`). */
  readonly rowStep: number;
  readonly columns: number;
  readonly rows: number;
  readonly values: Float32Array;
}

/** The sample of a layer at block `(x, second)`, or `undefined` outside it. */
export function valueAt(layer: ValueLayer, x: number, second: number): number | undefined {
  const column = Math.floor((x - layer.x0) / layer.step);
  const row = Math.floor((second - layer.second0) / layer.rowStep);
  if (column < 0 || row < 0 || column >= layer.columns || row >= layer.rows) return undefined;
  return layer.values[row * layer.columns + column];
}

/**
 * The picture's RGBA pixels: `width` by `height`, pixel `(px, py)` showing the block
 * `(left + px * zoom, top ± py * rowZoom)` (a cut runs from the top of the world down).
 */
export function paintValues(
  layer: ValueLayer | null,
  frame: {
    readonly left: number;
    readonly top: number;
    readonly zoom: number;
    readonly rowZoom: number;
    readonly width: number;
    readonly height: number;
    readonly downwards: boolean;
  },
  scale: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let py = 0; py < frame.height; py += 1) {
    const second = frame.downwards
      ? frame.top - py * frame.rowZoom
      : frame.top + py * frame.rowZoom + frame.rowZoom / 2;
    for (let px = 0; px < frame.width; px += 1) {
      const x = frame.left + px * frame.zoom + frame.zoom / 2;
      const value = layer === null ? undefined : valueAt(layer, x, second);
      const colour: Rgb = value === undefined ? [128, 128, 128] : valueColour(value, scale);
      const o = (py * frame.width + px) * 4;
      out[o] = colour[0];
      out[o + 1] = colour[1];
      out[o + 2] = colour[2];
      out[o + 3] = 255;
    }
  }
  return out;
}

/** A number for people: up to four significant digits. */
export function showValue(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return Number(value.toPrecision(4)).toString();
}

/** Notes of a value map: how it was worked out and what was left out. */
export function valueNotes(input: {
  readonly element: Pick<HostElement, 'kind'>;
  readonly host: ValueHost;
  readonly unsupported: Parameters<typeof partLines>[0];
  readonly problems: TerrainFilesState['problems'];
}): string[] {
  const lines = ['Worked out from your files as the game does it, at the seed above.'];
  if (folderOfKind(input.element.kind) === 'worldgen/noise') {
    lines.push('The noise alone, at a scale of 1 on every axis.');
  } else if (input.host.key === 'plain') {
    lines.push(
      "On its own: what it reads (another function, a noise) comes from your files and the game's.",
    );
  } else {
    lines.push(`Seen in ${input.host.label}: its seed and noises are that world's.`);
  }
  lines.push(...partLines(input.unsupported, unsupportedLine));
  for (const problem of input.problems) {
    lines.push(`${problem.elementId} could not be read, so it is left out: ${problem.message}`);
  }
  lines.push('Blue is below 0 and orange above; in a final density, above 0 is solid ground.');
  return [...new Set(lines)];
}

/** Props of {@link ValueMap}. */
export interface ValueMapProps {
  terrain: TerrainSessionHandle;
  root: string | null;
  project: Project;
  element: Element;
  vanillaReady: boolean;
  onSetup(): void;
  worlds?: TryItWorldsPlatform | null;
}

/** The value map; see the module comment. */
export default function ValueMap(props: ValueMapProps) {
  const { terrain, project, element } = props;
  const client = terrain.client;
  const snapshot = useTerrainSnapshot(terrain);
  const state = snapshot.state;
  const { view, setView } = useProjectView(props.root, project.name);
  useVanillaRefresh(terrain.files, props.vanillaReady, state?.needsSetUp === true);

  const hosts = useMemo(
    () => (state === null ? [] : valueHosts(element, state.project, state.vanilla)),
    [element, state],
  );
  const [hostKey, setHostKey] = useState<string | null>(null);
  const host = hosts.find((h) => h.key === hostKey) ?? hosts[0];
  const { world, error } = useViewWorld(client, state, host?.spec ?? null, view?.seed ?? null);
  const banner = state?.needsSetUp === true && missesVanillaFile(world?.summary ?? null);

  const [mode, setMode] = useState<ValueMode>('above');
  const [y, setY] = useState(64);
  const [layer, setLayer] = useState<ValueLayer | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawn, setDrawn] = useState(0);
  const summary = world?.summary ?? null;
  const height = summary?.height ?? 384;
  const minY = summary?.minY ?? -64;
  const sliceY = Math.max(minY, Math.min(minY + height - 1, y));
  const viewX = view?.x ?? 0;
  const viewZ = view?.z ?? 0;
  const zoom = view?.zoom ?? 4;
  const hash = world?.hash ?? null;
  const fn = host?.fn;
  const fnKey = JSON.stringify(fn ?? null);

  useEffect(() => {
    if (hash === null || banner || fn === undefined) {
      client.cancel('values');
      setDrawing(false);
      return;
    }
    let live = true;
    const at = { x: viewX, z: viewZ, zoom };
    const above = mode === 'above';
    const region = above ? aboveRegion(at, sliceY) : cutValueRegion(at, height);
    setDrawing(true);
    client
      .sample('values', { type: 'values', region, fn }, (answer: TerrainAnswer) => {
        if (!live) return;
        const step = answer.pass === 'coarse' ? region.step * COARSE_FACTOR : region.step;
        const span = 'axis' in region ? region.to - region.from : (region as MapRegion).width;
        const columns = Math.ceil(span / step);
        const rows = above
          ? Math.ceil((region as MapRegion).depth / step)
          : Math.ceil(height / (region as SliceRegion).yStep);
        setLayer({
          mode,
          world: hash,
          pass: answer.pass,
          x0: 'axis' in region ? region.from : region.x0,
          second0: 'axis' in region ? minY : region.z0,
          step,
          rowStep: 'axis' in region ? region.yStep : step,
          columns,
          rows,
          values: answer.data as Float32Array,
        });
        setDrawn((n) => n + 1);
      })
      .then(
        (final) => {
          if (live && final !== null) setDrawing(false);
        },
        () => {
          if (live) setDrawing(false);
        },
      );
    return () => {
      live = false;
      client.cancel('values');
    };
    // `fn` is followed through its text (`fnKey`): a new object of the same function asks nothing.
  }, [client, hash, banner, fnKey, mode, sliceY, viewX, viewZ, zoom, height, minY]);

  const shownLayer = layer !== null && layer.mode === mode ? layer : null;
  const range = useMemo(
    () => (shownLayer === null ? null : valueRange(shownLayer.values)),
    [shownLayer],
  );
  const rows = mode === 'above' ? MAP_PIXELS : Math.ceil(height / cutYStep(height));
  const frame = useMemo(() => {
    const half = (MAP_PIXELS / 2) * zoom;
    return mode === 'above'
      ? {
          left: viewX - half,
          top: viewZ - half,
          zoom,
          rowZoom: zoom,
          width: MAP_PIXELS,
          height: MAP_PIXELS,
          downwards: false,
        }
      : {
          left: viewX - half,
          top: minY + height - 1,
          zoom,
          rowZoom: cutYStep(height),
          width: MAP_PIXELS,
          height: rows,
          downwards: true,
        };
  }, [mode, viewX, viewZ, zoom, minY, height, rows]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context === null) return;
    const pixels = paintValues(shownLayer, frame, range?.scale ?? 1);
    const image = context.createImageData(frame.width, frame.height);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
  }, [shownLayer, frame, range]);

  const [hover, setHover] = useState<{ x: number; second: number } | null>(null);
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = ((event.clientX - rect.left) / rect.width) * frame.width;
    const py = ((event.clientY - rect.top) / rect.height) * frame.height;
    setHover({
      x: Math.floor(frame.left + px * frame.zoom),
      second: Math.floor(
        frame.downwards ? frame.top - Math.floor(py) * frame.rowZoom : frame.top + py * frame.zoom,
      ),
    });
  };
  const hovered =
    hover === null || shownLayer === null ? undefined : valueAt(shownLayer, hover.x, hover.second);

  if (snapshot.error !== null && state === null) {
    return (
      <p role="status" className="text-sm text-error">
        {`The value map could not read the project's files: ${snapshot.error}`}
      </p>
    );
  }
  if (state === null || view === null || host === undefined) {
    return (
      <p role="status" className="text-sm text-muted">
        Reading the world's files…
      </p>
    );
  }
  const notes = valueNotes({
    element,
    host,
    unsupported: summary?.unsupported ?? [],
    problems: state.problems,
  });
  const top = minY + height - 1;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="value-map">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Value map" className="flex flex-wrap gap-1">
          {(['above', 'cut'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={entry === mode}
              data-testid={`terrain-value-mode-${entry}`}
              className={`rounded border px-2 py-0.5 text-sm ${
                entry === mode ? 'border-accent text-text' : 'border-border text-muted'
              }`}
              onClick={() => setMode(entry)}
            >
              {MODE_LABELS[entry]}
            </button>
          ))}
        </div>
        <PreviewTag />
        {drawing && !banner ? (
          <span role="status" className="text-xs text-muted" data-testid="terrain-drawing">
            Drawing…
          </span>
        ) : null}
      </div>
      {hosts.length > 1 ? (
        <label className="flex items-center gap-2 text-sm">
          Seen in
          <select
            data-testid="terrain-host"
            className="max-w-full rounded border border-border bg-bg px-1"
            value={host.key}
            onChange={(event) => setHostKey(event.target.value)}
          >
            {hosts.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <SeedControls
        seed={view.seed}
        seedNumber={summary?.seed ?? null}
        onSeed={(next) => setView({ seed: next })}
        {...(props.worlds === undefined ? {} : { worlds: props.worlds })}
      />
      <PositionControls view={view} onChange={setView} />
      {mode === 'above' ? (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Height
          <input
            type="range"
            data-testid="terrain-value-y"
            min={minY}
            max={top}
            value={sliceY}
            onChange={(event) => setY(Number(event.target.value))}
            className="min-w-0 flex-1"
          />
          <span className="tabular-nums text-xs text-muted">{`y ${sliceY}`}</span>
        </label>
      ) : null}
      {banner ? (
        <SetUpBanner onSetup={props.onSetup} />
      ) : error !== null ? (
        <p role="status" className="text-sm text-error" data-testid="terrain-error">
          {`The value map could not be drawn: ${error}`}
        </p>
      ) : (
        <>
          <div className="relative w-full overflow-hidden rounded border border-border">
            <canvas
              ref={canvasRef}
              data-testid="terrain-value"
              width={frame.width}
              height={frame.height}
              tabIndex={0}
              role="img"
              aria-label={
                mode === 'above'
                  ? `Value map from above at y ${sliceY} around X ${view.x}, Z ${view.z}, ${view.zoom} blocks a pixel. Arrow keys move, + and - zoom.`
                  : `Value map as a side cut west to east at Z ${view.z}, from y ${minY} to y ${top}. Arrow keys move, + and - zoom.`
              }
              className="block w-full [image-rendering:pixelated] focus-visible:outline focus-visible:outline-accent"
              onKeyDown={mapKeyHandler(view, setView)}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHover(null)}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="tabular-nums">{`-${showValue(range?.scale ?? 1)}`}</span>
            <span
              aria-hidden="true"
              className="h-2 flex-1 rounded"
              style={{
                background:
                  'linear-gradient(to right, rgb(40,90,200), rgb(245,245,240), rgb(205,105,30))',
              }}
            />
            <span className="tabular-nums">{`+${showValue(range?.scale ?? 1)}`}</span>
          </div>
          <p className="text-xs text-muted" data-testid="terrain-value-range">
            {range === null
              ? 'Working the values out…'
              : `In view: lowest ${showValue(range.min)}, highest ${showValue(range.max)}.`}
          </p>
          <p
            aria-live="polite"
            className="min-h-5 text-xs text-muted [overflow-wrap:anywhere]"
            data-testid="terrain-value-hover"
          >
            {hover === null
              ? 'Hover the map to see the value there.'
              : `${
                  mode === 'above'
                    ? `X ${hover.x}, Z ${hover.second}, y ${sliceY}`
                    : `X ${hover.x}, Z ${view.z}, y ${hover.second}`
                }${hovered === undefined ? '' : `: ${showValue(hovered)}`}`}
          </p>
        </>
      )}
      <TerrainNotes lines={notes} />
      <output
        className="sr-only"
        data-testid="terrain-value-state"
        data-mode={mode}
        data-world={hash ?? ''}
        data-pass={shownLayer?.pass ?? ''}
        data-drawn={drawn}
        data-drawing={drawing ? 'yes' : 'no'}
        data-banner={banner ? 'yes' : 'no'}
      >
        {`${MODE_LABELS[mode]}; ${drawing ? 'drawing' : 'drawn'}`}
      </output>
    </div>
  );
}
