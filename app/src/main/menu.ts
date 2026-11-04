/**
 * The application menu. Project commands are forwarded to the focused renderer as
 * `msm:v1:menu` events; clipboard items use Electron roles.
 *
 * @packageDocumentation
 */

import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { EventChannels, type MenuCommand } from '../shared/ipc-channels';

function send(command: MenuCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  window?.webContents.send(EventChannels.menu, command);
}

/** Builds and installs the application menu. */
export function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Project…', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
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
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
