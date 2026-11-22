/**
 * The **Scatter** (ADR 0119 D7; B585): a patch of flat land (3 by 3 chunks) seen from above or
 * from the side, with a feature placed into it by the engine's features stage. What the features
 * placed is lit, the land is dimmed. "About right" (limit WL3): the engine places by the data's
 * own placement rules with MSM's own shapes and random numbers.
 *
 * - **Placed feature:** placed by its own rules, in a biome of the plain world's own that lists it.
 * - **Feature:** a feature alone has no placement; it is placed a few times a chunk, on the
 *   surface (or, for ores, anywhere in the stone), and the notes say so.
 * - **Block state provider:** a strip of sample picks: a block set on the grass a few times a
 *   chunk, and each block's share of the picks.
 * - **Biome addition** (`msm:biome_addition`): flat land in the first of its biomes the files
 *   have (with that biome's own features), the addition **On** or **Off**; without such a biome,
 *   a plain biome of the preview's own.
 *
 * The land is a plain world made in memory (`views.ts`): grass over dirt over stone, its top at
 * y 63, needing no file of the game's. Live as the map: the files 150 ms after an edit, then the
 * patch's land and its features in two lanes.
 */

import type { Element, Project } from '@msm/plugin-api';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { TryItWorldsPlatform } from '../../../shared/platform';
import type { ColumnsData, ColumnWindow, Unsupported } from './client';
import { blockColour, dim, type Rgb, SKY } from './colours';
import { PositionControls, PreviewTag, SeedControls, SetUpBanner, TerrainNotes } from './controls';
import { ADDITIONS_FOLDER, type TerrainFilesState } from './files';
import { folderOfKind, type HostElement, withNamespace } from './hosts';
import {
  biomeListing,
  biomesNamed,
  DEFAULT_FEATURE_STEPS,
  FLAT_TOP_Y,
  featureTypeOf,
  fileIn,
  PLAIN_MIN_Y,
  PLAIN_SCATTER_ID,
  partLines,
  placementForLoneFeature,
  scatterWorld,
  stepForType,
  useProjectView,
  useTerrainSnapshot,
  useVanillaRefresh,
  useViewWorld,
  type ViewWorldSpec,
} from './views';
import { missesVanillaFile, type TerrainSessionHandle, unsupportedLine } from './WorldMap';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The patch: 3 by 3 chunks. */
export const PATCH_BLOCKS = 48;

/** The patch's height: from the plain world's floor to y 127 (room for the tallest trees). */
export const PATCH_HEIGHT = 192;

/** The kind id of biome additions. */
export const BIOME_ADDITION_KIND = 'msm:biome_addition';

/** How a Scatter is set up for an element. */
export interface ScatterPlan {
  readonly spec: ViewWorldSpec;
  /** Plain words: what land, what biome, how it is placed. */
  readonly words: readonly string[];
  /** True for a block state provider: the view shows the picks. */
  readonly picks: boolean;
  /** For a biome addition: its id (the On or Off switch is shown). */
  readonly addition: string | null;
}

/** The step names of the target, or `msm:biome_addition`'s own. */
function stepsOf(state: Pick<TerrainFilesState, 'facts'>): readonly string[] {
  return state.facts.featureSteps ?? DEFAULT_FEATURE_STEPS;
}

/** A plain biome of the preview's own listing `features` in `step`. */
function ownBiome(
  state: Pick<TerrainFilesState, 'facts'>,
  step: string,
  features: readonly string[],
): Json {
  return biomeListing(stepsOf(state), step, features);
}

/**
 * How the Scatter of `element` is made, or `null` for a kind it does not draw.
 *
 * @param additionOn - For a biome addition: draw it with the addition (else without).
 */
export function scatterPlan(
  element: HostElement,
  state: Pick<TerrainFilesState, 'project' | 'vanilla' | 'facts'>,
  additionOn = true,
): ScatterPlan | null {
  const id = withNamespace(element.id);
  const file = fileIn(state);
  const land = `Flat land of grass over dirt and stone, its top at y ${FLAT_TOP_Y}`;
  switch (folderOfKind(element.kind)) {
    case 'worldgen/placed_feature': {
      const placed = file('worldgen/placed_feature', id) ?? element.data;
      const type = featureTypeOf(isObject(placed) ? placed.feature : undefined, file);
      return {
        spec: scatterWorld(PLAIN_SCATTER_ID, ownBiome(state, stepForType(type), [id])),
        words: [
          `${land}, in a plain biome that lists this feature. It is placed by its own rules.`,
        ],
        picks: false,
        addition: null,
      };
    }
    case 'worldgen/feature': {
      const feature = file('worldgen/feature', id) ?? element.data;
      const type = featureTypeOf(feature, file);
      const lone = placementForLoneFeature(type);
      return {
        spec: scatterWorld(
          PLAIN_SCATTER_ID,
          ownBiome(state, stepForType(type), [PLAIN_SCATTER_ID]),
          {
            'worldgen/placed_feature': {
              [PLAIN_SCATTER_ID]: { feature: id, placement: lone.placement },
            },
          },
        ),
        words: [
          `${land}. A feature alone has no placement of its own: here it is placed ${lone.words}. A placed feature says where it goes.`,
        ],
        picks: false,
        addition: null,
      };
    }
    case 'worldgen/block_state_provider':
      return {
        spec: scatterWorld(
          PLAIN_SCATTER_ID,
          ownBiome(state, 'vegetal_decoration', [PLAIN_SCATTER_ID]),
          {
            'worldgen/feature': {
              [PLAIN_SCATTER_ID]: { type: 'minecraft:simple_block', to_place: id },
            },
            'worldgen/placed_feature': {
              [PLAIN_SCATTER_ID]: {
                feature: PLAIN_SCATTER_ID,
                placement: [
                  { type: 'minecraft:count', count: 16 },
                  { type: 'minecraft:in_square' },
                  { type: 'minecraft:heightmap', heightmap: 'WORLD_SURFACE_WG' },
                ],
              },
            },
          },
        ),
        words: [
          `${land}. The provider picks a block sixteen times a chunk, each set on the grass.`,
        ],
        picks: true,
        addition: null,
      };
    case BIOME_ADDITION_KIND: {
      const json = state.project[ADDITIONS_FOLDER]?.[id] ?? element.data;
      const named = biomesNamed(isObject(json) ? json.biomes : undefined, file);
      const biome = named.find((b) => file('worldgen/biome', b) !== undefined) ?? null;
      const features = isObject(json) && Array.isArray(json.features) ? json.features : [];
      const words: string[] = [];
      if (features.length === 0) {
        words.push('This addition adds no features. The mobs it adds do not show in the preview.');
      }
      if (biome !== null) {
        words.push(
          `${land}, in ${biome} (one of its biomes), with that biome's own features. The addition is ${additionOn ? 'on' : 'off'}.`,
        );
        return {
          spec: {
            ...scatterWorld(biome, null),
            ...(additionOn ? {} : { without: { [ADDITIONS_FOLDER]: [id] } }),
          },
          words,
          picks: false,
          addition: id,
        };
      }
      words.push(
        named.length === 0
          ? `${land}, in a plain biome: the addition names no biome yet. The addition is ${additionOn ? 'on' : 'off'}.`
          : `${land}, in a plain biome: ${named.slice(0, 3).join(', ')} ${named.length === 1 ? 'is' : 'are'} not in the files here. The addition is ${additionOn ? 'on' : 'off'}.`,
      );
      const own = ownBiome(state, 'vegetal_decoration', []);
      const spec = scatterWorld(
        PLAIN_SCATTER_ID,
        own,
        additionOn && isObject(json)
          ? { [ADDITIONS_FOLDER]: { [id]: { ...json, biomes: [PLAIN_SCATTER_ID] } } }
          : {},
      );
      return {
        spec: additionOn ? spec : { ...spec, without: { [ADDITIONS_FOLDER]: [id] } },
        words,
        picks: false,
        addition: id,
      };
    }
    default:
      return null;
  }
}

/** The patch around the view's position: whole chunks, from the plain world's floor. */
export function patchWindow(view: { x: number; z: number }): ColumnWindow {
  return {
    x0: Math.floor(view.x / 16) * 16 - 16,
    z0: Math.floor(view.z / 16) * 16 - 16,
    y0: PLAIN_MIN_Y,
    sizeX: PATCH_BLOCKS,
    sizeY: PATCH_HEIGHT,
    sizeZ: PATCH_BLOCKS,
  };
}

/** What the features placed in the patch, worked out from the land and the land with features. */
export interface ScatterResult {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  /** Per column (`z * sizeX + x`): the highest placed block, or `null`. */
  readonly placedTop: readonly (string | null)[];
  /** Per column: the highest block that is not air. */
  readonly top: readonly (string | null)[];
  /** Blocks that differ from the land. */
  readonly placed: number;
  /** Columns with a placed block. */
  readonly columns: number;
  /** Chunks of the patch (of 9) with a placed block. */
  readonly chunks: number;
  /** The lowest and highest placed y (window rows), or `null`. */
  readonly rows: { readonly low: number; readonly high: number } | null;
  /** Blocks placed on top of the land (y 64), by name, most first (the provider's picks). */
  readonly picks: readonly { readonly block: string; readonly count: number }[];
  /** The first picks in the patch, west to east then north to south. */
  readonly strip: readonly string[];
  /** The block at `(x, y, z)` of the land with features (window coordinates). */
  blockAt(x: number, y: number, z: number): string;
  /** Whether the block at `(x, y, z)` was placed by the features. */
  placedAt(x: number, y: number, z: number): boolean;
}

const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/** Compares the land with the land and features; see {@link ScatterResult}. */
export function readScatter(land: ColumnsData, features: ColumnsData): ScatterResult {
  const { x: sizeX, y: sizeY, z: sizeZ } = features.size;
  const index = (x: number, y: number, z: number) => (y * sizeZ + z) * sizeX + x;
  const name = (data: ColumnsData, i: number) =>
    data.palette[data.blocks[i] ?? 0] ?? 'minecraft:air';
  const sameSize = land.size.x === sizeX && land.size.y === sizeY && land.size.z === sizeZ;
  const placedAt = (x: number, y: number, z: number): boolean => {
    const i = index(x, y, z);
    return sameSize && name(features, i) !== name(land, i);
  };
  const placedTop: (string | null)[] = [];
  const top: (string | null)[] = [];
  const chunkHit = new Set<number>();
  const picks = new Map<string, number>();
  const strip: string[] = [];
  let placed = 0;
  let columns = 0;
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  const surfaceRow = FLAT_TOP_Y + 1 - PLAIN_MIN_Y;
  for (let z = 0; z < sizeZ; z += 1) {
    for (let x = 0; x < sizeX; x += 1) {
      let topPlaced: string | null = null;
      let topBlock: string | null = null;
      let any = false;
      for (let y = sizeY - 1; y >= 0; y -= 1) {
        const block = name(features, index(x, y, z));
        if (topBlock === null && !AIR.has(block)) topBlock = block;
        if (!placedAt(x, y, z)) continue;
        placed += 1;
        any = true;
        if (topPlaced === null) topPlaced = block;
        if (y < low) low = y;
        if (y > high) high = y;
        if (y === surfaceRow && !AIR.has(block)) {
          picks.set(block, (picks.get(block) ?? 0) + 1);
        }
      }
      placedTop.push(topPlaced);
      top.push(topBlock);
      if (any) {
        columns += 1;
        chunkHit.add(Math.floor(x / 16) + 3 * Math.floor(z / 16));
      }
    }
  }
  for (let x = 0; x < sizeX && strip.length < 24; x += 1) {
    for (let z = 0; z < sizeZ && strip.length < 24; z += 1) {
      if (placedAt(x, surfaceRow, z)) strip.push(name(features, index(x, surfaceRow, z)));
    }
  }
  return {
    sizeX,
    sizeY,
    sizeZ,
    placedTop,
    top,
    placed,
    columns,
    chunks: chunkHit.size,
    rows: placed === 0 ? null : { low, high },
    picks: [...picks].map(([block, count]) => ({ block, count })).sort((a, b) => b.count - a.count),
    strip,
    blockAt: (x, y, z) => name(features, index(x, y, z)),
    placedAt,
  };
}

/** The patch from above: one pixel a column, placed blocks lit, the land dimmed. */
export function paintAbove(result: ScatterResult): Uint8ClampedArray {
  const out = new Uint8ClampedArray(result.sizeX * result.sizeZ * 4);
  for (let i = 0; i < result.sizeX * result.sizeZ; i += 1) {
    const placed = result.placedTop[i] ?? null;
    const top = result.top[i] ?? null;
    const colour: Rgb =
      placed !== null
        ? (blockColour(placed, 'top') ?? SKY)
        : top === null
          ? SKY
          : dim(blockColour(top, 'top') ?? SKY, 0.55);
    out[i * 4] = colour[0];
    out[i * 4 + 1] = colour[1];
    out[i * 4 + 2] = colour[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** The rows the side view shows: around what was placed, at least y 56 to 80. */
export function sideRows(result: ScatterResult): { low: number; high: number } {
  const surface = FLAT_TOP_Y - PLAIN_MIN_Y;
  const low = Math.max(0, Math.min(surface - 7, (result.rows?.low ?? surface) - 2));
  const high = Math.min(
    result.sizeY - 1,
    Math.max(surface + 17, (result.rows?.high ?? surface) + 2),
  );
  return { low, high };
}

/**
 * The patch from the south: for each column across and each height, the first placed block
 * along the patch's depth (lit), else the block in the middle of the patch (dimmed).
 */
export function paintSide(result: ScatterResult): {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  low: number;
  high: number;
} {
  const { low, high } = sideRows(result);
  const height = high - low + 1;
  const width = result.sizeX;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const middle = Math.floor(result.sizeZ / 2);
  for (let row = 0; row < height; row += 1) {
    const y = high - row;
    for (let x = 0; x < width; x += 1) {
      let colour: Rgb | null = null;
      for (let z = 0; z < result.sizeZ; z += 1) {
        if (result.placedAt(x, y, z)) {
          colour = blockColour(result.blockAt(x, y, z)) ?? SKY;
          break;
        }
      }
      if (colour === null) {
        const block = blockColour(result.blockAt(x, y, middle));
        colour = block === null ? SKY : dim(block, 0.55);
      }
      const o = (row * width + x) * 4;
      pixels[o] = colour[0];
      pixels[o + 1] = colour[1];
      pixels[o + 2] = colour[2];
      pixels[o + 3] = 255;
    }
  }
  return { pixels, width, height, low: low + PLAIN_MIN_Y, high: high + PLAIN_MIN_Y };
}

/** The line under the patch: what was placed, in plain words. */
export function countLine(result: ScatterResult | null, picks: boolean): string {
  if (result === null) return 'Placing…';
  if (result.placed === 0) {
    return picks
      ? 'Nothing was picked in this patch: the provider may give only air here.'
      : 'Nothing was placed in this patch. Its rules may keep it to other places (a biome, a height, the block below), or it is rare: try another seed or move the patch.';
  }
  if (picks) {
    const total = result.picks.reduce((sum, pick) => sum + pick.count, 0);
    return `${total} picks: ${result.picks
      .slice(0, 6)
      .map((pick) => `${pick.block} ${Math.round((pick.count / Math.max(1, total)) * 100)} %`)
      .join(', ')}.`;
  }
  return `Placed ${result.placed} ${result.placed === 1 ? 'block' : 'blocks'} in ${result.columns} ${
    result.columns === 1 ? 'column' : 'columns'
  }, in ${result.chunks} of the 9 chunks of this patch.`;
}

/** Notes of a Scatter. */
export function scatterNotes(input: {
  readonly plan: ScatterPlan;
  readonly world: readonly Unsupported[];
  readonly features: readonly Unsupported[];
  readonly problems: TerrainFilesState['problems'];
}): string[] {
  const lines = [...input.plan.words];
  lines.push('Trees, plants and ores are about right here; the game places them exactly.');
  lines.push(...partLines([...input.world, ...input.features], unsupportedLine));
  for (const problem of input.problems) {
    lines.push(`${problem.elementId} could not be read, so it is left out: ${problem.message}`);
  }
  lines.push('Lit: what the features placed. The land is dimmed.');
  return [...new Set(lines)];
}

/** Props of {@link Scatter}. */
export interface ScatterProps {
  terrain: TerrainSessionHandle;
  root: string | null;
  project: Project;
  element: Element;
  vanillaReady: boolean;
  onSetup(): void;
  worlds?: TryItWorldsPlatform | null;
}

type ScatterMode = 'above' | 'side';

const MODE_LABELS: Record<ScatterMode, string> = { above: 'From above', side: 'From the side' };

/** The Scatter; see the module comment. */
export default function Scatter(props: ScatterProps) {
  const { terrain, project, element } = props;
  const client = terrain.client;
  const snapshot = useTerrainSnapshot(terrain);
  const state = snapshot.state;
  const { view, setView } = useProjectView(props.root, project.name);
  useVanillaRefresh(terrain.files, props.vanillaReady, state?.needsSetUp === true);

  const [additionOn, setAdditionOn] = useState(true);
  const plan = useMemo(
    () => (state === null ? null : scatterPlan(element, state, additionOn)),
    [element, state, additionOn],
  );
  const { world, error } = useViewWorld(client, state, plan?.spec ?? null, view?.seed ?? null);
  const banner = state?.needsSetUp === true && missesVanillaFile(world?.summary ?? null);

  const [mode, setMode] = useState<ScatterMode>('above');
  const [answers, setAnswers] = useState<{
    world: string;
    land: ColumnsData;
    features: ColumnsData;
  } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placedMs, setPlacedMs] = useState<number | null>(null);
  const hash = world?.hash ?? null;
  const viewX = view?.x ?? 0;
  const viewZ = view?.z ?? 0;
  useEffect(() => {
    if (hash === null || banner) {
      client.cancel('scatter-land');
      client.cancel('scatter');
      setPlacing(false);
      return;
    }
    let live = true;
    const region = patchWindow({ x: viewX, z: viewZ });
    setPlacing(true);
    const started = performance.now();
    void Promise.all([
      client.sample('scatter-land', { type: 'columns', region, stage: 'surface' }),
      client.sample('scatter', { type: 'columns', region, stage: 'features' }),
    ]).then(
      ([land, features]) => {
        if (!live || land === null || features === null) return;
        setAnswers({
          world: hash,
          land: land.data as ColumnsData,
          features: features.data as ColumnsData,
        });
        setPlacedMs(Math.round(performance.now() - started));
        setPlacing(false);
      },
      () => {
        if (live) setPlacing(false);
      },
    );
    return () => {
      live = false;
      client.cancel('scatter-land');
      client.cancel('scatter');
    };
  }, [client, hash, banner, viewX, viewZ]);

  const result = useMemo(
    () => (answers === null ? null : readScatter(answers.land, answers.features)),
    [answers],
  );
  const picture = useMemo(() => {
    if (result === null) return null;
    if (mode === 'above') {
      return {
        pixels: paintAbove(result),
        width: result.sizeX,
        height: result.sizeZ,
        low: 0,
        high: 0,
      };
    }
    return paintSide(result);
  }, [result, mode]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context === null || picture === null) return;
    const image = context.createImageData(picture.width, picture.height);
    image.data.set(picture.pixels);
    context.putImageData(image, 0, 0);
  }, [picture]);

  const patch = patchWindow({ x: viewX, z: viewZ });
  const [hover, setHover] = useState<string | null>(null);
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (picture === null || result === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = Math.floor(((event.clientX - rect.left) / rect.width) * picture.width);
    const py = Math.floor(((event.clientY - rect.top) / rect.height) * picture.height);
    if (mode === 'above') {
      const i = py * result.sizeX + px;
      const block = result.placedTop[i] ?? result.top[i] ?? 'air';
      setHover(`X ${patch.x0 + px}, Z ${patch.z0 + py}: ${block}`);
    } else {
      const y = picture.high - py;
      setHover(`X ${patch.x0 + px}, y ${y}`);
    }
  };

  if (snapshot.error !== null && state === null) {
    return (
      <p role="status" className="text-sm text-error">
        {`The scatter could not read the project's files: ${snapshot.error}`}
      </p>
    );
  }
  if (state === null || view === null || plan === null) {
    return (
      <p role="status" className="text-sm text-muted">
        Reading the world's files…
      </p>
    );
  }
  const shown = result;
  const notes = scatterNotes({
    plan,
    world: world?.summary.unsupported ?? [],
    features: answers?.features.notes ?? [],
    problems: state.problems,
  });
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="scatter">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Scatter" className="flex flex-wrap gap-1">
          {(['above', 'side'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={entry === mode}
              data-testid={`terrain-scatter-mode-${entry}`}
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
        {placing && !banner ? (
          <span role="status" className="text-xs text-muted" data-testid="terrain-drawing">
            Placing…
          </span>
        ) : null}
      </div>
      {plan.addition !== null ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="terrain-addition-toggle"
            checked={additionOn}
            onChange={(event) => setAdditionOn(event.target.checked)}
          />
          The addition is on
        </label>
      ) : null}
      <SeedControls
        seed={view.seed}
        seedNumber={world?.summary.seed ?? null}
        onSeed={(next) => setView({ seed: next })}
        {...(props.worlds === undefined ? {} : { worlds: props.worlds })}
      />
      <PositionControls view={view} onChange={setView} />
      {banner ? (
        <SetUpBanner onSetup={props.onSetup} />
      ) : error !== null ? (
        <p role="status" className="text-sm text-error" data-testid="terrain-error">
          {`The scatter could not be drawn: ${error}`}
        </p>
      ) : (
        <>
          <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded border border-border">
            {picture === null ? (
              <p role="status" className="p-2 text-sm text-muted">
                Placing…
              </p>
            ) : (
              <canvas
                ref={canvasRef}
                data-testid="terrain-scatter"
                width={picture.width}
                height={picture.height}
                role="img"
                aria-label={
                  mode === 'above'
                    ? `A patch of flat land 48 by 48 blocks from above, from X ${patch.x0}, Z ${patch.z0}. ${countLine(shown, plan.picks)}`
                    : `The same patch from the south, from y ${picture.low} to y ${picture.high}. ${countLine(shown, plan.picks)}`
                }
                className="block w-full [image-rendering:pixelated]"
                onPointerMove={onPointerMove}
                onPointerLeave={() => setHover(null)}
              />
            )}
          </div>
          <p className="text-sm" data-testid="terrain-scatter-count">
            {countLine(shown, plan.picks)}
          </p>
          {plan.picks && shown !== null && shown.strip.length > 0 ? (
            <ul
              aria-label="Sample picks"
              className="flex flex-wrap gap-0.5"
              data-testid="terrain-picks"
            >
              {shown.strip.map((block, i) => {
                const colour = blockColour(block, 'top') ?? SKY;
                return (
                  <li
                    key={i}
                    title={block}
                    className="size-4 rounded-sm border border-border"
                    style={{ background: `rgb(${colour[0]},${colour[1]},${colour[2]})` }}
                  />
                );
              })}
            </ul>
          ) : null}
          <p
            aria-live="polite"
            className="min-h-5 text-xs text-muted [overflow-wrap:anywhere]"
            data-testid="terrain-scatter-hover"
          >
            {hover ?? 'Hover the patch to see the block there.'}
          </p>
        </>
      )}
      <TerrainNotes lines={notes} />
      <output
        className="sr-only"
        data-testid="terrain-scatter-state"
        data-mode={mode}
        data-world={hash ?? ''}
        data-placed={shown?.placed ?? ''}
        data-placing={placing ? 'yes' : 'no'}
        data-banner={banner ? 'yes' : 'no'}
        data-ms={placedMs ?? ''}
      >
        {`${MODE_LABELS[mode]}; ${placing ? 'placing' : 'placed'}`}
      </output>
    </div>
  );
}
