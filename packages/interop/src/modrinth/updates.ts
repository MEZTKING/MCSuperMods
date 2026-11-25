/**
 * Which pinned Modrinth mods have a Fabric build for another Minecraft version (ADR 0136 D9,
 * B810 V17): one `POST /v2/version_files/update` with every pinned file's SHA-1 answers for
 * the whole pack, instead of two requests per mod. A hash missing from the answer has no build
 * for that version. Metadata only; the poster is injected, so tests never reach the network.
 *
 * @packageDocumentation
 */

import { MODRINTH_API, ModrinthLookupError } from './resolve';

/**
 * Sends `body` (JSON text) as a `POST` to `url` and returns the answer's bytes. Throws with
 * `HTTP <status>` in the message for an answer that is not 2xx.
 */
export type Poster = (url: string, body: string) => Promise<Uint8Array>;

/** The `User-Agent` of MCSuperMods' Modrinth calls: the app and its repository, nothing else. */
export const MODRINTH_USER_AGENT = 'MCSuperMods (github.com/MEZTKING/MCSuperMods)';

/** The most hashes one check sends (a modpack lists at most 512 entries). */
export const MODRINTH_UPDATE_MAX_HASHES = 512;

/** The address of the batched update check. */
export const MODRINTH_UPDATE_URL = `${MODRINTH_API}/version_files/update`;

const SHA1 = /^[0-9a-f]{40}$/;
const GAME_VERSION = /^[A-Za-z0-9._+-]{1,64}$/;

/** The newest file for the asked version of a pinned mod (a modpack `mods` entry without its title). */
export interface ModrinthUpdatedFile {
  projectId: string;
  versionId: string;
  fileName: string;
  url: string;
  sha1: string;
  sha512: string;
  size: number;
}

/** One pinned file that has a build for the asked version. */
export interface ModrinthUpdate {
  /** The SHA-1 of the pinned file it answers for. */
  from: string;
  /** The newest build's primary file. */
  file: ModrinthUpdatedFile;
  /** The build's name, for example `0.6.2+mc26.3`. */
  versionNumber: string;
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * A {@link Poster} over the global `fetch`: HTTPS only, JSON body, MCSuperMods'
 * {@link MODRINTH_USER_AGENT}.
 */
export const fetchJsonPoster: Poster = async (url, body) => {
  if (!url.startsWith('https://')) throw new Error(`Refusing to send to ${url}: not HTTPS.`);
  const fetchFn = (
    globalThis as {
      fetch?: (
        url: string,
        init: { method: 'POST'; headers: Record<string, string>; body: string },
      ) => Promise<FetchResponseLike>;
    }
  ).fetch;
  if (fetchFn === undefined) throw new Error('fetch is not available.');
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': MODRINTH_USER_AGENT },
    body,
  });
  if (!response.ok) throw new Error(`POST ${url} returned HTTP ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Asks Modrinth once which of the pinned files (`sha1s`) have a Fabric build for
 * `gameVersion`, and pins the primary file of the newest one for each. Hashes are checked,
 * lower-cased and de-duplicated; an empty list asks nothing.
 *
 * @returns One entry per pinned file with a build, in the order of `sha1s`. A file without a
 *   build is absent.
 * @throws ModrinthLookupError When Modrinth cannot be reached, refuses the call or sends an
 *   answer that is not JSON, or an input is not usable.
 */
export async function checkModrinthUpdates(
  post: Poster,
  sha1s: readonly string[],
  gameVersion: string,
): Promise<ModrinthUpdate[]> {
  if (!GAME_VERSION.test(gameVersion)) {
    throw new ModrinthLookupError('That is not a Minecraft version Modrinth knows.');
  }
  const hashes = [...new Set(sha1s.map((hash) => hash.toLowerCase()))];
  if (hashes.some((hash) => !SHA1.test(hash))) {
    throw new ModrinthLookupError('A pinned mod has no usable SHA-1, so it cannot be checked.');
  }
  if (hashes.length > MODRINTH_UPDATE_MAX_HASHES) {
    throw new ModrinthLookupError(
      `At most ${MODRINTH_UPDATE_MAX_HASHES} mods can be checked at once.`,
    );
  }
  if (hashes.length === 0) return [];
  const body = JSON.stringify({
    hashes,
    algorithm: 'sha1',
    loaders: ['fabric'],
    game_versions: [gameVersion],
  });
  let bytes: Uint8Array;
  try {
    bytes = await post(MODRINTH_UPDATE_URL, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/HTTP 429/.test(message)) {
      throw new ModrinthLookupError('Modrinth is busy just now. Try again in a minute.');
    }
    throw new ModrinthLookupError(`Modrinth could not be reached: ${message}`);
  }
  let answer: Record<string, unknown>;
  try {
    answer = record(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  } catch {
    throw new ModrinthLookupError('Modrinth sent an answer that is not JSON.');
  }
  const updates: ModrinthUpdate[] = [];
  for (const from of hashes) {
    const version = record(answer[from]);
    const files = Array.isArray(version.files) ? version.files.map(record) : [];
    const file = files.find((entry) => entry.primary === true) ?? files[0];
    const versionId = str(version.id);
    if (versionId === '' || file === undefined) continue;
    const fileHashes = record(file.hashes);
    updates.push({
      from,
      file: {
        projectId: str(version.project_id),
        versionId,
        fileName: str(file.filename),
        url: str(file.url),
        sha1: str(fileHashes.sha1),
        sha512: str(fileHashes.sha512),
        size: typeof file.size === 'number' ? file.size : 0,
      },
      versionNumber: str(version.version_number),
    });
  }
  return updates;
}
