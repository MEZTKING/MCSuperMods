import { describe, expect, it } from 'vitest';
import { chipsOf } from '../src';

describe('the understood chips', () => {
  it('orders chips by word, then kind, each text and kind once', () => {
    expect(
      chipsOf([
        { at: 4, text: 'sets mobs on fire', kind: 'behaviour' },
        { at: 0, text: 'blue', kind: 'colour' },
        { at: 0, text: 'blue', kind: 'colour' },
        { at: 2, text: '20', kind: 'number', struck: true },
        { at: 0, text: 'Blue', kind: 'name' },
        { at: 5, text: '', kind: 'thing' },
      ]),
    ).toEqual([
      { text: 'Blue', kind: 'name' },
      { text: 'blue', kind: 'colour' },
      { text: '20', kind: 'number', struck: true },
      { text: 'sets mobs on fire', kind: 'behaviour' },
    ]);
  });
});
