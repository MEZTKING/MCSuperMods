/**
 * B565 throwaway: the ten clip scripts as measured. Ids starting `./` are the example's
 * (`showcase:`). Ticks are simulation ticks (20 a second). `S` is the first air layer of the
 * ground at the area's centre (flat ground 4, quick classic flat 9).
 */
import type { QuickWorldOptions } from '@msm/sim';

export type V3 = { x: number; y: number; z: number };
export type SpikeGround =
  | { kind: 'grid' }
  | { kind: 'flat' }
  | { kind: 'quick'; options: Partial<QuickWorldOptions> };
export type SpikeStep =
  | { type: 'place'; pos: V3; face: Face; block: string }
  | { type: 'use'; pos: V3; face: Face; item?: string }
  | { type: 'break'; pos: V3 }
  | { type: 'tool'; tool: string; pos: V3 }
  | { type: 'set'; pos: V3; state: string }
  | { type: 'look'; yaw: number; pitch: number }
  | { type: 'teleport'; to: V3 }
  | { type: 'useVehicle'; index: number }
  | { type: 'drive'; forward: number; strafe: number };
export type Face = 'up' | 'down' | 'north' | 'south' | 'east' | 'west';
export interface CameraKey {
  tick: number;
  eye: V3;
  yaw: number;
  pitch: number;
}
export interface SpikeClip {
  id: string;
  exampleId: string;
  ground: SpikeGround;
  /** Where the player stands before the first step (feet). */
  player: V3;
  setup: { pos: V3; state: string }[];
  steps: { tick: number; step: SpikeStep }[];
  camera: CameraKey[] | 'driver';
  length: number;
  stillAt: number;
  /** Substrings of "What happened" lines the clip must give. */
  expect: string[];
}

const FLAT: SpikeGround = { kind: 'flat' };
const CLASSIC = [
  { block: 'minecraft:grass_block[snowy=false]', thickness: 1 },
  { block: 'minecraft:dirt', thickness: 3 },
  { block: 'minecraft:stone', thickness: 4 },
  { block: 'minecraft:bedrock', thickness: 1 },
];
const QUICK_FEW: SpikeGround = {
  kind: 'quick',
  options: { shape: 'flat', layers: CLASSIC, water: false, waterLevel: 4, trees: 'few', seed: 11 },
};
const QUICK_SAND: SpikeGround = {
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
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const at = (tick: number, step: SpikeStep) => ({ tick, step });

/** The first air y of each ground (flat 4; quick classic or sand flat 9). */
export const SURFACE: Record<string, number> = { flat: 4, quick: 9 };

function woodSet(): SpikeClip {
  const S = 9;
  const setup: SpikeClip['setup'] = [];
  for (const [x, z] of [
    [21, 21],
    [25, 21],
    [21, 25],
    [25, 25],
  ] as const) {
    for (let y = S; y < S + 3; y += 1) setup.push({ pos: v(x, y, z), state: './elm_log[axis=y]' });
  }
  for (let y = S; y < S + 3; y += 1) {
    for (let x = 22; x <= 24; x += 1) setup.push({ pos: v(x, y, 21), state: './elm_planks' });
    for (let z = 22; z <= 24; z += 1) {
      setup.push({ pos: v(21, y, z), state: './elm_planks' });
      setup.push({ pos: v(25, y, z), state: './elm_planks' });
    }
  }
  for (let x = 21; x <= 25; x += 1) {
    for (let z = 21; z <= 25; z += 1) setup.push({ pos: v(x, S + 3, z), state: './elm_slab[type=bottom]' });
  }
  return {
    id: 'wood-set',
    exampleId: 'example_msm_wood_set',
    ground: QUICK_FEW,
    player: v(23.5, S, 29.5),
    setup,
    steps: [
      at(1, { type: 'look', yaw: 180, pitch: 30 }),
      at(10, { type: 'place', pos: v(22, S - 1, 25), face: 'up', block: './elm_planks' }),
      at(18, { type: 'place', pos: v(24, S - 1, 25), face: 'up', block: './elm_planks' }),
      at(26, { type: 'place', pos: v(22, S, 25), face: 'up', block: './elm_planks' }),
      at(34, { type: 'place', pos: v(24, S, 25), face: 'up', block: './elm_planks' }),
      at(42, { type: 'place', pos: v(22, S + 1, 25), face: 'up', block: './elm_slab' }),
      at(50, { type: 'place', pos: v(24, S + 1, 25), face: 'up', block: './elm_slab' }),
      at(60, { type: 'use', pos: v(23, S - 1, 25), face: 'up', item: './elm_door' }),
      at(100, { type: 'use', pos: v(23, S, 25), face: 'south' }),
      at(150, { type: 'use', pos: v(23, S, 25), face: 'south' }),
    ],
    camera: [
      { tick: 0, eye: v(23.5, S + 2.5, 33), yaw: 180, pitch: 12 },
      { tick: 120, eye: v(30.5, S + 3.5, 31.5), yaw: 150, pitch: 15 },
      { tick: 200, eye: v(31.5, S + 4, 27.5), yaw: 120, pitch: 18 },
    ],
    length: 200,
    stillAt: 120,
    expect: [],
  };
}

function pet(): SpikeClip {
  const S = 9;
  return {
    id: 'pet',
    exampleId: 'example_msm_tameable_pet',
    ground: QUICK_FEW,
    player: v(36.5, S, 36.5),
    setup: [],
    steps: [
      at(5, { type: 'use', pos: v(23, S - 1, 24), face: 'up', item: './ember_fox_spawn_egg' }),
      at(25, { type: 'use', pos: v(26, S - 1, 25), face: 'up', item: './ember_fox_spawn_egg' }),
    ],
    camera: [
      { tick: 0, eye: v(24.5, S + 2.5, 31), yaw: 180, pitch: 20 },
      { tick: 200, eye: v(28.5, S + 2.5, 31), yaw: 200, pitch: 20 },
    ],
    length: 200,
    stillAt: 100,
    expect: [],
  };
}

function crop(): SpikeClip {
  const S = 4;
  const setup: SpikeClip['setup'] = [];
  const steps: SpikeClip['steps'] = [];
  for (let x = 20; x <= 28; x += 1) {
    setup.push({ pos: v(x, S - 1, 24), state: 'minecraft:farmland[moisture=7]' });
    setup.push({ pos: v(x, S - 1, 25), state: 'minecraft:water[level=0]' });
    steps.push(at(5 + (x - 20) * 4, { type: 'use', pos: v(x, S - 1, 24), face: 'up', item: x === 20 ? './onion' : './onion_crop' }));
  }
  for (let round = 0; round < 7; round += 1) {
    for (let x = 21; x <= 28; x += 1) {
      steps.push(at(50 + round * 20 + (x - 21) * 2, { type: 'tool', tool: 'grow', pos: v(x, S, 24) }));
    }
  }
  return {
    id: 'crop',
    exampleId: 'example_msm_crop',
    ground: FLAT,
    player: v(24.5, S, 30.5),
    setup,
    steps,
    camera: [
      { tick: 0, eye: v(18.5, S + 2, 28.5), yaw: 200, pitch: 25 },
      { tick: 220, eye: v(28.5, S + 2, 28.5), yaw: 160, pitch: 25 },
    ],
    length: 220,
    stillAt: 200,
    expect: [],
  };
}

function machine(): SpikeClip {
  const S = 4;
  return {
    id: 'machine',
    exampleId: 'example_msm_ore_crusher',
    ground: FLAT,
    player: v(24.5, S, 30.5),
    setup: [
      { pos: v(24, S + 1, 24), state: 'minecraft:hopper[facing=down,enabled=true]' },
      { pos: v(25, S, 24), state: 'minecraft:chest[facing=south,type=single,waterlogged=false]' },
      { pos: v(22, S, 24), state: 'minecraft:oak_log[axis=y]' },
    ],
    steps: [
      at(1, { type: 'look', yaw: 180, pitch: 20 }),
      at(10, { type: 'place', pos: v(24, S - 1, 24), face: 'up', block: './ore_crusher' }),
      at(50, { type: 'tool', tool: 'power', pos: v(24, S, 24) }),
      at(60, { type: 'set', pos: v(24, S, 24), state: './ore_crusher[facing=south,lit=true]' }),
      at(180, { type: 'set', pos: v(24, S, 24), state: './ore_crusher[facing=south,lit=false]' }),
    ],
    camera: [
      { tick: 0, eye: v(22.5, S + 2.5, 28.5), yaw: 200, pitch: 22 },
      { tick: 200, eye: v(26.5, S + 2.5, 28.5), yaw: 160, pitch: 22 },
    ],
    length: 200,
    stillAt: 100,
    expect: [],
  };
}

function vehicle(): SpikeClip {
  const S = 4;
  const steps: SpikeClip['steps'] = [
    at(1, { type: 'look', yaw: 180, pitch: 30 }),
    at(5, { type: 'use', pos: v(24, S - 1, 30), face: 'up', item: './tank' }),
    at(20, { type: 'useVehicle', index: 0 }),
    at(30, { type: 'drive', forward: 1, strafe: 0 }),
    at(75, { type: 'drive', forward: 1, strafe: 1 }),
    at(105, { type: 'drive', forward: 1, strafe: 0 }),
    at(135, { type: 'drive', forward: 0, strafe: 0 }),
  ];
  return {
    id: 'vehicle',
    exampleId: 'example_msm_vehicle',
    ground: FLAT,
    player: v(24.5, S, 34.5),
    setup: [],
    steps,
    camera: 'driver',
    length: 220,
    stillAt: 100,
    expect: [],
  };
}

function portal(): SpikeClip {
  const S = 4;
  const frame = './sky_gate_frame';
  const steps: SpikeClip['steps'] = [at(1, { type: 'look', yaw: 180, pitch: 0 })];
  let tick = 5;
  const put = (pos: V3, against: V3, face: Face) => {
    steps.push(at(tick, { type: 'place', pos: against, face, block: frame }));
    tick += 5;
    return pos;
  };
  for (let x = 22; x <= 25; x += 1) put(v(x, S, 24), v(x, S - 1, 24), 'up');
  for (let y = S + 1; y <= S + 4; y += 1) {
    put(v(22, y, 24), v(22, y - 1, 24), 'up');
    put(v(25, y, 24), v(25, y - 1, 24), 'up');
  }
  put(v(23, S + 4, 24), v(22, S + 4, 24), 'east');
  put(v(24, S + 4, 24), v(23, S + 4, 24), 'east');
  steps.push(at(tick, { type: 'place', pos: v(20, S - 1, 25), face: 'up', block: './sky_gate_beacon' }));
  tick += 10;
  steps.push(at(tick, { type: 'use', pos: v(20, S, 25), face: 'up' }));
  tick += 2;
  for (let y = S + 1; y <= S + 3; y += 1) {
    for (let x = 23; x <= 24; x += 1) {
      steps.push(at(tick, { type: 'set', pos: v(x, y, 24), state: './sky_gate[axis=x]' }));
    }
  }
  return {
    id: 'portal',
    exampleId: 'example_msm_sky_portal',
    ground: FLAT,
    player: v(23.5, S, 29.5),
    setup: [],
    steps,
    camera: [
      { tick: 0, eye: v(23.5, S + 3, 32), yaw: 180, pitch: 8 },
      { tick: 220, eye: v(27.5, S + 3, 31), yaw: 155, pitch: 8 },
    ],
    length: 220,
    stillAt: 200,
    expect: [],
  };
}

function sparkles(): SpikeClip {
  const S = 4;
  const setup: SpikeClip['setup'] = [];
  for (const x of [21, 24, 27]) {
    setup.push({ pos: v(x, S, 24), state: 'minecraft:oak_log[axis=y]' });
    setup.push({ pos: v(x, S + 1, 24), state: './firefly_jar' });
  }
  return {
    id: 'sparkles',
    exampleId: 'example_msm_firefly_jar',
    ground: FLAT,
    player: v(24.5, S, 26.5),
    setup,
    steps: [
      at(1, { type: 'look', yaw: 180, pitch: 0 }),
      at(120, { type: 'use', pos: v(24, S + 1, 24), face: 'south', item: './spark_wand' }),
      at(170, { type: 'use', pos: v(24, S + 1, 24), face: 'south', item: './spark_wand' }),
    ],
    camera: [
      { tick: 0, eye: v(24.5, S + 2.5, 31), yaw: 180, pitch: 10 },
      { tick: 200, eye: v(24.5, S + 2.2, 30), yaw: 180, pitch: 8 },
    ],
    length: 200,
    stillAt: 130,
    expect: [],
  };
}

function trader(): SpikeClip {
  const S = 9;
  const setup: SpikeClip['setup'] = [];
  for (let z = 14; z <= 34; z += 1) {
    setup.push({ pos: v(22, S - 1, z), state: 'minecraft:dirt_path' });
    setup.push({ pos: v(23, S - 1, z), state: 'minecraft:dirt_path' });
  }
  setup.push({ pos: v(25, S, 24), state: 'minecraft:oak_log[axis=y]' });
  setup.push({ pos: v(25, S + 1, 24), state: 'minecraft:bell[attachment=floor,facing=south,powered=false]' });
  return {
    id: 'trader',
    exampleId: 'example_msm_roadside_merchant',
    ground: QUICK_FEW,
    player: v(36.5, S, 36.5),
    setup,
    steps: [at(5, { type: 'use', pos: v(24, S - 1, 25), face: 'up', item: './roadside_merchant_spawn_egg' })],
    camera: [
      { tick: 0, eye: v(23, S + 2.5, 31), yaw: 175, pitch: 15 },
      { tick: 200, eye: v(26, S + 2.5, 31), yaw: 185, pitch: 15 },
    ],
    length: 200,
    stillAt: 100,
    expect: [],
  };
}

function fluid(): SpikeClip {
  const S = 9;
  const steps: SpikeClip['steps'] = [at(1, { type: 'look', yaw: 180, pitch: 40 })];
  let tick = 5;
  for (let x = 23; x <= 25; x += 1) {
    for (let z = 23; z <= 25; z += 1) {
      steps.push(at(tick, { type: 'break', pos: v(x, S - 1, z) }));
      tick += 4;
    }
  }
  steps.push(at(tick + 10, { type: 'use', pos: v(24, S - 2, 24), face: 'up', item: './oil_bucket' }));
  return {
    id: 'fluid',
    exampleId: 'example_msm_fluid',
    ground: QUICK_SAND,
    player: v(24.5, S, 29.5),
    setup: [],
    steps,
    camera: [
      { tick: 0, eye: v(24.5, S + 3.5, 29.5), yaw: 180, pitch: 35 },
      { tick: 220, eye: v(27.5, S + 3.5, 28.5), yaw: 150, pitch: 35 },
    ],
    length: 220,
    stillAt: 160,
    expect: [],
  };
}

function rules(): SpikeClip {
  const S = 4;
  return {
    id: 'rules',
    exampleId: 'example_msm_rules',
    ground: FLAT,
    player: v(24.5, S, 28.5),
    setup: [
      { pos: v(22, S, 24), state: './lucky_block' },
      { pos: v(24, S, 24), state: './lucky_block' },
      { pos: v(26, S, 24), state: './lucky_block' },
    ],
    steps: [
      at(1, { type: 'look', yaw: 180, pitch: 20 }),
      at(60, { type: 'break', pos: v(24, S, 24) }),
      at(140, { type: 'break', pos: v(22, S, 24) }),
    ],
    camera: [
      { tick: 0, eye: v(24.5, S + 2.5, 30), yaw: 180, pitch: 18 },
      { tick: 200, eye: v(25.5, S + 2.5, 29.5), yaw: 170, pitch: 18 },
    ],
    length: 200,
    stillAt: 80,
    expect: [],
  };
}

export const SPIKE_CLIPS: readonly SpikeClip[] = [
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
];
