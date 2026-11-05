import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type BundleContext,
  type ContentBundle,
  definePlugin,
  type ElementTemplate,
  type ExampleProject,
  type Json,
  type OutputLayer,
  type PluginContributions,
  type ProjectStarter,
  type ResourceLocation,
  type TemplateContext,
} from '../src/index';

const template: ElementTemplate = {
  id: 'block_model',
  kind: 'minecraft:model',
  title: 'Block model',
  description: 'A full cube with one texture on every side.',
  category: 'Models',
  prefix: 'block/',
  data: ({ namespace, path }) => ({
    parent: 'minecraft:block/cube_all',
    textures: { all: `${namespace}:${path}` },
  }),
};

const bundle = (context: BundleContext): ContentBundle => ({
  elements: [
    {
      id: `${context.namespace}:greet`,
      kind: 'minecraft:function',
      data: { lines: ['say hello'] },
      notes: 'Run it with /function.',
      tags: ['example', 'functions'],
    },
  ],
  assets: [
    { namespace: context.namespace, path: 'textures/item/ruby.png', bytes: new Uint8Array([1]) },
  ],
});

const starter: ProjectStarter = {
  id: 'function_starter',
  title: 'Function starter',
  description: 'A load and a tick function.',
  category: 'content',
  layers: ['datapack'],
  requiresKinds: ['minecraft:function'],
  build: bundle,
};

const example: ExampleProject = {
  id: 'function',
  title: 'Function',
  description: 'A function that greets.',
  kind: 'minecraft:function',
  category: 'Functions',
  tags: ['commands'],
  requiresKinds: ['minecraft:function'],
  build: bundle,
};

describe('0.4.0 library contribution points', () => {
  it('describes what a template knows', () => {
    expectTypeOf<TemplateContext>().toEqualTypeOf<{
      id: ResourceLocation;
      namespace: string;
      path: string;
      projectNamespace: string;
      namespaces: readonly string[];
      kindDefault: Json | undefined;
    }>();
    expectTypeOf<ElementTemplate['data']>().toEqualTypeOf<(context: TemplateContext) => Json>();
    expectTypeOf<ElementTemplate['prefix']>().toEqualTypeOf<string | undefined>();
  });

  it('builds template data from the context', () => {
    const context: TemplateContext = {
      id: 'demo:block/ruby_ore',
      namespace: 'demo',
      path: 'block/ruby_ore',
      projectNamespace: 'demo',
      namespaces: ['demo'],
      kindDefault: undefined,
    };
    expect(template.data(context)).toEqual({
      parent: 'minecraft:block/cube_all',
      textures: { all: 'demo:block/ruby_ore' },
    });
  });

  it('types starters and examples as bundle builders', () => {
    expectTypeOf<ProjectStarter['category']>().toEqualTypeOf<'blank' | 'pack' | 'content'>();
    expectTypeOf<ProjectStarter['layers']>().toEqualTypeOf<OutputLayer[]>();
    expectTypeOf<ProjectStarter['build']>().toEqualTypeOf<
      (context: BundleContext) => ContentBundle
    >();
    expectTypeOf<ExampleProject['build']>().toEqualTypeOf<ProjectStarter['build']>();
    expectTypeOf<ContentBundle['assets'][number]['bytes']>().toEqualTypeOf<Uint8Array>();
    const built = example.build({ namespace: 'demo', projectName: 'Demo' });
    expect(built.elements.map((element) => element.id)).toEqual(['demo:greet']);
    expect(built.assets[0]?.path).toBe('textures/item/ruby.png');
  });

  it('adds three optional contribution fields', () => {
    expectTypeOf<PluginContributions['elementTemplates']>().toEqualTypeOf<
      ElementTemplate[] | undefined
    >();
    expectTypeOf<PluginContributions['projectStarters']>().toEqualTypeOf<
      ProjectStarter[] | undefined
    >();
    expectTypeOf<PluginContributions['examples']>().toEqualTypeOf<ExampleProject[] | undefined>();
    const plugin = definePlugin({
      id: 'test.library',
      apiVersion: '^0.7.0',
      contributes: {
        elementTemplates: [template],
        projectStarters: [starter],
        examples: [example],
      },
    });
    expect(plugin.contributes.projectStarters?.[0]?.id).toBe('function_starter');
  });
});
