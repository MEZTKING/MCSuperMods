import { describe, expect, it } from 'vitest';
import { createSearchIndex } from '../src';

describe('@msm/search scaffold', () => {
  it('exports the stub and says it is not built yet', () => {
    expect(typeof createSearchIndex).toBe('function');
    expect(() => createSearchIndex()).toThrow(/not built yet/);
  });
});
