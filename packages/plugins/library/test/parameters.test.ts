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
import { EFFECT_CHOICES } from '../src/content/effects';
import {
  base64Bytes,
  decodePngDataUrl,
  idFromName,
  nameForms,
  pluralOf,
  readValues,
  rgbFromHex,
} from '../src/content/parameters';
import {
  armorLayerPng,
  bodyArmorLayerPng,
  encodePng,
  libraryStarters,
  nearestTrimPalette,
  paintingPng,
  placeholderPng,
} from '../src/index';

/** A PNG `data:` URL of `bytes`. */
const dataUrl = (bytes: Uint8Array): string =>
  `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

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
  'weapon',
  'consumable',
  'totem',
  'enchantment',
  'painting',
  'music-disc-item',
  'custom_mob',
  'scripted-item',
];

/** The Creator flows (ADR 0043 D1) and their groups. */
const FLOWS: Record<string, string> = {
  custom_ore: 'blocks',
  'gear-set': 'gear',
  'simple-block': 'blocks',
  food: 'food',
  weapon: 'gear',
  consumable: 'food',
  totem: 'gear',
  enchantment: 'gear',
  painting: 'blocks',
  'music-disc-item': 'blocks',
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
    expect(groups('weapon')).toEqual(['Weapon', 'Stats', 'Ranged', 'Shield', 'Recipe']);
    expect(groups('consumable')).toEqual(['Item', 'Using', 'Effects', 'Recipe']);
    expect(groups('totem')).toEqual(['Totem', 'Effects', 'Recipe']);
    expect(groups('enchantment')).toEqual(['Enchantment', 'Effect', 'Offering']);
    expect(groups('painting')).toEqual(['Painting', 'Picture']);
    expect(groups('music-disc-item')).toEqual(['Song', 'Disc']);
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
      'trim_material',
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
        case 'image':
          expect(parameter.default).toBeNull();
          expect(parameter.maxBytes ?? 0).toBeGreaterThan(0);
          expect(parameter.maxSize ?? 0).toBeGreaterThanOrEqual(64);
          break;
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
        parameter.type === 'number'
          ? 'nine'
          : parameter.type === 'set'
            ? 'sword'
            : parameter.type === 'image'
              ? 'data:image/png;base64,bm90IGEgcG5n'
              : 42,
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

  it('Gear set: the new pieces, body armour layers and the trim material follow the values', () => {
    const bundle = build(starter('gear-set'), {
      material_name: 'Jade',
      colour: '#28a060',
      pieces: ['spear', 'mace', 'bow', 'crossbow', 'shield', 'horse_armor', 'wolf_armor'],
      tier: 'iron',
      upgrade_from: 'diamond',
      trim_material: true,
    });
    expect(ids(bundle)).toEqual(
      expect.arrayContaining([
        'demo:jade_spear',
        'demo:jade_spear_smithing',
        'demo:jade_mace_from_jade',
        'demo:jade_bow_from_jade',
        'demo:jade_crossbow_from_jade',
        'demo:jade_shield_from_jade',
        'demo:jade_horse_armor_smithing',
        'demo:jade_wolf_armor_from_jade',
        'demo:jade_armor',
        'demo:jade_trim',
        'minecraft:trim_materials',
      ]),
    );
    // Weapons get their enchanting tags from lowering; only the trim tag is written here.
    expect(ids(bundle).filter((id) => id.startsWith('minecraft:'))).toEqual([
      'minecraft:trim_materials',
    ]);
    expect(data(bundle, 'demo:jade_spear')).toMatchObject({
      components: { 'msm:tool': { type: 'spear', tier: 'iron' } },
    });
    expect(data(bundle, 'demo:jade_bow')).toMatchObject({
      components: { 'msm:ranged_weapon': { type: 'bow' }, 'msm:durability': { max: 384 } },
    });
    expect(data(bundle, 'demo:jade_shield')).toMatchObject({
      components: { 'msm:shield': { damage_reduction: 1 }, 'msm:durability': { max: 336 } },
    });
    expect(data(bundle, 'demo:jade_horse_armor')).toMatchObject({
      components: {
        'msm:armor': { slot: 'horse', material: { equipment_asset: 'demo:jade_armor' } },
      },
    });
    expect(data(bundle, 'demo:jade_horse_armor_smithing')).toMatchObject({
      base: 'minecraft:diamond_horse_armor',
    });
    expect(data(bundle, 'demo:jade_crossbow_from_jade')).toEqual({
      type: 'minecraft:crafting_shaped',
      category: 'equipment',
      pattern: ['#X#', 'STS', ' # '],
      key: {
        X: 'demo:jade',
        '#': 'minecraft:stick',
        S: 'minecraft:string',
        T: 'minecraft:tripwire_hook',
      },
      result: { id: 'demo:jade_crossbow', count: 1 },
    });
    expect(data(bundle, 'demo:jade_armor')).toEqual({
      layers: { horse_body: [{ texture: 'demo:jade' }], wolf_body: [{ texture: 'demo:jade' }] },
    });
    expect(data(bundle, 'demo:jade')).toMatchObject({
      components: { 'msm:components': { 'minecraft:provides_trim_material': 'demo:jade_trim' } },
    });
    expect(data(bundle, 'demo:jade_trim')).toEqual({
      palette_id: 'minecraft:trim/emerald',
      description: { translate: 'trim_material.demo.jade', color: '#28a060' },
    });
    expect(data(bundle, 'minecraft:trim_materials')).toEqual({ values: ['demo:jade'] });
    const asset = (path: string) => bundle.assets.find((entry) => entry.path === path)?.bytes;
    expect(asset('textures/entity/equipment/horse_body/jade.png')).toEqual(
      bodyArmorLayerPng('horse', [40, 160, 96]),
    );
    expect(asset('textures/entity/equipment/wolf_body/jade.png')).toEqual(
      bodyArmorLayerPng('wolf', [40, 160, 96]),
    );
    expect(asset('textures/item/jade_upgrade_smithing_template.png')).toEqual(
      placeholderPng('smithing_template', { colour: [24, 96, 58] }),
    );
    expect(bundle.assets.some((entry) => entry.path.includes('humanoid'))).toBe(false);
  });

  it('Gear set: picks the nearest vanilla trim palette', () => {
    expect(nearestTrimPalette([196, 28, 52])).toBe('redstone');
    expect(nearestTrimPalette([36, 84, 196])).toBe('lapis');
    expect(nearestTrimPalette([250, 250, 250])).toBe('iron');
  });

  it('Weapon: each type gets its component, model parent, recipe and texture', () => {
    const cases: [string, string, JsonObject][] = [
      ['sword', 'minecraft:item/handheld', { 'msm:tool': { type: 'sword', tier: 'iron' } }],
      ['spear', 'minecraft:item/handheld', { 'msm:tool': { type: 'spear', tier: 'iron' } }],
      ['mace', 'minecraft:item/handheld_mace', { 'msm:tool': { type: 'mace', tier: 'iron' } }],
      [
        'bow',
        'minecraft:item/bow',
        {
          'msm:ranged_weapon': {
            type: 'bow',
            draw_speed: 1.25,
            velocity: 1.1,
            damage_multiplier: 1.2,
          },
        },
      ],
      ['crossbow', 'minecraft:item/crossbow', { 'msm:ranged_weapon': { type: 'crossbow' } }],
      [
        'shield',
        'minecraft:item/generated',
        { 'msm:shield': { block_delay_seconds: 0.25, damage_reduction: 1 } },
      ],
    ];
    for (const [type, parent, components] of cases) {
      const bundle = build(starter('weapon'), { weapon_type: type, weapon_name: 'Ruby Thing' });
      expect(data(bundle, 'demo:ruby_thing'), type).toMatchObject({
        components: { ...components, 'msm:durability': { max: 500 } },
        max_stack_size: 1,
      });
      expect(data(bundle, 'demo:item/ruby_thing'), type).toMatchObject({ parent });
      expect(ids(bundle), type).toContain('demo:ruby_thing_from_emerald');
      expect(ids(bundle).includes('minecraft:swords'), type).toBe(type === 'sword');
      expect(bundle.assets[0]?.bytes, type).toEqual(
        placeholderPng(type as 'sword', { colour: [196, 28, 52] }),
      );
    }
    const custom = build(starter('weapon'), {
      weapon_type: 'sword',
      custom_damage: true,
      attack_damage: 7.5,
      attack_speed: -2,
      ingredient: 'none',
    });
    expect(data(custom, 'demo:ruby_spear')).toMatchObject({
      components: { 'msm:tool': { type: 'sword', attack_damage: 7.5, attack_speed: -2 } },
    });
    expect(ids(custom).some((id) => id.includes('_from_'))).toBe(false);
  });

  it('Consumable: a drink, a food and a charm get their components', () => {
    const drink = build(starter('consumable'), {});
    expect(data(drink, 'demo:ruby_tonic')).toEqual({
      format: 1,
      model: 'demo:item/ruby_tonic',
      max_stack_size: 16,
      creative_tab: 'minecraft:food_and_drinks',
      components: {
        'msm:consumable': {
          seconds: 1.6,
          animation: 'drink',
          effects: [
            { effect: 'minecraft:speed', seconds: 60 },
            { effect: 'minecraft:regeneration', seconds: 10 },
          ],
          converts_to: 'minecraft:glass_bottle',
        },
      },
    });
    expect(data(drink, 'demo:ruby_tonic_from_sweet_berries')).toMatchObject({
      ingredients: ['minecraft:sweet_berries', 'minecraft:glass_bottle'],
    });
    const food = build(starter('consumable'), {
      kind: 'food',
      nutrition: 6,
      can_always_eat: true,
      effect_1_level: 2,
      effect_1_chance: 0.5,
      effect_2: 'none',
      cooldown_seconds: 3,
    });
    expect(data(food, 'demo:ruby_tonic')).toMatchObject({
      max_stack_size: 64,
      components: {
        'msm:food': { nutrition: 6, saturation: 0.6, can_always_eat: true },
        'msm:consumable': {
          animation: 'eat',
          effects: [{ effect: 'minecraft:speed', seconds: 60, amplifier: 1, chance: 0.5 }],
          cooldown_seconds: 3,
        },
      },
    });
    const charm = build(starter('consumable'), { kind: 'charm', cooldown_seconds: 10 });
    expect(data(charm, 'demo:ruby_tonic')).toMatchObject({
      max_stack_size: 1,
      components: { 'msm:on_use': { event: 'demo:ruby_tonic_used', cooldown_ticks: 200 } },
      events: {
        'demo:ruby_tonic_used': {
          actions: [
            { type: 'apply_effect', effect: 'minecraft:speed', seconds: 60, target: 'self' },
            { type: 'apply_effect', effect: 'minecraft:regeneration', seconds: 10, target: 'self' },
          ],
        },
      },
    });
    expect(data(charm, 'demo:ruby_tonic').components).not.toHaveProperty('msm:consumable');
  });

  it('Totem: death protection with the chosen effects', () => {
    const bundle = build(starter('totem'), { effect_3: 'none', clear_effects: false });
    expect(data(bundle, 'demo:ruby_totem')).toMatchObject({
      rarity: 'uncommon',
      components: {
        'msm:death_protection': {
          effects: [
            { effect: 'minecraft:regeneration', seconds: 45, amplifier: 1 },
            { effect: 'minecraft:absorption', seconds: 5, amplifier: 1 },
          ],
        },
      },
    });
    expect(
      (data(bundle, 'demo:ruby_totem').components as JsonObject)['msm:death_protection'],
    ).not.toHaveProperty('clear_effects');
    expect(data(bundle, 'demo:ruby_totem_from_emerald')).toMatchObject({
      pattern: [' G ', 'GXG', ' G '],
      key: { G: 'minecraft:gold_ingot', X: 'minecraft:emerald' },
    });
  });

  it('Enchantment: targets, levels, rarity, effect and tags follow the values', () => {
    const bundle = build(starter('enchantment'), {});
    expect(ids(bundle)).toEqual([
      'demo:pack',
      'demo:ruby_edge',
      'demo:en_us',
      'minecraft:in_enchanting_table',
      'minecraft:non_treasure',
      'minecraft:tradeable',
      'minecraft:on_random_loot',
    ]);
    expect(data(bundle, 'demo:ruby_edge')).toMatchObject({
      description: { translate: 'enchantment.demo.ruby_edge' },
      supported_items: '#minecraft:swords',
      weight: 5,
      max_level: 3,
      anvil_cost: 2,
      slots: ['mainhand'],
      effects: { 'minecraft:damage': [{ effect: { type: 'minecraft:add' } }] },
    });
    const effects = ['damage', 'knockback', 'fire', 'mob_effect', 'durability', 'mining_speed'];
    const keys = effects.map(
      (effect) =>
        Object.keys(
          data(build(starter('enchantment'), { effect }), 'demo:ruby_edge').effects as JsonObject,
        )[0],
    );
    expect(keys).toEqual([
      'minecraft:damage',
      'minecraft:knockback',
      'minecraft:post_attack',
      'minecraft:post_attack',
      'minecraft:item_damage',
      'minecraft:attributes',
    ]);
    const armour = build(starter('enchantment'), {
      applies_to: 'armour',
      rarity: 'very_rare',
      exclusive_with: 'armor',
      in_enchanting_table: false,
    });
    expect(data(armour, 'demo:ruby_edge')).toMatchObject({
      supported_items: '#minecraft:enchantable/armor',
      slots: ['armor'],
      weight: 1,
      anvil_cost: 8,
      exclusive_set: '#minecraft:exclusive_set/armor',
    });
    expect(ids(armour).some((id) => id.startsWith('minecraft:'))).toBe(false);
  });

  it('Painting: a placeholder sized by the choice, or the picked PNG unchanged', () => {
    const placeholder = build(starter('painting'), { size: '4x3' });
    expect(data(placeholder, 'demo:ruby_sunset')).toEqual({
      asset_id: 'demo:ruby_sunset',
      width: 4,
      height: 3,
      title: { translate: 'painting.demo.ruby_sunset.title', color: 'yellow' },
      author: { translate: 'painting.demo.ruby_sunset.author', color: 'gray' },
    });
    expect(placeholder.assets).toEqual([
      {
        namespace: 'demo',
        path: 'textures/painting/ruby_sunset.png',
        bytes: paintingPng(4, 3, [222, 148, 32]),
      },
    ]);
    const picture = encodePng(new Uint8Array(32 * 16 * 4).fill(200), 32, 16);
    const picked = build(starter('painting'), { image: dataUrl(picture), painting_name: 'Lake' });
    expect(picked.assets[0]?.bytes).toEqual(picture);
    expect(picked.elements.find((entry) => entry.id === 'demo:lake')?.notes).toMatch(
      /32 by 16 pixels/,
    );
    expect(data(picked, 'demo:en_us')).toEqual({
      'painting.demo.lake.author': 'You',
      'painting.demo.lake.title': 'Lake',
    });
    // The variant joins #minecraft:placeable, so a placed painting item can pick it (B192).
    const placeable = picked.elements.find((entry) => entry.id === 'minecraft:placeable');
    expect(placeable?.kind).toBe('minecraft:tag/painting_variant');
    expect(placeable?.data).toEqual({ values: ['demo:lake'] });
    expect(picked.elements.find((entry) => entry.id === 'demo:lake')?.notes).not.toMatch(/give/);
  });

  it('Music disc: a real disc item by default, music disc 13 for vanilla packs', () => {
    const item = build(starter('music-disc-item'), {});
    expect(ids(item)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:sounds',
      'demo:ruby_waltz',
      'demo:ruby_waltz_disc',
      'demo:item/ruby_waltz_disc',
      'demo:en_us',
    ]);
    expect(data(item, 'demo:ruby_waltz_disc')).toMatchObject({
      components: { 'msm:components': { 'minecraft:jukebox_playable': 'demo:ruby_waltz' } },
    });
    expect(data(item, 'demo:ruby_waltz')).toEqual({
      sound_event: 'demo:music_disc.ruby_waltz',
      description: { translate: 'jukebox_song.demo.ruby_waltz' },
      length_in_seconds: 185,
      comparator_output: 7,
    });
    expect(data(item, 'demo:en_us')).toEqual({
      'item.demo.ruby_waltz_disc': 'Music Disc',
      'jukebox_song.demo.ruby_waltz': 'You - Ruby Waltz',
    });
    const vanilla = build(starter('music-disc-item'), { disc_type: 'vanilla' });
    expect(ids(vanilla)).toEqual([
      'demo:pack',
      'demo:sounds',
      'demo:ruby_waltz',
      'demo:item/ruby_waltz_disc',
      'minecraft:music_disc_13',
      'demo:give_ruby_waltz_disc',
      'demo:en_us',
    ]);
    expect(vanilla.elements.some((entry) => entry.kind.startsWith('msm:'))).toBe(false);
  });

  it('Effects: offers only vanilla effect ids', () => {
    for (const choice of EFFECT_CHOICES) expect(choice.value).toMatch(/^minecraft:[a-z_]+$/);
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
    const image: StarterParameter = { id: 'i', label: 'I', type: 'image', default: null };
    const png = dataUrl(placeholderPng('gem'));
    expect(readValues([image], { values: { i: png } })).toEqual({ i: png });
    expect(readValues([image], { values: { i: 'data:image/png;base64,AAAA' } })).toEqual({
      i: null,
    });
    expect(readValues([image], { values: { i: 7 } })).toEqual({ i: null });
    expect(readValues([image], { values: {} })).toEqual({ i: null });
    expect(rgbFromHex('#C41C34', [0, 0, 0])).toEqual([196, 28, 52]);
    expect(rgbFromHex('red', [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('image values', () => {
  it('decodes base64 like Node does', () => {
    for (const text of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar']) {
      const encoded = Buffer.from(text).toString('base64');
      expect(Buffer.from(base64Bytes(encoded) as Uint8Array).toString(), text).toBe(text);
    }
    expect(base64Bytes('a$b')).toBeNull();
  });

  it('reads the size of a PNG data URL and refuses anything else', () => {
    const png = encodePng(new Uint8Array(48 * 16 * 4), 48, 16);
    const decoded = decodePngDataUrl(dataUrl(png));
    expect(decoded?.width).toBe(48);
    expect(decoded?.height).toBe(16);
    expect(decoded?.bytes).toEqual(png);
    expect(
      decodePngDataUrl(`data:image/jpeg;base64,${Buffer.from(png).toString('base64')}`),
    ).toBeNull();
    expect(decodePngDataUrl(dataUrl(new Uint8Array(40)))).toBeNull();
  });
});
