import { describe, expect, it } from 'vitest';
import {
  parseBlockState,
  readEventDefinitions,
  readScripts,
  ruleBooksFrom,
  ruleEventOf,
  rulesForActions,
  SimInventory,
  soundName,
} from '../../src/index.js';
import { FAKE_TARGET } from '../blocks/helpers.js';

describe('readEventDefinitions', () => {
  it('reads events, triggers with their options, names and stack sizes', () => {
    const files = new Map([
      [
        'msm/a/block/b.json',
        JSON.stringify({
          format: 1,
          components: {
            'msm:on_step': { event: 's' },
            'msm:on_entity_inside': { event: 'i', cooldown_ticks: 7 },
            'msm:on_random_tick': { event: 'r', chance: 0.25 },
          },
          events: { s: { actions: [{ type: 'play_sound', sound: 'x' }] } },
        }),
      ],
      [
        'msm/a/item/w.json',
        JSON.stringify({
          format: 1,
          max_stack_size: 1,
          components: { 'msm:while_held': { event: 'h', hand: 'off' } },
        }),
      ],
      ['assets/a/lang/en_us.json', JSON.stringify({ 'block.a.b': 'Bee Block' })],
    ]);
    const definitions = readEventDefinitions(files, FAKE_TARGET);
    const block = definitions.get('block', 'a:b');
    expect(block?.displayName).toBe('Bee Block');
    expect(block?.events.get('s')).toEqual([{ type: 'play_sound', sound: 'x' }]);
    expect(block?.triggers.get('block:msm:on_step')).toMatchObject({
      event: 's',
      cooldownTicks: 0,
      pointer: '/components/msm:on_step/event',
    });
    expect(block?.triggers.get('block:msm:on_entity_inside')?.cooldownTicks).toBe(7);
    expect(block?.triggers.get('block:msm:on_random_tick')?.chance).toBe(0.25);
    const item = definitions.get('item', 'a:w');
    expect(item?.maxStackSize).toBe(1);
    expect(item?.triggers.get('item:msm:while_held')).toMatchObject({
      hand: 'off',
      intervalTicks: 20,
    });
  });
});

describe('rules behind generated events', () => {
  const script = [
    '// Made by Rules from a:book_b; edit the rules, not this file.',
    'msm.actions.define("a:rules/book_b/thing/block_used", (e) => {',
    '  // When a player uses Thing, if ... then ...',
    '  rule("k2", () => { // rule:k2',
    '  }); // rule:k2',
    '  rule("k3", () => { // rule:k3',
    '  }); // rule:k3',
    '});',
    'msm.events.on("player.join", (e) => {',
    '  rule("k4", () => {}); // rule:k4',
    '});',
  ].join('\n');

  it('reads handlers and listeners from a generated script', () => {
    const { handlers, listeners } = readScripts(
      new Map([['msm/a/script/rules/book_b.ts', new TextEncoder().encode(script)]]),
    );
    expect(handlers.get('a:rules/book_b/thing/block_used')).toMatchObject({
      book: 'a:book_b',
      keys: ['k2', 'k3'],
      sentences: ['When a player uses Thing, if ... then ...'],
    });
    expect(listeners).toEqual([
      {
        path: 'msm/a/script/rules/book_b.ts',
        book: 'a:book_b',
        events: ['player.join'],
        ruleKeys: ['k4'],
      },
    ]);
  });

  it('maps each action to its rule: hand-made first, plain steps, then a script part', () => {
    const { handlers } = readScripts(new Map([['msm/a/script/rules/book_b.ts', script]]));
    const books = ruleBooksFrom([
      {
        id: 'a:book_b',
        data: {
          rules: [
            { key: 'k2', when: { subject: 'a:thing', trigger: 'block_used' }, do: [{}] },
            { key: 'k3', when: { subject: 'a:thing', trigger: 'block_used' }, do: [{}] },
          ],
        },
      },
      {
        id: 'a:book_a',
        data: {
          rules: [
            {
              key: 'k1',
              name: 'One',
              when: { subject: 'a:thing', trigger: 'block_used' },
              do: [{}, {}],
            },
            {
              key: 'off',
              enabled: false,
              when: { subject: 'a:thing', trigger: 'block_used' },
              do: [{}],
            },
          ],
        },
      },
    ]);
    const actions = [
      { type: 'trigger_event', event: 'mine' },
      { type: 'play_sound' },
      { type: 'give_item' },
      { type: 'run_script', handler: 'a:rules/book_b/thing/block_used' },
    ];
    const refs = rulesForActions('a:thing', 'a:thing_rules_block_used', actions, books, handlers);
    expect(refs.get(0)).toBeUndefined();
    expect(refs.get(1)).toEqual([{ book: 'a:book_a', key: 'k1', name: 'One' }]);
    expect(refs.get(2)).toEqual([{ book: 'a:book_a', key: 'k1', name: 'One' }]);
    expect(refs.get(3)?.map((ref) => ref.key)).toEqual(['k2', 'k3']);
    expect(rulesForActions('a:thing', 'mine', actions, books, handlers).size).toBe(0);
    expect(ruleEventOf('a:thing', 'a:thing_rules_block_used')).toEqual({
      subject: 'a:thing',
      trigger: 'block_used',
    });
  });
});

describe('helpers', () => {
  it('parses block states and names sounds', () => {
    expect(parseBlockState('mymod:stairs[facing=north,half=top]')).toEqual({
      name: 'mymod:stairs',
      properties: { facing: 'north', half: 'top' },
    });
    expect(parseBlockState('stone')?.name).toBe('minecraft:stone');
    expect(parseBlockState('bad[facing]')).toBeNull();
    expect(soundName('minecraft:block.note_block.chime')).toBe('Chime');
    expect(soundName('mymod:ruby_chime')).toBe('Ruby Chime');
  });

  it('stacks the inventory by stack size and returns what does not fit', () => {
    const inventory = new SimInventory((id) => (id === 'a:one' ? 1 : 64));
    expect(inventory.give('a:gem', 100)).toBe(0);
    expect(inventory.slots.slice(0, 2)).toEqual([
      { id: 'a:gem', count: 64 },
      { id: 'a:gem', count: 36 },
    ]);
    expect(inventory.give('a:one', 10)).toBe(3);
    expect(inventory.count('a:one')).toBe(7);
  });
});
