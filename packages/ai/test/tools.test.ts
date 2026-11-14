import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AI_TOOL_NAMES,
  type AiToolInputs,
  type AiToolName,
  parseToolInput,
  TOOL_CATALOGUE,
  toolParams,
} from '../src/index';

const EXAMPLES: { [N in AiToolName]: AiToolInputs[N] } = {
  project_summary: {},
  list_kinds: {},
  kind_schema: { kind: 'minecraft:recipe' },
  list_elements: { kind: 'msm:block', namespace: 'ruby_tools', filter: 'ore', cursor: '200' },
  read_element: { id: 'ruby_tools:ruby_ore' },
  list_problems: { elementId: 'ruby_tools:ruby_ore', severity: 'error' },
  list_templates: { kind: 'minecraft:recipe', category: 'Recipes' },
  template_data: { templateId: 'datapack.recipe.shaped', id: 'ruby_tools:ruby_block' },
  list_starters: {},
  target_facts: {},
  script_api_typings: {},
  pending_changes: {},
  create_elements: {
    elements: [
      { id: 'ruby_tools:ruby', kind: 'msm:item', data: { name: 'Ruby' } },
      { id: 'ruby_tools:ruby_block', kind: 'msm:block', data: {} },
    ],
  },
  update_element: { id: 'ruby_tools:ruby', data: { name: 'Polished ruby' } },
  delete_element: { id: 'ruby_tools:ruby' },
  rename_element: { from: 'ruby_tools:ruby', to: 'ruby_tools:red_gem' },
  create_texture: { namespace: 'ruby_tools', path: 'item/ruby', pattern: 'gem', colour: '#d0103a' },
  add_starter: { starterId: 'custom-mob', namespace: 'ruby_tools', values: { name: 'Ruby Golem' } },
  run_checks: { scope: 'pending' },
  propose_plan: {
    title: 'Ruby tools',
    items: [
      {
        itemId: 'mod',
        kind: 'msm:mod',
        elementId: 'ruby_tools:mod',
        summary: 'The mod metadata.',
      },
      {
        itemId: 'ore',
        kind: 'msm:block',
        elementId: 'ruby_tools:ruby_ore',
        summary: 'Ruby ore.',
        dependsOn: ['mod'],
      },
    ],
    assets: [{ namespace: 'ruby_tools', path: 'block/ruby_ore', purpose: 'ore texture' }],
    notes: 'Textures are placeholders.',
  },
  checkpoint: { completedItemIds: ['mod'], nextItemId: 'ore', summary: 'Added the mod element.' },
  note_missing_feature: {
    title: "Set a player's velocity",
    request: 'A launcher that pushes me forward.',
    missing: 'Scripts cannot set velocity.',
    builtInstead: 'A launcher that teleports in small steps.',
  },
};

type SchemaNode = { [key: string]: unknown };

function walk(node: unknown, visit: (n: SchemaNode) => void): void {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit);
  } else if (typeof node === 'object' && node !== null) {
    visit(node as SchemaNode);
    for (const v of Object.values(node)) walk(v, visit);
  }
}

describe('tool catalogue', () => {
  it('has the fixed names in group order', () => {
    expect(AI_TOOL_NAMES).toEqual([
      'project_summary',
      'list_kinds',
      'kind_schema',
      'list_elements',
      'read_element',
      'list_problems',
      'list_templates',
      'template_data',
      'list_starters',
      'target_facts',
      'script_api_typings',
      'pending_changes',
      'create_elements',
      'update_element',
      'delete_element',
      'rename_element',
      'create_texture',
      'add_starter',
      'run_checks',
      'propose_plan',
      'checkpoint',
      'note_missing_feature',
    ]);
    const groups = TOOL_CATALOGUE.map((t) => t.group);
    expect(groups).toEqual([...groups].sort((a, b) => order(a) - order(b)));
  });

  it.each(AI_TOOL_NAMES)('%s parses its example input', (name) => {
    const parsed = parseToolInput(name, EXAMPLES[name]);
    expect(parsed).toEqual({ ok: true, name, input: EXAMPLES[name] });
  });

  it('rejects invalid inputs with zod issues and unknown tools by name', () => {
    const bad = parseToolInput('read_element', { id: 'Not An Id' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toHaveProperty('INVALID_INPUT');
    expect(parseToolInput('create_elements', { elements: [] }).ok).toBe(false);
    expect(parseToolInput('create_texture', { ...EXAMPLES.create_texture, pattern: 'x' }).ok).toBe(
      false,
    );
    expect(parseToolInput('run_checks', { scope: 'pending', extra: 1 }).ok).toBe(true);
    expect(parseToolInput('shell', {})).toEqual({ ok: false, error: { UNKNOWN_TOOL: 'shell' } });
  });

  it('caps create_elements at 64 elements', () => {
    const element = { id: 'a:b', kind: 'minecraft:recipe', data: {} };
    expect(parseToolInput('create_elements', { elements: Array(64).fill(element) }).ok).toBe(true);
    expect(parseToolInput('create_elements', { elements: Array(65).fill(element) }).ok).toBe(false);
  });

  it('renders deterministic API params without $schema', () => {
    const a = toolParams();
    const b = toolParams();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).not.toBe(b);
    expect(a.map((t) => t.name)).toEqual(AI_TOOL_NAMES);
    for (const tool of a) {
      expect(tool.eager_input_streaming).toBe(true);
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema).not.toHaveProperty('$schema');
      expect(tool.description?.length ?? 0).toBeGreaterThan(40);
      expect(JSON.stringify(tool.input_schema)).not.toContain('propertyNames');
      expect(JSON.stringify(tool.input_schema)).not.toContain(String(Number.MAX_SAFE_INTEGER));
    }
  });

  it('closes every object schema with declared properties', () => {
    for (const tool of toolParams()) {
      expect(tool.input_schema.additionalProperties).toBe(false);
      walk(tool.input_schema, (node) => {
        if (node.type === 'object' && typeof node.properties === 'object') {
          expect(node.additionalProperties, `${tool.name}`).toBe(false);
        }
      });
    }
  });

  it('keeps element data a free-form object', () => {
    const create = toolParams().find((t) => t.name === 'create_elements');
    const json = JSON.stringify(create?.input_schema);
    expect(json).toContain('"data":{"type":"object","additionalProperties":true');
  });
});

function order(group: string): number {
  return ['read', 'propose', 'check', 'decide', 'note'].indexOf(group);
}

describe('tool catalogue is frozen (ADR 0055 D11)', () => {
  // The hash last changed in B279: create_texture gained the 22 block family patterns (ADR 0069
  // D2), list_kinds names the block types and list_starters the four block family flows.
  it('has 22 tools in the documented order with unchanged schemas', () => {
    expect(TOOL_CATALOGUE.map((tool) => tool.name)).toEqual([...AI_TOOL_NAMES]);
    expect(TOOL_CATALOGUE).toHaveLength(22);
    expect(createHash('sha256').update(JSON.stringify(TOOL_CATALOGUE)).digest('hex')).toBe(
      '004116788c9084b7ad7d05e55cc3fd9a4778089539ec6bf7d80a20f529e80a2f',
    );
  });
});
