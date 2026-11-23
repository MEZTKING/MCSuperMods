/**
 * The application menu. Mod commands are forwarded to the focused renderer as
 * `msm:v1:menu` events; clipboard items use Electron roles. The labels are the toolbar's
 * words (ADR 0131 D1): File follows the toolbar's More menu, Help its Help menu.
 *
 * @packageDocumentation
 */

import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron';
import {
  EventChannels,
  isMenuPluginExports,
  type MenuCommand,
  type MenuOpenRecent,
  type MenuPluginExport,
  type MenuPluginExportEntry,
} from '../shared/ipc-channels';
import type { RecentProject } from '../shared/platform';

function targetWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function send(command: MenuCommand): void {
  targetWindow()?.webContents.send(EventChannels.menu, command);
}

function sendOpenRecent(root: string): void {
  const payload: MenuOpenRecent = { root };
  targetWindow()?.webContents.send(EventChannels.menuOpenRecent, payload);
}

function sendPluginExport(id: string): void {
  const payload: MenuPluginExport = { id };
  targetWindow()?.webContents.send(EventChannels.menuPluginExport, payload);
}

/** The menu's current recent projects and plugin exporters; each install keeps the other. */
let currentRecent: readonly RecentProject[] = [];
let currentPluginExports: readonly MenuPluginExportEntry[] = [];

/** The entries File > Export adds for plugin exporters (after a separator). */
export function pluginExportItems(
  entries: readonly MenuPluginExportEntry[],
  choose: (id: string) => void,
): MenuItemConstructorOptions[] {
  if (entries.length === 0) return [];
  return [
    { type: 'separator' },
    ...entries.map((entry) => ({
      label: entry.label.replaceAll('&', '&&'),
      enabled: entry.enabled,
      click: () => choose(entry.id),
    })),
  ];
}

/**
 * Listens for the renderer's plugin exporter list (File > Export) and reinstalls the
 * menu when it changes. Only the main frame of an app window may set it.
 */
export function registerMenuIpc(): void {
  ipcMain.on(EventChannels.setMenuPluginExports, (event, payload: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) return;
    if (BrowserWindow.fromWebContents(event.sender) === null) return;
    if (!isMenuPluginExports(payload)) return;
    if (JSON.stringify(payload) === JSON.stringify(currentPluginExports)) return;
    currentPluginExports = payload;
    if (app.isReady()) installMenu();
  });
}

/** The longest path shown in a "Recent mods" label before the middle is elided. */
export const RECENT_LABEL_PATH_MAX = 60;

/**
 * Shortens a path for a menu label: the first segment, an ellipsis and as many trailing
 * segments as fit in `max` characters (always at least the last one).
 */
export function shortenPath(path: string, max = RECENT_LABEL_PATH_MAX): string {
  if (path.length <= max) return path;
  const separator = path.includes('\\') && !path.includes('/') ? '\\' : '/';
  const parts = path.split(separator);
  const head = parts[0] === '' ? `${separator}${parts[1] ?? ''}` : (parts[0] ?? '');
  const rest = parts.slice(parts[0] === '' ? 2 : 1);
  const tail: string[] = [];
  for (let index = rest.length - 1; index >= 0; index -= 1) {
    const candidate = [rest[index] ?? '', ...tail];
    const text = `${head}${separator}…${separator}${candidate.join(separator)}`;
    if (tail.length > 0 && text.length > max) break;
    tail.unshift(rest[index] ?? '');
  }
  return `${head}${separator}…${separator}${tail.join(separator)}`;
}

/** The label of one "Recent mods" entry; `&` is doubled so it is not read as a mnemonic. */
export function recentLabel(entry: Pick<RecentProject, 'name' | 'root'>): string {
  return `${entry.name} — ${shortenPath(entry.root)}`.replaceAll('&', '&&');
}

/** The "Recent mods" submenu: one item per mod, or a disabled note, then "Clear list". */
export function recentSubmenu(
  recent: readonly RecentProject[],
  open: (root: string) => void,
  clear: () => void,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] =
    recent.length === 0
      ? [{ label: 'No recent mods', enabled: false }]
      : recent.slice(0, 10).map((entry) => ({
          label: recentLabel(entry),
          click: () => open(entry.root),
        }));
  return [
    ...items,
    { type: 'separator' },
    { label: 'Clear list', enabled: recent.length > 0, click: clear },
  ];
}

/**
 * Builds and installs the application menu. Call again with the new list whenever the
 * recent projects change.
 */
export function installMenu(recent: readonly RecentProject[] = currentRecent): void {
  currentRecent = recent;
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        // Ctrl/Cmd+N is left to the renderer, where it opens "Add from the full list…".
        { label: 'New mod…', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('new') },
        {
          label: 'Start from a ready-made mod…',
          click: () => send('newProjectFromStarter'),
        },
        { label: 'Examples…', click: () => send('examples') },
        { label: 'New mod with the AI helper…', click: () => send('newWithAi') },
        // ADR 0086: a random themed mod, new or added to the open one.
        { label: 'Surprise me…', click: () => send('surpriseMe') },
        { type: 'separator' },
        { label: 'Open a mod…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        {
          label: 'Recent mods',
          submenu: recentSubmenu(recent, sendOpenRecent, () => send('clearRecentProjects')),
        },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { type: 'separator' },
        // ADR 0043: opens the Creator.
        { label: 'Make something…', click: () => send('creator') },
        { label: 'Bring in pictures or sounds…', click: () => send('importAssets') },
        { label: 'Bring in a building…', click: () => send('importStructure') },
        { label: 'Bring in a Blockbench model…', click: () => send('importBlockbench') },
        // ADR 0048: a screenshot, image or skin as a picture.
        { label: 'Turn a photo into a picture…', click: () => send('pictureToTexture') },
        { type: 'separator' },
        {
          label: 'Export',
          submenu: [
            { label: 'Resource pack (.zip)…', click: () => send('exportResourcePack') },
            { label: 'Data pack (.zip)…', click: () => send('exportDataPack') },
            { label: 'Both packs into a folder…', click: () => send('exportCombined') },
            { label: 'Fabric mod (.jar)…', click: () => send('exportFabricJar') },
            { label: 'Fabric Java project (eject)…', click: () => send('exportJavaProject') },
            { label: 'Export as a map…', click: () => send('exportMap') },
            { type: 'separator' },
            { label: 'Structures (.nbt) into a folder…', click: () => send('exportStructures') },
            {
              label: 'Structures as Sponge schematics (.schem)…',
              click: () => send('exportSchematics'),
            },
            // Other plugin exporters (an external plugin's), as in the toolbar's Export.
            ...pluginExportItems(currentPluginExports, sendPluginExport),
          ],
        },
        {
          label: 'Install',
          submenu: [
            {
              label: 'Resource pack to the resourcepacks folder',
              click: () => send('installResourcePack'),
            },
            { label: 'Data pack to a world…', click: () => send('installDataPack') },
          ],
        },
        { label: 'Test in Minecraft…', click: () => send('testInMinecraft') },
        { label: 'Modpacks…', click: () => send('modpacks') },
        // ADR 0037 D4: move the open mod to another built-in target.
        { label: 'Move to another Minecraft version…', click: () => send('upgradeTarget') },
        { type: 'separator' },
        // ADR 0084 D1, D6: one-click Play and Reload. F5 and Ctrl/Cmd+R were the window's
        // reload keys (Electron's "reload" role); View > Reload window keeps Ctrl/Cmd+Shift+R.
        { label: 'Play', accelerator: 'F5', click: () => send('play') },
        {
          label: 'Reload in the game',
          accelerator: 'CmdOrCtrl+R',
          click: () => send('reloadGame'),
        },
        // ADR 0085 D13: the test area in the app; F6 sits on View > Try it.
        { label: 'Try it', click: () => send('tryIt') },
        { type: 'separator' },
        { label: 'Settings…', click: () => send('settings') },
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('redo') },
        {
          label: 'Redo',
          accelerator: 'Ctrl+Y',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => send('redo'),
        },
        { type: 'separator' },
        { label: 'Rename…', accelerator: 'F2', click: () => send('renameElement') },
        {
          label: 'Command palette',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => send('commandPalette'),
        },
        {
          // ADR 0124 D10, SQ9: the renderer handles Ctrl/Cmd+K (Monaco keeps its chords), so the
          // menu only shows the key.
          label: 'Search…',
          accelerator: 'CmdOrCtrl+K',
          registerAccelerator: false,
          click: () => send('search'),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll', label: 'Select all' },
      ],
    },
    {
      label: 'View',
      submenu: [
        // ADR 0083 D2: Home (ADR 0130 D1: one mode, no mode entries).
        { label: 'Home', click: () => send('home') },
        { label: 'Try it', accelerator: 'F6', click: () => send('tryIt') },
        // ADR 0041 D8: the right dock's "AI helper" tab.
        {
          label: 'AI helper',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => send('toggleAiHelper'),
        },
        { type: 'separator' },
        // Ctrl/Cmd+R is File > Reload in the game (ADR 0084 D6), so the window reload moves.
        { role: 'reload', label: 'Reload window', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'toggleDevTools', label: 'Developer tools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Your first mod…', click: () => send('firstMod') },
        { label: 'Examples…', click: () => send('examples') },
        { label: 'What’s new…', click: () => send('whatsNew') },
        // ADR 0053: requests MSM could not build, kept per mod.
        { label: 'Wishlist…', click: () => send('wishlist') },
        { type: 'separator' },
        { label: 'Check for updates…', click: () => send('checkForUpdates') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
