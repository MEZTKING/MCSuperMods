import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, ElementKind, Json, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  blockDefinitionKind,
  itemDefinitionKind,
  langKind,
  modelKind,
  packMcmetaKind,
  soundsKind,
} from '../src/index';
import { indexesFor, schemaErrors, sortedJson } from './support';

/** Set `UPDATE_GOLDENS=1` to rewrite the expected files instead of comparing. */
const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  kind: ElementKind;
  name: string;
  id: ResourceLocation;
  data: Json;
}

const SAMPLES: Sample[] = [
  {
    kind: modelKind,
    name: 'block_model',
    id: 'example:block/ruby_ore',
    data: { parent: 'minecraft:block/cube_all', textures: { all: 'example:block/ruby_ore' } },
  },
  {
    kind: modelKind,
    name: 'item_model',
    id: 'example:item/ruby',
    data: { parent: 'minecraft:item/generated', textures: { layer0: 'example:item/ruby' } },
  },
  {
    kind: blockDefinitionKind,
    name: 'ruby_ore',
    id: 'example:ruby_ore',
    data: { variants: { '': { model: 'example:block/ruby_ore' } } },
  },
  {
    kind: itemDefinitionKind,
    name: 'ruby',
    id: 'example:ruby',
    data: { model: { type: 'model', model: 'example:item/ruby' } },
  },
  {
    kind: langKind,
    name: 'en_us',
    id: 'example:en_us',
    data: { 'block.example.ruby_ore': 'Ruby Ore', 'item.example.ruby': 'Ruby' },
  },
  {
    kind: soundsKind,
    name: 'sounds',
    id: 'example:sounds',
    data: {
      'block.ruby_ore.chime': {
        sounds: ['example:block/ruby_ore/chime1', { name: 'example:block/ruby_ore/chime2' }],
        subtitle: 'subtitles.example.block.ruby_ore.chime',
      },
    },
  },
  {
    kind: packMcmetaKind,
    name: 'pack',
    id: 'example:pack',
    data: { pack: { description: 'Example resources', pack_format: 1, supported_formats: [1, 2] } },
  },
];

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, sample: Sample): URL =>
  new URL(
    `${targetId}/expected/${sample.kind.id.replace(/^minecraft:/, '')}/${sample.name}.json`,
    fixturesRoot,
  );

const element = (sample: Sample): Element => ({
  formatVersion: 1,
  id: sample.id,
  kind: sample.kind.id,
  data: sample.data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((sample) => [`${sample.kind.id} ${sample.name}`, sample] as const))(
      '%s',
      async (_label, sample) => {
        const files = sample.kind.lower(element(sample), bundle.target);
        // `pack.mcmeta` lowers to one file per pack; every other kind to one resource file.
        const layers =
          sample.kind.id === packMcmetaKind.id ? ['resourcepack', 'datapack'] : ['resourcepack'];
        expect(files.map((file) => file.layer)).toEqual(layers);

        const indexes = await indexesFor(bundle);
        for (const file of files) {
          expect(file.schema).toBe(sample.kind.schema);
          expect(schemaErrors(indexes, file.schema ?? '', file.contents as Json)).toEqual([]);
        }

        const recorded = files.map((file) => ({
          contents: file.contents,
          layer: file.layer,
          path: file.path,
          schema: file.schema,
        }));
        // Single-file kinds keep the Phase 1 golden shape (one object, not an array).
        const actual = sortedJson(recorded.length === 1 ? recorded[0] : recorded);
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
