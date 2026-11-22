import { describe, expect, it } from 'vitest';
import { ARGUMENT_TYPE_LABELS } from '../../../../src/renderer/src/studios/scripting/command-model';

describe('command argument labels', () => {
  it('says a colour code is typed without the #', () => {
    expect(ARGUMENT_TYPE_LABELS.hex_colour).toBe('A colour code (such as ff8800, without the #)');
  });
});
