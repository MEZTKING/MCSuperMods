/**
 * Home's "Make a game" tile (B557, ADR 0117 D3, plan "Very easy wording"): its own Games heading
 * after Worlds, the eight game flows of the library as Very easy picks in the plan's words (no
 * ids), and the hand-over of "Empty sky with a start island" to Skyblock now that the library has
 * it.
 */
import library from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import {
  MAKE_GAME_PICKS,
  MAKE_TILES,
  shownTiles,
  TILE_GROUPS,
  veryEasyPickOf,
} from '../../src/renderer/src/components/home/tiles';

const EIGHT = [
  'skyblock',
  'one-block',
  'sky-islands',
  'lucky-block',
  'adventure-map',
  'arena-game',
  'race',
  'goals',
];

const gameTile = () => MAKE_TILES.find((tile) => tile.id === 'game');

describe('Make a game tile (ADR 0117 D3)', () => {
  it('sits under its own Games heading after Worlds and offers the eight games', () => {
    const groups = TILE_GROUPS.map((group) => group.id as string);
    expect(groups.indexOf('games')).toBe(groups.indexOf('worlds') + 1);
    expect(TILE_GROUPS.find((group) => group.id === 'games')?.title).toBe('Games');
    const tile = gameTile();
    expect(tile?.label).toBe('Make a game');
    expect(tile?.group).toBe('games');
    expect(tile?.action).toEqual({ type: 'flows', flowIds: EIGHT, picks: MAKE_GAME_PICKS });
  });

  it('names the eight games in the plan words, with no ids', () => {
    expect(MAKE_GAME_PICKS.map((pick) => pick.label)).toEqual([
      'Skyblock',
      'One block',
      'Sky islands',
      'Lucky block',
      'Adventure map',
      'Arena game',
      'Race',
      'Goals',
    ]);
    expect(MAKE_GAME_PICKS.map((pick) => pick.flowId)).toEqual(EIGHT);
    const tile = gameTile();
    for (const text of [
      `${tile?.label} ${tile?.sentence}`,
      ...MAKE_GAME_PICKS.map((pick) => `${pick.label} ${pick.sentence}`),
    ]) {
      expect(text).not.toMatch(/[a-z0-9]+[:_/][a-z0-9]/);
    }
    for (const pick of MAKE_GAME_PICKS) expect(pick.sentence, pick.id).toMatch(/^[A-Z].*\.$/);
    expect(veryEasyPickOf('arena-game')?.label).toBe('Arena game');
  });

  it('offers the library game flows, each in the Creator group games', () => {
    const starters = library.contributes.projectStarters ?? [];
    for (const id of EIGHT) {
      const starter = starters.find((entry) => entry.id === id);
      expect(starter?.creator?.group, id).toBe('games');
    }
    const shown = (available: readonly string[]) =>
      shownTiles({
        flowAvailable: (id) => available.includes(id),
        rules: false,
        ai: false,
      }).find((entry) => entry.tile.id === 'game');
    expect(shown(EIGHT)?.flowIds).toEqual(EIGHT);
    // A target without the Fabric mod jar has no lucky block.
    expect(shown(EIGHT.filter((id) => id !== 'lucky-block'))?.flowIds).toHaveLength(7);
    expect(shown([])).toBeUndefined();
    // Make a world hands its empty sky over to Skyblock, which the library now has.
    const world = shownTiles({
      flowAvailable: () => true,
      starterAvailable: () => true,
      rules: false,
      ai: false,
    }).find((entry) => entry.tile.id === 'world');
    expect(world?.flowIds).toContain('skyblock');
    expect(world?.flowIds).not.toContain('world-empty-sky');
  });
});
