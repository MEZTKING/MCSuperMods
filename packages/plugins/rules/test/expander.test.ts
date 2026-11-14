/**
 * The project expander (ADR 0082 D3, D9): every book of the project compiled together, books
 * sharing a subject and trigger sharing one event, the generated script written into the book's
 * copy, and the compiler's problems reported once.
 */
import type { Element, Json, JsonObject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { compileRuleBook, expandRules, RULES_SCRIPT_FIELD, rulesExpander } from '../src/index';
import { applyPatches, blockingProblems, book, element, indexesFor, PROJECT } from './support';

const [first] = builtInTargets;
if (first === undefined) throw new Error('no built-in target');
const target = first.target;

const CHIME = { sound: 'minecraft:block.note_block.chime', step: 'play_sound' };
const GIVE = { count: 1, item: 'demo:ruby', step: 'give_item' };
const SNEAKING = { conditions: [{ condition: 'player_sneaking' }], match: 'all' };

const plainRule = (key: string, steps: Json[] = [CHIME]) => ({
  do: steps,
  key,
  when: { subject: 'demo:plain_block', trigger: 'block_used' },
});
const logicRule = (key: string) => ({
  do: [GIVE],
  key,
  only_if: SNEAKING,
  when: { subject: 'demo:plain_block', trigger: 'block_used' },
});

const expand = (elements: readonly Element[]) => expandRules({ elements, target });
const dataOf = (elements: readonly Element[], id: string): JsonObject =>
  elements.find((e) => e.id === id)?.data as JsonObject;

describe('rules expander', () => {
  it('is the plugin API contract over expandRules', async () => {
    const elements = [...PROJECT, book([plainRule('a')])];
    expect(await rulesExpander.expand({ elements, target })).toEqual(expand(elements));
  });

  it('does nothing without books', () => {
    expect(expand(PROJECT)).toEqual({ patches: [], problems: [] });
  });

  it('gives one book the same patches as compileRuleBook, and no script patch when plain', () => {
    const rules = book([plainRule('a')]);
    const result = expand([...PROJECT, rules]);
    expect(result.problems).toEqual([]);
    expect(result.patches).toEqual(compileRuleBook(rules, PROJECT, target).patches);
  });

  it('writes the generated script into the book copy', () => {
    const rules = book([logicRule('a')]);
    const compiled = compileRuleBook(rules, PROJECT, target);
    const result = expand([...PROJECT, rules]);
    expect(result.patches.at(-1)).toEqual({
      elementId: 'demo:rules',
      path: [RULES_SCRIPT_FIELD],
      value: compiled.script,
      origin: { elementId: 'demo:rules', pointer: '' },
    });
  });

  it('clears a hand-written generated_script on a book that needs none', () => {
    const rules = element('msm:rules', 'demo:rules', {
      format: 1,
      generated_script: ['nonsense'],
      rules: [plainRule('a')],
    });
    const patch = expand([...PROJECT, rules]).patches.find((p) => p.elementId === 'demo:rules');
    expect(patch?.value).toBeNull();
  });

  it('shares one event between books with the same subject and trigger', async () => {
    const a = book([plainRule('a')], [], 'demo:a_rules');
    const b = book([logicRule('b')], [], 'demo:b_rules');
    const c = book([plainRule('c', [GIVE])], [], 'demo:c_rules');
    // Given out of order: the expander sorts books by id.
    const elements = [...PROJECT, c, b, a];
    const result = expand(elements);
    expect(result.problems).toEqual([]);
    const paths = result.patches.map((p) => `${p.elementId} ${p.path.join('/')}`);
    expect(new Set(paths).size).toBe(paths.length);
    const expanded = applyPatches(elements, result.patches);
    const block = dataOf(expanded, 'demo:plain_block');
    const eventId = 'demo:plain_block_rules_block_used';
    expect((block.components as JsonObject)['msm:on_interact']).toEqual({ event: eventId });
    expect((block.events as JsonObject)[eventId]).toEqual({
      actions: [
        { sound: 'minecraft:block.note_block.chime', type: 'play_sound' },
        { handler: 'demo:rules/b_rules/plain_block/block_used', type: 'run_script' },
        { count: 1, item: 'demo:ruby', type: 'give_item' },
      ],
    });
    const origins = result.patches.filter((p) => p.elementId === 'demo:plain_block');
    expect(origins.every((p) => p.origin.elementId === 'demo:a_rules')).toBe(true);
    const scripts = result.patches.filter((p) => p.path[0] === RULES_SCRIPT_FIELD);
    expect(scripts.map((p) => p.elementId)).toEqual(['demo:b_rules']);
    for (const bundle of builtInTargets) {
      const indexes = await indexesFor(bundle);
      expect(blockingProblems(indexes, 'msm:block', block)).toEqual([]);
    }
  });

  it('merges different triggers of one subject from two books into one events patch', () => {
    const a = book([plainRule('a')], [], 'demo:a_rules');
    const b = book(
      [{ do: [CHIME], key: 'b', when: { subject: 'demo:plain_block', trigger: 'block_broken' } }],
      [],
      'demo:b_rules',
    );
    const result = expand([...PROJECT, a, b]);
    const paths = result.patches.map((p) => `${p.elementId} ${p.path.join('/')}`);
    expect(paths).toEqual(['demo:plain_block events', 'demo:plain_block components']);
    const expanded = applyPatches([...PROJECT, a, b], result.patches);
    expect(Object.keys(dataOf(expanded, 'demo:plain_block').events as JsonObject)).toEqual([
      'demo:plain_block_rules_block_used',
      'demo:plain_block_rules_block_broken',
    ]);
  });

  it('reports compile problems on the right book', () => {
    const a = book([plainRule('a')], [], 'demo:a_rules');
    const b = book(
      [{ do: [CHIME], key: 'b', when: { subject: 'demo:nothing', trigger: 'block_used' } }],
      [],
      'demo:b_rules',
    );
    const { problems } = expand([...PROJECT, b, a]);
    expect(problems.map((p) => [p.elementId, p.code, p.path])).toEqual([
      ['demo:b_rules', 'rules.unknown-subject', '/rules/0/when/subject'],
    ]);
  });
});
