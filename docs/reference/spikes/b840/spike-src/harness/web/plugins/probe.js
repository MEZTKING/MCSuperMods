// B840 S7 plugin: what a plugin can still reach under the real bootstrap and the app's CSP.
// Run through the real bootstrap's `lower` method; returns one line per probe.
const results = {};
const settle = (p, ms = 3000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('no answer in ' + ms + ' ms')), ms))]);
async function probe(name, fn) {
  try {
    const v = await settle(Promise.resolve().then(fn));
    results[name] = 'OPEN: ' + (typeof v === 'string' ? v : JSON.stringify(v));
  } catch (e) {
    results[name] = 'refused: ' + String(e && e.message ? `${e.name}: ${e.message}` : e).slice(0, 200);
  }
}
const g = globalThis;
const present = (name) => (typeof g[name] === 'undefined' ? 'removed (undefined)' : 'PRESENT ' + typeof g[name]);
const APP = self.__APP_ASSET__; // set by the host for the run
async function run(appAsset) {
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport',
    'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'postMessage',
    'SharedArrayBuffer', 'WebAssembly', 'OffscreenCanvas', 'Notification', 'RTCPeerConnection', 'ShadowRealm',
    'FontFace', 'fonts', 'cookieStore', 'requestAnimationFrame', 'FileSystemHandle', 'VideoEncoder', 'Request', 'Response']) {
    results['global.' + name] = present(name);
  }
  results['proto.postMessage'] = typeof (self.constructor && self.constructor.prototype && self.constructor.prototype.postMessage);
  results['proto.fetch'] = typeof (Object.getPrototypeOf(Object.getPrototypeOf(self)) || {}).fetch;
  await probe('eval', () => String(eval('1+1')));
  await probe('new Function', () => String(new Function('return 2')()));
  await probe('import https', () => import('https://example.com/x.js').then(() => 'loaded'));
  await probe('import data:', () => import('data:text/javascript,export default 1').then(() => 'loaded'));
  await probe('import blob:', () => import(URL.createObjectURL(new Blob(['export default 1'], { type: 'text/javascript' }))).then(() => 'loaded'));
  await probe('import file:', () => import('file:///etc/hostname').then(() => 'loaded'));
  if (appAsset) {
    await probe('import msm-app js', () => import(appAsset.js).then((m) => 'loaded module with ' + Object.keys(m).length + ' exports'));
    if (appAsset.json) await probe('import msm-app json', () => import(appAsset.json, { with: { type: 'json' } }).then((m) => 'read ' + JSON.stringify(m.default).length + ' chars'));
  }
  await probe('WebAssembly.compile', async () => {
    const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    await WebAssembly.compile(bytes);
    return 'compiled';
  });
  await probe('new WebAssembly.Module', () => { new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); return 'compiled'; });
  await probe('performance.now resolution', () => {
    let min = Infinity, prev = performance.now();
    for (let i = 0; i < 200000; i++) { const t = performance.now(); const d = t - prev; if (d > 0 && d < min) min = d; prev = t; }
    return `smallest step ${(min * 1000).toFixed(1)} us; crossOriginIsolated=${self.crossOriginIsolated}`;
  });
  const nav = {};
  for (let o = navigator; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const k of Object.getOwnPropertyNames(o)) if (k !== 'constructor' && !(k in nav)) {
      try { const v = navigator[k]; nav[k] = v === undefined ? 'undefined' : typeof v === 'object' ? (v === null ? 'null' : 'object') : typeof v === 'function' ? 'function' : String(v).slice(0, 60); } catch (e) { nav[k] = 'throws'; }
    }
  }
  results.navigator = nav;
  await probe('navigator.locks.query', async () => JSON.stringify(await navigator.locks.query()));
  await probe('navigator.locks.request (state shared with the app origin)', () => navigator.locks.request('spike-lock', async () => 'held a lock'));
  await probe('navigator.storageBuckets.open', async () => {
    const b = await navigator.storageBuckets.open('spike');
    const idb = b.indexedDB.open('x');
    await new Promise((res, rej) => { idb.onsuccess = res; idb.onerror = () => rej(idb.error); });
    return 'opened an IndexedDB in a storage bucket (persistent storage)';
  });
  await probe('storageBucket.getDirectory (OPFS)', async () => {
    const b = await navigator.storageBuckets.open('spike2');
    const dir = await b.getDirectory();
    const fh = await dir.getFileHandle('f.txt', { create: true });
    return 'created an OPFS file ' + fh.name;
  });
  await probe('navigator.permissions notifications', async () => (await navigator.permissions.query({ name: 'notifications' })).state);
  await probe('Notification.permission', () => Notification.permission);
  await probe('new Notification', () => { const n = new Notification('Spike'); n.close(); return 'shown'; });
  await probe('navigator.usb.getDevices', async () => (await navigator.usb.getDevices()).length + ' devices');
  await probe('navigator.hid.getDevices', async () => (await navigator.hid.getDevices()).length + ' devices');
  await probe('navigator.serial.getPorts', async () => (await navigator.serial.getPorts()).length + ' ports');
  await probe('navigator.gpu.requestAdapter', async () => { const a = await navigator.gpu.requestAdapter(); return a ? 'adapter' : 'null'; });
  await probe('navigator.sendBeacon', () => String(navigator.sendBeacon('https://example.com/b', 'x')));
  await probe('FontFace https url', () => new FontFace('Spike', 'url(https://example.com/f.woff2)').load().then(() => 'loaded'));
  await probe('FontFace local()', () => new FontFace('Spike2', 'local(DejaVu Sans)').load().then(() => 'loaded a system font'));
  if (appAsset && appAsset.font) await probe('FontFace msm-app url', () => new FontFace('Spike3', `url(${appAsset.font})`).load().then(() => 'loaded'));
  await probe('OffscreenCanvas 2d + fillText', () => { const c = new OffscreenCanvas(8, 8).getContext('2d'); c.fillText('x', 0, 8); return 'drawn'; });
  await probe('OffscreenCanvas webgl2', () => { const c = new OffscreenCanvas(8, 8).getContext('webgl2'); return c ? 'context' : 'null'; });
  await probe('timers keep running after the call', () => new Promise((res) => { let n = 0; const id = setInterval(() => { n++; if (n === 3) { clearInterval(id); res('setInterval ran 3 times'); } }, 5); }));
  await probe('URL.createObjectURL', () => URL.createObjectURL(new Blob(['x'])).slice(0, 30));
  await probe('self.location', () => String(self.location.href).slice(0, 40));
  await probe('self.origin', () => self.origin);
  await probe('navigator.userAgent', () => navigator.userAgent.match(/Electron\/[\d.]+/)?.[0] ?? navigator.userAgent.slice(0, 40));
  await probe('crypto.subtle.digest', async () => (await crypto.subtle.digest('SHA-256', new Uint8Array(1))).byteLength + ' bytes');
  await probe('addEventListener message (sees host requests)', () => { addEventListener('message', () => {}); return 'listening'; });
  await probe('MessageChannel', () => { new MessageChannel(); return 'created'; });
  return results;
}
defineMsmPlugin({
  id: 'spike.probe',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [{ id: 'spike:probe', lower: (element) => run(element && element.appAsset) }],
  },
});
