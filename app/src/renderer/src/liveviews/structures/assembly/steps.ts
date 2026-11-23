/**
 * The assembly view's model (ADR 0122 D4, D5; B640), pure and without the engine:
 *
 * - **Gathering** ({@link gatherAssembly}): from a start pool, every pool and template the
 *   assembly may reach, the project's laid over the ones read from the user's jar (D7; never
 *   written anywhere), so the worker's assembler can ask for them synchronously.
 * - **Reading** the data: a template pool as the engine's `PoolData` ({@link poolDataOf}), a
 *   structure as `JigsawStructureData` or `null` for every type but `minecraft:jigsaw` (limit 4L2,
 *   {@link jigsawStructureOf}).
 * - **Cells** ({@link pieceCells}): a placed piece's blocks where they stand, turned with it
 *   (the worker calls this with the engine's own turn of a vector, so the two never disagree).
 * - **Steps** as the view shows them: the prefix up to the n-th placed piece
 *   ({@link stepsUpTo}), refusals in plain words ({@link REFUSAL_WORDS}), and the pieces shown
 *   flattened into one template for the 3D preview ({@link flattenPieces}; later pieces over
 *   earlier, the two jigsaw blocks that met drawn as jigsaw blocks).
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/plugin-api';
import type { StructureTemplateData } from '@msm/plugin-structures';
import { wordsOfPath } from '../../frame/item-picture';
import {
  type PieceTemplate,
  pieceTemplateFromData,
  type VanillaPieceReader,
  vanillaPieceId,
} from '../vanilla-pieces';
import type {
  AssembledPiece,
  JigsawStructureData,
  MetJigsaws,
  PoolData,
  PoolElementData,
  RefusalReason,
  ViewStep,
} from './client';

/** The template pool kind. */
export const TEMPLATE_POOL_KIND = 'minecraft:worldgen/template_pool';
/** The structure kind. */
export const STRUCTURE_KIND = 'minecraft:worldgen/structure';
/** The structure template kind. */
export const STRUCTURE_TEMPLATE_KIND = 'minecraft:structure_template';
/** The vanilla folder of template pools (the jar cache's worldgen folders). */
export const POOL_FOLDER = 'worldgen/template_pool';

/** The pool id that means "none". */
const EMPTY = 'minecraft:empty';

/** The piece limit when the user has not raised it (4L9; the engine's `DEFAULT_PIECE_LIMIT`). */
export const DEFAULT_PIECE_LIMIT = 500;
/** How much "Raise the limit" adds. */
export const PIECE_LIMIT_STEP = 500;
/** The most the limit can be raised to. */
export const MAX_PIECE_LIMIT = 5000;
/** The most templates one assembly gathers (a guard against a runaway chain of pools). */
export const MAX_TEMPLATES = 2000;
/** The depth a pool's view assembles to until the user picks another. */
export const DEFAULT_POOL_DEPTH = 4;
/** The distance limit of a pool's view (the one most of vanilla's jigsaw structures use). */
export const POOL_VIEW_DISTANCE = 80;

/** The line of limit 4L1, on every assembly. */
export const BUILDING_LINE = 'A building your pools can make. The one in your world will differ.';
/** The line of limit 4L2, for a structure that is not a jigsaw structure. */
export const NOT_JIGSAW_LINE = 'This kind of structure is built by the game itself.';
/** The line of limit 4L5. */
export const FLAT_FLOOR_LINE =
  'Shown on a flat floor: terrain matching and the structure’s terrain adaptation do nothing here.';
/** The spike's finding on placement priority (B634): the parent jigsaw's value orders growth. */
export const PRIORITY_LINE =
  'Pieces grow in the order of the jigsaw that placed them: its placement priority, highest first.';
/** The line without WebGL: the step list alone. */
export const NO_WEBGL_LINE = 'Your computer cannot draw 3D here, so only the list of steps shows.';

/** The line of limit 4L9 (the engine's `stoppedLine`). */
export function stoppedLine(pieces: number): string {
  return `Stopped at ${pieces} pieces.`;
}

/** Each refusal in plain words (no ids; Very easy shows these as they are). */
export const REFUSAL_WORDS: Readonly<Record<RefusalReason, string>> = Object.freeze({
  no_matching_jigsaw: 'No jigsaw block on it has the name the other jigsaw asks for.',
  overlaps_a_piece: 'It would overlap a piece already placed.',
  too_far_from_start: 'It would reach too far from the start.',
  too_high_or_low: 'It would be too high or too low.',
  past_depth_limit: 'The depth limit was reached here.',
  template_missing: 'Its building file could not be found.',
  pool_missing: 'The pool it names could not be found.',
  pool_empty: 'The pool has no pieces.',
  unsupported_element: 'MSM cannot place this kind of piece yet; only the game can.',
});

type JsonObject = { readonly [key: string]: Json };

const asObject = (value: unknown): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;

/** An id with its namespace written out (`street` is `minecraft:street`). */
export function namespacedId(id: string): string {
  const trimmed = id.trim();
  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
}

/** A name for a piece, pool or template id: words in Very easy and Easy, the id after them in Advanced. */
export function idWords(id: string, advanced: boolean): string {
  const words = wordsOfPath(id) || 'Piece';
  return advanced ? `${words} (${id})` : words;
}

// ---------------------------------------------------------------------------------------------
// Reading the data

function readElement(raw: unknown): Omit<PoolElementData, 'weight'> | null {
  const element = asObject(raw);
  if (element === undefined) return null;
  const type = namespacedId(
    typeof element.element_type === 'string'
      ? element.element_type
      : typeof element.type === 'string'
        ? element.type
        : '',
  );
  const projection = element.projection === 'terrain_matching' ? 'terrain_matching' : 'rigid';
  const out: Record<string, unknown> = { type, projection };
  if (typeof element.location === 'string') out.location = namespacedId(element.location);
  if (element.processors !== undefined) out.processors = element.processors;
  // A list element's members, as the engine reads them (`elements`, each with its own type).
  if (Array.isArray(element.elements)) out.elements = element.elements;
  if (element.corner_constraint !== undefined) out.cornerConstraint = element.corner_constraint;
  return out as unknown as Omit<PoolElementData, 'weight'>;
}

/** A template pool's JSON as the engine's `PoolData`; entries that are not elements are left out. */
export function poolDataOf(id: string, json: unknown): PoolData {
  const pool = asObject(json) ?? {};
  const elements: PoolElementData[] = [];
  for (const entry of Array.isArray(pool.elements) ? pool.elements : []) {
    const object = asObject(entry);
    const element = readElement(object?.element);
    if (object === undefined || element === null) continue;
    const weight =
      typeof object.weight === 'number' && Number.isFinite(object.weight) ? object.weight : 1;
    elements.push({ ...element, weight });
  }
  const fallback = typeof pool.fallback === 'string' ? namespacedId(pool.fallback) : EMPTY;
  return { id: namespacedId(id), fallback, elements };
}

/** The template ids a pool's elements name (a list element's members too). */
export function poolTemplateIds(pool: PoolData): string[] {
  const out: string[] = [];
  for (const element of pool.elements) {
    if (typeof element.location === 'string') out.push(element.location);
    const members = (element as { readonly elements?: unknown }).elements;
    if (!Array.isArray(members)) continue;
    for (const member of members) {
      const location = asObject(member)?.location;
      if (typeof location === 'string') out.push(namespacedId(location));
    }
  }
  return [...new Set(out)];
}

const TERRAIN_ADAPTATIONS = new Set(['none', 'beard_thin', 'beard_box', 'bury', 'encapsulate']);

/**
 * A structure's JSON as the engine's `JigsawStructureData`, or `null` when its type is not
 * `minecraft:jigsaw` (limit 4L2: every other type is built by the game's own code) or it names
 * no start pool.
 */
export function jigsawStructureOf(json: unknown): JigsawStructureData | null {
  const structure = asObject(json);
  if (structure === undefined || typeof structure.type !== 'string') return null;
  if (namespacedId(structure.type) !== 'minecraft:jigsaw') return null;
  if (typeof structure.start_pool !== 'string' || structure.start_pool.trim() === '') return null;
  const size = typeof structure.size === 'number' ? Math.floor(structure.size) : 1;
  const distance = structure.max_distance_from_center;
  const object = asObject(distance);
  let maxDistanceFromCenter: JigsawStructureData['maxDistanceFromCenter'] = POOL_VIEW_DISTANCE;
  if (typeof distance === 'number') maxDistanceFromCenter = distance;
  else if (object !== undefined && typeof object.horizontal === 'number') {
    maxDistanceFromCenter =
      typeof object.vertical === 'number'
        ? { horizontal: object.horizontal, vertical: object.vertical }
        : { horizontal: object.horizontal };
  }
  const adaptation =
    typeof structure.terrain_adaptation === 'string' &&
    TERRAIN_ADAPTATIONS.has(structure.terrain_adaptation)
      ? (structure.terrain_adaptation as JigsawStructureData['terrainAdaptation'])
      : 'none';
  return {
    startPool: namespacedId(structure.start_pool),
    size,
    ...(typeof structure.start_jigsaw_name === 'string'
      ? { startJigsawName: structure.start_jigsaw_name }
      : {}),
    startHeight: structure.start_height ?? null,
    maxDistanceFromCenter,
    useExpansionHack: structure.use_expansion_hack === true,
    terrainAdaptation: adaptation,
  };
}

/** The structure a pool's view assembles: the pool at the start, to `depth`, within 80 blocks. */
export function poolViewStructure(poolId: string, depth: number): JigsawStructureData {
  return {
    startPool: namespacedId(poolId),
    size: depth,
    startHeight: null,
    maxDistanceFromCenter: POOL_VIEW_DISTANCE,
    useExpansionHack: false,
    terrainAdaptation: 'none',
  };
}

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);
const isVec = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every(isInt);

/**
 * A project template's data, checked: the size, the palette's strings, block tuples inside the
 * size that point at the palette, jigsaws with a position and their names. `null` when it has no
 * usable size.
 */
export function cleanTemplateData(json: unknown): StructureTemplateData | null {
  const data = asObject(json);
  if (data === undefined || !isVec(data.size) || data.size.some((n) => n < 1)) return null;
  const size = data.size as [number, number, number];
  const palette = (Array.isArray(data.palette) ? data.palette : []).map((entry) =>
    typeof entry === 'string' ? entry : 'minecraft:air',
  );
  const blocks: [number, number, number, number][] = [];
  for (const tuple of Array.isArray(data.blocks) ? data.blocks : []) {
    if (!Array.isArray(tuple) || tuple.length !== 4 || !tuple.every(isInt)) continue;
    const [x, y, z, state] = tuple as [number, number, number, number];
    if (x < 0 || y < 0 || z < 0 || x >= size[0] || y >= size[1] || z >= size[2]) continue;
    if (state < 0 || state >= palette.length) continue;
    blocks.push([x, y, z, state]);
  }
  const jigsaws: NonNullable<StructureTemplateData['jigsaws']> = [];
  for (const raw of Array.isArray(data.jigsaws) ? data.jigsaws : []) {
    const jigsaw = asObject(raw);
    if (jigsaw === undefined || !isVec(jigsaw.pos)) continue;
    const text = (key: string, fallback: string): string =>
      typeof jigsaw[key] === 'string' ? (jigsaw[key] as string) : fallback;
    jigsaws.push({
      pos: jigsaw.pos as [number, number, number],
      pool: text('pool', EMPTY),
      name: text('name', EMPTY),
      target: text('target', EMPTY),
      final_state: text('final_state', 'minecraft:air'),
      ...(jigsaw.joint === 'rollable' || jigsaw.joint === 'aligned' ? { joint: jigsaw.joint } : {}),
      ...(isInt(jigsaw.placement_priority)
        ? { placement_priority: jigsaw.placement_priority }
        : {}),
      ...(isInt(jigsaw.selection_priority)
        ? { selection_priority: jigsaw.selection_priority }
        : {}),
    });
  }
  return { size, palette, blocks, jigsaws };
}

// ---------------------------------------------------------------------------------------------
// Gathering

/** The answer of reading vanilla's template pools. */
export type VanillaPoolsAnswer =
  | { readonly status: 'ready'; readonly files: Readonly<Record<string, Json>> }
  | { readonly status: 'not_set_up' };

/** What {@link gatherAssembly} takes. */
export interface GatherInput {
  readonly project: Pick<Project, 'namespaces'>;
  /** The start pool's id. */
  readonly startPool: string;
  /** Reads vanilla's template pools (the jar cache's `worldgen/template_pool` folder). */
  readVanillaPools(): Promise<VanillaPoolsAnswer>;
  /** Reads vanilla's templates by id (B636's reader). */
  readonly pieces: VanillaPieceReader;
}

/** What {@link gatherAssembly} found. */
export interface Gathered {
  readonly pools: Readonly<Record<string, PoolData>>;
  readonly templates: Readonly<
    Record<string, { readonly key: string; readonly template: PieceTemplate }>
  >;
  /** Whether a pool or template the assembly reaches is Minecraft's own, not the project's. */
  readonly namesVanilla: boolean;
  /** Whether a read of Minecraft's own files answered "not set up". */
  readonly vanillaNotSetUp: boolean;
  /** Whether {@link MAX_TEMPLATES} stopped the gathering. */
  readonly tooMany: boolean;
}

let serial = 0;
const serials = new WeakMap<object, number>();
const projectTemplates = new WeakMap<object, PieceTemplate | null>();

/** A number for an object, the same while it is the same object (keys for the worker's cache). */
function serialOf(value: object): number {
  let known = serials.get(value);
  if (known === undefined) {
    serial += 1;
    known = serial;
    serials.set(value, known);
  }
  return known;
}

/** A project template as a `PieceTemplate`, kept per data object (an edit makes a new one). */
function projectTemplate(id: string, data: unknown): PieceTemplate | null {
  if (typeof data !== 'object' || data === null) return null;
  if (projectTemplates.has(data)) return projectTemplates.get(data) ?? null;
  const clean = cleanTemplateData(data);
  let template: PieceTemplate | null = null;
  if (clean !== null) {
    try {
      template = pieceTemplateFromData(id, clean);
    } catch {
      template = null;
    }
  }
  projectTemplates.set(data, template);
  return template;
}

/**
 * Every pool and template the assembly from `startPool` may reach: pools through their elements
 * and fallbacks, templates through their jigsaws' pools. The project's own first; ids of the
 * `minecraft` namespace not in the project from the user's jar. Stops at {@link MAX_TEMPLATES}.
 */
export async function gatherAssembly(input: GatherInput): Promise<Gathered> {
  const projectPools = new Map<string, unknown>();
  const projectTemplateData = new Map<string, unknown>();
  for (const namespace of input.project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === TEMPLATE_POOL_KIND) {
        projectPools.set(namespacedId(element.id), element.data);
      } else if (element.kind === STRUCTURE_TEMPLATE_KIND) {
        projectTemplateData.set(namespacedId(element.id), element.data);
      }
    }
  }
  const pools: Record<string, PoolData> = {};
  const templates: Record<string, { key: string; template: PieceTemplate }> = {};
  let namesVanilla = false;
  let vanillaNotSetUp = false;
  let tooMany = false;
  let vanillaPools: VanillaPoolsAnswer | null = null;

  const seenPools = new Set<string>();
  const seenTemplates = new Set<string>();
  const poolQueue: string[] = [namespacedId(input.startPool)];
  let templateQueue: string[] = [];

  const addTemplate = (id: string, key: string, template: PieceTemplate): void => {
    templates[id] = { key, template };
    for (const jigsaw of template.jigsaws) poolQueue.push(namespacedId(jigsaw.pool));
  };

  while (poolQueue.length > 0 || templateQueue.length > 0) {
    while (poolQueue.length > 0) {
      const id = poolQueue.shift() as string;
      if (id === EMPTY || seenPools.has(id)) continue;
      seenPools.add(id);
      let json: unknown;
      if (projectPools.has(id)) json = projectPools.get(id);
      else if (id.startsWith('minecraft:')) {
        namesVanilla = true;
        vanillaPools ??= await input.readVanillaPools();
        if (vanillaPools.status !== 'ready') {
          vanillaNotSetUp = true;
          continue;
        }
        json = vanillaPools.files[id];
        if (json === undefined) continue;
      } else continue;
      const pool = poolDataOf(id, json);
      pools[id] = pool;
      poolQueue.push(pool.fallback);
      for (const template of poolTemplateIds(pool)) templateQueue.push(template);
    }
    const vanillaBatch: string[] = [];
    for (const id of templateQueue) {
      if (seenTemplates.has(id)) continue;
      if (seenTemplates.size >= MAX_TEMPLATES) {
        tooMany = true;
        break;
      }
      seenTemplates.add(id);
      if (projectTemplateData.has(id)) {
        const data = projectTemplateData.get(id);
        const template = projectTemplate(id, data);
        if (template !== null) addTemplate(id, `p${serialOf(data as object)}`, template);
      } else if (vanillaPieceId(id) !== null && id.startsWith('minecraft:')) {
        namesVanilla = true;
        vanillaBatch.push(id);
      }
    }
    templateQueue = [];
    if (vanillaBatch.length > 0) {
      const answers = await input.pieces.templates(vanillaBatch);
      for (const [id, answer] of answers) {
        if (answer.status === 'ready')
          addTemplate(id, `v${serialOf(answer.template)}`, answer.template);
        else if (answer.status === 'not_set_up') vanillaNotSetUp = true;
      }
    }
  }
  return { pools, templates, namesVanilla, vanillaNotSetUp, tooMany };
}

// ---------------------------------------------------------------------------------------------
// Steps as the view shows them

/** The placed steps of a list of steps. */
export function placedSteps(steps: readonly ViewStep[]): Extract<ViewStep, { kind: 'placed' }>[] {
  return steps.filter(
    (step): step is Extract<ViewStep, { kind: 'placed' }> => step.kind === 'placed',
  );
}

/**
 * The steps up to and with the `shown`-th placed piece; every step once all pieces are shown and
 * the assembly is done (the refusals after the last piece, and the stop).
 */
export function stepsUpTo(steps: readonly ViewStep[], shown: number, done: boolean): ViewStep[] {
  if (shown <= 0) return [];
  let placed = 0;
  for (let i = 0; i < steps.length; i += 1) {
    if (steps[i]?.kind !== 'placed') continue;
    placed += 1;
    if (placed === shown) {
      const total = placedSteps(steps).length;
      return done && shown >= total ? [...steps] : steps.slice(0, i + 1);
    }
  }
  return [...steps];
}

/** One template's data as the 3D preview reads it (`preview/structure.ts`). */
export interface FlatTemplate {
  readonly size: [number, number, number];
  readonly palette: string[];
  readonly blocks: [number, number, number, number][];
}

/**
 * The first `shown` pieces as one template for the 3D preview: later pieces over earlier, and
 * the two jigsaw blocks that met when the last of them was placed drawn as jigsaw blocks. Its
 * corner is the lowest corner of the pieces' boxes. `null` when no piece is shown.
 */
export function flattenPieces(
  placed: readonly Extract<ViewStep, { kind: 'placed' }>[],
  shown: number,
): FlatTemplate | null {
  const pieces = placed.slice(0, Math.max(0, shown));
  if (pieces.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const { piece } of pieces) {
    minX = Math.min(minX, piece.box.minX);
    minY = Math.min(minY, piece.box.minY);
    minZ = Math.min(minZ, piece.box.minZ);
    maxX = Math.max(maxX, piece.box.maxX);
    maxY = Math.max(maxY, piece.box.maxY);
    maxZ = Math.max(maxZ, piece.box.maxZ);
  }
  const cells = new Map<string, string>();
  const set = (x: number, y: number, z: number, state: string): void => {
    cells.set(`${x - minX},${y - minY},${z - minZ}`, state);
  };
  for (const { cells: piece } of pieces) {
    for (let i = 0; i + 3 < piece.blocks.length; i += 4) {
      const state = piece.palette[piece.blocks[i + 3] as number];
      if (state === undefined) continue;
      set(
        piece.blocks[i] as number,
        piece.blocks[i + 1] as number,
        piece.blocks[i + 2] as number,
        state,
      );
    }
  }
  const last = pieces[pieces.length - 1];
  const met: MetJigsaws | null = last?.met ?? null;
  if (met !== null) {
    set(met.parent[0], met.parent[1], met.parent[2], met.parentState);
    set(met.child[0], met.child[1], met.child[2], met.childState);
  }
  const palette: string[] = [];
  const paletteIndex = new Map<string, number>();
  const blocks: [number, number, number, number][] = [];
  for (const [key, state] of cells) {
    let i = paletteIndex.get(state);
    if (i === undefined) {
      i = palette.length;
      palette.push(state);
      paletteIndex.set(state, i);
    }
    const [x, y, z] = key.split(',').map(Number) as [number, number, number];
    blocks.push([x, y, z, i]);
  }
  return { size: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1], palette, blocks };
}

/** Whether a piece's template is a feature (a tree or plant the game places) or a template. */
export function pieceWords(piece: AssembledPiece, advanced: boolean): string {
  if (piece.template === null) return 'A plant or feature (placed by the game)';
  const name = idWords(piece.template, advanced);
  return piece.source === 'box' ? `${name}, shown as a box of its size` : name;
}
