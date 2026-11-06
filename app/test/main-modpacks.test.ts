import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createModpackService } from '../src/main/platform/modpacks';
import { writeFileAtomic } from '../src/main/platform/node-platform';

let temp: string;
let roots: string[];
let picks: (string | null)[];

function service(download?: (url: string) => Promise<Uint8Array>) {
  return createModpackService({
    settings: {
      modpackRoots: async () => roots,
      addModpackRoot: async (root) => {
        if (!roots.includes(root)) roots.push(root);
        return roots;
      },
      removeModpackRoot: async (root) => {
        roots = roots.filter((entry) => entry !== root);
        return roots;
      },
    },
    pickDirectory: async () => picks.shift() ?? null,
    writeFileAtomic,
    caseInsensitive: false,
    ...(download === undefined ? {} : { download }),
  });
}

async function project(name: string, files: Record<string, string> = {}): Promise<string> {
  const root = join(temp, name);
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, 'msm.project.json'),
    JSON.stringify({ formatVersion: 1, name, namespaces: [name], targets: ['mc-26.3'] }),
  );
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-modpacks-'));
  roots = [];
  picks = [];
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('modpack service', () => {
  it('creates a modpack, adds projects relatively and lists it', async () => {
    const s = service();
    const ruby = await project('ruby', { 'content/ruby/item/gem.json': '{}' });
    picks.push(join(temp, 'pack'));
    const created = await s.create('  ', 'mc-26.3');
    expect(created?.modpack.name).toBe('My modpack');
    const added = await s.addProject(join(temp, 'pack'), ruby);
    expect(added?.modpack.projects).toEqual([{ path: '../ruby' }]);
    expect(added?.members[0]).toMatchObject({ found: true, name: 'ruby', targetId: 'mc-26.3' });
    await expect(s.addProject(join(temp, 'pack'), ruby)).rejects.toThrow(/already/);
    await expect(s.addProject(join(temp, 'pack'), temp)).rejects.toThrow(
      /not an MCSuperMods project/,
    );
    expect(await s.list()).toEqual([{ root: join(temp, 'pack'), name: 'My modpack', found: true }]);
    const text = await readFile(join(temp, 'pack', 'msm.modpack.json'), 'utf8');
    expect(text).toMatch(/^\{\n {2}"formatVersion": 1,/);
  });

  it('snapshots only listed members, only their project files, and never follows links', async () => {
    const s = service();
    const ruby = await project('ruby', {
      'content/ruby/item/gem.json': '{"kind":"msm:item"}',
      'assets/ruby/textures/item/gem.png': 'png',
      '.msm/trash/old.json': 'trash',
      'notes.txt': 'not part of the project',
    });
    await writeFile(join(temp, 'secret.txt'), 'secret');
    await symlink(join(temp, 'secret.txt'), join(ruby, 'content', 'link.txt'));
    picks.push(join(temp, 'pack'));
    await s.create('Pack', 'mc-26.3');
    await s.addProject(join(temp, 'pack'), ruby);
    const files = await s.readProject(join(temp, 'pack'), '../ruby');
    expect(files.map((file) => file.path).sort()).toEqual([
      'assets/ruby/textures/item/gem.png',
      'content/ruby/item/gem.json',
      'msm.project.json',
    ]);
    await expect(s.readProject(join(temp, 'pack'), '../secret')).rejects.toThrow(/not a project/);
    await expect(s.readProject(join(temp, 'elsewhere'), '../ruby')).rejects.toThrow(
      /not in the Modpacks list/,
    );
  });

  it('writes only valid modpacks and forgets without deleting', async () => {
    const s = service();
    picks.push(join(temp, 'pack'));
    const view = await s.create('Pack', 'mc-26.3');
    if (view === null) throw new Error('not created');
    await expect(
      s.write(view.root, { ...view.modpack, projects: [{ path: 'a\\b' }] }),
    ).rejects.toThrow();
    const renamed = await s.write(view.root, { ...view.modpack, name: 'Renamed', version: '2.0' });
    expect(renamed.modpack).toMatchObject({ name: 'Renamed', version: '2.0' });
    await s.forget(view.root);
    expect(await s.list()).toEqual([]);
    expect(await readFile(join(view.root, 'msm.modpack.json'), 'utf8')).toContain('Renamed');
  });

  it('turns Modrinth lookup failures into plain errors', async () => {
    const s = service(async (url) => {
      throw new Error(`GET ${url} returned HTTP 404.`);
    });
    await expect(s.lookupMod('nope', '26.3')).rejects.toThrow('Modrinth has no such project.');
  });
});
