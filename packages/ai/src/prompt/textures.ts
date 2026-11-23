/** The textures topic (B681; the app's picture buttons by their labels, B682). */
import { APP_MAP_LABELS } from './app-map';

/** A recipe id and its words in the prompt. */
type PromptRecipe = readonly [id: string, words: string];

const rows = (...entries: PromptRecipe[]): readonly PromptRecipe[] => Object.freeze(entries);

/**
 * The drawn recipes of `create_texture` in words, by family (ADR 0092 D15), for the system
 * prompt. Every id of `ART_RECIPE_NAMES` is here once; a test keeps the two in step.
 */
export const TEXTURE_PROMPT_RECIPES: Readonly<
  Record<'blocks' | 'items' | 'worn' | 'icons', readonly PromptRecipe[]>
> = Object.freeze({
  blocks: rows(
    ['plain', 'a plain block'],
    ['stone', 'stone'],
    ['cobblestone', 'cobblestone'],
    ['polished_stone', 'polished stone'],
    ['bricks', 'bricks'],
    ['pillar_side', 'a pillar side'],
    ['pillar_top', 'a pillar top'],
    ['ore', 'ore speckles on stone'],
    ['deepslate_ore', 'ore on deepslate'],
    ['block', 'a storage block, finish gem, metal or rough'],
    ['block_front', 'a furnace-like front'],
    ['bark', 'a log side'],
    ['log_top', 'a log end'],
    ['stripped_log', 'a stripped log side'],
    ['stripped_log_top', 'a stripped log end'],
    ['planks', 'planks'],
    ['door_top', 'a door top'],
    ['door_bottom', 'a door bottom'],
    ['trapdoor', 'a trapdoor'],
    ['leaves', 'leaves'],
    ['sapling', 'a sapling, also its item'],
    ['crop_stage0', 'crop sprouts'],
    ['crop_stage1', 'a young crop'],
    ['crop_stage2', 'a growing crop'],
    ['crop_stage3', 'a ripe crop, the second colour its fruit'],
    ['portal', 'a see-through portal surface'],
    ['portal_frame', 'a portal frame'],
    ['dirt', 'dirt'],
    ['grass_top', 'a grass top'],
    ['grass_side', 'a grass side'],
    ['sand', 'sand'],
    ['gravel', 'gravel'],
    [
      'strand',
      'a kelp- or vine-like strand, finish body, tip, berries or berrytip, the second colour its berries',
    ],
    ['stalk', 'a plant stalk, finish cane, cactus, cactustop, bamboo or leaves'],
    ['lichen', 'a lichen over a face, the second colour its glowing specks'],
    ['dripleaf', 'a dripleaf, finish top, side or stem'],
    ['pot', 'the clay of a flower pot'],
    ['lucky_block', 'a lucky block, the second colour its mark, finish question or star'],
  ),
  items: rows(
    ['gem', 'a gem'],
    ['ingot', 'an ingot'],
    ['disc', 'a music disc, the second colour its label'],
    ['spawn_egg', 'a spawn egg, the second colour its spots'],
    ['sword', 'a sword'],
    ['pickaxe', 'a pickaxe'],
    ['axe', 'an axe'],
    ['shovel', 'a shovel'],
    ['hoe', 'a hoe'],
    ['spear', 'a spear'],
    ['mace', 'a mace'],
    ['knife', 'a throwing knife'],
    ['boomerang', 'a boomerang'],
    ['ball', 'a ball'],
    ['bow', 'a bow'],
    ['bow_pulling_0', 'a bow pulled a little'],
    ['bow_pulling_1', 'further'],
    ['bow_pulling_2', 'all the way'],
    ['crossbow', 'a crossbow'],
    ['crossbow_pulling_0', 'a crossbow pulled a little'],
    ['crossbow_pulling_1', 'further'],
    ['crossbow_pulling_2', 'all the way'],
    ['crossbow_arrow', 'a crossbow with a bolt'],
    ['crossbow_firework', 'a crossbow with a rocket'],
    ['shield', 'a shield'],
    ['bottle', 'a bottle'],
    ['flask', 'a flask'],
    ['totem', 'a totem'],
    ['smithing_template', 'a smithing template'],
    ['horse_armor', 'horse armour'],
    ['wolf_armor', 'wolf armour'],
    ['helmet', 'a helmet'],
    ['chestplate', 'a chestplate'],
    ['leggings', 'leggings'],
    ['boots', 'boots'],
    ['fruit', 'a fruit, the second colour its leaf'],
    ['pie', 'a pie'],
    ['seeds', 'seeds'],
    ['produce', 'a vegetable, the second colour its leaves'],
    ['pattern_sheet', 'a banner pattern item'],
    ['pottery_sherd', 'a pottery sherd'],
    ['glider', 'a glider item'],
    ['boat', 'a boat item in the wood colour, finish boat or chest (a chest boat)'],
    ['flag', 'a flag on a pole'],
    ['timer', 'a stopwatch'],
  ),
  worn: rows(
    ['armor_layer_1', 'worn helmet, chestplate and boots, 64 by 32'],
    ['armor_layer_2', 'worn leggings, 64 by 32'],
    ['horse_armor_layer', 'worn horse armour, 64 by 64'],
    ['wolf_armor_layer', 'worn wolf armour, 64 by 32'],
    [
      'banner_pattern',
      'a banner pattern under textures/entity/banner, 64 by 64, drawn pale since the game dyes it, finish diamond, ring, chevrons or star',
    ],
    ['shield_pattern', 'the same on a shield under textures/entity/shield, 64 by 64'],
    [
      'trim_layer_1',
      'an armour trim under textures/trims/entity/humanoid, 64 by 32, finish bands, edges or studs',
    ],
    ['trim_layer_2', 'its leggings layer under textures/trims/entity/humanoid_leggings'],
    ['glider_wings', 'glider wings under textures/entity/equipment/wings, 64 by 32'],
    [
      'pot_pattern',
      'a decorated pot face under textures/entity/decorated_pot, 16 by 16, finish sun, fish or leaf',
    ],
    [
      'boat_layer',
      'a boat under textures/entity/boat/<wood>, 128 by 64, boards of the wood colour edge to edge',
    ],
    ['chest_boat_layer', 'the same for a chest boat under textures/entity/chest_boat, 128 by 128'],
    [
      'villager_robe',
      'a villager look under textures/entity/villager/type, 64 by 64, the second colour its hem, finish hem or sash',
    ],
  ),
  icons: rows(
    ['effect_icon', 'a status effect icon, 18 by 18, finish drop, heart, star, flame or swirl'],
    ['particle_spark', 'a spark'],
    ['particle_orb', 'a glowing orb'],
    ['particle_puff', 'a puff of smoke'],
    ['particle_leaf', 'a falling leaf'],
  ),
});

/**
 * How the prompt writes one recipe: its id, then its words in brackets unless they only repeat
 * the id ("a sword" for `sword`, "a door top" for `door_top`).
 */
export const recipeInWords = ([id, words]: PromptRecipe): string =>
  words.replace(/^an? /, '') === id.replaceAll('_', ' ') ? id : `${id} (${words})`;

const recipes = (entries: readonly PromptRecipe[]): string => entries.map(recipeInWords).join(', ');

/** How textures are made (ADR 0092 D15): drawn by MSM, never copied, and the recipes. */
export const TEXTURES = `- Textures come only from create_texture, which draws them in MSM in a Minecraft-like style (a few hue-shifted shades of each colour, light from the top left, a dark outline on items): MSM's own drawings, never copied, traced or recoloured from Mojang's textures. Give a recipe, the main colour and, where it takes one, a second colour (accent), a finish and a seed for another variation; the size follows the recipe. Blocks, 16 by 16 under textures/block: ${recipes(TEXTURE_PROMPT_RECIPES.blocks)}. Items, 16 by 16 under textures/item: ${recipes(TEXTURE_PROMPT_RECIPES.items)}. Worn pictures under textures/entity/equipment (humanoid, humanoid_leggings, horse_body, wolf_body): ${recipes(TEXTURE_PROMPT_RECIPES.worn)}. Icons and particles: ${recipes(TEXTURE_PROMPT_RECIPES.icons)} (particles are 8 by 8 under textures/particle; each call draws the first of four frames). Pick the recipe for what the thing is (a frost sword is "sword" in a pale blue, its ore "ore" in the same colour) and use one colour across a set. A trim layer you draw has no palette file, so it does not recolour with the trim material: prefer the Armour trim flow, which writes one. Tell the user the pictures were drawn by MSM and that they can redraw them with "${APP_MAP_LABELS.draw}" or paint over them, or make one with "${APP_MAP_LABELS.makeWithAi}" (see the app, below).`;
