// @vitest-environment happy-dom
import type { Element } from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import { dataPackKinds } from '@msm/plugin-datapack';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_STUDIOS, ElementForm } from '../../src/renderer/src/studios/ElementForm';
import {
  collectStudios,
  DISCOVERED_STUDIOS,
  mergeStudios,
  studioFor,
} from '../../src/renderer/src/studios/studio-registry';
import type { StudioEntry, StudioProps } from '../../src/renderer/src/studios/types';
import type { SchemaContextState } from '../../src/renderer/src/studios/use-schema-context';
import { element, sampleProject } from './fixtures';
import { schemaIndex } from './forms/schemas';

afterEach(cleanup);

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const kindOf = (id: string) => dataPackKinds.find((kind) => kind.id === id) as ElementKind;

function FakeStudio(props: StudioProps) {
  return (
    <section aria-label="Fake Studio" data-testid="fake-studio">
      <span data-testid="fake-target">{props.target.id}</span>
      <button
        type="button"
        onClick={() => {
          props.onChange('/a', 1, { coalesce: 'fake-gesture' });
          props.onChange('/b', 2, { coalesce: 'fake-gesture' });
        }}
      >
        Edit both
      </button>
      {props.form}
    </section>
  );
}

const fakeEntry: StudioEntry = {
  id: 'test.fake',
  kindId: 'minecraft:advancement',
  component: FakeStudio,
  coalesceKeys: ['fake-gesture'],
};

/** What `import.meta.glob('./*\/studios.tsx', { eager: true })` returns for two areas. */
const fakeGlob: Record<string, unknown> = {
  './worldgen/studios.tsx': {
    studios: [
      {
        id: 'test.biome',
        matches: (subject: Element) => subject.kind === 'minecraft:worldgen/biome',
        component: FakeStudio,
      },
    ],
  },
  './structures/studios.tsx': { default: [fakeEntry] },
};

describe('studio registry', () => {
  it('collects area modules in path order and validates their entries', () => {
    expect(collectStudios(fakeGlob).map((entry) => entry.id)).toEqual(['test.fake', 'test.biome']);
    expect(collectStudios({})).toEqual([]);
    expect(() => collectStudios({ './x/studios.tsx': {} })).toThrow(/must export "studios"/);
    expect(() =>
      collectStudios({ './x/studios.tsx': { studios: [{ id: 'x', component: FakeStudio }] } }),
    ).toThrow(/kindId or matches/);
    // The app's own area Studios (`studios/<area>/studios.tsx`) are discovered.
    expect(DISCOVERED_STUDIOS.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'msm.structure-template',
        'msm.template-pool',
        'msm.worldgen.biome',
        'msm.worldgen.placed-feature',
      ]),
    );
  });

  it('merges the built-in Studios first and picks the first match', () => {
    const all = mergeStudios(BUILT_IN_STUDIOS, collectStudios(fakeGlob), [
      { ...fakeEntry, kindId: 'minecraft:function' },
    ]);
    expect(all.map((entry) => entry.id)).toEqual([
      'msm.lang',
      'msm.pack-settings',
      'msm.function',
      'msm.recipe',
      'msm.tag',
      'test.fake',
      'test.biome',
    ]);
    const biome = element('demo:b', 'minecraft:worldgen/biome', {});
    expect(studioFor(biome, kindOf('minecraft:function'), all)?.id).toBe('test.biome');
    const fn = element('demo:f', 'minecraft:function', { lines: ['say'] });
    expect(studioFor(fn, kindOf('minecraft:function'), all)?.id).toBe('msm.function');
    const raw = element('demo:f', 'minecraft:function', { lines: 3 });
    expect(studioFor(raw, kindOf('minecraft:function'), all)).toBeUndefined();
    const tag = element('demo:t', 'minecraft:tag/item', {});
    expect(studioFor(tag, kindOf('minecraft:tag/item'), all)?.id).toBe('msm.tag');
  });
});

describe('ElementForm with a registered Studio', () => {
  let schema: SchemaContextState;
  beforeAll(async () => {
    const registries = createRegistryIndex({ vanilla: {} });
    schema = {
      status: 'ready',
      context: {
        target,
        schemaIndex: await schemaIndex(),
        vanillaRegistries: {},
        registries: () => registries,
      },
    };
  });

  it('renders the Studio with the schema form and one coalescing key per gesture', async () => {
    const onChange = vi.fn();
    const subject = element('demo:first', 'minecraft:advancement', { criteria: {} });
    render(
      <ElementForm
        project={sampleProject()}
        element={subject}
        kind={kindOf('minecraft:advancement')}
        problems={[]}
        schema={schema}
        onChange={onChange}
        focusPointer={null}
        onFocused={vi.fn()}
        studios={mergeStudios(BUILT_IN_STUDIOS, [fakeEntry])}
      />,
    );
    expect(screen.getByTestId('fake-target').textContent).toBe(target.id);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit both' }));
    await user.click(screen.getByRole('button', { name: 'Edit both' }));
    const keys = onChange.mock.calls.map((call) => call[2]?.coalesce as string);
    expect(keys).toHaveLength(4);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).toBe(keys[3]);
    expect(keys[0]).not.toBe(keys[2]);
    expect(keys[0]).toMatch(/^fake-gesture:/);
  });
});
