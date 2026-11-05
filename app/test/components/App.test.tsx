// @vitest-environment happy-dom
/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createMemoryFileSystem } from '@msm/core';
import { definePlugin, type ElementKind, type Plugin } from '@msm/plugin-api';
import { structureTemplateToNbt, writeNbt } from '@msm/plugin-structures';
import { builtInTargets, targetById } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App, focusedLocation } from '../../src/renderer/src/App';
import {
  FABRIC_JAR_GECKOLIB_NOTE,
  GECKOLIB_DOWNLOAD_MESSAGE,
} from '../../src/renderer/src/components/ExportFabricJarDialog';
import { registerCaretReader } from '../../src/renderer/src/components/function-editor/caret';
import { BLOCKBENCH_IMPORT_NOTE } from '../../src/renderer/src/components/ImportFilesDialog';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';
import type { McfunctionChecker } from '../../src/renderer/src/session/mcfunction-problems';
import { ProjectSession } from '../../src/renderer/src/session/project-session';
import { useUiStore } from '../../src/renderer/src/store/ui-store';
import {
  MSM_CONTENT_NOTE,
  NO_DATA_PACK_CONTENT,
} from '../../src/renderer/src/studios/export-state';
import type { MenuCommand, UpdateStatus } from '../../src/shared/ipc-channels';
import type {
  AppSettingsPatch,
  GameLocationView,
  LauncherSettings,
  MsmBridge,
  PlatformAdapter,
  RecentProjectView,
  TestInMinecraftStatus,
  WorldInfo,
} from '../../src/shared/platform';
import { fakeLibraryPlugin } from './library-fixtures';

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

/** A neutral Minecraft version that never matches a built-in target. */
const OTHER_VERSION = '9.9-msm-test';

const officialLocation: GameLocationView = {
  ref: { launcher: 'official', root: '/home/me/.minecraft' },
  id: 'official:default',
  displayName: 'Official launcher',
  mcVersion: null,
  loader: null,
  gameDir: '/home/me/.minecraft',
  modsDir: null,
  problems: [],
  warnings: [],
};

const mismatchWarning = {
  code: 'location.version-mismatch',
  message: `This instance runs Minecraft ${OTHER_VERSION}; the project targets ${defaultTarget.mcVersion}.`,
};

const prismLocation: GameLocationView = {
  ref: { launcher: 'prism', root: '/home/me/prism', instance: 'My-Instance' },
  id: 'prism:My-Instance',
  displayName: 'My Instance',
  mcVersion: OTHER_VERSION,
  loader: { kind: 'fabric', version: '0.16.0' },
  gameDir: '/home/me/prism/instances/My-Instance/minecraft',
  modsDir: '/home/me/prism/instances/My-Instance/minecraft/mods',
  problems: [],
  warnings: [mismatchWarning],
};

const unstartedLocation: GameLocationView = {
  ref: { launcher: 'prism', root: '/home/me/prism', instance: 'Fresh' },
  id: 'prism:Fresh',
  displayName: 'Fresh',
  mcVersion: defaultTarget.mcVersion,
  loader: null,
  gameDir: '/home/me/prism/instances/Fresh/minecraft',
  modsDir: null,
  problems: [
    {
      code: 'location.game-dir-missing',
      message: 'Start the instance once so its game folder exists.',
    },
  ],
  warnings: [],
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
  /** What `exports.runtimeJar()` resolves to (default `null`: no runtime jar). */
  runtimeJar: Uint8Array | null;
  /** What `exports.geckolibJar()` resolves to (default `null`: not cached, offline). */
  geckolibJar: Uint8Array | null;
  /** Every location `listLocations` reports. */
  locations: GameLocationView[];
  /** The id of the install target; `null` makes status report no target at all. */
  selectedId: string | null;
  /** Every `settings.set` patch, in order. */
  settingsSets: AppSettingsPatch[];
  /** How often `minecraft.status` was read. */
  statusReads: number;
  /** The stored launcher folders. */
  launchers: LauncherSettings;
  /** What the folder picker returns. */
  pickedDirectory: string | null;
  /** Resource pack installs, by file name. */
  resourceInstalls: string[];
  /** Whether status reports that the stored target was not found. */
  targetMissing: boolean;
  /** What `project.recent` returns. */
  recent: RecentProjectView[];
  /** The root of every `project.openRecent` call. */
  openedRecent: string[];
  /** Sends "Open Recent" from the application menu. */
  menuOpenRecent(root: string): Promise<void>;
  /** What the "pick files" dialog returns. */
  pickedFiles: { name: string; path: string; data: Uint8Array }[];
  /** The options of every `dialogs.pickFiles` call. */
  pickRequests: { title: string; filters?: { name: string; extensions: string[] }[] }[];
  /** The folder of every export folder write. */
  writtenFolders: string[];
  /** What `testInMinecraft.status` returns. */
  testStatus: TestInMinecraftStatus;
  /** Every `testInMinecraft.run` call. */
  testRuns: { targetId: string; modId: string; size: number }[];
  /** How often `testInMinecraft.createInstance` ran. */
  testInstances: number;
}

const blockedTestStatus: TestInMinecraftStatus = {
  mcVersion: '26.3',
  loader: '0.20.1',
  api: '0.165.2+26.3',
  location: null,
  mode: 'blocked',
  reason: 'No game location was found.',
  launcherProgram: null,
  managedInstanceName: 'MCSuperMods Test (26.3)',
  managedInstanceSelected: false,
  canCreateInstance: true,
};

async function renderApp(options: { plugins?: readonly Plugin[] } = {}): Promise<Harness> {
  let listener: ((command: MenuCommand) => void) | null = null;
  let recentListener: ((root: string) => void) | null = null;
  const updateListeners = new Set<(status: UpdateStatus) => void>();
  const harness = {
    updateCheck: { state: 'not-available' },
    pushUpdate: (status: UpdateStatus) => {
      act(() => {
        for (const listener of updateListeners) listener(status);
      });
    },
    saved: [],
    runtimeJar: null,
    geckolibJar: null,
    worlds: [{ dir: 'Survival', name: 'Survival', lastModified: '2026-01-01T00:00:00.000Z' }],
    installs: [],
    picks: 0,
    written: [],
    locations: [officialLocation, prismLocation, unstartedLocation],
    selectedId: 'official:default',
    settingsSets: [],
    statusReads: 0,
    launchers: { prismDataDirs: [], multimcRoots: [], curseForgeRoots: [] },
    pickedDirectory: '/home/me/prism',
    resourceInstalls: [],
    targetMissing: false,
    recent: [],
    openedRecent: [],
    pickedFiles: [],
    pickRequests: [],
    writtenFolders: [],
    testStatus: blockedTestStatus,
    testRuns: [],
    testInstances: 0,
    menu: async (command) => {
      await act(async () => listener?.(command));
    },
    menuOpenRecent: async (root) => {
      await act(async () => recentListener?.(root));
    },
  } as Omit<Harness, 'session'> as Harness;
  const platform: PlatformAdapter = {
    app: { info: async () => ({ version: '0.1.0-test', electron: '0', platform: 'test' }) },
    dialogs: {
      pickDirectory: async ({ title }) =>
        title.includes('folder') && !title.includes('project')
          ? harness.pickedDirectory
          : '/projects/demo',
      confirmDiscard: async () => true,
      pickFiles: async (options) => {
        harness.pickRequests.push(options);
        return harness.pickedFiles;
      },
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
        launchers: harness.launchers,
        installTarget: null,
      }),
      set: async (patch) => {
        harness.settingsSets.push(patch);
        if (patch.installTarget !== undefined) {
          const ref = patch.installTarget;
          harness.selectedId =
            ref === null
              ? 'official:default'
              : (harness.locations.find(
                  (location) =>
                    location.ref.launcher === ref.launcher &&
                    location.ref.root === ref.root &&
                    location.ref.instance === ref.instance,
                )?.id ?? null);
        }
        if (patch.launchers !== undefined) harness.launchers = patch.launchers;
      },
    },
    minecraft: {
      status: async () => {
        harness.statusReads += 1;
        const target = harness.locations.find((location) => location.id === harness.selectedId);
        // `test/helpers/minecraft-status.ts` is outside the web tsconfig; spell it out here.
        return {
          minecraftDir: '/home/me/.minecraft',
          installed: [],
          chosen: null,
          cache: null,
          target: target ?? null,
          targetMissing: harness.targetMissing,
          jar: { versionId: defaultTarget.mcVersion, launcher: 'official' },
          warnings: target?.warnings ?? [],
        };
      },
      listLocations: async () => ({
        locations: harness.locations,
        selected: harness.locations.some((location) => location.id === harness.selectedId)
          ? harness.selectedId
          : null,
      }),
      extract: unavailable,
      readAsset: unavailable,
      listAssets: unavailable,
      installResourcePack: async (fileName) => {
        harness.resourceInstalls.push(fileName);
        return { path: `/resourcepacks/${fileName}` };
      },
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
        harness.writtenFolders.push(folder);
        harness.written.push(...files.map((file) => file.name));
        return { paths: files.map((file) => `${folder}/${file.name}`) };
      },
      runtimeJar: async () => harness.runtimeJar,
      geckolibJar: async () => harness.geckolibJar,
    },
    testInMinecraft: {
      status: async () => harness.testStatus,
      createInstance: async () => {
        harness.testInstances += 1;
        harness.testStatus = {
          ...harness.testStatus,
          location: { ...prismLocation, displayName: 'MCSuperMods Test (26.3)' },
          mode: 'launch',
          reason: null,
          launcherProgram: '/usr/bin/prismlauncher',
          managedInstanceSelected: true,
        };
        return harness.testStatus;
      },
      run: async (targetId, modId, data) => {
        harness.testRuns.push({ targetId, modId, size: data.byteLength });
        return {
          jarPath: `/prism/instances/Test/minecraft/mods/${modId}.jar`,
          replaced: false,
          fabricApi: 'installed',
          fabricApiFile: 'fabric-api-0.165.2+26.3.jar',
          launched: true,
          note: null,
        };
      },
      pickLauncherProgram: unavailable,
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
      recent: async () => harness.recent,
      openRecent: async (root) => {
        harness.openedRecent.push(root);
        return harness.recent.some((entry) => entry.root === root)
          ? { ok: true }
          : { ok: false, reason: `${root} is not in the recent projects list.` };
      },
      removeRecent: async (root) => {
        harness.recent = harness.recent.filter((entry) => entry.root !== root);
      },
      clearRecent: async () => {
        harness.recent = [];
      },
    },
    fs: createMemoryFileSystem(),
  };
  const session = new ProjectSession(platform, {
    plugins: options.plugins ?? builtInPlugins,
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
    onMenuOpenRecent: (next) => {
      recentListener = next;
      return () => {
        recentListener = null;
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
    minecraft: { status: null, progress: null, locations: null, launchers: null },
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

  it('opens a recent project from the palette quick pick and the Open Recent menu', async () => {
    const harness = await renderApp();
    harness.recent = [
      { root: '/projects/demo', name: 'demo', openedAt: '2026-01-02T00:00:00.000Z', exists: true },
      { root: '/projects/gone', name: 'gone', openedAt: '2026-01-01T00:00:00.000Z', exists: false },
    ];
    const user = userEvent.setup();
    await harness.menu('commandPalette');
    const palette = await screen.findByTestId('command-palette');
    expect(within(palette).getByTestId('command-openRecent').textContent).toContain(
      'Open recent project…',
    );
    await user.click(within(palette).getByTestId('command-openRecent'));
    const picker = await screen.findByTestId('recent-picker');
    await waitFor(() =>
      expect(within(picker).getByTestId('command-recent-1').textContent).toContain(
        'gone (missing) — /projects/gone',
      ),
    );
    await user.click(within(picker).getByTestId('command-recent-0'));
    await toast('Open project: /projects/demo');
    expect(harness.openedRecent).toEqual(['/projects/demo']);

    await harness.menuOpenRecent('/projects/elsewhere');
    await toast('Open project failed: /projects/elsewhere is not in the recent projects list.');
    expect(harness.openedRecent).toEqual(['/projects/demo', '/projects/elsewhere']);

    await harness.menu('clearRecentProjects');
    await toast('Cleared the recent projects list.');
    expect(harness.recent).toEqual([]);
  });

  it('checks for updates from the menu and the palette, and shows the update banner', async () => {
    const harness = await renderApp();
    await harness.menu('checkForUpdates');
    await toast('You have the latest version (v0.1.0-test).');
    harness.updateCheck = {
      state: 'error',
      message:
        'Could not reach GitHub to check for updates. Check your internet connection and try again.',
    };
    await harness.menu('commandPalette');
    const palette = await screen.findByTestId('command-palette');
    await userEvent.setup().click(within(palette).getByTestId('command-checkForUpdates'));
    const text = await toast(
      'Could not reach GitHub to check for updates. Check your internet connection and try again.',
    );
    // The toast wraps and is width-limited, so long text never overflows the window.
    expect(text.className).toMatch(/break-words/);
    expect(text.closest('li')?.className ?? '').toMatch(/max-w-\[min\(420px,90vw\)\]/);
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
    expect(
      within(picker).getByText('Install data pack to a world — Official launcher'),
    ).toBeTruthy();
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

  it('counts rename references with the session registry of a plugin kind', async () => {
    // A kind whose registry (`function`) differs from its id: only the session's registry
    // knows it, so the default (built-in) lookup would count no references.
    const scriptKind: ElementKind = {
      id: 'test:script',
      schema: 'msm:function',
      folder: 'test_script',
      registry: 'function',
      lower: () => [],
    };
    const plugin = definePlugin({
      id: 'test.scripts',
      apiVersion: '^0.7.0',
      contributes: { elementKinds: [scriptKind] },
    });
    const harness = await renderApp({ plugins: [...builtInPlugins, plugin] });
    act(() => {
      harness.session.addElement({ id: 'demo:helper', kind: 'test:script', data: {} });
      harness.session.addElement({
        id: 'demo:all',
        kind: 'minecraft:tag/function',
        data: { values: ['demo:helper'] },
      });
      useUiStore.getState().select('demo:helper');
    });
    await act(() => harness.session.flushValidation());
    await harness.menu('renameElement');
    const dialog = await screen.findByTestId('rename-dialog');
    expect(within(dialog).getByText(/1 reference to demo:helper will be rewritten/)).toBeTruthy();
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

describe('App structure import and exports', () => {
  it('imports a structure through the dialog, then exports it as .nbt and .schem', async () => {
    const harness = await renderApp();
    const user = userEvent.setup();
    harness.pickedFiles = [
      {
        name: 'Hut.nbt',
        path: '/picked/Hut.nbt',
        data: writeNbt(
          structureTemplateToNbt(
            { size: [1, 1, 1], palette: ['minecraft:stone'], blocks: [[0, 0, 0, 0]] },
            defaultTarget.dataVersion,
          ),
        ),
      },
    ];
    await harness.menu('importStructure');
    const dialog = await screen.findByTestId('import-files-dialog');
    expect(within(dialog).getByTestId('import-files-importers').textContent).toContain(
      'Sponge schematic (.schem)',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Choose files…' }));
    await toast('Imported 1 element(s) into demo.');
    expect(screen.queryByTestId('import-files-dialog')).toBeNull();
    expect(useUiStore.getState().selectedId).toBe('demo:hut');
    expect(harness.session.snapshot.undoLabel).toBe('Import 1 file');

    await act(() => harness.session.flushValidation());
    await harness.menu('exportStructures');
    await toast('Exported 1 structure file(s) to /exports/both.');
    await harness.menu('exportSchematics');
    await toast('Exported 1 schematic(s) to /exports/both.');
    expect(harness.written).toEqual(['demo/hut.nbt', 'demo/hut.schem']);
    expect(harness.writtenFolders).toEqual(['/exports/both', '/exports/both']);
  });

  it('says when there are no structures to export and offers the commands in the palette', async () => {
    const harness = await renderApp();
    await harness.menu('exportStructures');
    await toast('The project has no structure templates to export.');
    expect(harness.picks).toBe(0);
    await harness.menu('commandPalette');
    const palette = await screen.findByTestId('command-palette');
    for (const id of ['importStructure', 'exportStructures', 'exportSchematics']) {
      expect(within(palette).getByTestId(`command-${id}`)).toBeTruthy();
    }
  });
});

describe('App library (starters and examples)', () => {
  const elementIds = (harness: Harness) =>
    harness.session.snapshot.project?.namespaces.flatMap((namespace) =>
      namespace.elements.map((element) => element.id),
    ) ?? [];

  it('creates a project from a starter chosen in the New project dialog', async () => {
    const harness = await renderApp({ plugins: [...builtInPlugins, fakeLibraryPlugin] });
    await harness.menu('newProjectFromStarter');
    const dialog = await screen.findByTestId('new-project-dialog');
    expect(within(dialog).queryByTestId('starter-needs_missing')).toBeNull();
    const user = userEvent.setup();
    await user.click(within(dialog).getByTestId('starter-test_starter'));
    await user.click(within(dialog).getByTestId('new-project-dialog-submit'));
    await toast(/New project from "Test starter"/);
    expect(elementIds(harness)).toEqual(
      expect.arrayContaining(['demo:item/ruby', 'demo:greet', 'demo:pack', 'minecraft:load']),
    );
  });

  it('offers a blank project when no plugin contributes a blank starter', async () => {
    const harness = await renderApp({
      plugins: builtInPlugins.filter((plugin) => plugin.id !== 'msm.library'),
    });
    await harness.menu('commandPalette');
    const palette = await screen.findByTestId('command-palette');
    const user = userEvent.setup();
    await user.click(within(palette).getByTestId('command-newProjectFromStarter'));
    const dialog = await screen.findByTestId('new-project-dialog');
    expect(within(dialog).getByTestId('starter-blank')).toBeTruthy();
    await user.click(within(dialog).getByTestId('new-project-dialog-submit'));
    await toast(/^New project: /);
    expect(elementIds(harness)).toEqual(['demo:pack']);
  });

  it('copies an example, reports what it skipped and shows its notes', async () => {
    const harness = await renderApp({ plugins: [...builtInPlugins, fakeLibraryPlugin] });
    await harness.menu('examples');
    const dialog = await screen.findByTestId('examples-dialog');
    expect(within(dialog).queryByTestId('example-needs_missing')).toBeNull();
    const user = userEvent.setup();
    await user.click(within(dialog).getByTestId('example-test_example'));
    expect(within(dialog).getByTestId('example-notes').textContent).toBe(
      'Every face shows the same texture.',
    );
    await user.click(within(dialog).getByTestId('examples-copy'));
    const result = await within(dialog).findByTestId('examples-copy-result');
    expect(result.textContent).toContain('Added 1 element and 1 asset to demo.');
    expect(elementIds(harness)).toContain('demo:block/ruby_ore');
    expect(harness.session.snapshot.undoLabel).toBe('Copy example Ore block model');

    await user.click(within(dialog).getByTestId('examples-copy'));
    await waitFor(() =>
      expect(within(dialog).getByTestId('examples-copy-duplicates').textContent).toContain(
        'demo:block/ruby_ore',
      ),
    );
    expect(within(dialog).getByTestId('examples-copy-skipped-assets').textContent).toContain(
      'demo:textures/block/ruby_ore.png',
    );
    await user.click(within(dialog).getByTestId('examples-close'));
    await waitFor(() => expect(screen.queryByTestId('examples-dialog')).toBeNull());
    expect(useUiStore.getState().selectedId).toBe('demo:block/ruby_ore');
    expect((await screen.findByTestId('element-notes-text')).textContent).toBe(
      'Every face shows the same texture.',
    );
  });

  it('opens an example as a new project', async () => {
    const harness = await renderApp({ plugins: [...builtInPlugins, fakeLibraryPlugin] });
    await harness.menu('examples');
    const dialog = await screen.findByTestId('examples-dialog');
    const user = userEvent.setup();
    await user.click(within(dialog).getByTestId('example-test_example'));
    await user.click(within(dialog).getByTestId('examples-open-new'));
    await toast(/New project from example "Ore block model"/);
    expect(elementIds(harness)).toEqual(['demo:block/ruby_ore', 'demo:pack']);
  });
});

describe('App function problems', () => {
  it('puts the caret at the problem column within the line', async () => {
    const harness = await renderApp();
    addFunction(harness, ['say hi', 'say bogus']);
    await act(() => harness.session.flushValidation());
    const panel = screen.getByTestId('problems-panel');
    const row = await within(panel).findByRole('button', { name: /Expected a command/ });
    expect(row.textContent).toContain('line 2:5');
    await userEvent.setup().click(row);
    const editor = (await screen.findByTestId('function-editor-fallback')) as HTMLTextAreaElement;
    await waitFor(() => expect(document.activeElement).toBe(editor));
    expect(editor.selectionStart).toBe('say hi\nsay '.length);
  });

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

describe('App Fabric mod jar export', () => {
  /** A valid `msm:block` (the "Simple block" template's data). */
  function addBlock(harness: Harness) {
    act(() => {
      harness.session.addElement({
        id: 'demo:ruby_block',
        kind: 'msm:block',
        data: {
          format: 1,
          model: 'minecraft:block/stone',
          display_name: 'Ruby Block',
          sound_type: 'stone',
          loot: 'self',
          item: { creative_tab: 'minecraft:building_blocks' },
          components: { 'msm:breakable': { hardness: 1.5, resistance: 6, tool: 'pickaxe' } },
        },
      });
    });
  }

  it('opens the dialog from the menu and passes the chosen option to the export', async () => {
    const harness = await renderApp();
    await harness.menu('exportFabricJar');
    const dialog = await screen.findByTestId('fabric-jar-dialog');
    const user = userEvent.setup();
    await user.click(within(dialog).getByLabelText('Separate runtime and GeckoLib (for modpacks)'));
    await user.click(within(dialog).getByTestId('fabric-jar-dialog-submit'));
    await toast(/^Exported the Fabric mod jar to \/exports\/.+\.jar\./);
    expect(harness.saved).toHaveLength(1);
    expect(harness.saved[0]?.defaultName).toMatch(/^[a-z][a-z0-9_-]+\.jar$/);
    expect(screen.queryByTestId('fabric-jar-dialog')).toBeNull();
  });

  it('blocks the export when the runtime jar is missing and the runtime is nested', async () => {
    const harness = await renderApp();
    await harness.menu('exportFabricJar');
    await userEvent.setup().click(await screen.findByTestId('fabric-jar-dialog-submit'));
    await toast('Export blocked by 1 error(s); nothing was written. See Problems.');
    expect(harness.saved).toHaveLength(0);
  });

  it('nests the runtime jar the platform supplies', async () => {
    const harness = await renderApp();
    harness.runtimeJar = new Uint8Array([1, 2, 3]);
    await harness.menu('exportFabricJar');
    await userEvent.setup().click(await screen.findByTestId('fabric-jar-dialog-submit'));
    await toast(/^Exported the Fabric mod jar to /);
    expect(harness.saved).toHaveLength(1);
  });

  it('is gated by errors in any layer and offered in the palette and the Export menu', async () => {
    const harness = await renderApp();
    await harness.menu('commandPalette');
    const palette = await screen.findByTestId('command-palette');
    expect(within(palette).getByTestId('command-exportFabricJar')).toBeTruthy();
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('command-palette')).toBeNull());
    addFunction(harness, ['bogus here']);
    await act(() => harness.session.flushValidation());
    await harness.menu('exportFabricJar');
    await toast('Fix 1 error first (see Problems).');
    expect(screen.queryByTestId('fabric-jar-dialog')).toBeNull();
  });

  it('notes on a vanilla pack export that blocks and items need the Fabric jar', async () => {
    const harness = await renderApp();
    await harness.menu('exportResourcePack');
    const plain = await toast(/^Exported to /);
    expect(plain.textContent).not.toContain(MSM_CONTENT_NOTE);
    addBlock(harness);
    await act(() => harness.session.flushValidation());
    await harness.menu('exportResourcePack');
    await screen.findByText((content) => content.includes(MSM_CONTENT_NOTE));
  });
});

describe('App Test in Minecraft', () => {
  it('creates the test instance, then installs and launches from the dialog', async () => {
    const harness = await renderApp();
    harness.runtimeJar = new Uint8Array([1, 2, 3]);
    await harness.menu('testInMinecraft');
    const dialog = await screen.findByTestId('test-in-minecraft-dialog');
    expect(await within(dialog).findByTestId('test-in-minecraft-reason')).toBeTruthy();
    const submit = within(dialog).getByTestId('test-in-minecraft-dialog-submit');
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: 'Create test instance' }));
    await within(dialog).findByTestId('test-in-minecraft-plan');
    expect(harness.testInstances).toBe(1);
    expect(submit.textContent).toBe('Install and launch');
    await user.click(submit);
    await toast(
      /^Installed the mod to \/prism\/instances\/Test\/minecraft\/mods\/.+\.jar\. Fabric API was added/,
    );
    expect(harness.testRuns).toHaveLength(1);
    expect(harness.testRuns[0]?.targetId).toBe('mc-26.3');
    expect(harness.testRuns[0]?.modId).toMatch(/^[a-z][a-z0-9_-]+$/);
    expect(screen.queryByTestId('test-in-minecraft-dialog')).toBeNull();
  });

  it('blocks the run when the export has errors (runtime jar missing)', async () => {
    const harness = await renderApp();
    harness.testStatus = {
      ...blockedTestStatus,
      mode: 'install-only',
      reason: 'Start it.',
      location: officialLocation,
    };
    await harness.menu('testInMinecraft');
    const dialog = await screen.findByTestId('test-in-minecraft-dialog');
    await within(dialog).findByTestId('test-in-minecraft-plan');
    const submit = within(dialog).getByTestId('test-in-minecraft-dialog-submit');
    expect(submit.textContent).toBe('Install');
    await userEvent.setup().click(submit);
    await toast('Test in Minecraft blocked by 1 error(s); nothing was installed. See Problems.');
    expect(harness.testRuns).toHaveLength(0);
  });

  it('is offered in the palette and gated by errors', async () => {
    const harness = await renderApp();
    await harness.menu('commandPalette');
    const palette = await screen.findByTestId('command-palette');
    expect(within(palette).getByTestId('command-testInMinecraft').textContent).toContain(
      'Test in Minecraft…',
    );
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('command-palette')).toBeNull());
    addFunction(harness, ['bogus here']);
    await act(() => harness.session.flushValidation());
    await harness.menu('testInMinecraft');
    await toast('Fix 1 error first (see Problems).');
    expect(screen.queryByTestId('test-in-minecraft-dialog')).toBeNull();
  });
});

describe('App per-pack export gating', () => {
  it('exports the resource pack while a function has an error, but not the data pack', async () => {
    const harness = await renderApp();
    addFunction(harness, ['bogus here']);
    await act(() => harness.session.flushValidation());
    await harness.menu('exportResourcePack');
    await toast(/^Exported to \/exports\/demo-/);
    expect(harness.saved.map((entry) => entry.defaultName)).toEqual([
      `demo-${defaultTarget.id}.zip`,
    ]);
    await harness.menu('exportDataPack');
    await toast('Fix 1 error first (see Problems).');
    await harness.menu('exportCombined');
    expect(harness.picks).toBe(0);
    expect(harness.saved).toHaveLength(1);
  });

  it('exports the data pack while a model has an error, but not the resource pack', async () => {
    const harness = await renderApp();
    addFunction(harness, ['say hi']);
    act(() => {
      harness.session.addElement({
        id: 'demo:broken',
        kind: 'minecraft:model',
        data: { parent: 5 },
      });
    });
    await act(() => harness.session.flushValidation());
    expect(
      harness.session.snapshot.problems.some(
        (problem) => problem.severity === 'error' && problem.elementId === 'demo:broken',
      ),
    ).toBe(true);
    await harness.menu('exportDataPack');
    await toast(/^Exported to \/exports\/demo-/);
    expect(harness.saved.map((entry) => entry.defaultName)).toEqual([
      `demo-${defaultTarget.id}-data.zip`,
    ]);
    // A data-only export leaves the resource pack files out without a Problems row.
    expect(
      useUiStore
        .getState()
        .exportProblems.some((problem) => problem.code === 'export.layer-skipped'),
    ).toBe(false);
    await harness.menu('exportResourcePack');
    await toast(/^Fix \d+ errors? first/);
    expect(harness.saved).toHaveLength(1);
  });
});

describe('App go to definition', () => {
  it('opens the element under the function editor caret on F12', async () => {
    const harness = await renderApp();
    addFunction(harness, ['say hi']);
    act(() => {
      harness.session.addElement({
        id: 'demo:main',
        kind: 'minecraft:function',
        data: { lines: ['say first', 'function demo:greet'] },
      });
      useUiStore.getState().select('demo:main');
    });
    await act(() => harness.session.flushValidation());
    const editor = (await screen.findByTestId('function-editor-fallback')) as HTMLTextAreaElement;
    editor.focus();
    const caret = 'say first\nfunction demo:gr'.length;
    editor.setSelectionRange(caret, caret);
    fireEvent.keyDown(editor, { key: 'F12' });
    await waitFor(() => expect(useUiStore.getState().selectedId).toBe('demo:greet'));
  });

  it('reads the Monaco caret through the editor instance', () => {
    const host = document.createElement('div');
    host.dataset.testid = 'monaco-host';
    const input = document.createElement('div');
    host.append(input);
    document.body.append(host);
    const unregister = registerCaretReader(host, () => ({ line: 1, column: 12 }));
    expect(focusedLocation(input)).toEqual({ pointer: '/lines/1', column: 12 });
    unregister();
    expect(focusedLocation(input)).toBeNull();
    host.remove();
  });
});

describe('App install targets', () => {
  const openInstallMenu = async () => {
    await userEvent.setup().click(screen.getByTestId('toolbar-install-menu'));
    return screen.findByTestId('install-target');
  };

  it('switches the install target through the Toolbar submenu and reads the status again', async () => {
    const harness = await renderApp();
    await waitFor(() => expect(useUiStore.getState().minecraft.locations).not.toBeNull());
    expect((await openInstallMenu()).textContent).toBe('Install to: Official launcher');
    await userEvent.setup().click(screen.getByTestId('install-target-change'));
    const item = await screen.findByTestId('install-target-prism:My-Instance');
    const reads = harness.statusReads;
    // happy-dom has no layout; click the item without a pointer move (see Toolbar.test).
    fireEvent.click(item);
    await waitFor(() =>
      expect(useUiStore.getState().minecraft.status?.target?.id).toBe('prism:My-Instance'),
    );
    expect(harness.settingsSets).toEqual([{ installTarget: prismLocation.ref }]);
    expect(harness.statusReads).toBeGreaterThan(reads);
    expect(useUiStore.getState().minecraft.locations?.selected).toBe('prism:My-Instance');
    await toast(`Packs now install to Prism Launcher — My Instance (MC ${OTHER_VERSION}).`);
    const sentence = await openInstallMenu();
    expect(sentence.textContent).toContain(
      `Install to: Prism Launcher — My Instance (MC ${OTHER_VERSION})`,
    );
    // A version mismatch is only a warning: installs stay enabled.
    expect(sentence.textContent).toContain(mismatchWarning.message);
    expect(screen.getByTestId('install-resource').getAttribute('aria-disabled')).toBeNull();
  });

  it('repeats the version-mismatch warning after an install', async () => {
    const harness = await renderApp();
    harness.selectedId = 'prism:My-Instance';
    await act(async () => {
      useUiStore.getState().setMinecraftStatus(await harness.session.minecraftStatus());
    });
    await harness.menu('installResourcePack');
    const message = await toast(/^Installed to \/resourcepacks\//);
    expect(message.textContent).toContain(mismatchWarning.message);
    expect(harness.resourceInstalls).toHaveLength(1);
  });

  it('disables installs with a reason when there is no target or it cannot take packs', async () => {
    const harness = await renderApp();
    harness.selectedId = null;
    await act(async () => {
      useUiStore.getState().setMinecraftStatus(await harness.session.minecraftStatus());
    });
    await harness.menu('installResourcePack');
    await toast('No Minecraft folder or launcher instance was found. Choose one in Settings.');
    expect(harness.resourceInstalls).toEqual([]);
    expect((await openInstallMenu()).textContent).toBe('No install target: choose one in Settings');
    expect(screen.getByTestId('install-resource-reason').textContent).toMatch(/launcher instance/);
    await userEvent.setup().keyboard('{Escape}');

    harness.selectedId = 'prism:Fresh';
    await act(async () => {
      useUiStore.getState().setMinecraftStatus(await harness.session.minecraftStatus());
    });
    await harness.menu('installResourcePack');
    await toast('Start the instance once so its game folder exists.');
    expect(harness.resourceInstalls).toEqual([]);
  });

  it('lists locations and added launcher folders in Settings and adds one', async () => {
    const harness = await renderApp();
    await harness.menu('commandPalette');
    const palette = await screen.findByTestId('command-palette');
    await userEvent.setup().click(within(palette).getByTestId('command-chooseInstallTarget'));
    const dialog = await screen.findByTestId('settings-dialog');
    const list = await within(dialog).findByTestId('settings-locations');
    expect(
      (within(list).getByTestId('location-select-official:default') as HTMLInputElement).checked,
    ).toBe(true);
    expect(within(list).getByTestId('location-row-prism:Fresh').textContent).toContain(
      'Start the instance once',
    );
    expect(within(dialog).getByTestId('settings-status').textContent).toContain(
      `Official launcher — ${defaultTarget.mcVersion}`,
    );
    await userEvent.setup().click(within(dialog).getByTestId('settings-add-prism'));
    await waitFor(() =>
      expect(harness.settingsSets).toContainEqual({
        launchers: { prismDataDirs: ['/home/me/prism'], multimcRoots: [], curseForgeRoots: [] },
      }),
    );
    const root = await within(dialog).findByTestId('settings-root-0');
    expect(root.textContent).toContain('/home/me/prism');
    // Two Prism locations live under that folder, so no "No instances found" note.
    expect(root.textContent).not.toContain('No instances found');
    await userEvent.setup().click(within(dialog).getByTestId('location-select-prism:My-Instance'));
    await waitFor(() =>
      expect(harness.settingsSets).toContainEqual({ installTarget: prismLocation.ref }),
    );
    await userEvent.setup().click(within(dialog).getByTestId('settings-remove-root-0'));
    await waitFor(() => expect(harness.launchers.prismDataDirs).toEqual([]));
    await waitFor(() => expect(within(dialog).queryByTestId('settings-root-0')).toBeNull());
  });

  it('shows the missing-target line in Settings', async () => {
    const harness = await renderApp();
    harness.targetMissing = true;
    // Opening Settings reads the status (and the locations) again.
    await harness.menu('settings');
    expect((await screen.findByTestId('settings-target-missing')).textContent).toContain(
      'The chosen instance was not found',
    );
  });
});

const encodeJson = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

/** A minimal Bedrock geometry file as Blockbench exports it. */
const GLOOM_GEO = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: { identifier: 'geometry.gloom', texture_width: 64, texture_height: 64 },
      bones: [{ name: 'body', pivot: [0, 0, 0] }],
    },
  ],
};

describe('App Blockbench import', () => {
  it('imports from File > Import Blockbench Model… and reports refused files', async () => {
    const harness = await renderApp();
    harness.pickedFiles = [
      { name: 'Gloom.geo.json', path: '/picked/Gloom.geo.json', data: encodeJson(GLOOM_GEO) },
      { name: 'notes.json', path: '/picked/notes.json', data: encodeJson({}) },
    ];
    await harness.menu('importBlockbench');
    const dialog = await screen.findByTestId('import-files-dialog');
    expect(within(dialog).getByRole('heading', { name: 'Import Blockbench model' })).toBeTruthy();
    const listed = within(dialog).getByTestId('import-files-importers').textContent ?? '';
    expect(listed).toContain('Blockbench model (.bbmodel, .geo.json, .animation.json)');
    expect(listed).not.toContain('.schem');
    expect(within(dialog).getByTestId('import-files-note').textContent).toBe(
      BLOCKBENCH_IMPORT_NOTE,
    );
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: 'Choose files…' }));
    await toast('Imported 1 element(s).');
    expect(harness.pickRequests.at(-1)).toEqual({
      title: 'Import Blockbench models',
      filters: [
        {
          name: 'Blockbench model (.bbmodel, .geo.json, .animation.json)',
          extensions: ['bbmodel', 'json'],
        },
      ],
    });
    expect(await within(dialog).findByText(/notes\.json is not a Blockbench model/)).toBeTruthy();
    expect(useUiStore.getState().selectedId).toBe('demo:entity/gloom');
    expect(harness.session.snapshot.undoLabel).toBe('Import 1 file');
  });

  it('keeps Blockbench out of the structure import and offers both in the palette', async () => {
    const harness = await renderApp();
    await harness.menu('importStructure');
    const dialog = await screen.findByTestId('import-files-dialog');
    expect(within(dialog).getByTestId('import-files-importers').textContent).not.toContain(
      'Blockbench',
    );
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await harness.menu('commandPalette');
    const palette = await screen.findByTestId('command-palette');
    expect(within(palette).getByTestId('command-importBlockbench').textContent).toContain(
      'Import Blockbench model…',
    );
    expect(within(palette).getByTestId('command-importStructure')).toBeTruthy();
  });
});

describe('App Fabric mod jar with entities', () => {
  function addEntity(harness: Harness) {
    act(() => {
      harness.session.addElement({
        id: 'demo:entity/gloom',
        kind: 'msm:geo_model',
        data: GLOOM_GEO,
      });
      harness.session.addElement({
        id: 'demo:gloom',
        kind: 'msm:entity',
        data: {
          format: 1,
          category: 'monster',
          size: { width: 0.6, height: 1.8 },
          spawn_egg: false,
          components: {
            'msm:animated_model': { model: 'demo:entity/gloom', texture: 'demo:entity/gloom' },
          },
        },
      });
    });
  }

  it('notes the GeckoLib download in the dialog and explains a failed download', async () => {
    const harness = await renderApp();
    harness.runtimeJar = new Uint8Array([1, 2, 3]);
    addEntity(harness);
    await act(() => harness.session.flushValidation());
    await harness.menu('exportFabricJar');
    const dialog = await screen.findByTestId('fabric-jar-dialog');
    expect(within(dialog).getByTestId('fabric-jar-geckolib-note').textContent).toBe(
      FABRIC_JAR_GECKOLIB_NOTE,
    );
    await userEvent.setup().click(within(dialog).getByTestId('fabric-jar-dialog-submit'));
    await toast(GECKOLIB_DOWNLOAD_MESSAGE);
    expect(harness.saved).toHaveLength(0);

    harness.geckolibJar = new Uint8Array([4, 5, 6]);
    await harness.menu('exportFabricJar');
    await userEvent.setup().click(await screen.findByTestId('fabric-jar-dialog-submit'));
    await toast(/^Exported the Fabric mod jar to /);
    expect(harness.saved).toHaveLength(1);
  });
});
