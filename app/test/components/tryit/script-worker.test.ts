/**
 * Try it's script worker (B400): the worker's script runs as a classic worker would run it (here
 * in a `node:vm` context standing for the worker's global scope, with no `eval` needed), its
 * globals are stripped, a call over the budget stops the worker and answers `timedOut`, and a
 * Try it area loads the project's scripts through a transpiler and reports an endless loop in
 * "What happened".
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import type { OutputFile } from '@msm/plugin-api';
import { SCRIPT_API } from '@msm/plugin-scripting';
import type { ScriptResponse, ScriptRunner, ScriptRuntimeInit } from '@msm/sim';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerLike } from '../../../src/renderer/src/plugins/sandbox/host';
import {
  createWorkerRunner,
  SCRIPT_BUDGET_MS,
  SCRIPT_WORKER_STRIPPED,
  scriptWorkerSource,
} from '../../../src/renderer/src/tryit/script-worker';
import {
  type TranspileOutcome,
  TryItArea,
  toSimFiles,
} from '../../../src/renderer/src/tryit/session-source';
import { demoOutputs, NS, TARGET } from './tryit-fixture';

/** TypeScript to ES5 as main's scripting engine does (ADR 0031 D2). */
function transpile(source: string): TranspileOutcome {
  const out = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      downlevelIteration: true,
      ignoreDeprecations: '6.0',
      alwaysStrict: true,
    },
  });
  const errors = (out.diagnostics ?? []).filter(
    (one) => one.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0)
    return { problems: [{ message: String(errors[0]?.messageText), line: 1 }] };
  return { js: out.outputText };
}

/**
 * A worker double: the script runs in a fresh `vm` context with a worker's message functions and
 * timers. Messages go through `structuredClone`, as `postMessage` copies them.
 */
function vmWorker(source: string): WorkerLike & { context: Record<string, unknown> } {
  const toWorker: ((event: { data: unknown }) => void)[] = [];
  const toHost: ((event: { data: unknown }) => void)[] = [];
  const context: Record<string, unknown> = {
    postMessage: (data: unknown) => {
      const copy = structuredClone(data);
      queueMicrotask(() => {
        for (const listener of toHost) listener({ data: copy });
      });
    },
    addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
      if (type === 'message') toWorker.push(listener);
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: () => Promise.reject(new Error('no network')),
    XMLHttpRequest: class {},
    importScripts: () => undefined,
    navigator: { storage: {} },
  };
  context.globalThis = context;
  createContext(context);
  runInContext(source, context);
  return {
    context,
    postMessage(message) {
      const copy = structuredClone(message);
      queueMicrotask(() => {
        for (const listener of toWorker) listener({ data: copy });
      });
    },
    addEventListener(type: 'message' | 'error', listener: (event: never) => void) {
      if (type === 'message') toHost.push(listener as (event: { data: unknown }) => void);
    },
    terminate() {
      toWorker.length = 0;
      toHost.length = 0;
    },
  };
}

const init = (scripts: string[]): ScriptRuntimeInit => ({
  api: SCRIPT_API,
  version: '1.5.1',
  scripts: scripts.map((id) => ({ id })),
  stores: {},
  sync: {
    tick: 0,
    player: { name: 'Player', pos: [1.5, 0, 1.5], sneaking: false, items: [] },
    mobs: [],
    full: { size: [2, 2, 2], palette: ['minecraft:air'], cells: new Array(8).fill(0) },
  },
});

const script = (id: string, source: string) => {
  const outcome = transpile(source);
  if (!('js' in outcome)) throw new Error('does not transpile');
  return { id, path: `msm/t/script/${id.slice(2)}.ts`, js: outcome.js };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('the worker script', () => {
  it('wraps each script and ends with the shim and the worker main, and needs no eval', () => {
    const source = scriptWorkerSource([script('t:a', 'msm.log.info("a") // ends in a comment')]);
    expect(source).toContain('__msmScripts["t:a"] = function (exports, require, module, msm) {');
    expect(source).toContain('function createScriptRuntime(');
    expect(source).not.toMatch(/\beval\(|new Function\(/);
    // It parses as one classic script.
    expect(() => new Function(source)).not.toThrow();
  });

  it('strips the network, storage and timer globals before any script runs', () => {
    const worker = vmWorker(scriptWorkerSource([]));
    for (const name of SCRIPT_WORKER_STRIPPED) {
      if (name in worker.context) expect(worker.context[name], name).toBeUndefined();
    }
    expect(worker.context.postMessage).toBeUndefined();
    expect((worker.context.navigator as { storage?: unknown }).storage).toBeUndefined();
  });

  it('runs scripts against the shim and answers after their Promise callbacks', async () => {
    const runner = createWorkerRunner({ spawn: vmWorker });
    const loaded = (await runner.start(init(['t:a']), [
      script(
        't:a',
        `import { msm } from "msm:runtime";
msm.events.on("player.chat", (e) => {
  Promise.resolve().then(() => e.player.sendMessage("later: " + e.message));
  e.player.sendMessage("now");
});`,
      ),
    ])) as ScriptResponse;
    expect(loaded.listeners).toEqual({ 'player.chat': ['t:a'] });
    const answer = (await runner.send({
      type: 'event',
      name: 'player.chat',
      data: { player: { $entity: { kind: 'player' } }, message: 'hi' },
      sync: init([]).sync,
    })) as ScriptResponse;
    expect(answer.steps).toEqual([
      { op: 'message', script: 't:a', text: 'now' },
      { op: 'message', script: 't:a', text: 'later: hi' },
    ]);
    runner.dispose();
  });
});

describe('the budget per call', () => {
  it('stops a worker that does not answer in time and answers timedOut', async () => {
    vi.useFakeTimers();
    const spawned: { terminated: boolean }[] = [];
    const silent = (): WorkerLike => {
      const one = { terminated: false };
      spawned.push(one);
      return {
        postMessage() {},
        addEventListener() {},
        terminate() {
          one.terminated = true;
        },
      };
    };
    const runner: ScriptRunner = createWorkerRunner({ spawn: silent });
    const reply = runner.start(init([]), []) as Promise<ScriptResponse>;
    vi.advanceTimersByTime(SCRIPT_BUDGET_MS - 1);
    expect(spawned[0]?.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect((await reply).timedOut).toEqual({ ms: SCRIPT_BUDGET_MS });
    expect(spawned[0]?.terminated).toBe(true);
    // The next start makes a fresh worker.
    const again = runner.start(init([]), []) as Promise<ScriptResponse>;
    again.catch(() => undefined);
    expect(spawned).toHaveLength(2);
    runner.dispose();
  });
});

describe('a Try it area with scripts', () => {
  const withScript = (text: string): OutputFile[] => [
    ...demoOutputs(),
    {
      path: `msm/${NS}/script/spin.ts`,
      contents: new TextEncoder().encode(text),
      layer: 'msm',
    } as OutputFile,
  ];

  it('loads the scripts through the transpiler and fires server.started', async () => {
    const area = new TryItArea({
      files: toSimFiles(
        withScript(`import { msm } from "msm:runtime";
msm.events.on("server.started", () => msm.log.info("started"));`),
      ),
      target: TARGET,
      scripts: {
        transpile: async (source) => transpile(source),
        api: SCRIPT_API,
        runner: () => createWorkerRunner({ spawn: vmWorker }),
      },
    });
    await area.loadScripts();
    await vi.waitFor(() =>
      expect(area.whatHappened.map((entry) => entry.text)).toContain(
        `The script ${NS}:spin logged: started`,
      ),
    );
    area.dispose();
  });

  it('runs a generated Rules script in the worker and names its steps by the rule (B401)', async () => {
    const golden = readFileSync(
      new URL(
        '../../../../packages/plugins/rules/test/fixtures/goldens/trigger-player_joined.ts',
        import.meta.url,
      ),
      'utf8',
    );
    const area = new TryItArea({
      files: toSimFiles([
        ...demoOutputs(),
        {
          path: 'msm/demo/script/rules/rules.ts',
          contents: new TextEncoder().encode(golden),
          layer: 'msm',
        } as OutputFile,
      ]),
      target: TARGET,
      scripts: {
        transpile: async (source) => transpile(source),
        api: SCRIPT_API,
        runner: () => createWorkerRunner({ spawn: vmWorker }),
      },
    });
    await area.loadScripts();
    await vi.waitFor(() =>
      expect(area.whatHappened.map((entry) => entry.text)).toContain(
        'Rule "sample" says to you: "Something happened."',
      ),
    );
    const lines = area.whatHappened.filter((entry) => entry.ruleStep !== undefined);
    expect(lines.map((entry) => [entry.kind, entry.ruleStep, entry.text])).toEqual([
      ['trigger', 'start', 'The script heard player.join, so rule "sample" ran.'],
      ['action', 'did', 'Rule "sample" says to you: "Something happened."'],
    ]);
    expect(lines[0]?.origin).toEqual({
      elementId: 'demo:rules',
      ruleKey: 'sample',
      ruleBook: 'demo:rules',
    });
    area.dispose();
  });

  it('stops an endless loop and says so in "What happened"', async () => {
    const area = new TryItArea({
      files: toSimFiles(
        withScript(`import { msm } from "msm:runtime";
msm.events.on("player.chat", () => { for (;;) {} });`),
      ),
      target: TARGET,
      scripts: {
        transpile: async (source) => transpile(source),
        api: SCRIPT_API,
        // A worker that hangs on chat stands for the endless loop (a vm context cannot be stopped).
        runner: () =>
          createWorkerRunner({
            budgetMs: 50,
            spawn: (source) => {
              const worker = vmWorker(source.replace('for (;;) {}', 'throw "unreachable"'));
              const post = worker.postMessage.bind(worker);
              return {
                ...worker,
                postMessage(message: unknown) {
                  const sent = message as { request?: { name?: string } };
                  if (sent.request?.name === 'player.chat') return;
                  post(message);
                },
              };
            },
          }),
      },
    });
    await area.loadScripts();
    await vi.waitFor(() => expect(area.source.scripts?.loaded).toBe(true));
    area.source.chat('go');
    await vi.waitFor(
      () =>
        expect(area.whatHappened.map((entry) => entry.text)).toContain(
          'The player.chat handlers ran for more than 0.05 seconds (an endless loop?), so the preview stopped the scripts and started them again; their waiting msm.schedule calls were dropped.',
        ),
      { timeout: 2000 },
    );
    const line = area.whatHappened.find((entry) =>
      entry.text.startsWith('The player.chat handlers'),
    );
    expect(line?.kind).toBe('skipped');
    area.dispose();
  });
});
