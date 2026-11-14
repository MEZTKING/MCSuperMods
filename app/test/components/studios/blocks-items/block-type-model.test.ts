/**
 * Block Studio types (B268, ADR 0069 D5): the pure helpers of the Type picker and the Textures
 * section (the registry view of `item.id` is in `test/block-item-id-registry.test.ts`).
 */
import type { Element, Json, Project } from '@msm/core';
import { BLOCK_TYPE_MODEL_SLOTS } from '@msm/plugin-blocks-items';
import { describe, expect, it } from 'vitest';
import {
  appearanceTexture,
  BLOCK_TYPE_LABELS,
  BUILDING_BLOCK_TYPES,
  blockTypeOfData,
  generatedModelBundle,
  modelSlotLabel,
  slotModelRows,
  TEXTURE_SLOTS,
  textureAssetPath,
  typePreviewProject,
  withBlockType,
} from '../../../../src/renderer/src/studios/blocks-items/block-type-model';

const el = (id: string, kind: string, data: Json): Element => ({
  id: id as `${string}:${string}`,
  kind,
  data,
  formatVersion: 1,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

const projectOf = (...elements: Element[]): Project => ({
  formatVersion: 1,
  name: 'Demo',
  targets: [],
  plugins: [],
  settings: {},
  namespaces: [{ name: 'demo', elements, assets: [] }],
});

describe('block type helpers', () => {
  it('reads the type, absent meaning block', () => {
    expect(blockTypeOfData({ format: 1 })).toBe('block');
    expect(blockTypeOfData({ type: 'stairs' })).toBe('stairs');
    expect(blockTypeOfData({ type: 'nope' })).toBeUndefined();
  });

  it('offers the 14 building types in words', () => {
    expect(BUILDING_BLOCK_TYPES).toHaveLength(14);
    expect(BUILDING_BLOCK_TYPES).not.toContain('crop');
    for (const type of BUILDING_BLOCK_TYPES) expect(BLOCK_TYPE_LABELS[type]).toBeTruthy();
  });

  it('names every model slot of every type in words', () => {
    for (const slots of Object.values(BLOCK_TYPE_MODEL_SLOTS)) {
      for (const slot of slots) expect(modelSlotLabel(slot)).not.toContain('_');
    }
    expect(modelSlotLabel('stage3')).toBe('Stage 3');
  });

  it('lists texture slots with "Every face" first for the building types', () => {
    for (const type of BUILDING_BLOCK_TYPES) {
      if (type === 'block') expect(TEXTURE_SLOTS[type]).toEqual([]);
      else expect(TEXTURE_SLOTS[type][0]?.key).toBe('all');
    }
  });
});

describe('withBlockType', () => {
  const plain: Json = {
    format: 1,
    display_name: 'Thing',
    model: 'minecraft:block/stone',
    sound_type: 'wood',
    loot: 'self',
    item: { creative_tab: 'minecraft:building_blocks' },
    components: {
      'msm:breakable': { hardness: 2 },
      'msm:shape': { preset: 'slab' },
      'msm:redstone': { emit: 15 },
    },
    events: { boom: [] },
  };

  it('keeps shared fields, drops what the new type does not take and carries the look', () => {
    const next = withBlockType(plain, 'stairs', { texture: 'minecraft:block/stone' });
    expect(next).toEqual({
      format: 1,
      display_name: 'Thing',
      sound_type: 'wood',
      loot: 'self',
      item: { creative_tab: 'minecraft:building_blocks' },
      components: { 'msm:breakable': { hardness: 2 } },
      events: { boom: [] },
      type: 'stairs',
      textures: { all: 'minecraft:block/stone' },
    });
  });

  it('keeps the single model for the types that take one', () => {
    const next = withBlockType(plain, 'horizontal', { texture: 'minecraft:block/stone' });
    expect(next.model).toBe('minecraft:block/stone');
    expect(next.textures).toBeUndefined();
    expect(next.type).toBe('horizontal');
    expect(next.components).toEqual(plain && (plain as { components: Json }).components);
  });

  it('defaults required fields from the target facts and drops the old type fields', () => {
    const door = withBlockType({ format: 1, type: 'fence', wooden: true }, 'door', {
      setTypes: ['iron', 'wood'],
    });
    expect(door).toEqual({ format: 1, type: 'door', set_type: 'iron' });
    const gate = withBlockType(door, 'fence_gate', { woodTypes: ['birch'] });
    expect(gate).toEqual({ format: 1, type: 'fence_gate', wood_type: 'birch' });
    // A field both types have stays.
    const trapdoor = withBlockType(door, 'trapdoor');
    expect(trapdoor.set_type).toBe('iron');
    const back = withBlockType(gate, 'block');
    expect(back).toEqual({ format: 1 });
  });

  it('turns a type loot preset back into "self" and seeds plant defaults', () => {
    const crop = withBlockType({ format: 1 }, 'crop', { texture: 'minecraft:block/dirt' });
    expect(crop).toEqual({
      format: 1,
      type: 'crop',
      textures: { stages: ['minecraft:block/dirt'] },
    });
    const leaves = withBlockType(
      { ...crop, loot: 'crop', crop_drops: { produce: 'x:y' } },
      'leaves',
      {
        texture: appearanceTexture(null, crop),
      },
    );
    expect(leaves).toEqual({
      format: 1,
      type: 'leaves',
      loot: 'self',
      textures: { all: 'minecraft:block/dirt' },
    });
    expect(withBlockType({ format: 1 }, 'sapling').tree).toBe('minecraft:oak');
  });
});

describe('appearanceTexture', () => {
  it('reads textures, a project model, or a vanilla block model id', () => {
    expect(appearanceTexture(null, { textures: { side: 'a:b' } })).toBe('a:b');
    const model = el('demo:block/thing', 'minecraft:model', {
      parent: 'minecraft:block/cube_all',
      textures: { all: 'demo:block/thing' },
    });
    expect(appearanceTexture(projectOf(model), { model: 'demo:block/thing' })).toBe(
      'demo:block/thing',
    );
    expect(appearanceTexture(null, { model: 'minecraft:block/oak_planks' })).toBe(
      'minecraft:block/oak_planks',
    );
    expect(appearanceTexture(null, { model: 'minecraft:item/apple' })).toBeUndefined();
  });
});

describe('slotModelRows and the preview bundle', () => {
  const stairs = el('demo:brick_stairs', 'msm:block', {
    format: 1,
    type: 'stairs',
    textures: { all: 'demo:block/brick' },
    models: { outer: 'demo:block/my_outer' },
  });

  it('lists every slot with the model lowering uses', () => {
    const rows = slotModelRows(stairs);
    expect(rows.map((row) => row.slot)).toEqual(['straight', 'inner', 'outer', 'item']);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        model: 'demo:block/brick_stairs',
        source: 'generated',
        parent: 'minecraft:block/stairs',
      }),
    );
    expect(rows[2]).toEqual({ slot: 'outer', model: 'demo:block/my_outer', source: 'models' });
    expect(rows[3]?.source).toBe('none');
    expect(slotModelRows(el('demo:x', 'msm:block', { format: 1 }))).toEqual([]);
  });

  it('builds a model bundle of the generated models and lays it over the project', () => {
    const bundle = generatedModelBundle(stairs);
    expect(bundle.elements.map((entry) => entry.id).sort()).toEqual([
      'demo:block/brick_stairs',
      'demo:block/brick_stairs_inner',
    ]);
    const project = typePreviewProject(projectOf(stairs), stairs);
    const ids = project.namespaces.flatMap((ns) => ns.elements.map((entry) => entry.id));
    expect(ids).toContain('demo:block/brick_stairs_inner');
  });

  it('gives a thumbnail path only for project textures', () => {
    expect(textureAssetPath('demo:block/brick')).toBe('assets/demo/textures/block/brick.png');
    expect(textureAssetPath('minecraft:block/stone')).toBeUndefined();
  });
});
