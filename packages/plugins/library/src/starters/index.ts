/**
 * The library's project starters (ADR 0020), in list order.
 */
import type {
  BundleContext,
  ContentBundle,
  Json,
  OutputLayer,
  ProjectStarter,
  StarterCreatorInfo,
  StarterParameter,
  TargetFacts,
} from '@msm/plugin-api';
import { kindsOf } from '../content/bundle';
import { PROBE_CONTEXT } from '../content/probe';
import { hasGeckolib } from '../content/supports';
import { CONSUMABLE_PARAMETERS, consumableBundle } from './consumable';
import { CROP_PARAMETERS, cropBundle } from './crop';
import { customBiomeBundle } from './custom-biome';
import { CUSTOM_MOB_PARAMETERS, customMobBundle } from './custom-mob';
import { CUSTOM_ORE_PARAMETERS, customOreBundle } from './custom-ore';
import { CUSTOM_SWORD_PARAMETERS, customSwordBundle } from './custom-sword';
import { DIMENSION_PARAMETERS, dimensionBundle } from './dimension';
import { ENCHANTMENT_PARAMETERS, enchantmentBundle } from './enchantment';
import { EXTRA_DROP_PARAMETERS, extraDropBundle } from './extra-drop';
import { FOOD_PARAMETERS, foodBundle } from './food';
import { functionStarterBundle } from './function-starter';
import { GEAR_SET_PARAMETERS, gearSetBundle } from './gear-set';
import { GOAT_HORN_PARAMETERS, goatHornBundle } from './goat-horn';
import { jigsawStructureBundle } from './jigsaw-structure';
import { MOB_SKIN_PARAMETERS, mobSkinBundle } from './mob-skin';
import { musicDiscBundle } from './music-disc';
import { MUSIC_DISC_ITEM_PARAMETERS, musicDiscItemBundle } from './music-disc-item';
import { blankBundle, combinedBundle, dataPackBundle, resourcePackBundle } from './packs';
import { PAINTING_PARAMETERS, paintingBundle } from './painting';
import { POTION_PARAMETERS, potionBundle } from './potion';
import { recipePackBundle } from './recipe-pack';
import { SCRIPTED_ITEM_PARAMETERS, scriptedItemBundle } from './scripted-item';
import { scriptedOreBundle } from './scripted-ore';
import { SIMPLE_BLOCK_PARAMETERS, simpleBlockBundle } from './simple-block';
import { STATUS_EFFECT_PARAMETERS, statusEffectBundle } from './status-effect';
import { STONE_SET_PARAMETERS, stoneSetBundle } from './stone-set';
import { THROWABLE_PARAMETERS, throwableBundle } from './throwable';
import { TOTEM_PARAMETERS, totemBundle } from './totem';
import { TREE_PARAMETERS, treeBundle } from './tree';
import { VILLAGER_TRADE_PARAMETERS, villagerTradeBundle } from './villager-trade';
import { WEAPON_PARAMETERS, weaponBundle } from './weapon';
import { WOOD_SET_PARAMETERS, woodSetBundle } from './wood-set';
import { worldgenPackBundle } from './worldgen-pack';

export { CONSUMABLE_PARAMETERS, consumableBundle } from './consumable';
export { CROP_PARAMETERS, cropBundle } from './crop';
export { customBiomeBundle, customBiomeContent, customBiomeIds } from './custom-biome';
export { CUSTOM_MOB_PARAMETERS, customMobBundle } from './custom-mob';
export { CUSTOM_ORE_PARAMETERS, customOreBundle } from './custom-ore';
export { CUSTOM_SWORD_PARAMETERS, customSwordBundle } from './custom-sword';
export { DIMENSION_PARAMETERS, dimensionBundle } from './dimension';
export { ENCHANTMENT_PARAMETERS, enchantmentBundle } from './enchantment';
export { EXTRA_DROP_PARAMETERS, EXTRA_DROP_TABLES, extraDropBundle } from './extra-drop';
export { FOOD_PARAMETERS, foodBundle } from './food';
export { functionStarterBundle } from './function-starter';
export { GEAR_SET_PARAMETERS, gearSetBundle, gearSetIds, nearestTrimPalette } from './gear-set';
export { GOAT_HORN_PARAMETERS, goatHornBundle } from './goat-horn';
export { hamletIds, jigsawStructureBundle, jigsawStructureContent } from './jigsaw-structure';
export { MOB_SKIN_BIOMES, MOB_SKIN_PARAMETERS, mobSkinBundle } from './mob-skin';
export { musicDiscBundle, SONG } from './music-disc';
export { MUSIC_DISC_ITEM_PARAMETERS, musicDiscItemBundle } from './music-disc-item';
export { blankBundle, combinedBundle, dataPackBundle, resourcePackBundle } from './packs';
export {
  PAINTING_MAX_BYTES,
  PAINTING_MAX_SIZE,
  PAINTING_PARAMETERS,
  paintingBundle,
} from './painting';
export {
  BREWING_INGREDIENTS,
  OWN_EFFECT,
  POTION_PARAMETERS,
  potionBundle,
} from './potion';
export { recipePackBundle } from './recipe-pack';
export {
  SCRIPTED_ITEM_PARAMETERS,
  scriptedItemBundle,
  scriptedItemIds,
} from './scripted-item';
export { scriptedOreBundle, scriptedOreIds } from './scripted-ore';
export { SIMPLE_BLOCK_PARAMETERS, simpleBlockBundle } from './simple-block';
export { STATUS_EFFECT_PARAMETERS, statusEffectBundle } from './status-effect';
export { STONE_SET_MEMBERS, STONE_SET_PARAMETERS, stoneSetBundle } from './stone-set';
export { THROWABLE_PARAMETERS, throwableBundle } from './throwable';
export { TOTEM_PARAMETERS, totemBundle } from './totem';
export { TREE_PARAMETERS, treeBundle } from './tree';
export { VILLAGER_TRADE_PARAMETERS, villagerTradeBundle } from './villager-trade';
export { WEAPON_PARAMETERS, WEAPON_TYPES, weaponBundle } from './weapon';
export { WOOD_SET_MEMBERS, WOOD_SET_PARAMETERS, woodSetBundle } from './wood-set';
export { worldgenPackBundle } from './worldgen-pack';

function starter(
  id: string,
  title: string,
  description: string,
  category: ProjectStarter['category'],
  layers: OutputLayer[],
  build: (context: BundleContext) => ContentBundle,
  options: {
    /** The targets the starter works on; omitted means every target (ADR 0036 D4). */
    supports?: (target: TargetFacts) => boolean;
    /** The wizard's questions (ADR 0040); omitted means no wizard. */
    parameters?: readonly StarterParameter[];
    /** Lists the starter in the Creator (ADR 0043 D1); omitted means New project only. */
    creator?: StarterCreatorInfo;
    /**
     * More answers whose bundles use kinds the default bundle does not (a choice that builds
     * different content); `requiresKinds` is the union over the default and these.
     */
    probeValues?: readonly Readonly<Record<string, Json>>[];
  } = {},
): ProjectStarter {
  const kinds = new Set(kindsOf(build(PROBE_CONTEXT)));
  for (const values of options.probeValues ?? []) {
    for (const kind of kindsOf(build({ ...PROBE_CONTEXT, values }))) kinds.add(kind);
  }
  const entry: ProjectStarter = {
    id,
    title,
    description,
    category,
    layers,
    requiresKinds: [...kinds].sort(),
    build,
  };
  if (options.parameters !== undefined) {
    entry.parameters = options.parameters.map((parameter) => structuredClone(parameter));
  }
  if (options.creator !== undefined) entry.creator = { ...options.creator };
  if (options.supports !== undefined) entry.supports = options.supports;
  return Object.freeze(entry);
}

const BOTH: OutputLayer[] = ['resourcepack', 'datapack'];

/** The project starters, in list order. */
export const libraryStarters: readonly ProjectStarter[] = Object.freeze([
  starter(
    'blank',
    'Blank project',
    'An empty project with only its pack.mcmeta. Add elements yourself.',
    'blank',
    BOTH,
    blankBundle,
  ),
  starter(
    'resource_pack',
    'Resource pack',
    'A minimal resource pack: the vanilla stick gets a new model, texture and English name.',
    'pack',
    ['resourcepack'],
    resourcePackBundle,
  ),
  starter(
    'data_pack',
    'Data pack',
    'A minimal data pack: a load message, a function to run and one crafting recipe.',
    'pack',
    ['datapack'],
    dataPackBundle,
  ),
  starter(
    'combined',
    'Resource and data pack',
    'Both minimal packs in one project: the painted stick plus the load message, function and recipe.',
    'pack',
    BOTH,
    combinedBundle,
  ),
  starter(
    'custom_ore',
    'Custom ore',
    'A real ruby ore block that drops rubies when mined with an iron pickaxe, the ruby item and a block of ruby: textures, models, a loot table, recipes, an item tag, advancements and the mod metadata. New blocks and items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    customOreBundle,
    {
      parameters: CUSTOM_ORE_PARAMETERS,
      creator: {
        group: 'blocks',
        blurb: 'An ore that drops gems, the gem item and a storage block, with recipes.',
      },
    },
  ),
  starter(
    'custom-sword',
    'Custom sword',
    'A new sword with its own name, colour, tier and durability: a handheld texture and model, a crafting recipe, its English name and the mod metadata. New items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    customSwordBundle,
    { parameters: CUSTOM_SWORD_PARAMETERS },
  ),
  starter(
    'gear-set',
    'Gear set',
    'Tools and armour of one new material: a sword, pickaxe, axe, shovel and hoe, a helmet, chestplate, leggings and boots (and, if you choose, a spear, mace, bow, crossbow, shield, horse armour and wolf armour), the material (from a new ore or as an ingot, optionally an armour trim material), recipes or smithing upgrades, the worn armour look and the vanilla tags. New items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    gearSetBundle,
    {
      parameters: GEAR_SET_PARAMETERS,
      creator: {
        group: 'gear',
        blurb: 'Tools and armour of one material, with recipes and the worn armour look.',
      },
    },
  ),
  starter(
    'simple-block',
    'Simple block',
    'One new block with its own name, colour, hardness, tool, light level and drops, a texture and model, and an optional recipe. New blocks need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    simpleBlockBundle,
    {
      parameters: SIMPLE_BLOCK_PARAMETERS,
      creator: {
        group: 'blocks',
        blurb: 'One block: how hard it is, what mines it, whether it glows and what it drops.',
      },
    },
  ),
  starter(
    'wood-set',
    'Wood set',
    'A whole new kind of wood: log, wood, stripped log and wood, planks, stairs, slab, fence, fence gate, door, trapdoor, button, pressure plate, leaves and a sapling that grows its own tree, with the vanilla recipes, tags, stripping, burning and composting, and if you choose the tree growing in the world. New blocks need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    woodSetBundle,
    {
      parameters: WOOD_SET_PARAMETERS,
      creator: {
        group: 'blocks',
        blurb: 'A whole wood set from log to sapling, with its tree, recipes and tags.',
      },
    },
  ),
  starter(
    'stone-set',
    'Stone set',
    'A new stone with its stairs, slab and wall, and if you choose a button, a pressure plate, polished stone, bricks and a pillar, with crafting and stonecutting recipes. New blocks need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    stoneSetBundle,
    {
      parameters: STONE_SET_PARAMETERS,
      creator: {
        group: 'blocks',
        blurb: 'A stone with its stairs, slab, wall and more, crafted and stonecut.',
      },
    },
  ),
  starter(
    'crop',
    'Crop',
    'A new crop that grows in stages on farmland: planted from its own seeds with a new food as its produce, or from the produce itself as carrots are, with its loot, composting, villager farming and, if you choose, wild patches in the world. New blocks need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    cropBundle,
    {
      parameters: CROP_PARAMETERS,
      creator: {
        group: 'blocks',
        blurb: 'A crop to farm: its stages, seeds and produce, and wild patches if you like.',
      },
      probeValues: [{ wild: true }],
    },
  ),
  starter(
    'tree',
    'Tree',
    'A sapling that grows a tree of its own, from a new log and new leaves or vanilla ones, in the shape you pick, and if you choose growing in the world. New blocks need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    treeBundle,
    {
      parameters: TREE_PARAMETERS,
      creator: {
        group: 'blocks',
        blurb: 'A sapling and the tree it grows, with new or vanilla log and leaves.',
      },
    },
  ),
  starter(
    'food',
    'Food',
    'A new food with its own name, colour, hunger and saturation, a texture and model, and an optional recipe. New items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    foodBundle,
    {
      parameters: FOOD_PARAMETERS,
      creator: { group: 'food', blurb: 'Something to eat: how much it fills and how it is made.' },
    },
  ),
  starter(
    'weapon',
    'Weapon',
    'One new weapon: a sword, spear, mace, bow, crossbow or shield with its own name, colour and stats, a texture and model, and an optional recipe. New items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    weaponBundle,
    {
      parameters: WEAPON_PARAMETERS,
      creator: {
        group: 'gear',
        blurb: 'One weapon: a sword, spear, mace, bow, crossbow or shield with its stats.',
      },
    },
  ),
  starter(
    'consumable',
    'Consumable',
    'A food with effects, a potion-like drink or a charm that gives effects when used: its effects, eating time, cooldown, texture and model, and an optional recipe. New items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    consumableBundle,
    {
      parameters: CONSUMABLE_PARAMETERS,
      creator: {
        group: 'food',
        blurb: 'A food, drink or charm that gives mob effects.',
      },
      probeValues: [{ kind: 'charm' }],
    },
  ),
  starter(
    'totem',
    'Totem',
    'An item that saves its holder from death like a totem of undying and gives the effects you choose, with a texture, model and optional recipe. New items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    totemBundle,
    {
      parameters: TOTEM_PARAMETERS,
      creator: {
        group: 'gear',
        blurb: 'A totem that saves its holder from death and gives effects.',
      },
    },
  ),
  starter(
    'status-effect',
    'Status effect',
    'A new status effect with its own name, colour and icon: what it does every few seconds, the stats it changes and how players get it (a drink or a throwable flask with an optional recipe, or a brewed potion). Custom effects need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    statusEffectBundle,
    {
      parameters: STATUS_EFFECT_PARAMETERS,
      creator: {
        group: 'magic',
        blurb:
          'A status effect with its icon, what it does, its stat changes and a drink, flask or potion.',
      },
      probeValues: [{ behaviour: 'function' }, { source: 'potion' }],
    },
  ),
  starter(
    'potion',
    'Potion',
    'A new potion for the brewing stand: the effect it gives (a vanilla one or a new one with its icon), how long and how strong, the ingredient that brews it, longer and stronger versions, and splash and lingering bottles with tipped arrows. Potions need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    potionBundle,
    {
      parameters: POTION_PARAMETERS,
      creator: {
        group: 'magic',
        blurb: 'A potion to brew, with longer, stronger, splash and lingering versions.',
      },
      probeValues: [{ effect: 'minecraft:speed' }],
    },
  ),
  starter(
    'throwable',
    'Throwable',
    'An item you throw: a ball, a knife you pick up again, a boomerang that comes back or a bomb, with its damage, speed, weight and what happens when it hits, a texture and model, and an optional recipe. New items need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    throwableBundle,
    {
      parameters: THROWABLE_PARAMETERS,
      creator: {
        group: 'gear',
        blurb: 'Something to throw: a ball, knife, boomerang or bomb and what it does on a hit.',
      },
    },
  ),
  starter(
    'enchantment',
    'Enchantment',
    'A new enchantment: what it goes on, its highest level, how rare it is and what it does, offered at the enchanting table. Works in a data pack.',
    'content',
    ['datapack'],
    enchantmentBundle,
    {
      parameters: ENCHANTMENT_PARAMETERS,
      creator: {
        group: 'gear',
        blurb: 'An enchantment with one effect that grows with its level.',
      },
    },
  ),
  starter(
    'painting',
    'Painting',
    'A new painting with its title, author, size and your own picture (or a placeholder landscape). Works in vanilla packs.',
    'content',
    BOTH,
    paintingBundle,
    {
      parameters: PAINTING_PARAMETERS,
      creator: {
        group: 'blocks',
        blurb: 'A painting of your own picture, from 1 by 1 to 4 by 4 blocks.',
      },
    },
  ),
  starter(
    'music-disc-item',
    'Music disc',
    'A new jukebox song and a music disc that plays it: a real disc item in the Fabric mod jar, or music disc 13 with a new look in vanilla packs. Import your own .ogg to hear your song.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    musicDiscItemBundle,
    {
      parameters: MUSIC_DISC_ITEM_PARAMETERS,
      creator: {
        group: 'blocks',
        blurb: 'A jukebox song with its own music disc.',
      },
      probeValues: [{ disc_type: 'vanilla' }],
    },
  ),
  starter(
    'dimension',
    'Dimension',
    'A new dimension to explore: pick the terrain, the biome and the sky, and travel there and back with a key item (Fabric mod jar) or a command (vanilla packs).',
    'content',
    ['datapack', 'resourcepack', 'msm'],
    dimensionBundle,
    {
      parameters: DIMENSION_PARAMETERS,
      creator: {
        group: 'worlds',
        blurb:
          'A world of its own, with the terrain, biome and sky you pick, and a key to get there.',
      },
      probeValues: [{ travel: 'command' }, { terrain: 'flat' }],
    },
  ),
  starter(
    'villager-trade',
    'Villager trade',
    'A new trade for a vanilla villager or the wandering trader: what it costs, what it gives and which profession and level offer it. Each villager draws only a few trades from its list, so the new trade is a candidate, not a certainty. Works in a data pack.',
    'content',
    ['datapack'],
    villagerTradeBundle,
    {
      parameters: VILLAGER_TRADE_PARAMETERS,
      creator: {
        group: 'worlds',
        blurb: 'A trade a villager may offer: the profession, level, price and item.',
      },
    },
  ),
  starter(
    'extra-drop',
    'Extra drop',
    'An extra item in the loot of a vanilla mob, block or chest, with a count, a chance and, for mobs, whether a player must make the kill. The vanilla drops stay. Extra drops need the Fabric mod jar export.',
    'content',
    ['msm'],
    extraDropBundle,
    {
      parameters: EXTRA_DROP_PARAMETERS,
      creator: {
        group: 'worlds',
        blurb: 'An extra item a vanilla mob, block or chest drops, with its chance.',
      },
    },
  ),
  starter(
    'mob-skin',
    'Mob skin',
    'A new skin for a vanilla wolf, cat, pig, cow, chicken or frog, with placeholder textures of the right size to paint over, appearing in a biome you choose or everywhere. Works in vanilla packs.',
    'content',
    BOTH,
    mobSkinBundle,
    {
      parameters: MOB_SKIN_PARAMETERS,
      creator: {
        group: 'mobs',
        blurb: 'A new skin for a wolf, cat, pig, cow, chicken or frog, and where it appears.',
      },
      probeValues: ['cat', 'pig', 'cow', 'chicken', 'frog'].map((animal) => ({ animal })),
    },
  ),
  starter(
    'goat-horn',
    'Goat horn',
    'A new goat horn call: its name, a vanilla sound or your own .ogg, how long it plays and how far it is heard, a recipe and, if you choose, goats dropping it. Works in vanilla packs.',
    'content',
    BOTH,
    goatHornBundle,
    {
      parameters: GOAT_HORN_PARAMETERS,
      creator: {
        group: 'gear',
        blurb: 'A goat horn with its own call, length and range, and how to get it.',
      },
    },
  ),
  starter(
    'recipe_pack',
    'Recipe pack',
    'Shaped, shapeless, smelting, blasting and stonecutting recipes, an item tag used as an ingredient and an advancement for crafting.',
    'content',
    ['datapack'],
    recipePackBundle,
  ),
  starter(
    'music_disc',
    'Custom music disc',
    'A new jukebox song on a music disc with its own texture, plus a function that gives the disc. It plays a vanilla track until you import your own .ogg.',
    'content',
    BOTH,
    musicDiscBundle,
  ),
  starter(
    'function_starter',
    'Functions',
    'Load and tick functions wired to #minecraft:load and #minecraft:tick, a scoreboard, and a function tag of your own.',
    'content',
    ['datapack'],
    functionStarterBundle,
  ),
  starter(
    'custom_biome',
    'Custom biome',
    'A new biome, Amber Woods, with its own tree and copper ore, reached through a World Type of its own: choose it under More > World Type when creating a world. A data pack cannot add a biome to the normal overworld, so the World Type lists the new biome beside a few vanilla ones.',
    'content',
    BOTH,
    customBiomeBundle,
  ),
  starter(
    'jigsaw_structure',
    'Jigsaw village-style structure',
    'A small hamlet built by jigsaw blocks: a centre hut, streets that follow the terrain and lamp posts, with four template pools, a structure set and a biome tag that places it in forests.',
    'content',
    ['datapack'],
    jigsawStructureBundle,
  ),
  starter(
    'worldgen_pack',
    'Custom biome with a jigsaw structure',
    'Both worldgen starters in one project: the Amber Woods biome and World Type, and jigsaw hamlets that generate in Amber Woods and in every vanilla forest.',
    'content',
    BOTH,
    worldgenPackBundle,
  ),
  starter(
    'custom_mob',
    'Custom mob',
    'An animated Ruby Golem that wanders forests, fights back when hit and drops emeralds: its GeckoLib model, animations, texture and spawn egg, a loot table, a death function and the mod metadata. New mobs need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    customMobBundle,
    {
      supports: hasGeckolib,
      parameters: CUSTOM_MOB_PARAMETERS,
      creator: {
        group: 'mobs',
        blurb: 'An animated mob with its behaviour, spawning, spawn egg and drops.',
      },
    },
  ),
  starter(
    'scripted_ore',
    'Scripted ore',
    'The Custom ore starter with scripts: sneak-using ruby ore gives a bonus ruby, standing on a block of ruby heals you through a run_script action, and joining players are greeted. Scripts need the Fabric mod jar export and are not part of the Java project export.',
    'content',
    ['resourcepack', 'datapack', 'msm'],
    scriptedOreBundle,
  ),
  starter(
    'scripted-item',
    'Scripted behaviour',
    'An item that runs a script when used: it heals you, launches you upward, strikes lightning where you look or gives you an effect. The script opens in the Script Studio for editing. Scripts need the Fabric mod jar export.',
    'content',
    ['resourcepack', 'msm'],
    scriptedItemBundle,
    {
      parameters: SCRIPTED_ITEM_PARAMETERS,
      creator: {
        group: 'scripts',
        blurb: 'An item whose use runs a script you can open and change.',
      },
    },
  ),
]);
