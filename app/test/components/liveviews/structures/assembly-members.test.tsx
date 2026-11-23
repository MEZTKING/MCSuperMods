// @vitest-environment happy-dom

/**
 * Every member of a list pool element is drawn (B712): the worker draws each template of a list
 * element's piece at the piece's place and turn, the step list says "N parts", the view says how
 * overlapping parts are drawn, and single elements are unchanged. The 841-piece lattice is timed
 * with single pieces and with a list of three on every piece (against B640's 53 to 110 ms). MSM's
 * own made-up pools; no Mojang file.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import * as terrain from '@msm/terrain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import { STRUCTURES_VIEWS } from '../../../../src/renderer/src/liveviews/structures';
import AssemblyView from '../../../../src/renderer/src/liveviews/structures/assembly/AssemblyView';
import type {
  AssemblyJob,
  ViewStep,
} from '../../../../src/renderer/src/liveviews/structures/assembly/client';
import {
  DEFAULT_PIECE_LIMIT,
  flattenPieces,
  gatherAssembly,
  hasPartedPiece,
  PARTS_LINE,
  pieceWords,
  placedSteps,
  poolViewStructure,
} from '../../../../src/renderer/src/liveviews/structures/assembly/steps';
import { createAssemblyHost } from '../../../../src/renderer/src/liveviews/structures/assembly/worker';
import { NOT_SET_UP_VANILLA_PIECES } from '../../../../src/renderer/src/liveviews/structures/vanilla-pieces';
import { NOT_SET_UP_VANILLA_DATA } from '../../../../src/renderer/src/liveviews/vanilla-data';
import { DEFAULT_PREFS } from '../../../../src/renderer/src/liveviews/view-prefs';
import { arm, cross, element, hub, hubProject, pool, projectOf } from './assembly-fixtures';

vi.mock('../../../../src/renderer/src/preview/webgl', () => ({ hasWebGL: () => false }));

vi.mock(
  '../../../../src/renderer/src/liveviews/structures/assembly/client',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/renderer/src/liveviews/structures/assembly/client')
      >();
    let client: InstanceType<typeof actual.AssemblyClient> | null = null;
    return {
      ...actual,
      sharedAssemblyClient: () => {
        client ??= new actual.AssemblyClient({
          createWorker: async () => (await import('./assembly-fixtures')).hostWorker(),
        });
        return client;
      },
    };
  },
);

beforeAll(async () => {
  await import('@msm/terrain');
  await STRUCTURES_VIEWS['minecraft:worldgen/template_pool']?.();
}, 60_000);

afterEach(() => cleanup());

const POOL = 'minecraft:worldgen/template_pool';
const TEMPLATE = 'minecraft:structure_template';

/** A pool of one list element of the given templates. */
function listPool(id: string, ...locations: string[]): Element {
  return element(id, POOL, {
    fallback: 'minecraft:empty',
    elements: [
      {
        weight: 1,
        element: {
          element_type: 'minecraft:list_pool_element',
          projection: 'rigid',
          elements: locations.map((location) => ({
            element_type: 'minecraft:single_pool_element',
            location,
            processors: 'minecraft:empty',
            projection: 'rigid',
          })),
        },
      },
    ],
  });
}

/** A template of one block state filling the given cells, with no jigsaw. */
function filled(id: string, size: [number, number, number], state: string, cells: Json[]): Element {
  return element(id, TEMPLATE, {
    size,
    palette: [state],
    blocks: cells.map((cell) => [...(cell as number[]), 0]),
    jigsaws: [],
  });
}

/** A 3 by 2 by 3 roof of glass over the arm (its top layer). */
const roof = () =>
  filled(
    'demo:roof',
    [3, 2, 3],
    'minecraft:glass',
    [0, 1, 2].flatMap((x) => [0, 1, 2].map((z) => [x, 1, z])),
  );
/** A 1 by 3 by 1 post of red wool, at the arm's corner and over the roof's corner. */
const post = () =>
  filled('demo:post', [1, 3, 1], 'minecraft:red_wool', [
    [0, 0, 0],
    [0, 1, 0],
    [0, 2, 0],
  ]);

/** The hub, and an arm that is a list of three: planks floor, glass roof, wool post. */
function listProject(): Project {
  return projectOf(
    pool('demo:start', 'demo:hub'),
    listPool('demo:arms', 'demo:arm', 'demo:roof', 'demo:post'),
    hub(),
    arm(),
    roof(),
    post(),
  );
}

function assembleAll(job: AssemblyJob): ViewStep[] {
  const steps: ViewStep[] = [];
  const host = createAssemblyHost(
    terrain,
    (answer) => {
      if (answer.kind === 'steps') steps.push(...answer.steps);
    },
    (run) => run(),
  );
  host.receive({ token: 1, kind: 'assemble', job });
  return steps;
}

async function jobOf(project: Project, seed = '1', depth = 3): Promise<AssemblyJob> {
  const gathered = await gatherAssembly({
    project,
    startPool: 'demo:start',
    pieces: NOT_SET_UP_VANILLA_PIECES,
    readVanillaPools: async () => ({ status: 'not_set_up' as const }),
  });
  return {
    structure: poolViewStructure('demo:start', depth),
    pools: gathered.pools,
    templates: gathered.templates,
    seed,
    pieceLimit: DEFAULT_PIECE_LIMIT,
    origin: [0, 1, 0],
  };
}

/** The blocks of a placed step as `x,y,z` to state. */
function cellsOf(step: Extract<ViewStep, { kind: 'placed' }>): Map<string, string> {
  const out = new Map<string, string>();
  const { blocks, palette } = step.cells;
  for (let i = 0; i + 3 < blocks.length; i += 4) {
    out.set(
      `${blocks[i]},${blocks[i + 1]},${blocks[i + 2]}`,
      palette[blocks[i + 3] as number] ?? '',
    );
  }
  return out;
}

describe('a list element of three templates (B712)', () => {
  it('draws all three members at the piece’s place and turn, later over earlier', async () => {
    const seen = new Set<string>();
    for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const placed = placedSteps(assembleAll(await jobOf(listProject(), seed)));
      expect(placed).toHaveLength(2);
      const [start, armStep] = placed as [
        Extract<ViewStep, { kind: 'placed' }>,
        Extract<ViewStep, { kind: 'placed' }>,
      ];
      expect(start.piece.members).toBeUndefined();
      const { piece } = armStep;
      seen.add(piece.rotation);
      expect(piece.template).toBe('demo:arm');
      expect(piece.members?.map((m) => m.template)).toEqual(['demo:arm', 'demo:roof', 'demo:post']);
      const cells = cellsOf(armStep);
      const states = [...cells.values()];
      // The floor of 9 planks (its jigsaw is planks too), 9 glass less the one the post covers, 3 wool.
      expect(states.filter((s) => s === 'minecraft:oak_planks')).toHaveLength(8);
      expect(states.filter((s) => s === 'minecraft:glass')).toHaveLength(8);
      expect(states.filter((s) => s === 'minecraft:red_wool')).toHaveLength(3);
      // Each member's blocks inside its own box, which lies in the piece's box.
      for (const [key, state] of cells) {
        const [x, y, z] = key.split(',').map(Number) as [number, number, number];
        const at = { oak_planks: 0, glass: 1, red_wool: 2 }[state.slice('minecraft:'.length)];
        const box = piece.members?.[at as number]?.box;
        expect(box).toBeDefined();
        if (!box) continue;
        expect(x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY).toBe(true);
        expect(z >= box.minZ && z <= box.maxZ).toBe(true);
      }
      // The two jigsaw blocks that met still sit side by side (the lead's own box).
      const met = armStep.met;
      expect(met).not.toBeNull();
      if (met) {
        const gap = met.parent.map((v, i) => Math.abs(v - (met.child[i] ?? 0)));
        expect(gap.reduce((a, b) => a + b, 0)).toBe(1);
      }
      expect(pieceWords(piece, false)).toBe('Arm, 3 parts');
      expect(hasPartedPiece(placed)).toBe(true);
      const flat = flattenPieces(placed, 2);
      expect(flat?.palette).toEqual(
        expect.arrayContaining(['minecraft:glass', 'minecraft:red_wool', 'minecraft:oak_planks']),
      );
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('single elements are unchanged: no members, no parts', async () => {
    const placed = placedSteps(assembleAll(await jobOf(hubProject())));
    expect(placed.map((s) => s.piece.template)).toEqual(['demo:hub', 'demo:arm']);
    for (const { piece } of placed) {
      expect('members' in piece).toBe(false);
      expect(pieceWords(piece, false)).not.toContain('parts');
    }
    expect(hasPartedPiece(placed)).toBe(false);
  });

  it('the view lists the piece as 3 parts and says how parts are drawn', async () => {
    const project = listProject();
    const props: LiveViewProps = {
      project,
      element: project.namespaces[0]?.elements[0] as Element,
      vanilla: NOT_SET_UP_VANILLA_DATA,
      vanillaAssets: null,
      preferences: DEFAULT_PREFS,
      onPreferences: () => {},
      onSetup: () => {},
    };
    render(<AssemblyView {...props} />);
    await waitFor(
      () => expect(screen.getByTestId('assembly-count').textContent).toBe('2 of 2 pieces'),
      { timeout: 5000 },
    );
    const lines = screen
      .getAllByTestId('assembly-step')
      .filter((item) => item.dataset.kind === 'placed')
      .map((item) => item.textContent ?? '');
    expect(lines[1]).toContain('Piece 2: Arm, 3 parts, joined to piece 1');
    expect(screen.getByTestId('live-view-notes').textContent).toContain(PARTS_LINE);
  });

  it('a view without a list element does not show the parts line', async () => {
    const project = hubProject();
    render(
      <AssemblyView
        project={project}
        element={project.namespaces[0]?.elements[0] as Element}
        vanilla={NOT_SET_UP_VANILLA_DATA}
        vanillaAssets={null}
        preferences={DEFAULT_PREFS}
        onPreferences={() => {}}
        onSetup={() => {}}
      />,
    );
    await waitFor(
      () => expect(screen.getByTestId('assembly-count').textContent).toBe('2 of 2 pieces'),
      { timeout: 5000 },
    );
    expect(screen.getByTestId('live-view-notes').textContent).not.toContain(PARTS_LINE);
  });
});

describe('the 841-piece lattice (B640’s timing)', () => {
  /** The cross lattice to depth 20 (841 pieces), each piece single or a list of the cross and two more. */
  async function latticeJob(list: boolean, seed: string): Promise<AssemblyJob> {
    const project = list
      ? projectOf(
          pool('demo:start', 'demo:cross'),
          listPool('demo:grid', 'demo:cross', 'demo:roof', 'demo:post'),
          cross(),
          roof(),
          post(),
        )
      : projectOf(pool('demo:start', 'demo:cross'), pool('demo:grid', 'demo:cross'), cross());
    const job = await jobOf(project, seed, 20);
    return {
      ...job,
      structure: { ...poolViewStructure('demo:start', 20), maxDistanceFromCenter: 200 },
      pieceLimit: 1000,
    };
  }

  function timed(job: AssemblyJob): { ms: number; flatMs: number; steps: ViewStep[] } {
    const t0 = performance.now();
    const steps = assembleAll(job);
    const ms = performance.now() - t0;
    const placed = placedSteps(steps);
    const t1 = performance.now();
    flattenPieces(placed, placed.length);
    return { ms, flatMs: performance.now() - t1, steps };
  }

  it('assembles and draws with members within B640’s order of time', async () => {
    const report: string[] = [];
    for (const list of [false, true]) {
      const runs: number[] = [];
      const flats: number[] = [];
      let pieces = 0;
      let blocks = 0;
      for (let i = 0; i < 5; i += 1) {
        const r = timed(await latticeJob(list, String(i + 1)));
        const placed = placedSteps(r.steps);
        pieces = placed.length;
        blocks = flattenPieces(placed, placed.length)?.blocks.length ?? 0;
        runs.push(r.ms);
        flats.push(r.flatMs);
        // The start piece is a single element; every other piece is the list of three.
        for (const { piece } of placed.slice(1)) {
          expect(piece.members?.length ?? 1).toBe(list ? 3 : 1);
        }
      }
      expect(pieces).toBe(841);
      runs.sort((a, b) => a - b);
      flats.sort((a, b) => a - b);
      report.push(
        `${list ? 'list of 3' : 'single'}: ${pieces} pieces, ${blocks} blocks flattened, whole with blocks ${runs[0]?.toFixed(0)} to ${runs.at(-1)?.toFixed(0)} ms (median ${runs[2]?.toFixed(0)}), flattened ${flats[0]?.toFixed(0)} to ${flats.at(-1)?.toFixed(0)} ms`,
      );
      // ADR 0122 D10's budget for the whole: 2 s (CI is some 5.7 times slower than a desk).
      expect(runs[2]).toBeLessThan(2000 * 5.7);
    }
    console.log(`[B712 speed] ${report.join('; ')}`);
  }, 120_000);
});
