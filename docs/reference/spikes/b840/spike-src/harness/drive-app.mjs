// B840: the S2 and S7 probes inside the real app's window (its CSP, msm-app:// scheme, preload and
// webPreferences), from the built `app/out/` or the packaged `app/dist/linux-unpacked/`.
// Usage: xvfb-run -a node drive-app.mjs dev|packaged [--swiftshader]
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', '..', 'wt-B840', 'app');
const require = createRequire(join(appDir, 'package.json'));
const { _electron } = require('playwright');
const shape = process.argv[2];
const gpu = process.argv.includes('--swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
const temp = mkdtempSync(join(tmpdir(), 'b840-app-'));
const env = { ...process.env, MSM_HOME: join(temp, 'home'), MSM_E2E: '1' };
const common = ['--no-sandbox', `--user-data-dir=${join(temp, 'user-data')}`, ...gpu];
const app = shape === 'packaged'
  ? await _electron.launch({ executablePath: join(appDir, 'dist', 'linux-unpacked', 'mcsupermods'), args: common, env, timeout: 60000 })
  : await _electron.launch({ args: [appDir, ...common], cwd: appDir, env, timeout: 60000 });
const win = await app.firstWindow({ timeout: 60000 });
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(3000);
const realBoot = readFileSync(join(here, 'real-boot.js'), 'utf8');
const spikeBoot = readFileSync(join(here, 'spike-boot.js'), 'utf8');
const probe = readFileSync(join(here, 'web', 'plugins', 'probe.js'), 'utf8');
const canvas = readFileSync(join(here, 'web', 'plugins', 'canvas.js'), 'utf8');
const asset = readdirSync(join(appDir, 'out', 'renderer', 'assets')).find((n) => n.endsWith('.js'));
const out = { shape, gpu, url: win.url(), csp: await win.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')) };
out.s7 = await win.evaluate(async ([boot, code, assetUrl]) => {
  const url = URL.createObjectURL(new Blob([boot + code], { type: 'text/javascript' }));
  const w = new Worker(url); URL.revokeObjectURL(url);
  return await new Promise((resolve) => {
    w.onmessage = (e) => {
      if (e.data.type === 'ready') w.postMessage({ type: 'request', id: 1, method: 'lower', args: ['spike:probe', { appAsset: { js: assetUrl } }, {}] });
      else if (e.data.type === 'response') { w.terminate(); resolve(e.data.value ?? e.data); }
    };
    w.onerror = (e) => resolve({ error: String(e.message) });
  });
}, [realBoot, probe, `msm-app://app/assets/${asset}`]);
out.s2 = await win.evaluate(async ([boot, code]) => {
  const run = (how, kind) => new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([boot + code], { type: 'text/javascript' }));
    const w = new Worker(url); URL.revokeObjectURL(url);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
    cv.style.position = 'fixed'; cv.style.left = '-9999px'; document.body.appendChild(cv);
    const ctx = how === 'bitmap' ? cv.getContext('bitmaprenderer') : null;
    let frames = 0;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') {
        if (how === 'transfer') { const off = cv.transferControlToOffscreen(); w.postMessage({ type: 'canvas', canvas: off, options: { context: kind, frames: 30 } }, [off]); }
        else w.postMessage({ type: 'canvas', options: { context: kind, frames: 30, probeOnly: how === 'probe' } });
      } else if (m.type === 'bitmap') { ctx.transferFromImageBitmap(m.bitmap); frames++; }
      else if (m.type === 'canvas-report') {
        w.terminate(); cv.remove();
        const d = m.data;
        const med = (xs) => xs && xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;
        resolve({ contexts: d.contexts, error: d.error ?? null, drawMedianMs: med(d.drawMs), intervalMedianMs: med(d.intervals), bitmapsReceived: frames });
      }
    };
  });
  return { probe: await run('probe', '2d'), '2d-transfer': await run('transfer', '2d'), '2d-bitmap': await run('bitmap', '2d'), 'webgl2-transfer': await run('transfer', 'webgl2'), 'webgl2-bitmap': await run('bitmap', 'webgl2') };
}, [spikeBoot, canvas]);
writeFileSync(join(here, 'results', `app-${shape}${gpu.length ? '-swiftshader' : ''}.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ shape, url: out.url, s2: out.s2 }, null, 1));
await app.close().catch(() => {});
rmSync(temp, { recursive: true, force: true });
