/**
 * B150 spike: the sandbox host and bootstrap protocol, with a `node:vm` stand-in for the
 * dedicated worker (the real CSP behaviour is covered by `e2e/sandbox-spike.spec.ts`).
 */

import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  createPluginWorker,
  SandboxError,
  type WorkerLike,
} from '../src/renderer/src/plugins/sandbox/host';
import spikePluginSource from '../src/renderer/src/plugins/sandbox/spike-plugin.js?raw';
import { bootstrapSource } from '../src/renderer/src/plugins/sandbox/worker-bootstrap';

type Listener = (event: { data?: unknown; message?: string }) => void;

/** Runs `source` in a fresh `vm` context that looks like a worker scope. */
function vmWorker(globals: Record<string, unknown> = {}): {
  spawn(source: string): WorkerLike;
  terminated(): boolean;
  scope(): Record<string, unknown>;
} {
  let terminated = false;
  let context: Record<string, unknown> = {};
  return {
    terminated: () => terminated,
    scope: () => context,
    spawn(source) {
      const hostListeners: Record<string, Listener[]> = { message: [], error: [] };
      const workerListeners: Listener[] = [];
      const deliver = (listeners: Listener[], data: unknown): void => {
        queueMicrotask(() => {
          if (terminated) return;
          for (const listener of listeners) listener({ data: structuredClone(data) });
        });
      };
      context = createContext({
        TextEncoder,
        TextDecoder,
        setTimeout,
        queueMicrotask,
        navigator: { storage: {} },
        fetch: () => undefined,
        indexedDB: {},
        postMessage: (data: unknown) => deliver(hostListeners.message ?? [], data),
        addEventListener: (type: string, listener: Listener) => {
          if (type === 'message') workerListeners.push(listener);
        },
        ...globals,
      }) as Record<string, unknown>;
      queueMicrotask(() => {
        try {
          runInContext(source, context);
        } catch (error) {
          for (const listener of hostListeners.error ?? []) listener({ message: String(error) });
        }
      });
      return {
        postMessage: (data) => deliver(workerListeners, data),
        addEventListener: (type: string, listener: Listener) => {
          hostListeners[type]?.push(listener);
        },
        terminate: () => {
          terminated = true;
        },
      } as WorkerLike;
    },
  };
}

const target = { id: 'mc-26.3', mcVersion: '26.3', packFormats: { data: 101, resource: 80 } };
const element = { formatVersion: 1, id: 'demo:hello', kind: 'spike:note', data: { text: 'Hi' }, meta: {} };

describe('plugin sandbox host (spike)', () => {
  it('describes the plugin and round-trips every contribution function', async () => {
    const fake = vmWorker();
    const worker = createPluginWorker(spikePluginSource, { spawn: fake.spawn });
    const description = await worker.ready;
    expect(description.id).toBe('spike.plugin');
    expect(description.contributes.elementKinds?.[0]).toEqual({
      data: { id: 'spike:note', label: 'Note', folder: 'note', schema: '::spike::note::Note' },
      functions: ['lower'],
    });
    expect(Object.keys(description.contributes).sort()).toEqual([
      'elementKinds',
      'elementTemplates',
      'examples',
      'exporters',
      'importers',
      'validators',
    ]);

    await expect(worker.call('lower', ['spike:note', element, target], 2000)).resolves.toEqual([
      {
        path: 'data/demo/note/hello.json',
        layer: 'data',
        contents: { text: 'Hi', length: 2, packFormat: 101 },
      },
    ]);
    await expect(
      worker.call('data', ['spike-note', { id: 'demo:n', target }], 2000),
    ).resolves.toEqual({ text: 'Hello from demo:n on mc-26.3' });
    const bundle = (await worker.call('build', ['spike-example', { namespace: 'demo' }], 5000)) as {
      elements: { id: string }[];
    };
    expect(bundle.elements[0]?.id).toBe('demo:hello');

    const problems = await worker.call(
      'validate',
      ['spike.empty-note', { elements: [{ ...element, data: { text: '' } }], target }, 'k1', {
        item: ['minecraft:stone'],
      }],
      5000,
    );
    expect(problems).toEqual([
      expect.objectContaining({ code: 'spike.empty-note', elementId: 'demo:hello' }),
      expect.objectContaining({ code: 'spike.registry', message: 'stone:true items:1' }),
    ]);
    // The cached key alone is enough the second time.
    await expect(
      worker.call('validate', ['spike.empty-note', { elements: [], target }, 'k1', null], 5000),
    ).resolves.toEqual([expect.objectContaining({ message: 'stone:true items:1' })]);
    await expect(
      worker.call('validate', ['spike.empty-note', { elements: [], target }, 'nope', null], 5000),
    ).rejects.toMatchObject({ code: 'plugin.crashed' });

    const writes: string[] = [];
    const reports: unknown[] = [];
    await worker.call(
      'run',
      ['spike.notes', { projectName: 'Demo', files: [{ path: 'a.json' }], target }],
      120_000,
      {
        writeFile: (path, contents) => writes.push(`${path}=${new TextDecoder().decode(contents)}`),
        report: (problem) => reports.push(problem),
      },
    );
    expect(writes).toEqual(['notes.txt=a.json', 'meta/index.json={"project":"Demo","count":1}']);
    expect(reports).toEqual([expect.objectContaining({ code: 'spike.exported' })]);

    const imported = (await worker.call(
      'import',
      ['spike.txt', { name: 'x.txt', bytes: new TextEncoder().encode('Text') }, 'demo'],
      30_000,
    )) as { elements: { id: string; data: unknown }[] };
    expect(imported.elements[0]).toMatchObject({ id: 'demo:x', data: { text: 'Text' } });

    worker.terminate();
    expect(worker.state).toBe('terminated');
  });

  it('refuses a result that is not JSON or bytes', async () => {
    const worker = createPluginWorker(spikePluginSource, { spawn: vmWorker().spawn });
    await worker.ready;
    await expect(worker.call('call', ['badResult'], 2000)).rejects.toMatchObject({
      code: 'plugin.bad-result',
    });
    expect(worker.state).toBe('ready');
    worker.terminate();
  });

  it('terminates the worker on a deadline and fails later calls', async () => {
    const fake = vmWorker();
    const worker = createPluginWorker(spikePluginSource, { spawn: fake.spawn });
    await worker.ready;
    const error = await worker.call('call', ['neverAnswers'], 50).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SandboxError);
    expect((error as SandboxError).code).toBe('plugin.timeout');
    expect(fake.terminated()).toBe(true);
    expect(worker.state).toBe('failed');
    await expect(worker.call('lower', ['spike:note', element, target], 2000)).rejects.toMatchObject({
      code: 'plugin.unavailable',
    });
  });

  it('rejects sink paths outside the export root', async () => {
    const source = `defineMsmPlugin({ id: 'bad.sink', apiVersion: '^1.0.0', contributes: { exporters: [
      { id: 'bad', label: 'Bad', async run(input) { await input.sink.writeFile('../escape.txt', new Uint8Array([1])); } },
    ] } });`;
    const worker = createPluginWorker(source, { spawn: vmWorker({ Uint8Array }).spawn });
    await worker.ready;
    const writes: string[] = [];
    await expect(
      worker.call('run', ['bad', {}], 1000, { writeFile: (path) => writes.push(path) }),
    ).rejects.toMatchObject({ code: 'plugin.bad-result' });
    expect(writes).toEqual([]);
    worker.terminate();
  });

  it('reports a bundle that never registers, and one that throws at the top level', async () => {
    const silent = createPluginWorker('const nothing = 1;', { spawn: vmWorker().spawn });
    await expect(silent.ready).rejects.toMatchObject({ code: 'plugin.crashed' });
    const throwing = createPluginWorker("throw new Error('boom');", { spawn: vmWorker().spawn });
    await expect(throwing.ready).rejects.toMatchObject({ code: 'plugin.crashed' });
    expect(throwing.state).toBe('failed');
  });

  it('strips network and storage globals before the plugin runs', async () => {
    const fake = vmWorker();
    const probe = `defineMsmPlugin({ id: 'p', apiVersion: '^1.0.0', contributes: {},
      seen() { return [typeof fetch, typeof indexedDB, typeof navigator.storage]; } });`;
    const stripped = createPluginWorker(probe, { spawn: fake.spawn });
    await stripped.ready;
    await expect(stripped.call('call', ['seen'], 1000)).resolves.toEqual([
      'undefined',
      'undefined',
      'undefined',
    ]);
    const kept = createPluginWorker(probe, { spawn: vmWorker().spawn, strip: false });
    await kept.ready;
    await expect(kept.call('call', ['seen'], 1000)).resolves.toEqual(['function', 'object', 'object']);
  });

  it('serialises a self-contained bootstrap', () => {
    const source = bootstrapSource(true);
    expect(source.startsWith('(')).toBe(true);
    expect(source).toContain('"fetch"');
    // The function must not reference module-level bindings.
    expect(() => runInContext(`${source}`, createContext({ postMessage() {}, addEventListener() {} }))).not.toThrow();
  });
});
