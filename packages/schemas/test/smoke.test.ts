import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('@msm/schemas', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@msm/schemas');
  });
});
