/**
 * B641: the structures parity test (ADR 0122 D9). It plays the files of
 * `fixtures/structures-parity/lowered/<target>/data/` through MSM's own assembler and processors
 * and compares what they make with what the real server made of the same files on each target
 * (`expectations.json`, measured by `engine-mod/parity`'s `StructuresParityTest`, B639).
 *
 * The tolerance is the fixture README's ("Tolerance", the spike B634's 4S8), the same rules the
 * GameTest checks itself with:
 * - **Exact:** `grid`, `assemblies`, `noStart`, `size`, `maxDistance` and the whole of `exact`
 *   (no illegal join, no partial overlap, depth and distance kept, the same largest depth and
 *   extents); a `pieces` or `changed` whose spread is 0 on both sides; and every deterministic
 *   processor list cell for cell.
 * - **Statistical:** shares by a two-proportion test at |z| at most 4 (templates, depths, start
 *   turns, which piece each start jigsaw took and what grew from it, child turns, histogram
 *   buckets, a random list's outputs per input), and means within 4 standard errors.
 *
 * MSM's assembler cannot repeat the game's random draws (4L1), so it makes as many starts of its
 * own as the game did, with seeds 0 to n - 1. The processors' "about right" rows (`block_age`,
 * the linear position tests, `lava_submerged_block`, B638) are held to a weaker rule: every
 * outcome MSM gives is one the game gave for the same block.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { NbtFile } from 'deepslate';
import { describe, expect, it } from 'vitest';
import type {
  AssembledPiece,
  JigsawBlock,
  JigsawOrientation,
  JigsawStructureData,
  PieceRotation,
  PieceTemplate,
  PoolData,
  PoolElementData,
  TemplateBlock,
} from '../src/structures/api';
import { assemble, canJoin, pieceJigsaws } from '../src/structures/assemble';
import { contains, intersects } from '../src/structures/boxes';
import type { PlacedJigsaw } from '../src/structures/jigsaw';
import { processTemplate } from '../src/structures/processors';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = join(ROOT, 'fixtures/structures-parity');
const NS = 'structures_parity';
const EMPTY = 'minecraft:empty';
const Z = 4;

type Counts = Record<string, number>;
type Nested = Record<string, Counts>;

interface Stats {
  readonly histogram: Counts;
  readonly n: number;
  readonly mean: number;
  readonly sd: number;
  readonly min: number;
  readonly max: number;
}

interface AssemblySection {
  readonly grid: number;
  readonly assemblies: number;
  readonly noStart: number;
  readonly size: number;
  readonly maxDistance: unknown;
  readonly pieces: Stats;
  readonly templates: Counts;
  readonly depths: Counts;
  readonly startRotations: Counts;
  readonly startJoins: Nested;
  readonly branches: Nested;
  readonly turns: Nested;
  readonly exact: Counts;
}

interface ListSection {
  readonly random: boolean;
  readonly background: string;
  readonly changed: Stats;
  readonly byInput: Nested;
  readonly cells?: Record<string, string>;
  readonly blockEntities?: Record<string, Record<string, unknown>>;
}

interface ProcessorsSection {
  readonly placements: number;
  readonly floorY: number;
  readonly sample: string;
  readonly lists: Record<string, ListSection>;
}

interface Expectations {
  readonly targets: Record<
    string,
    { readonly assembly: Record<string, AssemblySection>; readonly processors: ProcessorsSection }
  >;
}

const expectations = JSON.parse(
  readFileSync(join(FIXTURE, 'expectations.json'), 'utf8'),
) as Expectations;

// --- Reading the lowered files ------------------------------------------------------------------

const ORIENTATIONS = new Set<string>([
  'down_east',
  'down_north',
  'down_south',
  'down_west',
  'up_east',
  'up_north',
  'up_south',
  'up_west',
  'west_up',
  'east_up',
  'north_up',
  'south_up',
]);

type NbtJson = Record<string, unknown>;

function stateOf(entry: NbtJson): string {
  const name = String(entry.Name ?? entry.id ?? 'minecraft:air');
  const props = (entry.Properties ?? entry.properties ?? {}) as Record<string, unknown>;
  const keys = Object.keys(props).sort();
  return keys.length === 0 ? name : `${name}[${keys.map((k) => `${k}=${props[k]}`).join(',')}]`;
}

/** A gzip `.nbt` template as the engine's {@link PieceTemplate} (jigsaws from their block entities). */
function readTemplate(id: string, path: string): PieceTemplate {
  const bytes = new Uint8Array(gunzipSync(readFileSync(path)));
  const json = NbtFile.read(bytes, { compression: 'none' }).root.toSimplifiedJson() as NbtJson;
  const palette = ((json.palette ?? []) as NbtJson[]).map(stateOf);
  const blocks: TemplateBlock[] = [];
  const jigsaws: JigsawBlock[] = [];
  for (const raw of (json.blocks ?? []) as NbtJson[]) {
    const pos = raw.pos as [number, number, number];
    const state = raw.state as number;
    const nbt = raw.nbt as NbtJson | undefined;
    blocks.push(nbt === undefined ? { pos, state } : { pos, state, nbt });
    if (nbt === undefined || nbt.id !== 'minecraft:jigsaw') continue;
    const written = /orientation=([a-z_]+)/.exec(palette[state] ?? '')?.[1] ?? 'north_up';
    const orientation = (ORIENTATIONS.has(written) ? written : 'north_up') as JigsawOrientation;
    const front = orientation.split('_')[0];
    jigsaws.push({
      pos,
      orientation,
      name: String(nbt.name ?? EMPTY),
      target: String(nbt.target ?? EMPTY),
      pool: String(nbt.pool ?? EMPTY),
      joint:
        nbt.joint === 'rollable' || nbt.joint === 'aligned'
          ? nbt.joint
          : front === 'up' || front === 'down'
            ? 'rollable'
            : 'aligned',
      finalState: String(nbt.final_state ?? 'minecraft:air'),
      selectionPriority: Number(nbt.selection_priority ?? 0),
      placementPriority: Number(nbt.placement_priority ?? 0),
    });
  }
  return { id, size: json.size as [number, number, number], jigsaws, blocks, palette };
}

function jsonFiles(dir: string, prefix: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    out.set(`${prefix}${name.slice(0, -5)}`, JSON.parse(readFileSync(join(dir, name), 'utf8')));
  }
  return out;
}

const withNs = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

function poolOf(id: string, json: unknown): PoolData {
  const pool = json as { fallback?: string; elements?: { weight?: number; element: NbtJson }[] };
  const elements: PoolElementData[] = (pool.elements ?? []).map(({ weight, element }) => {
    const out: Record<string, unknown> = {
      weight: weight ?? 1,
      type: withNs(String(element.element_type)),
      projection: element.projection === 'terrain_matching' ? 'terrain_matching' : 'rigid',
    };
    if (typeof element.location === 'string') out.location = withNs(element.location);
    if (element.processors !== undefined) out.processors = element.processors;
    if (Array.isArray(element.elements)) out.elements = element.elements;
    return out as unknown as PoolElementData;
  });
  return { id, fallback: withNs(pool.fallback ?? EMPTY), elements };
}

function structureOf(json: unknown): JigsawStructureData {
  const s = json as NbtJson;
  return {
    startPool: withNs(String(s.start_pool)),
    size: Number(s.size),
    startHeight: s.start_height,
    maxDistanceFromCenter:
      s.max_distance_from_center as JigsawStructureData['maxDistanceFromCenter'],
    useExpansionHack: s.use_expansion_hack === true,
    terrainAdaptation: 'none',
    ...(typeof s.start_jigsaw_name === 'string' ? { startJigsawName: s.start_jigsaw_name } : {}),
  };
}

interface Fixture {
  readonly templates: Map<string, PieceTemplate>;
  readonly pools: Map<string, PoolData>;
  readonly structures: Map<string, JigsawStructureData>;
  readonly lists: Map<string, unknown>;
}

function readFixture(target: string): Fixture {
  const data = join(FIXTURE, 'lowered', target, 'data', NS);
  const worldgen = join(data, 'worldgen');
  const templates = new Map<string, PieceTemplate>();
  for (const name of readdirSync(join(data, 'structure'))) {
    if (!name.endsWith('.nbt')) continue;
    const id = `${NS}:${name.slice(0, -4)}`;
    templates.set(id, readTemplate(id, join(data, 'structure', name)));
  }
  const pools = new Map<string, PoolData>();
  for (const [id, json] of jsonFiles(join(worldgen, 'template_pool/pool'), `${NS}:pool/`)) {
    pools.set(id, poolOf(id, json));
  }
  const structures = new Map<string, JigsawStructureData>();
  for (const [name, json] of jsonFiles(join(worldgen, 'structure/structure'), '')) {
    structures.set(name, structureOf(json));
  }
  const lists = jsonFiles(join(worldgen, 'processor_list/processors'), `${NS}:processors/`);
  return { templates, pools, structures, lists };
}

// --- Statistics (the GameTest's own rules) -----------------------------------------------------

function statsOf(values: readonly number[]): Stats {
  const histogram: Counts = {};
  let sum = 0;
  let squares = 0;
  for (const v of values) {
    histogram[String(v)] = (histogram[String(v)] ?? 0) + 1;
    sum += v;
    squares += v * v;
  }
  const n = values.length;
  const mean = n === 0 ? 0 : sum / n;
  const variance = n < 2 ? 0 : Math.max(0, (squares - n * mean * mean) / (n - 1));
  const round = (x: number) => Math.round(x * 10_000) / 10_000;
  return {
    histogram,
    n,
    mean: round(mean),
    sd: round(Math.sqrt(variance)),
    min: n === 0 ? 0 : Math.min(...values),
    max: n === 0 ? 0 : Math.max(...values),
  };
}

const total = (counts: Counts | undefined): number =>
  Object.values(counts ?? {}).reduce((a, b) => a + b, 0);

const keysOf = (a: object | undefined, b: object | undefined): string[] =>
  [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort();

function shares(
  path: string,
  e: Counts | undefined,
  en: number,
  m: Counts | undefined,
  mn: number,
  problems: string[],
): void {
  for (const k of keysOf(e, m)) {
    const a = e?.[k] ?? 0;
    const b = m?.[k] ?? 0;
    if (en === 0 || mn === 0) {
      if (a !== b) problems.push(`${path}.${k}: ${a} expected, ${b} measured`);
      continue;
    }
    const p1 = a / en;
    const p2 = b / mn;
    const p = (a + b) / (en + mn);
    const se = Math.sqrt(p * (1 - p) * (1 / en + 1 / mn));
    if (se === 0 ? p1 !== p2 : Math.abs(p1 - p2) / se > Z) {
      problems.push(`${path}.${k}: share ${p1.toFixed(4)} expected, ${p2.toFixed(4)} measured`);
    }
  }
}

function compareStats(path: string, e: Stats, m: Stats, problems: string[]): void {
  if (e.sd === 0 && m.sd === 0) {
    if (JSON.stringify(sorted(e)) !== JSON.stringify(sorted(m))) {
      problems.push(`${path}: expected ${JSON.stringify(e)}, measured ${JSON.stringify(m)}`);
    }
    return;
  }
  const se = Math.sqrt((e.sd * e.sd) / e.n + (m.sd * m.sd) / m.n);
  if (Math.abs(e.mean - m.mean) > Z * se) {
    problems.push(
      `${path}: mean ${e.mean} expected, ${m.mean} measured (allowed ${(Z * se).toFixed(3)})`,
    );
  }
  shares(`${path}.histogram`, e.histogram, e.n, m.histogram, m.n, problems);
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sorted((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

function exact(path: string, e: unknown, m: unknown, problems: string[]): void {
  if (JSON.stringify(sorted(e)) !== JSON.stringify(sorted(m))) {
    problems.push(`${path}: expected ${JSON.stringify(e)}, measured ${JSON.stringify(m)}`);
  }
}

// --- Assembly ----------------------------------------------------------------------------------

const TURN_OF: Readonly<Record<PieceRotation, number>> = {
  none: 0,
  clockwise_90: 1,
  clockwise_180: 2,
  counterclockwise_90: 3,
};

/** The GameTest's name of a piece's element: a template id, `list:<a>+<b>` or `feature`. */
function keyOf(piece: AssembledPiece, fixture: Fixture): string {
  const pool = fixture.pools.get(piece.pool);
  if (piece.template === null) return 'feature';
  for (const element of pool?.elements ?? []) {
    const members = (element as { elements?: { location?: string }[] }).elements;
    if (element.type !== 'minecraft:list_pool_element' || !Array.isArray(members)) continue;
    const ids = members.map((m) => withNs(String(m.location)));
    if (ids[0] === piece.template) return `list:${ids.join('+')}`;
  }
  return piece.template;
}

function jigsawOf(fixture: Fixture, piece: AssembledPiece, index: number): JigsawBlock | undefined {
  if (piece.template === null) return undefined;
  return fixture.templates.get(piece.template)?.jigsaws[index];
}

const EXACT_KEYS = [
  'unjoined',
  'illegalJoins',
  'partialOverlaps',
  'nestedInParent',
  'nestedOther',
  'pastDepth',
  'targetPoolAtLastDepth',
  'pastHorizontal',
  'pastVertical',
  'maxDepth',
  'maxHorizontal',
  'maxUp',
  'maxDown',
] as const;

function placedJigsaw(
  fixture: Fixture,
  piece: AssembledPiece,
  index: number,
): PlacedJigsaw | undefined {
  if (piece.template === null) return undefined;
  const template = fixture.templates.get(piece.template);
  if (template === undefined) return undefined;
  return pieceJigsaws(piece, template).find((j) => j.index === index);
}

function measureAssembly(fixture: Fixture, name: string, starts: number): AssemblySection {
  const structure = fixture.structures.get(name);
  if (structure === undefined) throw new Error(`no structure ${name}`);
  const distance = structure.maxDistanceFromCenter;
  const horizontal = typeof distance === 'number' ? distance : distance.horizontal;
  const vertical = typeof distance === 'number' ? distance : distance.vertical;
  const counts: number[] = [];
  const templates: Counts = {};
  const depths: Counts = {};
  const startRotations: Counts = {};
  const startJoins: Nested = {};
  const branches: Nested = {};
  const turns: Nested = {};
  const ex: Record<(typeof EXACT_KEYS)[number], number> = {
    unjoined: 0,
    illegalJoins: 0,
    partialOverlaps: 0,
    nestedInParent: 0,
    nestedOther: 0,
    pastDepth: 0,
    targetPoolAtLastDepth: 0,
    pastHorizontal: 0,
    pastVertical: 0,
    maxDepth: 0,
    maxHorizontal: 0,
    maxUp: Number.MIN_SAFE_INTEGER,
    maxDown: Number.MIN_SAFE_INTEGER,
  };
  const bump = (map: Counts, key: string) => {
    map[key] = (map[key] ?? 0) + 1;
  };
  const nested = (map: Nested, outer: string, inner: string) => {
    map[outer] ??= {};
    bump(map[outer], inner);
  };
  let noStart = 0;
  for (let seed = 0; seed < starts; seed += 1) {
    const { pieces } = assemble({
      structure,
      pools: (id) => fixture.pools.get(id) ?? null,
      templates: (id) => fixture.templates.get(id) ?? null,
      seed: BigInt(seed),
      origin: [16 * (seed % 15), 0, 16 * (Math.floor(seed / 15) % 15)],
      pieceLimit: 5000,
    });
    const start = pieces[0];
    if (start === undefined) {
      noStart += 1;
      continue;
    }
    counts.push(pieces.length);
    const sb = start.box;
    const cx = Math.trunc((sb.minX + sb.maxX) / 2);
    const cz = Math.trunc((sb.minZ + sb.maxZ) / 2);
    const startY = sb.minY + 1;
    bump(startRotations, start.rotation);
    const branch: (string | undefined)[] = [];
    for (const p of pieces) {
      const key = keyOf(p, fixture);
      bump(templates, key);
      const b = p.box;
      if (b.minX < cx - horizontal || b.maxX > cx + horizontal) ex.pastHorizontal += 1;
      else if (b.minZ < cz - horizontal || b.maxZ > cz + horizontal) ex.pastHorizontal += 1;
      const far = Math.max(cx - b.minX, b.maxX - cx, cz - b.minZ, b.maxZ - cz);
      ex.maxHorizontal = Math.max(ex.maxHorizontal, far);
      ex.maxUp = Math.max(ex.maxUp, b.maxY - startY);
      ex.maxDown = Math.max(ex.maxDown, startY - b.minY);
      if (vertical !== undefined && (b.minY < startY - vertical || b.maxY > startY + vertical)) {
        ex.pastVertical += 1;
      }
      if (p.parent === null) {
        bump(depths, '0');
        continue;
      }
      const parent = pieces[p.parent];
      if (parent === undefined || p.joinedBy === null) {
        ex.unjoined += 1;
        continue;
      }
      const pj = jigsawOf(fixture, parent, p.joinedBy.parentJigsaw);
      const pp = placedJigsaw(fixture, parent, p.joinedBy.parentJigsaw);
      const cp = placedJigsaw(fixture, p, p.joinedBy.jigsaw);
      // J1 to J4 as the GameTest checks them: the child's jigsaw stands in front of the parent's,
      // its name is the parent's target (a feature element's nameless jigsaw joins a target of
      // `minecraft:bottom`, J18), the fronts face each other and the tops agree by the joint.
      const legal =
        pp !== undefined &&
        (p.template === null
          ? pp.block.target === 'minecraft:bottom'
          : cp !== undefined &&
            cp.block.name === pp.block.target &&
            cp.pos.every((v, i) => v === (pp.pos[i] ?? 0) + (pp.front[i] ?? 0)) &&
            canJoin({ ...pp, joint: pp.block.joint }, cp));
      if (!legal) ex.illegalJoins += 1;
      bump(depths, String(p.depth));
      ex.maxDepth = Math.max(ex.maxDepth, p.depth);
      if (p.depth > structure.size + 1) ex.pastDepth += 1;
      const turn = ((((TURN_OF[p.rotation] - TURN_OF[parent.rotation]) % 4) + 4) % 4) * 90;
      nested(turns, key, String(turn));
      if (p.parent === 0) {
        branch[p.index] = pj === undefined ? undefined : pj.pos.join(',');
        if (branch[p.index] !== undefined) nested(startJoins, branch[p.index] as string, key);
      } else {
        branch[p.index] = branch[p.parent];
      }
      const through = branch[p.index];
      if (through !== undefined) nested(branches, through, key);
      if (p.depth === structure.size + 1 && pj !== undefined) {
        const target = fixture.pools.get(withNs(pj.pool));
        const fallback = target === undefined ? undefined : fixture.pools.get(target.fallback);
        if (p.pool === target?.id && p.pool !== fallback?.id) ex.targetPoolAtLastDepth += 1;
      }
    }
    for (let i = 0; i < pieces.length; i += 1) {
      for (let j = i + 1; j < pieces.length; j += 1) {
        const a = pieces[i] as AssembledPiece;
        const b = pieces[j] as AssembledPiece;
        if (!intersects(a.box, b.box)) continue;
        if (contains(a.box, b.box) || contains(b.box, a.box)) {
          if (b.parent === i || a.parent === j) ex.nestedInParent += 1;
          else ex.nestedOther += 1;
        } else ex.partialOverlaps += 1;
      }
    }
  }
  return {
    grid: 0,
    assemblies: counts.length,
    noStart,
    size: structure.size,
    maxDistance: distance,
    pieces: statsOf(counts),
    templates,
    depths,
    startRotations,
    startJoins,
    branches,
    turns,
    exact: ex,
  };
}

function compareAssembly(e: AssemblySection, m: AssemblySection): string[] {
  const problems: string[] = [];
  for (const field of ['assemblies', 'noStart', 'size', 'maxDistance'] as const) {
    exact(field, e[field], m[field], problems);
  }
  const en = e.assemblies;
  const mn = m.assemblies;
  compareStats('pieces', e.pieces, m.pieces, problems);
  const ep = total(e.templates);
  const mp = total(m.templates);
  // Every breach counter and every largest extent exactly. A child nested wholly in its parent
  // is allowed (J10); how many there are follows the random picks (the town's furniture), so
  // where both sides have some it is compared as a share of the pieces.
  const { nestedInParent: eNested = 0, ...eExact } = e.exact;
  const { nestedInParent: mNested = 0, ...mExact } = m.exact;
  exact('exact', eExact, mExact, problems);
  if (eNested === 0 || mNested === 0) exact('exact.nestedInParent', eNested, mNested, problems);
  else shares('exact', { nestedInParent: eNested }, ep, { nestedInParent: mNested }, mp, problems);
  shares('templates', e.templates, ep, m.templates, mp, problems);
  shares('depths', e.depths, ep, m.depths, mp, problems);
  shares('startRotations', e.startRotations, en, m.startRotations, mn, problems);
  for (const j of keysOf(e.startJoins, m.startJoins)) {
    shares(`startJoins.${j}`, e.startJoins[j], en, m.startJoins[j], mn, problems);
  }
  for (const j of keysOf(e.branches, m.branches)) {
    shares(`branches.${j}`, e.branches[j], en, m.branches[j], mn, problems);
  }
  for (const t of keysOf(e.turns, m.turns)) {
    shares(`turns.${t}`, e.turns[t], total(e.turns[t]), m.turns[t], total(m.turns[t]), problems);
  }
  return problems;
}

// --- Processors --------------------------------------------------------------------------------

const STAIRS =
  'minecraft:stone_brick_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]';

/**
 * Where MSM's processors and the game differ today, each with its cause; every problem of these
 * lists must start with one of the paths given, and at least one must show (so the entry is
 * removed when the engine is fixed). Both are in `packages/terrain/src/structures/processors/`.
 */
const KNOWN: Readonly<Record<string, { readonly paths: readonly string[]; readonly why: string }>> =
  {
    // The sample's palette writes the stairs without `waterlogged`; the game fills it with the
    // block's default (false) and matches the list's full state; the engine compares the
    // properties as written and does not know the defaults.
    rule_state: {
      paths: ['changed', `byInput.${STAIRS}`, 'cells.2,2,0'],
      why: 'blockstate_match against a template state that leaves a default property out',
    },
    rule_rstate: {
      paths: ['changed', `byInput.${STAIRS}`],
      why: 'random_blockstate_match against a template state that leaves a default property out',
    },
    // `isFullBlock` takes air as a full block (the game keeps the lava there) and a sea lantern
    // as not full (its name ends in "lantern"; the game places it).
    lava: {
      paths: ['byInput.minecraft:air', 'byInput.minecraft:sea_lantern'],
      why: 'lava_submerged_block: air and the sea lantern are judged the other way round',
    },
  };

/** The rows B638 made about right: held to "only outcomes the game gave". */
const ABOUT_RIGHT = new Set(['age0', 'age50', 'age100', 'rule_pos', 'lava']);

/** MSM's own tag files for the two vanilla tags the fixture names (never copied from the game). */
const TAGS: Readonly<Record<string, unknown>> = {
  'minecraft:stone_bricks': {
    values: [
      'minecraft:stone_bricks',
      'minecraft:mossy_stone_bricks',
      'minecraft:cracked_stone_bricks',
      'minecraft:chiseled_stone_bricks',
    ],
  },
  'minecraft:features_cannot_replace': {
    values: [
      'minecraft:bedrock',
      'minecraft:spawner',
      'minecraft:chest',
      'minecraft:end_portal_frame',
    ],
  },
};

const ROTATIONS: readonly PieceRotation[] = [
  'none',
  'clockwise_90',
  'clockwise_180',
  'counterclockwise_90',
];

/** SNBT's quoted string as the text inside. */
const unquote = (snbt: unknown): string => String(snbt).replace(/^"(.*)"$/, '$1');

/** A text component or string as its plain text. */
function plain(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return plain(JSON.parse(value));
    } catch {
      return value;
    }
  }
  if (value !== null && typeof value === 'object' && 'text' in value) {
    return String((value as { text: unknown }).text);
  }
  return String(value);
}

function propsOf(state: string): Record<string, string> {
  const i = state.indexOf('[');
  if (i === -1) return {};
  const out: Record<string, string> = {};
  for (const pair of state.slice(i + 1, -1).split(',')) {
    const [k, v] = pair.split('=');
    if (k !== undefined && v !== undefined) out[k] = v;
  }
  return out;
}

const idOf = (state: string): string => state.replace(/\[.*$/, '');

/**
 * Writes MSM's states as the game reads them back. The game fills a state's other properties
 * from the block's defaults, which MSM does not know (B638), so `minecraft:tnt` is the game's
 * `minecraft:tnt[unstable=false]`: an MSM state is taken as the one state the game wrote anywhere
 * in the section with the same block and every property MSM names equal.
 */
function canonicaliser(section: ProcessorsSection): (state: string) => string {
  const known = new Set<string>();
  for (const list of Object.values(section.lists)) {
    for (const [input, outs] of Object.entries(list.byInput)) {
      known.add(input);
      for (const out of Object.keys(outs)) known.add(out);
    }
  }
  const cache = new Map<string, string>();
  return (state) => {
    if (known.has(state)) return state;
    const kept = cache.get(state);
    if (kept !== undefined) return kept;
    const want = propsOf(state);
    const matches = [...known].filter(
      (g) => idOf(g) === idOf(state) && Object.entries(want).every(([k, v]) => propsOf(g)[k] === v),
    );
    const out = matches.length === 1 ? (matches[0] as string) : state;
    cache.set(state, out);
    return out;
  };
}

interface MeasuredList {
  readonly section: ListSection;
  readonly loot: Record<string, string>;
  readonly names: Record<string, string>;
}

function measureList(
  fixture: Fixture,
  name: string,
  expected: ProcessorsSection,
  inputs: Record<string, string>,
): MeasuredList {
  const pool = fixture.pools.get(`${NS}:pool/proc_${name}`);
  const element = pool?.elements[0];
  if (element === undefined) throw new Error(`no pool for ${name}`);
  const template = fixture.templates.get(withNs(String(element.location)));
  if (template === undefined) throw new Error(`no sample for ${name}`);
  const processors = element.processors;
  const list =
    typeof processors === 'string' ? (fixture.lists.get(processors) ?? processors) : processors;
  const listJson = expected.lists[name];
  if (listJson === undefined) throw new Error(`no expectations for ${name}`);
  const background = listJson.background;
  const canon = canonicaliser(expected);
  const byPos = new Map<string, string>();
  for (const b of template.blocks ?? [])
    byPos.set(b.pos.join(','), template.palette[b.state] ?? '');
  const byInput: Nested = {};
  const cells: Record<string, string> = {};
  const changed: number[] = [];
  const loot: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (let k = 0; k < expected.placements; k += 1) {
    const result = processTemplate(
      {
        template,
        list,
        rotation: ROTATIONS[k % 4] as PieceRotation,
        origin: [32 * k, expected.floorY, 0],
        seed: BigInt(1000 + k),
        world: { blockAt: () => background, surfaceAt: () => expected.floorY },
      },
      { blockTag: (id) => TAGS[id], element: { type: element.type } },
    );
    expect(result.refused, name).toBeNull();
    const after = new Map<string, TemplateBlock>();
    for (const b of result.after) after.set(b.pos.join(','), b);
    let differ = 0;
    for (const [cell, input] of Object.entries(inputs)) {
      const placed = after.get(cell);
      let out: string;
      if (placed === undefined) out = '(background)';
      else {
        const state = result.palette[placed.state] ?? '';
        out = state === byPos.get(cell) ? input : canon(state);
        const nbt = placed.nbt as Record<string, unknown> | undefined;
        if (nbt?.LootTable !== undefined) loot[cell] = String(nbt.LootTable);
        if (nbt?.CustomName !== undefined) names[cell] = plain(nbt.CustomName);
      }
      if (input === '(void)' ? out !== '(background)' : input !== out) differ += 1;
      byInput[input] ??= {};
      byInput[input][out] = (byInput[input][out] ?? 0) + 1;
      if (!listJson.random) cells[cell] = out;
    }
    changed.push(differ);
  }
  return {
    section: {
      random: listJson.random,
      background,
      changed: statsOf(changed),
      byInput,
      ...(listJson.random ? {} : { cells }),
    },
    loot,
    names,
  };
}

function compareList(name: string, e: ListSection, measured: MeasuredList): string[] {
  const problems: string[] = [];
  const m = measured.section;
  if (e.blockEntities !== undefined) {
    for (const [cell, entity] of Object.entries(e.blockEntities)) {
      if (entity.LootTable !== undefined) {
        exact(
          `blockEntities.${cell}.LootTable`,
          unquote(entity.LootTable),
          measured.loot[cell],
          problems,
        );
      }
      if (entity.CustomName !== undefined) {
        exact(
          `blockEntities.${cell}.CustomName`,
          plain(unquote(entity.CustomName)),
          measured.names[cell],
          problems,
        );
      }
    }
  }
  if (ABOUT_RIGHT.has(name)) {
    // About right: every outcome MSM gives for a block is one the game gave for it.
    // MSM's state may name fewer properties than the game's (the game fills its defaults).
    for (const [input, outs] of Object.entries(m.byInput)) {
      const seen = Object.keys(e.byInput[input] ?? {});
      for (const out of Object.keys(outs)) {
        const want = propsOf(out);
        const happened = seen.some(
          (g) =>
            idOf(g) === idOf(out) && Object.entries(want).every(([k, v]) => propsOf(g)[k] === v),
        );
        if (!happened) problems.push(`byInput.${input}: ${out} never happened in the game`);
      }
    }
    return problems;
  }
  if (!e.random) {
    exact('changed', e.changed, m.changed, problems);
    for (const input of keysOf(e.byInput, m.byInput)) {
      exact(`byInput.${input}`, e.byInput[input], m.byInput[input], problems);
    }
    for (const cell of keysOf(e.cells, m.cells)) {
      exact(`cells.${cell}`, e.cells?.[cell], m.cells?.[cell], problems);
    }
    return problems;
  }
  compareStats('changed', e.changed, m.changed, problems);
  for (const input of keysOf(e.byInput, m.byInput)) {
    shares(
      `byInput.${input}`,
      e.byInput[input],
      total(e.byInput[input]),
      m.byInput[input],
      total(m.byInput[input]),
      problems,
    );
  }
  return problems;
}

// --- The tests ---------------------------------------------------------------------------------

/** Every target the fixture is lowered for (the folders of `lowered/`, one per built-in target). */
const TARGETS = readdirSync(join(FIXTURE, 'lowered')).sort();

it('has expectations for every target the fixture is lowered for, at least two', () => {
  expect(TARGETS.length).toBeGreaterThanOrEqual(2);
  expect(Object.keys(expectations.targets).sort()).toEqual(TARGETS);
});

describe.each(TARGETS)('the structures parity fixture on %s', (target) => {
  const section = expectations.targets[target];
  const fixture = readFixture(target);

  it('has expectations and files for every structure and list', () => {
    expect(section).toBeDefined();
    expect(Object.keys(section?.assembly ?? {}).length).toBe(36);
    for (const name of Object.keys(section?.assembly ?? {})) {
      expect(fixture.structures.has(name), name).toBe(true);
    }
    expect(Object.keys(section?.processors.lists ?? {}).length).toBe(30);
  });

  it.each(Object.keys(section?.assembly ?? {}))(
    'assembles %s as the game does, within the tolerance',
    (name) => {
      const expected = section?.assembly[name] as AssemblySection;
      const measured = measureAssembly(fixture, name, expected.assemblies);
      expect(compareAssembly(expected, measured)).toEqual([]);
    },
  );

  it.each(Object.keys(section?.processors.lists ?? {}))(
    'applies the processor list %s as the game does, within the tolerance',
    (name) => {
      const processors = section?.processors as ProcessorsSection;
      const none = processors.lists.none?.cells ?? {};
      const inputs = Object.fromEntries(
        Object.entries(none).map(([cell, out]) => [cell, out === '(background)' ? '(void)' : out]),
      );
      const measured = measureList(fixture, name, processors, inputs);
      const problems = compareList(name, processors.lists[name] as ListSection, measured);
      const known = KNOWN[name];
      if (known === undefined) {
        expect(problems).toEqual([]);
        return;
      }
      expect(
        problems.filter((problem) => !known.paths.some((path) => problem.startsWith(path))),
        known.why,
      ).toEqual([]);
      expect(problems.length, `${known.why}: fixed? Remove the entry from KNOWN.`).toBeGreaterThan(
        0,
      );
    },
  );
});
