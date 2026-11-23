/**
 * The engine stays out of first paint (ADR 0124 D3; B660): in the renderer only the search host
 * (`search/host.ts`, run by the worker or loaded on demand) imports `@msm/search` at run time;
 * every other module imports its types only.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RENDERER = join(__dirname, '../../src/renderer/src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('imports of the search engine', () => {
  it('are made at run time by the search host only', () => {
    const runtime = files(RENDERER).filter((path) => {
      const text = readFileSync(path, 'utf8');
      const imports = text.match(/import\s+(type\s+)?[^;]*?from\s+'@msm\/search'/g) ?? [];
      const dynamic = /import\(\s*'@msm\/search'\s*\)/.test(text);
      return dynamic || imports.some((line) => !/^import\s+type\b/.test(line));
    });
    expect(runtime.map((path) => relative(RENDERER, path))).toEqual(['search/host.ts']);
  });

  it('load the host lazily from the client', () => {
    const client = readFileSync(join(RENDERER, 'search/client.ts'), 'utf8');
    expect(client).toMatch(/await import\('\.\/host'\)/);
    expect(client).not.toMatch(/^import [^;]*from '\.\/host'/m);
    expect(client).toMatch(/new Worker\(new URL\('\.\/worker\.ts', import\.meta\.url\)/);
  });
});
