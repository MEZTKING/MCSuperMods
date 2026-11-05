/**
 * The plugin sandbox host and bootstrap protocol (ADR 0035 D3, D4), with a `node:vm`
 * stand-in for the dedicated worker. The real worker's CSP refusals are an e2e matter.
 */

import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  createPluginWorker,
  isCloneableResult,
  SANDBOX_DEADLINES,
  SandboxError,
} from '../src/renderer/src/plugins/sandbox/host';
import { bootstrapSource, STRIPPED_GLOBALS } from '../src/renderer/src/plugins/sandbox/worker-bootstrap';
import { sampleBundle, vmWorkers } from './helpers/plugins-fixtures';

const target = { id: 'mc-test', mcVersion: '1.0-test', packFormats: { data: 1, resource: 1 } };
const element = {
  formatVersion: 1,
  id: 'demo:hello',
  kind: 'sample:greeting',
  data: { message: 'Hi' },
  meta: {},
};
const decode = (bytes: unknown) => new TextDecoder().decode(bytes as Uint8Array);

describe('plugin sandbox host', () => {
  it('describes the plugin and round-trips every contribution function', async () => {
    const workers = vmWorkers();
    const worker = createPluginWorker(sampleBundle(), { spawn: workers.spawn });
    const description = await worker.ready;
    expect(description.id).toBe('sample.greetings');
    expect(description.contributes.elementKinds?.[0]).toEqual({
      data: {
        id: 'sample:greeting',
        schema: '::sample::greeting::Greeting',
        folder: 'greeting',
        defaultData: { message: 'Hello' },
      },
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

    const lowered = (await worker.call('lower', ['sample:greeting', element, target])) as {
      path: string;
      contents: Uint8Array;
    }[];
    expect(lowered[0]?.path).toBe('data/demo/function/greet_hello.mcfunction');
    expect(decode(lowered[0]?.contents)).toBe('tellraw @a {"text":"Hi"}\n');
    await expect(worker.call('data', ['sample-greeting', { id: 'demo:n', target }])).resolves.toEqual({
      message: 'Hello from demo:n on mc-test',
    });
    const bundle = (await worker.call('build', [
      'examples',
      'sample-greeting-example',
      { namespace: 'demo' },
    ])) as { elements: { id: string }[] };
    expect(bundle.elements[0]?.id).toBe('demo:hello');

    const snapshot = { item: ['minecraft:stone'], 'tag/item': ['minecraft:logs'] };
    const problems = await worker.call('validate', [
      'sample.empty-message',
      { elements: [{ ...element, data: { message: '' } }], target },
      'k1',
      snapshot,
    ]);
    expect(problems).toEqual([
      expect.objectContaining({ code: 'sample.empty-message', elementId: 'demo:hello' }),
      expect.objectContaining({ code: 'sample.registry', message: 'stone:true tag:true' }),
    ]);
    // The cached key alone is enough the second time; an unknown key fails that call only.
    await expect(
      worker.call('validate', ['sample.empty-message', { elements: [], target }, 'k1', null]),
    ).resolves.toEqual([expect.objectContaining({ message: 'stone:true tag:true' })]);
    await expect(
      worker.call('validate', ['sample.empty-message', { elements: [], target }, 'nope', null]),
    ).rejects.toMatchObject({ code: 'plugin.crashed' });
    expect(worker.state).toBe('ready');

    const writes: string[] = [];
    const reports: unknown[] = [];
    await worker.call(
      'run',
      ['sample.notes', { projectName: 'Demo', files: [{ path: 'a.json' }], target }],
      undefined,
      {
        writeFile: async (path, contents) => {
          await Promise.resolve();
          writes.push(`${path}=${decode(contents)}`);
        },
        report: (problem) => reports.push(problem),
      },
    );
    // The call settles only after the asynchronous write.
    expect(writes).toEqual(['notes.txt=a.json']);
    expect(reports[0]).toMatchObject({ code: 'sample.exported' });

    const imported = (await worker.call('import', [
      'sample.txt',
      { name: 'x.greet', bytes: new TextEncoder().encode('Text') },
      'demo',
    ])) as { elements: { id: string; data: unknown }[] };
    expect(imported.elements[0]).toMatchObject({ id: 'demo:x', data: { message: 'Text' } });

    worker.terminate();
    expect(worker.state).toBe('terminated');
    await expect(worker.call('lower', ['sample:greeting', element, target])).rejects.toMatchObject({
      code: 'plugin.unavailable',
    });
  });

  it('fails one call when a function throws, and keeps the worker running', async () => {
    const worker = createPluginWorker(sampleBundle(), { spawn: vmWorkers().spawn });
    await worker.ready;
    const failing = { ...element, data: { message: 'throw' } };
    await expect(worker.call('lower', ['sample:greeting', failing, target])).rejects.toMatchObject({
      code: 'plugin.crashed',
      message: 'Error: cannot lower',
    });
    expect(worker.state).toBe('ready');
    await expect(worker.call('lower', ['sample:greeting', element, target])).resolves.toHaveLength(1);
    worker.terminate();
  });

  it('refuses a result that is not JSON or bytes', async () => {
    const source = `defineMsmPlugin({ id: 'p', apiVersion: '^1.0.0', contributes: { elementTemplates: [
      { id: 'sample-date', kind: 'p:k', title: 'D', description: 'D', category: 'S', data() { return { when: new Date(0) }; } },
    ] } });`;
    const worker = createPluginWorker(source, { spawn: vmWorkers({ Date }).spawn });
    await worker.ready;
    await expect(worker.call('data', ['sample-date', {}])).rejects.toMatchObject({
      code: 'plugin.bad-result',
    });
    expect(worker.state).toBe('ready');
    worker.terminate();
  });

  it('terminates the worker on a deadline, tells subscribers and fails later calls', async () => {
    const workers = vmWorkers();
    const worker = createPluginWorker(sampleBundle(), { spawn: workers.spawn });
    await worker.ready;
    const failures: string[] = [];
    worker.onFail((error) => failures.push(error.code));
    const hanging = { ...element, data: { message: 'hang' } };
    const error = await worker
      .call('lower', ['sample:greeting', hanging, target], 50)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SandboxError);
    expect((error as SandboxError).code).toBe('plugin.timeout');
    expect(workers.terminated()).toBe(1);
    expect(worker.state).toBe('failed');
    expect(worker.failure?.code).toBe('plugin.timeout');
    expect(failures).toEqual(['plugin.timeout']);
    await expect(worker.call('lower', ['sample:greeting', element, target])).rejects.toMatchObject({
      code: 'plugin.unavailable',
    });
  });

  it('fails a start that takes too long', async () => {
    const worker = createPluginWorker('for (;;) {}', {
      spawn: () => ({ postMessage() {}, addEventListener() {}, terminate() {} }),
      startDeadlineMs: 20,
    });
    await expect(worker.ready).rejects.toMatchObject({ code: 'plugin.timeout' });
    expect(worker.state).toBe('failed');
  });

  it('rejects sink paths outside the export root', async () => {
    const source = `defineMsmPlugin({ id: 'bad.sink', apiVersion: '^1.0.0', contributes: { exporters: [
      { id: 'bad', displayName: 'Bad', layers: ['datapack'], async run(input) { await input.sink.writeFile('../escape.txt', new Uint8Array([1])); } },
    ] } });`;
    const worker = createPluginWorker(source, { spawn: vmWorkers().spawn });
    await worker.ready;
    const writes: string[] = [];
    await expect(
      worker.call('run', ['bad', {}], 1000, { writeFile: (path) => void writes.push(path) }),
    ).rejects.toMatchObject({ code: 'plugin.bad-result' });
    expect(writes).toEqual([]);
    worker.terminate();
  });

  it('reports a bundle that never registers, and one that throws at the top level', async () => {
    const silent = createPluginWorker('const nothing = 1;', { spawn: vmWorkers().spawn });
    await expect(silent.ready).rejects.toMatchObject({ code: 'plugin.crashed' });
    const throwing = createPluginWorker("throw new Error('boom');", { spawn: vmWorkers().spawn });
    await expect(throwing.ready).rejects.toMatchObject({ code: 'plugin.crashed' });
    expect(throwing.state).toBe('failed');
  });

  it('strips network, storage and postMessage before the plugin runs', async () => {
    const probe = `const seen = [typeof fetch, typeof indexedDB, typeof caches, typeof navigator.storage, typeof postMessage];
      defineMsmPlugin({ id: 'p', apiVersion: '^1.0.0', contributes: { elementTemplates: [
        { id: 'p-t', kind: 'p:k', title: 't', description: 'd', category: 'c', data() { return seen; } },
      ] } });`;
    const worker = createPluginWorker(probe, { spawn: vmWorkers().spawn });
    await worker.ready;
    await expect(worker.call('data', ['p-t', {}])).resolves.toEqual([
      'undefined',
      'undefined',
      'undefined',
      'undefined',
      'undefined',
    ]);
    expect(STRIPPED_GLOBALS).toContain('importScripts');
  });

  it('serialises a self-contained bootstrap', () => {
    const source = bootstrapSource();
    expect(source.startsWith('(')).toBe(true);
    expect(source).toContain('"fetch"');
    // The function must not reference module-level bindings.
    expect(() =>
      runInContext(source, createContext({ postMessage() {}, addEventListener() {} })),
    ).not.toThrow();
  });

  it('checks results on the host side too', () => {
    expect(isCloneableResult({ a: [1, 'x', null, new Uint8Array(1)] })).toBe(true);
    expect(isCloneableResult({ a: Number.NaN })).toBe(false);
    expect(isCloneableResult(new Date(0))).toBe(false);
    expect(isCloneableResult(new Map())).toBe(false);
    expect(SANDBOX_DEADLINES).toEqual({
      lower: 2000,
      data: 2000,
      validate: 5000,
      build: 5000,
      import: 30_000,
      run: 120_000,
    });
  });
});
