import { definePlugin, type ElementKind, type Plugin } from '@msm/plugin-api';
import { ElementKindRegistry } from '../../src/index';

export const thingKind: ElementKind = {
  id: 'test:thing',
  schema: '::test::Thing',
  folder: 'thing',
  lower: () => [],
};

export const nestedKind: ElementKind = {
  id: 'test:nested',
  schema: '::test::Nested',
  folder: 'test/nested',
  lower: () => [],
};

export function testPlugin(apiVersion = '^0.7.0'): Plugin {
  return definePlugin({
    id: 'test.things',
    apiVersion,
    contributes: { elementKinds: [thingKind, nestedKind] },
  });
}

export function testRegistry(): ElementKindRegistry {
  const registry = new ElementKindRegistry();
  registry.register(thingKind);
  registry.register(nestedKind);
  return registry;
}

export const fixedNow = (): string => '2026-11-04T12:00:00.000Z';
