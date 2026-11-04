import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('@msm/plugin-datapack', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.datapack');
    expect(plugin.apiVersion).toBe('^0.3.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});
