// B840 S4: a hidden frame of another origin (msm-plugin://<id>/) that runs the plugin worker.
// The parent talks to it through a MessagePort it transfers at start.
let port = null;
let worker = null;
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'connect' && e.ports[0]) {
    port = e.ports[0];
    port.onmessage = (m) => {
      const d = m.data;
      if (d.cmd === 'spawn') {
        const url = URL.createObjectURL(new Blob([d.code], { type: 'text/javascript' }));
        worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = (w) => port.postMessage(w.data);
        worker.onerror = (w) => port.postMessage({ type: 'worker-error', message: String(w.message) });
      } else if (d.cmd === 'toWorker') {
        worker.postMessage(d.msg);
      } else if (d.cmd === 'echo') {
        port.postMessage({ type: 'echo', i: d.i });
      } else if (d.cmd === 'origin') {
        let ls = 'none';
        try { localStorage.setItem('x', '1'); ls = 'localStorage works'; } catch (err) { ls = String(err.name); }
        fetch('https://example.com').then(() => port.postMessage({ type: 'origin', origin: location.origin, ls, fetch: 'OPEN' }), (err) => port.postMessage({ type: 'origin', origin: location.origin, ls, fetch: String(err) }));
      }
    };
    port.postMessage({ type: 'frame-ready', origin: location.origin });
  }
});
