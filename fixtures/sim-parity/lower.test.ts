/**
 * Lowers `project/` for every built-in target into `mod/<target id>/`: the fixture's content as a
 * Fabric mod folder (`fabric.mod.json`, `msm/` and `data/`; no `assets/`, which no server reads),
 * which `engine-mod/build.gradle.kts` hands to the GameTest server as an extra mod
 * (`fabric.addMods`) for `MsmSimParityGameTest` (ADR 0085 D10). Only `fabric.mod.json` differs by
 * target (the `minecraft` range).
 *
 * Without `UPDATE_SIM_PARITY_MOD=1` it checks that the committed folders equal the lowering and
 * that the project lowers with no problems; with it, it rewrites them. Run from the repository
 * root (see `README.md`):
 *
 *     pnpm --filter @msm/sim exec vitest run --root ../../fixtures/sim-parity
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { builtInTargets, lowerFixture } from '../../packages/sim/test/lower-fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const UPDATE = process.env.UPDATE_SIM_PARITY_MOD === '1';

/** The lowered paths a server reads. */
const keep = (path: string): boolean =>
  path === 'fabric.mod.json' || path.startsWith('msm/') || path.startsWith('data/');

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(root, path)));
    else out.push(path);
  }
  return out.sort();
}

it('mod/<target> holds the lowered fixture project', async () => {
  for (const target of await builtInTargets()) {
    const { files, problems } = await lowerFixture('sim-parity/project', target);
    expect(problems, `problems lowering for ${target.id}`).toEqual([]);
    const wanted = new Map<string, string>();
    for (const [path, contents] of files) {
      if (!keep(path)) continue;
      const text = typeof contents === 'string' ? contents : Buffer.from(contents).toString('utf8');
      wanted.set(path, text.endsWith('\n') ? text : `${text}\n`);
    }
    const root = join(HERE, 'mod', target.id);
    if (UPDATE) {
      await rm(root, { recursive: true, force: true });
      for (const [path, text] of wanted) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), text);
      }
    }
    const committed = await listFiles(root);
    expect(committed, `files in mod/${target.id}`).toEqual([...wanted.keys()].sort());
    for (const path of committed) {
      expect(await readFile(join(root, path), 'utf8'), `mod/${target.id}/${path}`).toBe(
        wanted.get(path),
      );
    }
  }
});
