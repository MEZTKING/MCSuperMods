/**
 * Sponge schematics (`.schem`): read Version 2 and 3, write Version 3 (ADR 0021).
 *
 * Schematics have no structure void: every position holds a block. On import
 * `minecraft:structure_void` positions become absent positions of the template; on export
 * absent positions are written as `minecraft:structure_void`, so the two directions agree.
 * `Offset` is ignored on import and written as `[0, 0, 0]`; biomes are dropped with an info
 * problem; `Metadata` is neither read nor written.
 */
import type { Problem } from '@msm/plugin-api';
import {
  NbtByteArray,
  NbtCompound,
  NbtDouble,
  NbtInt,
  NbtIntArray,
  NbtList,
  NbtShort,
  NbtString,
  type NbtTag,
} from 'deepslate/nbt';
import { canonicalBlockState, parseBlockState } from './block-state';
import {
  dataVersionProblems,
  type RawBlock,
  type RawEntity,
  type RawTemplate,
  rawFromTemplate,
  StructureFormatError,
  type StructureTemplateData,
  templateFromRaw,
  type Vec3d,
  type Vec3i,
} from './structure-template';

/** The block written for absent template positions and skipped on import. */
export const STRUCTURE_VOID = 'minecraft:structure_void';

/** The Sponge schematic version this module writes. */
export const SCHEM_WRITE_VERSION = 3;

/**
 * Decodes unsigned LEB128 varints (7 bits per byte, high bit = more follows).
 *
 * @param bytes - The bytes; NBT byte arrays are signed, so each value is masked to 8 bits.
 * @param count - How many values to read.
 * @returns The values.
 * @throws {@link StructureFormatError} If the data ends early or a value is too long.
 */
export function decodeVarints(bytes: ArrayLike<number>, count: number): number[] {
  const values: number[] = [];
  let offset = 0;
  for (let n = 0; n < count; n++) {
    let value = 0;
    let shift = 0;
    for (;;) {
      if (offset >= bytes.length) {
        throw new StructureFormatError(`Block data ends after ${n} of ${count} blocks.`);
      }
      const byte = (bytes[offset++] as number) & 0xff;
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 28) throw new StructureFormatError('Block data holds a varint that is too long.');
    }
    values.push(value >>> 0);
  }
  return values;
}

/**
 * Encodes non-negative integers as unsigned LEB128 varints, as signed bytes for NBT.
 *
 * @param values - The values.
 * @returns The bytes, each in -128..127.
 */
export function encodeVarints(values: readonly number[]): number[] {
  const bytes: number[] = [];
  for (const input of values) {
    let value = input >>> 0;
    while (value >= 0x80) {
      bytes.push(((value & 0x7f) | 0x80) - 256);
      value >>>= 7;
    }
    bytes.push(value > 127 ? value - 256 : value);
  }
  return bytes;
}

function intTriple(tag: NbtTag | undefined, where: string): Vec3i {
  if (tag === undefined || !tag.isListOrArray() || tag.length !== 3) {
    throw new StructureFormatError(`${where} must be three integers.`);
  }
  return tag.map((item: NbtTag) => item.getAsNumber()) as Vec3i;
}

function doubleTriple(tag: NbtTag | undefined, where: string): Vec3d {
  if (tag === undefined || !tag.isListOrArray() || tag.length !== 3) {
    throw new StructureFormatError(`${where} must be three numbers.`);
  }
  return tag.map((item: NbtTag) => item.getAsNumber()) as Vec3d;
}

/** A copy of `source` without `skip` keys, then `id` last when given. */
function withId(source: NbtCompound | undefined, id: string | undefined, skip: string[]) {
  const out = new NbtCompound();
  source?.forEach((key, value) => {
    if (!skip.includes(key)) out.set(key, value);
  });
  if (id !== undefined && id !== '') out.set('id', new NbtString(id));
  return out;
}

/**
 * Reads a Sponge schematic root compound (Version 2 or 3) into structure template data.
 *
 * @param root - The root compound of a `.schem` file.
 * @param options - `targetDataVersion` adds `structures.newer-data-version` when the file is
 *   newer.
 * @returns The data, the file's version and `DataVersion`, and any problems.
 * @throws {@link StructureFormatError} If the compound is not a Version 2 or 3 schematic.
 */
export function structureTemplateFromSchem(
  root: NbtCompound,
  options: { targetDataVersion?: number } = {},
): {
  data: StructureTemplateData;
  version: number;
  dataVersion: number | undefined;
  problems: Problem[];
} {
  const nested = root.get('Schematic');
  const schematic = nested?.isCompound() ? nested : root;
  const version = schematic.getNumber('Version');
  if (version !== 2 && version !== 3) {
    throw new StructureFormatError(
      `Unsupported Sponge schematic version ${version}; versions 2 and 3 can be imported.`,
    );
  }
  const size: Vec3i = [
    schematic.getNumber('Width') & 0xffff,
    schematic.getNumber('Height') & 0xffff,
    schematic.getNumber('Length') & 0xffff,
  ];
  if (size.some((axis) => axis < 1)) {
    throw new StructureFormatError(`Size ${size.join('×')} must be at least 1 on every axis.`);
  }
  const [width, height, length] = size;
  const container = version === 3 ? schematic.get('Blocks') : schematic;
  if (container === undefined || !container.isCompound()) {
    throw new StructureFormatError('The schematic has no Blocks compound.');
  }
  const paletteTag = container.get('Palette');
  if (paletteTag === undefined || !paletteTag.isCompound()) {
    throw new StructureFormatError('The schematic has no block palette.');
  }
  const byIndex = new Map<number, string>();
  paletteTag.forEach((key, value) => {
    if (!value.isNumber()) throw new StructureFormatError(`Palette entry ${key} is not a number.`);
    byIndex.set(value.getAsNumber(), canonicalBlockState(key));
  });
  // Template palette: schematic order (by index) without structure void, duplicates merged.
  const palette: string[] = [];
  const remap = new Map<number, number>();
  for (const index of [...byIndex.keys()].sort((a, b) => a - b)) {
    const state = byIndex.get(index) as string;
    if (parseBlockState(state).name === STRUCTURE_VOID) continue;
    let target = palette.indexOf(state);
    if (target < 0) {
      target = palette.length;
      palette.push(state);
    }
    remap.set(index, target);
  }
  const dataTag = container.get(version === 3 ? 'Data' : 'BlockData');
  if (dataTag === undefined || !dataTag.isByteArray()) {
    throw new StructureFormatError('The schematic has no block data.');
  }
  const states = decodeVarints(
    dataTag.map((item) => item.getAsNumber()),
    width * height * length,
  );
  const blocks: RawBlock[] = [];
  const byPos = new Map<string, RawBlock>();
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const index = states[x + z * width + y * width * length] as number;
        if (!byIndex.has(index)) {
          throw new StructureFormatError(
            `Block at ${x},${y},${z} uses unknown palette index ${index}.`,
          );
        }
        const state = remap.get(index);
        if (state === undefined) continue;
        const block: RawBlock = { pos: [x, y, z], state };
        blocks.push(block);
        byPos.set(`${x},${y},${z}`, block);
      }
    }
  }
  const blockEntities = container.get('BlockEntities') ?? container.get('TileEntities');
  if (blockEntities?.isList()) {
    blockEntities.forEach((entry: NbtTag, index: number) => {
      if (!entry.isCompound()) return;
      const pos = intTriple(entry.get('Pos'), `Block entity ${index} Pos`);
      const block = byPos.get(pos.join(','));
      if (block === undefined) return;
      const id = entry.getString('Id');
      if (version === 3) {
        const data = entry.get('Data');
        block.nbt = withId(data?.isCompound() ? data : undefined, id, []);
      } else {
        block.nbt = withId(entry, id, ['Pos', 'Id']);
      }
    });
  }
  const entities: RawEntity[] = [];
  const entitiesTag = schematic.get('Entities');
  if (entitiesTag?.isList()) {
    entitiesTag.forEach((entry: NbtTag, index: number) => {
      if (!entry.isCompound()) return;
      const pos = doubleTriple(entry.get('Pos'), `Entity ${index} Pos`);
      const id = entry.getString('Id');
      const data = entry.get('Data');
      const nbt =
        version === 3
          ? withId(data?.isCompound() ? data : undefined, id, [])
          : withId(entry, id, ['Pos', 'Id']);
      entities.push({ pos, blockPos: pos.map(Math.floor) as Vec3i, nbt });
    });
  }
  const problems: Problem[] = [];
  const hasBiomes =
    version === 3
      ? schematic.has('Biomes')
      : schematic.has('BiomeData') || schematic.has('BiomePalette');
  if (hasBiomes) {
    problems.push({
      severity: 'info',
      code: 'structures.schem-biomes-dropped',
      message: 'The schematic stores biomes; structure templates have none, so they were left out.',
    });
  }
  const dataVersionTag = schematic.get('DataVersion');
  const dataVersion = dataVersionTag?.isNumber() ? dataVersionTag.getAsNumber() : undefined;
  const converted = templateFromRaw({ size, palette, blocks, entities });
  return {
    data: converted.data,
    version,
    dataVersion,
    problems: [
      ...problems,
      ...converted.problems,
      ...dataVersionProblems(dataVersion, options.targetDataVersion),
    ],
  };
}

/**
 * Writes structure template data as a Sponge schematic Version 3 root compound (an unnamed
 * root holding `Schematic`). Absent positions become `minecraft:structure_void`; entities
 * without an `id` in their NBT are left out with a warning.
 *
 * @param data - The element data.
 * @param dataVersion - The target's data version.
 * @returns The root compound and any problems.
 * @throws {@link StructureFormatError} If the data is inconsistent or larger than 65535 on an
 *   axis.
 */
export function schemFromStructureTemplate(
  data: StructureTemplateData,
  dataVersion: number,
): { root: NbtCompound; problems: Problem[] } {
  const raw: RawTemplate = rawFromTemplate(data);
  const [width, height, length] = raw.size;
  if (raw.size.some((axis) => axis > 0xffff)) {
    throw new StructureFormatError('A schematic is at most 65535 blocks on each axis.');
  }
  const problems: Problem[] = [];
  const palette = new Map<string, number>();
  const indexOf = (state: string): number => {
    let index = palette.get(state);
    if (index === undefined) {
      index = palette.size;
      palette.set(state, index);
    }
    return index;
  };
  const templateToSchem = raw.palette.map((entry) => indexOf(canonicalBlockState(entry)));
  const cells = new Array<number>(width * height * length).fill(-1);
  for (const block of raw.blocks) {
    const [x, y, z] = block.pos;
    cells[x + z * width + y * width * length] = templateToSchem[block.state] as number;
  }
  if (cells.includes(-1)) {
    const voidIndex = indexOf(STRUCTURE_VOID);
    for (let i = 0; i < cells.length; i++) if (cells[i] === -1) cells[i] = voidIndex;
  }
  const paletteTag = new NbtCompound();
  for (const [state, index] of palette) paletteTag.set(state, new NbtInt(index));

  const blockEntities = new NbtList<NbtCompound>(
    [...raw.blocks]
      .filter((block) => block.nbt !== undefined)
      .map((block) => {
        const nbt = block.nbt as NbtCompound;
        const idTag = nbt.get('id');
        const id = idTag?.isString()
          ? idTag.getAsString()
          : parseBlockState(raw.palette[block.state] as string).name;
        return new NbtCompound()
          .set('Pos', new NbtIntArray(block.pos))
          .set('Id', new NbtString(id))
          .set('Data', withId(nbt, undefined, ['id']));
      }),
  );
  const entities: NbtCompound[] = [];
  for (const [index, entity] of raw.entities.entries()) {
    const idTag = entity.nbt.get('id');
    if (!idTag?.isString()) {
      problems.push({
        severity: 'warning',
        code: 'structures.entity-without-id',
        path: `/entities/${index}`,
        message: `Entity ${index} has no id in its NBT, so the schematic leaves it out.`,
      });
      continue;
    }
    entities.push(
      new NbtCompound()
        .set('Pos', new NbtList(entity.pos.map((value) => new NbtDouble(value))))
        .set('Id', new NbtString(idTag.getAsString()))
        .set('Data', withId(entity.nbt, undefined, ['id'])),
    );
  }
  const blocks = new NbtCompound()
    .set('Palette', paletteTag)
    .set('Data', new NbtByteArray(encodeVarints(cells)))
    .set('BlockEntities', blockEntities);
  const schematic = new NbtCompound()
    .set('Version', new NbtInt(SCHEM_WRITE_VERSION))
    .set('DataVersion', new NbtInt(dataVersion))
    .set('Width', new NbtShort((width << 16) >> 16))
    .set('Height', new NbtShort((height << 16) >> 16))
    .set('Length', new NbtShort((length << 16) >> 16))
    .set('Offset', new NbtIntArray([0, 0, 0]))
    .set('Blocks', blocks)
    .set('Entities', new NbtList(entities));
  return { root: new NbtCompound().set('Schematic', schematic), problems };
}
