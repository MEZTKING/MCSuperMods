/**
 * The AI helper's `kind_schema` summary (ADR 0041 D4) is complete for `msm:rules` (ADR 0082
 * D10): every trigger, step, logic step and condition id is listed and every trigger and step
 * case is rendered, through the kind's allowance. `msm:block` shows all 38 block types and the
 * vehicle, key bind and command kinds their event action types through their allowances (ADRs
 * 0091 D8, 0101 D7); the HUD, creative tab and item kinds are complete within the defaults.
 * Batch 2 (B484): the trader levels of `msm:entity`, the events of `msm:fluid` and every
 * environment attribute of `minecraft:dimension_type` show through their allowances; the
 * profession and the trade data kinds show every field within the defaults, and a type that
 * contains itself no longer overflows the stack.
 * Vanilla parity 3 batch 2 (B543, B544): `msm:entity` shows the swoop and roost goals and the
 * open_dialog action with their fields, and `msm:rules` stays under its 31,000 characters.
 * Game modes (B561): the six games kinds render whole, `msm:one_block` through its allowance.
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

describe('kind_schema for batch 2 (ADRs 0098 to 0100, B484)', () => {
  const complete = (text: string) => {
    expect(text).not.toContain('(truncated');
    expect(text).not.toContain('in all)');
    expect(text).not.toContain('(other cases not shown)');
  };

  for (const bundle of builtInTargets) {
    const targetId = bundle.target.id;

    it(`renders the trader levels, storage and shoulder components of msm:entity on ${targetId}`, async () => {
      const index = await schemaIndexFor(bundle);
      const options = kindSchemaSummaryOptions('msm:entity');
      const text = kindSchemaSummary(index.resolveSchemaRef('msm:entity'), options);
      complete(text);
      expect(text.length).toBeLessThanOrEqual(options.maxChars);
      for (const word of [
        'msm:trader?:',
        'trade_set: id(trade_set)',
        'xp_to_next?:',
        '"twice_a_day"',
        'on_trade?:',
        'msm:storage?:',
        'needs_chest?:',
        'msm:shoulder_riding?:',
      ]) {
        expect(text, word).toContain(word);
      }
      // The default depth hides the level's fields, which is why the kind has an allowance.
      expect(kindSchemaSummary(index.resolveSchemaRef('msm:entity'))).not.toContain(
        'trade_set: id(trade_set)',
      );
    });

    it(`renders msm:villager_profession and msm:fluid in full on ${targetId}`, async () => {
      const index = await schemaIndexFor(bundle);
      const terms: Record<string, string[]> = {
        'msm:villager_profession': [
          'job_site: id(block)',
          'trade_sets?: list<id(trade_set)> 5..5',
          'work_sound?:',
          'requested_items?:',
          'secondary_job_blocks?:',
          'zombie_villager?:',
        ],
        'msm:fluid': [
          '"water" | "lava" | "none"',
          'tick_delay?: int 1..100',
          'drop_off?: int 1..4',
          'light?: int 0..15',
          'on_entity_inside?:',
          '"run_function"',
          'bucket?: id(texture)',
        ],
      };
      for (const [kind, words] of Object.entries(terms)) {
        const options = kindSchemaSummaryOptions(kind);
        const text = kindSchemaSummary(index.resolveSchemaRef(kind), options);
        complete(text);
        expect(text.length, kind).toBeLessThanOrEqual(options.maxChars);
        for (const word of words) expect(text, `${kind}: ${word}`).toContain(word);
      }
    });

    it(`renders every environment attribute of minecraft:dimension_type on ${targetId}`, async () => {
      const index = await schemaIndexFor(bundle);
      const options = kindSchemaSummaryOptions('minecraft:dimension_type');
      const text = kindSchemaSummary(index.resolveSchemaRef('resource:dimension_type'), options);
      complete(text);
      expect(text.length).toBeLessThanOrEqual(options.maxChars);
      const attributes = bundle.target.worldgen.environmentAttributes ?? [];
      expect(attributes.length).toBeGreaterThan(40);
      for (const id of attributes) {
        expect(text, id).toContain(`case ${id.replace(/^minecraft:/, '')}:`);
      }
      for (const word of ['min_y', 'logical_height', 'skybox?:', 'default_clock?:']) {
        expect(text, word).toContain(word);
      }
      // The default bounds cut the attributes short, which is why the kind has an allowance.
      expect(kindSchemaSummary(index.resolveSchemaRef('resource:dimension_type'))).toContain(
        '(other cases not shown)',
      );
    });

    it(`renders the trade data kinds within the defaults on ${targetId}`, async () => {
      const index = await schemaIndexFor(bundle);
      const trade = kindSchemaSummary(index.resolveSchemaRef('resource:villager_trade'));
      expect(trade).not.toContain('(truncated');
      for (const word of [
        'wants:',
        'additional_wants?:',
        'gives:',
        'max_uses?:',
        'xp?:',
        'reputation_discount?:',
        'merchant_predicate?:',
      ]) {
        expect(trade, word).toContain(word);
      }
      const set = kindSchemaSummary(index.resolveSchemaRef('resource:trade_set'));
      complete(set);
      for (const word of ['trades: id(villager_trade) | list<id(villager_trade)>', 'amount:']) {
        expect(set, word).toContain(word);
      }
      const tag = kindSchemaSummary(index.resolveSchemaRef('tag:villager_trade'));
      complete(tag);
      expect(tag).toContain('id(villager_trade)');
    });
  }
});

describe('kind_schema for vanilla parity 3 batch 2 (B543)', () => {
  for (const bundle of builtInTargets) {
    const targetId = bundle.target.id;

    it(`renders the swoop and roost goals and the open_dialog action of msm:entity whole on ${targetId}`, async () => {
      const index = await schemaIndexFor(bundle);
      const options = kindSchemaSummaryOptions('msm:entity');
      const text = kindSchemaSummary(index.resolveSchemaRef('msm:entity'), options);
      expect(text).not.toContain('(truncated');
      expect(text).not.toContain('(other cases not shown)');
      expect(text.length).toBeLessThanOrEqual(options.maxChars);
      for (const name of ['swoop', 'roost', 'open_dialog']) {
        expect(text, name).toContain(`case ${name}: {`);
        // Shown with its fields, not cut to `{...}`.
        expect(text, name).not.toContain(`case ${name}: {...}`);
      }
      for (const field of ['when_idle?: boolean', 'must_see?: boolean', 'dialog: id(dialog)']) {
        expect(text, field).toContain(field);
      }
    });

    it(`keeps msm:rules under 31,000 characters on ${targetId}`, async () => {
      const index = await schemaIndexFor(bundle);
      const options = kindSchemaSummaryOptions('msm:rules');
      expect(options.maxChars).toBe(31_000);
      const text = kindSchemaSummary(index.resolveSchemaRef('msm:rules'), options);
      expect(text).not.toContain('(truncated');
      expect(text.length).toBeLessThan(31_000);
    });
  }
});

describe('kind_schema for the games kinds (B561)', () => {
  /** Words each games kind's summary must show (fields below the default depth among them). */
  const TERMS: Readonly<Record<string, readonly string[]>> = {
    'msm:world_setup': [
      '"vanilla" | "void" | "flat" | "sky_islands" | "preset"',
      'structure: id(structure)',
      '"first_join" | "world_generation"',
      'game_rules:',
      'new_player?:',
      'loot_table?: id(loot_table)',
      'goals?: id(advancement)',
    ],
    'msm:one_block': [
      'phases: list 1..64 of',
      'block: id(block)',
      'mob: id(entity_type)',
      'weight: int 1..',
      'chest_loot?: id(loot_table)',
    ],
    'msm:team': ['colour:', 'friendly_fire: boolean', 'name_tags:', 'collision:'],
    'msm:objective': ['criterion:', '"sidebar"', 'render:', 'case styled: {'],
    'msm:timer': ['seconds: int 1..86400', '"down" | "up"', '"boss_bar"', 'on_end?: id(function)'],
    'msm:area': ['from: list<int> 3..3', 'to: list<int> 3..3', 'structure: id(structure)'],
  };

  for (const bundle of builtInTargets) {
    const targetId = bundle.target.id;

    it(`renders every games kind whole on ${targetId}`, async () => {
      const index = await schemaIndexFor(bundle);
      for (const [kind, words] of Object.entries(TERMS)) {
        const options = kindSchemaSummaryOptions(kind);
        const text = kindSchemaSummary(index.resolveSchemaRef(kind), options);
        expect(text, kind).not.toContain('(truncated');
        expect(text, kind).not.toContain('in all)');
        expect(text, kind).not.toContain('(other cases not shown)');
        expect(text, kind).not.toContain('{...}');
        expect(text.length, kind).toBeLessThanOrEqual(options.maxChars);
        for (const word of words) expect(text, `${kind}: ${word}`).toContain(word);
      }
      // The default depth hides a phase's blocks, which is why the kind has an allowance.
      expect(kindSchemaSummary(index.resolveSchemaRef('msm:one_block'))).not.toContain(
        'block: id(block)',
      );
    });
  }
});
