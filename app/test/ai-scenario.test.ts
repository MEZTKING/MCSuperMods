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
 * - "a go-kart with a speed bar on screen" (ADR 0091 D8, B430): the Car flow through
 *   `add_starter` and an `msm:hud` bar showing the vehicle's speed while driving.
 * - "a cottage with a bed and lanterns" (ADR 0101 D7, B466): the Bed and Lights flows, a carpet
 *   block written by hand and a creative tab holding the set.
 * - "a merchant who sells copper" (ADR 0101 D7, B484), on both targets: the Wandering merchant
 *   flow selling copper, then a second level of the mob's own trades written as the trade editor
 *   writes them (trade set `<id>/level_2`, tag `<id>/level_2_trades`, trades
 *   `<id>/level_2/<price>_<product>`) and the mob's `msm:trader` updated to unlock it.
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
import { builtInTargets } from '@msm/targets';
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

async function openSession(targetId?: string) {
  const fs = createMemoryFileSystem();
  const checker = await nodeMcfunctionChecker();
  const { session, platform, calls } = newSession(fs, {}, { mcfunction: checker });
  platform.exports = {
    ...platform.exports,
    runtimeJar: async () => runtimeBytes,
    geckolibJar: async () => geckolibBytes,
  };
  await session.newProject(targetId === undefined ? {} : { targetId });
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

    // The changeset: the expected elements, the starter and drawn textures, no conflicts.
    const items = changeset.items;
    expect(items.filter((item) => item.conflict !== undefined)).toEqual([]);
    const created = items.filter((item) => item.op === 'create').map((item) => item.elementId);
    expect([...created].sort()).toEqual([...RUBY_ELEMENTS].sort());
    const assets = items
      .filter((item) => item.op === 'asset')
      .map((item) => `${item.asset?.namespace}:${item.asset?.path}`);
    expect([...assets].sort()).toEqual([...RUBY_ASSETS].sort());
    // The two create_texture pictures.
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
            text: 'The poison dart is ready to review. The texture is drawn for you; redraw it any time.',
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
            text: 'The maple wood set is ready to review. The textures are drawn for you; redraw them any time.',
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
            text: 'The pet fox is ready to review. Its skin is drawn for you; redraw it any time.',
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

/** The errors `run_checks` reported in a run, as `<element>: <message>` lines. */
function checkErrorsOf(
  record: RunRecord,
  conversation: ReturnType<typeof createConversation>,
): { errors: string[]; count: number } {
  const checkUse = conversation.messages
    .flatMap((message) =>
      message.role === 'assistant' && typeof message.content !== 'string' ? message.content : [],
    )
    .find((block) => block.type === 'tool_use' && block.name === 'run_checks');
  const checkId = checkUse?.type === 'tool_use' ? checkUse.id : '';
  const checks = JSON.parse(record.results.get(checkId)?.content ?? '{}') as {
    counts?: { error: number };
    elements?: { elementId: string; problems: { severity: string; message: string }[] }[];
  };
  return {
    errors: (checks.elements ?? []).flatMap((group) =>
      group.problems
        .filter((problem) => problem.severity === 'error')
        .map((problem) => `${group.elementId}: ${problem.message}`),
    ),
    count: checks.counts?.error ?? -1,
  };
}

/** The created elements of a changeset, by id. */
function createdOf(changeset: PendingChangeset): Map<string, Record<string, Json> | undefined> {
  return new Map(
    changeset.items
      .filter((item) => item.op === 'create')
      .map((item) => [String(item.elementId), item.after as Record<string, Json> | undefined]),
  );
}

/** A plain one-item build script: plan, the proposals, run_checks, checkpoint and a summary. */
function buildScript(
  plan: ProposePlanInput,
  proposals: { name: string; input: Record<string, Json> }[],
  summary: string,
): AiModelScript {
  return aiModelScriptSchema.parse({
    turns: [
      { content: [{ type: 'tool_use', name: 'propose_plan', input: plan }] },
      {
        content: proposals.map((proposal) => ({
          type: 'tool_use',
          name: proposal.name,
          input: proposal.input,
        })),
      },
      { content: [{ type: 'tool_use', name: 'run_checks', input: { scope: 'all' } }] },
      {
        content: [
          {
            type: 'tool_use',
            name: 'checkpoint',
            input: {
              completedItemIds: plan.items.map((item) => item.itemId),
              summary: 'Every plan item is proposed and the checks report no errors.',
            },
          },
        ],
      },
      { content: [{ type: 'text', text: summary }] },
    ],
  }) as AiModelScript;
}

/** The go-kart (ADR 0091 D8, brief B430): the Car flow and a speed bar while driving. */
const KART_PROMPT = 'a go-kart with a speed bar on screen';

const KART_HUD: Record<string, Json> = {
  format: 1,
  type: 'bar',
  anchor: 'above_hotbar',
  value: { source: 'vehicle', stat: 'speed' },
  max: 12,
  show: 'driving',
  vehicle: 'karts:go_kart',
  fill_color: '#e04020',
};

const kartScript = (): AiModelScript =>
  buildScript(
    {
      title: 'Go-kart',
      items: [
        {
          itemId: 'kart',
          kind: 'msm:vehicle',
          elementId: 'karts:go_kart',
          summary: 'The Car flow as a one-seat go-kart with a horn and no boot.',
        },
        {
          itemId: 'speed',
          kind: 'msm:hud',
          elementId: 'karts:speed_bar',
          summary: 'A bar above the hotbar showing the kart speed while driving it.',
          dependsOn: ['kart'],
        },
      ],
    },
    [
      {
        name: 'add_starter',
        input: {
          starterId: 'vehicle-car',
          namespace: 'karts',
          values: { car_name: 'Go Kart', seats: 1, speed: 12, boot: false, horn: true },
        },
      },
      {
        name: 'create_elements',
        input: { elements: [{ id: 'karts:speed_bar', kind: 'msm:hud', data: KART_HUD }] },
      },
    ],
    'The go-kart and its speed bar are ready to review. The texture is drawn for you; redraw it any time; vehicles and HUD elements need the Fabric mod jar and a game restart.',
  );

describe('AI helper scenario: the go-kart with a speed bar (build mode)', () => {
  it('builds the Car flow and a HUD bar with no errors, applies in one step and exports', async () => {
    const { session } = await openSession();
    const before = session.snapshot.project;
    const changeset = new PendingChangeset();
    const client = new ScriptedModelClient(kartScript());
    const conversation = createConversation('conversation-6', 'claude-opus-5-5');

    const { result, record } = await run(session, changeset, client, conversation, {
      mode: 'build',
      text: KART_PROMPT,
    });
    expect(result.reason).toBe('end_turn');
    expect(client.remaining).toBe(0);
    expect(record.checkpoints).toBe(1);
    expect(
      [...record.results.entries()]
        .filter(([, answer]) => answer.isError)
        .map(([id, answer]) => `${id}: ${answer.content}`),
    ).toEqual([]);

    // The model was told about vehicles and the HUD.
    const system = JSON.stringify(client.requests[0]?.system);
    expect(system).toContain('msm:vehicle');
    expect(system).toContain('not with show_action_bar');

    // One seat, 12 blocks a second, a horn and no boot; the bar reads the kart's speed.
    expect(changeset.items.filter((item) => item.conflict !== undefined)).toEqual([]);
    const created = createdOf(changeset);
    const kart = created.get('karts:go_kart');
    if (kart === undefined) throw new Error('no go-kart');
    expect((kart.seats as Json[]).length).toBe(1);
    expect((kart.movement as Record<string, Json>).max_speed).toBe(0.6);
    expect((kart.engine as Record<string, Json>).horn).toBeDefined();
    expect(kart.storage).toBeUndefined();
    expect(created.get('karts:speed_bar')).toEqual(KART_HUD);

    const checks = checkErrorsOf(record, conversation);
    expect(checks.errors).toEqual([]);
    expect(checks.count).toBe(0);
    expectAppendOnly(client);

    // One undo step, no blocking problems, and the content jar holds both definitions.
    const applied = await session.applyChangeset(changeset.items);
    expect(applied.skipped).toEqual([]);
    expect(session.snapshot.undoLabel).toBe(APPLY_CHANGESET_LABEL);
    await session.flushValidation();
    expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    const built = await session.buildContentJar({ [SEPARATE_RUNTIME_OPTION]: true });
    expect(built.report.ok, JSON.stringify(built.report.problems)).toBe(true);
    if (built.data === undefined) throw new Error('no jar');
    const entries = unzipSync(built.data);
    const decode = (path: string): Json =>
      JSON.parse(new TextDecoder().decode(entries[path])) as Json;
    expect((decode('msm/karts/hud/speed_bar.json') as Record<string, Json>).value).toEqual({
      source: 'vehicle',
      stat: 'speed',
    });
    expect((decode('msm/karts/vehicle/go_kart.json') as Record<string, Json>).movement).toEqual(
      kart.movement,
    );
    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
  });
});

/** The cottage (ADR 0101 D7, brief B466): the Bed and Lights flows, a rug and a tab. */
const COTTAGE_PROMPT = 'a cottage with a bed and lanterns';

const COTTAGE_RUG: Record<string, Json> = {
  format: 1,
  type: 'carpet',
  display_name: 'Cottage Rug',
  sound_type: 'wool',
  loot: 'self',
  textures: { all: 'minecraft:block/green_wool' },
  item: { creative_tab: 'cottage:cottage' },
  components: { 'msm:breakable': { hardness: 0.1, resistance: 0.1 } },
};

const COTTAGE_TAB: Record<string, Json> = {
  format: 1,
  icon: 'cottage:cottage_bed',
  display_name: 'Cottage',
  order: 'by_name',
};

const cottageScript = (): AiModelScript =>
  buildScript(
    {
      title: 'Cottage',
      items: [
        {
          itemId: 'bed',
          kind: 'msm:block',
          elementId: 'cottage:cottage_bed',
          summary: 'The Bed flow: a green bed that sets your spawn, with its recipe.',
        },
        {
          itemId: 'lanterns',
          kind: 'msm:block',
          elementId: 'cottage:cottage_lantern',
          summary: 'The Lights flow with only the lantern.',
        },
        {
          itemId: 'rug',
          kind: 'msm:block',
          elementId: 'cottage:cottage_rug',
          summary: 'A green carpet for the floor.',
        },
        {
          itemId: 'tab',
          kind: 'msm:creative_tab',
          elementId: 'cottage:cottage',
          summary: 'A creative tab with the bed as its icon.',
          dependsOn: ['bed'],
        },
      ],
    },
    [
      {
        name: 'add_starter',
        input: {
          starterId: 'bed',
          namespace: 'cottage',
          values: { bed_name: 'Cottage', kind: 'bed', colour: 'green' },
        },
      },
      {
        name: 'add_starter',
        input: {
          starterId: 'lights',
          namespace: 'cottage',
          values: { light_name: 'Cottage', members: ['lantern'] },
        },
      },
      {
        name: 'create_elements',
        input: {
          elements: [
            { id: 'cottage:cottage_rug', kind: 'msm:block', data: COTTAGE_RUG },
            { id: 'cottage:cottage', kind: 'msm:creative_tab', data: COTTAGE_TAB },
          ],
        },
      },
    ],
    'The cottage bed, lantern, rug and tab are ready to review. The pictures are drawn for you; redraw them any time; new blocks and the tab need the Fabric mod jar.',
  );

describe('AI helper scenario: the cottage with a bed and lanterns (build mode)', () => {
  it('builds the Bed and Lights flows, a carpet and a tab with no errors and exports', async () => {
    const { session } = await openSession();
    const before = session.snapshot.project;
    const changeset = new PendingChangeset();
    const client = new ScriptedModelClient(cottageScript());
    const conversation = createConversation('conversation-7', 'claude-opus-5-5');

    const { result, record } = await run(session, changeset, client, conversation, {
      mode: 'build',
      text: COTTAGE_PROMPT,
    });
    expect(result.reason).toBe('end_turn');
    expect(client.remaining).toBe(0);
    expect(record.checkpoints).toBe(1);
    expect(
      [...record.results.entries()]
        .filter(([, answer]) => answer.isError)
        .map(([id, answer]) => `${id}: ${answer.content}`),
    ).toEqual([]);
    expect(JSON.stringify(client.requests[0]?.system)).toContain('Vanilla block types');

    // The flows made a bed and only the lantern; the second mod element was not proposed again.
    const created = createdOf(changeset);
    expect(created.get('cottage:cottage_bed')?.type).toBe('bed');
    expect(created.get('cottage:cottage_lantern')?.type).toBe('lantern');
    expect(created.has('cottage:cottage_torch')).toBe(false);
    expect(created.has('cottage:cottage_chain')).toBe(false);
    expect(created.get('cottage:cottage_rug')).toEqual(COTTAGE_RUG);
    expect(created.get('cottage:cottage')).toEqual(COTTAGE_TAB);
    expect([...created.values()].filter((data) => data?.mod_id !== undefined)).toHaveLength(1);

    const checks = checkErrorsOf(record, conversation);
    expect(checks.errors).toEqual([]);
    expect(checks.count).toBe(0);
    expectAppendOnly(client);

    // One undo step, no blocking problems, and the content jar holds the tab and the bed.
    const applied = await session.applyChangeset(changeset.items);
    expect(applied.skipped).toEqual([]);
    expect(session.snapshot.undoLabel).toBe(APPLY_CHANGESET_LABEL);
    await session.flushValidation();
    expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    const built = await session.buildContentJar({ [SEPARATE_RUNTIME_OPTION]: true });
    expect(built.report.ok, JSON.stringify(built.report.problems)).toBe(true);
    if (built.data === undefined) throw new Error('no jar');
    const entries = unzipSync(built.data);
    const decode = (path: string): Record<string, Json> =>
      JSON.parse(new TextDecoder().decode(entries[path])) as Record<string, Json>;
    expect(decode('msm/cottage/creative_tab/cottage.json').icon).toBe('cottage:cottage_bed');
    const bedPath = Object.keys(entries).find((path) =>
      path.endsWith('cottage/block/cottage_bed.json'),
    );
    expect(decode(bedPath ?? '').type).toBe('bed');
    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
  });
});

/** The merchant (ADR 0101 D7, brief B484): the Wandering merchant flow and a level of trades. */
const MERCHANT_PROMPT = 'a merchant who sells copper';

const MERCHANT_ID = 'copper:copper_merchant';

/** The flow's answers: copper ingots and a copper block, without the wandering trader's wares. */
const MERCHANT_FLOW = {
  starterId: 'wandering-merchant',
  namespace: 'copper',
  values: {
    merchant_name: 'Copper Merchant',
    ware_1: 'minecraft:copper_ingot',
    ware_1_count: 4,
    ware_1_emeralds: 1,
    ware_2: 'minecraft:copper_block',
    ware_2_count: 1,
    ware_2_emeralds: 3,
    ware_3: '',
    vanilla_wares: false,
  },
} satisfies Record<string, Json>;

/** The second level as the trade editor writes it (`trade-model.ts`). */
const LEVEL_2 = {
  set: `${MERCHANT_ID}/level_2`,
  tag: `${MERCHANT_ID}/level_2_trades`,
  rod: `${MERCHANT_ID}/level_2/emerald_lightning_rod`,
  spyglass: `${MERCHANT_ID}/level_2/emerald_spyglass`,
};

const LEVEL_2_ELEMENTS: { id: string; kind: string; data: Json }[] = [
  {
    id: LEVEL_2.rod,
    kind: 'minecraft:villager_trade',
    data: {
      wants: { id: 'minecraft:emerald', count: 2 },
      gives: { id: 'minecraft:lightning_rod', count: 1 },
      max_uses: 12,
      xp: 5,
      reputation_discount: 0.05,
    },
  },
  {
    id: LEVEL_2.spyglass,
    kind: 'minecraft:villager_trade',
    data: {
      wants: { id: 'minecraft:emerald', count: 6 },
      gives: { id: 'minecraft:spyglass', count: 1 },
      max_uses: 4,
      xp: 10,
      reputation_discount: 0.05,
    },
  },
  {
    id: LEVEL_2.tag,
    kind: 'minecraft:tag/villager_trade',
    data: { values: [LEVEL_2.rod, LEVEL_2.spyglass] },
  },
  {
    id: LEVEL_2.set,
    kind: 'minecraft:trade_set',
    data: { trades: `#${LEVEL_2.tag}`, amount: 2 },
  },
];

/**
 * The merchant's data as the flow proposes it, read through the real executor (a model reads it
 * from the add_starter result before it updates the mob).
 */
async function flowMerchantData(targetId: string): Promise<Record<string, Json>> {
  const { session } = await openSession(targetId);
  const changeset = new PendingChangeset();
  const execute = createToolExecutor(session, changeset, {
    proposePlan: async (plan) => ({ decision: 'build_all', items: plan.items, comments: '' }),
    checkpoint: async () => 'continue',
  });
  const answer = await execute(
    { requestId: 'r1', toolUseId: 'toolu_flow', name: 'add_starter', input: MERCHANT_FLOW },
    new AbortController().signal,
  );
  expect(answer.isError, answer.content).toBe(false);
  const data = createdOf(changeset).get(MERCHANT_ID);
  if (data === undefined) throw new Error('the flow made no merchant');
  return data;
}

/** The mob with a second level of its own trades after the flow's wares. */
function withSecondLevel(mob: Record<string, Json>): Record<string, Json> {
  const components = mob.components as Record<string, Record<string, Json>>;
  const trader = components['msm:trader'] as Record<string, Json>;
  return {
    ...mob,
    components: {
      ...components,
      'msm:trader': {
        ...trader,
        trade_sets: [...(trader.trade_sets as Json[]), { trade_set: LEVEL_2.set }],
      },
    },
  };
}

const merchantScript = (mob: Record<string, Json>): AiModelScript =>
  buildScript(
    {
      title: 'Copper merchant',
      items: [
        {
          itemId: 'merchant',
          kind: 'msm:entity',
          elementId: MERCHANT_ID,
          summary: 'The Wandering merchant flow selling copper ingots and copper blocks.',
        },
        {
          itemId: 'level_2',
          kind: 'minecraft:trade_set',
          elementId: LEVEL_2.set,
          summary: 'A second level of its own trades: a lightning rod and a spyglass.',
          dependsOn: ['merchant'],
        },
      ],
    },
    [
      { name: 'add_starter', input: MERCHANT_FLOW },
      { name: 'create_elements', input: { elements: LEVEL_2_ELEMENTS } },
      { name: 'update_element', input: { id: MERCHANT_ID, data: mob } },
    ],
    'The copper merchant is ready to review: it sells copper ingots and copper blocks for emeralds, and once players have traded with it a lightning rod and a spyglass. The pictures are drawn for you; redraw them any time; the merchant needs the Fabric mod jar.',
  );

describe('AI helper scenario: a merchant who sells copper (build mode)', () => {
  for (const bundle of builtInTargets) {
    const targetId = bundle.target.id;
    it(`builds the Wandering merchant flow and a level of trades with zero problems on ${targetId}`, async () => {
      const mob = withSecondLevel(await flowMerchantData(targetId));
      const { session } = await openSession(targetId);
      expect(session.target.id).toBe(targetId);
      const before = session.snapshot.project;
      const changeset = new PendingChangeset();
      const client = new ScriptedModelClient(merchantScript(mob));
      const conversation = createConversation('conversation-8', 'claude-opus-5-5');

      const { result, record } = await run(session, changeset, client, conversation, {
        mode: 'build',
        text: MERCHANT_PROMPT,
      });
      expect(result.reason).toBe('end_turn');
      expect(client.remaining).toBe(0);
      expect(record.checkpoints).toBe(1);
      expect(
        [...record.results.entries()]
          .filter(([, answer]) => answer.isError)
          .map(([id, answer]) => `${id}: ${answer.content}`),
      ).toEqual([]);
      const system = JSON.stringify(client.requests[0]?.system);
      expect(system).toContain('msm:trader');
      expect(system).toContain('<id>/level_<n>_trades');

      // The flow's wares at level 1, the trade editor's layout at level 2.
      expect(changeset.items.filter((item) => item.conflict !== undefined)).toEqual([]);
      const created = createdOf(changeset);
      expect(created.get(`${MERCHANT_ID}/wares`)).toEqual({
        trades: [`${MERCHANT_ID}/ware_1`, `${MERCHANT_ID}/ware_2`],
        amount: 2,
      });
      expect(created.get(`${MERCHANT_ID}/ware_1`)?.gives).toMatchObject({
        id: 'minecraft:copper_ingot',
        count: 4,
      });
      for (const entry of LEVEL_2_ELEMENTS) expect(created.get(entry.id)).toEqual(entry.data);
      const update = changeset.items.find(
        (item) => item.op === 'update' && item.elementId === MERCHANT_ID,
      );
      const merged = (update?.after ?? created.get(MERCHANT_ID)) as Record<string, Json>;
      expect(
        (merged.components as Record<string, Record<string, Json>>)['msm:trader']?.trade_sets,
      ).toEqual([{ trade_set: `${MERCHANT_ID}/wares` }, { trade_set: LEVEL_2.set }]);

      const checks = checkErrorsOf(record, conversation);
      expect(checks.errors).toEqual([]);
      expect(checks.count).toBe(0);
      expectAppendOnly(client);

      // One undo step, no problems at all, and the content jar holds the trader and its trades.
      const applied = await session.applyChangeset(changeset.items);
      expect(applied.skipped).toEqual([]);
      expect(session.snapshot.undoLabel).toBe(APPLY_CHANGESET_LABEL);
      await session.flushValidation();
      expect(
        session.snapshot.problems.map(
          (problem) =>
            `${problem.severity} ${problem.code} ${problem.elementId}: ${problem.message}`,
        ),
      ).toEqual([]);
      const built = await session.buildContentJar({ [SEPARATE_RUNTIME_OPTION]: true });
      expect(built.report.ok, JSON.stringify(built.report.problems)).toBe(true);
      if (built.data === undefined) throw new Error('no jar');
      const entries = unzipSync(built.data);
      const decode = (path: string): Record<string, Json> =>
        JSON.parse(new TextDecoder().decode(entries[path])) as Record<string, Json>;
      const entityPath = Object.keys(entries).find((path) =>
        path.endsWith('copper/entity/copper_merchant.json'),
      );
      const trader = (decode(entityPath ?? '').components as Record<string, Record<string, Json>>)[
        'msm:trader'
      ];
      expect(trader?.trade_sets).toEqual([
        { trade_set: `${MERCHANT_ID}/wares` },
        { trade_set: LEVEL_2.set },
      ]);
      expect(decode('data/copper/trade_set/copper_merchant/level_2.json')).toEqual({
        trades: `#${LEVEL_2.tag}`,
        amount: 2,
      });
      expect(decode('data/copper/tags/villager_trade/copper_merchant/level_2_trades.json')).toEqual(
        { values: [LEVEL_2.rod, LEVEL_2.spyglass] },
      );
      expect(
        decode('data/copper/villager_trade/copper_merchant/level_2/emerald_spyglass.json').gives,
      ).toEqual({ id: 'minecraft:spyglass', count: 1 });
      expect(session.undo()).toBe(true);
      expect(session.snapshot.project).toEqual(before);
    });
  }
});

/**
 * The cave garden (ADRs 0103 to 0105, brief B522): the Cave plants and Flower pot flows, a chest
 * for every player and rules for vanilla blocks from their templates, on both targets.
 */
const GARDEN_PROMPT = 'a cave garden with glowing vines, a pot of my own and a private chest';

const GARDEN_VINES = {
  starterId: 'cave-plants',
  namespace: 'garden',
  values: { plant_name: 'Glow Vine', kind: 'cave_vine' },
} satisfies Record<string, Json>;

const GARDEN_POT = {
  starterId: 'flower-pot',
  namespace: 'garden',
  values: { pot_name: 'Clay Planter' },
} satisfies Record<string, Json>;

/** A template's data for `id`, read through the real executor as a model would. */
async function gardenTemplateData(
  targetId: string,
  templateId: string,
  id: string,
): Promise<Record<string, Json>> {
  const { session } = await openSession(targetId);
  const execute = createToolExecutor(session, new PendingChangeset(), {
    proposePlan: async (plan) => ({ decision: 'build_all', items: plan.items, comments: '' }),
    checkpoint: async () => 'continue',
  });
  const answer = await execute(
    {
      requestId: 'r1',
      toolUseId: 'toolu_template',
      name: 'template_data',
      input: { templateId, id },
    },
    new AbortController().signal,
  );
  expect(answer.isError, answer.content).toBe(false);
  return (JSON.parse(answer.content) as { data: Record<string, Json> }).data;
}

const gardenScript = (chest: Record<string, Json>, rules: Record<string, Json>): AiModelScript =>
  buildScript(
    {
      title: 'Cave garden',
      items: [
        {
          itemId: 'vines',
          kind: 'msm:block',
          elementId: 'garden:glow_vine',
          summary: 'The Cave plants flow: a vine with glowing berries.',
        },
        {
          itemId: 'pot',
          kind: 'msm:block',
          elementId: 'garden:clay_planter',
          summary: 'The Flower pot flow: a pot of its own for the flowers picked.',
        },
        {
          itemId: 'chest',
          kind: 'msm:block',
          elementId: 'garden:private_chest',
          summary: 'A chest in which every player finds their own items.',
        },
        {
          itemId: 'rules',
          kind: 'msm:vanilla_block_rules',
          elementId: 'garden:farm_rules',
          summary: 'Tools and fire on a few vanilla blocks.',
        },
      ],
    },
    [
      { name: 'add_starter', input: GARDEN_VINES },
      { name: 'add_starter', input: GARDEN_POT },
      {
        name: 'create_elements',
        input: {
          elements: [
            { id: 'garden:private_chest', kind: 'msm:block', data: chest },
            { id: 'garden:farm_rules', kind: 'msm:vanilla_block_rules', data: rules },
          ],
        },
      },
    ],
    'The cave garden is ready to review: glowing vines, a clay planter for your flowers, a chest that is different for every player and rules for a few vanilla blocks. They need the Fabric mod jar, and a pot takes only the plants it lists.',
  );

describe('AI helper scenario: a cave garden (build mode)', () => {
  for (const bundle of builtInTargets) {
    const targetId = bundle.target.id;
    it(`builds the Cave plants and Flower pot flows, a private chest and vanilla block rules with no errors on ${targetId}`, async () => {
      const chest = await gardenTemplateData(
        targetId,
        'msm_block_player_chest',
        'garden:private_chest',
      );
      const rules = await gardenTemplateData(
        targetId,
        'msm_vanilla_block_rules',
        'garden:farm_rules',
      );
      const { session } = await openSession(targetId);
      const before = session.snapshot.project;
      const changeset = new PendingChangeset();
      const client = new ScriptedModelClient(gardenScript(chest, rules));
      const conversation = createConversation('conversation-9', 'claude-opus-5-5');

      const { result, record } = await run(session, changeset, client, conversation, {
        mode: 'build',
        text: GARDEN_PROMPT,
      });
      expect(result.reason).toBe('end_turn');
      expect(client.remaining).toBe(0);
      expect(record.checkpoints).toBe(1);
      expect(
        [...record.results.entries()]
          .filter(([, answer]) => answer.isError)
          .map(([id, answer]) => `${id}: ${answer.content}`),
      ).toEqual([]);
      const system = JSON.stringify(client.requests[0]?.system);
      expect(system).toContain('growing_plant');
      expect(system).toContain('msm:vanilla_block_rules');

      const created = createdOf(changeset);
      expect(created.get('garden:glow_vine')?.type).toBe('growing_plant');
      expect(created.get('garden:clay_planter')?.type).toBe('flower_pot');
      const chestComponents = (created.get('garden:private_chest')?.components ?? {}) as Record<
        string,
        Json
      >;
      const container = (chestComponents['msm:container'] ?? {}) as Record<string, Json>;
      expect(container.per_player).toBe(true);
      expect([...created.values()].filter((data) => data?.mod_id !== undefined)).toHaveLength(1);

      const checks = checkErrorsOf(record, conversation);
      expect(checks.errors).toEqual([]);
      expect(checks.count).toBe(0);
      expectAppendOnly(client);

      // One undo step, no blocking problems, and the content jar holds the vine and the rules.
      const applied = await session.applyChangeset(changeset.items);
      expect(applied.skipped).toEqual([]);
      expect(session.snapshot.undoLabel).toBe(APPLY_CHANGESET_LABEL);
      await session.flushValidation();
      expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual(
        [],
      );
      const built = await session.buildContentJar({ [SEPARATE_RUNTIME_OPTION]: true });
      expect(built.report.ok, JSON.stringify(built.report.problems)).toBe(true);
      if (built.data === undefined) throw new Error('no jar');
      const entries = unzipSync(built.data);
      const paths = Object.keys(entries);
      expect(paths.some((path) => path.endsWith('garden/block/glow_vine.json'))).toBe(true);
      expect(paths).toContain('msm/garden/vanilla_block_rules/farm_rules.json');
      expect(session.undo()).toBe(true);
      expect(session.snapshot.project).toEqual(before);
    });
  }
});
