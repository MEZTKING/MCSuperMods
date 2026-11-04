/**
 * The updater's log file (ADR 0018). electron-updater errors can carry HTTP response headers
 * (cookies), the release feed XML and stack traces; they are written here in full and never
 * sent over IPC. The file rotates to `<name>.1` once it would pass `maxBytes`.
 *
 * @packageDocumentation
 */

import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

/** The default size at which the log rotates. */
export const UPDATE_LOG_MAX_BYTES = 256 * 1024;

/** Writes one log entry; never rejects. */
export type UpdateLogWriter = (message: string, error?: unknown) => Promise<void>;

/** The full text of an error: stack (or message), plus `code` and `statusCode` when present. */
export function describeError(error: unknown): string {
  if (error === undefined) return '';
  if (error instanceof Error) {
    const record = error as Error & { code?: unknown; statusCode?: unknown };
    const extras = [
      typeof record.code === 'string' ? `code: ${record.code}` : null,
      typeof record.statusCode === 'number' ? `statusCode: ${record.statusCode}` : null,
    ].filter((line) => line !== null);
    return [error.stack ?? `${error.name}: ${error.message}`, ...extras].join('\n');
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, null, 2) ?? String(error);
  } catch {
    return String(error);
  }
}

/** Creates a writer that appends to `path`, rotating at `maxBytes`. Writes run in order. */
export function createUpdateLog(
  path: string,
  options: { maxBytes?: number; now?: () => Date } = {},
): UpdateLogWriter {
  const maxBytes = options.maxBytes ?? UPDATE_LOG_MAX_BYTES;
  const now = options.now ?? (() => new Date());
  let queue: Promise<void> = Promise.resolve();

  const write = async (message: string, error?: unknown): Promise<void> => {
    const detail = describeError(error);
    let entry = `[${now().toISOString()}] ${message}\n${detail === '' ? '' : `${detail}\n`}`;
    // One entry never exceeds the limit on its own.
    if (Buffer.byteLength(entry) > maxBytes) {
      entry = `${Buffer.from(entry)
        .subarray(0, maxBytes - 16)
        .toString('utf8')}\n[truncated]\n`;
    }
    await mkdir(dirname(path), { recursive: true });
    const size = await stat(path).then(
      (info) => info.size,
      () => 0,
    );
    if (size > 0 && size + Buffer.byteLength(entry) > maxBytes) await rename(path, `${path}.1`);
    await appendFile(path, entry, 'utf8');
  };

  return (message, error) => {
    queue = queue.then(() => write(message, error)).catch(() => undefined);
    return queue;
  };
}
