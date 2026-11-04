import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('@msm/app', () => {
  it('declares the package name and Electron entry point', async () => {
    const json = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { name: string; main: string };
    expect(json.name).toBe('@msm/app');
    expect(json.main).toBe('./out/main/index.js');
  });
});
