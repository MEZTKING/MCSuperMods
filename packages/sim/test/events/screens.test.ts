import { describe, expect, it } from 'vitest';
import { screenOf, screensFromFiles } from '../../src/index.js';
import { EV, evFiles, evSource, floorAt, UP } from './helpers.js';

const crate = { x: 4, y: 0, z: 4 };

describe('screens (B398)', () => {
  it('reads containers by layout and rows, machines by menu, and no screen for a holder', () => {
    expect(screenOf({ components: { 'msm:container': {} } })).toEqual({
      kind: 'container',
      layout: 'chest',
      rows: 3,
      columns: 9,
      keepContents: false,
    });
    expect(screenOf({ components: { 'msm:container': { rows: 6 } } })).toMatchObject({ rows: 6 });
    expect(screenOf({ components: { 'msm:container': { layout: 'hopper' } } })).toMatchObject({
      rows: 1,
      columns: 5,
    });
    expect(screenOf({ components: { 'msm:container': { layout: 'dispenser' } } })).toMatchObject({
      rows: 3,
      columns: 3,
    });
    expect(screenOf({ components: { 'msm:container': { layout: 'none' } } })).toBeUndefined();
    expect(screenOf({ components: { 'msm:machine': { power: 'always' } } })).toEqual({
      kind: 'machine',
      menu: 'furnace',
      power: 'always',
    });
    expect(screenOf({ format: 1 })).toBeUndefined();
    expect(screensFromFiles(evFiles()).get(`${EV}:crate`)?.kind).toBe('container');
  });

  it('opens the screen on use, sets open, and fires on_close when it closes', () => {
    const { source } = evSource();
    source.act({ type: 'place', pos: floorAt(4, 4), face: 'up', hit: UP, block: `${EV}:crate` });
    source.act({ type: 'use', pos: crate, face: 'up', hit: UP, item: `${EV}:crate` });
    // The screen took the click: nothing was placed on the crate.
    expect(source.world.count).toBe(1);
    expect(source.screen).toMatchObject({ block: `${EV}:crate`, displayName: 'Crate' });
    expect(source.world.get(crate)?.properties.open).toBe('true');
    const before = source.trace.length;
    source.closeScreen();
    expect(source.screen).toBeNull();
    expect(source.world.get(crate)?.properties.open).toBe('false');
    const closed = source.trace.slice(before);
    expect(closed[0]).toMatchObject({
      kind: 'trigger',
      trigger: 'block:msm:container.on_close',
      text: 'You closed Crate, so its event "closed" ran.',
    });
    // "closed" is not declared in the crate's events, so the event says so.
    expect(closed[1]?.kind).toBe('skipped');
  });

  it('closes the screen when the block is broken or the area cleared', () => {
    const { source } = evSource();
    source.act({ type: 'place', pos: floorAt(4, 4), face: 'up', hit: UP, block: `${EV}:crate` });
    source.act({ type: 'use', pos: crate, face: 'up', hit: UP });
    source.act({ type: 'break', pos: crate });
    expect(source.screen).toBeNull();
    source.act({ type: 'place', pos: floorAt(4, 4), face: 'up', hit: UP, block: `${EV}:crate` });
    source.act({ type: 'use', pos: crate, face: 'up', hit: UP });
    source.act({ type: 'clear' });
    expect(source.screen).toBeNull();
  });

  it('names items for the inventory row', () => {
    const { source } = evSource();
    expect(source.itemName(`${EV}:ruby`)).toBe('Ruby');
  });
});
