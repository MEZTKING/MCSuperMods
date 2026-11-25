/**
 * What a sandboxed worker may not reach (ADR 0035 D1, B870): the one list and the one function
 * both of the app's code-running workers use before any outside code runs, the third-party
 * plugin worker (`worker-bootstrap.ts`) and Try it's script worker (`tryit/script-worker.ts`),
 * which runs scripts from mods people download.
 *
 * The network boundary is the document's CSP, which a `blob:` worker inherits (B150): it
 * refuses `fetch`, `import()` of `https:`, `data:`, `blob:` and `file:` URLs, `eval`, `new
 * Function` and WebAssembly (no `'wasm-unsafe-eval'`). Removing the network globals as well is
 * defence in depth. The CSP does not govern storage, locks, notifications or devices, so for
 * those the removals are the boundary; B840's spike (S7) found these still open before B870:
 *
 * - `navigator.storageBuckets` (persistent IndexedDB and files shared by every plugin and the
 *   Try it script worker, which all have the app's origin),
 * - `navigator.locks` (Web Locks shared with the app's origin: a channel between plugins),
 * - `Notification` (desktop notifications in the app's name; main now also refuses the
 *   permission, `main/permissions.ts`),
 * - `navigator.usb`, `hid`, `serial` and `gpu` (devices and the GPU process; main refuses
 *   device permissions too).
 *
 * Left open on purpose (recorded for ADR 0137): `import()` of the app's own `msm-app://app/`
 * files (CSP `'self'`; the app's public bundle, no DOM or bridge in a worker, as B154 found),
 * `OffscreenCanvas`, `crypto.subtle`, `FontFace` with `local()` and the fingerprint-only
 * `navigator` fields. Timers are left to plugins (an idle heartbeat is B842's) but removed from
 * Try it's script worker.
 *
 * @packageDocumentation
 */

/** The worker globals removed before outside code runs (network, storage, workers, notices). */
export const WORKER_STRIPPED_GLOBALS = [
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
] as const;

/** The `navigator` members removed before outside code runs (storage, locks, devices, GPU). */
export const WORKER_STRIPPED_NAVIGATOR = [
  'storage',
  'storageBuckets',
  'locks',
  'usb',
  'hid',
  'serial',
  'gpu',
] as const;

/**
 * Removes `globalNames` from the worker's global scope and `navigatorNames` from its
 * `navigator`, along the whole prototype chain (a getter on `WorkerNavigator.prototype` is
 * deleted, not only hidden), then pins each name to `undefined` on the object itself so that
 * nothing can put it back.
 *
 * Self-contained: it is serialised with `Function.prototype.toString` into each worker's one
 * script, so it may reference nothing outside its own body.
 *
 * @param globalNames - The global names to remove.
 * @param navigatorNames - The `navigator` member names to remove.
 */
export function lockDownWorkerScope(
  globalNames: readonly string[],
  navigatorNames: readonly string[],
): void {
  type Obj = Record<string, unknown>;
  const scope = globalThis as unknown as Obj & { navigator?: Obj };
  const remove = (target: Obj | undefined, name: string): void => {
    if (target === undefined || target === null) return;
    let object: Obj | null = target;
    while (object !== null) {
      try {
        delete object[name];
      } catch {
        // Not configurable: shadowed below.
      }
      object = Object.getPrototypeOf(object) as Obj | null;
    }
    try {
      Object.defineProperty(target, name, {
        value: undefined,
        configurable: false,
        writable: false,
      });
    } catch {
      // Already not configurable on the object itself.
    }
  };
  // `navigator` first: it is read through the global, which stays.
  const nav = scope.navigator;
  for (const name of navigatorNames) remove(nav, name);
  for (const name of globalNames) remove(scope, name);
}
