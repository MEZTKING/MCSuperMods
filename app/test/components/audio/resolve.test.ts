/**
 * Resolving a sound event and picking its file (ADR 0121 D2; B622): the project's `sounds.json`
 * over vanilla's, `replace`, event entries followed once with the game's weights, and the
 * volume, pitch and weight of each entry. All names are made up.
 */
import { describe, expect, it } from 'vitest';
import { fileChances, pickEntry, resolveSoundEvent } from '../../../src/renderer/src/audio/resolve';

const VANILLA = {
  'entity.made_up.hum': {
    subtitle: 'subtitles.made_up.hum',
    sounds: ['mob/made_up/hum1', { name: 'mob/made_up/hum2', weight: 3, volume: 0.5 }],
  },
  'music.made_up': { sounds: [{ name: 'music/made_up', stream: true }] },
};

/** A random that answers each value of the list in turn. */
const sequence = (...values: number[]) => {
  let at = 0;
  return () => values[at++ % values.length] as number;
};

describe('resolveSoundEvent', () => {
  it('reads vanilla events and the defaults of each entry', () => {
    const resolved = resolveSoundEvent('minecraft:entity.made_up.hum', {}, VANILLA);
    expect(resolved.origin).toBe('vanilla');
    expect(resolved.subtitle).toBe('subtitles.made_up.hum');
    expect(resolved.entries).toEqual([
      { name: 'mob/made_up/hum1', type: 'file', volume: 1, pitch: 1, weight: 1, stream: false },
      { name: 'mob/made_up/hum2', type: 'file', volume: 0.5, pitch: 1, weight: 3, stream: false },
    ]);
  });

  it('adds the project entries to vanilla, or replaces them', () => {
    const added = resolveSoundEvent(
      'minecraft:entity.made_up.hum',
      { minecraft: { 'entity.made_up.hum': { sounds: ['demo:own_hum'] } } },
      VANILLA,
    );
    expect(added.origin).toBe('project');
    expect(added.entries.map((entry) => entry.name)).toEqual([
      'mob/made_up/hum1',
      'mob/made_up/hum2',
      'demo:own_hum',
    ]);
    const replaced = resolveSoundEvent(
      'minecraft:entity.made_up.hum',
      { minecraft: { 'entity.made_up.hum': { replace: true, sounds: ['demo:own_hum'] } } },
      VANILLA,
    );
    expect(replaced.entries.map((entry) => entry.name)).toEqual(['demo:own_hum']);
    expect(replaced.subtitle).toBeUndefined();
  });

  it('answers missing for an event nobody defines, and vanilla only for minecraft', () => {
    expect(resolveSoundEvent('demo:nothing', {}, VANILLA).origin).toBe('missing');
    expect(resolveSoundEvent('demo:entity.made_up.hum', {}, VANILLA).origin).toBe('missing');
    expect(resolveSoundEvent('entity.made_up.hum', {}, VANILLA).event).toBe(
      'minecraft:entity.made_up.hum',
    );
  });

  it('follows an event entry once, weighing it as the whole event', () => {
    const resolved = resolveSoundEvent(
      'demo:echo',
      {
        demo: {
          echo: {
            sounds: [
              'demo:plain',
              { name: 'minecraft:entity.made_up.hum', type: 'event', pitch: 2, volume: 0.5 },
              { name: 'demo:loop', type: 'event' },
            ],
          },
          loop: { sounds: [{ name: 'demo:echo', type: 'event' }] },
        },
      },
      VANILLA,
    );
    const [plain, hum, loop] = resolved.entries;
    expect(plain?.weight).toBe(1);
    expect(hum?.weight).toBe(4);
    expect(hum?.followed?.map((entry) => entry.name)).toEqual([
      'mob/made_up/hum1',
      'mob/made_up/hum2',
    ]);
    // An event entry of the followed event is not followed again: it weighs nothing.
    expect(loop?.weight).toBe(0);
    // The picked file of the event entry multiplies both volumes and pitches.
    const picked = pickEntry(resolved, sequence(0.9, 0.9));
    expect(picked?.file).toEqual({
      namespace: 'minecraft',
      path: 'mob/made_up/hum2',
      origin: 'vanilla',
    });
    expect(picked?.entry.volume).toBe(0.25);
    expect(picked?.entry.pitch).toBe(2);
  });
});

describe('pickEntry', () => {
  it('picks by weight as the game does (an integer below the total weight)', () => {
    const resolved = resolveSoundEvent('minecraft:entity.made_up.hum', {}, VANILLA);
    const counts = new Map<string, number>();
    for (let step = 0; step < 400; step += 1) {
      const picked = pickEntry(resolved, () => step / 400);
      const name = picked?.file.path ?? 'none';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    expect(counts.get('mob/made_up/hum1')).toBe(100);
    expect(counts.get('mob/made_up/hum2')).toBe(300);
  });

  it('names the file with its namespace: a bare name is minecraft', () => {
    const resolved = resolveSoundEvent(
      'demo:thing',
      { demo: { thing: { sounds: ['records/made_up', 'demo:own'] } } },
      null,
    );
    expect(pickEntry(resolved, () => 0)?.file).toEqual({
      namespace: 'minecraft',
      path: 'records/made_up',
      origin: 'vanilla',
    });
    expect(pickEntry(resolved, () => 0.6)?.file).toEqual({
      namespace: 'demo',
      path: 'own',
      origin: 'project',
    });
  });

  it('keeps stream, and picks nothing from an empty event', () => {
    const music = resolveSoundEvent('minecraft:music.made_up', {}, VANILLA);
    expect(pickEntry(music, () => 0)?.entry.stream).toBe(true);
    expect(pickEntry(resolveSoundEvent('demo:none', {}, null), () => 0)).toBeNull();
  });

  it('gives each file its chance', () => {
    const resolved = resolveSoundEvent('minecraft:entity.made_up.hum', {}, VANILLA);
    expect(fileChances(resolved)).toEqual([
      { name: 'mob/made_up/hum1', chance: 0.25 },
      { name: 'mob/made_up/hum2', chance: 0.75 },
    ]);
  });
});
