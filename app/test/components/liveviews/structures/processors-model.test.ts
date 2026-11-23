/**
 * The processor view's pure parts (B641): the buildings offered, the tags a list names, the
 * rows and their fidelity, the swipe line's template, and the processors host over the real
 * `@msm/terrain` engine (seeded, one run at a time, cancellable).
 */

import * as terrain from '@msm/terrain';
import { describe, expect, it } from 'vitest';
import { cleanTemplateData } from '../../../../src/renderer/src/liveviews/structures/assembly/steps';
import { seedBigint as assemblySeed } from '../../../../src/renderer/src/liveviews/structures/assembly/worker';
import {
  createProcessorHost,
  isProcessorRequest,
  type ProcessorAnswer,
  seedBigint,
} from '../../../../src/renderer/src/liveviews/structures/processors/host';
import {
  changedBlocks,
  gatherTags,
  listForTemplate,
  namedTags,
  type ProcessedResult,
  processorWords,
  ruleRows,
  STATE_MATCH_NOTE,
  swipeTemplate,
  templateChoices,
} from '../../../../src/renderer/src/liveviews/structures/processors/model';
import {
  type PieceTemplate,
  pieceTemplateFromData,
} from '../../../../src/renderer/src/liveviews/structures/vanilla-pieces';
import { element, hut, mossList, pool, projectOf, randomList } from './processors-fixtures';

/** Whether two types are the same (each assignable to the other). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** `model.ts` mirrors the engine's result; this fails to compile when they drift. */
const MIRRORS: [Same<ProcessedResult, terrain.ProcessorListResult>] = [true];

function hutTemplate(): PieceTemplate {
  const data = cleanTemplateData(hut().data);
  if (data === null) throw new Error('hut');
  return pieceTemplateFromData('demo:hut', data);
}

function run(list: unknown, seed = '7'): ProcessedResult {
  return terrain.processTemplate({
    template: hutTemplate() as terrain.PieceTemplate,
    list,
    rotation: 'none',
    origin: [0, 64, 0],
    seed: seedBigint(seed),
    world: { blockAt: () => null, surfaceAt: () => 64 },
  });
}

describe('the processor view’s model', () => {
  it('mirrors the engine’s types', () => {
    expect(MIRRORS).toEqual([true]);
  });

  it('offers first the buildings a pool places with the list, then the rest by name', () => {
    const project = projectOf(
      hut('demo:zed_hut'),
      hut('demo:alpha_hut'),
      hut('demo:paired'),
      mossList(),
      pool('demo:pool', 'demo:paired', 'demo:moss'),
      pool('demo:other', 'minecraft:village/plains/houses/plains_small_house_1', 'demo:moss'),
    );
    const choices = templateChoices(project, 'demo:moss');
    expect(choices.map((c) => [c.id, c.withThisList, c.source])).toEqual([
      ['demo:paired', true, 'project'],
      ['minecraft:village/plains/houses/plains_small_house_1', true, 'vanilla'],
      ['demo:alpha_hut', false, 'project'],
      ['demo:zed_hut', false, 'project'],
    ]);
    expect(choices[0]?.elementType).toBe('minecraft:single_pool_element');
    expect(listForTemplate(project, 'demo:paired')).toBe('demo:moss');
    expect(listForTemplate(project, 'demo:alpha_hut')).toBeNull();
  });

  it('gathers the block tags a list names, the mod’s over Minecraft’s, with nested tags', () => {
    const list = {
      processors: [
        {
          processor_type: 'minecraft:protected_blocks',
          value: '#minecraft:features_cannot_replace',
        },
        {
          processor_type: 'minecraft:rule',
          rules: [
            {
              input_predicate: { predicate_type: 'minecraft:tag_match', tag: 'demo:soft' },
              location_predicate: { predicate_type: 'minecraft:always_true' },
              output_state: 'minecraft:air',
            },
          ],
        },
      ],
    };
    expect(namedTags(list)).toEqual(['demo:soft', 'minecraft:features_cannot_replace']);
    const project = projectOf(
      element('demo:soft', 'minecraft:tag/block', { values: ['minecraft:dirt', '#demo:softer'] }),
      element('demo:softer', 'minecraft:tag/block', { values: ['minecraft:sand'] }),
    );
    const vanilla = (id: string) =>
      id === 'minecraft:features_cannot_replace' ? { values: ['minecraft:bedrock'] } : undefined;
    const { tags, namesVanilla } = gatherTags(project, namedTags(list), vanilla);
    expect(Object.keys(tags).sort()).toEqual([
      'demo:soft',
      'demo:softer',
      'minecraft:features_cannot_replace',
    ]);
    expect(namesVanilla).toBe(true);
    expect(gatherTags(project, ['demo:soft'], () => undefined).namesVanilla).toBe(false);
  });

  it('names every processor type in words, with the id only when asked', () => {
    for (const type of Object.keys(terrain.PROCESSOR_TYPES)) {
      expect(processorWords(type, false), type).not.toContain('does not know');
    }
    expect(processorWords('minecraft:rule', false)).toBe('Swaps blocks by rules');
    expect(processorWords('minecraft:rule', true)).toBe('Swaps blocks by rules (minecraft:rule)');
    expect(processorWords('demo:own', false)).toBe('A processor this preview does not know');
  });

  it('counts what each processor changed, with checked, about right and only in the game', () => {
    const list = {
      processors: [
        ...((mossList().data as { processors: unknown[] }).processors ?? []),
        { processor_type: 'minecraft:block_age', mossiness: 0 },
        { processor_type: 'minecraft:gravity', heightmap: 'WORLD_SURFACE_WG', offset: 0 },
      ],
    };
    const result = run(list);
    const rows = ruleRows(result.rules, list);
    expect(rows.map((r) => [r.type, r.fidelity])).toEqual([
      ['minecraft:rule', 'checked'],
      ['minecraft:block_age', 'about_right'],
      // Exact in the engine (B638), not measured by the parity fixture yet.
      ['minecraft:gravity', 'about_right'],
    ]);
    expect(rows[0]?.changed).toBe(16);
    expect(changedBlocks(hutTemplate(), result)).toBeGreaterThanOrEqual(16);
  });

  it('marks a rule that compares block states as about right, with the reason', () => {
    const list = {
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            {
              input_predicate: {
                predicate_type: 'minecraft:blockstate_match',
                block_state: { id: 'minecraft:stone' },
              },
              location_predicate: { predicate_type: 'minecraft:always_true' },
              output_state: 'minecraft:gold_block',
            },
          ],
        },
      ],
    };
    const [row] = ruleRows(run(list).rules, list);
    expect(row?.fidelity).toBe('about_right');
    expect(row?.notes).toContain(STATE_MATCH_NOTE);
  });

  it('cuts before and after by the swipe line', () => {
    const template = hutTemplate();
    const result = run(mossList().data);
    const cut = (n: number) => {
      const flat = swipeTemplate(template, result, n);
      return flat.blocks.filter((b) => b[1] === 0).map((b) => [b[0], flat.palette[b[3]]] as const);
    };
    expect(new Set(cut(4).map(([, s]) => s))).toEqual(new Set(['minecraft:stone']));
    expect(new Set(cut(0).map(([, s]) => s))).toEqual(new Set(['minecraft:mossy_cobblestone']));
    for (const [x, state] of cut(2)) {
      expect(state).toBe(x < 2 ? 'minecraft:stone' : 'minecraft:mossy_cobblestone');
    }
    // Without a result yet, the building as it is.
    expect(swipeTemplate(template, null, 2).blocks).toHaveLength(32);
  });

  it('runs seeded: the same seed the same blocks, another seed others', () => {
    const list = randomList().data;
    const a = run(list, '1');
    expect(run(list, '1').after).toEqual(a.after);
    const others = ['2', '3', '4', '5'].map((seed) => JSON.stringify(run(list, seed).after));
    expect(others.some((other) => other !== JSON.stringify(a.after))).toBe(true);
    expect(seedBigint('12345')).toBe(assemblySeed('12345'));
    expect(seedBigint('words')).toBe(assemblySeed('words'));
  });
});

describe('the processors host', () => {
  const job = (list: unknown, seed = '1') => ({
    template: hutTemplate(),
    list,
    seed,
    origin: [0, 64, 0] as const,
    around: null,
    tags: {},
  });

  it('answers the engine’s result for a request, and only the newest', () => {
    const answers: ProcessorAnswer[] = [];
    const queue: (() => void)[] = [];
    const host = createProcessorHost(
      terrain,
      (answer) => answers.push(answer),
      (work) => queue.push(work),
    );
    host.receive({ token: 1, kind: 'process', job: job(mossList().data) });
    host.receive({ token: 2, kind: 'process', job: job(mossList().data) });
    for (const work of queue.splice(0)) work();
    expect(answers.map((a) => a.token)).toEqual([2]);
    const [answer] = answers;
    expect(answer?.kind).toBe('processed');
    if (answer?.kind === 'processed') expect(answer.result.rules[0]?.changed).toBe(16);
  });

  it('drops a cancelled request and reports a refused list as a result', () => {
    const answers: ProcessorAnswer[] = [];
    const queue: (() => void)[] = [];
    const host = createProcessorHost(
      terrain,
      (answer) => answers.push(answer),
      (work) => queue.push(work),
    );
    host.receive({ token: 3, kind: 'process', job: job(mossList().data) });
    host.receive({ token: 3, kind: 'process-cancel' });
    for (const work of queue.splice(0)) work();
    expect(answers).toEqual([]);
    host.receive({
      token: 4,
      kind: 'process',
      job: job({
        processors: [
          {
            processor_type: 'minecraft:rule',
            rules: [
              {
                input_predicate: { predicate_type: 'minecraft:always_true' },
                location_predicate: { predicate_type: 'minecraft:always_true' },
                output_state: { Name: 'minecraft:stone' },
              },
            ],
          },
        ],
      }),
    });
    for (const work of queue.splice(0)) work();
    const [answer] = answers;
    expect(answer?.kind === 'processed' && answer.result.refused).toMatch(/refuses/);
  });

  it('tells the worker entry which messages are its own', () => {
    expect(isProcessorRequest({ kind: 'process', token: 1 })).toBe(true);
    expect(isProcessorRequest({ kind: 'process-cancel', token: 1 })).toBe(true);
    expect(isProcessorRequest({ kind: 'assemble', token: 1 })).toBe(false);
    expect(isProcessorRequest({ kind: 'cancel', token: 1 })).toBe(false);
    expect(isProcessorRequest(null)).toBe(false);
  });
});
