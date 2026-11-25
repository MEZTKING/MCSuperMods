/**
 * Probes for what a sandboxed worker can still reach (B870, B840's S7), shared by the plugin
 * sandbox test and Try it's script worker test: `node:vm` stand-ins shaped like a Chromium
 * dedicated worker, and a probe script that lists what is left. The real workers are checked
 * by the hostile plugin in e2e `plugins-path`.
 */
/**
 * Globals shaped like a Chromium dedicated worker's for B840's S7 list (B870): a `navigator`
 * whose storage, storage bucket, lock, device and GPU members are getters on its prototype
 * (as on `WorkerNavigator.prototype`), plus `Notification`, `StorageBucketManager` and
 * `LockManager`. `userAgent` stands for the members that stay.
 */
export function workerLikeGlobals(navigatorNames: readonly string[]): Record<string, unknown> {
  class FakeWorkerNavigator {}
  for (const name of [...navigatorNames, 'userAgent']) {
    Object.defineProperty(FakeWorkerNavigator.prototype, name, {
      get: () => ({ reached: name }),
      configurable: true,
      enumerable: true,
    });
  }
  return {
    navigator: new FakeWorkerNavigator(),
    Notification: class Notification {},
    StorageBucketManager: class StorageBucketManager {},
    LockManager: class LockManager {},
  };
}

/**
 * Script text that reports, as a JSON array, every name of `globals` and `navigator.<name>`
 * of `navigatorNames` still reachable: by plain lookup, by the prototype's getter, or after
 * trying to define it again.
 */
export function reachableProbe(
  globals: readonly string[],
  navigatorNames: readonly string[],
): string {
  return `(function () {
  var reached = [];
  var g = ${JSON.stringify(globals)};
  var n = ${JSON.stringify(navigatorNames)};
  for (var i = 0; i < g.length; i++) if (typeof globalThis[g[i]] !== 'undefined') reached.push(g[i]);
  var nav = globalThis.navigator;
  for (var j = 0; j < n.length; j++) {
    var name = n[j];
    if (typeof nav[name] !== 'undefined') { reached.push('navigator.' + name); continue; }
    var proto = Object.getPrototypeOf(nav);
    while (proto !== null) {
      var d = Object.getOwnPropertyDescriptor(proto, name);
      if (d !== undefined) { reached.push('navigator.' + name + ' (prototype)'); break; }
      proto = Object.getPrototypeOf(proto);
    }
    try { Object.defineProperty(nav, name, { value: 1 }); } catch (e) {}
    try { nav[name] = 1; } catch (e) {}
    if (typeof nav[name] !== 'undefined') reached.push('navigator.' + name + ' (defined again)');
  }
  return reached;
})()`;
}
