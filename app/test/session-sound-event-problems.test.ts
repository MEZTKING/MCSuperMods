import { createMemoryFileSystem, type Problem, type Project } from '@msm/core';
import { SEPARATE_RUNTIME_OPTION } from '@msm/exporters';
import type { Json } from '@msm/plugin-api';
import { createRegistryIndex, type SchemaProblem } from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import {
  rewriteSoundEventProblems,
  soundAwareRegistryIds,
  takesProjectSoundEvents,
  UNREGISTERED_SOUND_EVENT,
} from '../src/renderer/src/session/schema-context';
import { createCompletionSource } from '../src/renderer/src/studios/completions';
import { newSession } from './session-fixture';

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

  it('never rewrites MSM kinds: their kind-aware view accepts project keys (ADR 0057 D3)', () => {
    // Only a view without the kind reports the key; the sound_id advice does not apply.
    const data = { sound: 'demo:music_disc.my_song' };
    const problem = unknown('/sound', 'demo:music_disc.my_song');
    expect(rewriteSoundEventProblems([problem], 'msm:item', data, registries)).toEqual([problem]);
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

describe('soundAwareRegistryIds and takesProjectSoundEvents (ADR 0057 D3)', () => {
  it('adds the project event keys to sound_event for MSM kinds only', () => {
    expect(takesProjectSoundEvents('msm:item')).toBe(true);
    expect(takesProjectSoundEvents('msm:effect')).toBe(true);
    expect(takesProjectSoundEvents('minecraft:jukebox_song')).toBe(false);
    const ids = { weighed_sound_event: ['demo:b', 'demo:a'], item: ['demo:ruby'] };
    expect(soundAwareRegistryIds(ids)).toEqual({
      item: ['demo:ruby'],
      sound_event: ['demo:a', 'demo:b'],
      weighed_sound_event: ['demo:b', 'demo:a'],
    });
    expect(soundAwareRegistryIds({ item: ['demo:ruby'] })).toEqual({ item: ['demo:ruby'] });
  });
});

describe('ProjectSession: project sound keys in MSM kinds (ADR 0057 D3)', () => {
  const KEY = 'demo:chime.ring';
  const SOUNDS = { 'chime.ring': { sounds: ['minecraft:random/orb'] } };

  async function sessionWith(withSounds: boolean) {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    if (withSounds)
      session.addElement({ id: 'demo:sounds', kind: 'minecraft:sounds', data: SOUNDS });
    session.addElement({
      id: 'demo:tonic',
      kind: 'msm:item',
      data: {
        format: 1,
        display_name: 'Tonic',
        components: {
          'msm:consumable': { seconds: 1, sound: KEY },
          'msm:components': {
            'minecraft:equippable': { slot: 'head', equip_sound: KEY },
          },
        },
      },
    });
    session.addElement({
      id: 'demo:rush',
      kind: 'msm:effect',
      data: { format: 1, display_name: 'Rush', category: 'beneficial', color: 1, sound: KEY },
    });
    session.addElement({
      id: 'demo:song',
      kind: 'minecraft:jukebox_song',
      data: { sound_event: KEY, description: 'Song', length_in_seconds: 10, comparator_output: 1 },
    });
    await session.flushValidation();
    return session;
  }

  const ITEM_PATHS = [
    '/components/msm:consumable/sound',
    '/components/msm:components/minecraft:equippable/equip_sound',
  ];
  const soundProblems = (problems: readonly Problem[], paths: readonly string[]) =>
    problems.filter((problem) => problem.path !== undefined && paths.includes(problem.path));

  it('validates a project key in an msm:item (own component and passthrough) and an msm:effect', async () => {
    const session = await sessionWith(true);
    expect(soundProblems(session.problemsFor('demo:tonic'), ITEM_PATHS)).toEqual([]);
    expect(soundProblems(session.problemsFor('demo:rush'), ['/sound'])).toEqual([]);
  }, 60_000);

  it('keeps a bare project key in a minecraft:jukebox_song an unregistered sound event', async () => {
    const session = await sessionWith(true);
    expect(session.problemsFor('demo:song')).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: UNREGISTERED_SOUND_EVENT,
        path: '/sound_event',
      }),
    ]);
  }, 60_000);

  it('still warns about an unknown key in MSM kinds', async () => {
    const session = await sessionWith(false);
    const found = soundProblems(session.problemsFor('demo:tonic'), ITEM_PATHS);
    expect(found.map((problem) => [problem.path, problem.code]).sort()).toEqual(
      ITEM_PATHS.map((path) => [path, 'schema.unknown-id']).sort(),
    );
    expect(soundProblems(session.problemsFor('demo:rush'), ['/sound'])).toEqual([
      expect.objectContaining({ code: 'schema.unknown-id', severity: 'warning' }),
    ]);
  }, 60_000);

  it('completes a project key first in MSM kinds and not in vanilla kinds', async () => {
    const session = await sessionWith(true);
    const project = session.snapshot.project as Project;
    const context = await session.schemas();
    const msm = context.registries(project, 'msm:item');
    const vanilla = context.registries(project, 'minecraft:jukebox_song');
    expect(msm.has('sound_event', KEY)).toBe(true);
    expect(vanilla.has('sound_event', KEY)).toBe(false);
    expect(context.registries(project)).toBe(vanilla);
    // Memoised per project ids.
    expect(context.registries(project, 'msm:effect')).toBe(msm);

    const item = createCompletionSource(project, msm);
    expect(item.suggest('sound_event', '')[0]).toBe(KEY);
    expect(item.suggest('sound_event', 'chime')).toEqual([KEY]);
    expect(item.suggest('sound_event', 'block.amethyst_block.ch')).toContain(
      'minecraft:block.amethyst_block.chime',
    );
    const song = createCompletionSource(project, vanilla);
    expect(song.suggest('sound_event', '')).not.toContain(KEY);
    expect(song.suggest('sound_event', 'chime')).toEqual([]);
  }, 60_000);
});

describe('ProjectSession export gate: project sound keys in output files (ADR 0057 D3)', () => {
  const KEY = 'demo:chime.ring';
  const SOUNDS = { 'chime.ring': { sounds: ['minecraft:random/orb'] } };

  async function sessionWith(elements: { id: `${string}:${string}`; kind: string; data: Json }[]) {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    session.addElement({ id: 'demo:sounds', kind: 'minecraft:sounds', data: SOUNDS });
    for (const element of elements) session.addElement(element);
    await session.flushValidation();
    return session;
  }

  const soundProblems = (problems: readonly Problem[]) =>
    problems.filter(
      (problem) =>
        problem.code === 'schema.unknown-id' || problem.code === UNREGISTERED_SOUND_EVENT,
    );

  it('accepts a project key in msm:item and msm:entity definitions', async () => {
    const session = await sessionWith([
      {
        id: 'demo:tonic',
        kind: 'msm:item',
        data: {
          format: 1,
          display_name: 'Tonic',
          components: { 'msm:consumable': { seconds: 1, animation: 'drink', sound: KEY } },
        },
      },
      {
        id: 'demo:critter',
        kind: 'msm:entity',
        data: {
          format: 1,
          display_name: 'Critter',
          category: 'creature',
          size: { width: 0.6, height: 0.6 },
          spawn_egg: false,
          sounds: { ambient: KEY, hurt: KEY, death: KEY, step: KEY },
          components: {
            'msm:health': { max: 8 },
            'msm:animated_model': {
              model: 'demo:entity/critter',
              animations: 'demo:entity/critter_animations',
              texture: 'demo:entity/critter',
            },
          },
        },
      },
    ]);
    const result = await session.exportFabricJar({ [SEPARATE_RUNTIME_OPTION]: true });
    const paths = [
      '/components/msm:consumable/sound',
      '/sounds/ambient',
      '/sounds/hurt',
      '/sounds/death',
      '/sounds/step',
    ];
    const msmFiles = result.problems.filter((problem) => problem.file?.startsWith('msm/'));
    expect(msmFiles.filter((problem) => paths.includes(problem.path ?? ''))).toEqual([]);
    expect(soundProblems(result.problems)).toEqual([]);
  }, 60_000);

  it('keeps a bare project key in a jukebox_song an unregistered sound event', async () => {
    const session = await sessionWith([
      {
        id: 'demo:song',
        kind: 'minecraft:jukebox_song',
        data: {
          sound_event: KEY,
          description: 'Song',
          length_in_seconds: 10,
          comparator_output: 1,
        },
      },
    ]);
    const result = await session.exportPack('data', 'zip');
    expect(result.ok).toBe(false);
    expect(soundProblems(result.problems)).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: UNREGISTERED_SOUND_EVENT,
        file: 'data/demo/jukebox_song/song.json',
        path: '/sound_event',
      }),
    ]);
  }, 60_000);
});
