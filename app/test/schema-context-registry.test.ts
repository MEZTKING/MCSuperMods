import { ElementKindRegistry, type Project, registerPlugin } from '@msm/core';
import { definePlugin, type ElementKind } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_KIND_LOOKUP,
  dataRegistryIds,
  kindLookupFor,
  kindRegistry,
  projectRegistryIds,
} from '../src/renderer/src/session/schema-context';

const kind = (id: string, folder: string, registry?: string): ElementKind => ({
  id,
  schema: 'msm:test',
  folder,
  ...(registry === undefined ? {} : { registry }),
  lower: () => [],
});

const phase3Plugin = definePlugin({
  id: 'test.phase3',
  apiVersion: '^0.5.0',
  contributes: {
    elementKinds: [
      kind('minecraft:structure_template', 'structure', 'structure'),
      kind('minecraft:worldgen/template_pool', 'worldgen/template_pool'),
      kind('minecraft:dimension', 'dimension'),
    ],
  },
});

function project(elements: { id: `${string}:${string}`; kind: string }[]): Project {
  return {
    formatVersion: 1,
    name: 'Test',
    namespaces: [
      {
        name: 'demo',
        elements: elements.map((element) => ({
          formatVersion: 1,
          data: {},
          meta: { createdAt: '2026-01-01T00:00:00.000Z' },
          ...element,
        })),
        assets: [],
      },
    ],
    targets: ['mc-test'],
    plugins: [],
    settings: {},
  };
}

const sample = project([
  { id: 'demo:hut', kind: 'minecraft:structure_template' },
  { id: 'demo:streets', kind: 'minecraft:worldgen/template_pool' },
  { id: 'demo:sky', kind: 'minecraft:dimension' },
  { id: 'demo:ruby', kind: 'minecraft:recipe' },
  { id: 'demo:gems', kind: 'minecraft:tag/item' },
  { id: 'demo:cube', kind: 'minecraft:model' },
  { id: 'demo:pack', kind: 'minecraft:pack_mcmeta' },
]);

describe('kindRegistry', () => {
  it('reads ElementKind.registry from the kind registry', () => {
    const registry = new ElementKindRegistry();
    registerPlugin(registry, phase3Plugin);
    expect(kindRegistry('minecraft:structure_template', registry)).toBe('structure');
    expect(kindRegistry('minecraft:worldgen/template_pool', registry)).toBe(
      'worldgen/template_pool',
    );
    expect(kindRegistry('minecraft:structure_template', kindLookupFor([phase3Plugin]))).toBe(
      'structure',
    );
  });

  it('falls back to the kind id without minecraft:', () => {
    expect(kindRegistry('minecraft:recipe')).toBe('recipe');
    expect(kindRegistry('minecraft:tag/item')).toBe('tag/item');
    expect(kindRegistry('test:thing', kindLookupFor([]))).toBe('test:thing');
  });

  it('covers the built-in kinds by default', () => {
    expect(BUILT_IN_KIND_LOOKUP.registryFor('minecraft:recipe')).toBe('recipe');
    expect(BUILT_IN_KIND_LOOKUP.registryFor('minecraft:not_a_kind')).toBeUndefined();
  });
});

describe('dataRegistryIds', () => {
  it('accepts every registered data kind under its registry', () => {
    const registry = new ElementKindRegistry();
    registerPlugin(registry, phase3Plugin);
    expect(dataRegistryIds(sample, registry)).toEqual({
      dimension: ['demo:sky'],
      recipe: ['demo:ruby'],
      structure: ['demo:hut'],
      'tag/item': ['demo:gems'],
      'worldgen/template_pool': ['demo:streets'],
    });
  });

  it('keeps the data pack allow-list for unregistered kinds', () => {
    expect(dataRegistryIds(sample, kindLookupFor([]))).toEqual({
      recipe: ['demo:ruby'],
      'tag/item': ['demo:gems'],
    });
  });

  it('leaves resource pack kinds to projectRegistryIds', () => {
    const ids = projectRegistryIds(sample, kindLookupFor([phase3Plugin]));
    expect(ids.model).toEqual(['demo:cube']);
    expect(ids.structure).toEqual(['demo:hut']);
    expect(ids).not.toHaveProperty('pack_mcmeta');
  });
});
