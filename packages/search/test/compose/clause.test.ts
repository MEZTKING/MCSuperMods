import { describe, expect, it } from 'vitest';
import { splitClause } from '../../src';
import { typedName } from '../../src/compose/clause';
import { tokenise } from '../../src/text';

const name = (text: string) => {
  const tokens = tokenise(text);
  return typedName(text, tokens.normalised, tokens.words, tokens.words.length);
};

describe('the head and the clause', () => {
  it('splits at the first cue that is not the first word', () => {
    expect(splitClause(['blue', 'sword', 'that', 'sets', 'mobs', 'on', 'fire'])).toEqual({
      cue: 2,
      clause: [3, 4, 5, 6],
    });
    expect(splitClause(['which', 'sword', 'glows'])).toEqual({ cue: -1, clause: [] });
    expect(splitClause(['sword', 'that'])).toEqual({ cue: -1, clause: [] });
    expect(splitClause(['a', 'block', 'which', 'glows', 'that', 'explodes']).clause).toEqual([
      3, 4, 5,
    ]);
  });

  it('reads a quoted name with its own capitals, or the words after "called"', () => {
    expect(name('a "Sky Pig" mount')).toEqual({ start: 1, end: 3, name: 'Sky Pig' });
    expect(name('a sword called frost bite that glows')).toEqual({
      start: 2,
      end: 5,
      name: 'frost bite',
    });
    expect(name('a mob named Bob')).toEqual({ start: 2, end: 4, name: 'bob' });
    expect(name('called')).toBeUndefined();
    expect(name('a sword called the')).toBeUndefined();
    expect(name('a sword')).toBeUndefined();
  });
});
