// @vitest-environment happy-dom
/**
 * "Hurt" (`damage`) and "Heal" (`heal`) in the Events editor (B205, ADR 0055 D4): both are
 * actions of format v1 with an amount and a target, listed by label, and `apply_effect` offers
 * the project's own effects first.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { parsePointer } from '../../../../src/renderer/src/forms/pointer';
import {
  ACTIONS,
  actionSpec,
  ENTITY_ACTIONS,
  newAction,
  projectEffects,
  withProjectIds,
} from '../../../../src/renderer/src/studios/blocks-items/blocks-items-model';
import {
  actionTypeLabel,
  EventsEditor,
} from '../../../../src/renderer/src/studios/blocks-items/EventsEditor';
import { element } from '../../fixtures';

afterEach(cleanup);

/** `value` with `next` written at `pointer` (objects and arrays; `undefined` removes). */
function setAtPointer(value: Json, pointer: string, next: Json | undefined): Json {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) return next ?? null;
  const write = (current: Json | undefined, at: number): Json => {
    const token = tokens[at] as string;
    const last = at === tokens.length - 1;
    if (Array.isArray(current)) {
      const copy = [...current];
      const index = Number(token);
      if (last) {
        if (next === undefined) copy.splice(index, 1);
        else copy[index] = next;
      } else copy[index] = write(copy[index], at + 1);
      return copy;
    }
    const object = { ...((current ?? {}) as Record<string, Json>) };
    if (last) {
      if (next === undefined) delete object[token];
      else object[token] = next;
    } else object[token] = write(object[token], at + 1);
    return object;
  };
  return write(value, 0);
}

let latest: Json = null;

function Harness(props: { data: Json; effects?: string[] }) {
  const [data, setData] = useState<Json>(props.data);
  latest = data;
  const subject: Element = element('demo:wand' as ResourceLocation, 'msm:item', data);
  return (
    <EventsEditor
      element={subject}
      problems={[]}
      suggest={(registry) => (registry === 'mob_effect' ? ['minecraft:speed'] : [])}
      effects={props.effects ?? []}
      onChange={(pointer, value) =>
        setData((current) => {
          const next = setAtPointer(current, pointer, value);
          latest = next;
          return next;
        })
      }
    />
  );
}

describe('Hurt and Heal actions', () => {
  it('are actions of format v1 with an amount and a target', () => {
    for (const [type, label] of [
      ['damage', 'Hurt'],
      ['heal', 'Heal'],
    ] as const) {
      const spec = actionSpec(type, ACTIONS);
      expect(spec?.label).toBe(label);
      expect(spec?.fields.map((field) => [field.key, field.required, field.defaultValue])).toEqual([
        ['amount', true, undefined],
        ['target', false, 'self'],
      ]);
      expect(newAction(type, [])).toEqual({ type, amount: 2 });
      expect(ENTITY_ACTIONS.some((entry) => entry.type === type)).toBe(true);
    }
    expect(actionTypeLabel(actionSpec('damage', ACTIONS) as never)).toBe('Hurt (damage)');
  });

  it('lists action types by label and adds Hurt and Heal', () => {
    render(<Harness data={{ events: { 'demo:zap': { actions: [] } } }} />);
    const event = screen.getByTestId('msm-event-demo:zap');
    const picker = within(event).getByLabelText('New action type for demo:zap');
    expect(within(picker).getByRole('option', { name: 'Hurt (damage)' })).toBeTruthy();
    expect(within(picker).getByRole('option', { name: 'Heal (heal)' })).toBeTruthy();
    expect(within(picker).getByRole('option', { name: 'Play sound (play_sound)' })).toBeTruthy();

    fireEvent.change(picker, { target: { value: 'damage' } });
    fireEvent.click(within(event).getByRole('button', { name: 'Add action to demo:zap' }));
    fireEvent.change(picker, { target: { value: 'heal' } });
    fireEvent.click(within(event).getByRole('button', { name: 'Add action to demo:zap' }));
    expect(latest).toEqual({
      events: {
        'demo:zap': {
          actions: [
            { type: 'damage', amount: 2 },
            { type: 'heal', amount: 2 },
          ],
        },
      },
    });

    fireEvent.change(screen.getByLabelText('demo:zap action 1 amount (half hearts)'), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByLabelText('demo:zap action 1 target'), {
      target: { value: 'other' },
    });
    expect(latest).toMatchObject({
      events: {
        'demo:zap': {
          actions: [
            { type: 'damage', amount: 6, target: 'other' },
            { type: 'heal', amount: 2 },
          ],
        },
      },
    });
    const type = screen.getByLabelText('demo:zap action 2 type') as HTMLSelectElement;
    expect(type.value).toBe('heal');
    fireEvent.change(type, { target: { value: 'damage' } });
    expect(latest).toMatchObject({
      events: { 'demo:zap': { actions: [{}, { type: 'damage', amount: 2 }] } },
    });
  });

  it('offers the project effects first in the apply_effect picker', () => {
    const { container } = render(
      <Harness
        data={{
          events: { 'demo:zap': { actions: [{ type: 'apply_effect', effect: '', seconds: 5 }] } },
        }}
        effects={['demo:frost_bite']}
      />,
    );
    const field = screen.getByLabelText('demo:zap action 1 effect');
    const list = container.querySelector(
      `datalist#${CSS.escape(field.getAttribute('list') ?? '')}`,
    );
    expect([...(list?.querySelectorAll('option') ?? [])].map((option) => option.value)).toEqual([
      'demo:frost_bite',
      'minecraft:speed',
    ]);
  });

  it('collects project effects and merges them into suggestions', () => {
    const project = {
      formatVersion: 1 as const,
      name: 'Demo',
      targets: [],
      plugins: [],
      settings: {},
      namespaces: [
        {
          name: 'demo',
          elements: [
            element('demo:rush' as ResourceLocation, 'msm:effect'),
            element('demo:wand' as ResourceLocation, 'msm:item'),
            element('demo:bite' as ResourceLocation, 'msm:effect'),
          ],
          assets: [],
        },
      ],
    };
    expect(projectEffects(project)).toEqual(['demo:bite', 'demo:rush']);
    expect(projectEffects(null)).toEqual([]);
    const suggest = withProjectIds(
      (registry) => (registry === 'mob_effect' ? ['demo:rush', 'minecraft:speed'] : ['x']),
      'mob_effect',
      ['demo:bite', 'demo:rush'],
    );
    expect(suggest('mob_effect', '')).toEqual(['demo:bite', 'demo:rush', 'minecraft:speed']);
    expect(suggest('mob_effect', 'ru')).toEqual(['demo:rush', 'minecraft:speed']);
    expect(suggest('item', '')).toEqual(['x']);
  });
});
