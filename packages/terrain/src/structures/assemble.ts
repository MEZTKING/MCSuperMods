/**
 * The jigsaw assembler (ADR 0122 D2, D4, D5; B637). Written clean room from the rules J1 to J20
 * the spike B634 observed on the real server with MSM's own fixture pools
 * (`docs/reference/spikes/b634/README.md`, "Jigsaw rules for B637"); no Mojang method body was
 * read. The game's own order of random draws is its code, so a seed here picks MSM's own pieces
 * (limit 4L1: "A building your pools can make. The one in your world will differ.").
 *
 * The rules as built:
 * - J1, J5: a child joins through any of its jigsaws whose `name` is the parent jigsaw's `target`.
 * - J2 to J4: the child's jigsaw stands in front of the parent's, facing it; horizontal meets
 *   horizontal (top up); a vertical parent's `joint` decides (aligned: the same top; rollable: any
 *   of the four turns, tried in a random order).
 * - J6, J7: elements drawn by weight without putting back; a refused one gives way to the next; an
 *   `empty_pool_element` is a valid pick that leaves the jigsaw empty (no fallback after it).
 * - J8: when nothing of the pool fits, its `fallback` pool is tried; fallback pieces expand alike.
 * - J9, J10: a new box may not share a block with a placed box, except a child lying wholly inside
 *   its parent's box, which may overlap the pieces that wholly hold it (the parent and those around
 *   it) and nothing else; two such children may not overlap each other (not measured; kept apart).
 * - J11: depth 1 to `size` from the target pool (then its fallback); a piece at depth `size` fills
 *   its jigsaws from the fallback pool only; pieces at `size + 1` are not expanded; `size` 0 makes
 *   no structure.
 * - J12, J13: every box within the start box's centre ± the horizontal limit (centre by integer
 *   division truncating toward zero) and within the start height ± the vertical limit; the object
 *   form without `vertical` does not limit height.
 * - J14: a piece's jigsaws shuffled, then sorted by `selection_priority`, highest first.
 * - J15: placed pieces expanded breadth first, the queue ordered by the `placement_priority` of the
 *   parent jigsaw that placed them, highest first; the child's own value is not read.
 * - J16: the start piece's origin at the start chunk's minimum corner turned about it by one draw,
 *   its bottom at the start height − 1; with `start_jigsaw_name`, a jigsaw of that name (one drawn
 *   among them) at the start position instead.
 * - J18: a list element places all its templates at one origin and turn: one piece whose box holds
 *   them all, named by its first template, joining and expanding through that template's jigsaws; a
 *   feature element is a one-block piece joined at a jigsaw whose target is `minecraft:bottom`.
 * - J19 (limit 4L5): `terrain_matching` is kept on the piece but placed as `rigid` (a flat floor).
 * - 4L9: when a piece past `pieceLimit` fits, the assembly stops instead of placing it ("Stopped at
 *   500 pieces."); an assembly that ends at exactly the limit is done.
 *
 * Not applied (only in the game): `use_expansion_hack`, pool aliases, `dimension_padding`,
 * `liquid_settings`, the newer target's `corner_constraint`, projection onto generated land, and
 * which piece a world seed picks. The joined jigsaw of a child is not tried again: its neighbour is
 * the parent's jigsaw, so any piece through it would overlap the parent and be refused.
 *
 * Steps (D5): every element that can be placed is announced by `tried` and answered by `placed` or
 * `refused` with a reason (or by the stop at the piece limit); an `empty` pick is a `tried` with no
 * template and nothing after it. The start piece's tries name the parent and jigsaw −1. A
 * `maxDistanceFromCenter` object read without `vertical` limits no height (pass `Infinity`).
 */

import type {
  AssembledPiece,
  Assembly,
  AssemblyInput,
  AssemblyStep,
  PieceBox,
  PieceRotation,
  PieceTemplate,
  PoolData,
  PoolElementData,
  Projection,
  RefusalReason,
} from './api';
import type { Vec3 } from './boxes';
import {
  BoxIndex,
  boxAt,
  contains,
  horizontalCentre,
  unionBox,
  withinHorizontal,
  withinVertical,
} from './boxes';
import {
  AssemblyRandom,
  canJoin,
  type PreparedTemplate,
  prepareTemplate,
  ROTATIONS,
  resourceId,
  type TurnedJigsaw,
} from './jigsaw';

export { horizontalCentre } from './boxes';
export { canJoin, pieceJigsaws, pieceOrigin, rotateVec } from './jigsaw';

/** The pool id and target that mean "nothing" in the data. */
const EMPTY = 'minecraft:empty';

/** The target a jigsaw names to take a feature element (J18). */
export const FEATURE_TARGET = 'minecraft:bottom';

/** The line a view shows when an assembly stops at its piece limit (4L9). */
export function stoppedLine(pieces: number): string {
  return `Stopped at ${pieces} pieces.`;
}

/** The piece limit when the user has not raised it (4L9). */
export const DEFAULT_PIECE_LIMIT = 500;

/**
 * A feature element as a piece: one block, one jigsaw facing down named `minecraft:bottom`, so it
 * joins only a jigsaw facing up whose target is that name (J18; the box of a feature piece was not
 * measured, 4L6).
 */
export const FEATURE_PIECE: PieceTemplate = {
  id: 'msm:feature_piece',
  size: [1, 1, 1],
  jigsaws: [
    {
      pos: [0, 0, 0],
      orientation: 'down_north',
      name: FEATURE_TARGET,
      target: EMPTY,
      pool: EMPTY,
      joint: 'rollable',
      finalState: 'minecraft:air',
      selectionPriority: 0,
      placementPriority: 0,
    },
  ],
  blocks: [],
  palette: [],
};

/** One template of an element, ready to place. */
interface Member {
  readonly id: string | null;
  readonly prepared: PreparedTemplate;
  readonly source: AssembledPiece['source'];
  readonly processors: string | null;
}

/** A pool element read for placing. */
type Element =
  | { readonly kind: 'empty' }
  | { readonly kind: 'unsupported'; readonly type: string }
  | {
      readonly kind: 'pieces';
      /** The members; the first joins and expands (a single element has one). */
      readonly members: readonly MemberRef[];
      readonly projection: Projection;
      readonly feature: boolean;
    };

interface MemberRef {
  readonly location: string | null;
  readonly processors: string | null;
}

/** A placed piece and what the assembler keeps about it. */
interface Placed {
  readonly piece: AssembledPiece;
  readonly origin: Vec3;
  readonly turn: number;
  readonly lead: PreparedTemplate;
  /** The jigsaw of this piece that joined it to its parent (not tried again). */
  readonly joined: number | null;
}

/** The result of fitting one element at one parent jigsaw. */
type Fit =
  | {
      readonly ok: true;
      readonly origin: Vec3;
      readonly turn: number;
      readonly jigsaw: number;
      readonly box: PieceBox;
    }
  | { readonly ok: false; readonly reason: RefusalReason };

const REASON_RANK: readonly RefusalReason[] = [
  'no_matching_jigsaw',
  'too_far_from_start',
  'too_high_or_low',
  'overlaps_a_piece',
];

const namespaced = resourceId;

function processorsId(value: unknown): string | null {
  return typeof value === 'string' && namespaced(value) !== EMPTY ? namespaced(value) : null;
}

function readElement(data: PoolElementData): Element {
  const type = namespaced(String(data.type ?? ''));
  const projection: Projection =
    data.projection === 'terrain_matching' ? 'terrain_matching' : 'rigid';
  switch (type) {
    case 'minecraft:empty_pool_element':
      return { kind: 'empty' };
    case 'minecraft:single_pool_element':
    case 'minecraft:legacy_single_pool_element':
      if (typeof data.location !== 'string') return { kind: 'unsupported', type };
      return {
        kind: 'pieces',
        members: [
          { location: namespaced(data.location), processors: processorsId(data.processors) },
        ],
        projection,
        feature: false,
      };
    case 'minecraft:feature_pool_element':
      return {
        kind: 'pieces',
        members: [{ location: null, processors: null }],
        projection,
        feature: true,
      };
    case 'minecraft:list_pool_element': {
      const inner = (data as { readonly elements?: unknown }).elements;
      if (!Array.isArray(inner) || inner.length === 0) return { kind: 'unsupported', type };
      const members: MemberRef[] = [];
      for (const raw of inner) {
        if (typeof raw !== 'object' || raw === null) return { kind: 'unsupported', type };
        const e = raw as {
          type?: unknown;
          element_type?: unknown;
          location?: unknown;
          processors?: unknown;
        };
        const t = namespaced(String(e.type ?? e.element_type ?? ''));
        if (t === 'minecraft:empty_pool_element') continue;
        if (
          (t !== 'minecraft:single_pool_element' && t !== 'minecraft:legacy_single_pool_element') ||
          typeof e.location !== 'string'
        ) {
          return { kind: 'unsupported', type };
        }
        members.push({ location: namespaced(e.location), processors: processorsId(e.processors) });
      }
      if (members.length === 0) return { kind: 'empty' };
      return { kind: 'pieces', members, projection, feature: false };
    }
    default:
      return { kind: 'unsupported', type };
  }
}

function sourceOf(template: PieceTemplate): AssembledPiece['source'] {
  if (template.blocks === null) return 'box';
  return template.id.startsWith('minecraft:') ? 'vanilla' : 'project';
}

/** The horizontal and vertical limits (J12, J13); `Infinity` where the data sets none. */
function distanceLimits(value: AssemblyInput['structure']['maxDistanceFromCenter']): {
  readonly horizontal: number;
  readonly vertical: number;
} {
  if (typeof value === 'number') return { horizontal: value, vertical: value };
  return {
    horizontal: value.horizontal,
    vertical: typeof value.vertical === 'number' ? value.vertical : Number.POSITIVE_INFINITY,
  };
}

/** The steps of an assembly, one at a time (D5). The last step is always `stopped`. */
export function* assembleSteps(input: AssemblyInput): Generator<AssemblyStep, void, undefined> {
  yield* new Assembler(input).run();
}

/** The whole assembly of one seed. */
export function assemble(input: AssemblyInput): Assembly {
  const steps: AssemblyStep[] = [];
  const pieces: AssembledPiece[] = [];
  let stoppedAtLimit = false;
  for (const step of assembleSteps(input)) {
    steps.push(step);
    if (step.kind === 'placed') pieces.push(step.piece);
    else if (step.kind === 'stopped') stoppedAtLimit = step.reason === 'piece_limit';
  }
  return { pieces, steps, stoppedAtLimit };
}

class Assembler {
  private readonly random: AssemblyRandom;
  private readonly placed: Placed[] = [];
  private readonly index = new BoxIndex();
  /** Pieces waiting to expand: highest priority first, then in placing order (J15). */
  private readonly queue: { readonly piece: number; readonly priority: number }[] = [];
  private readonly pools = new Map<string, PoolData | null>();
  private readonly elements = new Map<string, readonly Element[]>();
  private readonly templates = new Map<string, PieceTemplate | null>();
  private readonly size: number;
  private readonly limit: number;
  private readonly horizontal: number;
  private readonly vertical: number;
  private readonly startY: number;
  private centre: readonly [number, number] = [0, 0];
  /** Set when the piece limit stopped the assembly. */
  private halted = false;

  private readonly input: AssemblyInput;

  constructor(input: AssemblyInput) {
    this.input = input;
    this.random = new AssemblyRandom(input.seed);
    this.size = Math.max(0, Math.floor(input.structure.size));
    this.limit = Math.max(1, Math.floor(input.pieceLimit));
    const limits = distanceLimits(input.structure.maxDistanceFromCenter);
    this.horizontal = limits.horizontal;
    this.vertical = limits.vertical;
    this.startY = input.origin[1];
  }

  *run(): Generator<AssemblyStep, void, undefined> {
    const startPool = namespaced(this.input.structure.startPool);
    if (this.size === 0) {
      // J11: size 0 decodes but makes no structure.
      yield refused(startPool, null, -1, -1, 'past_depth_limit');
      yield { kind: 'stopped', reason: 'done', pieces: 0 };
      return;
    }
    yield* this.placeStart(startPool);
    if (this.placed.length === 0) {
      yield { kind: 'stopped', reason: 'done', pieces: 0 };
      return;
    }
    for (;;) {
      const next = this.queue.shift();
      if (!next) break;
      const parent = this.placed[next.piece] as Placed;
      for (const jigsaw of this.jigsawOrder(parent)) {
        if (jigsaw.index === parent.joined) continue;
        const pool = namespaced(jigsaw.block.pool);
        if (pool === EMPTY) continue;
        if (parent.piece.depth > this.size) {
          yield refused(pool, null, next.piece, jigsaw.index, 'past_depth_limit');
          continue;
        }
        yield* this.fillJigsaw(next.piece, jigsaw, pool);
        if (this.halted) return;
      }
    }
    yield { kind: 'stopped', reason: 'done', pieces: this.placed.length };
  }

  /** J14: shuffled, then by selection priority, highest first (a stable sort keeps the shuffle). */
  private jigsawOrder(parent: Placed): TurnedJigsaw[] {
    const list = [...(parent.lead.byTurn[parent.turn] ?? [])];
    this.random.shuffle(list);
    return list.sort((a, b) => b.block.selectionPriority - a.block.selectionPriority);
  }

  private pool(id: string): PoolData | null {
    if (!this.pools.has(id)) this.pools.set(id, this.input.pools(id));
    return this.pools.get(id) ?? null;
  }

  private poolElements(pool: PoolData): readonly Element[] {
    let list = this.elements.get(pool.id);
    if (!list) {
      list = pool.elements.map(readElement);
      this.elements.set(pool.id, list);
    }
    return list;
  }

  private template(id: string): PieceTemplate | null {
    if (!this.templates.has(id)) this.templates.set(id, this.input.templates(id));
    return this.templates.get(id) ?? null;
  }

  /** The members of a pieces element, or the id of the first template neither source has. */
  private members(element: Extract<Element, { kind: 'pieces' }>): Member[] | string {
    if (element.feature) {
      return [
        { id: null, prepared: prepareTemplate(FEATURE_PIECE), source: 'project', processors: null },
      ];
    }
    const out: Member[] = [];
    for (const ref of element.members) {
      const id = ref.location as string;
      const template = this.template(id);
      if (!template) return id;
      out.push({
        id,
        prepared: prepareTemplate(template),
        source: sourceOf(template),
        processors: ref.processors,
      });
    }
    return out;
  }

  private *placeStart(poolId: string): Generator<AssemblyStep, void, undefined> {
    const pool = this.pool(poolId);
    if (!pool) {
      yield refused(poolId, null, -1, -1, 'pool_missing');
      return;
    }
    const elements = this.poolElements(pool);
    if (elements.length === 0) {
      yield refused(poolId, null, -1, -1, 'pool_empty');
      return;
    }
    // J16: one draw turns the start piece.
    const turn = this.random.nextInt(4);
    const startName = this.input.structure.startJigsawName;
    const [ox, oy, oz] = this.input.origin;
    for (const i of this.random.weightedOrder(pool.elements.map((e) => e.weight))) {
      const element = elements[i] as Element;
      if (element.kind === 'empty') {
        yield tried(poolId, null, -1, -1);
        continue;
      }
      if (element.kind === 'unsupported') {
        yield refused(poolId, null, -1, -1, 'unsupported_element');
        continue;
      }
      const members = this.members(element);
      if (typeof members === 'string') {
        yield refused(poolId, members, -1, -1, 'template_missing');
        continue;
      }
      const lead = members[0] as Member;
      yield tried(poolId, lead.id, -1, -1);
      let origin: Vec3 = [ox, oy - 1, oz];
      if (startName !== undefined) {
        const named = lead.prepared.byName.get(namespaced(startName)) ?? [];
        if (named.length === 0) {
          yield refused(poolId, lead.id, -1, -1, 'no_matching_jigsaw');
          continue;
        }
        const j = lead.prepared.byTurn[turn]?.[named[this.random.nextInt(named.length)] as number];
        if (!j) continue;
        origin = [ox - j.pos[0], oy - j.pos[1], oz - j.pos[2]];
      }
      const box = membersBox(members, origin, turn);
      this.centre = horizontalCentre(box);
      yield this.place({
        parent: null,
        depth: 0,
        pool: poolId,
        members,
        origin,
        turn,
        box,
        joinedBy: null,
        projection: element.projection,
        priority: 0,
      });
      return;
    }
  }

  private *fillJigsaw(
    parentIndex: number,
    jigsaw: TurnedJigsaw,
    poolId: string,
  ): Generator<AssemblyStep, void, undefined> {
    const parent = this.placed[parentIndex] as Placed;
    const pool = this.pool(poolId);
    if (!pool) {
      yield refused(poolId, null, parentIndex, jigsaw.index, 'pool_missing');
      return;
    }
    const order: string[] = [];
    if (parent.piece.depth < this.size) order.push(poolId);
    else yield refused(poolId, null, parentIndex, jigsaw.index, 'past_depth_limit');
    const fallback = namespaced(pool.fallback || EMPTY);
    if (fallback !== EMPTY) order.push(fallback);

    for (const id of order) {
      const p = id === poolId ? pool : this.pool(id);
      if (!p) {
        yield refused(id, null, parentIndex, jigsaw.index, 'pool_missing');
        continue;
      }
      const elements = this.poolElements(p);
      if (elements.length === 0) {
        yield refused(id, null, parentIndex, jigsaw.index, 'pool_empty');
        continue;
      }
      for (const i of this.random.weightedOrder(p.elements.map((e) => e.weight))) {
        const element = elements[i] as Element;
        if (element.kind === 'empty') {
          // J7: a valid pick that leaves the jigsaw empty; no fallback follows.
          yield tried(id, null, parentIndex, jigsaw.index);
          return;
        }
        if (element.kind === 'unsupported') {
          yield refused(id, null, parentIndex, jigsaw.index, 'unsupported_element');
          continue;
        }
        const members = this.members(element);
        if (typeof members === 'string') {
          yield refused(id, members, parentIndex, jigsaw.index, 'template_missing');
          continue;
        }
        const lead = members[0] as Member;
        yield tried(id, lead.id, parentIndex, jigsaw.index);
        const fit = this.fit(parent, jigsaw, members);
        if (!fit.ok) {
          yield refused(id, lead.id, parentIndex, jigsaw.index, fit.reason);
          continue;
        }
        if (this.placed.length >= this.limit) {
          // 4L9: the piece past the limit fitted; stop instead of placing it.
          this.halted = true;
          yield { kind: 'stopped', reason: 'piece_limit', pieces: this.placed.length };
          return;
        }
        yield this.place({
          parent: parentIndex,
          depth: parent.piece.depth + 1,
          pool: id,
          members,
          origin: fit.origin,
          turn: fit.turn,
          box: fit.box,
          joinedBy: { parentJigsaw: jigsaw.index, jigsaw: fit.jigsaw },
          projection: element.projection,
          priority: jigsaw.block.placementPriority,
        });
        return;
      }
    }
  }

  /** J1 to J5, J9, J10, J12, J13: the first turn and child jigsaw that fit, drawn at random. */
  private fit(parent: Placed, jigsaw: TurnedJigsaw, members: readonly Member[]): Fit {
    const lead = (members[0] as Member).prepared;
    const names = lead.byName.get(namespaced(jigsaw.block.target));
    let rank = 0;
    if (!names || names.length === 0) return { ok: false, reason: 'no_matching_jigsaw' };
    const at: Vec3 = [
      parent.origin[0] + jigsaw.pos[0] + jigsaw.front[0],
      parent.origin[1] + jigsaw.pos[1] + jigsaw.front[1],
      parent.origin[2] + jigsaw.pos[2] + jigsaw.front[2],
    ];
    const join = { front: jigsaw.front, top: jigsaw.top, joint: jigsaw.block.joint };
    for (const turn of this.random.shuffle([0, 1, 2, 3])) {
      const turned = lead.byTurn[turn] ?? [];
      for (const ci of this.random.shuffle([...names])) {
        const child = turned[ci];
        if (!child || !canJoin(join, child)) continue;
        const origin: Vec3 = [at[0] - child.pos[0], at[1] - child.pos[1], at[2] - child.pos[2]];
        const box = membersBox(members, origin, turn);
        if (!withinHorizontal(box, this.centre, this.horizontal)) {
          rank = Math.max(rank, 1);
          continue;
        }
        if (!withinVertical(box, this.startY, this.vertical)) {
          rank = Math.max(rank, 2);
          continue;
        }
        if (this.overlaps(box, parent)) {
          rank = Math.max(rank, 3);
          continue;
        }
        return { ok: true, origin, turn, jigsaw: ci, box };
      }
    }
    return { ok: false, reason: REASON_RANK[rank] as RefusalReason };
  }

  /** J9, J10. */
  private overlaps(box: PieceBox, parent: Placed): boolean {
    const hits = this.index.intersecting(box);
    if (hits.length === 0) return false;
    if (!contains(parent.piece.box, box)) return true;
    for (const id of hits) {
      const other = this.index.box(id);
      if (!other || !contains(other, box)) return true;
    }
    return false;
  }

  private place(p: {
    readonly parent: number | null;
    readonly depth: number;
    readonly pool: string;
    readonly members: readonly Member[];
    readonly origin: Vec3;
    readonly turn: number;
    readonly box: PieceBox;
    readonly joinedBy: AssembledPiece['joinedBy'];
    readonly projection: Projection;
    readonly priority: number;
  }): AssemblyStep {
    const lead = p.members[0] as Member;
    const piece: AssembledPiece = {
      index: this.placed.length,
      parent: p.parent,
      depth: p.depth,
      template: lead.id,
      pool: p.pool,
      box: p.box,
      rotation: ROTATIONS[p.turn] as PieceRotation,
      joinedBy: p.joinedBy,
      processors: lead.processors,
      projection: p.projection,
      source: lead.source,
    };
    this.placed.push({
      piece,
      origin: p.origin,
      turn: p.turn,
      lead: lead.prepared,
      joined: p.joinedBy ? p.joinedBy.jigsaw : null,
    });
    this.index.insert(piece.index, piece.box);
    // J15: after every queued piece of the same or a higher priority.
    let at = this.queue.length;
    while (at > 0 && (this.queue[at - 1] as { priority: number }).priority < p.priority) at -= 1;
    this.queue.splice(at, 0, { piece: piece.index, priority: p.priority });
    return { kind: 'placed', piece };
  }
}

function membersBox(members: readonly Member[], origin: Vec3, turn: number): PieceBox {
  let box: PieceBox | null = null;
  for (const m of members) {
    const rel = m.prepared.boxes[turn] as PieceBox;
    const b = boxAt(rel, origin);
    box = box ? unionBox(box, b) : b;
  }
  return box as PieceBox;
}

function tried(
  pool: string,
  template: string | null,
  parent: number,
  parentJigsaw: number,
): AssemblyStep {
  return { kind: 'tried', pool, template, parent, parentJigsaw };
}

function refused(
  pool: string,
  template: string | null,
  parent: number,
  parentJigsaw: number,
  reason: RefusalReason,
): AssemblyStep {
  return { kind: 'refused', pool, template, parent, parentJigsaw, reason };
}
