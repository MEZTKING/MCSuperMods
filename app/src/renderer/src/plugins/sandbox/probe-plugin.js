// Probe bundle for B150 (ADR 0035 D1): plain ES2020, no imports. Each probe tries one thing the
// sandbox must refuse and records what happened. `spin` never returns.

const describe = (error) =>
  error instanceof Error || (error && typeof error.name === 'string')
    ? `${error.name}: ${error.message}`
    : String(error);

const settleWithin = (promise, ms) =>
  Promise.race([
    promise.then(
      (value) => ({ outcome: 'resolved', detail: String(value) }),
      (error) => ({ outcome: 'rejected', detail: describe(error) }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ outcome: 'pending', detail: `no answer in ${ms} ms` }), ms)),
  ]);

async function probe(name, run) {
  try {
    const result = await run();
    return { name, ...result };
  } catch (error) {
    return { name, outcome: 'threw', detail: describe(error) };
  }
}

const valueOf = (value) =>
  value === undefined ? { outcome: 'undefined', detail: 'undefined' } : { outcome: 'value', detail: typeof value };

function socket(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve) => {
    ws.onopen = () => resolve({ outcome: 'resolved', detail: 'open' });
    ws.onerror = () => resolve({ outcome: 'rejected', detail: 'error event (no exception)' });
    setTimeout(() => resolve({ outcome: 'pending', detail: 'no event in 3000 ms' }), 3000);
  });
}

function xhr(url) {
  const request = new XMLHttpRequest();
  request.open('GET', url, false);
  request.send();
  return { outcome: 'resolved', detail: `status ${request.status}` };
}

function source(url) {
  const events = new EventSource(url);
  return new Promise((resolve) => {
    events.onopen = () => resolve({ outcome: 'resolved', detail: 'open' });
    events.onerror = () => {
      events.close();
      resolve({ outcome: 'rejected', detail: 'error event (no exception)' });
    };
    setTimeout(() => resolve({ outcome: 'pending', detail: 'no event in 3000 ms' }), 3000);
  });
}

const blobUrl = () =>
  URL.createObjectURL(new Blob(['self.__msmProbeLoaded = true;'], { type: 'text/javascript' }));

defineMsmPlugin({
  id: 'spike.probes',
  apiVersion: '^1.0.0',
  contributes: {},
  async probes(options) {
    const documentUrl = options && typeof options.documentUrl === 'string' ? options.documentUrl : '';
    const results = [
      await probe('typeof fetch', () => ({ outcome: 'value', detail: typeof fetch })),
      await probe("fetch('https://example.com')", () => settleWithin(fetch('https://example.com'), 3000)),
      await probe("fetch('file:///etc/hostname')", () => settleWithin(fetch('file:///etc/hostname'), 3000)),
      await probe('fetch(document URL)', () => settleWithin(fetch(documentUrl), 3000)),
      await probe("new WebSocket('wss://example.com')", () => socket('wss://example.com')),
      await probe("XMLHttpRequest('https://example.com')", () => xhr('https://example.com')),
      await probe("EventSource('https://example.com')", () => source('https://example.com')),
      await probe('importScripts(blobUrl)', () => {
        importScripts(blobUrl());
        return { outcome: 'resolved', detail: `loaded=${self.__msmProbeLoaded === true}` };
      }),
      await probe('import(blobUrl)', () => settleWithin(import(blobUrl()), 3000)),
      await probe("eval('1')", () => ({ outcome: 'resolved', detail: String((0, eval)('1')) })),
      await probe("new Function('return 1')", () => ({
        outcome: 'resolved',
        detail: String(new Function('return 1')()),
      })),
      await probe('indexedDB', () => valueOf(self.indexedDB)),
      await probe("indexedDB.open('x')", () => {
        const request = self.indexedDB.open('msm-probe');
        return new Promise((resolve) => {
          request.onsuccess = () => resolve({ outcome: 'resolved', detail: 'opened' });
          request.onerror = () => resolve({ outcome: 'rejected', detail: String(request.error) });
          setTimeout(() => resolve({ outcome: 'pending', detail: 'no event' }), 3000);
        });
      }),
      await probe('caches', () => valueOf(self.caches)),
      await probe('navigator.storage', () => valueOf(self.navigator.storage)),
      await probe('self.msm', () => valueOf(self.msm)),
      await probe('window', () => valueOf(typeof window === 'undefined' ? undefined : window)),
      await probe('document', () => valueOf(typeof document === 'undefined' ? undefined : document)),
      await probe('require', () => valueOf(typeof require === 'undefined' ? undefined : require)),
      await probe('process', () => valueOf(typeof process === 'undefined' ? undefined : process)),
      await probe('location.href', () => ({ outcome: 'value', detail: String(self.location.href) })),
      await probe('origin', () => ({ outcome: 'value', detail: String(self.origin) })),
    ];
    return results;
  },
  spin() {
    for (;;) {
      // Never returns: the host must terminate the worker.
    }
  },
});
