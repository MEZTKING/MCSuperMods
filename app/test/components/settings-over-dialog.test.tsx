// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Settings opens over the open dialog (ADR 0131 D5, B702): **Set up Minecraft folder** inside the
 * painter, New texture, the Minecraft texture picker or the Creator puts Settings above it, and
 * closing Settings leaves the dialog under it as it was (the painting and its undo history, the
 * name and size, the search text, the answers). Escape closes only the top dialog.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createMemoryFileSystem } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/App';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';
import { ProjectSession } from '../../src/renderer/src/session/project-session';
import { useUiStore } from '../../src/renderer/src/store/ui-store';
import type { MenuCommand } from '../../src/shared/ipc-channels';
import type { MinecraftStatus, MsmBridge, PlatformAdapter } from '../../src/shared/platform';
import { PATHS } from './mc-textures/paths';

/** Vendored URLs read over Vitest's HTTP server under happy-dom (see `forms/schemas.ts`). */
function toPath(url: URL): string {
  if (url.protocol === 'file:') return fileURLToPath(url.href);
  const prefix = '/@fs/';
  if (url.pathname.startsWith(prefix)) {
    return decodeURIComponent(url.pathname.slice(prefix.length - 1));
  }
  throw new Error(`Cannot read ${url.href} from the file system.`);
}

/** How long a lazily loaded dialog (the picker, the Creator's views) may take to come. */
const LAZY = { timeout: 8000 };

/** The mod's own namespace. */
const NAMESPACE = 'demo';

const unavailable = async (): Promise<never> => {
  throw new Error('Not available in this test.');
};

interface Harness {
  session: ProjectSession;
  menu(command: MenuCommand): Promise<void>;
  /** Whether the Minecraft folder is set up (the asset cache is there). */
  ready: boolean;
  /** What `minecraft.status` reports now. */
  status(): MinecraftStatus;
}

/** A stand-in picture in the mocked codec's format, every pixel `rgba`. */
function picture(width: number, height: number, rgba = [10, 200, 30, 255]): Uint8Array {
  const out = new Uint8Array(8 + width * height * 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  for (let index = 8; index < out.length; index += 4) out.set(rgba, index);
  return out;
}

async function renderApp(options: { ready?: boolean } = {}): Promise<Harness> {
  let listener: ((command: MenuCommand) => void) | null = null;
  const harness = {
    ready: options.ready === true,
    menu: async (command: MenuCommand) => {
      await act(async () => listener?.(command));
    },
  } as Omit<Harness, 'session'> as Harness;
  const status = (): MinecraftStatus =>
    ({
      minecraftDir: '/home/me/.minecraft',
      installed: [],
      chosen: null,
      cache: harness.ready ? { version: '26.3', fileCount: PATHS.length } : null,
      target: null,
      targetMissing: false,
      jar: null,
      warnings: [],
    }) as unknown as MinecraftStatus;
  const platform: PlatformAdapter = {
    app: {
      info: async () => ({ version: '0.1.0-test', electron: '0', platform: 'test' }),
      launchNotice: async () => null,
    },
    dialogs: {
      pickDirectory: async () => '/projects/demo',
      confirmDiscard: async () => true,
      pickFiles: async () => [],
      saveFile: async () => null,
    },
    shell: { showItemInFolder: async () => {} },
    targets: {
      readVendored: async (targetId, key) => {
        const bundle = builtInTargets.find((entry) => entry.target.id === targetId);
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
        launchers: { prismDataDirs: [], multimcRoots: [], curseForgeRoots: [] },
        installTarget: null,
      }),
      set: async () => {},
    },
    minecraft: {
      status: async () => status(),
      listLocations: async () => ({ locations: [], selected: null }),
      extract: unavailable,
      readAsset: async (_version, path) =>
        path.endsWith('.mcmeta') ? null : PATHS.includes(path) ? picture(4, 4) : null,
      listAssets: async () => [...PATHS],
      readWorldgenFiles: unavailable,
      readDataFiles: unavailable,
      installResourcePack: unavailable,
      listWorlds: async () => [],
      installDataPack: unavailable,
    },
    mcfunction: { check: unavailable, complete: unavailable },
    exports: {
      pickFolder: async () => null,
      writeFiles: unavailable,
      runtimeJar: async () => null,
      geckolibJar: async () => null,
      writeTree: unavailable,
      gradleWrapper: async () => null,
    },
    scripting: { transpile: unavailable, check: unavailable },
    testInMinecraft: {
      status: unavailable,
      createInstance: unavailable,
      run: unavailable,
      runModpack: unavailable,
      pickLauncherProgram: unavailable,
    },
    thumbnails: { get: unavailable },
    updates: {
      check: async () => ({ state: 'not-available' }),
      current: async () => ({ state: 'idle' }),
      install: async () => {},
      onStatus: () => () => {},
    },
    project: {
      openRoot: async () => ({ ok: true }),
      createRoot: async () => ({ ok: true }),
      closeRoot: async () => {},
      currentRoot: async () => '/projects/demo',
      recent: async () => [],
      openRecent: async () => ({ ok: false, reason: 'None.' }),
      removeRecent: async () => {},
      clearRecent: async () => {},
    },
    fs: createMemoryFileSystem(),
  };
  const session = new ProjectSession(platform, {
    plugins: builtInPlugins,
    targets: builtInTargets,
    now: () => '2026-01-01T00:00:00.000Z',
    mcfunction: { check: async () => [] },
  });
  harness.session = session;
  harness.status = status;
  const bridge: MsmBridge = {
    ...platform,
    onMenu: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    onMenuOpenRecent: () => () => {},
    onMinecraftProgress: () => () => {},
    setDirty: () => {},
    onCloseRequest: () => () => {},
    smokeReady: () => {},
  };
  await session.newProject();
  if (!session.snapshot.project?.namespaces.some((entry) => entry.name === NAMESPACE)) {
    session.addNamespace(NAMESPACE);
  }
  await session.schemas();
  render(<App session={session} bridge={bridge} />);
  await waitFor(() =>
    expect(useUiStore.getState().minecraft.status?.minecraftDir).toBe('/home/me/.minecraft'),
  );
  return harness;
}

/** The Minecraft folder is set up now: the status App reads says so. */
async function finishSetUp(harness: Harness): Promise<void> {
  harness.ready = true;
  act(() => useUiStore.getState().setMinecraftStatus(harness.status()));
}

/** Closes Settings with its close button and waits until it is gone. */
async function closeSettings(): Promise<void> {
  const settings = screen.getByTestId('settings-dialog');
  await userEvent.setup().keyboard('{Escape}');
  await waitFor(() => expect(settings.isConnected).toBe(false));
}

/** Paints three pixels of the painter's canvas (16 by 16 at 10 CSS pixels each). */
function paintThree(): void {
  const canvas = screen.getByTestId('texture-canvas');
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 160, height: 160, right: 160, bottom: 160 }) as DOMRect;
  canvas.setPointerCapture = () => {};
  for (const [x, y] of [
    [5, 5],
    [15, 5],
    [25, 5],
  ] as const) {
    fireEvent.pointerDown(canvas, { clientX: x, clientY: y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
  }
}

/** Opens New texture for the mod's namespace from the asset list. */
async function openNewTexture(): Promise<HTMLElement> {
  const button = await screen.findByTestId(`assets-new-texture-${NAMESPACE}`);
  fireEvent.click(button);
  return screen.findByTestId('new-texture-dialog');
}

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Settings over the open dialog (ADR 0131 D5)', () => {
  it('keeps the painter, its three pixels and its undo history under Settings', async () => {
    await renderApp();
    const newTexture = await openNewTexture();
    fireEvent.change(within(newTexture).getByTestId('new-texture-name'), {
      target: { value: 'ruby' },
    });
    fireEvent.click(within(newTexture).getByTestId('new-texture-dialog-submit'));
    const painter = await screen.findByTestId('texture-editor');
    await within(painter).findByTestId('texture-canvas');
    paintThree();
    const undo = within(painter).getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);

    // Start from a Minecraft texture, then the picker's Set up Minecraft folder.
    const start = within(painter).getByTestId('texture-start-minecraft');
    fireEvent.click(start);
    fireEvent.click(await screen.findByTestId('mc-texture-set-up', {}, LAZY));
    const settings = await screen.findByTestId('settings-dialog');
    // Settings is above: mounted after the painter, which is still there.
    expect(painter.isConnected).toBe(true);
    expect(
      painter.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await closeSettings();

    // The painter is as it was: Save enabled, and three undo steps take the pixels back.
    expect(screen.getByTestId('texture-editor')).toBe(painter);
    expect((within(painter).getByTestId('texture-save') as HTMLButtonElement).disabled).toBe(false);
    for (let step = 0; step < 3; step += 1) {
      expect(undo.disabled).toBe(false);
      fireEvent.click(undo);
    }
    await waitFor(() => expect(undo.disabled).toBe(true));
    // Focus came back to the painter, not the page under it.
    await waitFor(() => expect(painter.contains(document.activeElement)).toBe(true));
  });

  it('keeps New texture with its name and size under Settings', async () => {
    await renderApp();
    const newTexture = await openNewTexture();
    fireEvent.change(within(newTexture).getByTestId('new-texture-name'), {
      target: { value: 'ruby_rush' },
    });
    const kind = within(newTexture).getByTestId('new-texture-kind') as HTMLSelectElement;
    const other = [...kind.options].find((option) => !option.selected)?.value ?? '';
    fireEvent.change(kind, { target: { value: other } });
    fireEvent.click(within(newTexture).getByTestId('new-texture-start-minecraft'));
    fireEvent.click(within(newTexture).getByTestId('new-texture-dialog-submit'));
    fireEvent.click(await screen.findByTestId('mc-texture-set-up', {}, LAZY));
    await screen.findByTestId('settings-dialog');
    await closeSettings();
    expect(screen.getByTestId('new-texture-dialog')).toBe(newTexture);
    expect((within(newTexture).getByTestId('new-texture-name') as HTMLInputElement).value).toBe(
      'ruby_rush',
    );
    expect(kind.value).toBe(other);
  });

  it('keeps the Minecraft texture picker and its search text under Settings', async () => {
    const harness = await renderApp({ ready: true });
    await harness.menu('home');
    fireEvent.click(await screen.findByTestId('home-tile-minecraft-texture', {}, LAZY));
    const picker = await screen.findByTestId('mc-texture-picker', {}, LAZY);
    const search = (await within(picker).findByTestId(
      'mc-texture-search',
      {},
      LAZY,
    )) as HTMLInputElement;
    await within(picker).findByTestId('mc-texture-block-stone', {}, LAZY);
    fireEvent.change(search, { target: { value: 'stone' } });
    await harness.menu('settings');
    await screen.findByTestId('settings-dialog');
    expect(screen.getByTestId('mc-texture-picker')).toBe(picker);
    await closeSettings();
    expect(screen.getByTestId('mc-texture-picker')).toBe(picker);
    expect(search.value).toBe('stone');
  });

  it('lists in the painter’s picker once the folder is set up under the painter', async () => {
    const harness = await renderApp();
    const newTexture = await openNewTexture();
    fireEvent.change(within(newTexture).getByTestId('new-texture-name'), {
      target: { value: 'ruby' },
    });
    fireEvent.click(within(newTexture).getByTestId('new-texture-dialog-submit'));
    const painter = await screen.findByTestId('texture-editor');
    fireEvent.click(await within(painter).findByTestId('texture-start-minecraft'));
    fireEvent.click(await screen.findByTestId('mc-texture-set-up', {}, LAZY));
    await screen.findByTestId('settings-dialog');
    await finishSetUp(harness);
    await closeSettings();
    fireEvent.click(within(painter).getByTestId('texture-start-minecraft'));
    // New texture's first kind is an item: the picker opens on the Items folder.
    await screen.findByTestId('mc-texture-item-diamond-sword', {}, LAZY);
  });

  it("keeps the Creator's answers under Settings from a sound's Find my Minecraft", async () => {
    // A stand-in Web Audio, so the Play buttons are there (none plays here).
    vi.stubGlobal('AudioContext', class {});
    const harness = await renderApp();
    await harness.menu('creator');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('creator-flow-goat-horn', {}, LAZY));
    const creator = await screen.findByTestId('creator-dialog', {}, LAZY);
    const name = (await within(creator).findByTestId(
      'param-horn_name',
      {},
      LAZY,
    )) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Storm horn' } });
    await user.click(await within(creator).findByTestId('creator-tab-live', {}, LAZY));
    const setUp = await within(creator).findByTestId('sound-setup', {}, LAZY);
    fireEvent.click(setUp);
    await screen.findByTestId('settings-dialog');
    expect(screen.getByTestId('creator-dialog')).toBe(creator);
    await closeSettings();
    expect(screen.getByTestId('creator-dialog')).toBe(creator);
    expect(name.value).toBe('Storm horn');
  });

  it('closes only the top dialog on Escape', async () => {
    const harness = await renderApp({ ready: true });
    const newTexture = await openNewTexture();
    await harness.menu('settings');
    await screen.findByTestId('settings-dialog');
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('settings-dialog')).toBeNull());
    expect(newTexture.isConnected).toBe(true);
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(newTexture.isConnected).toBe(false));
  });
});
