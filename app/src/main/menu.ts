/**
 * The application menu. Project commands are forwarded to the focused renderer as
 * `msm:v1:menu` events; clipboard items use Electron roles.
 *
 * @packageDocumentation
 */

import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { EventChannels, type MenuCommand, type MenuOpenRecent } from '../shared/ipc-channels';
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

/** The longest path shown in an "Open Recent" label before the middle is elided. */
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

/** The label of one "Open Recent" entry; `&` is doubled so it is not read as a mnemonic. */
export function recentLabel(entry: Pick<RecentProject, 'name' | 'root'>): string {
  return `${entry.name} — ${shortenPath(entry.root)}`.replaceAll('&', '&&');
}

/** The "Open Recent" submenu: one item per project, or a disabled note, then "Clear". */
export function recentSubmenu(
  recent: readonly RecentProject[],
  open: (root: string) => void,
  clear: () => void,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] =
    recent.length === 0
      ? [{ label: 'No recent projects', enabled: false }]
      : recent.slice(0, 10).map((entry) => ({
          label: recentLabel(entry),
          click: () => open(entry.root),
        }));
  return [
    ...items,
    { type: 'separator' },
    { label: 'Clear Recent Projects', enabled: recent.length > 0, click: clear },
  ];
}

/**
 * Builds and installs the application menu. Call again with the new list whenever the
 * recent projects change.
 */
export function installMenu(recent: readonly RecentProject[] = []): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        // Ctrl/Cmd+N is left to the renderer, where it adds a new element.
        { label: 'New Project…', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('new') },
        { label: 'New Project from Starter…', click: () => send('newProjectFromStarter') },
        // ADR 0043: opens the Creator.
        { label: 'Create…', click: () => send('creator') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        {
          label: 'Open Recent',
          submenu: recentSubmenu(recent, sendOpenRecent, () => send('clearRecentProjects')),
        },
        // ADR 0037 D4: move the open project to another built-in target.
        { label: 'Upgrade Project Target…', click: () => send('upgradeTarget') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { type: 'separator' },
        { label: 'Import Assets…', click: () => send('importAssets') },
        { label: 'Import Structure…', click: () => send('importStructure') },
        { label: 'Import Blockbench Model…', click: () => send('importBlockbench') },
        { type: 'separator' },
        { label: 'Export Resource Pack…', click: () => send('exportResourcePack') },
        { label: 'Export Data Pack…', click: () => send('exportDataPack') },
        { label: 'Export Both…', click: () => send('exportCombined') },
        { label: 'Export Fabric Mod Jar…', click: () => send('exportFabricJar') },
        { label: 'Export Java Project…', click: () => send('exportJavaProject') },
        { label: 'Test in Minecraft…', click: () => send('testInMinecraft') },
        { label: 'Install Resource Pack', click: () => send('installResourcePack') },
        { label: 'Install Data Pack…', click: () => send('installDataPack') },
        {
          label: 'More Exports',
          submenu: [
            { label: 'Export Structures (.nbt)…', click: () => send('exportStructures') },
            {
              label: 'Export Structures as Sponge Schematics (.schem)…',
              click: () => send('exportSchematics'),
            },
          ],
        },
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
        { label: 'Rename Element…', accelerator: 'F2', click: () => send('renameElement') },
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => send('commandPalette'),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        // ADR 0041 D8: the right dock's "AI helper" tab.
        {
          label: 'AI Helper',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => send('toggleAiHelper'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Examples…', click: () => send('examples') },
        { label: "What's New…", click: () => send('whatsNew') },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => send('checkForUpdates') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
