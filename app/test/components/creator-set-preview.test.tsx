// @vitest-environment happy-dom
/**
 * The Creator's typed block previews (B272, ADR 0069 D5): the model and picture each typed
 * block shows, the bundle with the models their textures make, the whole set as a row of
 * blocks (a door as both halves), a seeds id resolving to its crop in recipes (ADR 0068 D2),
 * and the Stats lines for plants and own item ids.
 */
import type { Project, ResourceLocation } from '@msm/core';
import type { ContentBundle, ContentBundleElement } from '@msm/plugin-api';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorPreview } from '../../src/renderer/src/components/creator/CreatorPreview';
import { bundleStats } from '../../src/renderer/src/components/creator/creator-model';
import {
  bundlePieceForItem,
  pieceModels,
  pieceTextureBytes,
  setPreviewBlockId,
  setRow,
  withTypedBlockModels,
} from '../../src/renderer/src/components/creator/set-preview';

afterEach(cleanup);

const FOLDERS = { textures: 'textures', models: 'models', blockstates: 'blockstates' } as never;

const piece = (id: string, kind: string, data: unknown): ContentBundleElement => ({
  id: id as ResourceLocation,
  kind,
  data: data as never,
});

const PNG = new Uint8Array([137, 80, 78, 71, 1]);

const bundle: ContentBundle = {
  elements: [
    piece('demo:maple_planks', 'msm:block', { format: 1, model: 'demo:block/maple_planks' }),
    piece('demo:block/maple_planks', 'minecraft:model', {
      parent: 'minecraft:block/cube_all',
      textures: { all: 'demo:block/maple_planks' },
    }),
    piece('demo:maple_stairs', 'msm:block', {
      format: 1,
      type: 'stairs',
      textures: { all: 'demo:block/maple_planks' },
    }),
    piece('demo:maple_fence', 'msm:block', {
      format: 1,
      type: 'fence',
      textures: { all: 'demo:block/maple_planks' },
    }),
    piece('demo:maple_door', 'msm:block', {
      format: 1,
      type: 'door',
      set_type: 'wood',
      textures: { top: 'demo:block/maple_door_top', bottom: 'demo:block/maple_door_bottom' },
    }),
    piece('demo:tomatoes', 'msm:block', {
      format: 1,
      type: 'crop',
      item: { id: 'demo:tomato_seeds' },
      loot: 'crop',
      textures: { stages: ['demo:block/tomatoes_stage0', 'demo:block/tomatoes_stage1'] },
    }),
    piece('demo:tomato_seeds_from_tomato', 'minecraft:recipe', {
      type: 'minecraft:crafting_shapeless',
      ingredients: ['demo:tomato_seeds'],
      result: { id: 'demo:tomato_seeds', count: 2 },
    }),
    piece('demo:en_us', 'minecraft:lang', { 'block.demo.tomatoes': 'Tomatoes' }),
  ],
  assets: [
    { namespace: 'demo', path: 'textures/block/maple_planks.png', bytes: PNG },
    { namespace: 'demo', path: 'textures/block/tomatoes_stage1.png', bytes: PNG },
  ],
};

const element = (id: string) =>
  bundle.elements.find((entry) => entry.id === id) as ContentBundleElement;

describe('set-preview model', () => {
  it('picks the model a block shows by type', () => {
    expect(pieceModels(element('demo:maple_planks'))).toEqual({ model: 'demo:block/maple_planks' });
    expect(pieceModels(element('demo:maple_stairs'))).toEqual({ model: 'demo:block/maple_stairs' });
    expect(pieceModels(element('demo:maple_fence'))?.model).toBe(
      'demo:block/maple_fence_inventory',
    );
    const door = pieceModels(element('demo:maple_door'));
    expect(door?.model).toContain('demo:block/maple_door_bottom_left');
    expect(door?.upper).toContain('demo:block/maple_door_top_left');
    expect(pieceModels(element('demo:tomatoes'))).toEqual({ model: 'demo:block/tomatoes_stage1' });
  });

  it('adds the generated models once, keeping bundle models', () => {
    const added = withTypedBlockModels(bundle);
    const ids = added.elements.filter((entry) => entry.kind === 'minecraft:model').map((e) => e.id);
    expect(ids).toContain('demo:block/maple_stairs_inner');
    expect(ids).toContain('demo:block/tomatoes_stage0');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === 'demo:block/maple_planks')).toHaveLength(1);
  });

  it('lays the set out as a row with a two-block door', () => {
    const row = setRow(bundle);
    expect(row?.pieces.map((entry) => entry.id)).toEqual([
      'demo:maple_planks',
      'demo:maple_stairs',
      'demo:maple_fence',
      'demo:maple_door',
      'demo:tomatoes',
    ]);
    const structure = row?.structure as { size: number[]; palette: string[]; blocks: number[][] };
    expect(structure.size).toEqual([9, 2, 1]);
    const door = setPreviewBlockId('demo:maple_door');
    expect(door).toBe('demo:msm_set_preview/maple_door');
    expect(structure.palette).toContain(`${door}[half=upper]`);
    expect(structure.blocks).toContainEqual([
      6,
      1,
      0,
      structure.palette.indexOf(`${door}[half=upper]`),
    ]);
    const definition = row?.bundle.elements.find(
      (entry) => entry.kind === 'minecraft:block_definition' && entry.id === door,
    );
    expect(
      Object.keys((definition?.data as { variants: object } | undefined)?.variants ?? {}),
    ).toEqual(['half=lower', 'half=upper']);
    expect(setRow({ elements: [element('demo:maple_planks')], assets: [] })).toBeNull();
  });

  it('pictures typed blocks and resolves seeds to their crop', () => {
    expect(pieceTextureBytes(bundle, element('demo:maple_stairs'), FOLDERS)).toBe(PNG);
    expect(pieceTextureBytes(bundle, element('demo:tomatoes'), FOLDERS)).toBe(PNG);
    expect(bundlePieceForItem(bundle, 'demo:tomato_seeds')?.id).toBe('demo:tomatoes');
    expect(bundlePieceForItem(bundle, 'demo:tomatoes')?.id).toBe('demo:tomatoes');
    expect(bundlePieceForItem(bundle, 'demo:nothing')).toBeUndefined();
  });

  it('puts plants and own item ids in the Stats lines', () => {
    const card = bundleStats({
      elements: [
        element('demo:tomatoes'),
        piece('demo:maple_leaves', 'msm:block', { type: 'leaves', loot: 'leaves' }),
      ],
      assets: [],
    });
    expect(card.find((entry) => entry.id === 'demo:tomatoes')?.lines).toEqual([
      'Drops its produce when grown, its seeds before.',
      'Planted from demo:tomato_seeds.',
    ]);
    expect(card.find((entry) => entry.id === 'demo:maple_leaves')?.lines[0]).toContain('sapling');
  });
});

describe('CreatorPreview', () => {
  const props = {
    bundle,
    revision: 1,
    plan: null,
    project: { name: 'Demo', namespaces: [] } as unknown as Project,
    folders: FOLDERS,
    readProjectAsset: async () => null,
    vanilla: null,
    overwrite: new Set<string>(),
    onOverwriteChange: vi.fn(),
    onTabChange: vi.fn(),
    webgl: false,
  };

  it('names and pictures a seeds id in a recipe through its crop', () => {
    render(<CreatorPreview {...props} tab="recipes" />);
    const slots = screen.getAllByRole('img', { name: 'Tomatoes' });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]?.querySelector('img')).not.toBeNull();
  });

  it('shows the whole set as a row in the Blocks tab', () => {
    render(<CreatorPreview {...props} tab="blocks" />);
    expect(screen.getByTestId('creator-set-order').textContent).toBe(
      'demo:maple_planks, demo:maple_stairs, demo:maple_fence, demo:maple_door, Tomatoes',
    );
    expect(
      screen.getByTestId('creator-block-demo:maple_stairs').querySelector('img'),
    ).not.toBeNull();
  });
});
