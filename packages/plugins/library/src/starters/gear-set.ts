/**
 * The Gear set starter and Creator flow (ADR 0043 D2, `upgrade_from` of ADR 0044 D6): tools and
 * armour of one new material. It builds the material item (a gem dropped by a new ore with its
 * storage block, or a plain ingot), each chosen tool as an `msm:item` with `msm:tool` (a
 * vanilla tier or a custom `ToolMaterial`), each chosen armour piece with `msm:armor` (a custom
 * `ArmorMaterial` whose numbers start from a vanilla material or the user's own, drawn by the
 * set's own `minecraft:equipment` asset and its two 64x32 layer textures), handheld and flat
 * item models with tinted placeholder textures, the crafting recipes (or a smithing template
 * and one `smithing_transform` recipe per piece), the vanilla item tags the pieces join, the
 * English names and the `msm:mod` metadata. Ids derive from `material_name`: the material
 * item `ruby`, `ruby_sword`, `ruby_helmet` and the equipment asset `ruby_armor` (element ids are
 * unique across kinds, so the asset cannot share the material's id; its layer textures are
 * still named `ruby.png`, as in the sample mod).
 *
 * Joining `minecraft:swords`, `pickaxes`, `axes`, `shovels`, `hoes`, `head_armor`,
 * `chest_armor`, `leg_armor` and `foot_armor` is enough for every `enchantable/*` tag: those
 * vanilla tags list the base tags (checked against the vanilla data when this was written;
 * the library test checks the tag names against each target's vendored registries).
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  JsonObject,
  ResourceLocation,
  StarterParameter,
} from '@msm/plugin-api';
import { armorLayerPng, type PlaceholderPattern } from '../assets/png';
import {
  COLOURS,
  element,
  KINDS,
  modIdFromNamespace,
  packElement,
  rl,
  texture,
} from '../content/bundle';
import {
  articleFor,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  setValue,
  stringValue,
} from '../content/parameters';

/** A tool piece: its tool type, display word, recipe pattern and vanilla item tag. */
interface ToolPiece {
  value: 'sword' | 'pickaxe' | 'axe' | 'shovel' | 'hoe';
  label: string;
  pattern: string[];
  tag: string;
}

/** An armour piece: its slot, display word, recipe pattern and vanilla item tag. */
interface ArmourPiece {
  value: 'helmet' | 'chestplate' | 'leggings' | 'boots';
  label: string;
  pattern: string[];
  tag: string;
}

/** The tool pieces, with the vanilla shaped recipe patterns (`X` the material, `#` a stick). */
const TOOLS: readonly ToolPiece[] = [
  { value: 'sword', label: 'Sword', pattern: ['X', 'X', '#'], tag: 'swords' },
  { value: 'pickaxe', label: 'Pickaxe', pattern: ['XXX', ' # ', ' # '], tag: 'pickaxes' },
  { value: 'axe', label: 'Axe', pattern: ['XX', 'X#', ' #'], tag: 'axes' },
  { value: 'shovel', label: 'Shovel', pattern: ['X', '#', '#'], tag: 'shovels' },
  { value: 'hoe', label: 'Hoe', pattern: ['XX', ' #', ' #'], tag: 'hoes' },
];

/** The armour pieces, with the vanilla shaped recipe patterns (`X` the material). */
const ARMOUR: readonly ArmourPiece[] = [
  { value: 'helmet', label: 'Helmet', pattern: ['XXX', 'X X'], tag: 'head_armor' },
  { value: 'chestplate', label: 'Chestplate', pattern: ['X X', 'XXX', 'XXX'], tag: 'chest_armor' },
  { value: 'leggings', label: 'Leggings', pattern: ['XXX', 'X X', 'X X'], tag: 'leg_armor' },
  { value: 'boots', label: 'Boots', pattern: ['X X', 'X X'], tag: 'foot_armor' },
];

/** The vanilla tool tiers, in the order the flow lists them, then `custom`. */
const TIERS: readonly { value: string; label: string }[] = [
  { value: 'wood', label: 'Wood' },
  { value: 'stone', label: 'Stone' },
  { value: 'copper', label: 'Copper' },
  { value: 'iron', label: 'Iron' },
  { value: 'gold', label: 'Gold' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'netherite', label: 'Netherite' },
  { value: 'custom', label: 'Custom (set the numbers below)' },
];

/** What a custom tier can mine for drops: the vanilla `incorrect_for_<name>_tool` block tags. */
const MINES_LIKE: readonly { value: string; label: string; tag: string }[] = [
  { value: 'wood', label: 'Like wood', tag: 'wooden' },
  { value: 'stone', label: 'Like stone', tag: 'stone' },
  { value: 'copper', label: 'Like copper', tag: 'copper' },
  { value: 'iron', label: 'Like iron', tag: 'iron' },
  { value: 'diamond', label: 'Like diamond', tag: 'diamond' },
  { value: 'netherite', label: 'Like netherite', tag: 'netherite' },
];

/** The numbers of a custom armour material. */
interface ArmourStats {
  durability: number;
  defense: { helmet: number; chestplate: number; leggings: number; boots: number };
  enchantmentValue: number;
  toughness: number;
  knockbackResistance: number;
  /** The equip sound id; absent means the generic armour sound. */
  sound?: string;
}

/**
 * Vanilla armour materials whose numbers a set can copy, with the values the game's
 * `ArmorMaterials` had when this was written (verify at implementation for later targets).
 * The copy is a custom material, so the pieces keep the set's own look and stay as they are
 * if vanilla changes its numbers later.
 */
const ARMOUR_BASES: readonly { value: string; label: string; stats: ArmourStats }[] = [
  {
    value: 'leather',
    label: 'Like leather',
    stats: {
      durability: 5,
      defense: { helmet: 1, chestplate: 3, leggings: 2, boots: 1 },
      enchantmentValue: 15,
      toughness: 0,
      knockbackResistance: 0,
      sound: 'minecraft:item.armor.equip_leather',
    },
  },
  {
    value: 'copper',
    label: 'Like copper',
    stats: {
      durability: 11,
      defense: { helmet: 2, chestplate: 4, leggings: 3, boots: 1 },
      enchantmentValue: 8,
      toughness: 0,
      knockbackResistance: 0,
      sound: 'minecraft:item.armor.equip_copper',
    },
  },
  {
    value: 'chainmail',
    label: 'Like chainmail',
    stats: {
      durability: 15,
      defense: { helmet: 2, chestplate: 5, leggings: 4, boots: 1 },
      enchantmentValue: 12,
      toughness: 0,
      knockbackResistance: 0,
      sound: 'minecraft:item.armor.equip_chain',
    },
  },
  {
    value: 'iron',
    label: 'Like iron',
    stats: {
      durability: 15,
      defense: { helmet: 2, chestplate: 6, leggings: 5, boots: 2 },
      enchantmentValue: 9,
      toughness: 0,
      knockbackResistance: 0,
      sound: 'minecraft:item.armor.equip_iron',
    },
  },
  {
    value: 'gold',
    label: 'Like gold',
    stats: {
      durability: 7,
      defense: { helmet: 2, chestplate: 5, leggings: 3, boots: 1 },
      enchantmentValue: 25,
      toughness: 0,
      knockbackResistance: 0,
      sound: 'minecraft:item.armor.equip_gold',
    },
  },
  {
    value: 'diamond',
    label: 'Like diamond',
    stats: {
      durability: 33,
      defense: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 },
      enchantmentValue: 10,
      toughness: 2,
      knockbackResistance: 0,
      sound: 'minecraft:item.armor.equip_diamond',
    },
  },
  {
    value: 'netherite',
    label: 'Like netherite',
    stats: {
      durability: 37,
      defense: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 },
      enchantmentValue: 15,
      toughness: 3,
      knockbackResistance: 0.1,
      sound: 'minecraft:item.armor.equip_netherite',
    },
  },
];

/** The enchantment value of a custom armour material (between iron's 9 and gold's 25). */
const CUSTOM_ARMOUR_ENCHANTMENT_VALUE = 12;

/**
 * Vanilla gear a set can be upgraded from at a smithing table (ADR 0044 D6): materials with a
 * full set of tools and armour. `prefix` is the vanilla item id prefix.
 */
const UPGRADES: readonly { value: string; label: string; prefix?: string }[] = [
  { value: 'none', label: 'Craft from scratch' },
  { value: 'iron', label: 'Upgrade iron gear at a smithing table', prefix: 'iron' },
  { value: 'gold', label: 'Upgrade golden gear at a smithing table', prefix: 'golden' },
  { value: 'diamond', label: 'Upgrade diamond gear at a smithing table', prefix: 'diamond' },
  { value: 'netherite', label: 'Upgrade netherite gear at a smithing table', prefix: 'netherite' },
  { value: 'copper', label: 'Upgrade copper gear at a smithing table', prefix: 'copper' },
];

const PIECES = [...TOOLS, ...ARMOUR];

const CUSTOM_ONLY = 'Used when Tier is Custom.';
const ARMOUR_CUSTOM_ONLY = 'Used when Armour stats is Custom.';

/** The Gear set's questions (ADR 0043 D2), groups "Material", "Pieces", "Tools" and "Armour". */
export const GEAR_SET_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'material_name',
    label: 'Material name',
    description:
      'The English name of the new material. Ids derive from it: Ruby gives ruby, ruby_sword, ruby_helmet and the equipment asset ruby_armor.',
    group: 'Material',
    type: 'string',
    default: 'Ruby',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of every placeholder texture of the set.',
    group: 'Material',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'material_source',
    label: 'Where the material comes from',
    group: 'Material',
    type: 'choice',
    default: 'ore',
    choices: [
      { value: 'ore', label: 'A new ore that drops gems, with a storage block' },
      { value: 'item', label: 'Only the material item (an ingot)' },
    ],
  },
  {
    id: 'pieces',
    label: 'Pieces',
    description: 'The tools and armour pieces to make.',
    group: 'Pieces',
    type: 'set',
    default: PIECES.map((piece) => piece.value),
    choices: PIECES.map(({ value, label }) => ({ value, label })),
    min: 1,
  },
  {
    id: 'upgrade_from',
    label: 'How pieces are made',
    description:
      'Craft each piece from the material, or upgrade vanilla gear at a smithing table as netherite gear is made: the set then adds a smithing template.',
    group: 'Pieces',
    type: 'choice',
    default: 'none',
    choices: UPGRADES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'tier',
    label: 'Tier',
    description: 'A vanilla tier gives the tools the numbers of that material; Custom uses yours.',
    group: 'Tools',
    type: 'choice',
    default: 'custom',
    choices: TIERS.map((tier) => ({ ...tier })),
  },
  {
    id: 'custom_durability',
    label: 'Tool durability',
    description: `Uses before a tool breaks (iron 250, diamond 1561). ${CUSTOM_ONLY}`,
    group: 'Tools',
    type: 'number',
    default: 1000,
    min: 1,
    max: 5000,
    step: 1,
  },
  {
    id: 'custom_speed',
    label: 'Mining speed',
    description: `How fast the tools mine (iron 6, diamond 8). ${CUSTOM_ONLY}`,
    group: 'Tools',
    type: 'number',
    default: 7,
    min: 1,
    max: 20,
    step: 0.5,
  },
  {
    id: 'custom_attack_damage_bonus',
    label: 'Attack damage bonus',
    description: `Added to each tool's base damage (iron 2, diamond 3). ${CUSTOM_ONLY}`,
    group: 'Tools',
    type: 'number',
    default: 2.5,
    min: 0,
    max: 10,
    step: 0.5,
  },
  {
    id: 'custom_enchantment_value',
    label: 'Tool enchantability',
    description: `Higher values get better enchantments (iron 14, diamond 10). ${CUSTOM_ONLY}`,
    group: 'Tools',
    type: 'number',
    default: 15,
    min: 1,
    max: 30,
    step: 1,
  },
  {
    id: 'mines_like',
    label: 'Mines like',
    description: `The blocks the tools mine for drops, as a vanilla tier does. ${CUSTOM_ONLY}`,
    group: 'Tools',
    type: 'choice',
    default: 'iron',
    choices: MINES_LIKE.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'armor_base',
    label: 'Armour stats',
    description:
      'Copy the numbers of a vanilla armour material, or set your own below. The armour keeps its own look either way.',
    group: 'Armour',
    type: 'choice',
    default: 'custom',
    choices: [
      ...ARMOUR_BASES.map(({ value, label }) => ({ value, label })),
      { value: 'custom', label: 'Custom (set the numbers below)' },
    ],
  },
  {
    id: 'armor_durability',
    label: 'Armour durability',
    description: `Each piece multiplies it (helmet 11, chestplate 16, leggings 15, boots 13; iron 15). ${ARMOUR_CUSTOM_ONLY}`,
    group: 'Armour',
    type: 'number',
    default: 25,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    id: 'defense_helmet',
    label: 'Helmet armour points',
    description: ARMOUR_CUSTOM_ONLY,
    group: 'Armour',
    type: 'number',
    default: 3,
    min: 0,
    max: 20,
    step: 1,
  },
  {
    id: 'defense_chestplate',
    label: 'Chestplate armour points',
    description: ARMOUR_CUSTOM_ONLY,
    group: 'Armour',
    type: 'number',
    default: 7,
    min: 0,
    max: 20,
    step: 1,
  },
  {
    id: 'defense_leggings',
    label: 'Leggings armour points',
    description: ARMOUR_CUSTOM_ONLY,
    group: 'Armour',
    type: 'number',
    default: 5,
    min: 0,
    max: 20,
    step: 1,
  },
  {
    id: 'defense_boots',
    label: 'Boots armour points',
    description: ARMOUR_CUSTOM_ONLY,
    group: 'Armour',
    type: 'number',
    default: 2,
    min: 0,
    max: 20,
    step: 1,
  },
  {
    id: 'toughness',
    label: 'Toughness',
    description: `Reduces strong hits further (diamond 2, netherite 3). ${ARMOUR_CUSTOM_ONLY}`,
    group: 'Armour',
    type: 'number',
    default: 1,
    min: 0,
    max: 5,
    step: 0.5,
  },
  {
    id: 'knockback_resistance',
    label: 'Knockback resistance',
    description: `0 to 1 per piece (netherite 0.1). ${ARMOUR_CUSTOM_ONLY}`,
    group: 'Armour',
    type: 'number',
    default: 0,
    min: 0,
    max: 1,
    step: 0.05,
  },
]);

/** The ore's tool tier for drops: about the strength of the tools the material makes. */
function oreTier(tier: string, minesLike: string): string {
  const level = tier === 'custom' ? minesLike : tier;
  if (level === 'diamond' || level === 'netherite') return 'diamond';
  if (level === 'iron') return 'iron';
  return 'stone';
}

/** A number rounded to two decimals, so float sliders give tidy JSON. */
const tidy = (value: number): number => Math.round(value * 100) / 100;

export function gearSetBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(GEAR_SET_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'material_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const fromOre = stringValue(values, 'material_source') !== 'item';
  const chosen = setValue(values, 'pieces');
  const tools = TOOLS.filter((piece) => chosen.includes(piece.value));
  const armour = ARMOUR.filter((piece) => chosen.includes(piece.value));
  const upgrade = UPGRADES.find((entry) => entry.value === stringValue(values, 'upgrade_from'));
  const upgradePrefix = upgrade?.prefix;
  const tierValue = stringValue(values, 'tier');
  const tier = TIERS.find((entry) => entry.value === tierValue) ?? { value: 'custom', label: '' };
  const isCustomTier = tier.value === 'custom';
  const minesLike =
    MINES_LIKE.find((entry) => entry.value === stringValue(values, 'mines_like')) ??
    (MINES_LIKE[3] as (typeof MINES_LIKE)[number]);
  const armourBase = ARMOUR_BASES.find(
    (entry) => entry.value === stringValue(values, 'armor_base'),
  );
  const armourStats: ArmourStats = armourBase?.stats ?? {
    durability: Math.round(numberValue(values, 'armor_durability')),
    defense: {
      helmet: Math.round(numberValue(values, 'defense_helmet')),
      chestplate: Math.round(numberValue(values, 'defense_chestplate')),
      leggings: Math.round(numberValue(values, 'defense_leggings')),
      boots: Math.round(numberValue(values, 'defense_boots')),
    },
    enchantmentValue: CUSTOM_ARMOUR_ENCHANTMENT_VALUE,
    toughness: tidy(numberValue(values, 'toughness')),
    knockbackResistance: tidy(numberValue(values, 'knockback_resistance')),
  };

  const ids = gearSetIds(namespace, name.id);
  const material = ids.material;
  const materialName = fromOre ? name.display : `${name.display} Ingot`;
  const materialLower = materialName.toLowerCase();
  const repairTag = ids.repairTag;
  const usesRepairTag = armour.length > 0 || (tools.length > 0 && isCustomTier);
  const lang: Record<string, string> = {};
  const itemKey = (id: ResourceLocation): string => `item.${id.replace(':', '.')}`;
  const blockKey = (id: ResourceLocation): string => `block.${id.replace(':', '.')}`;
  const elements: ContentBundleElement[] = [];
  const assets: ContentBundleAsset[] = [];
  const add = (...entries: ContentBundleElement[]): void => {
    elements.push(...entries);
  };

  const pieceWords = [...tools, ...armour].map((piece) => piece.label.toLowerCase());
  const summary =
    pieceWords.length === 0
      ? `${name.lower} material`
      : `${name.lower} ${pieceWords.length === 1 ? pieceWords[0] : `${pieceWords.slice(0, -1).join(', ')} and ${pieceWords.at(-1)}`}`;

  add(
    packElement(
      namespace,
      `${projectName}: ${name.lower} gear`,
      'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out and puts the same assets and data inside the jar.',
    ),
    element(
      rl(namespace, 'mod'),
      KINDS.mod,
      {
        mod_id: modIdFromNamespace(namespace),
        version: '1.0.0',
        name: projectName,
        description: `Adds ${summary}.`,
        authors: [],
        licence: 'All-Rights-Reserved',
      },
      'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. New items and blocks exist only in that jar, which also needs Fabric API and msm_runtime (nested in the jar unless you choose a separate runtime). The mod id must stay unique among the mods you install.',
    ),
  );

  // The material -----------------------------------------------------------------------------
  const materialModel = rl(namespace, `item/${material.slice(namespace.length + 1)}`);
  lang[itemKey(material)] = materialName;
  add(
    element(
      material,
      KINDS.item,
      {
        format: 1,
        model: materialModel,
        max_stack_size: 64,
        creative_tab: 'minecraft:ingredients',
      },
      fromOre
        ? `The material: a gem the ${name.lower} ore drops. Every recipe of the set uses it, and it repairs the set's tools and armour on an anvil through the tag ${repairTag}.`
        : `The material: an ingot. The set has no recipe for it, so take it from the creative menu or add a recipe (or a loot table) that makes it. Every recipe of the set uses it, and it repairs the set's tools and armour on an anvil through the tag ${repairTag}.`,
    ),
    element(
      materialModel,
      KINDS.model,
      { parent: 'minecraft:item/generated', textures: { layer0: materialModel } },
      `A flat item model drawn from textures/${materialModel.slice(namespace.length + 1)}.png. Paint over the placeholder to restyle it.`,
    ),
  );
  assets.push(
    texture(
      namespace,
      materialModel.slice(namespace.length + 1),
      fromOre ? 'gem' : 'ingot',
      colour,
    ),
  );

  if (fromOre) {
    const oreModel = rl(namespace, `block/${name.id}_ore`);
    const blockModel = rl(namespace, `block/${name.id}_block`);
    const oreLoot = rl(namespace, `blocks/${name.id}_ore`);
    const needs = oreTier(tier.value, minesLike.value);
    lang[blockKey(ids.ore)] = `${name.display} Ore`;
    lang[blockKey(ids.block)] = `Block of ${name.display}`;
    add(
      element(
        ids.ore,
        KINDS.block,
        {
          format: 1,
          model: oreModel,
          sound_type: 'stone',
          loot: oreLoot,
          item: { creative_tab: 'minecraft:natural_blocks' },
          components: {
            'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: needs },
          },
        },
        `A new ore block. It mines quickly with a pickaxe and drops ${name.plural} only when the pickaxe is ${needs} or better. It does not generate in the world by itself: place it from the creative menu, or add a placed feature that spreads it underground.`,
      ),
      element(
        oreLoot,
        KINDS.lootTable,
        {
          type: 'minecraft:block',
          pools: [
            {
              rolls: 1,
              condition: { type: 'minecraft:survives_explosion' },
              entries: [
                {
                  type: 'minecraft:item',
                  name: material,
                  modifier: [
                    {
                      type: 'minecraft:apply_bonus',
                      enchantment: 'minecraft:fortune',
                      formula: 'minecraft:ore_drops',
                    },
                  ],
                },
              ],
            },
          ],
          random_sequence: oreLoot,
        },
        `What ${name.lower} ore drops: one ${name.lower}, more with Fortune, nothing when blown up.`,
      ),
      element(
        ids.block,
        KINDS.block,
        {
          format: 1,
          model: blockModel,
          sound_type: 'metal',
          loot: 'self',
          item: { creative_tab: 'minecraft:building_blocks' },
          components: {
            'msm:breakable': { hardness: 5, resistance: 6, tool: 'pickaxe', min_tier: needs },
          },
        },
        `A storage block for nine ${name.plural}. "loot": "self" generates a loot table that drops the block itself.`,
      ),
      element(
        oreModel,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: oreModel } },
        `A full cube drawn from textures/block/${name.id}_ore.png on every side.`,
      ),
      element(
        blockModel,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: blockModel } },
        `A full cube drawn from textures/block/${name.id}_block.png on every side.`,
      ),
      element(
        rl(namespace, `${name.id}_block_from_${name.idPlural}`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'building',
          pattern: ['XXX', 'XXX', 'XXX'],
          key: { X: material },
          result: { id: ids.block, count: 1 },
        },
        `Nine ${name.plural} make a block of ${name.lower}.`,
      ),
      element(
        rl(namespace, `${name.id}_from_block`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'misc',
          ingredients: [ids.block],
          result: { id: material, count: 9 },
        },
        `A block of ${name.lower} gives nine ${name.plural} back.`,
      ),
      element(
        rl(namespace, `${name.id}_from_smelting`),
        KINDS.recipe,
        {
          type: 'minecraft:smelting',
          category: 'misc',
          ingredient: ids.ore,
          result: { id: material },
          experience: 1,
          cookingtime: 200,
        },
        `Smelting ${name.lower} ore (from the creative menu, or picked up with Silk Touch from another mod) gives ${articleFor(name.lower)} ${name.lower}.`,
      ),
    );
    assets.push(
      texture(namespace, `block/${name.id}_ore`, 'ore', colour),
      texture(namespace, `block/${name.id}_block`, 'plain', colour),
    );
  }

  if (usesRepairTag) {
    add(
      element(
        repairTag,
        KINDS.tagItem,
        { values: [material] },
        `The items that repair the set's ${isCustomTier && tools.length > 0 ? 'tools and ' : ''}armour on an anvil: its custom materials name this tag in repair_items. Add more items to let them repair too.`,
      ),
    );
  }

  // The smithing template ---------------------------------------------------------------------
  const template = ids.template;
  const upgrading = upgradePrefix !== undefined && tools.length + armour.length > 0;
  if (upgrading) {
    const templateModel = rl(namespace, `item/${name.id}_upgrade_smithing_template`);
    lang[itemKey(template)] = `${name.display} Upgrade`;
    add(
      element(
        template,
        KINDS.item,
        {
          format: 1,
          model: templateModel,
          max_stack_size: 64,
          creative_tab: 'minecraft:ingredients',
        },
        `The smithing template of the set: at a smithing table it upgrades ${upgradePrefix} gear to ${name.lower} gear with one ${materialLower} each, as the netherite upgrade does. Each upgrade uses up one template.`,
      ),
      element(
        templateModel,
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: templateModel } },
        `A flat item model drawn from textures/item/${name.id}_upgrade_smithing_template.png, a plain placeholder to paint over.`,
      ),
      element(
        rl(
          namespace,
          `${name.id}_upgrade_smithing_template_from_${material.slice(namespace.length + 1)}`,
        ),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'misc',
          pattern: [' X ', 'XPX', ' X '],
          key: { X: material, P: 'minecraft:paper' },
          result: { id: template, count: 1 },
        },
        `Four ${materialLower === name.lower ? name.plural : `${materialLower}s`} around a sheet of paper make the smithing template.`,
      ),
    );
    assets.push(
      texture(namespace, `item/${name.id}_upgrade_smithing_template`, 'plain', [
        Math.round(colour[0] * 0.6),
        Math.round(colour[1] * 0.6),
        Math.round(colour[2] * 0.6),
      ]),
    );
  }

  /** The recipe of one piece: shaped from the material, or a smithing upgrade. */
  const recipeOf = (
    pieceId: ResourceLocation,
    piece: ToolPiece | ArmourPiece,
    isTool: boolean,
  ): ContentBundleElement => {
    const path = pieceId.slice(namespace.length + 1);
    if (upgrading) {
      const base = `minecraft:${upgradePrefix}_${piece.value}`;
      return element(
        rl(namespace, `${path}_smithing`),
        KINDS.recipe,
        {
          type: 'minecraft:smithing_transform',
          template,
          base,
          addition: material,
          result: { id: pieceId },
        },
        `At a smithing table, the ${name.lower} upgrade template, ${articleFor(base.slice(10).replace(/_/g, ' '))} ${base.slice(10).replace(/_/g, ' ')} and one ${materialLower} make the ${name.lower} ${piece.label.toLowerCase()}. Enchantments and the name carry over, as with netherite.`,
      );
    }
    const key: JsonObject = isTool ? { X: material, '#': 'minecraft:stick' } : { X: material };
    return element(
      rl(namespace, `${path}_from_${material.slice(namespace.length + 1)}`),
      KINDS.recipe,
      {
        type: 'minecraft:crafting_shaped',
        category: 'equipment',
        pattern: [...piece.pattern],
        key,
        result: { id: pieceId, count: 1 },
      },
      `The vanilla ${piece.label.toLowerCase()} recipe with ${materialLower === name.lower ? name.plural : `${materialLower}s`}${isTool ? ' and sticks' : ''}.`,
    );
  };

  // Tools ----------------------------------------------------------------------------------
  const toolTier: string | JsonObject = isCustomTier
    ? {
        durability: Math.round(numberValue(values, 'custom_durability')),
        speed: tidy(numberValue(values, 'custom_speed')),
        attack_damage_bonus: tidy(numberValue(values, 'custom_attack_damage_bonus')),
        enchantment_value: Math.round(numberValue(values, 'custom_enchantment_value')),
        incorrect_blocks_for_drops: `#minecraft:incorrect_for_${minesLike.tag}_tool`,
        repair_items: `#${repairTag}`,
      }
    : tier.value;
  for (const piece of tools) {
    const id = rl(namespace, `${name.id}_${piece.value}`);
    const model = rl(namespace, `item/${name.id}_${piece.value}`);
    lang[itemKey(id)] = `${name.display} ${piece.label}`;
    add(
      element(
        id,
        KINDS.item,
        {
          format: 1,
          model,
          max_stack_size: 1,
          creative_tab:
            piece.value === 'sword' ? 'minecraft:combat' : 'minecraft:tools_and_utilities',
          components: { 'msm:tool': { type: piece.value, tier: structuredClone(toolTier) } },
        },
        isCustomTier
          ? `A new ${piece.label.toLowerCase()} of a custom tool material: its durability, mining speed, damage bonus and enchantability are the set's own, and it mines for drops what a ${minesLike.value} tool mines (the block tag incorrect_blocks_for_drops lists what it cannot).`
          : `A new ${piece.label.toLowerCase()} of the ${tier.value} tier: damage, speed, durability and what it mines are those of the vanilla ${tier.label.toLowerCase()} ${piece.label.toLowerCase()}.`,
      ),
      element(
        model,
        KINDS.model,
        { parent: 'minecraft:item/handheld', textures: { layer0: model } },
        `A handheld item model (held like a tool) drawn from textures/item/${name.id}_${piece.value}.png.`,
      ),
      recipeOf(id, piece, true),
    );
    assets.push(
      texture(
        namespace,
        `item/${name.id}_${piece.value}`,
        piece.value as PlaceholderPattern,
        colour,
      ),
    );
  }

  // Armour ---------------------------------------------------------------------------------
  const armourMaterial: JsonObject = {
    durability: armourStats.durability,
    defense: { ...armourStats.defense },
    enchantment_value: armourStats.enchantmentValue,
    toughness: armourStats.toughness,
    knockback_resistance: armourStats.knockbackResistance,
    ...(armourStats.sound === undefined ? {} : { equip_sound: armourStats.sound }),
    repair_items: `#${repairTag}`,
    equipment_asset: ids.equipment,
  };
  for (const piece of armour) {
    const id = rl(namespace, `${name.id}_${piece.value}`);
    const model = rl(namespace, `item/${name.id}_${piece.value}`);
    lang[itemKey(id)] = `${name.display} ${piece.label}`;
    add(
      element(
        id,
        KINDS.item,
        {
          format: 1,
          model,
          max_stack_size: 1,
          creative_tab: 'minecraft:combat',
          components: {
            'msm:armor': { slot: piece.value, material: structuredClone(armourMaterial) },
          },
        },
        `A new ${piece.label.toLowerCase()} of a custom armour material${armourBase === undefined ? '' : ` with the numbers of vanilla ${armourBase.value}`}: ${armourStats.defense[piece.value]} armour points, durability ${armourStats.durability} times the ${piece.label.toLowerCase()}'s multiplier. equipment_asset names ${ids.equipment}, which draws it on the player.`,
      ),
      element(
        model,
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: model } },
        `A flat item model drawn from textures/item/${name.id}_${piece.value}.png.`,
      ),
      recipeOf(id, piece, false),
    );
    assets.push(
      texture(
        namespace,
        `item/${name.id}_${piece.value}`,
        piece.value as PlaceholderPattern,
        colour,
      ),
    );
  }
  if (armour.length > 0) {
    add(
      element(
        ids.equipment,
        KINDS.equipment,
        {
          layers: {
            humanoid: [{ texture: material }],
            humanoid_leggings: [{ texture: material }],
          },
        },
        `How the armour looks when worn; the armour pieces name it in equipment_asset. The texture id ${material} names one file in each layer folder: humanoid draws the helmet, chestplate and boots from textures/entity/equipment/humanoid/${name.id}.png; humanoid_leggings draws the leggings from textures/entity/equipment/humanoid_leggings/${name.id}.png. Both are 64 by 32 placeholders in the vanilla armour layout: paint over them, or replace them with textures from Blockbench.`,
      ),
    );
    assets.push(
      {
        namespace,
        path: `textures/entity/equipment/humanoid/${name.id}.png`,
        bytes: armorLayerPng(1, colour),
      },
      {
        namespace,
        path: `textures/entity/equipment/humanoid_leggings/${name.id}.png`,
        bytes: armorLayerPng(2, colour),
      },
    );
  }

  // Vanilla item tags ------------------------------------------------------------------------
  for (const piece of [...tools, ...armour]) {
    add(
      element(
        `minecraft:${piece.tag}`,
        KINDS.tagItem,
        { values: [rl(namespace, `${name.id}_${piece.value}`)] },
        `Adds the ${name.lower} ${piece.label.toLowerCase()} to the vanilla tag #minecraft:${piece.tag}. The game uses it to decide which enchantments the piece takes (the enchantable tags list this one)${piece.tag.endsWith('armor') ? ' and that armour trims apply' : ''}. Vanilla items stay in the tag: a tag file only adds unless it sets replace.`,
      ),
    );
  }

  add(
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      Object.fromEntries(Object.entries(lang).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      'The English names of everything the set adds. Another language file (for example de_de) can name them in that language.',
    ),
  );
  return { elements, assets };
}

/** The ids of a gear set whose material id is `materialId`. */
export function gearSetIds(namespace: string, materialId: string) {
  return {
    material: rl(namespace, materialId),
    ore: rl(namespace, `${materialId}_ore`),
    block: rl(namespace, `${materialId}_block`),
    repairTag: rl(namespace, `${materialId}_repair_materials`),
    template: rl(namespace, `${materialId}_upgrade_smithing_template`),
    equipment: rl(namespace, `${materialId}_armor`),
  };
}
