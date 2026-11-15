/**
 * Golden tests of lowering: every sample is lowered for every built-in target, the sample and
 * each output are validated against their schemas, and the outputs are compared with
 * `fixtures/<target id>/expected/<kind folder>/<sample>.json`. Set `UPDATE_GOLDENS=1` to
 * rewrite the expected files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementKind, Json, OutputFile } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  ControlsLoweringError,
  controlsKinds,
  hudKind,
  hudSpritePath,
  keyBindKind,
  keyBindNameKey,
  keyCategoryKey,
} from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  kind: ElementKind;
  name: string;
  id: string;
  data: Json;
}

const SAMPLES: Sample[] = [
  {
    kind: keyBindKind,
    name: 'default',
    id: 'demo:sample',
    data: keyBindKind.defaultData as Json,
  },
  {
    kind: keyBindKind,
    name: 'dash_full',
    id: 'example:abilities/dash',
    data: {
      format: 1,
      display_name: 'Dash',
      category: 'abilities/moves',
      category_name: 'Moves',
      default_key: 'key.mouse.4',
      when: 'driving',
      vehicle: 'demo:tank',
      cooldown_ticks: 40,
      hold_interval_ticks: 5,
      'msm:on_press': 'example:dash_press',
      'msm:on_release': 'example:dash_release',
      'msm:while_held': 'example:dash_held',
      events: {
        'example:dash_press': { actions: [{ type: 'launch', strength: 1 }] },
        'example:dash_release': {
          actions: [{ type: 'play_sound', sound: 'minecraft:entity.breeze.wind_burst' }],
        },
        'example:dash_held': { actions: [{ type: 'set_hud', hud: 'example:charge', value: 1 }] },
      },
    },
  },
  {
    kind: keyBindKind,
    name: 'named_unbound',
    id: 'example:horn',
    data: {
      display_name: 'Horn',
      name: 'example.controls.horn',
      default_key: 'key.keyboard.unknown',
    },
  },
  { kind: hudKind, name: 'default', id: 'demo:sample', data: hudKind.defaultData as Json },
  {
    kind: hudKind,
    name: 'bar_sprites',
    id: 'example:hud/fuel',
    data: {
      format: 1,
      type: 'bar',
      anchor: 'bottom_right',
      offset: [-8, -8],
      order: 2,
      value: { source: 'vehicle', stat: 'fuel' },
      max: { source: 'set' },
      show: 'in_vehicle',
      vehicle: 'demo:tank',
      size: [60, 6],
      sprite: 'demo:hud/mana',
      back_sprite: 'demo:hud/mana',
    },
  },
  {
    kind: hudKind,
    name: 'text_score',
    id: 'example:points',
    data: {
      type: 'text',
      anchor: 'top',
      value: { source: 'score', objective: 'points', holder: '@s' },
      text: 'Points: {value}',
      color: '#ffe060',
      shadow: false,
      starts_hidden: true,
    },
  },
  {
    kind: hudKind,
    name: 'icons',
    id: 'example:lives',
    data: {
      format: 1,
      type: 'icons',
      value: { source: 'data', scope: 'player', namespace: 'example', key: 'lives' },
      max: 10,
      icon: 'demo:hud/heart',
      half_icon: 'demo:hud/heart',
      empty_icon: 'demo:hud/heart',
      per_icon: 1,
      show: 'always',
    },
  },
];

const fixtureUrl = (targetId: string, sample: Sample): URL =>
  new URL(
    `./fixtures/${targetId}/expected/${sample.kind.folder}/${sample.name}.json`,
    import.meta.url,
  );

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden lowering for %s',
  (targetId, bundle) => {
    it('covers every kind', () => {
      expect(new Set(SAMPLES.map((sample) => sample.kind.id))).toEqual(
        new Set(controlsKinds.map((kind) => kind.id)),
      );
    });

    it.each(SAMPLES.map((sample) => [`${sample.kind.id} ${sample.name}`, sample] as const))(
      '%s',
      async (_label, sample) => {
        const created = element(sample.kind.id, sample.id, sample.data);
        const files = await sample.kind.lower(created, bundle.target);
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, sample.kind.schema, sample.data)).toEqual([]);
        for (const file of files) {
          if (file.schema === undefined) continue;
          expect(blockingProblems(indexes, file.schema, file.contents as Json), file.path).toEqual(
            [],
          );
        }
        expect(await sample.kind.lower(created, bundle.target)).toEqual(files);
        const actual = sortedJson(files.map(recorded));
        const url = fixtureUrl(targetId, sample);
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );
  },
);

describe('lowering details', () => {
  const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

  it('strips the element-only fields of key binds and keeps the rest', async () => {
    const [definition] = await keyBindKind.lower(
      element('msm:key_bind', 'demo:x', {
        display_name: 'X',
        category_name: 'Group',
        default_key: 'key.keyboard.k',
      }),
      target,
    );
    expect(definition?.contents).toEqual({ default_key: 'key.keyboard.k', format: 1 });
  });

  it('writes no language file without names', async () => {
    const files = await keyBindKind.lower(
      element('msm:key_bind', 'demo:x', { default_key: 'key.keyboard.k' }),
      target,
    );
    expect(files.map((file) => file.path)).toEqual(['msm/demo/key_bind/x.json']);
  });

  it('derives the language keys with dots for slashes', () => {
    expect(keyBindNameKey('demo:abilities/dash')).toBe('key.demo.abilities.dash');
    expect(keyBindNameKey('demo:dash', 'custom.key')).toBe('custom.key');
    expect(keyCategoryKey('demo')).toBe('key.category.demo.keys');
    expect(keyCategoryKey('demo', 'a/b')).toBe('key.category.demo.a.b');
  });

  it('maps sprite ids to GUI sprite pictures', () => {
    expect(hudSpritePath(target, 'demo:hud/mana')).toBe(
      'assets/demo/textures/gui/sprites/hud/mana.png',
    );
    expect(hudSpritePath(target, 'hud/heart')).toBe(
      'assets/minecraft/textures/gui/sprites/hud/heart.png',
    );
    expect(hudSpritePath(target, 'Bad:Id')).toBeUndefined();
  });

  it('refuses unsafe ids and data that is not an object', () => {
    expect(() => keyBindKind.lower(element('msm:key_bind', 'demo:../x', {}), target)).toThrow(
      ControlsLoweringError,
    );
    expect(() => hudKind.lower(element('msm:hud', 'demo:x', [] as Json), target)).toThrow(
      ControlsLoweringError,
    );
  });
});
