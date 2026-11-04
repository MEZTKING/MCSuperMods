import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtInTargets } from '@msm/targets';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodePlatform, type NativeDialogs } from '../src/main/platform/node-platform';

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
