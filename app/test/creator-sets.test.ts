import { createMemoryFileSystem, type Element, type Json, type Project } from '@msm/core';
import type { ProjectStarter } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  applyCreatorPlan,
  bundleToChangeItems,
  type CreatorPlan,
  creatorChanges,
  creatorLabel,
  creatorSetElements,
  creatorValues,
  mergeShared,
  planCreate,
  reopenPlan,
  stampItems,
} from '../src/renderer/src/changeset/creator-sets';
import { toValues } from '../src/renderer/src/components/wizard/wizard-model';
import type { ProjectSession } from '../src/renderer/src/session/project-session';
import { newSession } from './session-fixture';

const SET_ID = '00000000-0000-4000-8000-000000000001';

async function openProject() {
  const fs = createMemoryFileSystem();
  const { session } = newSession(fs);
  await session.newProject();
  const flow = session.library.starters.find((entry) => entry.id === 'gear-set') as ProjectStarter;
  expect(flow?.creator?.group).toBe('gear');
  return { session, fs, flow };
}

function valuesOf(flow: ProjectStarter, overrides: Record<string, Json>): Record<string, Json> {
  return { ...toValues(flow.parameters, {}), ...overrides };
}

const isKnownKind = (session: ProjectSession) => (kind: string) =>
  session.registry.get(kind) !== undefined;

function project(session: ProjectSession): Project {
  return session.snapshot.project as Project;
}

function element(session: ProjectSession, id: string): Element | undefined {
  return project(session)
    .namespaces.flatMap((namespace) => namespace.elements)
    .find((entry) => entry.id === id);
}

async function createSet(
  session: ProjectSession,
  flow: ProjectStarter,
  values: Record<string, Json>,
) {
  const bundle = await flow.build({
    namespace: 'demo',
    projectName: project(session).name,
    target: session.target,
    values,
  });
  const plan = planCreate(
    bundle,
    project(session),
    { flowId: flow.id, setId: SET_ID, values: creatorValues(values) },
    isKnownKind(session),
  );
  const result = await applyCreatorPlan(
    session,
    creatorChanges(plan),
    creatorLabel(plan, flow.title),
  );
  return { bundle, plan, result };
}

function reopen(
  session: ProjectSession,
  flow: ProjectStarter,
  storedValues: Record<string, Json>,
  newValues: Record<string, Json>,
): Promise<CreatorPlan> {
  return reopenPlan({
    project: project(session),
    flow,
    setId: SET_ID,
    namespace: 'demo',
    storedValues,
    newValues,
    target: session.target,
    isKnownKind: isKnownKind(session),
    readAsset: (namespace, path) => session.readAsset(namespace, path).catch(() => null),
  });
}

const statusOf = (plan: CreatorPlan, key: string) =>
  plan.entries.find((entry) => entry.key === key)?.status;

describe('creator-sets (ADR 0043 D3, D4)', () => {
  it('turns a bundle into create items stamped with meta.creator', async () => {
    const { session, flow } = await openProject();
    const values = valuesOf(flow, {});
    const bundle = await flow.build({
      namespace: 'demo',
      projectName: 'demo',
      target: session.target,
      values,
    });
    const stamp = { flowId: flow.id, setId: SET_ID, values: creatorValues(values) };
    const items = bundleToChangeItems(bundle, project(session), stamp, isKnownKind(session));
    const sword = items.find((item) => item.elementId === 'demo:ruby_sword');
    expect(sword?.op).toBe('create');
    expect(sword?.meta?.creator).toEqual({ ...stamp, generatedId: 'demo:ruby_sword' });
    expect(sword?.meta?.notes).toBeTypeOf('string');
    // The blank project's pack.mcmeta is kept: the bundle's own is a conflict, not an item.
    expect(items.some((item) => item.elementId === 'demo:pack')).toBe(false);
    expect(
      items.some(
        (item) => item.op === 'asset' && item.asset?.path === 'textures/item/ruby_sword.png',
      ),
    ).toBe(true);
    const plan = planCreate(bundle, project(session), stamp, isKnownKind(session));
    expect(statusOf(plan, 'demo:pack')).toBe('conflict');
    // Assets come after every element item.
    const firstAsset = items.findIndex((item) => item.op === 'asset');
    expect(items.slice(firstAsset).every((item) => item.op === 'asset')).toBe(true);
  });

  it('stampItems stamps only create items', () => {
    const stamped = stampItems(
      [
        { op: 'create', elementId: 'demo:a', kind: 'minecraft:function', after: { lines: [] } },
        {
          op: 'asset',
          asset: { namespace: 'demo', path: 'textures/a.png', bytes: new Uint8Array() },
        },
      ],
      { flowId: 'f', setId: 's', values: { a: 1 } },
    );
    expect(stamped[0]?.meta?.creator?.generatedId).toBe('demo:a');
    expect(stamped[1]?.meta).toBeUndefined();
  });

  it('applies a Create as one undo step labelled with the flow', async () => {
    const { session, flow, fs } = await openProject();
    const before = session.snapshot.project;
    const { result } = await createSet(session, flow, valuesOf(flow, {}));
    expect(result.applied).toBeGreaterThan(20);
    expect(session.snapshot.undoLabel).toBe('Create Gear set');
    expect(element(session, 'demo:ruby_helmet')?.meta.creator?.setId).toBe(SET_ID);
    expect(creatorSetElements(project(session), 'gear-set', SET_ID).length).toBeGreaterThan(20);
    expect(await fs.exists('assets/demo/textures/item/ruby_sword.png')).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
  });

  it('keeps meta.creator through the rename command', async () => {
    const { session, flow } = await openProject();
    await createSet(session, flow, valuesOf(flow, {}));
    session.renameElement('demo:ruby_axe', 'demo:big_axe');
    expect(element(session, 'demo:big_axe')?.meta.creator).toMatchObject({
      setId: SET_ID,
      generatedId: 'demo:ruby_axe',
    });
  });

  it('reopens a set: replaces untouched pieces, keeps edited ones, follows renames, removes and adds pieces', async () => {
    const { session, flow, fs } = await openProject();
    const stored = valuesOf(flow, {
      pieces: ['sword', 'pickaxe', 'axe', 'hoe', 'helmet', 'chestplate', 'leggings'],
    });
    await createSet(session, flow, stored);
    // Hand edits: the sword's data, a rename of the pickaxe.
    const sword = element(session, 'demo:ruby_sword') as Element;
    const edited = structuredClone(sword.data) as { components: { 'msm:tool': Json } };
    (edited.components['msm:tool'] as Record<string, Json>).attack_damage = 9;
    session.setElementData('demo:ruby_sword', edited as unknown as Json);
    session.renameElement('demo:ruby_pickaxe', 'demo:mega_pick');
    const helmetTexture = await fs.readFile('assets/demo/textures/item/ruby_helmet.png');

    const next = valuesOf(flow, {
      colour: '#2050e0',
      pieces: ['sword', 'pickaxe', 'axe', 'helmet', 'chestplate', 'leggings', 'boots'],
    });
    const plan = await reopen(session, flow, stored, next);
    expect(plan.mode).toBe('update');
    expect(statusOf(plan, 'demo:ruby_sword')).toBe('keep');
    expect(statusOf(plan, 'demo:mega_pick')).toBe('unchanged');
    expect(plan.entries.find((entry) => entry.key === 'demo:mega_pick')?.generatedId).toBe(
      'demo:ruby_pickaxe',
    );
    expect(statusOf(plan, 'demo:ruby_hoe')).toBe('remove');
    expect(statusOf(plan, 'demo:ruby_boots')).toBe('create');
    expect(statusOf(plan, 'demo:textures/item/ruby_helmet.png')).toBe('replace');
    expect(statusOf(plan, 'demo:textures/item/ruby_boots.png')).toBe('create');
    expect(statusOf(plan, 'demo:textures/item/ruby_hoe.png')).toBe('unused');

    const changes = creatorChanges(plan);
    await applyCreatorPlan(session, changes, creatorLabel(plan, flow.title));
    expect(session.snapshot.undoLabel).toBe('Update Gear set');
    expect(element(session, 'demo:ruby_sword')?.data).toEqual(edited);
    expect(element(session, 'demo:ruby_hoe')).toBeUndefined();
    expect(element(session, 'demo:ruby_boots')?.meta.creator?.setId).toBe(SET_ID);
    expect(element(session, 'demo:mega_pick')?.meta.creator?.values.colour).toBe('#2050e0');
    // The kept sword keeps the values it was made with.
    expect(element(session, 'demo:ruby_sword')?.meta.creator?.values.colour).toBe(stored.colour);
    expect(await fs.readFile('assets/demo/textures/item/ruby_helmet.png')).not.toEqual(
      helmetTexture,
    );

    // One undo step reverts the elements.
    expect(session.undo()).toBe(true);
    expect(element(session, 'demo:ruby_hoe')).toBeDefined();
    expect(element(session, 'demo:ruby_boots')).toBeUndefined();
  });

  it('overwrites a kept piece when asked', async () => {
    const { session, flow } = await openProject();
    const stored = valuesOf(flow, {});
    const { bundle } = await createSet(session, flow, stored);
    session.setElementData('demo:ruby_sword', { format: 1, edited: true } as Json);
    const plan = await reopen(session, flow, stored, stored);
    expect(statusOf(plan, 'demo:ruby_sword')).toBe('keep');
    expect(creatorChanges(plan).items.some((item) => item.elementId === 'demo:ruby_sword')).toBe(
      false,
    );
    await applyCreatorPlan(
      session,
      creatorChanges(plan, new Set(['demo:ruby_sword'])),
      creatorLabel(plan, flow.title),
    );
    expect(element(session, 'demo:ruby_sword')?.data).toEqual(
      bundle.elements.find((entry) => entry.id === 'demo:ruby_sword')?.data,
    );
  });

  it('keeps an edited piece the new values no longer make unless overwritten', async () => {
    const { session, flow } = await openProject();
    const stored = valuesOf(flow, {});
    await createSet(session, flow, stored);
    session.setElementData('demo:ruby_hoe', { format: 1, edited: true } as Json);
    const next = valuesOf(flow, {
      pieces: ['sword', 'pickaxe', 'axe', 'shovel', 'helmet', 'chestplate', 'leggings', 'boots'],
    });
    const plan = await reopen(session, flow, stored, next);
    expect(statusOf(plan, 'demo:ruby_hoe')).toBe('keep-removed');
    const removing = creatorChanges(plan, new Set(['demo:ruby_hoe']));
    expect(removing.items.find((item) => item.elementId === 'demo:ruby_hoe')?.op).toBe('delete');
  });

  it('merges shared language files and tags instead of skipping them', async () => {
    const { session, flow } = await openProject();
    session.addElement({
      id: 'minecraft:swords',
      kind: 'minecraft:tag/item',
      data: { values: ['minecraft:stick'] },
    });
    const values = valuesOf(flow, {});
    const bundle = await flow.build({
      namespace: 'demo',
      projectName: 'demo',
      target: session.target,
      values,
    });
    const plan = planCreate(
      bundle,
      project(session),
      { flowId: flow.id, setId: SET_ID, values: creatorValues(values) },
      isKnownKind(session),
    );
    const entry = plan.entries.find((candidate) => candidate.key === 'minecraft:swords');
    expect(entry?.status).toBe('merge');
    expect(entry?.next).toEqual({ values: ['minecraft:stick', 'demo:ruby_sword'] });
    expect(mergeShared('minecraft:lang', { a: 'A' }, { a: 'B', b: 'C' })).toEqual({
      a: 'A',
      b: 'C',
    });
  });
});
