import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createUpdateLog, describeError } from '../src/main/update-log';

let dir: string | null = null;
afterEach(async () => {
  if (dir !== null) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe('createUpdateLog', () => {
  it('writes the full error, including code and status, to the file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'msm-update-log-'));
    const path = join(dir, 'logs', 'updater.log');
    const log = createUpdateLog(path, { now: () => new Date('2026-11-04T10:00:00Z') });
    const error = Object.assign(
      new Error('406 Not Acceptable\nHeaders: {"set-cookie": "_gh_sess=1"}'),
      {
        code: 'HTTP_ERROR_406',
        statusCode: 406,
      },
    );
    await log('MSM updates: the check failed.', error);
    const text = await readFile(path, 'utf8');
    expect(text).toContain('[2026-11-04T10:00:00.000Z] MSM updates: the check failed.');
    expect(text).toContain('_gh_sess=1');
    expect(text).toContain('code: HTTP_ERROR_406');
    expect(text).toContain('statusCode: 406');
  });

  it('rotates once the file would pass the limit', async () => {
    dir = await mkdtemp(join(tmpdir(), 'msm-update-log-'));
    const path = join(dir, 'updater.log');
    const log = createUpdateLog(path, { maxBytes: 1024 });
    for (let i = 0; i < 20; i += 1) void log(`entry ${i}`, 'x'.repeat(100));
    await log('last');
    expect((await stat(path)).size).toBeLessThanOrEqual(1024);
    expect((await stat(`${path}.1`)).size).toBeLessThanOrEqual(1024);
    expect(await readFile(path, 'utf8')).toContain('last');
  });

  it('describes non-Error values', () => {
    expect(describeError('text')).toBe('text');
    expect(describeError({ a: 1 })).toContain('"a": 1');
    expect(describeError(undefined)).toBe('');
  });
});
