import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('@msm/plugin-models-anim', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.models-anim');
    expect(plugin.apiVersion).toBe('^0.7.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});
