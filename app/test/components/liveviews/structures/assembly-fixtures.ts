/**
 * MSM's own made-up pools and templates for the assembly view's tests (B640; no Mojang file),
 * and a structures worker that runs the real host and the real `@msm/terrain` assembler in this
 * thread.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import * as terrain from '@msm/terrain';
import type {
  AssemblyAnswer,
  AssemblyRequest,
  AssemblyWorkerLike,
} from '../../../../src/renderer/src/liveviews/structures/assembly/client';
import { createAssemblyHost } from '../../../../src/renderer/src/liveviews/structures/assembly/worker';

export const element = (id: string, kind: string, data: Json): Element =>
  ({ id, kind, data }) as unknown as Element;

export function projectOf(...elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ name: 'demo', assets: [], elements }],
    targets: [],
    plugins: [],
    settings: {},
  } as unknown as Project;
}

const POOL = 'minecraft:worldgen/template_pool';
const TEMPLATE = 'minecraft:structure_template';

/** A pool of single pieces, each with weight 1. */
export function pool(id: string, ...locations: string[]): Element {
  return element(id, POOL, {
    fallback: 'minecraft:empty',
    elements: locations.map((location) => ({
      weight: 1,
      element: {
        element_type: 'minecraft:single_pool_element',
        location,
        processors: 'minecraft:empty',
        projection: 'rigid',
      },
    })),
  });
}

/**
 * A 5 by 1 by 5 stone floor with one jigsaw on its east edge (`demo:hub_out`) asking the pool
 * `arms` for a jigsaw named `demo:arm_in`, and a lantern facing north.
 */
export function hub(arms = 'demo:arms'): Element {
  const blocks: [number, number, number, number][] = [];
  for (let x = 0; x < 5; x += 1) {
    for (let z = 0; z < 5; z += 1) blocks.push([x, 0, z, x === 4 && z === 2 ? 1 : 0]);
  }
  return element('demo:hub', TEMPLATE, {
    size: [5, 1, 5],
    palette: ['minecraft:stone', 'minecraft:jigsaw[orientation=east_up]'],
    blocks,
    jigsaws: [
      {
        pos: [4, 0, 2],
        pool: arms,
        name: 'demo:hub_out',
        target: 'demo:arm_in',
        final_state: 'minecraft:stone',
      },
    ],
  });
}

/** A 3 by 1 by 3 piece of planks with a jigsaw named `name` on its west edge. */
export function arm(id = 'demo:arm', name = 'demo:arm_in'): Element {
  const blocks: [number, number, number, number][] = [];
  for (let x = 0; x < 3; x += 1) {
    for (let z = 0; z < 3; z += 1) blocks.push([x, 0, z, x === 0 && z === 1 ? 1 : 0]);
  }
  return element(id, TEMPLATE, {
    size: [3, 1, 3],
    palette: ['minecraft:oak_planks', 'minecraft:jigsaw[orientation=west_up]'],
    blocks,
    jigsaws: [
      {
        pos: [0, 0, 1],
        pool: 'minecraft:empty',
        name,
        target: 'minecraft:empty',
        final_state: 'minecraft:oak_planks',
      },
    ],
  });
}

/**
 * A 3 by 1 by 3 cross with a jigsaw on each side, each asking `demo:grid` for its opposite: an
 * endless lattice that a depth of 20 makes far larger than 500 pieces.
 */
export function cross(): Element {
  const sides = [
    { pos: [2, 0, 1], orientation: 'east_up', name: 'demo:east', target: 'demo:west' },
    { pos: [0, 0, 1], orientation: 'west_up', name: 'demo:west', target: 'demo:east' },
    { pos: [1, 0, 0], orientation: 'north_up', name: 'demo:north', target: 'demo:south' },
    { pos: [1, 0, 2], orientation: 'south_up', name: 'demo:south', target: 'demo:north' },
  ] as const;
  const palette = [
    'minecraft:stone',
    ...sides.map((s) => `minecraft:jigsaw[orientation=${s.orientation}]`),
  ];
  const blocks: [number, number, number, number][] = [];
  for (let x = 0; x < 3; x += 1) {
    for (let z = 0; z < 3; z += 1) {
      const side = sides.findIndex((s) => s.pos[0] === x && s.pos[2] === z);
      blocks.push([x, 0, z, side + 1]);
    }
  }
  return element('demo:cross', TEMPLATE, {
    size: [3, 1, 3],
    palette,
    blocks,
    jigsaws: sides.map((s) => ({
      pos: [...s.pos],
      pool: 'demo:grid',
      name: s.name,
      target: s.target,
      final_state: 'minecraft:stone',
    })),
  });
}

/** The hub and its one arm: two pieces from `demo:start`. */
export function hubProject(): Project {
  return projectOf(pool('demo:start', 'demo:hub'), pool('demo:arms', 'demo:arm'), hub(), arm());
}

/** A worker running the real host and engine in this thread. */
export function hostWorker(): AssemblyWorkerLike & { readonly sent: AssemblyRequest[] } {
  const sent: AssemblyRequest[] = [];
  const worker = {
    sent,
    onmessage: null as ((event: { readonly data: AssemblyAnswer }) => void) | null,
    terminate() {},
    postMessage(message: AssemblyRequest) {
      sent.push(message);
      host.receive(structuredClone(message));
    },
  };
  const host = createAssemblyHost(terrain, (answer) => {
    setTimeout(() => worker.onmessage?.({ data: structuredClone(answer) }), 0);
  });
  return worker;
}
