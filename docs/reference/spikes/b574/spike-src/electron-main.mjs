import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import { loadDataDir } from '../src/files.mjs';
const B = '/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b574';
const version = process.env.SPIKE_VERSION ?? '26.3';
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  await win.loadFile(`${B}/electron/page.html`);
  const all = loadDataDir(`${B}/vanilla/${version}`);
  const files = {}; for (const k of ['worldgen/noise', 'worldgen/density_function', 'worldgen/noise_settings', 'worldgen/material_rule', 'worldgen/material_condition', 'worldgen/biome']) files[k] = all[k];
  const mix = loadDataDir(`${B}/pack/${version}`)['dimension']['b574:clim_mix'].generator.biome_source;
  const src = fs.readFileSync(`${B}/bundle/worker.js`, 'utf8');
  const res = await win.webContents.executeJavaScript(`new Promise((ok, no) => { const t0 = performance.now(); const w = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(src)}], { type: 'text/javascript' }))); w.onerror = (e) => no(String(e.message)); w.onmessage = (e) => ok({ ...e.data, total: performance.now() - t0 }); const t1 = performance.now(); w.postMessage(${JSON.stringify({ files, mix })}); })`);
  console.log('RESULT ' + JSON.stringify({ version, electron: process.versions.electron, chrome: process.versions.chrome, ...res }));
  app.quit();
});
