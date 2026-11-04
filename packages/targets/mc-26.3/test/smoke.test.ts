import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('@msm/target-mc-26.3', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@msm/target-mc-26.3');
  });
});
