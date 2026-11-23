/**
 * What Home's gallery shows on each starter's and Creator flow's card (ADR 0129 D1, D2): the
 * library example that shows what the flow makes (the library's `FLOW_EXAMPLE_IDS`; the app
 * test pins the two together), a clip of it where the example has something with a body to put
 * in Try it's area (blocks, mobs, vehicles, a world), and a drawn picture for every card, which
 * is the card's still where it has no clip (rules, commands, recipes, data, items only) and the
 * fallback while its example loads.
 *
 * - The clips follow the showcase's format (`clip.ts`, ADR 0118 D4) and are checked by
 *   `validateClip` and played to their end on both targets by the app's tests; they are not
 *   showcase cards (`showcases.ts` keeps the thirteen featured ones, whose clips the wood set,
 *   crop, machine, portal and world cards here reuse).
 * - The pictures are art generator looks (`artLookPng` of `@msm/plugin-library`); this file
 *   imports only the library's types, so Home's first paint does not load the library.
 * - Captions and words are plain, with no ids; what only the game does is said "… in the game"
 *   (ADR 0118 D11).
 *
 * @packageDocumentation
 */

import type { ArtLook, ArtRecipeId, Rgb } from '@msm/plugin-library';
import type { Face } from '@msm/sim';
import type {
  CameraKey,
  ClipBlock,
  ClipCaption,
  ClipGround,
  ClipPoint,
  ClipSpawn,
  ClipStep,
  ShowcaseClip,
  ShowcaseMake,
} from './clip';
import { SHOWCASES } from './showcases';

/** One gallery card's example, clip and picture. */
export interface FlowCard {
  /** The starter or Creator flow id. */
  readonly flowId: string;
  /** The library example that shows what it makes; `null` for the blank project. */
  readonly exampleId: string | null;
  /** The clip of the example, or `null` where the card shows its drawn still. */
  readonly clip: ShowcaseClip | null;
  /** A drawn picture of what the flow makes: the still without a clip, else the fallback. */
  readonly picture: ArtLook;
}

const v = (x: number, y: number, z: number): ClipPoint => ({ x, y, z });

/** `#rrggbb` as a colour. */
function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const look = (recipe: ArtRecipeId, colour: string, accent?: string): ArtLook =>
  accent === undefined
    ? { recipe, colour: rgb(colour) }
    : { recipe, colour: rgb(colour), accent: rgb(accent) };

/** Flat ground: the first air layer is y 4. */
const FLAT: ClipGround = { kind: 'flat' };
const S = 4;
/** The clips' length and still: ten seconds, the still half way. */
const LENGTH = 200;
const STILL = 100;

/** The Make this of a flow's card (a starter that is not a flow is added from the chooser). */
function makeOf(flowId: string, isFlow: boolean): ShowcaseMake {
  return isFlow
    ? { type: 'flows', flowIds: [flowId] }
    : { type: 'flows', flowIds: [], starterIds: [flowId] };
}

interface ClipWords {
  readonly flowId: string;
  readonly exampleId: string;
  readonly title: string;
  readonly sentence: string;
  readonly captions: readonly ClipCaption[];
  /** Whether the starter is a Creator flow (default true). */
  readonly isFlow?: boolean;
}

/** A slow pan along the row at z 24 from the south-west to the south-east. */
function panKeys(height = 3, pitch = 20): CameraKey[] {
  return [
    { tick: 0, eye: v(20.5, S + height, 31), yaw: 200, pitch },
    { tick: LENGTH, eye: v(28.5, S + height, 31), yaw: 160, pitch },
  ];
}

/** A clip of blocks in place from the first frame, the camera panning past them. */
function blocksClip(
  words: ClipWords,
  setup: readonly ClipBlock[],
  options: {
    readonly steps?: readonly ClipStep[];
    readonly keys?: readonly CameraKey[];
    readonly ground?: ClipGround;
  } = {},
): ShowcaseClip {
  return {
    id: `flow-${words.flowId}`,
    title: words.title,
    sentence: words.sentence,
    exampleId: words.exampleId,
    make: makeOf(words.flowId, words.isFlow ?? true),
    ground: options.ground ?? FLAT,
    player: v(24.5, S, 30.5),
    setup,
    steps: options.steps ?? [],
    camera: { type: 'keys', keys: options.keys ?? panKeys() },
    captions: words.captions,
    stillAt: STILL,
    length: LENGTH,
  };
}

/** A row of blocks on the ground at z 24, two apart and centred on x 24. */
function row(states: readonly string[], y = S, z = 24): ClipBlock[] {
  const start = 24 - (states.length - 1);
  return states.map((state, index) => ({ pos: v(start + index * 2, y, z), state }));
}

/** A wall `width` wide and `height` high at z 24, its blocks from `at(x, y)`. */
function wall(width: number, height: number, at: (x: number, y: number) => string): ClipBlock[] {
  const blocks: ClipBlock[] = [];
  const start = 24 - Math.floor(width / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      blocks.push({ pos: v(start + x, S + y, 24), state: at(x, y) });
    }
  }
  return blocks;
}

const caption = (start: number, end: number, text: string): ClipCaption => ({ start, end, text });

/** Where a followed mob's camera sits: behind and above it (the showcase's pet card). */
const FOLLOW = v(1.5, 2.5, 6);

/** A clip of a mob hatched from its egg on the block at `on`, the camera following it. */
function mobClip(
  words: ClipWords,
  egg: string,
  options: {
    readonly on?: ClipPoint;
    readonly setup?: readonly ClipBlock[];
    readonly offset?: ClipPoint;
  } = {},
): ShowcaseClip {
  const on = options.on ?? v(24, S - 1, 24);
  const offset = options.offset ?? FOLLOW;
  const feet = v(on.x + 0.5, on.y + 1, on.z + 0.5);
  const spawns: ClipSpawn[] = [{ on, egg }];
  return {
    id: `flow-${words.flowId}`,
    title: words.title,
    sentence: words.sentence,
    exampleId: words.exampleId,
    make: makeOf(words.flowId, words.isFlow ?? true),
    ground: FLAT,
    // Away from the egg: a mob is not hatched into the player's box (B565 Z6).
    player: v(36.5, S, 36.5),
    setup: options.setup ?? [],
    spawns,
    steps: [],
    camera: {
      type: 'follow',
      mob: 0,
      offset,
      keys: [
        {
          tick: 0,
          eye: v(feet.x + offset.x, feet.y + offset.y, feet.z + offset.z),
          yaw: 166,
          pitch: 17,
        },
      ],
    },
    captions: words.captions,
    stillAt: STILL,
    length: LENGTH,
  };
}

/**
 * A clip of a vehicle put down from its item, got into and driven forward, then steered; a boat
 * (`water`) is put on a pool, and a vehicle that needs it is given `fuel` first.
 */
function vehicleClip(
  words: ClipWords,
  item: string,
  options: { readonly water?: boolean; readonly fuel?: string } = {},
): ShowcaseClip {
  const water = options.water === true;
  const fuel: ClipStep[] =
    options.fuel === undefined
      ? []
      : [{ tick: 12, action: { type: 'useVehicle', vehicle: 0, item: options.fuel } }];
  return {
    id: `flow-${words.flowId}`,
    title: words.title,
    sentence: words.sentence,
    exampleId: words.exampleId,
    make: makeOf(words.flowId, true),
    ground: FLAT,
    player: v(24.5, S, 34.5),
    setup: water ? pool() : [],
    steps: [
      { tick: 1, action: { type: 'look', yaw: 180, pitch: 30 } },
      {
        tick: 5,
        action: { type: 'use', pos: v(24, S - 1, water ? 28 : 30), face: 'up', item },
      },
      ...fuel,
      { tick: 20, action: { type: 'useVehicle', vehicle: 0 } },
      // A held move drives; `strafe` steers (B565 Z7).
      { tick: 30, action: { type: 'move', forward: 1, strafe: 0 } },
      { tick: 80, action: { type: 'move', forward: 1, strafe: 1 } },
      { tick: 110, action: { type: 'move', forward: 1, strafe: 0 } },
      { tick: 140, action: { type: 'move', forward: 0, strafe: 0 } },
    ],
    camera: { type: 'driver' },
    captions: words.captions,
    stillAt: STILL,
    length: LENGTH,
  };
}

/** A showcase card's clip, reused for the card of the same flow. */
function showcase(id: string): ShowcaseClip {
  const clip = SHOWCASES.find((one) => one.id === id);
  if (clip === undefined) throw new Error(`No showcase clip ${id}`);
  return clip;
}

/** A pit three by three dug in the ground and a liquid poured into it from its bucket. */
function pourSteps(bucket: string): ClipStep[] {
  const steps: ClipStep[] = [{ tick: 1, action: { type: 'look', yaw: 180, pitch: 40 } }];
  let tick = 5;
  for (let x = 23; x <= 25; x += 1) {
    for (let z = 23; z <= 25; z += 1) {
      steps.push({ tick, action: { type: 'break', pos: v(x, S - 1, z) } });
      tick += 4;
    }
  }
  steps.push({
    tick: tick + 10,
    action: { type: 'use', pos: v(24, S - 2, 24), face: 'up', item: bucket },
  });
  return steps;
}

/** Posts of oak logs with `top` on each, three in a row. */
function onPosts(top: string): ClipBlock[] {
  return [21, 24, 27].flatMap((x) => [
    { pos: v(x, S, 24), state: 'minecraft:oak_log[axis=y]' },
    { pos: v(x, S + 1, 24), state: top },
  ]);
}

/** A pool of water two deep under the area's middle (x and z 18 to 30). */
function pool(): ClipBlock[] {
  const blocks: ClipBlock[] = [];
  for (let x = 18; x <= 30; x += 1) {
    for (let z = 18; z <= 30; z += 1) {
      for (const y of [S - 2, S - 1]) blocks.push({ pos: v(x, y, z), state: 'minecraft:water' });
    }
  }
  return blocks;
}

/** A use of `item` on the ground's top at x, z: places a block with two parts (beds). */
const useOn = (tick: number, x: number, z: number, item: string, face: Face = 'up'): ClipStep => ({
  tick,
  action: { type: 'use', pos: v(x, S - 1, z), face, item },
});

const card = (
  flowId: string,
  exampleId: string | null,
  clip: ShowcaseClip | null,
  picture: ArtLook,
): FlowCard => ({ flowId, exampleId, clip, picture });

/** The cards, by starter or flow id, in the library's starter order. */
const CARDS: readonly FlowCard[] = [
  card('blank', null, null, look('plain', '#9aa4ae')),
  card('resource_pack', 'starter_resource_pack', null, look('block', '#7aa0d0')),
  card('data_pack', 'starter_data_pack', null, look('pattern_sheet', '#c8a060')),
  card('combined', 'starter_combined', null, look('smithing_template', '#7aa0d0')),
  card(
    'custom_ore',
    'starter_custom_ore',
    blocksClip(
      {
        flowId: 'custom_ore',
        exampleId: 'starter_custom_ore',
        title: 'An ore of your own',
        sentence: 'An ore in the rock that drops gems, and a block of them.',
        captions: [
          caption(5, 100, 'Ruby ore in a wall of stone'),
          caption(100, 195, 'It generates in caves in the game.'),
        ],
      },
      [
        ...wall(5, 3, (x, y) =>
          (x + y) % 3 === 1 ? './ruby_ore' : y === 0 && x === 2 ? './ruby_ore' : 'minecraft:stone',
        ),
        { pos: v(24, S, 26), state: './ruby_block' },
      ],
    ),
    look('ore', '#c41c34'),
  ),
  card('custom-sword', 'example_flow_frost_blade', null, look('sword', '#8fd3ff')),
  card(
    'gear-set',
    'example_popular_glowshard',
    blocksClip(
      {
        flowId: 'gear-set',
        exampleId: 'example_popular_glowshard',
        title: 'Tools and armour',
        sentence: 'A material with its own tools, armour, ore and block.',
        captions: [
          caption(5, 100, 'Glowshard ore and its block'),
          caption(100, 195, 'Its tools and armour are made in the game.'),
        ],
      },
      [
        ...wall(5, 3, (x, y) => ((x + y) % 2 === 1 ? './glowshard_ore' : 'minecraft:deepslate')),
        { pos: v(23, S, 26), state: './glowshard_block' },
        { pos: v(25, S, 26), state: './glowshard_block' },
      ],
    ),
    look('pickaxe', '#5ad0e0'),
  ),
  card(
    'simple-block',
    'example_flow_moss_bricks',
    blocksClip(
      {
        flowId: 'simple-block',
        exampleId: 'example_flow_moss_bricks',
        title: 'A block',
        sentence: 'A block of your own to build with.',
        captions: [caption(5, 195, 'A wall of moss bricks')],
      },
      wall(7, 3, () => './moss_bricks'),
    ),
    look('bricks', '#5a8a3c'),
  ),
  card('wood-set', 'example_msm_wood_set', showcase('wood-set'), look('planks', '#a87850')),
  card(
    'stone-set',
    'example_msm_stone_set',
    blocksClip(
      {
        flowId: 'stone-set',
        exampleId: 'example_msm_stone_set',
        title: 'A set of stone',
        sentence: 'A stone with its bricks, stairs, slabs and walls.',
        captions: [caption(5, 195, 'Shale, its bricks, pillar, stairs, slab and wall')],
      },
      row([
        './shale',
        './shale_bricks',
        './polished_shale',
        './shale_pillar',
        './shale_stairs',
        './shale_slab',
        './shale_wall',
      ]),
    ),
    look('bricks', '#6c6a72'),
  ),
  card('crop', 'example_msm_crop', showcase('crop'), look('crop_stage3', '#c89040')),
  card(
    'tree',
    'example_msm_tree',
    blocksClip(
      {
        flowId: 'tree',
        exampleId: 'example_msm_tree',
        title: 'A tree',
        sentence: 'A tree of your own that grows from its sapling.',
        captions: [
          caption(5, 100, 'Silver birch leaves and saplings'),
          caption(100, 195, 'Its sapling grows into a tree in the game.'),
        ],
      },
      [
        ...[S, S + 1, S + 2, S + 3].map((y) => ({
          pos: v(24, y, 24),
          state: 'minecraft:birch_log[axis=y]',
        })),
        ...[-1, 0, 1].flatMap((dx) =>
          [-1, 0, 1].flatMap((dz) =>
            [S + 3, S + 4]
              .filter((y) => !(dx === 0 && dz === 0 && y === S + 3))
              .map((y) => ({ pos: v(24 + dx, y, 24 + dz), state: './silver_birch_leaves' })),
          ),
        ),
        { pos: v(24, S + 5, 24), state: './silver_birch_leaves' },
        { pos: v(21, S, 25), state: './silver_birch_sapling' },
        { pos: v(27, S, 25), state: './silver_birch_sapling' },
      ],
      { keys: panKeys(4, 10) },
    ),
    look('leaves', '#a8c878'),
  ),
  card(
    'cave-plants',
    'example_msm_ember_vines',
    blocksClip(
      {
        flowId: 'cave-plants',
        exampleId: 'example_msm_ember_vines',
        title: 'Cave plants',
        sentence: 'Plants that hang, climb and glow under the ground.',
        captions: [caption(5, 195, 'Ember vines hanging from a roof of stone')],
      },
      [
        ...[20, 21, 22, 23, 24, 25, 26, 27, 28].map((x) => ({
          pos: v(x, S + 4, 24),
          state: 'minecraft:stone',
        })),
        ...[20, 22, 24, 26, 28].flatMap((x) => [
          { pos: v(x, S + 3, 24), state: './ember_vine_plant' },
          { pos: v(x, S + 2, 24), state: './ember_vine' },
        ]),
      ],
      { keys: panKeys(3, 5) },
    ),
    look('strand', '#e07030'),
  ),
  card(
    'desert-plants',
    'example_msm_dune_reed',
    blocksClip(
      {
        flowId: 'desert-plants',
        exampleId: 'example_msm_dune_reed',
        title: 'Desert plants',
        sentence: 'Reeds, cacti and bamboo that grow tall.',
        captions: [caption(5, 195, 'Dune reeds by the water')],
      },
      [
        ...[20, 22, 24, 26, 28].flatMap((x) => [
          { pos: v(x, S - 1, 24), state: 'minecraft:sand' },
          { pos: v(x, S - 1, 25), state: 'minecraft:water' },
          ...[0, 1, 2].map((dy) => ({ pos: v(x, S + dy, 24), state: './dune_reed' })),
        ]),
      ],
    ),
    look('stalk', '#c8c070'),
  ),
  card(
    'flower-pot',
    'example_msm_clay_planter',
    blocksClip(
      {
        flowId: 'flower-pot',
        exampleId: 'example_msm_clay_planter',
        title: 'A flower pot',
        sentence: 'A pot of your own that holds flowers and saplings.',
        captions: [caption(5, 195, 'Clay planters with flowers in them')],
      },
      row([
        './clay_planter_poppy',
        './clay_planter_dandelion',
        './clay_planter_cornflower',
        './clay_planter_allium',
        './clay_planter_oak_sapling',
      ]),
      { keys: panKeys(2, 25) },
    ),
    look('pot', '#b06a48'),
  ),
  card(
    'copper-set',
    'example_msm_bronze_fittings',
    blocksClip(
      {
        flowId: 'copper-set',
        exampleId: 'example_msm_bronze_fittings',
        title: 'A metal that ages',
        sentence: 'Blocks that weather with time, like copper.',
        captions: [
          caption(5, 100, 'Bronze as it ages, from new to old'),
          caption(100, 195, 'Wax it to keep its colour in the game.'),
        ],
      },
      ['./bronze_block', './exposed_bronze', './weathered_bronze', './oxidized_bronze'].flatMap(
        (state, index) => [
          { pos: v(21 + index * 2, S, 24), state },
          { pos: v(21 + index * 2, S + 1, 24), state },
        ],
      ),
    ),
    look('block', '#c87840'),
  ),
  card(
    'lights',
    'example_flow_amethyst_lights',
    blocksClip(
      {
        flowId: 'lights',
        exampleId: 'example_flow_amethyst_lights',
        title: 'Lights',
        sentence: 'Torches, lanterns, chains and candles of your own.',
        captions: [caption(5, 195, 'An amethyst torch, lantern, candle and chain')],
      },
      [
        { pos: v(21, S, 24), state: './amethyst_torch' },
        { pos: v(23, S, 24), state: './amethyst_lantern' },
        { pos: v(25, S, 24), state: './amethyst_candle' },
        { pos: v(27, S + 3, 24), state: 'minecraft:stone' },
        { pos: v(27, S + 2, 24), state: './amethyst_chain' },
        { pos: v(27, S + 1, 24), state: './amethyst_chain' },
      ],
      { keys: panKeys(2.5, 15) },
    ),
    look('block_front', '#6a4a9a', '#c890ff'),
  ),
  card(
    'bed',
    'example_flow_camp_sleeping_bag',
    blocksClip(
      {
        flowId: 'bed',
        exampleId: 'example_flow_camp_sleeping_bag',
        title: 'A bed',
        sentence: 'A bed or a sleeping bag to sleep in.',
        captions: [
          caption(10, 100, 'Put down a sleeping bag'),
          caption(100, 195, 'Sleep in it to set your spawn in the game.'),
        ],
      },
      [],
      {
        steps: [
          { tick: 1, action: { type: 'look', yaw: 0, pitch: 30 } },
          useOn(10, 22, 24, './camp_sleeping_bag'),
          useOn(40, 26, 24, './camp_sleeping_bag'),
        ],
      },
    ),
    look('block', '#4c8a3c'),
  ),
  card(
    'fluid',
    'example_flow_glow_honey',
    blocksClip(
      {
        flowId: 'fluid',
        exampleId: 'example_flow_glow_honey',
        title: 'A liquid',
        sentence: 'A liquid of your own with its bucket.',
        captions: [
          caption(5, 45, 'Dig a pit'),
          caption(50, 195, 'Pour glowing honey from its bucket'),
        ],
      },
      [],
      { steps: pourSteps('./glow_honey_bucket'), keys: panKeys(3.5, 35) },
    ),
    look('bottle', '#e8a828'),
  ),
  card(
    'storage-crate',
    'example_msm_shulker_crate',
    blocksClip(
      {
        flowId: 'storage-crate',
        exampleId: 'example_msm_shulker_crate',
        title: 'A storage crate',
        sentence: 'A block that holds items, like a chest.',
        captions: [
          caption(5, 100, 'Crates of your own'),
          caption(100, 195, 'They keep what is inside when broken in the game.'),
        ],
      },
      row(['./shulker_crate', './shulker_crate', './shulker_crate']),
    ),
    look('block_front', '#8c5a2e'),
  ),
  card('machine', 'example_msm_ore_crusher', showcase('machine'), look('block_front', '#6c6a72')),
  card('food', 'example_flow_golden_pear', null, look('fruit', '#e8c040')),
  card(
    'cake',
    'example_flow_chocolate_pie',
    blocksClip(
      {
        flowId: 'cake',
        exampleId: 'example_flow_chocolate_pie',
        title: 'A cake',
        sentence: 'A cake or pie you eat slice by slice.',
        captions: [caption(5, 195, 'Chocolate pies on a table')],
      },
      [
        ...[22, 24, 26].map((x) => ({ pos: v(x, S, 24), state: 'minecraft:oak_planks' })),
        ...[22, 24, 26].map((x) => ({ pos: v(x, S + 1, 24), state: './chocolate_pie' })),
      ],
      { keys: panKeys(2.5, 25) },
    ),
    look('pie', '#d0a070', '#5a3420'),
  ),
  card('weapon', 'example_flow_storm_mace', null, look('mace', '#5c8cd0')),
  card('consumable', 'example_flow_sky_tonic', null, look('bottle', '#78b8f0')),
  card('totem', 'example_flow_ember_totem', null, look('totem', '#e05a20')),
  card('backpack', 'example_flow_explorer_pack', null, look('block_front', '#5a6e3a')),
  card('status-effect', 'example_flow_frost_skin', null, look('effect_icon', '#a0e0ff')),
  card('potion', 'example_flow_feather_fall', null, look('bottle', '#f0ecd0')),
  card(
    'particle',
    'example_flow_snow_glitter',
    blocksClip(
      {
        flowId: 'particle',
        exampleId: 'example_flow_snow_glitter',
        title: 'Particles',
        sentence: 'Sparkles of your own on a block.',
        captions: [caption(5, 195, 'Snow glitter falling from its block')],
      },
      onPosts('./snow_glitter_block'),
      { keys: panKeys(2.5, 10) },
    ),
    look('particle_spark', '#d8f0ff'),
  ),
  card('throwable', 'example_popular_boomerang', null, look('boomerang', '#a87850')),
  card('enchantment', 'example_flow_venom_edge', null, look('gem', '#8040b0')),
  card('painting', 'example_flow_mountain_dawn', null, look('pattern_sheet', '#e07840')),
  card('banner-pattern', 'example_flow_ocean_ring', null, look('banner_pattern', '#2c7cc0')),
  card('armour-trim', 'example_flow_frost_studs', null, look('smithing_template', '#58c8d0')),
  card('glider', 'example_flow_leaf_glider', null, look('glider', '#4c9a3c')),
  card('pot-pattern', 'example_flow_fish_tale', null, look('pottery_sherd', '#3c8cc8')),
  card('music-disc-item', 'example_flow_night_drive', null, look('disc', '#2c3c8c')),
  card('dimension', 'example_flow_frost_realm', null, look('portal', '#8fd3ff')),
  card(
    'world-islands',
    'example_world_coral_isles',
    showcase('world-islands'),
    look('sand', '#e0d090'),
  ),
  card(
    'world-mountains',
    'example_world_frost_peaks',
    showcase('world-mountains'),
    look('stone', '#e8eef4'),
  ),
  // Its cherry trees are the game's own, so without the jar it draws as plain hills (B588).
  card('world-one-biome', 'example_world_endless_blossom', null, look('leaves', '#f0a0c0')),
  card(
    'world-caves',
    'example_world_ember_caverns',
    showcase('world-caves'),
    look('stone', '#5a4a4a'),
  ),
  // All air until Skyblock's start island (B586).
  card('world-empty-sky', 'example_world_cloud_realm', null, look('grass_side', '#78b048')),
  card('portal', 'example_msm_sky_portal', showcase('portal'), look('portal', '#78a7ff')),
  card('villager-trade', 'example_flow_spyglass_trade', null, look('gem', '#3cb060')),
  card(
    'village-job',
    'example_flow_beekeeper',
    blocksClip(
      {
        flowId: 'village-job',
        exampleId: 'example_flow_beekeeper',
        title: 'A village job',
        sentence: 'A job of your own with its work site and trades.',
        captions: [
          caption(5, 100, 'The beekeeper works at its own workbench'),
          caption(100, 195, 'Villagers take the job in the game.'),
        ],
      },
      [
        { pos: v(24, S, 24), state: './beekeeper_workbench' },
        { pos: v(22, S, 24), state: 'minecraft:barrel' },
        { pos: v(26, S, 24), state: 'minecraft:hay_block' },
      ],
      { keys: panKeys(2.5, 20) },
    ),
    look('block_front', '#d8a030'),
  ),
  card(
    'villager-look',
    'example_flow_desert_rose_villagers',
    null,
    look('villager_robe', '#c86040'),
  ),
  card('extra-drop', 'example_flow_skeleton_bones', null, look('produce', '#e8e0c8')),
  card('mob-skin', 'example_flow_snow_coat_cat', null, look('spawn_egg', '#e8eef4', '#9aa4ae')),
  card('goat-horn', 'example_flow_mountain_echo', null, look('flask', '#c8b898')),
  card('recipe_pack', 'starter_recipe_pack', null, look('ingot', '#c8c8c8')),
  card('music_disc', 'starter_music_disc', null, look('disc', '#8040b0')),
  card('function_starter', 'starter_function_starter', null, look('timer', '#c8a060')),
  card('custom_biome', 'starter_custom_biome', null, look('grass_top', '#d0a040')),
  card('jigsaw_structure', 'starter_jigsaw_structure', null, look('bricks', '#a87850')),
  card('worldgen_pack', 'starter_worldgen_pack', null, look('leaves', '#d0a040')),
  card(
    'custom_mob',
    'example_flow_stone_sentinel',
    mobClip(
      {
        flowId: 'custom_mob',
        exampleId: 'example_flow_stone_sentinel',
        title: 'A mob',
        sentence: 'A creature of your own with its model and spawn egg.',
        captions: [
          caption(5, 100, 'A stone sentinel hatches from its egg'),
          caption(100, 195, 'It fights back when hurt in the game.'),
        ],
      },
      './stone_sentinel_spawn_egg',
    ),
    look('spawn_egg', '#7a7f86', '#3c4046'),
  ),
  card(
    'pet',
    'example_flow_frost_wolf',
    mobClip(
      {
        flowId: 'pet',
        exampleId: 'example_flow_frost_wolf',
        title: 'A pet',
        sentence: 'An animal you tame, that follows you and has babies.',
        captions: [
          caption(5, 100, 'A frost wolf hatches from its egg'),
          caption(100, 195, 'Tame it with bones in the game.'),
        ],
      },
      './frost_wolf_spawn_egg',
    ),
    look('spawn_egg', '#d0e4f0'),
  ),
  card(
    'farm-animal',
    'example_flow_clover_sheep',
    mobClip(
      {
        flowId: 'farm-animal',
        exampleId: 'example_flow_clover_sheep',
        title: 'A farm animal',
        sentence: 'An animal you breed for what it drops.',
        captions: [
          caption(5, 100, 'A clover sheep hatches from its egg'),
          caption(100, 195, 'Breed it with wheat in the game.'),
        ],
      },
      './clover_sheep_spawn_egg',
    ),
    look('spawn_egg', '#ece8dc'),
  ),
  card(
    'mount',
    'example_popular_ember_drake',
    mobClip(
      {
        flowId: 'mount',
        exampleId: 'example_popular_ember_drake',
        title: 'A mount',
        sentence: 'A creature you saddle and ride.',
        captions: [
          caption(5, 100, 'An ember drake hatches from its egg'),
          caption(100, 195, 'Saddle it and fly it in the game.'),
        ],
      },
      './ember_drake_spawn_egg',
    ),
    look('spawn_egg', '#d05020'),
  ),
  card(
    'wandering-merchant',
    'example_flow_spice_trader',
    mobClip(
      {
        flowId: 'wandering-merchant',
        exampleId: 'example_flow_spice_trader',
        title: 'A trader',
        sentence: 'Someone who sells you things for emeralds.',
        captions: [
          caption(5, 100, 'A spice trader hatches from its egg'),
          caption(100, 195, 'It sells cocoa beans and sugar in the game.'),
        ],
      },
      './spice_trader_spawn_egg',
    ),
    look('villager_robe', '#c06030'),
  ),
  card(
    'flying-mob',
    'example_flow_ember_bat',
    mobClip(
      {
        flowId: 'flying-mob',
        exampleId: 'example_flow_ember_bat',
        title: 'A flying mob',
        sentence: 'A creature that flies, hovers or roosts.',
        captions: [
          caption(5, 100, 'An ember bat hatches from its egg'),
          caption(100, 195, 'It flies about at night in the game.'),
        ],
      },
      './ember_bat_spawn_egg',
    ),
    look('spawn_egg', '#d05020', '#3c2420'),
  ),
  card(
    'water-mob',
    'example_flow_lantern_fish',
    mobClip(
      {
        flowId: 'water-mob',
        exampleId: 'example_flow_lantern_fish',
        title: 'A water mob',
        sentence: 'A fish or other creature of the water.',
        captions: [
          caption(5, 100, 'A lantern fish hatches in a pool'),
          caption(100, 195, 'Catch it in a bucket in the game.'),
        ],
      },
      './lantern_fish_spawn_egg',
      { on: v(24, S - 3, 24), setup: pool() },
    ),
    look('spawn_egg', '#f0c040', '#2454c4'),
  ),
  card(
    'boss',
    'example_flow_frost_giant',
    mobClip(
      {
        flowId: 'boss',
        exampleId: 'example_flow_frost_giant',
        title: 'A boss',
        sentence: 'A huge foe with a boss bar.',
        captions: [
          caption(5, 100, 'A frost giant hatches from its egg'),
          caption(100, 195, 'Its boss bar shows in the game.'),
        ],
      },
      './frost_giant_spawn_egg',
      { offset: v(3, 6, 12) },
    ),
    look('spawn_egg', '#a0d0f0', '#2454c4'),
  ),
  card(
    'vehicle-car',
    'example_flow_ember_kart',
    vehicleClip(
      {
        flowId: 'vehicle-car',
        exampleId: 'example_flow_ember_kart',
        title: 'A car',
        sentence: 'A car of your own to drive.',
        captions: [
          caption(5, 28, 'Put it down and get in'),
          caption(30, 140, 'Drive it and steer it'),
        ],
      },
      './ember_kart',
    ),
    look('block', '#e05a20'),
  ),
  card(
    'vehicle-tank',
    'example_flow_desert_tank',
    vehicleClip(
      {
        flowId: 'vehicle-tank',
        exampleId: 'example_flow_desert_tank',
        title: 'A tank',
        sentence: 'A tank with a cannon.',
        captions: [
          caption(5, 28, 'Put it down and get in'),
          caption(30, 140, 'Drive it and steer it'),
          caption(140, 200, 'Its cannon fires in the game.'),
        ],
      },
      './desert_tank',
    ),
    look('block', '#c8a060'),
  ),
  card(
    'vehicle-plane',
    'example_flow_sky_hopper',
    vehicleClip(
      {
        flowId: 'vehicle-plane',
        exampleId: 'example_flow_sky_hopper',
        title: 'A plane',
        sentence: 'A plane of your own to fly.',
        captions: [
          caption(5, 28, 'Put it down, give it coal and get in'),
          caption(30, 140, 'Drive it along the ground'),
          caption(140, 200, 'It takes off and flies in the game.'),
        ],
      },
      './sky_hopper',
      { fuel: 'minecraft:coal' },
    ),
    look('block', '#c41c34'),
  ),
  card(
    'vehicle-boat',
    'example_flow_paddle_steamer',
    vehicleClip(
      {
        flowId: 'vehicle-boat',
        exampleId: 'example_flow_paddle_steamer',
        title: 'A boat',
        sentence: 'A boat of your own with seats and a horn.',
        captions: [
          caption(5, 28, 'Put it down and get in'),
          caption(30, 140, 'Steer it across the water'),
        ],
      },
      './paddle_steamer',
      { water: true },
    ),
    look('boat', '#8c5a2e'),
  ),
  card(
    'scripted_ore',
    'starter_scripted_ore',
    blocksClip(
      {
        flowId: 'scripted_ore',
        exampleId: 'starter_scripted_ore',
        title: 'An ore with scripts',
        sentence: 'An ore that does something when you mine it.',
        isFlow: false,
        captions: [
          caption(5, 100, 'Ruby ore and a block of ruby'),
          caption(100, 195, 'Its scripts run in the game.'),
        ],
      },
      [
        ...wall(5, 3, (x, y) => ((x + y) % 2 === 1 ? './ruby_ore' : 'minecraft:stone')),
        { pos: v(24, S, 26), state: './ruby_block' },
      ],
    ),
    look('ore', '#c41c34'),
  ),
  card('scripted-item', 'example_flow_storm_staff', null, look('spear', '#5c8cd0')),
  card('custom-command', 'example_flow_feast_command', null, look('pattern_sheet', '#c8a060')),
  card(
    'creative-tab',
    'example_flow_garden_tab',
    blocksClip(
      {
        flowId: 'creative-tab',
        exampleId: 'example_flow_garden_tab',
        title: 'A creative tab',
        sentence: 'A tab of your own in the creative inventory.',
        captions: [
          caption(5, 100, 'The block the tab holds'),
          caption(100, 195, 'The tab shows in the creative inventory in the game.'),
        ],
      },
      row(['./garden_block', 'minecraft:flower_pot', './garden_block']),
    ),
    look('block', '#5aa03c'),
  ),
  card('game-rule', 'example_flow_night_greeting', null, look('timer', '#2c3c8c')),
  card('skyblock', 'example_game_cloud_farm', null, look('grass_top', '#78b048')),
  card('one-block', 'example_game_deep_block', null, look('grass_side', '#78b048')),
  card('sky-islands', 'example_game_blossom_isles', null, look('leaves', '#f0a0c0')),
  card(
    'lucky-block',
    'example_game_star_block',
    blocksClip(
      {
        flowId: 'lucky-block',
        exampleId: 'example_game_star_block',
        title: 'A lucky block',
        sentence: 'A block that gives a surprise when broken.',
        captions: [
          caption(5, 100, 'Star blocks waiting to be broken'),
          caption(100, 195, 'Each one gives a surprise in the game.'),
        ],
      },
      row(['./star_block', './star_block', './star_block']),
    ),
    look('lucky_block', '#3c78d8'),
  ),
  card('adventure-map', 'example_game_crystal_road', null, look('flag', '#5ad0e0')),
  card('arena-game', 'example_game_four_kingdoms', null, look('flag', '#d0a020')),
  card('race', 'example_game_canyon_dash', null, look('timer', '#c86040')),
  card('goals', 'example_game_explorer', null, look('flag', '#3cb060')),
];

/** The gallery cards' examples, clips and pictures, by starter or flow id. */
export const FLOW_CARDS: Readonly<Record<string, FlowCard>> = Object.freeze(
  Object.fromEntries(CARDS.map((entry) => [entry.flowId, entry])),
);

/** Every clip of {@link FLOW_CARDS} (a reused showcase clip once per card). */
export function flowClips(): ShowcaseClip[] {
  return CARDS.flatMap((entry) => (entry.clip === null ? [] : [entry.clip]));
}
