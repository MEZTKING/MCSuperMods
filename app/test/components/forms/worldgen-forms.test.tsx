// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Form fixes for the worldgen schemas (B80): dispatchers passed as template type arguments,
 * dispatcher members that are unions (int providers), `%key` dispatchers inside unions (biome
 * environment attributes), dispatcher keys without a member (placement modifiers without
 * settings) and defaults that would nest a provider in itself.
 */
import type { Json } from '@msm/core';
import {
  createSchemaIndex,
  type RawMcdocType,
  type RegistryIndex,
  type SchemaIndex,
  type SchemaNode,
  type VanillaMcdocSymbols,
} from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultValue, resolveNode, SchemaForm } from '../../../src/renderer/src/forms';
import { defaultKey } from '../../../src/renderer/src/forms/schema-utils';
import { completionsFrom, registryIndexFor, schemaIndexFor } from './schemas';

const bundle = builtInTargets[0] as TargetBundle;
let index: SchemaIndex;
let registries: RegistryIndex;

beforeAll(async () => {
  index = await schemaIndexFor(bundle);
  registries = await registryIndexFor(bundle);
});
afterEach(cleanup);

function fallbackLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('textarea')]
    .map((area) => area.getAttribute('aria-label') ?? '')
    .filter((label) => label.endsWith('(JSON)'));
}

function renderForm(node: SchemaNode, value: Json, withCompletions = true) {
  return render(
    <SchemaForm
      node={node}
      value={value}
      onChange={() => undefined}
      maxDepth={64}
      {...(withCompletions ? { completions: completionsFrom(registries) } : {})}
    />,
  );
}

/** The struct field `key` of a resolved struct node. */
function fieldType(node: SchemaNode, key: string): SchemaNode {
  const struct = resolveNode(node);
  if (struct.kind !== 'struct') throw new Error(`Expected a struct for ${key}.`);
  const field = struct.fields.find((entry) => entry.key === key);
  if (field === undefined) throw new Error(`No field ${key}.`);
  return field.type;
}

describe('dispatchers passed as template type arguments', () => {
  const ref = (path: string) => ({ kind: 'reference', path });
  const pair = (key: string, type: unknown) => ({ kind: 'pair', key, type });
  const mcdoc: Record<string, unknown> = {
    '::t::Cases': {
      kind: 'template',
      typeParams: [{ path: '::t::T' }],
      child: {
        kind: 'struct',
        fields: [
          pair('cases', {
            kind: 'list',
            item: { kind: 'concrete', child: ref('::t::Case'), typeArgs: [ref('::t::T')] },
          }),
        ],
      },
    },
    '::t::Case': {
      kind: 'template',
      typeParams: [{ path: '::t::T' }],
      child: { kind: 'struct', fields: [pair('when', ref('::t::T'))] },
    },
    '::t::Select': {
      kind: 'struct',
      fields: [
        pair('kind', { kind: 'string' }),
        {
          kind: 'spread',
          type: {
            kind: 'concrete',
            child: ref('::t::Cases'),
            typeArgs: [
              {
                kind: 'dispatcher',
                registry: 't:value',
                parallelIndices: [{ kind: 'dynamic', accessor: ['kind'] }],
              },
            ],
          },
        },
      ],
    },
  };
  const symbols: VanillaMcdocSymbols = {
    ref: 'test',
    mcdoc: mcdoc as Record<string, RawMcdocType>,
    dispatchers: { 't:value': { number: { kind: 'int' }, text: { kind: 'string' } } } as Record<
      string,
      Record<string, RawMcdocType>
    >,
  };
  const select = createSchemaIndex(symbols, { mcVersion: '1.0' }).resolve('::t::Select');

  it('read their key from the object that instantiated the template', () => {
    const number = render(
      <SchemaForm
        node={select}
        value={{ kind: 'number', cases: [{ when: 3 }] }}
        onChange={() => undefined}
      />,
    );
    expect(fallbackLabels(number.container)).toEqual([]);
    expect((screen.getByRole('spinbutton', { name: 'when' }) as HTMLInputElement).value).toBe('3');
    cleanup();
    const text = render(
      <SchemaForm
        node={select}
        value={{ kind: 'text', cases: [{ when: 'x' }] }}
        onChange={() => undefined}
      />,
    );
    expect(fallbackLabels(text.container)).toEqual([]);
    expect((screen.getByRole('textbox', { name: 'when' }) as HTMLInputElement).value).toBe('x');
  });
});

describe('worldgen sub-forms', () => {
  it('edits an int provider whose member is a union as a form', () => {
    const spawns = index.resolve('::java::data::worldgen::biome::SpawnerData');
    const { container } = renderForm(spawns, {
      type: 'minecraft:cow',
      count: { type: 'minecraft:uniform', min_inclusive: 2, max_inclusive: 4 },
      weight: 8,
    });
    expect(fallbackLabels(container)).toEqual([]);
    expect(
      (screen.getByRole('spinbutton', { name: 'max_inclusive' }) as HTMLInputElement).value,
    ).toBe('4');
  });

  it('edits biome colour attributes keyed by attribute id as values', () => {
    const biome = index.resolveSchemaRef('resource:worldgen/biome');
    const { container } = renderForm(fieldType(biome, 'attributes'), {
      'minecraft:visual/sky_color': 7972607,
    });
    expect(fallbackLabels(container)).toEqual([]);
    expect(screen.queryByText(/matches no variant/)).toBeNull();
  });

  it('shows no fields, and no warning, for a placement modifier without settings', () => {
    const modifier = index.resolve('::java::data::worldgen::feature::placement::PlacementModifier');
    const { container } = renderForm(modifier, { type: 'minecraft:in_square' });
    expect(fallbackLabels(container)).toEqual([]);
    expect(screen.queryByRole('status')).toBeNull();
    const select = screen.getByRole('combobox', { name: 'type' }) as HTMLSelectElement;
    const options = [...select.options].map((option) => option.textContent);
    expect(options).toContain('in_square');
    expect(options).toContain('count');
  });

  it('still warns about a key neither the dispatcher nor the registry knows', () => {
    const modifier = index.resolve('::java::data::worldgen::feature::placement::PlacementModifier');
    const { container } = renderForm(modifier, { type: 'demo:bogus' });
    expect(fallbackLabels(container)).toEqual(['Data (JSON)']);
    expect(screen.getByRole('status').textContent).toMatch(/Unknown minecraft:placement_modifier/);
  });

  it('starts block state providers with a key that does not wrap another provider', () => {
    const provider = index.resolve(
      '::java::data::worldgen::feature::block_state_provider::TypedBlockStateProvider',
    );
    const struct = resolveNode(provider);
    if (struct.kind !== 'struct') throw new Error('Expected a struct.');
    const dispatcher = struct.spreads.map(resolveNode).find((node) => node.kind === 'dispatcher');
    if (dispatcher?.kind !== 'dispatcher') throw new Error('Expected a dispatcher spread.');
    const key = defaultKey(dispatcher);
    expect(key).toBeDefined();
    expect(key).not.toMatch(/^(copy_properties|rotated|randomized_int)/);
    const member = index.dispatch('minecraft:feature_config', 'simple_block');
    if (member === undefined) throw new Error('simple_block is missing.');
    const { container } = renderForm(member, defaultValue(member));
    expect(fallbackLabels(container)).toEqual([]);
  });
});
