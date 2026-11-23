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
  search_library: { query: 'a blue swrod', limit: 5 },
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
  create_texture: {
    namespace: 'ruby_tools',
    path: 'item/ruby',
    recipe: 'gem',
    colour: '#d0103a',
    accent: '#f0e0a0',
    finish: 'gem',
    seed: 3,
  },
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
      'search_library',
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
    expect(parseToolInput('create_texture', { ...EXAMPLES.create_texture, recipe: 'x' }).ok).toBe(
      false,
    );
    expect(parseToolInput('run_checks', { scope: 'pending', extra: 1 }).ok).toBe(true);
    expect(parseToolInput('shell', {})).toEqual({ ok: false, error: { UNKNOWN_TOOL: 'shell' } });
  });

  it('create_texture takes a recipe or the older pattern, a seed in range and a finish', () => {
    const base = { namespace: 'frost', path: 'item/frost_sword' };
    expect(parseToolInput('create_texture', { ...base, recipe: 'sword' }).ok).toBe(true);
    expect(parseToolInput('create_texture', { ...base, pattern: 'egg' }).ok).toBe(true);
    expect(parseToolInput('create_texture', base).ok).toBe(false);
    expect(parseToolInput('create_texture', { ...base, recipe: 'sword', seed: -1 }).ok).toBe(false);
    expect(parseToolInput('create_texture', { ...base, recipe: 'sword', seed: 1.5 }).ok).toBe(
      false,
    );
    expect(parseToolInput('create_texture', { ...base, recipe: 'sword', seed: 1_000_000 }).ok).toBe(
      false,
    );
    expect(parseToolInput('create_texture', { ...base, recipe: 'block', finish: 'Metal' }).ok).toBe(
      false,
    );
    expect(parseToolInput('create_texture', { ...base, recipe: 'gem', accent: 'red' }).ok).toBe(
      false,
    );
  });

  it('search_library takes words, a bounded limit and a cursor (ADR 0124 D12)', () => {
    expect(parseToolInput('search_library', { query: 'ore' }).ok).toBe(true);
    expect(parseToolInput('search_library', { query: 'ore', limit: 25, cursor: '25' }).ok).toBe(
      true,
    );
    expect(parseToolInput('search_library', { query: '' }).ok).toBe(false);
    expect(parseToolInput('search_library', { query: 'x'.repeat(201) }).ok).toBe(false);
    expect(parseToolInput('search_library', { query: 'ore', limit: 0 }).ok).toBe(false);
    expect(parseToolInput('search_library', { query: 'ore', limit: 26 }).ok).toBe(false);
    expect(parseToolInput('search_library', { query: 'ore', limit: 2.5 }).ok).toBe(false);
    expect(parseToolInput('search_library', {}).ok).toBe(false);
    const tool = toolParams().find((t) => t.name === 'search_library');
    expect(tool?.input_schema).toMatchObject({
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 200 },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
        cursor: { type: 'string' },
      },
      additionalProperties: false,
    });
    const read = TOOL_CATALOGUE.find((t) => t.name === 'search_library');
    expect(read?.group).toBe('read');
    expect(read?.description).toContain('before list_starters or list_templates');
    expect(read?.description).toContain('ids only');
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
  // The hash last changed with B669: the read-only search_library (ADR 0124 D12) before
  // list_templates. Before that with B557: create_texture's recipe list gained the lucky block, flag
  // and timer of the game flows (ADR 0117 D2). Before that with B682: propose_plan is called first only for a whole mod or more
  // than three main things (ADR 0125 D2), and no description says "placeholder" or "changeset"
  // (D13). Before that with B539: create_texture's recipe list gained the boat, the boat
  // bodies and the villager clothes (ADR 0110, ADR 0107 D5, ADR 0112 D2). Before that with B518:
  // create_texture's recipe list gained the strand, stalk,
  // lichen, dripleaf and pot of the plant flows (ADR 0103, ADR 0112 D2). Before that with B508: create_texture's recipe list gained the nine pattern
  // pictures of the data-only flows (ADR 0106 D4), kept equal to the library's ART_RECIPE_IDS.
  // Before that with B498: create_texture draws MSM's Minecraft-like art from a recipe (with the
  // older pattern still accepted), a second colour, a finish and a seed, and its description and
  // add_starter's and list_starters' no longer call the pictures placeholders (ADR 0092 D15).
  it('has 23 tools in the documented order with unchanged schemas', () => {
    expect(TOOL_CATALOGUE.map((tool) => tool.name)).toEqual([...AI_TOOL_NAMES]);
    expect(TOOL_CATALOGUE).toHaveLength(23);
    expect(createHash('sha256').update(JSON.stringify(TOOL_CATALOGUE)).digest('hex')).toBe(
      'ff54504be77f230254911ce82740098ebe36f1192ca6a3ffffba2425872567e9',
    );
  });
});
