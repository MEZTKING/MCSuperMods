/**
 * MSM's own made-up buildings and processor lists for the processor view's tests (B641; no
 * Mojang file), and a structures worker that runs the real processors host and the real
 * `@msm/terrain` engine in this thread, as `assembly/worker.ts` will once it routes the
 * processors' messages (the change B641 reports).
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import * as terrain from '@msm/terrain';
import type { ProcessorWorkerLike } from '../../../../src/renderer/src/liveviews/structures/processors/client';
import {
  createProcessorHost,
  type ProcessorAnswer,
  type ProcessorRequest,
} from '../../../../src/renderer/src/liveviews/structures/processors/host';

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

export const LIST = 'minecraft:worldgen/processor_list';
export const TEMPLATE = 'minecraft:structure_template';
export const POOL = 'minecraft:worldgen/template_pool';

/** A 4 by 2 by 4 hut: a stone floor, a ring of cobblestone, air inside. */
export function hut(id = 'demo:hut'): Element {
  const blocks: [number, number, number, number][] = [];
  for (let x = 0; x < 4; x += 1) {
    for (let z = 0; z < 4; z += 1) {
      blocks.push([x, 0, z, 0]);
      const edge = x === 0 || z === 0 || x === 3 || z === 3;
      blocks.push([x, 1, z, edge ? 1 : 2]);
    }
  }
  return element(id, TEMPLATE, {
    size: [4, 2, 4],
    palette: ['minecraft:stone', 'minecraft:cobblestone', 'minecraft:air'],
    blocks,
  });
}

const rule = (input: Json, output: string): Json => ({
  input_predicate: input,
  location_predicate: { predicate_type: 'minecraft:always_true' },
  output_state: output,
});

/** Stone to mossy cobblestone, every block (an exact, checked rule). */
export function mossList(id = 'demo:moss'): Element {
  return element(id, LIST, {
    processors: [
      {
        processor_type: 'minecraft:rule',
        rules: [
          rule(
            { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' },
            'minecraft:mossy_cobblestone',
          ),
        ],
      },
    ],
  });
}

/** Half the cobblestone left out at random, then the stone aged (about right). */
export function randomList(id = 'demo:crumble'): Element {
  return element(id, LIST, {
    processors: [
      { processor_type: 'minecraft:block_rot', integrity: 0.5 },
      { processor_type: 'minecraft:block_age', mossiness: 0.5 },
    ],
  });
}

/** A rule with a `{ Name }` state, which the game refuses. */
export function refusedList(id = 'demo:wrong'): Element {
  return element(id, LIST, {
    processors: [
      {
        processor_type: 'minecraft:rule',
        rules: [
          {
            input_predicate: { predicate_type: 'minecraft:always_true' },
            location_predicate: { predicate_type: 'minecraft:always_true' },
            output_state: { Name: 'minecraft:stone' },
          },
        ],
      },
    ],
  });
}

/** A pool placing `location` with `list`. */
export function pool(id: string, location: string, list: string): Element {
  return element(id, POOL, {
    fallback: 'minecraft:empty',
    elements: [
      {
        weight: 1,
        element: {
          element_type: 'minecraft:single_pool_element',
          location,
          processors: list,
          projection: 'rigid',
        },
      },
    ],
  });
}

/** A worker running the real processors host and engine in this thread. */
export function hostWorker(): ProcessorWorkerLike & { readonly sent: ProcessorRequest[] } {
  const sent: ProcessorRequest[] = [];
  const worker = {
    sent,
    onmessage: null as ((event: { readonly data: ProcessorAnswer }) => void) | null,
    onerror: null as ((event: { readonly message?: string }) => void) | null,
    terminate() {},
    postMessage(message: ProcessorRequest) {
      sent.push(message);
      host.receive(structuredClone(message));
    },
  };
  const host = createProcessorHost(terrain, (answer) => {
    setTimeout(() => worker.onmessage?.({ data: structuredClone(answer) }), 0);
  });
  return worker;
}
