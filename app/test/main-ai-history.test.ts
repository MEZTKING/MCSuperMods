import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type AiHistoryRecord,
  createAiHistoryStore,
  fitHistory,
  historyFileName,
} from '../src/main/ai/ai-history';

const record = (messages: unknown[], root = '/p/one'): AiHistoryRecord => ({
  format: 1,
  root,
  savedAt: '2026-11-08T00:00:00.000Z',
  model: 'claude-sonnet-5-5',
  messages,
  transcript: '{"messages":[]}',
});

const atomic = (path: string, data: Uint8Array) => writeFile(path, data);

describe('ai history', () => {
  it('names files by a hash of the root', () => {
    expect(historyFileName('/p/one')).toMatch(/^[0-9a-f]{40}\.json$/);
    expect(historyFileName('/p/one')).not.toBe(historyFileName('/p/two'));
  });

  it('writes, reads back and removes a record', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'msm-ai-history-')), 'h');
    const store = createAiHistoryStore(dir, atomic);
    expect(await store.read('/p/one')).toBeNull();
    const saved = record([{ role: 'user', content: 'hi' }]);
    await store.write(saved);
    expect(await store.read('/p/one')).toEqual(saved);
    expect(await store.read('/p/two')).toBeNull();
    await store.remove('/p/one');
    expect(await store.read('/p/one')).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });

  it('reads a damaged file as none', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'msm-ai-history-'));
    await writeFile(join(dir, historyFileName('/p/one')), '{not json');
    expect(await createAiHistoryStore(dir, atomic).read('/p/one')).toBeNull();
  });

  it('drops pictures, then the oldest turns, to fit', () => {
    const picture = { type: 'image', source: { type: 'base64', data: 'x'.repeat(2000) } };
    const fitted = fitHistory(
      record([
        { role: 'user', content: [picture, { type: 'text', text: 'old' }] },
        { role: 'assistant', content: 'a'.repeat(500) },
        { role: 'user', content: 'new' },
        { role: 'assistant', content: 'ok' },
      ]),
      600,
    );
    expect(fitted?.messages).toEqual([
      { role: 'user', content: 'new' },
      { role: 'assistant', content: 'ok' },
    ]);
    const small = fitHistory(record([{ role: 'user', content: [picture] }]), 1000);
    expect(JSON.stringify(small)).not.toContain('xxxx');
    expect(fitHistory(record([{ role: 'user', content: 'y'.repeat(5000) }]), 1000)).toBeNull();
  });
});
