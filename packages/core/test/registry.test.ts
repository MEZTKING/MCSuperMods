import { API_VERSION, definePlugin } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  DuplicateKindError,
  defaultKindRegistry,
  ElementKindRegistry,
  PluginCompatibilityError,
  registerPlugin,
} from '../src/index';
import { nestedKind, testPlugin, thingKind } from './helpers/kinds';

describe('ElementKindRegistry', () => {
  it('registers and looks up kinds by id and folder', () => {
    const registry = new ElementKindRegistry();
    registry.register(thingKind);
    registry.register(nestedKind);
    expect(registry.get('test:thing')).toBe(thingKind);
    expect(registry.get('test:missing')).toBeUndefined();
    expect(registry.folderFor('test:nested')).toBe('test/nested');
    expect(registry.kindForFolder('thing')).toBe(thingKind);
    expect(registry.all()).toEqual([thingKind, nestedKind]);
  });

  it('resolves the registry of a kind from its declaration or its id', () => {
    const registry = new ElementKindRegistry();
    registry.register(thingKind);
    registry.register({ ...thingKind, id: 'minecraft:recipe', folder: 'recipe' });
    registry.register({
      ...thingKind,
      id: 'minecraft:structure_template',
      folder: 'structure',
      registry: 'structure',
    });
    expect(registry.registryFor('test:thing')).toBe('test:thing');
    expect(registry.registryFor('minecraft:recipe')).toBe('recipe');
    expect(registry.registryFor('minecraft:structure_template')).toBe('structure');
    expect(registry.registryFor('minecraft:missing')).toBeUndefined();
    expect(defaultKindRegistry('minecraft:tag/item')).toBe('tag/item');
  });

  it('throws on a duplicate kind id', () => {
    const registry = new ElementKindRegistry();
    registry.register(thingKind);
    expect(() => registry.register({ ...thingKind, folder: 'other' })).toThrow(DuplicateKindError);
  });

  it('throws on a duplicate folder', () => {
    const registry = new ElementKindRegistry();
    registry.register(thingKind);
    expect(() => registry.register({ ...thingKind, id: 'test:other' })).toThrow(DuplicateKindError);
  });
});

describe('registerPlugin', () => {
  it('accepts a compatible apiVersion range', () => {
    expect(API_VERSION).toBe('0.8.0');
    const registry = new ElementKindRegistry();
    registerPlugin(registry, testPlugin('^0.8.0'));
    expect(registry.all().map((kind) => kind.id)).toEqual(['test:thing', 'test:nested']);
  });

  it('rejects an incompatible apiVersion range', () => {
    const registry = new ElementKindRegistry();
    expect(() => registerPlugin(registry, testPlugin('^1.0.0'))).toThrow(PluginCompatibilityError);
    expect(registry.all()).toEqual([]);
  });

  it('rejects a plugin still declaring the previous minor range', () => {
    const registry = new ElementKindRegistry();
    expect(() => registerPlugin(registry, testPlugin('^0.7.0'))).toThrow(PluginCompatibilityError);
    expect(registry.all()).toEqual([]);
  });

  it('rejects an invalid range', () => {
    expect(() => registerPlugin(new ElementKindRegistry(), testPlugin('not a range'))).toThrow(
      PluginCompatibilityError,
    );
  });

  it('checks against an overridden API version', () => {
    const registry = new ElementKindRegistry();
    registerPlugin(registry, testPlugin('^1.0.0'), { apiVersion: '1.2.0' });
    expect(registry.all()).toHaveLength(2);
  });

  it('registers nothing when one of the plugin kinds is a duplicate', () => {
    const registry = new ElementKindRegistry();
    registry.register(nestedKind);
    const plugin = definePlugin({
      id: 'test.partial',
      apiVersion: '^0.8.0',
      contributes: {
        elementKinds: [{ ...thingKind, id: 'test:fresh', folder: 'fresh' }, nestedKind],
      },
    });
    expect(() => registerPlugin(registry, plugin)).toThrow(DuplicateKindError);
    expect(registry.get('test:fresh')).toBeUndefined();
  });

  it('ignores contributions it does not register, such as templates and starters', () => {
    const registry = new ElementKindRegistry();
    const plugin = definePlugin({
      id: 'test.library',
      apiVersion: '^0.8.0',
      contributes: {
        elementTemplates: [
          {
            id: 'thing',
            kind: 'test:thing',
            title: 'Thing',
            description: 'A thing.',
            category: 'Things',
            data: () => ({}),
          },
        ],
        projectStarters: [],
        examples: [],
        ...({ futureField: true } as object),
      },
    });
    registerPlugin(registry, plugin);
    expect(registry.all()).toEqual([]);
  });

  it('accepts plugins without element kinds', () => {
    const registry = new ElementKindRegistry();
    registerPlugin(registry, definePlugin({ id: 'empty', apiVersion: '^0.8.0', contributes: {} }));
    expect(registry.all()).toEqual([]);
  });
});
