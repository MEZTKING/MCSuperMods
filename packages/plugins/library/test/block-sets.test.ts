/**
 * The Wood set and Stone set Creator flows (ADR 0069 D1 to D3): members, block types, vanilla
 * behaviour numbers, recipes, tags, the tree and the reopen rule's inputs. Validation and export
 * with the real plugins on both targets live in `packages/exporters/test/library.test.ts`.
 */
import type { ContentBundle, ContentBundleElement, Json, JsonObject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { encodePng, libraryStarters, STONE_SET_MEMBERS, WOOD_SET_MEMBERS } from '../src/index';
import { stoneSetBundle } from '../src/starters/stone-set';
import { woodSetBundle } from '../src/starters/wood-set';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const wood = (values: Record<string, Json> = {}): ContentBundle =>
  woodSetBundle({ namespace: 'demo', projectName: 'Demo', target, values });
const stone = (values: Record<string, Json> = {}): ContentBundle =>
  stoneSetBundle({ namespace: 'demo', projectName: 'Demo', target, values });

const find = (bundle: ContentBundle, id: string, kind?: string): ContentBundleElement => {
  const found = bundle.elements.find(
    (entry) => entry.id === id && (kind === undefined || entry.kind === kind),
  );
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};
const data = (bundle: ContentBundle, id: string, kind?: string): JsonObject =>
  find(bundle, id, kind).data as JsonObject;
const ids = (bundle: ContentBundle): string[] => bundle.elements.map((entry) => entry.id);
const components = (bundle: ContentBundle, id: string): JsonObject =>
  data(bundle, id).components as JsonObject;

describe('Wood set flow (ADR 0069 D1)', () => {
  it('is a Creator flow in the blocks group', () => {
    const entry = libraryStarters.find((starter) => starter.id === 'wood-set');
    expect(entry?.creator?.group).toBe('blocks');
    expect(entry?.layers).toEqual(['resourcepack', 'datapack', 'msm']);
  });

  it('makes every member by default with its block type', () => {
    const bundle = wood();
    const types = Object.fromEntries(
      WOOD_SET_MEMBERS.map(({ value }) => {
        const path = value.startsWith('stripped_')
          ? `stripped_maple_${value.slice('stripped_'.length)}`
          : `maple_${value}`;
        return [value, data(bundle, `demo:${path}`, 'msm:block').type ?? 'block'];
      }),
    );
    expect(types).toEqual({
      log: 'pillar',
      wood: 'pillar',
      stripped_log: 'pillar',
      stripped_wood: 'pillar',
      planks: 'block',
      stairs: 'stairs',
      slab: 'slab',
      fence: 'fence',
      fence_gate: 'fence_gate',
      door: 'door',
      trapdoor: 'trapdoor',
      button: 'button',
      pressure_plate: 'pressure_plate',
      leaves: 'leaves',
      sapling: 'sapling',
    });
    expect(data(bundle, 'demo:maple_stairs').base_block).toBe('demo:maple_planks');
    expect(data(bundle, 'demo:maple_door').set_type).toBe('wood');
    expect(data(bundle, 'demo:maple_fence_gate').wood_type).toBe('oak');
    expect(data(bundle, 'demo:maple_sapling').tree).toBe('demo:maple_tree');
    expect(data(bundle, 'demo:maple_leaves').tint).toBeUndefined();
  });

  it('strips, burns and composts with vanilla numbers', () => {
    const bundle = wood();
    expect(components(bundle, 'demo:maple_log')['msm:strippable']).toEqual({
      into: 'demo:stripped_maple_log',
    });
    expect(components(bundle, 'demo:maple_wood')['msm:strippable']).toEqual({
      into: 'demo:stripped_maple_wood',
    });
    const fire = (id: string) => components(bundle, id)['msm:flammable'];
    expect(fire('demo:maple_planks')).toEqual({ burn_odds: 5, ignite_odds: 20 });
    expect(fire('demo:maple_fence')).toEqual({ burn_odds: 5, ignite_odds: 20 });
    expect(fire('demo:maple_log')).toEqual({ burn_odds: 5, ignite_odds: 5 });
    expect(fire('demo:maple_leaves')).toEqual({ burn_odds: 30, ignite_odds: 60 });
    // Lava ignites doors, trapdoors and plates; fire does not spread to them (B267).
    for (const id of ['demo:maple_door', 'demo:maple_trapdoor', 'demo:maple_pressure_plate']) {
      expect(fire(id), id).toEqual({ burn_odds: 0, ignite_odds: 0 });
    }
    expect(fire('demo:maple_button')).toBeUndefined();
    expect(fire('demo:maple_sapling')).toBeUndefined();
    expect((data(bundle, 'demo:maple_leaves').item as JsonObject).compost).toBe('30%');
    expect((data(bundle, 'demo:maple_sapling').item as JsonObject).compost).toBe('30%');
    expect(components(bundle, 'demo:maple_planks')['msm:breakable']).toEqual({
      hardness: 2,
      resistance: 3,
      tool: 'axe',
      requires_tool: false,
    });
  });

  it('writes the vanilla recipes with their groups and the log and planks tags', () => {
    const bundle = wood();
    const groups = Object.fromEntries(
      bundle.elements
        .filter((entry) => entry.kind === 'minecraft:recipe')
        .map((entry) => [entry.id, (entry.data as JsonObject).group]),
    );
    expect(groups).toEqual({
      'demo:maple_planks_from_logs': 'planks',
      'demo:maple_wood_from_logs': 'bark',
      'demo:stripped_maple_wood_from_logs': 'bark',
      'demo:maple_stairs_from_planks': 'wooden_stairs',
      'demo:maple_slab_from_planks': 'wooden_slab',
      'demo:maple_fence_from_planks': 'wooden_fence',
      'demo:maple_fence_gate_from_planks': 'wooden_fence_gate',
      'demo:maple_door_from_planks': 'wooden_door',
      'demo:maple_trapdoor_from_planks': 'wooden_trapdoor',
      'demo:maple_button_from_planks': 'wooden_button',
      'demo:maple_pressure_plate_from_planks': 'wooden_pressure_plate',
    });
    expect(data(bundle, 'demo:maple_planks_from_logs').ingredients).toEqual(['#demo:maple_logs']);
    const logs = [
      'demo:maple_log',
      'demo:maple_wood',
      'demo:stripped_maple_log',
      'demo:stripped_maple_wood',
    ];
    expect(data(bundle, 'demo:maple_logs', 'minecraft:tag/item').values).toEqual(logs);
    expect(data(bundle, 'minecraft:logs', 'minecraft:tag/block').values).toEqual(logs);
    expect(data(bundle, 'minecraft:logs_that_burn', 'minecraft:tag/item').values).toEqual([
      '#demo:maple_logs',
    ]);
    expect(data(bundle, 'minecraft:planks', 'minecraft:tag/item').values).toEqual([
      'demo:maple_planks',
    ]);
    // Element ids are unique across kinds: no id is both a block tag and an item tag.
    expect(new Set(ids(bundle)).size).toBe(bundle.elements.length);
  });

  it('builds the tree from the set log and leaves and grows it in the chosen biomes', () => {
    const bundle = wood();
    const tree = data(bundle, 'demo:maple_tree', 'minecraft:worldgen/feature');
    expect(tree.type).toBe('minecraft:tree');
    expect(tree.trunk_provider).toEqual({ id: 'demo:maple_log' });
    expect((tree.foliage_provider as JsonObject).id).toBe('demo:maple_leaves');
    expect(data(bundle, 'demo:maple_tree_placed').feature).toBe('demo:maple_tree');
    expect(data(bundle, 'demo:maple_trees', 'msm:biome_addition')).toEqual({
      format: 1,
      biomes: ['#minecraft:is_forest'],
      features: [{ feature: 'demo:maple_tree_placed', step: 'vegetal_decoration' }],
    });
    const off = wood({ grows: false });
    expect(ids(off)).not.toContain('demo:maple_tree_placed');
    expect(ids(off)).not.toContain('demo:maple_trees');
  });

  it('grows a two by two tree from four saplings for the dark oak shape', () => {
    const bundle = wood({ tree_shape: 'dark_oak' });
    expect(data(bundle, 'demo:maple_sapling').mega_tree).toBe('demo:maple_mega_tree');
    expect((data(bundle, 'demo:maple_mega_tree').trunk_placer as JsonObject).type).toBe(
      'minecraft:dark_oak_trunk_placer',
    );
    expect((data(bundle, 'demo:maple_tree').trunk_placer as JsonObject).type).toBe(
      'minecraft:straight_trunk_placer',
    );
    expect(data(bundle, 'demo:maple_tree_placed').feature).toBe('demo:maple_mega_tree');
  });

  it('leaves out the sapling, tree and growth without the log or the leaves', () => {
    const bundle = wood({ members: ['planks', 'sapling', 'leaves', 'stairs'] });
    expect(ids(bundle)).not.toContain('demo:maple_sapling');
    expect(ids(bundle)).not.toContain('demo:maple_tree');
    expect(data(bundle, 'demo:maple_leaves').leaves_drops).toEqual({});
    expect(ids(bundle)).not.toContain('demo:maple_planks_from_logs');
    expect(ids(bundle)).toContain('demo:maple_stairs_from_planks');
  });

  it('tints leaves with the biome colour on request, drawn grey', () => {
    const bundle = wood({ leaf_tint: 'foliage' });
    expect(data(bundle, 'demo:maple_leaves').tint).toBe('foliage');
    const plain = wood().assets.find((asset) => asset.path === 'textures/block/maple_leaves.png');
    const grey = bundle.assets.find((asset) => asset.path === 'textures/block/maple_leaves.png');
    expect(Buffer.from(grey?.bytes ?? []).equals(Buffer.from(plain?.bytes ?? []))).toBe(false);
  });

  it('uses a square picture as it is and keeps the placeholder for any other', () => {
    const png = (width: number, height: number) =>
      encodePng(new Uint8Array(width * height * 4).fill(200), width, height);
    const url = (bytes: Uint8Array) =>
      `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
    const square = png(16, 16);
    const bundle = wood({ picture_planks: url(square), picture_bark: url(png(16, 32)) });
    const asset = (path: string) => bundle.assets.find((entry) => entry.path === path)?.bytes;
    expect(
      Buffer.from(asset('textures/block/maple_planks.png') ?? []).equals(Buffer.from(square)),
    ).toBe(true);
    const placeholder = wood().assets.find(
      (entry) => entry.path === 'textures/block/maple_log.png',
    );
    expect(
      Buffer.from(asset('textures/block/maple_log.png') ?? []).equals(
        Buffer.from(placeholder?.bytes ?? []),
      ),
    ).toBe(true);
  });
});

describe('Stone set flow (ADR 0069 D1)', () => {
  it('makes the stone, stairs, slab and wall by default', () => {
    const bundle = stone();
    const blocks = bundle.elements.filter((entry) => entry.kind === 'msm:block').map((e) => e.id);
    expect(blocks).toEqual([
      'demo:slate',
      'demo:slate_stairs',
      'demo:slate_slab',
      'demo:slate_wall',
    ]);
    expect(data(bundle, 'demo:slate_stairs').base_block).toBe('demo:slate');
    expect(components(bundle, 'demo:slate_wall')['msm:breakable']).toEqual({
      hardness: 1.5,
      resistance: 6,
      tool: 'pickaxe',
      min_tier: 'stone',
    });
  });

  it('crafts and stonecuts every shape as vanilla does', () => {
    const bundle = stone({ members: STONE_SET_MEMBERS.map((member) => member.value) });
    const recipe = (id: string) => data(bundle, id, 'minecraft:recipe');
    expect(recipe('demo:slate_slab_from_slate_stonecutting').result).toEqual({
      count: 2,
      id: 'demo:slate_slab',
    });
    expect(recipe('demo:polished_slate_stairs_from_polished_slate_stonecutting').ingredient).toBe(
      'demo:polished_slate',
    );
    expect(recipe('demo:polished_slate_wall_from_slate_stonecutting').ingredient).toBe(
      'demo:slate',
    );
    expect(recipe('demo:slate_wall_from_slate').category).toBeUndefined();
    expect(recipe('demo:slate_from_stone').key).toEqual({ '#': 'minecraft:stone' });
    expect(data(bundle, 'demo:slate_button').set_type).toBe('stone');
    expect(components(bundle, 'demo:slate_button')['msm:breakable']).toEqual({
      hardness: 0.5,
      resistance: 0.5,
      tool: 'pickaxe',
      requires_tool: false,
    });
    expect(data(bundle, 'demo:slate_pillar').type).toBe('pillar');
    expect(data(bundle, 'demo:polished_slate_stairs').base_block).toBe('demo:polished_slate');
  });

  it('without the stone, stairs copy vanilla stone and nothing is crafted', () => {
    const bundle = stone({ members: ['stairs', 'wall'] });
    expect(data(bundle, 'demo:slate_stairs').base_block).toBe('minecraft:stone');
    expect(bundle.elements.filter((entry) => entry.kind === 'minecraft:recipe')).toEqual([]);
  });
});

/**
 * The Creator's reopen rule (ADR 0043 D4, ADR 0069 D3) compares each element with what the flow
 * makes for its stored values, so a set can be reopened only if the flow is pure and a member's
 * output does not depend on unrelated answers.
 */
describe('reopening a set (ADR 0069 D3)', () => {
  const byId = (bundle: ContentBundle) =>
    new Map(bundle.elements.map((entry) => [`${entry.kind} ${entry.id}`, entry.data]));

  it('rebuilds untouched members byte for byte from the same values', () => {
    const values = { wood_name: 'Elm', members: ['log', 'planks', 'door'] };
    expect(wood(values)).toEqual(wood(values));
    expect(stone({ stone_name: 'Shale' })).toEqual(stone({ stone_name: 'Shale' }));
  });

  it('tells an edited member apart from the generated one', () => {
    const generated = byId(wood());
    const edited = structuredClone(find(wood(), 'demo:maple_door').data) as JsonObject;
    edited.display_name = 'Front Door';
    expect(edited).not.toEqual(generated.get('msm:block demo:maple_door'));
  });

  it('switching a member off removes only that member and what is made from it', () => {
    const all = wood();
    const less = wood({
      members: WOOD_SET_MEMBERS.map((member) => member.value).filter((value) => value !== 'door'),
    });
    const removed = [...byId(all).keys()].filter((key) => !byId(less).has(key));
    expect(removed.sort()).toEqual([
      'minecraft:recipe demo:maple_door_from_planks',
      'msm:block demo:maple_door',
    ]);
    // Every other member is the same, so the reopen plan replaces nothing else.
    for (const [key, value] of byId(less)) {
      if (key.startsWith('minecraft:pack_mcmeta') || key.startsWith('msm:mod')) continue;
      expect(value, key).toEqual(byId(all).get(key));
    }
    expect(less.assets.map((asset) => asset.path)).not.toContain(
      'textures/block/maple_door_top.png',
    );
  });

  it('switching the stone set polished stone on only adds members and recipes', () => {
    const before = byId(stone());
    const after = byId(stone({ members: ['block', 'stairs', 'slab', 'wall', 'polished'] }));
    for (const [key, value] of before) expect(after.get(key), key).toEqual(value);
    expect([...after.keys()].filter((key) => !before.has(key))).toContain(
      'msm:block demo:polished_slate_wall',
    );
  });
});
