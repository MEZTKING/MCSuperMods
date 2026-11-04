/**
 * Library fakes (ADR 0020) for the component tests, which cannot import `../session-fixture`
 * (it lies outside the web tsconfig). They mirror the fakes of that file: a starter and an
 * example with generated textures, and a plugin contributing them plus entries that need an
 * unregistered kind (which the host hides).
 */

import {
  type BundleContext,
  type ContentBundle,
  definePlugin,
  type ElementKind,
  type ExampleProject,
  type Plugin,
  type ProjectStarter,
} from '@msm/plugin-api';
import { placeholderPng } from '@msm/plugin-library';

function starterBundle({ namespace }: BundleContext): ContentBundle {
  return {
    elements: [
      {
        id: `${namespace}:item/ruby`,
        kind: 'minecraft:model',
        data: {
          parent: 'minecraft:item/generated',
          textures: { layer0: `${namespace}:item/ruby` },
        },
        notes: 'A flat item model drawn from the generated ruby texture.',
      },
      { id: `${namespace}:greet`, kind: 'minecraft:function', data: { lines: ['say Hello'] } },
      {
        id: 'minecraft:load',
        kind: 'minecraft:tag/function',
        data: { values: [`${namespace}:greet`] },
      },
    ],
    assets: [{ namespace, path: 'textures/item/ruby.png', bytes: placeholderPng('gem') }],
  };
}

/** A content starter spanning both layers. */
export const fakeStarter: ProjectStarter = {
  id: 'test_starter',
  title: 'Test starter',
  description: 'A model, a texture, a function and the load tag.',
  category: 'content',
  layers: ['resourcepack', 'datapack'],
  requiresKinds: ['minecraft:model', 'minecraft:function', 'minecraft:tag/function'],
  build: starterBundle,
};

/** A block model on a generated ore texture, with notes. */
export const fakeExample: ExampleProject = {
  id: 'test_example',
  title: 'Ore block model',
  description: 'A cube_all block model on a generated texture.',
  kind: 'minecraft:model',
  category: 'Models',
  tags: ['ore'],
  requiresKinds: ['minecraft:model'],
  build: ({ namespace }) => ({
    elements: [
      {
        id: `${namespace}:block/ruby_ore`,
        kind: 'minecraft:model',
        data: {
          parent: 'minecraft:block/cube_all',
          textures: { all: `${namespace}:block/ruby_ore` },
        },
        notes: 'Every face shows the same texture.',
      },
    ],
    assets: [{ namespace, path: 'textures/block/ruby_ore.png', bytes: placeholderPng('ore') }],
  }),
};

const noteKind: ElementKind = {
  id: 'test:note',
  schema: '::java::data::recipe::Recipe',
  folder: 'test_note',
  lower: () => [],
};

/** A plugin contributing the fakes, plus a starter and an example the host hides. */
export const fakeLibraryPlugin: Plugin = definePlugin({
  id: 'test.library',
  apiVersion: '^0.5.0',
  contributes: {
    elementKinds: [noteKind],
    elementTemplates: [
      {
        id: 'note',
        kind: 'test:note',
        title: 'Note',
        description: 'A note.',
        category: 'Notes',
        data: ({ projectNamespace }) => ({ text: `Hello from ${projectNamespace}` }),
      },
    ],
    projectStarters: [
      fakeStarter,
      { ...fakeStarter, id: 'needs_missing', requiresKinds: ['test:missing'] },
    ],
    examples: [
      fakeExample,
      { ...fakeExample, id: 'needs_missing', requiresKinds: ['test:missing'] },
    ],
  },
});
