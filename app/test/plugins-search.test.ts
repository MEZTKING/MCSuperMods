/**
 * Third-party plugins' search data (ADR 0124 D13; B670): asked for once through the sandbox as
 * data, checked with `validateSearchContributions` and the third-party limits, left out whole
 * (the plugin still loads, and Settings > Plugins says so) when a line names another plugin's
 * thing, passes a limit or is not data; no stop or intent words; the plugin's name on its
 * results; and the sample plugin, bundled as its build does, found by its own words.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { Plugin } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { builtInPlugins } from '../src/renderer/src/plugins/built-in';
import {
  checkPluginSearchData,
  type ExternalPluginSet,
  loadExternalPlugins,
  SEARCH_DATA_REFUSED,
} from '../src/renderer/src/plugins/external-plugins';
import { SearchClient } from '../src/renderer/src/search/client';
import { gatherSearchData } from '../src/renderer/src/search/plugin-data';
import { collectStatic } from '../src/renderer/src/search/sources';
import {
  sampleBundle,
  sampleManifest,
  stubPluginsPlatform,
  vmWorkers,
} from './helpers/plugins-fixtures';
import { appLists, factsOf, TARGET_IDS } from './search/fixtures';

const codes = (set: ExternalPluginSet) => set.states[0]?.problems.map((problem) => problem.code);

/** Loads the hand-written sample bundle with `searchData` returning `data` (a JS expression). */
async function loadWith(data: string): Promise<ExternalPluginSet> {
  const { platform } = stubPluginsPlatform([
    {
      manifest: sampleManifest(),
      main: sampleBundle('', `searchData() { return ${data}; },`),
    },
  ]);
  return loadExternalPlugins(platform, { builtIns: builtInPlugins, spawn: vmWorkers().spawn });
}

const OWN_ENTRY = `{
  id: 'welcome',
  title: 'Welcome message',
  sentence: 'Greets every player.',
  words: ['howdy'],
  opens: { type: 'example', id: 'sample-greeting-example' },
}`;

describe('third-party search data', () => {
  it('keeps checked data, adds the plugin name to its doors and counts its lines', async () => {
    const set = await loadWith(`{
      vocabulary: { words: [{ idea: 'greeting', same: ['welcome message'], slang: ['howdy'] }] },
      entries: [${OWN_ENTRY}],
      keywords: { 'sample-greeting': ['tellraw'], 'sample:greeting': ['hello'] },
    }`);
    expect(set.states[0]).toMatchObject({
      state: 'loaded',
      problems: [],
      search: { state: 'included', lines: 4 },
    });
    const data = await set.plugins[0]?.contributes.searchData?.();
    expect(data?.entries?.[0]?.sentence).toBe('Greets every player. From Greetings.');
    expect(data?.vocabulary?.words?.[0]?.slang).toEqual(['howdy']);
    set.terminate();
  });

  it("refuses a plugin that names another plugin's starter: it loads without its search data", async () => {
    // `weapon` is the library plugin's Weapon flow, not one of this plugin's things.
    const set = await loadWith(`{
      vocabulary: { words: [{ idea: 'greeting', same: ['howdy'] }] },
      entries: [${OWN_ENTRY}, {
        id: 'blue-sword',
        title: 'Blue sword',
        sentence: 'A sword, from a greeting plugin.',
        opens: { type: 'starter', id: 'weapon', values: { colour: '#0000ff' } },
      }],
    }`);
    expect(set.states[0]?.state).toBe('loaded');
    expect(set.states[0]?.search).toEqual({ state: 'left-out', lines: 0 });
    expect(codes(set)).toEqual([SEARCH_DATA_REFUSED, 'search.not-own']);
    expect(set.states[0]?.problems.every((problem) => problem.severity === 'warning')).toBe(true);
    expect(set.states[0]?.problems[1]?.message).toContain('/entries/1/opens/id');
    // The plugin is registered and works; only its search data is left out, all of it.
    const plugin = set.plugins[0];
    expect(plugin?.contributes.elementKinds?.[0]?.id).toBe('sample:greeting');
    expect(plugin?.contributes.searchData).toBeUndefined();
    const gathered = await gatherSearchData(plugin === undefined ? [] : [plugin]);
    expect(gathered[0]?.data).toEqual({});
    set.terminate();
  });

  it('refuses keywords and question hints about things that are not its own', () => {
    const contributions = { elementTemplates: [] };
    const manifest = { id: 'other.words', name: 'Other words' };
    for (const input of [
      { keywords: { weapon: ['blade'] } },
      { questions: { weapon: { colour: { role: 'main-colour' } } } },
      {
        behaviours: [
          { id: 'b', phrases: ['glows'], sentence: 'Glows.', appliesTo: ['block'], flows: ['ore'] },
        ],
      },
    ]) {
      const checked = checkPluginSearchData(manifest, contributions, input);
      expect(checked.data).toBeNull();
      expect(checked.problems[0]?.code).toBe(SEARCH_DATA_REFUSED);
    }
  });

  it('cannot add stop or intent words: fields the API lacks are left out with a warning', async () => {
    const set = await loadWith(`{
      vocabulary: {
        words: [{ idea: 'greeting', same: ['howdy'] }],
        stopWords: ['sword'],
        intentWords: { greet: 'make' },
      },
      stopWords: ['pickaxe'],
    }`);
    expect(set.states[0]?.search).toEqual({ state: 'included', lines: 1 });
    expect(codes(set)).toEqual([
      'search.unknown-field',
      'search.unknown-field',
      'search.unknown-field',
    ]);
    const data = await set.plugins[0]?.contributes.searchData?.();
    expect(data).toEqual({ vocabulary: { words: [{ idea: 'greeting', same: ['howdy'] }] } });
    set.terminate();
  });

  it('holds a plugin to the third-party limits', async () => {
    const entries = Array.from(
      { length: 51 },
      (_, index) =>
        `{ id: 'e${index}', title: 'Entry ${index}', sentence: 'One.', opens: { type: 'template', id: 'sample-greeting' } }`,
    );
    const set = await loadWith(`{ entries: [${entries.join(',')}] }`);
    expect(set.states[0]?.search?.state).toBe('left-out');
    expect(codes(set)).toEqual([SEARCH_DATA_REFUSED, 'search.too-many']);
    set.terminate();
  });

  it('loads a plugin whose search data throws or is not data, without it', async () => {
    const crashed = await loadWith(`(() => { throw new Error('no words today'); })()`);
    expect(crashed.states[0]).toMatchObject({
      state: 'loaded',
      search: { state: 'left-out', lines: 0 },
    });
    expect(crashed.states[0]?.problems[0]?.message).toContain('no words today');
    expect(crashed.plugins).toHaveLength(1);
    crashed.terminate();

    const code = await loadWith(`{ keywords: { 'sample-greeting': [() => 'x'] } }`);
    expect(code.states[0]?.search?.state).toBe('left-out');
    expect(code.states[0]?.problems[0]?.message).toContain('plugin.bad-result');
    code.terminate();
  });

  it('leaves a plugin without search data as before', async () => {
    const { platform } = stubPluginsPlatform([{ manifest: sampleManifest() }]);
    const set = await loadExternalPlugins(platform, { spawn: vmWorkers().spawn });
    expect(set.states[0]).not.toHaveProperty('search');
    expect(set.plugins[0]?.contributes.searchData).toBeUndefined();
    set.terminate();
  });
});

/** The part of esbuild the test uses (resolved from the sample plugin, which depends on it). */
interface EsbuildLike {
  build(options: Record<string, unknown>): Promise<{ outputFiles: { text: string }[] }>;
}

/** Bundles `fixtures/sample-plugin` as its build's first step does (esbuild, one IIFE). */
async function sampleMain(): Promise<string> {
  const root = fileURLToPath(new URL('../../fixtures/sample-plugin/', import.meta.url));
  const require = createRequire(`${root}package.json`);
  const esbuild = require('esbuild') as EsbuildLike;
  const result = await esbuild.build({
    stdin: {
      contents: "import plugin from './src/index.ts';\ndefineMsmPlugin(plugin);\n",
      resolveDir: root,
      sourcefile: 'msm-plugin-entry.js',
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    target: 'es2022',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0]?.text ?? '';
}

describe('the sample plugin in search', () => {
  it('is found by its own words through the sandbox', async () => {
    const manifest = sampleManifest({
      capabilities: ['elementKinds', 'elementTemplates', 'examples', 'exporters', 'validators'],
    });
    const { platform } = stubPluginsPlatform([{ manifest, main: await sampleMain() }]);
    const set = await loadExternalPlugins(platform, {
      builtIns: builtInPlugins,
      spawn: vmWorkers().spawn,
    });
    expect(set.states[0]).toMatchObject({
      state: 'loaded',
      problems: [],
      search: { state: 'included' },
    });
    const plugins: Plugin[] = [...builtInPlugins, ...set.plugins];
    const target = factsOf(TARGET_IDS[TARGET_IDS.length - 1] as string);
    const spec = collectStatic({
      plugins,
      target,
      data: await gatherSearchData(plugins),
      lists: await appLists(),
    });
    const client = new SearchClient({
      createWorker: () => {
        throw new Error('main thread in tests');
      },
    });
    client.setStatic(spec);
    const top = async (text: string, mode: 'easy' | 'advanced' = 'advanced') => {
      const answer = await client.query({ text, mode });
      return [...(answer?.best ?? []), ...(answer?.sections.flatMap((s) => s.hits) ?? [])]
        .slice(0, 3)
        .map((hit) => hit.entry);
    };
    const door = 'entry:sample.greetings:welcome-message';
    for (const text of ['howdy', 'welcome message', 'motd', 'join message']) {
      expect((await top(text)).map((entry) => entry.id)).toContain(door);
    }
    const entry = (await top('howdy')).find((found) => found.id === door);
    expect(entry?.plugin).toBe('sample.greetings');
    expect(entry?.sentence).toBe(
      'Says hello to every player when the world loads. From Greetings.',
    );
    // The template is found by its keywords too.
    expect((await top('tellraw greeting')).map((found) => found.id)).toContain(
      'template:sample-greeting',
    );
    client.dispose();
    set.terminate();
  });
});
