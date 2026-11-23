/**
 * The local server folder on a real disk through the Node adapter with `rename`: the folder
 * appears whole with its marker, a copied world arrives whole, a foreign server folder stays
 * byte for byte the same, and the start plan names the real folder.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  acceptServerEula,
  ensureServer,
  listServers,
  planServerStart,
  recipeFor,
} from '../../src/index';
import { createNodeInstallFileSystem } from '../../src/node';
import { launcherFor, MOD_PROJECT, modBytes, RELEASE, sha256, sha512 } from './helpers';

async function tree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (path: string, rel: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      const key = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(child, key);
      else out[key] = await readFile(child, 'latin1');
    }
  };
  await walk(dir, '');
  return out;
}

describe('ensureServer on disk', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'msm-servers-'));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('makes the server folder with its world and leaves a foreign folder alone', async () => {
    const servers = join(home, 'servers');
    const theirs = join(servers, 'gem_hunt-9.1');
    await mkdir(theirs, { recursive: true });
    await writeFile(join(theirs, 'server.properties'), 'motd=Mine\n');
    const world = join(home, 'worlds', 'Gem hunt');
    await mkdir(join(world, 'datapacks'), { recursive: true });
    await writeFile(join(world, 'level.dat'), 'level');
    await writeFile(join(world, 'datapacks', 'game.zip'), 'pack');
    await writeFile(join(world, 'session.lock'), 'lock');
    const before = await tree(theirs);

    const fs = createNodeInstallFileSystem({ rename: true });
    const recipe = recipeFor(
      { kind: 'server', world: { folder: 'Gem hunt', source: world } },
      MOD_PROJECT,
      RELEASE,
    );
    let id = 0;
    const made = await ensureServer(
      {
        fs,
        sha512,
        sha256,
        bytesOf: modBytes,
        launcher: () => launcherFor(recipe),
        stagingId: () => `disk-${++id}`,
      },
      servers,
      recipe,
    );
    expect(made.folder).toBe('gem_hunt-9.1-2');
    expect(await tree(theirs)).toEqual(before);
    const files = await tree(made.serverDir);
    expect(Object.keys(files).sort()).toEqual([
      '.msm-server.json',
      'Gem hunt/datapacks/game.zip',
      'Gem hunt/level.dat',
      'fabric-server-launch.jar',
      'mods/.msm-installed.json',
      'mods/fabric-api-0.165.2+9.1.jar',
      'mods/gem_hunt.jar',
      'server.properties',
    ]);
    expect((await readdir(servers)).sort()).toEqual(['gem_hunt-9.1', 'gem_hunt-9.1-2']);

    await acceptServerEula(fs, servers, made.serverDir, {
      accepted: true,
      at: '2026-11-23T18:00:00Z',
    });
    const plan = await planServerStart({ fs, sha256 }, servers, made.serverDir, '/jdk/bin/java');
    expect(plan).toMatchObject({
      ok: true,
      levelName: 'Gem hunt',
      command: { cwd: made.serverDir },
    });
    expect((await listServers(fs, servers)).map((s) => [s.folder, s.eulaAccepted])).toEqual([
      ['gem_hunt-9.1-2', true],
    ]);
  });
});
