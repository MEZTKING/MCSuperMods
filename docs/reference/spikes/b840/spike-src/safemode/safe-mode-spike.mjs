// B840 S11: where "started" and "usable" marks go so that two failed starts in a row turn plugins
// off, and which endings must not count. Scenario from B840_SCENARIO: ok | crash-after-paint |
// close-early | kill-early | hang. Marks in B840_MARKS (a JSON file; the app would use <msmHome>).
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
const MARKS = process.env.B840_MARKS;
const scenario = process.env.B840_SCENARIO ?? 'ok';
const USABLE_AFTER_MS = 3000; // after the first paint with plugins started and no crash
const read = () => { try { return JSON.parse(readFileSync(MARKS, 'utf8')); } catch { return { failures: 0, pending: false }; } };
const write = (m) => { const t = performance.now(); writeFileSync(MARKS + '.tmp', JSON.stringify(m)); renameSync(MARKS + '.tmp', MARKS); return performance.now() - t; };
const log = (...a) => console.log('[safe-mode]', ...a);

let marks = read();
if (marks.pending) marks.failures += 1; // the last start never became usable and never ended cleanly
const safeMode = marks.failures >= 2;
marks = { ...marks, pending: !safeMode, startedAt: Date.now(), safeMode };
const writeMs = write(marks);
log(JSON.stringify({ scenario, safeMode, failuresBefore: marks.failures, writeMs: +writeMs.toFixed(2) }));
if (safeMode) { write({ failures: 0, pending: false, lastSafeModeAt: Date.now() }); log('SAFE MODE: plugins off'); }

const fail = (why) => { const m = read(); if (!m.pending) return; write({ ...m, pending: false, failures: m.failures + 1, lastFailure: why }); log('failure recorded:', why); };
const usable = () => { const m = read(); if (!m.pending) return; write({ ...m, pending: false, failures: 0, usableAt: Date.now() }); log('usable'); };
const cleanEnd = () => { const m = read(); if (m.pending) { write({ ...m, pending: false }); log('clean end before usable: not counted'); } };

app.whenReady().then(() => {
  const win = new BrowserWindow({ show: true, webPreferences: { sandbox: true, contextIsolation: true } });
  win.webContents.on('render-process-gone', (_e, d) => { fail('renderer ' + d.reason); setTimeout(() => app.quit(), 200); });
  win.on('unresponsive', () => { fail('unresponsive'); setTimeout(() => app.exit(1), 200); });
  win.webContents.once('did-finish-load', () => {
    // Usable only when the renderer itself answers after the wait: a main-side timer alone
    // counted a frozen renderer as usable (first run of scenario hang).
    const t = setTimeout(() => {
      Promise.race([win.webContents.executeJavaScript('1').then(() => 'answered'), new Promise((r) => setTimeout(() => r('silent'), 2000))])
        .then((a) => { if (a === 'answered') usable(); else { fail('renderer did not answer'); app.exit(1); } });
    }, USABLE_AFTER_MS);
    if (scenario === 'crash-after-paint') setTimeout(() => win.webContents.forcefullyCrashRenderer(), 800);
    if (scenario === 'close-early') setTimeout(() => win.close(), 500);
    if (scenario === 'kill-early') setTimeout(() => process.kill(process.pid, 'SIGKILL'), 500);
    if (scenario === 'hang') setTimeout(() => win.webContents.executeJavaScript('for(;;){}'), 300);
    if (scenario === 'ok') setTimeout(() => app.quit(), USABLE_AFTER_MS + 500);
    win.on('closed', () => clearTimeout(t));
  });
  void win.loadURL('data:text/html,<p>start</p>');
});
app.on('before-quit', cleanEnd);
app.on('window-all-closed', () => { cleanEnd(); app.quit(); });
