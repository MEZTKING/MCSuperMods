import { describe, expect, it } from 'vitest';
import {
  actionKey,
  distinctWords,
  idTokens,
  indexWords,
  prepareEntry,
} from '../../src/index/entry';
import { fold, isStopWord, tokenise } from '../../src/text';
import { entry, random } from '../engine-fixtures';

describe('entry', () => {
  it('splits each field into folded words, stop words left out', () => {
    const prepared = prepareEntry(
      entry('flow:a', 'flow', 'The Colored Teapot', {
        sentence: 'A teapot for the table.',
        words: ['kettle', 'pot'],
        body: 'Pour it.',
        ids: ['base:tea_pot'],
        questions: [
          { id: 'q', label: 'Colour', type: 'choice', choices: [{ value: 'r', label: 'Red' }] },
        ],
      }),
    );
    const [title, words, answers, sentence, ids, body] = prepared.fields;
    expect(title).toEqual(['coloured', 'teapot']);
    expect(words).toEqual(['kettle', 'pot']);
    expect(answers).toEqual(['colour', 'red']);
    expect(sentence).toEqual(['teapot', 'table']);
    expect(ids).toEqual(['base', 'tea', 'pot', 'base:tea_pot', 'tea_pot']);
    expect(body).toEqual(['pour']);
    expect(prepared.title).toEqual(['coloured', 'teapot']);
  });

  it('keeps the name before a colon', () => {
    expect(prepareEntry(entry('c', 'command', 'Play: test the mod')).name).toEqual(['play']);
    expect(prepareEntry(entry('c', 'command', 'Play')).name).toBeUndefined();
  });

  it('keeps whole ids and their paths', () => {
    expect(idTokens('base:rain_cover')).toEqual(['base:rain_cover', 'rain_cover']);
    expect(idTokens('rain_cover')).toEqual(['rain_cover']);
    expect(idTokens('plain words')).toEqual([]);
  });

  it('adds only plain words to the dictionary', () => {
    const words = distinctWords(
      prepareEntry(entry('a', 'vanilla', 'Rain', { ids: ['base:rain_cover'] })),
    );
    expect([...words].sort()).toEqual(['base', 'cover', 'rain']);
  });

  it('never throws on a malformed entry', () => {
    const odd = {
      id: 'x',
      source: 'flow',
      title: 42,
      words: [null, 'ok'],
      questions: 'no',
    } as never;
    expect(prepareEntry(odd).fields[1]).toEqual(['ok']);
  });

  it('keys actions with sorted keys, so equal descriptors fold', () => {
    expect(actionKey({ type: 'make', flow: 'a', values: { b: 1, a: 2 } })).toBe(
      actionKey({ values: { a: 2, b: 1 }, flow: 'a', type: 'make' }),
    );
    expect(actionKey({ type: 'make', flow: 'a' })).not.toBe(actionKey({ type: 'make', flow: 'b' }));
    const deep: Record<string, unknown> = {};
    let at = deep;
    for (let i = 0; i < 40; i++) {
      at.next = {};
      at = at.next as Record<string, unknown>;
    }
    expect(typeof actionKey(deep)).toBe('string');
  });

  it('splits plain text as the tokeniser does, on its fast path and off it', () => {
    const next = random(3);
    const alphabet = "abcXYZ  .,;:-_/()!?\t\n'09éßæ’";
    for (let n = 0; n < 5000; n++) {
      let text = '';
      const length = Math.floor(next() * 30);
      for (let i = 0; i < length; i++) text += alphabet[Math.floor(next() * alphabet.length)];
      const slow = tokenise(text)
        .words.map((t) => t.text)
        .filter((w) => !isStopWord(w))
        .map(fold);
      expect(indexWords(text)).toEqual(slow);
    }
  });
});
