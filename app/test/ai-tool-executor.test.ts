import type { AiToolResult, CheckpointInput, PlanDecision, ProposePlanInput } from '@msm/ai';
import { createMemoryFileSystem, type Json, type Project } from '@msm/core';
import { describe, expect, it } from 'vitest';
import { createToolExecutor, type DecisionHost } from '../src/renderer/src/ai/tool-executor';
import { PendingChangeset } from '../src/renderer/src/changeset/changeset';
import { newSession } from './session-fixture';

interface Fixture {
  session: Awaited<ReturnType<typeof setup>>['session'];
  changeset: PendingChangeset;
  call(
    name: string,
    input?: unknown,
    signal?: AbortSignal,
    // biome-ignore lint/suspicious/noExplicitAny: tool results are parsed JSON, read loosely in tests
  ): Promise<{ result: AiToolResult; value: any }>;
  plans: ProposePlanInput[];
  checkpoints: CheckpointInput[];
}

async function setup(decisions?: Partial<DecisionHost>) {
  const fs = createMemoryFileSystem();
  const { session } = newSession(fs);
  await session.newProject();
  session.addElement({ id: 'demo:greet', kind: 'minecraft:function', data: { lines: ['say hi'] } });
  session.addElement({
    id: 'minecraft:load',
    kind: 'minecraft:tag/function',
    data: { values: ['demo:greet'] },
  });
  await session.schemas();
  await session.flushValidation();
  const changeset = new PendingChangeset();
  const plans: ProposePlanInput[] = [];
  const checkpoints: CheckpointInput[] = [];
  const host: DecisionHost = {
    proposePlan: async (plan) => {
      plans.push(plan);
      return { decision: 'build_all', items: plan.items, comments: '' };
    },
    checkpoint: async (input) => {
      checkpoints.push(input);
      return 'continue';
    },
    ...decisions,
  };
  const execute = createToolExecutor(session, changeset, host);
  let next = 0;
  const call: Fixture['call'] = async (name, input = {}, signal = new AbortController().signal) => {
    next += 1;
    const result = await execute(
      { requestId: `r${next}`, toolUseId: `toolu_${next}`, name, input },
      signal,
    );
    expect(result.requestId).toBe(`r${next}`);
    return { result, value: JSON.parse(result.content) };
  };
  return { session, changeset, call, plans, checkpoints };
}

async function expectError(
  fixture: Pick<Fixture, 'call'>,
  name: string,
  input: unknown,
  code: string,
  // biome-ignore lint/suspicious/noExplicitAny: tool results are parsed JSON, read loosely in tests
): Promise<any> {
  const { result, value } = await fixture.call(name, input);
  expect(result.isError, result.content).toBe(true);
  expect(value.error.code, result.content).toBe(code);
  return value;
}

const blockData = (session: Fixture['session']) => session.kindDefault('msm:block') as Json;

describe('createToolExecutor: read tools', () => {
  it('project_summary reports the target, namespaces, counts and pending changes', async () => {
    const fixture = await setup();
    let { value } = await fixture.call('project_summary');
    expect(value.targetId).toBe(fixture.session.target.id);
    expect(value.mcVersion).toBe(fixture.session.target.mcVersion);
    expect(value.namespaces).toEqual(['demo', 'minecraft']);
    expect(value.kindCounts['minecraft:function']).toBe(1);
    expect(value.hasModElement).toBe(false);
    expect(value.pendingSummary).toBe('');
    await fixture.call('create_elements', {
      elements: [{ id: 'demo:other', kind: 'minecraft:function', data: { lines: [] } }],
    });
    ({ value } = await fixture.call('project_summary'));
    expect(value.pending.byOp.create).toBe(1);
    expect(value.pendingSummary).toMatch(/^1 proposed change/);
    expect(value.kindCounts['minecraft:function']).toBe(1);
  });

  it('list_kinds lists every kind with its category and whether it goes into the mod jar', async () => {
    const fixture = await setup();
    const { value } = await fixture.call('list_kinds');
    const block = value.items.find((item: { id: string }) => item.id === 'msm:block');
    expect(block).toMatchObject({
      category: 'blocks-items',
      fabricJar: true,
      exportsTo: 'fabric-mod-jar',
    });
    const model = value.items.find((item: { id: string }) => item.id === 'minecraft:model');
    expect(model).toMatchObject({
      category: 'resourcepack',
      fabricJar: false,
      exportsTo: 'resource-pack',
    });
    expect(value.items.length).toBe(fixture.session.registry.all().length);
  });

  it('kind_schema renders a bounded schema; unknown kinds are errors', async () => {
    const fixture = await setup();
    const { result, value } = await fixture.call('kind_schema', { kind: 'msm:block' });
    expect(result.isError).toBe(false);
    expect(value.schema).toContain('display_name');
    expect(value.schema.length).toBeLessThanOrEqual(12_200);
    const recipe = await fixture.call('kind_schema', { kind: 'minecraft:recipe' });
    expect(recipe.value.schema).toMatch(/crafting_shaped/);
    await expectError(fixture, 'kind_schema', { kind: 'nope:kind' }, 'unknown_kind');
  });

  it('list_elements pages and filters the project with pending changes applied', async () => {
    const fixture = await setup();
    await fixture.call('create_elements', {
      elements: [{ id: 'demo:proposed', kind: 'minecraft:function', data: { lines: [] } }],
    });
    let { value } = await fixture.call('list_elements', { namespace: 'demo' });
    expect(value.items.map((item: { id: string }) => item.id)).toEqual([
      'demo:greet',
      'demo:pack',
      'demo:proposed',
    ]);
    expect(value.items[2]).toMatchObject({ pending: 'create', kind: 'minecraft:function' });
    expect(value.nextCursor).toBeUndefined();
    ({ value } = await fixture.call('list_elements', { filter: 'GREET' }));
    expect(value.items.map((item: { id: string }) => item.id)).toEqual(['demo:greet']);
    ({ value } = await fixture.call('list_elements', { kind: 'minecraft:tag/function' }));
    expect(value.items).toHaveLength(1);
    await expectError(fixture, 'list_elements', { cursor: 'abc' }, 'invalid_input');

    for (let index = 0; index < 4; index += 1) {
      const elements = Array.from({ length: 60 }, (_, at) => ({
        id: `demo:f${index}_${at}`,
        kind: 'minecraft:function',
        data: { lines: [] },
      }));
      await fixture.call('create_elements', { elements });
    }
    ({ value } = await fixture.call('list_elements', { kind: 'minecraft:function' }));
    expect(value.items).toHaveLength(200);
    expect(value.nextCursor).toBe('200');
    ({ value } = await fixture.call('list_elements', {
      kind: 'minecraft:function',
      cursor: value.nextCursor,
    }));
    expect(value.items).toHaveLength(42);
  });

  it('read_element returns data and problems, marks pending elements and truncates large data', async () => {
    const fixture = await setup();
    let { value } = await fixture.call('read_element', { id: 'demo:greet' });
    expect(value).toMatchObject({
      id: 'demo:greet',
      kind: 'minecraft:function',
      data: { lines: ['say hi'] },
    });
    expect(value.problems).toEqual([]);
    await expectError(fixture, 'read_element', { id: 'demo:none' }, 'not_found');
    await fixture.call('update_element', { id: 'demo:greet', data: { lines: ['say updated'] } });
    ({ value } = await fixture.call('read_element', { id: 'demo:greet' }));
    expect(value.data).toEqual({ lines: ['say updated'] });
    expect(value.pending).toBe('update');

    fixture.session.setElementData('demo:greet', { lines: ['x'.repeat(70_000)] });
    fixture.changeset.clear();
    ({ value } = await fixture.call('read_element', { id: 'demo:greet' }));
    expect(value.truncated).toBe(true);
    expect(value.data).toBeUndefined();
    expect(value.dataText.length).toBe(64 * 1024);
    expect(value.note).toMatch(/only the first 65536/);
  });

  it('list_problems reports the live problems with filters', async () => {
    const fixture = await setup();
    fixture.session.addElement({
      id: 'demo:bad',
      kind: 'minecraft:function',
      data: { lines: 5 } as Json,
    });
    await fixture.session.flushValidation();
    let { value } = await fixture.call('list_problems', { elementId: 'demo:bad' });
    expect(value.items.length).toBeGreaterThan(0);
    expect(value.items[0]).toMatchObject({ elementId: 'demo:bad', severity: 'error' });
    ({ value } = await fixture.call('list_problems', { severity: 'info', elementId: 'demo:bad' }));
    expect(value.items).toEqual([]);
  });

  it('list_templates and template_data use the library templates and the session target', async () => {
    const fixture = await setup();
    let { value } = await fixture.call('list_templates', { kind: 'minecraft:recipe' });
    expect(value.items.length).toBeGreaterThan(0);
    expect(value.items.every((item: { kind: string }) => item.kind === 'minecraft:recipe')).toBe(
      true,
    );
    const template = value.items[0];
    ({ value } = await fixture.call('template_data', {
      templateId: template.id,
      id: 'demo:my_recipe',
    }));
    expect(value.kind).toBe('minecraft:recipe');
    expect(typeof value.data).toBe('object');
    const created = await fixture.call('create_elements', {
      elements: [{ id: 'demo:my_recipe', kind: 'minecraft:recipe', data: value.data }],
    });
    expect(created.result.isError, created.result.content).toBe(false);
    await expectError(
      fixture,
      'template_data',
      { templateId: 'nope', id: 'demo:x' },
      'unknown_template',
    );
  });

  it('list_starters lists parameters, defaults and support on the target', async () => {
    const fixture = await setup();
    const { value } = await fixture.call('list_starters');
    const ore = value.items.find((item: { id: string }) => item.id === 'custom_ore');
    expect(ore.supported).toBe(true);
    expect(ore.requiresKinds).toContain('msm:block');
    expect(ore.parameters.map((parameter: { id: string }) => parameter.id)).toContain('ore_name');
    expect(
      ore.parameters.find((parameter: { id: string }) => parameter.id === 'ore_name').default,
    ).toBe('Ruby');
  });

  it('target_facts, script_api_typings and pending_changes', async () => {
    const fixture = await setup();
    let { value } = await fixture.call('target_facts');
    expect(value.id).toBe(fixture.session.target.id);
    expect(value.packFormats).toEqual(fixture.session.target.packFormats);
    expect(value.registries).toContain('item');
    expect(value.mcdocRef).toBeUndefined();
    ({ value } = await fixture.call('script_api_typings'));
    expect(value.typings).toBe(fixture.session.scriptTypings);
    await fixture.call('create_texture', { namespace: 'demo', path: 'item/ruby', pattern: 'gem' });
    ({ value } = await fixture.call('pending_changes'));
    expect(value.items).toEqual([
      {
        itemId: 'item-1',
        op: 'asset',
        asset: 'assets/demo/textures/item/ruby.png',
        accepted: true,
        problems: [],
      },
    ]);
  });
});

describe('createToolExecutor: proposals', () => {
  it('create_elements adds valid elements and rejects the rest with reasons', async () => {
    const fixture = await setup();
    const { result, value } = await fixture.call('create_elements', {
      elements: [
        { id: 'demo:ruby_ore', kind: 'msm:block', data: blockData(fixture.session) },
        { id: 'demo:x', kind: 'nope:kind', data: {} },
        { id: 'msm:thing', kind: 'minecraft:function', data: { lines: [] } },
        { id: 'minecraft:ruby', kind: 'msm:block', data: blockData(fixture.session) },
        { id: 'minecraft:tick', kind: 'minecraft:tag/function', data: { values: ['demo:greet'] } },
        { id: 'demo:greet', kind: 'minecraft:function', data: { lines: [] } },
        { id: 'demo:twice', kind: 'minecraft:function', data: { lines: [] } },
        { id: 'demo:twice', kind: 'minecraft:function', data: { lines: [] } },
        { id: 'demo:noise', kind: 'minecraft:sounds', data: {} },
        { id: 'demo:broken', kind: 'minecraft:function', data: { lines: 5 } },
      ],
    });
    expect(result.isError).toBe(true);
    expect(value.error.code).toBe('rejected');
    const codes = value.results.map(
      (entry: { added?: boolean; error?: { code: string } }) =>
        entry.error?.code ?? (entry.added ? 'added' : '?'),
    );
    expect(codes).toEqual([
      'added',
      'unknown_kind',
      'reserved_namespace',
      'reserved_namespace',
      'added',
      'duplicate_id',
      'added',
      'duplicate_id',
      'invalid_id',
      'schema_errors',
    ]);
    expect(value.results[9].problems.length).toBeGreaterThan(0);
    expect(value.added).toBe(3);
    expect(fixture.changeset.items.map((item) => item.elementId)).toEqual([
      'demo:ruby_ore',
      'minecraft:tick',
      'demo:twice',
    ]);
    // A second call with the same id now collides with the pending change.
    await fixture
      .call('create_elements', {
        elements: [{ id: 'demo:ruby_ore', kind: 'msm:block', data: blockData(fixture.session) }],
      })
      .then(({ value: again }) => expect(again.results[0].error.code).toBe('duplicate_id'));
  });

  it('create_elements resolves references between elements of one batch', async () => {
    const fixture = await setup();
    const { result, value } = await fixture.call('create_elements', {
      elements: [
        { id: 'demo:a', kind: 'minecraft:function', data: { lines: [] } },
        { id: 'demo:batch', kind: 'minecraft:tag/function', data: { values: ['demo:a'] } },
      ],
    });
    expect(result.isError, result.content).toBe(false);
    expect(value.results[1].notes).toBeUndefined();
  });

  it('update_element validates, records before and after, and merges into pending items', async () => {
    const fixture = await setup();
    let { result, value } = await fixture.call('update_element', {
      id: 'demo:greet',
      data: { lines: ['say new'] },
    });
    expect(result.isError).toBe(false);
    expect(value.op).toBe('update');
    expect(fixture.changeset.items[0]).toMatchObject({
      op: 'update',
      before: { lines: ['say hi'] },
      after: { lines: ['say new'] },
    });
    await expectError(fixture, 'update_element', { id: 'demo:none', data: {} }, 'not_found');
    value = await expectError(
      fixture,
      'update_element',
      { id: 'demo:greet', data: { lines: 5 } },
      'schema_errors',
    );
    expect(value.error.problems.length).toBeGreaterThan(0);

    await fixture.call('create_elements', {
      elements: [{ id: 'demo:fresh', kind: 'minecraft:function', data: { lines: [] } }],
    });
    ({ result, value } = await fixture.call('update_element', {
      id: 'demo:fresh',
      data: { lines: ['say x'] },
    }));
    expect(value.op).toBe('create');
    expect(fixture.changeset.items).toHaveLength(2);
  });

  it('delete_element lists the elements that reference it', async () => {
    const fixture = await setup();
    const { value } = await fixture.call('delete_element', { id: 'demo:greet' });
    expect(value.referencedBy).toEqual(['minecraft:load']);
    expect(fixture.changeset.items[0]).toMatchObject({
      op: 'delete',
      before: { lines: ['say hi'] },
    });
    await expectError(fixture, 'delete_element', { id: 'demo:greet' }, 'not_found');
    await fixture.call('create_elements', {
      elements: [{ id: 'demo:temp', kind: 'minecraft:function', data: { lines: [] } }],
    });
    const dropped = await fixture.call('delete_element', { id: 'demo:temp' });
    expect(dropped.value.droppedPendingCreate).toBe(true);
    expect(fixture.changeset.items).toHaveLength(1);
  });

  it('rename_element records the ids and lists the references that would change', async () => {
    const fixture = await setup();
    const { value } = await fixture.call('rename_element', {
      from: 'demo:greet',
      to: 'demo:hello',
    });
    expect(value.references).toEqual([{ elementId: 'minecraft:load', path: '/values/0' }]);
    expect(fixture.changeset.items[0]).toMatchObject({
      op: 'rename',
      from: 'demo:greet',
      to: 'demo:hello',
      elementId: 'demo:hello',
    });
    // The scratch project has the rename and the rewritten reference.
    const load = await fixture.call('read_element', { id: 'minecraft:load' });
    expect(load.value.data).toEqual({ values: ['demo:hello'] });
    await expectError(fixture, 'rename_element', { from: 'demo:greet', to: 'demo:x' }, 'not_found');
    await expectError(
      fixture,
      'rename_element',
      { from: 'demo:hello', to: 'demo:pack' },
      'duplicate_id',
    );
    await expectError(
      fixture,
      'rename_element',
      { from: 'demo:hello', to: 'msm:hello' },
      'reserved_namespace',
    );
  });

  it('create_texture proposes a placeholder PNG under textures/', async () => {
    const fixture = await setup();
    const { value } = await fixture.call('create_texture', {
      namespace: 'demo',
      path: 'block/ruby_ore',
      pattern: 'ore',
      colour: '#d0103a',
    });
    expect(value).toMatchObject({
      file: 'assets/demo/textures/block/ruby_ore.png',
      textureId: 'demo:block/ruby_ore',
    });
    const asset = fixture.changeset.items[0]?.asset;
    expect(asset?.path).toBe('textures/block/ruby_ore.png');
    expect([...(asset?.bytes.slice(0, 4) ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    await expectError(
      fixture,
      'create_texture',
      { namespace: 'demo', path: 'block/ruby_ore', pattern: 'ore' },
      'duplicate_asset',
    );
    await expectError(
      fixture,
      'create_texture',
      { namespace: 'demo', path: 'block/../../x', pattern: 'ore' },
      'invalid_texture_path',
    );
    await expectError(
      fixture,
      'create_texture',
      { namespace: 'minecraft', path: 'block/stone', pattern: 'plain' },
      'reserved_namespace',
    );
    await expectError(
      fixture,
      'create_texture',
      { namespace: 'demo', path: 'block/x', pattern: 'stripes' },
      'invalid_input',
    );
  });

  it('add_starter turns the Custom ore starter into items, with alternative values', async () => {
    const fixture = await setup();
    const { result, value } = await fixture.call('add_starter', {
      starterId: 'custom_ore',
      namespace: 'demo',
      values: { ore_name: 'Sapphire', colour: '#2050d0', make_block: false, drop_max: 4 },
    });
    expect(result.isError, result.content).toBe(false);
    expect(value.created).toContain('demo:sapphire_ore');
    expect(value.created).toContain('demo:sapphire');
    expect(value.created).not.toContain('demo:sapphire_block');
    expect(value.created).toContain('demo:mod');
    expect(value.conflicts).toEqual(['demo:pack']);
    expect(value.assets.length).toBeGreaterThan(0);
    expect(value.itemIds).toHaveLength(value.created.length + value.assets.length);
    const loot = fixture.changeset.items.find((item) => item.kind === 'minecraft:loot_table');
    expect(JSON.stringify(loot?.after)).toContain('"max":4');
    const summary = await fixture.call('project_summary');
    expect(summary.value.pending.byKind['msm:block']).toBe(1);

    const invalid = await expectError(
      fixture,
      'add_starter',
      {
        starterId: 'custom_ore',
        namespace: 'demo',
        values: { drop_min: 99, nope: 1, make_block: 'yes' },
      },
      'invalid_values',
    );
    expect(
      invalid.error.values.map((entry: { parameter: string }) => entry.parameter).sort(),
    ).toEqual(['drop_min', 'make_block', 'nope']);
    await expectError(
      fixture,
      'add_starter',
      { starterId: 'nope', namespace: 'demo' },
      'unknown_starter',
    );
    await expectError(
      fixture,
      'add_starter',
      { starterId: 'custom_ore', namespace: 'minecraft' },
      'reserved_namespace',
    );
  });

  it('add_starter in another namespace keeps the single pack.mcmeta and mod metadata of the project', async () => {
    const fixture = await setup();
    const first = await fixture.call('add_starter', { starterId: 'custom_ore', namespace: 'ruby' });
    expect(first.value.created).toContain('ruby:mod');
    expect(first.value.created).not.toContain('ruby:pack');
    expect(first.value.conflicts).toEqual(['ruby:pack']);
    const second = await fixture.call('add_starter', {
      starterId: 'custom-sword',
      namespace: 'gems',
    });
    expect(second.result.isError, second.result.content).toBe(false);
    expect([...second.value.conflicts].sort()).toEqual(['gems:mod', 'gems:pack']);
    const kinds = fixture.changeset.items.map((item) => item.kind);
    expect(kinds.filter((kind) => kind === 'msm:mod')).toHaveLength(1);
    expect(kinds).not.toContain('minecraft:pack_mcmeta');
  });

  it('add_starter stamps meta.creator on the create items of a Creator flow (B192)', async () => {
    const fixture = await setup();
    const flow = await fixture.call('add_starter', {
      starterId: 'custom_ore',
      namespace: 'demo',
      values: { ore_name: 'Sapphire' },
    });
    expect(flow.result.isError, flow.result.content).toBe(false);
    const creates = fixture.changeset.items.filter((item) => item.op === 'create');
    expect(creates.length).toBeGreaterThan(0);
    const setIds = new Set(creates.map((item) => item.meta?.creator?.setId));
    expect(setIds.size).toBe(1);
    expect([...setIds][0]).toMatch(/^[0-9a-f-]{36}$/);
    for (const item of creates) {
      expect(item.meta?.creator).toMatchObject({
        flowId: 'custom_ore',
        generatedId: item.elementId,
      });
      expect(item.meta?.creator?.values.ore_name).toBe('Sapphire');
    }
    expect(
      fixture.changeset.items
        .filter((item) => item.op === 'asset')
        .every((item) => item.meta?.creator === undefined),
    ).toBe(true);

    // A starter that is not a Creator flow writes no stamp.
    const before = fixture.changeset.items.length;
    const plain = await fixture.call('add_starter', {
      starterId: 'custom-sword',
      namespace: 'demo',
    });
    expect(plain.result.isError, plain.result.content).toBe(false);
    const added = fixture.changeset.items.slice(before);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((item) => item.meta?.creator === undefined)).toBe(true);
  });

  it('runs the calls of one turn one at a time, in arrival order', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    await session.newProject();
    await session.schemas();
    const changeset = new PendingChangeset();
    const execute = createToolExecutor(session, changeset, {
      proposePlan: async (plan) => ({ decision: 'build_all', items: plan.items, comments: '' }),
      checkpoint: async () => 'continue',
    });
    const signal = new AbortController().signal;
    const request = (n: number, name: string, input: unknown) =>
      execute({ requestId: `r${n}`, toolUseId: `toolu_${n}`, name, input }, signal);
    // Started together, as the parallel tool_use blocks of one assistant turn are.
    const results = await Promise.all([
      request(1, 'add_starter', { starterId: 'custom_ore', namespace: 'ruby' }),
      request(2, 'add_starter', { starterId: 'custom-sword', namespace: 'ruby' }),
      request(3, 'update_element', {
        id: 'ruby:item/ruby',
        data: { parent: 'minecraft:item/handheld', textures: { layer0: 'ruby:item/ruby' } },
      }),
    ]);
    expect(results.map((result) => result.isError)).toEqual([false, false, false]);
    expect(JSON.parse(results[1]?.content ?? '{}').conflicts).toContain('ruby:mod');
    expect(changeset.items.filter((item) => item.elementId === 'ruby:mod')).toHaveLength(1);
    expect(changeset.items.find((item) => item.elementId === 'ruby:item/ruby')?.after).toEqual({
      parent: 'minecraft:item/handheld',
      textures: { layer0: 'ruby:item/ruby' },
    });
  });

  it('answers cancelled for a call still waiting behind another when the run is cancelled', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    await session.newProject();
    const changeset = new PendingChangeset();
    const abort = new AbortController();
    const execute = createToolExecutor(session, changeset, {
      proposePlan: (_plan, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
      checkpoint: async () => 'continue',
    });
    const plan = execute(
      {
        requestId: 'r1',
        toolUseId: 'toolu_1',
        name: 'propose_plan',
        input: {
          title: 'Plan',
          items: [{ itemId: 'a', kind: 'minecraft:model', elementId: 'demo:a', summary: 'A.' }],
        },
      },
      abort.signal,
    );
    const texture = execute(
      {
        requestId: 'r2',
        toolUseId: 'toolu_2',
        name: 'create_texture',
        input: { namespace: 'demo', path: 'item/a', pattern: 'gem' },
      },
      abort.signal,
    );
    abort.abort();
    const answers = await Promise.all([plan, texture]);
    expect(answers.map((answer) => JSON.parse(answer.content).error.code)).toEqual([
      'cancelled',
      'cancelled',
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(changeset.items).toEqual([]);
  });
});

describe('createToolExecutor: checks and decisions', () => {
  it('run_checks reports a schema error in a pending item and clears it after update_element', async () => {
    const fixture = await setup();
    // Items from a starter or the Creator are not checked when proposed.
    const [item] = fixture.changeset.add({
      op: 'create',
      elementId: 'demo:broken',
      kind: 'minecraft:function',
      after: { lines: 5 },
    });
    let { value } = await fixture.call('run_checks', { scope: 'pending' });
    expect(value.counts.error).toBeGreaterThan(0);
    expect(value.elements).toHaveLength(1);
    expect(value.elements[0]).toMatchObject({ elementId: 'demo:broken', itemId: item?.itemId });
    expect(fixture.changeset.get(item?.itemId ?? '')?.problems.length).toBeGreaterThan(0);

    await fixture.call('update_element', { id: 'demo:broken', data: { lines: ['say fixed'] } });
    expect(fixture.changeset.get(item?.itemId ?? '')?.problems).toEqual([]);
    ({ value } = await fixture.call('run_checks', { scope: 'pending' }));
    expect(value.counts).toEqual({ error: 0, warning: 0, info: 0 });
    expect(value.elements).toEqual([]);

    ({ value } = await fixture.call('run_checks', { scope: 'all' }));
    expect(value.scope).toBe('all');
    expect(value.counts.error).toBe(0);
  });

  it('run_checks reports conflicts of pending items', async () => {
    const fixture = await setup();
    await fixture.call('update_element', { id: 'demo:greet', data: { lines: ['say proposed'] } });
    fixture.session.setElementData('demo:greet', { lines: ['say by hand'] });
    const { value } = await fixture.call('run_checks', { scope: 'pending' });
    expect(value.conflicts).toEqual([
      { itemId: 'item-1', reason: 'demo:greet was changed after this was proposed.' },
    ]);
    expect(fixture.changeset.items[0]?.conflict).toBeDefined();
  });

  it('propose_plan and checkpoint return the decision host answers', async () => {
    const fixture = await setup({
      proposePlan: async (plan): Promise<PlanDecision> => ({
        decision: 'step',
        items: plan.items.slice(0, 1),
        comments: 'only the ore',
      }),
      checkpoint: async () => 'stop',
    });
    const plan = {
      title: 'Ruby tools',
      items: [
        { itemId: 'ore', kind: 'msm:block', elementId: 'demo:ruby_ore', summary: 'The ore.' },
        {
          itemId: 'gem',
          kind: 'msm:item',
          elementId: 'demo:ruby',
          summary: 'The gem.',
          dependsOn: ['ore'],
        },
      ],
    };
    let { result, value } = await fixture.call('propose_plan', plan);
    expect(result.isError).toBe(false);
    expect(value).toEqual({ decision: 'step', items: [plan.items[0]], comments: 'only the ore' });
    ({ value } = await fixture.call('checkpoint', {
      completedItemIds: ['ore'],
      summary: 'Built the ore.',
    }));
    expect(value).toEqual({ decision: 'stop' });
  });

  it('answers cancelled when the run is aborted, before or while a tool runs', async () => {
    let started: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fixture = await setup({
      proposePlan: () => {
        started();
        return new Promise<PlanDecision>(() => {});
      },
    });
    const aborted = new AbortController();
    aborted.abort();
    let { result, value } = await fixture.call('project_summary', {}, aborted.signal);
    expect(result.isError).toBe(true);
    expect(value.error).toEqual({ code: 'cancelled', message: 'cancelled' });

    const controller = new AbortController();
    const pending = fixture.call(
      'propose_plan',
      {
        title: 'T',
        items: [{ itemId: 'a', kind: 'msm:block', elementId: 'demo:a', summary: 'A.' }],
      },
      controller.signal,
    );
    await waiting;
    controller.abort();
    ({ result, value } = await pending);
    expect(result.isError).toBe(true);
    expect(value.error.code).toBe('cancelled');
  });

  it('answers unknown tools, invalid input and a missing project as errors', async () => {
    const fixture = await setup();
    await expectError(fixture, 'make_coffee', {}, 'unknown_tool');
    const invalid = await expectError(
      fixture,
      'read_element',
      { id: 'Not An Id' },
      'invalid_input',
    );
    expect(invalid.error.issues[0].path).toBe('id');

    const empty = newSession(createMemoryFileSystem());
    const execute = createToolExecutor(empty.session, new PendingChangeset(), {
      proposePlan: async () => ({ decision: 'build_all', items: [], comments: '' }),
      checkpoint: async () => 'continue',
    });
    const result = await execute(
      { requestId: 'x', toolUseId: 't', name: 'list_elements', input: {} },
      new AbortController().signal,
    );
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error.code).toBe('no_project');
  });

  it('never changes the project', async () => {
    const fixture = await setup();
    const before: Project | null = fixture.session.snapshot.project;
    await fixture.call('create_elements', {
      elements: [{ id: 'demo:a', kind: 'minecraft:function', data: { lines: [] } }],
    });
    await fixture.call('update_element', { id: 'demo:greet', data: { lines: ['x'] } });
    await fixture.call('rename_element', { from: 'demo:greet', to: 'demo:b' });
    await fixture.call('create_texture', { namespace: 'demo', path: 'item/a', pattern: 'gem' });
    await fixture.call('run_checks', { scope: 'all' });
    expect(fixture.session.snapshot.project).toBe(before);
  });
});

describe('createToolExecutor: note_missing_feature (ADR 0053)', () => {
  it('adds the gap to the project Wishlist once per title', async () => {
    const fixture = await setup();
    const wish = {
      title: "Set a player's velocity",
      request: 'A launcher that pushes me forward.',
      missing: 'Scripts cannot set velocity.',
      builtInstead: 'A launcher that teleports in small steps.',
    };
    const { result, value } = await fixture.call('note_missing_feature', wish);
    expect(result.isError).toBe(false);
    expect(value).toMatchObject({ noted: true, openWishes: 1 });
    await fixture.call('note_missing_feature', { ...wish, missing: 'No velocity call.' });
    const entries = await fixture.session.readWishlist();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: 'ai',
      status: 'open',
      missing: 'No velocity call.',
    });
  });
});
