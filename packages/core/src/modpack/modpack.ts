/**
 * Modpack files (ADR 0046 D1): `msm.modpack.json` lists member projects by folder and pins
 * extra mods from Modrinth. Pure: parsing, validation and deterministic writing only; the app
 * reads and writes the file and resolves member paths.
 *
 * @packageDocumentation
 */

import type { Json } from '../model/index';
import { stableStringify } from '../serialise/index';

/** The modpack file's name inside its folder. */
export const MODPACK_FILE = 'msm.modpack.json';

/** The only modpack format version so far. */
export const MODPACK_FORMAT_VERSION = 1;

/** One member project: its folder, relative to the modpack folder or absolute. */
export interface ModpackProject {
  /**
   * `/`-separated. Relative paths (no leading `/`, no drive) are resolved against the modpack
   * folder and may use `..` to reach sibling folders; absolute paths (`/…`, `C:/…`) are kept
   * for projects on another drive.
   */
  path: string;
}

/** An extra mod: one pinned file of a Modrinth project version (ADR 0046 D6). */
export interface ModpackMod {
  projectId: string;
  versionId: string;
  /** The project's title, for display. */
  title: string;
  /** The jar's file name, also its name in `mods/`. */
  fileName: string;
  /** An `https://cdn.modrinth.com/` download URL. */
  url: string;
  /** Lower-case hex SHA-1. */
  sha1: string;
  /** Lower-case hex SHA-512. */
  sha512: string;
  /** Size in bytes. */
  size: number;
}

/** The contents of {@link MODPACK_FILE}. */
export interface Modpack {
  formatVersion: 1;
  name: string;
  /** Free text, for example `1.0.0`; the `.mrpack` `versionId`. */
  version: string;
  summary?: string;
  /** The Minecraft target every member must use, for example `mc-26.3`. */
  targetId: string;
  projects: ModpackProject[];
  mods: ModpackMod[];
}

/** Why {@link parseModpack} refused a file. */
export class ModpackFormatError extends Error {
  override readonly name = 'ModpackFormatError';
}

const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_128 = /^[0-9a-f]{128}$/;
const MODRINTH_ID = /^[A-Za-z0-9]{8}$/;
/** A jar name usable in `mods/` (no folders, no hidden files). */
const MOD_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*\.jar$/;
const MAX_TEXT = 256;
/** The most member projects and extra mods a modpack may list. */
export const MODPACK_MAX_ENTRIES = 512;

/** A new, empty modpack. */
export function createModpack(name: string, targetId: string): Modpack {
  return { formatVersion: 1, name, version: '1.0.0', targetId, projects: [], mods: [] };
}

/**
 * Whether `path` is a usable member path: non-empty, `/`-separated (no `\`), no empty, `.`
 * or NUL segments. `..` is allowed (sibling folders); absolute paths are allowed.
 */
export function isModpackProjectPath(path: string): boolean {
  if (path === '' || path.length > 1024 || path.includes('\\') || path.includes('\0')) {
    return false;
  }
  const body = path.replace(/^[A-Za-z]:\//, '').replace(/^\//, '');
  if (body === '') return false;
  return body.split('/').every((segment) => segment !== '' && segment !== '.');
}

/** Whether `url` is an HTTPS download on Modrinth's CDN. */
export function isModrinthCdnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'cdn.modrinth.com';
  } catch {
    return false;
  }
}

function text(value: Json | undefined, field: string, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || value.length > MAX_TEXT) {
    throw new ModpackFormatError(
      `${field} must be a non-empty string of at most ${MAX_TEXT} characters.`,
    );
  }
  return value;
}

function object(value: Json | undefined, field: string): { [key: string]: Json } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ModpackFormatError(`${field} must be an object.`);
  }
  return value;
}

function list(value: Json | undefined, field: string): Json[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MODPACK_MAX_ENTRIES) {
    throw new ModpackFormatError(
      `${field} must be a list of at most ${MODPACK_MAX_ENTRIES} entries.`,
    );
  }
  return value;
}

function parseMod(value: Json, index: number): ModpackMod {
  const field = `mods[${index}]`;
  const entry = object(value, field);
  const pick = (key: string): string => text(entry[key], `${field}.${key}`) as string;
  const mod: ModpackMod = {
    projectId: pick('projectId'),
    versionId: pick('versionId'),
    title: pick('title'),
    fileName: pick('fileName'),
    url: pick('url'),
    sha1: pick('sha1'),
    sha512: pick('sha512'),
    size: typeof entry.size === 'number' ? entry.size : Number.NaN,
  };
  if (!MODRINTH_ID.test(mod.projectId) || !MODRINTH_ID.test(mod.versionId)) {
    throw new ModpackFormatError(`${field}: projectId and versionId must be Modrinth ids.`);
  }
  if (!MOD_FILE_NAME.test(mod.fileName)) {
    throw new ModpackFormatError(`${field}.fileName must be a jar file name.`);
  }
  if (!isModrinthCdnUrl(mod.url)) {
    throw new ModpackFormatError(`${field}.url must be an https://cdn.modrinth.com/ address.`);
  }
  if (!HEX_40.test(mod.sha1) || !HEX_128.test(mod.sha512)) {
    throw new ModpackFormatError(`${field}: sha1 and sha512 must be lower-case hex digests.`);
  }
  if (!Number.isSafeInteger(mod.size) || mod.size <= 0) {
    throw new ModpackFormatError(`${field}.size must be a positive whole number.`);
  }
  return mod;
}

/**
 * Parses and validates `msm.modpack.json`. Unknown keys are dropped; duplicate member paths
 * and duplicate mod projects or file names are refused.
 *
 * @throws ModpackFormatError When the text is not a valid modpack.
 */
export function parseModpack(source: string): Modpack {
  let json: Json;
  try {
    json = JSON.parse(source) as Json;
  } catch {
    throw new ModpackFormatError('The modpack file is not valid JSON.');
  }
  const root = object(json, 'The modpack file');
  if (root.formatVersion !== MODPACK_FORMAT_VERSION) {
    throw new ModpackFormatError(
      `Unsupported modpack format version ${JSON.stringify(root.formatVersion)}; this MCSuperMods reads version ${MODPACK_FORMAT_VERSION}.`,
    );
  }
  const projects = list(root.projects, 'projects').map((value, index) => {
    const path = object(value, `projects[${index}]`).path;
    if (typeof path !== 'string' || !isModpackProjectPath(path)) {
      throw new ModpackFormatError(`projects[${index}].path is not a usable folder path.`);
    }
    return { path };
  });
  const paths = new Set<string>();
  for (const { path } of projects) {
    const key = path.toLowerCase();
    if (paths.has(key)) throw new ModpackFormatError(`The project ${path} is listed twice.`);
    paths.add(key);
  }
  const mods = list(root.mods, 'mods').map(parseMod);
  const seen = new Set<string>();
  for (const mod of mods) {
    for (const key of [`project:${mod.projectId}`, `file:${mod.fileName.toLowerCase()}`]) {
      if (seen.has(key)) {
        throw new ModpackFormatError(`The mod ${mod.title} (${mod.fileName}) is listed twice.`);
      }
      seen.add(key);
    }
  }
  const summary = text(root.summary, 'summary', true);
  return {
    formatVersion: 1,
    name: text(root.name, 'name') as string,
    version: text(root.version, 'version') as string,
    ...(summary === undefined ? {} : { summary }),
    targetId: text(root.targetId, 'targetId') as string,
    projects,
    mods,
  };
}

/** Writes a modpack as `msm.modpack.json` text: 2-space JSON with sorted keys. */
export function serialiseModpack(modpack: Modpack): string {
  return stableStringify(modpack as unknown as Json);
}
