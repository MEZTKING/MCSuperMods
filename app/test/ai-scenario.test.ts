/**
 * Scenario tests of the AI helper (ADR 0041 D9, brief B174): the scripted model client drives
 * `runAssistant` with the real tool executor over a session with the built-in plugins, and the
 * result is applied and exported like a user would.
 *
 * - `ruby-tools.script.json`: build mode, "make a ruby tools mod with ore, blocks, items,
 *   recipes, a mob": plan, one turn of parallel proposals, `run_checks`, `checkpoint`, summary.
 * - `explain-problem.script.json`: chat mode, a `blocks-items.unknown-event` error sent as a
 *   problem context block, answered with an `update_element` fix.
 *
 * The scripts are checked here, so stale tool inputs (a starter parameter, a kind's schema)
 * fail loudly.
 */

import { readFileSync } from 'node:fs';
import {
  type AiEvent,
  type AiModelScript,
  type AiToolResult,
  aiModelScriptSchema,
  type BetaMessageParam,
  createConversation,
  DEFAULT_AI_SETTINGS,
  DEFAULT_LIMITS,
  type ProposePlanInput,
  projectContextBlock,
  runAssistant,
  ScriptedModelClient,
} from '@msm/ai';
import { createMemoryFileSystem, type Json, type Project } from '@msm/core';
import { SEPARATE_RUNTIME_OPTION } from '@msm/exporters';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { problemContextBlock } from '../src/renderer/src/ai/context-blocks';
import { projectContextOf } from '../src/renderer/src/ai/project-context';
import { createToolExecutor, type DecisionHost } from '../src/renderer/src/ai/tool-executor';
import { PendingChangeset } from '../src/renderer/src/changeset/changeset';
import {
  APPLY_CHANGESET_LABEL,
  type ProjectSession,
} from '../src/renderer/src/session/project-session';
import { newSession, nodeMcfunctionChecker } from './session-fixture';

const RUBY_PROMPT = 'make a ruby tools mod with ore, blocks, items, recipes, a mob';

function loadScript(name: string): AiModelScript {
  const url = new URL(`./fixtures/ai/${name}`, import.meta.url);
  return aiModelScriptSchema.parse(JSON.parse(readFileSync(url, 'utf8'))) as AiModelScript;
}

const runtimeBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]);
const geckolibBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 9, 9, 9]);

async function openSession() {
  const fs = createMemoryFileSystem();
  const checker = await nodeMcfunctionChecker();
  const { session, platform, calls } = newSession(fs, {}, { mcfunction: checker });
  platform.exports = {
    ...platform.exports,
    runtimeJar: async () => runtimeBytes,
    geckolibJar: async () => geckolibBytes,
  };
  await session.newProject();
  await session.schemas();
  await session.flushValidation();
  return { session, calls, fs };
}

interface RunRecord {
  events: AiEvent[];
  plans: ProposePlanInput[];
  checkpoints: number;
  results: Map<string, AiToolResult>;
}

/** Runs one user message through `runAssistant` with the real executor. */
async function run(
  session: ProjectSession,
  changeset: PendingChangeset,
  client: ScriptedModelClient,
  conversation: ReturnType<typeof createConversation>,
  options: { mode: 'chat' | 'build'; text: string; contextBlocks?: string[] },
) {
  const record: RunRecord = { events: [], plans: [], checkpoints: 0, results: new Map() };
  const decisions: DecisionHost = {
    proposePlan: async (plan) => {
      record.plans.push(plan);
      return { decision: 'build_all', items: plan.items, comments: '' };
    },
    checkpoint: async () => {
      record.checkpoints += 1;
      return 'continue';
    },
  };
  const execute = createToolExecutor(session, changeset, decisions);
  const result = await runAssistant({
    client,
    conversation,
    request: {
      runId: 'run-1',
      conversationId: conversation.id,
      mode: options.mode,
      text: options.text,
      contextBlocks: [
        projectContextBlock(projectContextOf(session, changeset)),
        ...(options.contextBlocks ?? []),
      ],
    },
    settings: structuredClone(DEFAULT_AI_SETTINGS) as typeof DEFAULT_AI_SETTINGS,
    limits: { ...DEFAULT_LIMITS[options.mode] },
    host: {
      executeTool: async (request, signal) => {
        const answer = await execute(request, signal);
        record.results.set(request.toolUseId, answer);
        return answer;
      },
      emit: (event) => record.events.push(event),
    },
    signal: new AbortController().signal,
  });
  return { result, record };
}

/** Every `tool_result` block of a request's messages, by `tool_use_id`. */
function toolResultsOf(messages: readonly BetaMessageParam[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== 'user' || typeof message.content === 'string') continue;
    for (const block of message.content) {
      if (block.type !== 'tool_result') continue;
      out.set(block.tool_use_id, typeof block.content === 'string' ? block.content : '');
    }
  }
  return out;
}

/** Checks each request extends the one before it (append-only conversation, ADR 0041 D3). */
function expectAppendOnly(client: ScriptedModelClient): void {
  for (let i = 1; i < client.requests.length; i++) {
    const previous = client.requests[i - 1]?.messages ?? [];
    const current = client.requests[i]?.messages ?? [];
    expect(current.length).toBeGreaterThan(previous.length);
    expect(current.slice(0, previous.length)).toEqual(previous);
  }
}

const elementIds = (project: Project | null): string[] =>
  (project?.namespaces ?? []).flatMap((namespace) => namespace.elements.map((entry) => entry.id));

const RUBY_ELEMENTS = [
  // Custom ore starter (its pack.mcmeta element is dropped: the project has one).
  'ruby:mod',
  'ruby:ruby_ore',
  'ruby:blocks/ruby_ore',
  'ruby:ruby',
  'ruby:ruby_block',
  'ruby:block/ruby_ore',
  'ruby:block/ruby_block',
  'ruby:item/ruby',
  'ruby:ruby_block_from_rubies',
  'ruby:ruby_from_block',
  'ruby:ruby_from_smelting',
  'ruby:gems',
  'ruby:root',
  'ruby:get_ruby',
  // Its "World" step (generate on by default): ore feature, placed feature, biome addition.
  'ruby:ore_ruby',
  'ruby:ore_ruby_placed',
  'ruby:ruby_ore_generation',
  // Custom sword starter (pack and mod already proposed).
  'ruby:ruby_sword',
  'ruby:item/ruby_sword',
  'ruby:en_us',
  'ruby:ruby_sword_from_emerald',
  // Custom mob starter.
  'ruby:ruby_golem',
  'ruby:entity/ruby_golem',
  'ruby:entity/ruby_golem_animations',
  'ruby:entities/ruby_golem',
  'ruby:golem/death',
  // create_elements.
  'ruby:ruby_pickaxe',
  'ruby:item/ruby_pickaxe',
  'ruby:ruby_pickaxe_from_rubies',
  'ruby:ruby_axe',
  'ruby:item/ruby_axe',
  'ruby:ruby_axe_from_rubies',
  'ruby:blocks/ruby_block',
];

const RUBY_ASSETS = [
  'ruby:textures/block/ruby_ore.png',
  'ruby:textures/block/ruby_block.png',
  'ruby:textures/item/ruby.png',
  'ruby:textures/item/ruby_sword.png',
  'ruby:textures/entity/ruby_golem.png',
  'ruby:textures/item/ruby_golem_spawn_egg.png',
  'ruby:textures/item/ruby_pickaxe.png',
  'ruby:textures/item/ruby_axe.png',
];

describe('AI helper scenario: the ruby tools mod (build mode)', () => {
  it('plans, proposes in parallel, checks, applies as one undo step and exports', async () => {
    const { session, calls } = await openSession();
    const before = session.snapshot.project;
    const changeset = new PendingChangeset();
    const client = new ScriptedModelClient(loadScript('ruby-tools.script.json'));
    const conversation = createConversation('conversation-1', 'claude-opus-5-5');

    const { result, record } = await run(session, changeset, client, conversation, {
      mode: 'build',
      text: RUBY_PROMPT,
    });
    expect(result.reason).toBe('end_turn');
    expect(client.remaining).toBe(0);

    // The plan reached the user with every item.
    const planRequest = record.events.find(
      (event) => event.type === 'tool_request' && event.request.name === 'propose_plan',
    );
    expect(planRequest).toBeDefined();
    expect(record.plans).toHaveLength(1);
    expect(record.plans[0]?.items.map((item) => item.elementId)).toEqual([
      'ruby:ruby_ore',
      'ruby:ruby_sword',
      'ruby:ruby_pickaxe',
      'ruby:ruby_axe',
      'ruby:blocks/ruby_block',
      'ruby:ruby_golem',
    ]);
    expect(record.checkpoints).toBe(1);

    // Every tool succeeded.
    const failed = [...record.results.entries()].filter(([, answer]) => answer.isError);
    expect(failed.map(([id, answer]) => `${id}: ${answer.content}`)).toEqual([]);

    // The changeset: the expected elements, the starter and placeholder textures, no conflicts.
    const items = changeset.items;
    expect(items.filter((item) => item.conflict !== undefined)).toEqual([]);
    const created = items.filter((item) => item.op === 'create').map((item) => item.elementId);
    expect([...created].sort()).toEqual([...RUBY_ELEMENTS].sort());
    const assets = items
      .filter((item) => item.op === 'asset')
      .map((item) => `${item.asset?.namespace}:${item.asset?.path}`);
    expect([...assets].sort()).toEqual([...RUBY_ASSETS].sort());
    // The two create_texture placeholders.
    expect(assets).toContain('ruby:textures/item/ruby_pickaxe.png');
    expect(assets).toContain('ruby:textures/item/ruby_axe.png');
    // The starters' pack.mcmeta elements are not proposed (the project has one), nor are the
    // second and third mod metadata elements.
    const starterResults = [...record.results.values()]
      .map((answer) => JSON.parse(answer.content) as { starterId?: string; conflicts?: string[] })
      .filter((value) => value.starterId !== undefined);
    expect(
      starterResults.map((value) => [value.starterId, [...(value.conflicts ?? [])].sort()]),
    ).toEqual([
      ['custom_ore', ['ruby:pack']],
      ['custom-sword', ['ruby:mod', 'ruby:pack']],
      ['custom_mob', ['ruby:mod', 'ruby:pack']],
    ]);
    // The update of the storage block merged into the starter's pending create.
    const block = items.find((item) => item.elementId === 'ruby:ruby_block');
    expect(block?.op).toBe('create');
    expect((block?.after as Record<string, Json> | undefined)?.loot).toBe('ruby:blocks/ruby_block');

    // run_checks reported no errors (and the model received that result).
    const lastRequest = client.requests.at(-1);
    const results = toolResultsOf(lastRequest?.messages ?? []);
    const checkUse = conversation.messages
      .flatMap((message) =>
        message.role === 'assistant' && typeof message.content !== 'string' ? message.content : [],
      )
      .find((block) => block.type === 'tool_use' && block.name === 'run_checks');
    expect(checkUse?.type).toBe('tool_use');
    const checkId = checkUse?.type === 'tool_use' ? checkUse.id : '';
    const checks = JSON.parse(results.get(checkId) ?? '{}') as {
      counts: { error: number };
      elements: { elementId: string; problems: { severity: string; message: string }[] }[];
    };
    expect(
      checks.elements.flatMap((group) =>
        group.problems
          .filter((problem) => problem.severity === 'error')
          .map((problem) => `${group.elementId}: ${problem.message}`),
      ),
    ).toEqual([]);
    expect(checks.counts.error).toBe(0);

    // The model received every tool result, and the conversation only ever grew.
    const allUses = conversation.messages.flatMap((message) =>
      message.role === 'assistant' && typeof message.content !== 'string'
        ? message.content.filter((block) => block.type === 'tool_use')
        : [],
    );
    expect(allUses).toHaveLength(10);
    for (const use of allUses) {
      if (use.type !== 'tool_use') continue;
      expect(results.has(use.id), use.name).toBe(true);
      expect(results.get(use.id)).toBe(record.results.get(use.id)?.content);
    }
    expect(client.requests).toHaveLength(5);
    expectAppendOnly(client);

    // Apply: one undo step.
    const applied = await session.applyChangeset(changeset.items);
    expect(applied.skipped).toEqual([]);
    expect(applied.applied).toHaveLength(items.length);
    expect(session.snapshot.undoLabel).toBe(APPLY_CHANGESET_LABEL);
    expect([...elementIds(session.snapshot.project)]).toEqual(
      expect.arrayContaining(RUBY_ELEMENTS),
    );
    await session.flushValidation();
    expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual([]);

    // Exports: resource pack, data pack and the Fabric content jar, none blocked.
    const resource = await session.exportPack('resource', 'zip');
    expect(resource.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(resource.location).toBeDefined();
    const data = await session.exportPack('data', 'zip');
    expect(data.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(data.location).toBeDefined();
    const jar = await session.exportFabricJar({ [SEPARATE_RUNTIME_OPTION]: false });
    expect(jar.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(jar.location).toBeDefined();
    expect(calls.saved).toHaveLength(3);
    const [resourceZip, dataZip, modJar] = calls.saved.map((saved) => unzipSync(saved.data));
    expect(Object.keys(resourceZip ?? {})).toEqual(
      expect.arrayContaining([
        'assets/ruby/models/block/ruby_ore.json',
        'assets/ruby/models/item/ruby_pickaxe.json',
        'assets/ruby/textures/item/ruby_pickaxe.png',
      ]),
    );
    const lang = JSON.parse(
      new TextDecoder().decode(resourceZip?.['assets/ruby/lang/en_us.json']),
    ) as Record<string, string>;
    expect(lang['item.ruby.ruby_pickaxe']).toBe('Ruby Pickaxe');
    expect(lang['item.ruby.ruby_sword']).toBe('Ruby Sword');
    // ADR 0066: files naming the mod's items or blocks, including the ore generation's
    // worldgen files, are only in the mod jar.
    const modOnlyFiles = [
      'data/ruby/worldgen/feature/ore_ruby.json',
      'data/ruby/worldgen/placed_feature/ore_ruby_placed.json',
      'data/ruby/recipe/ruby_pickaxe_from_rubies.json',
      'data/ruby/loot_table/blocks/ruby_block.json',
    ];
    for (const path of modOnlyFiles) expect(Object.keys(dataZip ?? {})).not.toContain(path);
    const modEntries = Object.keys(modJar ?? {});
    expect(modEntries).toEqual(expect.arrayContaining(modOnlyFiles));
    expect(modEntries.some((path) => path.startsWith('msm/ruby/'))).toBe(true);
    expect(modEntries).toContain('fabric.mod.json');

    // Undo removes everything.
    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
  });
});

/** The injected error: the wand's use trigger names an event the element does not declare. */
const WAND_ID = 'msm_sample_mod:ruby_wand';

function wandData(event: string): Json {
  return {
    format: 1,
    model: 'minecraft:item/blaze_rod',
    display_name: 'Ruby Wand',
    max_stack_size: 1,
    creative_tab: 'minecraft:tools_and_utilities',
    components: {
      'msm:on_use': { cooldown_ticks: 10, event },
      'msm:durability': { max: 32 },
    },
    events: {
      'msm_sample_mod:zap': {
        actions: [
          { type: 'spawn_particle', particle: 'minecraft:electric_spark', count: 5, speed: 0.1 },
        ],
      },
    },
  };
}

describe('AI helper scenario: explain a problem (chat mode)', () => {
  it('sends the problem context, proposes an update_element fix and apply clears the problem', async () => {
    const { session } = await openSession();
    session.addElement({
      id: 'msm_sample_mod:mod',
      kind: 'msm:mod',
      data: {
        mod_id: 'msm_sample_mod',
        version: '1.0.0',
        name: 'MSM Sample Mod',
        description: 'Explain scenario.',
        authors: [],
        licence: 'MIT',
      },
    });
    session.addElement({ id: WAND_ID, kind: 'msm:item', data: wandData('msm_sample_mod:zapp') });
    await session.flushValidation();
    const problem = session.snapshot.problems.find(
      (entry) => entry.code === 'blocks-items.unknown-event',
    );
    expect(problem?.elementId).toBe(WAND_ID);
    if (problem === undefined) throw new Error('unreachable');
    const element =
      session.snapshot.project?.namespaces
        .flatMap((namespace) => namespace.elements)
        .find((entry) => entry.id === WAND_ID) ?? null;
    const context = problemContextBlock(problem, element);

    const changeset = new PendingChangeset();
    const client = new ScriptedModelClient(loadScript('explain-problem.script.json'));
    const conversation = createConversation('conversation-2', 'claude-opus-5-5');
    const { result, record } = await run(session, changeset, client, conversation, {
      mode: 'chat',
      text: 'Explain this problem and how to fix it.',
      contextBlocks: [context],
    });
    expect(result.reason).toBe('end_turn');
    expect(client.remaining).toBe(0);

    // The problem context block was sent with the user's message.
    const first = client.requests[0]?.messages[0];
    expect(first?.role).toBe('user');
    const content = first?.content;
    const texts = Array.isArray(content)
      ? content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
      : [];
    expect(texts).toContain(context);
    expect(context).toContain('blocks-items.unknown-event');

    // The fix: one update of the wand, and run_checks found no errors for it.
    expect([...record.results.values()].filter((answer) => answer.isError)).toEqual([]);
    expect(changeset.items.map((item) => [item.op, item.elementId])).toEqual([['update', WAND_ID]]);
    const results = toolResultsOf(client.requests.at(-1)?.messages ?? []);
    const checks = [...results.values()]
      .map((content) => JSON.parse(content) as { scope?: string; counts?: { error: number } })
      .find((value) => value.scope !== undefined);
    expect(checks?.counts?.error).toBe(0);
    expectAppendOnly(client);

    // Apply clears the problem.
    await session.applyChangeset(changeset.items);
    await session.flushValidation();
    expect(
      session.snapshot.problems.filter((entry) => entry.code === 'blocks-items.unknown-event'),
    ).toEqual([]);
  });
});

/** The poison dart build (ADR 0055 D11, brief B209): an `msm:effect` and an `msm:throwable` item. */
const DART_PROMPT = 'make a poison dart that poisons the mob it hits';

const dartScript = (): AiModelScript =>
  aiModelScriptSchema.parse({
    turns: [
      {
        content: [
          {
            type: 'tool_use',
            name: 'propose_plan',
            input: {
              title: 'Poison dart',
              items: [
                {
                  itemId: 'mod',
                  kind: 'msm:mod',
                  elementId: 'darts:mod',
                  summary: 'The mod metadata.',
                },
                {
                  itemId: 'venom',
                  kind: 'msm:effect',
                  elementId: 'darts:venom',
                  summary: 'A harmful effect that hurts every second.',
                  dependsOn: ['mod'],
                },
                {
                  itemId: 'dart',
                  kind: 'msm:item',
                  elementId: 'darts:poison_dart',
                  summary: 'A throwable that gives venom on hit.',
                  dependsOn: ['venom'],
                },
              ],
            },
          },
        ],
      },
      {
        content: [
          {
            type: 'tool_use',
            name: 'create_elements',
            input: {
              elements: [
                {
                  id: 'darts:mod',
                  kind: 'msm:mod',
                  data: {
                    mod_id: 'darts',
                    version: '1.0.0',
                    name: 'Darts',
                    description: 'Poison darts.',
                    authors: [],
                    licence: 'MIT',
                  },
                },
                {
                  id: 'darts:venom',
                  kind: 'msm:effect',
                  data: {
                    format: 1,
                    display_name: 'Venom',
                    category: 'harmful',
                    color: 5882118,
                    components: { 'msm:on_tick': { event: 'darts:sting', interval_ticks: 20 } },
                    events: { 'darts:sting': { actions: [{ type: 'damage', amount: 1 }] } },
                  },
                },
                {
                  id: 'darts:poison_dart',
                  kind: 'msm:item',
                  data: {
                    format: 1,
                    model: 'darts:item/poison_dart',
                    display_name: 'Poison Dart',
                    max_stack_size: 16,
                    creative_tab: 'minecraft:combat',
                    components: {
                      'msm:throwable': {
                        speed: 2,
                        damage: 2,
                        after_throw: 'consume',
                        on_hit_entity: { event: 'darts:poison' },
                      },
                    },
                    events: {
                      'darts:poison': {
                        actions: [
                          {
                            type: 'apply_effect',
                            effect: 'darts:venom',
                            seconds: 8,
                            target: 'other',
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
          {
            type: 'tool_use',
            name: 'create_texture',
            input: {
              namespace: 'darts',
              path: 'item/poison_dart',
              pattern: 'gem',
              colour: '#58b030',
            },
          },
        ],
      },
      { content: [{ type: 'tool_use', name: 'run_checks', input: { scope: 'all' } }] },
      {
        content: [
          {
            type: 'tool_use',
            name: 'checkpoint',
            input: {
              completedItemIds: ['mod', 'venom', 'dart'],
              summary: 'Every plan item is proposed and the checks report no errors.',
            },
          },
        ],
      },
      {
        content: [
          {
            type: 'text',
            text: 'The poison dart is ready to review. The texture is a placeholder to replace.',
          },
        ],
      },
    ],
  }) as AiModelScript;

describe('AI helper scenario: the poison dart (build mode)', () => {
  it('plans, proposes an effect and a throwable, checks clean and applies in one step', async () => {
    const { session } = await openSession();
    const before = session.snapshot.project;
    const changeset = new PendingChangeset();
    const client = new ScriptedModelClient(dartScript());
    const conversation = createConversation('conversation-3', 'claude-opus-5-5');

    const { result, record } = await run(session, changeset, client, conversation, {
      mode: 'build',
      text: DART_PROMPT,
    });
    expect(result.reason).toBe('end_turn');
    expect(client.remaining).toBe(0);
    expect(record.plans[0]?.items.map((item) => item.elementId)).toEqual([
      'darts:mod',
      'darts:venom',
      'darts:poison_dart',
    ]);
    expect(record.checkpoints).toBe(1);
    expect(
      [...record.results.entries()]
        .filter(([, answer]) => answer.isError)
        .map(([id, answer]) => `${id}: ${answer.content}`),
    ).toEqual([]);

    expect(changeset.items.filter((item) => item.conflict !== undefined)).toEqual([]);
    expect(
      changeset.items
        .filter((item) => item.op === 'create')
        .map((item) => item.elementId)
        .sort(),
    ).toEqual(['darts:mod', 'darts:poison_dart', 'darts:venom']);

    // run_checks reported no errors.
    const checkUse = conversation.messages
      .flatMap((message) =>
        message.role === 'assistant' && typeof message.content !== 'string' ? message.content : [],
      )
      .find((block) => block.type === 'tool_use' && block.name === 'run_checks');
    const checkId = checkUse?.type === 'tool_use' ? checkUse.id : '';
    const checks = JSON.parse(record.results.get(checkId)?.content ?? '{}') as {
      counts: { error: number };
    };
    expect(checks.counts.error).toBe(0);
    expectAppendOnly(client);

    // One undo step.
    const applied = await session.applyChangeset(changeset.items);
    expect(applied.skipped).toEqual([]);
    expect(session.snapshot.undoLabel).toBe(APPLY_CHANGESET_LABEL);
    expect([...elementIds(session.snapshot.project)]).toEqual(
      expect.arrayContaining(['darts:venom', 'darts:poison_dart']),
    );
    await session.flushValidation();
    expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
  });
});

/** The maple wood set (ADR 0069 D6, brief B279): the Wood set flow through `add_starter`. */
const MAPLE_PROMPT = 'make a maple wood set';

const mapleScript = (): AiModelScript =>
  aiModelScriptSchema.parse({
    turns: [
      {
        content: [
          {
            type: 'tool_use',
            name: 'propose_plan',
            input: {
              title: 'Maple wood set',
              items: [
                {
                  itemId: 'set',
                  kind: 'msm:block',
                  elementId: 'maple:maple_log',
                  summary: 'The Wood set flow: every member, the tree, recipes and tags.',
                },
              ],
            },
          },
        ],
      },
      {
        content: [
          {
            type: 'tool_use',
            name: 'add_starter',
            input: { starterId: 'wood-set', namespace: 'maple', values: { wood_name: 'Maple' } },
          },
        ],
      },
      { content: [{ type: 'tool_use', name: 'run_checks', input: { scope: 'all' } }] },
      {
        content: [
          {
            type: 'tool_use',
            name: 'checkpoint',
            input: {
              completedItemIds: ['set'],
              summary: 'The maple wood set is proposed and the checks report no errors.',
            },
          },
        ],
      },
      {
        content: [
          {
            type: 'text',
            text: 'The maple wood set is ready to review. The textures are placeholders to replace.',
          },
        ],
      },
    ],
  }) as AiModelScript;

describe('AI helper scenario: the maple wood set (build mode)', () => {
  it('builds the Wood set flow through add_starter with no errors and applies in one step', async () => {
    const { session } = await openSession();
    const before = session.snapshot.project;
    const changeset = new PendingChangeset();
    const client = new ScriptedModelClient(mapleScript());
    const conversation = createConversation('conversation-4', 'claude-opus-5-5');

    const { result, record } = await run(session, changeset, client, conversation, {
      mode: 'build',
      text: MAPLE_PROMPT,
    });
    expect(result.reason).toBe('end_turn');
    expect(client.remaining).toBe(0);
    expect(record.checkpoints).toBe(1);
    expect(
      [...record.results.entries()]
        .filter(([, answer]) => answer.isError)
        .map(([id, answer]) => `${id}: ${answer.content}`),
    ).toEqual([]);

    // The set's members carry their block types; ids derive from the wood name.
    expect(changeset.items.filter((item) => item.conflict !== undefined)).toEqual([]);
    const created = new Map<string, Record<string, Json> | undefined>(
      changeset.items
        .filter((item) => item.op === 'create')
        .map((item) => [String(item.elementId), item.after as Record<string, Json> | undefined]),
    );
    const types: Record<string, string> = {
      'maple:maple_log': 'pillar',
      'maple:maple_planks': 'block',
      'maple:maple_stairs': 'stairs',
      'maple:maple_slab': 'slab',
      'maple:maple_fence': 'fence',
      'maple:maple_fence_gate': 'fence_gate',
      'maple:maple_door': 'door',
      'maple:maple_trapdoor': 'trapdoor',
      'maple:maple_button': 'button',
      'maple:maple_pressure_plate': 'pressure_plate',
      'maple:maple_leaves': 'leaves',
      'maple:maple_sapling': 'sapling',
    };
    for (const [id, type] of Object.entries(types)) {
      const data = created.get(id);
      expect(data, id).toBeDefined();
      expect(data?.type ?? 'block', id).toBe(type);
    }
    expect(created.has('maple:maple_tree')).toBe(true);
    expect(changeset.items.filter((item) => item.op === 'asset').length).toBeGreaterThanOrEqual(10);

    // run_checks reported no errors.
    const checkUse = conversation.messages
      .flatMap((message) =>
        message.role === 'assistant' && typeof message.content !== 'string' ? message.content : [],
      )
      .find((block) => block.type === 'tool_use' && block.name === 'run_checks');
    const checkId = checkUse?.type === 'tool_use' ? checkUse.id : '';
    const checks = JSON.parse(record.results.get(checkId)?.content ?? '{}') as {
      counts: { error: number };
      elements: { elementId: string; problems: { severity: string; message: string }[] }[];
    };
    expect(
      checks.elements.flatMap((group) =>
        group.problems
          .filter((problem) => problem.severity === 'error')
          .map((problem) => `${group.elementId}: ${problem.message}`),
      ),
    ).toEqual([]);
    expect(checks.counts.error).toBe(0);
    expectAppendOnly(client);

    // One undo step, no blocking problems, and the Fabric mod jar is not blocked.
    const applied = await session.applyChangeset(changeset.items);
    expect(applied.skipped).toEqual([]);
    expect(session.snapshot.undoLabel).toBe(APPLY_CHANGESET_LABEL);
    expect([...elementIds(session.snapshot.project)]).toEqual(
      expect.arrayContaining(Object.keys(types)),
    );
    await session.flushValidation();
    expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    const jar = await session.exportFabricJar({ [SEPARATE_RUNTIME_OPTION]: false });
    expect(jar.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(jar.location).toBeDefined();
    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
  });
});

/** The pet fox (ADR 0073 D6, brief B304): the Pet flow through `add_starter`. */
const FOX_PROMPT = 'make a pet fox';

const foxScript = (): AiModelScript =>
  aiModelScriptSchema.parse({
    turns: [
      {
        content: [
          {
            type: 'tool_use',
            name: 'propose_plan',
            input: {
              title: 'Pet fox',
              items: [
                {
                  itemId: 'fox',
                  kind: 'msm:entity',
                  elementId: 'pets:fox',
                  summary: 'The Pet flow: a tameable, breedable fox with its model and skin.',
                },
              ],
            },
          },
        ],
      },
      {
        content: [
          {
            type: 'tool_use',
            name: 'add_starter',
            input: {
              starterId: 'pet',
              namespace: 'pets',
              values: { pet_name: 'Fox', preset: 'quadruped', taming_food: 'berries' },
            },
          },
        ],
      },
      { content: [{ type: 'tool_use', name: 'run_checks', input: { scope: 'all' } }] },
      {
        content: [
          {
            type: 'tool_use',
            name: 'checkpoint',
            input: {
              completedItemIds: ['fox'],
              summary: 'The pet fox is proposed and the checks report no errors.',
            },
          },
        ],
      },
      {
        content: [
          {
            type: 'text',
            text: 'The pet fox is ready to review. Its skin is a placeholder to replace.',
          },
        ],
      },
    ],
  }) as AiModelScript;

describe('AI helper scenario: the pet fox (build mode)', () => {
  it('builds the Pet flow through add_starter with no errors and applies in one step', async () => {
    const { session } = await openSession();
    const before = session.snapshot.project;
    const changeset = new PendingChangeset();
    const client = new ScriptedModelClient(foxScript());
    const conversation = createConversation('conversation-5', 'claude-opus-5-5');

    const { result, record } = await run(session, changeset, client, conversation, {
      mode: 'build',
      text: FOX_PROMPT,
    });
    expect(result.reason).toBe('end_turn');
    expect(client.remaining).toBe(0);
    expect(record.checkpoints).toBe(1);
    expect(
      [...record.results.entries()]
        .filter(([, answer]) => answer.isError)
        .map(([id, answer]) => `${id}: ${answer.content}`),
    ).toEqual([]);

    // The fox is an animal that tames, breeds and draws with the renderer that suits the target.
    expect(changeset.items.filter((item) => item.conflict !== undefined)).toEqual([]);
    const created = new Map<string, Record<string, Json> | undefined>(
      changeset.items
        .filter((item) => item.op === 'create')
        .map((item) => [String(item.elementId), item.after as Record<string, Json> | undefined]),
    );
    const fox = created.get('pets:fox');
    expect(fox).toBeDefined();
    expect(fox?.base).toBe('animal');
    const components = fox?.components as Record<string, Record<string, Json>>;
    expect(components['msm:tameable']?.items).toEqual([
      'minecraft:sweet_berries',
      'minecraft:glow_berries',
    ]);
    expect(components['msm:breedable']).toBeDefined();
    expect(components['msm:animated_model']?.renderer).toBe('auto');
    expect(created.has('pets:entity/fox')).toBe(true);
    expect(created.has('pets:entity/fox_animations')).toBe(true);
    expect(changeset.items.filter((item) => item.op === 'asset').length).toBeGreaterThanOrEqual(2);

    // run_checks reported no errors.
    const checkUse = conversation.messages
      .flatMap((message) =>
        message.role === 'assistant' && typeof message.content !== 'string' ? message.content : [],
      )
      .find((block) => block.type === 'tool_use' && block.name === 'run_checks');
    const checkId = checkUse?.type === 'tool_use' ? checkUse.id : '';
    const checks = JSON.parse(record.results.get(checkId)?.content ?? '{}') as {
      counts: { error: number };
      elements: { elementId: string; problems: { severity: string; message: string }[] }[];
    };
    expect(
      checks.elements.flatMap((group) =>
        group.problems
          .filter((problem) => problem.severity === 'error')
          .map((problem) => `${group.elementId}: ${problem.message}`),
      ),
    ).toEqual([]);
    expect(checks.counts.error).toBe(0);
    expectAppendOnly(client);

    // One undo step, no blocking problems, and the Fabric mod jar is not blocked.
    const applied = await session.applyChangeset(changeset.items);
    expect(applied.skipped).toEqual([]);
    expect(session.snapshot.undoLabel).toBe(APPLY_CHANGESET_LABEL);
    expect([...elementIds(session.snapshot.project)]).toEqual(
      expect.arrayContaining(['pets:fox', 'pets:entity/fox', 'pets:entity/fox_animations']),
    );
    await session.flushValidation();
    expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    const jar = await session.exportFabricJar({ [SEPARATE_RUNTIME_OPTION]: false });
    expect(jar.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(jar.location).toBeDefined();
    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
  });
});
