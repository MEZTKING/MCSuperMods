import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('@msm/plugin-structures', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.structures');
    expect(plugin.apiVersion).toBe('^0.5.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});
