/**
 * `window.__msmSandboxSpike`: the B150 e2e hook. Installed by `main.tsx` only when the preload
 * reports e2e mode (`MSM_E2E_PROJECT_DIR` set). B154 deletes or replaces it.
 *
 * @packageDocumentation
 */

import { builtInTargets } from '@msm/targets';
import { createPluginWorker, type PluginWorker, SandboxError } from './host';
import probePluginSource from './probe-plugin.js?raw';
import spikePluginSource from './spike-plugin.js?raw';
import bootstrapRaw from './worker-bootstrap.ts?raw';
import bootstrapWorkerUrl from './worker-entry.ts?worker&url';

/** One probe outcome as `probe-plugin.js` reports it. */
export interface ProbeResult {
  name: string;
  outcome: string;
  detail: string;
}

/** Mean and 95th percentile in milliseconds. */
export interface Timing {
  count: number;
  meanMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

function timing(samples: number[]): Timing {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const round = (value: number): number => Math.round(value * 1000) / 1000;
  return {
    count: sorted.length,
    meanMs: round(sum / sorted.length),
    p95Ms: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0),
    minMs: round(sorted[0] ?? 0),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
  };
}

/** The newest target's facts as plain data (no hooks), as a worker receives them. */
function targetFacts(): Record<string, unknown> {
  const target = builtInTargets[builtInTargets.length - 1];
  const {
    migrateFrom: _migrate,
    javaProject: _java,
    ...facts
  } = target as unknown as Record<string, unknown>;
  return JSON.parse(JSON.stringify(facts)) as Record<string, unknown>;
}

function noteElement(text: string): Record<string, unknown> {
  return { formatVersion: 1, id: 'spike:hello', kind: 'spike:note', data: { text }, meta: {} };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof SandboxError ? error.code : String(error);
  }
}

const running: PluginWorker[] = [];

const spike = {
  /** Runs every probe in a fresh worker; `strip: false` leaves only the CSP in place. */
  async runProbes(options: { strip: boolean }): Promise<ProbeResult[]> {
    const worker = createPluginWorker(probePluginSource, { strip: options.strip });
    try {
      await worker.ready;
      return (await worker.call(
        'call',
        [
          'probes',
          { documentUrl: (globalThis as unknown as { location: { href: string } }).location.href },
        ],
        60_000,
      )) as ProbeResult[];
    } finally {
      worker.terminate();
    }
  },

  /** An endless loop in the worker: the host must terminate it at 500 ms and carry on. */
  async endlessLoop(): Promise<{
    code: string;
    elapsedMs: number;
    uiTicks: number;
    stateAfter: string;
    nextWorkerLower: unknown;
  }> {
    const worker = createPluginWorker(probePluginSource);
    await worker.ready;
    let uiTicks = 0;
    const ticker = setInterval(() => {
      uiTicks += 1;
    }, 50);
    const start = performance.now();
    const code = await errorCode(worker.call('call', ['spin'], 500));
    const elapsedMs = Math.round(performance.now() - start);
    clearInterval(ticker);
    const next = createPluginWorker(spikePluginSource);
    await next.ready;
    const nextWorkerLower = await next.call(
      'lower',
      ['spike:note', noteElement('after'), targetFacts()],
      2000,
    );
    next.terminate();
    return { code, elapsedMs, uiTicks, stateAfter: worker.state, nextWorkerLower };
  },

  /** Calls every contribution function of the spike plugin once (ADR 0035 D3). */
  async roundTrip(): Promise<Record<string, unknown>> {
    const target = targetFacts();
    const worker = createPluginWorker(spikePluginSource);
    try {
      const description = await worker.ready;
      const lower = await worker.call('lower', ['spike:note', noteElement('Hi'), target], 2000);
      const data = await worker.call(
        'data',
        [
          'spike-note',
          {
            id: 'demo:note',
            namespace: 'demo',
            path: 'note',
            projectNamespace: 'demo',
            namespaces: ['demo'],
            kindDefault: null,
            target,
          },
        ],
        2000,
      );
      const build = await worker.call(
        'build',
        ['spike-example', { namespace: 'demo', target, values: {} }],
        5000,
      );
      const validate = await worker.call(
        'validate',
        [
          'spike.empty-note',
          { elements: [noteElement('')], target },
          'small',
          { item: ['minecraft:stone', 'minecraft:dirt'] },
        ],
        5000,
      );
      const writes: { path: string; text: string }[] = [];
      const reports: unknown[] = [];
      const run = await worker.call(
        'run',
        [
          'spike.notes',
          {
            projectName: 'Demo',
            target,
            files: [{ path: 'data/demo/note/a.json', layer: 'data', contents: { text: 'a' } }],
            meta: { msmVersion: '0.0.0', plugins: [] },
            options: {},
          },
        ],
        120_000,
        {
          writeFile: (path, contents) =>
            writes.push({ path, text: new TextDecoder().decode(contents) }),
          report: (problem) => reports.push(problem),
        },
      );
      const imported = await worker.call(
        'import',
        ['spike.txt', { name: 'hello.txt', bytes: new TextEncoder().encode('Imported') }, 'demo'],
        30_000,
      );
      const badResult = await errorCode(worker.call('call', ['badResult'], 2000));
      const timeout = await errorCode(worker.call('call', ['neverAnswers'], 300));
      return {
        description,
        lower,
        data,
        build,
        validate,
        run,
        writes,
        reports,
        imported,
        badResult,
        timeout,
        stateAfterTimeout: worker.state,
      };
    } finally {
      worker.terminate();
    }
  },

  /** `count` sequential `lower` round trips with an element of about `bytes` characters. */
  async measureLower(count: number, bytes: number): Promise<Timing & { elementBytes: number }> {
    const target = targetFacts();
    const element = noteElement('x'.repeat(bytes));
    const elementBytes = JSON.stringify(element).length;
    const worker = createPluginWorker(spikePluginSource);
    try {
      await worker.ready;
      for (let i = 0; i < 20; i++)
        await worker.call('lower', ['spike:note', element, target], 2000);
      const samples: number[] = [];
      for (let i = 0; i < count; i++) {
        const start = performance.now();
        await worker.call('lower', ['spike:note', element, target], 2000);
        samples.push(performance.now() - start);
      }
      return { ...timing(samples), elementBytes };
    } finally {
      worker.terminate();
    }
  },

  /** `validate` carrying the full registry snapshot versus a cached key, `repeats` times each. */
  async measureValidate(
    registry: Record<string, string[]>,
    repeats: number,
  ): Promise<{ snapshot: Timing; cached: Timing; snapshotBytes: number; info: unknown }> {
    const target = targetFacts();
    const input = { elements: [noteElement('hello')], target };
    const worker = createPluginWorker(spikePluginSource);
    try {
      await worker.ready;
      const withSnapshot: number[] = [];
      const withKey: number[] = [];
      let info: unknown;
      for (let i = 0; i < repeats; i++) {
        const key = `registry-${i}`;
        let start = performance.now();
        info = await worker.call('validate', ['spike.empty-note', input, key, registry], 5000);
        withSnapshot.push(performance.now() - start);
        start = performance.now();
        await worker.call('validate', ['spike.empty-note', input, key, null], 5000);
        withKey.push(performance.now() - start);
      }
      return {
        snapshot: timing(withSnapshot),
        cached: timing(withKey),
        snapshotBytes: JSON.stringify(registry).length,
        info,
      };
    } finally {
      worker.terminate();
    }
  },

  /** Time from `createPluginWorker` to `ready`, `count` times. */
  async measureStartup(count: number): Promise<Timing> {
    const samples: number[] = [];
    for (let i = 0; i < count; i++) {
      const start = performance.now();
      const worker = createPluginWorker(spikePluginSource);
      await worker.ready;
      samples.push(performance.now() - start);
      worker.terminate();
    }
    return timing(samples);
  },

  /** Starts `count` idle workers and keeps them running (for memory measurements). */
  async startWorkers(count: number): Promise<number> {
    for (let i = 0; i < count; i++) {
      const worker = createPluginWorker(spikePluginSource);
      await worker.ready;
      running.push(worker);
    }
    return running.length;
  },

  /** Terminates the workers of {@link spike.startWorkers}. */
  stopWorkers(): number {
    const count = running.length;
    for (const worker of running.splice(0)) worker.terminate();
    return count;
  },

  /** Which Vite import gives the bootstrap's runnable text under electron-vite. */
  async bootstrapImports(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {
      rawIsTypeScript: /:\s*boolean/.test(bootstrapRaw),
      rawLength: bootstrapRaw.length,
      workerUrl: bootstrapWorkerUrl,
    };
    try {
      const response = await fetch(bootstrapWorkerUrl);
      const text = await response.text();
      result.workerUrlFetch = `ok, ${text.length} characters, status ${response.status}`;
    } catch (error) {
      result.workerUrlFetch = `failed: ${String(error)}`;
    }
    return result;
  },
};

/** The hook's type, for the e2e spec. */
export type SandboxSpike = typeof spike;

/** Installs `window.__msmSandboxSpike`. */
export function installSandboxSpike(): void {
  (globalThis as unknown as { __msmSandboxSpike?: SandboxSpike }).__msmSandboxSpike = spike;
}
