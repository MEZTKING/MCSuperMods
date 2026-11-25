/**
 * When the window's page stops (B870): main starts it again and the page is told which
 * plugins were running; a second stop soon after turns third-party plugins off for the rest of
 * the run; a third with plugins off asks instead of looping. The real window is driven by e2e
 * `plugins-path`.
 */

import { describe, expect, it } from 'vitest';
import {
  CRASH_REPEAT_WINDOW_MS,
  createCrashRecovery,
  withCrashRecovery,
} from '../src/main/crash-recovery';
import type { PluginsService } from '../src/main/platform/plugins';
import type { ExternalPluginEntry, PluginManifest } from '../src/shared/platform';
import { PLUGIN_OFF_FOR_THIS_RUN, recoveryNoticeText } from '../src/shared/recovery-notice';

const manifest = (id: string, name: string): PluginManifest => ({
  manifestVersion: 1,
  id,
  name,
  version: '1.0.0',
  apiVersion: '^1.0.0',
  main: 'main.js',
  schemas: [],
  capabilities: ['validators'],
});

function fakePlugins(): PluginsService {
  const entries: ExternalPluginEntry[] = [
    { id: 'a.one', folder: 'one', manifest: manifest('a.one', 'One'), problems: [] },
    { id: 'b.two', folder: 'two', manifest: manifest('b.two', 'Two'), problems: [] },
    {
      id: 'broken',
      folder: 'broken',
      manifest: null,
      problems: [{ severity: 'error', code: 'plugin.manifest-invalid', message: 'No.' }],
    },
  ];
  return {
    dir: '/plugins',
    list: async () => entries,
    read: async (id) => {
      const entry = entries.find((one) => one.manifest?.id === id);
      if (entry?.manifest === null || entry === undefined) throw new Error('none');
      return { manifest: entry.manifest, main: '', schemas: [] };
    },
    openFolder: async () => {},
  };
}

describe('crash recovery', () => {
  it('reloads, names the plugins that were started, and says so once', () => {
    let clock = 1_000;
    const recovery = createCrashRecovery(() => clock);
    expect(recovery.takeNotice()).toBeNull();
    recovery.noteStarted('Two');
    recovery.noteStarted('One');
    expect(recovery.onGone('clean-exit')).toBe('ignore');
    expect(recovery.takeNotice()).toBeNull();
    expect(recovery.onGone('oom')).toBe('reload');
    expect(recovery.pluginsOff()).toBe(false);
    expect(recovery.takeNotice()).toEqual({ plugins: ['One', 'Two'], pluginsOff: false });
    expect(recovery.takeNotice()).toBeNull();
    // Long after: a first stop again, not a repeat.
    clock += CRASH_REPEAT_WINDOW_MS + 1;
    expect(recovery.onGone('crashed')).toBe('reload');
    expect(recovery.pluginsOff()).toBe(false);
    expect(recovery.takeNotice()).toEqual({ plugins: [], pluginsOff: false });
  });

  it('turns plugins off after a second stop soon after, then asks instead of looping', () => {
    let clock = 0;
    const recovery = createCrashRecovery(() => clock);
    recovery.noteStarted('One');
    expect(recovery.onGone('crashed')).toBe('reload');
    clock += 30_000;
    recovery.noteStarted('One');
    expect(recovery.onGone('crashed')).toBe('reload');
    expect(recovery.pluginsOff()).toBe(true);
    expect(recovery.takeNotice()).toEqual({ plugins: ['One'], pluginsOff: true });
    clock += 30_000;
    expect(recovery.onGone('killed')).toBe('ask');
    expect(recovery.pluginsOff()).toBe(true);
  });

  it('turns every usable plugin off in the list and refuses to hand out its files', async () => {
    let clock = 0;
    const recovery = createCrashRecovery(() => clock);
    const plugins = withCrashRecovery(fakePlugins(), recovery);
    expect((await plugins.list()).map((entry) => entry.manifest?.id ?? null)).toEqual([
      'a.one',
      'b.two',
      null,
    ]);
    await plugins.read('b.two');
    expect(recovery.onGone('crashed')).toBe('reload');
    expect(plugins.recoveryNotice()).toEqual({ plugins: ['Two'], pluginsOff: false });
    expect(plugins.recoveryNotice()).toBeNull();
    clock += 1_000;
    await plugins.read('a.one');
    expect(recovery.onGone('crashed')).toBe('reload');
    const listed = await plugins.list();
    expect(listed.map((entry) => entry.manifest)).toEqual([null, null, null]);
    expect(listed[0]?.problems).toEqual([
      expect.objectContaining({ code: PLUGIN_OFF_FOR_THIS_RUN, severity: 'error' }),
    ]);
    // A plugin that was already unusable keeps its own reason.
    expect(listed[2]?.problems[0]?.code).toBe('plugin.manifest-invalid');
    await expect(plugins.read('a.one')).rejects.toThrow(PLUGIN_OFF_FOR_THIS_RUN);
  });

  it('says in plain words what happened, that unsaved changes are lost, and who was running', () => {
    const one = recoveryNoticeText({ plugins: ['Greetings'], pluginsOff: false });
    expect(one.title).toBe('MCSuperMods started its window again');
    expect(one.lines.join(' ')).toContain('Changes you had not saved could not be kept.');
    expect(one.lines.join(' ')).toContain('Greetings');
    expect(one.lines.join(' ')).not.toContain('are off');
    const off = recoveryNoticeText({ plugins: ['A', 'B'], pluginsOff: true });
    expect(off.lines.join(' ')).toContain('A, B');
    expect(off.lines.join(' ')).toContain('plugins from other people are off');
    const none = recoveryNoticeText({ plugins: [], pluginsOff: false });
    expect(none.lines.join(' ')).not.toContain('plugin');
  });
});
