import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createZipBytes } from '../src/index';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const files = [
  { path: 'pack.mcmeta', data: encode('{"pack":{}}\n') },
  { path: 'assets/ruby/models/block/ruby.json', data: encode('{"parent":"block/cube_all"}\n') },
  { path: 'assets/ruby/textures/block/ruby.png', data: new Uint8Array([137, 80, 78, 71, 0, 1]) },
  { path: 'assets/ruby/lang/en_us.json', data: encode('{}\n'.repeat(50)) },
];

interface CentralEntry {
  name: string;
  versionMadeBy: number;
  dosTime: number;
  dosDate: number;
  method: number;
  externalAttrs: number;
}

/** Reads the central directory of a zip without fflate, so the test checks the raw bytes. */
function centralDirectory(bytes: Uint8Array): CentralEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  expect(eocd).toBeGreaterThanOrEqual(0);
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: CentralEntry[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      versionMadeBy: view.getUint16(offset + 4, true),
      method: view.getUint16(offset + 10, true),
      dosTime: view.getUint16(offset + 12, true),
      dosDate: view.getUint16(offset + 14, true),
      externalAttrs: view.getUint32(offset + 38, true),
      name: new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe('createZipBytes', () => {
  it('is byte-for-byte deterministic', () => {
    expect(createZipBytes(files)).toEqual(createZipBytes(files));
  });

  it('does not depend on input order', () => {
    expect(createZipBytes([...files].reverse())).toEqual(createZipBytes(files));
  });

  it('stores entries sorted by path, without directory entries', () => {
    const names = centralDirectory(createZipBytes(files)).map((entry) => entry.name);
    expect(names).toEqual([...files.map((file) => file.path)].sort());
    expect(names.some((name) => name.endsWith('/'))).toBe(false);
  });

  it('stamps every entry 2000-01-01 00:00 with os 0', () => {
    const dosDate = ((2000 - 1980) << 9) | (1 << 5) | 1;
    for (const entry of centralDirectory(createZipBytes(files))) {
      expect(entry.dosDate).toBe(dosDate);
      expect(entry.dosTime).toBe(0);
      expect(entry.versionMadeBy >> 8).toBe(0);
      expect(entry.externalAttrs).toBe(0);
    }
  });

  it('round-trips the contents', () => {
    const unzipped = unzipSync(createZipBytes(files));
    expect(Object.keys(unzipped).sort()).toEqual(files.map((file) => file.path).sort());
    for (const file of files) expect(unzipped[file.path]).toEqual(file.data);
  });

  it('deflates compressible entries', () => {
    const lang = centralDirectory(createZipBytes(files)).find((entry) =>
      entry.name.endsWith('en_us.json'),
    );
    expect(lang?.method).toBe(8);
  });

  it('rejects duplicate paths', () => {
    expect(() => createZipBytes([files[0], files[0]] as typeof files)).toThrow(/Duplicate/);
  });

  it('produces an empty archive for no files', () => {
    expect(centralDirectory(createZipBytes([]))).toEqual([]);
  });
});
