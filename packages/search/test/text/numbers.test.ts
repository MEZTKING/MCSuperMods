import { describe, expect, it } from 'vitest';
import { numberOf, readNumbers, toHealth, toTicks } from '../../src/text';

describe('readNumbers', () => {
  it('reads digits and number words with their unit', () => {
    expect(readNumbers('a sword with 5 hearts')).toEqual([
      { value: 5, unit: 'heart', first: 3, last: 4 },
    ]);
    expect(readNumbers('twenty five seconds')).toEqual([
      { value: 25, unit: 'second', first: 0, last: 2 },
    ]);
    expect(readNumbers('one hundred and fifty blocks')[0]).toMatchObject({
      value: 150,
      unit: 'block',
    });
    expect(readNumbers('two thousand ticks')[0]).toMatchObject({ value: 2000, unit: 'tick' });
    expect(readNumbers('1.5 minutes')[0]).toMatchObject({ value: 1.5, unit: 'minute' });
    expect(readNumbers('10s')[0]).toMatchObject({ value: 10, unit: 'second' });
  });

  it('reads half, a and an before a unit, and "and a half"', () => {
    expect(readNumbers('half a heart')[0]).toMatchObject({ value: 0.5, unit: 'heart' });
    expect(readNumbers('heals a heart')[0]).toMatchObject({ value: 1, unit: 'heart' });
    expect(readNumbers('two and a half hearts')[0]).toMatchObject({ value: 2.5, unit: 'heart' });
    expect(readNumbers('a sword')).toEqual([]);
  });

  it('reads per cent in its three spellings', () => {
    expect(readNumbers('50% faster')[0]).toMatchObject({ value: 50, unit: 'percent' });
    expect(readNumbers('50 percent')[0]).toMatchObject({ value: 50, unit: 'percent' });
    expect(readNumbers('ten per cent')[0]).toMatchObject({ value: 10, unit: 'percent', last: 2 });
  });

  it('reads ranges', () => {
    expect(readNumbers('drops 3 to 5')).toEqual([{ value: 3, upTo: 5, first: 1, last: 3 }]);
    expect(readNumbers('drops 3-5 gems')[0]).toMatchObject({ value: 3, upTo: 5 });
    expect(readNumbers('between 2 and 4 hearts')).toEqual([
      { value: 2, upTo: 4, unit: 'heart', first: 0, last: 4 },
    ]);
    expect(readNumbers('3 to 5 blocks')[0]).toMatchObject({ value: 3, upTo: 5, unit: 'block' });
    expect(readNumbers('5 hearts to start')).toEqual([
      { value: 5, unit: 'heart', first: 0, last: 1 },
    ]);
  });

  it('reads several numbers, and never clamps', () => {
    const found = readNumbers('9999 hearts and 3 seconds');
    expect(found.map((n) => [n.value, n.unit])).toEqual([
      [9999, 'heart'],
      [3, 'second'],
    ]);
  });

  it('never throws, on any string', () => {
    for (const text of ['', 'and', 'between', 'between and', '-', '%', 'to to to', 'a', 'half']) {
      expect(() => readNumbers(text)).not.toThrow();
    }
  });
});

describe('number helpers', () => {
  it('reads single words and converts units', () => {
    expect(numberOf('12')).toBe(12);
    expect(numberOf('twelve')).toBe(12);
    expect(numberOf('sword')).toBeUndefined();
    expect(toTicks(2, 'second')).toBe(40);
    expect(toTicks(1, 'minute')).toBe(1200);
    expect(toTicks(7, 'tick')).toBe(7);
    expect(toTicks(7, 'heart')).toBeUndefined();
    expect(toHealth(3, 'heart')).toBe(6);
  });
});
