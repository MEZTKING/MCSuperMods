/**
 * The `msm.rules.book` validator (ADR 0082 D6): duplicate keys, counter names, duplicate and
 * undeclared counters, unknown `any_` subjects and a script saved where a book's generated
 * script goes. The compiler's own checks are the expander's (`expander.test.ts`).
 */
import type { Element, Json, Problem, ValidationRegistry } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { RULES_VALIDATOR_CODES, rulesBookValidator } from '../src/index';
import { book, element, indexesFor, PROJECT } from './support';

const [first] = builtInTargets;
if (first === undefined) throw new Error('no built-in target');
const target = first.target;

async function validate(elements: readonly Element[]): Promise<Problem[]> {
  const indexes = await indexesFor(first as (typeof builtInTargets)[number]);
  const registry: ValidationRegistry = {
    has: (name, id) => indexes.registries.has(name, id),
    ids: (name) => indexes.registries.ids(name),
  };
  return rulesBookValidator.validate({ elements: [...PROJECT, ...elements], target, registry });
}

const summary = (problems: Problem[]) =>
  problems.map((p) => [p.severity, p.code, p.elementId, p.path]);

const CHIME = { sound: 'minecraft:block.note_block.chime', step: 'play_sound' };
const rule = (key: string, extra: Record<string, Json> = {}): Json => ({
  do: [CHIME],
  key,
  when: { subject: 'demo:plain_block', trigger: 'block_used' },
  ...extra,
});

describe('msm.rules.book validator', () => {
  it('reads books and scripts', () => {
    expect(rulesBookValidator.kinds).toEqual(['msm:rules', 'msm:script']);
  });

  it('passes a good book', async () => {
    const counter = { amount: 1, counter: 'clicks', scope: 'player', step: 'add_to_counter' };
    const good = book(
      [rule('a', { do: [counter] }), rule('b')],
      [{ name: 'clicks', scope: 'player', start: 0 }],
    );
    expect(await validate([good])).toEqual([]);
  });

  it('reports duplicate keys on the later rule', async () => {
    const problems = await validate([book([rule('a'), rule('b'), rule('a')])]);
    expect(summary(problems)).toEqual([
      ['error', RULES_VALIDATOR_CODES.duplicateKey, 'demo:rules', '/rules/2/key'],
    ]);
    expect(problems[0]?.message).toContain('rule 1');
  });

  it('reports bad and duplicate counter names', async () => {
    const problems = await validate([
      book(
        [],
        [
          { name: 'Clicks!', scope: 'player' },
          { name: 'hits', scope: 'world' },
          { name: 'hits', scope: 'world' },
          { name: 'hits', scope: 'player' },
        ],
      ),
    ]);
    expect(summary(problems)).toEqual([
      ['error', RULES_VALIDATOR_CODES.badCounterName, 'demo:rules', '/counters/0/name'],
      ['error', RULES_VALIDATOR_CODES.duplicateCounter, 'demo:rules', '/counters/2/name'],
    ]);
  });

  it('warns once per rule about undeclared counters in steps, conditions and values', async () => {
    const value = { counter: 'goal', scope: 'world', value: 'counter' };
    const problems = await validate([
      book(
        [
          rule('a', {
            do: [
              { amount: 1, counter: 'clicks', scope: 'player', step: 'add_to_counter' },
              { amount: 2, counter: 'clicks', scope: 'player', step: 'add_to_counter' },
              {
                conditions: [
                  { compare: 'at_least', condition: 'counter', counter: 'hits', number: value },
                ],
                do: [CHIME],
                match: 'all',
                step: 'if',
              },
            ],
          }),
        ],
        [{ name: 'hits', scope: 'world' }],
      ),
    ]);
    expect(summary(problems)).toEqual([
      ['warning', RULES_VALIDATOR_CODES.undeclaredCounter, 'demo:rules', '/rules/0/do/0/counter'],
      [
        'warning',
        RULES_VALIDATOR_CODES.undeclaredCounter,
        'demo:rules',
        '/rules/0/do/2/conditions/0/number/counter',
      ],
    ]);
  });

  it('reports unknown subjects of any_ triggers, vanilla and project ids known', async () => {
    const any = (key: string, trigger: string, subject?: string): Json => ({
      do: [{ step: 'show_message', text: ['Hi'] }],
      key,
      when: subject === undefined ? { trigger } : { subject, trigger },
    });
    const problems = await validate([
      book([
        any('a', 'any_block_broken', 'minecraft:stone'),
        any('b', 'any_block_broken', 'demo:plain_block'),
        any('c', 'any_block_broken', 'minecraft:not_a_block'),
        any('d', 'any_item_used', 'minecraft:zombie'),
        any('e', 'any_mob_died', 'minecraft:zombie'),
        any('f', 'any_mob_died'),
        any('g', 'any_mob_used', 'demo:ruby'),
      ]),
    ]);
    expect(summary(problems)).toEqual([
      ['error', 'rules.unknown-subject', 'demo:rules', '/rules/2/when/subject'],
      ['error', 'rules.unknown-subject', 'demo:rules', '/rules/3/when/subject'],
      ['error', 'rules.unknown-subject', 'demo:rules', '/rules/6/when/subject'],
    ]);
  });

  it('warns about a script saved where the generated script goes', async () => {
    const script = element('msm:script', 'demo:rules/rules', { lines: [] });
    const other = element('msm:script', 'demo:rules/other', { lines: [] });
    const problems = await validate([book([]), script, other]);
    expect(summary(problems)).toEqual([
      ['warning', RULES_VALIDATOR_CODES.scriptPathClash, 'demo:rules', undefined],
    ]);
  });

  it('survives junk data', async () => {
    const junk = element('msm:rules', 'demo:junk', {
      counters: [1, null, { scope: 'world' }],
      format: 1,
      rules: [null, 'x', { key: 3, when: 'no' }],
    });
    expect(await validate([junk])).toEqual([]);
  });
});
