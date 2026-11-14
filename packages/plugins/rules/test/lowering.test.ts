/**
 * Lowering of `msm:rules` (ADR 0082 D3): an expanded book lowers its generated script to
 * `msm/<ns>/script/rules/<book path>.ts` (layer `msm`, `language: 'typescript'`); a plain-only,
 * empty or unexpanded book lowers to nothing. Goldens per target under
 * `fixtures/<target id>/expected/<output path>`; `UPDATE_GOLDENS=1` rewrites them.
 */
import { existsSync } from 'node:fs';
import type { Element, Json } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  expandRules,
  lowerRuleBook,
  RulesLoweringError,
  ruleScriptPath,
  rulesKind,
} from '../src/index';
import { applyPatches, book, element, golden, PROJECT } from './support';

const RULES: Json[] = [
  {
    do: [{ sound: 'minecraft:block.note_block.chime', step: 'play_sound' }],
    key: 'chime',
    name: 'Chime',
    when: { subject: 'demo:plain_block', trigger: 'block_used' },
  },
  {
    do: [
      { amount: 1, counter: 'uses', scope: 'player', step: 'add_to_counter' },
      {
        step: 'show_action_bar',
        text: ['Uses: ', { counter: 'uses', scope: 'player', value: 'counter' }],
      },
    ],
    key: 'count_uses',
    only_if: { conditions: [{ condition: 'player_sneaking' }], match: 'all' },
    when: { subject: 'demo:wand', trigger: 'item_used' },
  },
  {
    do: [{ step: 'show_title', title: ['Welcome'] }],
    key: 'welcome',
    when: { trigger: 'player_joined' },
  },
];

const COUNTERS: Json[] = [{ name: 'uses', scope: 'player', start: 0 }];

/** The book as lowering sees it after expansion. */
function expanded(source: Element, target: (typeof builtInTargets)[number]['target']): Element {
  const elements = [...PROJECT, source];
  const { patches, problems } = expandRules({ elements, target });
  expect(problems).toEqual([]);
  const result = applyPatches(elements, patches).find((e) => e.id === source.id);
  if (result === undefined) throw new Error('book lost');
  return result;
}

describe('rule book lowering', () => {
  it('is the kind lowering', () => {
    expect(rulesKind.lower).toBe(lowerRuleBook);
  });

  it('names the script after the book', () => {
    expect(ruleScriptPath('demo:rules')).toBe('msm/demo/script/rules/rules.ts');
    expect(ruleScriptPath('demo:quests/village')).toBe('msm/demo/script/rules/quests/village.ts');
    expect(() => ruleScriptPath('demo:../x')).toThrow(RulesLoweringError);
    expect(() => ruleScriptPath('Demo:x')).toThrow(RulesLoweringError);
  });

  for (const bundle of builtInTargets) {
    const { target } = bundle;
    describe(target.id, () => {
      it('lowers the generated script of an expanded book', async () => {
        const files = await rulesKind.lower(expanded(book(RULES, COUNTERS), target), target);
        expect(files.map((f) => [f.path, f.layer, f.language, f.schema])).toEqual([
          ['msm/demo/script/rules/rules.ts', 'msm', 'typescript', undefined],
        ]);
        const [file] = files;
        if (file === undefined) return;
        const text = new TextDecoder().decode(file.contents as Uint8Array);
        expect(text).toContain('// Made by Rules from demo:rules');
        expect(text).toContain('// rule:count_uses');
        expect(text).toContain('// rule:welcome');
        expect(text).not.toContain('// rule:chime');
        const url = new URL(`./fixtures/${target.id}/expected/${file.path}`, import.meta.url);
        const expected = await golden(url, text);
        if (expected !== null) expect(text).toBe(expected);
      });

      it('lowers a plain, an empty and an unexpanded book to nothing', async () => {
        const plain = book([RULES[0] as Json]);
        expect(await rulesKind.lower(expanded(plain, target), target)).toEqual([]);
        expect(await rulesKind.lower(expanded(book([]), target), target)).toEqual([]);
        expect(await rulesKind.lower(book(RULES, COUNTERS), target)).toEqual([]);
        const odd = element('msm:rules', 'demo:rules', {
          format: 1,
          generated_script: [1, 2],
          rules: [],
        });
        expect(await rulesKind.lower(odd, target)).toEqual([]);
      });

      it('has a golden only for the expected script', () => {
        const folder = new URL(
          `./fixtures/${target.id}/expected/msm/demo/script/rules/`,
          import.meta.url,
        );
        expect(existsSync(new URL('rules.ts', folder))).toBe(true);
      });
    });
  }
});
