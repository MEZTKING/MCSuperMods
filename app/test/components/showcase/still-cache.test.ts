/** The showcase's taken stills (B568, ADR 0118 D7): in memory, once per clip per session. */

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearStills,
  hasStill,
  keepStill,
  stillKey,
  stillsVersion,
  subscribeStills,
  takenStill,
} from '../../../src/renderer/src/showcase/still-cache';

afterEach(clearStills);

describe('still cache', () => {
  it('keys a still by clip, target and whether the client jar draws vanilla blocks', () => {
    const keys = new Set([
      stillKey('wood-set', 'mc-26.3', false),
      stillKey('wood-set', 'mc-26.3', true),
      stillKey('wood-set', 'mc-26.4', false),
      stillKey('pet', 'mc-26.3', false),
    ]);
    expect(keys.size).toBe(4);
  });

  it('keeps the first still of a key only', () => {
    const key = stillKey('wood-set', 'mc-26.3', false);
    expect(takenStill(key)).toBeNull();
    expect(keepStill(key, 'data:image/png;base64,AAAA')).toBe(true);
    expect(keepStill(key, 'data:image/png;base64,BBBB')).toBe(false);
    expect(takenStill(key)).toBe('data:image/png;base64,AAAA');
    expect(hasStill(key)).toBe(true);
    expect(hasStill(stillKey('wood-set', 'mc-26.3', true))).toBe(false);
  });

  it('refuses anything but a picture data URL', () => {
    const key = stillKey('pet', 'mc-26.3', false);
    expect(keepStill(key, 'data:,')).toBe(false);
    expect(hasStill(key)).toBe(false);
  });

  it('tells its listeners and moves its version on', () => {
    let calls = 0;
    const stop = subscribeStills(() => {
      calls += 1;
    });
    const before = stillsVersion();
    keepStill(stillKey('a', 't', false), 'data:image/png;base64,AAAA');
    keepStill(stillKey('a', 't', false), 'data:image/png;base64,AAAA');
    expect(calls).toBe(1);
    expect(stillsVersion()).toBe(before + 1);
    stop();
    keepStill(stillKey('b', 't', false), 'data:image/png;base64,AAAA');
    expect(calls).toBe(1);
  });
});
