// B840 S5: calls from the worker to the host, timed in the worker.
const st = (xs) => { const s = xs.slice().sort((a, b) => a - b); const at = (p) => s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; return { n: s.length, median: +at(50).toFixed(3), p95: +at(95).toFixed(3), max: +at(100).toFixed(3) }; };
defineMsmPlugin({
  id: 'spike.hostcall',
  apiVersion: '^1.0.0',
  contributes: {
    async small(n) { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await msmHost.call('ping', [i]); t.push(performance.now() - s); } return st(t); },
    async oneMb(n) { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await msmHost.call('oneMb', []); t.push(performance.now() - s); } return st(t); },
    async project(n) { const t = []; let len = 0; for (let i = 0; i < n; i++) { const s = performance.now(); const p = await msmHost.call('project', []); len = p.length; t.push(performance.now() - s); } return { ...st(t), elements: len }; },
    async ids(n) { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await msmHost.call('ids', []); t.push(performance.now() - s); } return st(t); },
    async pages(size) { const s = performance.now(); let got = 0; const per = []; for (let i = 0; ; i += size) { const a = performance.now(); const page = await msmHost.call('page', [i, size]); per.push(performance.now() - a); got += page.length; if (page.length < size) break; } return { totalMs: +(performance.now() - s).toFixed(1), elements: got, perPage: st(per) }; },
    echoSize(x) { return x && x.length !== undefined ? x.length : 0; },
  },
});
