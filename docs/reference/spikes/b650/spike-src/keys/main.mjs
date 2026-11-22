// B650 spike: SQ9/SQ15 Electron main: a menu with Ctrl+K and Ctrl+Z accelerators like the app's.
import { app, BrowserWindow, Menu } from 'electron';
const fired = [];
globalThis.__fired = fired;
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 900, height: 700, show: true, webPreferences: { contextIsolation: true, sandbox: true } });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Edit', submenu: [
    { label: 'Search…', accelerator: 'CmdOrCtrl+K', click: () => { fired.push({ menu: 'search', t: Date.now() }); win.webContents.executeJavaScript(`window.__log.push({ where: 'menu', item: 'search' })`); } },
    { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => { win.webContents.executeJavaScript(`window.__log.push({ where: 'menu', item: 'undo' })`); } },
  ] }]));
  await win.loadFile(new URL('./page.html', import.meta.url).pathname);
});
