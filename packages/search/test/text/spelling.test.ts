import { describe, expect, it } from 'vitest';
import { FOLD_EXCEPTIONS, fold, foldList } from '../../src/text';

describe('fold', () => {
  it('folds American spellings to the British ones by list', () => {
    const pairs: [string, string][] = [
      ['armor', 'armour'],
      ['armored', 'armoured'],
      ['colors', 'colours'],
      ['colorful', 'colourful'],
      ['favorite', 'favourite'],
      ['neighborhood', 'neighbourhood'],
      ['gray', 'grey'],
      ['grayscale', 'greyscale'],
      ['defense', 'defence'],
      ['center', 'centre'],
      ['centered', 'centred'],
      ['theaters', 'theatres'],
      ['traveled', 'travelled'],
      ['modeling', 'modelling'],
      ['catalog', 'catalogue'],
      ['cataloging', 'cataloguing'],
      ['aging', 'ageing'],
      ['pickax', 'pickaxe'],
    ];
    for (const [american, british] of pairs) expect(fold(american)).toBe(british);
  });

  it('folds -ize and -yze by rule, leaving its exceptions', () => {
    expect(fold('realize')).toBe('realise');
    expect(fold('organizations')).toBe('organisations');
    expect(fold('customizing')).toBe('customising');
    expect(fold('analyzer')).toBe('analyser');
    expect(fold('oxidized')).toBe('oxidised');
    for (const word of FOLD_EXCEPTIONS) expect(fold(word)).toBe(word);
    expect(fold('prizes')).toBe('prizes');
    expect(fold('resized')).toBe('resized');
    expect(fold('oversize')).toBe('oversize');
    expect(fold('seized')).toBe('seized');
  });

  it('leaves the words it does not know, and the -ous and -ary forms', () => {
    for (const word of [
      'colour',
      'creator',
      'motor',
      'door',
      'honorary',
      'humorous',
      'size',
      'fizz',
    ]) {
      expect(fold(word)).toBe(word);
    }
  });

  it('is idempotent (property test over listed, ruled and random words)', () => {
    let seed = 653;
    const random = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const endings = [
      '',
      'ize',
      'izes',
      'ized',
      'izing',
      'yze',
      'ization',
      'or',
      'ors',
      'er',
      'ed',
      'ing',
    ];
    const words: string[] = [...foldList().keys(), ...foldList().values()];
    for (let n = 0; n < 20_000; n++) {
      let word = '';
      const length = 1 + Math.floor(random() * 10);
      for (let i = 0; i < length; i++) word += letters[Math.floor(random() * letters.length)];
      words.push(word + (endings[Math.floor(random() * endings.length)] as string));
    }
    for (const word of words) {
      const once = fold(word);
      expect(fold(once), word).toBe(once);
    }
  });
});
