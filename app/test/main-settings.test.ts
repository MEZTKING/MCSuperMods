import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSettingsStore, resolveMsmHome } from '../src/main/platform/settings';

let temp: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-settings-'));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('resolveMsmHome', () => {
  it('uses MSM_HOME when absolute, otherwise <home>/.msm', () => {
    expect(resolveMsmHome({ MSM_HOME: join(temp, 'x') }, '/home/a')).toBe(join(temp, 'x'));
    expect(resolveMsmHome({}, join(temp, 'home'))).toBe(join(temp, 'home', '.msm'));
    expect(resolveMsmHome({ MSM_HOME: 'relative' }, join(temp, 'home'))).toBe(
      join(temp, 'home', '.msm'),
    );
  });
});

const noLaunchers = { prismDataDirs: [], multimcRoots: [], curseForgeRoots: [] };

describe('settings store', () => {
  const store = () =>
    createSettingsStore({
      msmHome: join(temp, 'msm'),
      installEnv: { platform: 'linux', home: join(temp, 'home') },
    });

  it('defaults to nothing when no file and no launcher folder exist', async () => {
    expect(await store().get()).toEqual({
      minecraftDir: null,
      updates: { autoCheck: true },
      launchers: noLaunchers,
      installTarget: null,
      detectedMinecraftDir: null,
    });
    expect(await store().minecraftDir()).toBeNull();
    expect(await store().installTarget()).toBeNull();
    expect(await store().launcherSettings()).toEqual(noLaunchers);
    expect(await store().autoCheckUpdates()).toBe(true);
  });

  it('detects the default launcher folder', async () => {
    await mkdir(join(temp, 'home', '.minecraft'), { recursive: true });
    const detected = join(temp, 'home', '.minecraft');
    expect(await store().get()).toEqual({
      minecraftDir: null,
      updates: { autoCheck: true },
      launchers: noLaunchers,
      installTarget: null,
      detectedMinecraftDir: detected,
    });
    expect(await store().minecraftDir()).toBe(detected);
  });

  it('persists the chosen folder as sorted JSON and prefers it', async () => {
    await mkdir(join(temp, 'home', '.minecraft'), { recursive: true });
    const chosen = join(temp, 'games', 'mc');
    await store().set({ minecraftDir: chosen });
    expect(await readFile(join(temp, 'msm', 'settings.json'), 'utf8')).toBe(
      `{\n  "minecraftDir": ${JSON.stringify(chosen)},\n  "updates": {\n    "autoCheck": true\n  }\n}\n`,
    );
    expect((await store().get()).minecraftDir).toBe(chosen);
    expect(await store().minecraftDir()).toBe(chosen);
    await store().set({ minecraftDir: null });
    expect(await store().minecraftDir()).toBe(join(temp, 'home', '.minecraft'));
  });

  it('merges partial updates and keeps the update setting', async () => {
    const chosen = join(temp, 'games', 'mc');
    await store().set({ minecraftDir: chosen });
    await store().set({ updates: { autoCheck: false } });
    expect(await store().autoCheckUpdates()).toBe(false);
    expect((await store().get()).minecraftDir).toBe(chosen);
    await store().set({ minecraftDir: null });
    expect(await store().autoCheckUpdates()).toBe(false);
    expect(await readFile(join(temp, 'msm', 'settings.json'), 'utf8')).toBe(
      '{\n  "minecraftDir": null,\n  "updates": {\n    "autoCheck": false\n  }\n}\n',
    );
    await store().set({});
    expect(await store().autoCheckUpdates()).toBe(false);
  });

  it('treats anything but an explicit false as auto-check on', async () => {
    await mkdir(join(temp, 'msm'), { recursive: true });
    await writeFile(join(temp, 'msm', 'settings.json'), '{"updates":{"autoCheck":"no"}}');
    expect(await store().autoCheckUpdates()).toBe(true);
    await writeFile(join(temp, 'msm', 'settings.json'), '{"updates":null}');
    expect(await store().autoCheckUpdates()).toBe(true);
    await writeFile(join(temp, 'msm', 'settings.json'), '{"updates":{"autoCheck":false}}');
    expect(await store().autoCheckUpdates()).toBe(false);
  });

  it('rejects relative folders and ignores a corrupt file', async () => {
    await expect(store().set({ minecraftDir: 'relative/mc' })).rejects.toThrow(/absolute/);
    await mkdir(join(temp, 'msm'), { recursive: true });
    await writeFile(join(temp, 'msm', 'settings.json'), '{ not json');
    expect((await store().get()).minecraftDir).toBeNull();
    await writeFile(join(temp, 'msm', 'settings.json'), '{"minecraftDir":"relative"}');
    expect((await store().get()).minecraftDir).toBeNull();
  });

  it('round-trips launcher folders and the install target as sorted JSON', async () => {
    const prism = join(temp, 'prism');
    const cf = join(temp, 'cf', 'minecraft');
    const target = { launcher: 'prism' as const, root: prism, instance: 'My Pack' };
    await store().set({
      launchers: { prismDataDirs: [prism], multimcRoots: [], curseForgeRoots: [cf] },
      installTarget: target,
    });
    expect(await store().launcherSettings()).toEqual({
      prismDataDirs: [prism],
      multimcRoots: [],
      curseForgeRoots: [cf],
    });
    expect(await store().installTarget()).toEqual(target);
    const view = await store().get();
    expect(view.installTarget).toEqual(target);
    expect(view.launchers?.curseForgeRoots).toEqual([cf]);
    expect(await readFile(join(temp, 'msm', 'settings.json'), 'utf8')).toBe(
      `${JSON.stringify(
        {
          installTarget: { instance: 'My Pack', launcher: 'prism', root: prism },
          launchers: { curseForgeRoots: [cf], multimcRoots: [], prismDataDirs: [prism] },
          minecraftDir: null,
          updates: { autoCheck: true },
        },
        null,
        2,
      )}\n`,
    );
  });

  it('keeps other fields on partial updates and clears the target with null', async () => {
    const chosen = join(temp, 'games', 'mc');
    const prism = join(temp, 'prism');
    const official = { launcher: 'official' as const, root: chosen };
    await store().set({ minecraftDir: chosen, updates: { autoCheck: false } });
    await store().set({ installTarget: official });
    await store().set({
      launchers: { prismDataDirs: [prism], multimcRoots: [], curseForgeRoots: [] },
    });
    const view = await store().get();
    expect(view.minecraftDir).toBe(chosen);
    expect(view.updates.autoCheck).toBe(false);
    expect(view.installTarget).toEqual(official);
    expect(view.launchers?.prismDataDirs).toEqual([prism]);
    await store().set({ minecraftDir: null });
    expect(await store().installTarget()).toEqual(official);
    await store().set({ installTarget: null });
    expect(await store().installTarget()).toBeNull();
    expect((await store().launcherSettings()).prismDataDirs).toEqual([prism]);
    // Back to defaults: the file looks exactly as it did before launcher support.
    await store().set({
      launchers: { prismDataDirs: [], multimcRoots: [], curseForgeRoots: [] },
    });
    expect(await readFile(join(temp, 'msm', 'settings.json'), 'utf8')).toBe(
      '{\n  "minecraftDir": null,\n  "updates": {\n    "autoCheck": false\n  }\n}\n',
    );
  });

  it('normalises, deduplicates and caps launcher folders', async () => {
    const prism = join(temp, 'prism');
    const many = Array.from({ length: 20 }, (_, i) => join(temp, 'mmc', String(i)));
    await store().set({
      launchers: {
        prismDataDirs: [prism, `${prism}/`, join(temp, 'x', '..', 'prism')],
        multimcRoots: many,
        curseForgeRoots: [],
      },
    });
    const launchers = await store().launcherSettings();
    expect(launchers.prismDataDirs).toEqual([prism]);
    expect(launchers.multimcRoots).toEqual(many.slice(0, 16));
  });

  it('rejects relative launcher folders and invalid install targets', async () => {
    const lists = { prismDataDirs: [], multimcRoots: [], curseForgeRoots: [] };
    await expect(
      store().set({ launchers: { ...lists, curseForgeRoots: ['curseforge/minecraft'] } }),
    ).rejects.toThrow(/absolute/);
    await expect(
      store().set({ installTarget: { launcher: 'prism', root: 'relative', instance: 'a' } }),
    ).rejects.toThrow(/install target/);
    await expect(
      store().set({ installTarget: { launcher: 'prism', root: join(temp, 'p'), instance: '..' } }),
    ).rejects.toThrow(/install target/);
    await expect(
      store().set({
        installTarget: { launcher: 'official', root: join(temp, 'm'), instance: 'a' },
      }),
    ).rejects.toThrow(/install target/);
    expect(await store().installTarget()).toBeNull();
  });

  it('falls back to defaults for malformed launcher fields', async () => {
    await mkdir(join(temp, 'msm'), { recursive: true });
    const file = join(temp, 'msm', 'settings.json');
    const prism = join(temp, 'prism');
    await writeFile(file, JSON.stringify({ launchers: 'everywhere', installTarget: 'prism' }));
    expect(await store().launcherSettings()).toEqual(noLaunchers);
    expect(await store().installTarget()).toBeNull();
    await writeFile(
      file,
      JSON.stringify({
        launchers: { prismDataDirs: [prism, 'relative', 7, null], multimcRoots: 'x' },
        installTarget: { launcher: 'prism', root: prism, instance: '../escape' },
      }),
    );
    expect(await store().launcherSettings()).toEqual({ ...noLaunchers, prismDataDirs: [prism] });
    expect(await store().installTarget()).toBeNull();
    await writeFile(
      file,
      JSON.stringify({ installTarget: { launcher: 'prism', root: prism, instance: 'A', x: 1 } }),
    );
    expect(await store().installTarget()).toBeNull();
    await writeFile(file, JSON.stringify({ installTarget: { launcher: 'official', root: 'rel' } }));
    expect(await store().installTarget()).toBeNull();
  });
});

describe('settings store: recent projects', () => {
  const storeOn = (platform: 'linux' | 'win32') =>
    createSettingsStore({
      msmHome: join(temp, 'msm'),
      installEnv: { platform, home: join(temp, 'home') },
    });
  const entry = (root: string, openedAt = '2026-01-01T00:00:00.000Z') => ({
    root,
    name: root.slice(root.lastIndexOf('/') + 1),
    openedAt,
  });

  it('is empty by default and leaves the field out of the file when empty', async () => {
    const store = storeOn('linux');
    expect(await store.recentProjects()).toEqual([]);
    await store.set({ updates: { autoCheck: true } });
    const text = await readFile(join(temp, 'msm', 'settings.json'), 'utf8');
    expect(text).not.toContain('recentProjects');
    // `get()` keeps its shape: the list is not part of the settings view.
    expect(Object.keys(await store.get())).not.toContain('recentProjects');
  });

  it('records newest first, de-duplicates by normalised root and caps at ten', async () => {
    const store = storeOn('linux');
    await store.recordRecentProject(entry('/p/a', '1'));
    await store.recordRecentProject(entry('/p/b', '2'));
    // The same root with a trailing separator and a `.` segment moves to the top.
    const list = await store.recordRecentProject({ ...entry('/p/a', '3'), root: '/p/./a/' });
    expect(list).toEqual([{ root: '/p/a', name: 'a', openedAt: '3' }, entry('/p/b', '2')]);
    for (let index = 0; index < 12; index += 1) {
      await store.recordRecentProject(entry(`/q/${index}`, `t${index}`));
    }
    const capped = await store.recentProjects();
    expect(capped).toHaveLength(10);
    expect(capped[0]?.root).toBe('/q/11');
    expect(capped.map((item) => item.root)).not.toContain('/p/a');
  });

  it('persists sorted keys and keeps the list across other settings changes', async () => {
    const store = storeOn('linux');
    await store.recordRecentProject(entry('/p/a', 'x'));
    await store.set({ minecraftDir: join(temp, 'mc') });
    expect(await store.recentProjects()).toEqual([entry('/p/a', 'x')]);
    const text = await readFile(join(temp, 'msm', 'settings.json'), 'utf8');
    expect(text).toContain(
      '"recentProjects": [\n    {\n      "name": "a",\n      "openedAt": "x",\n      "root": "/p/a"\n    }\n  ],',
    );
    expect(text.indexOf('"minecraftDir"')).toBeLessThan(text.indexOf('"recentProjects"'));
  });

  it('matches roots case-insensitively on Windows only', async () => {
    const win = storeOn('win32');
    await win.recordRecentProject(entry('/Proj/Ruby', '1'));
    await win.recordRecentProject({ ...entry('/proj/ruby', '2') });
    expect((await win.recentProjects()).map((item) => item.openedAt)).toEqual(['2']);
    expect(await win.findRecentProject('/PROJ/RUBY')).toEqual(entry('/proj/ruby', '2'));
    await rm(join(temp, 'msm'), { recursive: true, force: true });
    const linux = storeOn('linux');
    await linux.recordRecentProject(entry('/Proj/Ruby', '1'));
    await linux.recordRecentProject(entry('/proj/ruby', '2'));
    expect(await linux.recentProjects()).toHaveLength(2);
    expect(await linux.findRecentProject('/PROJ/RUBY')).toBeNull();
  });

  it('removes one entry, clears the list and drops malformed stored entries', async () => {
    const store = storeOn('linux');
    await store.recordRecentProject(entry('/p/a'));
    await store.recordRecentProject(entry('/p/b'));
    expect((await store.removeRecentProject('/p/a/')).map((item) => item.root)).toEqual(['/p/b']);
    expect(await store.removeRecentProject('relative')).toHaveLength(1);
    await store.clearRecentProjects();
    expect(await store.recentProjects()).toEqual([]);
    await writeFile(
      join(temp, 'msm', 'settings.json'),
      JSON.stringify({
        recentProjects: [
          entry('/p/ok'),
          { root: 'relative', name: 'r', openedAt: 'x' },
          { root: '/p/no-name', openedAt: 'x' },
          'nonsense',
          entry('/p/ok'),
        ],
      }),
    );
    expect(await store.recentProjects()).toEqual([entry('/p/ok')]);
  });
});
