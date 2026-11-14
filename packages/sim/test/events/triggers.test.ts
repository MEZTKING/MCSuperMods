import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, type LocalWorldSource, type TraceEntry } from '../../src/index.js';
import { EV, evSource, floorAt, UP } from './helpers.js';

const ev = (path: string): string => `${EV}:${path}`;

/** Places a block of the `ev` project on the floor at (x, z) and returns its position. */
function placeAt(source: LocalWorldSource, block: string, x: number, z: number) {
  source.act({ type: 'place', pos: floorAt(x, z), face: 'up', hit: UP, block: ev(block) });
  return { x, y: 0, z };
}

const kinds = (entries: readonly TraceEntry[]) => entries.map((entry) => entry.kind);
const fired = (entries: readonly TraceEntry[], trigger: string) =>
  entries.filter((entry) => entry.kind === 'trigger' && entry.trigger === trigger);

describe('block triggers', () => {
  it('fires on_interact after an empty-hand use, actions in order, with effects and items', () => {
    const { source, effects } = evSource();
    const pos = placeAt(source, 'chime', 10, 10);
    const before = source.trace.length;
    source.act({ type: 'use', pos, face: 'up', hit: UP });
    const entries = source.trace.slice(before);
    expect(entries.map((entry) => entry.text)).toEqual([
      'You used Chime Block, so its event "ring" ran.',
      'Played sound Chime.',
      'Gave you 2 Ruby.',
    ]);
    expect(entries[0]?.origin).toMatchObject({
      elementId: ev('chime'),
      eventId: 'ring',
      pointer: '/components/msm:on_interact/event',
    });
    expect(entries[2]?.origin).toMatchObject({ pointer: '/events/ring/actions/1' });
    expect(effects()).toEqual([
      expect.objectContaining({
        kind: 'sound',
        id: 'minecraft:block.note_block.chime',
        position: { x: 10.5, y: 0.5, z: 10.5 },
        volume: 1,
        pitch: 2,
      }),
    ]);
    expect(source.inventory.count(ev('ruby'))).toBe(2);
  });

  it('takes the click with a block in hand; a sneaking player with an item skips the block', () => {
    const { source } = evSource();
    const pos = placeAt(source, 'chime', 10, 10);
    source.act({ type: 'use', pos, face: 'up', hit: UP, item: 'test:cube' });
    expect(source.world.get({ x: 10, y: 1, z: 10 })).toBeNull();
    expect(source.inventory.count(ev('ruby'))).toBe(2);
    source.act({ type: 'move', ...IDLE_INPUT, sneak: true });
    source.tick();
    source.act({ type: 'use', pos, face: 'up', hit: UP, item: 'test:cube' });
    expect(source.world.get({ x: 10, y: 1, z: 10 })?.name).toBe('test:cube');
    expect(source.inventory.count(ev('ruby'))).toBe(2);
  });

  it('fires on_step for the block under the feet, at most once per cooldown', () => {
    const { source, effects } = evSource();
    placeAt(source, 'pad', 30, 30);
    // Dropped from a little above the slab, the player lands in the third tick.
    source.player.teleport({ x: 30.5, y: 0.6, z: 30.5 });
    for (let i = 0; i < 25; i += 1) source.tick();
    const steps = fired(source.trace, 'block:msm:on_step');
    expect(steps).toHaveLength(3);
    expect(steps.map((entry) => entry.tick)).toEqual([3, 13, 23]);
    expect(steps[0]?.text).toBe('You stepped on Pad, so its event "step" ran.');
    expect(effects().filter((effect) => effect.kind === 'particle')).toHaveLength(9);
  });

  it('fires on_entity_inside for a block the player is in, with its default cooldown of 20', () => {
    const { source, effects } = evSource();
    placeAt(source, 'mist', 20, 20);
    source.player.teleport({ x: 20.5, y: 0, z: 20.5 });
    for (let i = 0; i < 45; i += 1) source.tick();
    expect(fired(source.trace, 'block:msm:on_entity_inside').map((e) => e.tick)).toEqual([
      1, 21, 41,
    ]);
    expect(effects()).toContainEqual(
      expect.objectContaining({ kind: 'chip', id: 'Slowness for 2 seconds', target: 'player' }),
    );
    expect(
      source.lines.some((line) => line.onlyInMinecraft && line.text.includes('Slowness')),
    ).toBe(true);
  });

  it('fires on_place after placing and on_break before breaking, and says unfired triggers', () => {
    const { source, effects } = evSource();
    const pos = placeAt(source, 'trap', 5, 5);
    expect(source.world.get({ x: 5, y: 1, z: 5 })?.name).toBe(ev('chime'));
    expect(effects()).toContainEqual(expect.objectContaining({ kind: 'sound', id: 'ev:tick' }));
    const only = source.trace.filter((entry) => entry.kind === 'onlyInMinecraft');
    expect(only.map((entry) => entry.text)).toContain(
      'Trap\'s event when the machine starts a recipe ("tick")',
    );
    source.act({ type: 'break', pos });
    expect(source.trace.at(-1)).toMatchObject({
      kind: 'onlyInMinecraft',
      text: 'run function ev:boom',
      action: 'run_function',
    });
    expect(source.world.get(pos)).toBeNull();
  });

  it('decides random ticks and their chance by a seeded generator, or always or never', () => {
    const run = (chance: 'random' | 'always' | 'never') => {
      const { source } = evSource({ chance, seed: 11 });
      placeAt(source, 'trap', 5, 5);
      for (let i = 0; i < 8000; i += 1) source.tick();
      const ticks = source.trace.filter((entry) => entry.trigger === 'block:msm:on_random_tick');
      return {
        ran: ticks.filter((e) => e.kind === 'trigger'),
        skipped: ticks.filter((e) => e.kind === 'skipped'),
      };
    };
    const always = run('always');
    expect(always.ran.length).toBeGreaterThan(0);
    expect(always.skipped).toHaveLength(0);
    const never = run('never');
    expect(never.ran).toHaveLength(0);
    expect(never.skipped.length).toBe(always.ran.length);
    expect(never.skipped[0]?.text).toBe(
      'Trap got a random tick, but the 50% chance did not come up.',
    );
    const first = run('random');
    expect(first.ran.length + first.skipped.length).toBe(always.ran.length);
    expect(run('random')).toEqual(first);
  });

  it('fires on_powered and on_unpowered from the Power tool', () => {
    const { source } = evSource();
    const pos = placeAt(source, 'lamp', 7, 7);
    source.act({ type: 'tool', tool: 'power', pos });
    expect(fired(source.trace, 'block:msm:redstone.on_powered')).toHaveLength(1);
    expect(source.trace.at(-1)).toMatchObject({
      kind: 'onlyInMinecraft',
      text: 'light the frame of Gate',
    });
    source.act({ type: 'tool', tool: 'power', pos });
    expect(fired(source.trace, 'block:msm:redstone.on_unpowered')).toHaveLength(1);
    expect(source.trace.at(-1)).toMatchObject({ kind: 'skipped', action: 'damage' });
  });

  it('stops a trigger_event chain at 16 deep', () => {
    const { source } = evSource();
    const pos = placeAt(source, 'loop', 9, 9);
    source.act({ type: 'use', pos, face: 'up', hit: UP });
    const last = source.trace.at(-1);
    expect(last?.kind).toBe('skipped');
    expect(last?.text).toContain('deeper than 16');
    expect(source.trace.filter((entry) => entry.action === 'trigger_event')).toHaveLength(16);
  });

  it("fires a container's on_open on use and says its screen once", () => {
    const { source, effects } = evSource();
    const pos = placeAt(source, 'crate', 4, 4);
    source.act({ type: 'use', pos, face: 'up', hit: UP });
    source.act({ type: 'use', pos, face: 'up', hit: UP });
    expect(fired(source.trace, 'block:msm:container.on_open')).toHaveLength(2);
    expect(effects().filter((effect) => effect.kind === 'sound')).toHaveLength(2);
    expect(
      source.trace.filter((entry) => entry.text.startsWith('the screen of Crate')),
    ).toHaveLength(1);
  });
});

describe('item triggers', () => {
  it('fires on_use when nothing else takes the click, with the item cooldown', () => {
    const { source, effects } = evSource();
    source.act({ type: 'use', pos: floorAt(2, 2), face: 'up', hit: UP, item: ev('wand') });
    expect(fired(source.trace, 'item:msm:on_use')).toHaveLength(1);
    expect(source.player.velocity.y).toBe(1);
    expect(effects()).toContainEqual(
      expect.objectContaining({ kind: 'chip', id: 'Healed by 1.5 hearts', target: 'player' }),
    );
    expect(source.trace.map((entry) => entry.text)).toContain(
      'Wand\'s event when the item hits a mob ("zap")',
    );
    source.act({ type: 'use', pos: floorAt(2, 2), face: 'up', hit: UP, item: ev('wand') });
    expect(source.trace.at(-1)?.text).toBe('Wand is cooling down; using it did nothing.');
    for (let i = 0; i < 20; i += 1) source.tick();
    source.act({ type: 'use', pos: floorAt(2, 2), face: 'up', hit: UP, item: ev('wand') });
    expect(fired(source.trace, 'item:msm:on_use')).toHaveLength(2);
  });

  it('fires on_use_on_block with the clicked block as base when the block does not take it', () => {
    const { source } = evSource();
    const pos = placeAt(source, 'chime', 12, 12);
    source.act({ type: 'move', ...IDLE_INPUT, sneak: true });
    source.tick();
    source.act({ type: 'use', pos, face: 'up', hit: UP, item: ev('trowel') });
    expect(fired(source.trace, 'item:msm:on_use_on_block')[0]?.text).toBe(
      'You used Trowel on Chime Block, so its event "dig" ran.',
    );
    expect(source.world.get(pos)).toBeNull();
  });
});

describe('mob triggers', () => {
  it('fires on_spawn, on_interact, on_tick by its interval and on_death on a hit', () => {
    const { source, effects } = evSource();
    source.act({
      type: 'use',
      pos: floorAt(30, 30),
      face: 'up',
      hit: UP,
      item: ev('golem_spawn_egg'),
    });
    const id = source.entities.entities()[0]?.id as number;
    expect(fired(source.trace, 'entity:msm:on_spawn')).toHaveLength(1);
    expect(effects()).toContainEqual(
      expect.objectContaining({
        kind: 'animation',
        id: 'wave',
        target: id,
        controller: 'msm_triggered',
      }),
    );
    expect(source.trace.map((entry) => entry.text)).toContain(
      'Golem\'s event when the mob is hurt ("ouch")',
    );

    source.act({ type: 'interact', entity: id });
    expect(source.inventory.count(ev('ruby'))).toBe(1);
    expect(effects()).toContainEqual(
      expect.objectContaining({ kind: 'chip', id: 'Glowing for 3 seconds', target: 'player' }),
    );

    for (let i = 0; i < 80; i += 1) source.tick();
    const beats = fired(source.trace, 'entity:msm:on_tick');
    expect(beats.map((entry) => (entry.tick + id) % 40)).toEqual([0, 0]);
    expect(
      source.trace.filter((e) => e.kind === 'skipped' && e.action === 'give_item'),
    ).toHaveLength(2);

    source.act({ type: 'hit', entity: id });
    expect(source.entities.count).toBe(0);
    expect(fired(source.trace, 'entity:msm:on_death')).toHaveLength(1);
    expect(source.inventory.count(ev('ruby'))).toBe(6);
  });

  it('says a mob without on_interact does nothing when used', () => {
    const { source } = evSource();
    source.act({
      type: 'use',
      pos: floorAt(30, 30),
      face: 'up',
      hit: UP,
      item: 'zoo:cow_spawn_egg',
    });
    const id = source.entities.entities()[0]?.id as number;
    source.act({ type: 'interact', entity: id });
    expect(source.lines.at(-1)?.text).toBe('You used Moo Cow; nothing happens in the preview.');
  });
});

describe('actions', () => {
  it('says an action type it does not know', () => {
    const { source } = evSource({
      files: new Map([
        [
          'msm/ev/block/odd.json',
          JSON.stringify({
            format: 1,
            components: { 'msm:on_interact': { event: 'x' } },
            events: { x: { actions: [{ type: 'teleport_home' }] } },
          }),
        ],
      ]),
    });
    const pos = placeAt(source, 'odd', 3, 3);
    source.act({ type: 'use', pos, face: 'up', hit: UP });
    expect(source.trace.at(-1)).toMatchObject({
      kind: 'onlyInMinecraft',
      text: 'an action the preview does not know ("teleport_home")',
    });
  });

  it('fills the inventory up to stack sizes and says what does not fit', () => {
    const { source } = evSource();
    for (let i = 0; i < 9 * 16; i += 1) source.inventory.give(ev('ruby'), 1);
    expect(source.inventory.slots.every((slot) => slot?.count === 16)).toBe(true);
    const pos = placeAt(source, 'chime', 10, 10);
    source.act({ type: 'use', pos, face: 'up', hit: UP });
    expect(kinds(source.trace.slice(-2))).toEqual(['action', 'onlyInMinecraft']);
    expect(source.trace.at(-1)?.text).toBe('2 Ruby that did not fit dropping at your feet');
  });

  it('clears the trace, inventory and cooldowns with the area', () => {
    const { source } = evSource();
    const pos = placeAt(source, 'chime', 10, 10);
    source.act({ type: 'use', pos, face: 'up', hit: UP });
    source.act({ type: 'clear' });
    expect(source.trace).toHaveLength(0);
    expect(source.inventory.count(ev('ruby'))).toBe(0);
  });
});
