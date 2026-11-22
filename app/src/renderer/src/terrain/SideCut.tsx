/**
 * The side cut of the live world map (ADR 0119 D7; B582): a vertical cut through the world at
 * the view's position, west to east (or north to south), from the world's lowest block to its
 * highest, with the sea level marked. Asked in its own lane, every 4th column first; the old
 * picture stays until the new one comes. Blocks are drawn in MSM's own colours (`colours.ts`).
 */

import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  COARSE_FACTOR,
  type PaletteGrid,
  type SliceRegion,
  type TerrainClient,
  type WorldSummary,
} from './client';
import { blockColour, type Rgb, SKY, UNKNOWN } from './colours';
import { mapKeyHandler } from './controls';
import type { TerrainView } from './view-store';

/** Columns of the cut's picture. */
export const CUT_PIXELS = 256;

/** The cut's height step: one row a block, or every 2nd block in a world over 256 high. */
export function cutYStep(height: number): number {
  return height > 256 ? 2 : 1;
}

/** The cut's region for a view: `axis` `x` runs west to east at the view's Z. */
export function cutRegion(
  view: Pick<TerrainView, 'x' | 'z' | 'zoom'>,
  axis: 'x' | 'z',
  height: number,
): SliceRegion {
  const align = 16 * view.zoom;
  const centre = axis === 'x' ? view.x : view.z;
  const from = Math.floor((centre - (CUT_PIXELS / 2) * view.zoom) / align) * align;
  return {
    axis,
    at: axis === 'x' ? view.z : view.x,
    from,
    to: from + CUT_PIXELS * view.zoom + align,
    step: view.zoom,
    yStep: cutYStep(height),
  };
}

/** A kept cut: its region (with the step it was sampled at) and its blocks. */
export interface CutLayer {
  readonly region: SliceRegion;
  readonly grid: PaletteGrid;
}

/**
 * The cut's RGBA pixels: `CUT_PIXELS` wide, one row per `yStep` blocks from the top of the
 * world down; air is sky, columns the cut has not answered are grey, the sea level a dark line.
 */
export function paintCut(
  layer: CutLayer | null,
  view: Pick<TerrainView, 'x' | 'z' | 'zoom'>,
  axis: 'x' | 'z',
  world: Pick<WorldSummary, 'minY' | 'height' | 'seaLevel'>,
): { pixels: Uint8ClampedArray; width: number; height: number } {
  const yStep = cutYStep(world.height);
  const rows = Math.ceil(world.height / yStep);
  const width = CUT_PIXELS;
  const pixels = new Uint8ClampedArray(width * rows * 4);
  const left = (axis === 'x' ? view.x : view.z) - (CUT_PIXELS / 2) * view.zoom;
  const colours: (Rgb | null)[] = layer?.grid.palette.map((id) => blockColour(id)) ?? [];
  const columns =
    layer === null ? 0 : Math.ceil((layer.region.to - layer.region.from) / layer.region.step);
  const seaRow = Math.floor((world.seaLevel - world.minY) / yStep);
  for (let py = 0; py < rows; py += 1) {
    const row = rows - 1 - py;
    for (let px = 0; px < width; px += 1) {
      const block = left + px * view.zoom + view.zoom / 2;
      let colour: Rgb = UNKNOWN;
      if (layer !== null) {
        const column = Math.floor((block - layer.region.from) / layer.region.step);
        if (column >= 0 && column < columns) {
          const cell = layer.grid.cells[row * columns + column];
          colour = cell === undefined ? UNKNOWN : (colours[cell] ?? SKY);
          if (colour === SKY && row === seaRow) colour = [60, 80, 120];
        }
      }
      const o = (py * width + px) * 4;
      pixels[o] = colour[0];
      pixels[o + 1] = colour[1];
      pixels[o + 2] = colour[2];
      pixels[o + 3] = 255;
    }
  }
  return { pixels, width, height: rows };
}

/** Props of {@link SideCut}. */
export interface SideCutProps {
  client: TerrainClient;
  /** The world in the worker (its hash and summary), or `null` while it is made. */
  world: { readonly hash: string; readonly summary: WorldSummary } | null;
  view: TerrainView;
  onChange(patch: Partial<TerrainView>): void;
}

/** The side cut; see the module comment. */
export default function SideCut({ client, world, view, onChange }: SideCutProps) {
  const [axis, setAxis] = useState<'x' | 'z'>('x');
  const [layer, setLayer] = useState<CutLayer | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hover, setHover] = useState<{ along: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const summary = world?.summary ?? null;
  const hash = world?.hash ?? null;
  const height = summary?.height ?? 256;

  useEffect(() => {
    if (hash === null) return;
    let live = true;
    const region = cutRegion({ x: view.x, z: view.z, zoom: view.zoom }, axis, height);
    setDrawing(true);
    client
      .sample('cut', { type: 'slice', region }, (answer) => {
        if (!live) return;
        const step = answer.pass === 'coarse' ? region.step * COARSE_FACTOR : region.step;
        setLayer({ region: { ...region, step }, grid: answer.data as PaletteGrid });
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
      client.cancel('cut');
    };
  }, [client, hash, view.x, view.z, view.zoom, axis, height]);

  const picture = useMemo(
    () => (summary === null ? null : paintCut(layer, view, axis, summary)),
    [layer, view, axis, summary],
  );
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context === null || picture === null) return;
    const image = context.createImageData(picture.width, picture.height);
    image.data.set(picture.pixels);
    context.putImageData(image, 0, 0);
  }, [picture]);

  if (summary === null || picture === null) {
    return (
      <p role="status" className="text-sm text-muted">
        Drawing…
      </p>
    );
  }
  const top = summary.minY + summary.height - 1;
  const at = axis === 'x' ? `Z ${view.z}` : `X ${view.x}`;
  const blockAt = (event: PointerEvent<HTMLCanvasElement>): { along: number; y: number } | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const px = ((event.clientX - rect.left) / rect.width) * picture.width;
    const py = ((event.clientY - rect.top) / rect.height) * picture.height;
    const left = (axis === 'x' ? view.x : view.z) - (CUT_PIXELS / 2) * view.zoom;
    return {
      along: Math.floor(left + px * view.zoom),
      y: Math.floor(top + 1 - (py + 1) * cutYStep(summary.height)),
    };
  };
  const hoveredBlock = (() => {
    if (hover === null || layer === null) return null;
    const columns = Math.ceil((layer.region.to - layer.region.from) / layer.region.step);
    const column = Math.floor((hover.along - layer.region.from) / layer.region.step);
    const row = Math.floor((hover.y - summary.minY) / layer.region.yStep);
    if (column < 0 || column >= columns || row < 0) return null;
    const cell = layer.grid.cells[row * columns + column];
    return cell === undefined ? null : (layer.grid.palette[cell] ?? null);
  })();

  return (
    <div className="flex flex-col gap-2" data-testid="terrain-side-cut">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          Cut
          <select
            data-testid="terrain-cut-axis"
            className="rounded border border-border bg-bg px-1"
            value={axis}
            onChange={(event) => setAxis(event.target.value === 'z' ? 'z' : 'x')}
          >
            <option value="x">West to east</option>
            <option value="z">North to south</option>
          </select>
        </label>
        <span className="text-xs text-muted">{`at ${at}`}</span>
        {drawing ? (
          <span role="status" className="text-xs text-muted" data-testid="terrain-cut-drawing">
            Drawing…
          </span>
        ) : null}
      </div>
      <div className="flex gap-1">
        <div className="flex flex-col justify-between text-[10px] text-muted tabular-nums">
          <span>{`y ${top}`}</span>
          <span>{`y ${summary.minY}`}</span>
        </div>
        <div className="relative w-full overflow-hidden rounded border border-border">
          <canvas
            ref={canvasRef}
            data-testid="terrain-cut"
            width={picture.width}
            height={picture.height}
            tabIndex={0}
            role="img"
            aria-label={`Side cut ${axis === 'x' ? 'west to east' : 'north to south'} at ${at}, from y ${summary.minY} to y ${top}; the dark line is the sea level, y ${summary.seaLevel}. Arrow keys move, + and - zoom.`}
            className="block w-full [image-rendering:pixelated] focus-visible:outline focus-visible:outline-accent"
            onKeyDown={mapKeyHandler(view, onChange)}
            onPointerMove={(event) => setHover(blockAt(event))}
            onPointerLeave={() => setHover(null)}
          />
        </div>
      </div>
      <p
        aria-live="polite"
        className="min-h-5 text-xs text-muted [overflow-wrap:anywhere]"
        data-testid="terrain-cut-hover"
      >
        {hover === null
          ? `The lowest block is y ${summary.minY}, the highest y ${top}; the sea is at y ${summary.seaLevel}.`
          : `${axis === 'x' ? `X ${hover.along}, Z ${view.z}` : `X ${view.x}, Z ${hover.along}`}, y ${hover.y}${
              hoveredBlock === null ? '' : `: ${hoveredBlock}`
            }`}
      </p>
    </div>
  );
}
