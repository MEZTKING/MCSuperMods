import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  DataFolderKey,
  DefinitionInput,
  Element,
  ElementKind,
  Exporter,
  ExporterInput,
  ExporterOption,
  FabricFacts,
  GeckolibFacts,
  GeneratedFile,
  JavaProjectGenerator,
  JavaProjectInput,
  Json,
  JsonObject,
  MaybePromise,
  MigrationChange,
  MigrationReport,
  ModrinthFileFacts,
  OutputFile,
  OutputMergeMode,
  PluginContributions,
  Problem,
  Project,
  ProjectValidator,
  ResourceFolderKey,
  Target,
  TargetChannel,
  TargetFacts,
  ValidationInput,
  ValidationRegistry,
  WorldgenFacts,
} from '../src/index';
import { testTarget } from './target-fixture';

describe('IR and output types', () => {
  it('parameterises Element by its data', () => {
    expectTypeOf<Element<{ a: number }>>().toHaveProperty('data');
    expectTypeOf<Element<{ a: number }>['data']>().toEqualTypeOf<{ a: number }>();
    expectTypeOf<Element['data']>().toEqualTypeOf<Json>();
  });

  it('accepts a Project literal', () => {
    const project: Project = {
      formatVersion: 1,
      name: 'Example',
      namespaces: [
        {
          name: 'example',
          elements: [
            {
              formatVersion: 1,
              id: 'example:ruby',
              kind: 'minecraft:recipe',
              data: { type: 'minecraft:crafting_shaped' },
              meta: { createdAt: '2026-11-04T00:00:00.000Z', tags: ['gems'] },
            },
          ],
          assets: [{ path: 'textures/item/ruby.png', mediaType: 'image/png' }],
        },
      ],
      targets: ['mc-example'],
      plugins: ['msm.example'],
      settings: { strict: true },
    };
    expectTypeOf(project).toEqualTypeOf<Project>();
  });

  it('accepts bytes and JSON as OutputFile contents', () => {
    const bytes: OutputFile = {
      path: 'a.png',
      contents: new Uint8Array([1]),
      layer: 'resourcepack',
    };
    const json: OutputFile = { path: 'a.json', contents: { a: [1, 'b', null] }, layer: 'datapack' };
    expectTypeOf(bytes.contents).toEqualTypeOf<Uint8Array | Json>();
    expectTypeOf(json).toEqualTypeOf<OutputFile>();
  });

  it('keeps fabric and geckolib optional on Target', () => {
    expectTypeOf<Target['fabric']>().toEqualTypeOf<FabricFacts | undefined>();
    expectTypeOf<Target['geckolib']>().toEqualTypeOf<GeckolibFacts | undefined>();
  });
});

describe('0.2.0 additions', () => {
  it('adds an optional schema to OutputFile', () => {
    expectTypeOf<OutputFile['schema']>().toEqualTypeOf<string | undefined>();
    const file: OutputFile = {
      path: 'assets/example/models/ruby.json',
      contents: { parent: 'minecraft:block/cube_all' },
      layer: 'resourcepack',
      schema: '::java::assets::model::Model',
    };
    expectTypeOf(file).toEqualTypeOf<OutputFile>();
  });

  it('adds optional defaultData, hiddenPaths and previewKind to ElementKind', () => {
    expectTypeOf<ElementKind<{ a: number }>['defaultData']>().toEqualTypeOf<
      { a: number } | undefined
    >();
    expectTypeOf<ElementKind['defaultData']>().toEqualTypeOf<Json | undefined>();
    expectTypeOf<ElementKind['hiddenPaths']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<ElementKind['previewKind']>().toEqualTypeOf<string | undefined>();
    const kind: ElementKind = {
      id: 'minecraft:pack_mcmeta',
      schema: '::java::pack::Pack',
      folder: 'pack',
      defaultData: { pack: { description: '' } },
      hiddenPaths: ['/pack/pack_format'],
      lower: () => [],
    };
    expectTypeOf(kind).toEqualTypeOf<ElementKind>();
  });

  it('adds an optional per-target defaultDataFor to ElementKind (1.0.0, ADR 0036 D8)', () => {
    expectTypeOf<ElementKind['defaultDataFor']>().toEqualTypeOf<
      ((target: TargetFacts) => MaybePromise<Json>) | undefined
    >();
    const kind: ElementKind = {
      id: 'minecraft:worldgen/noise_settings',
      schema: '::java::data::worldgen::noise_settings::NoiseGeneratorSettings',
      folder: 'worldgen/noise_settings',
      defaultData: { sea_level: 63 },
      defaultDataFor: (target) => ({ sea_level: target.worldgen.featureSteps.length }),
      lower: () => [],
    };
    const asyncKind: ElementKind = { ...kind, defaultDataFor: async () => ({}) };
    expectTypeOf(kind).toEqualTypeOf<ElementKind>();
    expectTypeOf(asyncKind).toEqualTypeOf<ElementKind>();
  });

  it('adds an optional file to Problem', () => {
    expectTypeOf<Problem['file']>().toEqualTypeOf<string | undefined>();
  });

  it('requires export meta on ExporterInput', () => {
    expectTypeOf<ExporterInput['meta']>().toEqualTypeOf<{
      msmVersion: string;
      plugins: string[];
    }>();
  });

  it('requires resource folder names on Target', () => {
    expectTypeOf<ResourceFolderKey>().toEqualTypeOf<
      | 'model'
      | 'block_definition'
      | 'item_definition'
      | 'lang'
      | 'sounds_file'
      | 'textures'
      | 'atlases'
      | 'font'
    >();
    expectTypeOf<Target['folders']['resource']>().toEqualTypeOf<
      Readonly<Record<ResourceFolderKey, string>>
    >();
    expectTypeOf<Target>().toHaveProperty('folders');
  });
});

describe('0.3.0 additions', () => {
  it('adds an optional language to OutputFile', () => {
    expectTypeOf<OutputFile['language']>().toEqualTypeOf<string | undefined>();
    const file: OutputFile = {
      path: 'data/example/function/greet.mcfunction',
      contents: new TextEncoder().encode('say hello\n'),
      layer: 'datapack',
      language: 'mcfunction',
    };
    expectTypeOf(file).toEqualTypeOf<OutputFile>();
  });

  it('adds an optional range to Problem', () => {
    expectTypeOf<Problem['range']>().toEqualTypeOf<{ start: number; end: number } | undefined>();
    const problem: Problem = {
      severity: 'error',
      code: 'example.parse',
      message: 'Expected a float.',
      elementId: 'example:greet',
      path: '/lines/0',
      range: { start: 4, end: 9 },
    };
    expectTypeOf(problem).toEqualTypeOf<Problem>();
  });

  it('requires data folder names on Target', () => {
    expectTypeOf<DataFolderKey>().toEqualTypeOf<
      | 'recipe'
      | 'loot_table'
      | 'advancement'
      | 'predicate'
      | 'item_modifier'
      | 'function'
      | 'tags'
      | 'enchantment'
      | 'damage_type'
      | 'dimension_type'
      | 'chat_type'
      | 'jukebox_song'
      | 'banner_pattern'
      | 'painting_variant'
      | 'trim_material'
      | 'trim_pattern'
      | 'dialog'
      | 'structure'
      | 'dimension'
      | 'worldgen'
    >();
    expectTypeOf<Target['folders']['data']>().toEqualTypeOf<
      Readonly<Record<DataFolderKey, string>>
    >();
    expectTypeOf<Target['folders']>().toEqualTypeOf<{
      resource: Readonly<Record<ResourceFolderKey, string>>;
      data: Readonly<Record<DataFolderKey, string>>;
    }>();
  });
});

describe('0.5.0 additions', () => {
  it('adds an optional registry to ElementKind', () => {
    expectTypeOf<ElementKind['registry']>().toEqualTypeOf<string | undefined>();
    const kind: ElementKind = {
      id: 'minecraft:structure_template',
      schema: 'msm:structure_template',
      folder: 'structure',
      registry: 'structure',
      lower: () => [],
    };
    expectTypeOf(kind).toEqualTypeOf<ElementKind>();
  });

  it('types project validators', () => {
    expectTypeOf<ProjectValidator['kinds']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<ProjectValidator['validate']>().parameter(0).toEqualTypeOf<ValidationInput>();
    expectTypeOf<ProjectValidator['validate']>().returns.toEqualTypeOf<MaybePromise<Problem[]>>();
    expectTypeOf<ValidationInput['elements']>().toEqualTypeOf<readonly Element[]>();
    expectTypeOf<ValidationInput['target']>().toEqualTypeOf<TargetFacts>();
    expectTypeOf<ValidationInput['registry']>().toEqualTypeOf<ValidationRegistry>();
    expectTypeOf<ValidationRegistry['ids']>().returns.toEqualTypeOf<readonly string[]>();
    expectTypeOf<PluginContributions['validators']>().toEqualTypeOf<
      ProjectValidator[] | undefined
    >();
    const validator: ProjectValidator = {
      id: 'msm.example.empty',
      kinds: ['minecraft:recipe'],
      validate: ({ elements, registry }) =>
        elements.length === 0 && !registry.has('recipe', 'example:a')
          ? [{ severity: 'info', code: 'example.empty', message: 'Nothing to check.' }]
          : [],
    };
    expectTypeOf(validator).toEqualTypeOf<ProjectValidator>();
  });

  it('requires a data version and worldgen facts on Target', () => {
    expectTypeOf<Target['dataVersion']>().toEqualTypeOf<number>();
    expectTypeOf<Target['worldgen']>().toEqualTypeOf<WorldgenFacts>();
    expectTypeOf<WorldgenFacts['featureSteps']>().toEqualTypeOf<readonly string[]>();
  });
});

describe('0.6.0 additions', () => {
  it('adds an optional merge mode to OutputFile', () => {
    expectTypeOf<OutputFile['merge']>().toEqualTypeOf<OutputMergeMode | undefined>();
    expectTypeOf<OutputMergeMode>().toEqualTypeOf<'tag' | 'object'>();
    const file: OutputFile = {
      path: 'data/example/tags/block/a.json',
      contents: { values: [] },
      layer: 'datapack',
      merge: 'tag',
    };
    expectTypeOf(file).toEqualTypeOf<OutputFile>();
  });

  it('adds exporter options', () => {
    expectTypeOf<Exporter['options']>().toEqualTypeOf<ExporterOption[] | undefined>();
    expectTypeOf<ExporterInput['options']>().toEqualTypeOf<Record<string, Json>>();
    expectTypeOf<ExporterOption['type']>().toEqualTypeOf<'boolean'>();
    expectTypeOf<ExporterOption['default']>().toEqualTypeOf<boolean>();
    expectTypeOf<ExporterOption['description']>().toEqualTypeOf<string | undefined>();
  });

  it('types the Fabric facts of a target', () => {
    expectTypeOf<FabricFacts>().toEqualTypeOf<{
      loader: string;
      api: string;
      loom: string;
      minecraftDependency: string;
      gradle: string;
      apiModrinth?: ModrinthFileFacts;
    }>();
  });
});

describe('0.7.0 additions', () => {
  it('types the GeckoLib facts of a target', () => {
    expectTypeOf<GeckolibFacts>().toEqualTypeOf<{
      version: string;
      modId: string;
      dependency: string;
      fileName: string;
      url: string;
      sha512: string;
      modrinthVersionId?: string;
    }>();
  });
});

describe('0.8.0 additions', () => {
  it('types the Java project generator', () => {
    expectTypeOf<DefinitionInput>().toEqualTypeOf<{
      id: string;
      path: string;
      definition: JsonObject;
    }>();
    expectTypeOf<GeneratedFile>().toEqualTypeOf<{ path: string; contents: string }>();
    expectTypeOf<JavaProjectInput>().toEqualTypeOf<{
      modId: string;
      javaPackage: string;
      modClassName: string;
      blocks: DefinitionInput[];
      items: DefinitionInput[];
      entities: DefinitionInput[];
      effects?: DefinitionInput[];
      soundEvents?: string[];
      geckolib: boolean;
    }>();
    expectTypeOf<JavaProjectGenerator['generate']>().toEqualTypeOf<
      (input: JavaProjectInput) => GeneratedFile[]
    >();
    expectTypeOf<Target['javaProject']>().toEqualTypeOf<JavaProjectGenerator | undefined>();
  });

  it('keeps a 1.6.0-shaped JavaProjectInput assignable (soundEvents is optional, 1.7.0)', () => {
    const input: JavaProjectInput = {
      modId: 'm',
      javaPackage: 'a.b',
      modClassName: 'M',
      blocks: [],
      items: [],
      entities: [],
      geckolib: false,
    };
    expect(input.soundEvents).toBeUndefined();
    const withSounds: JavaProjectInput = { ...input, soundEvents: ['ns:key'] };
    expect(withSounds.soundEvents).toEqual(['ns:key']);
  });

  it('keeps a 1.5.0-shaped JavaProjectInput assignable (effects is optional, 1.6.0)', () => {
    const legacy = {
      modId: 'm',
      javaPackage: 'p',
      modClassName: 'M',
      blocks: [],
      items: [],
      entities: [],
      geckolib: false,
    } satisfies JavaProjectInput;
    const withEffects: JavaProjectInput = { ...legacy, effects: [] };
    expect(legacy).not.toHaveProperty('effects');
    expect(withEffects.effects).toEqual([]);
  });

  it('accepts a pure generator', () => {
    const generator: JavaProjectGenerator = {
      generate: (input) => [{ path: `src/main/java/${input.modClassName}.java`, contents: '' }],
    };
    expectTypeOf(generator.generate).returns.toEqualTypeOf<GeneratedFile[]>();
  });
});

describe('1.0.0 additions', () => {
  it('splits target facts from target hooks', () => {
    expectTypeOf<Target>().toExtend<TargetFacts>();
    expectTypeOf<TargetFacts>().not.toHaveProperty('migrateFrom');
    expectTypeOf<TargetFacts>().not.toHaveProperty('javaProject');
    expectTypeOf<TargetFacts['channel']>().toEqualTypeOf<TargetChannel>();
    expectTypeOf<TargetChannel>().toEqualTypeOf<'release' | 'snapshot'>();
    expectTypeOf<Target['migrateFrom']>().toEqualTypeOf<
      ((previous: Target, project: Project) => MigrationReport) | undefined
    >();
    const target: Target = { ...testTarget, migrateFrom: () => ({ changes: [], problems: [] }) };
    const facts: TargetFacts = target;
    expect(facts.channel).toBe('release');
  });

  it('gives plugin-facing functions the target facts', () => {
    expectTypeOf<ElementKind['lower']>().parameter(1).toEqualTypeOf<TargetFacts>();
    expectTypeOf<ExporterInput['target']>().toEqualTypeOf<Target>();
  });

  it('accepts kinds and validators that return Promises', async () => {
    expectTypeOf<MaybePromise<number>>().toEqualTypeOf<number | Promise<number>>();
    expectTypeOf<ElementKind['lower']>().returns.toEqualTypeOf<MaybePromise<OutputFile[]>>();
    const kind: ElementKind = {
      id: 'example:async',
      schema: '::example::Async',
      folder: 'async',
      lower: async (element, target) => [
        { path: `${target.id}/${element.id}.json`, contents: element.data, layer: 'datapack' },
      ],
    };
    const validator: ProjectValidator = {
      id: 'example.async',
      kinds: ['example:async'],
      validate: async () => [],
    };
    const element: Element = {
      formatVersion: 1,
      id: 'example:a',
      kind: 'example:async',
      data: {},
      meta: { createdAt: '2026-11-05T00:00:00.000Z' },
    };
    expect(await kind.lower(element, testTarget)).toEqual([
      { path: 'mc-test/example:a.json', contents: {}, layer: 'datapack' },
    ]);
    expect(
      await validator.validate({
        elements: [element],
        target: testTarget,
        registry: { has: () => false, ids: () => [] },
      }),
    ).toEqual([]);
  });

  it('adds optional data and kind to migration changes', () => {
    expectTypeOf<MigrationChange['data']>().toEqualTypeOf<Json | undefined>();
    expectTypeOf<MigrationChange['kind']>().toEqualTypeOf<'update' | 'remove' | undefined>();
    const change: MigrationChange = {
      elementId: 'example:a',
      description: 'Replaced a removed id.',
      kind: 'update',
      data: { a: 1 },
    };
    expectTypeOf(change).toEqualTypeOf<MigrationChange>();
  });
});
