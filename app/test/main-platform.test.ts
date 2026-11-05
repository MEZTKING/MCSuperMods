import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { builtInTargets } from '@msm/targets';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createNodePlatform,
  type NativeDialogs,
  withAtomicWrites,
  writeFileAtomic,
} from '../src/main/platform/node-platform';
import { makeMmcRoot } from './helpers/fake-launchers';

let temp: string;
let revealed: string[];
let dialogs: NativeDialogs;

const platform = () =>
  createNodePlatform({
    info: async () => ({ version: '0', electron: '0', platform: 'test' }),
    dialogs,
    showItemInFolder: (path) => revealed.push(path),
    resizePng: (png) => png,
    msmHome: join(temp, 'msm-home'),
    installEnv: { platform: 'linux', home: join(temp, 'home') },
  });

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-platform-'));
  revealed = [];
  dialogs = {
    pickDirectory: async () => null,
    confirmDiscard: async () => true,
    openFiles: async () => [],
    saveFilePath: async () => null,
  };
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('main platform dialogs', () => {
  it('reads picked files', async () => {
    await writeFile(join(temp, 'a.png'), new Uint8Array([1, 2]));
    dialogs.openFiles = async () => [join(temp, 'a.png')];
    expect(await platform().dialogs.pickFiles({ title: 'Import' })).toEqual([
      { path: join(temp, 'a.png'), name: 'a.png', data: new Uint8Array([1, 2]) },
    ]);
  });

  it('writes saved files and returns null when cancelled', async () => {
    const p = platform();
    expect(
      await p.dialogs.saveFile({ title: 'x', defaultName: 'a.zip', data: new Uint8Array() }),
    ).toBeNull();
    dialogs.saveFilePath = async ({ defaultName }) => join(temp, 'out', defaultName);
    const path = await p.dialogs.saveFile({
      title: 'Export',
      defaultName: 'pack.zip',
      data: new Uint8Array([7]),
    });
    expect(path).toBe(join(temp, 'out', 'pack.zip'));
    expect(new Uint8Array(await readFile(join(temp, 'out', 'pack.zip')))).toEqual(
      new Uint8Array([7]),
    );
    // Written through a temporary file that is renamed into place: nothing is left over.
    expect(await readdir(join(temp, 'out'))).toEqual(['pack.zip']);
  });

  it('replaces a saved file atomically and cleans up after a failed write', async () => {
    const out = join(temp, 'atomic');
    const file = join(out, 'pack.zip');
    await writeFileAtomic(file, new Uint8Array([1, 2, 3]));
    await writeFileAtomic(file, new Uint8Array([4]));
    expect(new Uint8Array(await readFile(file))).toEqual(new Uint8Array([4]));
    expect(await readdir(out)).toEqual(['pack.zip']);
    // Renaming onto a folder fails; the temporary file must not stay behind.
    await mkdir(join(out, 'taken.zip'));
    await expect(writeFileAtomic(join(out, 'taken.zip'), new Uint8Array([5]))).rejects.toThrow();
    expect((await readdir(out)).sort()).toEqual(['pack.zip', 'taken.zip']);
  });

  it('routes install file system writes through the atomic writer', async () => {
    const inner = createNodeInstallFileSystem();
    const fs = withAtomicWrites({
      ...inner,
      writeFile: async () => {
        throw new Error('The plain writer must not be used.');
      },
    });
    const datapacks = join(temp, 'saves', 'World', 'datapacks');
    await fs.mkdirp(datapacks);
    const file = join(datapacks, 'pack.zip');
    await fs.writeFile(file, new Uint8Array([1, 2]));
    await fs.writeFile(file, new Uint8Array([3]));
    expect(new Uint8Array(await fs.readFile(file))).toEqual(new Uint8Array([3]));
    // Only the target is left: the temporary file was renamed into place.
    expect(await readdir(datapacks)).toEqual(['pack.zip']);
    expect(await fs.exists(file)).toBe(true);
  });
});

describe('main platform shell', () => {
  it('reveals only paths under the project, Minecraft or last save folders', async () => {
    const p = platform();
    const project = join(temp, 'project');
    await p.project.createRoot(project);
    await p.fs.writeFile('msm.project.json', new Uint8Array());
    await p.shell.showItemInFolder(join(project, 'msm.project.json'));

    const minecraft = join(temp, 'minecraft');
    await mkdir(join(minecraft, 'resourcepacks'), { recursive: true });
    await expect(p.shell.showItemInFolder(join(minecraft, 'resourcepacks'))).rejects.toThrow(
      /outside/,
    );
    await p.settings.set({ minecraftDir: minecraft });
    await p.shell.showItemInFolder(join(minecraft, 'resourcepacks'));

    const saved = join(temp, 'exports', 'pack.zip');
    await expect(p.shell.showItemInFolder(saved)).rejects.toThrow(/outside/);
    dialogs.saveFilePath = async () => saved;
    await p.dialogs.saveFile({ title: 'x', defaultName: 'pack.zip', data: new Uint8Array() });
    await p.shell.showItemInFolder(saved);

    await expect(p.shell.showItemInFolder(join(temp, 'elsewhere.txt'))).rejects.toThrow(/outside/);
    await expect(p.shell.showItemInFolder('relative')).rejects.toThrow(/absolute/);
    expect(revealed).toHaveLength(3);
  });
});

describe('main platform Java project reveal', () => {
  it('reveals a written Java project folder', async () => {
    const parent = join(temp, 'java-exports');
    await mkdir(parent);
    dialogs.pickExportFolder = async () => parent;
    const p = platform();
    const root = join(parent, 'demo_mod');
    await expect(p.shell.showItemInFolder(root)).rejects.toThrow(/outside/);
    const folder = await p.exports.pickFolder('Export Java project: choose a folder');
    expect(folder).toBe(parent);
    const result = await p.exports.writeTree(parent, [
      { path: 'demo_mod/build.gradle.kts', data: new TextEncoder().encode('plugins {}') },
    ]);
    expect(result).toEqual({ ok: true, root, count: 1 });
    await p.shell.showItemInFolder(root);
    expect(revealed).toEqual([root]);
  });
});

describe('main platform install target', () => {
  it('reveals files in the selected launcher instance and installs there', async () => {
    const prism = await makeMmcRoot(join(temp, 'prism'), {
      instances: [{ folder: 'inst', mcVersion: '9.9-msm-test' }],
    });
    const p = platform();
    await p.settings.set({
      launchers: { prismDataDirs: [prism.root], multimcRoots: [], curseForgeRoots: [] },
    });
    const packs = join(prism.gameDir('inst'), 'resourcepacks');
    await mkdir(packs, { recursive: true });
    await expect(p.shell.showItemInFolder(packs)).rejects.toThrow(/outside/);

    await p.settings.set({
      installTarget: { launcher: 'prism', root: prism.root, instance: 'inst' },
    });
    const { path } = await p.minecraft.installResourcePack('Pack.zip', new Uint8Array([1]));
    expect(path).toBe(join(packs, 'Pack.zip'));
    await p.shell.showItemInFolder(path);
    expect(revealed).toEqual([path]);
    // Other instances stay out of reach.
    await expect(p.shell.showItemInFolder(prism.instancesDir)).rejects.toThrow(/outside/);
  });
});

describe('main platform exports', () => {
  it('picks with the export dialog, falls back to pickDirectory, and reveals written files', async () => {
    const out = join(temp, 'exports');
    await mkdir(out);
    dialogs.pickDirectory = async () => out;
    const p = platform();
    // Without `pickExportFolder` the directory picker is used.
    expect(await p.exports.pickFolder('Export')).toBe(out);
    const { paths } = await p.exports.writeFiles(out, [
      { name: 'demo-data.zip', data: new Uint8Array([9]) },
    ]);
    expect(paths).toEqual([join(out, 'demo-data.zip')]);
    await p.shell.showItemInFolder(join(out, 'demo-data.zip'));
    expect(revealed).toHaveLength(1);

    const other = join(temp, 'other');
    await mkdir(other);
    dialogs.pickExportFolder = async () => other;
    expect(await platform().exports.pickFolder('Export')).toBe(other);
  });
});

describe('main platform targets', () => {
  it('reads vendored files of built-in targets', async () => {
    const bundle = builtInTargets[0];
    if (bundle === undefined) throw new Error('No built-in target.');
    const bytes = await platform().targets.readVendored(bundle.target.id, 'mcmetaVersion');
    expect(JSON.parse(new TextDecoder().decode(bytes))).toBeTypeOf('object');
    await expect(
      platform().targets.readVendored('no-such-target', 'mcmetaVersion'),
    ).rejects.toThrow(/Unknown target/);
  });
});

describe('main platform recent projects', () => {
  const recentPlatform = (events: { changed: string[][]; documents: string[]; cleared: number }) =>
    createNodePlatform({
      info: async () => ({ version: '0', electron: '0', platform: 'test' }),
      dialogs,
      showItemInFolder: (path) => revealed.push(path),
      resizePng: (png) => png,
      msmHome: join(temp, 'msm-home'),
      installEnv: { platform: 'linux', home: join(temp, 'home') },
      now: () => '2026-11-04T00:00:00.000Z',
      onRecentChanged: (recent) => events.changed.push(recent.map((entry) => entry.root)),
      addRecentDocument: (root) => events.documents.push(root),
      clearRecentDocuments: () => {
        events.cleared += 1;
      },
    });

  it('records created and opened projects, newest first, with names and exists flags', async () => {
    const events = { changed: [] as string[][], documents: [] as string[], cleared: 0 };
    const p = recentPlatform(events);
    const a = join(temp, 'alpha');
    const b = join(temp, 'beta');
    await p.project.createRoot(a);
    // Before the project file is written, the folder name stands in.
    expect(await p.project.recent()).toEqual([
      { root: a, name: 'alpha', openedAt: '2026-11-04T00:00:00.000Z', exists: false },
    ]);
    await p.fs.writeFile('msm.project.json', new TextEncoder().encode('{"name":"Alpha Pack"}'));
    await p.project.createRoot(b);
    await p.fs.writeFile('msm.project.json', new TextEncoder().encode('{}'));
    expect((await p.project.recent()).map((entry) => [entry.name, entry.exists])).toEqual([
      ['beta', true],
      ['Alpha Pack', true],
    ]);
    expect(await p.project.openRoot(a)).toEqual({ ok: true });
    expect((await p.project.recent()).map((entry) => entry.root)).toEqual([a, b]);
    expect(events.changed).toEqual([[a], [b, a], [a, b]]);
    expect(events.documents).toEqual([a, b, a]);
  });

  it('opens only listed roots that still hold msm.project.json', async () => {
    const events = { changed: [] as string[][], documents: [] as string[], cleared: 0 };
    const p = recentPlatform(events);
    const listed = join(temp, 'listed');
    const unlisted = join(temp, 'unlisted');
    for (const dir of [listed, unlisted]) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'msm.project.json'), '{}');
    }
    await p.project.openRoot(listed);
    await p.project.closeRoot();
    expect(await p.project.openRecent(unlisted)).toEqual({
      ok: false,
      reason: `${unlisted} is not in the recent projects list.`,
    });
    expect(await p.project.openRecent('relative')).toMatchObject({ ok: false });
    expect(await p.project.currentRoot()).toBeNull();
    expect(await p.project.openRecent(`${listed}/`)).toEqual({ ok: true });
    expect(await p.project.currentRoot()).toBe(listed);

    await rm(join(listed, 'msm.project.json'));
    expect((await p.project.recent())[0]?.exists).toBe(false);
    expect(await p.project.openRecent(listed)).toEqual({
      ok: false,
      reason: `${listed} does not contain msm.project.json.`,
    });
  });

  it('removes and clears entries and tells the menu', async () => {
    const events = { changed: [] as string[][], documents: [] as string[], cleared: 0 };
    const p = recentPlatform(events);
    const a = join(temp, 'a');
    const b = join(temp, 'b');
    await p.project.createRoot(a);
    await p.project.createRoot(b);
    await p.project.removeRecent(a);
    expect((await p.project.recent()).map((entry) => entry.root)).toEqual([b]);
    await p.project.clearRecent();
    expect(await p.project.recent()).toEqual([]);
    expect(events.changed.slice(-2)).toEqual([[b], []]);
    expect(events.cleared).toBe(1);
    // A cleared list stays out of settings.json.
    const text = await readFile(join(temp, 'msm-home', 'settings.json'), 'utf8');
    expect(text).not.toContain('recentProjects');
  });
});
