import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type BundleContext,
  type ContentBundle,
  type CreatorGroup,
  definePlugin,
  type ElementCreatorMeta,
  type ElementMeta,
  type ElementTemplate,
  type ExampleProject,
  type ImageStarterParameter,
  type ItemFacts,
  type Json,
  type MaybePromise,
  type OutputLayer,
  type PluginContributions,
  type ProjectStarter,
  type ResourceLocation,
  type SetStarterParameter,
  type StarterCreatorInfo,
  type StarterParameter,
  type TargetFacts,
  type TemplateContext,
} from '../src/index';
import { testTarget } from './target-fixture';

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
      target: TargetFacts;
    }>();
    expectTypeOf<ElementTemplate['data']>().toEqualTypeOf<
      (context: TemplateContext) => MaybePromise<Json>
    >();
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
      target: testTarget,
    };
    expect(template.data(context)).toEqual({
      parent: 'minecraft:block/cube_all',
      textures: { all: 'demo:block/ruby_ore' },
    });
  });

  it('types starters and examples as bundle builders', async () => {
    expectTypeOf<ProjectStarter['category']>().toEqualTypeOf<'blank' | 'pack' | 'content'>();
    expectTypeOf<ProjectStarter['layers']>().toEqualTypeOf<OutputLayer[]>();
    expectTypeOf<ProjectStarter['build']>().toEqualTypeOf<
      (context: BundleContext) => MaybePromise<ContentBundle>
    >();
    expectTypeOf<ExampleProject['build']>().toEqualTypeOf<ProjectStarter['build']>();
    expectTypeOf<ContentBundle['assets'][number]['bytes']>().toEqualTypeOf<Uint8Array>();
    const built = await example.build({
      namespace: 'demo',
      projectName: 'Demo',
      target: testTarget,
      values: {},
    });
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
      apiVersion: '^1.0.0',
      contributes: {
        elementTemplates: [template],
        projectStarters: [starter],
        examples: [example],
      },
    });
    expect(plugin.contributes.projectStarters?.[0]?.id).toBe('function_starter');
  });
});

describe('1.0.0 library additions', () => {
  it('passes the target and parameter values to bundles', async () => {
    expectTypeOf<BundleContext['target']>().toEqualTypeOf<TargetFacts>();
    expectTypeOf<BundleContext['values']>().toEqualTypeOf<Readonly<Record<string, Json>>>();
    expectTypeOf<TemplateContext['target']>().toEqualTypeOf<TargetFacts>();
    const sized: ProjectStarter = {
      ...starter,
      parameters: [
        { id: 'name', label: 'Name', type: 'string', default: 'ruby', pattern: '^[a-z_]+$' },
        { id: 'count', label: 'Count', type: 'number', default: 8, min: 1, max: 32, step: 1 },
        { id: 'glow', label: 'Glows', type: 'boolean', default: false, group: 'Look' },
        { id: 'tint', label: 'Tint', type: 'colour', default: '#d01a3c', group: 'Look' },
        {
          id: 'tool',
          label: 'Tool',
          type: 'choice',
          default: 'pickaxe',
          choices: [
            { value: 'pickaxe', label: 'Pickaxe' },
            { value: 'shovel', label: 'Shovel' },
          ],
        },
      ],
      build: async ({ namespace, values }) => ({
        elements: [
          {
            id: `${namespace}:${String(values.name)}`,
            kind: 'minecraft:function',
            data: { lines: [`say ${String(values.count)}`] },
          },
        ],
        assets: [],
      }),
    };
    const built = await sized.build({
      namespace: 'demo',
      projectName: 'Demo',
      target: testTarget,
      values: { name: 'opal', count: 3, glow: false, tint: '#ffffff', tool: 'shovel' },
    });
    expect(built.elements[0]).toMatchObject({ id: 'demo:opal', data: { lines: ['say 3'] } });
    expect(sized.parameters?.map((parameter) => parameter.type)).toEqual([
      'string',
      'number',
      'boolean',
      'colour',
      'choice',
    ]);
  });

  it('narrows a starter parameter by its type', () => {
    const describe = (parameter: StarterParameter): string => {
      switch (parameter.type) {
        case 'string':
          return `${parameter.default}/${parameter.pattern ?? ''}`;
        case 'number':
          return String(parameter.default + (parameter.min ?? 0));
        case 'boolean':
          return parameter.default ? 'yes' : 'no';
        case 'colour':
          return parameter.default;
        case 'choice':
          return parameter.choices.map((choice) => choice.value).join(',');
        case 'set':
          return parameter.default.join('+');
      }
    };
    expect(describe({ id: 'a', label: 'A', type: 'number', default: 2, min: 1 })).toBe('3');
    expectTypeOf<StarterParameter['group']>().toEqualTypeOf<string | undefined>();
  });

  it('adds optional supports gates to templates, starters and examples', () => {
    expectTypeOf<ElementTemplate['supports']>().toEqualTypeOf<
      ((target: TargetFacts) => boolean) | undefined
    >();
    expectTypeOf<ProjectStarter['supports']>().toEqualTypeOf<ElementTemplate['supports']>();
    expectTypeOf<ExampleProject['supports']>().toEqualTypeOf<ElementTemplate['supports']>();
    const gated: ElementTemplate = {
      ...template,
      supports: (target) => target.geckolib !== undefined,
    };
    expect(gated.supports?.(testTarget)).toBe(false);
  });
});

describe('1.1.0 additions', () => {
  it('lists a starter in the Creator with a group and a blurb', () => {
    expectTypeOf<ProjectStarter['creator']>().toEqualTypeOf<StarterCreatorInfo | undefined>();
    expectTypeOf<StarterCreatorInfo['group']>().toEqualTypeOf<CreatorGroup>();
    expectTypeOf<CreatorGroup>().toEqualTypeOf<'gear' | 'blocks' | 'food' | 'mobs' | 'scripts'>();
    const flow: ProjectStarter = {
      ...starter,
      creator: { group: 'gear', blurb: 'Tools and armour of one material.' },
    };
    expect(flow.creator?.group).toBe('gear');
  });

  it('declares the set parameter with a string[] default', () => {
    expectTypeOf<SetStarterParameter['type']>().toEqualTypeOf<'set'>();
    expectTypeOf<SetStarterParameter['default']>().toEqualTypeOf<string[]>();
    expectTypeOf<SetStarterParameter['min']>().toEqualTypeOf<number | undefined>();
    const pieces: SetStarterParameter = {
      id: 'pieces',
      label: 'Pieces',
      type: 'set',
      choices: [
        { value: 'sword', label: 'Sword' },
        { value: 'helmet', label: 'Helmet' },
      ],
      default: ['sword', 'helmet'],
      min: 1,
    };
    const values: BundleContext['values'] = { pieces: pieces.default };
    expect(values.pieces).toEqual(['sword', 'helmet']);
    // A member of the union, so a starter can declare it.
    expectTypeOf<SetStarterParameter>().toExtend<StarterParameter>();
    const declared: StarterParameter[] = [pieces];
    expect(declared[0]?.type).toBe('set');
  });

  it('records where a Creator-made element came from', () => {
    expectTypeOf<ElementMeta['creator']>().toEqualTypeOf<ElementCreatorMeta | undefined>();
    expectTypeOf<ElementCreatorMeta['values']>().toEqualTypeOf<
      Record<string, string | number | boolean | string[]>
    >();
    const meta: ElementMeta = {
      createdAt: '2026-01-01T00:00:00.000Z',
      creator: {
        flowId: 'gear-set',
        setId: 'set-1',
        values: { material_name: 'Ruby', pieces: ['sword'] },
        generatedId: 'demo:ruby_sword',
      },
    };
    expect(meta.creator?.generatedId).toBe('demo:ruby_sword');
  });

  it('carries optional item facts on a target', () => {
    expectTypeOf<TargetFacts['items']>().toEqualTypeOf<ItemFacts | undefined>();
    expectTypeOf<ItemFacts['armorMaterials']>().toEqualTypeOf<readonly string[]>();
    const facts: TargetFacts = { ...testTarget, items: { armorMaterials: ['iron'] } };
    expect(facts.items?.armorMaterials).toEqual(['iron']);
    expect(testTarget.items).toBeUndefined();
  });
});

describe('1.2.0 additions', () => {
  it('declares the image parameter with a null default and PNG data URL values', () => {
    expectTypeOf<ImageStarterParameter['type']>().toEqualTypeOf<'image'>();
    expectTypeOf<ImageStarterParameter['default']>().toEqualTypeOf<null>();
    expectTypeOf<ImageStarterParameter['maxBytes']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ImageStarterParameter['maxSize']>().toEqualTypeOf<number | undefined>();
    const image: ImageStarterParameter = {
      id: 'image',
      label: 'Image',
      group: 'Painting',
      type: 'image',
      default: null,
      maxBytes: 1_048_576,
      maxSize: 64,
    };
    const values: BundleContext['values'] = {
      image: image.default,
      other: 'data:image/png;base64,iVBORw0KGgo=',
    };
    expect(values.image).toBeNull();
    expect(String(values.other).startsWith('data:image/png;base64,')).toBe(true);
    // Not yet in the union: B189 adds it with the wizard and the library.
    expectTypeOf<ImageStarterParameter>().not.toExtend<StarterParameter>();
  });
});
