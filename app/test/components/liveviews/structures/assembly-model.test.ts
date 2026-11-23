/**
 * The assembly view's model and the structures worker (B640) over MSM's own made-up pools: the
 * data read as the engine's, the gathering of the project's and the jar's pieces, turned block
 * states, the worker's steps with each piece's blocks and the two jigsaw blocks that met, and the
 * flattening for the 3D view. No Mojang file.
 */

import * as terrain from '@msm/terrain';
import { describe, expect, it } from 'vitest';
import { forbiddenIn } from '../../../../src/renderer/src/components/ai/ai-words';
import { turnState } from '../../../../src/renderer/src/liveviews/structures/assembly/cells';
import type {
  AssemblyAnswer,
  AssemblyJob,
  ViewStep,
} from '../../../../src/renderer/src/liveviews/structures/assembly/client';
import {
  DEFAULT_PIECE_LIMIT,
  flattenPieces,
  gatherAssembly,
  jigsawStructureOf,
  NOT_JIGSAW_LINE,
  placedSteps,
  poolDataOf,
  poolViewStructure,
  REFUSAL_WORDS,
  stepsUpTo,
  stoppedLine,
} from '../../../../src/renderer/src/liveviews/structures/assembly/steps';
import {
  createAssemblyHost,
  seedBigint,
} from '../../../../src/renderer/src/liveviews/structures/assembly/worker';
import {
  NOT_SET_UP_VANILLA_PIECES,
  type PieceTemplate,
  type VanillaPieceReader,
} from '../../../../src/renderer/src/liveviews/structures/vanilla-pieces';
import { arm, cross, hub, hubProject, pool, projectOf } from './assembly-fixtures';

const notSetUp = async () => ({ status: 'not_set_up' as const });

/** Runs the worker's host to the end with the real engine; answers the steps and the end. */
function assembleAll(job: AssemblyJob): { steps: ViewStep[]; done: AssemblyAnswer | undefined } {
  const steps: ViewStep[] = [];
  let done: AssemblyAnswer | undefined;
  const host = createAssemblyHost(
    terrain,
    (answer) => {
      if (answer.kind === 'steps') steps.push(...answer.steps);
      else done = answer;
    },
    (run) => run(),
  );
  host.receive({ token: 1, kind: 'assemble', job });
  return { steps, done };
}

async function jobOf(project = hubProject(), depth = 3): Promise<AssemblyJob> {
  const gathered = await gatherAssembly({
    project,
    startPool: 'demo:start',
    pieces: NOT_SET_UP_VANILLA_PIECES,
    readVanillaPools: notSetUp,
  });
  return {
    structure: poolViewStructure('demo:start', depth),
    pools: gathered.pools,
    templates: gathered.templates,
    seed: '1',
    pieceLimit: DEFAULT_PIECE_LIMIT,
    origin: [0, 1, 0],
  };
}

describe('reading the data', () => {
  it('reads a pool as the engine does, with list members and fallback', () => {
    const data = poolDataOf('demo:p', {
      fallback: 'end',
      elements: [
        { weight: 3, element: { element_type: 'single_pool_element', location: 'demo:a' } },
        {
          weight: 1,
          element: {
            element_type: 'minecraft:list_pool_element',
            elements: [{ element_type: 'minecraft:single_pool_element', location: 'demo:b' }],
            projection: 'terrain_matching',
          },
        },
        'not an element',
      ],
    });
    expect(data.id).toBe('demo:p');
    expect(data.fallback).toBe('minecraft:end');
    expect(data.elements).toHaveLength(2);
    expect(data.elements[0]).toMatchObject({
      weight: 3,
      type: 'minecraft:single_pool_element',
      location: 'demo:a',
      projection: 'rigid',
    });
    expect(data.elements[1]).toMatchObject({ projection: 'terrain_matching' });
  });

  it('reads only jigsaw structures (4L2 for the rest)', () => {
    expect(jigsawStructureOf({ type: 'minecraft:igloo' })).toBeNull();
    expect(jigsawStructureOf({ type: 'minecraft:jigsaw' })).toBeNull();
    expect(
      jigsawStructureOf({
        type: 'jigsaw',
        start_pool: 'demo:start',
        size: 6,
        max_distance_from_center: { horizontal: 40 },
        start_jigsaw_name: 'demo:door',
        terrain_adaptation: 'beard_thin',
      }),
    ).toMatchObject({
      startPool: 'demo:start',
      size: 6,
      maxDistanceFromCenter: { horizontal: 40 },
      startJigsawName: 'demo:door',
      terrainAdaptation: 'beard_thin',
    });
    expect(NOT_JIGSAW_LINE).toBe('This kind of structure is built by the game itself.');
  });

  it('turns block states with the piece', () => {
    expect(turnState('minecraft:oak_stairs[facing=north,half=bottom]', 1)).toBe(
      'minecraft:oak_stairs[facing=east,half=bottom]',
    );
    expect(turnState('minecraft:oak_log[axis=x]', 1)).toBe('minecraft:oak_log[axis=z]');
    expect(turnState('minecraft:oak_sign[rotation=14]', 1)).toBe('minecraft:oak_sign[rotation=2]');
    expect(turnState('minecraft:jigsaw[orientation=down_east]', 2)).toBe(
      'minecraft:jigsaw[orientation=down_west]',
    );
    expect(turnState('minecraft:oak_fence[east=true,north=false,south=false,west=false]', 1)).toBe(
      'minecraft:oak_fence[east=false,north=false,south=true,west=false]',
    );
    expect(turnState('minecraft:stone', 3)).toBe('minecraft:stone');
  });

  it('says every refusal in plain words, with no ids', () => {
    for (const words of Object.values(REFUSAL_WORDS)) expect(forbiddenIn(words)).toEqual([]);
    expect(stoppedLine(500)).toBe('Stopped at 500 pieces.');
  });
});

describe('gathering', () => {
  it('follows pools through templates’ jigsaws in the project', async () => {
    const gathered = await gatherAssembly({
      project: hubProject(),
      startPool: 'demo:start',
      pieces: NOT_SET_UP_VANILLA_PIECES,
      readVanillaPools: notSetUp,
    });
    expect(Object.keys(gathered.pools).sort()).toEqual(['demo:arms', 'demo:start']);
    expect(Object.keys(gathered.templates).sort()).toEqual(['demo:arm', 'demo:hub']);
    expect(gathered.namesVanilla).toBe(false);
  });

  it('keeps the same template object while the element is unchanged', async () => {
    const project = hubProject();
    const read = () =>
      gatherAssembly({
        project,
        startPool: 'demo:start',
        pieces: NOT_SET_UP_VANILLA_PIECES,
        readVanillaPools: notSetUp,
      });
    const [a, b] = [await read(), await read()];
    expect(a.templates['demo:hub']?.template).toBe(b.templates['demo:hub']?.template);
    expect(a.templates['demo:hub']?.key).toBe(b.templates['demo:hub']?.key);
  });

  it('reads Minecraft’s own pools and templates from the jar, or says it is not set up', async () => {
    const project = projectOf(pool('demo:start', 'demo:hub'), hub('minecraft:made_up/arms'));
    const ownArm: PieceTemplate = {
      id: 'minecraft:made_up/arm',
      size: [3, 1, 3],
      palette: ['minecraft:stone'],
      blocks: [{ pos: [1, 0, 1], state: 0 }],
      jigsaws: [
        {
          pos: [0, 0, 1],
          orientation: 'west_up',
          name: 'demo:arm_in',
          target: 'minecraft:empty',
          pool: 'minecraft:empty',
          joint: 'aligned',
          finalState: 'minecraft:stone',
          selectionPriority: 0,
          placementPriority: 0,
        },
      ],
    };
    const reader: VanillaPieceReader = {
      ...NOT_SET_UP_VANILLA_PIECES,
      mcVersion: '9.9',
      templates: async (ids) =>
        new Map(
          ids.map((id) => [
            id,
            id === ownArm.id
              ? { status: 'ready' as const, id, template: ownArm }
              : { status: 'missing' as const, id },
          ]),
        ),
    };
    const gathered = await gatherAssembly({
      project,
      startPool: 'demo:start',
      pieces: reader,
      readVanillaPools: async () => ({
        status: 'ready',
        files: { 'minecraft:made_up/arms': poolDataJson('minecraft:made_up/arm') },
      }),
    });
    expect(gathered.namesVanilla).toBe(true);
    expect(gathered.vanillaNotSetUp).toBe(false);
    expect(gathered.templates['minecraft:made_up/arm']?.template).toBe(ownArm);
    const { steps } = assembleAll({
      structure: poolViewStructure('demo:start', 2),
      pools: gathered.pools,
      templates: gathered.templates,
      seed: '3',
      pieceLimit: 500,
      origin: [0, 1, 0],
    });
    expect(placedSteps(steps).map((step) => step.piece.source)).toEqual(['project', 'vanilla']);

    const without = await gatherAssembly({
      project,
      startPool: 'demo:start',
      pieces: NOT_SET_UP_VANILLA_PIECES,
      readVanillaPools: notSetUp,
    });
    expect(without.namesVanilla).toBe(true);
    expect(without.vanillaNotSetUp).toBe(true);
  });
});

function poolDataJson(location: string) {
  return {
    fallback: 'minecraft:empty',
    elements: [{ weight: 1, element: { element_type: 'minecraft:single_pool_element', location } }],
  };
}

describe('the structures worker', () => {
  it('places the hub and its arm, with the two jigsaw blocks that met side by side', async () => {
    const { steps, done } = assembleAll(await jobOf());
    expect(done).toMatchObject({ kind: 'done', stoppedAtLimit: false });
    const placed = placedSteps(steps);
    expect(placed.map((step) => step.piece.template)).toEqual(['demo:hub', 'demo:arm']);
    const second = placed[1];
    expect(second?.met).not.toBeNull();
    const met = second?.met;
    if (met === null || met === undefined) return;
    const gap = met.parent.map((value, i) => Math.abs(value - (met.child[i] ?? 0)));
    expect(gap.reduce((a, b) => a + b, 0)).toBe(1);
    expect(met.parentState.startsWith('minecraft:jigsaw[orientation=')).toBe(true);
    // Every block of a piece lies inside its box; jigsaw blocks became their final state.
    for (const { piece, cells } of placed) {
      expect(cells.palette.some((state) => state.startsWith('minecraft:jigsaw'))).toBe(false);
      for (let i = 0; i < cells.blocks.length; i += 4) {
        const [x, y, z] = cells.blocks.slice(i, i + 3) as [number, number, number];
        expect(x >= piece.box.minX && x <= piece.box.maxX).toBe(true);
        expect(y >= piece.box.minY && y <= piece.box.maxY).toBe(true);
        expect(z >= piece.box.minZ && z <= piece.box.maxZ).toBe(true);
      }
    }
  });

  it('gives the same steps for the same seed', async () => {
    const job = await jobOf();
    expect(assembleAll(job).steps).toEqual(assembleAll(job).steps);
  });

  it('refuses a piece with no matching jigsaw, with its reason', async () => {
    const project = projectOf(
      pool('demo:start', 'demo:hub'),
      pool('demo:arms', 'demo:wall'),
      hub(),
      arm('demo:wall', 'demo:wall_in'),
    );
    const { steps } = assembleAll(await jobOf(project));
    const refused = steps.find((step) => step.kind === 'refused');
    expect(refused).toMatchObject({ template: 'demo:wall', reason: 'no_matching_jigsaw' });
    expect(placedSteps(steps)).toHaveLength(1);
  });

  it('drops a cancelled assembly', async () => {
    // The lattice takes many batches; the first is sent before the cancel arrives.
    const job = {
      ...(await jobOf(
        projectOf(pool('demo:start', 'demo:cross'), pool('demo:grid', 'demo:cross'), cross()),
      )),
      structure: poolViewStructure('demo:start', 20),
    };
    const answers: AssemblyAnswer[] = [];
    const later: (() => void)[] = [];
    const host = createAssemblyHost(
      terrain,
      (answer) => answers.push(answer),
      (run) => later.push(run),
      () => 0,
    );
    host.receive({ token: 7, kind: 'assemble', job });
    host.receive({ token: 7, kind: 'cancel' });
    expect(answers.filter((answer) => answer.kind === 'steps')).toHaveLength(1);
    for (const run of later.splice(0)) run();
    expect(answers.some((answer) => answer.kind === 'done')).toBe(false);
    expect(answers.filter((answer) => answer.kind === 'steps')).toHaveLength(1);
  });

  it('turns a seed text into a number as the live views do', () => {
    expect(seedBigint('42')).toBe(42n);
    expect(seedBigint('hello')).toBe(seedBigint('hello'));
    expect(seedBigint('hello')).not.toBe(seedBigint('world'));
  });
});

describe('a very large assembly', () => {
  it('stops at the piece limit', async () => {
    const project = projectOf(
      pool('demo:start', 'demo:cross'),
      pool('demo:grid', 'demo:cross'),
      cross(),
    );
    const job = { ...(await jobOf(project)), structure: poolViewStructure('demo:start', 20) };
    const { steps, done } = assembleAll(job);
    expect(done).toMatchObject({ kind: 'done', stoppedAtLimit: true });
    expect(placedSteps(steps)).toHaveLength(DEFAULT_PIECE_LIMIT);
    const raised = assembleAll({ ...job, pieceLimit: 2000 });
    expect(raised.done).toMatchObject({ kind: 'done', stoppedAtLimit: false });
    expect(placedSteps(raised.steps).length).toBeGreaterThan(DEFAULT_PIECE_LIMIT);
  });
});

describe('the steps as the view shows them', () => {
  it('lists up to the n-th piece and flattens the pieces shown', async () => {
    const { steps } = assembleAll(await jobOf());
    const placed = placedSteps(steps);
    expect(stepsUpTo(steps, 0, true)).toEqual([]);
    const first = stepsUpTo(steps, 1, true);
    expect(placedSteps(first)).toHaveLength(1);
    expect(stepsUpTo(steps, 2, true)).toEqual(steps);
    const one = flattenPieces(placed, 1);
    expect(one?.size).toEqual([5, 1, 5]);
    const two = flattenPieces(placed, 2);
    // The start piece turns by the seed; the arm lies along x or z.
    expect(Math.max(two?.size[0] ?? 0, two?.size[2] ?? 0)).toBe(8);
    // The two jigsaw blocks that met are drawn as jigsaw blocks.
    expect(two?.palette.filter((state) => state.startsWith('minecraft:jigsaw'))).toHaveLength(2);
    expect(flattenPieces(placed, 0)).toBeNull();
  });
});
