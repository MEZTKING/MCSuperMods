import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('@msm/core', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@msm/core');
  });
});
