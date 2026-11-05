import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('@msm/plugin-entities', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.entities');
    expect(plugin.apiVersion).toBe('^0.7.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});
