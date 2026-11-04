/**
 * A small procedural box builder for the library's structure templates (plan D9). It writes
 * the `minecraft:structure_template` element data (ADR 0021): `size`, a `palette` of block
 * states in first-use order, `blocks` as `[x, y, z, paletteIndex]` sorted by y, z, x, and
 * `jigsaws` with their connection data. The library names kinds by id only and never imports
 * the structures plugin (ADR 0020), so this is its own copy of the shape.
 *
 * @packageDocumentation
 */
import type { Json } from '@msm/plugin-api';

/** An integer block position `[x, y, z]`. */
export type Pos = [number, number, number];

/** A jigsaw block's connection data, without its position. */
export interface JigsawSpec {
  /** The template pool the attached piece is drawn from; `minecraft:empty` for a receiver. */
  pool: string;
  /** This jigsaw's name, which other jigsaws name as their `target`. */
  name: string;
  /** The name of the jigsaw on the attached piece that connects here. */
  target: string;
  /** The block the jigsaw turns into once the structure is placed. */
  final_state: string;
  joint?: 'rollable' | 'aligned';
}

const comparePos = (a: readonly number[], b: readonly number[]): number =>
  (a[1] ?? 0) - (b[1] ?? 0) || (a[2] ?? 0) - (b[2] ?? 0) || (a[0] ?? 0) - (b[0] ?? 0);

/** Builds the data of one structure template. */
export class BoxBuilder {
  private readonly size: Pos;
  private readonly palette: string[] = [];
  private readonly cells = new Map<string, [number, number, number, number]>();
  private readonly jigsaws: (JigsawSpec & { pos: Pos })[] = [];

  constructor(size: Pos) {
    this.size = [...size];
  }

  private index(state: string): number {
    let index = this.palette.indexOf(state);
    if (index < 0) {
      index = this.palette.length;
      this.palette.push(state);
    }
    return index;
  }

  /** Sets one block, replacing what was there. */
  set(pos: Pos, state: string): this {
    const [x, y, z] = pos;
    if ([x, y, z].some((value, axis) => value < 0 || value >= (this.size[axis] ?? 0))) {
      throw new Error(`Position ${pos.join(',')} is outside ${this.size.join('×')}.`);
    }
    this.cells.set(`${x},${y},${z}`, [x, y, z, this.index(state)]);
    return this;
  }

  /** Fills the box from `from` to `to`, both inclusive. */
  fill(from: Pos, to: Pos, state: string): this {
    for (let y = from[1]; y <= to[1]; y++)
      for (let z = from[2]; z <= to[2]; z++)
        for (let x = from[0]; x <= to[0]; x++) this.set([x, y, z], state);
    return this;
  }

  /** Places a jigsaw block facing `orientation` (for example `north_up`) with its data. */
  jigsaw(pos: Pos, orientation: string, spec: JigsawSpec): this {
    this.set(pos, `minecraft:jigsaw[orientation=${orientation}]`);
    this.jigsaws.push({ pos: [...pos], ...spec });
    return this;
  }

  /** The element data. */
  build(): Json {
    const data: Record<string, Json> = {
      size: [...this.size],
      palette: [...this.palette],
      blocks: [...this.cells.values()].sort(comparePos).map((tuple) => [...tuple]),
    };
    if (this.jigsaws.length > 0) {
      data.jigsaws = [...this.jigsaws]
        .sort((a, b) => comparePos(a.pos, b.pos))
        .map((jigsaw) => ({ ...jigsaw, pos: [...jigsaw.pos] }) as unknown as Json);
    }
    return data;
  }
}

/** A stable structure set salt in 0..2^31-1 derived from an id (FNV-1a). */
export function saltFor(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 0x7fffffff;
}

/** A single-piece template pool element. */
export function singlePiece(
  location: string,
  projection: 'rigid' | 'terrain_matching',
  weight = 1,
  processors = 'minecraft:empty',
): Json {
  return {
    weight,
    element: {
      element_type: 'minecraft:single_pool_element',
      location,
      processors,
      projection,
    },
  };
}

/** The empty pool element: "attach nothing here". */
export function emptyPiece(weight = 1): Json {
  return { weight, element: { element_type: 'minecraft:empty_pool_element' } };
}
