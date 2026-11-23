import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_SRC = fileURLToPath(new URL('../../../src', import.meta.url));
const WORKER = ['renderer', 'src', 'terrain', 'worker.ts'].join('/');
/** B640: the structures worker runs the jigsaw assembler (ADR 0122 D2), the one other entry. */
const STRUCTURES_WORKER = [
  'renderer',
  'src',
  'liveviews',
  'structures',
  'assembly',
  'worker.ts',
].join('/');
const ALLOWED = new Set([WORKER, STRUCTURES_WORKER]);

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
  it('no app source but the two workers imports @msm/terrain', () => {
    const offenders = sourceFiles(APP_SRC)
      .map((path) => relative(APP_SRC, path).split(sep).join('/'))
      .filter((path) => !ALLOWED.has(path))
      .filter((path) => ENGINE.test(readFileSync(join(APP_SRC, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the worker entries do import it (the check looks at the right files)', () => {
    for (const worker of ALLOWED) {
      expect(ENGINE.test(readFileSync(join(APP_SRC, worker), 'utf8')), worker).toBe(true);
    }
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
