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

describe('settings store', () => {
  const store = () =>
    createSettingsStore({
      msmHome: join(temp, 'msm'),
      installEnv: { platform: 'linux', home: join(temp, 'home') },
    });

  it('defaults to nothing when no file and no launcher folder exist', async () => {
    expect(await store().get()).toEqual({ minecraftDir: null, detectedMinecraftDir: null });
    expect(await store().minecraftDir()).toBeNull();
  });

  it('detects the default launcher folder', async () => {
    await mkdir(join(temp, 'home', '.minecraft'), { recursive: true });
    const detected = join(temp, 'home', '.minecraft');
    expect(await store().get()).toEqual({ minecraftDir: null, detectedMinecraftDir: detected });
    expect(await store().minecraftDir()).toBe(detected);
  });

  it('persists the chosen folder as sorted JSON and prefers it', async () => {
    await mkdir(join(temp, 'home', '.minecraft'), { recursive: true });
    const chosen = join(temp, 'games', 'mc');
    await store().set({ minecraftDir: chosen });
    expect(await readFile(join(temp, 'msm', 'settings.json'), 'utf8')).toBe(
      `{\n  "minecraftDir": ${JSON.stringify(chosen)}\n}\n`,
    );
    expect((await store().get()).minecraftDir).toBe(chosen);
    expect(await store().minecraftDir()).toBe(chosen);
    await store().set({ minecraftDir: null });
    expect(await store().minecraftDir()).toBe(join(temp, 'home', '.minecraft'));
  });

  it('rejects relative folders and ignores a corrupt file', async () => {
    await expect(store().set({ minecraftDir: 'relative/mc' })).rejects.toThrow(/absolute/);
    await mkdir(join(temp, 'msm'), { recursive: true });
    await writeFile(join(temp, 'msm', 'settings.json'), '{ not json');
    expect((await store().get()).minecraftDir).toBeNull();
    await writeFile(join(temp, 'msm', 'settings.json'), '{"minecraftDir":"relative"}');
    expect((await store().get()).minecraftDir).toBeNull();
  });
});
