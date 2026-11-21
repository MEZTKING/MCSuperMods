/**
 * Where scripts run (B400): a {@link ScriptRunner} takes the bridge's messages to a
 * {@link createScriptRuntime} and answers with its {@link ScriptResponse}s. The app's runner is a
 * Web Worker with a time budget per call (`app/src/renderer/src/tryit/script-worker.ts`); tests
 * and other hosts without one use {@link inProcessRunner}, which answers at once but cannot stop
 * an endless loop.
 */
import type {
  ScriptModuleFn,
  ScriptRequest,
  ScriptResponse,
  ScriptRuntimeInit,
} from './protocol.js';
import { createScriptRuntime, type ScriptRuntime } from './shim.js';
import type { CompiledScript } from './sources.js';

/** An answer now or later. */
export type RunnerReply = ScriptResponse | Promise<ScriptResponse>;

/** Runs the scripts of one area. */
export interface ScriptRunner {
  /** (Re)starts the runtime with `scripts` and loads them; answers with what loading did. */
  start(init: ScriptRuntimeInit, scripts: readonly CompiledScript[]): RunnerReply;
  /** Sends one request. */
  send(request: ScriptRequest): RunnerReply;
  /** Stops for good. */
  dispose(): void;
}

/** Turns a compiled script into its module function (where `eval` is allowed, as in tests). */
export type ScriptCompiler = (script: CompiledScript) => ScriptModuleFn;

/** A runner in the same thread: the shim runs the modules `compile` makes. */
export function inProcessRunner(compile: ScriptCompiler): ScriptRunner {
  let runtime: ScriptRuntime | null = null;
  const reply = (): ScriptResponse => {
    if (runtime === null) throw new Error('The script runner has not started.');
    return runtime.collect();
  };
  return {
    start(init, scripts) {
      const modules: Record<string, ScriptModuleFn> = {};
      for (const script of scripts) modules[script.id] = compile(script);
      runtime = createScriptRuntime(init, modules);
      runtime.handle({ type: 'load' });
      return reply();
    },
    send(request) {
      runtime?.handle(request);
      return reply();
    },
    dispose() {
      runtime = null;
    },
  };
}
