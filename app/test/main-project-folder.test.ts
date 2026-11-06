import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createNodePlatform,
  launchNoticeFor,
  type NativeDialogs,
} from '../src/main/platform/node-platform';
import { createSettingsStore } from '../src/main/platform/settings';

let temp: string;
let requests: Parameters<NativeDialogs['pickDirectory']>[0][];
let answer: string | null;

const msmHome = () => join(temp, 'msm-home');

const platform = (options: { version?: string; suppressWhatsNew?: boolean } = {}) =>
  createNodePlatform({
    info: async () => ({ version: options.version ?? '0.7.0', electron: '0', platform: 'test' }),
    dialogs: {
      pickDirectory: async (opts) => {
        requests.push(opts);
        return answer;
      },
      confirmDiscard: async () => true,
      openFiles: async () => [],
      saveFilePath: async () => null,
    },
    showItemInFolder: () => {},
    resizePng: (png) => png,
    msmHome: msmHome(),
    installEnv: { platform: 'linux', home: join(temp, 'home') },
    ...(options.suppressWhatsNew === undefined
      ? {}
      : { suppressWhatsNew: options.suppressWhatsNew }),
  });

const settingsFile = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(join(msmHome(), 'settings.json'), 'utf8'));

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-project-folder-'));
  requests = [];
  answer = null;
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('project folder pickers (B145)', () => {
  it('open in the folder the last project folder was chosen in', async () => {
    const parent = join(temp, 'Mods');
    await mkdir(join(parent, 'first'), { recursive: true });
    const p = platform();
    // Nothing remembered yet: the dialog's own default.
    answer = join(parent, 'first');
    expect(
      await p.dialogs.pickDirectory({ title: 'New', mustBeEmpty: true, purpose: 'project' }),
    ).toBe(join(parent, 'first'));
    expect(requests[0]).toEqual({ title: 'New', mustBeEmpty: true });
    expect((await settingsFile()).lastProjectParent).toBe(parent);
    // Open project (another picker) starts there, and so does a fresh run of the app.
    answer = null;
    await platform().dialogs.pickDirectory({ title: 'Open', purpose: 'project' });
    expect(requests[1]).toEqual({ title: 'Open', defaultPath: parent });
    // Cancelling keeps the remembered folder.
    expect((await settingsFile()).lastProjectParent).toBe(parent);
  });

  it('fall back to the default when the remembered folder no longer exists', async () => {
    const gone = join(temp, 'gone');
    await mkdir(join(gone, 'project'), { recursive: true });
    answer = join(gone, 'project');
    await platform().dialogs.pickDirectory({ title: 'Open', purpose: 'project' });
    await rm(gone, { recursive: true });
    await platform().dialogs.pickDirectory({ title: 'Open', purpose: 'project' });
    expect(requests[1]).toEqual({ title: 'Open' });
  });

  it('leave other folder pickers alone', async () => {
    const parent = join(temp, 'Mods');
    await mkdir(join(parent, 'p'), { recursive: true });
    answer = join(parent, 'p');
    await platform().dialogs.pickDirectory({ title: 'Project', purpose: 'project' });
    answer = join(temp, 'elsewhere', 'minecraft');
    await platform().dialogs.pickDirectory({ title: 'Choose your Minecraft folder' });
    expect(requests[1]).toEqual({ title: 'Choose your Minecraft folder' });
    expect((await settingsFile()).lastProjectParent).toBe(parent);
  });

  it('keep the remembered folder out of the renderer settings view', async () => {
    await mkdir(join(temp, 'Mods', 'p'), { recursive: true });
    answer = join(temp, 'Mods', 'p');
    const p = platform();
    await p.dialogs.pickDirectory({ title: 'Project', purpose: 'project' });
    expect(await p.settings.get()).not.toHaveProperty('lastProjectParent');
    // A settings change from the renderer keeps it.
    await p.settings.set({ updates: { autoCheck: false } });
    expect((await settingsFile()).lastProjectParent).toBe(join(temp, 'Mods'));
  });
});

describe('settings store: lastProjectParent and lastSeenVersion', () => {
  const store = () =>
    createSettingsStore({
      msmHome: msmHome(),
      installEnv: { platform: 'linux', home: join(temp, 'home') },
    });

  it('rejects relative project folders and ignores stored junk', async () => {
    await expect(store().setLastProjectParent('relative/path')).rejects.toThrow(/absolute/);
    await mkdir(msmHome(), { recursive: true });
    await writeFile(
      join(msmHome(), 'settings.json'),
      JSON.stringify({ lastProjectParent: 'relative', lastSeenVersion: 7 }),
    );
    expect(await store().lastProjectParent()).toBeNull();
    expect(await store().recordSeenVersion('0.7.0')).toEqual({ previous: null, existed: true });
  });

  it('records the version and reports the previous one and whether settings existed', async () => {
    expect(await store().recordSeenVersion('0.6.0')).toEqual({ previous: null, existed: false });
    expect(await store().recordSeenVersion('0.6.0')).toEqual({ previous: '0.6.0', existed: true });
    expect(await store().recordSeenVersion('0.7.0')).toEqual({ previous: '0.6.0', existed: true });
    expect((await settingsFile()).lastSeenVersion).toBe('0.7.0');
  });
});

describe('The launch notice', () => {
  it('welcomes a brand-new install, then shows What is new once after each version change', async () => {
    expect(await platform({ version: '0.7.0' }).app.launchNotice()).toBe('welcome');
    expect(await platform({ version: '0.7.0' }).app.launchNotice()).toBe(null);
    expect(await platform({ version: '0.8.0' }).app.launchNotice()).toBe('whats-new');
    expect(await platform({ version: '0.8.0' }).app.launchNotice()).toBe(null);
  });

  it('shows after an update from a version that did not record one', async () => {
    await mkdir(msmHome(), { recursive: true });
    await writeFile(join(msmHome(), 'settings.json'), '{"updates":{"autoCheck":true}}\n');
    expect(await platform().app.launchNotice()).toBe('whats-new');
  });

  it('never shows by itself in test runs, but still records the version', async () => {
    expect(await platform({ version: '0.6.0', suppressWhatsNew: true }).app.launchNotice()).toBe(
      null,
    );
    expect(await platform({ version: '0.7.0', suppressWhatsNew: true }).app.launchNotice()).toBe(
      null,
    );
    expect((await settingsFile()).lastSeenVersion).toBe('0.7.0');
  });

  it('decides from the stored facts', () => {
    const base = { previous: '0.6.0', existed: true, current: '0.7.0', suppressed: false };
    expect(launchNoticeFor(base)).toBe('whats-new');
    expect(launchNoticeFor({ ...base, current: '0.6.0' })).toBe(null);
    expect(launchNoticeFor({ ...base, existed: false, previous: null })).toBe('welcome');
    expect(launchNoticeFor({ ...base, previous: null })).toBe('whats-new');
    expect(launchNoticeFor({ ...base, suppressed: true })).toBe(null);
    expect(launchNoticeFor({ ...base, existed: false, suppressed: true })).toBe(null);
  });
});
