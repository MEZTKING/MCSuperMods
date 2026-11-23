/**
 * The showcase list (ADR 0118 D3, D12): the cards of **See what you can make**, in order, each a
 * clip drawn from a library example by id, with Home's own Make this actions. The list belongs
 * to the app, as Home's tiles do (`components/home/tiles.ts`); the examples stay in the library
 * unchanged (B566 card 1, B567 cards 2 to 10, B588 the world cards 11 to 13).
 *
 * The clip scripts follow B565's measured action sequences
 * (`docs/reference/spikes/b565/README.md`, `clips.json`). Captions say what only happens in the
 * game ("… in the game"); mobs only wander (ADR 0118 D11).
 *
 * @packageDocumentation
 */

import type { ExampleProject, TargetFacts } from '@msm/plugin-api';
import type { Face } from '@msm/sim';
import { TRADER_FLOW_ID, VEHICLE_FLOW_IDS } from '../components/home/tiles';
import type { CameraKey, ClipBlock, ClipGround, ClipPoint, ClipStep, ShowcaseClip } from './clip';

/** The showcase list: clips in the order the cards show. */
export type ShowcaseList = readonly ShowcaseClip[];

const v = (x: number, y: number, z: number): ClipPoint => ({ x, y, z });
/**
 * The middle of block `n` along one axis. Written so for coordinates whose literal would read
 * as a Minecraft version to the repository's version-fact check (`tools/check-deps`).
 */
const mid = (n: number): number => n + 0.5;

/** Flat ground: the first air layer is y 4. */
const FLAT: ClipGround = { kind: 'flat' };
/** The first air layer of flat ground. */
const FLAT_AIR = 4;
/** The first air layer of the quick flat grounds. */
const QUICK_AIR = 9;

/** The quick flat ground of grass over dirt and stone with a few trees (first air at y 9). */
const QUICK_FEW_TREES = {
  kind: 'quick',
  options: {
    shape: 'flat',
    layers: [
      { block: 'minecraft:grass_block[snowy=false]', thickness: 1 },
      { block: 'minecraft:dirt', thickness: 3 },
      { block: 'minecraft:stone', thickness: 4 },
      { block: 'minecraft:bedrock', thickness: 1 },
    ],
    water: false,
    waterLevel: 4,
    trees: 'few',
    seed: 11,
  },
} as const;

/** Card 1: a small elm hut; planks and slabs are placed, the door opens and shuts. */
function woodSet(): ShowcaseClip {
  const s = 9;
  const setup: ClipBlock[] = [];
  for (const [x, z] of [
    [21, 21],
    [25, 21],
    [21, 25],
    [25, 25],
  ] as const) {
    for (let y = s; y < s + 3; y += 1) setup.push({ pos: v(x, y, z), state: './elm_log[axis=y]' });
  }
  for (let y = s; y < s + 3; y += 1) {
    for (let x = 22; x <= 24; x += 1) setup.push({ pos: v(x, y, 21), state: './elm_planks' });
    for (let z = 22; z <= 24; z += 1) {
      setup.push({ pos: v(21, y, z), state: './elm_planks' });
      setup.push({ pos: v(25, y, z), state: './elm_planks' });
    }
  }
  for (let x = 21; x <= 25; x += 1) {
    for (let z = 21; z <= 25; z += 1) {
      setup.push({ pos: v(x, s + 3, z), state: './elm_slab[type=bottom]' });
    }
  }
  const plank = (tick: number, x: number, y: number): ClipStep => ({
    tick,
    action: { type: 'place', pos: v(x, y - 1, 25), face: 'up', block: './elm_planks' },
    expect: [{ at: v(x, y, 25), state: './elm_planks' }],
  });
  return {
    id: 'wood-set',
    title: 'A set of wood',
    sentence: 'Logs, planks, stairs, a door and a tree of your own.',
    exampleId: 'example_msm_wood_set',
    make: { type: 'flows', flowIds: ['wood-set'] },
    ground: QUICK_FEW_TREES,
    player: v(23.5, s, 29.5),
    setup,
    steps: [
      // Placed blocks face the player's look (B565 Z6): the door faces north, out of the hut.
      { tick: 1, action: { type: 'look', yaw: 180, pitch: 30 } },
      plank(10, 22, s),
      plank(18, 24, s),
      plank(26, 22, s + 1),
      plank(34, 24, s + 1),
      {
        tick: 42,
        action: { type: 'place', pos: v(22, s + 1, 25), face: 'up', block: './elm_slab' },
        expect: [{ at: v(22, s + 2, 25), state: './elm_slab[type=bottom]' }],
      },
      {
        tick: 50,
        action: { type: 'place', pos: v(24, s + 1, 25), face: 'up', block: './elm_slab' },
        expect: [{ at: v(24, s + 2, 25), state: './elm_slab[type=bottom]' }],
      },
      {
        tick: 60,
        action: { type: 'use', pos: v(23, s - 1, 25), face: 'up', item: './elm_door' },
        expect: [
          { at: v(23, s, 25), state: './elm_door[half=lower,facing=north,open=false]' },
          { at: v(23, s + 1, 25), state: './elm_door[half=upper]' },
        ],
      },
      {
        tick: 100,
        action: { type: 'use', pos: v(23, s, 25), face: 'south' },
        expect: [{ at: v(23, s, 25), state: './elm_door[open=true]' }],
      },
      {
        tick: 150,
        action: { type: 'use', pos: v(23, s, 25), face: 'south' },
        expect: [{ at: v(23, s, 25), state: './elm_door[open=false]' }],
      },
    ],
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(23.5, s + 2.5, 33), yaw: 180, pitch: 12 },
        { tick: 120, eye: v(30.5, s + 3.5, 31.5), yaw: 150, pitch: 15 },
        { tick: 200, eye: v(31.5, s + 4, 27.5), yaw: 120, pitch: 18 },
      ],
    },
    captions: [
      { start: 8, end: 58, text: 'Build with your own planks and slabs' },
      { start: 95, end: 175, text: 'Your own door opens and shuts' },
    ],
    stillAt: 120,
    length: 200,
  };
}

/** The quick flat ground of sand over sandstone and stone, with no trees (first air at y 9). */
const QUICK_SAND: ClipGround = {
  kind: 'quick',
  options: {
    shape: 'flat',
    layers: [
      { block: 'minecraft:sand', thickness: 3 },
      { block: 'minecraft:sandstone', thickness: 3 },
      { block: 'minecraft:stone', thickness: 2 },
      { block: 'minecraft:bedrock', thickness: 1 },
    ],
    water: false,
    waterLevel: 4,
    trees: 'none',
    seed: 1,
  },
};

/** Where a followed mob's camera sits: behind and above it, a little to the east. */
const FOLLOW_OFFSET = v(1.5, 2.5, 6);

/**
 * The first camera key of a followed mob's clip: where the follow camera will be once the mob
 * hatches at `feet` (so the view does not jump), looking at it.
 */
function followStart(feet: ClipPoint): CameraKey {
  return {
    tick: 0,
    eye: v(feet.x + FOLLOW_OFFSET.x, feet.y + FOLLOW_OFFSET.y, feet.z + FOLLOW_OFFSET.z),
    yaw: 166,
    pitch: 17,
  };
}

/** Card 2: two pets hatch from their spawn egg and wander; the camera follows the first. */
function pet(): ShowcaseClip {
  const s = QUICK_AIR;
  return {
    id: 'pet',
    title: 'A pet',
    sentence: 'An animal you tame, that follows you and has babies.',
    exampleId: 'example_msm_tameable_pet',
    make: { type: 'flows', flowIds: ['pet'] },
    ground: QUICK_FEW_TREES,
    // Away from the eggs: a mob is not hatched into the player's box (B565 Z6).
    player: v(36.5, s, 36.5),
    setup: [],
    steps: [
      {
        tick: 5,
        action: { type: 'use', pos: v(23, s - 1, 24), face: 'up', item: './ember_fox_spawn_egg' },
        expect: [{ line: 'You spawned Ember Fox' }],
      },
      {
        tick: 25,
        action: { type: 'use', pos: v(26, s - 1, 25), face: 'up', item: './ember_fox_spawn_egg' },
        expect: [{ line: 'You spawned Ember Fox' }],
      },
    ],
    camera: {
      type: 'follow',
      mob: 0,
      offset: FOLLOW_OFFSET,
      keys: [followStart(v(23.5, s, 24.5))],
    },
    captions: [
      { start: 5, end: 70, text: 'Two hatch from its own spawn egg' },
      { start: 75, end: 140, text: 'Tame it with sweet berries in the game.' },
      { start: 140, end: 200, text: 'In the game it follows you and has babies.' },
    ],
    stillAt: 100,
    length: 200,
  };
}

/** Card 3: onions are planted in a row on farmland and grow stage by stage (the Grow tool). */
function crop(): ShowcaseClip {
  const s = FLAT_AIR;
  const setup: ClipBlock[] = [];
  const steps: ClipStep[] = [];
  const first = 20;
  const last = 28;
  for (let x = first; x <= last; x += 1) {
    setup.push({ pos: v(x, s - 1, 24), state: 'minecraft:farmland[moisture=7]' });
    setup.push({ pos: v(x, s - 1, 25), state: 'minecraft:water[level=0]' });
  }
  // Planting uses the crop block itself, as Try it's hotbar does (B565 Z10).
  for (let x = first; x <= last; x += 1) {
    steps.push({
      tick: 5 + (x - first) * 4,
      action: { type: 'use', pos: v(x, s - 1, 24), face: 'up', item: './onion_crop' },
      expect: [{ at: v(x, s, 24), state: './onion_crop[age=0]' }],
    });
  }
  // Seven rounds of the Grow tool take each onion from stage 1 to stage 8 (age 0 to 7).
  for (let round = 0; round < 7; round += 1) {
    for (let x = first; x <= last; x += 1) {
      steps.push({
        tick: 50 + round * 20 + (x - first) * 2,
        action: { type: 'tool', tool: 'grow', pos: v(x, s, 24) },
        expect: [{ at: v(x, s, 24), state: `./onion_crop[age=${round + 1}]` }],
      });
    }
  }
  return {
    id: 'crop',
    title: 'Plants that grow',
    sentence: 'A crop you plant, grow and eat.',
    exampleId: 'example_msm_crop',
    make: { type: 'flows', flowIds: ['crop'] },
    ground: FLAT,
    player: v(24.5, s, 30.5),
    setup,
    steps,
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(18.5, s + 2, 28.5), yaw: 200, pitch: 25 },
        { tick: 220, eye: v(28.5, s + 2, 28.5), yaw: 160, pitch: 25 },
      ],
    },
    captions: [
      { start: 5, end: 45, text: 'Plant your own crop on farmland' },
      { start: 50, end: 190, text: 'It grows stage by stage' },
      { start: 190, end: 220, text: 'Pick it and eat it in the game.' },
    ],
    stillAt: 200,
    length: 220,
  };
}

/** Card 4: the crusher is placed between a hopper and a chest, and its front lights. */
function machine(): ShowcaseClip {
  const s = FLAT_AIR;
  return {
    id: 'machine',
    title: 'A machine',
    sentence: 'A block that works on items, fed by hoppers.',
    exampleId: 'example_msm_ore_crusher',
    make: { type: 'flows', flowIds: ['machine'] },
    ground: FLAT,
    player: v(24.5, s, 30.5),
    setup: [
      { pos: v(24, s + 1, 24), state: 'minecraft:hopper[facing=down,enabled=true]' },
      { pos: v(25, s, 24), state: 'minecraft:chest[facing=south,type=single,waterlogged=false]' },
      { pos: v(22, s, 24), state: 'minecraft:oak_log[axis=y]' },
    ],
    steps: [
      // The crusher faces the player's look (B565 Z6): south, towards the camera.
      { tick: 1, action: { type: 'look', yaw: 180, pitch: 20 } },
      {
        tick: 10,
        action: { type: 'place', pos: v(24, s - 1, 24), face: 'up', block: './ore_crusher' },
        expect: [{ at: v(24, s, 24), state: './ore_crusher[facing=south,lit=false]' }],
      },
      {
        tick: 50,
        action: { type: 'tool', tool: 'power', pos: v(24, s, 24) },
        expect: [
          { line: 'Ore Crusher is now lit' },
          { at: v(24, s, 24), state: './ore_crusher[lit=true]' },
        ],
      },
      {
        tick: 180,
        action: { type: 'set', pos: v(24, s, 24), state: './ore_crusher[facing=south,lit=false]' },
        expect: [{ at: v(24, s, 24), state: './ore_crusher[lit=false]' }],
      },
    ],
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(22.5, s + 2.5, 28.5), yaw: 200, pitch: 22 },
        { tick: 200, eye: v(mid(26), s + 2.5, 28.5), yaw: 160, pitch: 22 },
      ],
    },
    captions: [
      { start: 10, end: 50, text: 'A machine block of your own' },
      { start: 55, end: 180, text: 'It crushes raw ore into ingots in the game.' },
    ],
    stillAt: 100,
    length: 200,
  };
}

/** Card 5: the tank is placed, the player gets in, drives forward and turns. */
function vehicle(): ShowcaseClip {
  const s = FLAT_AIR;
  return {
    id: 'vehicle',
    title: 'A vehicle',
    sentence: 'Something to drive, with seats and a cannon.',
    exampleId: 'example_msm_vehicle',
    make: { type: 'flows', flowIds: VEHICLE_FLOW_IDS },
    ground: FLAT,
    player: v(24.5, s, 34.5),
    setup: [],
    steps: [
      { tick: 1, action: { type: 'look', yaw: 180, pitch: 30 } },
      {
        tick: 5,
        action: { type: 'use', pos: v(24, s - 1, 30), face: 'up', item: './tank' },
      },
      {
        tick: 20,
        action: { type: 'useVehicle', vehicle: 0 },
        expect: [{ line: 'You got into Tank' }],
      },
      // A held move drives; `strafe` steers (B565 Z7).
      { tick: 30, action: { type: 'move', forward: 1, strafe: 0 } },
      { tick: 75, action: { type: 'move', forward: 1, strafe: 1 } },
      { tick: 105, action: { type: 'move', forward: 1, strafe: 0 } },
      { tick: 135, action: { type: 'move', forward: 0, strafe: 0 } },
    ],
    camera: { type: 'driver' },
    captions: [
      { start: 5, end: 28, text: 'Put it down and get in' },
      { start: 30, end: 135, text: 'Drive it and steer it' },
      { start: 140, end: 220, text: 'Its cannon fires in the game.' },
    ],
    stillAt: 100,
    length: 220,
  };
}

/** Card 6: the frame is built block by block, then the portal fills (a `set`, B565 Z8). */
function portal(): ShowcaseClip {
  const s = FLAT_AIR;
  const frame = './sky_gate_frame';
  const steps: ClipStep[] = [{ tick: 1, action: { type: 'look', yaw: 180, pitch: 0 } }];
  let tick = 5;
  const put = (at: ClipPoint, against: ClipPoint, face: Face): void => {
    steps.push({
      tick,
      action: { type: 'place', pos: against, face, block: frame },
      expect: [{ at, state: frame }],
    });
    tick += 5;
  };
  // Four by five: the bottom row on the ground, the sides upwards, the top from the west post.
  for (let x = 22; x <= 25; x += 1) put(v(x, s, 24), v(x, s - 1, 24), 'up');
  for (let y = s + 1; y <= s + 4; y += 1) {
    put(v(22, y, 24), v(22, y - 1, 24), 'up');
    put(v(25, y, 24), v(25, y - 1, 24), 'up');
  }
  put(v(23, s + 4, 24), v(22, s + 4, 24), 'east');
  put(v(24, s + 4, 24), v(23, s + 4, 24), 'east');
  // Lighting the frame happens only in the game (B565 Z8): the clip fills it. The beacon of
  // the example is left out, as it draws without its picture (B565).
  const fill = tick + 5;
  for (let y = s + 1; y <= s + 3; y += 1) {
    for (let x = 23; x <= 24; x += 1) {
      steps.push({
        tick: fill,
        action: { type: 'set', pos: v(x, y, 24), state: './sky_gate[axis=x]' },
        expect: [{ at: v(x, y, 24), state: './sky_gate[axis=x]' }],
      });
    }
  }
  return {
    id: 'portal',
    title: 'A portal',
    sentence: 'A doorway to a new world of your own.',
    exampleId: 'example_msm_sky_portal',
    make: { type: 'flows', flowIds: ['portal'] },
    ground: FLAT,
    player: v(23.5, s, 29.5),
    setup: [],
    steps,
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(23.5, s + 3, 32), yaw: 180, pitch: 8 },
        { tick: 220, eye: v(27.5, s + 3, 31), yaw: 155, pitch: 8 },
      ],
    },
    captions: [
      { start: 5, end: 75, text: 'Build its frame from a block of your own' },
      { start: fill, end: 150, text: 'Light it with flint and steel in the game.' },
      { start: 150, end: 220, text: 'It takes you to the sky world in the game.' },
    ],
    stillAt: 200,
    length: 220,
  };
}

/** Card 7: jars on posts glow with fireflies; the spark wand sends a burst up. */
function sparkles(): ShowcaseClip {
  const s = FLAT_AIR;
  const setup: ClipBlock[] = [];
  for (const x of [21, 24, 27]) {
    setup.push({ pos: v(x, s, 24), state: 'minecraft:oak_log[axis=y]' });
    setup.push({ pos: v(x, s + 1, 24), state: './firefly_jar' });
  }
  const wand = (tick: number): ClipStep => ({
    tick,
    action: { type: 'use', pos: v(24, s + 1, 24), face: 'south', item: './spark_wand' },
    expect: [{ line: 'Firefly Glow particles', within: 1 }],
  });
  return {
    id: 'sparkles',
    title: 'Sparkles',
    sentence: 'Particles of your own, on blocks and wands.',
    exampleId: 'example_msm_firefly_jar',
    make: { type: 'flows', flowIds: ['particle'] },
    ground: FLAT,
    // Near the jars: the wand's burst rises at the player's eye (B565 Z6).
    player: v(24.5, s, mid(26)),
    setup,
    steps: [{ tick: 1, action: { type: 'look', yaw: 180, pitch: 0 } }, wand(120), wand(170)],
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(24.5, s + 2.5, 31), yaw: 180, pitch: 10 },
        { tick: 200, eye: v(24.5, s + 2.2, 30), yaw: 180, pitch: 8 },
      ],
    },
    captions: [
      { start: 10, end: 110, text: 'Jars that glow with fireflies of your own' },
      { start: 120, end: 200, text: 'A wand that sends sparkles up' },
    ],
    stillAt: 130,
    length: 200,
  };
}

/** Card 8: the merchant hatches by its bell on a road and wanders; the camera follows it. */
function trader(): ShowcaseClip {
  const s = QUICK_AIR;
  const setup: ClipBlock[] = [];
  for (let z = 14; z <= 34; z += 1) {
    setup.push({ pos: v(22, s - 1, z), state: 'minecraft:dirt_path' });
    setup.push({ pos: v(23, s - 1, z), state: 'minecraft:dirt_path' });
  }
  setup.push({ pos: v(25, s, 24), state: 'minecraft:oak_log[axis=y]' });
  setup.push({
    pos: v(25, s + 1, 24),
    state: 'minecraft:bell[attachment=floor,facing=south,powered=false]',
  });
  return {
    id: 'trader',
    title: 'A trader',
    sentence: 'Someone who sells you things for emeralds.',
    exampleId: 'example_msm_roadside_merchant',
    make: { type: 'flows', flowIds: [TRADER_FLOW_ID] },
    ground: QUICK_FEW_TREES,
    player: v(36.5, s, 36.5),
    setup,
    steps: [
      {
        tick: 5,
        action: {
          type: 'use',
          pos: v(24, s - 1, 25),
          face: 'up',
          item: './roadside_merchant_spawn_egg',
        },
        expect: [{ line: 'You spawned Roadside Merchant' }],
      },
    ],
    camera: {
      type: 'follow',
      mob: 0,
      offset: FOLLOW_OFFSET,
      keys: [followStart(v(24.5, s, 25.5))],
    },
    captions: [
      { start: 5, end: 90, text: 'A merchant of your own by the road' },
      {
        start: 95,
        end: 200,
        text: 'In the game it sells bread and apples, then saddles and leads.',
      },
    ],
    stillAt: 100,
    length: 200,
  };
}

/** Card 9: a pit is dug in sand and oil is poured into it from its bucket. */
function fluid(): ShowcaseClip {
  const s = QUICK_AIR;
  const steps: ClipStep[] = [{ tick: 1, action: { type: 'look', yaw: 180, pitch: 40 } }];
  let tick = 5;
  for (let x = 23; x <= 25; x += 1) {
    for (let z = 23; z <= 25; z += 1) {
      steps.push({ tick, action: { type: 'break', pos: v(x, s - 1, z) } });
      tick += 4;
    }
  }
  const pour = tick + 10;
  steps.push({
    tick: pour,
    action: { type: 'use', pos: v(24, s - 2, 24), face: 'up', item: './oil_bucket' },
    expect: [{ line: 'You poured Oil' }, { at: v(24, s - 1, 24), state: './oil' }],
  });
  return {
    id: 'fluid',
    title: 'A liquid of your own',
    sentence: 'A liquid with its own bucket, lakes and feel.',
    exampleId: 'example_msm_fluid',
    make: { type: 'flows', flowIds: ['fluid'] },
    ground: QUICK_SAND,
    player: v(24.5, s, 29.5),
    setup: [],
    steps,
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(24.5, s + 3.5, 29.5), yaw: 180, pitch: 35 },
        { tick: 220, eye: v(27.5, s + 3.5, 28.5), yaw: 150, pitch: 35 },
      ],
    },
    captions: [
      { start: 5, end: 45, text: 'Dig a pit in the sand' },
      { start: pour, end: 140, text: 'Pour your own liquid from its bucket' },
      { start: 140, end: 220, text: 'It flows slowly in the game.' },
    ],
    stillAt: 160,
    length: 220,
  };
}

/**
 * Card 10: two of three lucky blocks are broken and the rule runs ("Run every time"). Its
 * captions are the rule's own "What happened" lines (B565 Z9); dropping coins happens only in
 * the game.
 */
function rules(): ShowcaseClip {
  const s = FLAT_AIR;
  const rule = 'Rule "Open a lucky block"';
  return {
    id: 'rules',
    title: 'Rules: a lucky block',
    sentence: 'Make things happen without code: break it and see.',
    exampleId: 'example_msm_rules',
    make: { type: 'example' },
    ground: FLAT,
    player: v(24.5, s, 28.5),
    setup: [
      { pos: v(22, s, 24), state: './lucky_block' },
      { pos: v(24, s, 24), state: './lucky_block' },
      { pos: v(26, s, 24), state: './lucky_block' },
    ],
    steps: [
      { tick: 1, action: { type: 'look', yaw: 180, pitch: 20 } },
      {
        tick: 60,
        action: { type: 'break', pos: v(24, s, 24) },
        // A rule run as a script answers a tick or two later (B565 Z9, B566).
        expect: [
          { line: 'which starts rule "Open a lucky block"' },
          { line: `${rule} ran as a script`, within: 3 },
          { line: 'Lucky blocks opened: ', within: 3 },
        ],
      },
      {
        tick: 140,
        action: { type: 'break', pos: v(22, s, 24) },
        expect: [
          { line: `${rule} ran as a script`, within: 3 },
          { line: 'Lucky blocks opened: ', within: 3 },
        ],
      },
    ],
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(24.5, s + 2.5, 30), yaw: 180, pitch: 18 },
        { tick: 200, eye: v(25.5, s + 2.5, 29.5), yaw: 170, pitch: 18 },
      ],
    },
    captions: [
      { start: 5, end: 58, text: 'Break a lucky block and see what happens' },
      { start: 61, end: 100, text: `${rule} ran` },
      { start: 100, end: 138, text: 'In the game it drops lucky coins.' },
      { start: 141, end: 200, text: `${rule} ran again` },
    ],
    stillAt: 80,
    length: 200,
  };
}

/**
 * The world cards (B588, ADR 0119 D12): a window of a world example's own land, made by the
 * terrain engine from the example's files alone (no Minecraft file), as Try it's ground "My world
 * generation" makes it. Each clip is a slow look round, with no steps: the land is the subject.
 * Their seed is the world map's example seed, 12345; places were picked from its map.
 *
 * Endless Blossom is left out: its cherry trees are the game's own (vanilla biome features), so
 * without the jar it draws as plain green hills. Cloud Realm is all air until Skyblock's start
 * island (B586).
 */
const WORLD_SEED = '12345';

/**
 * Card 11: a sandy island and its lagoon (the window's west is the island, the east the sea).
 * The jungle and savanna trees are the game's own, so they grow only in the game.
 */
function islands(): ShowcaseClip {
  return {
    id: 'world-islands',
    title: 'A world of islands',
    sentence: 'Your own world: small sandy islands in a wide sea.',
    exampleId: 'example_world_coral_isles',
    make: { type: 'flows', flowIds: ['world-islands'] },
    ground: {
      kind: 'generated',
      preset: './coral_isles',
      dimension: 'minecraft:overworld',
      seed: WORLD_SEED,
      centre: { x: -200, z: -168 },
      bottom: 54,
    },
    player: v(mid(12), 18, mid(20)),
    setup: [],
    steps: [],
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(46, 21, 42), yaw: 125, pitch: 14 },
        { tick: 110, eye: v(45, 19, 24), yaw: 100, pitch: 10 },
        { tick: 200, eye: v(42, 20, 6), yaw: 70, pitch: 12 },
      ],
    },
    captions: [
      { start: 5, end: 100, text: 'Islands rise out of a wide sea' },
      { start: 105, end: 195, text: 'Its jungle trees grow in the game.' },
    ],
    stillAt: 110,
    length: 200,
  };
}

/** Card 12: a snowy summit (the window's south), the slopes falling away to the north. */
function mountains(): ShowcaseClip {
  return {
    id: 'world-mountains',
    title: 'A world of tall mountains',
    sentence: 'Your own world: snowy peaks as tall as the sky allows.',
    exampleId: 'example_world_frost_peaks',
    make: { type: 'flows', flowIds: ['world-mountains'] },
    ground: {
      kind: 'generated',
      preset: './frost_peaks',
      dimension: 'minecraft:overworld',
      seed: WORLD_SEED,
      centre: { x: 216, z: -164 },
      bottom: 272,
    },
    player: v(mid(28), 31, mid(40)),
    setup: [],
    steps: [],
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(4, 31, 12), yaw: -50, pitch: 26 },
        { tick: 110, eye: v(12, 31, 10), yaw: -25, pitch: 28 },
        { tick: 200, eye: v(28, 31, 10), yaw: 5, pitch: 26 },
      ],
    },
    captions: [
      { start: 5, end: 100, text: 'Snowy peaks as tall as the world allows' },
      { start: 105, end: 195, text: 'Its caves are carved in the game.' },
    ],
    stillAt: 110,
    length: 200,
  };
}

/**
 * Card 13: a cavern over a lava lake at the bottom of the caves (the window's north-east is
 * open over the lava), the shroomlight glowing along its edge. The rock roof is higher up.
 */
function caves(): ShowcaseClip {
  return {
    id: 'world-caves',
    title: 'A world of caves',
    sentence: 'Your own world: caves under a roof of rock, with lava lakes.',
    exampleId: 'example_world_ember_caverns',
    make: { type: 'flows', flowIds: ['world-caves'] },
    ground: {
      kind: 'generated',
      preset: './ember_caverns',
      dimension: 'minecraft:overworld',
      seed: WORLD_SEED,
      centre: { x: 0, z: 0 },
      bottom: 12,
    },
    player: v(mid(44), 20, mid(6)),
    setup: [],
    steps: [],
    camera: {
      type: 'keys',
      keys: [
        { tick: 0, eye: v(46, 13, 3), yaw: 60, pitch: 10 },
        { tick: 110, eye: v(44, 12, 5), yaw: 45, pitch: 12 },
        { tick: 200, eye: v(40, 13, 3), yaw: 30, pitch: 10 },
      ],
    },
    captions: [
      { start: 5, end: 100, text: 'Caves under a roof of rock' },
      { start: 105, end: 195, text: 'Lava lakes glow at the bottom' },
    ],
    stillAt: 110,
    length: 200,
  };
}

/**
 * The showcase cards, in order: blocks, creatures and plants before machines and logic (the
 * first ten, ADR 0118 D12), then the world cards (B588), which wrap onto the gallery's next row.
 */
export const SHOWCASES: ShowcaseList = Object.freeze([
  woodSet(),
  pet(),
  crop(),
  machine(),
  vehicle(),
  portal(),
  sparkles(),
  trader(),
  fluid(),
  rules(),
  islands(),
  mountains(),
  caves(),
]);

/**
 * The cards whose example is offered on `target`: among `examples` (the session library's) and
 * supported there. A card whose example is missing or unsupported is hidden (ADR 0118 D3, U11).
 */
export function showcasesFor(
  target: TargetFacts,
  examples: readonly ExampleProject[],
  list: ShowcaseList = SHOWCASES,
): ShowcaseClip[] {
  const byId = new Map(examples.map((example) => [example.id, example]));
  return list.filter((clip) => {
    const example = byId.get(clip.exampleId);
    return example !== undefined && (example.supports?.(target) ?? true);
  });
}

/**
 * The name **Make this** offers for a new mod when none is open (ADR 0118 D10: "Elm Mod"), from
 * the card's example; a card not listed here gets "My Mod".
 */
const MOD_NAMES: Readonly<Record<string, string>> = {
  'wood-set': 'Elm Mod',
  pet: 'Fox Mod',
  crop: 'Onion Mod',
  machine: 'Crusher Mod',
  vehicle: 'Tank Mod',
  portal: 'Sky Mod',
  sparkles: 'Firefly Mod',
  trader: 'Merchant Mod',
  fluid: 'Oil Mod',
  rules: 'Lucky Mod',
  'world-islands': 'Island Mod',
  'world-mountains': 'Mountain Mod',
  'world-caves': 'Cave Mod',
};

/** The mod name a card's **Make this** prefills when no mod is open (B569). */
export function showcaseModName(clip: ShowcaseClip): string {
  return MOD_NAMES[clip.id] ?? 'My Mod';
}
