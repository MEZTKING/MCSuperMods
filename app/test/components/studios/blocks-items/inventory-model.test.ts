/**
 * The Inventory section's model (B318, ADR 0076 D1): switching what a block holds in one edit,
 * the layouts' own fields, keep contents, default-on booleans, recipe types and the screen
 * default, seconds and ticks, and the recipes table; plus the Textures section's state slots.
 */
import { describe, expect, it } from 'vitest';
import {
  shownModelSlots,
  shownStateModelSlots,
  slotModelRows,
  textureSlotsOf,
} from '../../../../src/renderer/src/studios/blocks-items/block-type-model';
import {
  defaultMachineMenu,
  ingredientFromText,
  ingredientText,
  inventoryKindOf,
  machineRecipeTypes,
  offersKeepContents,
  resultCountOf,
  resultIdOf,
  secondsToTicks,
  takesInventory,
  ticksToSeconds,
  withChoice,
  withContainerLayout,
  withDefaultOn,
  withInventory,
  withRecipeAdded,
  withRecipeRemoved,
  withRecipeType,
  withResult,
  withRows,
} from '../../../../src/renderer/src/studios/blocks-items/inventory-model';

describe('what a block holds', () => {
  it('takes the Inventory section only on the MsmBlock family', () => {
    for (const type of ['block', 'pillar', 'horizontal', 'directional'] as const) {
      expect(takesInventory(type)).toBe(true);
    }
    for (const type of ['slab', 'door', 'crop', 'leaves'] as const) {
      expect(takesInventory(type)).toBe(false);
    }
    expect(takesInventory(undefined)).toBe(false);
  });

  it('reads the kind; a machine wins over a container', () => {
    expect(inventoryKindOf({})).toBe('none');
    expect(inventoryKindOf({ components: { 'msm:container': {} } })).toBe('storage');
    expect(inventoryKindOf({ components: { 'msm:machine': {}, 'msm:container': {} } })).toBe(
      'machine',
    );
  });

  it('adds the chosen component and removes the other with its state look and recipes', () => {
    const storage = {
      type: 'horizontal',
      textures: { front: 'demo:block/f', front_open: 'demo:block/fo' },
      models: { open: 'demo:block/o' },
      components: { 'msm:breakable': { hardness: 2 }, 'msm:container': { rows: 6 } },
    };
    const machine = withInventory(storage, 'machine');
    expect(machine).toEqual({
      type: 'horizontal',
      textures: { front: 'demo:block/f' },
      components: { 'msm:breakable': { hardness: 2 }, 'msm:machine': {} },
    });
    const withRecipes = {
      ...machine,
      textures: { front: 'demo:block/f', front_lit: 'demo:block/fl' },
      recipes: [{ ingredient: 'minecraft:stone', result: 'minecraft:gravel' }],
    };
    expect(withInventory(withRecipes, 'none')).toEqual({
      type: 'horizontal',
      textures: { front: 'demo:block/f' },
      components: { 'msm:breakable': { hardness: 2 } },
    });
    expect(withInventory({ components: { 'msm:container': {} } }, 'none')).toEqual({});
    expect(withInventory({}, 'storage')).toEqual({ components: { 'msm:container': {} } });
  });

  it('changes nothing when the kind stays', () => {
    const data = { components: { 'msm:container': { rows: 2 } } };
    expect(withInventory(data, 'storage')).toEqual(data);
  });
});

describe('storage', () => {
  it('drops the fields of other layouts and writes chest as no layout', () => {
    const chest = { rows: 3, keep_contents: true, hoppers: false };
    expect(withContainerLayout(chest, 'hopper')).toEqual({ layout: 'hopper', hoppers: false });
    expect(withContainerLayout({ layout: 'none', size: 4 }, 'chest')).toEqual({});
    expect(withContainerLayout({ layout: 'none', size: 4 }, 'none')).toEqual({
      layout: 'none',
      size: 4,
    });
  });

  it('offers keep contents only on a 3-row chest and drops it with other rows', () => {
    expect(offersKeepContents({})).toBe(true);
    expect(offersKeepContents({ rows: 3 })).toBe(true);
    expect(offersKeepContents({ rows: 6 })).toBe(false);
    expect(offersKeepContents({ layout: 'hopper' })).toBe(false);
    expect(withRows({ keep_contents: true }, 4)).toEqual({ rows: 4 });
    expect(withRows({ keep_contents: true, rows: 6 }, undefined)).toEqual({ keep_contents: true });
    expect(withRows({ keep_contents: true }, 3)).toEqual({ rows: 3, keep_contents: true });
  });

  it('writes hoppers and comparator only when false', () => {
    expect(withDefaultOn({}, 'hoppers', false)).toEqual({ hoppers: false });
    expect(withDefaultOn({ hoppers: false }, 'hoppers', true)).toEqual({});
    expect(withDefaultOn({ hoppers: true }, 'hoppers', true)).toEqual({});
  });
});

describe('machines', () => {
  const own = 'demo:grinder';

  it('reads the recipe types; absent means the own id', () => {
    expect(machineRecipeTypes({}, own)).toEqual([own]);
    expect(machineRecipeTypes({ recipe_types: ['minecraft:smelting'] }, own)).toEqual([
      'minecraft:smelting',
    ]);
  });

  it('ticks and unticks recipe types, keeping at least one and at most five', () => {
    const both = withRecipeType({}, own, 'minecraft:smelting', true);
    expect(both).toEqual({ recipe_types: [own, 'minecraft:smelting'] });
    expect(withRecipeType(both, own, 'minecraft:smelting', false)).toEqual({});
    expect(withRecipeType(both, own, own, false)).toEqual({
      recipe_types: ['minecraft:smelting'],
    });
    expect(withRecipeType({}, own, own, false)).toEqual({});
    const five = { recipe_types: [own, 'a:b', 'c:d', 'e:f', 'g:h'] };
    expect(withRecipeType(five, own, 'minecraft:smoking', true)).toEqual(five);
  });

  it('picks the default screen from the first vanilla cooking type', () => {
    expect(defaultMachineMenu([own])).toBe('furnace');
    expect(defaultMachineMenu([own, 'minecraft:blasting'])).toBe('blast_furnace');
    expect(defaultMachineMenu(['minecraft:smoking', 'minecraft:blasting'])).toBe('smoker');
    expect(defaultMachineMenu(['minecraft:smelting', 'minecraft:blasting'])).toBe('furnace');
  });

  it('writes a choice only when it differs from its default', () => {
    expect(withChoice({}, 'power', 'redstone', 'fuel')).toEqual({ power: 'redstone' });
    expect(withChoice({ power: 'redstone' }, 'power', 'fuel', 'fuel')).toEqual({});
  });

  it('shows seconds and saves ticks', () => {
    expect(ticksToSeconds(200)).toBe(10);
    expect(secondsToTicks(2.5)).toBe(50);
    expect(secondsToTicks(0.01)).toBe(1);
  });
});

describe('the recipes table', () => {
  it('adds and removes rows; the last removal removes the list', () => {
    const one = withRecipeAdded({});
    expect(one).toEqual([{ ingredient: '', result: '' }]);
    const data = { recipes: [{ ingredient: 'a:b', result: 'c:d' }, ...one] };
    expect(withRecipeRemoved(data, 0)).toEqual(one);
    expect(withRecipeRemoved({ recipes: one }, 0)).toBeUndefined();
  });

  it('reads and writes ingredients as text', () => {
    expect(ingredientText('#minecraft:logs')).toBe('#minecraft:logs');
    expect(ingredientText(['a:b', 'c:d'])).toBe('a:b, c:d');
    expect(ingredientFromText('a:b, c:d')).toEqual(['a:b', 'c:d']);
    expect(ingredientFromText(' a:b ')).toBe('a:b');
  });

  it('keeps a bare result id while the count is 1', () => {
    const entry = { result: 'minecraft:gravel' };
    expect(resultIdOf(entry)).toBe('minecraft:gravel');
    expect(resultCountOf(entry)).toBe(1);
    expect(withResult(entry, { count: 2 })).toEqual({ id: 'minecraft:gravel', count: 2 });
    expect(withResult({ result: { id: 'a:b', count: 2 } }, { count: 1 })).toBe('a:b');
    expect(withResult({ result: { id: 'a:b', components: { x: 1 } } }, { id: 'c:d' })).toEqual({
      id: 'c:d',
      components: { x: 1 },
    });
  });
});

describe('state slots of the Textures section', () => {
  it('shows "Front when open" or "Front when working" on facing types with the component', () => {
    const keys = (data: object) =>
      textureSlotsOf('horizontal', { type: 'horizontal', ...data }).map((slot) => slot.key);
    expect(keys({})).not.toContain('front_open');
    expect(keys({ components: { 'msm:container': {} } })).toContain('front_open');
    expect(keys({ components: { 'msm:machine': {} } })).toEqual(
      expect.arrayContaining(['front_lit']),
    );
    expect(keys({ components: { 'msm:machine': {} } })).not.toContain('front_open');
    expect(keys({ textures: { front_open: 'demo:block/x' } })).toContain('front_open');
    expect(
      textureSlotsOf('pillar', { type: 'pillar', components: { 'msm:machine': {} } }),
    ).not.toContainEqual(expect.objectContaining({ key: 'front_lit' }));
  });

  it('shows the open and lit model slots only where they are used', () => {
    expect(shownModelSlots('block', {})).toEqual(['default', 'item']);
    expect(shownStateModelSlots('block', {})).toEqual([]);
    expect(shownStateModelSlots('block', { components: { 'msm:container': {} } })).toEqual([
      'open',
    ]);
    expect(shownStateModelSlots('block', { models: { lit: 'demo:block/x' } })).toEqual(['lit']);
    expect(shownStateModelSlots('trapdoor', {})).toEqual([]);
    expect(shownModelSlots('horizontal', { components: { 'msm:machine': {} } })).toContain('lit');
    expect(shownModelSlots('trapdoor', {})).toContain('open');
    const rows = slotModelRows({
      id: 'demo:oven',
      data: { type: 'horizontal', textures: { all: 'demo:block/oven' } },
    });
    expect(rows.map((row) => row.slot)).not.toContain('open');
    expect(rows.map((row) => row.slot)).not.toContain('lit');
  });
});
