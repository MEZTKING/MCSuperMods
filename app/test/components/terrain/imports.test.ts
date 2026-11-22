import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_SRC = fileURLToPath(new URL('../../../src', import.meta.url));
const WORKER = ['renderer', 'src', 'terrain', 'worker.ts'].join('/');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

// Any import, export-from, dynamic import or require naming the engine, type-only ones too.
const ENGINE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]@msm\/terrain(?:\/[^'"]*)?['"]/;

describe('the terrain engine stays in the worker (ADR 0119 D5)', () => {
  it('no app source but terrain/worker.ts imports @msm/terrain', () => {
    const offenders = sourceFiles(APP_SRC)
      .map((path) => relative(APP_SRC, path).split(sep).join('/'))
      .filter((path) => path !== WORKER)
      .filter((path) => ENGINE.test(readFileSync(join(APP_SRC, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the worker entry does import it (the check looks at the right file)', () => {
    expect(ENGINE.test(readFileSync(join(APP_SRC, WORKER), 'utf8'))).toBe(true);
  });

  it('the pattern catches every form of import', () => {
    for (const line of [
      "import * as t from '@msm/terrain';",
      "import type { TerrainWorld } from '@msm/terrain';",
      "export { seedFromText } from '@msm/terrain';",
      "const t = await import('@msm/terrain');",
      "import '@msm/terrain/src/api';",
    ]) {
      expect(ENGINE.test(line), line).toBe(true);
    }
    expect(ENGINE.test("import { x } from '@msm/terrain-other';")).toBe(false);
  });
});
