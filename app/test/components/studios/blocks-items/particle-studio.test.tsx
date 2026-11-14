// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Particle Studio (B353, ADR 0081 D1), rendered lazily through the Studio registry on a
 * command stack: every group's fields write the format's values as one undo step each, the
 * frame list adds, reorders and removes frames, "New picture" opens the texture editor at 8
 * by 8, missing project pictures are shown, and the Preview has its modes.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GROUP_LABELS } from '../../../../src/renderer/src/components/ElementSidebar';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(cleanup);

const ID = 'demo:spark' as ResourceLocation;
const particle = (data: Record<string, Json> = {}): Element =>
  element(ID, 'msm:particle', { format: 1, textures: ['minecraft:glow'], ...data });

type Data = { [key: string]: Json | undefined };

const commit = (testId: string, value: string) => {
  const input = screen.getByTestId(testId) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
const pick = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));

function hostSpy() {
  return {
    thumbnail: vi.fn(async () => new Uint8Array()),
    revision: 0,
    paintTexture: vi.fn<BlocksItemsStudioHost['paintTexture']>(),
  } satisfies BlocksItemsStudioHost;
}

describe('Particle Studio', () => {
  it('names both particle kinds in the sidebar', () => {
    expect(GROUP_LABELS['msm:particle']).toBe('Particles');
    expect(GROUP_LABELS['minecraft:particle']).toBe('Particle pictures');
  });

  it('loads lazily with its groups and Preview', async () => {
    renderOnStack(particle(), schema);
    await screen.findByTestId('particle-studio');
    for (const testId of [
      'particle-pictures',
      'particle-life',
      'particle-movement',
      'particle-colour',
      'particle-preview',
      'particle-preview-canvas',
    ]) {
      expect(screen.getByTestId(testId), testId).toBeTruthy();
    }
    expect(screen.getByRole('heading', { name: 'Pictures' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Life and size' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Movement' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Colour and light' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeTruthy();
    const canvas = screen.getByTestId('particle-preview-canvas');
    expect(canvas.dataset.mode).toBe('burst');
    click('particle-preview-stream');
    expect(screen.getByTestId('particle-preview-canvas').dataset.mode).toBe('stream');
    click('particle-preview-background');
    expect(screen.getByTestId('particle-preview-canvas').dataset.background).toBe('light');
  });

  it('adds, reorders and removes frames, each one undo step', async () => {
    const { stack, data } = renderOnStack(particle(), schema);
    await screen.findByTestId('particle-studio');
    expect(screen.getByTestId('particle-frame-0-remove')).toHaveProperty('disabled', true);
    click('particle-add-frame');
    expect((data() as Data).textures).toEqual(['minecraft:glow', 'demo:spark_1']);
    expect(screen.getByTestId('particle-frame-1-missing').textContent).toBe('No picture yet');
    click('particle-frame-1-up');
    expect((data() as Data).textures).toEqual(['demo:spark_1', 'minecraft:glow']);
    commit('particle-frame-1-sprite', 'minecraft:generic_0');
    expect((data() as Data).textures).toEqual(['demo:spark_1', 'minecraft:generic_0']);
    click('particle-frame-0-remove');
    expect((data() as Data).textures).toEqual(['minecraft:generic_0']);
    act(() => stack.undo());
    act(() => stack.undo());
    act(() => stack.undo());
    act(() => stack.undo());
    expect((data() as Data).textures).toEqual(['minecraft:glow']);
  });

  it('opens the texture editor at 8 by 8 for "New picture" and "Paint"', async () => {
    const host = hostSpy();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BlocksItemsStudioHostContext.Provider value={host}>
        {children}
      </BlocksItemsStudioHostContext.Provider>
    );
    const { data } = renderOnStack(particle(), schema, { wrapper });
    await screen.findByTestId('particle-studio');
    click('particle-new-picture');
    expect((data() as Data).textures).toEqual(['minecraft:glow', 'demo:spark_1']);
    expect(host.paintTexture).toHaveBeenCalledWith('demo', 'textures/particle/spark_1.png', {
      width: 8,
      height: 8,
    });
    click('particle-frame-1-paint');
    expect(host.paintTexture).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('particle-frame-0-paint')).toBeNull();
  });

  it('edits the animation, lifetime and size', async () => {
    const { stack, data } = renderOnStack(particle(), schema);
    await screen.findByTestId('particle-studio');
    expect(screen.queryByTestId('particle-frame-ticks')).toBeNull();
    pick('particle-animation', 'loop');
    expect((data() as Data).animation).toBe('loop');
    pick('particle-frame-ticks', '3');
    expect((data() as Data).frame_ticks).toBe(3);
    pick('particle-animation', 'age');
    expect((data() as Data).animation).toBeUndefined();
    pick('particle-lifetime', '40');
    expect((data() as Data).lifetime).toBe(40);
    click('particle-lifetime-between');
    expect((data() as Data).lifetime).toEqual({ min: 40, max: 40 });
    pick('particle-lifetime-max', '60');
    expect((data() as Data).lifetime).toEqual({ min: 40, max: 60 });
    click('particle-lifetime-between');
    expect((data() as Data).lifetime).toBe(40);
    pick('particle-size', '0.3');
    pick('particle-size-end', '0');
    expect(data()).toMatchObject({ size: 0.3, size_end: 0 });
    act(() => stack.undo());
    expect((data() as Data).size_end).toBeUndefined();
  });

  it('edits movement with the gravity shortcuts', async () => {
    const { data } = renderOnStack(particle(), schema);
    await screen.findByTestId('particle-studio');
    expect(screen.getByTestId('particle-gravity-none').getAttribute('aria-pressed')).toBe('true');
    click('particle-gravity-up');
    expect((data() as Data).gravity).toBe(-0.05);
    click('particle-gravity-falls');
    expect((data() as Data).gravity).toBe(0.1);
    click('particle-gravity-none');
    expect((data() as Data).gravity).toBeUndefined();
    pick('particle-drag', '0.9');
    pick('particle-spin', '5');
    expect(data()).toMatchObject({ friction: 0.9, spin: 5 });
    expect(screen.getByTestId('particle-collision')).toHaveProperty('checked', true);
    click('particle-collision');
    expect((data() as Data).collision).toBe(false);
    click('particle-collision');
    expect((data() as Data).collision).toBeUndefined();
  });

  it('edits colour and light, with See-through following the fade by default', async () => {
    const { data } = renderOnStack(particle(), schema);
    await screen.findByTestId('particle-studio');
    const tint = screen.getByTestId('particle-tint').querySelector('input') as HTMLInputElement;
    fireEvent.change(tint, { target: { value: '#ffd060' } });
    expect((data() as Data).color).toBe(0xffd060);
    expect(screen.getByTestId('particle-translucent')).toHaveProperty('checked', false);
    pick('particle-fade', 'out');
    expect((data() as Data).fade).toBe('out');
    expect(screen.getByTestId('particle-translucent')).toHaveProperty('checked', true);
    click('particle-translucent');
    expect((data() as Data).translucent).toBe(false);
    click('particle-translucent');
    expect((data() as Data).translucent).toBeUndefined();
    pick('particle-opacity', '0.5');
    expect((data() as Data).alpha).toBe(0.5);
    click('particle-emissive');
    click('particle-always-show');
    expect(data()).toMatchObject({ emissive: true, always_show: true });
    click('particle-emissive');
    expect((data() as Data).emissive).toBeUndefined();
  });

  it('shows every field under Advanced', async () => {
    renderOnStack(particle(), schema);
    await screen.findByTestId('particle-studio');
    click('particle-advanced-toggle');
    expect(screen.queryByTestId('particle-pictures')).toBeNull();
    expect(screen.getByTestId('particle-advanced-toggle')).toHaveProperty('checked', true);
  });
});
