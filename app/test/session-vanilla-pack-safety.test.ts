/**
 * Vanilla pack safety in the session (ADR 0066): the vanilla data pack export leaves out files
 * naming ids only the mod jar registers, makes tag entries optional and warns on functions;
 * the Fabric mod jar keeps everything, and projects without mod content are untouched. The
 * rule itself is unit-tested in `packages/exporters/test/mod-only.test.ts`.
 */
import { createMemoryFileSystem, type Problem } from '@msm/core';
import { MOD_ONLY_FUNCTION, MOD_ONLY_REFERENCE, modOnlyReferenceMessage } from '@msm/exporters';
import type { Json, ResourceLocation } from '@msm/plugin-api';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newSession } from './session-fixture';

const SHAPELESS = (ingredient: string, result: string): Json => ({
  type: 'minecraft:crafting_shapeless',
  category: 'misc',
  ingredients: [ingredient],
  result: { id: result, count: 1 },
});
const VANILLA_ELEMENTS: { id: ResourceLocation; kind: string; data: Json }[] = [
  {
    id: 'demo:diamond_from_coal',
    kind: 'minecraft:recipe',
    data: SHAPELESS('minecraft:coal', 'minecraft:diamond'),
  },
  { id: 'demo:gems', kind: 'minecraft:tag/item', data: { values: ['minecraft:diamond'] } },
  { id: 'demo:hello', kind: 'minecraft:function', data: { lines: ['say hello'] } },
];
const MOD_ELEMENTS: { id: ResourceLocation; kind: string; data: Json }[] = [
  {
    id: 'demo:ruby_from_diamond',
    kind: 'minecraft:recipe',
    data: SHAPELESS('minecraft:diamond', 'demo:ruby'),
  },
  {
    id: 'demo:ruby_drop',
    kind: 'minecraft:loot_table',
    data: { pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'demo:ruby' }] }] },
  },
  {
    id: 'demo:shiny',
    kind: 'minecraft:tag/item',
    data: { values: ['minecraft:diamond', 'demo:ruby'] },
  },
  { id: 'demo:give_ruby', kind: 'minecraft:function', data: { lines: ['give @s demo:ruby'] } },
];

async function modSession(elements: { id: ResourceLocation; kind: string; data?: Json }[]) {
  const fixture = newSession(createMemoryFileSystem());
  await fixture.session.newProject();
  for (const element of elements) fixture.session.addElement(element);
  await fixture.session.flushValidation();
  return fixture;
}

const unzipText = (bytes: Uint8Array | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [path, data] of Object.entries(unzipSync(bytes ?? new Uint8Array()))) {
    out[path] = new TextDecoder().decode(data);
  }
  return out;
};
const modOnly = (problems: readonly Problem[]) =>
  problems.filter(
    (problem) => problem.code === MOD_ONLY_REFERENCE || problem.code === MOD_ONLY_FUNCTION,
  );

describe('ProjectSession: vanilla data pack safety (ADR 0066)', () => {
  it('leaves out files naming mod items, makes tag entries optional and warns on functions', async () => {
    const { session, calls } = await modSession([
      { id: 'demo:ruby', kind: 'msm:item' },
      ...VANILLA_ELEMENTS,
      ...MOD_ELEMENTS,
    ]);
    const result = await session.exportPack('data', 'zip');
    expect(result.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(
      modOnly(result.problems).map((problem) => [problem.code, problem.elementId, problem.file]),
    ).toEqual([
      [MOD_ONLY_REFERENCE, 'demo:ruby_drop', 'data/demo/loot_table/ruby_drop.json'],
      [MOD_ONLY_REFERENCE, 'demo:ruby_from_diamond', 'data/demo/recipe/ruby_from_diamond.json'],
      [MOD_ONLY_FUNCTION, 'demo:give_ruby', 'data/demo/function/give_ruby.mcfunction'],
    ]);
    const zip = unzipText(calls.saved[0]?.data);
    expect(Object.keys(zip)).not.toContain('data/demo/recipe/ruby_from_diamond.json');
    expect(Object.keys(zip)).not.toContain('data/demo/loot_table/ruby_drop.json');
    expect(Object.keys(zip)).toContain('data/demo/recipe/diamond_from_coal.json');
    expect(zip['data/demo/function/give_ruby.mcfunction']).toBe('give @s demo:ruby\n');
    expect(JSON.parse(zip['data/demo/tags/item/shiny.json'] ?? '')).toEqual({
      values: ['minecraft:diamond', { id: 'demo:ruby', required: false }],
    });
    expect(JSON.parse(zip['data/demo/tags/item/gems.json'] ?? '')).toEqual({
      values: ['minecraft:diamond'],
    });
    expect(result.files).not.toContain('data/demo/recipe/ruby_from_diamond.json');
  }, 60_000);

  it('does the same in both packs, warning once', async () => {
    const { session, platform } = await modSession([
      { id: 'demo:ruby', kind: 'msm:item' },
      ...MOD_ELEMENTS,
    ]);
    const files: Record<string, Uint8Array> = {};
    platform.exports.pickFolder = async () => '/exports/both';
    platform.exports.writeFiles = async (folder, list) => {
      for (const file of list) files[file.name] = file.data;
      return { paths: list.map((file) => `${folder}/${file.name}`) };
    };
    const result = await session.exportPack('data', 'combined');
    expect(result.ok).toBe(true);
    expect(modOnly(result.problems)).toHaveLength(3);
    const data = Object.entries(files).find(([name]) => name.endsWith('-data.zip'))?.[1];
    expect(Object.keys(unzipText(data))).not.toContain('data/demo/recipe/ruby_from_diamond.json');
  }, 60_000);

  it('leaves a modded block loot table out', async () => {
    const { session } = await modSession([{ id: 'demo:ruby_block', kind: 'msm:block' }]);
    const result = await session.exportPack('data', 'zip');
    expect(modOnly(result.problems)).toEqual([
      expect.objectContaining({
        elementId: 'demo:ruby_block',
        message: modOnlyReferenceMessage(
          'data/demo/loot_table/blocks/ruby_block.json',
          'demo:ruby_block',
        ),
      }),
    ]);
  }, 60_000);

  it('keeps every file in the mod jar, without the warnings', async () => {
    const { session, calls, platform } = await modSession([
      { id: 'demo:ruby', kind: 'msm:item' },
      ...MOD_ELEMENTS,
    ]);
    platform.exports = {
      ...platform.exports,
      runtimeJar: async () => new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    };
    const result = await session.exportFabricJar();
    expect(result.ok).toBe(true);
    expect(modOnly(result.problems)).toEqual([]);
    const zip = unzipText(calls.saved.at(-1)?.data);
    expect(Object.keys(zip)).toContain('data/demo/recipe/ruby_from_diamond.json');
    expect(Object.keys(zip)).toContain('data/demo/loot_table/ruby_drop.json');
    expect(JSON.parse(zip['data/demo/tags/item/shiny.json'] ?? '')).toEqual({
      values: ['minecraft:diamond', 'demo:ruby'],
    });
  }, 60_000);

  it('exports a project without references to mod content byte-identically', async () => {
    const plain = await modSession(VANILLA_ELEMENTS);
    const modded = await modSession([{ id: 'demo:ruby', kind: 'msm:item' }, ...VANILLA_ELEMENTS]);
    const a = await plain.session.exportPack('data', 'zip');
    const b = await modded.session.exportPack('data', 'zip');
    expect(modOnly(a.problems)).toEqual([]);
    expect(modOnly(b.problems)).toEqual([]);
    expect(plain.calls.saved[0]?.data).toEqual(modded.calls.saved[0]?.data);
  }, 60_000);
});
