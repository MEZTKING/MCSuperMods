// @vitest-environment happy-dom
/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createMemoryFileSystem } from '@msm/core';
import { builtInTargets, targetById } from '@msm/targets';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/src/App';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';
import type { McfunctionChecker } from '../../src/renderer/src/session/mcfunction-problems';
import { ProjectSession } from '../../src/renderer/src/session/project-session';
import { useUiStore } from '../../src/renderer/src/store/ui-store';
import { NO_DATA_PACK_CONTENT } from '../../src/renderer/src/studios/export-state';
import type { MenuCommand, UpdateStatus } from '../../src/shared/ipc-channels';
import type { MsmBridge, PlatformAdapter, WorldInfo } from '../../src/shared/platform';

/** Reports line 1 of any source containing `bogus` as a parse error. */
const stubChecker: McfunctionChecker = {
  check: async (source) => {
    const lines = source.split('\n');
    const line = lines.findIndex((text) => text.includes('bogus'));
    if (line === -1) return [];
    const start = (lines[line] ?? '').indexOf('bogus');
    return [
      {
        severity: 'error',
        code: 'mcfunction.parse',
        message: 'Expected a command.',
        line,
        start,
        end: start + 5,
        offset: { start: 0, end: 0 },
      },
    ];
  },
};

/** Vendored URLs read over Vitest's HTTP server under happy-dom (see `forms/schemas.ts`). */
function toPath(url: URL): string {
  if (url.protocol === 'file:') return fileURLToPath(url.href);
  const prefix = '/@fs/';
  if (url.pathname.startsWith(prefix)) {
    return decodeURIComponent(url.pathname.slice(prefix.length - 1));
  }
  throw new Error(`Cannot read ${url.href} from the file system.`);
}

const defaultTarget = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const unavailable = async (): Promise<never> => {
  throw new Error('Not available in this test.');
};

interface Harness {
  menu(command: MenuCommand): Promise<void>;
  /** What `updates.check()` resolves to. */
  updateCheck: UpdateStatus;
  /** Sends an update status to the renderer's subscribers. */
  pushUpdate(status: UpdateStatus): void;
  session: ProjectSession;
  saved: { defaultName: string }[];
  worlds: WorldInfo[] | Error;
  installs: string[];
  picks: number;
  written: string[];
}

async function renderApp(): Promise<Harness> {
  let listener: ((command: MenuCommand) => void) | null = null;
  const updateListeners = new Set<(status: UpdateStatus) => void>();
  const harness = {
    updateCheck: { state: 'not-available' },
    pushUpdate: (status: UpdateStatus) => {
      act(() => {
        for (const listener of updateListeners) listener(status);
      });
    },
    saved: [],
    worlds: [{ dir: 'Survival', name: 'Survival', lastModified: '2026-01-01T00:00:00.000Z' }],
    installs: [],
    picks: 0,
    written: [],
    menu: async (command) => {
      await act(async () => listener?.(command));
    },
  } as Omit<Harness, 'session'> as Harness;
  const platform: PlatformAdapter = {
    app: { info: async () => ({ version: '0.1.0-test', electron: '0', platform: 'test' }) },
    dialogs: {
      pickDirectory: async () => '/projects/demo',
      confirmDiscard: async () => true,
      pickFiles: unavailable,
      saveFile: async ({ defaultName }) => {
        harness.saved.push({ defaultName });
        return `/exports/${defaultName}`;
      },
    },
    shell: { showItemInFolder: unavailable },
    targets: {
      readVendored: async (targetId, key) => {
        const bundle = targetById(targetId);
        if (bundle === undefined) throw new Error(`Unknown target ${targetId}`);
        const buffer = await readFile(toPath(bundle.vendored[key]));
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      },
    },
    settings: {
      get: async () => ({
        minecraftDir: null,
        updates: { autoCheck: true },
        detectedMinecraftDir: null,
      }),
      set: unavailable,
    },
    minecraft: {
      status: async () => ({
        minecraftDir: '/home/me/.minecraft',
        installed: [],
        chosen: null,
        cache: null,
      }),
      listLocations: unavailable,
      extract: unavailable,
      readAsset: unavailable,
      listAssets: unavailable,
      installResourcePack: unavailable,
      listWorlds: async () => {
        if (harness.worlds instanceof Error) throw harness.worlds;
        return harness.worlds;
      },
      installDataPack: async (worldDir, fileName) => {
        harness.installs.push(`${worldDir}/${fileName}`);
        return { path: `/saves/${worldDir}/datapacks/${fileName}` };
      },
    },
    mcfunction: { check: unavailable, complete: unavailable },
    exports: {
      pickFolder: async () => {
        harness.picks += 1;
        return '/exports/both';
      },
      writeFiles: async (folder, files) => {
        harness.written.push(...files.map((file) => file.name));
        return { paths: files.map((file) => `${folder}/${file.name}`) };
      },
    },
    thumbnails: { get: unavailable },
    updates: {
      check: async () => harness.updateCheck,
      install: async () => {
        harness.installs.push('update');
      },
      onStatus: (listener) => {
        updateListeners.add(listener);
        return () => updateListeners.delete(listener);
      },
    },
    project: {
      openRoot: async () => ({ ok: true }),
      createRoot: async () => ({ ok: true }),
      closeRoot: async () => {},
      currentRoot: async () => '/projects/demo',
    },
    fs: createMemoryFileSystem(),
  };
  const session = new ProjectSession(platform, {
    plugins: builtInPlugins,
    targets: builtInTargets,
    now: () => '2026-01-01T00:00:00.000Z',
    mcfunction: stubChecker,
  });
  harness.session = session;
  const bridge: MsmBridge = {
    ...platform,
    onMenu: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    onMinecraftProgress: () => () => {},
    setDirty: () => {},
    smokeReady: () => {},
  };
  await session.newProject();
  await session.schemas();
  render(<App session={session} bridge={bridge} />);
  await waitFor(() =>
    expect(useUiStore.getState().minecraft.status?.minecraftDir).toBe('/home/me/.minecraft'),
  );
  return harness;
}

const toast = (text: RegExp | string) => screen.findByText(text);

beforeEach(() => {
  window.msmNoMonaco = true;
  useUiStore.setState({
    snapshot: null,
    selectedId: null,
    selectedPointer: null,
    activeTab: 'form',
    rightDock: 'problems',
    message: null,
    exportProblems: [],
    minecraft: { status: null, progress: null },
  });
});

afterEach(cleanup);

function addFunction(harness: Harness, lines: string[]) {
  act(() => {
    harness.session.addElement({ id: 'demo:greet', kind: 'minecraft:function', data: { lines } });
  });
}

describe('App menu commands', () => {
  it('opens the palette, settings and import dialogs', async () => {
    const harness = await renderApp();
    await harness.menu('commandPalette');
    const palette = await screen.findByTestId('command-palette');
    expect(within(palette).getByTestId('command-exportResourcePack')).toBeTruthy();
    expect(within(palette).queryByTestId('command-exportDataPack')).toBeNull();
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('command-palette')).toBeNull());
    await harness.menu('importAssets');
    expect(await screen.findByTestId('import-assets-dialog')).toBeTruthy();
  });

  it('checks for updates from the menu and the palette, and shows the update banner', async () => {
    const harness = await renderApp();
    await harness.menu('checkForUpdates');
    await toast('MCSuperMods is up to date.');
    harness.updateCheck = { state: 'error', message: 'offline' };
    await harness.menu('commandPalette');
    const palette = await screen.findByTestId('command-palette');
    await userEvent.setup().click(within(palette).getByTestId('command-checkForUpdates'));
    await toast('Could not check for updates: offline');
    expect(screen.queryByTestId('update-banner')).toBeNull();
    harness.pushUpdate({ state: 'downloaded', version: '9.9.9' });
    expect(await screen.findByText('Version 9.9.9 is ready to install.')).toBeTruthy();
    await userEvent.setup().click(screen.getByTestId('update-install'));
    expect(harness.installs).toEqual(['update']);
  });

  it('exports the resource pack and refuses an empty data pack with the reason', async () => {
    const harness = await renderApp();
    await harness.menu('exportResourcePack');
    await toast(/^Exported to \/exports\//);
    expect(harness.saved.map((entry) => entry.defaultName)).toEqual([
      `demo-${defaultTarget.id}.zip`,
    ]);
    await harness.menu('exportDataPack');
    await toast(NO_DATA_PACK_CONTENT);
    expect(harness.saved).toHaveLength(1);
  });

  it('exports the data pack and both packs once there is data pack content', async () => {
    const harness = await renderApp();
    addFunction(harness, ['say hi']);
    await act(() => harness.session.flushValidation());
    await harness.menu('exportDataPack');
    await toast(/^Exported to /);
    expect(harness.saved.map((entry) => entry.defaultName)).toEqual([
      `demo-${defaultTarget.id}-data.zip`,
    ]);
    await harness.menu('exportCombined');
    await toast(/Exported the resource pack and the data pack to \/exports\/both/);
    expect(harness.picks).toBe(1);
    expect(harness.written).toEqual([
      `demo-${defaultTarget.id}-resources.zip`,
      `demo-${defaultTarget.id}-data.zip`,
    ]);
  });

  it('installs the data pack into the world picked in the world picker', async () => {
    const harness = await renderApp();
    addFunction(harness, ['say hi']);
    await act(() => harness.session.flushValidation());
    await harness.menu('installDataPack');
    const picker = await screen.findByTestId('world-picker');
    expect(within(picker).getByTestId('world-row-Survival')).toBeTruthy();
    await userEvent.setup().click(within(picker).getByTestId('world-picker-submit'));
    await toast(/^Installed to \/saves\/Survival\/datapacks\//);
    expect(harness.installs).toEqual([`Survival/demo-${defaultTarget.id}-data.zip`]);
  });

  it('offers Settings when no Minecraft folder is set for world install', async () => {
    const harness = await renderApp();
    harness.worlds = new Error('No Minecraft folder is configured.');
    addFunction(harness, ['say hi']);
    await act(() => harness.session.flushValidation());
    await harness.menu('installDataPack');
    const confirm = await screen.findByRole('button', { name: 'Open Settings' });
    expect(screen.getByText(/No Minecraft folder is configured/)).toBeTruthy();
    await userEvent.setup().click(confirm);
    expect(await screen.findByRole('dialog', { name: /Settings/ })).toBeTruthy();
  });

  it('renames the selected element and reports the rewritten references', async () => {
    const harness = await renderApp();
    await harness.menu('renameElement');
    await toast('Select an element to rename.');
    addFunction(harness, ['say hi']);
    act(() => {
      harness.session.addElement({
        id: 'demo:main',
        kind: 'minecraft:function',
        data: { lines: ['function demo:greet'] },
      });
      useUiStore.getState().select('demo:greet');
    });
    await harness.menu('renameElement');
    const dialog = await screen.findByTestId('rename-dialog');
    expect(within(dialog).getByText(/1 reference to demo:greet will be rewritten/)).toBeTruthy();
    const user = userEvent.setup();
    const input = within(dialog).getByTestId('rename-input');
    await user.clear(input);
    await user.type(input, 'demo:hello');
    await user.click(within(dialog).getByTestId('rename-dialog-submit'));
    await toast('Renamed demo:greet to demo:hello; 1 reference rewritten.');
    expect(useUiStore.getState().selectedId).toBe('demo:hello');
    const main = harness.session.snapshot.project?.namespaces[0]?.elements.find(
      (element) => element.id === 'demo:main',
    );
    expect(main?.data).toEqual({ lines: ['function demo:hello'] });
    act(() => {
      harness.session.undo();
    });
    expect(
      harness.session.snapshot.project?.namespaces[0]?.elements.some((e) => e.id === 'demo:greet'),
    ).toBe(true);
  });
});

describe('App function problems', () => {
  it('navigates from a function problem to its line in the editor', async () => {
    const harness = await renderApp();
    addFunction(harness, ['say hi', 'bogus here']);
    await act(() => harness.session.flushValidation());
    const panel = screen.getByTestId('problems-panel');
    const row = await within(panel).findByRole('button', { name: /Expected a command/ });
    expect(row.textContent).toContain('line 2:1');
    await userEvent.setup().click(row);
    const editor = (await screen.findByTestId('function-editor-fallback')) as HTMLTextAreaElement;
    await waitFor(() => expect(document.activeElement).toBe(editor));
    expect(editor.selectionStart).toBe('say hi\n'.length);
    // The menu's export reports the blocking error instead of exporting.
    await harness.menu('exportDataPack');
    await toast('Fix 1 error first (see Problems).');
  });
});
