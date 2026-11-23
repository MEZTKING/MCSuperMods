import { readFileSync } from 'node:fs';
import {
  type AiModelScript,
  aiModelScriptSchema,
  createConversation,
  DEFAULT_AI_SETTINGS,
  DEFAULT_LIMITS,
  runAssistant,
  ScriptedModelClient,
} from '@msm/ai';
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
import { createToolExecutor } from '../src/renderer/src/ai/tool-executor';
import {
  bundleToNewItems,
  type ChangeItem,
  itemConflict,
  PendingChangeset,
  planChangeItems,
} from '../src/renderer/src/changeset/changeset';
import {
  changesSomething,
  fileWords,
  keptState,
  notAddedWords,
  proposalThings,
  reviewCounts,
  thingsOf,
} from '../src/renderer/src/components/ai/proposal-things';
import { newSession, nodeMcfunctionChecker } from './session-fixture';

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
    expect(plan.state.namespaces[0]?.elements[0]?.data).toEqual({
      parent: 'minecraft:item/handheld',
    });
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
    const merged = changeset.proposeUpdate(
      'demo:new',
      'minecraft:model',
      { parent: 'a' },
      { parent: 'b' },
    );
    expect(merged.itemId).toBe(create?.itemId);
    expect(merged.op).toBe('create');
    expect(changeset.items).toHaveLength(1);

    const update = changeset.proposeUpdate(
      'demo:ruby_block',
      'minecraft:recipe',
      { type: 'minecraft:crafting_shapeless' },
      { type: 'one' },
    );
    const again = changeset.proposeUpdate(
      'demo:ruby_block',
      'minecraft:recipe',
      { type: 'one' },
      { type: 'two' },
    );
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
          {
            id: 'demo:new',
            kind: 'minecraft:model',
            data: { parent: 'a' },
            notes: 'Hi',
            tags: ['x'],
          },
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
        meta: {
          creator: { flowId: 'flow', setId: 'set', values: {}, generatedId: 'demo:new' },
          notes: 'Hi',
          tags: ['x'],
        },
      },
      { op: 'asset', asset: { namespace: 'demo', path: 'textures/item/new.png', bytes: png } },
    ]);
    expect(() =>
      bundleToNewItems(
        { elements: [{ id: 'demo:x', kind: 'nope:kind', data: {} }], assets: [] },
        project,
        () => false,
      ),
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

/** The ruby tools scenario's changeset (`fixtures/ai/ruby-tools.script.json`), as the helper proposes it. */
async function rubyToolsItems(): Promise<readonly ChangeItem[]> {
  const { createMemoryFileSystem } = await import('@msm/core');
  const { session } = newSession(
    createMemoryFileSystem(),
    {},
    { mcfunction: await nodeMcfunctionChecker() },
  );
  await session.newProject({});
  await session.schemas();
  const changeset = new PendingChangeset();
  const script = aiModelScriptSchema.parse(
    JSON.parse(
      readFileSync(new URL('./fixtures/ai/ruby-tools.script.json', import.meta.url), 'utf8'),
    ),
  ) as AiModelScript;
  const conversation = createConversation('c', 'claude-opus-5-5');
  const execute = createToolExecutor(session, changeset, {
    proposePlan: async (plan) => ({ decision: 'build_all', items: plan.items, comments: '' }),
    checkpoint: async () => 'continue',
  });
  const result = await runAssistant({
    client: new ScriptedModelClient(script),
    conversation,
    request: {
      runId: 'r',
      conversationId: 'c',
      mode: 'build',
      text: 'ruby tools',
      contextBlocks: [],
    },
    settings: structuredClone(DEFAULT_AI_SETTINGS) as typeof DEFAULT_AI_SETTINGS,
    limits: { ...DEFAULT_LIMITS.build },
    host: { executeTool: (request, signal) => execute(request, signal), emit: () => {} },
    signal: new AbortController().signal,
  });
  expect(result.reason).toBe('end_turn');
  return changeset.items;
}

describe('proposal things (B688)', () => {
  it('groups the ruby tools mod into the ore, the block, the gem, the three tools and the mob', async () => {
    const items = await rubyToolsItems();
    const things = proposalThings(items);
    // The ore set is one thing, as on Home's My things, its block of ruby first and the ore and
    // the gem named on it; the sword, pickaxe, axe and the mob set are things of their own.
    expect(
      things.map((thing) => ({
        id: thing.id,
        name: thing.name,
        what: thing.what,
        parts: thing.parts,
      })),
    ).toEqual([
      {
        id: 'ruby:ruby_block',
        name: 'Ruby',
        what: 'Block',
        parts: expect.arrayContaining(['Ruby Ore', 'Ruby']) as unknown as string[],
      },
      { id: 'ruby:ruby_sword', name: 'Ruby Sword', what: 'Item', parts: [] },
      { id: 'ruby:ruby_golem', name: 'Ruby Golem', what: 'Mob', parts: [] },
      { id: 'ruby:ruby_pickaxe', name: 'Ruby Pickaxe', what: 'Item', parts: [] },
      { id: 'ruby:ruby_axe', name: 'Ruby Axe', what: 'Item', parts: [] },
    ]);
    const ore = things[0];
    const names = (ore?.items ?? []).map((item) => item.elementId);
    for (const id of ['ruby:ruby_ore', 'ruby:ruby_block', 'ruby:ruby']) expect(names).toContain(id);
    // The ore, the block, the gem, the three tools and the mob are all there as things.
    const thingNames = things.flatMap((thing) => [thing.name, ...thing.parts]);
    for (const name of [
      'Ruby Ore',
      'Ruby',
      'Ruby Sword',
      'Ruby Pickaxe',
      'Ruby Axe',
      'Ruby Golem',
    ]) {
      expect(thingNames).toContain(name);
    }
    expect(ore?.parts.length).toBe(2);
    // Every other item is behind one of them: nothing left for "Other files", nothing twice.
    expect(things.some((thing) => thing.other)).toBe(false);
    const behind = things.flatMap((thing) => thing.items.map((item) => item.itemId));
    expect([...behind].sort()).toEqual(items.map((item) => item.itemId).sort());
    // Files behind the hand-written tools: picture, model and recipe, in the proposal's order;
    // the loose loot table is
    // behind the block of ruby that names it.
    const pickaxe = things.find((thing) => thing.id === 'ruby:ruby_pickaxe');
    expect(pickaxe?.items.map(fileWords)).toEqual([
      'Item: Ruby pickaxe',
      'Picture: Ruby pickaxe',
      'Model: Ruby pickaxe',
      'Recipe: Ruby pickaxe from rubies',
    ]);
    expect(ore?.items.map((item) => item.elementId)).toContain('ruby:blocks/ruby_block');
    // Each thing has its picture from the proposal.
    for (const thing of things) expect(thing.picture, thing.name).toBeInstanceOf(Uint8Array);
    expect(thingsOf(items).map((thing) => thing.name)).toEqual(things.map((thing) => thing.name));
    expect(reviewCounts(things, items)).toEqual({
      things: 5,
      files: items.length - 5,
      kept: items.length,
      total: items.length,
    });
    expect(changesSomething(items)).toBe(false);
  });

  it('puts unnamed files in Other files, the mod settings behind the first thing', () => {
    const item = (itemId: string, extra: Partial<ChangeItem>): ChangeItem => ({
      itemId,
      op: 'create',
      accepted: true,
      problems: [],
      ...extra,
    });
    const items = [
      item('a', { elementId: 'demo:mod' as ResourceLocation, kind: 'msm:mod', after: {} }),
      item('b', {
        elementId: 'demo:gem' as ResourceLocation,
        kind: 'msm:item',
        after: { display_name: 'Gem' },
      }),
      item('c', {
        elementId: 'demo:greet' as ResourceLocation,
        kind: 'minecraft:function',
        op: 'update',
        before: 'say hi',
        after: 'say hello',
      }),
    ];
    const things = proposalThings(items);
    expect(things.map((thing) => [thing.name, thing.items.map((entry) => entry.itemId)])).toEqual([
      ['Gem', ['b', 'a']],
      ['Other files', ['c']],
    ]);
    expect(things[1]?.other).toBe(true);
    expect(things[1]?.op).toBe('changed');
    expect(changesSomething(items)).toBe(true);
    expect(keptState(things[0] as (typeof things)[number])).toBe('all');
    const unticked = items.map((entry) =>
      entry.itemId === 'a' ? { ...entry, accepted: false } : entry,
    );
    expect(keptState(proposalThings(unticked)[0] as (typeof things)[number])).toBe('mixed');
    expect(reviewCounts(proposalThings(unticked), unticked)).toEqual({
      things: 1,
      files: 0,
      kept: 2,
      total: 3,
    });
  });

  it('says why an item was not added, with no id outside Advanced', () => {
    const conflicted: ChangeItem = {
      itemId: 'x',
      op: 'create',
      elementId: 'demo:gem' as ResourceLocation,
      kind: 'msm:item',
      after: {},
      accepted: true,
      problems: [],
      conflict: 'An element demo:gem already exists.',
    };
    expect(notAddedWords(conflicted, 'very-easy')).toBe(
      'Not added: your mod already has one with this name.',
    );
    expect(notAddedWords(conflicted, 'advanced')).toBe(
      'Not added: An element demo:gem already exists.',
    );
    const { conflict: _conflict, ...fitting } = conflicted;
    expect(notAddedWords(fitting, 'easy')).toBeUndefined();
  });
});
