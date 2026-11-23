/**
 * MSM's own fixture pools and templates for the assembler's tests, built in memory (B637). Their
 * shapes are rebuilt from what the spike B634 recorded about its own throwaway fixtures (box sizes,
 * extents and piece counts in `docs/reference/spikes/b634/results/`); nothing of the game's.
 */

import type {
  AssembledPiece,
  Assembly,
  AssemblyInput,
  JigsawBlock,
  JigsawOrientation,
  JigsawStructureData,
  PieceTemplate,
  PoolData,
  PoolElementData,
  RefusalReason,
} from '../../src/structures/api';
import {
  canJoin,
  FEATURE_PIECE,
  horizontalCentre,
  pieceJigsaws,
} from '../../src/structures/assemble';
import { contains, intersects } from '../../src/structures/boxes';

export const EMPTY = 'minecraft:empty';

export function jig(
  pos: readonly [number, number, number],
  orientation: JigsawOrientation,
  o: {
    name?: string;
    target?: string;
    pool?: string;
    joint?: 'rollable' | 'aligned';
    sp?: number;
    pp?: number;
  } = {},
): JigsawBlock {
  return {
    pos,
    orientation,
    name: o.name ?? EMPTY,
    target: o.target ?? EMPTY,
    pool: o.pool ?? EMPTY,
    joint: o.joint ?? 'rollable',
    finalState: 'minecraft:air',
    selectionPriority: o.sp ?? 0,
    placementPriority: o.pp ?? 0,
  };
}

export function tpl(
  id: string,
  size: readonly [number, number, number],
  jigsaws: JigsawBlock[],
  blocks: PieceTemplate['blocks'] = [],
): PieceTemplate {
  return { id, size, jigsaws, blocks, palette: ['minecraft:stone'] };
}

export function single(location: string, weight = 1): PoolElementData {
  return { weight, type: 'minecraft:single_pool_element', location, projection: 'rigid' };
}

export function emptyElement(weight = 1): PoolElementData {
  return { weight, type: 'minecraft:empty_pool_element', projection: 'rigid' };
}

export function pool(id: string, elements: PoolElementData[], fallback = EMPTY): PoolData {
  return { id, fallback, elements };
}

/** The lookups an assembly reads, over the given templates and pools. */
export class FixtureWorld {
  readonly templates = new Map<string, PieceTemplate>();
  readonly pools = new Map<string, PoolData>();
  /** How many times each template was asked for (the per-assembly cache). */
  readonly asked = new Map<string, number>();

  constructor(templates: PieceTemplate[], pools: PoolData[]) {
    for (const t of templates) this.templates.set(t.id, t);
    for (const p of pools) this.pools.set(p.id, p);
  }

  input(
    structure: Partial<JigsawStructureData> & { startPool: string },
    seed: bigint,
    o: { origin?: readonly [number, number, number]; pieceLimit?: number } = {},
  ): AssemblyInput {
    return {
      structure: {
        size: 7,
        startHeight: { absolute: 0 },
        maxDistanceFromCenter: 128,
        useExpansionHack: false,
        terrainAdaptation: 'none',
        ...structure,
      },
      pools: (id) => this.pools.get(id) ?? null,
      templates: (id) => {
        this.asked.set(id, (this.asked.get(id) ?? 0) + 1);
        return this.templates.get(id) ?? null;
      },
      seed,
      origin: o.origin ?? [0, -60, 0],
      pieceLimit: o.pieceLimit ?? 500,
    };
  }
}

const H = { name: 'fx:hub', target: 'fx:arm', pool: 'fx:arms' };

/** A 7 by 3 by 7 hub with a jigsaw in the middle of each side. */
export function hub(
  id: string,
  o: { pool?: string; name?: string; target?: string } = {},
): PieceTemplate {
  const opts = { ...H, ...o };
  return tpl(
    id,
    [7, 3, 7],
    [
      jig([3, 1, 0], 'north_up', opts),
      jig([6, 1, 3], 'east_up', opts),
      jig([3, 1, 6], 'south_up', opts),
      jig([0, 1, 3], 'west_up', opts),
    ],
  );
}

const STREET_OUT = { target: 'fx:street', pool: 'fx:streets' };
const HOUSE_OUT = { target: 'fx:house', pool: 'fx:houses' };

function arm(id: string, name = 'fx:arm', target = 'fx:hub'): PieceTemplate {
  return tpl(id, [5, 3, 3], [jig([0, 1, 1], 'west_up', { name, target })]);
}

/** Every fixture of the spike rebuilt, in one world. */
export function fixtureWorld(): FixtureWorld {
  const seg = 'fx:seg';
  const templates: PieceTemplate[] = [
    // match, back, weights (J1 to J3, J5 to J9)
    hub('fx:hub_match'),
    hub('fx:hub_back', { pool: 'fx:back_arms' }),
    hub('fx:hub_w', { pool: 'fx:wpool' }),
    arm('fx:arm_ok'),
    arm('fx:arm_name', 'fx:wrong'),
    arm('fx:arm_tgt', 'fx:arm', 'fx:other'),
    tpl('fx:arm_vert', [5, 3, 3], [jig([0, 0, 1], 'down_north', { name: 'fx:arm' })]),
    tpl(
      'fx:arm_two',
      [5, 3, 3],
      [
        jig([0, 1, 1], 'west_up', { name: 'fx:arm' }),
        jig([2, 1, 0], 'north_up', { name: 'fx:arm' }),
      ],
    ),
    tpl('fx:arm_back', [8, 3, 3], [jig([3, 1, 1], 'west_up', { name: 'fx:arm' })]),
    arm('fx:arm_fb'),
    arm('fx:arm_w3'),
    arm('fx:arm_w1'),
    // chains (J11, J12)
    tpl(
      'fx:cstart',
      [3, 3, 3],
      [jig([2, 1, 1], 'east_up', { name: 'fx:cstart', target: seg, pool: 'fx:segs' })],
    ),
    tpl(
      'fx:seg',
      [5, 3, 3],
      [
        jig([0, 1, 1], 'west_up', { name: seg }),
        jig([4, 1, 1], 'east_up', { name: 'fx:seg_out', target: seg, pool: 'fx:segs' }),
      ],
    ),
    tpl('fx:cap', [2, 3, 3], [jig([0, 1, 1], 'west_up', { name: seg })]),
    tpl('fx:cstart2', [3, 3, 3], [jig([2, 1, 1], 'east_up', { target: seg, pool: 'fx:segs2' })]),
    tpl('fx:cstart4', [4, 3, 3], [jig([3, 1, 1], 'east_up', { target: seg, pool: 'fx:segs2' })]),
    tpl(
      'fx:seg2',
      [2, 3, 3],
      [
        jig([0, 1, 1], 'west_up', { name: seg }),
        jig([1, 1, 1], 'east_up', { target: seg, pool: 'fx:segs2' }),
      ],
    ),
    tpl('fx:fbstart', [3, 3, 3], [jig([2, 1, 1], 'east_up', { target: seg, pool: 'fx:fblong' })]),
    tpl('fx:long', [40, 3, 3], [jig([0, 1, 1], 'west_up', { name: seg })]),
    // vertical chains (J13)
    tpl(
      'fx:vstart',
      [3, 3, 3],
      [jig([1, 2, 1], 'up_north', { target: 'fx:vseg', pool: 'fx:vsegs' })],
    ),
    tpl(
      'fx:vstart4',
      [3, 4, 3],
      [jig([1, 3, 1], 'up_north', { target: 'fx:vseg', pool: 'fx:vsegs2' })],
    ),
    tpl(
      'fx:vstart6',
      [3, 6, 3],
      [jig([1, 5, 1], 'up_north', { target: 'fx:vseg', pool: 'fx:vsegs2' })],
    ),
    tpl(
      'fx:vseg',
      [3, 5, 3],
      [
        jig([1, 0, 1], 'down_north', { name: 'fx:vseg' }),
        jig([1, 4, 1], 'up_north', { target: 'fx:vseg', pool: 'fx:vsegs' }),
      ],
    ),
    tpl(
      'fx:vseg2',
      [3, 2, 3],
      [
        jig([1, 0, 1], 'down_north', { name: 'fx:vseg' }),
        jig([1, 1, 1], 'up_north', { target: 'fx:vseg', pool: 'fx:vsegs2' }),
      ],
    ),
    // inside the parent (J10)
    tpl(
      'fx:shell',
      [9, 6, 9],
      [jig([4, 0, 4], 'up_north', { target: 'fx:inner', pool: 'fx:inners' })],
    ),
    tpl(
      'fx:shell_big',
      [9, 6, 9],
      [jig([4, 0, 4], 'up_north', { target: 'fx:inner', pool: 'fx:inners_big' })],
    ),
    tpl(
      'fx:shell_tall',
      [9, 6, 9],
      [jig([4, 0, 4], 'up_north', { target: 'fx:inner', pool: 'fx:inners_tall' })],
    ),
    tpl('fx:inner', [3, 3, 3], [jig([1, 0, 1], 'down_north', { name: 'fx:inner' })]),
    tpl('fx:inner_big', [9, 3, 9], [jig([4, 0, 4], 'down_north', { name: 'fx:inner' })]),
    tpl('fx:inner_tall', [3, 6, 3], [jig([1, 0, 1], 'down_north', { name: 'fx:inner' })]),
    // overlap and selection priority (J9, J14)
    ...[
      ['fx:whub', 0, 0],
      ['fx:whub_spl', 1, 0],
      ['fx:whub_spr', 0, 1],
    ].map(([id, l, r]) =>
      tpl(
        id as string,
        [5, 3, 3],
        [
          jig([0, 1, 0], 'north_up', { target: 'fx:w', pool: 'fx:wides', sp: l as number }),
          jig([4, 1, 0], 'north_up', { target: 'fx:w', pool: 'fx:wides', sp: r as number }),
        ],
      ),
    ),
    tpl('fx:wide', [7, 3, 3], [jig([3, 1, 2], 'south_up', { name: 'fx:w' })]),
    tpl('fx:narrow', [1, 3, 3], [jig([0, 1, 2], 'south_up', { name: 'fx:w' })]),
    // placement priority (J15)
    ...[
      ['fx:phub_eq', 0, 0, 'fx:parms'],
      ['fx:phub_pe', 1, 0, 'fx:parms'],
      ['fx:phub_pw', 0, 1, 'fx:parms'],
      ['fx:phub_ce', 0, 0, 'fx:parms_hi'],
    ].map(([id, e, w, eastPool]) =>
      tpl(
        id as string,
        [3, 3, 3],
        [
          jig([2, 1, 1], 'east_up', {
            target: 'fx:parm',
            pool: eastPool as string,
            pp: e as number,
          }),
          jig([0, 1, 1], 'west_up', { target: 'fx:parm', pool: 'fx:parms', pp: w as number }),
        ],
      ),
    ),
    tpl(
      'fx:parm',
      [3, 3, 3],
      [
        jig([0, 1, 1], 'west_up', { name: 'fx:parm' }),
        jig([1, 2, 1], 'up_north', { target: 'fx:pbig', pool: 'fx:pbigs' }),
      ],
    ),
    tpl(
      'fx:parm_hi',
      [3, 3, 3],
      [
        jig([0, 1, 1], 'west_up', { name: 'fx:parm', pp: 1 }),
        jig([1, 2, 1], 'up_north', { target: 'fx:pbig', pool: 'fx:pbigs' }),
      ],
    ),
    tpl('fx:pbig', [31, 3, 31], [jig([15, 0, 15], 'down_north', { name: 'fx:pbig' })]),
    // the joint (J4)
    tpl(
      'fx:vhub',
      [9, 1, 9],
      [
        jig([1, 0, 1], 'up_north', { target: 'fx:tower', pool: 'fx:towers_a', joint: 'aligned' }),
        jig([7, 0, 1], 'up_north', { target: 'fx:tower', pool: 'fx:towers_r', joint: 'aligned' }),
        jig([1, 0, 7], 'up_north', { target: 'fx:tower', pool: 'fx:towers_a', joint: 'rollable' }),
        jig([7, 0, 7], 'up_north', { target: 'fx:tower', pool: 'fx:towers_r', joint: 'rollable' }),
      ],
    ),
    tpl(
      'fx:tower_a',
      [1, 5, 1],
      [jig([0, 0, 0], 'down_north', { name: 'fx:tower', joint: 'aligned' })],
    ),
    tpl(
      'fx:tower_r',
      [1, 5, 1],
      [jig([0, 0, 0], 'down_north', { name: 'fx:tower', joint: 'rollable' })],
    ),
    // the lattices (spike 4S7: 113 and 841)
    tpl(
      'fx:grid',
      [5, 3, 5],
      (
        [
          [[2, 1, 0], 'north_up'],
          [[4, 1, 2], 'east_up'],
          [[2, 1, 4], 'south_up'],
          [[0, 1, 2], 'west_up'],
        ] as const
      ).map(([p, o]) => jig(p, o, { name: 'fx:grid', target: 'fx:grid', pool: 'fx:grids' })),
    ),
    tpl(
      'fx:cube',
      [5, 5, 5],
      (
        [
          [[2, 2, 0], 'north_up'],
          [[4, 2, 2], 'east_up'],
          [[2, 2, 4], 'south_up'],
          [[0, 2, 2], 'west_up'],
          [[2, 4, 2], 'up_north'],
          [[2, 0, 2], 'down_north'],
        ] as const
      ).map(([p, o]) => jig(p, o, { name: 'fx:cube', target: 'fx:cube', pool: 'fx:cubes' })),
    ),
    // list and feature elements (J18)
    tpl(
      'fx:mhub',
      [5, 3, 5],
      [
        jig([4, 1, 2], 'east_up', { target: 'fx:l', pool: 'fx:lists' }),
        jig([2, 2, 2], 'up_north', { target: 'minecraft:bottom', pool: 'fx:feats' }),
      ],
    ),
    tpl('fx:l1', [3, 3, 3], [jig([0, 1, 1], 'west_up', { name: 'fx:l' })]),
    tpl('fx:l2', [2, 4, 2], []),
    // a small town of streets, houses and furniture: every rule at once over many seeds
    tpl(
      'fx:plaza',
      [9, 1, 9],
      [
        jig([4, 0, 0], 'north_up', STREET_OUT),
        jig([8, 0, 4], 'east_up', STREET_OUT),
        jig([4, 0, 8], 'south_up', STREET_OUT),
        jig([0, 0, 4], 'west_up', STREET_OUT),
      ],
    ),
    tpl(
      'fx:street',
      [3, 1, 9],
      [
        jig([1, 0, 0], 'north_up', { name: 'fx:street' }),
        jig([1, 0, 8], 'south_up', STREET_OUT),
        jig([0, 0, 4], 'west_up', HOUSE_OUT),
        jig([2, 0, 4], 'east_up', HOUSE_OUT),
      ],
    ),
    tpl(
      'fx:crossing',
      [3, 1, 3],
      [
        jig([1, 0, 0], 'north_up', { name: 'fx:street' }),
        jig([1, 0, 2], 'south_up', STREET_OUT),
        jig([0, 0, 1], 'west_up', STREET_OUT),
        jig([2, 0, 1], 'east_up', { ...STREET_OUT, sp: 1, pp: 1 }),
      ],
    ),
    tpl('fx:street_end', [3, 1, 1], [jig([1, 0, 0], 'north_up', { name: 'fx:street' })]),
    tpl(
      'fx:house_small',
      [5, 4, 5],
      [
        jig([2, 0, 0], 'north_up', { name: 'fx:house' }),
        jig([2, 0, 2], 'up_north', { target: 'fx:decor', pool: 'fx:decor', joint: 'aligned' }),
      ],
    ),
    tpl(
      'fx:house_big',
      [9, 6, 7],
      [
        jig([4, 0, 0], 'north_up', { name: 'fx:house' }),
        jig([2, 0, 3], 'up_north', { target: 'fx:decor', pool: 'fx:decor' }),
        jig([6, 0, 3], 'up_north', { target: 'fx:decor', pool: 'fx:decor' }),
      ],
    ),
    tpl('fx:table', [1, 1, 1], [jig([0, 0, 0], 'down_north', { name: 'fx:decor' })]),
    tpl('fx:bed', [1, 1, 2], [jig([0, 0, 0], 'down_north', { name: 'fx:decor' })]),
  ];
  const pools: PoolData[] = [
    pool('fx:start_match', [single('fx:hub_match')]),
    pool(
      'fx:arms',
      ['fx:arm_ok', 'fx:arm_name', 'fx:arm_tgt', 'fx:arm_vert', 'fx:arm_two'].map((t) => single(t)),
    ),
    pool('fx:start_back', [single('fx:hub_back')]),
    pool('fx:back_arms', [single('fx:arm_back')], 'fx:fb_arms'),
    pool('fx:fb_arms', [single('fx:arm_fb')]),
    pool('fx:start_w', [single('fx:hub_w')]),
    pool('fx:wpool', [single('fx:arm_w3', 3), single('fx:arm_w1', 1), emptyElement(1)]),
    pool('fx:start_chain', [single('fx:cstart')]),
    pool('fx:segs', [single('fx:seg')], 'fx:caps'),
    pool('fx:caps', [single('fx:cap')]),
    pool('fx:start_chain2', [single('fx:cstart2')]),
    pool('fx:start_chain4', [single('fx:cstart4')]),
    pool('fx:segs2', [single('fx:seg2')]),
    pool('fx:start_fb', [single('fx:fbstart')]),
    pool('fx:fblong', [single('fx:long')], 'fx:segs'),
    pool('fx:start_v', [single('fx:vstart')]),
    pool('fx:start_v4', [single('fx:vstart4')]),
    pool('fx:start_v6', [single('fx:vstart6')]),
    pool('fx:vsegs', [single('fx:vseg')]),
    pool('fx:vsegs2', [single('fx:vseg2')]),
    pool('fx:start_shell', [single('fx:shell')]),
    pool('fx:start_shell_big', [single('fx:shell_big')]),
    pool('fx:start_shell_tall', [single('fx:shell_tall')]),
    pool('fx:inners', [single('fx:inner')]),
    pool('fx:inners_big', [single('fx:inner_big')]),
    pool('fx:inners_tall', [single('fx:inner_tall')]),
    pool('fx:start_whub', [single('fx:whub')]),
    pool('fx:start_whub_spl', [single('fx:whub_spl')]),
    pool('fx:start_whub_spr', [single('fx:whub_spr')]),
    pool('fx:wides', [single('fx:wide')], 'fx:narrows'),
    pool('fx:narrows', [single('fx:narrow')]),
    ...['eq', 'pe', 'pw', 'ce'].map((k) => pool(`fx:start_phub_${k}`, [single(`fx:phub_${k}`)])),
    pool('fx:parms', [single('fx:parm')]),
    pool('fx:parms_hi', [single('fx:parm_hi')]),
    pool('fx:pbigs', [single('fx:pbig')]),
    pool('fx:start_joint', [single('fx:vhub')]),
    pool('fx:towers_a', [single('fx:tower_a')]),
    pool('fx:towers_r', [single('fx:tower_r')]),
    pool('fx:start_grid', [single('fx:grid')]),
    pool('fx:grids', [single('fx:grid')]),
    pool('fx:start_cube', [single('fx:cube')]),
    pool('fx:cubes', [single('fx:cube')]),
    pool('fx:start_misc', [single('fx:mhub')]),
    pool('fx:lists', [
      {
        weight: 1,
        type: 'minecraft:list_pool_element',
        projection: 'rigid',
        elements: [
          { element_type: 'minecraft:single_pool_element', location: 'fx:l1', projection: 'rigid' },
          { element_type: 'minecraft:single_pool_element', location: 'fx:l2', projection: 'rigid' },
        ],
      } as PoolElementData,
    ]),
    pool('fx:town', [single('fx:plaza')]),
    pool('fx:streets', [single('fx:street', 4), single('fx:crossing', 2)], 'fx:street_ends'),
    pool('fx:street_ends', [single('fx:street_end')]),
    pool('fx:houses', [single('fx:house_small', 3), single('fx:house_big', 1), emptyElement(2)]),
    pool('fx:decor', [single('fx:table'), single('fx:bed'), emptyElement(1)]),
    pool('fx:feats', [
      {
        weight: 1,
        type: 'minecraft:feature_pool_element',
        projection: 'rigid',
        feature: 'fx:tree',
      } as PoolElementData,
    ]),
  ];
  return new FixtureWorld(templates, pools);
}

export const REASONS: readonly RefusalReason[] = [
  'no_matching_jigsaw',
  'overlaps_a_piece',
  'too_far_from_start',
  'too_high_or_low',
  'past_depth_limit',
  'template_missing',
  'pool_missing',
  'pool_empty',
  'unsupported_element',
];

function templateOf(world: FixtureWorld, piece: AssembledPiece): PieceTemplate {
  if (piece.template === null) return FEATURE_PIECE;
  const t = world.templates.get(piece.template);
  if (!t) throw new Error(`no template ${piece.template}`);
  return t;
}

/**
 * The exact checks of spike 4S8 for one assembly: every join legal (J1 to J5), no overlap but
 * nesting (J9, J10), depth (J11), both distance limits (J12, J13), and a reason on every refusal.
 * Returns the list of problems (empty when all hold).
 */
export function problems(world: FixtureWorld, input: AssemblyInput, assembly: Assembly): string[] {
  const out: string[] = [];
  const { pieces } = assembly;
  const size = input.structure.size;
  const start = pieces[0];
  if (!start) return out;
  const m = input.structure.maxDistanceFromCenter;
  const h = typeof m === 'number' ? m : m.horizontal;
  const v = typeof m === 'number' ? m : (m.vertical ?? Number.POSITIVE_INFINITY);
  const centre = horizontalCentre(start.box);
  const startY = input.origin[1];
  pieces.forEach((p, i) => {
    if (p.index !== i) out.push(`piece ${i} numbered ${p.index}`);
    const b = p.box;
    if (
      b.minX < centre[0] - h ||
      b.maxX > centre[0] + h ||
      b.minZ < centre[1] - h ||
      b.maxZ > centre[1] + h
    ) {
      out.push(`piece ${i} past the horizontal limit`);
    }
    if (b.minY < startY - v || b.maxY > startY + v) out.push(`piece ${i} past the vertical limit`);
    if (p.depth > size + 1) out.push(`piece ${i} at depth ${p.depth}`);
    if (p.parent === null) {
      if (i !== 0) out.push(`piece ${i} without a parent`);
      return;
    }
    const parent = pieces[p.parent];
    if (!parent || p.parent >= i) {
      out.push(`piece ${i} has parent ${p.parent}`);
      return;
    }
    if (p.depth !== parent.depth + 1) out.push(`piece ${i} depth ${p.depth} under ${parent.depth}`);
    if (!p.joinedBy) {
      out.push(`piece ${i} not joined`);
      return;
    }
    const pj = pieceJigsaws(parent, templateOf(world, parent))[p.joinedBy.parentJigsaw];
    const cj = pieceJigsaws(p, templateOf(world, p))[p.joinedBy.jigsaw];
    if (!pj || !cj) {
      out.push(`piece ${i} joined by a missing jigsaw`);
      return;
    }
    if (cj.block.name !== pj.block.target)
      out.push(`piece ${i}: name ${cj.block.name} for ${pj.block.target}`);
    if (
      cj.pos[0] !== pj.pos[0] + pj.front[0] ||
      cj.pos[1] !== pj.pos[1] + pj.front[1] ||
      cj.pos[2] !== pj.pos[2] + pj.front[2]
    ) {
      out.push(`piece ${i}: jigsaw not in front of its parent's`);
    }
    if (!canJoin({ front: pj.front, top: pj.top, joint: pj.block.joint }, cj))
      out.push(`piece ${i}: illegal join`);
    if (p.depth === size + 1 && p.pool === pj.block.pool) {
      out.push(`piece ${i} at depth ${size + 1} from the target pool`);
    }
  });
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const a = (pieces[i] as AssembledPiece).box;
      const b = (pieces[j] as AssembledPiece).box;
      if (intersects(a, b) && !contains(a, b) && !contains(b, a))
        out.push(`pieces ${i} and ${j} overlap`);
    }
  }
  for (const s of assembly.steps) {
    if (s.kind === 'refused' && !REASONS.includes(s.reason))
      out.push(`refusal without a reason: ${s.reason}`);
  }
  const last = assembly.steps.at(-1);
  if (last?.kind !== 'stopped' || last.pieces !== pieces.length)
    out.push('the last step is not the stop');
  return out;
}

/** The two-proportion z of an observed share against an expected one. */
export function zScore(hits: number, n: number, p: number): number {
  return (hits - n * p) / Math.sqrt(n * p * (1 - p));
}
