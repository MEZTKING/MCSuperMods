/**
 * The Modrinth modpack (`.mrpack`) writer for MSM modpacks (ADR 0046 D4). Pure: the host
 * builds each member project's content jar first and passes the bytes; nothing is
 * downloaded here.
 *
 * @packageDocumentation
 */

import type { ModrinthFileFacts } from '@msm/plugin-api';
import { createZipBytes } from '../zip';

/** The index file inside a `.mrpack`. */
export const MRPACK_INDEX_FILE = 'modrinth.index.json';

/** A file listed as a download in the index (Fabric API, extra mods). */
export interface MrpackDownload extends Omit<ModrinthFileFacts, 'versionId'> {}

/** What {@link createMrpack} packages. */
export interface MrpackInput {
  name: string;
  /** The modpack version, written as `versionId`. */
  version: string;
  summary?: string;
  /** `minecraft` dependency: the target's game version. */
  minecraft: string;
  /** `fabric-loader` dependency. */
  fabricLoader: string;
  /** Listed downloads, installed as `mods/<fileName>`. */
  downloads: readonly MrpackDownload[];
  /** The member projects' jars, written to `overrides/mods/<fileName>`. */
  jars: readonly { fileName: string; data: Uint8Array }[];
}

const JAR_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*\.jar$/;

/**
 * The `modrinth.index.json` value: format version 1, game `minecraft`, the downloads as
 * `files` (each required on client and server) sorted by path, and the loader dependencies.
 */
export function mrpackIndex(input: MrpackInput): Record<string, unknown> {
  const files = [...input.downloads]
    .map((file) => ({
      downloads: [file.url],
      env: { client: 'required', server: 'required' },
      fileSize: file.size,
      hashes: { sha1: file.sha1, sha512: file.sha512 },
      path: `mods/${file.fileName}`,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    dependencies: { 'fabric-loader': input.fabricLoader, minecraft: input.minecraft },
    files,
    formatVersion: 1,
    game: 'minecraft',
    name: input.name,
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    versionId: input.version,
  };
}

/**
 * Writes the `.mrpack` bytes: the index plus `overrides/mods/<jar>` for every member jar.
 * Deterministic (sorted entries, fixed timestamps).
 *
 * @throws Error When a jar name is unsafe, or two files would land at the same `mods/` path.
 */
export function createMrpack(input: MrpackInput): Uint8Array {
  const names = new Set<string>();
  for (const name of [
    ...input.downloads.map((file) => file.fileName),
    ...input.jars.map((jar) => jar.fileName),
  ]) {
    if (!JAR_NAME.test(name)) throw new Error(`${JSON.stringify(name)} is not a jar file name.`);
    const key = name.toLowerCase();
    if (names.has(key)) throw new Error(`Two files would be installed as mods/${name}.`);
    names.add(key);
  }
  const index = `${JSON.stringify(mrpackIndex(input), null, 2)}\n`;
  return createZipBytes([
    { path: MRPACK_INDEX_FILE, data: new TextEncoder().encode(index) },
    ...input.jars.map((jar) => ({ path: `overrides/mods/${jar.fileName}`, data: jar.data })),
  ]);
}

/** The `.mrpack` file name: `<name>-<version>.mrpack` with unsafe characters replaced. */
export function mrpackFileName(name: string, version: string): string {
  const clean = (text: string) =>
    text
      .trim()
      .replace(/[^A-Za-z0-9._ -]+/g, '_')
      .replace(/\s+/g, ' ') || 'modpack';
  return `${clean(name)}-${clean(version)}.mrpack`;
}
