import { describe, expect, it } from 'vitest';
import type { SearchHit } from '../../src';
import { actionKey } from '../../src/index/entry';
import { foldHits } from '../../src/rank/fold';
import { entry } from '../engine-fixtures';

const hit = (e: ReturnType<typeof entry>, score: number, why: string[] = []): SearchHit => ({
  entry: e,
  score,
  why,
});
const key = (h: SearchHit) => actionKey(h.entry.action);

describe('fold', () => {
  const make = { type: 'make', flow: 'teapot' };
  const tile = entry('tile:teapot', 'tile', 'Make a teapot', { action: make });
  const flow = entry('flow:teapot', 'flow', 'Teapot', { action: make });
  const card = entry('card:teapot', 'tile', 'A teapot', { action: make });
  const other = entry('flow:kettle', 'flow', 'Kettle');

  it('folds entries with the same action into the flow, keeping the best score', () => {
    const out = foldHits(
      [hit(tile, 9, ['tile']), hit(other, 5), hit(flow, 4, ['flow']), hit(card, 1)],
      key,
    );
    expect(out.map((h) => [h.entry.id, h.score])).toEqual([
      ['flow:teapot', 9],
      ['flow:kettle', 5],
    ]);
    expect(out[0]?.why).toEqual(['flow', 'folded tile:teapot', 'folded card:teapot']);
  });

  it('keeps answers from the member that has them', () => {
    const answered: SearchHit = { entry: tile, score: 3, why: [], answers: { colour: '#000000' } };
    expect(foldHits([answered, hit(flow, 2)], key)[0]?.answers).toEqual({ colour: '#000000' });
  });

  it('folds only within the window', () => {
    const out = foldHits([hit(other, 5), hit(tile, 4), hit(flow, 3)], key, 2);
    expect(out.map((h) => h.entry.id)).toEqual(['flow:kettle', 'tile:teapot', 'flow:teapot']);
  });
});
