import { describe, expectTypeOf, it } from 'vitest';
import type {
  Element,
  ElementKind,
  ExporterInput,
  Json,
  OutputFile,
  Problem,
  Project,
  ResourceFolderKey,
  Target,
} from '../src/index';

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
    expectTypeOf<Target['fabric']>().toEqualTypeOf<
      { loader: string; api: string; loom: string } | undefined
    >();
    expectTypeOf<Target['geckolib']>().toEqualTypeOf<string | undefined>();
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
