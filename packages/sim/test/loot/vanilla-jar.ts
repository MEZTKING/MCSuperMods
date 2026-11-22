/**
 * Test helper: vanilla data files read at test time from the Loom cache's client jars
 * (`~/.gradle/caches/fabric-loom/<version>/minecraft-client.jar`), as the app reads the user's own
 * jar. Nothing is written or kept; tests that need these files skip when no jar is there.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { Json } from '@msm/plugin-api';
import type { FakeFiles } from './helpers.js';

const LOOM = join(homedir(), '.gradle', 'caches', 'fabric-loom');

/** The Loom cache's client jars, by version folder. */
export function loomJars(): { version: string; path: string }[] {
  if (!existsSync(LOOM)) return [];
  return readdirSync(LOOM, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ version: d.name, path: join(LOOM, d.name, 'minecraft-client.jar') }))
    .filter((j) => existsSync(j.path))
    .sort((a, b) => a.version.localeCompare(b.version));
}

const cache = new Map<string, FakeFiles>();

/** The data files of some folders (`loot_table`, `tags/item`, ...) of one jar, by full id. */
export function readJarData(path: string, folders: readonly string[]): FakeFiles {
  const key = `${path}|${folders.join(',')}`;
  const known = cache.get(key);
  if (known) return known;
  const zip = readFileSync(path);
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out: FakeFiles = {};
  for (let i = 0; i < entries; i += 1) {
    const method = zip.readUInt16LE(p + 10);
    const compressed = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const extraLength = zip.readUInt16LE(p + 30);
    const commentLength = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;
    const match = /^data\/([^/]+)\/(.+)\.json$/.exec(name);
    if (!match) continue;
    const ns = match[1] as string;
    const rest = match[2] as string;
    const folder = folders.find((f) => rest.startsWith(`${f}/`));
    if (!folder) continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + compressed);
    const data = method === 0 ? raw : inflateRawSync(raw);
    const files = out[folder] ?? {};
    out[folder] = files;
    files[`${ns}:${rest.slice(folder.length + 1)}`] = JSON.parse(data.toString('utf8')) as Json;
  }
  cache.set(key, out);
  return out;
}
