import { describe, expect, it } from 'vitest';
import plugin, {
  RULES_EXPANDER_ID,
  RULES_EXPANDER_KINDS,
  RULES_KIND,
  RULES_PROBLEM_CODES,
  rulesKind,
} from '../src/index';

describe('@msm/plugin-rules', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.rules');
    expect(plugin.apiVersion).toBe('^1.0.0');
    expect(Object.isFrozen(plugin)).toBe(true);
  });

  it('contributes the msm:rules kind', () => {
    expect(plugin.contributes.elementKinds?.map((kind) => kind.id)).toEqual(['msm:rules']);
    expect(rulesKind).toMatchObject({
      id: RULES_KIND,
      schema: 'msm:rules',
      folder: 'rules',
      defaultData: { counters: [], format: 1, rules: [] },
      hiddenPaths: ['/generated_script'],
    });
    expect(rulesKind.registry).toBeUndefined();
    expect(rulesKind.previewKind).toBeUndefined();
  });

  it('contributes the expander, the validator and six templates', () => {
    expect(plugin.contributes.projectExpanders?.map((expander) => expander.id)).toEqual([
      RULES_EXPANDER_ID,
    ]);
    expect(RULES_EXPANDER_KINDS).toEqual([
      'msm:rules',
      'msm:block',
      'msm:effect',
      'msm:entity',
      'msm:item',
      'msm:key_bind',
      'msm:vehicle',
    ]);
    expect(plugin.contributes.validators?.map((validator) => validator.id)).toEqual([
      'msm.rules.book',
    ]);
    expect(plugin.contributes.elementTemplates).toHaveLength(6);
  });

  it('lists every problem code once, sorted, all rules.*', () => {
    expect([...RULES_PROBLEM_CODES].sort()).toEqual(RULES_PROBLEM_CODES);
    expect(new Set(RULES_PROBLEM_CODES).size).toBe(RULES_PROBLEM_CODES.length);
    for (const code of RULES_PROBLEM_CODES) expect(code).toMatch(/^rules\.[a-z-]+$/);
    expect(RULES_PROBLEM_CODES).toContain('rules.duplicate-key');
    expect(RULES_PROBLEM_CODES).toContain('rules.unknown-step');
    expect(RULES_PROBLEM_CODES).toContain('rules.unknown-hud');
    expect(RULES_PROBLEM_CODES).toHaveLength(23);
  });
});
