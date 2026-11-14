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
import {
  attributeModifiers,
  chosenStats,
  colourInt,
  EFFECT_CHOICES,
  PARTICLE_CHOICES,
  STAT_CHOICES,
} from '../src/content/effects';
import {
  base64Bytes,
  decodePngDataUrl,
  idFromName,
  nameForms,
  oggVorbisInfo,
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

/**
 * A minimal Ogg Vorbis file: a first page with the identification header, and a last page
 * whose granule position gives `seconds` at 44.1 kHz (nothing is decodable; only the
 * container is read).
 */
function oggBytes(seconds: number, channels: number): Uint8Array {
  const page = (granule: number, packet: number[]): number[] => {
    const header = new Uint8Array(27);
    header.set([0x4f, 0x67, 0x67, 0x53, 0, 2]);
    const view = new DataView(header.buffer);
    view.setUint32(6, granule % 2 ** 32, true);
    view.setUint32(10, Math.floor(granule / 2 ** 32), true);
    header[26] = 1;
    return [...header, packet.length, ...packet];
  };
  const id = new Uint8Array(30);
  id.set([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]);
  id[11] = channels;
  new DataView(id.buffer).setUint32(12, 44_100, true);
  id[29] = 1;
  return new Uint8Array([...page(0, [...id]), ...page(Math.round(seconds * 44_100), [0, 0, 0, 0])]);
}

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
  'wood-set',
  'stone-set',
  'crop',
  'tree',
  'food',
  'weapon',
  'consumable',
  'totem',
  'status-effect',
  'potion',
  'throwable',
  'enchantment',
  'painting',
  'music-disc-item',
  'dimension',
  'villager-trade',
  'extra-drop',
  'mob-skin',
  'goat-horn',
  'custom_mob',
  'pet',
  'farm-animal',
  'mount',
  'flying-mob',
  'water-mob',
  'boss',
  'scripted-item',
];

/** The Creator flows (ADR 0043 D1) and their groups. */
const FLOWS: Record<string, string> = {
  custom_ore: 'blocks',
  'gear-set': 'gear',
  'simple-block': 'blocks',
  'wood-set': 'blocks',
  'stone-set': 'blocks',
  crop: 'blocks',
  tree: 'blocks',
  food: 'food',
  weapon: 'gear',
  consumable: 'food',
  totem: 'gear',
  'status-effect': 'magic',
  potion: 'magic',
  throwable: 'gear',
  enchantment: 'gear',
  painting: 'blocks',
  'music-disc-item': 'blocks',
  dimension: 'worlds',
  'villager-trade': 'worlds',
  'extra-drop': 'worlds',
  'mob-skin': 'mobs',
  'goat-horn': 'gear',
  custom_mob: 'mobs',
  pet: 'mobs',
  'farm-animal': 'mobs',
  mount: 'mobs',
  'flying-mob': 'mobs',
  'water-mob': 'mobs',
  boss: 'mobs',
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
    expect(groups('custom_ore')).toEqual(['Ore', 'Drops', 'World']);
    expect(groups('custom-sword')).toEqual(['Sword', 'Stats', 'Recipe']);
    expect(groups('custom_mob')).toEqual(['Mob', 'Behaviour', 'Spawning', 'Variants']);
    for (const id of ['pet', 'farm-animal', 'mount', 'flying-mob', 'water-mob']) {
      expect(groups(id), id).toEqual(['Mob', 'Behaviour', 'Spawning', 'Variants']);
    }
    expect(groups('boss')).toEqual(['Mob', 'Behaviour', 'Boss bar']);
    expect(groups('gear-set')).toEqual(['Material', 'Pieces', 'Tools', 'Armour']);
    expect(groups('simple-block')).toEqual(['Block', 'Mining', 'Recipe']);
    expect(groups('food')).toEqual(['Food', 'Eating', 'Recipe']);
    expect(groups('scripted-item')).toEqual(['Item', 'Behaviour']);
    expect(groups('weapon')).toEqual(['Weapon', 'Stats', 'Ranged', 'Shield', 'Recipe']);
    expect(groups('consumable')).toEqual(['Item', 'Using', 'Effects', 'Recipe']);
    expect(groups('totem')).toEqual(['Totem', 'Effects', 'Recipe']);
    expect(groups('status-effect')).toEqual(['Effect', 'Behaviour', 'Stats', 'Getting it']);
    expect(groups('throwable')).toEqual(['Item', 'Throw', 'Hit', 'Recipe']);
    expect(groups('enchantment')).toEqual(['Enchantment', 'Effect', 'Offering']);
    expect(groups('painting')).toEqual(['Painting', 'Picture']);
    expect(groups('music-disc-item')).toEqual(['Song', 'Disc']);
    expect(groups('dimension')).toEqual(['World', 'Travel']);
    expect(groups('villager-trade')).toEqual(['Villager', 'Trade']);
    expect(groups('extra-drop')).toEqual(['Where', 'Drop']);
    expect(groups('potion')).toEqual(['Potion', 'Effect', 'Brewing', 'Versions']);
    expect(groups('mob-skin')).toEqual(['Skin', 'Where']);
    expect(groups('goat-horn')).toEqual(['Horn', 'Getting it']);
    expect(groups('crop')).toEqual(['Crop', 'Harvest', 'Farming', 'World', 'Pictures']);
    expect(groups('tree')).toEqual(['Tree', 'Blocks', 'World', 'Pictures']);
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
      'demo:ore_blue_topaz',
      'demo:ore_blue_topaz_placed',
      'demo:blue_topaz_ore_generation',
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

  it('Custom mob: a player skin replaces the placeholder and shapes the model', () => {
    const skinBytes = (height: number): Uint8Array =>
      encodePng(new Uint8Array(64 * height * 4).fill(200), 64, height);
    const cubes = (bundle: ContentBundle, bone: string): JsonObject[] => {
      const geometry = data(bundle, 'demo:entity/ruby_golem') as JsonObject;
      const model = (geometry['minecraft:geometry'] as JsonObject[])[0] as JsonObject;
      const found = (model.bones as JsonObject[]).find((entry) => entry.name === bone);
      return (found?.cubes ?? []) as JsonObject[];
    };
    const textureHeight = (bundle: ContentBundle): Json => {
      const geometry = data(bundle, 'demo:entity/ruby_golem') as JsonObject;
      const model = (geometry['minecraft:geometry'] as JsonObject[])[0] as JsonObject;
      return (model.description as JsonObject).texture_height as Json;
    };
    const skinAsset = (bundle: ContentBundle) =>
      bundle.assets.find((asset) => asset.path === 'textures/entity/ruby_golem.png')?.bytes;

    const modern = build(starter('custom_mob'), { skin: dataUrl(skinBytes(64)), arms: 'slim' });
    expect(skinAsset(modern)).toEqual(skinBytes(64));
    expect(cubes(modern, 'head')).toEqual([
      { origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] },
      { origin: [-4, 24, -4], size: [8, 8, 8], uv: [32, 0], inflate: 0.5 },
    ]);
    expect(cubes(modern, 'right_arm')[0]).toEqual({
      origin: [-7, 12, -2],
      size: [3, 12, 4],
      uv: [40, 16],
    });
    expect(textureHeight(modern)).toBe(64);

    const legacy = build(starter('custom_mob'), { skin: dataUrl(skinBytes(32)) });
    expect(skinAsset(legacy)).toEqual(skinBytes(32));
    expect(textureHeight(legacy)).toBe(32);
    expect(cubes(legacy, 'left_leg')).toEqual([
      { origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [0, 16], mirror: true },
    ]);

    // Any other size keeps the placeholder and the plain model.
    const wrong = build(starter('custom_mob'), {
      skin: dataUrl(encodePng(new Uint8Array(16 * 16 * 4), 16, 16)),
    });
    expect(wrong).toEqual(build(starter('custom_mob'), {}));
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

  it('Status effect: the defaults make a healing effect, its icon and a drink with a recipe', () => {
    const bundle = build(starter('status-effect'), {});
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'msm:mod demo:mod',
      'msm:effect demo:ruby_rush',
      'msm:item demo:ruby_rush_tonic',
      'minecraft:model demo:item/ruby_rush_tonic',
      'minecraft:recipe demo:ruby_rush_tonic_from_glistering_melon_slice',
    ]);
    expect(data(bundle, 'demo:ruby_rush')).toEqual({
      format: 1,
      display_name: 'Ruby Rush',
      category: 'beneficial',
      color: 0xc41c34,
      attribute_modifiers: [
        { attribute: 'minecraft:movement_speed', amount: 0.2, operation: 'add_multiplied_total' },
      ],
      components: {
        'msm:on_tick': { event: 'demo:ruby_rush_tick', interval_ticks: 40, faster_per_level: true },
      },
      events: { 'demo:ruby_rush_tick': { actions: [{ type: 'heal', amount: 1 }] } },
    });
    expect(data(bundle, 'demo:ruby_rush_tonic')).toMatchObject({
      display_name: 'Ruby Rush Tonic',
      components: {
        'msm:consumable': {
          animation: 'drink',
          effects: [{ effect: 'demo:ruby_rush', seconds: 30 }],
          converts_to: 'minecraft:glass_bottle',
        },
      },
    });
    expect(data(bundle, 'demo:ruby_rush_tonic_from_glistering_melon_slice')).toMatchObject({
      ingredients: ['minecraft:glistering_melon_slice', 'minecraft:glass_bottle'],
      result: { id: 'demo:ruby_rush_tonic', count: 1 },
    });
    expect(bundle.assets.map((asset) => asset.path)).toEqual([
      'textures/mob_effect/ruby_rush.png',
      'textures/item/ruby_rush_tonic.png',
    ]);
    expect(bundle.assets[0]?.bytes).toEqual(
      placeholderPng('effect_icon', { colour: [196, 28, 52] }),
    );
    expect(bundle.assets[1]?.bytes).toEqual(placeholderPng('bottle', { colour: [196, 28, 52] }));
  });

  it('Status effect: every category, behaviour, particle and source follows the values', () => {
    for (const category of ['beneficial', 'harmful', 'neutral']) {
      expect(data(build(starter('status-effect'), { category }), 'demo:ruby_rush')).toMatchObject({
        category,
      });
    }
    const tick = (values: Record<string, Json>) =>
      data(build(starter('status-effect'), values), 'demo:ruby_rush');
    expect(tick({ behaviour: 'hurt', amount: 2.5 }).events).toEqual({
      'demo:ruby_rush_tick': { actions: [{ type: 'damage', amount: 2.5 }] },
    });
    for (const particle of PARTICLE_CHOICES) {
      expect(tick({ behaviour: 'particles', particle: particle.value }).events).toEqual({
        'demo:ruby_rush_tick': {
          actions: [{ type: 'spawn_particle', particle: particle.value, count: 6, spread: 0.4 }],
        },
      });
    }
    const none = tick({ behaviour: 'none', stat_1: 'none' });
    expect(none).not.toHaveProperty('components');
    expect(none).not.toHaveProperty('events');
    expect(none).not.toHaveProperty('attribute_modifiers');
    const fn = build(starter('status-effect'), {
      behaviour: 'function',
      interval_seconds: 0.25,
      faster_per_level: false,
    });
    expect(data(fn, 'demo:ruby_rush')).toMatchObject({
      components: { 'msm:on_tick': { event: 'demo:ruby_rush_tick', interval_ticks: 5 } },
      events: {
        'demo:ruby_rush_tick': {
          actions: [{ type: 'run_function', function: 'demo:ruby_rush/tick' }],
        },
      },
    });
    expect((data(fn, 'demo:ruby_rush').components as JsonObject)['msm:on_tick']).not.toHaveProperty(
      'faster_per_level',
    );
    expect(fn.elements.find((entry) => entry.id === 'demo:ruby_rush/tick')?.kind).toBe(
      'minecraft:function',
    );

    const flask = build(starter('status-effect'), {
      source: 'flask',
      level: 3,
      seconds: 12,
      ingredient: 'minecraft:blaze_powder',
    });
    expect(data(flask, 'demo:ruby_rush_flask')).toMatchObject({
      display_name: 'Ruby Rush Flask',
      components: {
        'msm:throwable': {
          after_throw: 'consume',
          on_hit_entity: { event: 'demo:ruby_rush_flask_hit' },
          on_hit_block: { event: 'demo:ruby_rush_flask_shatter' },
        },
      },
      events: {
        'demo:ruby_rush_flask_hit': {
          actions: [
            {
              type: 'apply_effect',
              effect: 'demo:ruby_rush',
              seconds: 12,
              amplifier: 2,
              target: 'other',
            },
            expect.anything(),
            expect.anything(),
          ],
        },
      },
    });
    expect(data(flask, 'demo:ruby_rush_flask_from_blaze_powder')).toMatchObject({
      ingredients: ['minecraft:blaze_powder', 'minecraft:glass_bottle', 'minecraft:gunpowder'],
    });
    expect(flask.assets[1]?.bytes).toEqual(placeholderPng('flask', { colour: [196, 28, 52] }));

    const bare = build(starter('status-effect'), { source: 'none' });
    expect(bare.elements.map((entry) => entry.kind)).toEqual([
      'minecraft:pack_mcmeta',
      'msm:mod',
      'msm:effect',
    ]);
    expect(bare.assets.map((asset) => asset.path)).toEqual(['textures/mob_effect/ruby_rush.png']);
    const noRecipe = build(starter('status-effect'), { ingredient: 'none' });
    expect(noRecipe.elements.some((entry) => entry.kind === 'minecraft:recipe')).toBe(false);
  });

  it('Status effect: every stat turns into an attribute modifier per level', () => {
    for (const stat of STAT_CHOICES) {
      const bundle = build(starter('status-effect'), {
        stat_1: stat.value,
        stat_1_amount: -10,
        stat_2: 'minecraft:max_health',
        stat_2_amount: 4,
      });
      expect(data(bundle, 'demo:ruby_rush').attribute_modifiers).toEqual([
        {
          attribute: stat.value,
          amount: stat.unit === 'percent' ? -0.1 : -10,
          operation: stat.operation,
        },
        { attribute: 'minecraft:max_health', amount: 4, operation: 'add_value' },
      ]);
    }
    // A zero amount leaves the slot out.
    expect(chosenStats({ stat_1: 'minecraft:luck', stat_1_amount: 0 }, 1)).toEqual([]);
    expect(
      attributeModifiers(chosenStats({ stat_1: 'minecraft:scale', stat_1_amount: 50 }, 1)),
    ).toEqual([{ attribute: 'minecraft:scale', amount: 0.5, operation: 'add_multiplied_base' }]);
    expect(colourInt([0x12, 0x34, 0x56])).toBe(0x123456);
  });

  it('Throwable: the defaults make a knife that drops where it lands, with a recipe', () => {
    const bundle = build(starter('throwable'), {});
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'msm:mod demo:mod',
      'msm:item demo:ruby_knife',
      'minecraft:model demo:item/ruby_knife',
      'minecraft:recipe demo:ruby_knife_from_flint',
    ]);
    expect(data(bundle, 'demo:ruby_knife')).toEqual({
      format: 1,
      model: 'demo:item/ruby_knife',
      display_name: 'Ruby Knife',
      max_stack_size: 16,
      creative_tab: 'minecraft:combat',
      components: {
        'msm:throwable': {
          speed: 1.5,
          gravity: 0.03,
          damage: 4,
          after_throw: 'drop',
          sound: 'minecraft:item.trident.throw',
        },
      },
    });
    expect(data(bundle, 'demo:item/ruby_knife')).toMatchObject({
      parent: 'minecraft:item/handheld',
    });
    expect(data(bundle, 'demo:ruby_knife_from_flint')).toMatchObject({
      ingredients: ['minecraft:flint', 'minecraft:iron_ingot'],
      result: { id: 'demo:ruby_knife', count: 2 },
    });
    expect(bundle.assets[0]?.bytes).toEqual(placeholderPng('knife', { colour: [196, 28, 52] }));
  });

  it('Throwable: every style, weight and hit follows the values', () => {
    const item = (values: Record<string, Json>) =>
      data(build(starter('throwable'), values), 'demo:ruby_knife');
    const throwable = (values: Record<string, Json>) =>
      (item(values).components as JsonObject)['msm:throwable'] as JsonObject;
    const styles: Record<string, [string, string]> = {
      ball: ['consume', 'ball'],
      knife: ['drop', 'knife'],
      boomerang: ['return', 'boomerang'],
      bomb: ['consume', 'ball'],
    };
    for (const [style, [afterThrow, pattern]] of Object.entries(styles)) {
      const bundle = build(starter('throwable'), { style });
      const component = (data(bundle, 'demo:ruby_knife').components as JsonObject)[
        'msm:throwable'
      ] as JsonObject;
      expect(component.after_throw, style).toBe(afterThrow);
      expect(bundle.assets[0]?.bytes, style).toEqual(
        placeholderPng(pattern as 'ball', { colour: [196, 28, 52] }),
      );
    }
    // A bomb bursts unless another hit is chosen.
    expect(throwable({ style: 'bomb' }).on_hit_block).toEqual({
      event: 'demo:ruby_knife_hit_block',
    });
    expect(throwable({ gravity: 'floaty' }).gravity).toBe(0.01);
    expect(throwable({ gravity: 'heavy' }).gravity).toBe(0.06);
    expect(throwable({ hold_to_throw: true }).charge_ticks).toBe(10);
    expect(throwable({ damage: 0 })).not.toHaveProperty('damage');
    expect(throwable({ speed: 2.5 }).speed).toBe(2.5);
    expect(item({ stack_size: 1 }).max_stack_size).toBe(1);

    for (const effect of EFFECT_CHOICES) {
      expect(
        item({ on_hit: 'effect', hit_effect: effect.value, hit_effect_seconds: 9 }).events,
      ).toMatchObject({
        'demo:ruby_knife_hit': {
          actions: [
            { type: 'apply_effect', effect: effect.value, seconds: 9, target: 'other' },
            {},
          ],
        },
      });
    }
    expect(item({ on_hit: 'knock_up' }).events).toMatchObject({
      'demo:ruby_knife_hit': {
        actions: [{ type: 'launch', direction: 'up', target: 'other' }, {}],
      },
    });
    for (const block of [
      'minecraft:cobweb',
      'minecraft:fire',
      'minecraft:snow',
      'minecraft:torch',
    ]) {
      expect(item({ on_hit: 'place_block', hit_block: block }).events).toEqual({
        'demo:ruby_knife_hit': { actions: [{ type: 'set_block_state', state: block }] },
        'demo:ruby_knife_hit_block': {
          actions: [{ type: 'set_block_state', state: block, offset: [0, 1, 0] }],
        },
      });
    }
    const burst = item({ on_hit: 'burst', burst_damage: 3 });
    expect(burst.events).toMatchObject({
      'demo:ruby_knife_hit': { actions: [{ type: 'damage', amount: 3, target: 'other' }, {}, {}] },
    });
    expect(
      (item({ on_hit: 'burst', burst_damage: 0 }).events as JsonObject)['demo:ruby_knife_hit'],
    ).toEqual((burst.events as JsonObject)['demo:ruby_knife_hit_block']);
    const plain = throwable({ on_hit: 'nothing' });
    expect(plain).not.toHaveProperty('on_hit_entity');
    expect(plain).not.toHaveProperty('on_hit_block');
    expect(item({ on_hit: 'nothing' })).not.toHaveProperty('events');
    const boomerang = build(starter('throwable'), {
      style: 'boomerang',
      ingredient: 'minecraft:feather',
    });
    expect(data(boomerang, 'demo:ruby_knife_from_feather')).toMatchObject({
      ingredients: ['minecraft:feather', 'minecraft:stick'],
      result: { count: 1 },
    });
    const noRecipe = build(starter('throwable'), { ingredient: 'none' });
    expect(noRecipe.elements.some((entry) => entry.kind === 'minecraft:recipe')).toBe(false);
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

  it('Dimension: terrain, biome, sky and a key that runs the travel function', () => {
    const plain = build(starter('dimension'), {});
    expect(data(plain, 'demo:ruby_realm')).toEqual({
      type: 'minecraft:overworld',
      generator: {
        type: 'minecraft:noise',
        settings: 'minecraft:overworld',
        biome_source: { type: 'minecraft:fixed', biome: 'minecraft:cherry_grove' },
      },
    });
    const travel = data(plain, 'demo:ruby_realm/travel').lines as string[];
    expect(travel).toContain(
      'execute if dimension demo:ruby_realm in minecraft:overworld run return run spreadplayers ~ ~ 0 64 false @s',
    );
    expect(travel).toContain('execute in demo:ruby_realm run spreadplayers ~ ~ 0 64 false @s');
    const key = data(plain, 'demo:ruby_realm_key');
    expect(key.events).toEqual({
      'demo:ruby_realm_key_used': {
        actions: [{ type: 'run_function', function: 'demo:ruby_realm/travel' }],
      },
    });

    const caves = build(starter('dimension'), {
      terrain: 'nether',
      biome: 'mix',
      sky: 'nether',
      travel: 'command',
    });
    expect(data(caves, 'demo:ruby_realm')).toEqual({
      type: 'minecraft:the_nether',
      generator: {
        type: 'minecraft:noise',
        settings: 'minecraft:nether',
        biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' },
      },
    });
    expect(data(caves, 'demo:ruby_realm/travel').lines).toContain(
      'execute in demo:ruby_realm run spreadplayers ~ ~ 0 64 under 120 false @s',
    );
    expect(caves.elements.map((entry) => entry.id)).not.toContain('demo:ruby_realm_key');
    expect(caves.assets).toEqual([]);

    const flat = data(build(starter('dimension'), { terrain: 'flat' }), 'demo:ruby_realm');
    expect((flat.generator as JsonObject).type).toBe('minecraft:flat');
  });

  it('Villager trade: one trade merged into the profession and level tag', () => {
    const plain = build(starter('villager-trade'), {});
    expect(plain.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'minecraft:villager_trade demo:fletcher/1/emerald_spectral_arrow',
      'minecraft:tag/villager_trade minecraft:fletcher/level_1',
    ]);
    expect(data(plain, 'demo:fletcher/1/emerald_spectral_arrow')).toEqual({
      wants: { id: 'minecraft:emerald', count: 2 },
      gives: { id: 'minecraft:spectral_arrow', count: 4 },
      max_uses: 12,
      xp: 2,
      reputation_discount: 0.05,
    });
    // No replace: the export merges the tag into vanilla's, so the vanilla trades stay.
    expect(data(plain, 'minecraft:fletcher/level_1')).toEqual({
      values: ['demo:fletcher/1/emerald_spectral_arrow'],
    });
    expect(
      plain.elements.find((entry) => entry.id === 'minecraft:fletcher/level_1')?.notes,
    ).toMatch(/candidate, not a certainty/);

    const buys = build(starter('villager-trade'), {
      profession: 'farmer',
      level: '3',
      direction: 'buys',
      item: 'pumpkin',
      item_count: 6,
      emeralds: 1,
    });
    expect(data(buys, 'demo:farmer/3/pumpkin_emerald')).toMatchObject({
      wants: { id: 'minecraft:pumpkin', count: 6 },
      gives: { id: 'minecraft:emerald', count: 1 },
    });
    expect(data(buys, 'minecraft:farmer/level_3')).toEqual({
      values: ['demo:farmer/3/pumpkin_emerald'],
    });

    const wandering = build(starter('villager-trade'), {
      profession: 'wandering_trader',
      level: '5',
      item: 'demo:ruby',
    });
    expect(wandering.elements.map((entry) => entry.id)).toEqual([
      'demo:pack',
      'demo:wandering_trader/emerald_ruby',
      'minecraft:wandering_trader/common',
    ]);
  });

  it('Music disc: a song file is stored, played and timed', () => {
    const song = oggBytes(125.2, 1);
    const bundle = build(starter('music-disc-item'), {
      song_file: `data:audio/ogg;base64,${Buffer.from(song).toString('base64')}`,
      length_seconds: 30,
    });
    expect(data(bundle, 'demo:sounds')).toEqual({
      'music_disc.ruby_waltz': { sounds: [{ name: 'demo:ruby_waltz', stream: true }] },
    });
    expect(data(bundle, 'demo:ruby_waltz').length_in_seconds).toBe(126);
    expect(bundle.assets.find((asset) => asset.path === 'sounds/ruby_waltz.ogg')?.bytes).toEqual(
      song,
    );
    // Not Ogg Vorbis: the vanilla record plays and the typed length stays.
    const plain = build(starter('music-disc-item'), {
      song_file: 'data:audio/ogg;base64,bm90IG9nZw==',
      length_seconds: 30,
    });
    expect(data(plain, 'demo:ruby_waltz').length_in_seconds).toBe(30);
    expect(plain.assets.some((asset) => asset.path.endsWith('.ogg'))).toBe(false);
  });

  it('reads the Vorbis header and the length of an Ogg file', () => {
    expect(oggVorbisInfo(oggBytes(10, 2))).toEqual({
      sampleRate: 44_100,
      channels: 2,
      seconds: 10,
    });
    expect(oggVorbisInfo(new Uint8Array(64))).toBeNull();
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
      sound_event: { sound_id: 'demo:music_disc.ruby_waltz' },
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

describe('potion, mob skin and goat horn flows (ADRs 0063, 0064)', () => {
  it('Potion: the defaults make a new effect with its icon and a potion with every version', () => {
    const bundle = build(starter('potion'), {});
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'msm:mod demo:mod',
      'msm:effect demo:moon_leap_effect',
      'msm:potion demo:moon_leap',
    ]);
    expect(bundle.assets.map((asset) => asset.path)).toEqual([
      'textures/mob_effect/moon_leap_effect.png',
    ]);
    expect(data(bundle, 'demo:moon_leap_effect')).toMatchObject({
      display_name: 'Moon Leap',
      attribute_modifiers: [
        { attribute: 'minecraft:jump_strength', amount: 0.3, operation: 'add_multiplied_base' },
      ],
    });
    expect(data(bundle, 'demo:moon_leap')).toEqual({
      format: 1,
      display_name: 'Moon Leap',
      effects: [{ id: 'demo:moon_leap_effect', duration_ticks: 3600 }],
      brewing: { reagent: 'minecraft:amethyst_shard' },
      long: { duration_ticks: 9600 },
      strong: { amplifier: 1, duration_ticks: 1800 },
    });
  });

  it('Potion: a vanilla effect makes no effect element; the answers reach the potion', () => {
    const bundle = build(starter('potion'), {
      potion_name: 'Quick Mining',
      effect: 'minecraft:haste',
      level: 2,
      seconds: 60,
      base: 'minecraft:thick',
      ingredient: 'minecraft:honeycomb',
      longer: false,
      splash: false,
      lingering: false,
    });
    expect(bundle.elements.some((entry) => entry.kind === 'msm:effect')).toBe(false);
    expect(bundle.assets).toEqual([]);
    expect(data(bundle, 'demo:quick_mining')).toEqual({
      format: 1,
      display_name: 'Quick Mining',
      effects: [{ id: 'minecraft:haste', duration_ticks: 1200, amplifier: 1 }],
      brewing: { reagent: 'minecraft:honeycomb', base: 'minecraft:thick' },
      strong: { amplifier: 2, duration_ticks: 1800 },
      splash: false,
      lingering: false,
    });
    const unbrewed = build(starter('potion'), { ingredient: 'none' });
    expect(data(unbrewed, 'demo:moon_leap').brewing).toBeUndefined();
  });

  it('Status effect: a brewed potion of the effect instead of an item', () => {
    const bundle = build(starter('status-effect'), { source: 'potion', level: 2 });
    expect(bundle.elements.map((entry) => entry.kind)).not.toContain('msm:item');
    expect(data(bundle, 'demo:ruby_rush_potion')).toEqual({
      format: 1,
      display_name: 'Ruby Rush',
      effects: [{ id: 'demo:ruby_rush', duration_ticks: 600, amplifier: 1 }],
      brewing: { reagent: 'minecraft:amethyst_shard' },
    });
    const unbrewed = build(starter('status-effect'), {
      source: 'potion',
      brew_ingredient: 'none',
    });
    expect(data(unbrewed, 'demo:ruby_rush_potion').brewing).toBeUndefined();
  });

  it('Mob skin: each animal gets its variant kind and textures of the vanilla sizes', () => {
    const sizes: Record<string, string[]> = {
      wolf: ['64x32', '64x32', '64x32', '32x32', '32x32', '32x32'],
      cat: ['64x32', '32x32'],
      pig: ['64x64', '32x32'],
      cow: ['64x64', '64x64'],
      chicken: ['64x32', '16x16'],
      frog: ['48x48'],
    };
    for (const [animal, expected] of Object.entries(sizes)) {
      const bundle = build(starter('mob-skin'), { animal });
      const variant = bundle.elements.find((entry) => entry.id === 'demo:ember_coat');
      expect(variant?.kind, animal).toBe(`minecraft:${animal}_variant`);
      expect(
        bundle.assets.map((asset) => {
          const view = new DataView(asset.bytes.buffer, asset.bytes.byteOffset);
          return `${view.getUint32(16)}x${view.getUint32(20)}`;
        }),
        animal,
      ).toEqual(expected);
      for (const asset of bundle.assets) {
        expect(asset.path.startsWith(`textures/entity/${animal}/ember_coat`), asset.path).toBe(
          true,
        );
      }
    }
    expect(data(build(starter('mob-skin'), {}), 'demo:ember_coat').spawn_conditions).toEqual([
      { priority: 1, condition: { type: 'minecraft:biome', biomes: '#minecraft:is_forest' } },
    ]);
    expect(
      data(build(starter('mob-skin'), { where: 'everywhere' }), 'demo:ember_coat').spawn_conditions,
    ).toEqual([{ priority: 0 }]);
  });

  it('Goat horn: a vanilla call by id, or an own sound file in the { sound_id } form', () => {
    const bundle = build(starter('goat-horn'), {});
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'minecraft:instrument demo:storm_call',
      'minecraft:recipe demo:storm_call_goat_horn',
      'minecraft:tag/instrument minecraft:regular_goat_horns',
      'minecraft:lang demo:en_us',
    ]);
    expect(data(bundle, 'demo:storm_call')).toEqual({
      description: { translate: 'instrument.demo.storm_call' },
      sound_event: 'minecraft:item.goat_horn.sound.5',
      use_duration: 7,
      range: 256,
    });
    expect(data(bundle, 'demo:storm_call_goat_horn')).toMatchObject({
      result: {
        id: 'minecraft:goat_horn',
        components: { 'minecraft:instrument': 'demo:storm_call' },
      },
    });
    const own = build(starter('goat-horn'), {
      sound_file: `data:audio/ogg;base64,${Buffer.from(oggBytes(2, 1)).toString('base64')}`,
      ingredient: 'none',
      goats_drop: false,
    });
    expect(data(own, 'demo:storm_call').sound_event).toEqual({
      sound_id: 'demo:item.goat_horn.storm_call',
    });
    expect(own.assets.map((asset) => asset.path)).toEqual(['sounds/item/goat_horn/storm_call.ogg']);
    expect(own.elements.map((entry) => entry.kind)).toEqual([
      'minecraft:pack_mcmeta',
      'minecraft:sounds',
      'minecraft:instrument',
      'minecraft:lang',
    ]);
  });
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
