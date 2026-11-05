// @vitest-environment happy-dom
/**
 * `apply_effect` in the Events editor (B190, ADR 0044 D2): the action is offered, a new one
 * has its effect and seconds, and the amplifier and target fields write the format's values.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { parsePointer } from '../../../../src/renderer/src/forms/pointer';
import {
  ACTIONS,
  actionSpec,
  EFFECT_TARGETS,
  newAction,
} from '../../../../src/renderer/src/studios/blocks-items/blocks-items-model';
import { EventsEditor } from '../../../../src/renderer/src/studios/blocks-items/EventsEditor';
import { element } from '../../fixtures';

afterEach(cleanup);

function item(data: Json): Element {
  return element('demo:charm' as ResourceLocation, 'msm:item', data);
}

/** `value` with `next` written at `pointer` (`undefined` removes the key). */
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

function Harness(props: { data: Json }) {
  const [data, setData] = useState<Json>(props.data);
  latest = data;
  return (
    <EventsEditor
      element={item(data)}
      problems={[]}
      suggest={(registry) => (registry === 'mob_effect' ? ['minecraft:speed'] : [])}
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

describe('apply_effect', () => {
  it('is an action of format v1 with its fields and defaults', () => {
    const spec = actionSpec('apply_effect', ACTIONS);
    expect(spec?.label).toBe('Apply effect');
    expect(spec?.fields.map((field) => [field.key, field.required, field.defaultValue])).toEqual([
      ['effect', true, undefined],
      ['seconds', true, undefined],
      ['amplifier', false, 0],
      ['target', false, 'self'],
    ]);
    expect(EFFECT_TARGETS).toEqual(['self', 'other']);
    expect(newAction('apply_effect', [])).toEqual({
      type: 'apply_effect',
      effect: '',
      seconds: 10,
    });
  });

  it('is added and edited in the Events editor', () => {
    render(<Harness data={{ events: { 'demo:used': { actions: [] } } }} />);
    const event = screen.getByTestId('msm-event-demo:used');
    fireEvent.change(within(event).getByLabelText('New action type for demo:used'), {
      target: { value: 'apply_effect' },
    });
    fireEvent.click(within(event).getByRole('button', { name: 'Add action to demo:used' }));
    expect(latest).toEqual({
      events: { 'demo:used': { actions: [{ type: 'apply_effect', effect: '', seconds: 10 }] } },
    });

    const target = screen.getByLabelText('demo:used action 1 target') as HTMLSelectElement;
    expect(target.value).toBe('');
    expect(within(target).getByRole('option', { name: '(default: self)' })).toBeTruthy();
    fireEvent.change(target, { target: { value: 'other' } });
    expect(latest).toMatchObject({
      events: { 'demo:used': { actions: [{ target: 'other' }] } },
    });
    fireEvent.change(screen.getByLabelText('demo:used action 1 target'), {
      target: { value: '' },
    });
    expect(
      (latest as { events: Record<string, { actions: Record<string, Json>[] }> }).events[
        'demo:used'
      ]?.actions[0],
    ).not.toHaveProperty('target');
    expect(screen.getByLabelText('demo:used action 1 effect')).toBeTruthy();
    expect(screen.getByLabelText('demo:used action 1 seconds')).toBeTruthy();
    expect(screen.getByLabelText('demo:used action 1 amplifier')).toBeTruthy();
  });
});
