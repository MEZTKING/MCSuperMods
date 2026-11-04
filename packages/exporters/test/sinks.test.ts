import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  createFileSystemSink,
  createMemorySink,
  createZipBytes,
  createZipSink,
} from '../src/index';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('sinks', () => {
  it('memory sink keeps the last write per path', async () => {
    const sink = createMemorySink();
    await sink.writeFile('a/b.json', bytes('1'));
    await sink.writeFile('a/b.json', bytes('2'));
    await sink.writeFile('c.txt', bytes('3'));
    expect([...sink.files().keys()]).toEqual(['a/b.json', 'c.txt']);
    expect(sink.files().get('a/b.json')).toEqual(bytes('2'));
  });

  it('zip sink produces the same bytes as createZipBytes', async () => {
    const sink = createZipSink();
    await sink.writeFile('z.json', bytes('z'));
    await sink.writeFile('a/a.json', bytes('a'));
    const zip = sink.finish();
    expect(zip).toEqual(
      createZipBytes([
        { path: 'a/a.json', data: bytes('a') },
        { path: 'z.json', data: bytes('z') },
      ]),
    );
    expect(Object.keys(unzipSync(zip))).toEqual(['a/a.json', 'z.json']);
  });

  it('file-system sink forwards writes', async () => {
    const calls: string[] = [];
    const sink = createFileSystemSink(async (path) => {
      calls.push(path);
    });
    await sink.writeFile('assets/x/y.png', bytes(''));
    expect(calls).toEqual(['assets/x/y.png']);
  });

  it.each(['../escape.json', '/abs.json', 'a\\b.json', 'a//b', './a', ''])(
    'every sink rejects the unsafe path %j',
    async (path) => {
      const calls: string[] = [];
      const sinks = [
        createMemorySink(),
        createZipSink(),
        createFileSystemSink(async (p) => {
          calls.push(p);
        }),
      ];
      for (const sink of sinks) await expect(sink.writeFile(path, bytes(''))).rejects.toThrow();
      expect(calls).toEqual([]);
    },
  );
});
