/**
 * Golden tests of lowering: every sample is lowered for every built-in target, each output is
 * validated against the schema it declares, and the outputs are compared with
 * `fixtures/<target id>/expected/<kind folder>/<sample>.json`. Set `UPDATE_GOLDENS=1` to
 * rewrite the expected files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementKind, Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { animationKind, geoModelKind, modelsAnimKinds } from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  kind: ElementKind;
  name: string;
  id: ResourceLocation;
  data: Json;
}

/** Every kind's default data, plus samples covering the optional fields of both formats. */
const SAMPLES: Sample[] = [
  ...modelsAnimKinds.map((kind) => ({
    kind,
    name: 'default',
    id: 'demo:entity/sample' as ResourceLocation,
    data: kind.defaultData as Json,
  })),
  {
    kind: geoModelKind,
    name: 'golem',
    id: 'example:entity/golem',
    data: {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: {
            identifier: 'geometry.golem',
            texture_width: 64,
            texture_height: 32,
            visible_bounds_width: 3,
            visible_bounds_height: 3.5,
            visible_bounds_offset: [0, 1.25, 0],
          },
          bones: [
            {
              name: 'body',
              pivot: [0, 12, 0],
              mirror: false,
              inflate: 0.1,
              cubes: [
                { origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] },
                {
                  origin: [-2, 20, -3],
                  size: [4, 2, 1],
                  pivot: [0, 21, -2.5],
                  rotation: [15, 0, 0],
                  inflate: 0.25,
                  uv: {
                    north: { uv: [0, 0], uv_size: [4, 2] },
                    south: { uv: [4, 0], uv_size: [-4, 2], uv_rotation: 180 },
                    up: { uv: [8, 2], uv_size: [-4, -1], material_instance: 'main' },
                  },
                },
              ],
              locators: { chest: [0, 20, -2], hand: { offset: [5, 14, 0], rotation: [0, 90, 0] } },
            },
            {
              name: 'head',
              parent: 'body',
              pivot: [0, 24, 0],
              rotation: [-5, 0, 0],
              cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0], mirror: true }],
            },
          ],
        },
      ],
    },
  },
  {
    kind: geoModelKind,
    name: 'numeric_format_version',
    id: 'example:entity/old',
    data: {
      format_version: 1.12,
      'minecraft:geometry': [
        { description: { identifier: 'geometry.old', texture_width: 16, texture_height: 16 } },
      ],
    },
  },
  {
    kind: animationKind,
    name: 'golem_animations',
    id: 'example:entity/golem_animations',
    data: {
      format_version: '1.8.0',
      animations: {
        attack: {
          animation_length: 0.5,
          override_previous_animation: true,
          bones: {
            body: {
              rotation: {
                '0.0': { post: [0, 0, 0], lerp_mode: 'catmullrom' },
                '0.25': { pre: [-20, 0, 0], post: [-25, 0, 0] },
                '0.5': [0, 0, 0],
              },
            },
          },
          sound_effects: { '0.25': { effect: 'attack' } },
        },
        idle: {
          loop: true,
          animation_length: 2,
          start_delay: 0.1,
          loop_delay: 'math.random(0, 1)',
          blend_weight: 1,
          bones: {
            head: { rotation: [0, 'math.sin(query.anim_time * 180) * 5', 0], scale: 1 },
          },
        },
        stand: {
          loop: 'hold_on_last_frame',
          bones: { body: { position: { '0.0': 0, '1.0': 2 } } },
        },
      },
    },
  },
];

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, sample: Sample): URL =>
  new URL(`${targetId}/expected/${sample.kind.folder}/${sample.name}.json`, fixturesRoot);

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
        new Set(modelsAnimKinds.map((kind) => kind.id)),
      );
    });

    it.each(SAMPLES.map((sample) => [`${sample.kind.id} ${sample.name}`, sample] as const))(
      '%s',
      async (_label, sample) => {
        const files = await sample.kind.lower(
          element(sample.kind.id, sample.id, sample.data),
          bundle.target,
        );
        const indexes = await indexesFor(bundle);
        const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
        if (typeof (sample.data as { format_version?: Json }).format_version === 'string') {
          expect(problems(sample.kind.schema, sample.data)).toEqual([]);
        }
        for (const file of files) {
          expect(file.schema, file.path).toBeDefined();
          expect(problems(file.schema as string, file.contents as Json), file.path).toEqual([]);
        }
        expect(
          await sample.kind.lower(element(sample.kind.id, sample.id, sample.data), bundle.target),
        ).toEqual(files);

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
