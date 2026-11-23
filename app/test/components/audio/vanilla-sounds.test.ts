import { describe, expect, it } from 'vitest';
import {
  createVanillaSoundReader,
  NO_VANILLA_SOUNDS,
  type ReadAssetObject,
  VANILLA_SOUNDS_JSON_KEY,
  vanillaSoundKey,
} from '../../../src/renderer/src/audio/vanilla-sounds';
import type { AssetObjectAnswer } from '../../../src/shared/platform';

/** Made-up bytes; no Mojang file is used. */
const SOUNDS_JSON = { 'entity.made_up.hum': { sounds: ['mob/made_up/hum1'] } };
const HUM = new Uint8Array([1, 2, 3]);

function fakeStore(setUp: { value: boolean }): {
  read: ReadAssetObject;
  calls: string[];
} {
  const calls: string[] = [];
  const read: ReadAssetObject = async (mcVersion, key) => {
    calls.push(`${mcVersion} ${key}`);
    if (!setUp.value) return { ok: false, reason: 'not_set_up' } satisfies AssetObjectAnswer;
    if (key === VANILLA_SOUNDS_JSON_KEY) {
      return { ok: true, bytes: new TextEncoder().encode(JSON.stringify(SOUNDS_JSON)) };
    }
    if (key === 'minecraft/sounds/mob/made_up/hum1.ogg') return { ok: true, bytes: HUM };
    return { ok: false, reason: 'not_listed' };
  };
  return { read, calls };
}

describe('the vanilla sound reader (ADR 0121 D2, D3; B621)', () => {
  it('reads sounds.json once and sound files each time they are asked for', async () => {
    const { read, calls } = fakeStore({ value: true });
    const reader = createVanillaSoundReader({ mcVersion: '9.9', readAssetObject: read });
    expect(await reader.available()).toBe(true);
    expect(await reader.soundsJson()).toEqual(SOUNDS_JSON);
    expect(await reader.file('minecraft/sounds/mob/made_up/hum1.ogg')).toEqual(HUM);
    expect(await reader.file('minecraft/sounds/mob/made_up/hum1.ogg')).toEqual(HUM);
    expect(await reader.file('minecraft/sounds/nope.ogg')).toBeNull();
    expect(calls).toEqual([
      '9.9 minecraft/sounds.json',
      '9.9 minecraft/sounds/mob/made_up/hum1.ogg',
      '9.9 minecraft/sounds/mob/made_up/hum1.ogg',
      '9.9 minecraft/sounds/nope.ogg',
    ]);
  });

  it('is off without the folder and asks again later', async () => {
    const setUp = { value: false };
    const { read, calls } = fakeStore(setUp);
    const reader = createVanillaSoundReader({ mcVersion: '9.9', readAssetObject: read });
    expect(await reader.available()).toBe(false);
    expect(await reader.file('minecraft/sounds/mob/made_up/hum1.ogg')).toBeNull();
    setUp.value = true;
    expect(await reader.available()).toBe(true);
    expect(calls.filter((call) => call.endsWith('sounds.json'))).toHaveLength(2);
  });

  it('answers nothing for a failed read, a bad sounds.json or no platform read', async () => {
    const failing = createVanillaSoundReader({
      mcVersion: '9.9',
      readAssetObject: async () => {
        throw new Error('channel closed');
      },
    });
    expect(await failing.available()).toBe(false);
    expect(await failing.file('minecraft/sounds/x.ogg')).toBeNull();
    const bad = createVanillaSoundReader({
      mcVersion: '9.9',
      readAssetObject: async () => ({ ok: true, bytes: new TextEncoder().encode('[1]') }),
    });
    expect(await bad.soundsJson()).toBeNull();
    expect(createVanillaSoundReader({ mcVersion: '9.9' })).toBe(NO_VANILLA_SOUNDS);
    expect(await NO_VANILLA_SOUNDS.available()).toBe(false);
  });

  it('names the index key of a sound the way sounds.json names it', () => {
    expect(vanillaSoundKey('mob/wolf/bark1')).toBe('minecraft/sounds/mob/wolf/bark1.ogg');
    expect(vanillaSoundKey('minecraft:mob/wolf/bark1')).toBe('minecraft/sounds/mob/wolf/bark1.ogg');
    expect(vanillaSoundKey('my_mod:hum')).toBeNull();
    expect(vanillaSoundKey('minecraft:')).toBeNull();
  });
});
