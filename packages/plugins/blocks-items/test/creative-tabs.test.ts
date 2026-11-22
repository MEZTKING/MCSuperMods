/**
 * The `msm:creative_tab` kind (ADR 0096 D2; B456): lowering goldens under
 * `fixtures/<target id>/expected/creative_tab/<sample>.json` (`UPDATE_GOLDENS=1` rewrites
 * them), a project whose items, block items and spawn eggs join a project tab with zero schema
 * and validator problems on both targets, and one test per code
 * (`blocks-items.creative-tab-unknown`, `blocks-items.creative-tab-icon-unknown`).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, Json, Problem, ResourceLocation } from '@msm/plugin-api';
import { createRegistryIndex, validateJson } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCKS_ITEMS_PROBLEM_CODES,
  CREATIVE_TAB_BY_HAND,
  CREATIVE_TAB_PROBLEM_CODES,
  creativeTabDefinition,
  creativeTabKind,
  creativeTabPath,
  creativeTabTitleKey,
  lowerCreativeTab,
  projectItemIds,
} from '../src/index';
import { element, indexesFor, sortedJson, type TargetIndexes } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

type Id = `${string}:${string}`;

const tab = (id: Id, data: Record<string, unknown>): Element =>
  element('msm:creative_tab', id, { format: 1, ...data } as never);
const item = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:item', id, { format: 1, model: 'minecraft:item/stick', ...data } as never);
const block = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:block', id, { format: 1, model: 'minecraft:block/stone', ...data } as never);
const entity = (id: Id, data: Record<string, unknown> = {}): Element =>
  element('msm:entity', id, { format: 1, ...data } as never);

interface Sample {
  name: string;
  id: ResourceLocation;
  data: Json;
}

const SAMPLES: Sample[] = [
  { name: 'my_mod', id: 'demo:my_mod', data: creativeTabKind.defaultData as Json },
  {
    name: 'by_name',
    id: 'example:tabs/gems',
    data: { icon: 'example:ruby', order: 'by_name', display_name: 'Gems and stones' },
  },
  {
    name: 'own_title',
    id: 'example:tools',
    data: { icon: 'minecraft:iron_pickaxe', title: 'example.tab.tools', display_name: 'Tools' },
  },
  { name: 'no_name', id: 'example:plain', data: { format: 1, icon: 'minecraft:stone' } },
  {
    name: 'by_hand',
    id: 'example:tabs/kit',
    data: {
      icon: 'example:ruby',
      order: 'by_hand',
      items: ['example:ruby_block', 'minecraft:torch', 'example:ruby'],
      display_name: 'Starter kit',
    },
  },
  {
    name: 'items_unused',
    id: 'example:tabs/loose',
    data: { icon: 'minecraft:stone', order: 'by_name', items: ['minecraft:torch'] },
  },
];

/** The registries of `indexes` plus the project ids of these tests. */
const projectRegistries = (indexes: TargetIndexes) =>
  createRegistryIndex({
    vanilla: indexes.vanilla,
    project: {
      creative_mode_tab: ['example:tabs/gems', 'example:tools'],
      item: ['example:ruby', 'example:ruby_block'],
      block: ['example:ruby_block'],
      entity_type: ['example:golem'],
    },
  });

function blocking(indexes: TargetIndexes, schemaRef: string, value: Json) {
  const node = indexes.schemaIndex.resolveSchemaRef(schemaRef);
  return validateJson(value, node, { registries: projectRegistries(indexes) }).filter(
    (problem) => problem.severity === 'error' || problem.code === 'schema.unknown-id',
  );
}

describe('the msm:creative_tab kind', () => {
  it('lowers to the definition and the default title key', () => {
    const target = (builtInTargets[0] as TargetBundle).target;
    const files = lowerCreativeTab(
      tab('demo:tabs/magic', { icon: 'minecraft:amethyst_shard', display_name: 'Magic' }),
      target,
    );
    expect(files.map((file) => [file.path, file.layer, file.schema, file.merge])).toEqual([
      ['msm/demo/creative_tab/tabs/magic.json', 'msm', 'msm:creative_tab_definition', undefined],
      ['assets/demo/lang/en_us.json', 'resourcepack', '::java::assets::lang::Lang', 'object'],
    ]);
    expect(files[0]?.contents).toEqual({ format: 1, icon: 'minecraft:amethyst_shard' });
    expect(files[1]?.contents).toEqual({ 'itemGroup.demo.tabs.magic': 'Magic' });
    expect(creativeTabPath('a', 'b/c')).toBe('msm/a/creative_tab/b/c.json');
    expect(creativeTabTitleKey('a', 'b/c')).toBe('itemGroup.a.b.c');
    expect(
      creativeTabDefinition(
        tab('demo:x', { format: 3, icon: 'minecraft:stone', order: 'by_name' }),
      ),
    ).toEqual({ format: 1, icon: 'minecraft:stone', order: 'by_name' });
    expect(() => lowerCreativeTab(element('msm:creative_tab', 'demo:x', 'no'), target)).toThrow(
      /must be an object/,
    );
  });

  it('keeps the hand order only with by_hand (ADR 0111 D7)', () => {
    const items = ['demo:b', 'minecraft:torch', 'demo:a'];
    expect(
      creativeTabDefinition(tab('demo:x', { icon: 'minecraft:stone', order: 'by_hand', items })),
    ).toEqual({ format: 1, icon: 'minecraft:stone', order: 'by_hand', items });
    for (const order of [undefined, 'as_listed', 'by_name']) {
      expect(
        creativeTabDefinition(tab('demo:x', { icon: 'minecraft:stone', order, items })),
        String(order),
      ).not.toHaveProperty('items');
    }
    expect(CREATIVE_TAB_BY_HAND).toBe('by_hand');
  });

  it('lists its codes with the other blocks-items codes', () => {
    expect(BLOCKS_ITEMS_PROBLEM_CODES).toContain('blocks-items.creative-tab-unknown');
    expect(CREATIVE_TAB_PROBLEM_CODES).toEqual([
      'blocks-items.creative-tab-icon-unknown',
      'blocks-items.creative-tab-items-unused',
      'blocks-items.creative-tab-items-missing',
      'blocks-items.creative-tab-item-unknown',
      'blocks-items.creative-tab-item-repeated',
    ]);
  });

  it('counts items, block items, spawn eggs and vehicles as project items', () => {
    const ids = projectItemIds([
      item('demo:a'),
      block('demo:b'),
      block('demo:c', { item: false }),
      block('demo:seed_crop', { item: { id: 'demo:seeds' } }),
      entity('demo:golem'),
      entity('demo:ghost', { spawn_egg: false }),
      element('msm:vehicle', 'demo:cart', { format: 1 } as never),
    ]);
    expect([...ids].sort()).toEqual([
      'demo:a',
      'demo:b',
      'demo:cart',
      'demo:golem_spawn_egg',
      'demo:seeds',
    ]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'creative tabs on %s',
  (targetId, bundle: TargetBundle) => {
    async function validate(elements: Element[], vanilla = true): Promise<Problem[]> {
      const { registries } = await indexesFor(bundle);
      const registry = vanilla ? registries : createRegistryIndex({ vanilla: {} });
      const results = await Promise.all(
        (plugin.contributes.validators ?? []).map((validator) =>
          validator.validate({ elements, target: bundle.target, registry }),
        ),
      );
      return results.flat();
    }

    const withCode = (problems: Problem[], code: string) =>
      problems
        .filter((problem) => problem.code === `blocks-items.${code}`)
        .map((problem) => [problem.severity, problem.elementId, problem.path]);

    it.each(SAMPLES.map((sample) => [sample.name, sample] as const))(
      '%s lowers to the golden, valid against the schemas',
      async (name, sample) => {
        const indexes = await indexesFor(bundle);
        expect(blocking(indexes, creativeTabKind.schema, sample.data)).toEqual([]);
        const files = await creativeTabKind.lower(
          element('msm:creative_tab', sample.id, sample.data),
          bundle.target,
        );
        for (const file of files) {
          expect(
            blocking(indexes, file.schema as string, file.contents as Json),
            file.path,
          ).toEqual([]);
        }
        const actual = sortedJson(
          files.map((file) => ({
            contents: file.contents as Json,
            layer: file.layer,
            merge: file.merge ?? null,
            path: file.path,
            schema: file.schema ?? null,
          })),
        );
        const url = new URL(
          `./fixtures/${targetId}/expected/creative_tab/${name}.json`,
          import.meta.url,
        );
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );

    it('gives zero problems when items, block items and eggs join project tabs', async () => {
      const indexes = await indexesFor(bundle);
      const elements = [
        tab('example:tabs/gems', { icon: 'example:ruby', display_name: 'Gems' }),
        tab('example:tools', { icon: 'example:ruby_block', order: 'by_name' }),
        item('example:ruby', { creative_tab: 'example:tabs/gems' }),
        block('example:ruby_block', { item: { creative_tab: 'example:tools' } }),
        item('example:stick', { creative_tab: 'minecraft:ingredients' }),
      ];
      for (const entry of elements) {
        const schema = plugin.contributes.elementKinds?.find((kind) => kind.id === entry.kind)
          ?.schema as string;
        expect(blocking(indexes, schema, entry.data), entry.id).toEqual([]);
      }
      expect(await validate(elements)).toEqual([]);
    });

    it('creative-tab-unknown: items, block items and spawn eggs naming a missing project tab', async () => {
      const problems = await validate([
        tab('example:gems', { icon: 'minecraft:diamond' }),
        item('example:a', { creative_tab: 'example:gems' }),
        item('example:b', { creative_tab: 'example:missing' }),
        item('example:c', { creative_tab: 'minecraft:combat' }),
        item('example:d', { creative_tab: 'minecraft:not_a_tab' }),
        block('example:e', { item: { creative_tab: 'other:tab' } }),
        block('example:f', { item: false }),
        entity('example:g', { spawn_egg: { creative_tab: 'example:eggs' } }),
        entity('example:h', { spawn_egg: { creative_tab: 'example:gems' } }),
      ]);
      expect(withCode(problems, 'creative-tab-unknown')).toEqual([
        ['warning', 'example:b', '/creative_tab'],
        ['warning', 'example:e', '/item/creative_tab'],
        ['warning', 'example:g', '/spawn_egg/creative_tab'],
      ]);
    });

    it('creative-tab-icon-unknown: an icon that is no project or vanilla item', async () => {
      const elements = [
        tab('example:a', { icon: 'minecraft:diamond' }),
        tab('example:b', { icon: 'example:ruby' }),
        tab('example:c', { icon: 'example:golem_spawn_egg' }),
        tab('example:d', { icon: 'example:missing' }),
        tab('example:e', { icon: 'minecraft:not_an_item' }),
        tab('example:f', { icon: 'example:no_item_block' }),
        item('example:ruby'),
        entity('example:golem'),
        block('example:no_item_block', { item: false }),
      ];
      expect(withCode(await validate(elements), 'creative-tab-icon-unknown')).toEqual([
        ['warning', 'example:d', '/icon'],
        ['warning', 'example:e', '/icon'],
        ['warning', 'example:f', '/icon'],
      ]);
      // Without vanilla item ids only project ids are checked.
      expect(withCode(await validate(elements, false), 'creative-tab-icon-unknown')).toEqual([
        ['warning', 'example:d', '/icon'],
        ['warning', 'example:f', '/icon'],
      ]);
    });
    it('gives zero problems for a tab ordered by hand over project and vanilla items', async () => {
      const elements = [
        tab('example:kit', {
          icon: 'example:ruby',
          order: 'by_hand',
          items: [
            'example:ruby_block',
            'minecraft:torch',
            'example:golem_spawn_egg',
            'example:ruby',
          ],
        }),
        item('example:ruby'),
        block('example:ruby_block'),
        entity('example:golem'),
      ];
      expect(await validate(elements)).toEqual([]);
    });

    it('creative-tab-items-unused and -missing: a list without by_hand, by_hand without a list', async () => {
      const problems = await validate([
        tab('example:a', { icon: 'minecraft:stone', order: 'by_name', items: ['minecraft:torch'] }),
        tab('example:b', { icon: 'minecraft:stone', items: ['minecraft:torch'] }),
        tab('example:c', { icon: 'minecraft:stone', order: 'by_hand' }),
        tab('example:d', { icon: 'minecraft:stone', order: 'by_hand', items: [] }),
        tab('example:e', { icon: 'minecraft:stone', order: 'as_listed' }),
      ]);
      expect(withCode(problems, 'creative-tab-items-unused')).toEqual([
        ['warning', 'example:a', '/items'],
        ['warning', 'example:b', '/items'],
      ]);
      expect(withCode(problems, 'creative-tab-items-missing')).toEqual([
        ['warning', 'example:c', '/order'],
        ['warning', 'example:d', '/order'],
      ]);
    });

    it('creative-tab-item-unknown and -repeated: listed ids that are no item, or listed twice', async () => {
      const elements = [
        tab('example:kit', {
          icon: 'minecraft:stone',
          order: 'by_hand',
          items: [
            'minecraft:torch',
            'example:missing',
            'minecraft:not_an_item',
            'torch',
            'example:ruby',
            'example:ruby',
          ],
        }),
        item('example:ruby'),
      ];
      const problems = await validate(elements);
      expect(withCode(problems, 'creative-tab-item-unknown')).toEqual([
        ['warning', 'example:kit', '/items/1'],
        ['warning', 'example:kit', '/items/2'],
      ]);
      expect(withCode(problems, 'creative-tab-item-repeated')).toEqual([
        ['warning', 'example:kit', '/items/3'],
        ['warning', 'example:kit', '/items/5'],
      ]);
      // Without vanilla item ids only project ids are checked.
      expect(withCode(await validate(elements, false), 'creative-tab-item-unknown')).toEqual([
        ['warning', 'example:kit', '/items/1'],
      ]);
    });
  },
);
