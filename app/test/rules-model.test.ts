/**
 * The Rule book Studio's pure edits (B372, ADR 0082 D1, D2, D6): new rules and steps, moves,
 * duplicates, counters declared on first use, the caps, what the pickers offer for a trigger's
 * actors and Very easy, and where a problem's pointer shows on a card.
 */
import type { Json } from '@msm/core';
import { MAX_STEPS, triggerById } from '@msm/plugin-rules';
import { describe, expect, it } from 'vitest';
import {
  addRule,
  canAddStep,
  canNestHere,
  countSteps,
  declareCounter,
  duplicateItem,
  duplicateRule,
  getAt,
  innerScope,
  isRuleBookData,
  listLevel,
  moveItem,
  moveRule,
  newCondition,
  newRule,
  newStep,
  offeredConditions,
  offeredCounterScopes,
  offeredPlaces,
  offeredSteps,
  offeredValues,
  offeredWho,
  problemAnchor,
  problemsByAnchor,
  type RuleBookData,
  removeRule,
  ruleScope,
  setAt,
  setCounter,
  setRuleEnabled,
  setTrigger,
  uniqueKey,
} from '../src/renderer/src/studios/rules/rules-model';

const BOOK: RuleBookData = {
  counters: [],
  format: 1,
  rules: [
    {
      do: [
        { count: 2, item: 'demo:ruby', step: 'give_item' },
        {
          conditions: [{ condition: 'chance', percent: 50 }],
          do: [{ sound: 'minecraft:block.note_block.chime', step: 'play_sound' }],
          match: 'all',
          step: 'if',
        },
      ],
      key: 'ruby_gift',
      name: 'Ruby gift',
      only_if: { conditions: [{ condition: 'player_sneaking' }], match: 'all' },
      when: { subject: 'demo:ruby_block', trigger: 'block_used' },
    },
    { do: [], key: 'welcome', when: { trigger: 'player_joined' } },
  ],
};

const ids = (entries: readonly { id: string }[]): string[] => entries.map((entry) => entry.id);

describe('rule book edits', () => {
  it('recognises rule book data', () => {
    expect(isRuleBookData(BOOK)).toBe(true);
    expect(isRuleBookData({ format: 1 })).toBe(true);
    expect(isRuleBookData({ rules: 'nope' })).toBe(false);
    expect(isRuleBookData([])).toBe(false);
  });

  it('adds a rule with a fresh key and never changes its input', () => {
    const before = structuredClone(BOOK);
    const next = addRule(BOOK, newRule(BOOK));
    expect(BOOK).toEqual(before);
    expect(getAt(next, '/rules/2')).toEqual({
      do: [],
      key: 'rule',
      when: { trigger: 'player_joined' },
    });
    const again = addRule(next, newRule(next, { subject: 'demo:ruby', trigger: 'item_used' }));
    expect(getAt(again, '/rules/3/key')).toBe('rule_2');
    expect(getAt(again, '/rules/3/when')).toEqual({ subject: 'demo:ruby', trigger: 'item_used' });
  });

  it('makes keys safe and unique', () => {
    expect(uniqueKey(BOOK, 'Ruby Gift!')).toBe('ruby_gift_2');
    expect(uniqueKey(BOOK, '---')).toBe('rule');
    expect(uniqueKey(BOOK, 'welcome')).toBe('welcome_2');
  });

  it('removes, moves, duplicates and turns rules off', () => {
    expect(getAt(removeRule(BOOK, 0), '/rules/0/key')).toBe('welcome');
    const moved = moveRule(BOOK, 1, -1);
    expect(getAt(moved, '/rules/0/key')).toBe('welcome');
    expect(moveRule(BOOK, 0, -1)).toBe(BOOK);
    const copy = duplicateRule(BOOK, 0);
    expect(getAt(copy, '/rules/1/key')).toBe('ruby_gift_2');
    expect(getAt(copy, '/rules/1/name')).toBe('Ruby gift (copy)');
    expect(getAt(copy, '/rules/1/do')).toEqual(getAt(BOOK, '/rules/0/do'));
    const off = setRuleEnabled(BOOK, 0, false);
    expect(getAt(off, '/rules/0/enabled')).toBe(false);
    expect(getAt(setRuleEnabled(off, 0, true), '/rules/0/enabled')).toBeUndefined();
  });

  it('moves and duplicates steps inside nested lists', () => {
    const moved = moveItem(BOOK, '/rules/0/do/1', -1);
    expect(getAt(moved, '/rules/0/do/0/step')).toBe('if');
    const copied = duplicateItem(BOOK, '/rules/0/do/1/do/0');
    expect((getAt(copied, '/rules/0/do/1/do') as Json[]).length).toBe(2);
    expect(setAt(BOOK, '/rules/0/do/0', undefined).rules).toHaveLength(2);
    expect((getAt(setAt(BOOK, '/rules/0/do/0', undefined), '/rules/0/do') as Json[]).length).toBe(
      1,
    );
  });

  it('fills new steps and conditions with defaults', () => {
    expect(newStep('give_item')).toEqual({ step: 'give_item' });
    expect(newStep('heal')).toEqual({ amount: 2, step: 'heal' });
    expect(newStep('wait')).toEqual({ seconds: 1, step: 'wait' });
    expect(newStep('show_message')).toEqual({ step: 'show_message', text: ['Hello!'] });
    expect(newStep('set_game_mode')).toEqual({ mode: 'survival', step: 'set_game_mode' });
    expect(newStep('teleport')).toEqual({ step: 'teleport', to: 'here' });
    expect(newStep('if')).toEqual({ conditions: [], do: [], match: 'all', step: 'if' });
    expect(newStep('repeat')).toEqual({ do: [], step: 'repeat', times: 2 });
    expect(newCondition('chance')).toEqual({ condition: 'chance', percent: 50 });
    expect(newCondition('player_health')).toEqual({
      compare: 'at_least',
      condition: 'player_health',
      number: 1,
    });
  });

  it('keeps the subject when the trigger takes the same sort, and drops options', () => {
    const book = setAt(BOOK, '/rules/0/when/options', { cooldown_seconds: 2 });
    const same = setTrigger(book, 0, 'block_broken');
    expect(getAt(same, '/rules/0/when')).toEqual({
      subject: 'demo:ruby_block',
      trigger: 'block_broken',
    });
    const any = setTrigger(book, 0, 'any_block_used');
    expect(getAt(any, '/rules/0/when/subject')).toBe('demo:ruby_block');
    expect(getAt(setTrigger(book, 0, 'item_used'), '/rules/0/when')).toEqual({
      trigger: 'item_used',
    });
    expect(getAt(setTrigger(book, 0, 'player_joined'), '/rules/0/when')).toEqual({
      trigger: 'player_joined',
    });
  });

  it('declares a counter on first use, once', () => {
    const next = setCounter(BOOK, '/rules/0/do/0', 'clicks', 'player');
    expect(getAt(next, '/rules/0/do/0/counter')).toBe('clicks');
    expect(getAt(next, '/rules/0/do/0/scope')).toBe('player');
    expect(next.counters).toEqual([{ name: 'clicks', scope: 'player', start: 0 }]);
    expect(declareCounter(next, 'clicks', 'player')).toBe(next);
    expect(declareCounter(next, 'clicks', 'world').counters).toHaveLength(2);
  });
});

describe('caps', () => {
  it('counts nested steps and stops at the step cap', () => {
    expect(countSteps(getAt(BOOK, '/rules/0'))).toBe(3);
    const full = setAt(
      BOOK,
      '/rules/1/do',
      Array.from({ length: MAX_STEPS }, () => ({ step: 'wait', seconds: 1 })),
    );
    expect(canAddStep(full, 1)).toBe(false);
    expect(canAddStep(full, 0)).toBe(true);
  });

  it('allows logic steps only at levels 1 and 2', () => {
    expect(listLevel('/rules/0/do')).toBe(1);
    expect(listLevel('/rules/0/do/1/do')).toBe(2);
    expect(listLevel('/rules/0/do/1/do/0/else')).toBe(3);
    expect(canNestHere('/rules/0/do/1/do')).toBe(true);
    expect(canNestHere('/rules/0/do/1/do/0/else')).toBe(false);
    const scope = ruleScope(triggerById('player_joined'));
    expect(ids(offeredSteps(scope, '/rules/0/do/1/do/0/do', { veryEasy: false }))).not.toContain(
      'repeat',
    );
  });
});

describe('what the pickers offer', () => {
  const random = ruleScope(triggerById('block_random_tick'));
  const used = ruleScope(triggerById('block_used'));
  const world = ruleScope(triggerById('world_every'));

  it('hides who, places, steps and readings the trigger lacks', () => {
    expect(ids(offeredWho(random, { veryEasy: false }))).toEqual([
      'every_player',
      'players_nearby',
    ]);
    expect(ids(offeredWho(used, { veryEasy: false }))).toContain('player');
    expect(ids(offeredWho(used, { veryEasy: false }))).not.toContain('mob');
    expect(ids(offeredPlaces(world, { veryEasy: false }))).toEqual(['offset']);
    expect(ids(offeredSteps(random, '/rules/0/do', { veryEasy: false }))).not.toContain(
      'play_animation',
    );
    expect(ids(offeredValues(random, { veryEasy: false }))).not.toContain('player_health');
    expect(ids(offeredConditions(random, { veryEasy: false }))).not.toContain('player_sneaking');
    expect(offeredCounterScopes(random)).toEqual(['world']);
    expect(offeredCounterScopes(used)).toEqual(['player', 'world']);
  });

  it('offers "Stop the normal action" only on cancellable triggers', () => {
    expect(ids(offeredSteps(used, '/rules/0/do', { veryEasy: false }))).not.toContain(
      'stop_normal_action',
    );
    const any = ruleScope(triggerById('any_block_used'));
    expect(ids(offeredSteps(any, '/rules/0/do', { veryEasy: false }))).toContain(
      'stop_normal_action',
    );
  });

  it('adds the player inside "for each player"', () => {
    const inner = innerScope(world, 'for_each_player');
    expect(ids(offeredWho(inner, { veryEasy: false }))).toContain('player');
    expect(innerScope(world, 'repeat')).toBe(world);
  });

  it('hides advanced-only steps and places in Very easy', () => {
    expect(ids(offeredSteps(used, '/rules/0/do', { veryEasy: true }))).not.toContain('run_command');
    expect(ids(offeredSteps(used, '/rules/0/do', { veryEasy: false }))).toContain('run_command');
    expect(ids(offeredPlaces(used, { veryEasy: true }))).not.toContain('offset');
  });

  it('leaves out the many for one entity, and sums inside sums', () => {
    expect(ids(offeredWho(used, { veryEasy: false, single: true }))).not.toContain('every_player');
    expect(ids(offeredValues(used, { veryEasy: false, plainOnly: true }))).not.toContain('math');
  });

  it('offers the way it faces in text slots only (B458a)', () => {
    expect(ids(offeredValues(used, { veryEasy: false }))).not.toContain('facing');
    expect(ids(offeredValues(used, { veryEasy: false, text: true }))).toContain('facing');
  });
});

describe('problems on the card', () => {
  it('anchors pointers at the deepest drawn chip, row or card', () => {
    expect(problemAnchor(BOOK, undefined)).toBe('');
    expect(problemAnchor(BOOK, '/counters/0/name')).toBe('');
    expect(problemAnchor(BOOK, '/rules/0/key')).toBe('/rules/0');
    expect(problemAnchor(BOOK, '/rules/9/do/0')).toBe('');
    expect(problemAnchor(BOOK, '/rules/0/when/trigger')).toBe('/rules/0/when');
    expect(problemAnchor(BOOK, '/rules/0/when/subject')).toBe('/rules/0/when/subject');
    expect(problemAnchor(BOOK, '/rules/0/do/0/item')).toBe('/rules/0/do/0/item');
    expect(problemAnchor(BOOK, '/rules/0/do/0/count/min')).toBe('/rules/0/do/0/count');
    expect(problemAnchor(BOOK, '/rules/0/do/0/step')).toBe('/rules/0/do/0');
    expect(problemAnchor(BOOK, '/rules/0/do/1/do/0/sound')).toBe('/rules/0/do/1/do/0/sound');
    expect(problemAnchor(BOOK, '/rules/0/do/1/conditions/0/percent')).toBe(
      '/rules/0/do/1/conditions/0/percent',
    );
    expect(problemAnchor(BOOK, '/rules/0/do/1/match')).toBe('/rules/0/do/1');
    expect(problemAnchor(BOOK, '/rules/0/only_if/conditions/0')).toBe(
      '/rules/0/only_if/conditions/0',
    );
    expect(problemAnchor(BOOK, '/rules/0/do/7')).toBe('/rules/0');
  });

  it("shows a counter's scope at its counter chip", () => {
    const book = setCounter(BOOK, '/rules/0/do/0', 'clicks', 'mob');
    const changed = setAt(book, '/rules/0/do/0/step', 'add_to_counter');
    expect(problemAnchor(changed, '/rules/0/do/0/scope')).toBe('/rules/0/do/0/counter');
  });

  it('groups problems by anchor', () => {
    const map = problemsByAnchor(BOOK, [
      { path: '/rules/0/do/0/item' },
      { path: '/rules/0/do/0/item' },
      { path: '/rules/1' },
      {},
    ]);
    expect(map.get('/rules/0/do/0/item')).toHaveLength(2);
    expect(map.get('/rules/1')).toHaveLength(1);
    expect(map.get('')).toHaveLength(1);
  });
});
