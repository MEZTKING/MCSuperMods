// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Dispatchers in field position (B32 `indexed` types and `%key` map values): the member is
 * selected from a sibling field or the entry key, as `validateJson` reads it.
 */
import type { Json } from '@msm/core';
import { type SchemaIndex, type SchemaNode, validateJson } from '@msm/schemas';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultValue, resolveNode, SchemaForm } from '../../../src/renderer/src/forms';
import { schemaIndex } from './schemas';

let index: SchemaIndex;
let condition: SchemaNode;
let valueNode: SchemaNode & { kind: 'dispatcher' };

beforeAll(async () => {
  index = await schemaIndex();
  const member = index.dispatch('minecraft:loot_condition', 'environment_attribute_check');
  if (member === undefined) throw new Error('environment_attribute_check is missing.');
  condition = member;
  const struct = resolveNode(member);
  if (struct.kind !== 'struct') throw new Error('Expected a struct.');
  const value = struct.fields.find((field) => field.key === 'value');
  const node = value === undefined ? undefined : resolveNode(value.type);
  if (node?.kind !== 'dispatcher') throw new Error('Expected a dispatcher at value.');
  valueNode = node;
});
afterEach(cleanup);

/** The first attribute whose `value` member resolves to the given node kind. */
function attributeOfKind(kind: SchemaNode['kind']): string {
  const key = valueNode
    .keys()
    .filter((entry) => !entry.startsWith('%'))
    .find((entry) => {
      const member = valueNode.dispatch(entry);
      return member !== undefined && resolveNode(member).kind === kind;
    });
  if (key === undefined) throw new Error(`No attribute with a ${kind} value.`);
  return key;
}

function fallbackLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('textarea')]
    .map((area) => area.getAttribute('aria-label') ?? '')
    .filter((label) => label.endsWith('(JSON)'));
}

function renderCondition(value: Json) {
  const onChange = vi.fn();
  const view = render(<SchemaForm node={condition} value={value} onChange={onChange} />);
  return { onChange, ...view };
}

describe('SchemaForm field-position dispatchers', () => {
  it('reads the member of value from the sibling attribute', () => {
    const attribute = attributeOfKind('number');
    const { container, onChange } = renderCondition({ attribute, value: 0.5 });
    expect(fallbackLabels(container)).toEqual([]);
    const input = screen.getByRole('spinbutton', { name: 'value' }) as HTMLInputElement;
    expect(input.value).toBe('0.5');
    fireEvent.change(input, { target: { value: '0.25' } });
    expect(onChange).toHaveBeenCalledWith('/value', 0.25, expect.anything());
  });

  it('accepts a minecraft: prefix on the sibling key', () => {
    const attribute = `minecraft:${attributeOfKind('boolean')}`;
    renderCondition({ attribute, value: true });
    expect(screen.getByRole('switch', { name: 'value' }).getAttribute('aria-checked')).toBe('true');
  });

  it('falls back to JSON with a notice when the sibling is missing or unknown', () => {
    const missing = renderCondition({ value: 1 });
    expect(fallbackLabels(missing.container)).toEqual(['value (JSON)']);
    expect(screen.getByText(/Set "attribute" to choose/)).toBeTruthy();
    cleanup();
    // `%unknown` selects `any`, which is edited as JSON too.
    const unknown = renderCondition({ attribute: 'demo:not_an_attribute', value: 1 });
    expect(fallbackLabels(unknown.container)).toEqual(['value (JSON)']);
  });

  it('defaults the sibling discriminator before the dependent field', () => {
    const value = defaultValue(condition) as { attribute: string; value: Json };
    const first = valueNode.keys().filter((entry) => !entry.startsWith('%'))[0];
    expect(value.attribute).toBe(first);
    const member = valueNode.dispatch(value.attribute);
    if (member === undefined) throw new Error('No member for the default attribute.');
    expect(value.value).toEqual(defaultValue(member));
    const errors = validateJson(value, condition).filter((p) => p.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('edits a %key map value with the member the entry key selects', () => {
    const recipe = index.resolveSchemaRef('resource:recipe');
    const data: Json = {
      type: 'minecraft:stonecutting',
      ingredient: 'minecraft:stone',
      result: { id: 'minecraft:stone_slab', count: 2, components: { 'minecraft:max_damage': 7 } },
    };
    const { container } = render(<SchemaForm node={recipe} value={data} onChange={vi.fn()} />);
    expect(fallbackLabels(container)).toEqual([]);
    const input = screen.getByRole('spinbutton', {
      name: 'minecraft:max_damage',
    }) as HTMLInputElement;
    expect(input.value).toBe('7');
  });
});
