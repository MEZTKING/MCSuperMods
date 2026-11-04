/**
 * A thin typed wrapper over deepslate's NBT codec (ADR 0021): binary NBT with gzip, zlib or
 * no compression, and SNBT (Minecraft's text form of NBT).
 *
 * SNBT is printed by this module, not by deepslate's `toString()`: deepslate 0.27.2 prints
 * long arrays with an `[I;` prefix (so they read back as an error) and doubles such as `1e+21`
 * without a suffix (so they read back as strings). The printer below writes every tag with an
 * explicit type marker, which deepslate's parser reads back to the same tag type and value.
 */
import { NbtCompound, NbtFile, type NbtTag } from 'deepslate/nbt';
import { StringReader } from 'deepslate/util';

/** Thrown when bytes or text cannot be read as NBT. */
export class NbtCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NbtCodecError';
  }
}

/** How an NBT file was (or is to be) compressed. */
export type NbtCompression = 'gzip' | 'zlib' | 'none';

/**
 * Reads a binary NBT file. Gzip and zlib compression are detected from the header.
 *
 * @param bytes - The file's bytes.
 * @returns The root compound and the detected compression.
 * @throws {@link NbtCodecError} If the bytes are not a valid NBT file.
 */
export function readNbt(bytes: Uint8Array): { root: NbtCompound; compression: NbtCompression } {
  try {
    const file = NbtFile.read(bytes);
    return { root: file.root, compression: file.compression };
  } catch (error) {
    throw new NbtCodecError(
      `Not a valid NBT file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Writes a binary NBT file with an unnamed root compound. The output is deterministic: gzip
 * is written by pako with a zero modification time.
 *
 * @param root - The root compound.
 * @param compression - The compression to apply; `gzip` for structure and schematic files.
 * @param name - The root tag's name; empty by default.
 * @returns The file's bytes.
 */
export function writeNbt(
  root: NbtCompound,
  compression: NbtCompression = 'gzip',
  name = '',
): Uint8Array {
  return new NbtFile(name, root, compression, false, undefined).write();
}

/**
 * Parses SNBT text that must hold one compound, such as `{id:"minecraft:chest",Items:[]}`.
 *
 * @param text - The SNBT text.
 * @returns The compound.
 * @throws {@link NbtCodecError} If the text is not one SNBT compound.
 */
export function parseSnbt(text: string): NbtCompound {
  const reader = new StringReader(text);
  let tag: NbtTag;
  try {
    reader.skipWhitespace();
    if (reader.peek() !== '{') throw new Error('Expected "{" at the start');
    tag = NbtCompound.fromString(reader);
  } catch (error) {
    throw new NbtCodecError(
      `Not valid SNBT: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  reader.skipWhitespace();
  if (reader.canRead() || !tag.isCompound()) {
    throw new NbtCodecError(`Not valid SNBT: unexpected text after the compound.`);
  }
  return tag;
}

const UNQUOTED_KEY = /^[0-9A-Za-z_\-.+]+$/;

function quote(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&')}"`;
}

/** `.0` appended to whole numbers, as the game prints them (`3.0d`, `90.0f`). */
function decimal(text: string): string {
  return /^-?\d+$/.test(text) ? `${text}.0` : text;
}

/** A byte as a signed value (-128..127); byte arrays may read back unsigned. */
const signedByte = (value: number): number => (value << 24) >> 24;

/** The shortest decimal text that reads back as the same 32-bit float. */
function floatText(value: number): string {
  const target = Math.fround(value);
  if (!Number.isFinite(target)) return String(target);
  for (let digits = 1; digits <= 9; digits++) {
    const text = String(Number(target.toPrecision(digits)));
    if (Math.fround(Number(text)) === target) return text;
  }
  return String(target);
}

/**
 * Prints a tag as SNBT. Every number carries its type suffix (`b`, `s`, `L`, `f`, `d`; ints
 * none), arrays their `B;`, `I;` or `L;` prefix, strings and keys that need it double quotes.
 * The output is compact (no spaces) and keeps compound key order.
 *
 * @param tag - The tag to print.
 * @returns The SNBT text.
 */
export function printSnbt(tag: NbtTag): string {
  if (tag.isCompound()) {
    const pairs: string[] = [];
    tag.forEach((key, value) => {
      pairs.push(`${UNQUOTED_KEY.test(key) ? key : quote(key)}:${printSnbt(value)}`);
    });
    return `{${pairs.join(',')}}`;
  }
  if (tag.isList()) return `[${tag.map((item) => printSnbt(item)).join(',')}]`;
  if (tag.isByteArray()) {
    return `[B;${tag.map((item) => `${signedByte(item.getAsNumber())}B`).join(',')}]`;
  }
  if (tag.isIntArray()) return `[I;${tag.map((item) => String(item.getAsNumber())).join(',')}]`;
  if (tag.isLongArray()) return `[L;${tag.map((item) => `${item.toBigInt()}L`).join(',')}]`;
  if (tag.isString()) return quote(tag.getAsString());
  if (tag.isByte()) return `${signedByte(tag.getAsNumber())}b`;
  if (tag.isShort()) return `${tag.getAsNumber()}s`;
  if (tag.isInt()) return String(tag.getAsNumber());
  if (tag.isLong()) return `${tag.toBigInt()}L`;
  if (tag.isFloat()) return `${decimal(floatText(tag.getAsNumber()))}f`;
  if (tag.isDouble()) return `${decimal(String(tag.getAsNumber()))}d`;
  throw new NbtCodecError('Cannot print an end tag as SNBT.');
}
