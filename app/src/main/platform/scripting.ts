/**
 * The scripting service (ADRs 0031 D2 and D5): transpiles and checks `msm:script` sources with
 * TypeScript in the main process. The engine (`scripting-engine.ts`, which bundles
 * `typescript` and the curated lib files) is loaded with `import()` on first use, so it is a
 * separate main chunk, as the updater and the mcfunction service are. A failed load is not
 * memoised; the next call retries.
 *
 * Results are memoised per script name and source hash (and typings hash for `check`) in a
 * small LRU, so the debounced validation pass and the export gate do not recompile unchanged
 * scripts.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import type {
  PlatformAdapter,
  ScriptDiagnostic,
  ScriptTranspileOutcome,
} from '../../shared/platform';
import type { ScriptingEngine } from './scripting-engine';

/** The service's public face: the adapter's `scripting` service. */
export type ScriptingService = PlatformAdapter['scripting'];

/** How many results each memo keeps. */
export const SCRIPTING_MEMO_SIZE = 64;

/** What the service needs from its host. */
export interface ScriptingServiceDeps {
  /** Loads the engine. Defaults to `import('./scripting-engine')`. */
  load?(): Promise<{ createScriptingEngine(): ScriptingEngine }>;
  /** Entries per memo (default {@link SCRIPTING_MEMO_SIZE}). */
  memoSize?: number;
}

/** A least-recently-used map with a fixed capacity. */
export class LruMemo<V> {
  readonly #entries = new Map<string, V>();
  readonly #capacity: number;

  constructor(capacity: number) {
    this.#capacity = Math.max(1, capacity);
  }

  get size(): number {
    return this.#entries.size;
  }

  get(key: string): V | undefined {
    const value = this.#entries.get(key);
    if (value === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    while (this.#entries.size > this.#capacity) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }
}

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Creates the service. */
export function createScriptingService(deps: ScriptingServiceDeps = {}): ScriptingService {
  const load = deps.load ?? (() => import('./scripting-engine'));
  const size = deps.memoSize ?? SCRIPTING_MEMO_SIZE;
  const transpiled = new LruMemo<ScriptTranspileOutcome>(size);
  const checked = new LruMemo<ScriptDiagnostic[]>(size);
  // The typings rarely change: hash each distinct text once.
  let typingsHash: { text: string; hash: string } | null = null;
  let engine: Promise<ScriptingEngine> | null = null;

  const engineFor = (): Promise<ScriptingEngine> => {
    if (engine === null) {
      const next = load().then((module) => module.createScriptingEngine());
      engine = next;
      next.catch(() => {
        if (engine === next) engine = null;
      });
    }
    return engine;
  };

  const withEngine = async <T>(run: (engine: ScriptingEngine) => T): Promise<T> => {
    let loaded: ScriptingEngine;
    try {
      loaded = await engineFor();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`The TypeScript service could not start: ${reason}`);
    }
    return run(loaded);
  };

  return {
    async transpile(source, name) {
      const key = `${name}\u0000${hash(source)}`;
      const memo = transpiled.get(key);
      if (memo !== undefined) return structuredClone(memo);
      const result = await withEngine((loaded) => loaded.transpile(source, name));
      transpiled.set(key, result);
      return structuredClone(result);
    },

    async check(source, name, typings) {
      if (typingsHash === null || typingsHash.text !== typings) {
        typingsHash = { text: typings, hash: hash(typings) };
      }
      const key = `${name}\u0000${hash(source)}\u0000${typingsHash.hash}`;
      const memo = checked.get(key);
      if (memo !== undefined) return structuredClone(memo);
      const result = await withEngine((loaded) => loaded.check(source, name, typings));
      checked.set(key, result);
      return structuredClone(result);
    },
  };
}
