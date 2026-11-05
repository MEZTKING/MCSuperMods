import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, ElementKind, Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { kindFor, worldgenKinds } from '../src/index';
import { blockingProblems, indexesFor, sortedJson } from './support';

/** Set `UPDATE_GOLDENS=1` to rewrite the expected files instead of comparing. */
const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  kind: ElementKind;
  name: string;
  id: ResourceLocation;
  data: Json;
}

/** Every kind's default data, plus samples that reference project ids across kinds. */
const SAMPLES: Sample[] = [
  ...worldgenKinds.map((kind) => ({
    kind,
    name: 'default',
    id: 'example:sample' as const,
    data: kind.defaultData as Json,
  })),
  {
    kind: kindFor('worldgen/biome'),
    name: 'ruby_grove',
    id: 'example:ruby_grove',
    data: {
      has_precipitation: true,
      temperature: 0.6,
      downfall: 0.6,
      effects: { water_color: '#3f76e4', grass_color: 7979098 },
      carvers: 'minecraft:cave',
      features: [[], [], [], [], [], [], ['minecraft:ore_dirt', 'example:ruby_ore']],
    },
  },
  {
    kind: kindFor('worldgen/feature'),
    name: 'ruby_ore',
    id: 'example:ruby_ore',
    data: {
      type: 'minecraft:ore',
      size: 6,
      discard_chance_on_air_exposure: 0.5,
      targets: [
        {
          target: { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' },
          state: 'minecraft:redstone_ore',
        },
      ],
    },
  },
  {
    kind: kindFor('worldgen/placed_feature'),
    name: 'ruby_ore',
    id: 'example:ruby_ore',
    data: {
      feature: 'example:ruby_ore',
      placement: [
        { type: 'minecraft:count', count: 4 },
        { type: 'minecraft:in_square' },
        {
          type: 'minecraft:height_range',
          height: {
            type: 'minecraft:trapezoid',
            min_inclusive: { absolute: -32 },
            max_inclusive: { absolute: 32 },
          },
        },
        { type: 'minecraft:biome' },
      ],
    },
  },
  {
    kind: kindFor('dimension'),
    name: 'ruby_realm',
    id: 'example:ruby_realm',
    data: {
      type: 'minecraft:overworld',
      generator: {
        type: 'minecraft:noise',
        settings: 'minecraft:overworld',
        biome_source: { type: 'minecraft:fixed', biome: 'example:ruby_grove' },
      },
    },
  },
  {
    kind: kindFor('worldgen/density_function'),
    name: 'ruby_hills',
    id: 'example:ruby_hills',
    data: {
      type: 'minecraft:mul',
      left: { type: 'minecraft:noise', noise: 'example:ruby_noise', xz_scale: 1, y_scale: 0 },
      right: 0.5,
    },
  },
];

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, sample: Sample): URL =>
  new URL(`${targetId}/expected/${sample.kind.folder}/${sample.name}.json`, fixturesRoot);

const element = (sample: Sample): Element => ({
  formatVersion: 1,
  id: sample.id,
  kind: sample.kind.id,
  data: sample.data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  path: file.path,
  schema: file.schema,
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden lowering for %s',
  (targetId, bundle) => {
    it('covers every kind', () => {
      expect(new Set(SAMPLES.map((sample) => sample.kind.id))).toEqual(
        new Set(worldgenKinds.map((kind) => kind.id)),
      );
    });

    it.each(SAMPLES.map((sample) => [`${sample.kind.id} ${sample.name}`, sample] as const))(
      '%s',
      async (_label, sample) => {
        const files = await sample.kind.lower(element(sample), bundle.target);
        expect(files).toHaveLength(1);
        const [file] = files;
        if (file === undefined) throw new Error('no output');
        expect(file.schema).toBe(sample.kind.schema);
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, sample.kind.schema, sample.data)).toEqual([]);
        expect(blockingProblems(indexes, file.schema ?? '', file.contents as Json)).toEqual([]);

        const actual = sortedJson(recorded(file));
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
