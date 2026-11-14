/**
 * The registry view counts a block's own item id (`item.id`, ADR 0068 D2; B268): seeds of a
 * crop are `item` ids, so the Crop template and a recipe naming the seeds show no
 * `schema.unknown-id`, and `"item": false` still registers no item.
 */
import {
  createMemoryFileSystem,
  type Element,
  type Json,
  type Problem,
  type Project,
} from '@msm/core';
import { blocksItemsTemplates } from '@msm/plugin-blocks-items';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { dataRegistryIds } from '../src/renderer/src/session/schema-context';
import { templateContext } from '../src/renderer/src/studios/templates';
import { newSession } from './session-fixture';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const el = (id: string, kind: string, data: Json): Element => ({
  id: id as `${string}:${string}`,
  kind,
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

describe('registry view: a block item with its own id (ADR 0068 D2)', () => {
  it('counts item.id in the item registry instead of the block id', () => {
    const project = projectOf(
      el('demo:berry', 'msm:block', { format: 1, type: 'crop', item: { id: 'demo:berry_seeds' } }),
      el('demo:stone', 'msm:block', { format: 1 }),
      el('demo:ghost', 'msm:block', { format: 1, item: false }),
    );
    const ids = dataRegistryIds(project);
    expect(ids.item).toEqual(['demo:berry_seeds', 'demo:stone']);
    expect(ids.block).toEqual(['demo:berry', 'demo:ghost', 'demo:stone']);
  });

  it('shows no schema.unknown-id for the Crop template and a recipe naming its seeds', async () => {
    const crop = blocksItemsTemplates.find((template) => template.id === 'msm_block_crop');
    if (crop === undefined) throw new Error('No Crop template.');
    const data = await crop.data(templateContext('demo:berry', ['demo'], undefined, target));
    const fixture = newSession(createMemoryFileSystem());
    const { session } = fixture;
    await session.newProject();
    session.addElement({ id: 'demo:berry', kind: 'msm:block', data });
    session.addElement({
      id: 'demo:berry_seeds_from_wheat',
      kind: 'minecraft:recipe',
      data: {
        type: 'minecraft:crafting_shapeless',
        ingredients: ['minecraft:wheat'],
        result: { id: 'demo:berry_seeds', count: 1 },
      },
    });
    await session.flushValidation();
    const unknown = (problems: readonly Problem[]) =>
      problems.filter((problem) => problem.code === 'schema.unknown-id');
    expect(unknown(session.problemsFor('demo:berry'))).toEqual([]);
    expect(unknown(session.problemsFor('demo:berry_seeds_from_wheat'))).toEqual([]);
  }, 60_000);
});
