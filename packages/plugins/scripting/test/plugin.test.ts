import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('@msm/plugin-scripting', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.scripting');
    expect(plugin.apiVersion).toBe('^0.8.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});
