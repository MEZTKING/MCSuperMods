import { existsSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

/**
 * The client jar Fabric Loom caches for the engine-mod build (`<gradle user home>/caches/
 * fabric-loom/<mc version>/minecraft-client.jar`); `MSM_CLIENT_JAR_<id>` (for example
 * `MSM_CLIENT_JAR_MC_26_3`) names another copy. Tests that read it are skipped without a jar:
 * MSM never bundles Mojang files.
 */
export function clientJarPath(id: string, mcVersion: string): string | undefined {
  const override = process.env[`MSM_CLIENT_JAR_${id.toUpperCase().replace(/[-.]/g, '_')}`];
  if (override !== undefined && override !== '') return existsSync(override) ? override : undefined;
  const gradleHome = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
  const path = join(gradleHome, 'caches', 'fabric-loom', mcVersion, 'minecraft-client.jar');
  return existsSync(path) ? path : undefined;
}

/** One entry of a zip file's central directory. */
export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/** The entries of a zip file, read from its central directory (no zip64: under 65,535 entries). */
export async function zipEntries(path: string): Promise<ZipEntry[]> {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const tailLength = Math.min(size, 22 + 0xffff);
    const tail = Buffer.alloc(tailLength);
    await file.read(tail, 0, tailLength, size - tailLength);
    let end = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error(`${path}: no end of central directory`);
    const count = tail.readUInt16LE(end + 10);
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryOffset = tail.readUInt32LE(end + 16);
    if (count === 0xffff || directoryOffset === 0xffffffff) {
      throw new Error(`${path}: zip64 jars are not read by this test`);
    }
    const directory = Buffer.alloc(directorySize);
    await file.read(directory, 0, directorySize, directoryOffset);
    const entries: ZipEntry[] = [];
    let at = 0;
    for (let n = 0; n < count; n++) {
      if (directory.readUInt32LE(at) !== 0x02014b50) throw new Error(`${path}: bad entry ${n}`);
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      entries.push({
        name: directory.toString('utf8', at + 46, at + 46 + nameLength),
        method: directory.readUInt16LE(at + 10),
        compressedSize: directory.readUInt32LE(at + 20),
        localHeaderOffset: directory.readUInt32LE(at + 42),
      });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    await file.close();
  }
}

/** The entry names of a zip file. */
export async function zipEntryNames(path: string): Promise<string[]> {
  return (await zipEntries(path)).map((entry) => entry.name);
}

/** The bytes of one entry, or `undefined` when the jar has no entry of that name. */
export async function zipEntryBytes(path: string, name: string): Promise<Buffer | undefined> {
  const entry = (await zipEntries(path)).find((candidate) => candidate.name === name);
  if (entry === undefined) return undefined;
  const file = await open(path, 'r');
  try {
    return await readEntry(file, path, entry);
  } finally {
    await file.close();
  }
}

async function readEntry(
  file: Awaited<ReturnType<typeof open>>,
  path: string,
  entry: ZipEntry,
): Promise<Buffer> {
  const header = Buffer.alloc(30);
  await file.read(header, 0, 30, entry.localHeaderOffset);
  if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`${path}: bad header ${entry.name}`);
  const start = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const data = Buffer.alloc(entry.compressedSize);
  await file.read(data, 0, entry.compressedSize, start);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`${path}: ${entry.name} uses compression method ${entry.method}`);
}

/**
 * The parsed entries whose names start with one of `prefixes` and end with `.json`, by name.
 * Stored and deflated entries only. Used for the game's data files (trade sets, tags), never its
 * assets.
 */
export async function zipJsonEntries(
  path: string,
  prefixes: readonly string[],
): Promise<Map<string, unknown>> {
  const wanted = (await zipEntries(path)).filter(
    (entry) =>
      prefixes.some((prefix) => entry.name.startsWith(prefix)) && entry.name.endsWith('.json'),
  );
  const file = await open(path, 'r');
  const out = new Map<string, unknown>();
  try {
    for (const entry of wanted) {
      const bytes = await readEntry(file, path, entry);
      out.set(entry.name, JSON.parse(bytes.toString('utf8')));
    }
  } finally {
    await file.close();
  }
  return out;
}
