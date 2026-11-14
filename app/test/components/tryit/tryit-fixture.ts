/**
 * A small lowered project for the Try it view's tests: a cube, a crop, a door and a mob with a
 * spawn egg, as `OutputFile`s, plus a fake session that lowers them.
 */

import type { Project } from '@msm/core';
import type { Json, OutputFile, Target } from '@msm/plugin-api';
import { defaultTargetId, targetById } from '@msm/targets';
import type { LoweringSession } from '../../../src/renderer/src/tryit/session-source';

export const NS = 'demo';

/** The default target, as the session would give it. */
export const TARGET: Target = (targetById(defaultTargetId) as { target: Target }).target;

const json = (path: string, contents: Json): OutputFile =>
  ({ path, contents, layer: 'resourcepack' }) as OutputFile;

/** The lowered files; `names` overrides the `en_us` names. */
export function demoOutputs(
  options: { names?: Record<string, string>; withoutCrop?: boolean; cropAge?: number } = {},
): OutputFile[] {
  const folders = TARGET.folders.resource;
  const out: OutputFile[] = [
    json(`msm/${NS}/block/ruby_block.json`, { format: 1 }),
    json(`msm/${NS}/block/door.json`, { format: 1, type: 'door', set_type: 'oak' }),
    json(`msm/${NS}/entity/golem.json`, {
      format: 1,
      category: 'creature',
      size: { width: 0.8, height: 1.6 },
      components: { 'msm:movement': { speed: 0.25 } },
      spawn_egg: {},
    }),
    json(`assets/${NS}/${folders.block_definition}/ruby_block.json`, {
      variants: { '': { model: `${NS}:block/ruby_block` } },
    }),
    json(`assets/${NS}/${folders.model}/block/ruby_block.json`, {
      parent: 'minecraft:block/cube_all',
      textures: { all: `${NS}:block/ruby_block` },
    }),
    json(`assets/${NS}/${folders.lang}/en_us.json`, {
      [`block.${NS}.ruby_block`]: 'Ruby Block',
      [`entity.${NS}.golem`]: 'Golem',
      ...(options.names ?? {}),
    }),
  ];
  if (options.withoutCrop !== true) {
    out.push(
      json(`msm/${NS}/block/berry.json`, {
        format: 1,
        type: 'crop',
        max_age: options.cropAge ?? 3,
      }),
    );
  }
  return out;
}

/** A fake session: `setOutputs` and `edit` stand for a project edit. */
export function fakeSession(outputs: OutputFile[] = demoOutputs()) {
  let current = outputs;
  let project = { id: 1 } as unknown as Project;
  const listeners = new Set<(snapshot: { project: Project | null }) => void>();
  let lowerings = 0;
  const session: LoweringSession & {
    snapshot: { project: Project | null; root: string | null };
  } = {
    snapshot: { project, root: '/projects/demo' },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async lowerExpandedProject() {
      lowerings += 1;
      return { files: current };
    },
    target: TARGET,
  };
  return {
    session,
    get lowerings() {
      return lowerings;
    },
    /** Changes the lowered files and tells the listeners the project changed. */
    edit(next: OutputFile[]) {
      current = next;
      project = { id: Math.random() } as unknown as Project;
      session.snapshot = { ...session.snapshot, project };
      for (const listener of [...listeners]) listener(session.snapshot);
    },
  };
}
