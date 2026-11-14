/**
 * Potions in the app session (B253, ADR 0063 D6, D9): project potions and their `long_` and
 * `strong_` versions are `potion` ids for completion and validation; vanilla pack exports leave
 * every potion file out (finding P8: an unknown potion in a brewing recipe stops the whole
 * data pack loading) and warn once with `blocks-items.potion-needs-jar`; the mod jar keeps them.
 */
import { createMemoryFileSystem, type Problem, type Project } from '@msm/core';
import type { Json } from '@msm/plugin-api';
import { POTION_NEEDS_JAR_CODE } from '@msm/plugin-blocks-items';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  dataRegistryIds,
  potionRegistryIds,
  projectRegistryIds,
} from '../src/renderer/src/session/schema-context';
import { createCompletionSource } from '../src/renderer/src/studios/completions';
import { newSession } from './session-fixture';

const POTION: Json = {
  format: 1,
  display_name: 'Frost',
  effects: [{ id: 'minecraft:slowness', duration_ticks: 3600 }],
  brewing: { reagent: 'minecraft:snowball' },
  long: { duration_ticks: 9600 },
  strong: { amplifier: 1, duration_ticks: 1800 },
};
const IDS = ['demo:frost', 'demo:long_frost', 'demo:strong_frost'];

const brewing = (input: string, output: string): Json => ({
  type: 'minecraft:brewing',
  input: { item: 'minecraft:potion', potion_contents: { potions: input } },
  reagent: { item: 'minecraft:sugar' },
  output: {
    id: 'minecraft:potion',
    components: { 'minecraft:potion_contents': { potion: output } },
  },
});

function projectWith(elements: { id: `${string}:${string}`; kind: string; data: Json }[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        assets: [],
        elements: elements.map((element) => ({
          formatVersion: 1,
          meta: { createdAt: '2026-01-01T00:00:00.000Z' },
          ...element,
        })),
      },
    ],
  };
}

describe('potion registry ids (ADR 0063 D9)', () => {
  it('adds a potion with its long_ and strong_ versions to the potion registry', () => {
    const project = projectWith([{ id: 'demo:frost', kind: 'msm:potion', data: POTION }]);
    expect(dataRegistryIds(project).potion).toEqual(IDS);
    expect(projectRegistryIds(project).potion).toEqual(IDS);
  });

  it('adds only the versions the potion has', () => {
    const plain = { format: 1, effects: [{ id: 'minecraft:speed', duration_ticks: 20 }] };
    const project = projectWith([
      { id: 'demo:quick', kind: 'msm:potion', data: plain },
      {
        id: 'demo:deep/slow',
        kind: 'msm:potion',
        data: { ...plain, long: { duration_ticks: 40 } },
      },
    ]);
    expect(dataRegistryIds(project).potion).toEqual([
      'demo:deep/slow',
      'demo:long_deep/slow',
      'demo:quick',
    ]);
  });

  it('falls back to the element id when the data cannot be read', () => {
    const [element] =
      projectWith([{ id: 'demo:odd', kind: 'msm:potion', data: 'nope' }]).namespaces[0]?.elements ??
      [];
    if (element === undefined) throw new Error('unreachable');
    expect(potionRegistryIds(element)).toEqual(['demo:odd']);
  });
});

async function potionSession(extra: { id: `${string}:${string}`; kind: string; data: Json }[]) {
  const fs = createMemoryFileSystem();
  const fixture = newSession(fs);
  await fixture.session.newProject();
  fixture.session.addElement({ id: 'demo:frost', kind: 'msm:potion', data: POTION });
  for (const element of extra) fixture.session.addElement(element);
  await fixture.session.flushValidation();
  return fixture;
}

const unknownIds = (problems: readonly Problem[]) =>
  problems.filter((problem) => problem.code === 'schema.unknown-id');

describe('ProjectSession: project potions in vanilla files', () => {
  it('validates project potion ids in a brewing recipe and a potion tag; flags unknown ones', async () => {
    const { session } = await potionSession([
      {
        id: 'demo:frost_up',
        kind: 'minecraft:recipe',
        data: brewing('demo:frost', 'demo:long_frost'),
      },
      {
        id: 'demo:frost_strong_again',
        kind: 'minecraft:recipe',
        data: brewing('demo:strong_frost', 'demo:frost'),
      },
      {
        id: 'demo:cold',
        kind: 'minecraft:tag/potion',
        data: { values: ['demo:frost', 'demo:long_frost', 'demo:strong_frost'] },
      },
      { id: 'demo:bad', kind: 'minecraft:recipe', data: brewing('demo:nope', 'demo:frost') },
      { id: 'demo:bad_tag', kind: 'minecraft:tag/potion', data: { values: ['demo:nope'] } },
    ]);
    expect(unknownIds(session.problemsFor('demo:frost_up'))).toEqual([]);
    expect(unknownIds(session.problemsFor('demo:frost_strong_again'))).toEqual([]);
    expect(unknownIds(session.problemsFor('demo:cold'))).toEqual([]);
    expect(unknownIds(session.problemsFor('demo:bad'))).toEqual([
      expect.objectContaining({ path: '/input/potion_contents/potions' }),
    ]);
    expect(unknownIds(session.problemsFor('demo:bad_tag'))).toHaveLength(1);
  }, 60_000);

  it('completes project potions and their versions as potion ids', async () => {
    const { session } = await potionSession([]);
    const project = session.snapshot.project as Project;
    const context = await session.schemas();
    const recipe = createCompletionSource(project, context.registries(project, 'minecraft:recipe'));
    const all = recipe.suggest('potion', 'demo:');
    for (const id of IDS) expect(all).toContain(id);
    expect(recipe.suggest('potion', 'long_fr')).toEqual(['demo:long_frost']);
    expect(recipe.suggest('potion', 'demo:nope')).toEqual([]);
    expect(recipe.suggest('potion', 'awkw')).toContain('minecraft:awkward');
  }, 60_000);
});

const BREWING_PREFIX = 'data/demo/recipe/brewing/';

describe('ProjectSession export: potions need the mod jar (ADR 0063 D6, P8)', () => {
  it('leaves potion files out of the data pack and warns once', async () => {
    const { session, calls } = await potionSession([]);
    const result = await session.exportPack('data', 'zip');
    expect(result.ok).toBe(true);
    const warnings = result.problems.filter((problem) => problem.code === POTION_NEEDS_JAR_CODE);
    expect(warnings).toEqual([
      expect.objectContaining({ severity: 'warning', elementId: 'demo:frost' }),
    ]);
    const zip = unzipSync(calls.saved[0]?.data ?? new Uint8Array());
    const paths = Object.keys(zip);
    expect(paths.some((path) => path.includes('/brewing/'))).toBe(false);
    const text = paths.map((path) => new TextDecoder().decode(zip[path])).join('\n');
    expect(text).not.toContain('demo:frost');
  }, 60_000);

  it('leaves them out of both packs and warns once', async () => {
    const { session, platform } = await potionSession([]);
    const files: Record<string, Uint8Array> = {};
    platform.exports.pickFolder = async () => '/exports/both';
    platform.exports.writeFiles = async (folder, list) => {
      for (const file of list) files[file.name] = file.data;
      return { paths: list.map((file) => `${folder}/${file.name}`) };
    };
    const result = await session.exportPack('data', 'combined');
    expect(result.ok).toBe(true);
    expect(
      result.problems.filter((problem) => problem.code === POTION_NEEDS_JAR_CODE),
    ).toHaveLength(1);
    for (const bytes of Object.values(files)) {
      const zip = unzipSync(bytes);
      const text = Object.keys(zip)
        .map((path) => `${path}\n${new TextDecoder().decode(zip[path])}`)
        .join('\n');
      expect(text).not.toContain('brewing/');
      expect(text).not.toContain('effect.demo.frost');
    }
  }, 60_000);

  it('does not warn without potions', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    await session.newProject();
    const result = await session.exportPack('data', 'zip');
    expect(result.problems.some((problem) => problem.code === POTION_NEEDS_JAR_CODE)).toBe(false);
  }, 60_000);

  it('keeps the potion, its versions and brewing recipes in the mod jar', async () => {
    const { session, calls, platform } = await potionSession([]);
    platform.exports = {
      ...platform.exports,
      runtimeJar: async () => new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    };
    const result = await session.exportFabricJar();
    expect(result.ok).toBe(true);
    expect(result.problems.some((problem) => problem.code === POTION_NEEDS_JAR_CODE)).toBe(false);
    const saved = calls.saved.at(-1);
    const paths = Object.keys(unzipSync(saved?.data ?? new Uint8Array()));
    for (const id of ['frost', 'long_frost', 'strong_frost']) {
      expect(paths).toContain(`msm/demo/potion/${id}.json`);
    }
    expect(paths.filter((path) => path.startsWith(BREWING_PREFIX)).length).toBeGreaterThan(0);
    expect(paths).toContain(`${BREWING_PREFIX}potion_frost.json`);
  }, 60_000);
});
