/**
 * The vanilla parity examples (ADR 0101 D3; B461): the per-kind examples of `msm:command` and
 * `msm:creative_tab` (ADR 0096), and five behaviour examples built from the new block types,
 * waterlogging, weathering, bags and bundles, commands and Rules: Cottage furniture (a bed, a
 * lantern, a torch, signs, a pot, a rug and a cupboard), Orchard and pie (a berry bush, a tall
 * flower and a pie), Copper roof (stairs and slabs in four ageing stages with waxed copies),
 * Adventurer's satchel (a bag, a bundle and a creative tab for them) and Server helper (commands
 * with a function and a rule book). Every block and item id differs from every other example's,
 * so the mirror projects hold them in one project. Pictures are the library's placeholders;
 * sign edit-screen pictures are placeholder boards. New blocks, items, commands and tabs
 * need the Fabric mod jar export.
 */
import type { ContentBundleElement, ExampleProject, Json, ResourceLocation } from '@msm/plugin-api';
import { artLookPng } from '../art/draw';
import type { Rgb } from '../assets/png';
import { artSeed, COLOURS, element, itemModel, KINDS, rl, texture } from '../content/bundle';
import { hasFabric } from '../content/supports';
import { defineExample } from './define';

const COMMAND_KIND = 'msm:command';
const CREATIVE_TAB_KIND = 'msm:creative_tab';
const RULES_KIND = 'msm:rules';
const VILLAGER_TYPE_KIND = 'msm:villager_type';
const GAME_RULE_KIND = 'msm:game_rule';
const STAT_KIND = 'msm:stat';
const FLUID_KIND = 'msm:fluid';

/** The Blossom villagers' clothes: cherry blossom pink with a cream hem and sash. */
const BLOSSOM_PINK: Rgb = [214, 120, 150];
const BLOSSOM_CREAM: Rgb = [232, 220, 180];

const BLOCKS = 'Blocks';
const ITEMS = 'Items';
const COMMANDS = 'Commands';
const JAR_ONLY =
  'It needs the Fabric mod jar export; the vanilla packs keep only its models, pictures and language keys.';

/** A block element with `format` 1 and the `soil` of its notes. */
const block = (
  id: ResourceLocation,
  data: Record<string, Json>,
  notes: string,
): ContentBundleElement => element(id, KINDS.block, { format: 1, ...data }, notes);

// Per-kind examples ---------------------------------------------------------------------------

/** The per-kind examples of `msm:command` and `msm:creative_tab`. */
export const vanillaParityKindExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_command',
    title: 'Command: /welcome',
    description:
      'A server command anyone can type, /welcome (or /hi), that plays a chime and answers in chat, with no function.',
    kind: COMMAND_KIND,
    category: COMMANDS,
    tags: ['command', 'event', 'feedback', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'welcome_command'),
          COMMAND_KIND,
          {
            format: 1,
            name: 'welcome',
            aliases: ['hi'],
            event: 'welcome',
            events: {
              welcome: {
                actions: [
                  { type: 'play_sound', sound: 'minecraft:block.note_block.chime' },
                  { type: 'spawn_particle', particle: 'minecraft:heart', count: 6, spread: 0.5 },
                ],
              },
            },
            feedback_text: 'Welcome! Have a nice stay.',
          },
          `A server command. "name" is the word typed after the slash and "aliases" are other words for it; neither may be a vanilla command. The command runs the event "welcome", which is declared in "events" with the same actions blocks and items use, as the player who typed it. "feedback_text" is the answer in chat (its language key is generated). To run a data pack function instead of an event, name it in "function" and set "permission" to 2 or more. ${JAR_ONLY}`,
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_msm_creative_tab',
    title: 'Creative tab: Curios',
    description:
      'A tab of its own in the creative inventory with a curio block in it, listed by name.',
    kind: CREATIVE_TAB_KIND,
    category: ITEMS,
    tags: ['creative tab', 'inventory', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => {
      const tab = rl(namespace, 'curios_tab');
      const curio = rl(namespace, 'curio_block');
      return {
        elements: [
          element(
            tab,
            CREATIVE_TAB_KIND,
            { format: 1, icon: curio, display_name: 'Curios', order: 'by_name' },
            'A creative inventory tab. "icon" is the item whose picture the tab shows (here the curio block\'s item); "display_name" is its title and "order" lists its items by name instead of the order they were made in. Blocks and items join it by naming it in their "creative_tab" field. Extra tabs sit on further pages of the creative inventory. ' +
              JAR_ONLY,
          ),
          block(
            curio,
            {
              display_name: 'Curio Block',
              model: rl(namespace, 'block/curio_block'),
              sound_type: 'stone',
              loot: 'self',
              item: { creative_tab: tab },
              components: { 'msm:breakable': { hardness: 1.5, resistance: 3, tool: 'pickaxe' } },
            },
            'A plain block that joins the tab through item.creative_tab, which names the tab element.',
          ),
          element(
            rl(namespace, 'block/curio_block'),
            KINDS.model,
            {
              parent: 'minecraft:block/cube_all',
              textures: { all: rl(namespace, 'block/curio_block') },
            },
            'A full cube drawn from textures/block/curio_block.png.',
          ),
        ],
        assets: [texture(namespace, 'block/curio_block', 'gem', COLOURS.violet, COLOURS.frost)],
      };
    },
  }),
  // Vanilla parity 3, batch 2 (ADR 0107 D5, ADR 0111 D5, D6; B539) ----------------------------
  defineExample({
    id: 'example_msm_villager_type',
    title: 'Villager look: Blossom villagers',
    description:
      'Villagers born or spawned in cherry groves wear pink clothes with a cream hem and sash, and so do zombie villagers there.',
    kind: VILLAGER_TYPE_KIND,
    category: 'Villagers',
    tags: ['villager', 'villager type', 'biome', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => {
      const villager = rl(namespace, 'entity/villager/type/blossom');
      const zombie = rl(namespace, 'entity/zombie_villager/type/blossom');
      const picture = artLookPng({
        recipe: 'villager_robe',
        colour: BLOSSOM_PINK,
        accent: BLOSSOM_CREAM,
        finish: 'sash',
        seed: artSeed(namespace, 'entity/villager/type/blossom', 'villager_robe'),
      });
      return {
        elements: [
          element(
            rl(namespace, 'blossom'),
            VILLAGER_TYPE_KIND,
            {
              format: 1,
              biomes: ['minecraft:cherry_grove'],
              textures: { villager: villager, zombie_villager: zombie },
            },
            `A villager type: the look of the villagers of some biomes, as vanilla's plains, desert or taiga villagers. "biomes" lists biome ids and tags (#-prefixed); villagers born or spawned there get this type. The pictures in "textures" are drawn over the villager's skin and under its job's apron, 64 by 64 in the villager layout; they already sit where the game reads them (entity/villager/type/ and entity/zombie_villager/type/), so the game draws them with no code of the mod's. A type has no name and brings no trades of its own. ${JAR_ONLY}`,
          ),
        ],
        assets: [
          { namespace, path: 'textures/entity/villager/type/blossom.png', bytes: picture },
          { namespace, path: 'textures/entity/zombie_villager/type/blossom.png', bytes: picture },
        ],
      };
    },
  }),
  defineExample({
    id: 'example_msm_game_rule',
    title: 'Game rule: Sparkle trails',
    description:
      'A world setting of your own, on in a new world, that a rule reads to decide whether sneaking players leave sparkles; switch it off with /gamerule.',
    kind: GAME_RULE_KIND,
    category: COMMANDS,
    tags: ['game rule', 'world setting', 'rules', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => {
      const rule = rl(namespace, 'sparkle_trails');
      return {
        elements: [
          element(
            rule,
            GAME_RULE_KIND,
            {
              format: 1,
              kind: 'boolean',
              default: true,
              category: 'mobs',
              display_name: 'Sparkle trails',
              description: 'Whether players leave a trail of sparkles while they sneak.',
            },
            `A game rule: a world setting registered with the mod and saved with each world. "kind" is boolean (on or off) or integer (a whole number, with "min" and "max"); "default" is its value in a new world; "category" is the group of the game rule screen it is listed in; "display_name" and "description" are its words there. Players set it with /gamerule ${rule} false. A rule reads it with "The game rule is" and changes it with "Set a game rule". ${JAR_ONLY}`,
          ),
          element(
            rl(namespace, 'sparkle_trails_rules'),
            RULES_KIND,
            {
              counters: [],
              format: 1,
              rules: [
                {
                  do: [
                    {
                      count: 4,
                      particle: 'minecraft:end_rod',
                      step: 'spawn_particles',
                      where: 'player',
                    },
                  ],
                  key: 'sparkle_trail',
                  name: 'Sparkles while sneaking',
                  only_if: {
                    conditions: [
                      { condition: 'game_rule', game_rule: rule, value: true },
                      { condition: 'player_sneaking' },
                    ],
                    match: 'all',
                  },
                  when: { options: { interval_seconds: 1 }, trigger: 'player_every' },
                },
              ],
            },
            'Every second, a player who is sneaking leaves sparkles behind while the game rule is on. Rules that read a game rule run through a script, so they need the Fabric mod jar export.',
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_msm_stat',
    title: 'Statistic: Bells rung',
    description:
      'A count of your own in the Statistics screen: how many times each player has rung a bell, kept by a rule.',
    kind: STAT_KIND,
    category: COMMANDS,
    tags: ['statistic', 'scoreboard', 'rules', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => {
      const stat = rl(namespace, 'bells_rung');
      return {
        elements: [
          element(
            stat,
            STAT_KIND,
            { format: 1, formatter: 'default', display_name: 'Bells rung' },
            `A statistic: a number counted for each player, shown in the Statistics screen and saved with the world. "formatter" says how it is shown: default (a plain number), distance (centimetres shown as metres and kilometres) or time (ticks shown as seconds, minutes, hours and days). A scoreboard objective follows it with the criterion minecraft.custom:${namespace}.bells_rung. A rule adds to it with "Add to a statistic" and checks it with "The statistic is at least". ${JAR_ONLY}`,
          ),
          element(
            rl(namespace, 'bells_rung_rules'),
            RULES_KIND,
            {
              counters: [],
              format: 1,
              rules: [
                {
                  do: [{ amount: 1, stat, step: 'add_to_stat' }],
                  key: 'count_bells',
                  name: 'Count the bells',
                  when: { subject: 'minecraft:bell', trigger: 'any_block_used' },
                },
              ],
            },
            'Each time a player uses a bell, 1 is added to their Bells rung statistic.',
          ),
        ],
        assets: [],
      };
    },
  }),
];

// Cottage furniture ---------------------------------------------------------------------------

const COTTAGE_BED = 'cottage_bed';

/** Cottage furniture: a bed, a lantern, a torch, two signs, a pot, a rug and a cupboard. */
const cottageFurniture = defineExample({
  id: 'example_msm_cottage_furniture',
  title: 'Cottage furniture and lights',
  description:
    'A straw bed, a lantern, a torch, a standing and a hanging sign, a potted plant, a rug and a cupboard that holds items: the new furniture block types in one project.',
  kind: KINDS.block,
  category: BLOCKS,
  tags: ['furniture', 'bed', 'lantern', 'torch', 'sign', 'carpet', 'container', 'mod'],
  supports: hasFabric,
  build: ({ namespace }) => {
    const tex = (path: string) => rl(namespace, `block/${path}`);
    const wood: Rgb = COLOURS.wood;
    return {
      elements: [
        block(
          rl(namespace, COTTAGE_BED),
          {
            type: 'bed',
            rule: 'straw_bed',
            colour: 'red',
            display_name: 'Cottage Bed',
            textures: { bed: tex(COTTAGE_BED) },
            loot: 'self',
            item: { creative_tab: 'minecraft:colored_blocks' },
            components: { 'msm:breakable': { hardness: 0.2, resistance: 0.2 } },
          },
          'A bed of type bed: placing it puts down both halves. The straw rule lets you sleep in it by day and sets your spawn, as vanilla beds do; "colour" tints the bed picture. Villagers do not use project beds.',
        ),
        element(
          rl(namespace, 'craft_cottage_bed'),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'misc',
            pattern: ['WWW', 'PPP'],
            key: { W: '#minecraft:wool', P: '#minecraft:planks' },
            result: { id: rl(namespace, COTTAGE_BED), count: 1 },
          },
          'Wool over planks, as a vanilla bed.',
        ),
        block(
          rl(namespace, 'cottage_lantern'),
          {
            type: 'lantern',
            display_name: 'Cottage Lantern',
            sound_type: 'lantern',
            textures: { texture: tex('cottage_lantern') },
            loot: 'self',
            item: { creative_tab: 'minecraft:functional_blocks' },
            components: {
              'msm:breakable': { hardness: 3.5, resistance: 3.5, tool: 'pickaxe' },
            },
          },
          'A lantern of type lantern: it stands on a block or hangs under one, and gives light 15 (a light level the type sets). Chains hold it up.',
        ),
        block(
          rl(namespace, 'cottage_torch'),
          {
            type: 'torch',
            particle: 'minecraft:flame',
            display_name: 'Cottage Torch',
            textures: { texture: tex('cottage_torch') },
            loot: 'self',
            item: { creative_tab: 'minecraft:functional_blocks' },
            components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
          },
          'A torch of type torch with flame particles. Lowering also makes its wall form, cottage_torch_wall, which you never place by hand.',
        ),
        block(
          rl(namespace, 'cottage_sign'),
          {
            type: 'sign',
            wood_type: 'oak',
            display_name: 'Cottage Sign',
            textures: { all: tex('cottage_sign'), sign: rl(namespace, 'gui/signs/cottage_sign') },
            loot: 'self',
            item: { creative_tab: 'minecraft:functional_blocks' },
            components: {
              'msm:breakable': { hardness: 1, resistance: 1, tool: 'axe', requires_tool: false },
            },
          },
          'A standing sign of type sign: it turns in sixteen steps on the floor and, as cottage_sign_wall, sits on walls. Both sides take text, dye, glow ink and honeycomb. The wood type gives the sounds; "sign" is the picture the edit screen shows (a placeholder board here; draw a 24 by 26 picture for the real look).',
        ),
        block(
          rl(namespace, 'cottage_hanging_sign'),
          {
            type: 'hanging_sign',
            wood_type: 'oak',
            display_name: 'Cottage Hanging Sign',
            textures: {
              all: tex('cottage_hanging_sign'),
              hanging_gui: rl(namespace, 'gui/hanging_signs/cottage_hanging_sign'),
            },
            loot: 'self',
            item: { creative_tab: 'minecraft:functional_blocks' },
            components: {
              'msm:breakable': { hardness: 1, resistance: 1, tool: 'axe', requires_tool: false },
            },
          },
          'A hanging sign of type hanging_sign: it hangs under a block or a chain, or sticks out of a wall as its attached form.',
        ),
        block(
          rl(namespace, 'cottage_pot'),
          {
            type: 'potted_plant',
            plant: 'minecraft:short_grass',
            display_name: 'Potted Grass',
            textures: { plant: 'minecraft:block/short_grass' },
            loot: 'self',
            components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
          },
          'A flower pot holding a plant, of type potted_plant: breaking it drops the pot and the plant. It has no item; a player puts the plant in an empty pot. Vanilla does not pot short grass, so this one is new; name your own sapling or flower in "plant".',
        ),
        block(
          rl(namespace, 'cottage_rug'),
          {
            type: 'carpet',
            display_name: 'Cottage Rug',
            textures: { texture: tex('cottage_rug') },
            loot: 'self',
            item: { creative_tab: 'minecraft:colored_blocks' },
            components: { 'msm:breakable': { hardness: 0.1, resistance: 0.1 } },
          },
          'A rug of type carpet: one sixteenth of a block high, it sits on the floor and breaks when its floor goes.',
        ),
        block(
          rl(namespace, 'cottage_cupboard'),
          {
            type: 'horizontal',
            display_name: 'Cottage Cupboard',
            sound_type: 'wood',
            textures: {
              front: tex('cottage_cupboard_front'),
              side: tex('cottage_cupboard'),
              top: tex('cottage_cupboard'),
            },
            loot: 'self',
            item: { creative_tab: 'minecraft:functional_blocks' },
            components: {
              'msm:breakable': { hardness: 2, resistance: 2, tool: 'axe', requires_tool: false },
              'msm:container': { layout: 'chest', rows: 2 },
              'msm:flammable': { burn_odds: 5, ignite_odds: 20 },
            },
          },
          'A block that faces you when placed and holds two rows of items (msm:container with the chest layout); a hopper can fill it and a comparator reads it.',
        ),
      ],
      assets: [
        texture(namespace, `block/${COTTAGE_BED}`, 'planks', COLOURS.ruby),
        texture(namespace, 'block/cottage_lantern', 'gem', COLOURS.amber),
        texture(namespace, 'block/cottage_torch', 'plain', COLOURS.amber),
        texture(namespace, 'block/cottage_sign', 'planks', wood),
        texture(namespace, 'block/cottage_hanging_sign', 'planks', wood),
        texture(namespace, 'gui/signs/cottage_sign', 'planks', wood),
        texture(namespace, 'gui/hanging_signs/cottage_hanging_sign', 'planks', wood),
        texture(namespace, 'block/cottage_rug', 'plain', COLOURS.sapphire),
        texture(namespace, 'block/cottage_cupboard', 'planks', wood),
        texture(namespace, 'block/cottage_cupboard_front', 'block_front', wood),
      ],
    };
  },
});

// Orchard and pie -----------------------------------------------------------------------------

/** Orchard and pie: a berry bush, a tall flower and a pie. */
const orchardAndPie = defineExample({
  id: 'example_msm_orchard_pie',
  title: 'Orchard and pie',
  description:
    'A berry bush that ripens in four stages and gives its own berries, a tall flower two blocks high and a pie that you eat slice by slice, crafted from the berries.',
  kind: KINDS.block,
  category: BLOCKS,
  tags: ['berry bush', 'tall plant', 'cake', 'food', 'farming', 'mod'],
  supports: hasFabric,
  build: ({ namespace }) => {
    const tex = (path: string) => rl(namespace, `block/${path}`);
    const berry = rl(namespace, 'orchard_berry');
    const pie = rl(namespace, 'orchard_pie');
    const stages = [0, 1, 2, 3].map((stage) => tex(`orchard_bush_${stage}`));
    return {
      elements: [
        block(
          rl(namespace, 'orchard_bush'),
          {
            type: 'berry_bush',
            berry,
            harvest: { ripe: [1, 2], full: [2, 4] },
            display_name: 'Orchard Bush',
            textures: { stages },
            loot: 'self',
            item: { id: berry, creative_tab: 'minecraft:natural_blocks' },
            components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
          },
          'A berry bush of type berry_bush with four ages, one picture each. At age 2 a click picks "harvest.ripe" berries and goes back to age 1; fully grown gives "harvest.full". Breaking it drops the same by age, with Fortune. The bush hurts what walks through it unless "hurts" is false. Its item is the berry, so a player plants the berries they pick.',
        ),
        block(
          rl(namespace, 'orchard_foxglove'),
          {
            type: 'tall_plant',
            display_name: 'Foxglove',
            textures: { top: tex('orchard_foxglove_top'), bottom: tex('orchard_foxglove_bottom') },
            loot: 'self',
            item: { creative_tab: 'minecraft:natural_blocks' },
            components: { 'msm:breakable': { hardness: 0, resistance: 0 } },
          },
          'A flower two blocks high, of type tall_plant: placing it makes both halves, breaking either half drops one flower, and bone meal drops another.',
        ),
        block(
          rl(namespace, 'orchard_pie'),
          {
            type: 'cake',
            food: { nutrition: 3, saturation: 0.3 },
            display_name: 'Orchard Pie',
            textures: {
              top: tex('orchard_pie_top'),
              bottom: tex('orchard_pie_bottom'),
              side: tex('orchard_pie_side'),
              inside: tex('orchard_pie_inside'),
            },
            loot: 'self',
            item: { max_stack_size: 1, creative_tab: 'minecraft:food_and_drinks' },
            components: { 'msm:breakable': { hardness: 0.5, resistance: 0.5 } },
          },
          'A pie of type cake: place it and click with an empty hand to eat a slice (seven slices, "food" per slice), with the cake sounds. A comparator reads what is left. It drops nothing once started.',
        ),
        element(
          rl(namespace, 'craft_orchard_pie'),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'misc',
            pattern: ['BBB', 'SES', 'WWW'],
            key: { B: berry, S: 'minecraft:sugar', E: 'minecraft:egg', W: 'minecraft:wheat' },
            result: { id: pie, count: 1 },
          },
          'Three berries over sugar and an egg over wheat make a pie.',
        ),
      ],
      assets: [
        ...stages.map((id, index) =>
          texture(
            namespace,
            id.slice(namespace.length + 1),
            index === 0 ? 'sapling' : 'leaves',
            COLOURS.jade,
            index === 3 ? COLOURS.sapphire : COLOURS.amber,
          ),
        ),
        texture(namespace, 'block/orchard_foxglove_top', 'sapling', COLOURS.violet),
        texture(namespace, 'block/orchard_foxglove_bottom', 'sapling', COLOURS.jade),
        texture(namespace, 'block/orchard_pie_top', 'plain', COLOURS.amber, COLOURS.ruby),
        texture(namespace, 'block/orchard_pie_bottom', 'plain', COLOURS.wood),
        texture(namespace, 'block/orchard_pie_side', 'plain', COLOURS.wood, COLOURS.amber),
        texture(namespace, 'block/orchard_pie_inside', 'plain', COLOURS.ruby),
      ],
    };
  },
});

// Copper roof ---------------------------------------------------------------------------------

/** The four ageing stages, with the colour of each stage's tiles. */
const ROOF_STAGES: readonly { stage: string; colour: Rgb }[] = [
  { stage: 'unaffected', colour: COLOURS.amber },
  { stage: 'exposed', colour: COLOURS.wood },
  { stage: 'weathered', colour: COLOURS.slate },
  { stage: 'oxidized', colour: COLOURS.jade },
];

/** Copper roof: stairs and slabs in four ageing stages and their waxed copies. */
const copperRoof = defineExample({
  id: 'example_msm_copper_roof',
  title: 'Copper roof',
  description:
    'Roof stairs and slabs that age through four stages like copper, from bright to green, and waxed copies that keep their colour: waxing with honeycomb and scraping with an axe.',
  kind: KINDS.block,
  category: BLOCKS,
  tags: ['weathering', 'waxing', 'copper', 'stairs', 'slab', 'mod'],
  supports: hasFabric,
  build: ({ namespace }) => {
    const elements: ContentBundleElement[] = [];
    const assets = ROOF_STAGES.map(({ stage, colour }) =>
      texture(namespace, `block/roof_${stage}`, 'bricks', colour),
    );
    const shapes = [
      { type: 'stairs', name: 'roof_stairs', title: 'Roof Stairs' },
      { type: 'slab', name: 'roof_slab', title: 'Roof Slab' },
    ] as const;
    for (const shape of shapes) {
      const idOf = (stage: string, waxed = false): ResourceLocation =>
        rl(
          namespace,
          `${waxed ? 'waxed_' : ''}${stage === 'unaffected' ? '' : `${stage}_`}${shape.name}`,
        );
      ROOF_STAGES.forEach(({ stage }, index) => {
        const next = ROOF_STAGES[index + 1];
        const textures = { all: rl(namespace, `block/roof_${stage}`) };
        const base = {
          type: shape.type,
          ...(shape.type === 'stairs' ? { base_block: 'minecraft:copper_block' } : {}),
          textures,
          sound_type: 'copper',
          loot: 'self',
          item: { creative_tab: 'minecraft:building_blocks' },
        };
        elements.push(
          block(
            idOf(stage),
            {
              ...base,
              display_name: `${stage === 'unaffected' ? '' : `${stage[0]?.toUpperCase()}${stage.slice(1)} `}${shape.title}`,
              components: {
                'msm:breakable': {
                  hardness: 3,
                  resistance: 6,
                  tool: 'pickaxe',
                  requires_tool: true,
                },
                'msm:weathering': {
                  stage,
                  ...(next === undefined ? {} : { next: idOf(next.stage) }),
                },
                'msm:waxable': { into: idOf(stage, true) },
              },
            },
            index === 0
              ? `The first stage of ${shape.type} that age: msm:weathering names its stage and the next block (${shape.name} in the exposed stage), so it changes over time; msm:waxable names the waxed copy a honeycomb turns it into, and an axe scrapes a stage back. The last stage has no "next".`
              : `Stage ${index + 1} of 4 (${stage}). Same shape, picture and behaviour as the stage before, one step older.`,
          ),
          block(
            idOf(stage, true),
            {
              ...base,
              display_name: `Waxed ${stage === 'unaffected' ? '' : `${stage[0]?.toUpperCase()}${stage.slice(1)} `}${shape.title}`,
              components: {
                'msm:breakable': {
                  hardness: 3,
                  resistance: 6,
                  tool: 'pickaxe',
                  requires_tool: true,
                },
              },
            },
            `The waxed copy of the ${stage} stage: a plain block with no msm:weathering, so it never ages, and it shares the stage's picture. It belongs to one source block only.`,
          ),
        );
      });
    }
    return { elements, assets };
  },
});

// Adventurer's satchel ------------------------------------------------------------------------

/** Adventurer's satchel: a bag, a bundle and a creative tab for them. */
const adventurersSatchel = defineExample({
  id: 'example_msm_adventurers_satchel',
  title: "Adventurer's satchel",
  description:
    'A satchel that holds two rows of items, a roll that works like a bundle and a creative tab of their own, with the recipes that make them.',
  kind: KINDS.item,
  category: ITEMS,
  tags: ['bag', 'bundle', 'creative tab', 'inventory', 'mod'],
  supports: hasFabric,
  build: ({ namespace }) => {
    const tab = rl(namespace, 'adventurer_tab');
    const satchel = rl(namespace, 'satchel');
    const roll = rl(namespace, 'supply_roll');
    return {
      elements: [
        element(
          tab,
          CREATIVE_TAB_KIND,
          { format: 1, icon: satchel, display_name: "Adventurer's gear" },
          'The tab both items join through their "creative_tab" field. Its icon is the satchel; items show in the order they were made.',
        ),
        element(
          satchel,
          KINDS.item,
          {
            format: 1,
            display_name: 'Satchel',
            model: rl(namespace, 'item/satchel'),
            max_stack_size: 1,
            rarity: 'uncommon',
            creative_tab: tab,
            components: {
              'msm:item_inventory': {
                layout: 'chest',
                rows: 2,
                open: 'sneak_use',
                open_sound: 'minecraft:item.armor.equip_leather',
                close_sound: 'minecraft:item.armor.equip_leather',
              },
            },
          },
          'A bag: msm:item_inventory gives the item a chest screen of two rows that opens when you sneak and use it. What is inside stays in the item when you carry it, drop it or put it in a chest; a bag cannot go inside another bag or a shulker box, and bags always stack to one.',
        ),
        itemModel(
          namespace,
          'satchel',
          'minecraft:item/generated',
          'A flat item model drawn from textures/item/satchel.png.',
        ),
        element(
          rl(namespace, 'craft_satchel'),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'equipment',
            pattern: ['LSL', 'L L', 'LLL'],
            key: { L: 'minecraft:leather', S: 'minecraft:string' },
            result: { id: satchel, count: 1 },
          },
          'Leather with a string for the strap.',
        ),
        element(
          roll,
          KINDS.item,
          {
            format: 1,
            display_name: 'Supply Roll',
            max_stack_size: 1,
            creative_tab: tab,
            bundle_textures: {
              closed: rl(namespace, 'item/supply_roll'),
              open_back: rl(namespace, 'item/supply_roll_open_back'),
              open_front: rl(namespace, 'item/supply_roll_open_front'),
            },
            components: { 'msm:bundle': {} },
          },
          'An item that works like a bundle: click items onto it to put them in, right-click to take them out. "bundle_textures" are its closed picture and the two halves of its open picture (back and front), which show the contents between them.',
        ),
        element(
          rl(namespace, 'craft_supply_roll'),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'equipment',
            pattern: ['SL', 'LL'],
            key: { S: 'minecraft:string', L: 'minecraft:leather' },
            result: { id: roll, count: 1 },
          },
          'Leather and a string, as a vanilla bundle.',
        ),
      ],
      assets: [
        texture(namespace, 'item/satchel', 'bottle', COLOURS.wood),
        texture(namespace, 'item/supply_roll', 'bottle', COLOURS.amber),
        texture(namespace, 'item/supply_roll_open_back', 'bottle', COLOURS.wood),
        texture(namespace, 'item/supply_roll_open_front', 'bottle', COLOURS.amber),
      ],
    };
  },
});

// Server helper -------------------------------------------------------------------------------

/** Server helper: commands, a function and a rule book. */
const serverHelper = defineExample({
  id: 'example_msm_server_helper',
  title: 'Server helper',
  description:
    'Commands for a server: /helpme for everyone, /hub to jump to a lobby and /boost with a number for operators, with a rule book that points new players at /helpme.',
  kind: COMMAND_KIND,
  category: COMMANDS,
  tags: ['command', 'argument', 'function', 'permission', 'rules', 'server', 'mod'],
  supports: hasFabric,
  build: ({ namespace }) => {
    const hub = rl(namespace, 'hub');
    const hubTrip = rl(namespace, 'hub_trip');
    const boost = rl(namespace, 'boost');
    const boostSpeed = rl(namespace, 'boost_speed');
    const book: Json = {
      counters: [],
      format: 1,
      rules: [
        {
          do: [
            { step: 'show_message', text: ['Welcome! Type /helpme if you need a hand.'] },
            { sound: 'minecraft:block.note_block.chime', step: 'play_sound', where: 'player' },
          ],
          key: 'tip',
          name: 'Point new players at /helpme',
          when: { trigger: 'player_joined' },
        },
      ],
    };
    return {
      elements: [
        element(
          rl(namespace, 'helpme'),
          COMMAND_KIND,
          {
            format: 1,
            name: 'helpme',
            aliases: ['tips'],
            event: 'help',
            events: {
              help: {
                actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.chime' }],
              },
            },
            feedback_text: 'Ask an operator, or try /hub to go to the lobby.',
          },
          'A command for everyone that runs an event and answers in chat. Nothing here needs operator rights, so there is no function.',
        ),
        element(
          hub,
          COMMAND_KIND,
          {
            format: 1,
            name: 'hub',
            permission: 2,
            function: hubTrip,
            feedback_text: 'Whoosh! Welcome to the lobby.',
          },
          "A command that runs the function hub_trip. Its permission is 2: only operators can type it, so the function's operator rights are not handed to everyone.",
        ),
        element(
          hubTrip,
          KINDS.function,
          {
            lines: [
              '# Moves the player who typed /hub to the lobby and slows their fall.',
              'execute in minecraft:overworld run tp @s 0 120 0',
              'effect give @s minecraft:slow_falling 10 0 true',
            ],
          },
          'The function /hub runs, as the player. Edit the coordinates to your own lobby.',
        ),
        element(
          boost,
          COMMAND_KIND,
          {
            format: 1,
            name: 'boost',
            permission: 2,
            arguments: [{ name: 'power', type: 'integer', min: 1, max: 5 }],
            function: boostSpeed,
            feedback_text: 'Boosted!',
          },
          'A command with an argument: /boost 3. The runtime passes "power" to the function through command storage, so the function can write $(power).',
        ),
        element(
          boostSpeed,
          KINDS.function,
          {
            lines: [
              '# /boost <power>: speed for half a minute; $(power) is the number typed.',
              '$effect give @s minecraft:speed 30 $(power) true',
            ],
          },
          'The function /boost runs. The line starting with $ is a macro line; $(power) is replaced by the number typed.',
        ),
        element(
          rl(namespace, 'server_tips'),
          RULES_KIND,
          book,
          'A rule book with one rule: when a player joins, show a chat message and a chime that point at /helpme. It compiles to a script on export.',
        ),
      ],
      assets: [],
    };
  },
});

// Berry juice (ADR 0108; B539) ----------------------------------------------------------------

/** Berry juice: a water-like liquid with a cauldron, a bottle to drink and a mixing rule. */
const berryJuice = defineExample({
  id: 'example_msm_berry_juice',
  title: 'Berry juice',
  description:
    'A pink juice you pour into cauldrons and scoop into bottles that feed and heal you, which sets into pink terracotta where lava touches it.',
  kind: FLUID_KIND,
  category: BLOCKS,
  tags: ['fluid', 'cauldron', 'bottle', 'mixing', 'mod'],
  supports: hasFabric,
  build: ({ namespace }) => {
    const juice = rl(namespace, 'berry_juice');
    return {
      elements: [
        element(
          juice,
          FLUID_KIND,
          {
            format: 1,
            behaves_like: 'water',
            tint: 0xd04a7c,
            display_name: 'Berry Juice',
            bucket_display_name: 'Bucket of Berry Juice',
            cauldron_display_name: 'Cauldron of Berry Juice',
            bottle_display_name: 'Bottle of Berry Juice',
            mixing: [
              {
                with: 'lava',
                source: 'minecraft:pink_terracotta',
                flowing: 'minecraft:pink_terracotta',
              },
            ],
            cauldron: { levels: true },
            bottle: {
              food: { nutrition: 3, saturation: 0.6, can_always_eat: true },
              effects: [{ effect: 'minecraft:regeneration', seconds: 5 }],
            },
            textures: {
              still: 'minecraft:block/water_still',
              flowing: 'minecraft:block/water_flow',
              overlay: 'minecraft:block/water_overlay',
              bucket: 'minecraft:item/water_bucket',
            },
          },
          `A water-like liquid with a cauldron and a bottle. "cauldron" with "levels" true makes ${juice}_cauldron: its bucket fills an empty cauldron, which then holds three levels as water's does, and a glass bottle takes one level (or fills from a source) as the bottle ${juice}_bottle, drunk in 1.6 seconds as a potion: "bottle" gives it food and five seconds of Regeneration. "mixing" turns a source or flowing juice into pink terracotta where lava touches it, with lava's fizz. It is drawn with vanilla's moving water under the tint, and its bucket and bottle with vanilla's pictures (named, never bundled). ${JAR_ONLY}`,
        ),
      ],
      assets: [],
    };
  },
});

/** The block and item behaviour examples of this brief, for the blocks and items mirror. */
export const vanillaParityBehaviourExamples: readonly ExampleProject[] = [
  cottageFurniture,
  orchardAndPie,
  copperRoof,
  adventurersSatchel,
  berryJuice,
];

/** The Server helper example, for the scripts mirror. */
export const vanillaParityScriptExamples: readonly ExampleProject[] = [serverHelper];
