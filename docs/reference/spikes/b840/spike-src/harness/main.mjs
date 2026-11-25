// B840 harness main: the app's shape (privileged msm-app scheme, the app's CSP in the page,
// sandbox, context isolation) plus a second privileged scheme msm-plugin://<id>/ with its own
// CSP header (S4's frame of another origin) and a folder watch (S10). Throwaway.
import { readFile } from 'node:fs/promises';
import { watch, readFileSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, protocol, ipcMain } from 'electron';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, 'web');
const FRAME = join(here, 'frame');

protocol.registerSchemesAsPrivileged([
  { scheme: 'msm-app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
  { scheme: 'msm-plugin', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
async function serve(root, url, extraHeaders = {}) {
  const u = new URL(url);
  let p = decodeURIComponent(u.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const file = resolve(root, '.' + p);
  const rel = relative(root, file);
  if (rel.startsWith('..') || isAbsolute(rel)) return new Response('no', { status: 404 });
  try {
    const bytes = await readFile(file);
    const ext = file.slice(file.lastIndexOf('.'));
    return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', ...extraHeaders } });
  } catch {
    return new Response('no', { status: 404 });
  }
}

const FRAME_CSP = "default-src 'none'; script-src 'self'; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'";

app.whenReady().then(() => {
  protocol.handle('msm-app', (req) => {
    if (new URL(req.url).host !== 'app') return new Response('no', { status: 404 });
    return serve(WEB, req.url);
  });
  protocol.handle('msm-plugin', (req) => serve(FRAME, req.url, { 'content-security-policy': FRAME_CSP }));
  const win = new BrowserWindow({
    width: 1200, height: 800, show: true,
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('RENDER-PROCESS-GONE', JSON.stringify(d)));
  app.on('child-process-gone', (_e, d) => console.log('CHILD-PROCESS-GONE', JSON.stringify(d)));
  win.webContents.on('did-frame-finish-load', () => {});
  globalThis.spikeWindow = win;
  void win.loadURL('msm-app://app/index.html');

  // S10: watch a folder of plugin bundles; send the new text to the renderer.
  const watchDir = process.env.B840_WATCH;
  if (watchDir) {
    watch(watchDir, (event, name) => {
      if (!name || !name.endsWith('.js')) return;
      const seenAt = Date.now();
      let text;
      try { text = readFileSync(join(watchDir, name), 'utf8'); } catch { return; }
      win.webContents.send('spike:plugin-changed', { name, text, seenAt, readAt: Date.now() });
    });
  }
  ipcMain.handle('spike:metrics', () => app.getAppMetrics());
});
app.on('window-all-closed', () => app.quit());
