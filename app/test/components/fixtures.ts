import type { Element, Json, Project, ResourceLocation } from '@msm/core';

/** Builds an element with fixed metadata. */
export function element(id: ResourceLocation, kind: string, data: Json = {}): Element {
  return { formatVersion: 1, id, kind, data, meta: { createdAt: '2000-01-01T00:00:00.000Z' } };
}

/** A small two-namespace project. */
export function sampleProject(): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        elements: [
          element('demo:block/ruby_block', 'minecraft:model', { parent: 'block/cube_all' }),
          element('demo:item/ruby', 'minecraft:model'),
          element('demo:ruby_block', 'minecraft:block_definition'),
        ],
        assets: [{ path: 'textures/block/ruby_block.png', mediaType: 'image/png' }],
      },
      { name: 'empty', elements: [], assets: [] },
    ],
  };
}
