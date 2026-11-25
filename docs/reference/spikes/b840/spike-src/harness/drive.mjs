// B840 driver: launches the harness (or the real app with --app/--packaged) under Playwright and runs
// one experiment. Usage: xvfb-run -a node drive.mjs <experiment> [args]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const here = dirname(fileURLToPath(import.meta.url));
const WT = join(here, '..', '..', 'wt-B840');
const require = createRequire(join(WT, 'app', 'package.json'));
const { _electron } = require('playwright');
const electronPath = require('electron');

const exp = process.argv[2];
const extra = process.argv.slice(3);
const results = join(here, 'results');
mkdirSync(results, { recursive: true });
const save = (name, data) => { writeFileSync(join(results, name), JSON.stringify(data, null, 2)); console.log(JSON.stringify(data, null, 2).slice(0, 4000)); };

async function launch({ args = [], env = {}, page = 'index.html' } = {}) {
  const app = await _electron.launch({ executablePath: electronPath, args: [here, '--no-sandbox', ...args], env: { ...process.env, ...env }, timeout: 30000 });
  const win = await app.firstWindow();
  if (page !== 'index.html') await win.goto(`msm-app://app/${page}`);
  await win.waitForFunction(() => document.title === 'B840 ready');
  const logs = [];
  app.process().stdout.on('data', (d) => logs.push(String(d)));
  app.process().stderr.on('data', (d) => { if (process.env.B840_STDERR) process.stderr.write(d); });
  const proc = app.process();
  app.on('close', () => console.log('ELECTRON CLOSED', proc.exitCode, proc.signalCode));
  return { app, win, logs };
}

const sizes = [50, 500, 2000];
if (exp === 's1') {
  const gpu = extra.includes('--swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  const { app, win } = await launch({ args: gpu });
  const throttle = Number((extra.find((x) => x.startsWith('--throttle=')) ?? '--throttle=1').split('=')[1]);
  if (throttle > 1) { const cdp = await win.context().newCDPSession(win); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
  const plugin = readFileSync(join(here, 'web', 'plugins', 'kit-form.js'), 'utf8');
  const typed = 'thequickbrownfoxjumpsoverthelazydog0123456789THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG!'; // 80 keys
  const out = [];
  const delays = extra.includes('--fast') ? [30] : [100];
  const co = extra.includes('--coalesce');
  for (const delay of delays) for (const n of (co ? [500, 2000] : sizes)) for (const mode of (co ? ['whole', 'diff'] : ['whole', 'whole-share', 'diff'])) for (const field of (co ? ['host'] : ['host', 'worker'])) {
    const nodes = await win.evaluate(([n, mode, field, plugin, co]) => window.spike.s1Setup(n, mode, field, plugin, co), [n, mode, field, plugin, co]);
    await win.getByTestId('kit-name').click();
    await win.waitForTimeout(300);
    await win.keyboard.type(typed, { delay });
    await win.waitForTimeout(1500);
    const r = await win.evaluate((typed) => window.spike.s1Results(typed), typed);
    out.push({ delay, nodes, mode, field, ...r });
    console.log(delay, nodes, mode, field, 'field p95', r.fieldPaint.p95, 'echo p95', r.echoPaint.p95, 'lost', r.lostField, 'final ok', r.finalValueOk);
  }
  save(`s1${co ? '-coalesce' : ''}${extra.includes('--fast') ? '-fast' : ''}${throttle > 1 ? '-throttle' + throttle : ''}${gpu.length ? '-swiftshader' : ''}.json`, out);
  await app.close();
} else if (exp === 's2') {
  const gpu = extra.includes('--swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  const { app, win } = await launch({ args: gpu });
  const out = { args: gpu };
  out.probe = await win.evaluate(() => window.spike.s2('2d', 'probe'));
  for (const ctx of ['2d', 'webgl2']) for (const how of ['transfer', 'bitmap']) {
    out[`${ctx}-${how}`] = await win.evaluate(([c, h]) => window.spike.s2(c, h), [ctx, how]);
  }
  save(`s2${gpu.length ? '-swiftshader' : ''}.json`, out);
  await app.close();
} else if (exp === 's3') {
  const { app, win } = await launch();
  const out = {};
  out.light = await win.evaluate(() => window.spike.s3(2));
  out.busy20 = await win.evaluate(() => window.spike.s3(20));
  out.processes = await app.evaluate(({ BrowserWindow, app }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    return { main: wc.mainFrame.osProcessId, frames: wc.mainFrame.framesInSubtree.map((f) => ({ url: f.url.slice(0, 40), pid: f.osProcessId, origin: f.origin })), metrics: app.getAppMetrics().map((m) => ({ type: m.type, pid: m.pid })) };
  });
  save('s3.json', out);
  await app.close();
} else if (exp === 's4-idle') {
  const { app, win } = await launch();
  const pid = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getOSProcessId());
  const mem = () => {
    const s = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
    const get = (k) => Number(s.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'))[1]) / 1024;
    return { rssMb: +get('Rss').toFixed(1), pssMb: +get('Pss').toFixed(1), privateMb: +(get('Private_Clean') + get('Private_Dirty')).toFixed(1) };
  };
  const out = { pid, rows: [] };
  await win.waitForTimeout(2000);
  out.rows.push({ workers: 0, ...mem() });
  for (const n of [10, 20, 40]) {
    await win.evaluate((k) => window.spike.s4Idle(k), n - out.rows[out.rows.length - 1].workers);
    await win.waitForTimeout(3000);
    out.rows.push({ workers: n, ...mem() });
  }
  await win.evaluate(() => window.spike.s4StopIdle());
  await win.waitForTimeout(3000);
  out.rows.push({ workers: 'after terminate', ...mem() });
  save('s4-idle.json', out);
  await app.close();
} else if (exp === 's4-hog') {
  // kind: heap or arraybuffer; jsflags optional
  const kind = extra[0];
  const cap = Number(extra[1]);
  const flags = extra[2] ? [`--js-flags=${extra[2]}`] : [];
  const { app, win, logs } = await launch({ args: flags });
  const pid = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getOSProcessId());
  const out = { kind, cap, flags, pid };
  let peak = 0;
  const timer = setInterval(() => { try { const s = readFileSync(`/proc/${pid}/status`, 'utf8'); const rss = Number(s.match(/VmRSS:\s+(\d+)/)[1]) / 1024; peak = Math.max(peak, rss); if (rss > 5000) { console.log('RSS over 6 GB, killing'); process.kill(pid, 'SIGKILL'); } } catch {} }, 200);
  try {
    out.result = await win.evaluate(([k, c]) => window.spike.s4Hog(k, c), [kind, cap]);
  } catch (e) { out.result = { evaluateFailed: String(e).slice(0, 300) }; }
  clearInterval(timer);
  out.peakRssMb = Math.round(peak);
  try { out.pageAliveAfter = await win.evaluate(() => 1 + 1); } catch (e) { out.pageAliveAfter = String(e).slice(0, 200); }
  out.mainLog = logs.join('').slice(0, 2000);
  save(`s4-hog-${kind}${flags.length ? '-' + extra[2].replace(/[^a-z0-9]/gi, '') : ''}.json`, out);
  await app.close().catch(() => {});
} else if (exp === 's4-frame') {
  const { app, win, logs } = await launch({ page: 'frame.html' });
  const before = await app.evaluate(({ app }) => app.getAppMetrics().map((m) => ({ type: m.type, pid: m.pid, mb: Math.round(m.memory.workingSetSize / 1024) })));
  const out = { before };
  out.frame = await win.evaluate(() => window.spike.s4Frame());
  await win.waitForTimeout(2000);
  out.after = await app.evaluate(({ app, BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    return { metrics: app.getAppMetrics().map((m) => ({ type: m.type, pid: m.pid, mb: Math.round(m.memory.workingSetSize / 1024) })), main: wc.mainFrame.osProcessId, frames: wc.mainFrame.framesInSubtree.map((f) => ({ url: f.url.slice(0, 40), pid: f.osProcessId })) };
  });
  const smaps = (pid) => { try { const t = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'); const g = (k) => Number(t.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'))[1]) / 1024; return { rssMb: +g('Rss').toFixed(1), pssMb: +g('Pss').toFixed(1), privateMb: +(g('Private_Clean') + g('Private_Dirty')).toFixed(1) }; } catch (e) { return String(e); } };
  out.frameProcessMemory = out.after.frames.filter((f) => f.pid !== out.after.main).map((f) => ({ url: f.url, ...smaps(f.pid) }));
  out.mainProcessMemory = smaps(out.after.main);
  if (extra.includes('--hog')) {
    try { out.hog = await win.evaluate(() => window.spike.s4FrameHog(100000)); } catch (e) { out.hog = String(e).slice(0, 300); }
    await new Promise((r) => setTimeout(r, 1500));
    try { out.pageAliveAfterHog = await win.evaluate(() => 1 + 1); } catch (e) { out.pageAliveAfterHog = String(e).slice(0, 200); }
    out.afterHog = await app.evaluate(({ app, BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      let frames;
      try { frames = wc.mainFrame.framesInSubtree.map((f) => { try { return { url: f.url.slice(0, 40), pid: f.osProcessId }; } catch (e) { return String(e); } }); } catch (e) { frames = String(e); }
      return { mainCrashed: wc.isCrashed(), mainPid: wc.getOSProcessId(), metrics: app.getAppMetrics().map((m) => ({ type: m.type, pid: m.pid })), frames };
    });
  }
  out.mainLog = logs.join('').slice(0, 2000);
  save(`s4-frame${extra.includes('--hog') ? '-hog' : ''}.json`, out);
  await app.close().catch(() => {});
} else if (exp === 's4-frame-blocked') {
  // The app's own CSP (no frame-src): is a msm-plugin:// frame allowed at all?
  const { app, win } = await launch();
  const r = await win.evaluate(() => window.spike.s4Frame());
  save('s4-frame-blocked.json', r);
  await app.close();
} else if (exp === 's5') {
  const { app, win } = await launch();
  save('s5.json', await win.evaluate(() => window.spike.s5()));
  await app.close();
} else if (exp === 's7') {
  const { app, win } = await launch();
  const asset = { js: 'msm-app://app/plugins/idle.js', json: 'msm-app://app/data/small.json' };
  save('s7-harness.json', await win.evaluate((a) => window.spike.s7(a), asset));
  await app.close();
} else if (exp === 's10') {
  const dir = join(here, 'watch');
  mkdirSync(dir, { recursive: true });
  const src = readFileSync(join(here, 'web', 'plugins', 'kit-form.js'), 'utf8');
  writeFileSync(join(dir, 'kit.js'), src);
  const { app, win } = await launch({ env: { B840_WATCH: dir } });
  await win.evaluate(() => window.spike.s10Start());
  await win.getByTestId('kit-name').click();
  await win.keyboard.type('Ann', { delay: 50 });
  await win.waitForTimeout(500);
  const out = { saves: [] };
  for (let i = 0; i < 10; i++) {
    const writtenAt = Date.now();
    writeFileSync(join(dir, 'kit.js'), src.replace('Hello, ', `Hello ${i}, `));
    await win.waitForTimeout(1500);
    out.saves.push({ writtenAt });
  }
  out.marks = await win.evaluate(() => window.__reload);
  out.fieldAfter = await win.getByTestId('kit-name').inputValue();
  out.echoAfter = await win.evaluate(() => document.querySelector('.kit-text')?.textContent);
  // First mark per save: save -> fs.watch, -> renderer, -> painted.
  out.perSave = out.saves.map((s) => {
    const m = out.marks.find((k) => k.seenAt >= s.writtenAt);
    return m ? { watchMs: m.seenAt - s.writtenAt, toRendererMs: Math.round(m.recvAt - s.writtenAt), restartAndPaintMs: +m.restartAndPaintMs.toFixed(1), saveToPaintMs: Math.round(m.paintedAt - s.writtenAt) } : null;
  });
  out.eventsPerSave = out.marks.length / out.saves.length;
  save('s10.json', out);
  await app.close();
}
