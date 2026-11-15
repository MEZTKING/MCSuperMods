// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Key bind Studio (B420, ADR 0091 D1, ADR 0088 D3, D8), rendered lazily through the Studio
 * registry on a command stack with the Dash key template: the sections, "Press a key" (keys and
 * mouse buttons through the target's code tables, a key the game cannot use), "No key", when it
 * works with the vehicle picker, the group name rule, the validators' clash warnings at
 * `/default_key`, the triggers and Very easy's sections.
 */
import type { Element, Json, Problem, ResourceLocation } from '@msm/core';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { usePreferences } from '../../../../src/renderer/src/store/preferences';
import {
  categoryOf,
  keyGroups,
  ticksWords,
  withCategory,
  withWhen,
} from '../../../../src/renderer/src/studios/controls/controls-model';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { projectOf, schemaState } from '../blocks-items/harness';
import { bundle, openStudio, templateData } from './harness';

let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(() => {
  cleanup();
  usePreferences.setState({ mode: 'easy' as never });
});

const ID = 'demo:dash' as ResourceLocation;
type Data = { [key: string]: Json | undefined };
const obj = (value: Json | undefined): Data => (value ?? {}) as Data;
const dash = (): Element => element(ID, 'msm:key_bind', templateData('msm_key_bind_dash', ID));
const vehicle = (id: ResourceLocation): Element => element(id, 'msm:vehicle', { format: 1 });
const open = (subject: Element = dash(), options: Parameters<typeof openStudio>[3] = {}) =>
  openStudio(subject, schema, 'key-bind-studio', options);

describe('Key bind Studio helpers', () => {
  it('moves a key into a group and takes the group’s name', () => {
    const other = element('demo:blink', 'msm:key_bind', {
      format: 1,
      default_key: 'key.keyboard.b',
      category: 'magic',
      category_name: 'Magic',
    });
    const project = projectOf(dash(), other);
    const groups = keyGroups(project, 'demo');
    expect(groups.map((group) => group.category)).toEqual(['abilities', 'magic']);
    expect(withCategory(dash().data, 'magic', groups, ID)).toMatchObject({
      category: 'magic',
      category_name: 'Magic',
    });
    const cleared = withCategory(dash().data, undefined, groups, ID);
    expect(cleared.category).toBeUndefined();
    expect(categoryOf(cleared)).toBe('keys');
  });

  it('drops the vehicle when the key no longer works in one', () => {
    expect(withWhen({ when: 'driving', vehicle: 'demo:tank' }, 'on_foot')).toEqual({
      when: 'on_foot',
    });
    expect(withWhen({ when: 'driving', vehicle: 'demo:tank' }, 'in_vehicle')).toEqual({
      when: 'in_vehicle',
      vehicle: 'demo:tank',
    });
    expect(withWhen({ when: 'driving' }, 'always')).toEqual({});
  });

  it('says ticks in seconds', () => {
    expect(ticksWords(20)).toBe('1 second');
    expect(ticksWords(600)).toBe('30 seconds');
    expect(ticksWords(5)).toBe('0.25 seconds');
    expect(ticksWords(undefined)).toBe('no wait');
  });
});

describe('Key bind Studio', () => {
  it('is registered for msm:key_bind with a Very easy list', () => {
    const entry = DISCOVERED_STUDIOS.find((studio) => studio.id === 'msm.controls.key-bind');
    expect(entry?.kindId).toBe('msm:key_bind');
    expect(entry?.veryEasy).toEqual([
      'rules-section',
      'key-bind-name',
      'key-bind-key',
      'key-bind-when',
    ]);
  });

  it('shows every section for the Dash template', async () => {
    await open();
    for (const id of [
      'key-bind-name',
      'key-bind-key',
      'key-bind-when',
      'key-bind-timing',
      'msm-events',
      'key-bind-triggers',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId('key-bind-key-words').textContent).toBe('Z');
    expect((screen.getByTestId('key-bind-display-name') as HTMLInputElement).value).toBe('Dash');
    expect((screen.getByTestId('key-bind-when-select') as HTMLSelectElement).value).toBe('on_foot');
    expect(screen.getByTestId('key-bind-cooldown-words').textContent).toBe('1 second');
    // No Rules trigger names a key bind yet (B424), so there is no Rules section.
    expect(screen.queryByTestId('rules-slot')).toBeNull();
    expect((screen.getByTestId('key-bind-on-press') as HTMLSelectElement).value).toBe(
      'demo:dash_press',
    );
  });

  it('takes the default key from a key press, in one undo step', async () => {
    const { data, stack } = await open();
    fireEvent.click(screen.getByTestId('key-bind-press'));
    fireEvent.keyDown(screen.getByTestId('key-bind-capture'), { code: 'KeyG', key: 'g' });
    expect(obj(data()).default_key).toBe('key.keyboard.g');
    expect(screen.getByTestId('key-bind-key-words').textContent).toBe('G');
    expect(screen.queryByTestId('key-bind-capture')).toBeNull();
    act(() => stack.undo());
    expect(obj(data()).default_key).toBe('key.keyboard.z');
  });

  it('takes a mouse button, and says when the game cannot use a key', async () => {
    const { data } = await open();
    fireEvent.click(screen.getByTestId('key-bind-press'));
    fireEvent.keyDown(screen.getByTestId('key-bind-capture'), {
      code: 'MediaPlayPause',
      key: 'MediaPlayPause',
    });
    expect(screen.getByTestId('key-bind-capture-message').textContent).toContain('cannot use');
    expect(obj(data()).default_key).toBe('key.keyboard.z');
    fireEvent.mouseDown(screen.getByTestId('key-bind-capture'), { button: 3 });
    expect(obj(data()).default_key).toBe('key.mouse.4');
    expect(screen.getByTestId('key-bind-key-words').textContent).toBe('Mouse button 4');
  });

  it('stops listening on Escape without changing the key', async () => {
    const { data } = await open();
    fireEvent.click(screen.getByTestId('key-bind-press'));
    fireEvent.keyDown(screen.getByTestId('key-bind-capture'), { code: 'Escape', key: 'Escape' });
    expect(screen.queryByTestId('key-bind-capture')).toBeNull();
    expect(obj(data()).default_key).toBe('key.keyboard.z');
  });

  it('sets no key', async () => {
    const { data } = await open();
    fireEvent.click(screen.getByTestId('key-bind-no-key'));
    expect(obj(data()).default_key).toBe(bundle.target.controls?.unboundKey);
    expect(screen.getByTestId('key-bind-key-words').textContent).toContain('No key');
  });

  it('shows the validators’ clash warnings under the key', async () => {
    const problems: Problem[] = [
      {
        severity: 'warning',
        code: 'controls.vanilla-key-clash',
        elementId: ID,
        path: '/default_key',
        message: 'The z key already does something in Minecraft.',
      },
    ];
    await open(dash(), { problems });
    expect(screen.getByTestId('key-bind-key-problems').textContent).toContain(
      'already does something in Minecraft',
    );
  });

  it('picks when it works and the vehicle', async () => {
    const { data } = await open(dash(), {
      others: [vehicle('demo:tank' as ResourceLocation), vehicle('demo:car' as ResourceLocation)],
    });
    expect(screen.queryByTestId('key-bind-vehicle')).toBeNull();
    fireEvent.change(screen.getByTestId('key-bind-when-select'), {
      target: { value: 'driving' },
    });
    expect(obj(data()).when).toBe('driving');
    const picker = screen.getByTestId('key-bind-vehicle') as HTMLSelectElement;
    expect([...picker.options].map((option) => option.value)).toEqual([
      '',
      'demo:car',
      'demo:tank',
    ]);
    fireEvent.change(picker, { target: { value: 'demo:tank' } });
    expect(obj(data()).vehicle).toBe('demo:tank');
    fireEvent.change(screen.getByTestId('key-bind-when-select'), { target: { value: 'always' } });
    expect(obj(data()).when).toBeUndefined();
    expect(obj(data()).vehicle).toBeUndefined();
  });

  it('keeps one name per group', async () => {
    const other = element('demo:blink', 'msm:key_bind', {
      format: 1,
      default_key: 'key.keyboard.b',
      category: 'abilities',
      category_name: 'Powers',
    });
    const { data } = await open(dash(), { others: [other] });
    expect(screen.getByTestId('key-bind-group-note').textContent).toContain('Powers');
    fireEvent.click(screen.getByTestId('key-bind-use-group-name'));
    expect(obj(data()).category_name).toBe('Powers');
    expect(screen.queryByTestId('key-bind-group-note')).toBeNull();
  });

  it('sets the triggers and the timing', async () => {
    const { data } = await open();
    fireEvent.change(screen.getByTestId('key-bind-while-held'), {
      target: { value: 'demo:dash_press' },
    });
    expect(obj(data())['msm:while_held']).toBe('demo:dash_press');
    fireEvent.change(screen.getByTestId('key-bind-cooldown'), { target: { value: '600' } });
    expect(obj(data()).cooldown_ticks).toBe(600);
    expect(screen.getByTestId('key-bind-cooldown-words').textContent).toBe('30 seconds');
  });

  it('shows only the name, the key and when it works in Very easy', async () => {
    usePreferences.setState({ mode: 'very-easy' as never });
    await open();
    expect(screen.getByTestId('key-bind-name')).toBeTruthy();
    expect(screen.getByTestId('key-bind-key')).toBeTruthy();
    expect(screen.getByTestId('key-bind-when')).toBeTruthy();
    expect(screen.queryByTestId('key-bind-timing')).toBeNull();
    expect(screen.queryByTestId('msm-events')).toBeNull();
    expect(screen.queryByTestId('key-bind-advanced-toggle')).toBeNull();
  });
});
