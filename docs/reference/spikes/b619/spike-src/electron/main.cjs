// B619 spike (throwaway): Electron main. Runs one renderer task (argv: task, out file) in a hidden window.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const [task, outFile, ...rest] = process.argv.slice(process.argv.indexOf('--') + 1);
app.whenReady().then(async () => {
  ipcMain.handle('b619:read', (_e, f) => fs.promises.readFile(f));
  const win = new BrowserWindow({ show: false, width: 900, height: 600,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
  win.webContents.on('console-message', (e) => console.log('[r]', e.message));
  await win.loadFile(path.join(__dirname, 'page.html'));
  const t0 = Date.now();
  try {
    const result = await win.webContents.executeJavaScript(`runTask(${JSON.stringify(task)}, ${JSON.stringify(rest)})`);
    result.electron = process.versions.electron; result.chrome = process.versions.chrome; result.wallMs = Date.now() - t0;
    fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
  } catch (e) { console.error('task failed', e); process.exitCode = 1; }
  app.quit();
});
