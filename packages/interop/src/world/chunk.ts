/**
 * Chunk NBT in the 1.18+ layout (ADR 0087 D4): the root compound holds `DataVersion`, `xPos`,
 * `zPos`, `yPos`, `Status`, `sections` and `block_entities`. Each section has `Y` and
 * `block_states { palette, data }`; `data` is a long array of palette indexes, 4,096 per
 * section in YZX order, packed without entries spanning two longs, with
 * `max(4, ceil(log2(palette size)))` bits per entry. A palette of one entry has no `data`.
 *
 * @packageDocumentation
 */

import { type NbtCompound, NbtFile, type NbtTag } from 'deepslate/nbt';

/**
 * The first data version with the 1.18 chunk layout at the root (21w43a, 2844): `sections` and
 * `block_states` outside the old `Level` compound. Older chunks are refused.
 */
export const FIRST_FLAT_CHUNK_DATA_VERSION = 2844;

/** Block ids that read as plain air. */
export const AIR_IDS: ReadonlySet<string> = new Set([
  'minecraft:air',
  'minecraft:cave_air',
  'minecraft:void_air',
]);

/** One 16x16x16 section's block states. */
export interface ChunkSection {
  /** Block state strings, `minecraft:oak_stairs[facing=north,half=bottom]`. */
  palette: string[];
  /** Packed indexes as big-endian `[hi, lo]` 32-bit pairs, or `null` for a one-entry palette. */
  data: Int32Array | null;
  /** Bits per entry (0 when `data` is `null`). */
  bits: number;
}

/** A chunk read for its blocks. */
export interface ParsedChunk {
  dataVersion: number;
  /** `Status` (or `status`); `''` when the chunk saved none. */
  status: string;
  /** Sections with block states, by section Y. */
  sections: Map<number, ChunkSection>;
  /** Block entities with their `x`, `y`, `z`. */
  blockEntities: { x: number; y: number; z: number }[];
  /** Sections that could not be read (warning lines). */
  problems: string[];
}

/** A chunk whose layout MSM does not read. */
export class ChunkFormatError extends Error {
  readonly reason: 'old-format' | 'damaged';
  constructor(reason: 'old-format' | 'damaged', message: string) {
    super(message);
    this.name = 'ChunkFormatError';
    this.reason = reason;
  }
}

function asCompound(tag: NbtTag | undefined): NbtCompound | null {
  return tag?.isCompound() ? tag : null;
}

/** The first of `keys` that holds a non-empty string in `compound`, else `''`. */
function firstString(compound: NbtCompound, keys: readonly string[]): string {
  for (const key of keys) {
    const tag = compound.get(key);
    if (tag?.isString() && tag.getAsString() !== '') return tag.getAsString();
  }
  return '';
}

/**
 * The block state string of a palette entry, properties sorted by key. An entry comes in any of
 * three forms (the reference pack's `region.state()`): a bare string `"minecraft:stone"`,
 * `{ Name, Properties }` (older) or `{ id, properties }` (what 26.x writes); a few exporters
 * write the name under `""`. Reading only one form turns every other entry into air.
 */
export function blockStateString(entry: NbtTag): string {
  if (entry.isString()) return namespacedState(entry.getAsString());
  if (!entry.isCompound()) return 'minecraft:air';
  const name = firstString(entry, ['Name', 'id', '']);
  const id = name === '' ? 'minecraft:air' : name.includes(':') ? name : `minecraft:${name}`;
  const properties = asCompound(entry.get('Properties')) ?? asCompound(entry.get('properties'));
  if (properties === null || properties.size === 0) return id;
  const pairs: string[] = [];
  for (const key of [...properties.keys()].sort()) {
    const value = properties.get(key);
    pairs.push(`${key}=${value?.isString() ? value.getAsString() : ''}`);
  }
  return `${id}[${pairs.join(',')}]`;
}

/** A bare-string palette entry, `stone` or `minecraft:oak_stairs[...]`, with its namespace. */
function namespacedState(state: string): string {
  if (state === '') return 'minecraft:air';
  const bracket = state.indexOf('[');
  const name = bracket === -1 ? state : state.slice(0, bracket);
  return name.includes(':') ? state : `minecraft:${state}`;
}

/** Bits per entry for a block state palette of `size` entries (0 for one entry). */
export function bitsForPalette(size: number): number {
  if (size <= 1) return 0;
  return Math.max(4, Math.ceil(Math.log2(size)));
}

/** The number of longs a section's `data` holds at `bits` per entry. */
export function longsForBits(bits: number): number {
  return Math.ceil(4096 / Math.floor(64 / bits));
}

function readSection(section: NbtCompound): ChunkSection | null {
  const states = asCompound(section.get('block_states'));
  if (states === null) return null;
  const paletteTag = states.get('palette');
  if (paletteTag === undefined || !paletteTag.isList()) return null;
  const palette: string[] = [];
  for (const entry of paletteTag.getItems()) {
    palette.push(blockStateString(entry));
  }
  if (palette.length === 0) return null;
  const bits = bitsForPalette(palette.length);
  if (bits === 0) return { palette, data: null, bits: 0 };
  const dataTag = states.get('data');
  if (dataTag === undefined || !dataTag.isLongArray()) {
    throw new ChunkFormatError('damaged', 'A section has a palette but no data.');
  }
  const longs = dataTag.getItems();
  if (longs.length !== longsForBits(bits)) {
    throw new ChunkFormatError(
      'damaged',
      `A section has ${longs.length} longs of data; ${longsForBits(bits)} were expected.`,
    );
  }
  const data = new Int32Array(longs.length * 2);
  for (let i = 0; i < longs.length; i += 1) {
    const pair = longs[i]?.getAsPair() ?? [0, 0];
    const hi = pair[0];
    const lo = pair[1];
    data[i * 2] = hi;
    data[i * 2 + 1] = lo;
  }
  return { palette, data, bits };
}

/**
 * Reads a chunk from its uncompressed NBT bytes.
 *
 * @throws ChunkFormatError `old-format` for a chunk saved before the 1.18 layout (a `Level`
 *   compound, or a data version below {@link FIRST_FLAT_CHUNK_DATA_VERSION}), `damaged` when
 *   the NBT does not parse.
 */
export function parseChunk(nbt: Uint8Array): ParsedChunk {
  let root: NbtCompound;
  try {
    root = NbtFile.read(nbt, { compression: 'none' }).root;
  } catch (error) {
    throw new ChunkFormatError(
      'damaged',
      `A chunk is not readable NBT: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const dataVersion = root.hasNumber('DataVersion') ? root.getNumber('DataVersion') : 0;
  if (root.has('Level') || dataVersion < FIRST_FLAT_CHUNK_DATA_VERSION) {
    throw new ChunkFormatError('old-format', 'A chunk was saved before Minecraft 1.18.');
  }
  // `Status` as vanilla writes it; `status` from a few tools (the reference pack reads both).
  const status = root.hasString('Status')
    ? root.getString('Status')
    : root.hasString('status')
      ? root.getString('status')
      : '';
  const sections = new Map<number, ChunkSection>();
  const problems: string[] = [];
  const sectionsTag = root.get('sections');
  if (sectionsTag?.isList()) {
    for (const item of sectionsTag.getItems()) {
      if (!item.isCompound() || !item.hasNumber('Y')) continue;
      const y = item.getNumber('Y');
      try {
        const section = readSection(item);
        if (section !== null) sections.set(y, section);
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  const blockEntities: ParsedChunk['blockEntities'] = [];
  const blockEntitiesTag = root.get('block_entities');
  if (blockEntitiesTag?.isList()) {
    for (const item of blockEntitiesTag.getItems()) {
      if (!item.isCompound()) continue;
      blockEntities.push({
        x: item.getNumber('x'),
        y: item.getNumber('y'),
        z: item.getNumber('z'),
      });
    }
  }
  return { dataVersion, status, sections, blockEntities, problems };
}

/**
 * Whether a chunk status means fully generated (`minecraft:full` or the older `full`). A chunk
 * that saved no status (`''`, written by some tools) counts as full, as the reference pack's
 * `ore_counts.py` reads it; below `full` a chunk has terrain but no features.
 */
export function isFullChunk(status: string): boolean {
  return status === 'minecraft:full' || status === 'full' || status === '';
}

/**
 * The palette index at section-local `(x, y, z)` (each 0 to 15).
 */
export function sectionIndexAt(section: ChunkSection, x: number, y: number, z: number): number {
  const { data, bits } = section;
  if (data === null) return 0;
  const i = (y << 8) | (z << 4) | x;
  const perLong = Math.floor(64 / bits);
  const longIndex = Math.floor(i / perLong);
  const offset = (i - longIndex * perLong) * bits;
  const mask = (1 << bits) - 1;
  const hi = data[longIndex * 2] ?? 0;
  const lo = data[longIndex * 2 + 1] ?? 0;
  if (offset >= 32) return (hi >>> (offset - 32)) & mask;
  if (offset + bits <= 32) return (lo >>> offset) & mask;
  return ((lo >>> offset) | (hi << (32 - offset))) & mask;
}

/** The number of entities in an entity chunk (`entities/` region), with their positions. */
export function parseEntityChunk(nbt: Uint8Array): { x: number; y: number; z: number }[] {
  const root = NbtFile.read(nbt, { compression: 'none' }).root;
  const list = root.get('Entities');
  const out: { x: number; y: number; z: number }[] = [];
  if (list === undefined || !list.isList()) return out;
  for (const item of list.getItems()) {
    if (!item.isCompound()) continue;
    const pos = item.get('Pos');
    if (pos === undefined || !pos.isList() || pos.length < 3) continue;
    const [x, y, z] = pos.getItems().map((tag) => (tag.isNumber() ? tag.getAsNumber() : 0));
    out.push({ x: x ?? 0, y: y ?? 0, z: z ?? 0 });
  }
  return out;
}
