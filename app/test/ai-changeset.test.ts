import {
  CommandStack,
  commands,
  createElement,
  createEmptyProject,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import { describe, expect, it } from 'vitest';
import {
  bundleToNewItems,
  type ChangeItem,
  itemConflict,
  PendingChangeset,
  planChangeItems,
} from '../src/renderer/src/changeset/changeset';

const now = () => '2026-01-01T00:00:00.000Z';

function element(id: string, kind: string, data: Json) {
  return createElement({ id: id as ResourceLocation, kind, data, now });
}

/** A frozen project: namespace `demo` with a model and a recipe referencing it. */
function baseProject(): Project {
  const project = createEmptyProject('Demo', { targets: ['mc-26.3'] });
  project.namespaces.push({
    name: 'demo',
    elements: [
      element('demo:item/ruby', 'minecraft:model', { parent: 'minecraft:item/generated' }),
      element('demo:ruby_block', 'minecraft:recipe', { type: 'minecraft:crafting_shapeless' }),
    ],
    assets: [],
  });
  return new CommandStack(project).state;
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('PendingChangeset', () => {
  it('builds a scratch project equal to the hand-built result, without touching the input', () => {
    const project = baseProject();
    const changeset = new PendingChangeset();
    changeset.add(
      { op: 'create', elementId: 'other:thing', kind: 'minecraft:model', after: { parent: 'x' } },
      {
        op: 'update',
        elementId: 'demo:ruby_block',
        kind: 'minecraft:recipe',
        before: { type: 'minecraft:crafting_shapeless' },
        after: { type: 'minecraft:crafting_shaped' },
      },
      {
        op: 'delete',
        elementId: 'demo:item/ruby',
        kind: 'minecraft:model',
        before: { parent: 'minecraft:item/generated' },
      },
      { op: 'asset', asset: { namespace: 'demo', path: 'textures/item/ruby.png', bytes: png } },
    );
    const scratch = changeset.scratchProject(project, { now });

    const hand = new CommandStack(project);
    hand.execute(commands.addNamespace('other'));
    hand.execute(commands.addElement(element('other:thing', 'minecraft:model', { parent: 'x' })));
    hand.execute(commands.setElementData('demo:ruby_block', { type: 'minecraft:crafting_shaped' }));
    hand.execute(commands.removeElement('demo:item/ruby'));
    hand.execute(
      commands.addAsset('demo', { path: 'textures/item/ruby.png', mediaType: 'image/png' }),
    );
    expect(scratch).toEqual(hand.state);
    expect(project.namespaces).toHaveLength(1);
    expect(project.namespaces[0]?.elements).toHaveLength(2);
  });

  it('evaluates items in order: a rename then an update of the new id', () => {
    const project = baseProject();
    const changeset = new PendingChangeset();
    changeset.add(
      {
        op: 'rename',
        elementId: 'demo:item/gem',
        kind: 'minecraft:model',
        from: 'demo:item/ruby',
        to: 'demo:item/gem',
        before: { parent: 'minecraft:item/generated' },
      },
      {
        op: 'update',
        elementId: 'demo:item/gem',
        kind: 'minecraft:model',
        before: { parent: 'minecraft:item/generated' },
        after: { parent: 'minecraft:item/handheld' },
      },
    );
    const plan = changeset.plan(project);
    expect(plan.skipped).toEqual([]);
    const ids = plan.state.namespaces[0]?.elements.map((entry) => entry.id);
    expect(ids).toEqual(['demo:item/gem', 'demo:ruby_block']);
    expect(plan.state.namespaces[0]?.elements[0]?.data).toEqual({ parent: 'minecraft:item/handheld' });
    // Replaying the commands on the input gives the same state.
    const replay = new CommandStack(project);
    replay.execute({
      id: 'test.replay',
      label: 'replay',
      apply(draft) {
        for (const command of plan.commands) command.apply(draft);
      },
    });
    expect(replay.state).toEqual(plan.state);
  });

  it('reports conflicts and skips them', () => {
    const project = baseProject();
    const changeset = new PendingChangeset();
    const [create, update, del, rename, asset] = changeset.add(
      { op: 'create', elementId: 'demo:ruby_block', kind: 'minecraft:recipe', after: {} },
      {
        op: 'update',
        elementId: 'demo:ruby_block',
        kind: 'minecraft:recipe',
        before: { type: 'something else' },
        after: {},
      },
      { op: 'delete', elementId: 'demo:missing', kind: 'minecraft:model', before: {} },
      {
        op: 'rename',
        elementId: 'demo:ruby_block',
        kind: 'minecraft:model',
        from: 'demo:item/ruby',
        to: 'demo:ruby_block',
        before: { parent: 'minecraft:item/generated' },
      },
      { op: 'asset', asset: { namespace: 'demo', path: 'textures/a.png', bytes: png } },
    ) as ChangeItem[];
    const exists = { assetExists: (_ns: string, path: string) => path === 'textures/a.png' };
    const found = changeset.conflicts(project, exists);
    expect(found.map((entry) => entry.itemId)).toEqual([
      create?.itemId,
      update?.itemId,
      del?.itemId,
      rename?.itemId,
      asset?.itemId,
    ]);
    expect(found[0]?.reason).toBe('An element demo:ruby_block already exists.');
    expect(found[1]?.reason).toBe('demo:ruby_block was changed after this was proposed.');
    expect(found[2]?.reason).toBe('demo:missing no longer exists.');
    expect(changeset.scratchProject(project, exists)).toEqual(project);

    changeset.markConflicts(project);
    expect(changeset.get(create?.itemId ?? '')?.conflict).toBe(
      'An element demo:ruby_block already exists.',
    );
    // Without the file check, the asset fits; it has no conflict note.
    expect(changeset.get(asset?.itemId ?? '')?.conflict).toBeUndefined();
    changeset.remove(create?.itemId ?? '');
    changeset.markConflicts(project);
    expect(changeset.items.every((item) => item.itemId !== create?.itemId)).toBe(true);
  });

  it('a rejected item is left out, and an item depending on it conflicts', () => {
    const project = baseProject();
    const changeset = new PendingChangeset();
    const [created] = changeset.add(
      { op: 'create', elementId: 'demo:new', kind: 'minecraft:model', after: { parent: 'a' } },
      {
        op: 'update',
        elementId: 'demo:new',
        kind: 'minecraft:model',
        before: { parent: 'a' },
        after: { parent: 'b' },
      },
    );
    expect(changeset.conflicts(project)).toEqual([]);
    changeset.setAccepted(created?.itemId ?? '', false);
    expect(changeset.get(created?.itemId ?? '')?.accepted).toBe(false);
    const plan = changeset.plan(project);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    changeset.setAccepted(created?.itemId ?? '', true);
    expect(changeset.plan(project).applied).toHaveLength(2);
  });

  it('merges an update into a pending create or update and drops a create on delete', () => {
    const project = baseProject();
    const changeset = new PendingChangeset();
    const [create] = changeset.add({
      op: 'create',
      elementId: 'demo:new',
      kind: 'minecraft:model',
      after: { parent: 'a' },
    });
    const merged = changeset.proposeUpdate('demo:new', 'minecraft:model', { parent: 'a' }, { parent: 'b' });
    expect(merged.itemId).toBe(create?.itemId);
    expect(merged.op).toBe('create');
    expect(changeset.items).toHaveLength(1);

    const update = changeset.proposeUpdate(
      'demo:ruby_block',
      'minecraft:recipe',
      { type: 'minecraft:crafting_shapeless' },
      { type: 'one' },
    );
    const again = changeset.proposeUpdate('demo:ruby_block', 'minecraft:recipe', { type: 'one' }, { type: 'two' });
    expect(again.itemId).toBe(update.itemId);
    expect(again.before).toEqual({ type: 'minecraft:crafting_shapeless' });
    expect(again.after).toEqual({ type: 'two' });

    const deleted = changeset.proposeDelete('demo:ruby_block', 'minecraft:recipe', { type: 'two' });
    expect(deleted?.itemId).toBe(update.itemId);
    expect(deleted?.op).toBe('delete');
    expect(deleted?.before).toEqual({ type: 'minecraft:crafting_shapeless' });
    expect(changeset.proposeDelete('demo:new', 'minecraft:model', { parent: 'b' })).toBeUndefined();
    expect(changeset.items.map((item) => item.op)).toEqual(['delete']);
    expect(changeset.plan(project).applied).toHaveLength(1);
  });

  it('summarises per operation and kind, and notifies subscribers', () => {
    const changeset = new PendingChangeset();
    const seen: number[] = [];
    const stop = changeset.subscribe((items) => seen.push(items.length));
    expect(changeset.summary().text).toBe('');
    const [first] = changeset.add(
      { op: 'create', elementId: 'demo:a', kind: 'msm:block', after: {} },
      { op: 'create', elementId: 'demo:b', kind: 'minecraft:recipe', after: {} },
      { op: 'asset', asset: { namespace: 'demo', path: 'textures/a.png', bytes: png } },
    );
    changeset.setAccepted(first?.itemId ?? '', false);
    const summary = changeset.summary();
    expect(summary.total).toBe(3);
    expect(summary.accepted).toBe(2);
    expect(summary.byOp).toEqual({ create: 2, update: 0, delete: 0, rename: 0, asset: 1 });
    expect(summary.byKind).toEqual({ 'minecraft:recipe': 1, 'msm:block': 1 });
    expect(summary.text).toBe(
      '3 proposed changes (2 accepted): 2 create, 1 asset; kinds: minecraft:recipe 1, msm:block 1.',
    );
    changeset.clear();
    stop();
    changeset.add({ op: 'create', elementId: 'demo:c', kind: 'msm:block', after: {} });
    expect(seen).toEqual([3, 3, 0]);
  });

  it('turns a bundle into items, reporting what the project already has', () => {
    const project = baseProject();
    const result = bundleToNewItems(
      {
        elements: [
          { id: 'demo:item/ruby', kind: 'minecraft:model', data: {} },
          { id: 'demo:new', kind: 'minecraft:model', data: { parent: 'a' }, notes: 'Hi', tags: ['x'] },
        ],
        assets: [{ namespace: 'demo', path: 'textures/item/new.png', bytes: png }],
      },
      project,
      (kind) => kind === 'minecraft:model',
      { creator: { flowId: 'flow', setId: 'set', values: {}, generatedId: 'demo:new' } },
    );
    expect(result.conflicts).toEqual(['demo:item/ruby']);
    expect(result.items).toEqual([
      {
        op: 'create',
        elementId: 'demo:new',
        kind: 'minecraft:model',
        after: { parent: 'a' },
        meta: { creator: { flowId: 'flow', setId: 'set', values: {}, generatedId: 'demo:new' }, notes: 'Hi', tags: ['x'] },
      },
      { op: 'asset', asset: { namespace: 'demo', path: 'textures/item/new.png', bytes: png } },
    ]);
    expect(() =>
      bundleToNewItems({ elements: [{ id: 'demo:x', kind: 'nope:kind', data: {} }], assets: [] }, project, () => false),
    ).toThrow(/Unknown element kind/);
  });

  it('itemConflict and planChangeItems accept plain unfrozen projects', () => {
    const project = createEmptyProject('Plain');
    const item: ChangeItem = {
      itemId: 'one',
      op: 'create',
      elementId: 'demo:a',
      kind: 'minecraft:model',
      after: {},
      accepted: true,
      problems: [],
    };
    expect(itemConflict(project, item)).toBeUndefined();
    const plan = planChangeItems(project, [item]);
    expect(plan.applied).toEqual(['one']);
    expect(Object.isFrozen(project)).toBe(false);
    expect(project.namespaces).toEqual([]);
  });
});
