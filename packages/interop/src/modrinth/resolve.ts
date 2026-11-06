/**
 * Modrinth lookups for modpack extra mods (ADR 0046 D6): a project slug, id or URL to the
 * newest Fabric version for a Minecraft version, pinned as one file. Metadata only; the jar
 * itself is fetched (and SHA-512 checked) by the host when a modpack is tested. The
 * downloader is injected, so tests never reach the network.
 *
 * @packageDocumentation
 */

import type { Downloader } from '../fabric/types';

/** The Modrinth API base. */
export const MODRINTH_API = 'https://api.modrinth.com/v2';

/** A resolved, pinned mod file (the shape of a modpack's `mods` entry). */
export interface ModrinthModFile {
  projectId: string;
  versionId: string;
  title: string;
  fileName: string;
  url: string;
  sha1: string;
  sha512: string;
  size: number;
}

/** What {@link resolveModrinthMod} found. */
export interface ModrinthResolution {
  file: ModrinthModFile;
  /** The version's name, for example `0.6.2+mc26.3`. */
  versionNumber: string;
  /** Project ids the version requires (`dependency_type` `required`), for the user to add. */
  requiredProjects: string[];
}

/** Why a lookup failed, in words for the user. */
export class ModrinthLookupError extends Error {
  override readonly name = 'ModrinthLookupError';
}

const SLUG = /^[A-Za-z0-9!@$()`.+,"_-]{1,64}$/;

/**
 * The project slug or id in `input`: a bare slug or id, or a `modrinth.com/mod/<slug>` URL
 * (any path after the slug is ignored). `null` when it is neither.
 */
export function modrinthProjectRef(input: string): string | null {
  const text = input.trim();
  const url =
    /^(?:https?:\/\/)?(?:www\.)?modrinth\.com\/(?:mod|project|plugin|datapack)\/([^/?#]+)/i.exec(
      text,
    );
  const ref = url === null ? text : decodeURIComponent(url[1] ?? '');
  return SLUG.test(ref) ? ref : null;
}

async function getJson(download: Downloader, url: string): Promise<unknown> {
  let bytes: Uint8Array;
  try {
    bytes = await download(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/HTTP 404/.test(message)) throw new ModrinthLookupError('Modrinth has no such project.');
    throw new ModrinthLookupError(`Modrinth could not be reached: ${message}`);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new ModrinthLookupError('Modrinth sent an answer that is not JSON.');
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Looks up `input` (slug, id or URL) and pins the primary file of its newest version for
 * loader `fabric` and `gameVersion`.
 *
 * @throws ModrinthLookupError When the project is unknown, not a mod, or has no matching
 *   version.
 */
export async function resolveModrinthMod(
  download: Downloader,
  input: string,
  gameVersion: string,
): Promise<ModrinthResolution> {
  const ref = modrinthProjectRef(input);
  if (ref === null) {
    throw new ModrinthLookupError('Enter a Modrinth project name, id or modrinth.com link.');
  }
  const project = record(
    await getJson(download, `${MODRINTH_API}/project/${encodeURIComponent(ref)}`),
  );
  const projectId = str(project.id);
  const title = str(project.title) || ref;
  if (projectId === '') throw new ModrinthLookupError('Modrinth has no such project.');
  if (project.project_type !== 'mod') {
    throw new ModrinthLookupError(
      `${title} is not a mod (it is a ${str(project.project_type) || 'different kind of project'}).`,
    );
  }
  const query = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}`;
  const versions = await getJson(download, `${MODRINTH_API}/project/${projectId}/version?${query}`);
  const newest = Array.isArray(versions) ? record(versions[0]) : {};
  const files = Array.isArray(newest.files) ? newest.files.map(record) : [];
  const file = files.find((entry) => entry.primary === true) ?? files[0];
  if (newest.id === undefined || file === undefined) {
    throw new ModrinthLookupError(`${title} has no Fabric version for Minecraft ${gameVersion}.`);
  }
  const hashes = record(file.hashes);
  const pinned: ModrinthModFile = {
    projectId,
    versionId: str(newest.id),
    title,
    fileName: str(file.filename),
    url: str(file.url),
    sha1: str(hashes.sha1),
    sha512: str(hashes.sha512),
    size: typeof file.size === 'number' ? file.size : 0,
  };
  const dependencies = Array.isArray(newest.dependencies) ? newest.dependencies.map(record) : [];
  return {
    file: pinned,
    versionNumber: str(newest.version_number),
    requiredProjects: dependencies
      .filter(
        (entry) => entry.dependency_type === 'required' && typeof entry.project_id === 'string',
      )
      .map((entry) => str(entry.project_id)),
  };
}
