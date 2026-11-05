/**
 * The worker bootstrap (ADR 0035 D1, D3).
 *
 * {@link workerBootstrap} is serialised with `Function.prototype.toString` (B150: survives the
 * minified build and needs no request) and concatenated in front of the plugin bundle in one
 * `Blob`, so it must be self-contained: it may reference nothing outside its own body (type
 * imports are erased). The plugin bundle then calls `defineMsmPlugin(plugin)` once at its top
 * level.
 *
 * The network boundary is the document's CSP, which a `blob:` worker inherits (B150); the
 * bootstrap also removes network globals (defence in depth) and the storage globals, which the
 * CSP does not govern (`indexedDB`, `caches`, `navigator.storage`).
 *
 * @packageDocumentation
 */

import type { SandboxRequest } from './protocol';

/** The globals the bootstrap removes from the worker scope before the plugin runs. */
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

/** How many registry snapshots a worker keeps (the host resends an evicted one). */
export const REGISTRY_SNAPSHOTS_KEPT = 4;

/**
 * Runs first inside the worker. Captures `postMessage` and the message listener, removes
 * network and storage globals, installs `defineMsmPlugin`, and answers requests.
 *
 * A function that throws answers its request with `plugin.crashed` and leaves the worker
 * running; a result that is not JSON or `Uint8Array` answers with `plugin.bad-result`.
 *
 * @param stripped - The global names to remove (passed in: the function cannot see the module).
 * @param keep - How many registry snapshots to keep.
 */
export function workerBootstrap(stripped: readonly string[], keep: number): void {
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
      Object.defineProperty(target, name, {
        value: undefined,
        configurable: false,
        writable: false,
      });
    } catch {
      // Already non-configurable on the object itself.
    }
  };
  for (const name of stripped) remove(scope, name);
  remove(scope.navigator, 'storage');
  // Only the bootstrap answers the host: the plugin cannot post messages of its own.
  remove(scope, 'postMessage');

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
        return Object.values(value as Obj).every(
          (item) => item === undefined || cloneable(item, depth + 1),
        );
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
      if (typeof item !== 'function' && item !== undefined) out[key] = dataOnly(item, depth + 1);
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

  /** `x` reads as `minecraft:x`; a registry name may carry `minecraft:`. */
  const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);
  const registryName = (name: string): string =>
    name.startsWith('minecraft:') ? name.slice('minecraft:'.length) : name;
  const registryView = (snapshot: Map<string, Set<string>>) => ({
    has(name: string, id: string): boolean {
      const registry = registryName(String(name));
      const value = String(id);
      if (value.startsWith('#')) {
        const tags = snapshot.get(`tag/${registry}`);
        return tags === undefined ? true : tags.has(namespaced(value.slice(1)));
      }
      return snapshot.get(registry)?.has(namespaced(value)) ?? false;
    },
    ids(name: string): readonly string[] {
      return [...(snapshot.get(registryName(String(name))) ?? [])];
    },
  });

  const handle = async (request: SandboxRequest): Promise<unknown> => {
    const args = request.args;
    switch (request.method) {
      case 'lower':
        return invoke(contribution('elementKinds', args[0]), 'lower', [args[1], args[2]]);
      case 'data':
        return invoke(contribution('elementTemplates', args[0]), 'data', [args[1]]);
      case 'build': {
        const point = args[0] === 'examples' ? 'examples' : 'projectStarters';
        return invoke(contribution(point, args[1]), 'build', [args[2]]);
      }
      case 'validate': {
        const key = String(args[2]);
        const sent = args[3];
        if (sent !== undefined && sent !== null) {
          const map = new Map<string, Set<string>>();
          for (const [name, ids] of Object.entries(sent as Record<string, string[]>)) {
            map.set(name, new Set(ids));
          }
          registries.delete(key);
          registries.set(key, map);
          while (registries.size > keep) {
            const oldest = registries.keys().next().value;
            if (oldest === undefined) break;
            registries.delete(oldest);
          }
        }
        const snapshot = registries.get(key);
        if (snapshot === undefined) throw new Error(`Unknown registry snapshot ${key}.`);
        const input = { ...(args[1] as Obj), registry: registryView(snapshot) };
        return invoke(contribution('validators', args[0]), 'validate', [input]);
      }
      case 'run': {
        const sink = {
          writeFile: async (path: unknown, contents: unknown): Promise<void> => {
            post({ type: 'callback', id: request.id, op: 'writeFile', args: [path, contents] });
          },
        };
        const problems = {
          report: (problem: unknown): void => {
            post({
              type: 'callback',
              id: request.id,
              op: 'report',
              args: [cloneable(problem, 0) ? problem : null],
            });
          },
        };
        const input = { ...(args[1] as Obj), sink, problems };
        await invoke(contribution('exporters', args[0]), 'run', [input]);
        return null;
      }
      case 'import':
        return invoke(contribution('importers', args[0]), 'import', [args[1], args[2]]);
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
        let message: string;
        try {
          message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        } catch {
          message = 'The plugin threw a value that cannot be shown.';
        }
        post({
          type: 'response',
          id: request.id,
          ok: false,
          code: 'plugin.crashed',
          message: message.slice(0, 2000),
        });
      }
    })();
  });

  let registered = false;
  scope.defineMsmPlugin = (candidate: unknown): void => {
    if (registered) throw new Error('defineMsmPlugin may be called once.');
    registered = true;
    plugin = typeof candidate === 'object' && candidate !== null ? (candidate as Obj) : null;
  };

  // Microtasks run once the whole classic script (bootstrap plus plugin) has been evaluated.
  void Promise.resolve().then(() => {
    delete scope.defineMsmPlugin;
    if (plugin === null) {
      post({
        type: 'fatal',
        code: 'plugin.crashed',
        message: 'The bundle never called defineMsmPlugin with a plugin object.',
      });
      return;
    }
    const contributes: Record<string, { data: unknown; functions: string[] }[]> = {};
    const raw = plugin.contributes;
    for (const [point, list] of Object.entries(
      typeof raw === 'object' && raw !== null ? (raw as Obj) : {},
    )) {
      if (!Array.isArray(list)) continue;
      contributes[point] = (list as unknown[])
        .filter((entry): entry is Obj => typeof entry === 'object' && entry !== null)
        .map((entry) => ({
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

/** The bootstrap's source text, ready to be followed by a plugin bundle. */
export function bootstrapSource(): string {
  return `(${workerBootstrap.toString()})(${JSON.stringify(STRIPPED_GLOBALS)}, ${REGISTRY_SNAPSHOTS_KEPT});\n`;
}
