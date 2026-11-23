/**
 * The jigsaw assembler (B637) against the spike B634's observations: its deterministic fixtures'
 * exact counts (4S8) and its shares at |z| at most 4, with every assembly checked for legal joins,
 * nesting-only overlap, depth, both distance limits and a reason on every refusal.
 */

import { describe, expect, it } from 'vitest';
import type {
  AssembledPiece,
  Assembly,
  AssemblyInput,
  AssemblyStep,
  PieceTemplate,
} from '../../src/structures/api';
import {
  assemble,
  assembleSteps,
  DEFAULT_PIECE_LIMIT,
  pieceJigsaws,
  rotateVec,
  stoppedLine,
} from '../../src/structures/assemble';
import { horizontalCentre } from '../../src/structures/boxes';
import { rotationIndex } from '../../src/structures/jigsaw';
import {
  EMPTY,
  type FixtureWorld,
  fixtureWorld,
  jig,
  pool,
  problems,
  single,
  tpl,
  zScore,
} from './fixtures';

const world = fixtureWorld();
const SEEDS = 200;

function run(
  structure: Parameters<FixtureWorld['input']>[0],
  seed: number | bigint,
  o: Parameters<FixtureWorld['input']>[2] = {},
): { input: AssemblyInput; assembly: Assembly } {
  const input = world.input(structure, BigInt(seed), o);
  const assembly = assemble(input);
  const found = problems(world, input, assembly);
  if (found.length > 0) throw new Error(`seed ${seed}: ${found.join('; ')}`);
  return { input, assembly };
}

/** Assemblies of many seeds, each checked; returns them. */
function many(
  structure: Parameters<FixtureWorld['input']>[0],
  n = SEEDS,
  o: Parameters<FixtureWorld['input']>[2] = {},
): Assembly[] {
  const out: Assembly[] = [];
  for (let s = 0; s < n; s += 1) out.push(run(structure, s * 7919 + 634, o).assembly);
  return out;
}

function counts(list: Assembly[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const a of list) out[a.pieces.length] = (out[a.pieces.length] ?? 0) + 1;
  return out;
}

function templates(a: Assembly): string[] {
  return a.pieces.map((p) => p.template ?? '(feature)');
}

describe('exact counts of the spike fixtures (4S8)', () => {
  it.each([
    ['chain_s1', 'fx:start_chain', 1, 128, 3],
    ['chain_s2', 'fx:start_chain', 2, 128, 4],
    ['chain_s3', 'fx:start_chain', 3, 128, 5],
    ['chain_s7', 'fx:start_chain', 7, 128, 9],
    ['chain_s20', 'fx:start_chain', 20, 128, 22],
    ['chain_d16', 'fx:start_chain', 20, 16, 4],
    ['chain_d32', 'fx:start_chain', 20, 32, 7],
    ['chain2_d15', 'fx:start_chain2', 20, 15, 8],
    ['chain2_d16', 'fx:start_chain2', 20, 16, 8],
    ['chain4_d16', 'fx:start_chain4', 20, 16, 8],
    ['vchain_d16', 'fx:start_v', 20, 16, 4],
    ['vchain_v16', 'fx:start_v', 20, { horizontal: 116, vertical: 16 }, 4],
    // The data's object form without `vertical`, as read from a file (the type asks for a number).
    [
      'vchain_h16',
      'fx:start_v',
      20,
      { horizontal: 16 } as unknown as { horizontal: number; vertical: number },
      21,
    ],
    ['vchain_d116', 'fx:start_v', 20, 116, 21],
    ['vchain4_d15', 'fx:start_v4', 20, 15, 7],
    ['vchain4_d16', 'fx:start_v4', 20, 16, 8],
    ['vchain6_d16', 'fx:start_v6', 20, 16, 7],
    ['vchain6_d17', 'fx:start_v6', 20, 17, 7],
    ['fb_s5', 'fx:start_fb', 5, 32, 7],
    ['shell', 'fx:start_shell', 7, 128, 2],
    ['shell_big', 'fx:start_shell_big', 7, 128, 2],
    ['shell_tall', 'fx:start_shell_tall', 7, 128, 1],
    ['match', 'fx:start_match', 7, 128, 5],
    ['back', 'fx:start_back', 7, 128, 5],
    ['whub', 'fx:start_whub', 7, 128, 3],
    ['phub_eq', 'fx:start_phub_eq', 2, 128, 4],
    ['grid', 'fx:start_grid', 7, 116, 113],
  ] as const)('%s: %i pieces on every seed', (_name, startPool, size, distance, expected) => {
    const list = many(
      { startPool, size, maxDistanceFromCenter: distance },
      _name === 'grid' ? 40 : SEEDS,
    );
    expect(counts(list)).toEqual({ [expected]: list.length });
  });

  it('chain_s20 reaches depth 21 with one cap from the fallback pool', () => {
    const { assembly } = run({ startPool: 'fx:start_chain', size: 20 }, 1);
    const last = assembly.pieces.at(-1) as AssembledPiece;
    expect(last.template).toBe('fx:cap');
    expect(last.depth).toBe(21);
    expect(last.pool).toBe('fx:caps');
    expect(assembly.pieces.filter((p) => p.template === 'fx:seg').map((p) => p.depth)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('size 0 makes no structure and says why', () => {
    const { assembly } = run({ startPool: 'fx:start_chain', size: 0 }, 1);
    expect(assembly.pieces).toEqual([]);
    expect(assembly.steps[0]).toMatchObject({ kind: 'refused', reason: 'past_depth_limit' });
    expect(assembly.steps.at(-1)).toEqual({ kind: 'stopped', reason: 'done', pieces: 0 });
  });

  it('back: the arm reaching into the hub is refused for overlap and the fallback placed', () => {
    for (const a of many({ startPool: 'fx:start_back' }, 50)) {
      expect(templates(a).slice(1)).toEqual(['fx:arm_fb', 'fx:arm_fb', 'fx:arm_fb', 'fx:arm_fb']);
      const refusals = a.steps.filter((s) => s.kind === 'refused' && s.template === 'fx:arm_back');
      expect(refusals).toHaveLength(4);
      for (const r of refusals) expect(r).toMatchObject({ reason: 'overlaps_a_piece' });
    }
  });

  it('fb_s5: the long piece is refused as too far, the fallback chain continues to depth 6', () => {
    for (const a of many({ startPool: 'fx:start_fb', size: 5, maxDistanceFromCenter: 32 }, 50)) {
      expect(templates(a)).toEqual([
        'fx:fbstart',
        'fx:seg',
        'fx:seg',
        'fx:seg',
        'fx:seg',
        'fx:seg',
        'fx:cap',
      ]);
      expect(a.steps.find((s) => s.kind === 'refused' && s.template === 'fx:long')).toMatchObject({
        reason: 'too_far_from_start',
      });
      expect(a.pieces.at(-1)?.depth).toBe(6);
    }
  });

  it('shell_tall: a child partly outside its parent is refused for overlap', () => {
    const { assembly } = run({ startPool: 'fx:start_shell_tall' }, 3);
    expect(assembly.steps.find((s) => s.kind === 'refused')).toMatchObject({
      template: 'fx:inner_tall',
      reason: 'overlaps_a_piece',
    });
  });

  it('shell and shell_big: a child wholly inside its parent is placed', () => {
    for (const id of ['fx:start_shell', 'fx:start_shell_big']) {
      const { assembly } = run({ startPool: id }, 5);
      const [shell, inner] = assembly.pieces as [AssembledPiece, AssembledPiece];
      expect(inner.box.minX).toBeGreaterThanOrEqual(shell.box.minX);
      expect(inner.box.maxY).toBeLessThanOrEqual(shell.box.maxY);
    }
  });

  it('vertical chains: the limit is from the start height, the start piece one below it', () => {
    const { input, assembly } = run(
      { startPool: 'fx:start_v', size: 20, maxDistanceFromCenter: 16 },
      9,
    );
    const start = assembly.pieces[0] as AssembledPiece;
    expect(start.box.minY).toBe(input.origin[1] - 1);
    expect(Math.max(...assembly.pieces.map((p) => p.box.maxY))).toBe(input.origin[1] + 16);
    expect(
      assembly.steps
        .filter((s) => s.kind === 'refused')
        .map((s) => (s as { reason: string }).reason),
    ).toEqual(['too_high_or_low']);
  });
});

describe('the horizontal limit: centre by truncating division (J12, chain4_d17)', () => {
  it('8 or 9 pieces by the sign of the start box sum and the chain direction', () => {
    const seen = new Set<number>();
    for (const origin of [
      [0, -60, 0],
      [13, -60, 13],
      [-160, -60, -160],
      [-67, -60, -98],
      [96, -60, -33],
    ] as const) {
      for (let s = 0; s < 40; s += 1) {
        const { assembly } = run(
          { startPool: 'fx:start_chain4', size: 20, maxDistanceFromCenter: 17 },
          s,
          { origin },
        );
        const start = assembly.pieces[0] as AssembledPiece;
        const second = assembly.pieces[1] as AssembledPiece;
        const alongX = start.box.maxX - start.box.minX === 3;
        const sum = alongX ? start.box.minX + start.box.maxX : start.box.minZ + start.box.maxZ;
        const positive = alongX
          ? second.box.minX > start.box.maxX
          : second.box.minZ > start.box.maxZ;
        // Truncation toward zero rounds a half sum toward zero: up for a negative sum, down for a
        // positive one, so the chain gains a segment on the side the centre moved toward.
        const expected = sum >= 0 === positive ? 8 : 9;
        expect(assembly.pieces.length).toBe(expected);
        seen.add(expected);
      }
    }
    expect([...seen].sort()).toEqual([8, 9]);
  });

  it('the centre truncates toward zero', () => {
    const box = (min: number, max: number) => ({
      minX: min,
      minY: 0,
      minZ: min,
      maxX: max,
      maxY: 0,
      maxZ: max,
    });
    expect(horizontalCentre(box(-160, -157))).toEqual([-158, -158]);
    expect(horizontalCentre(box(10, 13))).toEqual([11, 11]);
    expect(horizontalCentre(box(-3, 0))).toEqual([-1, -1]);
  });
});

describe('matching, weights and priorities', () => {
  it('match: only arms whose jigsaw name is the target and faces right join (J1, J3, J5)', () => {
    const tally: Record<string, number> = {};
    const list = many({ startPool: 'fx:start_match' }, 400);
    for (const a of list) for (const t of templates(a).slice(1)) tally[t] = (tally[t] ?? 0) + 1;
    expect(Object.keys(tally).sort()).toEqual(['fx:arm_ok', 'fx:arm_tgt', 'fx:arm_two']);
    const n = list.length * 4;
    for (const t of ['fx:arm_ok', 'fx:arm_tgt', 'fx:arm_two']) {
      expect(Math.abs(zScore(tally[t] ?? 0, n, 1 / 3))).toBeLessThanOrEqual(4);
    }
    const reasons = new Set(
      list
        .flatMap((a) => a.steps)
        .flatMap((s) =>
          s.kind === 'refused' && (s.template === 'fx:arm_name' || s.template === 'fx:arm_vert')
            ? [s.reason]
            : [],
        ),
    );
    expect([...reasons]).toEqual(['no_matching_jigsaw']);
  });

  it('weights: 3, 1 and an empty element of 1 share 0.6, 0.2, 0.2 and an empty pick takes no fallback', () => {
    const list = many({ startPool: 'fx:start_w' }, 841);
    const tally = { w3: 0, w1: 0, empty: 0 };
    for (const a of list) {
      for (const s of a.steps) {
        if (s.kind !== 'tried' || s.pool !== 'fx:wpool') continue;
        if (s.template === 'fx:arm_w3') tally.w3 += 1;
        else if (s.template === 'fx:arm_w1') tally.w1 += 1;
        else if (s.template === null) tally.empty += 1;
      }
    }
    const n = list.length * 4;
    expect(tally.w3 + tally.w1 + tally.empty).toBe(n);
    expect(Math.abs(zScore(tally.w3, n, 0.6))).toBeLessThanOrEqual(4);
    expect(Math.abs(zScore(tally.w1, n, 0.2))).toBeLessThanOrEqual(4);
    expect(Math.abs(zScore(tally.empty, n, 0.2))).toBeLessThanOrEqual(4);
    expect(list.reduce((sum, a) => sum + a.pieces.length - 1, 0)).toBe(tally.w3 + tally.w1);
  });

  it('selection priority: the higher jigsaw goes first and takes the wide piece (J14)', () => {
    const wideFrom = (a: Assembly) =>
      a.pieces.find((p) => p.template === 'fx:wide')?.joinedBy?.parentJigsaw === 0 ? 'L' : 'R';
    const eq = many({ startPool: 'fx:start_whub' }, 400).map(wideFrom);
    expect(
      Math.abs(zScore(eq.filter((w) => w === 'L').length, eq.length, 0.5)),
    ).toBeLessThanOrEqual(4);
    expect(new Set(many({ startPool: 'fx:start_whub_spl' }).map(wideFrom))).toEqual(new Set(['L']));
    expect(new Set(many({ startPool: 'fx:start_whub_spr' }).map(wideFrom))).toEqual(new Set(['R']));
    for (const a of many({ startPool: 'fx:start_whub' }, 50)) {
      expect(templates(a).slice(1).sort()).toEqual(['fx:narrow', 'fx:wide']);
    }
  });

  it("placement priority is the parent jigsaw's, never the child's (J15)", () => {
    const bigFrom = (a: Assembly) => {
      const big = a.pieces.find((p) => p.template === 'fx:pbig') as AssembledPiece;
      const arm = a.pieces[big.parent as number] as AssembledPiece;
      return arm.joinedBy?.parentJigsaw === 0 ? 'E' : 'W';
    };
    expect(new Set(many({ startPool: 'fx:start_phub_pe', size: 2 }).map(bigFrom))).toEqual(
      new Set(['E']),
    );
    expect(new Set(many({ startPool: 'fx:start_phub_pw', size: 2 }).map(bigFrom))).toEqual(
      new Set(['W']),
    );
    for (const id of ['fx:start_phub_eq', 'fx:start_phub_ce']) {
      const list = many({ startPool: id, size: 2 }, 400);
      const east = list.map(bigFrom).filter((w) => w === 'E').length;
      expect(Math.abs(zScore(east, list.length, 0.5))).toBeLessThanOrEqual(4);
      // At equal priority the arm placed first wins.
      for (const a of list) {
        const big = a.pieces.find((p) => p.template === 'fx:pbig') as AssembledPiece;
        expect(big.parent).toBe(1);
      }
    }
  });

  it('the joint: aligned keeps the top, rollable turns it any of four ways (J4)', () => {
    const rel = { aligned: [0, 0, 0, 0], rollable: [0, 0, 0, 0] };
    const vhub = world.templates.get('fx:vhub');
    const list = many({ startPool: 'fx:start_joint' }, 841);
    for (const a of list) {
      const hub = a.pieces[0] as AssembledPiece;
      const hubJigsaws = pieceJigsaws(hub, vhub as never);
      for (const p of a.pieces.slice(1)) {
        const pj = hubJigsaws[p.joinedBy?.parentJigsaw as number];
        const cj = pieceJigsaws(p, world.templates.get(p.template as string) as never)[
          p.joinedBy?.jigsaw as number
        ];
        if (!pj || !cj) throw new Error('missing jigsaw');
        const turn = [0, 1, 2, 3].find((k) => {
          const t = rotateVec(pj.top, k);
          return t[0] === cj.top[0] && t[2] === cj.top[2];
        }) as number;
        rel[pj.block.joint][turn] = (rel[pj.block.joint][turn] ?? 0) + 1;
      }
    }
    expect(rel.aligned).toEqual([list.length * 2, 0, 0, 0]);
    for (const c of rel.rollable)
      expect(Math.abs(zScore(c, list.length * 2, 0.25))).toBeLessThanOrEqual(4);
  });
});

describe('the start piece (J16)', () => {
  it('turns uniformly about the start corner, its bottom one below the start height', () => {
    const turns = [0, 0, 0, 0];
    const origin = [32, -60, -48] as const;
    const list = many({ startPool: 'fx:start_match' }, 841, { origin });
    for (const a of list) {
      const start = a.pieces[0] as AssembledPiece;
      const turn = rotationIndex(start.rotation);
      turns[turn] = (turns[turn] ?? 0) + 1;
      expect(start.box.minY).toBe(origin[1] - 1);
      // The template's origin is the start corner whatever the turn.
      const xs = [start.box.minX, start.box.maxX];
      const zs = [start.box.minZ, start.box.maxZ];
      expect(xs).toContain(origin[0]);
      expect(zs).toContain(origin[2]);
    }
    for (const c of turns) expect(Math.abs(zScore(c, list.length, 0.25))).toBeLessThanOrEqual(4);
  });

  it('with start_jigsaw_name, one jigsaw of that name stands at the start position', () => {
    const origin = [0, -60, 0] as const;
    const used = new Set<string>();
    const hub = world.templates.get('fx:hub_match');
    for (const a of many({ startPool: 'fx:start_match', startJigsawName: 'fx:hub' }, 100, {
      origin,
    })) {
      const start = a.pieces[0] as AssembledPiece;
      const at = pieceJigsaws(start, hub as never).filter(
        (j) => j.pos[0] === origin[0] && j.pos[1] === origin[1] && j.pos[2] === origin[2],
      );
      expect(at).toHaveLength(1);
      used.add(`${at[0]?.index}`);
    }
    expect(used.size).toBe(4);
  });

  it('a start pool without that name refuses the element', () => {
    const { assembly } = run({ startPool: 'fx:start_match', startJigsawName: 'fx:nothing' }, 1);
    expect(assembly.pieces).toEqual([]);
    expect(assembly.steps.map((s) => s.kind)).toEqual(['tried', 'refused', 'stopped']);
    expect(assembly.steps[1]).toMatchObject({ reason: 'no_matching_jigsaw', parent: -1 });
  });
});

describe('lattices, list and feature elements, the piece limit', () => {
  it('grid20: the 841-piece lattice, and the 500-piece stop', () => {
    const full = run({ startPool: 'fx:start_grid', size: 20, maxDistanceFromCenter: 116 }, 4, {
      pieceLimit: 1000,
    });
    expect(full.assembly.pieces).toHaveLength(841);
    expect(full.assembly.stoppedAtLimit).toBe(false);
    const cut = run({ startPool: 'fx:start_grid', size: 20, maxDistanceFromCenter: 116 }, 4, {
      pieceLimit: DEFAULT_PIECE_LIMIT,
    });
    expect(cut.assembly.pieces).toHaveLength(500);
    expect(cut.assembly.stoppedAtLimit).toBe(true);
    const last = cut.assembly.steps.at(-1) as Extract<AssemblyStep, { kind: 'stopped' }>;
    expect(last).toEqual({ kind: 'stopped', reason: 'piece_limit', pieces: 500 });
    expect(stoppedLine(last.pieces)).toBe('Stopped at 500 pieces.');
    // The first 500 pieces are those of the full assembly at the same seed.
    expect(cut.assembly.pieces).toEqual(full.assembly.pieces.slice(0, 500));
  });

  it('a structure of exactly the limit finishes as done', () => {
    const { assembly } = run(
      { startPool: 'fx:start_grid', size: 7, maxDistanceFromCenter: 116 },
      2,
      { pieceLimit: 113 },
    );
    expect(assembly.pieces).toHaveLength(113);
    expect(assembly.stoppedAtLimit).toBe(false);
  });

  it('misc: a list element places its templates together as one piece; a feature sits on a bottom jigsaw', () => {
    for (const a of many({ startPool: 'fx:start_misc' }, 50)) {
      expect(a.pieces).toHaveLength(3);
      const [hub, ...rest] = a.pieces as AssembledPiece[];
      const list = rest.find((p) => p.template === 'fx:l1') as AssembledPiece;
      const feature = rest.find((p) => p.template === null) as AssembledPiece;
      // l1 is 3 by 3 by 3 and l2 2 by 4 by 2 from one origin: the box holds both (4 high).
      expect(list.box.maxY - list.box.minY).toBe(3);
      expect(feature.box.maxX - feature.box.minX).toBe(0);
      expect(feature.box.minY).toBe((hub as AssembledPiece).box.maxY + 1);
    }
  });

  it('the 3D lattice of 341 pieces keeps both limits', () => {
    const { assembly } = run(
      {
        startPool: 'fx:start_cube',
        size: 6,
        maxDistanceFromCenter: { horizontal: 24, vertical: 24 },
      },
      11,
    );
    expect(assembly.pieces).toHaveLength(341);
  });
});

describe('a town of streets, houses and furniture', () => {
  it('keeps every rule over 300 seeds, with nested furniture and refusals of each kind', () => {
    const list = many({ startPool: 'fx:town', size: 6, maxDistanceFromCenter: 40 }, 300);
    const sizes = list.map((a) => a.pieces.length);
    expect(Math.min(...sizes)).toBeLessThan(Math.max(...sizes));
    const reasons = new Set(
      list.flatMap((a) => a.steps.flatMap((s) => (s.kind === 'refused' ? [s.reason] : []))),
    );
    for (const r of ['overlaps_a_piece', 'too_far_from_start', 'past_depth_limit'] as const) {
      expect(reasons.has(r)).toBe(true);
    }
    const nested = list.some((a) =>
      a.pieces.some(
        (p) =>
          p.template === 'fx:table' &&
          a.pieces[p.parent as number]?.template?.startsWith('fx:house'),
      ),
    );
    expect(nested).toBe(true);
  }, 30_000); // 300 town assemblies with every rule checked: heavy (5.7 s on a loaded CI runner).
});

describe('steps and reasons', () => {
  it('the same seed gives the same steps; another seed other picks', () => {
    const a = [...assembleSteps(world.input({ startPool: 'fx:start_match' }, 634n))];
    const b = [...assembleSteps(world.input({ startPool: 'fx:start_match' }, 634n))];
    expect(a).toEqual(b);
    const other = new Set(
      Array.from({ length: 10 }, (_, i) =>
        JSON.stringify(assemble(world.input({ startPool: 'fx:start_match' }, BigInt(i))).steps),
      ),
    );
    expect(other.size).toBeGreaterThan(1);
  });

  it('every placed piece follows a try of its template, and a refusal names a reason', () => {
    const steps = [...assembleSteps(world.input({ startPool: 'fx:start_back' }, 7n))];
    steps.forEach((s, i) => {
      if (s.kind === 'placed') {
        const before = steps[i - 1];
        expect(before).toMatchObject({
          kind: 'tried',
          template: s.piece.template,
          pool: s.piece.pool,
        });
      }
    });
    expect(
      steps.filter((s) => s.kind === 'refused').every((s) => 'reason' in s && s.reason.length > 0),
    ).toBe(true);
  });

  it('missing pools and templates, empty pools and unknown elements are refused with their reason', () => {
    const w = fixtureWorld();
    const sides = [
      [[2, 1, 1], 'east_up', 'fx:nowhere'],
      [[0, 1, 1], 'west_up', 'fx:odd'],
      [[1, 1, 0], 'north_up', 'fx:hollow'],
      [[1, 1, 2], 'south_up', 'fx:ghost'],
    ] as const;
    w.templates.set(
      'fx:hub_x',
      tpl(
        'fx:hub_x',
        [3, 3, 3],
        sides.map(([p, o, target]) => jig(p, o, { target: 'fx:seg', pool: target })),
      ),
    );
    w.pools.set('fx:start_x', pool('fx:start_x', [single('fx:hub_x')]));
    w.pools.set(
      'fx:odd',
      pool('fx:odd', [{ weight: 1, type: 'minecraft:strange_element', projection: 'rigid' }]),
    );
    w.pools.set('fx:hollow', pool('fx:hollow', []));
    w.pools.set('fx:ghost', pool('fx:ghost', [single('fx:missing')]));
    const a = assemble(w.input({ startPool: 'fx:start_x' }, 3n));
    const reasons = a.steps.flatMap((s) => (s.kind === 'refused' ? [s.reason] : []));
    expect(reasons.sort()).toEqual([
      'pool_empty',
      'pool_missing',
      'template_missing',
      'unsupported_element',
    ]);
    expect(
      a.steps.find((s) => s.kind === 'refused' && s.reason === 'template_missing'),
    ).toMatchObject({
      template: 'fx:missing',
      pool: 'fx:ghost',
      parent: 0,
    });
    expect(a.pieces).toHaveLength(1);
    expect(assemble(w.input({ startPool: 'fx:none' }, 1n)).steps[0]).toMatchObject({
      reason: 'pool_missing',
    });
  });

  it('a template the jar did not give is a labelled box', () => {
    const w = fixtureWorld();
    const hub = w.templates.get('fx:hub_match');
    w.templates.set('minecraft:village/x', {
      ...(hub as PieceTemplate),
      id: 'minecraft:village/x',
      blocks: null,
    });
    w.pools.set('fx:start_box', pool('fx:start_box', [single('minecraft:village/x')]));
    const a = assemble(w.input({ startPool: 'fx:start_box' }, 1n));
    expect(a.pieces[0]?.source).toBe('box');
    expect(a.pieces.slice(1).every((p) => p.source === 'project')).toBe(true);
  });

  it('asks the host for each template once per assembly', () => {
    const w = fixtureWorld();
    assemble(w.input({ startPool: 'fx:start_grid', size: 7, maxDistanceFromCenter: 116 }, 1n));
    expect(w.asked.get('fx:grid')).toBe(1);
  });

  it('a depth past the limit refuses the jigsaws of the last pieces with its reason', () => {
    const { assembly } = run(
      { startPool: 'fx:start_grid', size: 1, maxDistanceFromCenter: 116 },
      1,
    );
    expect(assembly.pieces).toHaveLength(5);
    const reasons = new Set(
      assembly.steps.flatMap((s) => (s.kind === 'refused' ? [s.reason] : [])),
    );
    expect(reasons.has('past_depth_limit')).toBe(true);
    expect(EMPTY).toBe('minecraft:empty');
  });
});
