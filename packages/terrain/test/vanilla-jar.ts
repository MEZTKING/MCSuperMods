/**
 * Test helper: vanilla worldgen files read at test time from the Loom cache's client jars
 * (`~/.gradle/caches/fabric-loom/<version>/minecraft-client.jar`), as the app reads the user's own
 * jar. Nothing is written or kept; tests that need these files skip when no jar is there. The
 * version folders are found by listing, so no version is named here.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { WorldgenFileMap } from '../src/api';

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

/** The folder key of a path under `data/<ns>/` (`worldgen/noise`, `dimension_type`, ...). */
function folderOf(parts: readonly string[]): number {
  if (parts[0] === 'worldgen') return 2;
  if (parts[0] === 'tags') return parts[1] === 'worldgen' ? 3 : 2;
  return 1;
}

const FOLDERS = new Set([
  'worldgen/noise_settings',
  'worldgen/density_function',
  'worldgen/noise',
  'worldgen/material_rule',
  'worldgen/material_condition',
  'worldgen/biome',
  'worldgen/world_preset',
  'worldgen/multi_noise_biome_source_parameter_list',
  'worldgen/flat_level_generator_preset',
  'dimension_type',
  'tags/worldgen/biome',
]);

const cache = new Map<string, WorldgenFileMap>();

/** The terrain folders of one jar, as the engine's `WorldgenFileMap`. */
export function readJarWorldgen(path: string): WorldgenFileMap {
  const known = cache.get(path);
  if (known) return known;
  const zip = readFileSync(path);
  // The end of central directory record: the last 0x06054b50 signature.
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out: Record<string, Record<string, unknown>> = {};
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
    const [, ns, rest] = match as unknown as [string, string, string];
    const parts = rest.split('/');
    const n = folderOf(parts);
    const folder = parts.slice(0, n).join('/');
    if (!FOLDERS.has(folder)) continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + compressed);
    const data = method === 0 ? raw : inflateRawSync(raw);
    const files = out[folder] ?? {};
    out[folder] = files;
    files[`${ns}:${parts.slice(n).join('/')}`] = JSON.parse(data.toString('utf8'));
  }
  cache.set(path, out);
  return out;
}
