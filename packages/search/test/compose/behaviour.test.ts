import { describe, expect, it } from 'vitest';
import {
  behaviourFit,
  createAnswerReader,
  makeBehaviour,
  replaceThing,
  uniqueRuleKey,
} from '../../src';
import { createBehaviourIndex } from '../../src/compose/behaviour';
import { fold } from '../../src/text';
import { BEHAVIOURS, flowFacts, pluginData } from '../slots/flows';

const items = BEHAVIOURS.map((behaviour) => ({ plugin: 'fixture', behaviour }));
const byId = (id: string) => items.find((i) => i.behaviour.id === id) as (typeof items)[number];

describe('behaviours', () => {
  it('matches phrases by their stems, leftmost and longest', () => {
    const index = createBehaviourIndex(items);
    const found = index.match(['it', 'drop', 'xp', 'and', 'blows', 'up'].map(fold));
    expect(found.map((m) => [m.start, m.end, m.phrase])).toEqual([
      [1, 3, 'drop xp'],
      [4, 6, 'blow up'],
    ]);
    expect(found[0]?.values.map((v) => v.behaviour.id)).toEqual(['block-drops-xp', 'mob-drops-xp']);
  });

  it('fits by flow, answers and then sort', () => {
    expect(behaviourFit(byId('flies').behaviour, 'flying-mob', 'mob')).toBe('flow');
    expect(behaviourFit(byId('flies').behaviour, 'mount', 'mob')).toBe('answers');
    expect(behaviourFit(byId('flies').behaviour, 'pet', 'mob')).toBeUndefined();
    expect(behaviourFit(byId('block-drops-xp').behaviour, 'custom_ore', 'block')).toBe('rule');
    expect(behaviourFit(byId('block-drops-xp').behaviour, 'mount', 'mob')).toBeUndefined();
    expect(behaviourFit(byId('sets-on-fire').behaviour, 'weapon', 'item')).toBe('beside');
    expect(behaviourFit(byId('sets-on-fire').behaviour, 'weapon', undefined)).toBeUndefined();
  });

  it('replaces $thing everywhere in a rule, not only in its subject', () => {
    const made = makeBehaviour(byId('item-single-use'), 'weapon', 'item', 'mod:ruby_sword');
    expect(made?.rule).toEqual({
      do: [{ item: 'mod:ruby_sword', step: 'take_item' }],
      key: 'item_single_use',
      name: 'item single use',
      when: { subject: 'mod:ruby_sword', trigger: 'item_used' },
    });
    expect(JSON.stringify(made)).not.toContain('$thing');
    expect(replaceThing({ a: ['x $thing y', 3, true, null] }, 'mod:t')).toEqual({
      a: ['x mod:t y', 3, true, null],
    });
  });

  it('makes a companion flow with $thing replaced in its answers', () => {
    const made = makeBehaviour(byId('sets-on-fire'), 'weapon', 'item', 'mod:blue_sword');
    expect(made?.beside).toEqual({
      starter: 'enchantment',
      values: { effect: 'fire', for: 'mod:blue_sword' },
    });
    expect(made?.rule).toBeUndefined();
  });

  it('gives answers for a flow the behaviour answers', () => {
    expect(makeBehaviour(byId('glows'), 'simple-block', 'block', 'mod:lamp')?.answers).toEqual({
      light_level: 15,
    });
    expect(makeBehaviour(byId('glows'), 'weapon', 'item', 'mod:x')).toBeUndefined();
  });

  it('numbers a rule key a book already has', () => {
    expect(uniqueRuleKey('item_explodes', [])).toBe('item_explodes');
    expect(uniqueRuleKey('item_explodes', ['item_explodes'])).toBe('item_explodes_2');
    expect(uniqueRuleKey('item_explodes', ['item_explodes', 'item_explodes_2'])).toBe(
      'item_explodes_3',
    );
  });

  it('is reached through the reader by id', () => {
    const reader = createAnswerReader({ plugins: [{ data: pluginData() }], flows: flowFacts() });
    expect(reader.behaviour('ride')?.behaviour.flows).toEqual(['mount']);
    expect(reader.make('block-explodes', 'simple-block', 'mod:tnt_block')?.rule).toMatchObject({
      when: { subject: 'mod:tnt_block', trigger: 'block_broken' },
    });
    expect(reader.make('block-explodes', 'weapon', 'mod:x')).toBeUndefined();
    expect(reader.make('nothing', 'weapon', 'mod:x')).toBeUndefined();
  });
});
