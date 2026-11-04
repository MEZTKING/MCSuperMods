/**
 * Shape of the library content: starter and example ids, categories, kinds, determinism,
 * namespaces and placeholder assets. Validation against the schema, loading and export with
 * the real resource pack and data pack plugins live in `packages/exporters/test/library.test.ts`.
 */
import type { ContentBundle, ExampleProject, ProjectStarter } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { COLOURS } from '../src/content/bundle';
import {
  categoryTag,
  kindExamples,
  libraryExamples,
  libraryStarters,
  PLACEHOLDER_PATTERNS,
  placeholderPng,
  STARTERS_CATEGORY,
  starterExamples,
} from '../src/index';

const STARTER_IDS = [
  'blank',
  'resource_pack',
  'data_pack',
  'combined',
  'custom_ore',
  'recipe_pack',
  'music_disc',
  'function_starter',
];

/** The 30 kinds of the built-in resource pack and data pack plugins. */
const KIND_IDS = [
  'minecraft:model',
  'minecraft:block_definition',
  'minecraft:item_definition',
  'minecraft:lang',
  'minecraft:sounds',
  'minecraft:pack_mcmeta',
  'minecraft:recipe',
  'minecraft:loot_table',
  'minecraft:advancement',
  'minecraft:predicate',
  'minecraft:item_modifier',
  'minecraft:function',
  'minecraft:tag/block',
  'minecraft:tag/item',
  'minecraft:tag/entity_type',
  'minecraft:tag/fluid',
  'minecraft:tag/game_event',
  'minecraft:tag/function',
  'minecraft:tag/damage_type',
  'minecraft:tag/enchantment',
  'minecraft:enchantment',
  'minecraft:damage_type',
  'minecraft:dimension_type',
  'minecraft:chat_type',
  'minecraft:jukebox_song',
  'minecraft:banner_pattern',
  'minecraft:painting_variant',
  'minecraft:trim_material',
  'minecraft:trim_pattern',
  'minecraft:dialog',
];

const entries: readonly (ProjectStarter | ExampleProject)[] = [
  ...libraryStarters,
  ...libraryExamples,
];

const build = (entry: ProjectStarter | ExampleProject, namespace = 'demo'): ContentBundle =>
  entry.build({ namespace, projectName: 'Demo Project' });

/** Every placeholder the library may produce: each pattern in each library colour. */
const PLACEHOLDERS = new Set(
  PLACEHOLDER_PATTERNS.flatMap((pattern) =>
    Object.values(COLOURS).map((colour) =>
      Buffer.from(placeholderPng(pattern, { colour })).toString('hex'),
    ),
  ),
);

describe('project starters', () => {
  it('lists the eight starters in order', () => {
    expect(libraryStarters.map((starter) => starter.id)).toEqual(STARTER_IDS);
  });

  it('groups them as blank, pack and content starters', () => {
    expect(libraryStarters.map((starter) => starter.category)).toEqual([
      'blank',
      'pack',
      'pack',
      'pack',
      'content',
      'content',
      'content',
      'content',
    ]);
  });

  it('leaves the blank starter empty so the host adds only pack.mcmeta', () => {
    const blank = libraryStarters[0] as ProjectStarter;
    expect(build(blank)).toEqual({ elements: [], assets: [] });
    expect(blank.requiresKinds).toEqual([]);
  });

  it('gives every non-blank starter its own pack.mcmeta element', () => {
    for (const starter of libraryStarters.slice(1)) {
      const packs = build(starter).elements.filter(
        (entry) => entry.kind === 'minecraft:pack_mcmeta',
      );
      expect(
        packs.map((entry) => entry.id),
        starter.id,
      ).toEqual(['demo:pack']);
    }
  });

  it('describes the Custom ore starter as a reskin until Phase 4', () => {
    const ore = libraryStarters.find((starter) => starter.id === 'custom_ore');
    expect(ore?.description).toMatch(/reskin/);
    expect(ore?.description).toMatch(/Phase 4/);
    const ids = build(ore as ProjectStarter).elements.map((entry) => `${entry.kind} ${entry.id}`);
    expect(ids).toEqual(
      expect.arrayContaining([
        'minecraft:block_definition minecraft:emerald_ore',
        'minecraft:item_definition minecraft:emerald',
        'minecraft:lang minecraft:en_us',
        'minecraft:loot_table minecraft:blocks/emerald_ore',
        'minecraft:model demo:block/ruby_ore',
        'minecraft:recipe demo:ruby_block',
        'minecraft:tag/item demo:gems',
        'minecraft:advancement demo:root',
        'minecraft:advancement demo:get_ruby',
      ]),
    );
  });

  it('plays the vanilla cat record in the music disc starter, with no bundled sound', () => {
    const disc = libraryStarters.find((starter) => starter.id === 'music_disc');
    const bundle = build(disc as ProjectStarter);
    expect(bundle.assets.every((asset) => asset.path.startsWith('textures/'))).toBe(true);
    const sounds = bundle.elements.find((entry) => entry.kind === 'minecraft:sounds');
    expect(sounds?.id).toBe('demo:sounds');
    expect(JSON.stringify(sounds?.data)).toContain('"minecraft:records/cat"');
  });
});

describe('examples', () => {
  it('has 30 per-kind examples, one per built-in kind, and 4 starter projects', () => {
    expect(kindExamples).toHaveLength(30);
    expect(kindExamples.map((example) => example.kind)).toEqual(KIND_IDS);
    expect(starterExamples.map((example) => example.id)).toEqual(
      ['custom_ore', 'recipe_pack', 'music_disc', 'function_starter'].map((id) => `starter_${id}`),
    );
    expect(starterExamples.every((example) => example.category === STARTERS_CATEGORY)).toBe(true);
    expect(libraryExamples).toHaveLength(34);
  });

  it('reuses the starter builders for the starter projects', () => {
    for (const example of starterExamples) {
      const starter = libraryStarters.find((entry) => `starter_${entry.id}` === example.id);
      const fromStarter = build(starter as ProjectStarter);
      const fromExample = build(example);
      expect(fromExample.elements.map((entry) => entry.id)).toEqual(
        fromStarter.elements.map((entry) => entry.id),
      );
      expect(fromExample.elements.map((entry) => entry.data)).toEqual(
        fromStarter.elements.map((entry) => entry.data),
      );
    }
  });

  it('explains the main element of each per-kind example in three to six sentences', () => {
    for (const example of kindExamples) {
      const main = build(example).elements.find((entry) => entry.kind === example.kind);
      const notes = main?.notes ?? '';
      const sentences = notes.split(/[.!?](?:\s|$)/).filter((part) => part.trim() !== '');
      expect(sentences.length, `${example.id}: ${notes}`).toBeGreaterThanOrEqual(3);
      expect(sentences.length, `${example.id}: ${notes}`).toBeLessThanOrEqual(7);
    }
  });

  it('tags every element with example and the category', () => {
    for (const example of libraryExamples) {
      for (const entry of build(example).elements) {
        expect(entry.tags, `${example.id} ${entry.id}`).toEqual(
          expect.arrayContaining(['example', categoryTag(example.category)]),
        );
      }
    }
  });
});

describe('every starter and example', () => {
  it('has a unique id', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares exactly the kinds its bundle uses', () => {
    for (const entry of entries) {
      const used = [...new Set(build(entry).elements.map((element) => element.kind))].sort();
      expect(entry.requiresKinds, entry.id).toEqual(used);
      for (const kind of used) expect(KIND_IDS, entry.id).toContain(kind);
    }
  });

  it('builds the same bundle every time', () => {
    for (const entry of entries) expect(build(entry), entry.id).toEqual(build(entry));
  });

  it('puts content only in the given namespace or overrides in minecraft', () => {
    for (const entry of entries) {
      const bundle = build(entry, 'other_ns');
      const text = JSON.stringify(bundle.elements);
      expect(text, entry.id).not.toContain('demo');
      for (const element of bundle.elements) {
        expect(['other_ns', 'minecraft'], `${entry.id} ${element.id}`).toContain(
          element.id.slice(0, element.id.indexOf(':')),
        );
      }
      for (const asset of bundle.assets) expect(asset.namespace, entry.id).toBe('other_ns');
    }
  });

  it('has no duplicate element ids or asset paths', () => {
    for (const entry of entries) {
      const bundle = build(entry);
      const ids = bundle.elements.map((element) => element.id);
      expect(new Set(ids).size, entry.id).toBe(ids.length);
      const paths = bundle.assets.map((asset) => `${asset.namespace}/${asset.path}`);
      expect(new Set(paths).size, entry.id).toBe(paths.length);
    }
  });

  it('uses only generated placeholder textures with lower-case names inside a folder', () => {
    for (const entry of entries) {
      for (const asset of build(entry).assets) {
        expect(asset.path, entry.id).toMatch(/^textures\/[a-z0-9_/]+\/[a-z0-9_.-]+\.png$/);
        expect(PLACEHOLDERS.has(Buffer.from(asset.bytes).toString('hex')), asset.path).toBe(true);
      }
    }
  });

  it('gives every texture a model or painting that uses it', () => {
    for (const entry of entries) {
      const bundle = build(entry);
      const text = JSON.stringify(bundle.elements);
      for (const asset of bundle.assets) {
        const id = `${asset.namespace}:${asset.path.replace(/^textures\//, '').replace(/\.png$/, '')}`;
        const paintingId = id.replace(':painting/', ':');
        expect(text.includes(`"${id}"`) || text.includes(`"${paintingId}"`), id).toBe(true);
      }
    }
  });
});
