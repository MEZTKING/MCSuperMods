// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B538 (ADR 0107 D5, ADR 0110 D1, ADR 0112 D1): the Villager look Studio (biomes, pictures, hat)
 * and the Item Studio's Boat section, each copying a picture stored elsewhere to the fixed place
 * the game reads (`villagerTypeTexturePaths`, `boatTexturePaths`) in the same undo step; the
 * Profession Studio's Very easy list.
 */
import {
  type CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { planChangeItems } from '../../../../src/renderer/src/changeset/changeset';
import { usePreferences } from '../../../../src/renderer/src/store/preferences';
import {
  boatPictureCopies,
  withBoatPicture,
} from '../../../../src/renderer/src/studios/blocks-items/BoatSection';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import {
  villagerTypePictureCopies,
  withVillagerTypePicture,
} from '../../../../src/renderer/src/studios/entities/VillagerTypeStudio';
import {
  missingPictureCopies,
  pictureCopiesOf,
  pictureCopyChange,
} from '../../../../src/renderer/src/studios/picture-copies';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import {
  ITEM_VERY_EASY_SECTIONS,
  PROFESSION_VERY_EASY_SECTIONS,
} from '../../../../src/renderer/src/studios/very-easy';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../../lazy-chunks';
import { renderOnStack, schemaState } from '../blocks-items/harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
const target = bundle.target;
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
  await preloadChunks(
    () => import('../../../../src/renderer/src/studios/entities/VillagerTypeStudio'),
    () => import('../../../../src/renderer/src/studios/entities/ProfessionStudio'),
  );
}, PRELOAD_TIMEOUT_MS);
afterEach(cleanup);

const LOOK = 'demo:swamp' as ResourceLocation;
const look = (data: Record<string, Json> = {}): Element =>
  element(LOOK, 'msm:villager_type', { biomes: ['minecraft:swamp'], ...data });
const BOAT = 'demo:maple_boat' as ResourceLocation;
const boat = (components: Record<string, Json> = { 'msm:boat': {} }): Element =>
  element(BOAT, 'msm:item', { display_name: 'Maple Boat', components });
const PNG = new Uint8Array([137, 80, 78, 71]);
const EMPTY: Project = {
  formatVersion: 1,
  name: 'x',
  targets: [],
  plugins: [],
  settings: {},
  namespaces: [],
};

function withHost(subject: Element, assets: string[] = []) {
  let current: CommandStack | undefined;
  const labels: string[] = [];
  const host: BlocksItemsStudioHost = {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    modelPreview: {
      folders: target.folders.resource,
      readProjectAsset: async (_namespace, path) => (assets.includes(path) ? PNG : null),
      vanilla: null,
    },
    applyChanges: async (items, label) => {
      const stack = current as CommandStack;
      const plan = planChangeItems(stack.state, items);
      labels.push(label);
      stack.execute({
        id: 'test.apply',
        label,
        apply(draft) {
          for (const part of plan.commands) part.apply(draft);
        },
      });
    },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BlocksItemsStudioHostContext.Provider value={host}>
      {children}
    </BlocksItemsStudioHostContext.Provider>
  );
  const rendered = renderOnStack(subject, schema, { wrapper });
  current = rendered.stack;
  for (const path of assets) {
    rendered.stack.execute(commands.addAsset('demo', { path, mediaType: 'image/png' }));
  }
  return { ...rendered, labels };
}

const commitId = (testId: string, value: string) => {
  const input = screen.getByTestId(testId);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
const assetsOf = (stack: CommandStack) =>
  stack.state.namespaces[0]?.assets.map((asset) => asset.path) ?? [];

describe('picture copies', () => {
  it('keeps project pictures stored elsewhere, once per place, and skips vanilla ones', () => {
    expect(
      pictureCopiesOf([
        { from: 'assets/demo/textures/art/a.png', to: 'assets/demo/textures/entity/a.png' },
        { from: 'assets/demo/textures/art/b.png', to: 'assets/demo/textures/entity/a.png' },
        { from: 'assets/minecraft/textures/x.png', to: 'assets/demo/textures/entity/x.png' },
        { from: 'assets/demo/textures/same.png', to: 'assets/demo/textures/same.png' },
      ]),
    ).toEqual([
      {
        from: { namespace: 'demo', path: 'textures/art/a.png' },
        to: { namespace: 'demo', path: 'textures/entity/a.png' },
      },
    ]);
    const copies = villagerTypePictureCopies(target, {
      ...look(),
      data: withVillagerTypePicture(look().data, 'villager', 'demo:art/swamp'),
    });
    expect(copies.map((copy) => copy.to.path)).toEqual([
      'textures/entity/villager/type/swamp.png',
      'textures/entity/zombie_villager/type/swamp.png',
    ]);
    expect(missingPictureCopies(EMPTY, copies)).toEqual([]);
    const change = pictureCopyChange(
      EMPTY,
      look(),
      look({ textures: { villager: 'demo:art/swamp' } }).data,
      copies.map((copy) => ({ copy, bytes: PNG })),
      'x',
    );
    expect(change.items.map((item) => item.op)).toEqual(['update', 'asset', 'asset']);
  });

  it("names a boat's pictures after its wood, the chest boat's only with a chest", () => {
    const data = withBoatPicture(boat().data, 'boat', 'demo:art/maple_boat');
    expect(boatPictureCopies(target, { id: BOAT, data }).map((copy) => copy.to.path)).toEqual([
      'textures/entity/boat/maple.png',
    ]);
    const chest = withBoatPicture(
      boat({ 'msm:boat': { chest: true } }).data,
      'chest_boat',
      'demo:art/maple_chest',
    );
    expect(
      boatPictureCopies(target, { id: BOAT, data: chest }).map((copy) => copy.to.path),
    ).toEqual(['textures/entity/chest_boat/maple.png']);
    expect(withBoatPicture(data, 'boat', '')).not.toHaveProperty('boat_textures');
  });
});

describe('Villager look Studio', () => {
  it('edits the biomes and the hat, and copies a picked picture in one undo step', async () => {
    const { stack, data, labels } = withHost(look(), ['textures/art/swamp.png']);
    await screen.findByTestId('villager-type-studio', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });
    expect(screen.getByTestId('villager-type-vanilla').textContent).toContain('Plains');
    fireEvent.change(screen.getByTestId('villager-type-hat'), { target: { value: 'partial' } });
    expect((data() as { textures?: Json }).textures).toEqual({ hat: 'partial' });
    commitId('villager-type-picture-villager', 'demo:art/swamp');
    await waitFor(() => expect(labels).toEqual(['Villager look picture']));
    expect((data() as { textures?: Json }).textures).toEqual({
      hat: 'partial',
      villager: 'demo:art/swamp',
    });
    expect(assetsOf(stack)).toContain('textures/entity/villager/type/swamp.png');
    expect(assetsOf(stack)).toContain('textures/entity/zombie_villager/type/swamp.png');
    stack.undo();
    expect((data() as { textures?: Json }).textures).toEqual({ hat: 'partial' });
    expect(assetsOf(stack)).not.toContain('textures/entity/villager/type/swamp.png');
  });

  it('offers to copy pictures added before', async () => {
    const { labels } = withHost(look({ textures: { villager: 'demo:art/swamp' } }), [
      'textures/art/swamp.png',
    ]);
    fireEvent.click(
      await screen.findByTestId(
        'villager-type-pictures-copy',
        {},
        { timeout: LAZY_CHUNK_TIMEOUT_MS },
      ),
    );
    await waitFor(() => expect(labels).toEqual(['Copy villager look pictures']));
  });
});

describe('Boat section', () => {
  it('makes an item a boat with a chest boat and copies its picture', async () => {
    const { stack, data, labels } = withHost(boat({}), ['textures/art/maple_boat.png']);
    fireEvent.click(screen.getByTestId('item-boat-on'));
    const component = () => (data() as { components: Record<string, Json> }).components['msm:boat'];
    expect(component()).toEqual({});
    fireEvent.click(screen.getByTestId('item-boat-chest'));
    expect(component()).toEqual({ chest: true });
    expect(screen.getByTestId('item-boat-chest-name')).toBeTruthy();
    commitId('item-boat-picture-boat', 'demo:art/maple_boat');
    await waitFor(() => expect(labels).toEqual(['Boat picture']));
    expect(assetsOf(stack)).toContain('textures/entity/boat/maple.png');
    expect((data() as { boat_textures?: Json }).boat_textures).toEqual({
      boat: 'demo:art/maple_boat',
    });
  });
});

describe('Very easy lists', () => {
  it('keeps the job, pictures and trades of a profession, and the boat of an item', async () => {
    expect(PROFESSION_VERY_EASY_SECTIONS).toEqual([
      'profession-job',
      'profession-pictures',
      'profession-trades',
    ]);
    expect(ITEM_VERY_EASY_SECTIONS).toContain('item-boat');
    const before = usePreferences.getState().mode;
    usePreferences.setState({ mode: 'very-easy' as never });
    try {
      withHost(
        element('demo:smith' as ResourceLocation, 'msm:villager_profession', {
          format: 1,
          job_site: 'demo:anvil',
        }),
      );
      expect(
        await screen.findByTestId('profession-job', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS }),
      ).toBeTruthy();
      expect(screen.getByTestId('profession-trades')).toBeTruthy();
      expect(screen.queryByTestId('profession-work')).toBeNull();
      expect(screen.queryByTestId('profession-advanced-toggle')).toBeNull();
    } finally {
      usePreferences.setState({ mode: before });
    }
  });
});
