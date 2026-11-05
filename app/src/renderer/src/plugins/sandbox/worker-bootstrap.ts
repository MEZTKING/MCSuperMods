/**
 * The worker bootstrap (ADR 0035 D1, D3). Spike quality (B150); B154 replaces it.
 *
 * {@link workerBootstrap} is serialised with `Function.prototype.toString` and concatenated in
 * front of the plugin bundle in one `Blob`, so it must be self-contained: it may reference
 * nothing outside its own body (type imports are erased). The plugin bundle then calls
 * `defineMsmPlugin(plugin)` once at its top level.
 *
 * @packageDocumentation
 */

import type { SandboxRequest } from './protocol';

/** The globals the bootstrap removes from the worker scope when `strip` is set (defence in depth). */
export const STRIPPED_GLOBALS = [
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
] as const;

/**
 * Runs first inside the worker. Captures `postMessage` and the message listener, optionally
 * removes network and storage globals, installs `defineMsmPlugin`, and answers requests.
 *
 * @param strip - Whether to remove {@link STRIPPED_GLOBALS} and `navigator.storage`.
 * @param stripped - The names to remove (passed in because the function cannot see the module).
 */
export function workerBootstrap(strip: boolean, stripped: readonly string[]): void {
  type Fn = (...args: unknown[]) => unknown;
  type Obj = Record<string, unknown>;
  interface Scope {
    postMessage(message: unknown): void;
    addEventListener(type: string, listener: (event: { data: unknown }) => void): void;
    navigator?: Obj;
    defineMsmPlugin?: (plugin: unknown) => void;
  }
  const scope = globalThis as unknown as Scope & Obj;
  const post = scope.postMessage.bind(scope);
  const listen = scope.addEventListener.bind(scope);

  const remove = (target: Obj | undefined, name: string): void => {
    if (target === undefined || target === null) return;
    let object: Obj | null = target;
    while (object !== null) {
      try {
        delete object[name];
      } catch {
        // Non-configurable: shadowed below.
      }
      object = Object.getPrototypeOf(object) as Obj | null;
    }
    try {
      Object.defineProperty(target, name, { value: undefined, configurable: false, writable: false });
    } catch {
      // Already non-configurable on the object itself.
    }
  };
  if (strip) {
    for (const name of stripped) remove(scope, name);
    remove(scope.navigator, 'storage');
  }

  const isUint8Array = (value: unknown): boolean =>
    ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]';
  /** Whether `value` is JSON or `Uint8Array` all the way down (ADR 0035 D3). */
  const cloneable = (value: unknown, depth: number): boolean => {
    if (depth > 200) return false;
    if (value === null) return true;
    switch (typeof value) {
      case 'string':
      case 'boolean':
        return true;
      case 'number':
        return Number.isFinite(value);
      case 'object': {
        if (isUint8Array(value)) return true;
        if (Array.isArray(value)) return value.every((item) => cloneable(item, depth + 1));
        const proto = Object.getPrototypeOf(value) as unknown;
        if (proto !== Object.prototype && proto !== null) return false;
        return Object.values(value as Obj).every((item) => cloneable(item, depth + 1));
      }
      default:
        return false;
    }
  };
  /** A deep copy without functions (the data fields of a contribution). */
  const dataOnly = (value: unknown, depth: number): unknown => {
    if (depth > 50 || typeof value === 'function') return undefined;
    if (value === null || typeof value !== 'object') return value;
    if (isUint8Array(value)) return value;
    if (Array.isArray(value)) return value.map((item) => dataOnly(item, depth + 1));
    const out: Obj = {};
    for (const [key, item] of Object.entries(value as Obj)) {
      if (typeof item !== 'function') out[key] = dataOnly(item, depth + 1);
    }
    return out;
  };

  let plugin: Obj | null = null;
  const registries = new Map<string, Map<string, Set<string>>>();

  const contribution = (point: string, id: unknown): Obj => {
    const list = (plugin?.contributes as Obj | undefined)?.[point];
    const found = Array.isArray(list)
      ? (list as Obj[]).find((entry) => entry !== null && entry.id === id)
      : undefined;
    if (found === undefined) throw new Error(`No ${point} entry with id ${String(id)}.`);
    return found;
  };
  const invoke = (target: Obj, name: string, args: unknown[]): unknown => {
    const fn = target[name];
    if (typeof fn !== 'function') throw new Error(`Contribution has no function ${name}.`);
    return (fn as Fn).apply(target, args);
  };

  const handle = async (request: SandboxRequest): Promise<unknown> => {
    const [first, second, third, fourth] = request.args;
    switch (request.method) {
      case 'lower':
        return invoke(contribution('elementKinds', first), 'lower', [second, third]);
      case 'data':
        return invoke(contribution('elementTemplates', first), 'data', [second]);
      case 'build': {
        let entry: Obj;
        try {
          entry = contribution('projectStarters', first);
        } catch {
          entry = contribution('examples', first);
        }
        return invoke(entry, 'build', [second]);
      }
      case 'validate': {
        const key = String(third);
        if (fourth !== undefined && fourth !== null) {
          const map = new Map<string, Set<string>>();
          for (const [name, ids] of Object.entries(fourth as Record<string, string[]>)) {
            map.set(name, new Set(ids));
          }
          registries.set(key, map);
        }
        const snapshot = registries.get(key);
        if (snapshot === undefined) throw new Error(`Unknown registry snapshot ${key}.`);
        const registry = {
          has: (name: string, id: string): boolean => snapshot.get(name)?.has(id) ?? false,
          ids: (name: string): readonly string[] => [...(snapshot.get(name) ?? [])],
        };
        const input = { ...(second as Obj), registry };
        return invoke(contribution('validators', first), 'validate', [input]);
      }
      case 'run': {
        const sink = {
          writeFile: async (path: string, contents: Uint8Array): Promise<void> => {
            post({ type: 'callback', id: request.id, op: 'writeFile', args: [path, contents] });
          },
        };
        const problems = {
          report: (problem: unknown): void => {
            post({ type: 'callback', id: request.id, op: 'report', args: [problem] });
          },
        };
        const input = { ...(second as Obj), sink, problems };
        await invoke(contribution('exporters', first), 'run', [input]);
        return null;
      }
      case 'import':
        return invoke(contribution('importers', first), 'import', [second, third]);
      case 'call':
        if (plugin === null) throw new Error('No plugin registered.');
        return invoke(plugin, String(first), request.args.slice(1));
      default:
        throw new Error(`Unknown method ${String(request.method)}.`);
    }
  };

  listen('message', (event) => {
    const request = event.data as SandboxRequest;
    if (request === null || typeof request !== 'object' || request.type !== 'request') return;
    void (async () => {
      try {
        const value = await handle(request);
        if (!cloneable(value === undefined ? null : value, 0)) {
          post({
            type: 'response',
            id: request.id,
            ok: false,
            code: 'plugin.bad-result',
            message: `${request.method} returned something other than JSON or Uint8Array.`,
          });
          return;
        }
        post({ type: 'response', id: request.id, ok: true, value: value ?? null });
      } catch (error) {
        post({
          type: 'response',
          id: request.id,
          ok: false,
          code: 'plugin.crashed',
          message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
      }
    })();
  });

  let registered = false;
  scope.defineMsmPlugin = (candidate: unknown): void => {
    if (registered) throw new Error('defineMsmPlugin may be called once.');
    registered = true;
    plugin = candidate as Obj;
  };

  // Microtasks run once the whole classic script (bootstrap plus plugin) has been evaluated.
  void Promise.resolve().then(() => {
    delete scope.defineMsmPlugin;
    if (plugin === null) {
      post({ type: 'fatal', code: 'plugin.crashed', message: 'The bundle never called defineMsmPlugin.' });
      return;
    }
    const contributes: Record<string, { data: unknown; functions: string[] }[]> = {};
    for (const [point, list] of Object.entries((plugin.contributes as Obj | undefined) ?? {})) {
      if (!Array.isArray(list)) continue;
      contributes[point] = (list as Obj[]).map((entry) => ({
        data: dataOnly(entry, 0),
        functions: Object.keys(entry).filter((key) => typeof entry[key] === 'function'),
      }));
    }
    post({
      type: 'ready',
      description: { id: String(plugin.id), apiVersion: String(plugin.apiVersion), contributes },
    });
  });
}

/**
 * The bootstrap's source text, ready to be followed by a plugin bundle.
 *
 * @param strip - Whether the bootstrap removes network and storage globals.
 */
export function bootstrapSource(strip: boolean): string {
  return `(${workerBootstrap.toString()})(${JSON.stringify(strip)}, ${JSON.stringify(STRIPPED_GLOBALS)});\n`;
}
