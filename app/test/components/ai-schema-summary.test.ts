/**
 * The AI helper's `kind_schema` summary (ADR 0041 D4) is complete for `msm:rules` (ADR 0082
 * D10): every trigger, step, logic step and condition id is listed and every trigger and step
 * case is rendered, through the kind's allowance. `msm:block` shows all 38 block types and the
 * vehicle, key bind and command kinds their event action types through their allowances (ADRs
 * 0091 D8, 0101 D7); the HUD, creative tab and item kinds are complete within the defaults.
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
    expect(kindSchemaSummaryOptions('msm:hud')).toBe(KIND_SCHEMA_SUMMARY_OPTIONS);
    expect(kindSchemaSummaryOptions('msm:item')).toBe(KIND_SCHEMA_SUMMARY_OPTIONS);
  });
});

/** Every block type the format has (ADR 0067 to 0078 and the twenty of ADR 0094). */
const BLOCK_TYPES = [
  'bed',
  'berry_bush',
  'block',
  'button',
  'cake',
  'candle',
  'carpet',
  'chain',
  'cocoa',
  'crop',
  'directional',
  'door',
  'fence',
  'fence_gate',
  'hanging_sign',
  'horizontal',
  'ladder',
  'lantern',
  'layers',
  'leaves',
  'pane',
  'pillar',
  'portal',
  'potted_plant',
  'pressure_plate',
  'rod',
  'sapling',
  'scaffolding',
  'sea_pickle',
  'sign',
  'slab',
  'stairs',
  'stem',
  'tall_plant',
  'trapdoor',
  'vine',
  'wall',
];

describe('kind_schema for the vehicle, controls and vanilla parity kinds (ADRs 0091 D8, 0101 D7)', () => {
  const complete = (text: string) => {
    expect(text).not.toContain('(truncated');
    expect(text).not.toContain('in all)');
    expect(text).not.toContain('(other cases not shown)');
  };

  for (const bundle of builtInTargets) {
    it(`renders every block type and the new components on ${bundle.target.id}`, async () => {
      const index = await schemaIndexFor(bundle);
      const options = kindSchemaSummaryOptions('msm:block');
      const text = kindSchemaSummary(index.resolveSchemaRef('msm:block'), options);
      complete(text);
      expect(text.length).toBeLessThanOrEqual(options.maxChars);
      for (const type of BLOCK_TYPES) expect(text, type).toContain(`case ${type}: {`);
      for (const field of ['wood_type', 'fruit_soil', 'bonemeal', 'hanging_gui', 'attached']) {
        expect(text, field).toContain(field);
      }
      for (const component of ['msm:waterloggable', 'msm:weathering', 'msm:waxable']) {
        expect(text, component).toContain(`${component}?:`);
      }
      // The default bounds cut the types short, which is why the kind has an allowance.
      expect(kindSchemaSummary(index.resolveSchemaRef('msm:block'))).toContain(
        '(other cases not shown)',
      );
    });

    it(`renders bags and bundles on msm:item within the defaults on ${bundle.target.id}`, async () => {
      const index = await schemaIndexFor(bundle);
      const text = kindSchemaSummary(index.resolveSchemaRef('msm:item'));
      expect(text).not.toContain('(truncated');
      for (const field of [
        'msm:item_inventory?:',
        'msm:bundle?:',
        'sneak_use',
        'bundle_textures',
      ]) {
        expect(text, field).toContain(field);
      }
    });

    it(`renders msm:vehicle, msm:key_bind, msm:hud, msm:command and msm:creative_tab in full on ${bundle.target.id}`, async () => {
      const index = await schemaIndexFor(bundle);
      const summary = (kind: string) =>
        kindSchemaSummary(index.resolveSchemaRef(kind), kindSchemaSummaryOptions(kind));
      const terms: Record<string, string[]> = {
        'msm:vehicle': ['"hover"', 'max_speed', 'ticks: int', 'muzzle', 'turret', '"set_hud"'],
        'msm:key_bind': ['default_key', '"driving"', 'msm:on_press', '"show_hud"'],
        'msm:hud': ['"above_hotbar"', 'case vehicle: {', '"speed"', 'case data: {', '"driving"'],
        'msm:command': ['"block_position"', 'permission', 'feedback_text', '"run_function"'],
        'msm:creative_tab': ['icon: id(item)', '"by_name"', 'display_name'],
      };
      for (const [kind, words] of Object.entries(terms)) {
        const text = summary(kind);
        complete(text);
        expect(text.length, kind).toBeLessThanOrEqual(kindSchemaSummaryOptions(kind).maxChars);
        for (const word of words) expect(text, `${kind}: ${word}`).toContain(word);
      }
    });
  }
});
