import { describe, expect, it } from 'vitest';
import { isStopWord, readIntent, STOP_WORDS, wordRole, wordsOf } from '../../src/text';

const intentOf = (text: string): string => readIntent(wordsOf(text), text).intent;

describe('readIntent', () => {
  it('reads "how … work" as the question: the last word is its frame, not a word to match', () => {
    const frameOf = (text: string) => readIntent(wordsOf(text), text).frame;
    expect(readIntent(wordsOf('how does try it work'), 'how does try it work')).toEqual({
      intent: 'learn',
      cue: [0],
      frame: [4],
    });
    expect(frameOf('how do rules work')).toEqual([3]);
    expect(frameOf('how do pistons works')).toEqual([3]);
    // Nothing but stop words between: nothing to ask about, so no frame.
    expect(frameOf('how does it work')).toBeUndefined();
    // Not a "how" question, or `work` not last: matched as a word as before.
    expect(frameOf('make a block work')).toBeUndefined();
    expect(frameOf('how to work a furnace')).toBeUndefined();
  });

  it('reads the first intent cue', () => {
    expect(intentOf('make a blue sword')).toBe('make');
    expect(intentOf('I want a flying pig')).toBe('make');
    expect(intentOf('how do I add a recipe')).toBe('learn');
    expect(intentOf('what is a loot table')).toBe('learn');
    expect(intentOf('can I change the sky')).toBe('learn');
    expect(intentOf('open my sword')).toBe('open');
    expect(intentOf('rename the gem')).toBe('open');
    expect(intentOf('texture is broken')).toBe('fix');
    expect(intentOf('my door is not working')).toBe('fix');
    expect(intentOf('export the mod')).toBe('command');
    expect(intentOf('undo')).toBe('command');
    expect(intentOf('blue sword')).toBe('none');
    expect(intentOf('')).toBe('none');
  });

  it('reads a bare namespace:path as an id', () => {
    expect(intentOf('mymod:ruby_sword')).toBe('id');
    expect(readIntent(['mymod', 'ruby', 'sword'], 'mymod:ruby_sword').cue).toEqual([]);
  });

  it('says which words were the cue', () => {
    expect(readIntent(wordsOf('so what is redstone')).cue).toEqual([1, 2]);
    expect(readIntent(wordsOf('a new sword')).cue).toEqual([1]);
  });
});

describe('stop words and word roles', () => {
  it('drops stop words, keeps cues as weak terms and other words as they are', () => {
    expect(wordRole('the')).toBe('drop');
    expect(wordRole('how')).toBe('drop');
    expect(wordRole('make')).toBe('weak');
    expect(wordRole('new')).toBe('weak');
    expect(wordRole('export')).toBe('keep');
    expect(wordRole('sword')).toBe('keep');
  });

  it('keeps the words later steps read: no, not, without, on, off, all', () => {
    for (const word of ['no', 'not', 'without', 'on', 'off', 'all'])
      expect(isStopWord(word)).toBe(false);
    expect(STOP_WORDS.size).toBeGreaterThan(40);
  });
});
