import { describe, expect, it } from 'vitest';
import { AREA_SIZE_X, AREA_SIZE_Y, AREA_SIZE_Z } from '../src/index.js';

describe('@msm/sim scaffold', () => {
  it('fixes the area at 48 by 48 by 32 blocks', () => {
    expect([AREA_SIZE_X, AREA_SIZE_Z, AREA_SIZE_Y]).toEqual([48, 48, 32]);
  });
});
