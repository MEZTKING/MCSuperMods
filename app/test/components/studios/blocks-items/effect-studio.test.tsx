// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Effect Studio (B205, ADR 0055): rendered through `ElementForm` (so the Studio comes from the
 * registry) over the real schema index, plus the pure helpers of `effect-model.ts`. Undo runs
 * through a real `CommandStack` with `commands.setElementValue`, as the session does.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import { createRegistryIndex, MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EVENT_FIELDS,
  renameEvent,
} from '../../../../src/renderer/src/studios/blocks-items/blocks-items-model';
import {
  categoryColour,
  effectDisplayName,
  effectIconPath,
  hasEffectIcon,
  modifierSummary,
  tickInterval,
} from '../../../../src/renderer/src/studios/blocks-items/effect-model';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
import type { StudioProps } from '../../../../src/renderer/src/studios/types';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
let schema: SchemaContextState;

beforeAll(async () => {
  const index = await schemaIndex();
  const registries = createRegistryIndex({ vanilla: {} });
  schema = {
    status: 'ready',
    context: { target, schemaIndex: index, vanillaRegistries: {}, registries: () => registries },
  };
});
afterEach(cleanup);

/** The plugin's `msm:effect` kind (B204), or the same shape while it is not registered. */
const effectKind: ElementKind = blocksItemsPlugin.contributes.elementKinds?.find(
  (entry) => entry.id === 'msm:effect',
) ?? {
  id: 'msm:effect',
  schema: MSM_SCHEMA_REFS.effect,
  folder: 'effect',
  registry: 'mob_effect',
  defaultData: { format: 1, category: 'beneficial', color: 0x33ebff },
  lower: () => [],
};

const FROST: Json = {
  format: 1,
  category: 'harmful',
  color: 0x88ccff,
  display_name: 'Frost Bite',
  attribute_modifiers: [
    { attribute: 'minecraft:movement_speed', amount: -0.15, operation: 'add_multiplied_total' },
  ],
  components: { 'msm:on_tick': { event: 'demo:frost_bite_tick', interval_ticks: 40 } },
  events: {
    'demo:frost_bite_tick': { actions: [{ type: 'damage', amount: 1 }] },
  },
};

function projectOf(elements: Element[], assets: string[] = []): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        elements,
        assets: assets.map((path) => ({ path, mediaType: 'image/png' })),
      },
    ],
  };
}

function hostSpy() {
  return {
    thumbnail: vi.fn<BlocksItemsStudioHost['thumbnail']>(
      async () => new Uint8Array([137, 80, 78, 71]),
    ),
    revision: 0,
    paintTexture: vi.fn<BlocksItemsStudioHost['paintTexture']>(),
  } satisfies BlocksItemsStudioHost;
}

function renderStudio(
  subject: Element,
  project = projectOf([subject]),
  host: BlocksItemsStudioHost | null = null,
) {
  const onChange = vi.fn<StudioProps['onChange']>();
  const result = render(
    <BlocksItemsStudioHostContext.Provider value={host}>
      <ElementForm
        project={project}
        element={subject}
        kind={effectKind}
        problems={[]}
        schema={schema}
        onChange={onChange}
        focusPointer={null}
        onFocused={vi.fn()}
      />
    </BlocksItemsStudioHostContext.Provider>,
  );
  return { ...result, onChange };
}

function StackHarness({ stack, id }: { stack: CommandStack; id: ResourceLocation }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const subject = stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={stack.state}
      element={subject}
      kind={effectKind}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(id, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

const lastEdit = (spy: { mock: { lastCall?: unknown[] | undefined } }): unknown[] =>
  spy.mock.lastCall?.slice(0, 2) ?? [];

const dataOf = (stack: CommandStack, id: string): Json =>
  stack.state.namespaces[0]?.elements.find((entry) => entry.id === id)?.data ?? null;

describe('Effect Studio helpers', () => {
  it('registers the Effect Studio through the area file', () => {
    expect(
      DISCOVERED_STUDIOS.find((entry) => entry.id === 'msm.blocks-items.effect'),
    ).toMatchObject({ kindId: 'msm:effect' });
  });

  it('places the icon at the fixed mob_effect path', () => {
    expect(effectIconPath('demo:frost_bite')).toEqual({
      namespace: 'demo',
      path: 'textures/mob_effect/frost_bite.png',
      assetPath: 'assets/demo/textures/mob_effect/frost_bite.png',
    });
    const subject = element('demo:frost_bite' as ResourceLocation, 'msm:effect', FROST);
    expect(hasEffectIcon(projectOf([subject]), 'demo:frost_bite')).toBe(false);
    expect(
      hasEffectIcon(
        projectOf([subject], ['textures/mob_effect/frost_bite.png']),
        'demo:frost_bite',
      ),
    ).toBe(true);
  });

  it('names, colours and summarises an effect per level', () => {
    expect(
      effectDisplayName(element('demo:frost_bite' as ResourceLocation, 'msm:effect', {})),
    ).toBe('Frost bite');
    expect(categoryColour('harmful')).toBe('#ff5555');
    expect(categoryColour('beneficial')).toBe('#5555ff');
    expect(categoryColour('neutral')).toBe('#5555ff');
    const speed = {
      attribute: 'minecraft:movement_speed',
      amount: 0.2,
      operation: 'add_multiplied_total',
    };
    expect(modifierSummary(speed, 1)).toBe('Movement speed +20%');
    expect(modifierSummary(speed, 2)).toBe('Movement speed +40%');
    expect(
      modifierSummary({ attribute: 'minecraft:max_health', amount: -2, operation: 'add_value' }, 2),
    ).toBe('Max health -4');
    expect(tickInterval(undefined, 1)).toBeUndefined();
    expect(tickInterval({ event: 'x' }, 2)).toBe(20);
    expect(tickInterval({ event: 'x', interval_ticks: 40, faster_per_level: true }, 2)).toBe(20);
    expect(tickInterval({ event: 'x', interval_ticks: 1, faster_per_level: true }, 3)).toBe(1);
  });

  it('renames an event with its start, tick and end references', () => {
    expect(EVENT_FIELDS['msm:effect']).toEqual([
      ['msm:on_start', 'event'],
      ['msm:on_tick', 'event'],
      ['msm:on_end', 'event'],
    ]);
    const renamed = renameEvent(FROST, 'msm:effect', 'demo:frost_bite_tick', 'demo:chill');
    expect(renamed.components).toEqual({
      'msm:on_tick': { event: 'demo:chill', interval_ticks: 40 },
    });
  });
});

describe('Effect Studio', () => {
  it('renders the effect with schema choices and a coloured preview', () => {
    const subject = element('demo:frost_bite' as ResourceLocation, 'msm:effect', FROST);
    renderStudio(subject);
    expect(screen.getByTestId('effect-studio')).toBeTruthy();
    expect((screen.getByTestId('effect-display-name') as HTMLInputElement).value).toBe(
      'Frost Bite',
    );
    const category = screen.getByTestId('effect-category') as HTMLSelectElement;
    expect(category.value).toBe('harmful');
    expect([...category.options].map((option) => option.value)).toEqual([
      'beneficial',
      'harmful',
      'neutral',
    ]);
    expect(within(screen.getByTestId('effect-colour')).getByText('#88ccff')).toBeTruthy();
    const name = screen.getByTestId('effect-preview-name');
    expect(name.textContent).toBe('Frost Bite');
    expect(name.style.color).toMatch(/ff5555|255, 85, 85/i);
    const levels = screen.getByTestId('effect-preview-levels').textContent ?? '';
    expect(levels).toContain('Level I: Movement speed -15%, acts every 40 ticks');
    expect(levels).toContain('Level II: Movement speed -30%, acts every 40 ticks');
    expect((screen.getByTestId('effect-on-tick') as HTMLSelectElement).value).toBe(
      'demo:frost_bite_tick',
    );
    expect((screen.getByTestId('effect-tick-interval') as HTMLInputElement).value).toBe('40');
    expect(screen.getByTestId('msm-events')).toBeTruthy();
  });

  it('writes category, colour and tick fields at their pointers', () => {
    const subject = element('demo:frost_bite' as ResourceLocation, 'msm:effect', FROST);
    const { onChange } = renderStudio(subject);
    fireEvent.change(screen.getByTestId('effect-category'), { target: { value: 'neutral' } });
    expect(lastEdit(onChange)).toEqual(['/category', 'neutral']);
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: '#ff0000' } });
    expect(lastEdit(onChange)).toEqual(['/color', 0xff0000]);
    fireEvent.change(screen.getByTestId('effect-tick-interval'), { target: { value: '10' } });
    expect(onChange).toHaveBeenLastCalledWith('/components/msm:on_tick/interval_ticks', 10, {
      coalesce: 'typing:/components/msm:on_tick/interval_ticks',
    });
    fireEvent.click(screen.getByTestId('effect-tick-faster'));
    expect(lastEdit(onChange)).toEqual(['/components/msm:on_tick/faster_per_level', true]);
    fireEvent.change(screen.getByTestId('effect-on-tick'), { target: { value: '' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:on_tick', undefined]);
  });

  it('warns about a missing icon and paints it through the host', () => {
    const subject = element('demo:frost_bite' as ResourceLocation, 'msm:effect', FROST);
    renderStudio(subject);
    expect(screen.getByTestId('effect-icon-missing').textContent).toContain(
      'textures/mob_effect/frost_bite.png',
    );
    expect((screen.getByTestId('effect-paint-icon') as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    const host = hostSpy();
    renderStudio(subject, projectOf([subject]), host);
    fireEvent.click(screen.getByTestId('effect-paint-icon'));
    expect(host.paintTexture).toHaveBeenCalledWith('demo', 'textures/mob_effect/frost_bite.png', {
      width: 18,
      height: 18,
    });
    expect(host.thumbnail).not.toHaveBeenCalled();
    expect(screen.getByTestId('effect-icon-image-placeholder')).toBeTruthy();
  });

  it('shows the icon thumbnail when the texture exists', async () => {
    const subject = element('demo:frost_bite' as ResourceLocation, 'msm:effect', FROST);
    const host = hostSpy();
    renderStudio(subject, projectOf([subject], ['textures/mob_effect/frost_bite.png']), host);
    expect(screen.queryByTestId('effect-icon-missing')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('effect-preview-icon')).toBeTruthy());
    expect(host.thumbnail).toHaveBeenCalledWith(
      'assets/demo/textures/mob_effect/frost_bite.png',
      36,
    );
    expect((screen.getByTestId('effect-icon-image') as HTMLImageElement).src).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it('adds, edits and removes stat changes', () => {
    const id = 'demo:rush' as ResourceLocation;
    const stack = new CommandStack(
      projectOf([element(id, 'msm:effect', { format: 1, category: 'beneficial', color: 1 })]),
    );
    render(<StackHarness stack={stack} id={id} />);
    expect(screen.getByText('No stat changes.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('effect-add-modifier'));
    fireEvent.click(screen.getByTestId('effect-add-modifier'));
    expect((dataOf(stack, id) as { attribute_modifiers: unknown[] }).attribute_modifiers).toEqual([
      { attribute: 'minecraft:movement_speed', amount: 0.1, operation: 'add_multiplied_total' },
      { attribute: 'minecraft:movement_speed', amount: 0.1, operation: 'add_multiplied_total' },
    ]);
    fireEvent.change(screen.getByLabelText('Stat change 2 amount'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Stat change 2 operation'), {
      target: { value: 'add_value' },
    });
    const stat = screen.getByLabelText('Stat change 2 stat');
    fireEvent.change(stat, { target: { value: 'minecraft:max_health' } });
    fireEvent.blur(stat);
    expect(
      (dataOf(stack, id) as { attribute_modifiers: unknown[] }).attribute_modifiers[1],
    ).toEqual({ attribute: 'minecraft:max_health', amount: 4, operation: 'add_value' });
    expect(screen.getByTestId('effect-preview-levels').textContent).toContain('Max health +8');
    fireEvent.click(screen.getByRole('button', { name: 'Remove stat change 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove stat change 1' }));
    expect(dataOf(stack, id)).not.toHaveProperty('attribute_modifiers');
  });

  it('creates a tick event in one step, adds a Heal action, and undoes', () => {
    const id = 'demo:rush' as ResourceLocation;
    const stack = new CommandStack(
      projectOf([element(id, 'msm:effect', { format: 1, category: 'beneficial', color: 1 })]),
    );
    render(<StackHarness stack={stack} id={id} />);
    expect(screen.getByTestId('effect-on-start-new')).toBeTruthy();
    expect(screen.getByTestId('effect-on-end-new')).toBeTruthy();
    fireEvent.click(screen.getByTestId('effect-on-tick-new'));
    expect(dataOf(stack, id)).toMatchObject({
      components: { 'msm:on_tick': { event: 'demo:rush_tick' } },
      events: { 'demo:rush_tick': { actions: [] } },
    });
    expect(screen.queryByTestId('effect-on-tick-new')).toBeNull();

    const event = screen.getByTestId('msm-event-demo:rush_tick');
    fireEvent.change(within(event).getByLabelText('New action type for demo:rush_tick'), {
      target: { value: 'heal' },
    });
    fireEvent.click(within(event).getByRole('button', { name: 'Add action to demo:rush_tick' }));
    expect(dataOf(stack, id)).toMatchObject({
      events: { 'demo:rush_tick': { actions: [{ type: 'heal', amount: 2 }] } },
    });
    act(() => {
      stack.undo();
    });
    act(() => {
      stack.undo();
    });
    expect(dataOf(stack, id)).toEqual({ format: 1, category: 'beneficial', color: 1 });
  });

  it('switches to the full schema form under Advanced', () => {
    const subject = element('demo:frost_bite' as ResourceLocation, 'msm:effect', FROST);
    renderStudio(subject);
    fireEvent.click(screen.getByTestId('effect-advanced-toggle'));
    expect(screen.queryByTestId('effect-preview')).toBeNull();
    expect(screen.getByTestId('effect-studio')).toBeTruthy();
  });
});
