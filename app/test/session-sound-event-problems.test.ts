import { createRegistryIndex, type SchemaProblem } from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import {
  rewriteSoundEventProblems,
  UNREGISTERED_SOUND_EVENT,
} from '../src/renderer/src/session/schema-context';

const registries = createRegistryIndex({
  vanilla: { sound_event: ['music_disc.cat'], weighed_sound_event: ['music_disc.cat'] },
  project: { weighed_sound_event: ['demo:music_disc.my_song'] },
});

const unknown = (path: string, value: string): SchemaProblem => ({
  severity: 'warning',
  code: 'schema.unknown-id',
  path,
  message: `Unknown sound_event id ${JSON.stringify(value)}.`,
  expected: 'sound_event id',
});

describe('rewriteSoundEventProblems', () => {
  it('turns a project sound key in a vanilla element into an error', () => {
    const data = { components: { 'minecraft:consumable': { sound: 'demo:music_disc.my_song' } } };
    const path = '/components/minecraft:consumable/sound';
    const out = rewriteSoundEventProblems(
      [unknown(path, 'demo:music_disc.my_song')],
      'minecraft:item_modifier',
      data,
      registries,
    );
    expect(out).toEqual([
      expect.objectContaining({ severity: 'error', code: UNREGISTERED_SOUND_EVENT, path }),
    ]);
    expect(out[0]?.message).toContain('{ "sound_id": "demo:music_disc.my_song" }');
  });

  it('leaves MSM kinds alone: the runtime reads those fields', () => {
    const data = { sound: 'demo:music_disc.my_song' };
    expect(
      rewriteSoundEventProblems(
        [unknown('/sound', 'demo:music_disc.my_song')],
        'msm:item',
        data,
        registries,
      ),
    ).toEqual([]);
  });

  it('passes other problems through', () => {
    const data = { sound: 'demo:missing' };
    const problem = unknown('/sound', 'demo:missing');
    expect(
      rewriteSoundEventProblems([problem], 'minecraft:jukebox_song', data, registries),
    ).toEqual([problem]);
    expect(rewriteSoundEventProblems([problem], 'msm:item', data, registries)).toEqual([problem]);
  });
});
