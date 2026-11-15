// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Block Studio for the types of ADR 0094 (B452, ADR 0101 D1): the Type picker's groups and
 * pictures, each new type's own fields, the companion shown as part of the element, the
 * Waterlogging switch, and the sign's writing screen picture written with the field in one undo
 * step (with the session's warning when it is missing).
 */
import type { CommandStack, Element, Json, ResourceLocation } from '@msm/core';
import { BLOCK_TYPES } from '@msm/plugin-blocks-items';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type ChangeAsset,
  type ChangeItem,
  planChangeItems,
} from '../../../../src/renderer/src/changeset/changeset';
import { PLAIN_PROBLEMS } from '../../../../src/renderer/src/session/plain-problems';
import {
  SIGN_GUI_PICTURE_MISSING_CODE,
  signGuiPictureProblems,
} from '../../../../src/renderer/src/session/sign-gui-pictures';
import {
  BLOCK_TYPE_GROUPS,
  companionRows,
  modelSlotLabel,
  NEW_BLOCK_TYPES,
  signPictureCopy,
  TEXTURE_SLOTS,
  textureSlotsOf,
  withBlockType,
} from '../../../../src/renderer/src/studios/blocks-items/block-type-model';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import {
  projectBlocksOf,
  withCakeFood,
  withHarvest,
} from '../../../../src/renderer/src/studios/blocks-items/PlantSection';
import { signPictureChange } from '../../../../src/renderer/src/studios/blocks-items/TexturesSection';
import {
  waterloggingState,
  withWaterloggable,
} from '../../../../src/renderer/src/studios/blocks-items/WaterloggingSwitch';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { BLOCK_VERY_EASY_SECTIONS } from '../../../../src/renderer/src/studios/very-easy';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { projectOf, renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(cleanup);

const ID = 'demo:thing' as ResourceLocation;
const block = (data: Record<string, Json> = {}): Element =>
  element(ID, 'msm:block', { format: 1, display_name: 'Thing', sound_type: 'stone', ...data });
type Data = Record<string, Json | undefined> & {
  components?: Record<string, Json>;
  textures?: Record<string, Json>;
};
const read = (data: () => Json) => data() as Data;
const select = (testId: string) => screen.getByTestId(testId) as HTMLSelectElement;
const pick = (testId: string, value: string) =>
  fireEvent.change(select(testId), { target: { value } });
const commit = (testId: string, value: string) => {
  const input = screen.getByTestId(testId) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

/** A host whose `applyChanges` applies the items as one command and records the writes. */
function hostFor(
  stack: () => CommandStack,
  writes: ChangeAsset[],
  assets: Record<string, Uint8Array> = {},
): BlocksItemsStudioHost {
  return {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    modelPreview: {
      folders: bundle.target.folders.resource,
      readProjectAsset: async (namespace, path) => assets[`${namespace}:${path}`] ?? null,
      vanilla: null,
    },
    applyChanges: async (items: readonly ChangeItem[], label: string, more) => {
      const plan = planChangeItems(stack().state, items);
      if (plan.skipped.length > 0) throw new Error('The project changed meanwhile.');
      const parts = plan.commands;
      writes.push(...more);
      stack().execute({
        id: 'test.apply',
        label,
        apply(draft) {
          for (const part of parts) part.apply(draft);
        },
      });
    },
  };
}

function renderWithHost(
  subject: Element,
  options: { others?: Element[]; assets?: Record<string, Uint8Array> } = {},
) {
  const writes: ChangeAsset[] = [];
  let current: CommandStack | undefined;
  const host = hostFor(() => current as CommandStack, writes, options.assets);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BlocksItemsStudioHostContext.Provider value={host}>
      {children}
    </BlocksItemsStudioHostContext.Provider>
  );
  const rendered = renderOnStack(subject, schema, {
    wrapper,
    ...(options.others === undefined ? {} : { others: options.others }),
  });
  current = rendered.stack;
  return { ...rendered, writes };
}

describe('Type picker groups and pictures', () => {
  it('puts every type in exactly one group', () => {
    const grouped = BLOCK_TYPE_GROUPS.flatMap((group) => group.types);
    expect([...grouped].sort()).toEqual([...BLOCK_TYPES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(BLOCK_TYPE_GROUPS.map((group) => group.label)).toEqual([
      'Building blocks',
      'Plants',
      'Furniture and lights',
    ]);
    const furniture = BLOCK_TYPE_GROUPS.find((group) => group.id === 'furniture')?.types;
    expect(furniture).toContain('cake');
    expect(furniture).toContain('candle');
    expect(BLOCK_TYPE_GROUPS.find((group) => group.id === 'plants')?.types).toContain('stem');
  });

  it('offers the twenty new types in option groups and as pictures', () => {
    const { stack, data } = renderOnStack(block({ model: 'minecraft:block/stone' }), schema);
    const picker = select('block-type-picker');
    const groups = [...picker.querySelectorAll('optgroup')].map((group) => group.label);
    expect(groups).toEqual(['Building blocks', 'Plants', 'Furniture and lights']);
    for (const type of NEW_BLOCK_TYPES) {
      expect(picker.querySelector(`option[value="${type}"]`)).not.toBeNull();
      expect(screen.getByTestId(`block-type-tile-${type}`).querySelector('svg')).not.toBeNull();
    }
    expect(screen.getByTestId('block-type-tile-block').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('block-type-tile-lantern'));
    expect(read(data).type).toBe('lantern');
    expect(read(data).textures).toEqual({ all: 'minecraft:block/stone' });
    expect(screen.getByTestId('block-type-tile-lantern').getAttribute('aria-pressed')).toBe('true');
    stack.undo();
    expect(read(data).type).toBeUndefined();
  });

  it('lists the new types in the Very easy sections', () => {
    for (const id of ['block-cake', 'block-berry-bush', 'block-stem', 'block-weathering']) {
      expect(BLOCK_VERY_EASY_SECTIONS).toContain(id);
    }
  });
});

describe('the new types in the model', () => {
  it('gives each type its texture slots or stage pictures', () => {
    for (const type of NEW_BLOCK_TYPES) {
      if (type === 'berry_bush' || type === 'cocoa') expect(TEXTURE_SLOTS[type]).toEqual([]);
      else expect(TEXTURE_SLOTS[type].length).toBeGreaterThan(0);
    }
    expect(TEXTURE_SLOTS.sign.map((slot) => slot.key)).toEqual(['all', 'sign', 'item']);
    expect(TEXTURE_SLOTS.hanging_sign.map((slot) => slot.key)).toEqual([
      'all',
      'hanging_gui',
      'item',
    ]);
    expect(TEXTURE_SLOTS.cake.map((slot) => slot.key)).toEqual([
      'top',
      'bottom',
      'side',
      'inside',
      'item',
    ]);
    // A key the list leaves out still shows, so it can be cleared.
    expect(
      textureSlotsOf('ladder', { type: 'ladder', textures: { texture: 'demo:block/l' } }).map(
        (slot) => slot.key,
      ),
    ).toEqual(['all', 'texture']);
  });

  it('names the new model slots in words', () => {
    expect(modelSlotLabel('wall', 'torch')).toBe('On a wall');
    expect(modelSlotLabel('wall', 'fence_gate')).toBe('In a wall');
    expect(modelSlotLabel('slice2')).toBe('2 slices eaten');
    expect(modelSlotLabel('layers1')).toBe('1 layer');
    expect(modelSlotLabel('rot2')).toBe('Turned an eighth');
    expect(modelSlotLabel('attached_rot0')).toBe('Under a block, straight');
    expect(modelSlotLabel('dead_three')).toBe('Three, out of water');
    expect(modelSlotLabel('two_lit')).toBe('Two, lit');
    expect(modelSlotLabel('head')).toBe('Head (the pillow end)');
    expect(modelSlotLabel('bottom', 'tall_plant')).toBe('Lower half');
  });

  it('fills the required fields and drops what the new type does not take', () => {
    const start = {
      textures: { all: 'demo:block/thing' },
      components: {
        'msm:strippable': { into: 'demo:x' },
        'msm:waterloggable': {},
        'msm:weathering': { stage: 'unaffected' },
      },
    };
    expect(withBlockType(start, 'stem', { texture: 'demo:block/thing' })).toMatchObject({
      type: 'stem',
      fruit: 'minecraft:melon',
      textures: { stem: 'demo:block/thing' },
    });
    expect(withBlockType(start, 'stem').components).toBeUndefined();
    expect(withBlockType(start, 'potted_plant', { texture: 'demo:block/thing' })).toMatchObject({
      plant: 'minecraft:short_grass',
      textures: { plant: 'demo:block/thing' },
    });
    expect(withBlockType({ item: {} }, 'potted_plant').item).toBeUndefined();
    expect(withBlockType({}, 'berry_bush', { blockId: 'demo:bush' }).berry).toBe('demo:bush');
    expect(withBlockType({ textures: {} }, 'berry_bush', { texture: 'demo:b' }).textures).toEqual({
      stages: ['demo:b'],
    });
    expect(withBlockType({}, 'sign', { woodTypes: ['spruce'] }).wood_type).toBe('spruce');
    // Chains and lanterns keep weathering but not waterlogging.
    expect(withBlockType(start, 'chain').components).toEqual({
      'msm:weathering': { stage: 'unaffected' },
    });
    expect(withBlockType({ type: 'bed', rule: 'bed', colour: 'red' }, 'torch')).toEqual({
      type: 'torch',
    });
  });
});

describe('per-type fields', () => {
  it('edits a bed rule and colour from the target facts', () => {
    const { data } = renderOnStack(
      block({ type: 'bed', textures: { bed: 'demo:block/b' } }),
      schema,
    );
    const rules = [...select('block-bed-rule').options].map((option) => option.value);
    expect(rules).toEqual(['', ...Object.keys(bundle.target.blocks?.bedRules ?? {})]);
    pick('block-bed-rule', 'straw_bed');
    expect(read(data).rule).toBe('straw_bed');
    pick('block-bed-colour', 'red');
    expect(read(data).colour).toBe('red');
    expect(within(select('block-bed-colour')).getByText('Light blue')).toBeTruthy();
    expect(screen.queryByTestId('block-companion')).toBeNull();
  });

  it('edits a torch particle and shows the wall torch as part of it', () => {
    const { data } = renderOnStack(block({ type: 'torch' }), schema);
    expect(screen.getByText(/Flame particle \(empty: minecraft:flame\)/)).toBeTruthy();
    commit('block-torch-particle', 'minecraft:soul_fire_flame');
    expect(read(data).particle).toBe('minecraft:soul_fire_flame');
    const rows = screen.getAllByTestId('block-companion-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toBe('Also makes: demo:thing_wall (the torch on a wall)');
  });

  it('edits the wood type of signs and hanging signs and shows their wall blocks', () => {
    const { data } = renderOnStack(block({ type: 'sign', wood_type: 'oak' }), schema);
    pick('block-sign-wood-type', 'cherry');
    expect(read(data).wood_type).toBe('cherry');
    expect(screen.getByTestId('block-companion').textContent).toContain(
      'demo:thing_wall (the sign on a wall)',
    );
    pick('block-type-picker', 'hanging_sign');
    expect(read(data).wood_type).toBe('cherry');
    expect(screen.getByTestId('block-companion').textContent).toContain(
      'the hanging sign on a wall',
    );
  });

  it('shows the attached stem and edits the fruit, the soils and the own-block picker', () => {
    const melon = element('demo:gourd' as ResourceLocation, 'msm:block', {
      format: 1,
      display_name: 'Gourd',
      model: 'minecraft:block/melon',
    });
    const { data } = renderOnStack(block({ type: 'stem', fruit: 'minecraft:melon' }), schema, {
      others: [melon],
    });
    expect(companionRows({ id: ID, data: read(data) as Json })).toEqual([
      { id: 'demo:thing_attached', words: 'the stem bent onto a grown fruit' },
    ]);
    expect(screen.getByTestId('block-companion').textContent).toContain('demo:thing_attached');
    pick('stem-fruit-own', 'demo:gourd');
    expect(read(data).fruit).toBe('demo:gourd');
    expect(screen.getByText(/empty: #minecraft:supports_melon_stem\)/)).toBeTruthy();
    commit('stem-soil', '#minecraft:dirt');
    commit('stem-fruit-soil', '#minecraft:sand');
    expect(read(data)).toMatchObject({ soil: '#minecraft:dirt', fruit_soil: '#minecraft:sand' });
  });

  it('edits a cake: food in one field pair and the event after a slice', () => {
    const { data } = renderOnStack(
      block({ type: 'cake', events: { ate: { actions: [] } } }),
      schema,
    );
    fireEvent.change(screen.getByTestId('cake-nutrition'), { target: { value: '4' } });
    fireEvent.blur(screen.getByTestId('cake-nutrition'));
    expect(read(data).food).toEqual({ nutrition: 4, saturation: 0.1 });
    pick('cake-on-eat', 'ate');
    expect(read(data).on_eat).toBe('ate');
    expect(withCakeFood({ nutrition: 4, saturation: 0.1 }, 'nutrition', undefined)).toBeUndefined();
    expect(withCakeFood({ nutrition: 4, saturation: 0.5 }, 'nutrition', undefined)).toEqual({
      nutrition: 2,
      saturation: 0.5,
    });
  });

  it('edits a berry bush: own item, harvest counts and hurting', () => {
    const { data } = renderOnStack(block({ type: 'berry_bush', berry: 'minecraft:apple' }), schema);
    fireEvent.click(screen.getByTestId('berry-use-own'));
    expect(read(data).berry).toBe('demo:thing');
    fireEvent.change(screen.getByTestId('berry-harvest-full-max'), { target: { value: '5' } });
    fireEvent.blur(screen.getByTestId('berry-harvest-full-max'));
    expect(read(data).harvest).toEqual({ ripe: [1, 2], full: [2, 5] });
    fireEvent.click(screen.getByTestId('berry-hurts'));
    expect(read(data).hurts).toBe(false);
    expect(withHarvest(undefined, 'ripe', 0, 0)).toEqual({ ripe: [0, 2], full: [2, 3] });
    // Stage pictures in the Textures section.
    fireEvent.click(screen.getByTestId('block-stage-texture-add'));
    commit('block-stage-texture-0', 'demo:block/bush_0');
    expect(read(data).textures).toEqual({ stages: ['demo:block/bush_0'] });
  });

  it('edits a tall plant, a vine and a pod', () => {
    const { data } = renderOnStack(block({ type: 'tall_plant' }), schema);
    pick('tall-plant-bonemeal', 'none');
    expect(read(data).bonemeal).toBe('none');
    pick('block-type-picker', 'vine');
    fireEvent.click(screen.getByTestId('vine-spreads'));
    expect(read(data)).toMatchObject({ type: 'vine', spreads: false });
    pick('block-type-picker', 'cocoa');
    expect(read(data).spreads).toBeUndefined();
    commit('cocoa-support', '#minecraft:logs');
    expect(read(data).support).toBe('#minecraft:logs');
  });

  it('picks a potted plant from the project plants', () => {
    const sapling = element('demo:twig' as ResourceLocation, 'msm:block', {
      format: 1,
      type: 'sapling',
      tree: 'minecraft:oak',
    });
    const { data } = renderOnStack(
      block({ type: 'potted_plant', plant: 'minecraft:short_grass' }),
      schema,
      { others: [sapling] },
    );
    expect(projectBlocksOf(projectOf(sapling), ['sapling'])).toEqual([
      { id: 'demo:twig', label: 'demo:twig, Sapling' },
    ]);
    pick('potted-plant-own', 'demo:twig');
    expect(read(data).plant).toBe('demo:twig');
  });

  it('shows no extra section for the types without fields', () => {
    for (const type of ['ladder', 'chain', 'rod', 'carpet', 'scaffolding', 'sea_pickle']) {
      renderOnStack(block({ type, textures: { all: 'demo:block/x' } }), schema);
      expect(screen.queryByTestId('block-companion')).toBeNull();
      expect(screen.getByTestId('block-textures')).toBeTruthy();
      cleanup();
    }
  });
});

describe('Waterlogging switch', () => {
  it('adds and removes the component in one undo step on a simple block', () => {
    const { stack, data } = renderOnStack(block({ model: 'minecraft:block/stone' }), schema);
    fireEvent.click(screen.getByTestId('block-waterlogged'));
    expect(read(data).components).toEqual({ 'msm:waterloggable': {} });
    stack.undo();
    expect(read(data).components).toBeUndefined();
  });

  it('is off for storage, says so for types that hold water themselves, absent elsewhere', () => {
    expect(waterloggingState('block', { components: { 'msm:container': {} } })).toBe('blocked');
    expect(waterloggingState('horizontal', {})).toBe('switch');
    expect(waterloggingState('ladder', {})).toBe('own');
    expect(waterloggingState('bed', {})).toBe('none');
    expect(waterloggingState('slab', { components: { 'msm:waterloggable': {} } })).toBe('switch');
    expect(withWaterloggable({ components: { 'msm:waterloggable': {} } }, false)).toEqual({});
    renderOnStack(block({ type: 'lantern' }), schema);
    expect(screen.getByTestId('block-waterlogged-own')).toBeTruthy();
    cleanup();
    renderOnStack(
      block({ model: 'minecraft:block/stone', components: { 'msm:container': {} } }),
      schema,
    );
    expect((screen.getByTestId('block-waterlogged') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('block-waterlogged-blocked')).toBeTruthy();
  });
});

describe("sign's writing screen picture", () => {
  const sign = (textures: Record<string, Json> = {}) =>
    block({ type: 'sign', wood_type: 'oak', textures });

  it('copies only project pictures, from the writing screen slot or the board', () => {
    const plain = sign();
    expect(signPictureCopy(plain, 'sign', 'demo:block/board_gui')).toMatchObject({
      from: { namespace: 'demo', path: 'textures/block/board_gui.png' },
      to: { namespace: 'demo', path: 'textures/gui/signs/thing.png' },
    });
    expect(signPictureCopy(plain, 'all', 'demo:block/board')?.picture).toBe('demo:block/board');
    expect(
      signPictureCopy(sign({ sign: 'demo:block/g' }), 'all', 'demo:block/board'),
    ).toBeUndefined();
    expect(signPictureCopy(plain, 'sign', 'minecraft:block/oak_planks')).toBeUndefined();
    expect(signPictureCopy(plain, 'item', 'demo:item/sign')).toBeUndefined();
    const hanging = block({ type: 'hanging_sign', wood_type: 'oak' });
    expect(signPictureCopy(hanging, 'hanging_gui', 'demo:block/h')?.to.path).toBe(
      'textures/gui/hanging_signs/thing.png',
    );
  });

  it('builds the field update and a new asset, or an undoable write over an existing one', () => {
    const copy = signPictureCopy(sign(), 'sign', 'demo:block/g');
    if (copy === undefined) throw new Error('no copy');
    const bytes = new Uint8Array([1, 2, 3]);
    const fresh = signPictureChange(projectOf(sign()), sign(), copy, bytes);
    expect(fresh.items.map((item) => item.op)).toEqual(['update', 'asset']);
    expect(fresh.writes).toEqual([]);
    const project = projectOf(sign());
    project.namespaces[0]?.assets.push({
      path: 'textures/gui/signs/thing.png',
      mediaType: 'image/png',
    });
    const over = signPictureChange(project, sign(), copy, bytes);
    expect(over.items.map((item) => item.op)).toEqual(['update']);
    expect(over.writes).toEqual([
      { namespace: 'demo', path: 'textures/gui/signs/thing.png', bytes },
    ]);
  });

  it('writes the picture with the field as one undo step', async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    const { stack, data } = renderWithHost(sign(), {
      assets: { 'demo:textures/block/board_gui.png': bytes },
    });
    commit('block-texture-sign', 'demo:block/board_gui');
    await waitFor(() => expect(read(data).textures).toEqual({ sign: 'demo:block/board_gui' }));
    const assets = () => stack.state.namespaces[0]?.assets.map((asset) => asset.path) ?? [];
    expect(assets()).toContain('textures/gui/signs/thing.png');
    expect(stack.undoLabel()).toBe('Sign picture');
    stack.undo();
    expect(read(data).textures).toEqual({});
    expect(assets()).not.toContain('textures/gui/signs/thing.png');
  });

  it('sets only the field when the picture is a vanilla one', async () => {
    const { stack, data } = renderWithHost(sign());
    commit('block-texture-sign', 'minecraft:block/oak_planks');
    expect(read(data).textures).toEqual({ sign: 'minecraft:block/oak_planks' });
    expect(stack.state.namespaces[0]?.assets).toEqual([]);
  });

  it('warns while the picture is missing, in plain words too', () => {
    const project = projectOf(sign({ sign: 'demo:block/g' }), block({ type: 'torch' }));
    const problems = signGuiPictureProblems(project, bundle.target);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      severity: 'warning',
      code: SIGN_GUI_PICTURE_MISSING_CODE,
      elementId: ID,
      path: '/textures/sign',
    });
    project.namespaces[0]?.assets.push({
      path: 'textures/gui/signs/thing.png',
      mediaType: 'image/png',
    });
    expect(signGuiPictureProblems(project, bundle.target)).toEqual([]);
    expect(signGuiPictureProblems(project, undefined)).toEqual([]);
    expect(PLAIN_PROBLEMS[SIGN_GUI_PICTURE_MISSING_CODE]?.words('Board')).toContain('Board');
  });
});
