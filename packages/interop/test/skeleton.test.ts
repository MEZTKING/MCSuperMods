import { describe, expect, it } from 'vitest';
import { INTEROP_PACKAGE } from '../src/index';
import { INTEROP_NODE_ENTRY } from '../src/node';

describe('@msm/interop skeleton', () => {
  it('exposes both entry points', () => {
    expect(INTEROP_PACKAGE).toBe('@msm/interop');
    expect(INTEROP_NODE_ENTRY).toBe('@msm/interop/node');
  });
});
