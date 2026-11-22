// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Dimension Type Studio (ADR 0100 D1, D4, B471) over the real schema of every built-in target,
 * plus its pure helpers.
 */
import { type Element, type Json, type Project, requireSyncResult } from '@msm/core';
import type { ElementKind, TemplateContext } from '@msm/plugin-api';
import { dataPackKinds } from '@msm/plugin-datapack';
import worldgenPlugin from '@msm/plugin-worldgen';
import type { RegistryIndex, SchemaIndex } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DISCOVERED_STUDIOS,
  studioFor,
} from '../../../../src/renderer/src/studios/studio-registry';
import type { StudioProps } from '../../../../src/renderer/src/studios/types';
import DimensionTypeStudio from '../../../../src/renderer/src/studios/worldgen/DimensionTypeStudio';
import {
  bedPresetOf,
  bedRule,
  DIMENSION_TYPE_KIND,
  LIGHT_ATTRIBUTES,
  lightRange,
  lightValue,
  RULE_ATTRIBUTES,
  readColour,
  SKY_ATTRIBUTES,
  shownAttributes,
  skySwatch,
  writeColour,
} from '../../../../src/renderer/src/studios/worldgen/dimension-type-model';
import { element, sampleProject } from '../../fixtures';
import { completionsFrom, registryIndexFor, schemaIndexFor } from '../../forms/schemas';

afterEach(cleanup);

const kind = (): ElementKind => {
  const found = dataPackKinds.find((entry) => entry.id === DIMENSION_TYPE_KIND);
  if (found === undefined) throw new Error('No dimension type kind.');
  return found;
};

function templateData(bundle: TargetBundle, templateId: string): Json {
  const template = worldgenPlugin.contributes.elementTemplates?.find(
    (entry) => entry.id === templateId,
  );
  if (template === undefined) throw new Error(`No template ${templateId}.`);
  const context: TemplateContext = {
    id: 'demo:moon',
    namespace: 'demo',
    path: 'moon',
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: undefined,
    target: bundle.target,
  };
  return requireSyncResult(template.data(context), templateId);
}

const allFields = [...SKY_ATTRIBUTES, ...LIGHT_ATTRIBUTES, ...RULE_ATTRIBUTES];

describe('dimension-type-model', () => {
  it('names only attributes some target lists, and shows per target', () => {
    const union = new Set(
      builtInTargets.flatMap((bundle) => bundle.target.worldgen.environmentAttributes ?? []),
    );
    for (const field of allFields) expect(union.has(field.id), field.id).toBe(true);
    const occluder = 'minecraft:visual/has_sky_occluder';
    for (const bundle of builtInTargets) {
      const shown = shownAttributes(SKY_ATTRIBUTES, bundle.target).map((field) => field.id);
      expect(shown.includes(occluder), bundle.target.id).toBe(
        bundle.target.worldgen.environmentAttributes?.includes(occluder) === true,
      );
    }
    // Without the fact every field shows.
    expect(shownAttributes(SKY_ATTRIBUTES, { worldgen: {} })).toHaveLength(SKY_ATTRIBUTES.length);
  });

  it('reads and writes RGB and ARGB colours', () => {
    expect(readColour('#78A7FF')).toEqual({ hex: '#78a7ff', alpha: 255 });
    expect(readColour('#ccffffff', true)).toEqual({ hex: '#ffffff', alpha: 204 });
    expect(readColour(0x102030)).toEqual({ hex: '#102030', alpha: 255 });
    expect(readColour(0x80102030, true)).toEqual({ hex: '#102030', alpha: 128 });
    expect(readColour({ modifier: 'multiply' })).toBeNull();
    expect(writeColour('#ABCDEF', false)).toBe('#abcdef');
    expect(writeColour('#abcdef', true, 204)).toBe('#ccabcdef');
    expect(writeColour('#abcdef', true)).toBe('#ffabcdef');
  });

  it('knows the bed presets and the light ranges', () => {
    expect(bedPresetOf(bedRule('explode'))).toBe('explode');
    expect(bedPresetOf(bedRule('work'))).toBe('work');
    expect(bedPresetOf({ can_sleep: 'always', can_set_spawn: 'always' })).toBeNull();
    expect(bedPresetOf(undefined)).toBeNull();
    expect(lightRange(7)).toEqual([7, 7]);
    expect(lightRange({ type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 7 })).toEqual([
      0, 7,
    ]);
    expect(lightRange({ type: 'minecraft:weighted_list', distribution: [] })).toBeNull();
    expect(lightValue(3, 3)).toBe(3);
    expect(lightValue(9, 2)).toEqual({
      type: 'minecraft:uniform',
      min_inclusive: 2,
      max_inclusive: 9,
    });
  });

  it('draws the sky swatch from the colours and angles', () => {
    const noon = skySwatch({});
    expect(noon.top).toBe('#78a7ff');
    expect(noon.sun.shown).toBe(true);
    expect(noon.moon.shown).toBe(false);
    const night = skySwatch({
      attributes: {
        'minecraft:visual/sky_color': '#000000',
        'visual/fog_color': '#101010',
        'minecraft:visual/sun_angle': 180,
      },
    });
    expect(night.top).toBe('#000000');
    expect(night.horizon).toBe('#101010');
    expect(night.sun.shown).toBe(false);
    expect(night.moon.shown).toBe(true);
    const none = skySwatch({
      skybox: 'none',
      attributes: { 'minecraft:visual/fog_color': '#330000' },
    });
    expect(none.top).toBe('#330000');
    expect(none.sun.shown).toBe(false);
  });

  it('registers the Studio for dimension types, lazily', () => {
    const subject = element('demo:moon', DIMENSION_TYPE_KIND, {});
    const entry = studioFor(subject, kind(), DISCOVERED_STUDIOS);
    expect(entry?.id).toBe('msm.worldgen.dimension-type');
    expect(entry?.component).not.toBe(DimensionTypeStudio);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'Dimension Type Studio for %s',
  (_targetId, bundle: TargetBundle) => {
    let index: SchemaIndex;
    let registries: RegistryIndex;

    beforeAll(async () => {
      index = await schemaIndexFor(bundle);
      registries = await registryIndexFor(bundle);
    });

    function propsFor(subject: Element, onChange = vi.fn()): StudioProps {
      const project: Project = sampleProject();
      const completions = completionsFrom(registries);
      return {
        project,
        element: subject,
        kind: kind(),
        node: index.resolveSchemaRef(kind().schema),
        context: {
          target: bundle.target,
          schemaIndex: index,
          vanillaRegistries: {},
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

    const moon = () =>
      element('demo:moon', DIMENSION_TYPE_KIND, templateData(bundle, 'dimension_type_moon'));

    it('offers See it on the map and Walk in it (B587)', () => {
      render(<DimensionTypeStudio {...propsFor(moon())} />);
      expect(screen.getByTestId('studio-map-line')).toBeTruthy();
      expect(screen.getByTestId('studio-see-map').textContent).toBe('See it on the map');
      expect(screen.getByTestId('studio-see-map').getAttribute('aria-expanded')).toBe('false');
      expect(screen.getByTestId('studio-walk-in-it').textContent).toBe('Walk in it');
    });

    it('shows the six sections and the sky swatch', () => {
      render(<DimensionTypeStudio {...propsFor(moon())} />);
      for (const id of ['sky', 'light', 'time', 'rules', 'height', 'spawning']) {
        expect(screen.getByTestId(`dimension-${id}`)).toBeTruthy();
      }
      expect(screen.getByRole('img', { name: /Sky preview/ })).toBeTruthy();
      expect((screen.getByTestId('dimension-skybox') as HTMLSelectElement).value).toBe('overworld');
      expect((screen.getByTestId('dimension-time-mode') as HTMLSelectElement).value).toBe('fixed');
      expect((screen.getByTestId('dimension-height') as HTMLElement).textContent).toContain(
        'multiple of 16',
      );
      expect(screen.getByTestId('dimension-ambient-particles')).toBeTruthy();
    });

    it('shows 26.4’s extra attribute only where the target lists it', () => {
      render(<DimensionTypeStudio {...propsFor(moon())} />);
      const listed =
        bundle.target.worldgen.environmentAttributes?.includes(
          'minecraft:visual/has_sky_occluder',
        ) === true;
      expect(screen.queryByTestId('dimension-attr-has_sky_occluder') !== null).toBe(listed);
    });

    it('writes the sky colour as #rrggbb into the attributes', () => {
      const onChange = vi.fn();
      render(<DimensionTypeStudio {...propsFor(moon(), onChange)} />);
      const field = screen.getByTestId('dimension-attr-sky_color');
      const input = field.querySelector('input[type="color"]') as HTMLInputElement;
      fireEvent.input(input, { target: { value: '#112233' } });
      fireEvent.change(input, { target: { value: '#112233' } });
      expect(onChange).toHaveBeenCalledWith(
        '/attributes/minecraft:visual~1sky_color',
        '#112233',
        expect.anything(),
      );
    });

    it('creates the attributes map on the first attribute edit', () => {
      const onChange = vi.fn();
      const bare = element('demo:plain', DIMENSION_TYPE_KIND, {
        has_skylight: true,
        has_ceiling: false,
        min_y: 0,
        height: 256,
        logical_height: 256,
      });
      render(<DimensionTypeStudio {...propsFor(bare, onChange)} />);
      fireEvent.change(screen.getByTestId('dimension-attr-fast_lava'), {
        target: { value: 'yes' },
      });
      expect(onChange).toHaveBeenCalledWith(
        '/attributes',
        { 'minecraft:gameplay/fast_lava': true },
        undefined,
      );
    });

    it('sets exploding beds on both bed rules', () => {
      const onChange = vi.fn();
      render(<DimensionTypeStudio {...propsFor(moon(), onChange)} />);
      expect((screen.getByTestId('dimension-beds') as HTMLSelectElement).value).toBe('no_sleep');
      fireEvent.change(screen.getByTestId('dimension-beds'), { target: { value: 'explode' } });
      const [pointer, value] = onChange.mock.calls.at(-1) as [string, Record<string, Json>];
      expect(pointer).toBe('/attributes');
      expect(value['minecraft:gameplay/bed_rule']).toEqual(bedRule('explode'));
      expect(value['minecraft:gameplay/straw_bed_rule']).toEqual(bedRule('explode'));
      expect(value['minecraft:visual/sky_color']).toBe('#000000');
    });

    it('edits the height and the monster light range', () => {
      const onChange = vi.fn();
      render(<DimensionTypeStudio {...propsFor(moon(), onChange)} />);
      fireEvent.change(screen.getByTestId('dimension-field-height'), { target: { value: '320' } });
      expect(onChange).toHaveBeenCalledWith('/height', 320, expect.anything());
      fireEvent.change(screen.getByTestId('dimension-spawn-light-max'), {
        target: { value: '0' },
      });
      expect(onChange).toHaveBeenLastCalledWith('/monster_spawn_light_level', 0, undefined);
    });

    it('switches the time of day back to the clock', () => {
      const onChange = vi.fn();
      render(<DimensionTypeStudio {...propsFor(moon(), onChange)} />);
      fireEvent.change(screen.getByTestId('dimension-time-mode'), { target: { value: 'clock' } });
      expect(onChange).toHaveBeenCalledWith('/has_fixed_time', undefined, undefined);
    });

    it('shows the full form under Advanced', () => {
      render(<DimensionTypeStudio {...propsFor(moon())} />);
      fireEvent.click(screen.getByTestId('dimension-advanced-toggle'));
      expect(screen.getByTestId('advanced-form')).toBeTruthy();
    });
  },
);
