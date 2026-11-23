import { describe, expect, it } from 'vitest';
import {
  availabilitySignal,
  behaviourSignal,
  coverageSignal,
  historySignal,
  intentSignal,
  makesThingSignal,
  modeSignal,
  modSignal,
  orderSignal,
  rankingIntent,
  titleSignal,
} from '../../src/rank/signals';
import { BONUS, CONTEXT, COVERAGE_FLOOR, SOURCE_WEIGHT } from '../../src/rank/weights';
import { entry } from '../engine-fixtures';

const terms = (...words: string[][]) => words.map((w) => new Set(w));

describe('signals', () => {
  it('weighs sources by intent', () => {
    expect(intentSignal('make', 'flow').factor).toBe(SOURCE_WEIGHT.make.flow);
    expect(intentSignal('learn', 'guide').factor).toBeGreaterThan(
      intentSignal('learn', 'flow').factor,
    );
    expect(intentSignal('fix', 'problem').factor).toBeGreaterThan(
      intentSignal('fix', 'flow').factor,
    );
    expect(intentSignal('command', 'command').why).toBe('intent command');
    expect(intentSignal('none', 'flow').why).toBeUndefined();
  });

  it('leans by the door when the words carry no intent', () => {
    expect(rankingIntent('learn', 'very-easy', undefined, {})).toBe('learn');
    expect(rankingIntent('none', 'very-easy', undefined, {})).toBe('make');
    expect(rankingIntent('none', 'easy', 'commands', {})).toBe('command');
    expect(rankingIntent('none', 'easy', undefined, { lean: 'command' })).toBe('command');
    expect(rankingIntent('none', 'advanced', undefined, {})).toBe('none');
  });

  it('greys an unavailable entry', () => {
    expect(availabilitySignal(entry('a', 'flow', 'A', { available: false }))).toEqual({
      factor: CONTEXT.unavailable,
      why: 'not available',
    });
    expect(availabilitySignal(entry('a', 'flow', 'A')).factor).toBe(1);
  });

  it('lowers technical entries in Very easy only', () => {
    const technical = entry('a', 'kind', 'A', { technical: true });
    expect(modeSignal(technical, 'very-easy').factor).toBe(CONTEXT.technical);
    expect(modeSignal(technical, 'easy').factor).toBe(1);
  });

  it('lifts what the open mod already uses', () => {
    expect(modSignal(entry('kind:a', 'kind', 'A'), new Set(['kind:a'])).why).toBe('in your mod');
    expect(modSignal(entry('kind:b', 'kind', 'B'), new Set(['kind:a'])).factor).toBe(1);
  });

  it('lifts what was chosen before, a little and to a cap', () => {
    const a = entry('a', 'flow', 'A');
    expect(historySignal(a, { a: 1 }).factor).toBeCloseTo(1 + CONTEXT.historyPerTime);
    expect(historySignal(a, { a: 500 }).factor).toBeCloseTo(1 + 5 * CONTEXT.historyPerTime);
    expect(historySignal(a, { b: 3 }).factor).toBe(1);
    expect(historySignal(a, { a: Number.NaN }).factor).toBe(1);
    expect(historySignal(entry('toString', 'flow', 'X'), {}).factor).toBe(1);
  });

  it('scores coverage on a curve, every word a bonus', () => {
    expect(coverageSignal(0, 2).factor).toBeCloseTo(COVERAGE_FLOOR);
    expect(coverageSignal(1, 2).factor).toBeCloseTo(COVERAGE_FLOOR + (1 - COVERAGE_FLOOR) / 4);
    expect(coverageSignal(2, 2)).toEqual({ factor: BONUS.everyWord, why: 'every word' });
    expect(coverageSignal(0, 0).factor).toBe(1);
  });

  it('knows an exact title, an exact name and a title with every word', () => {
    expect(titleSignal(['red', 'kettle'], undefined, terms(['kettle'], ['red'])).why).toBe(
      'exact title',
    );
    expect(titleSignal(['red', 'kettle', 'set'], undefined, terms(['kettle'], ['red'])).why).toBe(
      'title has every word',
    );
    expect(titleSignal(['play', 'test', 'mod'], ['play'], terms(['play'])).why).toBe('exact name');
    expect(titleSignal(['kettle'], undefined, terms(['kettle'], ['red'])).factor).toBe(1);
    expect(titleSignal(['kettle'], undefined, []).factor).toBe(1);
  });

  it('knows words in order and close together', () => {
    expect(orderSignal(['red', 'kettle'], terms(['red'], ['kettle'])).why).toBe(
      'in order and close',
    );
    expect(orderSignal(['red', 'big', 'kettle'], terms(['red'], ['kettle'])).why).toBe('in order');
    expect(orderSignal(['kettle', 'red'], terms(['red'], ['kettle'])).why).toBe('close');
    expect(orderSignal(['kettle', 'big', 'red'], terms(['red'], ['kettle'])).factor).toBe(1);
    expect(orderSignal(['kettle'], terms(['kettle'])).factor).toBe(1);
  });

  it('lifts a flow that makes the thing named, under the make lean only', () => {
    expect(makesThingSignal(true, 'make').factor).toBe(BONUS.makesThing);
    expect(makesThingSignal(true, 'learn').factor).toBe(1);
    expect(makesThingSignal(false, 'make').factor).toBe(1);
  });

  it('lifts an entry a behaviour fits', () => {
    expect(behaviourSignal(true)).toEqual({ factor: BONUS.behaviour, why: 'behaviour' });
    expect(behaviourSignal(false).factor).toBe(1);
  });
});
