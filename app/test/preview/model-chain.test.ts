import type { JsonObject, Project, ResourceLocation } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { FALLBACK_MODELS } from '../../src/renderer/src/preview/fallback-models';
import {
  collectBlockDefinitionModelRefs,
  collectItemModelRefs,
  collectTextureIds,
  createModelLookup,
  createVanillaJsonCache,
  defaultVariantProperties,
  normaliseId,
  type ResourceFolders,
  resolveModelChain,
  textureLocations,
  vanillaJsonPath,
} from '../../src/renderer/src/preview/model-chain';

// Folder names are injected from the target in the app; the tests use made-up names so they
// prove the code reads them rather than hard-coding them.
const folders: ResourceFolders = {
  atlases: 'atl',
  block_definition: 'bdefs',
  font: 'fnt',
  item_definition: 'idefs',
  lang: 'lng',
  model: 'mdl',
  sounds_file: 'snd.json',
  textures: 'tex',
};

function projectWith(models: Record<string, JsonObject>): Project {
  const byNamespace = new Map<string, Project['namespaces'][number]>();
  for (const [id, data] of Object.entries(models)) {
    const namespace = id.split(':')[0] as string;
    let entry = byNamespace.get(namespace);
    if (entry === undefined) {
      entry = { assets: [], elements: [], name: namespace };
      byNamespace.set(namespace, entry);
    }
    entry.elements.push({
      data,
      formatVersion: 1,
      id: id as ResourceLocation,
      kind: 'minecraft:model',
      meta: { createdAt: '2026-11-04T00:00:00.000Z' },
    });
  }
  return {
    formatVersion: 1,
    name: 'test',
    namespaces: [...byNamespace.values()],
    plugins: [],
    settings: {},
    targets: [],
  };
}

/** A vanilla reader over made-up JSON files (no Mojang content). */
function fakeVanilla(files: Record<string, JsonObject>) {
  const reads: string[] = [];
  const reader = {
    readAsset: async (path: string): Promise<Uint8Array | null> => {
      reads.push(path);
      const json = files[path];
      return json === undefined ? null : new TextEncoder().encode(JSON.stringify(json));
    },
  };
  return { reader, reads };
}

describe('identifiers and paths', () => {
  it('adds the default namespace', () => {
    expect(normaliseId('block/stone')).toBe('minecraft:block/stone');
    expect(normaliseId('demo:block/ruby')).toBe('demo:block/ruby');
  });

  it('maps model ids to jar paths through the target folder', () => {
    expect(vanillaJsonPath('block/stone', folders.model)).toBe(
      'assets/minecraft/mdl/block/stone.json',
    );
  });

  it('maps texture ids to project and vanilla paths', () => {
    expect(textureLocations('demo:block/ruby', folders)).toEqual({
      namespace: 'demo',
      projectPath: 'tex/block/ruby.png',
      vanillaPath: 'assets/demo/tex/block/ruby.png',
    });
    expect(textureLocations('item/stick', folders).vanillaPath).toBe(
      'assets/minecraft/tex/item/stick.png',
    );
  });
});

describe('model lookup order', () => {
  it('prefers project, then vanilla, then the fallback parents', async () => {
    const project = projectWith({
      'minecraft:block/cube_all': { parent: 'block/project_cube' },
    });
    const { reader } = fakeVanilla({
      'assets/minecraft/mdl/block/cube_all.json': { parent: 'block/vanilla_cube' },
      'assets/minecraft/mdl/block/cube_column.json': { parent: 'block/vanilla_column' },
    });
    const lookup = createModelLookup({
      folders,
      project,
      vanillaJson: createVanillaJsonCache(reader),
    });
    expect((await lookup('block/cube_all'))?.source).toBe('project');
    expect((await lookup('minecraft:block/cube_column'))?.source).toBe('vanilla');
    expect(await lookup('block/cross')).toEqual({
      id: 'minecraft:block/cross',
      json: FALLBACK_MODELS['block/cross'],
      source: 'fallback',
    });
    expect((await lookup('msm:block/cube'))?.source).toBe('fallback');
    expect(await lookup('demo:block/unknown')).toBeNull();
  });

  it('uses the fallback parents for minecraft names when vanilla is absent', async () => {
    const lookup = createModelLookup({ folders, project: projectWith({}), vanillaJson: null });
    const model = await lookup('minecraft:item/generated');
    expect(model?.source).toBe('fallback');
    expect(await lookup('minecraft:block/stone')).toBeNull();
    expect(await lookup('other:block/cube')).toBeNull();
  });

  it('reads each vanilla file once', async () => {
    const { reader, reads } = fakeVanilla({
      'assets/minecraft/mdl/block/a.json': { parent: 'block/cube_all' },
    });
    const cache = createVanillaJsonCache(reader);
    await cache('assets/minecraft/mdl/block/a.json');
    await cache('assets/minecraft/mdl/block/a.json');
    expect(reads).toEqual(['assets/minecraft/mdl/block/a.json']);
  });
});

describe('resolveModelChain', () => {
  it('follows a project model through the fallback parents', async () => {
    const project = projectWith({
      'demo:block/ruby': {
        parent: 'minecraft:block/cube_all',
        textures: { all: 'demo:block/ruby' },
      },
    });
    const lookup = createModelLookup({ folders, project, vanillaJson: null });
    const result = await resolveModelChain('demo:block/ruby', lookup);
    expect(result.chain.map((model) => [model.id, model.source])).toEqual([
      ['demo:block/ruby', 'project'],
      ['minecraft:block/cube_all', 'fallback'],
      ['msm:block/cube', 'fallback'],
    ]);
    expect(result.missing).toEqual([]);
    expect(result.generated).toBe(false);
    expect(collectTextureIds(result.chain)).toEqual(['demo:block/ruby']);
  });

  it('marks generated item chains', async () => {
    const project = projectWith({
      'demo:item/ruby': { parent: 'item/handheld', textures: { layer0: 'demo:item/ruby' } },
    });
    const lookup = createModelLookup({ folders, project, vanillaJson: null });
    const result = await resolveModelChain('demo:item/ruby', lookup);
    expect(result.chain.map((model) => model.id)).toEqual([
      'demo:item/ruby',
      'minecraft:item/handheld',
      'msm:item/generated',
    ]);
    expect(result.generated).toBe(true);
  });

  it('reports a missing parent and stops', async () => {
    const project = projectWith({ 'demo:block/a': { parent: 'demo:block/gone' } });
    const lookup = createModelLookup({ folders, project, vanillaJson: null });
    const result = await resolveModelChain('demo:block/a', lookup);
    expect(result.chain.map((model) => model.id)).toEqual(['demo:block/a']);
    expect(result.missing).toEqual(['demo:block/gone']);
  });

  it('stops on a cycle', async () => {
    const project = projectWith({
      'demo:block/a': { parent: 'demo:block/b' },
      'demo:block/b': { parent: 'demo:block/a' },
    });
    const lookup = createModelLookup({ folders, project, vanillaJson: null });
    const result = await resolveModelChain('demo:block/a', lookup);
    expect(result.chain.map((model) => model.id)).toEqual(['demo:block/a', 'demo:block/b']);
    expect(result.missing).toEqual([]);
  });
});

describe('collectTextureIds', () => {
  it('resolves references, sprite objects and child overrides', () => {
    const ids = collectTextureIds([
      {
        id: 'demo:block/a',
        json: { textures: { side: { sprite: 'demo:block/side' }, top: '#side', end: 'block/end' } },
        source: 'project',
      },
      {
        id: 'demo:block/b',
        json: { textures: { end: 'demo:block/ignored', bottom: '#missing', loop: '#loop' } },
        source: 'project',
      },
    ]);
    expect(ids).toEqual(['demo:block/side', 'minecraft:block/end']);
  });
});

describe('definition references', () => {
  it('collects item definition model references', () => {
    expect(
      collectItemModelRefs({
        model: {
          type: 'minecraft:condition',
          on_false: { type: 'minecraft:model', model: 'demo:item/off' },
          on_true: { type: 'minecraft:special', base: 'item/base', model: { type: 'x' } },
        },
      }),
    ).toEqual(['demo:item/off', 'minecraft:item/base']);
  });

  it('collects block definition references and default properties', () => {
    const definition = {
      variants: {
        'facing=north,lit=false': { model: 'demo:block/a' },
        'facing=south,lit=true': [{ model: 'demo:block/b' }, { model: 'demo:block/a', y: 180 }],
      },
      multipart: [{ apply: { model: 'block/c' } }],
    };
    expect(collectBlockDefinitionModelRefs(definition)).toEqual([
      'demo:block/a',
      'demo:block/b',
      'minecraft:block/c',
    ]);
    expect(defaultVariantProperties(definition)).toEqual({ facing: 'north', lit: 'false' });
    expect(defaultVariantProperties({ variants: { '': { model: 'x' } } })).toEqual({});
    expect(defaultVariantProperties({ multipart: [] })).toEqual({});
  });
});
