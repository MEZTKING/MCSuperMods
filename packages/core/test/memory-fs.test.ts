import { describe, expect, it } from 'vitest';
import { createMemoryFileSystem, utf8 } from '../src/index';

describe('createMemoryFileSystem', () => {
  it('reads initial files and lists them sorted', async () => {
    const fs = createMemoryFileSystem({ 'b/c.txt': 'c', 'a.txt': new Uint8Array([1, 2]) });
    expect(fs.list()).toEqual(['a.txt', 'b/c.txt']);
    expect(utf8.decode(await fs.readFile('b/c.txt'))).toBe('c');
    expect(await fs.readFile('a.txt')).toEqual(new Uint8Array([1, 2]));
  });

  it('creates parent directories on write and lists directories', async () => {
    const fs = createMemoryFileSystem();
    await fs.writeFile('x/y/z.json', utf8.encode('{}'));
    await fs.mkdirp('x/empty');
    expect(await fs.exists('x')).toBe(true);
    expect(await fs.exists('x/y')).toBe(true);
    expect(await fs.readDir('x')).toEqual([
      { name: 'empty', kind: 'directory' },
      { name: 'y', kind: 'directory' },
    ]);
    expect(await fs.readDir('x/y')).toEqual([{ name: 'z.json', kind: 'file' }]);
    expect(fs.list()).toEqual(['x/y/z.json']);
  });

  it('removes files and directories recursively, ignoring missing paths', async () => {
    const fs = createMemoryFileSystem({ 'a/b/c': '1', 'a/d': '2', e: '3' });
    await fs.remove('a/b');
    expect(fs.list()).toEqual(['a/d', 'e']);
    expect(await fs.exists('a/b')).toBe(false);
    await fs.remove('missing/path');
    await fs.remove('e');
    expect(fs.list()).toEqual(['a/d']);
  });

  it('rejects missing files and directories', async () => {
    const fs = createMemoryFileSystem();
    await expect(fs.readFile('nope')).rejects.toThrow();
    await expect(fs.readDir('nope')).rejects.toThrow();
  });

  it('rejects invalid paths', async () => {
    const fs = createMemoryFileSystem();
    await expect(fs.writeFile('../x', new Uint8Array())).rejects.toThrow();
    await expect(fs.exists('/abs')).rejects.toThrow();
  });

  it('copies bytes so callers cannot mutate stored files', async () => {
    const data = new Uint8Array([1]);
    const fs = createMemoryFileSystem();
    await fs.writeFile('f', data);
    data[0] = 9;
    const read = await fs.readFile('f');
    read[0] = 7;
    expect(fs.snapshot().f).toEqual(new Uint8Array([1]));
  });

  it('refuses to write a file over a directory', async () => {
    const fs = createMemoryFileSystem({ 'a/b': '1' });
    await expect(fs.writeFile('a', new Uint8Array())).rejects.toThrow();
  });
});
