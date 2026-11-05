import { API_VERSION, type ElementKind, type Json, type Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  BLOCK_TOOLS,
  BlocksItemsLoweringError,
  blockDefinition,
  blocksItemsKinds,
  blocksItemsTemplates,
  blocksItemsValidators,
  descriptionKey,
  incorrectForTierTag,
  itemDefinition,
  lowerBlock,
  lowerItem,
  lowerMod,
  NEEDS_TIER_TAGS,
  needsTierTag,
  splitResourceLocation,
  TOOL_TIERS,
} from '../src/index';
import { blockingProblems, element, indexesFor } from './support';

const KIND_IDS = ['msm:block', 'msm:item', 'msm:mod'];
const kinds = (): ElementKind[] => plugin.contributes.elementKinds ?? [];
const firstTarget = (builtInTargets[0] as TargetBundle).target;

/** What `registerPlugin` in `@msm/core` checks (core is not a dependency of this package). */
function registrationProblems(): string[] {
  const problems: string[] = [];
  const [major, minor] = API_VERSION.split('.');
  if (plugin.apiVersion !== `^${major}.${minor}.0`) problems.push(`range ${plugin.apiVersion}`);
  const ids = new Set<string>();
  const folders = new Set<string>();
  for (const kind of kinds()) {
    if (ids.has(kind.id)) problems.push(`duplicate id ${kind.id}`);
    if (folders.has(kind.folder)) problems.push(`duplicate folder ${kind.folder}`);
    ids.add(kind.id);
    folders.add(kind.folder);
  }
  return problems;
}

describe('@msm/plugin-blocks-items', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.blocks-items');
    expect(plugin.apiVersion).toBe('^0.7.0');
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(registrationProblems()).toEqual([]);
  });

  it('contributes the three kinds with their schemas, folders and registries', () => {
    expect(kinds().map((kind) => kind.id)).toEqual(KIND_IDS);
    expect(blocksItemsKinds.map((kind) => kind.id)).toEqual(KIND_IDS);
    expect(kinds().map((kind) => [kind.schema, kind.folder, kind.registry])).toEqual([
      [MSM_SCHEMA_REFS.block, 'block', 'block'],
      [MSM_SCHEMA_REFS.item, 'item', 'item'],
      [MSM_SCHEMA_REFS.mod, 'mod', undefined],
    ]);
  });

  it('contributes its templates and the six validators', () => {
    expect(plugin.contributes.elementTemplates?.map((t) => t.id)).toEqual(
      blocksItemsTemplates.map((t) => t.id),
    );
    expect(plugin.contributes.validators?.map((v) => v.id)).toEqual([
      'msm.blocks-items.missing-model',
      'msm.blocks-items.unknown-event',
      'msm.blocks-items.event-cycle',
      'msm.blocks-items.mod-id',
      'msm.blocks-items.tool-tier',
      'msm.blocks-items.item-collision',
    ]);
    expect(blocksItemsValidators).toHaveLength(6);
  });

  it('rejects unsafe ids and non-object data', () => {
    expect(() => splitResourceLocation('Bad:Id')).toThrow(BlocksItemsLoweringError);
    expect(() => splitResourceLocation('demo:a/../b')).toThrow(BlocksItemsLoweringError);
    expect(() => lowerBlock(element('msm:block', 'demo:a', []), firstTarget)).toThrow(
      BlocksItemsLoweringError,
    );
    expect(() => lowerItem(element('msm:item', 'demo:a', 'x'), firstTarget)).toThrow(
      BlocksItemsLoweringError,
    );
    expect(() => lowerMod(element('msm:mod', 'demo:mod', { mod_id: 'a' }), firstTarget)).toThrow(
      BlocksItemsLoweringError,
    );
  });

  it('refuses fabric.mod.json for a target without Fabric facts', () => {
    const { fabric: _fabric, ...rest } = firstTarget;
    const noFabric: Target = rest;
    expect(() =>
      lowerMod(element('msm:mod', 'demo:mod', { mod_id: 'demo', version: '1' }), noFabric),
    ).toThrow(/no Fabric facts/);
  });

  it('writes description ids with dots for path separators', () => {
    expect(descriptionKey('block', 'demo', 'ores/ruby')).toBe('block.demo.ores.ruby');
  });

  it('strips editor fields, keeps an explicit requires_tool and writes format 1', () => {
    const data: Json = {
      format: 1,
      model: 'minecraft:block/stone',
      display_name: 'X',
      loot: 'demo:blocks/other',
      item: false,
      components: { 'msm:breakable': { tool: 'axe', requires_tool: false, hardness: 2 } },
    };
    const definition = blockDefinition(element('msm:block', 'demo:x', data));
    expect(definition).toEqual({
      format: 1,
      item: false,
      loot_table: 'demo:blocks/other',
      components: { 'msm:breakable': { requires_tool: false, hardness: 2 } },
    });
    expect((data as { model?: string }).model).toBe('minecraft:block/stone');
    expect(
      blockDefinition(
        element('msm:block', 'demo:x', { format: 1, loot: 'demo:a', loot_table: 'demo:b' }),
      ).loot_table,
    ).toBe('demo:b');
    expect(
      itemDefinition(element('msm:item', 'demo:x', { format: 1, model: 'm:x', display_name: 'D' })),
    ).toEqual({ format: 1 });
  });

  it('maps every tier to a needs tag by mining level', () => {
    expect(TOOL_TIERS.map((tier) => needsTierTag(tier))).toEqual([
      undefined,
      'needs_stone_tool',
      'needs_stone_tool',
      'needs_iron_tool',
      'needs_diamond_tool',
      undefined,
      'needs_diamond_tool',
    ]);
    expect(needsTierTag('mithril')).toBeUndefined();
    expect(incorrectForTierTag('wood')).toBe('minecraft:incorrect_for_wooden_tool');
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'vanilla facts for %s',
  (_targetId, bundle) => {
    it('has every tag the lowering and the tier check name', async () => {
      const { registries } = await indexesFor(bundle);
      for (const tool of BLOCK_TOOLS)
        expect(registries.has('tag/block', `minecraft:mineable/${tool}`), tool).toBe(true);
      for (const tag of NEEDS_TIER_TAGS)
        expect(registries.has('tag/block', `minecraft:${tag}`), tag).toBe(true);
      for (const tier of TOOL_TIERS)
        expect(registries.has('tag/block', incorrectForTierTag(tier)), tier).toBe(true);
    });

    it('has the folders lowering uses', () => {
      const { resource, data } = bundle.target.folders;
      for (const folder of [
        resource.block_definition,
        resource.item_definition,
        resource.lang,
        data.tags,
        data.loot_table,
      ])
        expect(folder).toMatch(/^[a-z_]+$/);
      expect(bundle.target.fabric).toBeDefined();
    });

    it.each(KIND_IDS.map((id) => [id] as const))('%s default data validates', async (kindId) => {
      const kind = kinds().find((entry) => entry.id === kindId) as ElementKind;
      const indexes = await indexesFor(bundle);
      expect(blockingProblems(indexes, kind.schema, kind.defaultData as Json)).toEqual([]);
      const files = kind.lower(
        element(
          kind.id,
          kindId === 'msm:mod' ? 'demo:mod' : 'demo:sample',
          kind.defaultData as Json,
        ),
        bundle.target,
      );
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        if (file.schema === undefined) continue;
        expect(blockingProblems(indexes, file.schema, file.contents as Json), file.path).toEqual(
          [],
        );
      }
    });
  },
);
