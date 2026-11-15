import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('@msm/plugin-controls', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.controls');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });
});
