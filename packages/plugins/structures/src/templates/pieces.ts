/**
 * A small box builder for template content: sets blocks by position, collects the palette in
 * first-use order, and returns structure template data with blocks sorted by y, z, x.
 */
import type { JigsawData, StructureTemplateData, Vec3i } from '../nbt/structure-template';
import { comparePos } from '../nbt/structure-template';

/** Jigsaw connection data without the position, which {@link PieceBuilder.jigsaw} takes. */
export type JigsawSpec = Omit<JigsawData, 'pos'>;

/** Builds one structure template. */
export class PieceBuilder {
  private readonly size: Vec3i;
  private readonly palette: string[] = [];
  private readonly cells = new Map<string, [number, number, number, number]>();
  private readonly jigsaws: JigsawData[] = [];

  constructor(size: Vec3i) {
    this.size = size;
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
  set(pos: Vec3i, state: string): this {
    const [x, y, z] = pos;
    if ([x, y, z].some((value, axis) => value < 0 || value >= (this.size[axis] ?? 0))) {
      throw new Error(`Position ${pos.join(',')} is outside ${this.size.join('×')}.`);
    }
    this.cells.set(`${x},${y},${z}`, [x, y, z, this.index(state)]);
    return this;
  }

  /** Fills the box from `from` to `to`, both inclusive. */
  fill(from: Vec3i, to: Vec3i, state: string): this {
    for (let y = from[1]; y <= to[1]; y++)
      for (let z = from[2]; z <= to[2]; z++)
        for (let x = from[0]; x <= to[0]; x++) this.set([x, y, z], state);
    return this;
  }

  /** Places a jigsaw block facing `orientation` (for example `north_up`) with its data. */
  jigsaw(pos: Vec3i, orientation: string, spec: JigsawSpec): this {
    this.set(pos, `minecraft:jigsaw[orientation=${orientation}]`);
    this.jigsaws.push({ pos: [...pos], ...spec });
    return this;
  }

  /** The template data. */
  build(): StructureTemplateData {
    const data: StructureTemplateData = {
      size: [...this.size],
      palette: [...this.palette],
      blocks: [...this.cells.values()].sort(comparePos),
    };
    if (this.jigsaws.length > 0) {
      data.jigsaws = [...this.jigsaws].sort((a, b) => comparePos(a.pos, b.pos));
    }
    return data;
  }
}
