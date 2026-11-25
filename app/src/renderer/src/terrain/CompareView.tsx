/**
 * **Compare with vanilla** (ADR 0119 D9; B585): beside the project's map, the vanilla world of the
 * same seed and place, drawn from the user's own Minecraft files (never shipped): the overworld
 * for a noise world, the Nether or the End for worlds on their land, and for a world on another
 * of vanilla's land settings (amplified, large biomes, caves, floating islands) the overworld on
 * those settings. It needs the jar; without it the map's toggle is off and offers the set-up.
 *
 * Honest as the map: the parts the target says are only about right (`terrainPreview.approximate`:
 * the End, a version's biome borders) are said in plain words, vanilla's overworld and Nether
 * biomes are drawn in one colour until a Play has given their list (limit WL7), and what the
 * preview does not draw is named. Vanilla's world is made in its own worker (one world a worker,
 * F9), so the project's map is never pushed out by it.
 *
 * B819: `against` draws another world in vanilla's place (the upgrade report's "Before the
 * move": the project as it is, from its own files and worker), with its own label and note.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COARSE_FACTOR,
  type PaletteGrid,
  type TerrainAnswer,
  TerrainClient,
  type TerrainFacts,
  type WorldSummary,
} from './client';
import { type BiomeColours, paintLayers } from './colours';
import type { TerrainFilesState } from './files';
import { HOST_NAMESPACE, withNamespace } from './hosts';
import type { TerrainView } from './view-store';
import { partLines, useViewWorld, type ViewWorldSpec } from './views';
import {
  biomeLayer,
  biomeStep,
  heightLayer,
  heightSteps,
  hoverAt,
  MAP_PIXELS,
  type MapLayer,
  mapRegion,
  unsupportedLine,
  viewportOf,
} from './WorldMap';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The world preset vanilla's dimensions are read from. */
export const VANILLA_PRESET = 'minecraft:normal';

const COMPARE_ID = `${HOST_NAMESPACE}:compare`;

/** Vanilla's world a project world is compared with. */
export interface CompareSource {
  readonly spec: ViewWorldSpec;
  /** What the view calls it ("Vanilla's overworld"). */
  readonly label: string;
  /** True for the End (its land is about right on every target). */
  readonly end: boolean;
  /** True when vanilla places its biomes by climate (their borders, limit WL17). */
  readonly climate: boolean;
}

/** Vanilla's land settings with a dimension of their own in the preset. */
const OWN_DIMENSION: Readonly<Record<string, string>> = {
  'minecraft:nether': 'minecraft:the_nether',
  'minecraft:end': 'minecraft:the_end',
};

/**
 * The vanilla world to compare a project dimension with: the End for an End world, the Nether
 * for one on the Nether's land, the overworld on another vanilla land setting when it names one,
 * else vanilla's overworld.
 */
export function compareSource(dimension: Json | null, end: boolean): CompareSource {
  const generator = isObject(dimension?.generator) ? dimension.generator : {};
  const settings =
    typeof generator.settings === 'string' ? withNamespace(generator.settings) : null;
  const own = settings === null ? undefined : OWN_DIMENSION[settings];
  if (end || own === 'minecraft:the_end') {
    return {
      spec: preset('minecraft:the_end'),
      label: "Vanilla's End",
      end: true,
      climate: false,
    };
  }
  if (own === 'minecraft:the_nether') {
    return {
      spec: preset('minecraft:the_nether'),
      label: "Vanilla's Nether",
      end: false,
      climate: true,
    };
  }
  if (settings?.startsWith('minecraft:') && settings !== 'minecraft:overworld') {
    return {
      spec: {
        vanillaOnly: true,
        extra: {
          dimension: {
            [COMPARE_ID]: {
              type: 'minecraft:overworld',
              generator: {
                type: 'minecraft:noise',
                settings,
                biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' },
              },
            },
          },
        },
        source: { dimension: COMPARE_ID },
      },
      label: `Vanilla's overworld on its ${settings.slice('minecraft:'.length).replace(/_/g, ' ')} land`,
      end: false,
      climate: true,
    };
  }
  return {
    spec: preset('minecraft:overworld'),
    label: "Vanilla's overworld",
    end: false,
    climate: true,
  };
}

function preset(dimension: string): ViewWorldSpec {
  return { vanillaOnly: true, extra: {}, source: { preset: VANILLA_PRESET, dimension } };
}

/** The notes under vanilla's map: what is about right on this target and what is left out. */
export function compareNotes(input: {
  readonly facts: TerrainFacts;
  readonly source: CompareSource;
  readonly summary: WorldSummary | null;
}): string[] {
  const lines = [
    `${input.source.label}, from your own Minecraft files, at the same seed and place.`,
  ];
  if (input.source.end && input.facts.approximate.includes('end')) {
    lines.push('The End is about right here.');
  }
  if (input.summary !== null && !input.summary.biomesKnown) {
    lines.push(
      "Vanilla's biomes show here after you have pressed Play once. Until then its land is drawn in one colour.",
    );
  } else if (
    !input.source.end &&
    input.source.climate &&
    input.facts.approximate.includes('biome_layout')
  ) {
    lines.push('Biome borders are about right on this version.');
  }
  lines.push(...partLines(input.summary?.unsupported ?? [], unsupportedLine));
  lines.push('Carved caves, buildings and the land shaped around them show only in the game.');
  lines.push('Trees, plants and ores are not drawn here.');
  return [...new Set(lines)];
}

const clients = new WeakMap<object, TerrainClient>();

/** The client of vanilla's world for a session (one more worker, made on first use). */
export function compareClientFor(owner: object): TerrainClient {
  let client = clients.get(owner);
  if (client === undefined) {
    client = new TerrainClient();
    clients.set(owner, client);
  }
  return client;
}

/** Another world drawn in vanilla's place (B819). */
export interface CompareAgainst {
  /** What the view calls it ("Before the move"). */
  readonly label: string;
  /** The world: files laid over `state`'s project files, and where to look. */
  readonly spec: ViewWorldSpec;
  /** The first line under it. */
  readonly note?: string;
}

/** The notes under another world's map: its own line, then what the preview leaves out. */
export function againstNotes(against: CompareAgainst, summary: WorldSummary | null): string[] {
  return [
    ...new Set([
      against.note ?? against.label,
      ...partLines(summary?.unsupported ?? [], unsupportedLine),
      'Carved caves, buildings and the land shaped around them show only in the game.',
      'Trees, plants and ores are not drawn here.',
    ]),
  ];
}

/** Props of {@link CompareView}. */
export interface CompareViewProps {
  /** The client of vanilla's world (`compareClientFor`). */
  client: TerrainClient;
  state: TerrainFilesState;
  /** The project world's dimension JSON and whether it is the End. */
  dimension: Json | null;
  end: boolean;
  mode: 'biomes' | 'height';
  view: Pick<TerrainView, 'x' | 'z' | 'zoom' | 'seed'>;
  colours: BiomeColours;
  /** Another world in vanilla's place (B819); `state` and `client` are then its own. */
  against?: CompareAgainst;
}

/** Vanilla's map beside the project's; see the module comment. */
export default function CompareView(props: CompareViewProps) {
  const { client, state, mode, view, colours } = props;
  const against = props.against;
  const source = useMemo<CompareSource>(
    () =>
      against === undefined
        ? compareSource(props.dimension, props.end)
        : { spec: against.spec, label: against.label, end: false, climate: false },
    [props.dimension, props.end, against],
  );
  const { world, error } = useViewWorld(client, state, source.spec, view.seed);
  const [layers, setLayers] = useState<readonly MapLayer[]>([]);
  const [drawing, setDrawing] = useState(false);
  const hash = world?.hash ?? null;
  const summary = world?.summary ?? null;

  useEffect(() => {
    if (hash === null || summary === null) return;
    let live = true;
    const at = { x: view.x, z: view.z, zoom: view.zoom };
    const step = mode === 'biomes' ? biomeStep(view.zoom) : (heightSteps(view.zoom)[0] as number);
    const region = mapRegion(at, step);
    setDrawing(true);
    client
      .sample(
        'compare',
        mode === 'biomes' ? { type: 'biomes', region } : { type: 'heights', region, fn: 'surface' },
        (answer: TerrainAnswer) => {
          if (!live) return;
          const sampled = {
            ...region,
            step: answer.pass === 'coarse' ? region.step * COARSE_FACTOR : region.step,
          };
          const meta = { world: hash, pass: answer.pass };
          setLayers([
            mode === 'biomes'
              ? biomeLayer(sampled, answer.data as PaletteGrid, colours, null, meta)
              : heightLayer(sampled, answer.data as Int16Array, summary, meta),
          ]);
        },
      )
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
      client.cancel('compare');
    };
  }, [client, hash, summary, mode, view.x, view.z, view.zoom, colours]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shown = useMemo(
    () => layers.filter((layer) => layer.kind === (mode === 'biomes' ? 'biomes' : 'heights')),
    [layers, mode],
  );
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context === null) return;
    const pixels = paintLayers(shown, viewportOf(view));
    const image = context.createImageData(MAP_PIXELS, MAP_PIXELS);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
  }, [shown, view]);

  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const hovered = hover === null ? null : hoverAt(shown, hover.x, hover.z);
  const notes =
    against === undefined
      ? compareNotes({ facts: state.facts, source, summary })
      : againstNotes(against, summary);
  const what = against === undefined ? 'Vanilla' : against.label;

  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid="terrain-compare-view">
      <p className="text-sm">
        {source.label}
        {drawing ? <span className="ml-2 text-xs text-muted">Drawing…</span> : null}
      </p>
      {error !== null ? (
        <p role="status" className="text-sm text-error" data-testid="terrain-compare-error">
          {against === undefined
            ? `Vanilla's world could not be drawn: ${error}`
            : `${against.label} could not be drawn: ${error}`}
        </p>
      ) : (
        <div className="relative aspect-square w-full overflow-hidden rounded border border-border">
          <canvas
            ref={canvasRef}
            data-testid="terrain-compare-map"
            width={MAP_PIXELS}
            height={MAP_PIXELS}
            role="img"
            aria-label={`${source.label}, ${mode === 'biomes' ? 'biomes' : 'height'}, around X ${view.x}, Z ${view.z}, the same place as your map.`}
            className="block size-full [image-rendering:pixelated]"
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return;
              const viewport = viewportOf(view);
              setHover({
                x: Math.floor(
                  viewport.left +
                    ((event.clientX - rect.left) / rect.width) * MAP_PIXELS * view.zoom,
                ),
                z: Math.floor(
                  viewport.top +
                    ((event.clientY - rect.top) / rect.height) * MAP_PIXELS * view.zoom,
                ),
              });
            }}
            onPointerLeave={() => setHover(null)}
          />
        </div>
      )}
      <p className="min-h-5 text-xs text-muted [overflow-wrap:anywhere]" aria-live="polite">
        {hover === null
          ? `Hover to see ${against === undefined ? 'vanilla' : 'it'} here.`
          : `${what} at X ${hover.x}, Z ${hover.z}${hovered?.biome === undefined ? '' : `: ${hovered.biome}`}${
              hovered?.height === undefined ? '' : `, land at y ${hovered.height}`
            }`}
      </p>
      <ul
        aria-label={
          against === undefined ? "What vanilla's map leaves out" : 'What this map leaves out'
        }
        data-testid="terrain-compare-notes"
        className="flex flex-col gap-1 text-xs text-muted [overflow-wrap:anywhere]"
      >
        {notes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <output
        className="sr-only"
        data-testid="terrain-compare-state"
        data-world={hash ?? ''}
        data-pass={shown.at(-1)?.pass ?? ''}
        data-drawing={drawing ? 'yes' : 'no'}
      >
        {drawing ? 'drawing' : 'drawn'}
      </output>
    </div>
  );
}
