/**
 * The AI helper's `kind_schema` summary (ADR 0041 D4) is complete for `msm:rules` (ADR 0082
 * D10): every trigger, step, logic step and condition id is listed and every trigger and step
 * case is rendered, through the kind's allowance; other kinds keep the default bounds.
 */
import { CONDITIONS, STEPS, TRIGGERS } from '@msm/plugin-rules';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  KIND_SCHEMA_SUMMARY_OPTIONS,
  kindSchemaSummary,
  kindSchemaSummaryOptions,
} from '../../src/renderer/src/ai/schema-summary';
import { schemaIndexFor } from './forms/schemas';

describe('kind_schema for msm:rules', () => {
  for (const bundle of builtInTargets) {
    it(`lists every trigger, step and condition on ${bundle.target.id}`, async () => {
      const index = await schemaIndexFor(bundle);
      const options = kindSchemaSummaryOptions('msm:rules');
      const text = kindSchemaSummary(index.resolveSchemaRef('msm:rules'), options);
      expect(text).not.toContain('(truncated');
      expect(text).not.toContain('in all)');
      expect(text).not.toContain('(other cases not shown)');
      for (const trigger of TRIGGERS) expect(text).toContain(`"${trigger.id}"`);
      for (const step of STEPS) expect(text).toContain(`"${step.id}"`);
      for (const condition of CONDITIONS) expect(text).toContain(`"${condition.id}"`);
      // Every step with fields is rendered as a case with its own structure.
      for (const step of STEPS) {
        if (step.slots.length > 0) expect(text, step.id).toContain(`case ${step.id}: {`);
      }
      // The default bounds cut it short, which is why the kind has an allowance.
      const plain = kindSchemaSummary(index.resolveSchemaRef('msm:rules'));
      expect(plain).toContain(`(${TRIGGERS.length} in all)`);
    });
  }

  it('keeps the default bounds for other kinds', () => {
    expect(kindSchemaSummaryOptions('msm:block')).toBe(KIND_SCHEMA_SUMMARY_OPTIONS);
  });
});
