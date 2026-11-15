// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Vehicle Studio (B419, ADR 0091 D1), rendered lazily through the Studio registry on a
 * command stack with the Tank template and its starter geometry: the sections, the bone pickers
 * over the geometry's bones, the mode picker, seats (add, move with the keys), weapons, "Find
 * parts by name", "Make a starter model" through the host, the preview's messages and Very easy's
 * short form.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { requireSyncResult } from '@msm/core';
import type { TemplateContext } from '@msm/plugin-api';
import entitiesPlugin, { vehicleGeometry } from '@msm/plugin-entities';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '../../../../src/renderer/src/store/preferences';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { renderOnStack, schemaState } from '../blocks-items/harness';

vi.mock('../../../../src/renderer/src/components/texture-editor/png-canvas', () => ({
  encodePicture: (image: { width: number; height: number }) =>
    new Uint8Array([image.width, image.height]),
  decodePicture: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
}));

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(() => {
  cleanup();
  usePreferences.setState({ mode: 'easy' as never });
});

const ID = 'demo:tank' as ResourceLocation;
const TANK_BONES = ['hull', 'track_left', 'track_right', 'turret', 'barrel'];
const GEO = element('demo:entity/tank', 'msm:geo_model', vehicleGeometry('tank', 'tank'));

function template(templateId: string): Json {
  const entry = entitiesPlugin.contributes.elementTemplates?.find((t) => t.id === templateId);
  if (entry === undefined) throw new Error(`No template ${templateId}.`);
  const context: TemplateContext = {
    id: ID as TemplateContext['id'],
    namespace: 'demo',
    path: 'tank',
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: undefined,
    target: bundle.target,
  };
  return requireSyncResult(entry.data(context), templateId);
}

const tank = (): Element => element(ID, 'msm:vehicle', template('msm_vehicle_tank'));

type Data = { [key: string]: Json | undefined };
const obj = (value: Json | undefined): Data => (value ?? {}) as Data;

async function open(
  subject: Element,
  options: { others?: Element[]; host?: Partial<BlocksItemsStudioHost> } = {},
) {
  const host = options.host;
  const wrapper =
    host === undefined
      ? undefined
      : ({ children }: { children: ReactNode }) => (
          <BlocksItemsStudioHostContext.Provider
            value={{
              thumbnail: async () => new Uint8Array(),
              revision: 0,
              paintTexture: vi.fn(),
              ...host,
            }}
          >
            {children}
          </BlocksItemsStudioHostContext.Provider>
        );
  const result = renderOnStack(subject, schema, {
    others: options.others ?? [GEO],
    ...(wrapper === undefined ? {} : { wrapper }),
  });
  await screen.findByTestId('vehicle-studio');
  return result;
}

const options = (testId: string) =>
  [...(screen.getByTestId(testId) as HTMLSelectElement).options].map((option) => option.value);

describe('Vehicle Studio', () => {
  it('is registered for msm:vehicle with a Very easy list', () => {
    const entry = DISCOVERED_STUDIOS.find((studio) => studio.id === 'msm.entities.vehicle');
    expect(entry?.kindId).toBe('msm:vehicle');
    expect(entry?.veryEasy).toEqual(['rules-section', 'vehicle-preview', 'vehicle-basics']);
  });

  it('shows every section for the Tank template', async () => {
    await open(tank());
    for (const id of [
      'vehicle-preview',
      'vehicle-identity',
      'vehicle-model',
      'vehicle-movement',
      'vehicle-seats',
      'vehicle-engine',
      'vehicle-health',
      'vehicle-weapons',
      'vehicle-turret',
      'vehicle-parts',
      'vehicle-storage',
      'vehicle-item',
      'vehicle-camera',
      'vehicle-exhaust',
      'msm-events',
      'vehicle-triggers',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    // Very easy's short form is not shown in Easy.
    expect(screen.queryByTestId('vehicle-basics')).toBeNull();
    expect(screen.getByTestId('vehicle-speed-words').textContent).toContain('5 blocks a second');
    expect(screen.queryByTestId('vehicle-missing-bones')).toBeNull();
  });

  it('offers the geometry’s bones in the turret and muzzle pickers', async () => {
    const { data } = await open(tank());
    expect(options('vehicle-turret-bone')).toEqual(['', ...TANK_BONES]);
    expect(options('vehicle-turret-pitch-bone')).toEqual(['', ...TANK_BONES]);
    expect(options('vehicle-weapon-0-muzzle-bone')).toEqual(['', ...TANK_BONES]);
    fireEvent.change(screen.getByTestId('vehicle-turret-bone'), { target: { value: 'hull' } });
    expect(obj(obj(data()).turret).bone).toBe('hull');
    fireEvent.change(screen.getByTestId('vehicle-weapon-0-muzzle-bone'), {
      target: { value: 'turret' },
    });
    const weapons = obj(data()).weapons as Data[];
    expect(obj(weapons[0]?.muzzle as Json).bone).toBe('turret');
  });

  it('keeps and flags a bone the model lacks', async () => {
    const subject = tank();
    const data = { ...(subject.data as Data), turret: { bone: 'cupola' } };
    await open(element(ID, 'msm:vehicle', data as Json));
    expect(options('vehicle-turret-bone')).toEqual(['', 'cupola', ...TANK_BONES]);
    expect(screen.getByTestId('vehicle-missing-bones').textContent).toContain('cupola');
  });

  it('turns part bones on and off and finds parts by name', async () => {
    const { data } = await open(tank());
    fireEvent.click(screen.getByTestId('vehicle-parts-wheels-track_left'));
    fireEvent.click(screen.getByTestId('vehicle-parts-wheels-hull'));
    expect(obj(obj(data()).parts).wheels).toEqual(['hull', 'track_left']);
    fireEvent.click(screen.getByTestId('vehicle-parts-wheels-hull'));
    fireEvent.click(screen.getByTestId('vehicle-parts-wheels-track_left'));
    expect(obj(data()).parts).toBeUndefined();
  });

  it('picks a mode by its picture', async () => {
    const { data } = await open(tank());
    fireEvent.click(screen.getByTestId('vehicle-mode-air'));
    expect(obj(obj(data()).movement).mode).toBe('air');
    expect(screen.getByTestId('vehicle-mode-air').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('vehicle-takeoff-speed')).toBeTruthy();
  });

  it('adds a seat and moves one with the arrow keys', async () => {
    const { data } = await open(tank());
    fireEvent.click(screen.getByTestId('vehicle-add-seat'));
    expect(obj(data()).seats as Json[]).toHaveLength(2);
    fireEvent.keyDown(screen.getByTestId('vehicle-seat-marker-0'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByTestId('vehicle-seat-marker-0'), { key: 'ArrowUp' });
    const first = obj((obj(data()).seats as Json[])[0]);
    expect(first.offset).toEqual([0.05, 1.6, 0.05]);
  });

  it('adds a weapon with a free id', async () => {
    const { data } = await open(tank());
    fireEvent.click(screen.getByTestId('vehicle-add-weapon'));
    const weapons = obj(data()).weapons as Data[];
    expect(weapons.map((weapon) => weapon.id)).toEqual(['cannon', 'machine_gun', 'weapon']);
  });

  it('makes a starter model through the host in one change', async () => {
    const applyChanges = vi.fn(async () => {});
    const subject = element(ID, 'msm:vehicle', {
      format: 1,
      model: { geometry: '', texture: '' },
      movement: { mode: 'ground' },
      turret: { bone: 'turret' },
    });
    await open(subject, { others: [], host: { applyChanges } });
    expect(screen.getByTestId('vehicle-preview-message').textContent).toContain('starter model');
    expect((screen.getByTestId('vehicle-starter-shape') as HTMLSelectElement).value).toBe('tank');
    await act(async () => {
      fireEvent.click(screen.getByTestId('vehicle-make-starter-model'));
    });
    expect(applyChanges).toHaveBeenCalledTimes(1);
    const [items, label] = applyChanges.mock.calls[0] as unknown as [
      { op: string; elementId?: string }[],
      string,
    ];
    expect(items.map((item) => [item.op, item.elementId])).toEqual([
      ['create', 'demo:entity/tank'],
      ['update', 'demo:tank'],
      ['asset', undefined],
    ]);
    expect(label).toBe('Make a starter model (Tank)');
    expect(screen.getByTestId('vehicle-starter-status').textContent).toContain('demo:entity/tank');
  });

  it('says when the 3D preview is not available', async () => {
    await open(tank(), { host: {} });
    expect(screen.getByTestId('vehicle-preview-message').textContent).toContain('not available');
    expect(screen.getByTestId('vehicle-preview-turret').textContent).toBe('Turret: ahead');
  });

  it('shows only the short form, the preview and Rules in Very easy', async () => {
    usePreferences.setState({ mode: 'very-easy' as never });
    const { data } = await open(tank());
    expect(screen.getByTestId('vehicle-basics')).toBeTruthy();
    expect(screen.getByTestId('vehicle-preview')).toBeTruthy();
    expect(screen.queryByTestId('vehicle-seats')).toBeNull();
    expect(screen.queryByTestId('vehicle-weapons')).toBeNull();
    expect(screen.queryByTestId('msm-events')).toBeNull();
    expect(screen.queryByTestId('vehicle-advanced-toggle')).toBeNull();
    fireEvent.change(screen.getByTestId('vehicle-basics-seats'), { target: { value: '3' } });
    expect(obj(data()).seats as Json[]).toHaveLength(3);
    // The tank has a cannon; switching it off removes the fire-charge weapon.
    const cannon = screen.getByTestId('vehicle-basics-cannon') as HTMLInputElement;
    expect(cannon.checked).toBe(true);
    fireEvent.click(cannon);
    expect((obj(data()).weapons as Data[]).map((weapon) => weapon.id)).toEqual(['machine_gun']);
    fireEvent.click(screen.getByTestId('vehicle-basics-fuel'));
    expect(obj(obj(obj(data()).engine).fuel).items).toEqual([
      { item: 'minecraft:coal', ticks: 1200 },
    ]);
    fireEvent.change(screen.getByTestId('vehicle-basics-speed'), { target: { value: '10' } });
    expect(obj(obj(data()).movement).max_speed).toBe(0.5);
  });
});
