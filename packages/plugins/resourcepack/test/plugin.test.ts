import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('@msm/plugin-resourcepack', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.resourcepack');
    expect(plugin.apiVersion).toBe('^0.2.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});
