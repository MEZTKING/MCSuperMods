import { describe, expect, it } from 'vitest';
import { buildCatalogue, SIM_BLOCK_TYPES } from '../../src/index.js';
import { FAKE_TARGET, id, setUp, testFiles, testLog } from './helpers.js';

describe('buildCatalogue', () => {
  it('reads every type of the format from the lowered definitions', () => {
    const { catalogue } = setUp();
    const types = new Set(catalogue.ids().map((block) => catalogue.get(block)?.type));
    for (const type of SIM_BLOCK_TYPES) expect(types.has(type)).toBe(true);
  });

  it('gives each type its properties and default state', () => {
    const { catalogue } = setUp();
    const defaults = (path: string) => catalogue.get(id(path))?.defaultState.properties;
    expect(defaults('cube')).toEqual({});
    expect(defaults('log')).toEqual({ axis: 'y' });
    expect(defaults('furnace')).toEqual({ facing: 'north', lit: 'false' });
    expect(defaults('observer')).toEqual({ facing: 'north' });
    expect(defaults('slab')).toEqual({ type: 'bottom' });
    expect(defaults('stairs')).toEqual({ facing: 'north', half: 'bottom', shape: 'straight' });
    expect(defaults('wall')).toEqual({
      east: 'none',
      north: 'none',
      south: 'none',
      up: 'true',
      west: 'none',
    });
    expect(defaults('fence')).toEqual({
      east: 'false',
      north: 'false',
      south: 'false',
      west: 'false',
    });
    expect(defaults('gate')).toEqual({ facing: 'north', in_wall: 'false', open: 'false' });
    expect(defaults('door')).toEqual({
      facing: 'north',
      half: 'lower',
      hinge: 'left',
      open: 'false',
    });
    expect(defaults('trapdoor')).toEqual({ facing: 'north', half: 'bottom', open: 'false' });
    expect(defaults('button')).toEqual({ face: 'wall', facing: 'north', powered: 'false' });
    expect(defaults('plate')).toEqual({ powered: 'false' });
    expect(defaults('weighted_plate')).toEqual({ power: '0' });
    expect(defaults('pane')).toEqual({
      east: 'false',
      north: 'false',
      south: 'false',
      west: 'false',
    });
    expect(defaults('crop')).toEqual({ age: '0' });
    expect(defaults('sapling')).toEqual({ stage: '0' });
    expect(defaults('leaves')).toEqual({});
    expect(defaults('portal')).toEqual({ axis: 'x' });
    expect(defaults('powered')).toEqual({ powered: 'false' });
    expect(catalogue.get(id('crop'))?.properties.age).toEqual(['0', '1', '2', '3']);
    expect(catalogue.get(id('weighted_plate'))?.properties.power).toHaveLength(16);
  });

  it('reads set types, press times, weights, wooden fences and soil', () => {
    const { catalogue } = setUp();
    expect(catalogue.get(id('door'))?.opensByHand).toBe(true);
    expect(catalogue.get(id('iron_door'))?.opensByHand).toBe(false);
    expect(catalogue.get(id('gold_trapdoor'))?.opensByHand).toBe(false);
    expect(catalogue.get(id('gate'))?.opensByHand).toBe(true);
    expect(catalogue.get(id('button'))?.pressTicks).toBe(30);
    expect(catalogue.get(id('stone_button'))?.pressTicks).toBe(20);
    expect(catalogue.get(id('quick_button'))?.pressTicks).toBe(5);
    expect(catalogue.get(id('weighted_plate'))?.weightedMax).toBe(10);
    expect(catalogue.get(id('fence'))?.woodenFence).toBe(true);
    expect(catalogue.get(id('stone_fence'))?.woodenFence).toBe(false);
    expect(catalogue.get(id('crop'))?.soil).toBe('#minecraft:supports_crops');
    expect(catalogue.get(id('sapling'))?.soil).toBe('#minecraft:supports_vegetation');
    expect(catalogue.get(id('crop'))?.stageHeights).toEqual([2, 7, 11, 16]);
  });

  it('names blocks from the lang file, else from their id', () => {
    const { catalogue } = setUp();
    expect(catalogue.get(id('door'))?.displayName).toBe('Oak-ish Door');
    expect(catalogue.get(id('iron_door'))?.displayName).toBe('Iron Door');
  });

  it('turns blocks it cannot read into props, each with one line', () => {
    const { catalogue, log } = setUp();
    for (const path of ['broken', 'odd', 'bad_door']) {
      const block = catalogue.get(id(path));
      expect(block?.prop).toBe(true);
      expect(block?.type).toBe('prop');
      expect(catalogue.collision(block?.defaultState ?? { name: '', properties: {} })).toEqual([
        [0, 0, 0, 1, 1, 1],
      ]);
    }
    expect(log.only).toHaveLength(3);
    expect(log.only.join('\n')).toContain('Broken has a definition the preview cannot read');
    expect(log.only.join('\n')).toContain('"spinner"');
    expect(log.only.join('\n')).toContain('(diamond)');
  });

  it('makes vanilla blocks props on first use, saying so once', () => {
    const log = testLog();
    const catalogue = buildCatalogue(testFiles(), FAKE_TARGET, log, {
      vanillaBlockstates: new Map([
        [
          'minecraft:oak_log',
          JSON.stringify({ variants: { 'axis=x': {}, 'axis=y': {}, 'axis=z': {} } }),
        ],
      ]),
    });
    const log1 = catalogue.blockFor('minecraft:oak_log');
    catalogue.blockFor('minecraft:oak_log');
    expect(log1?.prop).toBe(true);
    expect(log1?.defaultState).toEqual({ name: 'minecraft:oak_log', properties: { axis: 'x' } });
    expect(catalogue.blockFor('minecraft:stone')?.defaultState.properties).toEqual({});
    expect(catalogue.blockFor('othermod:thing')).toBeUndefined();
    expect(log.only.filter((line) => line.includes('Oak Log'))).toHaveLength(1);
  });

  it('falls back to the default for unknown properties and values (ADR 0085 D4)', () => {
    const { catalogue } = setUp();
    expect(
      catalogue.normalise({
        name: id('stairs'),
        properties: { facing: 'up', half: 'top', colour: 'red' },
      }),
    ).toEqual({
      name: id('stairs'),
      properties: { facing: 'north', half: 'top', shape: 'straight' },
    });
    expect(catalogue.normalise({ name: id('slab'), properties: {} })).toEqual({
      name: id('slab'),
      properties: { type: 'bottom' },
    });
    expect(catalogue.normalise({ name: id('gone'), properties: {} })).toBeNull();
    expect(
      catalogue.withProperties(
        catalogue.get(id('slab'))?.defaultState ?? { name: '', properties: {} },
        {
          type: 'sideways',
        },
      ).properties,
    ).toEqual({ type: 'bottom' });
  });

  it('turns msm:shape boxes with the facing and keeps walk-through shapes', () => {
    const { catalogue } = setUp();
    const shaped = (facing: string) =>
      catalogue.outline({ name: id('shaped'), properties: { facing } });
    expect(shaped('north')).toEqual([[0, 0, 0, 1, 1, 0.5]]);
    expect(shaped('east')).toEqual([[0.5, 0, 0, 1, 1, 1]]);
    expect(shaped('south')).toEqual([[0, 0, 0.5, 1, 1, 1]]);
    expect(shaped('west')).toEqual([[0, 0, 0, 0.5, 1, 1]]);
    const ghost = { name: id('ghost'), properties: {} };
    expect(catalogue.collision(ghost)).toEqual([]);
    expect(catalogue.outline(ghost)).toEqual([[0.125, 0, 0.125, 0.875, 1, 0.875]]);
  });

  it('returns the same box arrays for the same state on every call', () => {
    const { catalogue } = setUp();
    const state = {
      name: id('stairs'),
      properties: { facing: 'east', half: 'top', shape: 'inner_left' },
    };
    const again = {
      name: id('stairs'),
      properties: { half: 'top', shape: 'inner_left', facing: 'east' },
    };
    expect(catalogue.collision(state)).toBe(catalogue.collision(state));
    expect(catalogue.collision(again)).toBe(catalogue.collision(state));
    expect(catalogue.outline(state)).toBe(catalogue.outline(again));
  });

  it('gives the type shapes', () => {
    const { catalogue } = setUp();
    const at = (path: string, properties: Record<string, string>) => ({
      collision: catalogue.collision({ name: id(path), properties }),
      outline: catalogue.outline({ name: id(path), properties }),
    });
    expect(at('slab', { type: 'top' }).collision).toEqual([[0, 0.5, 0, 1, 1, 1]]);
    expect(at('slab', { type: 'double' }).collision).toEqual([[0, 0, 0, 1, 1, 1]]);
    expect(at('stairs', { facing: 'north', half: 'bottom', shape: 'straight' }).collision).toEqual([
      [0, 0, 0, 1, 0.5, 1],
      [0, 0.5, 0, 1, 1, 0.5],
    ]);
    expect(
      at('stairs', { facing: 'north', half: 'bottom', shape: 'outer_left' }).collision[1],
    ).toEqual([0, 0.5, 0, 0.5, 1, 0.5]);
    expect(at('door', { facing: 'north', open: 'false', hinge: 'left' }).collision).toEqual([
      [0, 0, 0.8125, 1, 1, 1],
    ]);
    expect(at('door', { facing: 'north', open: 'true', hinge: 'left' }).collision).toEqual([
      [0, 0, 0, 0.1875, 1, 1],
    ]);
    expect(at('door', { facing: 'north', open: 'true', hinge: 'right' }).collision).toEqual([
      [0.8125, 0, 0, 1, 1, 1],
    ]);
    expect(at('trapdoor', { facing: 'south', half: 'bottom', open: 'true' }).collision).toEqual([
      [0, 0, 0, 1, 1, 0.1875],
    ]);
    expect(at('gate', { facing: 'north', open: 'false', in_wall: 'false' }).collision).toEqual([
      [0, 0, 0.375, 1, 1.5, 0.625],
    ]);
    expect(at('gate', { facing: 'east', open: 'true', in_wall: 'false' })).toEqual({
      collision: [],
      outline: [[0.375, 0, 0, 0.625, 1, 1]],
    });
    expect(
      at('fence', { north: 'true', east: 'false', south: 'false', west: 'false' }).collision,
    ).toHaveLength(2);
    expect(
      at('wall', { up: 'false', north: 'low', south: 'low', east: 'none', west: 'none' }).outline,
    ).toEqual([
      [0.3125, 0, 0, 0.6875, 0.875, 0.5],
      [0.3125, 0, 0.5, 0.6875, 0.875, 1],
    ]);
    expect(at('button', { face: 'floor', facing: 'north', powered: 'false' })).toEqual({
      collision: [],
      outline: [[0.3125, 0, 0.375, 0.6875, 0.125, 0.625]],
    });
    expect(at('plate', { powered: 'true' }).outline).toEqual([
      [0.0625, 0, 0.0625, 0.9375, 0.03125, 0.9375],
    ]);
    expect(at('crop', { age: '1' })).toEqual({ collision: [], outline: [[0, 0, 0, 1, 7 / 16, 1]] });
    expect(at('portal', { axis: 'z' })).toEqual({
      collision: [],
      outline: [[0.375, 0, 0, 0.625, 1, 1]],
    });
    expect(at('leaves', {}).collision).toEqual([[0, 0, 0, 1, 1, 1]]);
    expect(catalogue.isSolidCube({ name: id('leaves'), properties: {} })).toBe(false);
  });
});
