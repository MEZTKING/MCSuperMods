/**
 * The Custom ore starter (ADR 0020, D4; ADR 0025; wizard parameters ADR 0040 D2). A real ore:
 * an `msm:block` ore mined with a pickaxe of the chosen tier or better that drops `msm:item`
 * gems through a loot table element, an optional storage block with its recipes, an item tag,
 * two advancements, models, placeholder textures and the `msm:mod` metadata. The defaults
 * build the ruby ore, rubies and block of ruby of earlier versions byte for byte. New blocks
 * and items need the Fabric mod jar export (with `msm_runtime`); the vanilla pack exports carry
 * only the models, textures, language keys, loot tables, tags, recipes and advancements.
 *
 * Step "World" (ADR 0060 D6): with "generate" on (the default) the ore also generates in every
 * overworld biome: an ore feature that replaces stone and deepslate, a placed feature with the
 * veins per chunk and height range, and an `msm:biome_addition` that adds it at the
 * underground ores step. The two worldgen files go in the data pack too; the biome addition
 * exists only in the Fabric mod jar. With "generate" off the bundle is the one of earlier
 * versions byte for byte: the three elements are left out and nothing else changes.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  StarterParameter,
} from '@msm/plugin-api';
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
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  type NameForms,
  nameForms,
  numberValue,
  numberWord,
  type ParameterValues,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The Custom ore wizard's questions (ADR 0040 D2), steps "Ore", "Drops" and "World" (ADR 0060 D6). */
export const CUSTOM_ORE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'ore_name',
    label: 'Gem name',
    description:
      'The name of the gem the ore drops. Ids derive from it: Ruby gives ruby_ore, ruby and ruby_block.',
    group: 'Ore',
    type: 'string',
    default: 'Ruby',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour of the placeholder textures of the ore, the gem and the block.',
    group: 'Ore',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'tool_tier',
    label: 'Pickaxe needed',
    description: 'The weakest pickaxe that mines the ore and gets the gems.',
    group: 'Ore',
    type: 'choice',
    default: 'iron',
    choices: [
      { value: 'stone', label: 'Stone pickaxe' },
      { value: 'iron', label: 'Iron pickaxe' },
      { value: 'diamond', label: 'Diamond pickaxe' },
    ],
  },
  {
    id: 'make_block',
    label: 'Add a storage block',
    description: 'A block of nine gems, with the recipes to make it and take it apart.',
    group: 'Ore',
    type: 'boolean',
    default: true,
  },
  {
    id: 'drop_min',
    label: 'Fewest gems per ore',
    group: 'Drops',
    type: 'number',
    default: 1,
    min: 1,
    max: 9,
    step: 1,
  },
  {
    id: 'drop_max',
    label: 'Most gems per ore',
    description: 'Fortune adds more on top. A value below the fewest is treated as equal to it.',
    group: 'Drops',
    type: 'number',
    default: 2,
    min: 1,
    max: 9,
    step: 1,
  },
  {
    id: 'generate',
    label: 'Generate in the world',
    description:
      'The ore appears underground in every overworld biome, in newly generated chunks only. Needs the Fabric mod jar export.',
    group: 'World',
    type: 'boolean',
    default: true,
  },
  {
    id: 'vein_size',
    label: 'Vein size',
    description: 'How many ore blocks one vein holds at most (iron ore uses 9, diamond ore 4).',
    group: 'World',
    type: 'number',
    default: 6,
    min: 1,
    max: 32,
    step: 1,
  },
  {
    id: 'veins_per_chunk',
    label: 'Veins per chunk',
    description: 'How many veins each chunk tries to place (iron ore uses 10).',
    group: 'World',
    type: 'number',
    default: 6,
    min: 1,
    max: 32,
    step: 1,
  },
  {
    id: 'min_y',
    label: 'Lowest height',
    description: 'The lowest y the veins appear at; the overworld starts at y -64.',
    group: 'World',
    type: 'number',
    default: -64,
    min: -64,
    max: 320,
    step: 1,
  },
  {
    id: 'max_y',
    label: 'Highest height',
    description:
      'The highest y the veins appear at. A value below the lowest is treated as equal to it.',
    group: 'World',
    type: 'number',
    default: 32,
    min: -64,
    max: 320,
    step: 1,
  },
]);

/** "one or two rubies", "three rubies", "one to nine rubies". */
function countPhrase(min: number, max: number, singular: string, plural: string): string {
  if (min === max) return `${numberWord(min)} ${min === 1 ? singular : plural}`;
  const joiner = max === min + 1 ? 'or' : 'to';
  return `${numberWord(min)} ${joiner} ${numberWord(max)} ${plural}`;
}

export function customOreBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(CUSTOM_ORE_PARAMETERS, context);
  const gem = nameForms(stringValue(values, 'ore_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const tier = stringValue(values, 'tool_tier');
  const makeBlock = booleanValue(values, 'make_block');
  const first = Math.round(numberValue(values, 'drop_min'));
  const second = Math.round(numberValue(values, 'drop_max'));
  const dropMin = Math.min(first, second);
  const dropMax = Math.max(first, second);
  const isRuby = gem.id === 'ruby';
  const generate = booleanValue(values, 'generate');

  const ore = rl(namespace, `${gem.id}_ore`);
  const ruby = rl(namespace, gem.id);
  const block = rl(namespace, `${gem.id}_block`);
  const oreModel = rl(namespace, `block/${gem.id}_ore`);
  const blockModel = rl(namespace, `block/${gem.id}_block`);
  const rubyModel = rl(namespace, `item/${gem.id}`);
  const oreLoot = rl(namespace, `blocks/${gem.id}_ore`);
  const gems = rl(namespace, 'gems');
  const root = rl(namespace, 'root');
  const contents = makeBlock
    ? `${gem.lower} ore, ${gem.plural} and a block of ${gem.lower}`
    : `${gem.lower} ore and ${gem.plural}`;
  const blockOnly = (...entries: ContentBundleElement[]): ContentBundleElement[] =>
    makeBlock ? entries : [];
  return {
    elements: [
      packElement(
        namespace,
        `${projectName}: ${contents}`,
        'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out and puts the same assets and data inside the jar.',
      ),
      element(
        rl(namespace, 'mod'),
        KINDS.mod,
        {
          mod_id: modIdFromNamespace(namespace),
          version: '1.0.0',
          name: projectName,
          description: `Adds ${contents}.`,
          authors: [],
          licence: 'All-Rights-Reserved',
        },
        'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. New blocks and items exist only in that jar, which also needs Fabric API and msm_runtime (nested in the jar unless you choose a separate runtime). The mod id must stay unique among the mods you install.',
      ),
      element(
        ore,
        KINDS.block,
        {
          format: 1,
          model: oreModel,
          display_name: `${gem.display} Ore`,
          sound_type: 'stone',
          loot: oreLoot,
          item: { creative_tab: 'minecraft:natural_blocks' },
          components: {
            'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: tier },
            'msm:light_emitter': { level: 3 },
          },
        },
        `A new block. tool and min_tier put it in the pickaxe and ${tier}-tool tags, so it mines quickly with a pickaxe and drops nothing unless the pickaxe is ${tier} or better. It gives off a faint light (level 3). loot points at the loot table element below, which drops ${gem.plural} instead of the ore.`,
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
                  name: ruby,
                  modifier: [
                    {
                      type: 'minecraft:set_count',
                      count: { type: 'minecraft:uniform', min: dropMin, max: dropMax },
                    },
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
        `What ${gem.lower} ore drops: ${countPhrase(dropMin, dropMax, gem.lower, gem.plural)}, more with Fortune, nothing when blown up. The ore block names this table in its loot field. This simple table has no Silk Touch branch, so the ore never drops itself.`,
      ),
      element(
        ruby,
        KINDS.item,
        {
          format: 1,
          model: rubyModel,
          display_name: gem.display,
          max_stack_size: 64,
          creative_tab: 'minecraft:ingredients',
        },
        `A new item with its own model and English name. The display name becomes the item.<namespace>.${gem.id} language key when you export.`,
      ),
      ...blockOnly(
        element(
          block,
          KINDS.block,
          {
            format: 1,
            model: blockModel,
            display_name: `Block of ${gem.display}`,
            sound_type: 'metal',
            loot: 'self',
            item: { creative_tab: 'minecraft:building_blocks' },
            components: {
              'msm:breakable': { hardness: 5, resistance: 6, tool: 'pickaxe', min_tier: tier },
            },
          },
          `A storage block for nine ${gem.plural}. "loot": "self" generates a loot table that drops the block itself. Its block item shares its id, so recipes refer to it by the block id.`,
        ),
      ),
      element(
        oreModel,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: oreModel } },
        `A full cube with the same texture on every side. The texture id names textures/block/${gem.id}_ore.png in this namespace; paint over it to restyle the ore.`,
      ),
      ...blockOnly(
        element(
          blockModel,
          KINDS.model,
          { parent: 'minecraft:block/cube_all', textures: { all: blockModel } },
          `The block of ${gem.lower}: a full cube drawn from textures/block/${gem.id}_block.png.`,
        ),
      ),
      element(
        rubyModel,
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: rubyModel } },
        `A flat item model drawn from textures/item/${gem.id}.png.`,
      ),
      ...blockOnly(
        element(
          rl(namespace, `${gem.id}_block_from_${gem.idPlural}`),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'building',
            pattern: ['RRR', 'RRR', 'RRR'],
            key: { R: ruby },
            result: { id: block, count: 1 },
          },
          `Nine ${gem.plural} make a block of ${gem.lower}. Element ids are unique across kinds, so the recipe cannot share the block's id ${gem.id}_block and has a name of its own.`,
        ),
        element(
          rl(namespace, `${gem.id}_from_block`),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shapeless',
            category: 'misc',
            ingredients: [block],
            result: { id: ruby, count: 9 },
          },
          `The way back: a block of ${gem.lower} anywhere in the grid gives nine ${gem.plural}.`,
        ),
      ),
      element(
        rl(namespace, `${gem.id}_from_smelting`),
        KINDS.recipe,
        {
          type: 'minecraft:smelting',
          category: 'misc',
          ingredient: ore,
          result: { id: ruby },
          experience: 1,
          cookingtime: 200,
        },
        `Smelting ${gem.lower} ore (picked up with Silk Touch from another mod, or from the creative menu) gives ${articleFor(gem.lower)} ${gem.lower}.`,
      ),
      element(
        gems,
        KINDS.tagItem,
        { values: [ruby, 'minecraft:emerald', 'minecraft:diamond', 'minecraft:amethyst_shard'] },
        `An item tag: one name for several items. Recipes and advancements refer to it as #${gems}.`,
      ),
      element(
        root,
        KINDS.advancement,
        {
          display: {
            icon: { id: ruby },
            title: 'Gem Collector',
            description: 'Pick up any gem',
            background: 'minecraft:gui/advancements/backgrounds/stone',
            frame: 'task',
            show_toast: false,
            announce_to_chat: false,
          },
          criteria: {
            has_gem: {
              trigger: 'minecraft:inventory_changed',
              conditions: { items: [{ items: `#${gems}` }] },
            },
          },
        },
        'The root of a new advancement tab: it has a background and no parent. It is granted when any item of the gems tag enters the inventory.',
      ),
      element(
        rl(namespace, `get_${gem.id}`),
        KINDS.advancement,
        {
          parent: root,
          display: {
            icon: { id: ruby },
            // "Red Gold" is the ruby's own title; other gems get a plain one.
            title: isRuby ? 'Red Gold' : `${gem.display} Miner`,
            description: `Mine ${articleFor(gem.lower)} ${gem.lower}`,
            frame: 'goal',
          },
          criteria: {
            [`has_${gem.id}`]: {
              trigger: 'minecraft:inventory_changed',
              conditions: { items: [{ items: ruby }] },
            },
          },
        },
        `A child advancement under the root. It shows a toast and a chat message when you first hold ${articleFor(gem.lower)} ${gem.lower}.`,
      ),
      ...(generate ? generationElements(namespace, gem, ore, values) : []),
    ],
    assets: [
      texture(namespace, `block/${gem.id}_ore`, 'ore', colour),
      ...(makeBlock ? [texture(namespace, `block/${gem.id}_block`, 'plain', colour)] : []),
      texture(namespace, `item/${gem.id}`, 'gem', colour),
    ],
  };
}

/**
 * The three world generation elements (ADR 0060 D6): the ore feature, its placed feature and
 * the biome addition that puts it into every overworld biome.
 */
function generationElements(
  namespace: string,
  gem: NameForms,
  ore: string,
  values: ParameterValues,
): ContentBundleElement[] {
  const veinSize = Math.round(numberValue(values, 'vein_size'));
  const veins = Math.round(numberValue(values, 'veins_per_chunk'));
  const first = Math.round(numberValue(values, 'min_y'));
  const second = Math.round(numberValue(values, 'max_y'));
  const minY = Math.min(first, second);
  const maxY = Math.max(first, second);
  const feature = rl(namespace, `ore_${gem.id}`);
  const placed = rl(namespace, `ore_${gem.id}_placed`);
  const addition = rl(namespace, `${gem.id}_ore_generation`);
  const replace = (block: string) => ({
    target: { predicate_type: 'minecraft:block_match', block },
    state: ore,
  });
  return [
    element(
      feature,
      KINDS.feature,
      {
        type: 'minecraft:ore',
        size: veinSize,
        discard_chance_on_air_exposure: 0,
        targets: [replace('minecraft:stone'), replace('minecraft:deepslate')],
      },
      `A configured ore feature: one vein of up to ${veinSize} ${gem.lower} ore blocks. Each target replaces one kind of block, here stone and deepslate, with the ore. On its own a feature places nothing: the placed feature ${placed} says where and how often.`,
    ),
    element(
      placed,
      KINDS.placedFeature,
      {
        feature,
        placement: [
          { type: 'minecraft:count', count: veins },
          { type: 'minecraft:in_square' },
          {
            type: 'minecraft:height_range',
            height: {
              type: 'minecraft:uniform',
              min_inclusive: { absolute: minY },
              max_inclusive: { absolute: maxY },
            },
          },
          { type: 'minecraft:biome' },
        ],
      },
      `Where the ore goes: ${veins} tries per chunk (count), each moved to a random spot in the chunk (in_square) and to a random height from y ${minY} to y ${maxY} (height_range). The biome filter keeps it to the biomes that list it. The world addition ${addition} lists it in the overworld biomes.`,
    ),
    element(
      addition,
      KINDS.biomeAddition,
      {
        format: 1,
        biomes: ['#minecraft:is_overworld'],
        features: [{ feature: placed, step: 'underground_ores' }],
      },
      `A world addition: it adds the placed feature ${placed} to every biome in #minecraft:is_overworld at the underground ores step, as vanilla ores are, without replacing any vanilla file. Only chunks generated after you install the mod get the ore, so explore new land or start a new world. World additions need the Fabric mod jar export; the vanilla data pack carries the feature files but cannot add them to vanilla biomes.`,
    ),
  ];
}
