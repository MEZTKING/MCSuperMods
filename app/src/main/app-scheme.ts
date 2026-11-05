/**
 * The privileged `msm-app` scheme the renderer is served from (ADR 0035 D1a). In a `file:`
 * document the CSP keyword `'self'` matches every `file:` URL, so a plugin worker could read
 * any local file; under `msm-app://app/` `'self'` is that origin only.
 *
 * The scheme is registered as privileged before `app.ready` ({@link registerAppSchemePrivileges})
 * and served after it ({@link serveAppScheme}) from the built renderer folder
 * (`out/renderer/`, inside `app.asar` when packaged) with path containment: a request outside
 * that folder, for another host, or for a missing file is a 404.
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute as posixIsAbsolute, relative, resolve, sep } from 'node:path';
import { protocol } from 'electron';

/** The scheme name. */
export const APP_SCHEME = 'msm-app';

/** The only host the scheme serves. */
export const APP_HOST = 'app';

/** The URL the main window loads in production. */
export const APP_INDEX_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

/** Content types by file extension (lower case, with the dot). */
const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

/** The content type for a file path; `application/octet-stream` when unknown. */
export function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf('.');
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (dot <= slash) return 'application/octet-stream';
  return CONTENT_TYPES[path.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

/** The path functions {@link resolveAppSchemePath} needs (Node's `path`, or `path.win32` in tests). */
export interface PathApi {
  resolve(...paths: string[]): string;
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
  sep: string;
}

const nodePath: PathApi = { resolve, relative, isAbsolute: posixIsAbsolute, sep };

/**
 * The file a scheme URL names inside `rootDir`, or `null` when the URL is for another scheme
 * or host, is malformed, or would leave `rootDir`. `/` serves `index.html`.
 *
 * @param rootDir - The renderer folder (absolute).
 * @param url - The request URL.
 * @param path - Path functions (default: the platform's).
 */
export function resolveAppSchemePath(
  rootDir: string,
  url: string,
  path: PathApi = nodePath,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const segments = pathname.split('/').filter((segment) => segment !== '');
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes(':'))) {
    return null;
  }
  const root = path.resolve(rootDir);
  const file = path.resolve(root, ...segments);
  const rel = path.relative(root, file);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return file;
}

/**
 * Registers `msm-app` as a privileged standard, secure scheme with the Fetch API. Must run
 * before `app.ready`.
 */
export function registerAppSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
    },
  ]);
}

/** Answers one scheme request from `rootDir` (exported for tests). */
export async function handleAppSchemeRequest(
  rootDir: string,
  url: string,
  read: (path: string) => Promise<Uint8Array> = readFile,
): Promise<Response> {
  const file = resolveAppSchemePath(rootDir, url);
  if (file === null) return new Response('Not found', { status: 404 });
  let bytes: Uint8Array;
  try {
    bytes = await read(file);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': contentTypeFor(file), 'x-content-type-options': 'nosniff' },
  });
}

/**
 * Serves `rootDir` (the built renderer) on the default session's `msm-app` scheme. Call once,
 * after `app.ready`.
 */
export function serveAppScheme(rootDir: string): void {
  protocol.handle(APP_SCHEME, (request) => handleAppSchemeRequest(rootDir, request.url));
}
