/**
 * `loadExternalPlugins` (ADR 0035): states, refusals before and after the worker starts, the
 * facade's proxies (hook-free targets, the registry snapshot cache, exporter relays) and a
 * plugin failing after it loaded.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Element, OutputFile, Problem, Target } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { builtInPlugins } from '../src/renderer/src/plugins/built-in';
import {
  loadExternalPlugins,
  NO_EXTERNAL_PLUGINS,
  toTargetFacts,
} from '../src/renderer/src/plugins/external-plugins';
import {
  sampleBundle,
  sampleManifest,
  sampleSymbols,
  stubPluginsPlatform,
  vmWorkers,
} from './helpers/plugins-fixtures';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const element: Element = {
  formatVersion: 1,
  id: 'demo:hello',
  kind: 'sample:greeting',
  data: { message: 'Hi' },
  meta: { createdAt: '' },
};
const codes = (problems: readonly Problem[]) => problems.map((problem) => problem.code);

describe('loadExternalPlugins', () => {
  it('loads a plugin and builds a facade that resolves through its worker', async () => {
    const workers = vmWorkers();
    const { platform } = stubPluginsPlatform([{ manifest: sampleManifest() }]);
    const set = await loadExternalPlugins(platform, {
      builtIns: builtInPlugins,
      spawn: workers.spawn,
    });
    expect(set.states).toEqual([
      {
        id: 'sample.greetings',
        name: 'Greetings',
        version: '1.0.0',
        state: 'loaded',
        problems: [],
      },
    ]);
    expect(set.symbols).toHaveLength(1);
    const plugin = set.plugins[0];
    expect(plugin?.id).toBe('sample.greetings');
    const kind = plugin?.contributes.elementKinds?.[0];
    expect(kind).toMatchObject({
      id: 'sample:greeting',
      folder: 'greeting',
      defaultData: { message: 'Hello' },
    });

    // A full target carries hook functions; the worker receives its facts only.
    const withHooks = { ...target, migrateFrom: () => ({ changes: [], problems: [] }) } as Target;
    const files = (await kind?.lower(element, withHooks)) as (OutputFile & { hasFns: string })[];
    expect(files[0]?.path).toBe('data/demo/function/greet_hello.mcfunction');
    expect(files[0]?.hasFns).toBe('undefined');

    const template = plugin?.contributes.elementTemplates?.[0];
    await expect(
      template?.data({
        id: 'demo:t',
        namespace: 'demo',
        path: 't',
        projectNamespace: 'demo',
        namespaces: ['demo'],
        kindDefault: undefined,
        target,
      }),
    ).resolves.toEqual({ message: `Hello from demo:t on ${target.id}` });

    const example = plugin?.contributes.examples?.[0];
    const bundle = await example?.build({
      namespace: 'demo',
      projectName: 'Demo',
      target,
      values: {},
    });
    expect(bundle?.elements.map((entry) => entry.id)).toEqual(['demo:hello']);

    set.terminate();
    expect(workers.terminated()).toBe(1);
  });

  it('answers supports() of starters from the worker, once per known target', async () => {
    const starter = `projectStarters: [{
      id: 'sample-only-first',
      title: 'Only on the first target',
      description: 'A starter for one target.',
      category: 'Sample',
      layers: ['datapack'],
      requiresKinds: [],
      supports(target) { return target.id === '${target.id}'; },
      build() { return { elements: [], assets: [] }; },
    }],`;
    const other = { ...target, id: 'mc-other' };
    const { platform } = stubPluginsPlatform([
      {
        manifest: sampleManifest({
          capabilities: [...sampleManifest().capabilities, 'projectStarters'],
        }),
        main: sampleBundle('', starter),
      },
    ]);
    const set = await loadExternalPlugins(platform, {
      builtIns: builtInPlugins,
      spawn: vmWorkers().spawn,
      targets: [target, other],
    });
    expect(codes(set.states[0]?.problems ?? [])).toEqual([]);
    const contributes = set.plugins[0]?.contributes;
    const entry = contributes?.projectStarters?.[0];
    expect(entry?.supports?.(target)).toBe(true);
    expect(entry?.supports?.(other)).toBe(false);
    // Entries without supports() stay without it (supported everywhere).
    expect(contributes?.elementTemplates?.[0]?.supports).toBeUndefined();
    set.terminate();
  });

  it('sends a registry snapshot once per registry object', async () => {
    const workers = vmWorkers();
    const { platform } = stubPluginsPlatform([{ manifest: sampleManifest() }]);
    const set = await loadExternalPlugins(platform, { spawn: workers.spawn });
    const validator = set.plugins[0]?.contributes.validators?.[0];
    let reads = 0;
    const registry = {
      has: () => false,
      ids: (name: string) => {
        reads += 1;
        return name === 'item' ? ['minecraft:stone'] : ['minecraft:logs'];
      },
      registries: () => ['item', 'tag/item'],
    };
    const input = { elements: [{ ...element, data: { message: '' } }], target, registry };
    const first = await validator?.validate(input);
    expect(codes(first ?? [])).toEqual(['sample.empty-message', 'sample.registry']);
    expect(first?.[1]?.message).toBe('stone:true tag:true');
    await validator?.validate(input);
    expect(reads).toBe(2);
    set.terminate();
  });

  it('relays exporter writes and well-formed reports, and imports', async () => {
    const { platform } = stubPluginsPlatform([{ manifest: sampleManifest() }]);
    const set = await loadExternalPlugins(platform, { spawn: vmWorkers().spawn });
    const exporter = set.plugins[0]?.contributes.exporters?.[0];
    const written: string[] = [];
    const reported: Problem[] = [];
    await exporter?.run({
      projectName: 'Demo',
      target,
      files: [{ path: 'data/a.json', layer: 'datapack', contents: {} }],
      sink: {
        writeFile: async (path, contents) => {
          written.push(`${path}:${new TextDecoder().decode(contents)}`);
        },
      },
      problems: { report: (problem) => reported.push(problem) },
      meta: { msmVersion: '0', plugins: [] },
      options: {},
    });
    expect(written).toEqual(['notes.txt:data/a.json']);
    expect(codes(reported)).toEqual(['sample.exported']);
    const importer = set.plugins[0]?.contributes.importers?.[0];
    const result = await importer?.import(
      { name: 'hi.greet', bytes: new TextEncoder().encode('Hello') },
      'demo',
    );
    expect(result?.elements[0]).toMatchObject({ id: 'demo:hi', data: { message: 'Hello' } });
    set.terminate();
  });

  it('refuses an incompatible API range without reading or starting the plugin', async () => {
    const workers = vmWorkers();
    const { platform, reads } = stubPluginsPlatform([
      { manifest: sampleManifest({ apiVersion: '^2.0.0' }) },
    ]);
    const set = await loadExternalPlugins(platform, { spawn: workers.spawn });
    expect(set.plugins).toEqual([]);
    expect(set.states[0]).toMatchObject({ state: 'refused' });
    expect(codes(set.states[0]?.problems ?? [])).toEqual(['plugin.api-incompatible']);
    expect(reads).toEqual([]);
    expect(workers.spawned()).toBe(0);
  });

  it('reports invalid manifests and unreadable bundles as refused', async () => {
    const { platform } = stubPluginsPlatform([
      {
        folder: 'broken',
        manifest: null,
        problems: [{ severity: 'error', code: 'plugin.manifest-invalid', message: 'bad' }],
      },
      {
        manifest: sampleManifest(),
        readError: 'plugin.too-large: The bundle main.js is 5000000 bytes.',
      },
    ]);
    const set = await loadExternalPlugins(platform, { spawn: vmWorkers().spawn });
    expect(set.states.map((state) => [state.id, state.name, state.state])).toEqual([
      ['broken', 'broken', 'refused'],
      ['sample.greetings', 'Greetings', 'refused'],
    ]);
    expect(set.states[1]?.problems[0]).toEqual({
      severity: 'error',
      code: 'plugin.too-large',
      message: 'plugin.too-large: The bundle main.js is 5000000 bytes.',
    });
  });

  it('refuses undeclared capabilities, reserved namespaces and foreign schemas', async () => {
    const workers = vmWorkers();
    const { platform } = stubPluginsPlatform([
      { folder: 'a', manifest: sampleManifest({ capabilities: ['elementKinds'] }) },
      {
        folder: 'b',
        manifest: sampleManifest({ id: 'other.plugin' }),
        main: sampleBundle("id: 'other.plugin',").replaceAll("'sample:greeting'", "'msm:greeting'"),
        schemas: [sampleSymbols('::other::Thing')],
      },
      {
        folder: 'c',
        manifest: sampleManifest({ id: 'third.plugin' }),
        main: sampleBundle("id: 'third.plugin',"),
        schemas: [sampleSymbols('::java::data::Thing')],
      },
    ]);
    const set = await loadExternalPlugins(platform, { spawn: workers.spawn });
    expect(set.plugins).toEqual([]);
    expect(set.states.map((state) => state.state)).toEqual(['refused', 'refused', 'refused']);
    expect(codes(set.states[0]?.problems ?? [])).toContain('plugin.capability-missing');
    expect(codes(set.states[1]?.problems ?? [])).toContain('plugin.reserved-namespace');
    expect(set.states[2]?.problems[0]?.message).toContain('outside its namespace ::third');
    // Two workers started (a and b) and both were stopped; c never started.
    expect(workers.spawned()).toBe(2);
    expect(workers.terminated()).toBe(2);
  });

  it('warns about unsupported points but loads the plugin', async () => {
    const { platform } = stubPluginsPlatform([
      {
        manifest: sampleManifest(),
        main: sampleBundle('', "commands: [{ id: 'sample.cmd', title: 'Cmd', run() {} }],"),
      },
    ]);
    const set = await loadExternalPlugins(platform, { spawn: vmWorkers().spawn });
    expect(set.states[0]?.state).toBe('loaded');
    expect(codes(set.states[0]?.problems ?? [])).toEqual(['plugin.capability-unsupported']);
    expect(set.plugins[0]?.contributes.commands).toBeUndefined();
  });

  it('refuses a kind that clashes with a built-in or an earlier plugin', async () => {
    const workers = vmWorkers();
    const clashingBuiltIn = sampleBundle("id: 'clash.builtin',").replace(
      "folder: 'greeting'",
      "folder: 'recipe'",
    );
    const { platform } = stubPluginsPlatform([
      {
        folder: 'a',
        manifest: sampleManifest({ id: 'clash.builtin' }),
        main: clashingBuiltIn,
        schemas: [],
      },
      { folder: 'b', manifest: sampleManifest() },
      {
        folder: 'c',
        manifest: sampleManifest({ id: 'sample.copy' }),
        main: sampleBundle("id: 'sample.copy',"),
      },
    ]);
    const set = await loadExternalPlugins(platform, {
      builtIns: builtInPlugins,
      spawn: workers.spawn,
    });
    expect(set.states.map((state) => [state.id, state.state])).toEqual([
      ['clash.builtin', 'refused'],
      ['sample.greetings', 'loaded'],
      ['sample.copy', 'refused'],
    ]);
    expect(set.states[0]?.problems.at(-1)).toMatchObject({
      code: 'plugin.refused',
      message: expect.stringContaining('"recipe" is already used'),
    });
    expect(set.states[2]?.problems.at(-1)?.message).toContain('already registered');
    expect(set.plugins.map((plugin) => plugin.id)).toEqual(['sample.greetings']);
    expect(workers.terminated()).toBe(2);
    set.terminate();
  });

  it('reports a plugin that does not start as failed', async () => {
    const { platform } = stubPluginsPlatform([
      { manifest: sampleManifest(), main: "throw new Error('broken bundle');" },
    ]);
    const set = await loadExternalPlugins(platform, { spawn: vmWorkers().spawn });
    expect(set.states[0]).toMatchObject({ state: 'failed' });
    expect(codes(set.states[0]?.problems ?? [])).toEqual(['plugin.crashed']);
    expect(set.plugins).toEqual([]);
  });

  it('marks a loaded plugin failed when its worker times out later, and tells subscribers', async () => {
    const { platform } = stubPluginsPlatform([{ manifest: sampleManifest() }]);
    const set = await loadExternalPlugins(platform, { spawn: vmWorkers().spawn });
    const before = set.states;
    let notified = 0;
    set.subscribe(() => {
      notified += 1;
    });
    const kind = set.plugins[0]?.contributes.elementKinds?.[0];
    const hanging = { ...element, data: { message: 'hang' } };
    // The real deadline is 2 s; the hanging call is abandoned by the host's timer.
    await expect(kind?.lower(hanging, target)).rejects.toMatchObject({ code: 'plugin.timeout' });
    expect(notified).toBe(1);
    expect(set.states).not.toBe(before);
    expect(set.states[0]?.state).toBe('failed');
    expect(codes(set.states[0]?.problems ?? [])).toEqual(['plugin.timeout']);
    await expect(kind?.lower(element, target)).rejects.toMatchObject({
      code: 'plugin.unavailable',
    });
  }, 10_000);

  it('returns the empty set without a platform service or plugins', async () => {
    await expect(loadExternalPlugins({})).resolves.toBe(NO_EXTERNAL_PLUGINS);
    await expect(loadExternalPlugins(stubPluginsPlatform([]).platform)).resolves.toBe(
      NO_EXTERNAL_PLUGINS,
    );
  });

  it('strips target hooks and memoises the facts', () => {
    const withHooks = { ...target, javaProject: { generate: () => [] } } as Target;
    const facts = toTargetFacts(withHooks);
    expect('javaProject' in facts).toBe(false);
    expect(() => structuredClone(facts)).not.toThrow();
    expect(toTargetFacts(withHooks)).toBe(facts);
  });
});

describe('the sample external plugin (fixtures/sample-plugin/dist)', () => {
  it('loads when built', async () => {
    const dist = new URL('../../fixtures/sample-plugin/dist/', import.meta.url);
    let main: string;
    let manifestText: string;
    let symbols: string;
    try {
      [main, manifestText, symbols] = await Promise.all([
        readFile(fileURLToPath(new URL('main.js', dist)), 'utf8'),
        readFile(fileURLToPath(new URL('msm-plugin.json', dist)), 'utf8'),
        readFile(fileURLToPath(new URL('symbols.json', dist)), 'utf8'),
      ]);
    } catch {
      // Not built in this checkout (`pnpm --filter @msm/sample-plugin build`).
      return;
    }
    const { pluginManifestSchema } = await import('../src/shared/ipc-contract');
    const manifest = pluginManifestSchema.parse(JSON.parse(manifestText));
    const { platform } = stubPluginsPlatform([{ manifest, main, schemas: [symbols] }]);
    const set = await loadExternalPlugins(platform, {
      builtIns: builtInPlugins,
      spawn: vmWorkers().spawn,
    });
    expect(set.states[0]).toMatchObject({ id: 'sample.greetings', state: 'loaded' });
    const kind = set.plugins[0]?.contributes.elementKinds?.[0];
    expect(kind?.id).toBe('sample:greeting');
    const files = await kind?.lower(element, target);
    expect(files?.length).toBeGreaterThan(0);
    set.terminate();
  });
});
