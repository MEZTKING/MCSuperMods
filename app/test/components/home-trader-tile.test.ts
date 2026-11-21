/**
 * Home's "Make a trader" tile (B480, ADR 0101 D4, plan "Very easy wording"): its heading, words
 * (no ids) and flow, and that it hides while the library has no Wandering merchant flow.
 */
import { describe, expect, it } from 'vitest';
import {
  MAKE_TILES,
  shownTiles,
  TRADER_FLOW_ID,
} from '../../src/renderer/src/components/home/tiles';

const traderTile = () => MAKE_TILES.find((tile) => tile.id === 'trader');

describe('Make a trader tile (ADR 0101 D4)', () => {
  it('sits under Creatures after the pets and opens the Wandering merchant and Village job flows', () => {
    expect(traderTile()).toEqual({
      id: 'trader',
      label: 'Make a trader',
      sentence: 'A mob that trades with you, or a new job for villagers.',
      group: 'creatures',
      action: { type: 'flows', flowIds: ['wandering-merchant', 'village-job'] },
    });
    expect(TRADER_FLOW_ID).toBe('wandering-merchant');
    const ids = MAKE_TILES.map((tile) => tile.id);
    expect(ids.indexOf('trader')).toBe(ids.indexOf('pet') + 1);
  });

  it('shows no ids in its words', () => {
    const tile = traderTile();
    expect(`${tile?.label} ${tile?.sentence}`).not.toMatch(/[a-z0-9]+[:_-][a-z0-9]/);
  });

  it('is hidden without its flows and shown with them', () => {
    const shown = (available: (id: string) => boolean) =>
      shownTiles({ flowAvailable: available, rules: false, ai: false }).map(
        (entry) => entry.tile.id,
      );
    expect(shown(() => false)).not.toContain('trader');
    const withFlow = shownTiles({ flowAvailable: () => true, rules: false, ai: false });
    expect(withFlow.find((entry) => entry.tile.id === 'trader')?.flowIds).toEqual([
      TRADER_FLOW_ID,
      'village-job',
    ]);
  });
});
