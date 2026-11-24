/**
 * Scenario test of the AI helper's drawn textures (ADR 0092 D15, brief B498): "frost tools and a
 * frost ore". The scripted model client drives `runAssistant` in build mode with the real tool
 * executor over a session with the built-in plugins. The ore, its shard and five tools are
 * written by hand and every picture comes from `create_texture` with a recipe, so each texture
 * the changeset holds is MSM's drawn art: the test decodes the proposed PNGs and runs the
 * library's pixel rules (`checkArtRules`) on them, checks the run reports no errors, and applies
 * the changeset as one undo step.
 */

import { inflateSync } from 'node:zlib';
import {
  type AiModelScript,
  type AiToolResult,
  aiModelScriptSchema,
  createConversation,
  DEFAULT_AI_SETTINGS,
  DEFAULT_LIMITS,
  type ProposePlanInput,
  projectContextBlock,
  runAssistant,
  ScriptedModelClient,
} from '@msm/ai';
import { createMemoryFileSystem, type Json } from '@msm/core';
import {
  type ArtRecipeId,
  type ArtRulesImage,
  artFramePngs,
  artRecipeInfo,
  blockloomDraws,
  checkArtRules,
} from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import { projectContextOf } from '../src/renderer/src/ai/project-context';
import { createToolExecutor, type DecisionHost } from '../src/renderer/src/ai/tool-executor';
import { PendingChangeset } from '../src/renderer/src/changeset/changeset';
import { APPLY_CHANGESET_LABEL } from '../src/renderer/src/session/project-session';
import { newSession } from './session-fixture';

const FROST_PROMPT = 'frost tools and a frost ore';
const FROST = '#7fd4f0';
const TOOLS = ['sword', 'pickaxe', 'axe', 'shovel', 'hoe'] as const;

/** Decodes an 8-bit RGBA PNG (the library's `encodePng` output) into pixels. */
function decodePng(bytes: Uint8Array): ArtRulesImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (at < bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      expect([body[8], body[9]]).toEqual([8, 6]);
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x] ?? 0;
      const left = x >= 4 ? (data[y * stride + x - 4] ?? 0) : 0;
      const up = y > 0 ? (data[(y - 1) * stride + x] ?? 0) : 0;
      const corner = x >= 4 && y > 0 ? (data[(y - 1) * stride + x - 4] ?? 0) : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      data[y * stride + x] = (value + predicted) & 255;
    }
  }
  return { width, height, data };
}

function frostScript(mod: Json): AiModelScript {
  const plan: ProposePlanInput = {
    title: 'Frost tools and a frost ore',
    items: [
      { itemId: 'mod', kind: 'msm:mod', elementId: 'frost:mod', summary: 'The mod metadata.' },
      {
        itemId: 'ore',
        kind: 'msm:block',
        elementId: 'frost:frost_ore',
        summary: 'Frost ore that drops frost shards, and the shard item.',
        dependsOn: ['mod'],
      },
      ...TOOLS.map((tool) => ({
        itemId: tool,
        kind: 'msm:item',
        elementId: `frost:frost_${tool}`,
        summary: `A frost ${tool} with a handheld model.`,
        dependsOn: ['ore'],
      })),
    ],
    assets: [
      { namespace: 'frost', path: 'block/frost_ore', purpose: 'The frost ore, drawn as ore.' },
      { namespace: 'frost', path: 'item/frost_shard', purpose: 'The shard, drawn as a gem.' },
      ...TOOLS.map((tool) => ({
        namespace: 'frost',
        path: `item/frost_${tool}`,
        purpose: `The frost ${tool}, drawn as a ${tool}.`,
      })),
    ],
  };
  const textures = [
    { path: 'block/frost_ore', recipe: 'ore' },
    { path: 'item/frost_shard', recipe: 'gem' },
    ...TOOLS.map((tool) => ({ path: `item/frost_${tool}`, recipe: tool })),
  ];
  const itemModel = (path: string, parent: string) => ({
    id: `frost:item/${path}`,
    kind: 'minecraft:model',
    data: { parent, textures: { layer0: `frost:item/${path}` } },
  });
  const elements = [
    { id: 'frost:mod', kind: 'msm:mod', data: mod },
    {
      id: 'frost:frost_ore',
      kind: 'msm:block',
      data: {
        format: 1,
        model: 'frost:block/frost_ore',
        display_name: 'Frost Ore',
        sound_type: 'stone',
        loot: 'frost:blocks/frost_ore',
        item: { creative_tab: 'minecraft:natural_blocks' },
        components: {
          'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: 'iron' },
        },
      },
    },
    {
      id: 'frost:block/frost_ore',
      kind: 'minecraft:model',
      data: { parent: 'minecraft:block/cube_all', textures: { all: 'frost:block/frost_ore' } },
    },
    {
      id: 'frost:blocks/frost_ore',
      kind: 'minecraft:loot_table',
      data: {
        type: 'minecraft:block',
        pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'frost:frost_shard' }] }],
      },
    },
    {
      id: 'frost:frost_shard',
      kind: 'msm:item',
      data: {
        format: 1,
        model: 'frost:item/frost_shard',
        display_name: 'Frost Shard',
        creative_tab: 'minecraft:ingredients',
      },
    },
    itemModel('frost_shard', 'minecraft:item/generated'),
    ...TOOLS.flatMap((tool) => [
      {
        id: `frost:frost_${tool}`,
        kind: 'msm:item',
        data: {
          format: 1,
          model: `frost:item/frost_${tool}`,
          display_name: `Frost ${tool[0]?.toUpperCase()}${tool.slice(1)}`,
          max_stack_size: 1,
          creative_tab: tool === 'sword' ? 'minecraft:combat' : 'minecraft:tools_and_utilities',
          components: {
            'msm:tool': { type: tool, tier: 'iron' },
            'msm:durability': { max: 250 },
          },
        },
      },
      itemModel(`frost_${tool}`, 'minecraft:item/handheld'),
    ]),
  ];
  return aiModelScriptSchema.parse({
    turns: [
      { content: [{ type: 'tool_use', name: 'propose_plan', input: plan }] },
      {
        content: [
          { type: 'tool_use', name: 'create_elements', input: { elements } },
          ...textures.map((texture) => ({
            type: 'tool_use',
            name: 'create_texture',
            input: { namespace: 'frost', ...texture, colour: FROST },
          })),
        ],
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
      {
        content: [
          {
            type: 'text',
            text: 'The frost ore, its shard and five frost tools are ready to review. MSM drew their pictures in a Minecraft-like style; you can redraw them with Draw... or paint over them.',
          },
        ],
      },
    ],
  }) as AiModelScript;
}

describe('AI helper scenario: frost tools and a frost ore (build mode, drawn textures)', () => {
  it('draws every texture with a recipe, passing the art rules, and applies in one step', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    await session.newProject({});
    await session.schemas();
    await session.flushValidation();
    const before = session.snapshot.project;
    const changeset = new PendingChangeset();
    const client = new ScriptedModelClient(frostScript(session.kindDefault('msm:mod') as Json));
    const conversation = createConversation('conversation-frost', 'claude-opus-5-5');

    const results = new Map<string, AiToolResult>();
    const decisions: DecisionHost = {
      proposePlan: async (plan) => ({ decision: 'build_all', items: plan.items, comments: '' }),
      checkpoint: async () => 'continue',
    };
    const execute = createToolExecutor(session, changeset, decisions);
    const result = await runAssistant({
      client,
      conversation,
      request: {
        runId: 'run-frost',
        conversationId: conversation.id,
        mode: 'build',
        text: FROST_PROMPT,
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
    expect(result.reason).toBe('end_turn');
    expect(client.remaining).toBe(0);
    expect(
      [...results.entries()]
        .filter(([, answer]) => answer.isError)
        .map(([id, answer]) => `${id}: ${answer.content}`),
    ).toEqual([]);

    // run_checks reported no errors.
    const checks = [...results.values()]
      .map((answer) => JSON.parse(answer.content) as { counts?: { error: number } })
      .find((value) => value.counts !== undefined);
    expect(checks?.counts?.error).toBe(0);

    // Every texture is MSM's drawn art of its recipe and passes the pixel rules.
    const textures = [...results.values()]
      .map(
        (answer) =>
          JSON.parse(answer.content) as { file?: string; recipe?: ArtRecipeId; seed?: number },
      )
      .filter((value) => value.recipe !== undefined);
    expect(textures.map((value) => value.recipe)).toEqual(['ore', 'gem', ...TOOLS]);
    const assets = changeset.items.filter((item) => item.op === 'asset');
    expect(assets).toHaveLength(textures.length);
    for (const texture of textures) {
      const recipe = texture.recipe as ArtRecipeId;
      const asset = assets.find(
        (item) => `assets/${item.asset?.namespace}/${item.asset?.path}` === texture.file,
      )?.asset;
      if (asset === undefined) throw new Error(`no asset for ${texture.file}`);
      expect(asset.bytes).toEqual(
        artFramePngs({ recipe, colour: [127, 212, 240], seed: texture.seed })[0],
      );
      const image = decodePng(asset.bytes);
      // The pixel rules are the Classic style's; Blockloom's block faces blend freely (ADR 0135 D7).
      if (!blockloomDraws(recipe)) {
        expect(checkArtRules(image, artRecipeInfo(recipe)), `${texture.file}`).toEqual([]);
      }
    }
    // Two frost tools of different kinds never share a picture, nor do two seeds of one.
    expect(
      new Set(assets.map((item) => Buffer.from(item.asset?.bytes ?? []).toString('hex'))).size,
    ).toBe(assets.length);

    // One undo step.
    const applied = await session.applyChangeset(changeset.items);
    expect(applied.skipped).toEqual([]);
    expect(session.snapshot.undoLabel).toBe(APPLY_CHANGESET_LABEL);
    await session.flushValidation();
    expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
  });
});
