import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('@msm/plugin-games', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.games');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});

describe('stub kinds', () => {
  it('lists the six games kind ids, none registered yet', async () => {
    const { GAMES_KIND_IDS } = await import('../src/kinds/index');
    expect(GAMES_KIND_IDS).toEqual([
      'msm:world_setup',
      'msm:one_block',
      'msm:team',
      'msm:objective',
      'msm:timer',
      'msm:area',
    ]);
    expect(plugin.contributes.elementKinds ?? []).toHaveLength(0);
  });
});
