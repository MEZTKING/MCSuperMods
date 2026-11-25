// B840 throwaway: the worker bootstrap of app/src/renderer/src/plugins/sandbox/worker-bootstrap.ts
// (same global stripping, same postMessage capture) plus what the spike measures:
//   - views (S1): `contributes.views[i].render(state)` and `.on(event, state)`; the bootstrap keeps
//     the last tree and answers with the whole tree or with patches (path diff), as asked;
//   - canvas (S2): a transferred OffscreenCanvas handed to the plugin, or ImageBitmaps posted back;
//   - host calls (S5): `msmHost.call(name, args)` from the worker, answered by the host.
// Serialised with Function.prototype.toString like the real bootstrap. Not app code.

export const SPIKE_STRIPPED = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport',
  'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker',
];

export function spikeBootstrap(stripped) {
  const scope = globalThis;
  const post = scope.postMessage.bind(scope);
  const listen = scope.addEventListener.bind(scope);
  const remove = (target, name) => {
    if (target === undefined || target === null) return;
    let object = target;
    while (object !== null) {
      try { delete object[name]; } catch {}
      object = Object.getPrototypeOf(object);
    }
    try { Object.defineProperty(target, name, { value: undefined, configurable: false, writable: false }); } catch {}
  };
  for (const name of stripped) remove(scope, name);
  remove(scope.navigator, 'storage');
  remove(scope, 'postMessage');

  let plugin = null;
  const lastTree = new Map();

  // --- tree diff by path (worker side) ---
  const sameProps = (a, b) => {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) { if (k === 'c') continue; if (a[k] !== b[k]) return false; }
    return true;
  };
  const diff = (prev, next, path, out) => {
    if (prev === undefined || prev.t !== next.t || (prev.c?.length ?? 0) !== (next.c?.length ?? 0)) {
      out.push({ op: 'replace', path: path.slice(), node: next });
      return;
    }
    if (!sameProps(prev, next)) {
      const props = {};
      for (const k of Object.keys(next)) if (k !== 'c') props[k] = next[k];
      out.push({ op: 'props', path: path.slice(), props });
    }
    if (next.c) for (let i = 0; i < next.c.length; i++) { path.push(i); diff(prev.c[i], next.c[i], path, out); path.pop(); }
  };
  const answerView = (viewId, mode) => {
    const view = plugin.contributes.views.find((v) => v.id === viewId);
    const t0 = performance.now();
    const tree = view.render(view.state);
    const t1 = performance.now();
    const prev = lastTree.get(viewId);
    lastTree.set(viewId, tree);
    if (mode === 'diff' && prev !== undefined) {
      const patches = [];
      diff(prev, tree, [], patches);
      return { patches, renderMs: t1 - t0, diffMs: performance.now() - t1 };
    }
    return { tree, renderMs: t1 - t0, diffMs: 0 };
  };

  // --- host calls (worker -> host) ---
  let nextCall = 1;
  const calls = new Map();
  scope.msmHost = {
    call(name, args) {
      const id = nextCall++;
      return new Promise((resolve, reject) => {
        calls.set(id, { resolve, reject });
        post({ type: 'hostcall', id, name, args });
      });
    },
  };

  // --- canvas ---
  const canvasApi = {
    postBitmap(bitmap, meta) { post({ type: 'bitmap', bitmap, meta }, [bitmap]); },
    report(data) { post({ type: 'canvas-report', data }); },
  };

  listen('message', async (event) => {
    const m = event.data;
    if (m === null || typeof m !== 'object') return;
    if (m.type === 'hostreply') {
      const c = calls.get(m.id); calls.delete(m.id);
      if (c) m.ok ? c.resolve(m.value) : c.reject(new Error(m.message));
      return;
    }
    if (m.type === 'canvas') {
      try {
        await plugin.contributes.canvas(m.canvas ?? null, m.options, canvasApi);
      } catch (e) { post({ type: 'canvas-report', data: { error: String(e) } }); }
      return;
    }
    if (m.type !== 'request') return;
    try {
      let value;
      if (m.method === 'viewRender') value = answerView(m.args[0], m.args[1]);
      else if (m.method === 'viewEvent') {
        const view = plugin.contributes.views.find((v) => v.id === m.args[0]);
        const tOn = performance.now();
        view.on(m.args[2], view.state);
        const onMs = performance.now() - tOn;
        value = answerView(m.args[0], m.args[1]);
        value.onMs = onMs;
      } else if (m.method === 'call') {
        value = await plugin.contributes[m.args[0]](...(m.args[1] ?? []));
      } else throw new Error('unknown method ' + m.method);
      post({ type: 'response', id: m.id, ok: true, value: value ?? null });
    } catch (error) {
      post({ type: 'response', id: m.id, ok: false, code: 'plugin.crashed', message: String(error) });
    }
  });

  scope.defineMsmPlugin = (candidate) => { plugin = candidate; };
  void Promise.resolve().then(() => {
    delete scope.defineMsmPlugin;
    post({ type: 'ready', description: { id: String(plugin?.id) } });
  });
}

export function spikeBootstrapSource() {
  return `(${spikeBootstrap.toString()})(${JSON.stringify(SPIKE_STRIPPED)});\n`;
}
