// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Block Studio plant sections (B272, ADR 0068 D3, D4, D6): the Type picker offers the plant
 * types; the Crop section (last age with heights kept in step, stage textures, own heights,
 * bone meal, seeds item id, crop drops, villagers); the Sapling section (tree, "Open" and "New
 * tree" from the "Tree for a sapling" template through the host); the Leaves section (tint
 * with the in-game-only note, particles, leaves drops); the Preview with a stage slider.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import {
  type StructureStudioHost,
  StructureStudioHostContext,
} from '../../../../src/renderer/src/studios/structures/host';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(cleanup);

const block = (id: string, data: Record<string, Json>): Element =>
  element(id as ResourceLocation, 'msm:block', { format: 1, display_name: 'Plant', ...data });

const value = (testId: string) => (screen.getByTestId(testId) as HTMLInputElement).value;
const commit = (testId: string, text: string) => {
  const input = screen.getByTestId(testId) as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};

function hosts(blocks: Partial<BlocksItemsStudioHost>, structures?: StructureStudioHost) {
  const host: BlocksItemsStudioHost = {
    thumbnail: () => Promise.reject(new Error('none')),
    revision: 0,
    paintTexture: vi.fn(),
    ...blocks,
  };
  return ({ children }: { children: ReactNode }) => (
    <StructureStudioHostContext.Provider value={structures ?? null}>
      <BlocksItemsStudioHostContext.Provider value={host}>
        {children}
      </BlocksItemsStudioHostContext.Provider>
    </StructureStudioHostContext.Provider>
  );
}

describe('Type picker', () => {
  it('offers the plant types and turns a block into a crop in one step', () => {
    const { data, stack } = renderOnStack(
      block('demo:tomatoes', { model: 'demo:block/tomato' }),
      schema,
    );
    const picker = screen.getByTestId('block-type-picker') as HTMLSelectElement;
    const options = [...picker.options].map((option) => option.value);
    expect(options).toEqual(expect.arrayContaining(['crop', 'sapling', 'leaves']));
    fireEvent.change(picker, { target: { value: 'crop' } });
    expect(data()).toMatchObject({ type: 'crop' });
    expect(screen.getByTestId('block-crop')).toBeTruthy();
    stack.undo();
    expect((data() as { type?: string }).type).toBeUndefined();
  });
});

describe('Crop section', () => {
  const crop = (extra: Record<string, Json> = {}) =>
    block('demo:tomatoes', {
      type: 'crop',
      textures: { stages: ['demo:block/tomatoes_stage0', 'demo:block/tomatoes_stage1'] },
      ...extra,
    });

  it('edits stage textures, adding and removing', () => {
    const { data } = renderOnStack(crop(), schema);
    commit('crop-stage-texture-1', 'demo:block/tomatoes_big');
    expect((data() as { textures: Json }).textures).toEqual({
      stages: ['demo:block/tomatoes_stage0', 'demo:block/tomatoes_big'],
    });
    fireEvent.click(screen.getByTestId('crop-stage-texture-add'));
    expect((data() as { textures: { stages: string[] } }).textures.stages).toHaveLength(3);
    fireEvent.click(screen.getByTestId('crop-stage-texture-0-remove'));
    expect((data() as { textures: { stages: string[] } }).textures.stages).toEqual([
      'demo:block/tomatoes_big',
      'demo:block/tomatoes_big',
    ]);
  });

  it('shows vanilla heights, writes own heights and keeps them in step with the last age', () => {
    const { data, stack } = renderOnStack(crop(), schema);
    expect(screen.getByTestId('crop-heights-default').textContent).toContain(
      '2, 4, 6, 8, 10, 12, 14, 16',
    );
    fireEvent.click(screen.getByTestId('crop-own-heights'));
    expect((data() as { stage_heights: number[] }).stage_heights).toEqual([
      2, 4, 6, 8, 10, 12, 14, 16,
    ]);
    fireEvent.change(screen.getByTestId('crop-height-0'), { target: { value: '3' } });
    expect((data() as { stage_heights: number[] }).stage_heights[0]).toBe(3);
    fireEvent.change(screen.getByTestId('crop-max-age'), { target: { value: '3' } });
    expect(data()).toMatchObject({ max_age: 3, stage_heights: [3, 4, 6, 8] });
    // The last age and the heights are one undo step.
    stack.undo();
    expect((data() as { max_age?: number }).max_age).toBeUndefined();
    expect((data() as { stage_heights: number[] }).stage_heights).toHaveLength(8);
  });

  it('writes both bone meal bounds and drops them at vanilla values', () => {
    const { data } = renderOnStack(crop(), schema);
    fireEvent.change(screen.getByTestId('crop-bonemeal-max'), { target: { value: '3' } });
    expect((data() as { bonemeal_growth: Json }).bonemeal_growth).toEqual({ min: 2, max: 3 });
    fireEvent.change(screen.getByTestId('crop-bonemeal-max'), { target: { value: '5' } });
    expect((data() as { bonemeal_growth?: Json }).bonemeal_growth).toBeUndefined();
  });

  it('sets the seeds item, soil, crop drops and villagers', () => {
    const { data } = renderOnStack(crop({ loot: 'self' }), schema);
    commit('plant-item-id', 'demo:tomato_seeds');
    expect((data() as { item: Json }).item).toEqual({ id: 'demo:tomato_seeds' });
    commit('crop-soil', '#minecraft:dirt');
    expect((data() as { soil: string }).soil).toBe('#minecraft:dirt');
    fireEvent.click(screen.getByTestId('crop-drops'));
    expect((data() as { loot: string }).loot).toBe('crop');
    expect(screen.getByTestId('block-drops-preset').textContent).toContain('Crop section');
    commit('crop-produce', 'demo:tomato');
    fireEvent.change(screen.getByTestId('crop-produce-count'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('crop-seed-bonus'));
    expect((data() as { crop_drops: Json }).crop_drops).toEqual({
      produce: 'demo:tomato',
      produce_count: 2,
      seed_bonus: false,
    });
    fireEvent.click(screen.getByTestId('crop-villager-plantable'));
    expect((data() as { villager_plantable: boolean }).villager_plantable).toBe(false);
  });

  it('notes a crop without a block item', () => {
    renderOnStack(crop({ item: false }), schema);
    expect(screen.getByTestId('plant-no-item')).toBeTruthy();
    expect(screen.queryByTestId('plant-item-id')).toBeNull();
  });

  it('previews a stage chosen with the slider', () => {
    const wrapper = hosts({
      modelPreview: {
        folders: bundle.target.folders.resource,
        readProjectAsset: async () => null,
        vanilla: null,
      },
    });
    renderOnStack(crop({ max_age: 3 }), schema, { wrapper });
    expect(screen.getByTestId('block-preview-model').textContent).toContain(
      'demo:block/tomatoes_stage1',
    );
    fireEvent.change(screen.getByTestId('block-preview-stage'), { target: { value: '1' } });
    expect(screen.getByTestId('block-preview-model').textContent).toContain(
      'demo:block/tomatoes_stage0',
    );
    fireEvent.change(screen.getByTestId('block-preview-stage'), { target: { value: '2' } });
    expect(screen.getByTestId('block-preview-model').textContent).toContain(
      'demo:block/tomatoes_stage1',
    );
  });

  it('shows no preview without the host', () => {
    renderOnStack(crop(), schema);
    expect(screen.queryByTestId('block-type-preview')).toBeNull();
  });
});

describe('Sapling section', () => {
  const sapling = () =>
    block('demo:maple_sapling', {
      type: 'sapling',
      tree: 'minecraft:oak',
      textures: { sapling: 'demo:block/maple_sapling' },
    });

  it('makes a new tree from the template and links it', () => {
    const newFromTemplate = vi.fn();
    const { data } = renderOnStack(sapling(), schema, { wrapper: hosts({ newFromTemplate }) });
    expect(screen.getByTestId('sapling-new-tree-note').textContent).toContain(
      'demo:maple_log and demo:maple_leaves',
    );
    expect((screen.getByTestId('sapling-tree-open') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('sapling-new-tree'));
    expect((data() as { tree: string }).tree).toBe('demo:maple_tree');
    expect(newFromTemplate).toHaveBeenCalledWith('feature_sapling_tree', 'demo:maple_tree');
  });

  it('opens a project tree and does not offer a tree that exists', () => {
    const openElement = vi.fn();
    const tree = element('demo:maple_tree' as ResourceLocation, 'minecraft:worldgen/feature', {
      type: 'minecraft:tree',
    });
    renderOnStack(
      { ...sapling(), data: { ...(sapling().data as object), tree: 'demo:maple_tree' } },
      schema,
      {
        wrapper: hosts(
          { newFromTemplate: vi.fn() },
          {
            openElement,
            replaceFromFile: vi.fn(),
            exportStructures: vi.fn(),
          },
        ),
        others: [tree],
      },
    );
    expect((screen.getByTestId('sapling-new-tree') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('sapling-tree-open'));
    expect(openElement).toHaveBeenCalledWith('demo:maple_tree');
  });

  it('sets the two-by-two tree and soil', () => {
    const { data } = renderOnStack(sapling(), schema);
    commit('sapling-mega-tree', 'minecraft:mega_spruce');
    commit('sapling-soil', '#minecraft:sand');
    expect(data()).toMatchObject({ mega_tree: 'minecraft:mega_spruce', soil: '#minecraft:sand' });
    expect(value('sapling-flower-tree')).toBe('');
  });
});

describe('Leaves section', () => {
  const leaves = (extra: Record<string, Json> = {}) =>
    block('demo:maple_leaves', {
      type: 'leaves',
      textures: { all: 'demo:block/maple_leaves' },
      ...extra,
    });

  it('picks a tint with the in-game-only note and a colour', () => {
    const { data } = renderOnStack(leaves(), schema);
    expect(screen.getByTestId('leaves-tint-note').textContent).toContain('in game only');
    expect(screen.getByTestId('leaves-falling-particle')).toBeTruthy();
    fireEvent.change(screen.getByTestId('leaves-tint'), { target: { value: 'foliage' } });
    expect((data() as { tint: string }).tint).toBe('foliage');
    expect(screen.getByTestId('leaves-particle-tinted')).toBeTruthy();
    fireEvent.change(screen.getByTestId('leaves-tint'), { target: { value: 'colour' } });
    expect((data() as { tint: number }).tint).toBe(0x48b518);
    fireEvent.change(screen.getByTestId('leaves-tint-colour'), { target: { value: '#ff8800' } });
    expect((data() as { tint: number }).tint).toBe(0xff8800);
    fireEvent.change(screen.getByTestId('leaves-tint'), { target: { value: 'none' } });
    expect((data() as { tint?: Json }).tint).toBeUndefined();
  });

  it('turns on leaves drops with a sapling, no sticks and an extra item', () => {
    const { data } = renderOnStack(leaves({ loot: 'self' }), schema);
    fireEvent.click(screen.getByTestId('leaves-drops'));
    commit('leaves-drop-sapling', 'demo:maple_sapling');
    fireEvent.click(screen.getByTestId('leaves-drop-sticks'));
    commit('leaves-drop-extra', 'minecraft:apple');
    expect(data()).toMatchObject({
      loot: 'leaves',
      leaves_drops: {
        sapling: 'demo:maple_sapling',
        sticks: false,
        extra: { item: 'minecraft:apple' },
      },
    });
  });
});
