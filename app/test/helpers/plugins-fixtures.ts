/**
 * Shared fixtures for the third-party plugin tests (ADR 0035): a `node:vm` stand-in for the
 * dedicated worker, a hand-written bundle with the plan's sample plugin ids, its manifest and
 * symbol export, and a stub `platform.plugins`.
 *
 * The stand-in runs the bootstrap and bundle in a fresh `vm` context; it is not a security
 * boundary and does not apply the CSP (the real worker's refusals are an e2e matter).
 */

import { createContext, runInContext } from 'node:vm';
import type { WorkerLike } from '../../src/renderer/src/plugins/sandbox/host';
import type {
  ExternalPluginBundle,
  ExternalPluginEntry,
  PlatformAdapter,
  PluginManifest,
} from '../../src/shared/platform';

type Listener = (event: { data?: unknown; message?: string }) => void;

/** A worker stand-in factory: records spawns and terminations. */
export interface VmWorkers {
  spawn(source: string, name?: string): WorkerLike;
  /** How many workers were started. */
  spawned(): number;
  /** How many were terminated. */
  terminated(): number;
  /** The scope of the last worker. */
  scope(): Record<string, unknown>;
}

/** Runs each source in a fresh `vm` context that looks like a dedicated worker scope. */
export function vmWorkers(globals: Record<string, unknown> = {}): VmWorkers {
  let spawned = 0;
  let terminatedCount = 0;
  let context: Record<string, unknown> = {};
  return {
    spawned: () => spawned,
    terminated: () => terminatedCount,
    scope: () => context,
    spawn(source) {
      spawned += 1;
      let terminated = false;
      const hostListeners: Record<string, Listener[]> = { message: [], error: [] };
      const workerListeners: Listener[] = [];
      const deliver = (listeners: Listener[], data: unknown): void => {
        queueMicrotask(() => {
          if (terminated) return;
          for (const listener of listeners) listener({ data: structuredClone(data) });
        });
      };
      const own = createContext({
        TextEncoder,
        TextDecoder,
        Uint8Array,
        setTimeout,
        queueMicrotask,
        navigator: { storage: {} },
        fetch: () => undefined,
        indexedDB: {},
        caches: {},
        postMessage: (data: unknown) => deliver(hostListeners.message ?? [], data),
        addEventListener: (type: string, listener: Listener) => {
          if (type === 'message') workerListeners.push(listener);
        },
        ...globals,
      }) as Record<string, unknown>;
      context = own;
      queueMicrotask(() => {
        try {
          runInContext(source, own);
        } catch (error) {
          if (terminated) return;
          for (const listener of hostListeners.error ?? []) listener({ message: String(error) });
        }
      });
      return {
        postMessage: (data) => deliver(workerListeners, data),
        addEventListener: (type: string, listener: Listener) => {
          hostListeners[type]?.push(listener);
        },
        terminate: () => {
          if (!terminated) terminatedCount += 1;
          terminated = true;
        },
      } as WorkerLike;
    },
  };
}

/**
 * A bundle with the plan's sample plugin ids (`sample.greetings`, kind `sample:greeting`,
 * template `sample-greeting`, example `sample-greeting-example`, validator
 * `sample.empty-message`) plus an exporter and an importer. `overrides` is spliced into the
 * plugin object literal (for example `id: 'other.plugin',`), and `extraContributes` into its
 * `contributes`.
 */
export function sampleBundle(overrides = '', extraContributes = ''): string {
  return `
const encoder = new TextEncoder();
const split = (id) => { const i = id.indexOf(':'); return [id.slice(0, i), id.slice(i + 1)]; };
defineMsmPlugin({
  id: 'sample.greetings',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [{
      id: 'sample:greeting',
      schema: '::sample::greeting::Greeting',
      folder: 'greeting',
      defaultData: { message: 'Hello' },
      lower(element, target) {
        const [ns, path] = split(element.id);
        if (element.data.message === 'throw') throw new Error('cannot lower');
        if (element.data.message === 'hang') return new Promise(() => undefined);
        return [{
          path: 'data/' + ns + '/function/greet_' + path + '.mcfunction',
          layer: 'datapack',
          language: 'mcfunction',
          contents: encoder.encode('tellraw @a {"text":"' + element.data.message + '"}\\n'),
          hasFns: typeof target.migrateFrom,
        }];
      },
    }],
    elementTemplates: [{
      id: 'sample-greeting',
      kind: 'sample:greeting',
      title: 'Greeting',
      description: 'Greets every player.',
      category: 'Sample',
      data(context) { return { message: 'Hello from ' + context.id + ' on ' + context.target.id }; },
    }],
    examples: [{
      id: 'sample-greeting-example',
      title: 'Greeting example',
      description: 'One greeting.',
      kind: 'sample:greeting',
      category: 'Sample',
      requiresKinds: ['sample:greeting'],
      build(context) {
        return { elements: [{ id: context.namespace + ':hello', kind: 'sample:greeting', data: { message: 'Hi' } }], assets: [] };
      },
    }],
    validators: [{
      id: 'sample.empty-message',
      kinds: ['sample:greeting'],
      validate(input) {
        const problems = [];
        for (const element of input.elements) {
          if (element.kind === 'sample:greeting' && element.data.message === '') {
            problems.push({ severity: 'warning', code: 'sample.empty-message', message: element.id + ' says nothing.', elementId: element.id });
          }
        }
        problems.push({ severity: 'info', code: 'sample.registry', message: 'stone:' + input.registry.has('item', 'stone') + ' tag:' + input.registry.has('item', '#minecraft:logs') });
        return problems;
      },
    }],
    exporters: [{
      id: 'sample.notes',
      displayName: 'Greeting notes',
      layers: ['datapack'],
      async run(input) {
        await input.sink.writeFile('notes.txt', encoder.encode(input.files.map((f) => f.path).join('\\n')));
        input.problems.report({ severity: 'info', code: 'sample.exported', message: 'One file.' });
        input.problems.report({ nonsense: true });
      },
    }],
    importers: [{
      id: 'sample.txt',
      displayName: 'Greeting text',
      extensions: ['greet'],
      async import(file, namespace) {
        return { elements: [{ formatVersion: 1, id: namespace + ':' + file.name.replace(/\\.greet$/, ''), kind: 'sample:greeting', data: { message: new TextDecoder().decode(file.bytes) }, meta: {} }], assets: [], problems: [] };
      },
    }],
    ${extraContributes}
  },
  ${overrides}
});
`;
}

/** The manifest of {@link sampleBundle}. */
export function sampleManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    manifestVersion: 1,
    id: 'sample.greetings',
    name: 'Greetings',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    main: 'main.js',
    schemas: ['symbols.json'],
    capabilities: [
      'elementKinds',
      'elementTemplates',
      'examples',
      'validators',
      'exporters',
      'importers',
    ],
    ...overrides,
  };
}

/** The symbol export of {@link sampleBundle}: `::sample::greeting::Greeting { message: string }`. */
export function sampleSymbols(typePath = '::sample::greeting::Greeting'): string {
  return JSON.stringify({
    ref: 'sample.greetings@1.0.0',
    mcdoc: {
      [typePath]: {
        kind: 'struct',
        fields: [{ kind: 'pair', key: 'message', type: { kind: 'string' } }],
      },
    },
    'mcdoc/dispatcher': {},
  });
}

/** One stub plugin folder. */
export interface StubPlugin {
  folder?: string;
  manifest: PluginManifest | null;
  problems?: ExternalPluginEntry['problems'];
  main?: string;
  schemas?: string[];
  /** `read` rejects with this message. */
  readError?: string;
}

/** A `platform.plugins` over in-memory folders; records reads. */
export function stubPluginsPlatform(plugins: StubPlugin[]): {
  platform: Pick<PlatformAdapter, 'plugins'>;
  reads: string[];
} {
  const reads: string[] = [];
  return {
    reads,
    platform: {
      plugins: {
        list: async () =>
          plugins.map((plugin, index) => ({
            id: plugin.manifest?.id ?? plugin.folder ?? `folder${index}`,
            folder: plugin.folder ?? plugin.manifest?.id ?? `folder${index}`,
            manifest: plugin.manifest,
            problems: plugin.problems ?? [],
          })),
        read: async (id): Promise<ExternalPluginBundle> => {
          reads.push(id);
          const plugin = plugins.find((candidate) => candidate.manifest?.id === id);
          if (plugin === undefined || plugin.manifest === null) throw new Error(`No ${id}`);
          if (plugin.readError !== undefined) {
            throw new Error(`Error invoking remote method 'msm:v1:plugins:read': Error: ${plugin.readError}`);
          }
          return {
            manifest: plugin.manifest,
            main: plugin.main ?? sampleBundle(),
            schemas: plugin.schemas ?? [sampleSymbols()],
          };
        },
        openFolder: async () => undefined,
      },
    },
  };
}
