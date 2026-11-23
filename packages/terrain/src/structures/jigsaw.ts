/**
 * Jigsaw blocks, turns and the assembler's own random (B637; spike B634 rules J1 to J5, J14, J16).
 * Written from the data's fields and the game's observed behaviour only: the 12 orientations
 * (front, then top), a turn about the vertical axis through the piece's origin (the spike's
 * `s1_named` start offsets confirm the direction), and the join rule of a parent jigsaw and a
 * child jigsaw. Pure.
 */

import type {
  AssembledPiece,
  JigsawBlock,
  JigsawOrientation,
  PieceBox,
  PieceRotation,
  PieceTemplate,
} from './api';
import type { Vec3 } from './boxes';
import { boxAt } from './boxes';

/** The four turns in quarter turns clockwise: index 0 to 3. */
export const ROTATIONS: readonly PieceRotation[] = [
  'none',
  'clockwise_90',
  'clockwise_180',
  'counterclockwise_90',
];

/** An id with its namespace written out (`street` is `minecraft:street`, as the data reads it). */
export function resourceId(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/** A turn's number of quarter turns clockwise. */
export function rotationIndex(rotation: PieceRotation): number {
  const i = ROTATIONS.indexOf(rotation);
  return Math.max(i, 0);
}

const DIRECTIONS: Readonly<Record<string, Vec3>> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

/** The front and top of an orientation as unit vectors (the name is front, then top). */
export function orientationVectors(orientation: JigsawOrientation): {
  readonly front: Vec3;
  readonly top: Vec3;
} {
  const [front, top] = orientation.split('_');
  const f = DIRECTIONS[front ?? ''];
  const t = DIRECTIONS[top ?? ''];
  if (!f || !t) throw new Error(`Unknown jigsaw orientation "${orientation}".`);
  return { front: f, top: t };
}

/**
 * A vector or a template position turned clockwise (seen from above) by `turns` quarter turns
 * about the origin: north to east to south to west.
 */
export function rotateVec(v: Vec3, turns: number): Vec3 {
  switch (((turns % 4) + 4) % 4) {
    case 1:
      return [-v[2], v[1], v[0]];
    case 2:
      return [-v[0], v[1], -v[2]];
    case 3:
      return [v[2], v[1], -v[0]];
    default:
      return [v[0], v[1], v[2]];
  }
}

/** The box a template of `size` covers after the turn, with its origin at 0, 0, 0. */
export function rotatedBox(size: Vec3, turns: number): PieceBox {
  const a = rotateVec([0, 0, 0], turns);
  const b = rotateVec([size[0] - 1, size[1] - 1, size[2] - 1], turns);
  return {
    minX: Math.min(a[0], b[0]),
    minY: 0,
    minZ: Math.min(a[2], b[2]),
    maxX: Math.max(a[0], b[0]),
    maxY: size[1] - 1,
    maxZ: Math.max(a[2], b[2]),
  };
}

export function sameVec(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** One jigsaw of a template, turned. */
export interface TurnedJigsaw {
  /** Its index in the template's own list. */
  readonly index: number;
  readonly block: JigsawBlock;
  /** Its place relative to the piece's origin after the turn. */
  readonly pos: Vec3;
  readonly front: Vec3;
  readonly top: Vec3;
}

/** A template ready for joining: its jigsaws and box for each of the four turns. */
export interface PreparedTemplate {
  readonly template: PieceTemplate;
  /** `byTurn[t]` lists every jigsaw in the template's order, turned by `t`. */
  readonly byTurn: readonly (readonly TurnedJigsaw[])[];
  /** `boxes[t]`: the box after turn `t`, relative to the piece's origin. */
  readonly boxes: readonly PieceBox[];
  /** The jigsaws' indexes by `name`, with the namespace written out (J1, J5). */
  readonly byName: ReadonlyMap<string, readonly number[]>;
}

const prepared = new WeakMap<PieceTemplate, PreparedTemplate>();

/**
 * The template's jigsaws and boxes for the four turns. Kept per template object, so a host that
 * hands the same parsed template again (one parse per pool, spike finding 6) reuses the work across
 * assemblies; an edited template is a new object and is prepared afresh.
 */
export function prepareTemplate(template: PieceTemplate): PreparedTemplate {
  const known = prepared.get(template);
  if (known) return known;
  const size: Vec3 = [template.size[0], template.size[1], template.size[2]];
  const byTurn: TurnedJigsaw[][] = [];
  const boxes: PieceBox[] = [];
  for (let t = 0; t < 4; t += 1) {
    boxes.push(rotatedBox(size, t));
    byTurn.push(
      template.jigsaws.map((block, index) => {
        const { front, top } = orientationVectors(block.orientation);
        return {
          index,
          block,
          pos: rotateVec(block.pos, t),
          front: rotateVec(front, t),
          top: rotateVec(top, t),
        };
      }),
    );
  }
  const byName = new Map<string, number[]>();
  template.jigsaws.forEach((block, index) => {
    const name = resourceId(block.name);
    const list = byName.get(name);
    if (list) list.push(index);
    else byName.set(name, [index]);
  });
  const result: PreparedTemplate = { template, byTurn, boxes, byName };
  prepared.set(template, result);
  return result;
}

/**
 * J2 to J4: whether a child jigsaw (already turned) may meet a parent jigsaw. The child faces the
 * parent (opposite fronts). A horizontal parent takes only a horizontal child with the top up. A
 * vertical parent: when the parent's `joint` is `aligned` the tops are the same; when `rollable`
 * any top (the four turns are tried in a random order, so each is equally likely). The child's own
 * `joint` is never read (J4), nor its `target` (J1).
 */
export function canJoin(
  parent: { readonly front: Vec3; readonly top: Vec3; readonly joint: 'rollable' | 'aligned' },
  child: { readonly front: Vec3; readonly top: Vec3 },
): boolean {
  if (
    child.front[0] !== -parent.front[0] ||
    child.front[1] !== -parent.front[1] ||
    child.front[2] !== -parent.front[2]
  ) {
    return false;
  }
  if (parent.front[1] === 0) return child.top[1] === 1;
  return parent.joint === 'rollable' || sameVec(parent.top, child.top);
}

/** The origin of a placed piece: where the template's 0, 0, 0 landed, from its box and turn. */
export function pieceOrigin(
  piece: Pick<AssembledPiece, 'box' | 'rotation'>,
  size: readonly [number, number, number],
): Vec3 {
  const rel = rotatedBox([size[0], size[1], size[2]], rotationIndex(piece.rotation));
  return [piece.box.minX - rel.minX, piece.box.minY - rel.minY, piece.box.minZ - rel.minZ];
}

/** One jigsaw of a placed piece, in the assembly's coordinates. */
export interface PlacedJigsaw {
  readonly index: number;
  readonly block: JigsawBlock;
  readonly pos: Vec3;
  readonly front: Vec3;
  readonly top: Vec3;
}

/**
 * The jigsaws of a placed piece where they stand (for lighting the two that met, and for tests).
 * A list element's piece takes its first template's size and jigsaws; pass that template.
 */
export function pieceJigsaws(
  piece: Pick<AssembledPiece, 'box' | 'rotation'>,
  template: PieceTemplate,
): PlacedJigsaw[] {
  const prep = prepareTemplate(template);
  const turn = rotationIndex(piece.rotation);
  const origin = pieceOrigin(piece, template.size);
  return (prep.byTurn[turn] ?? []).map((j) => ({
    index: j.index,
    block: j.block,
    pos: [j.pos[0] + origin[0], j.pos[1] + origin[1], j.pos[2] + origin[2]] as Vec3,
    front: j.front,
    top: j.top,
  }));
}

/** The box a template covers with its origin at `origin` and the given turn. */
export function templateBoxAt(template: PieceTemplate, origin: Vec3, turns: number): PieceBox {
  const prep = prepareTemplate(template);
  const rel = prep.boxes[turns] ?? prep.boxes[0];
  if (!rel) throw new Error('A template without a box.');
  return boxAt(rel, origin);
}

function mix32(h: number): number {
  let x = h | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x | 0;
}

/**
 * MSM's own random for the assembler (limit 4L1: the game's order of draws is its code). sfc32
 * over four words mixed from the 64-bit seed, so the same seed gives the same steps.
 */
export class AssemblyRandom {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: bigint) {
    const s = BigInt.asUintN(64, seed);
    const lo = Number(s & 0xffffffffn) | 0;
    const hi = Number((s >> 32n) & 0xffffffffn) | 0;
    this.a = mix32(lo ^ 0x2545f491);
    this.b = mix32(hi + 0x6a09e667);
    this.c = mix32((lo ^ hi) + 0x3c6ef372);
    this.d = 1;
    for (let i = 0; i < 15; i += 1) this.next32();
  }

  private next32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** A number from 0 (inclusive) to 1 (exclusive). */
  nextFloat(): number {
    return this.next32() / 4294967296;
  }

  /** An integer from 0 (inclusive) to `max` (exclusive); 0 when `max` is not above 0. */
  nextInt(max: number): number {
    if (max <= 1) return 0;
    return Math.floor(this.nextFloat() * max);
  }

  /** Shuffles the list in place (Fisher-Yates) and returns it. */
  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(i + 1);
      const tmp = list[i] as T;
      list[i] = list[j] as T;
      list[j] = tmp;
    }
    return list;
  }

  /**
   * The order in which a pool's elements are tried (J6): drawn one at a time by weight without
   * putting back, so the first is picked by weight and a refused one gives way to the next draw.
   * Elements whose weight is not above 0 are left out.
   */
  weightedOrder(weights: readonly number[]): number[] {
    const left: number[] = [];
    let total = 0;
    weights.forEach((w, i) => {
      if (w > 0) {
        left.push(i);
        total += w;
      }
    });
    const order: number[] = [];
    while (left.length > 0) {
      let r = this.nextFloat() * total;
      let k = 0;
      for (; k < left.length - 1; k += 1) {
        r -= weights[left[k] as number] as number;
        if (r < 0) break;
      }
      const picked = left[k] as number;
      order.push(picked);
      total -= weights[picked] as number;
      left.splice(k, 1);
    }
    return order;
  }
}
