// The hostile probe plugin (B870): a hand-written classic script, as the sandbox runs a
// plugin's bundle (ADR 0035 D1). Its one exporter tries everything B840's spike (S7) found a
// plugin could still reach, and writes what it reached to `hostile-report.json` in the export
// folder. The end-to-end test `plugins-path` installs it and asserts that `reached` is empty.

/** Globals a plugin must not see (the bootstrap's list in `worker-lockdown.ts`, and more). */
const GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebSocketStream',
  'EventSource',
  'WebTransport',
  'importScripts',
  'indexedDB',
  'caches',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
  'Notification',
  'StorageBucketManager',
  'LockManager',
  'postMessage',
];

/** `navigator` members a plugin must not see. */
const NAVIGATOR = ['storage', 'storageBuckets', 'locks', 'usb', 'hid', 'serial', 'gpu'];

/** Runs `attempt`; a value means it got through, a throw means it was stopped. */
async function tryIt(reached, label, attempt) {
  try {
    await attempt();
    reached.push(label);
  } catch {
    // Stopped: as it should be.
  }
}

/** Whether a CSP report was made for `url`. */
function refusedByCsp(blocked, url) {
  return blocked.some((uri) => uri === url || url.startsWith(uri));
}

async function probe() {
  const reached = [];
  const scope = globalThis;
  for (const name of GLOBALS) {
    if (typeof scope[name] !== 'undefined') reached.push(name);
  }
  const nav = scope.navigator;
  for (const name of NAVIGATOR) {
    if (typeof nav[name] !== 'undefined') {
      reached.push(`navigator.${name}`);
      continue;
    }
    let proto = Object.getPrototypeOf(nav);
    while (proto !== null) {
      if (Object.getOwnPropertyDescriptor(proto, name) !== undefined) {
        reached.push(`navigator.${name} (prototype)`);
        break;
      }
      proto = Object.getPrototypeOf(proto);
    }
    try {
      Object.defineProperty(nav, name, { value: 1 });
    } catch {
      // Pinned: as it should be.
    }
    if (typeof nav[name] !== 'undefined') reached.push(`navigator.${name} (defined again)`);
  }

  // Using them, in case one slipped past the names.
  await tryIt(reached, 'storageBuckets.open', () => nav.storageBuckets.open('hostile'));
  await tryIt(reached, 'locks.request', () => nav.locks.request('hostile', () => 1));
  await tryIt(reached, 'storage.getDirectory', () => nav.storage.getDirectory());
  await tryIt(reached, 'new Notification', () => new scope.Notification('Hostile probe'));
  await tryIt(reached, 'usb.getDevices', () => nav.usb.getDevices());
  await tryIt(reached, 'hid.getDevices', () => nav.hid.getDevices());
  await tryIt(reached, 'serial.getPorts', () => nav.serial.getPorts());
  await tryIt(reached, 'gpu.requestAdapter', () => nav.gpu.requestAdapter());
  await tryIt(reached, 'indexedDB.open', () => scope.indexedDB.open('hostile'));

  // Main's permission handlers (B870): the app's session refuses notifications.
  let notifications = 'not asked';
  try {
    notifications = (await nav.permissions.query({ name: 'notifications' })).state;
  } catch (error) {
    notifications = `could not ask: ${error}`;
  }

  // WebAssembly: refused by the CSP (no 'wasm-unsafe-eval').
  let wasm;
  try {
    await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    wasm = 'compiled';
  } catch (error) {
    wasm = `refused: ${error?.message ?? error}`;
  }

  // import(): the app's own files are not refused by the CSP ('self'; recorded as accepted),
  // another origin is. A refusal shows as a CSP report; the files are not run (index.html
  // is not a script).
  const blocked = [];
  scope.addEventListener('securitypolicyviolation', (event) => blocked.push(event.blockedURI));
  const base = scope.location.href.replace(/^blob:/, '');
  const appFile = new URL('/index.html', base).href;
  const otherFile = 'https://example.com/hostile.js';
  await import(appFile).catch(() => undefined);
  await import(otherFile).catch(() => undefined);
  await new Promise((resolve) => scope.setTimeout(resolve, 300));
  const appImport = refusedByCsp(blocked, appFile)
    ? 'refused by the CSP'
    : 'not refused by the CSP';
  const otherImport = refusedByCsp(blocked, otherFile)
    ? 'refused by the CSP'
    : 'not refused by the CSP';

  return { reached, notifications, wasm, appImport, otherImport };
}

defineMsmPlugin({
  id: 'hostile.probe',
  apiVersion: '^1.0.0',
  contributes: {
    exporters: [
      {
        id: 'hostile-report',
        displayName: 'Hostile probe report',
        layers: ['datapack'],
        options: [
          {
            id: 'all',
            label: 'Try everything',
            description: 'Every probe runs either way.',
            type: 'boolean',
            default: true,
          },
        ],
        async run({ sink }) {
          const report = await probe();
          await sink.writeFile(
            'hostile-report.json',
            new TextEncoder().encode(`${JSON.stringify(report, null, 2)}\n`),
          );
        },
      },
    ],
  },
});
