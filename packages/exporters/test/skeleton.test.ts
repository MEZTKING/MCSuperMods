import { describe, expect, it } from 'vitest';
import { EXPORTERS_PACKAGE } from '../src/index';

describe('@msm/exporters skeleton', () => {
  it('exposes its placeholder constant', () => {
    expect(EXPORTERS_PACKAGE).toBe('@msm/exporters');
  });
});
