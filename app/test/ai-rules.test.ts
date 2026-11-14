/**
 * The AI helper and Rules (ADR 0082 D10, brief B382).
 *
 * - The catalogue ids, plain steps, cancellable triggers, caps and templates the system prompt
 *   names are pinned against `@msm/plugin-rules`, so the prompt cannot drift from the catalogue
 *   (`@msm/ai` does not depend on the plugin, so its lists are written by hand).
 * - A scripted build-mode run makes a lucky block with a rule book (a plain rule and a rule
 *   that needs the generated script) through the real tool executor; `run_checks` compiles the
 *   book with no errors, the changeset applies as one undo step, and the content jar holds the
 *   rule events and the transpiled rule script.
 */

import {
  type AiModelScript,
  type AiToolResult,
  aiModelScriptSchema,
  createConversation,
  DEFAULT_AI_SETTINGS,
  DEFAULT_LIMITS,
  projectContextBlock,
  RULES_PROMPT_CANCELLABLE,
  RULES_PROMPT_IDS,
  RULES_PROMPT_PLAIN_STEPS,
  RULES_PROMPT_TEMPLATES,
  runAssistant,
  ScriptedModelClient,
  systemPrompt,
} from '@msm/ai';
import { createMemoryFileSystem, type JsonObject } from '@msm/core';
import { SEPARATE_RUNTIME_OPTION } from '@msm/exporters';
import {
  CATALOGUE_IDS,
  MAX_DEPTH,
  MAX_EXPLOSION_POWER,
  MAX_RADIUS,
  MAX_REPEAT,
  MAX_STEPS,
  ruleEventId,
  rulesTemplates,
  STEPS,
  TRIGGERS,
} from '@msm/plugin-rules';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createScriptingService } from '../src/main/platform/scripting';
import { projectContextOf } from '../src/renderer/src/ai/project-context';
import { createToolExecutor, type DecisionHost } from '../src/renderer/src/ai/tool-executor';
import { PendingChangeset } from '../src/renderer/src/changeset/changeset';
import {
  APPLY_CHANGESET_LABEL,
  type ProjectSession,
} from '../src/renderer/src/session/project-session';
import { newSession } from './session-fixture';

describe('the system prompt names the Rules catalogue exactly (ADR 0082 D10)', () => {
  it('lists every catalogue id in the catalogue order', () => {
    expect(RULES_PROMPT_IDS).toEqual(CATALOGUE_IDS);
  });

  it('lists the plain steps and the cancellable triggers of the catalogue', () => {
    expect([...RULES_PROMPT_PLAIN_STEPS]).toEqual(
      STEPS.filter((step) => step.action !== undefined).map((step) => step.id),
    );
    expect([...RULES_PROMPT_CANCELLABLE]).toEqual(
      TRIGGERS.filter((trigger) => trigger.cancellable).map((trigger) => trigger.id),
    );
  });

  it('lists the Rules templates and states the caps', () => {
    expect([...RULES_PROMPT_TEMPLATES]).toEqual(rulesTemplates.map((template) => template.id));
    const text = systemPrompt('build');
    expect(text).toContain(`at most ${MAX_DEPTH} levels deep`);
    expect(text).toContain(`at most ${MAX_STEPS} steps`);
    expect(text).toContain(`at most ${MAX_REPEAT} times`);
    expect(text).toContain(`at most ${MAX_RADIUS} blocks`);
    expect(text).toContain(`explosion power 0 to ${MAX_EXPLOSION_POWER}`);
  });
});

const realScripting = createScriptingService();

async function openSession() {
  const fs = createMemoryFileSystem();
  const { session, platform } = newSession(fs, {}, { scripting: realScripting });
  platform.exports = {
    ...platform.exports,
    runtimeJar: async () => new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]),
    geckolibJar: async () => new Uint8Array([0x50, 0x4b, 0x05, 0x06, 9, 9, 9]),
  };
  await session.newProject();
  await session.schemas();
  await session.flushValidation();
  return { session };
}

const LUCKY_PROMPT = 'make a lucky block: right-click it for a coin, break it for a gamble';

/** A plain rule (block used: give and play a sound) and a script rule (chance and counter). */
const LUCKY_BOOK: JsonObject = {
  counters: [{ name: 'opened', scope: 'player', start: 0 }],
  format: 1,
  rules: [
    {
      do: [
        { count: 1, item: 'lucky:lucky_coin', step: 'give_item' },
        { sound: 'minecraft:block.note_block.chime', step: 'play_sound' },
      ],
      key: 'coin_on_use',
      name: 'A coin on use',
      when: { subject: 'lucky:lucky_block', trigger: 'block_used' },
    },
    {
      do: [
        { amount: 1, counter: 'opened', scope: 'player', step: 'add_to_counter' },
        {
          conditions: [{ condition: 'chance', percent: 50 }],
          do: [
            {
              count: { max: 3, min: 1, value: 'random' },
              item: 'lucky:lucky_coin',
              step: 'drop_item',
            },
          ],
          else: [{ count: 1, mob: 'minecraft:silverfish', step: 'spawn_mob' }],
          match: 'all',
          step: 'if',
        },
        {
          step: 'show_action_bar',
          text: ['Lucky blocks opened: ', { counter: 'opened', scope: 'player', value: 'counter' }],
        },
      ],
      key: 'gamble_on_break',
      name: 'A gamble on break',
      when: { subject: 'lucky:lucky_block', trigger: 'block_broken' },
    },
  ],
};

const luckyScript = (): AiModelScript =>
  aiModelScriptSchema.parse({
    turns: [
      {
        content: [
          { type: 'tool_use', name: 'kind_schema', input: { kind: 'msm:rules' } },
          {
            type: 'tool_use',
            name: 'template_data',
            input: { templateId: 'msm_rules_lucky_block', id: 'lucky:rules' },
          },
        ],
      },
      {
        content: [
          {
            type: 'tool_use',
            name: 'propose_plan',
            input: {
              title: 'Lucky block',
              items: [
                {
                  itemId: 'mod',
                  kind: 'msm:mod',
                  elementId: 'lucky:mod',
                  summary: 'The mod metadata.',
                },
                {
                  itemId: 'things',
                  kind: 'msm:block',
                  elementId: 'lucky:lucky_block',
                  summary: 'The lucky block and the lucky coin.',
                  dependsOn: ['mod'],
                },
                {
                  itemId: 'rules',
                  kind: 'msm:rules',
                  elementId: 'lucky:rules',
                  summary: 'A rule book: a coin on use, a gamble on break.',
                  dependsOn: ['things'],
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
                  id: 'lucky:mod',
                  kind: 'msm:mod',
                  data: {
                    mod_id: 'lucky',
                    version: '1.0.0',
                    name: 'Lucky',
                    description: 'A lucky block made with rules.',
                    authors: [],
                    licence: 'MIT',
                  },
                },
                {
                  id: 'lucky:lucky_block',
                  kind: 'msm:block',
                  data: {
                    format: 1,
                    model: 'lucky:block/lucky_block',
                    display_name: 'Lucky Block',
                    item: { creative_tab: 'minecraft:building_blocks' },
                    components: { 'msm:breakable': { hardness: 0.5, resistance: 0.5 } },
                  },
                },
                {
                  id: 'lucky:block/lucky_block',
                  kind: 'minecraft:model',
                  data: {
                    parent: 'minecraft:block/cube_all',
                    textures: { all: 'lucky:block/lucky_block' },
                  },
                },
                {
                  id: 'lucky:lucky_coin',
                  kind: 'msm:item',
                  data: {
                    format: 1,
                    model: 'lucky:item/lucky_coin',
                    display_name: 'Lucky Coin',
                    max_stack_size: 64,
                    creative_tab: 'minecraft:ingredients',
                  },
                },
                {
                  id: 'lucky:item/lucky_coin',
                  kind: 'minecraft:model',
                  data: {
                    parent: 'minecraft:item/generated',
                    textures: { layer0: 'lucky:item/lucky_coin' },
                  },
                },
                { id: 'lucky:rules', kind: 'msm:rules', data: LUCKY_BOOK },
              ],
            },
          },
          {
            type: 'tool_use',
            name: 'create_texture',
            input: {
              namespace: 'lucky',
              path: 'block/lucky_block',
              pattern: 'gem',
              colour: '#e0b030',
            },
          },
          {
            type: 'tool_use',
            name: 'create_texture',
            input: {
              namespace: 'lucky',
              path: 'item/lucky_coin',
              pattern: 'gem',
              colour: '#e0b030',
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
              completedItemIds: ['mod', 'things', 'rules'],
              summary: 'The lucky block and its rule book are proposed with no errors.',
            },
          },
        ],
      },
      {
        content: [
          {
            type: 'text',
            text: 'The lucky block and its rules are ready to review. The textures are placeholders to replace, and the rules need the Fabric mod jar.',
          },
        ],
      },
    ],
  }) as AiModelScript;

async function run(
  session: ProjectSession,
  changeset: PendingChangeset,
  client: ScriptedModelClient,
  conversation: ReturnType<typeof createConversation>,
) {
  const results = new Map<string, AiToolResult>();
  let checkpoints = 0;
  const decisions: DecisionHost = {
    proposePlan: async (plan) => ({ decision: 'build_all', items: plan.items, comments: '' }),
    checkpoint: async () => {
      checkpoints += 1;
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
      mode: 'build',
      text: LUCKY_PROMPT,
      contextBlocks: [projectContextBlock(projectContextOf(session, changeset))],
    },
    settings: structuredClone(DEFAULT_AI_SETTINGS) as typeof DEFAULT_AI_SETTINGS,
    limits: { ...DEFAULT_LIMITS.build },
    host: {
      executeTool: async (request, signal) => {
        const answer = await execute(request, signal);
        results.set(request.toolUseId, answer);
        return answer;
      },
      emit: () => {},
    },
    signal: new AbortController().signal,
  });
  return { result, results, checkpoints: () => checkpoints };
}

/** The id of the first `tool_use` block of `name` in the conversation. */
function toolUseId(conversation: ReturnType<typeof createConversation>, name: string): string {
  const use = conversation.messages
    .flatMap((message) =>
      message.role === 'assistant' && typeof message.content !== 'string' ? message.content : [],
    )
    .find((block) => block.type === 'tool_use' && block.name === name);
  return use?.type === 'tool_use' ? use.id : '';
}

describe('AI helper scenario: a lucky block made with rules (build mode)', () => {
  it('proposes a rule book that run_checks compiles cleanly, applies and exports', async () => {
    const { session } = await openSession();
    const before = session.snapshot.project;
    const changeset = new PendingChangeset();
    const client = new ScriptedModelClient(luckyScript());
    const conversation = createConversation('conversation-rules', 'claude-opus-5-5');

    const { result, results, checkpoints } = await run(session, changeset, client, conversation);
    expect(result.reason).toBe('end_turn');
    expect(client.remaining).toBe(0);
    expect(checkpoints()).toBe(1);
    expect(
      [...results.entries()]
        .filter(([, answer]) => answer.isError)
        .map(([id, answer]) => `${id}: ${answer.content}`),
    ).toEqual([]);

    // The model was told about Rules.
    expect(JSON.stringify(client.requests[0]?.system)).toContain('prefer a rule book');

    // kind_schema and template_data work for the kind.
    expect(results.get(toolUseId(conversation, 'kind_schema'))?.content).toContain('rules');
    expect(results.get(toolUseId(conversation, 'template_data'))?.content).toContain(
      'any_block_broken',
    );

    // The book is proposed as written; nothing generated is stored.
    expect(changeset.items.filter((item) => item.conflict !== undefined)).toEqual([]);
    const created = new Map(
      changeset.items
        .filter((item) => item.op === 'create')
        .map((item) => [String(item.elementId), item.after as JsonObject | undefined]),
    );
    expect(created.get('lucky:rules')).toEqual(LUCKY_BOOK);
    expect(created.get('lucky:lucky_block')?.events).toBeUndefined();

    // run_checks expanded the project and found no errors, and no rule problems at all.
    const checks = JSON.parse(
      results.get(toolUseId(conversation, 'run_checks'))?.content ?? '{}',
    ) as {
      counts: { error: number };
      elements: {
        elementId: string;
        problems: { severity: string; code?: string; message: string }[];
      }[];
    };
    expect(
      checks.elements.flatMap((group) =>
        group.problems
          .filter((problem) => problem.severity === 'error')
          .map((problem) => `${group.elementId}: ${problem.message}`),
      ),
    ).toEqual([]);
    expect(checks.counts.error).toBe(0);
    expect(
      checks.elements
        .flatMap((group) => group.problems)
        .filter(
          (problem) => problem.code?.startsWith('rules.') === true && problem.severity !== 'info',
        ),
    ).toEqual([]);

    // One undo step, no blocking problems.
    const applied = await session.applyChangeset(changeset.items);
    expect(applied.skipped).toEqual([]);
    expect(session.snapshot.undoLabel).toBe(APPLY_CHANGESET_LABEL);
    await session.flushValidation();
    expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual([]);

    // The content jar: the plain rule as actions, the gamble through the generated script.
    const built = await session.buildContentJar({ [SEPARATE_RUNTIME_OPTION]: true });
    expect(built.report.ok, JSON.stringify(built.report.problems)).toBe(true);
    if (built.data === undefined) throw new Error('no jar');
    const entries = unzipSync(built.data);
    const decode = (path: string): string => new TextDecoder().decode(entries[path]);
    const blockPath = Object.keys(entries).find((path) =>
      path.endsWith('lucky/block/lucky_block.json'),
    );
    const block = JSON.parse(decode(blockPath ?? '')) as JsonObject;
    const events = block.events as JsonObject;
    expect(events[ruleEventId('lucky:lucky_block', 'block_used')]).toEqual({
      actions: [
        { count: 1, item: 'lucky:lucky_coin', type: 'give_item' },
        { sound: 'minecraft:block.note_block.chime', type: 'play_sound' },
      ],
    });
    expect(events[ruleEventId('lucky:lucky_block', 'block_broken')]).toEqual({
      actions: [{ handler: 'lucky:rules/rules/lucky_block/block_broken', type: 'run_script' }],
    });
    expect(decode('msm/lucky/script/rules/rules.js')).toContain(
      'msm.actions.define("lucky:rules/rules/lucky_block/block_broken"',
    );

    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
  });
});
