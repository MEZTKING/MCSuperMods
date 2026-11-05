import { readFileSync } from 'node:fs';
import type {
  Element,
  ElementKind,
  OutputFile,
  ProjectValidator,
  TargetFacts,
  ValidationRegistry,
} from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import plugin, { greetingCommand } from '../src/index';

/** A hand-written target: only the facts the plugin reads need realistic values. */
const TARGET: TargetFacts = {
  id: 'mc-test',
  mcVersion: 'test',
  channel: 'release',
  java: 25,
  packFormats: { resource: { major: 1, minor: 0 }, data: { major: 1, minor: 0 } },
  mcdocRef: 'test',
  mcmetaRef: 'test',
  folders: {
    resource: {
      model: 'models',
      block_definition: 'blockstates',
      item_definition: 'items',
      lang: 'lang',
      sounds_file: 'sounds.json',
      textures: 'textures',
      atlases: 'atlases',
      font: 'font',
    },
    data: {
      recipe: 'recipe',
      loot_table: 'loot_table',
      advancement: 'advancement',
      predicate: 'predicate',
      item_modifier: 'item_modifier',
      function: 'function',
      tags: 'tags',
      enchantment: 'enchantment',
      damage_type: 'damage_type',
      dimension_type: 'dimension_type',
      chat_type: 'chat_type',
      jukebox_song: 'jukebox_song',
      banner_pattern: 'banner_pattern',
      painting_variant: 'painting_variant',
      trim_material: 'trim_material',
      trim_pattern: 'trim_pattern',
      dialog: 'dialog',
      structure: 'structure',
      dimension: 'dimension',
      worldgen: 'worldgen',
    },
  },
  dataVersion: 1,
  worldgen: { featureSteps: [] },
};

const EMPTY_REGISTRY: ValidationRegistry = { has: () => false, ids: () => [] };

function greeting(id: Element['id'], data: Element['data']): Element {
  return {
    formatVersion: 1,
    id,
    kind: 'sample:greeting',
    data,
    meta: { createdAt: '2026-11-05T00:00:00.000Z' },
  };
}

function kind(): ElementKind {
  const found = plugin.contributes.elementKinds?.[0];
  if (found === undefined) throw new Error('no kind');
  return found;
}

function validator(): ProjectValidator {
  const found = plugin.contributes.validators?.[0];
  if (found === undefined) throw new Error('no validator');
  return found;
}

function text(file: OutputFile | undefined): string {
  if (!(file?.contents instanceof Uint8Array)) throw new Error('expected bytes');
  return new TextDecoder().decode(file.contents);
}

describe('sample.greetings', () => {
  it('declares the fixed ids and the API range', () => {
    expect(plugin.id).toBe('sample.greetings');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
    const { elementKinds, elementTemplates, examples, validators } = plugin.contributes;
    expect(elementKinds?.map((entry) => [entry.id, entry.folder, entry.schema])).toEqual([
      ['sample:greeting', 'greeting', '::sample::greeting::Greeting'],
    ]);
    expect(elementTemplates?.map((entry) => entry.id)).toEqual(['sample-greeting']);
    expect(examples?.map((entry) => entry.id)).toEqual(['sample-greeting-example']);
    expect(validators?.map((entry) => entry.id)).toEqual(['sample.empty-message']);
    expect(Object.keys(plugin.contributes).sort()).toEqual([
      'elementKinds',
      'elementTemplates',
      'examples',
      'validators',
    ]);
  });

  it('lowers a greeting to a tellraw function and a load tag entry', async () => {
    const files = await kind().lower(
      greeting('demo:hello', { message: 'Hi there', colour: 'gold' }),
      TARGET,
    );
    expect(files.map((file) => [file.layer, file.path])).toEqual([
      ['datapack', 'data/demo/function/greet_hello.mcfunction'],
      ['datapack', 'data/minecraft/tags/function/load.json'],
    ]);
    const [fn, tag] = files;
    expect(text(fn)).toBe('tellraw @a {"text": "Hi there", "color": "gold"}\n');
    expect(fn?.language).toBe('mcfunction');
    expect(fn?.schema).toBeUndefined();
    expect(tag?.contents).toEqual({ values: ['demo:greet_hello'] });
    expect(tag?.merge).toBe('tag');
    expect(tag?.schema).toBe('tag:function');
    // The output crosses the worker boundary: plain data and bytes only.
    expect(structuredClone(files)).toEqual(files);
  });

  it('omits the colour when none is set and escapes the message', async () => {
    const files = await kind().lower(greeting('demo:quote', { message: 'Say "hi"' }), TARGET);
    expect(text(files[0])).toBe('tellraw @a {"text": "Say \\"hi\\""}\n');
    expect(greetingCommand({ message: '' })).toBe('tellraw @a {"text": ""}');
  });

  it('builds template data and the example bundle', async () => {
    const template = plugin.contributes.elementTemplates?.[0];
    const data = await template?.data({
      id: 'demo:hello',
      namespace: 'demo',
      path: 'hello',
      projectNamespace: 'demo',
      namespaces: ['demo'],
      kindDefault: { message: 'Hello!' },
      target: TARGET,
    });
    expect(data).toEqual({ message: 'Hello from hello!', colour: 'gold' });
    const bundle = await plugin.contributes.examples?.[0]?.build({
      namespace: 'demo',
      projectName: 'Demo',
      target: TARGET,
      values: {},
    });
    expect(bundle?.assets).toEqual([]);
    expect(bundle?.elements.map((element) => [element.id, element.kind, element.data])).toEqual([
      ['demo:welcome', 'sample:greeting', { message: 'Welcome to Demo!', colour: 'aqua' }],
    ]);
  });

  it('warns about an empty message only', async () => {
    const problems = await validator().validate({
      elements: [
        greeting('demo:ok', { message: 'Hello' }),
        greeting('demo:blank', { message: '   ' }),
        greeting('demo:missing', {}),
      ],
      target: TARGET,
      registry: EMPTY_REGISTRY,
    });
    expect(
      problems.map((problem) => [problem.severity, problem.code, problem.elementId, problem.path]),
    ).toEqual([
      ['warning', 'sample.empty-message', 'demo:blank', '/message'],
      ['warning', 'sample.empty-message', 'demo:missing', '/message'],
    ]);
  });

  it('matches its manifest: id, API range and one capability per contribution point', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../msm-plugin.json', import.meta.url), 'utf8'),
    ) as {
      id: string;
      apiVersion: string;
      capabilities: string[];
      main: string;
      schemas: string[];
    };
    expect(manifest.id).toBe(plugin.id);
    expect(manifest.apiVersion).toBe(plugin.apiVersion);
    expect([...manifest.capabilities].sort()).toEqual(Object.keys(plugin.contributes).sort());
    expect(manifest.main).toBe('main.js');
    expect(manifest.schemas).toEqual(['symbols.json']);
  });
});
