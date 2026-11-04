/**
 * Structure template JSON (the `msm:structure_template` element data, ADR 0021) and its
 * conversion to and from vanilla structure NBT.
 *
 * Both directions go through {@link RawTemplate}, the codec-neutral middle form that the
 * Sponge schematic converter (`schem.ts`) shares.
 */
import type { Problem } from '@msm/plugin-api';
import { NbtCompound, NbtDouble, NbtInt, NbtList, NbtString, type NbtTag } from 'deepslate/nbt';
import { parseSnbt, printSnbt } from './binary';
import { BlockStateError, canonicalBlockState, parseBlockState } from './block-state';

/** An integer block position `[x, y, z]`. */
export type Vec3i = [number, number, number];
/** A position `[x, y, z]` in blocks, with fractions. */
export type Vec3d = [number, number, number];

/** A jigsaw block's connection data, lifted out of its block entity. */
export type JigsawData = {
  pos: Vec3i;
  pool: string;
  name: string;
  target: string;
  final_state: string;
  joint?: 'rollable' | 'aligned';
  placement_priority?: number;
  selection_priority?: number;
};

/** A block entity other than a jigsaw: its position and NBT as SNBT. */
export type BlockEntityData = { pos: Vec3i; nbt: string };

/** An entity: exact position, block position and NBT as SNBT. */
export type EntityData = { pos: Vec3d; block_pos: Vec3i; nbt: string };

/** The data of a `minecraft:structure_template` element. */
export type StructureTemplateData = {
  size: Vec3i;
  palette: string[];
  /** `[x, y, z, paletteIndex]`; absent positions are structure void. */
  blocks: [number, number, number, number][];
  block_entities?: BlockEntityData[];
  jigsaws?: JigsawData[];
  entities?: EntityData[];
};

/** Thrown when a file or element cannot be converted. */
export class StructureFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructureFormatError';
  }
}

/** One block of a {@link RawTemplate}. */
export interface RawBlock {
  pos: Vec3i;
  state: number;
  nbt?: NbtCompound;
}

/** One entity of a {@link RawTemplate}. */
export interface RawEntity {
  pos: Vec3d;
  blockPos: Vec3i;
  nbt: NbtCompound;
}

/** The codec-neutral form between the JSON data and a binary format. */
export interface RawTemplate {
  size: Vec3i;
  /** Block-state strings. */
  palette: string[];
  blocks: RawBlock[];
  entities: RawEntity[];
}

/** The vanilla structure block limit per axis; larger templates are a warning, not an error. */
export const MAX_RECOMMENDED_SIZE = 48;

/** The jigsaw block id. */
export const JIGSAW_BLOCK = 'minecraft:jigsaw';

const JIGSAW_KEYS = new Set([
  'id',
  'pool',
  'name',
  'target',
  'final_state',
  'joint',
  'placement_priority',
  'selection_priority',
]);

/** Orders positions by y, then z, then x. */
export function comparePos(a: readonly number[], b: readonly number[]): number {
  return (a[1] ?? 0) - (b[1] ?? 0) || (a[2] ?? 0) - (b[2] ?? 0) || (a[0] ?? 0) - (b[0] ?? 0);
}

const posKey = (pos: readonly number[]): string => `${pos[0]},${pos[1]},${pos[2]}`;

/** The `structures.template-too-large` warning, or none. */
export function sizeProblems(size: readonly number[]): Problem[] {
  if (!size.some((axis) => axis > MAX_RECOMMENDED_SIZE)) return [];
  return [
    {
      severity: 'warning',
      code: 'structures.template-too-large',
      path: '/size',
      message: `The template is ${size.join('×')} blocks; a structure block saves and loads at most ${MAX_RECOMMENDED_SIZE} blocks per axis.`,
    },
  ];
}

/** The `structures.newer-data-version` info, or none. */
export function dataVersionProblems(
  fileVersion: number | undefined,
  targetVersion: number | undefined,
): Problem[] {
  if (fileVersion === undefined || targetVersion === undefined) return [];
  if (fileVersion <= targetVersion) return [];
  return [
    {
      severity: 'info',
      code: 'structures.newer-data-version',
      message: `The file was saved by a newer game (data version ${fileVersion}) than the target (${targetVersion}); blocks or data the target does not know may fail to load.`,
    },
  ];
}

function stringOf(compound: NbtCompound, key: string, fallback: string): string {
  const tag = compound.get(key);
  return tag?.isString() ? tag.getAsString() : fallback;
}

/**
 * Lifts jigsaw block entities into `jigsaws`, prints other block entities and entities as
 * SNBT, and sorts blocks, block entities and jigsaws by y, z, x.
 *
 * @param raw - The decoded template.
 * @returns The element data and anything that could not be carried over faithfully.
 */
export function templateFromRaw(raw: RawTemplate): {
  data: StructureTemplateData;
  problems: Problem[];
} {
  const problems: Problem[] = [...sizeProblems(raw.size)];
  const palette = raw.palette.map((entry) => {
    try {
      return canonicalBlockState(entry);
    } catch (error) {
      if (error instanceof BlockStateError) throw new StructureFormatError(error.message);
      throw error;
    }
  });
  const sorted = [...raw.blocks].sort((a, b) => comparePos(a.pos, b.pos));
  const blocks: [number, number, number, number][] = [];
  const blockEntities: BlockEntityData[] = [];
  const jigsaws: JigsawData[] = [];
  for (const block of sorted) {
    if (block.state < 0 || block.state >= palette.length) {
      throw new StructureFormatError(
        `Block at ${posKey(block.pos)} uses palette index ${block.state}, but the palette has ${palette.length} entries.`,
      );
    }
    blocks.push([block.pos[0], block.pos[1], block.pos[2], block.state]);
    if (block.nbt === undefined) continue;
    const name = parseBlockState(palette[block.state] as string).name;
    if (name !== JIGSAW_BLOCK) {
      blockEntities.push({ pos: [...block.pos], nbt: printSnbt(block.nbt) });
      continue;
    }
    const nbt = block.nbt;
    const jigsaw: JigsawData = {
      pos: [...block.pos],
      pool: stringOf(nbt, 'pool', 'minecraft:empty'),
      name: stringOf(nbt, 'name', 'minecraft:empty'),
      target: stringOf(nbt, 'target', 'minecraft:empty'),
      final_state: stringOf(nbt, 'final_state', 'minecraft:air'),
    };
    const joint = nbt.get('joint');
    if (joint?.isString()) {
      const value = joint.getAsString();
      if (value === 'rollable' || value === 'aligned') jigsaw.joint = value;
    }
    for (const key of ['placement_priority', 'selection_priority'] as const) {
      const tag = nbt.get(key);
      if (tag?.isNumber()) jigsaw[key] = Math.trunc(tag.getAsNumber());
    }
    const dropped = [...nbt.keys()].filter((key) => !JIGSAW_KEYS.has(key));
    if (dropped.length > 0) {
      problems.push({
        severity: 'warning',
        code: 'structures.jigsaw-data-dropped',
        path: `/jigsaws/${jigsaws.length}`,
        message: `The jigsaw block at ${posKey(block.pos)} has data MSM does not keep: ${dropped.join(', ')}.`,
      });
    }
    jigsaws.push(jigsaw);
  }
  const data: StructureTemplateData = {
    size: [...raw.size],
    palette,
    blocks,
  };
  if (blockEntities.length > 0) data.block_entities = blockEntities;
  if (jigsaws.length > 0) data.jigsaws = jigsaws;
  if (raw.entities.length > 0) {
    data.entities = raw.entities.map((entity) => ({
      pos: [...entity.pos],
      block_pos: [...entity.blockPos],
      nbt: printSnbt(entity.nbt),
    }));
  }
  return { data, problems };
}

function checkPos(pos: readonly number[], size: Vec3i, where: string): void {
  if (
    pos.length !== 3 ||
    pos.some((value, axis) => !Number.isInteger(value) || value < 0 || value >= (size[axis] ?? 0))
  ) {
    throw new StructureFormatError(
      `${where}: position ${JSON.stringify(pos)} is outside the size.`,
    );
  }
}

function snbt(text: string, where: string): NbtCompound {
  try {
    return parseSnbt(text);
  } catch (error) {
    throw new StructureFormatError(
      `${where}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** The block entity NBT of a jigsaw, in the order the game writes it. */
export function jigsawNbt(jigsaw: JigsawData): NbtCompound {
  const nbt = new NbtCompound()
    .set('name', new NbtString(jigsaw.name))
    .set('target', new NbtString(jigsaw.target))
    .set('pool', new NbtString(jigsaw.pool))
    .set('final_state', new NbtString(jigsaw.final_state));
  if (jigsaw.joint !== undefined) nbt.set('joint', new NbtString(jigsaw.joint));
  if (jigsaw.placement_priority !== undefined) {
    nbt.set('placement_priority', new NbtInt(jigsaw.placement_priority));
  }
  if (jigsaw.selection_priority !== undefined) {
    nbt.set('selection_priority', new NbtInt(jigsaw.selection_priority));
  }
  return nbt.set('id', new NbtString(JIGSAW_BLOCK));
}

/**
 * Turns element data back into the codec-neutral form: parses SNBT, rebuilds jigsaw block
 * entities, and checks positions and palette indices.
 *
 * @param data - The element data.
 * @returns The raw template, blocks in data order.
 * @throws {@link StructureFormatError} If the data is inconsistent (index out of range, a
 *   position outside the size, a block entity or jigsaw without a block, bad SNBT).
 */
export function rawFromTemplate(data: StructureTemplateData): RawTemplate {
  const size: Vec3i = [data.size[0], data.size[1], data.size[2]];
  if (size.some((axis) => !Number.isInteger(axis) || axis < 1)) {
    throw new StructureFormatError(`Size ${JSON.stringify(data.size)} must be three integers ≥ 1.`);
  }
  for (const [index, entry] of data.palette.entries()) {
    try {
      parseBlockState(entry);
    } catch (error) {
      throw new StructureFormatError(
        `Palette entry ${index}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const byPos = new Map<string, RawBlock>();
  const blocks: RawBlock[] = [];
  for (const [index, tuple] of data.blocks.entries()) {
    const [x, y, z, state] = tuple;
    const pos: Vec3i = [x, y, z];
    checkPos(pos, size, `Block ${index}`);
    if (!Number.isInteger(state) || state < 0 || state >= data.palette.length) {
      throw new StructureFormatError(
        `Block ${index} uses palette index ${state}, but the palette has ${data.palette.length} entries.`,
      );
    }
    if (byPos.has(posKey(pos))) {
      throw new StructureFormatError(`Block ${index}: two blocks at ${posKey(pos)}.`);
    }
    const block: RawBlock = { pos, state };
    byPos.set(posKey(pos), block);
    blocks.push(block);
  }
  const attach = (pos: Vec3i, nbt: NbtCompound, where: string): void => {
    const block = byPos.get(posKey(pos));
    if (block === undefined)
      throw new StructureFormatError(`${where}: no block at ${posKey(pos)}.`);
    if (block.nbt !== undefined) {
      throw new StructureFormatError(`${where}: two block entities at ${posKey(pos)}.`);
    }
    block.nbt = nbt;
  };
  for (const [index, entry] of (data.block_entities ?? []).entries()) {
    attach(entry.pos, snbt(entry.nbt, `Block entity ${index}`), `Block entity ${index}`);
  }
  for (const [index, jigsaw] of (data.jigsaws ?? []).entries()) {
    attach(jigsaw.pos, jigsawNbt(jigsaw), `Jigsaw ${index}`);
  }
  const entities = (data.entities ?? []).map(
    (entity, index): RawEntity => ({
      pos: [entity.pos[0], entity.pos[1], entity.pos[2]],
      blockPos: [entity.block_pos[0], entity.block_pos[1], entity.block_pos[2]],
      nbt: snbt(entity.nbt, `Entity ${index}`),
    }),
  );
  return { size, palette: [...data.palette], blocks, entities };
}

// --- vanilla structure NBT ---------------------------------------------------------------

function numbers(tag: NbtTag | undefined, length: number, where: string): number[] {
  if (tag === undefined || !tag.isListOrArray() || tag.length !== length) {
    throw new StructureFormatError(`${where} must be a list of ${length} numbers.`);
  }
  const values: number[] = [];
  tag.forEach((item: NbtTag) => {
    if (!item.isNumber()) throw new StructureFormatError(`${where} must hold numbers.`);
    values.push(item.getAsNumber());
  });
  return values;
}

function paletteEntry(tag: NbtTag, index: number): string {
  if (!tag.isCompound() || !tag.hasString('Name')) {
    throw new StructureFormatError(`Palette entry ${index} has no Name.`);
  }
  const properties: Record<string, string> = {};
  const props = tag.get('Properties');
  if (props?.isCompound()) {
    props.forEach((key, value) => {
      properties[key] = value.isString() ? value.getAsString() : printSnbt(value);
    });
  }
  const name = tag.getString('Name');
  const keys = Object.keys(properties).sort();
  return keys.length === 0
    ? name
    : `${name}[${keys.map((k) => `${k}=${properties[k]}`).join(',')}]`;
}

/**
 * Reads a vanilla structure template (the root compound of a structure `.nbt` file) into
 * element data. A file with several random `palettes` keeps the first and reports
 * `structures.random-palettes`.
 *
 * @param root - The root compound.
 * @param options - `targetDataVersion` adds `structures.newer-data-version` when the file is
 *   newer.
 * @returns The data, the file's `DataVersion` and any problems.
 * @throws {@link StructureFormatError} If the compound is not a structure template.
 */
export function structureTemplateFromNbt(
  root: NbtCompound,
  options: { targetDataVersion?: number } = {},
): { data: StructureTemplateData; dataVersion: number | undefined; problems: Problem[] } {
  const problems: Problem[] = [];
  const size = numbers(root.get('size'), 3, 'size') as Vec3i;
  if (size.some((axis) => !Number.isInteger(axis) || axis < 1)) {
    throw new StructureFormatError(`size ${JSON.stringify(size)} must be three integers ≥ 1.`);
  }
  let paletteTag = root.get('palette');
  const palettes = root.get('palettes');
  if ((paletteTag === undefined || !paletteTag.isList()) && palettes?.isList()) {
    const first = palettes.get(0);
    if (first === undefined || !first.isList()) {
      throw new StructureFormatError('palettes must hold at least one palette list.');
    }
    if (palettes.length > 1) {
      problems.push({
        severity: 'warning',
        code: 'structures.random-palettes',
        message: `The file has ${palettes.length} random palettes; only the first is kept.`,
      });
    }
    paletteTag = first;
  }
  if (paletteTag === undefined || !paletteTag.isList()) {
    throw new StructureFormatError('The file has no palette; it is not a structure template.');
  }
  const palette = paletteTag.map((entry, index) => paletteEntry(entry, index));
  const blocksTag = root.get('blocks');
  if (blocksTag === undefined || !blocksTag.isList()) {
    throw new StructureFormatError('The file has no blocks list; it is not a structure template.');
  }
  const blocks = blocksTag.map((entry, index): RawBlock => {
    if (!entry.isCompound()) throw new StructureFormatError(`Block ${index} is not a compound.`);
    const pos = numbers(entry.get('pos'), 3, `Block ${index} pos`) as Vec3i;
    checkPos(pos, size, `Block ${index}`);
    const block: RawBlock = { pos, state: entry.getNumber('state') };
    const nbt = entry.get('nbt');
    if (nbt?.isCompound()) block.nbt = nbt;
    return block;
  });
  const entitiesTag = root.get('entities');
  const entities: RawEntity[] = [];
  if (entitiesTag?.isList()) {
    entitiesTag.forEach((entry: NbtTag, index: number) => {
      if (!entry.isCompound()) throw new StructureFormatError(`Entity ${index} is not a compound.`);
      const pos = numbers(entry.get('pos'), 3, `Entity ${index} pos`) as Vec3d;
      const blockPosTag = entry.get('blockPos');
      const blockPos = (
        blockPosTag === undefined
          ? pos.map(Math.floor)
          : numbers(blockPosTag, 3, `Entity ${index} blockPos`)
      ) as Vec3i;
      const nbt = entry.get('nbt');
      entities.push({ pos, blockPos, nbt: nbt?.isCompound() ? nbt : new NbtCompound() });
    });
  }
  const dataVersionTag = root.get('DataVersion');
  const dataVersion = dataVersionTag?.isNumber() ? dataVersionTag.getAsNumber() : undefined;
  const converted = templateFromRaw({ size, palette, blocks, entities });
  return {
    data: converted.data,
    dataVersion,
    problems: [
      ...problems,
      ...converted.problems,
      ...dataVersionProblems(dataVersion, options.targetDataVersion),
    ],
  };
}

const intList = (values: readonly number[]): NbtList<NbtInt> =>
  new NbtList(values.map((value) => new NbtInt(value)));

/**
 * Writes element data as a vanilla structure template root compound: `size`, `palette`
 * (`Name` and sorted `Properties`), `blocks` (`pos`, `state`, `nbt`), `entities` (`pos`,
 * `blockPos`, `nbt`) and `DataVersion`, in that order.
 *
 * @param data - The element data.
 * @param dataVersion - The target's data version.
 * @returns The root compound.
 * @throws {@link StructureFormatError} If the data is inconsistent.
 */
export function structureTemplateToNbt(
  data: StructureTemplateData,
  dataVersion: number,
): NbtCompound {
  const raw = rawFromTemplate(data);
  const palette = raw.palette.map((entry) => {
    const state = parseBlockState(entry);
    const compound = new NbtCompound().set('Name', new NbtString(state.name));
    const keys = Object.keys(state.properties).sort();
    if (keys.length > 0) {
      const properties = new NbtCompound();
      for (const key of keys) properties.set(key, new NbtString(state.properties[key] as string));
      compound.set('Properties', properties);
    }
    return compound;
  });
  const blocks = raw.blocks.map((block) => {
    const compound = new NbtCompound()
      .set('pos', intList(block.pos))
      .set('state', new NbtInt(block.state));
    if (block.nbt !== undefined) compound.set('nbt', block.nbt);
    return compound;
  });
  const entities = raw.entities.map((entity) =>
    new NbtCompound()
      .set('pos', new NbtList(entity.pos.map((value) => new NbtDouble(value))))
      .set('blockPos', intList(entity.blockPos))
      .set('nbt', entity.nbt),
  );
  return new NbtCompound()
    .set('size', intList(raw.size))
    .set('palette', new NbtList(palette))
    .set('blocks', new NbtList(blocks))
    .set('entities', new NbtList(entities))
    .set('DataVersion', new NbtInt(dataVersion));
}
