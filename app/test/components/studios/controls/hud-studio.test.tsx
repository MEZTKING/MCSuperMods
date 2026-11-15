// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The HUD Studio (B420, ADR 0091 D1, ADR 0089 D1, D2, D9), rendered lazily through the Studio
 * registry on a command stack with the Mana bar template: the sections, the look (changing it
 * drops the other types' fields), the value sources and their fields, the anchor picker, the
 * missing picture warning, when it shows, the layout preview (placed by `hud-layout.ts` at GUI
 * scales 2, 3 and 4, vehicle-only elements with "Riding a vehicle") and Very easy's sections.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { usePreferences } from '../../../../src/renderer/src/store/preferences';
import {
  hudLookOf,
  hudPreviewItem,
  missingSprites,
  newHudValue,
  textWidth,
  withHudLook,
  withShow,
} from '../../../../src/renderer/src/studios/controls/controls-model';
import { previewLayout } from '../../../../src/renderer/src/studios/controls/HudPreview';
import { guiSize, layoutHud } from '../../../../src/renderer/src/studios/controls/hud-layout';
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

const ID = 'demo:mana' as ResourceLocation;
type Data = { [key: string]: Json | undefined };
const obj = (value: Json | undefined): Data => (value ?? {}) as Data;
const mana = (): Element => element(ID, 'msm:hud', templateData('msm_hud_mana_bar', ID));
const stamina = (): Element =>
  element('demo:stamina', 'msm:hud', templateData('msm_hud_stamina_bar', 'demo:stamina'));
const open = (subject: Element = mana(), options: Parameters<typeof openStudio>[3] = {}) =>
  openStudio(subject, schema, 'hud-studio', options);
const box = (id: string) => {
  const node = screen.getByTestId(`hud-preview-item-${id}`);
  return ['x', 'y', 'w', 'h'].map((key) => Number(node.getAttribute(`data-${key}`)));
};

describe('HUD Studio helpers', () => {
  it('changes the look and drops the fields of other types', () => {
    const bar = templateData('msm_hud_mana_bar', ID);
    const text = withHudLook(bar, 'text');
    expect(text.type).toBe('text');
    expect(text.text).toBe('Value: {value}');
    for (const field of ['max', 'size', 'fill_color', 'back_color']) {
      expect(text[field]).toBeUndefined();
    }
    expect(text.value).toEqual(obj(bar).value);
    const number = withHudLook({ ...text, color: '#ff0000' }, 'number');
    expect(number.text).toBeUndefined();
    expect(number.color).toBe('#ff0000');
    expect(hudLookOf(number)).toBe('number');
    expect(hudLookOf(text)).toBe('text');
    expect(withHudLook(number, 'icons')).toEqual({
      format: 1,
      type: 'icons',
      anchor: 'above_hotbar',
      value: obj(bar).value as Json,
    });
  });

  it('makes values with their required fields', () => {
    expect(newHudValue('data', 'demo', 'mana')).toEqual({
      source: 'data',
      scope: 'player',
      namespace: 'demo',
      key: 'mana',
    });
    expect(newHudValue('score', 'demo', 'mana')).toEqual({ source: 'score', objective: 'mana' });
    expect(newHudValue('vehicle', 'demo', 'mana')).toEqual({ source: 'vehicle', stat: 'fuel' });
    expect(newHudValue('player', 'demo', 'mana')).toEqual({ source: 'player', stat: 'health' });
    expect(newHudValue('set', 'demo', 'mana')).toEqual({ source: 'set' });
  });

  it('drops the vehicle when the element no longer shows in one', () => {
    expect(withShow({ show: 'driving', vehicle: 'demo:tank' }, 'always')).toEqual({
      show: 'always',
    });
    expect(withShow({ show: 'always' }, 'when_set')).toEqual({});
  });

  it('sizes each type as the layout needs', () => {
    expect(hudPreviewItem('demo:a', { type: 'bar', size: [40, 3], max: 10 }, 5)).toMatchObject({
      box: { size: [40, 3] },
      filled: 20,
    });
    expect(
      hudPreviewItem('demo:b', { type: 'icons', icon: 'demo:hud/x', max: 20 }, 7).box.size,
    ).toEqual([81, 9]);
    const text = hudPreviewItem('demo:c', { type: 'text', text: 'Y: {value}' }, 64);
    expect(text.line).toBe('Y: 64');
    expect(text.box.size).toEqual([textWidth('Y: 64'), 9]);
  });

  it('places the mana and stamina bars as the golden rules do', () => {
    const project = projectOf(mana(), stamina());
    const layout = previewLayout(
      project,
      { id: ID, data: mana().data },
      {
        scale: 3,
        inVehicle: false,
      },
    );
    expect(layout.gui).toEqual(guiSize([1920, 1080], 3));
    const positions = layoutHud(
      [
        { id: ID, anchor: 'above_hotbar', size: [81, 5] },
        { id: 'demo:stamina', anchor: 'above_hotbar', order: 1, size: [81, 5] },
      ],
      layout.gui,
    );
    for (const item of layout.items) {
      expect(item.position).toEqual(positions.get(item.box.id));
    }
    // Mana (order 0) sits lowest, right above the 52-pixel band; stamina stacks above it.
    expect(positions.get(ID)).toEqual([279, 360 - 52 - 5]);
    expect(positions.get('demo:stamina')).toEqual([279, 360 - 52 - 5 - 2 - 5]);
  });

  it('reports the project sprites without a picture', () => {
    const project = projectOf(mana());
    const data = { type: 'bar', sprite: 'demo:hud/mana', back_sprite: 'minecraft:hud/x' };
    expect(missingSprites(project, bundle.target, data)).toEqual([
      {
        field: 'sprite',
        sprite: 'demo:hud/mana',
        path: `assets/demo/${bundle.target.folders.resource.textures}/gui/sprites/hud/mana.png`,
      },
    ]);
  });
});

describe('HUD Studio', () => {
  it('is registered for msm:hud with a Very easy list', () => {
    const entry = DISCOVERED_STUDIOS.find((studio) => studio.id === 'msm.controls.hud');
    expect(entry?.kindId).toBe('msm:hud');
    expect(entry?.veryEasy).toEqual([
      'hud-preview',
      'hud-look',
      'hud-value',
      'hud-where',
      'hud-style',
    ]);
  });

  it('shows every section and previews the Mana bar', async () => {
    await open(mana(), { others: [stamina()] });
    for (const id of [
      'hud-preview',
      'hud-look',
      'hud-value',
      'hud-where',
      'hud-style',
      'hud-show',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId('hud-look-bar').getAttribute('aria-checked')).toBe('true');
    expect((screen.getByTestId('hud-value-source') as HTMLSelectElement).value).toBe('data');
    expect((screen.getByTestId('hud-value-key') as HTMLInputElement).value).toBe('mana');
    expect((screen.getByTestId('hud-fill-color') as HTMLInputElement).value).toBe('#3c6cf0');
    expect(screen.getByTestId('hud-anchor-above_hotbar').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('hud-preview-screen').getAttribute('data-gui')).toBe('640x360');
    expect(box(ID)).toEqual([279, 303, 81, 5]);
    expect(box('demo:stamina')).toEqual([279, 296, 81, 5]);
    expect(screen.getByTestId(`hud-preview-item-${ID}`).getAttribute('data-current')).toBe('true');
  });

  it('previews at GUI scales 2 and 4', async () => {
    await open();
    fireEvent.click(screen.getByTestId('hud-preview-scale-2'));
    expect(screen.getByTestId('hud-preview-screen').getAttribute('data-gui')).toBe('960x540');
    expect(box(ID)).toEqual([439, 540 - 57, 81, 5]);
    fireEvent.click(screen.getByTestId('hud-preview-scale-4'));
    expect(screen.getByTestId('hud-preview-screen').getAttribute('data-gui')).toBe('480x270');
    expect(box(ID)).toEqual([199, 270 - 57, 81, 5]);
  });

  it('moves the element with the anchor picker and the offset', async () => {
    const { data } = await open();
    fireEvent.click(screen.getByTestId('hud-anchor-top_right'));
    expect(obj(data()).anchor).toBe('top_right');
    expect(box(ID)).toEqual([640 - 2 - 81, 2, 81, 5]);
    fireEvent.change(screen.getByTestId('hud-offset-y'), { target: { value: '10' } });
    expect(obj(data()).offset).toEqual([0, 10]);
    expect(box(ID)).toEqual([557, 12, 81, 5]);
    fireEvent.click(screen.getByTestId('hud-anchor-above_hotbar'));
    expect(obj(data()).anchor).toBeUndefined();
  });

  it('changes the look in one edit and shows that type’s fields', async () => {
    const { data, stack } = await open();
    fireEvent.click(screen.getByTestId('hud-look-number'));
    expect(obj(data()).type).toBe('text');
    expect(obj(data()).fill_color).toBeUndefined();
    expect(screen.queryByTestId('hud-text')).toBeNull();
    expect(screen.getByTestId('hud-color')).toBeTruthy();
    expect(screen.queryByTestId('hud-max')).toBeNull();
    fireEvent.click(screen.getByTestId('hud-look-text'));
    expect(obj(data()).text).toBe('Value: {value}');
    expect(screen.getByTestId('hud-text')).toBeTruthy();
    stack.undo();
    stack.undo();
    expect(obj(data()).type).toBe('bar');
    expect(obj(data()).fill_color).toBe('#3c6cf0');
  });

  it('picks the value source and its fields', async () => {
    const { data } = await open();
    fireEvent.change(screen.getByTestId('hud-value-source'), { target: { value: 'vehicle' } });
    expect(obj(data()).value).toEqual({ source: 'vehicle', stat: 'fuel' });
    fireEvent.change(screen.getByTestId('hud-value-vehicle-stat'), { target: { value: 'ammo' } });
    fireEvent.change(screen.getByTestId('hud-value-weapon'), { target: { value: 'cannon' } });
    expect(obj(data()).value).toEqual({ source: 'vehicle', stat: 'ammo', weapon: 'cannon' });
    fireEvent.change(screen.getByTestId('hud-value-vehicle-stat'), { target: { value: 'speed' } });
    expect(obj(data()).value).toEqual({ source: 'vehicle', stat: 'speed' });
    fireEvent.change(screen.getByTestId('hud-value-source'), { target: { value: 'score' } });
    fireEvent.change(screen.getByTestId('hud-value-objective'), { target: { value: 'points' } });
    expect(obj(data()).value).toEqual({ source: 'score', objective: 'points' });
    fireEvent.change(screen.getByTestId('hud-value-source'), { target: { value: 'set' } });
    expect(screen.getByTestId('hud-value-set-note')).toBeTruthy();
  });

  it('takes the full amount from another value and back', async () => {
    const { data } = await open();
    fireEvent.click(screen.getByTestId('hud-max-use-value'));
    expect(obj(data()).max).toEqual({
      source: 'data',
      scope: 'player',
      namespace: 'demo',
      key: 'mana_max',
    });
    fireEvent.click(screen.getByTestId('hud-max-use-number'));
    expect(obj(data()).max).toBeUndefined();
  });

  it('warns about a picture the project lacks', async () => {
    const { data } = await open();
    fireEvent.change(screen.getByTestId('hud-sprite'), { target: { value: 'demo:hud/mana' } });
    expect(obj(data()).sprite).toBe('demo:hud/mana');
    expect(screen.getByTestId('hud-missing-sprites').textContent).toContain('demo:hud/mana');
  });

  it('shows in a vehicle with the vehicle picker; the preview needs "Riding a vehicle"', async () => {
    const tank = element('demo:tank', 'msm:vehicle', { format: 1 });
    const { data } = await open(mana(), { others: [tank, stamina()] });
    fireEvent.change(screen.getByTestId('hud-show-select'), { target: { value: 'driving' } });
    fireEvent.change(screen.getByTestId('hud-vehicle'), { target: { value: 'demo:tank' } });
    expect(obj(data()).show).toBe('driving');
    expect(obj(data()).vehicle).toBe('demo:tank');
    fireEvent.click(screen.getByTestId('hud-starts-hidden'));
    expect(obj(data()).starts_hidden).toBe(true);
    // The element being edited is always drawn; a vehicle-only neighbour only when riding.
    expect(screen.getByTestId(`hud-preview-item-${ID}`)).toBeTruthy();
  });

  it('leaves out other vehicle-only elements unless riding', async () => {
    const fuel = element('demo:fuel', 'msm:hud', {
      format: 1,
      type: 'bar',
      show: 'in_vehicle',
      value: { source: 'vehicle', stat: 'fuel' },
    });
    await open(mana(), { others: [fuel] });
    expect(screen.queryByTestId('hud-preview-item-demo:fuel')).toBeNull();
    fireEvent.click(screen.getByTestId('hud-preview-vehicle'));
    expect(screen.getByTestId('hud-preview-item-demo:fuel')).toBeTruthy();
  });

  it('fills the bar with the preview value', async () => {
    await open();
    fireEvent.change(screen.getByTestId('hud-preview-value'), { target: { value: '50' } });
    const fill = screen.getByTestId(`hud-preview-item-${ID}`).querySelectorAll('rect')[1];
    expect(fill?.getAttribute('width')).toBe('41');
  });

  it('shows the preview, look, value, place and colours in Very easy', async () => {
    usePreferences.setState({ mode: 'very-easy' as never });
    await open();
    for (const id of ['hud-preview', 'hud-look', 'hud-value', 'hud-where', 'hud-style']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.queryByTestId('hud-show')).toBeNull();
    expect(screen.queryByTestId('hud-advanced-toggle')).toBeNull();
  });
});
