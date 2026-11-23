import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanInstanceSettings,
  cleanLocalServerSettings,
  createSettingsStore,
  type SettingsStore,
} from '../../src/main/platform/settings';
import { InvokeChannels, ipcContract } from '../../src/shared/ipc-contract';

/** The offer card's ask setting and the local server's settings (ADR 0133 D3, D7; B763). */

let temp: string;
let settings: SettingsStore;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-instance-settings-'));
  settings = createSettingsStore({
    msmHome: temp,
    installEnv: { platform: 'linux', home: join(temp, 'home') },
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('instance and server settings', () => {
  it('start at asking the first time, white list off and online mode on', async () => {
    expect(await settings.instanceSettings()).toEqual({ ask: 'first-time', madeByItself: [] });
    expect(await settings.localServerSettings()).toEqual({ whiteList: false, onlineMode: true });
    const view = await settings.get();
    expect(view.instances).toEqual({ ask: 'first-time', madeByItself: [] });
    expect(view.localServers).toEqual({ whiteList: false, onlineMode: true });
    expect(ipcContract[InvokeChannels.settingsGet].response.safeParse(view).success).toBe(true);
  });

  it('remember a kind once, and keep defaults out of the file', async () => {
    await settings.set({ updates: { autoCheck: false } });
    const plain = await readFile(join(temp, 'settings.json'), 'utf8');
    expect(plain).not.toMatch(/instances|localServers/);
    await settings.rememberInstanceKind('plain');
    await settings.rememberInstanceKind('test');
    await settings.rememberInstanceKind('plain');
    expect((await settings.instanceSettings()).madeByItself).toEqual(['test', 'plain']);
    await settings.set({ localServers: { whiteList: true, onlineMode: true } });
    const stored = JSON.parse(await readFile(join(temp, 'settings.json'), 'utf8'));
    expect(stored.instances).toEqual({ ask: 'first-time', madeByItself: ['test', 'plain'] });
    expect(stored.localServers).toEqual({ onlineMode: true, whiteList: true });
    // Setting them back to the defaults leaves them out again.
    await settings.set({
      instances: { ask: 'first-time', madeByItself: [] },
      localServers: { whiteList: false, onlineMode: true },
    });
    expect(await readFile(join(temp, 'settings.json'), 'utf8')).toBe(plain);
  });

  it('clean what is stored or sent', async () => {
    expect(
      cleanInstanceSettings({ ask: 'sometimes', madeByItself: ['server', 'x', 'test', 'test'] }),
    ).toEqual({
      ask: 'first-time',
      madeByItself: ['test', 'server'],
    });
    expect(cleanInstanceSettings(null)).toEqual({ ask: 'first-time', madeByItself: [] });
    expect(cleanLocalServerSettings({ whiteList: 'yes', onlineMode: false })).toEqual({
      whiteList: false,
      onlineMode: false,
    });
    await writeFile(
      join(temp, 'settings.json'),
      JSON.stringify({ instances: { ask: 'never', madeByItself: 'all' }, localServers: 3 }),
    );
    expect(await settings.instanceSettings()).toEqual({ ask: 'never', madeByItself: [] });
    expect(await settings.localServerSettings()).toEqual({ whiteList: false, onlineMode: true });
  });

  it('take patches over IPC', () => {
    const set = ipcContract[InvokeChannels.settingsSet].request;
    expect(
      set.safeParse({
        instances: { ask: 'always', madeByItself: ['pack'] },
        localServers: { whiteList: true, onlineMode: false },
      }).success,
    ).toBe(true);
    expect(set.safeParse({ instances: { ask: 'sometimes', madeByItself: [] } }).success).toBe(
      false,
    );
    expect(set.safeParse({ localServers: { whiteList: true } }).success).toBe(false);
  });
});
