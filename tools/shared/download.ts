/**
 * Shared helpers for the `tools/sync-*` scripts: HTTP fetch with a jsDelivr
 * fallback, deterministic JSON serialisation and atomic file writes.
 *
 * Run under plain `node` (Node >= 22.18 strips types): only erasable
 * TypeScript syntax and `node:` imports are allowed here.
 *
 * Everything downloaded through these helpers is untrusted data. It is parsed
 * and written to disk, never executed.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/** A GitHub repository in `owner/name` form, for example `misode/mcmeta`. */
export type GitHubRepository = `${string}/${string}`;

/** `https://raw.githubusercontent.com/<repo>/<ref>/<path>` */
export function rawGitHubUrl(repository: GitHubRepository, ref: string, path: string): string {
  return `https://raw.githubusercontent.com/${repository}/${ref}/${trimLeadingSlash(path)}`;
}

/** `https://cdn.jsdelivr.net/gh/<repo>@<ref>/<path>`, used when raw.githubusercontent.com fails. */
export function jsDelivrUrl(repository: GitHubRepository, ref: string, path: string): string {
  return `https://cdn.jsdelivr.net/gh/${repository}@${ref}/${trimLeadingSlash(path)}`;
}

function trimLeadingSlash(path: string): string {
  return path.replace(/^\/+/, '');
}

/** Thrown when a download returns a non-2xx status or fails at the network level. */
export class DownloadError extends Error {
  readonly url: string;
  readonly status: number | undefined;

  constructor(url: string, status: number | undefined, message: string) {
    super(message);
    this.name = 'DownloadError';
    this.url = url;
    this.status = status;
  }
}

/** Downloads `url` and returns its body. Throws `DownloadError` on any failure. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'follow' });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new DownloadError(url, undefined, `GET ${url} failed: ${reason}`);
  }
  if (!response.ok) {
    throw new DownloadError(url, response.status, `GET ${url} returned HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Downloads `url` and decodes it as UTF-8 (fatal on invalid bytes). */
export async function fetchText(url: string): Promise<string> {
  return new TextDecoder('utf-8', { fatal: true }).decode(await fetchBytes(url));
}

/** Result of `fetchGitHubFile`: the body and the URL that produced it. */
export interface FetchedFile {
  text: string;
  url: string;
}

/**
 * Downloads a file from a GitHub repository at `ref` via raw.githubusercontent.com,
 * retrying once through jsDelivr if the raw request fails.
 */
export async function fetchGitHubFile(
  repository: GitHubRepository,
  ref: string,
  path: string,
  log: (message: string) => void = () => {},
): Promise<FetchedFile> {
  const primary = rawGitHubUrl(repository, ref, path);
  try {
    return { text: await fetchText(primary), url: primary };
  } catch (error) {
    const fallback = jsDelivrUrl(repository, ref, path);
    const reason = error instanceof Error ? error.message : String(error);
    log(`${reason}; retrying via ${fallback}`);
    return { text: await fetchText(fallback), url: fallback };
  }
}

/**
 * `JSON.parse` that refuses integers outside the IEEE-754 safe range, so the
 * vendored copy can never silently differ from the upstream text.
 */
export function parseJsonStrict(text: string, label = 'JSON'): unknown {
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => {
    const source = context?.source;
    if (
      typeof value === 'number' &&
      source !== undefined &&
      /^-?\d+$/.test(source) &&
      !Number.isSafeInteger(value)
    ) {
      throw new Error(`${label}: integer ${source} cannot be represented exactly`);
    }
    return value;
  });
}

/** Compares two strings by Unicode code point (not UTF-16 code unit, not locale). */
export function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const x = left[i]?.codePointAt(0) ?? 0;
    const y = right[i]?.codePointAt(0) ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return left.length - right.length;
}

/**
 * Serialises JSON data deterministically: object keys sorted by code point at
 * every depth, arrays kept in order, 2-space indent, trailing newline.
 *
 * Written by hand rather than via `JSON.stringify` on a re-keyed copy because
 * JavaScript objects always enumerate integer-like keys (`"0"`, `"10"`) first,
 * which would break the sort order.
 *
 * Throws `TypeError` on values that are not JSON (`undefined`, functions,
 * non-finite numbers, bigint, symbols).
 */
export function stringifySorted(value: unknown): string {
  return `${serialise(value, '', '$')}\n`;
}

function serialise(value: unknown, indent: string, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`${path}: non-finite number`);
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new TypeError(`${path}: ${typeof value} is not a JSON value`);
  }
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item, i) => `${inner}${serialise(item, inner, `${path}[${i}]`)}`);
    return `[\n${items.join(',\n')}\n${indent}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort(compareCodePoints);
  if (keys.length === 0) return '{}';
  const entries = keys.map(
    (key) => `${inner}${JSON.stringify(key)}: ${serialise(record[key], inner, `${path}.${key}`)}`,
  );
  return `{\n${entries.join(',\n')}\n${indent}}`;
}

/**
 * Writes `data` to `path` atomically: a temporary file in the same directory,
 * then `rename`. Creates the parent directory if needed.
 */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temporary, data);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Current time as an ISO-8601 UTC string, for `SOURCE.json` `fetchedAt`. */
export function nowIso(): string {
  return new Date().toISOString();
}
