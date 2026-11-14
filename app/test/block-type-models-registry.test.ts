/**
 * The registry view counts the models lowering generates for typed blocks (B273a): a typed
 * block's `<ns>:block/<path>` models and the flat item model of doors, panes, crops and
 * saplings are `model` ids (`blockGeneratedModelIds`), so the Wood set starter shows no
 * `schema.unknown-id` on its block states and item definitions.
 */
import { createMemoryFileSystem, type Element, type Json, type Project } from '@msm/core';
import { describe, expect, it } from 'vitest';
import { projectRegistryIds } from '../src/renderer/src/session/schema-context';
import { newSession } from './session-fixture';

const el = (id: string, data: Json): Element => ({
  id: id as `${string}:${string}`,
  kind: 'msm:block',
  data,
  formatVersion: 1,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

const projectOf = (...elements: Element[]): Project => ({
  formatVersion: 1,
  name: 'Demo',
  targets: [],
  plugins: [],
  settings: {},
  namespaces: [{ name: 'demo', elements, assets: [] }],
});

describe('registry view: generated block type models', () => {
  it('counts generated block models and flat item models, not given ones', () => {
    const ids = projectRegistryIds(
      projectOf(
        el('demo:oak_stairs', {
          format: 1,
          type: 'stairs',
          textures: { all: 'demo:block/planks' },
        }),
        el('demo:oak_door', {
          format: 1,
          type: 'door',
          textures: { top: 'demo:block/door_top', bottom: 'demo:block/door_bottom' },
        }),
        el('demo:plain', { format: 1, model: 'demo:block/plain' }),
        el('demo:bare', { format: 1, type: 'slab' }),
      ),
    );
    const model = ids.model ?? [];
    expect(model).toContain('demo:block/oak_stairs');
    expect(model).toContain('demo:block/oak_stairs_inner');
    expect(model).toContain('demo:block/oak_stairs_outer');
    expect(model).toContain('demo:item/oak_door');
    expect(model.some((id) => id.startsWith('demo:block/oak_door'))).toBe(true);
    expect(model.some((id) => id.includes('plain') || id.includes('bare'))).toBe(false);
  });

  it('opens the Wood set starter with no schema.unknown-id', async () => {
    const { session } = newSession(createMemoryFileSystem());
    const starter = session.library.starters.find((entry) => entry.title === 'Wood set');
    if (starter === undefined) throw new Error('No Wood set starter.');
    expect(await session.newProject({ starterId: starter.id })).toEqual({ ok: true });
    await session.flushValidation();
    const project = session.snapshot.project;
    if (project === null) throw new Error('No project.');
    const blocks = project.namespaces.flatMap((namespace) =>
      namespace.elements.filter((element) => element.kind === 'msm:block'),
    );
    expect(blocks.length).toBeGreaterThanOrEqual(15);
    const unknown = session.snapshot.problems.filter(
      (problem) => problem.code === 'schema.unknown-id',
    );
    expect(unknown).toEqual([]);
  }, 60_000);
});
