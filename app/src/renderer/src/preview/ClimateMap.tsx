/**
 * The climate map (ADR 0023): a 2D slice through the multi-noise climate space of a dimension
 * or world preset, coloured by the biome that wins at each point. Two parameters span the axes
 * (temperature by humidity by default); sliders fix the other four. Hovering a cell names its
 * biome. Drawn on a 2D canvas, so it works without WebGL. This module loads lazily: it pulls
 * in deepslate's worldgen code through `climate.ts`.
 */

import type { Project } from '@msm/plugin-api';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  biomeColour,
  CLIMATE_PARAMETERS,
  type ClimateParameter,
  type ClimatePoint,
  cellValue,
  climateGrid,
  climateIndex,
  climateSources,
  projectBiomes,
  projectSkyColourAttribute,
} from './climate';

/** Props of {@link ClimateMap}. */
export interface ClimateMapProps {
  project: Project;
  /** The element's identifier, for the label. */
  id: string;
  /** The `minecraft:dimension` or `minecraft:worldgen/world_preset` element data. */
  data: unknown;
}

/** Cells per axis. */
const RESOLUTION = 96;
const RANGE = [-1, 1] as const;
const STEP = 0.05;
const ZERO: ClimatePoint = {
  temperature: 0,
  humidity: 0,
  continentalness: 0,
  erosion: 0,
  depth: 0,
  weirdness: 0,
};

const LABELS: Record<ClimateParameter, string> = {
  temperature: 'Temperature',
  humidity: 'Humidity',
  continentalness: 'Continentalness',
  erosion: 'Erosion',
  depth: 'Depth',
  weirdness: 'Weirdness',
};

const toRgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const format = (value: number): string => value.toFixed(2);

/** Shows where each biome of the selected element sits in climate space. */
export default function ClimateMap({ project, id, data }: ClimateMapProps) {
  const { sources, reason } = useMemo(() => climateSources(data), [data]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [xAxis, setXAxis] = useState<ClimateParameter>('temperature');
  const [yAxis, setYAxis] = useState<ClimateParameter>('humidity');
  const [fixed, setFixed] = useState<ClimatePoint>(ZERO);
  const [hover, setHover] = useState<{ biome: string; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const source = sources[Math.min(sourceIndex, sources.length - 1)];
  const entries = source?.entries;
  const index = useMemo(() => (entries === undefined ? null : climateIndex(entries)), [entries]);
  const cells = useMemo(
    () =>
      index === null
        ? []
        : climateGrid(index, { x: xAxis, y: yAxis, fixed, resolution: RESOLUTION, range: RANGE }),
    [index, xAxis, yAxis, fixed],
  );
  const biomes = useMemo(() => projectBiomes(project), [project]);
  const skyColour = useMemo(() => projectSkyColourAttribute(project), [project]);
  const legend = useMemo(() => {
    const ids = [...new Set(entries?.map((entry) => entry.biome) ?? [])];
    return ids.map((biome) => ({
      biome,
      colour: biomeColour(biome, biomes.get(biome), skyColour),
      inProject: biomes.has(biome),
      shown: cells.includes(biome),
    }));
  }, [entries, biomes, cells, skyColour]);

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context === null || cells.length === 0) return;
    const colours = new Map(legend.map((entry) => [entry.biome, toRgb(entry.colour)]));
    const image = context.createImageData(RESOLUTION, RESOLUTION);
    cells.forEach((biome, i) => {
      const [r, g, b] = colours.get(biome) ?? [0, 0, 0];
      image.data.set([r, g, b, 255], i * 4);
    });
    context.putImageData(image, 0, 0);
  }, [cells, legend]);

  if (source === undefined) {
    return (
      <p role="status" className="text-sm text-muted">
        No climate map for {id}. {reason}
      </p>
    );
  }

  const chooseAxis = (axis: 'x' | 'y', value: ClimateParameter): void => {
    // Picking the other axis's parameter swaps the two.
    if (axis === 'x') {
      if (value === yAxis) setYAxis(xAxis);
      setXAxis(value);
    } else {
      if (value === xAxis) setXAxis(yAxis);
      setYAxis(value);
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const column = Math.floor(((event.clientX - rect.left) / rect.width) * RESOLUTION);
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * RESOLUTION);
    if (column < 0 || row < 0 || column >= RESOLUTION || row >= RESOLUTION) return;
    const biome = cells[row * RESOLUTION + column];
    if (biome === undefined) return;
    setHover({
      biome,
      x: cellValue(column, RESOLUTION, RANGE),
      y: cellValue(RESOLUTION - 1 - row, RESOLUTION, RANGE),
    });
  };

  const others = CLIMATE_PARAMETERS.filter((p) => p !== xAxis && p !== yAxis);

  return (
    <div className="flex flex-col gap-2" data-testid="climate-map">
      {sources.length > 1 ? (
        <label className="flex items-center gap-2 text-sm">
          Dimension
          <select
            className="rounded border border-border bg-bg px-1"
            value={sourceIndex}
            onChange={(event) => setSourceIndex(Number(event.target.value))}
          >
            {sources.map((entry, i) => (
              <option key={entry.dimension ?? i} value={i}>
                {entry.dimension ?? id}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-3 text-sm">
        {(['x', 'y'] as const).map((axis) => (
          <label key={axis} className="flex items-center gap-2">
            {axis === 'x' ? 'Horizontal axis' : 'Vertical axis'}
            <select
              className="rounded border border-border bg-bg px-1"
              value={axis === 'x' ? xAxis : yAxis}
              onChange={(event) => chooseAxis(axis, event.target.value as ClimateParameter)}
            >
              {CLIMATE_PARAMETERS.map((parameter) => (
                <option key={parameter} value={parameter}>
                  {LABELS[parameter]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="relative aspect-square w-full overflow-hidden rounded border border-border">
        <canvas
          ref={canvasRef}
          width={RESOLUTION}
          height={RESOLUTION}
          role="img"
          aria-label={`Climate map of ${source.dimension ?? id}: ${LABELS[xAxis]} from left to right, ${LABELS[yAxis]} from bottom to top, both from ${RANGE[0]} to ${RANGE[1]}.`}
          className="block size-full [image-rendering:pixelated]"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
        />
      </div>
      <p aria-live="polite" className="min-h-5 text-xs text-muted">
        {hover === null
          ? 'Hover the map to see which biome wins there.'
          : `${hover.biome} at ${LABELS[xAxis].toLowerCase()} ${format(hover.x)}, ${LABELS[yAxis].toLowerCase()} ${format(hover.y)}`}
      </p>
      <fieldset className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-xs">
        <legend className="mb-1 text-sm">Fixed parameters</legend>
        {others.map((parameter) => (
          <label key={parameter} className="contents">
            <span>{LABELS[parameter]}</span>
            <input
              type="range"
              min={RANGE[0]}
              max={RANGE[1]}
              step={STEP}
              value={fixed[parameter]}
              onChange={(event) =>
                setFixed((current) => ({ ...current, [parameter]: Number(event.target.value) }))
              }
            />
            <output className="w-10 text-right tabular-nums">{format(fixed[parameter])}</output>
          </label>
        ))}
      </fieldset>
      <ul aria-label="Biomes" className="flex flex-col gap-1 text-xs">
        {legend.map((entry) => (
          <li key={entry.biome} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-3 rounded-sm border border-border"
              style={{ backgroundColor: entry.colour }}
            />
            <span className={entry.shown ? undefined : 'text-muted'}>
              {entry.biome}
              {entry.inProject ? ' (project)' : ''}
              {entry.shown ? '' : ' (not in this slice)'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
