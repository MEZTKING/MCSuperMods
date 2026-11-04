import { describe, expect, it } from 'vitest';
import { TARGETS_PACKAGE } from '../src/index';

describe('@msm/targets skeleton', () => {
  it('exposes its placeholder constant', () => {
    expect(TARGETS_PACKAGE).toBe('@msm/targets');
  });
});
