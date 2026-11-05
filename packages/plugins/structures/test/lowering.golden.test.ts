import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, ElementKind, Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  processorListKind,
  readNbt,
  structureKind,
  structureKinds,
  structureSetKind,
  structureTemplateFromNbt,
  structureTemplateKind,
  templatePoolKind,
} from '../src/index';
import { blockingProblems, indexesFor, sortedJson } from './support';

/** Set `UPDATE_GOLDENS=1` to rewrite the expected files instead of comparing. */
const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  kind: ElementKind;
  name: string;
  id: ResourceLocation;
  data: Json;
}

/** A small synthetic hut piece: floor, a chest with items, a jigsaw and an armour stand. */
export const HUT: Json = {
  size: [3, 2, 3],
  palette: [
    'minecraft:cobblestone',
    'minecraft:chest[facing=south,type=single,waterlogged=false]',
    'minecraft:jigsaw[orientation=north_up]',
    'minecraft:air',
  ],
  blocks: [
    [0, 0, 0, 0],
    [1, 0, 0, 2],
    [2, 0, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 0],
    [2, 0, 1, 0],
    [0, 0, 2, 0],
    [1, 0, 2, 0],
    [2, 0, 2, 0],
    [0, 1, 1, 3],
    [1, 1, 1, 1],
  ],
  block_entities: [
    {
      pos: [1, 1, 1],
      nbt: '{Items:[{Slot:0b,id:"minecraft:bread",count:3},{Slot:1b,id:"minecraft:torch",count:8}],id:"minecraft:chest"}',
    },
  ],
  jigsaws: [
    {
      pos: [1, 0, 0],
      pool: 'example:streets',
      name: 'example:entrance',
      target: 'example:street',
      final_state: 'minecraft:cobblestone',
      joint: 'aligned',
      placement_priority: 0,
      selection_priority: 0,
    },
  ],
  entities: [
    {
      pos: [0.5, 1.0, 2.5],
      block_pos: [0, 1, 2],
      nbt: '{id:"minecraft:armor_stand",Rotation:[180.0f,0.0f],ShowArms:1b}',
    },
  ],
};

const SAMPLES: Sample[] = [
  { kind: structureTemplateKind, name: 'hut', id: 'example:hut', data: HUT },
  {
    kind: templatePoolKind,
    name: 'streets',
    id: 'example:streets',
    data: {
      fallback: 'minecraft:empty',
      elements: [
        {
          weight: 3,
          element: {
            element_type: 'minecraft:single_pool_element',
            location: 'example:path',
            processors: 'example:weathered',
            projection: 'terrain_matching',
          },
        },
        {
          weight: 1,
          element: {
            element_type: 'minecraft:list_pool_element',
            elements: [
              {
                element_type: 'minecraft:single_pool_element',
                location: 'example:hut',
                processors: 'minecraft:empty',
                projection: 'rigid',
              },
            ],
            projection: 'rigid',
          },
        },
        { weight: 1, element: { element_type: 'minecraft:empty_pool_element' } },
      ],
    },
  },
  {
    kind: structureKind,
    name: 'village',
    id: 'example:village',
    data: {
      type: 'minecraft:jigsaw',
      biomes: '#minecraft:is_forest',
      step: 'surface_structures',
      spawn_overrides: {},
      terrain_adaptation: 'beard_thin',
      start_pool: 'example:centre',
      size: 5,
      start_height: { absolute: 0 },
      project_start_to_heightmap: 'WORLD_SURFACE_WG',
      max_distance_from_center: 80,
      use_expansion_hack: false,
    },
  },
  {
    kind: structureSetKind,
    name: 'village',
    id: 'example:village',
    data: {
      structures: [{ structure: 'example:village', weight: 1 }],
      placement: { type: 'minecraft:random_spread', spacing: 34, separation: 8, salt: 20_241_104 },
    },
  },
  {
    kind: processorListKind,
    name: 'weathered',
    id: 'example:weathered',
    data: {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            {
              input_predicate: {
                predicate_type: 'minecraft:random_block_match',
                block: 'minecraft:cobblestone',
                probability: 0.3,
              },
              location_predicate: { predicate_type: 'minecraft:always_true' },
              output_state: 'minecraft:mossy_cobblestone',
            },
          ],
        },
      ],
    },
  },
];

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const element = (sample: Sample): Element => ({
  formatVersion: 1,
  id: sample.id,
  kind: sample.kind.id,
  data: sample.data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

async function golden(url: URL, actual: Uint8Array | string): Promise<void> {
  if (UPDATE) {
    await mkdir(dirname(fileURLToPath(url)), { recursive: true });
    await writeFile(url, actual);
  }
  if (typeof actual === 'string') expect(actual).toBe(await readFile(url, 'utf8'));
  else expect(Buffer.from(actual).equals(await readFile(url))).toBe(true);
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden lowering for %s',
  (targetId, bundle) => {
    it('covers every kind', () => {
      expect(new Set(SAMPLES.map((sample) => sample.kind.id))).toEqual(
        new Set(structureKinds.map((kind) => kind.id)),
      );
    });

    it.each(SAMPLES.map((sample) => [`${sample.kind.id} ${sample.name}`, sample] as const))(
      '%s',
      async (_label, sample) => {
        const indexes = await indexesFor(bundle);
        expect(blockingProblems(indexes, sample.kind.schema, sample.data)).toEqual([]);
        const files = await sample.kind.lower(element(sample), bundle.target);
        expect(files).toHaveLength(1);
        const [file] = files as [OutputFile];
        expect(file.layer).toBe('datapack');

        if (sample.kind === structureTemplateKind) {
          const folder = bundle.target.folders.data.structure;
          expect(file.path).toBe(`data/example/${folder}/${sample.name}.nbt`);
          expect(file.schema).toBeUndefined();
          expect(file.contents).toBeInstanceOf(Uint8Array);
          const bytes = file.contents as Uint8Array;
          expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
          // Deterministic: lowering twice gives the same bytes.
          expect((await sample.kind.lower(element(sample), bundle.target))[0]?.contents).toEqual(
            bytes,
          );
          const url = new URL(
            `${targetId}/expected/${sample.kind.folder}/${sample.name}.nbt`,
            fixturesRoot,
          );
          await golden(url, bytes);
          const { root } = readNbt(new Uint8Array(await readFile(url)));
          expect(root.getNumber('DataVersion')).toBe(bundle.target.dataVersion);
          expect(structureTemplateFromNbt(root).data).toEqual(sample.data);
          return;
        }

        const worldgen = bundle.target.folders.data.worldgen;
        expect(file.path).toBe(
          `data/example/${worldgen}/${sample.kind.folder.slice('worldgen/'.length)}/${sample.name}.json`,
        );
        expect(file.schema).toBe(sample.kind.schema);
        expect(blockingProblems(indexes, file.schema ?? '', file.contents as Json)).toEqual([]);
        const url = new URL(
          `${targetId}/expected/${sample.kind.folder}/${sample.name}.json`,
          fixturesRoot,
        );
        await golden(
          url,
          sortedJson({ contents: file.contents, path: file.path, schema: file.schema }),
        );
      },
    );
  },
);
