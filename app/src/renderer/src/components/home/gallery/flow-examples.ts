/**
 * The one lookup from a flow or starter to the library example that shows it (ADR 0129 D1, D2),
 * for a gallery card's picture and **See the example**.
 *
 * The map of record is `showcase/flow-clips.ts` (ADR 0129 D2: one library example per flow, with
 * its clip). It is read through `import.meta.glob`, so the gallery works before that file exists
 * and picks it up by itself once it does. Its shapes understood here: a function
 * `exampleForFlow(id)` or `flowExampleId(id)` returning an example id, or a record `FLOW_CLIPS` /
 * `FLOW_EXAMPLES` from flow or starter id to an example id or to `{ exampleId }`.
 *
 * Until then (and for a flow that file leaves out), a flow is shown by the example of the
 * Showcase card whose **Make this** opens it, else by an example whose id is the starter's own.
 * A flow with none gets its own drawn picture (`gallery-model.ts`'s `starterAsExample`).
 *
 * @packageDocumentation
 */

import type { ExampleProject } from '@msm/plugin-api';
import { SHOWCASES } from '../../../showcase/showcases';

type ExampleRef = string | { readonly exampleId?: unknown };

/** The modules of `showcase/flow-clips.ts`, when it exists (empty otherwise). */
const flowClipModules: Record<string, Record<string, unknown>> = import.meta.glob(
  '../../../showcase/flow-clips.ts',
  { eager: true },
);

/** The id a reference names, when it is one. */
function refId(ref: unknown): string | undefined {
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'object' && ref !== null) {
    const id = (ref as { exampleId?: unknown }).exampleId;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

/** The example `flow-clips.ts` names for a starter, when the file exists and names one. */
export function flowClipsExample(
  starterId: string,
  modules: Record<string, Record<string, unknown>> = flowClipModules,
): string | undefined {
  for (const module of Object.values(modules)) {
    for (const name of ['exampleForFlow', 'flowExampleId']) {
      const lookup = module[name];
      if (typeof lookup === 'function') {
        const id = refId((lookup as (id: string) => unknown)(starterId));
        if (id !== undefined) return id;
      }
    }
    for (const name of ['FLOW_CARDS', 'FLOW_CLIPS', 'FLOW_EXAMPLES']) {
      const record = module[name];
      if (typeof record === 'object' && record !== null) {
        const id = refId((record as Record<string, ExampleRef>)[starterId]);
        if (id !== undefined) return id;
      }
    }
  }
  return undefined;
}

/**
 * Flow id to the example of the Showcase card whose Make this opens only that flow (first card
 * wins).
 */
const SHOWCASE_EXAMPLES: ReadonlyMap<string, string> = (() => {
  const out = new Map<string, string>();
  for (const clip of SHOWCASES) {
    // A card that offers several flows (the vehicles) shows only one of them.
    if (clip.make.type !== 'flows' || clip.make.flowIds.length !== 1) continue;
    const [flowId] = clip.make.flowIds;
    if (flowId !== undefined && !out.has(flowId)) out.set(flowId, clip.exampleId);
  }
  return out;
})();

/**
 * The library example that shows a flow or starter, among `examples`, or `undefined`
 * (`flow-clips.ts` first, then the Showcase's, then an example of the same id).
 */
export function exampleForStarter(
  starterId: string,
  examples: readonly ExampleProject[],
  modules: Record<string, Record<string, unknown>> = flowClipModules,
): string | undefined {
  const ids = new Set(examples.map((example) => example.id));
  for (const id of [
    flowClipsExample(starterId, modules),
    SHOWCASE_EXAMPLES.get(starterId),
    starterId,
  ]) {
    if (id !== undefined && ids.has(id)) return id;
  }
  return undefined;
}
