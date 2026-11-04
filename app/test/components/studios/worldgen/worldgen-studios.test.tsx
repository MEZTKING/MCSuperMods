// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Biome Studio and Placed Feature Studio (B80) over the real schema of the first built-in
 * target, plus the pure helpers they share.
 */
import type { Element, Json, Project } from '@msm/core';
import type { ElementKind, Target, TemplateContext } from '@msm/plugin-api';
import worldgenPlugin from '@msm/plugin-worldgen';
import type { RegistryIndex, SchemaIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
import type { StudioProps } from '../../../../src/renderer/src/studios/types';
import { BiomeStudio } from '../../../../src/renderer/src/studios/worldgen/BiomeStudio';
import { ColourField } from '../../../../src/renderer/src/studios/worldgen/ColourField';
import { PlacedFeatureStudio } from '../../../../src/renderer/src/studios/worldgen/PlacedFeatureStudio';
import {
  colourToHex,
  hexToColour,
  humanise,
  placedFeatureUses,
  writeAt,
} from '../../../../src/renderer/src/studios/worldgen/worldgen-model';
import { element, sampleProject } from '../../fixtures';
import { completionsFrom, registryIndexFor, schemaIndexFor } from '../../forms/schemas';

const bundle = builtInTargets[0] as TargetBundle;
const target: Target = bundle.target;
let index: SchemaIndex;
let registries: RegistryIndex;

beforeAll(async () => {
  index = await schemaIndexFor(bundle);
  registries = await registryIndexFor(bundle);
});
afterEach(cleanup);

const kindOf = (id: string): ElementKind => {
  const kind = worldgenPlugin.contributes.elementKinds?.find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`No kind ${id}.`);
  return kind;
};

function templateData(templateId: string, id = 'demo:sample'): Json {
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
  };
  return template.data(context);
}

function projectWith(...elements: Element[]): Project {
  const project = sampleProject();
  const namespace = project.namespaces[0];
  if (namespace !== undefined) namespace.elements.push(...elements);
  return project;
}

function propsFor(subject: Element, project: Project, onChange = vi.fn()): StudioProps {
  const kind = kindOf(subject.kind);
  const completions = completionsFrom(registries);
  return {
    project,
    element: subject,
    kind,
    node: index.resolveSchemaRef(kind.schema),
    context: {
      target,
      schemaIndex: index,
      vanillaRegistries: {},
      registries: () => registries,
    },
    target,
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

describe('worldgen Studio helpers', () => {
  it('round-trips colours between integers and #rrggbb', () => {
    expect(colourToHex(7972607)).toBe('#79a6ff');
    expect(hexToColour('#79a6ff')).toBe(7972607);
    expect(colourToHex('#ABCDEF')).toBe('#abcdef');
    expect(colourToHex([1, 0, 0])).toBe('#ff0000');
    expect(colourToHex({ modifier: 'add' })).toBeNull();
    expect(() => hexToColour('red')).toThrow();
  });

  it('labels keys and writes into absent parents', () => {
    expect(humanise('minecraft:visual/water_fog_color')).toBe('Water fog colour');
    expect(humanise('underground_ores')).toBe('Underground ores');
    expect(writeAt({ a: { b: 1 } }, ['a', 'c', 'd'], 2)).toEqual({
      pointer: '/a/c',
      value: { d: 2 },
    });
    expect(writeAt({}, ['x/y', 'z'], 1)).toEqual({ pointer: '/x~1y', value: { z: 1 } });
  });

  it('finds the biomes and steps that place a feature', () => {
    const project = projectWith(
      element('demo:glade', 'minecraft:worldgen/biome', { features: [[], ['demo:rocks']] }),
      element('demo:dunes', 'minecraft:worldgen/biome', { features: [['rocks'], ['demo:rocks']] }),
    );
    expect(placedFeatureUses(project, 'demo:rocks')).toEqual([
      { biome: 'demo:glade', step: 1 },
      { biome: 'demo:dunes', step: 1 },
    ]);
    expect(placedFeatureUses(project, 'minecraft:rocks')).toEqual([
      { biome: 'demo:dunes', step: 0 },
    ]);
  });

  it('registers both Studios through the area file', () => {
    const ids = DISCOVERED_STUDIOS.map((entry) => entry.id);
    expect(ids).toContain('msm.worldgen.biome');
    expect(ids).toContain('msm.worldgen.placed-feature');
  });
});

describe('ColourField', () => {
  it('writes the integer of the picked colour', () => {
    const onChange = vi.fn();
    render(<ColourField label="Sky colour" value={0} onChange={onChange} testId="c" />);
    fireEvent.change(screen.getByLabelText('Sky colour'), { target: { value: '#79a6ff' } });
    expect(onChange).toHaveBeenCalledWith(7972607);
  });
});

describe('Biome Studio', () => {
  const biome = () =>
    element('demo:glade', 'minecraft:worldgen/biome', templateData('biome_temperate_forest'));

  it('names every decoration step from the target and shows the colours', () => {
    render(<BiomeStudio {...propsFor(biome(), projectWith())} />);
    expect(screen.getByTestId('biome-studio')).toBeTruthy();
    target.worldgen.featureSteps.forEach((step, n) => {
      expect(
        within(screen.getByTestId(`biome-step-${n}`)).getByText(humanise(step), { exact: false }),
      ).toBeTruthy();
    });
    for (const field of ['water_color', 'grass_color', 'foliage_color', 'sky_color', 'fog_color']) {
      expect(screen.getByTestId(`biome-colour-${field}`)).toBeTruthy();
    }
    expect((screen.getByLabelText('Temperature') as HTMLInputElement).value).toBe('0.7');
  });

  it('edits a colour attribute as an integer at its attribute pointer', () => {
    const onChange = vi.fn();
    render(<BiomeStudio {...propsFor(biome(), projectWith(), onChange)} />);
    const sky = within(screen.getByTestId('biome-colour-sky_color')).getByLabelText('Sky colour');
    expect((sky as HTMLInputElement).value).toBe('#79a6ff');
    fireEvent.change(sky, { target: { value: '#000080' } });
    expect(onChange).toHaveBeenCalledWith('/attributes/minecraft:visual~1sky_color', 128, {
      coalesce: 'typing:/attributes/minecraft:visual~1sky_color',
    });
  });

  it('adds to and removes from one step list at /features/<step>', () => {
    const onChange = vi.fn();
    render(<BiomeStudio {...propsFor(biome(), projectWith(), onChange)} />);
    const step = target.worldgen.featureSteps.indexOf('vegetal_decoration');
    const title = humanise('vegetal_decoration');
    const box = within(screen.getByTestId(`biome-step-${step}`));
    fireEvent.change(box.getByLabelText(`New entry in ${title} features`), {
      target: { value: 'demo:rocks' },
    });
    fireEvent.click(box.getByRole('button', { name: `Add to ${title} features` }));
    const before = (templateData('biome_temperate_forest') as { features: string[][] }).features[
      step
    ] as string[];
    expect(onChange).toHaveBeenLastCalledWith(`/features/${step}`, [...before, 'demo:rocks']);
    fireEvent.click(box.getByRole('button', { name: `Remove ${title} features 1` }));
    expect(onChange).toHaveBeenLastCalledWith(`/features/${step}`, before.slice(1));
  });

  it('pads the step lists when a later step is added to a short list', () => {
    const onChange = vi.fn();
    const short = element('demo:bare', 'minecraft:worldgen/biome', { features: [[]] });
    render(<BiomeStudio {...propsFor(short, projectWith(), onChange)} />);
    const box = within(screen.getByTestId('biome-step-2'));
    const title = humanise(target.worldgen.featureSteps[2] as string);
    fireEvent.change(box.getByLabelText(`New entry in ${title} features`), {
      target: { value: 'demo:rocks' },
    });
    fireEvent.click(box.getByRole('button', { name: `Add to ${title} features` }));
    expect(onChange).toHaveBeenLastCalledWith('/features', [[], [], ['demo:rocks']]);
  });

  it('adds a spawn to a category of the natural mob spawns attribute', () => {
    const onChange = vi.fn();
    render(<BiomeStudio {...propsFor(biome(), projectWith(), onChange)} />);
    const key = target.worldgen.biomeAttributes?.naturalMobSpawns as string;
    const creature = within(screen.getByTestId('biome-spawns-creature'));
    expect((creature.getByLabelText('Creature spawn 1 entity') as HTMLInputElement).value).toBe(
      'minecraft:sheep',
    );
    fireEvent.click(creature.getByRole('button', { name: 'Add spawn to Creature' }));
    const [pointer, value] = onChange.mock.calls.at(-1) as [string, Json[]];
    expect(pointer).toBe(`/attributes/${key.replaceAll('/', '~1')}/spawns_by_category/creature`);
    expect(value).toHaveLength(6);
    expect(value[5]).toHaveProperty('type');
    fireEvent.change(creature.getByLabelText('Creature spawn 1 maximum count'), {
      target: { value: '6' },
    });
    const [, edited] = onChange.mock.calls.at(-1) as [string, { count: Json }[]];
    expect(edited[0]?.count).toEqual({
      type: 'minecraft:uniform',
      min_inclusive: 4,
      max_inclusive: 6,
    });
  });

  it('creates the spawns attribute when the biome has none', () => {
    const onChange = vi.fn();
    const bare = element('demo:bare', 'minecraft:worldgen/biome', { temperature: 0.5 });
    render(<BiomeStudio {...propsFor(bare, projectWith(), onChange)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add spawn to Monster' }));
    const key = target.worldgen.biomeAttributes?.naturalMobSpawns as string;
    const [pointer, value] = onChange.mock.calls.at(-1) as [string, Json];
    expect(pointer).toBe('/attributes');
    expect(Object.keys(value as object)).toEqual([key]);
  });

  it('shows the full form behind the Advanced toggle', () => {
    render(<BiomeStudio {...propsFor(biome(), projectWith())} />);
    fireEvent.click(screen.getByTestId('biome-advanced-toggle'));
    expect(screen.getByTestId('advanced-form')).toBeTruthy();
  });
});

describe('Placed Feature Studio', () => {
  const placed = () =>
    element(
      'demo:ruby_ore_placed',
      'minecraft:worldgen/placed_feature',
      templateData('placed_feature_ore', 'demo:ruby_ore'),
    );

  it('edits the configured feature and lists where the feature is used', () => {
    const onChange = vi.fn();
    const project = projectWith(
      element('demo:glade', 'minecraft:worldgen/biome', {
        features: [[], [], [], [], [], [], ['demo:ruby_ore_placed']],
      }),
    );
    render(<PlacedFeatureStudio {...propsFor(placed(), project, onChange)} />);
    expect(screen.getByTestId('placed-feature-studio')).toBeTruthy();
    const feature = screen.getByTestId('placed-feature-feature') as HTMLInputElement;
    expect(feature.value).toBe('demo:ruby_ore');
    fireEvent.change(feature, { target: { value: 'minecraft:ore_iron' } });
    fireEvent.blur(feature);
    expect(onChange).toHaveBeenCalledWith('/feature', 'minecraft:ore_iron');
    const used = within(screen.getByTestId('placed-feature-used-in'));
    expect(used.getByText('demo:glade')).toBeTruthy();
    expect(
      used.getByText(humanise(target.worldgen.featureSteps[6] as string), { exact: false }),
    ).toBeTruthy();
  });

  it('swaps the sub-form when a modifier type changes', () => {
    const onChange = vi.fn();
    const subject = placed();
    const view = render(<PlacedFeatureStudio {...propsFor(subject, projectWith(), onChange)} />);
    const first = within(screen.getByTestId('placement-modifier-0'));
    expect(first.getByRole('spinbutton', { name: 'count' })).toBeTruthy();
    const typeSelect = first.getByLabelText('Modifier 1 type') as HTMLSelectElement;
    expect([...typeSelect.options].map((option) => option.value)).toContain('in_square');
    fireEvent.change(typeSelect, { target: { value: 'in_square' } });
    expect(onChange).toHaveBeenLastCalledWith('/placement/0', { type: 'minecraft:in_square' });
    const data = subject.data as { placement: Json[] };
    const swapped = {
      ...subject,
      data: { ...data, placement: [{ type: 'minecraft:in_square' }, ...data.placement.slice(1)] },
    };
    view.rerender(<PlacedFeatureStudio {...propsFor(swapped, projectWith(), onChange)} />);
    const after = within(screen.getByTestId('placement-modifier-0'));
    expect(after.queryByRole('spinbutton', { name: 'count' })).toBeNull();
    expect(after.getByText('No settings.')).toBeTruthy();
  });

  it('adds, moves and removes modifiers on /placement', () => {
    const onChange = vi.fn();
    const subject = placed();
    const data = subject.data as { placement: Json[] };
    render(<PlacedFeatureStudio {...propsFor(subject, projectWith(), onChange)} />);
    fireEvent.change(screen.getByLabelText('New modifier type'), { target: { value: 'biome' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add modifier' }));
    expect(onChange).toHaveBeenLastCalledWith('/placement', [
      ...data.placement,
      { type: 'minecraft:biome' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Move Modifier 2 up' }));
    expect(onChange).toHaveBeenLastCalledWith('/placement', [
      data.placement[1],
      data.placement[0],
      ...data.placement.slice(2),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Modifier 1' }));
    expect(onChange).toHaveBeenLastCalledWith('/placement', data.placement.slice(1));
  });
});
