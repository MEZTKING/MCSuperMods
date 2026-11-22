// @vitest-environment happy-dom
/**
 * MSM's fallback parents for the common block types in Try it (found by B565): every vanilla
 * parent the blocks-items lowering can name has a fallback, every face of every lowered model
 * resolves to a picture through it, and a scene of one block of each type prepares without a
 * missing model or texture (so nothing draws as the magenta-and-black missing texture without
 * the user's client jar).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Element, ElementKind, Json, JsonObject, OutputFile } from '@msm/plugin-api';
import blocksItems, { BLOCK_TYPES } from '@msm/plugin-blocks-items';
import type { SimFiles } from '@msm/sim';
import { Identifier } from 'deepslate/core';
import type { TextureAtlasProvider } from 'deepslate/render';
import { describe, expect, it } from 'vitest';
import { TRYIT_FALLBACK_MODELS } from '../../../src/renderer/src/tryit/blocks2/fallback-parents';
import {
  COMMON_FALLBACK_PARENTS,
  COMMON_WHOLE_MODELS,
} from '../../../src/renderer/src/tryit/fallback-parents-common';
import { prepareTryItResources } from '../../../src/renderer/src/tryit/render/resources';
import { NS, TARGET } from './tryit-fixture';

const folders = TARGET.folders.resource;
const ROOT = join(import.meta.dirname, '../../../..');
const PIC = `${NS}:block/pic`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const kinds = (blocksItems.contributes.elementKinds ?? []) as readonly ElementKind[];
const kind = (id: string): ElementKind => {
  const found = kinds.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no kind ${id}`);
  return found;
};

/** Element data that reaches every model each block type can generate. */
function blockVariants(type: string): JsonObject[] {
  const textures = { all: PIC };
  const stages = { textures: { all: PIC, stages: [PIC, PIC, PIC, PIC] } };
  switch (type) {
    case 'crop':
    case 'berry_bush':
    case 'cocoa':
      return [stages];
    case 'column_plant':
      return ['cane', 'cactus', 'bamboo'].map((style) => ({
        style,
        textures: { all: PIC, stalk: PIC, leaves_small: PIC },
      }));
    case 'dripleaf':
      return ['big', 'small'].map((size) => ({ size, textures }));
    case 'growing_plant':
      return [{ textures }, { berries: {}, textures: { all: PIC, head_berries: PIC } }];
    case 'flower_pot':
      return [{ plants: ['minecraft:dandelion'], textures: { pot: PIC, dirt: PIC, all: PIC } }];
    case 'potted_plant':
      return [{ plant: 'minecraft:dandelion', textures: { plant: PIC, all: PIC } }];
    case 'portal':
      return [{ textures: { portal: PIC } }];
    case 'horizontal':
    case 'directional':
      return [
        { textures },
        { textures: { ...textures, front_open: PIC }, components: { 'msm:container': {} } },
      ];
    default:
      return [{ textures }];
  }
}

const element = (id: string, kindId: string, data: JsonObject): Element =>
  ({
    formatVersion: 1,
    id,
    kind: kindId,
    data: { format: 1, ...data },
    meta: {},
  }) as unknown as Element;

/** One lowered element of every block type (and its variants), and fluids with cauldrons. */
async function loweredFiles(): Promise<OutputFile[]> {
  const out: OutputFile[] = [];
  const block = kind('msm:block');
  for (const type of BLOCK_TYPES) {
    for (const [index, data] of blockVariants(type).entries()) {
      const id = `${NS}:${type}_${index}`;
      out.push(...(await block.lower(element(id, 'msm:block', { ...data, type }), TARGET)));
    }
  }
  const fluid = kind('msm:fluid');
  for (const [name, data] of Object.entries({
    tea: {
      behaves_like: 'water',
      cauldron: { levels: true },
      textures: { still: PIC, flowing: PIC },
    },
    slag: { behaves_like: 'lava', cauldron: {}, textures: { still: PIC, flowing: PIC } },
  })) {
    out.push(...(await fluid.lower(element(`${NS}:${name}`, 'msm:fluid', data), TARGET)));
  }
  return out;
}

const modelPrefix = `assets/${NS}/${folders.model}/`;
const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The vanilla `block/` paths the lowered models name as parents. */
function vanillaParents(files: readonly OutputFile[]): Set<string> {
  const out = new Set<string>();
  for (const file of files) {
    if (!file.path.startsWith(modelPrefix) || !isObject(file.contents as Json)) continue;
    const parent = (file.contents as JsonObject).parent;
    if (typeof parent === 'string' && parent.startsWith('minecraft:block/')) {
      out.add(parent.slice('minecraft:'.length));
    }
  }
  return out;
}

/** Every file under `dir` with one of `extensions`, skipping `node_modules`. */
function walk(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, extensions));
    else if (extensions.some((extension) => name.endsWith(extension))) out.push(path);
  }
  return out;
}

describe('Try it, the common fallback parents', () => {
  it('has a fallback for every vanilla parent the blocks-items lowering can name', async () => {
    const parents = vanillaParents(await loweredFiles());
    // B565's list: the lowering run reaches every one of them.
    for (const path of [
      'block/slab',
      'block/slab_top',
      'block/stairs',
      'block/inner_stairs',
      'block/outer_stairs',
      'block/door_bottom_left',
      'block/door_top_right_open',
      'block/fence_post',
      'block/fence_side',
      'block/fence_inventory',
      'block/template_fence_gate',
      'block/template_fence_gate_wall_open',
      'block/template_orientable_trapdoor_bottom',
      'block/template_orientable_trapdoor_open',
      'block/button',
      'block/button_pressed',
      'block/button_inventory',
      'block/pressure_plate_up',
      'block/pressure_plate_down',
      'block/leaves',
      'block/cube_column_horizontal',
      'block/crop',
      'block/orientable',
      'block/template_cauldron_level1',
      'block/template_cauldron_full',
    ]) {
      expect(parents, path).toContain(path);
    }
    const missing = [...parents].filter((path) => TRYIT_FALLBACK_MODELS[path] === undefined);
    expect(missing).toEqual([]);
  });

  it('covers the vanilla parents and whole models the code and examples name', () => {
    const named = new Set<string>();
    const sources = [
      ...walk(join(ROOT, 'packages/plugins'), ['.ts']).filter((path) => path.includes('/src/')),
      ...walk(join(ROOT, 'examples'), ['.json']),
      ...walk(join(ROOT, 'fixtures'), ['.json']),
    ];
    const pattern = /["']?(?:parent|model)["']?\s*:\s*["']minecraft:(block\/[a-z0-9_]+)["']/g;
    for (const path of sources) {
      for (const match of readFileSync(path, 'utf8').matchAll(pattern)) {
        named.add(match[1] as string);
      }
    }
    expect(named).toContain('block/glass');
    expect(named).toContain('block/lodestone');
    const missing = [...named].filter((path) => TRYIT_FALLBACK_MODELS[path] === undefined).sort();
    expect(missing).toEqual([]);
    for (const path of COMMON_WHOLE_MODELS) {
      expect(TRYIT_FALLBACK_MODELS[path]).toBe(COMMON_FALLBACK_PARENTS[path]);
    }
  });

  it('resolves every face of every lowered model to a picture', async () => {
    const files = await loweredFiles();
    const models = new Map<string, JsonObject>();
    for (const file of files) {
      if (file.path.startsWith(modelPrefix) && isObject(file.contents as Json)) {
        const path = file.path.slice(modelPrefix.length, -'.json'.length);
        models.set(`${NS}:${path}`, file.contents as JsonObject);
      }
    }
    const lookup = (id: string): JsonObject | undefined => {
      const [namespace, path] = id.includes(':') ? id.split(':') : ['minecraft', id];
      if (namespace === 'minecraft' || namespace === 'msm') {
        return TRYIT_FALLBACK_MODELS[path as string];
      }
      return models.get(id);
    };
    const unresolved: string[] = [];
    for (const [id, json] of models) {
      if (!String(json.parent ?? '').startsWith('minecraft:block/')) continue;
      const chain: JsonObject[] = [];
      let current: JsonObject | undefined = json;
      while (current !== undefined) {
        chain.push(current);
        current = typeof current.parent === 'string' ? lookup(current.parent) : undefined;
      }
      const textures = new Map<string, string>();
      for (const model of [...chain].reverse()) {
        for (const [name, value] of Object.entries((model.textures ?? {}) as JsonObject)) {
          textures.set(name, value as string);
        }
      }
      const holder = chain.find((model) => Array.isArray(model.elements));
      if (holder === undefined) {
        unresolved.push(`${id}: no elements`);
        continue;
      }
      for (const box of holder.elements as JsonObject[]) {
        for (const [face, value] of Object.entries(box.faces as JsonObject)) {
          let texture = (value as JsonObject).texture as string | undefined;
          const seen = new Set<string>();
          while (texture?.startsWith('#') && !seen.has(texture)) {
            seen.add(texture);
            texture = textures.get(texture.slice(1));
          }
          if (texture === undefined || texture.startsWith('#')) {
            unresolved.push(`${id} ${face}: ${(value as JsonObject).texture as string}`);
          }
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('prepares a scene of every block type with no missing model or texture', async () => {
    const lowered = await loweredFiles();
    const files = new Map<string, string | Uint8Array>(
      lowered.map((file) => [file.path, JSON.stringify(file.contents)]),
    );
    files.set(`assets/${NS}/${folders.textures}/block/pic.png`, PNG);
    const definitionPrefix = `assets/${NS}/${folders.block_definition}/`;
    const blockIds = lowered
      .filter((file) => file.path.startsWith(definitionPrefix))
      .map((file) => `${NS}:${file.path.slice(definitionPrefix.length, -'.json'.length)}`);
    const seen: string[] = [];
    const atlas = (textures: Record<string, Blob>): TextureAtlasProvider => {
      const ids = Object.keys(textures).sort();
      seen.push(...ids);
      const width = Math.max(2, ids.length * 2);
      const image = {
        width,
        height: 2,
        data: new Uint8ClampedArray(width * 8).fill(255),
      } as unknown as ImageData;
      return {
        getTextureAtlas: () => image,
        getTextureUV: (id: Identifier) => {
          const i = ids.indexOf(id.toString());
          return i < 0 ? [0, 0, 0, 0] : [(i * 2) / width, 0, (i * 2 + 2) / width, 1];
        },
        getPixelSize: () => 1 / width,
      };
    };
    const prepared = await prepareTryItResources(blockIds, {
      files,
      folders,
      vanilla: null,
      fallbackModels: TRYIT_FALLBACK_MODELS,
      createAtlas: async (textures) => atlas(textures),
    });
    expect(blockIds.length).toBeGreaterThan(BLOCK_TYPES.length);
    expect(prepared.missingDefinitions).toEqual([]);
    expect(prepared.missingModels).toEqual([]);
    // Only vanilla's own pictures need the jar: the cauldron's (the fluid cauldron names them)
    // and the vanilla plant's in the pot's companion.
    const needJar = (id: string) =>
      id.startsWith('minecraft:block/cauldron_') || id === 'minecraft:block/dandelion';
    expect(prepared.missingTextures.filter((id) => !needJar(id))).toEqual([]);
    expect(prepared.usedFallback).toBe(true);
    for (const id of blockIds) {
      expect(prepared.resources.getBlockDefinition(Identifier.parse(id)), id).not.toBeNull();
    }
  });

  it('draws the whole models glass and lodestone as MSM cubes', async () => {
    const files: SimFiles = new Map<string, string | Uint8Array>([
      [
        `assets/${NS}/${folders.block_definition}/jar.json`,
        JSON.stringify({ variants: { '': { model: 'minecraft:block/glass' } } }),
      ],
      [
        `assets/${NS}/${folders.block_definition}/beacon.json`,
        JSON.stringify({ variants: { '': { model: 'minecraft:block/lodestone' } } }),
      ],
    ]);
    const prepared = await prepareTryItResources([`${NS}:jar`, `${NS}:beacon`], {
      files,
      folders,
      vanilla: null,
      fallbackModels: TRYIT_FALLBACK_MODELS,
      createAtlas: async () => ({
        getTextureAtlas: () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16) }) as never,
        getTextureUV: () => [0, 0, 1, 1],
        getPixelSize: () => 0.5,
      }),
    });
    expect(prepared.missingModels).toEqual([]);
    expect(prepared.missingTextures).toEqual([]);
  });
});
