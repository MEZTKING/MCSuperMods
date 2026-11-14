// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Tree Feature Studio (ADR 0068 D5, B270) over the real schema and vendored registries of
 * every built-in target, plus its pure helpers.
 */
import { type Element, type Json, type Project, requireSyncResult } from '@msm/core';
import type { ElementKind, TemplateContext } from '@msm/plugin-api';
import worldgenPlugin from '@msm/plugin-worldgen';
import type { RegistryIndex, SchemaIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DISCOVERED_STUDIOS,
  studioFor,
} from '../../../../src/renderer/src/studios/studio-registry';
import type { StudioProps } from '../../../../src/renderer/src/studios/types';
import { TreeFeatureStudio } from '../../../../src/renderer/src/studios/worldgen/TreeFeatureStudio';
import {
  blockProvider,
  isTreeFeature,
  lacksLeavesState,
  projectLeaves,
  readProvider,
  registryTypes,
  TREE_REGISTRIES,
} from '../../../../src/renderer/src/studios/worldgen/tree-model';
import { element, sampleProject } from '../../fixtures';
import { completionsFrom, registryIndexFor, schemaIndexFor } from '../../forms/schemas';

const FEATURE = 'minecraft:worldgen/feature';

afterEach(cleanup);

const kindOf = (id: string): ElementKind => {
  const kind = worldgenPlugin.contributes.elementKinds?.find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`No kind ${id}.`);
  return kind;
};

function templateData(bundle: TargetBundle, templateId: string, id = 'demo:maple_tree'): Json {
  const template = worldgenPlugin.contributes.elementTemplates?.find(
    (entry) => entry.id === templateId,
  );
  if (template === undefined) throw new Error(`No template ${templateId}.`);
  const context: TemplateContext = {
    id: id as TemplateContext['id'],
    namespace: 'demo',
    path: id.slice(id.indexOf(':') + 1),
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: undefined,
    target: bundle.target,
  };
  return requireSyncResult(template.data(context), templateId);
}

function projectWith(...elements: Element[]): Project {
  const project = sampleProject();
  const namespace = project.namespaces[0];
  if (namespace !== undefined) namespace.elements.push(...elements);
  return project;
}

const leavesBlock = () => element('demo:maple_leaves', 'msm:block', { type: 'leaves' });

/** The vendored registries in `SchemaContext.vanillaRegistries` form, from the index. */
function vanillaOf(registries: RegistryIndex): Record<string, string[]> {
  return Object.fromEntries(
    Object.values(TREE_REGISTRIES).map((name) => [name, [...registries.ids(name)]]),
  );
}

describe('tree-model', () => {
  it('knows tree features', () => {
    expect(isTreeFeature({ type: 'minecraft:tree' })).toBe(true);
    expect(isTreeFeature({ type: 'tree' })).toBe(true);
    expect(isTreeFeature({ type: 'minecraft:ore' })).toBe(false);
    expect(isTreeFeature(undefined)).toBe(false);
  });

  it('reads the three provider shapes', () => {
    expect(readProvider('minecraft:soil_beneath_tree')).toEqual({
      mode: 'reference',
      id: 'minecraft:soil_beneath_tree',
    });
    expect(readProvider({ id: 'minecraft:oak_log', properties: { axis: 'y' } })).toEqual({
      mode: 'block',
      id: 'minecraft:oak_log',
      properties: { axis: 'y' },
      simple: false,
    });
    expect(readProvider({ type: 'minecraft:simple', state: 'minecraft:dirt' })).toEqual({
      mode: 'block',
      id: 'minecraft:dirt',
      properties: {},
      simple: true,
    });
    expect(readProvider({ type: 'minecraft:weighted', entries: [] })).toEqual({
      mode: 'other',
      type: 'minecraft:weighted',
    });
    expect(readProvider(undefined)).toEqual({ mode: 'absent' });
  });

  it('writes one block in the form the provider used', () => {
    expect(blockProvider('demo:log', {}, undefined)).toEqual({ id: 'demo:log' });
    expect(blockProvider('demo:leaves', { distance: '7' }, 'minecraft:x')).toEqual({
      id: 'demo:leaves',
      properties: { distance: '7' },
    });
    const simple = { type: 'minecraft:simple', state: 'minecraft:dirt' };
    expect(blockProvider('demo:log', {}, simple)).toEqual({
      type: 'minecraft:simple',
      state: 'demo:log',
    });
    expect(blockProvider('demo:leaves', { persistent: 'false' }, simple)).toEqual({
      type: 'minecraft:simple',
      state: { id: 'demo:leaves', properties: { persistent: 'false' } },
    });
  });

  it('finds project leaves and the missing leaf state', () => {
    const leaves = projectLeaves(
      projectWith(leavesBlock(), element('demo:maple_log', 'msm:block', { type: 'pillar' })),
    );
    expect([...leaves]).toEqual(['demo:maple_leaves']);
    expect(lacksLeavesState(readProvider({ id: 'demo:maple_leaves' }), leaves)).toBe(true);
    expect(
      lacksLeavesState(
        readProvider({
          id: 'demo:maple_leaves',
          properties: { distance: '7', persistent: 'false' },
        }),
        leaves,
      ),
    ).toBe(false);
    expect(lacksLeavesState(readProvider({ id: 'minecraft:oak_leaves' }), leaves)).toBe(false);
  });

  it('lists namespaced registry types, sorted, and nothing for a missing registry', () => {
    expect(registryTypes({ r: ['b', 'minecraft:a'] }, 'r')).toEqual(['minecraft:a', 'minecraft:b']);
    expect(registryTypes({}, 'r')).toEqual([]);
  });

  it('registers the Studio for tree features only', () => {
    const kind = kindOf(FEATURE);
    const tree = element('demo:t', FEATURE, { type: 'minecraft:tree' });
    const ore = element('demo:o', FEATURE, { type: 'minecraft:ore' });
    expect(studioFor(tree, kind, DISCOVERED_STUDIOS)?.id).toBe('msm.worldgen.tree-feature');
    expect(studioFor(ore, kind, DISCOVERED_STUDIOS)).toBeUndefined();
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'Tree Feature Studio for %s',
  (_targetId, bundle: TargetBundle) => {
    let index: SchemaIndex;
    let registries: RegistryIndex;

    beforeAll(async () => {
      index = await schemaIndexFor(bundle);
      registries = await registryIndexFor(bundle);
    });

    function propsFor(subject: Element, project: Project, onChange = vi.fn()): StudioProps {
      const kind = kindOf(subject.kind);
      const completions = completionsFrom(registries);
      return {
        project,
        element: subject,
        kind,
        node: index.resolveSchemaRef(kind.schema),
        context: {
          target: bundle.target,
          schemaIndex: index,
          vanillaRegistries: vanillaOf(registries),
          registries: () => registries,
        },
        target: bundle.target,
        problems: [],
        sessionProblems: [],
        completions: { ...completions, projectIds: () => [] },
        suggest: completions.suggest,
        onChange,
        form: <div data-testid="advanced-form" />,
        formRef: createRef(),
        focusPointer: null,
        onFocused: () => undefined,
      };
    }

    const tree = () =>
      element('demo:maple_tree', FEATURE, templateData(bundle, 'feature_sapling_tree'));

    it('offers exactly the vendored placer types', () => {
      render(<TreeFeatureStudio {...propsFor(tree(), projectWith(leavesBlock()))} />);
      const trunk = screen.getByTestId('tree-trunk_placer-type') as HTMLSelectElement;
      expect(trunk.value).toBe('minecraft:straight_trunk_placer');
      const options = [...trunk.options].map((option) => option.value);
      expect(options).toEqual(registryTypes(vanillaOf(registries), TREE_REGISTRIES.trunkPlacer));
      expect(options.length).toBeGreaterThan(0);
      const foliage = screen.getByTestId('tree-foliage_placer-type') as HTMLSelectElement;
      expect([...foliage.options].map((option) => option.value)).toEqual(
        registryTypes(vanillaOf(registries), TREE_REGISTRIES.foliagePlacer),
      );
      expect(screen.getByLabelText('Trunk shape settings')).toBeTruthy();
    });

    it('replaces the trunk placer with the new type and its required settings', () => {
      const onChange = vi.fn();
      render(<TreeFeatureStudio {...propsFor(tree(), projectWith(), onChange)} />);
      fireEvent.change(screen.getByTestId('tree-trunk_placer-type'), {
        target: { value: 'minecraft:fancy_trunk_placer' },
      });
      const [pointer, value] = onChange.mock.calls[0] as [string, Record<string, Json>];
      expect(pointer).toBe('/trunk_placer');
      expect(value.type).toBe('minecraft:fancy_trunk_placer');
      expect(value).toHaveProperty('base_height');
    });

    it('fills in the leaf state when the leaves block is project leaves', () => {
      const onChange = vi.fn();
      const data = templateData(bundle, 'feature_sapling_tree') as Record<string, Json>;
      const bare = element('demo:maple_tree', FEATURE, {
        ...data,
        foliage_provider: { id: 'minecraft:oak_leaves' },
      });
      render(<TreeFeatureStudio {...propsFor(bare, projectWith(leavesBlock()), onChange)} />);
      const leaves = within(screen.getByTestId('tree-foliage_provider'));
      const input = leaves.getByLabelText('Leaves block');
      fireEvent.change(input, { target: { value: 'demo:maple_leaves' } });
      fireEvent.blur(input);
      expect(onChange).toHaveBeenLastCalledWith('/foliage_provider', {
        id: 'demo:maple_leaves',
        properties: { distance: '7', persistent: 'false' },
      });
    });

    it('offers to fill in a missing leaf state', () => {
      const onChange = vi.fn();
      const data = templateData(bundle, 'feature_sapling_tree') as Record<string, Json>;
      const bare = element('demo:maple_tree', FEATURE, {
        ...data,
        foliage_provider: { id: 'demo:maple_leaves', properties: { waterlogged: 'false' } },
      });
      render(<TreeFeatureStudio {...propsFor(bare, projectWith(leavesBlock()), onChange)} />);
      fireEvent.click(screen.getByRole('button', { name: 'Fill in leaf state' }));
      expect(onChange).toHaveBeenCalledWith('/foliage_provider', {
        id: 'demo:maple_leaves',
        properties: { waterlogged: 'false', distance: '7', persistent: 'false' },
      });
    });

    it('shows the below-trunk reference and switches it to one block', () => {
      const onChange = vi.fn();
      render(<TreeFeatureStudio {...propsFor(tree(), projectWith(), onChange)} />);
      const below = within(screen.getByTestId('tree-below_trunk_provider'));
      expect((below.getByLabelText('Ground block provider') as HTMLInputElement).value).toBe(
        'minecraft:soil_beneath_tree',
      );
      fireEvent.change(below.getByLabelText('Ground block source'), {
        target: { value: 'block' },
      });
      expect(onChange).toHaveBeenCalledWith('/below_trunk_provider', { id: '' });
    });

    it('switches a block provider to a registered provider from the registry', () => {
      const onChange = vi.fn();
      render(<TreeFeatureStudio {...propsFor(tree(), projectWith(), onChange)} />);
      fireEvent.change(screen.getByLabelText('Trunk block source'), {
        target: { value: 'reference' },
      });
      expect(onChange).toHaveBeenCalledWith('/trunk_provider', 'minecraft:soil_beneath_tree');
    });

    it('adds a decorator of a vendored type', () => {
      const onChange = vi.fn();
      render(<TreeFeatureStudio {...propsFor(tree(), projectWith(), onChange)} />);
      const types = registryTypes(vanillaOf(registries), TREE_REGISTRIES.decorator);
      const choices = [
        ...(screen.getByLabelText('New decorator type') as HTMLSelectElement).options,
      ].map((option) => option.value);
      expect(choices).toEqual(types);
      fireEvent.change(screen.getByLabelText('New decorator type'), {
        target: { value: 'minecraft:beehive' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add decorator' }));
      const [pointer, value] = onChange.mock.calls.at(-1) as [string, Record<string, Json>[]];
      expect(pointer).toBe('/decorators');
      expect(value).toHaveLength(1);
      expect(value[0]?.type).toBe('minecraft:beehive');
      expect(value[0]).toHaveProperty('probability');
    });

    it('edits and removes an existing decorator', () => {
      const onChange = vi.fn();
      const data = templateData(bundle, 'feature_sapling_tree') as Record<string, Json>;
      const decorated = element('demo:maple_tree', FEATURE, {
        ...data,
        decorators: [{ type: 'minecraft:beehive', probability: 0.05 }],
      });
      render(<TreeFeatureStudio {...propsFor(decorated, projectWith(), onChange)} />);
      expect(screen.getByLabelText('Decorator 1 settings')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Remove Decorator 1' }));
      expect(onChange).toHaveBeenCalledWith('/decorators', []);
    });

    it('shows the full form under Advanced', () => {
      render(<TreeFeatureStudio {...propsFor(tree(), projectWith())} />);
      fireEvent.click(screen.getByTestId('tree-advanced-toggle'));
      expect(screen.getByTestId('advanced-form')).toBeTruthy();
    });
  },
);
