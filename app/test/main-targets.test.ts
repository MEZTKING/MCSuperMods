import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { createTargetsService, decodeVendored } from '../src/main/platform/targets';

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('decodeVendored (ADR 0123)', () => {
  const json = '{"a":[1,2,3],"b":"line\\nbreak"}';
  const bytes = new TextEncoder().encode(json);

  it('gunzips a .gz URL to the JSON bytes', async () => {
    const url = new URL('file:///app/out/main/vendor/mc-26.3/mcmeta/blocks.json.gz');
    const decoded = await decodeVendored(url, new Uint8Array(gzipSync(bytes, { level: 9 })));
    expect(text(decoded)).toBe(json);
  });

  it('returns the bytes of a plain .json URL as they are', async () => {
    const url = new URL('file:///repo/packages/targets/mc-26.3/vendor/mcmeta/blocks.json');
    expect(await decodeVendored(url, bytes)).toBe(bytes);
  });

  it('fails a .gz file that is not gzip, naming the file', async () => {
    const url = new URL('file:///app/out/main/vendor/mc-26.3/mcmeta/blocks.json.gz');
    await expect(decodeVendored(url, bytes)).rejects.toThrow(
      /mcmeta\/blocks\.json\.gz is not valid gzip/,
    );
  });
});

describe('createTargetsService.readVendored', () => {
  it('reads the source JSON of every target and key (development layout)', async () => {
    const service = createTargetsService();
    for (const bundle of builtInTargets) {
      const bytes = await service.readVendored(bundle.target.id, 'mcmetaVersion');
      expect(JSON.parse(text(bytes))).toEqual(
        JSON.parse(await readFile(fileURLToPath(bundle.vendored.mcmetaVersion), 'utf8')),
      );
    }
  });

  it("hands the target's URL to the injected reader", async () => {
    const bundle = builtInTargets[0];
    if (bundle === undefined) throw new Error('no targets');
    const json = '{"id":"made-up"}';
    const seen: string[] = [];
    const service = createTargetsService(async (url) => {
      seen.push(url.pathname);
      return new TextEncoder().encode(json);
    });
    expect(text(await service.readVendored(bundle.target.id, 'mcmetaVersion'))).toBe(json);
    expect(seen).toEqual([bundle.vendored.mcmetaVersion.pathname]);
  });

  it('rejects an unknown target', async () => {
    await expect(createTargetsService().readVendored('mc-0.0', 'mcmetaVersion')).rejects.toThrow(
      /Unknown target/,
    );
  });
});
