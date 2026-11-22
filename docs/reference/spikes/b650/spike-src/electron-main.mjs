// B650 spike: runs the bench in a Web Worker (blob: URL, the app's production CSP) and on the
// page's main thread, unthrottled and at a four times CPU slow-down (DevTools protocol).
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
const OUT = process.env.B650_OUT;
const target = process.env.TARGET ?? 'mc-26.3';
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  await win.loadFile(`${OUT}/electron/page.html`);
  const input = JSON.parse(fs.readFileSync(`${OUT}/bench-input-${target}.json`, 'utf8'));
  input.reps = 5;
  const src = fs.readFileSync(`${OUT}/electron/worker.js`, 'utf8');
  const results = {};
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  for (const rate of [1, 4]) {
    await dbg.sendCommand('Emulation.setCPUThrottlingRate', { rate });
    results[`worker-x${rate}`] = await win.webContents.executeJavaScript(`new Promise((ok, no) => { const w = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(src)}], { type: 'text/javascript' }))); w.onerror = (e) => no(String(e.message)); const t0 = performance.now(); w.onmessage = (e) => { ok({ ...e.data, total: performance.now() - t0 }); w.terminate(); }; w.postMessage(${JSON.stringify(input)}); })`);
    // the same code on the page's main thread (where the throttle certainly applies)
    results[`main-x${rate}`] = await win.webContents.executeJavaScript(`new Promise((ok) => { window.__input = ${JSON.stringify(input)}; const s = document.createElement('script'); window.__ok = ok; s.src = 'main.js'; document.body.appendChild(s); })`);
  }
  console.log('RESULT ' + JSON.stringify({ target, electron: process.versions.electron, chrome: process.versions.chrome, ...results }));
  app.quit();
});
