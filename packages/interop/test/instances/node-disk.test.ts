/**
 * `ensureInstance` on a real disk through the Node adapter with `rename`: the instance and a
 * copied world appear whole, a foreign instance stays byte for byte the same, and the adapter's
 * `rename` refuses a target that exists (POSIX would replace an empty folder).
 */

import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureInstance, listManaged, listMmcInstances, recipeFor } from '../../src/index';
import { createNodeInstallFileSystem } from '../../src/node';
import { bytesOf, RELEASE, sha512 } from './helpers';

async function tree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (path: string, rel: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      const key = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(child, key);
      else out[key] = await readFile(child, 'utf8');
    }
  };
  await walk(dir, '');
  return out;
}

describe('ensureInstance on disk', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'msm-instances-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('makes the Plain instance with its world and leaves a foreign instance alone', async () => {
    const prism = join(root, 'prism');
    const foreign = join(prism, 'instances', 'Mine');
    await mkdir(join(foreign, 'minecraft', 'saves', 'World'), { recursive: true });
    await writeFile(join(prism, 'prismlauncher.cfg'), 'InstanceDir=instances\n');
    await writeFile(join(foreign, 'instance.cfg'), '[General]\nname=Mine\n');
    await writeFile(join(foreign, 'minecraft', 'saves', 'World', 'level.dat'), 'theirs');
    const source = join(root, 'world');
    await mkdir(join(source, 'datapacks'), { recursive: true });
    await writeFile(join(source, 'level.dat'), 'level');
    await writeFile(join(source, 'datapacks', 'game.zip'), 'pack');
    const before = await tree(foreign);

    const fs = createNodeInstallFileSystem({ rename: true });
    const recipe = recipeFor(
      { kind: 'plain', world: { folder: 'msm-game-parkour', source } },
      { namespace: 'parkour', modId: 'parkour', playsWithoutMods: true },
      RELEASE,
    );
    const made = await ensureInstance({ fs, sha512, bytesOf }, prism, recipe);
    expect(made.created).toBe(true);
    expect(
      await readFile(
        join(made.gameDir, 'saves', 'msm-game-parkour', 'datapacks', 'game.zip'),
        'utf8',
      ),
    ).toBe('pack');
    const again = await ensureInstance({ fs, sha512, bytesOf }, prism, recipe);
    expect(again.created).toBe(false);

    expect(await tree(foreign)).toEqual(before);
    expect((await readdir(join(prism, 'instances'))).sort()).toEqual([
      'MCSuperMods Plain (9.1)',
      'Mine',
    ]);
    expect(await listMmcInstances(fs, prism, 'prism')).toHaveLength(2);
    expect((await listManaged(fs, [prism])).map((entry) => entry.folder)).toEqual([
      'MCSuperMods Plain (9.1)',
    ]);
  });

  it('rename refuses a target that exists, even an empty folder', async () => {
    const fs = createNodeInstallFileSystem({ rename: true });
    await mkdir(join(root, 'a'));
    await writeFile(join(root, 'a', 'f'), 'x');
    await mkdir(join(root, 'b'));
    await expect(fs.rename?.(join(root, 'a'), join(root, 'b'))).rejects.toThrow(/EEXIST/);
    expect((await stat(join(root, 'a', 'f'))).isFile()).toBe(true);
    await fs.rename?.(join(root, 'a'), join(root, 'c'));
    expect(await readFile(join(root, 'c', 'f'), 'utf8')).toBe('x');
    // Without the option the adapter has no rename.
    expect(createNodeInstallFileSystem().rename).toBeUndefined();
  });
});
