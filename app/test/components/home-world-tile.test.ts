/**
 * Home's "Make a world" tile (B586, ADR 0119 D11, plan "Very easy wording"): its heading and
 * words (no ids), the five worlds as Very easy picks before the Dimension flow and the Custom
 * biome starter, and the hand-over of "Empty sky with a start island" to the Skyblock flow once
 * the library has it.
 */
import { describe, expect, it } from 'vitest';
import {
  MAKE_TILES,
  MAKE_WORLD_PICKS,
  SKYBLOCK_HAND_OVER,
  shownTiles,
  veryEasyPickOf,
} from '../../src/renderer/src/components/home/tiles';

const worldTile = () => MAKE_TILES.find((tile) => tile.id === 'world');
const FIVE = [
  'world-islands',
  'world-mountains',
  'world-one-biome',
  'world-caves',
  'world-empty-sky',
];

describe('Make a world tile (ADR 0119 D11)', () => {
  it('heads the Worlds tiles and offers the five worlds, then a dimension or a biome', () => {
    const tile = worldTile();
    expect(tile?.label).toBe('Make a world');
    expect(tile?.group).toBe('worlds');
    const worlds = MAKE_TILES.filter((entry) => entry.group === 'worlds').map((entry) => entry.id);
    expect(worlds[0]).toBe('world');
    expect(tile?.action).toEqual({
      type: 'flows',
      flowIds: [...FIVE, 'dimension'],
      starterIds: ['custom_biome'],
      picks: MAKE_WORLD_PICKS,
      replacedBy: { 'world-empty-sky': 'skyblock' },
    });
  });

  it('names the five worlds in the plan words, with no ids', () => {
    expect(MAKE_WORLD_PICKS.map((pick) => pick.label)).toEqual([
      'Islands',
      'Tall mountains',
      'One biome everywhere',
      'Caves only',
      'Empty sky with a start island',
    ]);
    expect(MAKE_WORLD_PICKS.map((pick) => pick.flowId)).toEqual(FIVE);
    const tile = worldTile();
    for (const text of [
      `${tile?.label} ${tile?.sentence}`,
      ...MAKE_WORLD_PICKS.map((pick) => `${pick.label} ${pick.sentence}`),
    ]) {
      expect(text).not.toMatch(/[a-z0-9]+[:_/][a-z0-9]/);
    }
    for (const pick of MAKE_WORLD_PICKS) expect(pick.sentence, pick.id).toMatch(/^[A-Z].*\.$/);
    expect(veryEasyPickOf('world-caves')?.label).toBe('Caves only');
  });

  it('offers the worlds the library has, and hands the empty sky over to Skyblock', () => {
    const shown = (available: readonly string[]) =>
      shownTiles({
        flowAvailable: (id) => available.includes(id),
        starterAvailable: () => true,
        rules: false,
        ai: false,
      }).find((entry) => entry.tile.id === 'world');
    expect(shown([...FIVE, 'dimension'])?.flowIds).toEqual([...FIVE, 'dimension']);
    expect(shown([...FIVE, 'dimension', 'skyblock'])?.flowIds).toEqual([
      'world-islands',
      'world-mountains',
      'world-one-biome',
      'world-caves',
      'skyblock',
      'dimension',
    ]);
    expect(SKYBLOCK_HAND_OVER).toEqual({ 'world-empty-sky': 'skyblock' });
    // Without the flows the tile still offers the Custom biome starter.
    expect(shown([])?.starterIds).toEqual(['custom_biome']);
  });
});
