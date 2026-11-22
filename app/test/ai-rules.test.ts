/**
 * The AI helper and Rules (ADR 0082 D10, brief B382).
 *
 * - The catalogue ids, plain steps, cancellable triggers, caps and templates the system prompt
 *   names are pinned against `@msm/plugin-rules`, so the prompt cannot drift from the catalogue
 *   (`@msm/ai` does not depend on the plugin, so its lists are written by hand).
 * - The vehicle, controls and vanilla parity templates and flows the prompt names (ADRs 0091 D8,
 *   0101 D7) are pinned against the entities, controls, blocks-items and scripting plugins and the
 *   library's starters, and the limits of B454 and B457 are pinned in plain words.
 * - Batch 2 (ADR 0101 D7, B484): the villager, fluid and dimension type templates, the new flows
 *   and answers, the problem codes the prompt explains and the vanilla trade sets it names are
 *   pinned against the entities, blocks-items and worldgen plugins, the library and the targets.
 * - A scripted build-mode run makes a lucky block with a rule book (a plain rule and a rule
 *   that needs the generated script) through the real tool executor; `run_checks` compiles the
 *   book with no errors, the changeset applies as one undo step, and the content jar holds the
 *   rule events and the transpiled rule script.
 */

import {
  type AiModelScript,
  type AiToolResult,
  aiModelScriptSchema,
  CONTROLS_PROMPT_TEMPLATES,
  createConversation,
  DEFAULT_AI_SETTINGS,
  DEFAULT_LIMITS,
  NEW_FLOW_PROMPT_IDS,
  PLANTS_STORAGE_FLOW_ANSWERS,
  PLANTS_STORAGE_PROMPT_CODES,
  PLANTS_STORAGE_PROMPT_TEMPLATES,
  projectContextBlock,
  RULES_PROMPT_CANCELLABLE,
  RULES_PROMPT_IDS,
  RULES_PROMPT_PLAIN_STEPS,
  RULES_PROMPT_TEMPLATES,
  runAssistant,
  ScriptedModelClient,
  systemPrompt,
  VANILLA_PARITY_PROMPT_TEMPLATES,
  VEHICLE_PROMPT_TEMPLATES,
  VILLAGERS_FLUIDS_FLOW_ANSWERS,
  VILLAGERS_FLUIDS_PROMPT_CODES,
  VILLAGERS_FLUIDS_PROMPT_TEMPLATES,
} from '@msm/ai';
import { createMemoryFileSystem, type JsonObject } from '@msm/core';
import { SEPARATE_RUNTIME_OPTION } from '@msm/exporters';
import type { ElementTemplate, Json, TargetFacts } from '@msm/plugin-api';
import {
  blocksItemsTemplates,
  FLUID_KIND,
  FLUID_PROBLEM_CODES,
  PLANT3_PROBLEM_CODES,
  SOUND_PROBLEM_CODES,
  STORAGE2_PROBLEM_CODES,
} from '@msm/plugin-blocks-items';
import { controlsTemplates } from '@msm/plugin-controls';
import {
  ENTITIES_VILLAGER_PROBLEM_CODES,
  vehicleTemplates,
  villagerTemplates,
} from '@msm/plugin-entities';
import { libraryStarters } from '@msm/plugin-library';
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
import { commandTemplates } from '@msm/plugin-scripting';
import { WORLDGEN_PROBLEM_CODES, worldgenTemplates } from '@msm/plugin-worldgen';
import { builtInTargets } from '@msm/targets';
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

/** The twenty block types of ADR 0094 (B443). */
const VANILLA_PARITY_TYPES = new Set([
  'bed',
  'cake',
  'berry_bush',
  'tall_plant',
  'potted_plant',
  'vine',
  'sea_pickle',
  'carpet',
  'layers',
  'cocoa',
  'candle',
  'ladder',
  'torch',
  'lantern',
  'chain',
  'rod',
  'sign',
  'hanging_sign',
  'stem',
  'scaffolding',
]);

/** The components of ADRs 0094 and 0095 that make a template a vanilla parity one. */
const VANILLA_PARITY_COMPONENTS = [
  'msm:waterloggable',
  'msm:weathering',
  'msm:item_inventory',
  'msm:bundle',
];

/** A template's data for a throwaway id, to read its type and components. */
function templateData(template: ElementTemplate): Record<string, Json> {
  const target = builtInTargets[0]?.target as TargetFacts;
  const data = template.data({
    id: 'demo:thing',
    namespace: 'demo',
    path: 'thing',
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: undefined,
    target,
  });
  return (typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {}) as Record<
    string,
    Json
  >;
}

describe('the system prompt names the vehicle, controls and vanilla parity content exactly (ADRs 0091 D8, 0101 D7)', () => {
  it('lists every vehicle template and every key bind and HUD template', () => {
    expect([...VEHICLE_PROMPT_TEMPLATES]).toEqual(vehicleTemplates.map((template) => template.id));
    expect([...CONTROLS_PROMPT_TEMPLATES]).toEqual(
      controlsTemplates.map((template) => template.id),
    );
  });

  it('lists every template of the new block types, ageing, bags, commands and tabs', () => {
    const parity = blocksItemsTemplates
      .filter((template) => {
        const data = templateData(template);
        const components = (data.components ?? {}) as Record<string, Json>;
        return (
          VANILLA_PARITY_TYPES.has(String(data.type)) ||
          VANILLA_PARITY_COMPONENTS.some((component) => component in components)
        );
      })
      .map((template) => template.id);
    expect([...VANILLA_PARITY_PROMPT_TEMPLATES].sort()).toEqual(
      [...parity, ...commandTemplates.map((template) => template.id)].sort(),
    );
  });

  it('names flows that exist, with their name parameter', () => {
    for (const [starterId, parameter] of Object.entries(NEW_FLOW_PROMPT_IDS)) {
      const starter = libraryStarters.find((entry) => entry.id === starterId);
      expect(starter, starterId).toBeDefined();
      expect(starter?.creator, starterId).toBeDefined();
      expect(
        starter?.parameters?.map((entry) => entry.id),
        starterId,
      ).toContain(parameter);
    }
  });

  it('names every template, flow and its parameter, and the kinds', () => {
    const text = systemPrompt('build');
    for (const id of [
      ...VEHICLE_PROMPT_TEMPLATES,
      ...CONTROLS_PROMPT_TEMPLATES,
      ...VANILLA_PARITY_PROMPT_TEMPLATES,
      ...Object.entries(NEW_FLOW_PROMPT_IDS).flat(),
      'msm:vehicle',
      'msm:key_bind',
      'msm:hud',
      'msm:command',
      'msm:creative_tab',
      'msm:waterloggable',
      'msm:weathering',
      'msm:waxable',
      'msm:item_inventory',
      'msm:bundle',
      ...VANILLA_PARITY_TYPES,
    ]) {
      expect(text, id).toContain(id);
    }
  });

  it('names every vehicle mode, HUD source and command argument type of the targets', () => {
    const text = systemPrompt('build');
    for (const bundle of builtInTargets) {
      const facts = bundle.target;
      for (const type of Object.keys(facts.commands?.argumentTypes ?? {})) {
        expect(text, type).toContain(`"${type}"`);
      }
    }
    for (const word of ['"ground"', '"water"', '"amphibious"', '"air"', '"hover"']) {
      expect(text, word).toContain(word);
    }
    for (const word of ['"player"', '"vehicle"', '"score"', '"data"', '"set"', 'rules.counter.']) {
      expect(text, word).toContain(word);
    }
  });

  it('states the D8 guidance and the limits of B454 and B457 in plain words', () => {
    const text = systemPrompt('chat');
    for (const words of [
      // ADR 0091 D8: flows first, a fire key is a weapon, values on the HUD.
      'Prefer the flows',
      'never a key bind',
      'not with show_action_bar',
      'a button for every player',
      'needs a game restart',
      // B454: name clashes, raw macro text, selectors, level 2, registration order, icons.
      'is not registered under that name',
      'raw macro text',
      'names or selectors',
      'permission level 2 whatever',
      'the order the game registers things',
      "not the project's order",
      'shows no picture',
      'work after /reload',
      // B457 and B415: the jar, vanilla packs and the eject.
      'export.needs-jar',
      'controls.needs-jar',
      'vehicles.needs-jar',
      'Java project export includes them',
    ]) {
      expect(text, words).toContain(words);
    }
    // Signs, commands and creative tabs are no longer listed as missing.
    expect(text).not.toContain('Signs, hanging signs, boats and shelves are not available');
    expect(text).not.toContain('custom commands and creative tabs; propose');
  });
});

describe('every template the system prompt names is in the Add element library', () => {
  it('finds each listed template in the session library', () => {
    const { session } = newSession(createMemoryFileSystem());
    const library = new Set(session.library.templates.map((template) => template.id));
    for (const id of [
      ...RULES_PROMPT_TEMPLATES,
      ...VEHICLE_PROMPT_TEMPLATES,
      ...CONTROLS_PROMPT_TEMPLATES,
      ...VANILLA_PARITY_PROMPT_TEMPLATES,
      ...VILLAGERS_FLUIDS_PROMPT_TEMPLATES,
      ...PLANTS_STORAGE_PROMPT_TEMPLATES,
    ]) {
      expect(library.has(id), id).toBe(true);
    }
  });
});

describe('the system prompt names the villager, fluid and dimension type content exactly (ADR 0101 D7, batch 2)', () => {
  it('lists every villager, fluid and dimension type template', () => {
    expect([...VILLAGERS_FLUIDS_PROMPT_TEMPLATES].sort()).toEqual(
      [
        ...villagerTemplates,
        ...blocksItemsTemplates.filter((template) => template.kind === FLUID_KIND),
        ...worldgenTemplates.filter((template) => template.kind === 'minecraft:dimension_type'),
      ]
        .map((template) => template.id)
        .sort(),
    );
  });

  it('explains every problem code of traders, jobs, storage, shoulders, fluids and dimension types', () => {
    expect([...VILLAGERS_FLUIDS_PROMPT_CODES].sort()).toEqual(
      [
        ...ENTITIES_VILLAGER_PROBLEM_CODES,
        ...FLUID_PROBLEM_CODES,
        ...WORLDGEN_PROBLEM_CODES.filter((code) => code.startsWith('worldgen.dimension-')),
      ].sort(),
    );
  });

  it('names flow answers that exist', () => {
    for (const [starterId, answers] of Object.entries(VILLAGERS_FLUIDS_FLOW_ANSWERS)) {
      const starter = libraryStarters.find((entry) => entry.id === starterId);
      expect(starter?.creator, starterId).toBeDefined();
      const parameters = starter?.parameters?.map((entry) => entry.id) ?? [];
      for (const answer of answers) expect(parameters, `${starterId}: ${answer}`).toContain(answer);
    }
    const merchant = libraryStarters.find((entry) => entry.id === 'wandering-merchant');
    const ids = merchant?.parameters?.map((entry) => entry.id) ?? [];
    for (const parameter of [
      'ware_1',
      'ware_1_count',
      'ware_1_emeralds',
      'ware_3',
      'vanilla_wares',
      'restock',
    ]) {
      expect(ids, parameter).toContain(parameter);
    }
    const job = libraryStarters.find((entry) => entry.id === 'village-job');
    for (const parameter of ['buys', 'sells', 'trades_like']) {
      expect(
        job?.parameters?.map((entry) => entry.id),
        parameter,
      ).toContain(parameter);
    }
    const fluid = libraryStarters.find((entry) => entry.id === 'fluid');
    for (const parameter of ['behaves_like', 'colour']) {
      expect(
        fluid?.parameters?.map((entry) => entry.id),
        parameter,
      ).toContain(parameter);
    }
  });

  it('names vanilla trade sets and attributes every target has', () => {
    const text = systemPrompt('build');
    for (const bundle of builtInTargets) {
      const facts = bundle.target;
      for (const set of ['minecraft:wandering_trader/common', 'minecraft:mason/level_1']) {
        expect(text, set).toContain(`"${set}"`);
        expect(facts.entities?.vanillaTradeSets?.[set], `${facts.id}: ${set}`).toBeDefined();
      }
      for (const attribute of [
        'minecraft:visual/sky_color',
        'minecraft:visual/fog_color',
        'minecraft:visual/sun_angle',
        'minecraft:gameplay/bed_rule',
      ]) {
        expect(text, attribute).toContain(`"${attribute}"`);
        expect(facts.worldgen.environmentAttributes, `${facts.id}: ${attribute}`).toContain(
          attribute,
        );
      }
    }
    // The attribute only 26.4 has.
    const has = builtInTargets.filter((bundle) =>
      bundle.target.worldgen.environmentAttributes?.includes('minecraft:visual/has_sky_occluder'),
    );
    expect(has.map((bundle) => bundle.target.mcVersion)).toEqual(['26.4-snapshot-7']);
    expect(text).toContain('newer targets also list "minecraft:visual/has_sky_occluder"');
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

describe('the system prompt names the plant, pot, storage, sound and vanilla block rule content exactly (ADR 0112 D2, batch 1)', () => {
  const PLANT_TYPES = new Set([
    'growing_plant',
    'column_plant',
    'multiface',
    'dripleaf',
    'flower_pot',
  ]);

  it('lists every template of the new plant types, storage options, sounds and rules', () => {
    const batch1 = blocksItemsTemplates
      .filter((template) => {
        if (template.kind === 'msm:vanilla_block_rules') return true;
        const data = templateData(template);
        const components = (data.components ?? {}) as Record<string, Json>;
        const container = (components['msm:container'] ?? {}) as Record<string, Json>;
        return (
          PLANT_TYPES.has(String(data.type)) ||
          container.double === true ||
          container.per_player === true ||
          data.block_sounds !== undefined ||
          (typeof data.set_type === 'object' && data.set_type !== null)
        );
      })
      .map((template) => template.id);
    expect([...PLANTS_STORAGE_PROMPT_TEMPLATES].sort()).toEqual(batch1.sort());
  });

  it('explains every problem code of the plant, storage and sound validators', () => {
    expect([...PLANTS_STORAGE_PROMPT_CODES].sort()).toEqual(
      [...PLANT3_PROBLEM_CODES, ...STORAGE2_PROBLEM_CODES, ...SOUND_PROBLEM_CODES].sort(),
    );
  });

  it('names flow answers and choices that exist', () => {
    for (const [starterId, answers] of Object.entries(PLANTS_STORAGE_FLOW_ANSWERS)) {
      const starter = libraryStarters.find((entry) => entry.id === starterId);
      expect(starter?.creator, starterId).toBeDefined();
      const parameters = starter?.parameters?.map((entry) => entry.id) ?? [];
      for (const answer of answers) expect(parameters, `${starterId}: ${answer}`).toContain(answer);
    }
    const text = systemPrompt('build');
    const choices = (starterId: string, parameter: string): string[] => {
      const entry = libraryStarters
        .find((starter) => starter.id === starterId)
        ?.parameters?.find((candidate) => candidate.id === parameter);
      return entry !== undefined && 'choices' in entry && Array.isArray(entry.choices)
        ? entry.choices.map((choice: { value: string }) => choice.value)
        : [];
    };
    for (const [starterId, parameter] of [
      ['cave-plants', 'kind'],
      ['desert-plants', 'kind'],
      ['desert-plants', 'height'],
      ['wood-set', 'door_sounds'],
    ] as const) {
      const values = choices(starterId, parameter);
      expect(values.length, `${starterId}: ${parameter}`).toBeGreaterThan(0);
      for (const value of values) expect(text, `${starterId}: ${value}`).toContain(`"${value}"`);
    }
    for (const member of [
      'rod',
      'button',
      'pressure_plate',
      'fence',
      'fence_gate',
      'wall',
      'chest',
    ]) {
      expect(choices('copper-set', 'members'), member).toContain(member);
    }
    for (const [starterId, parameters] of [
      ['cave-plants', ['plant_name', 'kind', 'colour', 'berry_colour', 'light']],
      ['desert-plants', ['plant_name', 'kind', 'colour', 'height', 'uses']],
      ['flower-pot', ['pot_name', 'colour', 'plants', 'ingredient']],
      ['banner-pattern', ['pattern_name', 'shape', 'colour', 'ingredient']],
      ['armour-trim', ['trim_name', 'style', 'template_item', 'copy_block', 'colour']],
      ['glider', ['glider_name', 'durability', 'colour', 'material']],
      ['pot-pattern', ['pattern_name', 'picture', 'colour', 'ingredient']],
    ] as const) {
      const ids = libraryStarters
        .find((entry) => entry.id === starterId)
        ?.parameters?.map((entry) => entry.id);
      for (const parameter of parameters)
        expect(ids, `${starterId}: ${parameter}`).toContain(parameter);
    }
  });
});
