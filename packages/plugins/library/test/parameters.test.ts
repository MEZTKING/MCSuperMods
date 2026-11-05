/**
 * The wizard starters (ADR 0040): parameter declarations, defaults that reproduce the
 * parameterless bundles, alternative values, and the name helpers. Validation and export of
 * the alternative bundles with the real plugins live in `packages/exporters/test/library.test.ts`.
 */
import type {
  ContentBundle,
  Json,
  JsonObject,
  ProjectStarter,
  StarterParameter,
} from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { idFromName, nameForms, pluralOf, readValues, rgbFromHex } from '../src/content/parameters';
import { armorLayerPng, libraryStarters } from '../src/index';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const starter = (id: string): ProjectStarter => {
  const entry = libraryStarters.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`no starter ${id}`);
  return entry;
};

const build = (entry: ProjectStarter, values: Record<string, Json>): ContentBundle => {
  const bundle = entry.build({ namespace: 'demo', projectName: 'Demo', target, values });
  if (bundle instanceof Promise) throw new Error(`${entry.id} builds asynchronously.`);
  return bundle;
};

const defaults = (entry: ProjectStarter): Record<string, Json> =>
  Object.fromEntries(
    (entry.parameters ?? []).map((parameter) => [parameter.id, parameter.default]),
  );

const data = (bundle: ContentBundle, id: string): JsonObject =>
  JSON.parse(JSON.stringify(bundle.elements.find((entry) => entry.id === id)?.data ?? null));

const WIZARDS = [
  'custom_ore',
  'custom-sword',
  'gear-set',
  'simple-block',
  'food',
  'custom_mob',
  'scripted-item',
];

/** The Creator flows (ADR 0043 D1) and their groups. */
const FLOWS: Record<string, string> = {
  custom_ore: 'blocks',
  'gear-set': 'gear',
  'simple-block': 'blocks',
  food: 'food',
  custom_mob: 'mobs',
  'scripted-item': 'scripts',
};

describe('wizard starters', () => {
  it('are the Custom ore, Custom sword, Custom mob starters and the Creator flows', () => {
    expect(
      libraryStarters
        .filter((entry) => (entry.parameters ?? []).length > 0)
        .map((entry) => entry.id),
    ).toEqual(WIZARDS);
  });

  it('declare the groups of ADR 0040 in step order', () => {
    const groups = (id: string) => [
      ...new Set((starter(id).parameters ?? []).map((parameter) => parameter.group)),
    ];
    expect(groups('custom_ore')).toEqual(['Ore', 'Drops']);
    expect(groups('custom-sword')).toEqual(['Sword', 'Stats', 'Recipe']);
    expect(groups('custom_mob')).toEqual(['Mob', 'Behaviour', 'Spawning']);
    expect(groups('gear-set')).toEqual(['Material', 'Pieces', 'Tools', 'Armour']);
    expect(groups('simple-block')).toEqual(['Block', 'Mining', 'Recipe']);
    expect(groups('food')).toEqual(['Food', 'Eating', 'Recipe']);
    expect(groups('scripted-item')).toEqual(['Item', 'Behaviour']);
  });

  it('lists the Creator flows with their groups and blurbs (ADR 0043 D1)', () => {
    const flows = libraryStarters.filter((entry) => entry.creator !== undefined);
    expect(Object.fromEntries(flows.map((entry) => [entry.id, entry.creator?.group]))).toEqual(
      FLOWS,
    );
    for (const flow of flows) expect(flow.creator?.blurb, flow.id).toMatch(/^[A-Z].*\.$/);
    expect(starter('custom-sword').creator).toBeUndefined();
  });

  it('Gear set: declares the fixed parameter ids of ADR 0043 D2 and ADR 0044 D6', () => {
    expect((starter('gear-set').parameters ?? []).map((parameter) => parameter.id)).toEqual([
      'material_name',
      'colour',
      'material_source',
      'pieces',
      'upgrade_from',
      'tier',
      'custom_durability',
      'custom_speed',
      'custom_attack_damage_bonus',
      'custom_enchantment_value',
      'mines_like',
      'armor_base',
      'armor_durability',
      'defense_helmet',
      'defense_chestplate',
      'defense_leggings',
      'defense_boots',
      'toughness',
      'knockback_resistance',
    ]);
    expect(starter('gear-set').requiresKinds).toEqual(
      expect.arrayContaining([
        'msm:item',
        'msm:mod',
        'minecraft:equipment',
        'minecraft:recipe',
        'minecraft:tag/item',
        'minecraft:lang',
        'minecraft:model',
      ]),
    );
  });

  it.each(WIZARDS)('%s declares well-formed parameters with valid defaults', (id) => {
    const parameters = starter(id).parameters as StarterParameter[];
    expect(new Set(parameters.map((parameter) => parameter.id)).size).toBe(parameters.length);
    for (const parameter of parameters) {
      expect(parameter.label, parameter.id).not.toBe('');
      expect(parameter.id, parameter.id).toMatch(/^[a-z][a-z0-9_]*$/);
      switch (parameter.type) {
        case 'string':
          if (parameter.pattern !== undefined) {
            expect(new RegExp(parameter.pattern).test(parameter.default), parameter.id).toBe(true);
          }
          if (parameter.maxLength !== undefined) {
            expect(parameter.default.length).toBeLessThanOrEqual(parameter.maxLength);
          }
          break;
        case 'number':
          expect(parameter.default).toBeGreaterThanOrEqual(parameter.min ?? -Infinity);
          expect(parameter.default).toBeLessThanOrEqual(parameter.max ?? Infinity);
          break;
        case 'colour':
          expect(parameter.default, parameter.id).toMatch(/^#[0-9a-f]{6}$/);
          break;
        case 'choice':
          expect(parameter.choices.map((choice) => choice.value)).toContain(parameter.default);
          break;
        case 'boolean':
          break;
        case 'set': {
          const values = parameter.choices.map((choice) => choice.value);
          for (const value of parameter.default) expect(values, parameter.id).toContain(value);
          expect(parameter.default.length).toBeGreaterThanOrEqual(parameter.min ?? 0);
          break;
        }
      }
    }
  });

  it.each(WIZARDS)('%s builds the same bundle from its defaults as from no values', (id) => {
    const entry = starter(id);
    expect(build(entry, defaults(entry))).toEqual(build(entry, {}));
  });

  it.each(WIZARDS)('%s ignores values of the wrong type and unknown ids', (id) => {
    const entry = starter(id);
    const wrong = Object.fromEntries(
      (entry.parameters ?? []).map((parameter) => [
        parameter.id,
        parameter.type === 'number' ? 'nine' : parameter.type === 'set' ? 'sword' : 42,
      ]),
    );
    expect(build(entry, { ...wrong, unknown: true })).toEqual(build(entry, {}));
  });

  it('Custom ore: names, tier, drops and the optional storage block follow the values', () => {
    const bundle = build(starter('custom_ore'), {
      ore_name: 'Blue Topaz',
      colour: '#2050e0',
      tool_tier: 'diamond',
      drop_min: 3,
      drop_max: 9,
      make_block: false,
    });
    expect(bundle.elements.map((entry) => entry.id)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:blue_topaz_ore',
      'demo:blocks/blue_topaz_ore',
      'demo:blue_topaz',
      'demo:block/blue_topaz_ore',
      'demo:item/blue_topaz',
      'demo:blue_topaz_from_smelting',
      'demo:gems',
      'demo:root',
      'demo:get_blue_topaz',
    ]);
    expect(data(bundle, 'demo:blue_topaz_ore')).toMatchObject({
      display_name: 'Blue Topaz Ore',
      components: { 'msm:breakable': { min_tier: 'diamond' } },
    });
    expect(JSON.stringify(data(bundle, 'demo:blocks/blue_topaz_ore'))).toContain(
      '"count":{"type":"minecraft:uniform","min":3,"max":9}',
    );
    expect(data(bundle, 'demo:pack')).toEqual({
      pack: { description: 'Demo: blue topaz ore and blue topazes' },
    });
    expect(bundle.assets.map((asset) => asset.path)).toEqual([
      'textures/block/blue_topaz_ore.png',
      'textures/item/blue_topaz.png',
    ]);
    expect(JSON.stringify(bundle)).not.toMatch(/ruby/i);
  });

  it('Custom ore: a smaller most than fewest is treated as equal', () => {
    const bundle = build(starter('custom_ore'), { drop_min: 5, drop_max: 2 });
    expect(JSON.stringify(data(bundle, 'demo:blocks/ruby_ore'))).toContain('"min":2,"max":5');
  });

  it('Custom sword: name, tier, durability and ingredient follow the values', () => {
    const bundle = build(starter('custom-sword'), {
      sword_name: 'Frost Blade',
      tool_tier: 'iron',
      durability: 250,
      ingredient: 'minecraft:diamond',
    });
    expect(bundle.elements.map((entry) => entry.id)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:frost_blade',
      'demo:item/frost_blade',
      'demo:en_us',
      'demo:frost_blade_from_diamond',
    ]);
    expect(data(bundle, 'demo:frost_blade')).toMatchObject({
      components: { 'msm:tool': { type: 'sword', tier: 'iron' }, 'msm:durability': { max: 250 } },
    });
    expect(data(bundle, 'demo:en_us')).toEqual({ 'item.demo.frost_blade': 'Frost Blade' });
    expect(data(bundle, 'demo:frost_blade_from_diamond')).toMatchObject({
      key: { I: 'minecraft:diamond', S: 'minecraft:stick' },
    });
  });

  it('Custom mob: a hostile mob hunts players in the chosen biomes; a peaceful one never fights', () => {
    const hostile = build(starter('custom_mob'), {
      mob_name: 'Cave Troll',
      behaviour: 'hostile',
      spawn_biomes: '#minecraft:is_taiga',
      health: 40,
      speed: 0.3,
    });
    const troll = data(hostile, 'demo:cave_troll');
    expect(troll).toMatchObject({
      display_name: 'Cave Troll',
      category: 'monster',
      spawn: { biomes: ['#minecraft:is_taiga'], rule: 'monster' },
      components: { 'msm:health': { max: 40 }, 'msm:movement': { speed: 0.3 } },
    });
    expect((troll.components as JsonObject)['msm:ai_goals']).toEqual({
      goals: [
        { type: 'melee_attack', targets: ['minecraft:player'], retaliate: true },
        { type: 'wander' },
        { type: 'look_at_player' },
        { type: 'look_around' },
      ],
    });
    expect(hostile.elements.map((entry) => entry.id)).toContain('demo:troll/death');

    const peaceful = build(starter('custom_mob'), { behaviour: 'peaceful' });
    const golem = data(peaceful, 'demo:ruby_golem');
    const components = golem.components as JsonObject;
    expect(components['msm:attack']).toBeUndefined();
    expect(JSON.stringify(components['msm:ai_goals'])).not.toContain('melee_attack');
    expect(Object.keys(golem.events as JsonObject)).toEqual(['demo:ruby_golem_death']);
    expect((components['msm:animated_model'] as JsonObject).attack).toBeUndefined();
  });

  it('Custom mob: the egg colours tint the spawn egg texture', () => {
    const plain = build(starter('custom_mob'), {});
    const tinted = build(starter('custom_mob'), { egg_spot_colour: '#00ff00' });
    const egg = (bundle: ContentBundle) =>
      bundle.assets.find((asset) => asset.path.endsWith('_spawn_egg.png'))?.bytes;
    expect(egg(tinted)).not.toEqual(egg(plain));
    expect(tinted.assets[0]?.bytes).toEqual(plain.assets[0]?.bytes);
  });
});

describe('Creator flows', () => {
  const ids = (bundle: ContentBundle) => bundle.elements.map((entry) => entry.id);

  it('Gear set: the defaults make an ore, nine pieces, the equipment asset and the tags', () => {
    const bundle = build(starter('gear-set'), {});
    expect(ids(bundle)).toEqual(
      expect.arrayContaining([
        'demo:ruby',
        'demo:ruby_ore',
        'demo:ruby_block',
        'demo:ruby_repair_materials',
        'demo:ruby_sword',
        'demo:ruby_hoe',
        'demo:ruby_helmet',
        'demo:ruby_boots',
        'demo:ruby_armor',
        'demo:ruby_sword_from_ruby',
        'demo:ruby_helmet_from_ruby',
        'minecraft:swords',
        'minecraft:foot_armor',
        'demo:en_us',
        'demo:mod',
      ]),
    );
    expect(ids(bundle).some((id) => id.includes('smithing'))).toBe(false);
    expect(data(bundle, 'demo:ruby_pickaxe')).toMatchObject({
      components: {
        'msm:tool': {
          type: 'pickaxe',
          tier: {
            durability: 1000,
            speed: 7,
            attack_damage_bonus: 2.5,
            enchantment_value: 15,
            incorrect_blocks_for_drops: '#minecraft:incorrect_for_iron_tool',
            repair_items: '#demo:ruby_repair_materials',
          },
        },
      },
    });
    expect(data(bundle, 'demo:ruby_chestplate')).toMatchObject({
      components: {
        'msm:armor': {
          slot: 'chestplate',
          material: {
            durability: 25,
            defense: { helmet: 3, chestplate: 7, leggings: 5, boots: 2 },
            equipment_asset: 'demo:ruby_armor',
            repair_items: '#demo:ruby_repair_materials',
          },
        },
      },
    });
    expect(data(bundle, 'demo:ruby_armor')).toEqual({
      layers: {
        humanoid: [{ texture: 'demo:ruby' }],
        humanoid_leggings: [{ texture: 'demo:ruby' }],
      },
    });
    const paths = bundle.assets.map((asset) => asset.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'textures/item/ruby.png',
        'textures/item/ruby_sword.png',
        'textures/item/ruby_boots.png',
        'textures/entity/equipment/humanoid/ruby.png',
        'textures/entity/equipment/humanoid_leggings/ruby.png',
      ]),
    );
    const layer = bundle.assets.find((asset) => asset.path.endsWith('humanoid/ruby.png'));
    expect(layer?.bytes).toEqual(armorLayerPng(1, [196, 28, 52]));
    expect(data(bundle, 'demo:en_us')).toMatchObject({
      'item.demo.ruby': 'Ruby',
      'item.demo.ruby_helmet': 'Ruby Helmet',
      'block.demo.ruby_ore': 'Ruby Ore',
    });
  });

  it('Gear set: vanilla stats, an ingot, chosen pieces and smithing upgrades follow the values', () => {
    const bundle = build(starter('gear-set'), {
      material_name: 'Sapphire',
      material_source: 'item',
      tier: 'diamond',
      armor_base: 'iron',
      pieces: ['boots', 'sword'],
      upgrade_from: 'gold',
    });
    expect(ids(bundle)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:sapphire',
      'demo:item/sapphire',
      'demo:sapphire_repair_materials',
      'demo:sapphire_upgrade_smithing_template',
      'demo:item/sapphire_upgrade_smithing_template',
      'demo:sapphire_upgrade_smithing_template_from_sapphire',
      'demo:sapphire_sword',
      'demo:item/sapphire_sword',
      'demo:sapphire_sword_smithing',
      'demo:sapphire_boots',
      'demo:item/sapphire_boots',
      'demo:sapphire_boots_smithing',
      'demo:sapphire_armor',
      'minecraft:swords',
      'minecraft:foot_armor',
      'demo:en_us',
    ]);
    expect(data(bundle, 'demo:sapphire_sword')).toMatchObject({
      components: { 'msm:tool': { type: 'sword', tier: 'diamond' } },
    });
    expect(data(bundle, 'demo:sapphire_boots_smithing')).toEqual({
      type: 'minecraft:smithing_transform',
      template: 'demo:sapphire_upgrade_smithing_template',
      base: 'minecraft:golden_boots',
      addition: 'demo:sapphire',
      result: { id: 'demo:sapphire_boots' },
    });
    expect(data(bundle, 'demo:sapphire_boots')).toMatchObject({
      components: {
        'msm:armor': {
          material: {
            durability: 15,
            defense: { helmet: 2, chestplate: 6, leggings: 5, boots: 2 },
            enchantment_value: 9,
            equip_sound: 'minecraft:item.armor.equip_iron',
          },
        },
      },
    });
    expect(data(bundle, 'demo:en_us')).toMatchObject({ 'item.demo.sapphire': 'Sapphire Ingot' });
    expect(JSON.stringify(bundle)).not.toMatch(/ruby/i);
  });

  it('Simple block: tool, tier, light, drops and recipe follow the values', () => {
    const bundle = build(starter('simple-block'), {
      block_name: 'Glow Stone Bricks',
      tool: 'pickaxe',
      min_tier: 'iron',
      light_level: 12,
      drops_itself: false,
      ingredient: 'none',
    });
    expect(ids(bundle)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:glow_stone_bricks',
      'demo:block/glow_stone_bricks',
      'demo:en_us',
    ]);
    const block = data(bundle, 'demo:glow_stone_bricks');
    expect(block).toMatchObject({
      components: {
        'msm:breakable': { tool: 'pickaxe', min_tier: 'iron' },
        'msm:light_emitter': { level: 12 },
      },
    });
    expect(block.loot).toBeUndefined();
    const plain = data(
      build(starter('simple-block'), { tool: 'none', min_tier: 'diamond' }),
      'demo:ruby_tiles',
    );
    expect(plain.loot).toBe('self');
    expect((plain.components as JsonObject)['msm:breakable']).toEqual({
      hardness: 1.5,
      resistance: 1.5,
    });
  });

  it('Food: nutrition, saturation, always edible and the recipe follow the values', () => {
    const bundle = build(starter('food'), {
      food_name: 'Honey Bun',
      nutrition: 8,
      saturation: 0.8,
      can_always_eat: true,
      ingredient: 'minecraft:wheat',
    });
    expect(data(bundle, 'demo:honey_bun')).toMatchObject({
      components: { 'msm:food': { nutrition: 8, saturation: 0.8, can_always_eat: true } },
    });
    expect(data(bundle, 'demo:honey_bun_from_wheat')).toMatchObject({
      ingredients: ['minecraft:wheat', 'minecraft:sugar'],
      result: { id: 'demo:honey_bun' },
    });
  });

  it.each(['heal', 'launch', 'lightning', 'effect'])(
    'Scripted behaviour: the %s script defines the handler the item runs',
    (behaviour) => {
      const bundle = build(starter('scripted-item'), { behaviour });
      const item = data(bundle, 'demo:ruby_wand');
      expect(item).toMatchObject({
        components: { 'msm:on_use': { event: 'demo:ruby_wand_used', cooldown_ticks: 40 } },
        events: {
          'demo:ruby_wand_used': {
            actions: [{ type: 'run_script', handler: 'demo:ruby_wand_power' }],
          },
        },
      });
      const lines = (data(bundle, 'demo:ruby_wand_behaviour') as { lines: string[] }).lines;
      expect(lines[0]).toBe('import { msm } from "msm:runtime";');
      const source = lines.join('\n');
      expect(source).toContain('msm.actions.define("demo:ruby_wand_power"');
      expect(source).not.toContain('{{');
    },
  );
});

describe('parameter helpers', () => {
  it('derives ids from names (ADR 0040 D2)', () => {
    expect(idFromName('Ruby')).toBe('ruby');
    expect(idFromName('Ruby Golem')).toBe('ruby_golem');
    expect(idFromName('  Blue   Topaz ')).toBe('blue_topaz');
    expect(idFromName("Dragon's Tooth 2")).toBe('dragons_tooth_2');
    expect(idFromName('9 Lives')).toBe('x_9_lives');
  });

  it('forms plurals for prose and ids', () => {
    expect(pluralOf('ruby')).toBe('rubies');
    expect(pluralOf('topaz')).toBe('topazes');
    expect(pluralOf('jade')).toBe('jades');
    expect(pluralOf('key')).toBe('keys');
    expect(nameForms('Blue Topaz')).toEqual({
      display: 'Blue Topaz',
      lower: 'blue topaz',
      plural: 'blue topazes',
      id: 'blue_topaz',
      idPlural: 'blue_topazes',
    });
  });

  it('reads values with defaults and parses colours', () => {
    const parameters: StarterParameter[] = [
      { id: 'n', label: 'N', type: 'number', default: 3 },
      { id: 'b', label: 'B', type: 'boolean', default: true },
      { id: 's', label: 'S', type: 'string', default: 'x' },
    ];
    expect(readValues(parameters, { values: { n: 5, b: 'no', extra: 1 } })).toEqual({
      n: 5,
      b: true,
      s: 'x',
    });
    const set: StarterParameter = {
      id: 'p',
      label: 'P',
      type: 'set',
      choices: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C' },
      ],
      default: ['a'],
    };
    expect(readValues([set], { values: { p: ['c', 'x', 'a'] } })).toEqual({ p: ['a', 'c'] });
    expect(readValues([set], { values: { p: 'a' } })).toEqual({ p: ['a'] });
    expect(readValues([set], { values: {} })).toEqual({ p: ['a'] });
    expect(rgbFromHex('#C41C34', [0, 0, 0])).toEqual([196, 28, 52]);
    expect(rgbFromHex('red', [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
