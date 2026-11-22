// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Block Studio 2 (B516, ADR 0112 D1 for batch 1): the growing plants and the flower pot of ADR
 * 0103 in the Type picker with their own sections, the pot's plant list (the ThingPicker over
 * the project's plants and the plants Minecraft pots), the chest's Double chest and Different for
 * every player, Holds water on storage, the Sounds section with an own set type, and the
 * "Vanilla block rules" Studio; Very easy shows names, not ids.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { usePreferences } from '../../../../src/renderer/src/store/preferences';
import { VanillaBlockRulesStudio } from '../../../../src/renderer/src/studios/blocks-items/AdditionStudios';
import {
  newVanillaRule,
  VANILLA_BLOCK_RULES_KIND,
  VANILLA_RULE_LISTS,
  VANILLA_RULE_WORDS,
  vanillaPairOf,
} from '../../../../src/renderer/src/studios/blocks-items/additions-model';
import {
  BLOCK_TYPE_GROUPS,
  BLOCK_TYPE_LABELS,
  companionRows,
  GROWING_PLANT_BLOCK_TYPES,
  modelSlotLabel,
  textureSlotsOf,
  withBlockType,
} from '../../../../src/renderer/src/studios/blocks-items/block-type-model';
import {
  offersDoubleChest,
  withChestOption,
  withContainerLayout,
  withRows,
} from '../../../../src/renderer/src/studios/blocks-items/inventory-model';
import {
  columnMaxHeight,
  defaultColumnMinHeight,
  projectPottablePlants,
  vanillaPottablePlants,
  withColumnStyle,
  withPotPlant,
  withRangeBound,
  withTiltTicks,
} from '../../../../src/renderer/src/studios/blocks-items/plant-model';
import {
  setTypeBase,
  withBlockSound,
  withOwnSetType,
  withSetTypeBase,
  withSetTypeSound,
} from '../../../../src/renderer/src/studios/blocks-items/sounds-model';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
import type { StudioProps } from '../../../../src/renderer/src/studios/types';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { BLOCK_VERY_EASY_SECTIONS } from '../../../../src/renderer/src/studios/very-easy';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../../lazy-chunks';
import { projectOf, renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
const VANILLA: Record<string, string[]> = {
  block: [
    'poppy',
    'potted_poppy',
    'azalea',
    'potted_azalea_bush',
    'stone',
    'oak_log',
    'dirt',
    'kelp',
  ],
  item: ['glow_berries', 'stick'],
  sound_event: ['block.stone.break', 'block.wood.step', 'block.iron_door.open'],
};
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex(), VANILLA);
  await preloadChunks(
    () => import('../../../../src/renderer/src/studios/blocks-items/InventorySection'),
    () => import('../../../../src/renderer/src/studios/blocks-items/SoundsSection'),
  );
}, PRELOAD_TIMEOUT_MS);
afterEach(() => {
  cleanup();
  usePreferences.setState({ mode: 'easy' as never });
});

const ID = 'demo:thing' as ResourceLocation;
const block = (data: Record<string, Json> = {}, id: string = ID): Element =>
  element(id as ResourceLocation, 'msm:block', {
    format: 1,
    display_name: 'Thing',
    sound_type: 'stone',
    ...data,
  });
type Data = Record<string, Json | undefined> & {
  components?: Record<string, Json>;
  textures?: Record<string, Json>;
};
const read = (data: () => Json) => data() as Data;
const commit = (testId: string, value: string) => {
  const input = screen.getByTestId(testId) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
const pick = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });

describe('the ADR 0103 types in the model', () => {
  it('groups them under Plants with plain words', () => {
    const plants = BLOCK_TYPE_GROUPS.find((group) => group.id === 'plants')?.types ?? [];
    for (const type of GROWING_PLANT_BLOCK_TYPES) expect(plants).toContain(type);
    const words = GROWING_PLANT_BLOCK_TYPES.map((type) => BLOCK_TYPE_LABELS[type].split(' (')[0]);
    expect(words).toEqual([
      'Grows in long strands',
      'Grows tall like sugar cane',
      'Spreads over any side',
      'Tips when you stand on it',
      'A flower pot',
    ]);
  });

  it('gives each type its required fields and carries the look over', () => {
    const from = { format: 1, textures: { all: 'demo:block/reed' } } as Json;
    expect(withBlockType(from, 'column_plant', { texture: 'demo:block/reed' })).toMatchObject({
      type: 'column_plant',
      style: 'cane',
      textures: { all: 'demo:block/reed' },
    });
    expect(withBlockType(from, 'dripleaf', { texture: 'demo:block/leaf' })).toMatchObject({
      size: 'big',
      textures: { top: 'demo:block/leaf' },
    });
    expect(withBlockType(from, 'flower_pot', {})).toMatchObject({ plants: ['minecraft:poppy'] });
    expect(withBlockType(from, 'growing_plant', { texture: 'demo:block/k' }).textures).toEqual({
      head: 'demo:block/k',
    });
    // An own set type stays when a door becomes a trapdoor.
    const door = { format: 1, type: 'door', set_type: { base: 'iron', sounds: { open: 'x' } } };
    expect(withBlockType(door, 'trapdoor').set_type).toEqual(door.set_type);
  });

  it('shows the texture slots of the shape', () => {
    const keys = (type: Parameters<typeof textureSlotsOf>[0], data: Json) =>
      textureSlotsOf(type, data).map((slot) => slot.key);
    expect(keys('column_plant', { style: 'cactus' })).toEqual(['side', 'top', 'bottom']);
    expect(keys('column_plant', { style: 'bamboo' })).toEqual([
      'stalk',
      'leaves_small',
      'leaves_large',
      'shoot',
    ]);
    expect(keys('dripleaf', { size: 'small' })).toEqual(['top', 'side', 'stem_top', 'stem_bottom']);
    expect(keys('growing_plant', { berries: { item: 'x:y' } })).toContain('head_berries');
    expect(keys('flower_pot', {})).toEqual(['pot', 'dirt', 'item']);
    expect(modelSlotLabel('head', 'growing_plant')).toBe('Tip');
    expect(modelSlotLabel('partial_tilt', 'dripleaf')).toBe('Tipping a little');
  });

  it('says the companions in words', () => {
    const strand = companionRows({ id: 'demo:kelp', data: { format: 1, type: 'growing_plant' } });
    expect(strand).toEqual([{ id: 'demo:kelp_plant', words: 'the strand behind the tip' }]);
    const bamboo = companionRows({
      id: 'demo:cane',
      data: { format: 1, type: 'column_plant', style: 'bamboo' },
    });
    expect(bamboo.map((row) => row.words)).toEqual(['the shoot it starts from']);
    const leaf = companionRows({
      id: 'demo:leaf',
      data: { format: 1, type: 'dripleaf', size: 'big' },
    });
    expect(leaf.map((row) => row.id)).toEqual(['demo:leaf_stem']);
    const pot = companionRows({
      id: 'demo:pot',
      data: { format: 1, type: 'flower_pot', plants: ['minecraft:red_tulip', 'demo:fern'] },
    });
    expect(pot).toEqual([
      {
        id: 'demo:pot_red_tulip',
        words: 'the pot with red tulip in it',
        plant: 'minecraft:red_tulip',
      },
      { id: 'demo:pot_fern', words: 'the pot with fern in it', plant: 'demo:fern' },
    ]);
  });

  it('lists the new sections in Very easy', () => {
    for (const id of [
      'block-growing-plant',
      'block-column-plant',
      'block-multiface',
      'block-dripleaf',
      'block-flower-pot',
      'block-sounds',
    ]) {
      expect(BLOCK_VERY_EASY_SECTIONS).toContain(id);
    }
  });
});

describe('plant helpers', () => {
  it('changes a column plant shape and its defaults', () => {
    expect(columnMaxHeight({ style: 'bamboo' })).toBe(16);
    expect(defaultColumnMinHeight({ style: 'bamboo' })).toBe(12);
    expect(defaultColumnMinHeight({ style: 'bamboo', max_height: 8 })).toBe(8);
    expect(defaultColumnMinHeight({ style: 'cactus' })).toBe(3);
    expect(
      withColumnStyle(
        { type: 'column_plant', style: 'cane', touch_damage: 0, textures: { all: 'a:b' } },
        'bamboo',
      ),
    ).toEqual({ type: 'column_plant', style: 'bamboo', textures: { stalk: 'a:b' } });
  });

  it('writes both bounds of a range and vanilla tilt timing as nothing', () => {
    expect(withRangeBound(undefined, 'max', 3, 1)).toEqual({ min: 1, max: 3 });
    expect(withRangeBound({ min: 2, max: 3 }, 'max', undefined, 1)).toEqual({ min: 2, max: 2 });
    expect(withRangeBound({ max: 3 }, 'max', undefined, 1)).toBeUndefined();
    expect(withTiltTicks({}, 1, 20)).toEqual([2, 20, 10]);
    expect(withTiltTicks({ tilt_ticks: [2, 20, 10] }, 1, undefined)).toBeUndefined();
  });

  it("reads the plants Minecraft's pot takes and the project's own", () => {
    const ids = VANILLA.block?.map((id) => `minecraft:${id}`) ?? [];
    const suggest = (_registry: string, prefix: string) =>
      ids.filter((id) => id.startsWith(prefix));
    expect(vanillaPottablePlants(suggest)).toEqual(['minecraft:azalea', 'minecraft:poppy']);
    const project = projectOf(
      block({ type: 'sapling', tree: 'minecraft:oak' }, 'demo:maple_sapling'),
      block({ type: 'dripleaf', size: 'small', grows_into: 'demo:big' }, 'demo:small'),
      block({ type: 'vine', item: false }, 'demo:hidden_vine'),
      block({}, 'demo:stone'),
    );
    expect(projectPottablePlants(project)).toEqual(['demo:maple_sapling']);
    expect(withPotPlant(['minecraft:poppy'], 'poppy')).toEqual(['minecraft:poppy']);
    expect(withPotPlant(['minecraft:poppy'], 'demo:fern')).toEqual([
      'minecraft:poppy',
      'demo:fern',
    ]);
  });
});

describe('the plant sections', () => {
  it('turns a block into a strand with berries in undo steps', () => {
    const { stack, data } = renderOnStack(block({ model: 'minecraft:block/kelp' }), schema);
    fireEvent.click(screen.getByTestId('block-type-tile-growing_plant'));
    expect(read(data).type).toBe('growing_plant');
    expect(screen.getByTestId('block-growing-plant')).toBeTruthy();
    pick('growing-plant-direction', 'down');
    expect(read(data).direction).toBe('down');
    fireEvent.click(screen.getByTestId('growing-plant-berries'));
    expect(read(data).berries).toEqual({ item: 'demo:thing' });
    fireEvent.click(screen.getByTestId('growing-plant-needs-water'));
    expect(read(data).needs_water).toBe(true);
    // Climbable follows water unless set.
    expect((screen.getByTestId('growing-plant-climbable') as HTMLInputElement).checked).toBe(false);
    stack.undo();
    expect(read(data).needs_water).toBeUndefined();
    expect(screen.getByTestId('block-companion-row').textContent).toContain('demo:thing_plant');
  });

  it('changes a column plant to bamboo in one step and edits a dripleaf', () => {
    const { stack, data } = renderOnStack(
      block({ type: 'column_plant', style: 'cane', textures: { all: 'demo:block/reed' } }),
      schema,
    );
    pick('column-plant-style', 'bamboo');
    expect(read(data)).toMatchObject({ style: 'bamboo', textures: { stalk: 'demo:block/reed' } });
    expect(screen.getByTestId('column-plant-bamboo-note')).toBeTruthy();
    stack.undo();
    expect(read(data).style).toBe('cane');
    cleanup();
    const leaf = renderOnStack(block({ type: 'dripleaf', size: 'small' }, 'demo:small'), schema, {
      others: [block({ type: 'dripleaf', size: 'big', display_name: 'Big leaf' }, 'demo:big')],
    });
    pick('dripleaf-grows-into-own', 'demo:big');
    expect(read(leaf.data).grows_into).toBe('demo:big');
    pick('dripleaf-size', 'big');
    expect(read(leaf.data).grows_into).toBeUndefined();
    commit('dripleaf-tilt-0', '5');
    expect(read(leaf.data).tilt_ticks).toEqual([5, 10, 10]);
  });

  it("lists a pot's plants, counts its blocks and adds one from the picker", () => {
    const { stack, data } = renderOnStack(
      block({ type: 'flower_pot', plants: ['minecraft:poppy'] }, 'demo:pot'),
      schema,
      {
        others: [
          block({ type: 'sapling', tree: 'minecraft:oak', display_name: 'Maple' }, 'demo:maple'),
        ],
      },
    );
    expect(screen.getByTestId('flower-pot-count').textContent).toContain('1 potted plant block');
    fireEvent.click(screen.getByTestId('flower-pot-add'));
    const picker = screen.getByTestId('thing-picker');
    expect(within(picker).getByText('Your plants')).toBeTruthy();
    expect(within(picker).getByText('Plants Minecraft pots')).toBeTruthy();
    expect(within(picker).queryByTestId('thing-minecraft:stone')).toBeNull();
    fireEvent.click(within(picker).getByTestId('thing-demo:maple'));
    expect(read(data).plants).toEqual(['minecraft:poppy', 'demo:maple']);
    expect(screen.getByTestId('flower-pot-count').textContent).toContain('2 potted plant blocks');
    fireEvent.click(screen.getByTestId('flower-pot-plant-0-remove'));
    expect(read(data).plants).toEqual(['demo:maple']);
    stack.undo();
    expect(read(data).plants).toEqual(['minecraft:poppy', 'demo:maple']);
  });

  it('shows names and no ids in Very easy', () => {
    usePreferences.setState({ mode: 'very-easy' as never });
    renderOnStack(
      block({ type: 'flower_pot', plants: ['minecraft:red_tulip'] }, 'demo:pot'),
      schema,
    );
    const row = screen.getByTestId('flower-pot-plant-0');
    expect(row.textContent).toContain('Red tulip');
    expect(row.textContent).not.toContain('minecraft:');
    expect(screen.queryByTestId('flower-pot-add-id')).toBeNull();
    expect(screen.getByTestId('block-companion-row').textContent).not.toContain('demo:');
  });

  it('names a project pot for a potted plant', () => {
    const { data } = renderOnStack(
      block({ type: 'potted_plant', plant: 'minecraft:poppy' }),
      schema,
      { others: [block({ type: 'flower_pot', plants: ['minecraft:dandelion'] }, 'demo:pot')] },
    );
    pick('potted-plant-own-pot', 'demo:pot');
    expect(read(data).pot).toBe('demo:pot');
  });
});

describe('storage', () => {
  it('keeps the chest options apart and drops them with the rows', () => {
    expect(withChestOption({ keep_contents: true }, 'double', true)).toEqual({ double: true });
    expect(withChestOption({ double: true }, 'per_player', true)).toEqual({ per_player: true });
    expect(withChestOption({ double: true }, 'double', false)).toEqual({});
    expect(withRows({ double: true }, 4)).toEqual({ rows: 4 });
    expect(offersDoubleChest({ rows: 6 })).toBe(false);
    expect(withContainerLayout({ per_player: true }, 'hopper')).toEqual({ layout: 'hopper' });
  });

  it('offers Double chest and Different for every player in the Inventory section', async () => {
    const { data } = renderOnStack(
      block({ model: 'minecraft:block/barrel', components: { 'msm:container': {} } }),
      schema,
    );
    fireEvent.click(
      await screen.findByTestId('block-container-double', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS }),
    );
    expect(read(data).components).toEqual({ 'msm:container': { double: true } });
    fireEvent.click(screen.getByTestId('block-container-per-player'));
    expect(read(data).components).toEqual({ 'msm:container': { per_player: true } });
    expect(screen.getByTestId('block-container-per-player-note')).toBeTruthy();
    fireEvent.click(screen.getByTestId('block-waterlogged'));
    expect(read(data).components).toMatchObject({ 'msm:waterloggable': {} });
  });
});

describe('the Sounds section', () => {
  it('edits the model', () => {
    expect(withBlockSound({ block_sounds: { break: 'a:b' } }, 'break', '')).toBeUndefined();
    expect(withBlockSound({}, 'pitch', 2)).toEqual({ pitch: 2 });
    expect(withOwnSetType('iron', true)).toEqual({ base: 'iron' });
    expect(withOwnSetType({ base: 'iron', sounds: {} }, false)).toBe('iron');
    expect(setTypeBase({})).toBe('wood');
    expect(withSetTypeBase({ base: 'iron' }, 'gold')).toEqual({ base: 'gold' });
    expect(withSetTypeSound({ base: 'iron', sounds: { open: 'x' } }, 'open', '')).toEqual({
      base: 'iron',
    });
  });

  it('sets what an axe, a shovel and a hoe turn the block into (ADR 0105 D3)', () => {
    const { stack, data } = renderOnStack(block(), schema);
    commit('block-strip-into', 'minecraft:oak_log');
    commit('block-flatten-into', 'demo:loam_path');
    expect(read(data).components).toEqual({
      'msm:strippable': { into: 'minecraft:oak_log' },
      'msm:flattenable': { into: 'demo:loam_path' },
    });
    expect(screen.queryByTestId('block-till-drops')).toBeNull();
    commit('block-till-into', 'demo:loam_farmland');
    commit('block-till-drops', 'minecraft:stick');
    expect(read(data).components?.['msm:tillable']).toEqual({
      into: 'demo:loam_farmland',
      drops: 'minecraft:stick',
    });
    commit('block-till-into', 'minecraft:farmland');
    expect(read(data).components?.['msm:tillable']).toEqual({
      into: 'minecraft:farmland',
      drops: 'minecraft:stick',
    });
    commit('block-till-drops', '');
    expect(read(data).components?.['msm:tillable']).toEqual({ into: 'minecraft:farmland' });
    commit('block-till-into', '');
    commit('block-flatten-into', '');
    expect(read(data).components).toEqual({ 'msm:strippable': { into: 'minecraft:oak_log' } });
    act(() => {
      stack.undo();
    });
    expect(read(data).components?.['msm:flattenable']).toEqual({ into: 'demo:loam_path' });
  });

  it('offers no axe field on the types axes never strip, unless one is set', () => {
    renderOnStack(block({ type: 'torch' }), schema);
    expect(screen.queryByTestId('block-strip-into')).toBeNull();
    expect(screen.getByTestId('block-flatten-into')).toBeTruthy();
  });

  it("sets a block's own sounds and a door's own set type in undo steps", async () => {
    const { stack, data } = renderOnStack(block({ type: 'door', set_type: 'iron' }), schema);
    await screen.findByTestId('block-sounds', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });
    commit('block-sound-break', 'minecraft:block.wood.step');
    expect(read(data).block_sounds).toEqual({ break: 'minecraft:block.wood.step' });
    fireEvent.click(screen.getByTestId('block-own-set-type-on'));
    expect(read(data).set_type).toEqual({ base: 'iron' });
    commit('block-set-type-sound-open', 'minecraft:block.iron_door.open');
    expect(read(data).set_type).toEqual({
      base: 'iron',
      sounds: { open: 'minecraft:block.iron_door.open' },
    });
    pick('block-set-type-by-hand', 'yes');
    expect((read(data).set_type as Data).can_open_by_hand).toBe(true);
    // The Type section's picker changes the own set type's base.
    pick('block-set-type', 'copper');
    expect((read(data).set_type as Data).base).toBe('copper');
    act(() => {
      stack.undo();
    });
    expect((read(data).set_type as Data).base).toBe('iron');
    fireEvent.click(screen.getByTestId('block-own-set-type-on'));
    expect(read(data).set_type).toBe('iron');
  });

  it('picks sounds by name in Very easy', async () => {
    usePreferences.setState({ mode: 'very-easy' as never });
    const { data } = renderOnStack(block({ model: 'minecraft:block/stone' }), schema);
    const chip = await screen.findByTestId(
      'block-sound-step',
      {},
      { timeout: LAZY_CHUNK_TIMEOUT_MS },
    );
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.textContent).toBe('the stone sound');
    fireEvent.click(chip);
    fireEvent.click(
      within(screen.getByTestId('thing-picker')).getByTestId('thing-minecraft:block.wood.step'),
    );
    expect(read(data).block_sounds).toEqual({ step: 'minecraft:block.wood.step' });
    expect(screen.getByTestId('block-sound-step').textContent).toBe('Wood step');
  });
});

/** Renders the rules Studio over a command stack (its kind is registered by the plugin, B515). */
function renderRules(data: Json) {
  const id = 'demo:rules' as ResourceLocation;
  const subject = element(id, VANILLA_BLOCK_RULES_KIND, data);
  const stack = new CommandStack(projectOf(subject));
  const context = schema.status === 'ready' ? schema.context : undefined;
  if (context === undefined) throw new Error('No schema context.');
  const registries = context.registries(stack.state);
  function Harness() {
    const [, rerender] = useReducer((count: number) => count + 1, 0);
    useEffect(() => stack.subscribe(() => rerender()), []);
    const project: Project = stack.state;
    const current = project.namespaces[0]?.elements.find((entry) => entry.id === id) as Element;
    const props = {
      project,
      element: current,
      context,
      target: bundle.target,
      problems: [],
      sessionProblems: [],
      suggest: (registry: string, prefix: string) =>
        registries
          .ids(registry)
          .filter((entry) => entry.startsWith(prefix) || entry.slice(10).startsWith(prefix)),
      onChange: (pointer: string, value: Json | undefined) =>
        stack.execute(commands.setElementValue(id, pointer, value, {})),
      form: null,
      formRef: { current: null },
      focusPointer: null,
      onFocused: () => undefined,
    } as unknown as StudioProps;
    return <VanillaBlockRulesStudio {...props} />;
  }
  render(<Harness />);
  const read = (): Data =>
    (stack.state.namespaces[0]?.elements.find((entry) => entry.id === id)?.data ?? {}) as Data;
  return { stack, read };
}

describe('the Vanilla block rules Studio', () => {
  it('is registered for its kind, with words for every list', () => {
    expect(DISCOVERED_STUDIOS.find((entry) => entry.kindId === VANILLA_BLOCK_RULES_KIND)?.id).toBe(
      'msm.blocks-items.vanilla-block-rules',
    );
    expect(VANILLA_RULE_LISTS.map((list) => VANILLA_RULE_WORDS[list].title)).toEqual([
      'When you use an axe on it',
      'When you use a shovel on it',
      'When you use a hoe on it',
      'When you use honeycomb on it',
      'Ages like copper',
      'Burns',
    ]);
    expect(newVanillaRule('age')).toEqual({ block: '', next: '' });
    expect(newVanillaRule('burn')).toEqual({ block: '', burn_odds: 5, ignite_odds: 20 });
    const facts = bundle.target.blocks?.vanillaPairs;
    expect(vanillaPairOf(facts, 'strip', 'oak_log')).toBe('minecraft:stripped_oak_log');
    expect(vanillaPairOf(facts, 'burn', 'minecraft:oak_log')).toBeUndefined();
  });

  it('adds rows in undo steps and says which vanilla pair a rule replaces', () => {
    const { stack, read } = renderRules({ format: 1 });
    fireEvent.click(screen.getByTestId('vanilla-rules-strip-add'));
    expect(read().strip).toEqual([{ block: '', into: '' }]);
    commit('vanilla-rules-strip-0-block', 'minecraft:oak_log');
    expect(screen.getByTestId('vanilla-rules-strip-0-replaces').textContent).toContain(
      'Stripped oak log',
    );
    commit('vanilla-rules-strip-0-into', 'minecraft:stone');
    expect(read().strip).toEqual([{ block: 'minecraft:oak_log', into: 'minecraft:stone' }]);
    fireEvent.click(screen.getByTestId('vanilla-rules-burn-add'));
    commit('vanilla-rules-burn-0-burn-odds', '30');
    expect(read().burn).toEqual([{ block: '', burn_odds: 30, ignite_odds: 20 }]);
    fireEvent.click(screen.getByTestId('vanilla-rules-till-add'));
    commit('vanilla-rules-till-0-drops', 'minecraft:stick');
    expect(read().till).toEqual([{ block: '', into: '', drops: 'minecraft:stick' }]);
    act(() => {
      stack.undo();
    });
    expect(read().till).toEqual([{ block: '', into: '' }]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove When you use a hoe on it, rule 1' }),
    );
    expect(read().till).toBeUndefined();
  });

  it('picks blocks by name in Very easy', () => {
    usePreferences.setState({ mode: 'very-easy' as never });
    const { read } = renderRules({ format: 1, flatten: [{ block: 'minecraft:dirt', into: '' }] });
    const chip = screen.getByTestId('vanilla-rules-flatten-0-block');
    expect(chip.textContent).toBe('Dirt');
    fireEvent.click(screen.getByTestId('vanilla-rules-flatten-0-into'));
    fireEvent.click(
      within(screen.getByTestId('thing-picker')).getByTestId('thing-minecraft:stone'),
    );
    expect(read().flatten).toEqual([{ block: 'minecraft:dirt', into: 'minecraft:stone' }]);
  });
});
