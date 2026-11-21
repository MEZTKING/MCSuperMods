// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Fluid Studio (B480, ADR 0099 D1, ADR 0101 D1): the preview of the still and flowing
 * pictures with the tint (vanilla water's or lava's from the game where the fluid has none),
 * the flow sliders in blocks a second, "Behaves like" and the pictures.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  blocksPerSecond,
  fluidPreviewOf,
  pictureAssetPath,
  speedWords,
  spreadWords,
  tintColour,
  tintFromColour,
} from '../../../../src/renderer/src/studios/blocks-items/fluid-model';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { renderOnStack, schemaState } from './harness';

const MC263 = builtInTargets.find((entry) => entry.target.blocks?.fluidModel === 'two_fluids');
const MC264 = builtInTargets.find((entry) => entry.target.blocks?.fluidModel === 'one_fluid');
const schemas = new Map<string, SchemaContextState>();
beforeAll(async () => {
  const index = await schemaIndex();
  for (const bundle of builtInTargets) schemas.set(bundle.target.id, schemaState(bundle, index));
});
afterEach(cleanup);

const fluid = (data: Record<string, Json> = {}): Element =>
  element('demo:swamp_water' as ResourceLocation, 'msm:fluid', {
    format: 1,
    display_name: 'Swamp Water',
    tint: 0x4c6b2f,
    textures: { still: 'demo:block/swamp_still', flowing: 'demo:block/swamp_flow' },
    ...data,
  });

/** A host whose thumbnails and vanilla reads record what was asked. */
function host(asked: string[]): BlocksItemsStudioHost {
  return {
    thumbnail: async (path) => {
      asked.push(`project ${path}`);
      return new Uint8Array([1]);
    },
    revision: 0,
    paintTexture: () => undefined,
    modelPreview: {
      folders: (MC263 ?? (builtInTargets[0] as (typeof builtInTargets)[number])).target.folders
        .resource,
      readProjectAsset: async () => null,
      vanilla: {
        readAsset: async (path) => {
          asked.push(`vanilla ${path}`);
          return new Uint8Array([2]);
        },
      },
    },
  };
}

function renderFluid(subject: Element, targetId: string, asked: string[] = []) {
  const value = host(asked);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BlocksItemsStudioHostContext.Provider value={value}>
      {children}
    </BlocksItemsStudioHostContext.Provider>
  );
  return renderOnStack(subject, schemas.get(targetId) as SchemaContextState, { wrapper });
}

describe('fluid preview model', () => {
  it('shows the fluid’s pictures with its tint, and vanilla’s where it has none', () => {
    const preview = fluidPreviewOf(fluid().data);
    expect(preview.tint).toBe('#4c6b2f');
    expect(preview.still).toEqual({ texture: 'demo:block/swamp_still', fallback: false });
    expect(preview.flowing).toEqual({ texture: 'demo:block/swamp_flow', fallback: false });
    expect(preview.bucket).toEqual({ texture: 'minecraft:item/water_bucket', fallback: true });
    expect(preview.overlay).toBeUndefined();
    expect(preview.flow).toEqual({ tickDelay: 5, slopeDistance: 4, dropOff: 1, infinite: true });

    const lava = fluidPreviewOf({ behaves_like: 'lava', flow: { tick_delay: 10 } });
    expect(lava.tint).toBeUndefined();
    expect(lava.still).toEqual({ texture: 'minecraft:block/lava_still', fallback: true });
    expect(lava.flow).toEqual({ tickDelay: 10, slopeDistance: 2, dropOff: 2, infinite: false });
    expect(lava.light).toBe(0);
  });

  it('puts flow numbers and colours in words', () => {
    expect(blocksPerSecond(5)).toBe(4);
    expect(speedWords(20)).toBe('1 block a second');
    expect(speedWords(30)).toBe('0.67 blocks a second');
    expect(spreadWords(1)).toBe('Spreads 7 blocks from its source on flat ground');
    expect(spreadWords(4)).toBe('Spreads 1 block from its source on flat ground');
    expect(tintColour(0x3f76e4)).toBe('#3f76e4');
    expect(tintColour(0x0000ff)).toBe('#0000ff');
    expect(tintFromColour('#3F76E4')).toBe(0x3f76e4);
    expect(tintFromColour('blue')).toBeUndefined();
    expect(pictureAssetPath('minecraft:block/water_still')).toBe(
      'assets/minecraft/textures/block/water_still.png',
    );
  });
});

describe('Fluid Studio', () => {
  it('draws the still and flowing pictures under the tint', async () => {
    if (MC263 === undefined) throw new Error('No two-fluid target.');
    const asked: string[] = [];
    renderFluid(fluid(), MC263.target.id, asked);
    const still = await screen.findByTestId('fluid-preview-still-picture');
    expect(still.getAttribute('data-texture')).toBe('demo:block/swamp_still');
    expect(
      (screen.getByTestId('fluid-preview-still-tint') as HTMLElement).style.backgroundColor,
    ).toMatch(/#4c6b2f|rgb\(76, 107, 47\)/);
    expect(screen.getByTestId('fluid-preview-flowing-tint')).toBeTruthy();
    // The bucket is not tinted and comes from the game.
    expect(screen.queryByTestId('fluid-preview-bucket-tint')).toBeNull();
    expect(screen.getByTestId('fluid-preview-bucket').textContent).toContain('from your game');
    await waitFor(() =>
      expect(asked).toEqual(
        expect.arrayContaining([
          'project assets/demo/textures/block/swamp_still.png',
          'project assets/demo/textures/block/swamp_flow.png',
          'vanilla assets/minecraft/textures/item/water_bucket.png',
        ]),
      ),
    );
    expect(screen.getByTestId('fluid-preview-words').textContent).toBe(
      'Swamp Water flows 4 blocks a second and spreads 7 blocks.',
    );
    expect(screen.getByTestId('fluid-two-fluids')).toBeTruthy();
    expect(screen.getByTestId('fluid-also-makes').textContent).toBe(
      'Also makes: demo:swamp_water_bucket',
    );
  });

  it('edits behaviour, colour, flow and pictures', async () => {
    if (MC264 === undefined) throw new Error('No one-fluid target.');
    const { data, stack } = renderFluid(fluid(), MC264.target.id);
    await screen.findByTestId('fluid-studio');
    expect(screen.queryByTestId('fluid-two-fluids')).toBeNull();
    const read = () => data() as { [key: string]: Json };

    fireEvent.change(screen.getByTestId('fluid-behaves-like'), { target: { value: 'lava' } });
    expect(read().behaves_like).toBe('lava');
    expect(screen.getByTestId('fluid-flow-speed-words').textContent).toBe('0.67 blocks a second');

    fireEvent.change(screen.getByTestId('fluid-flow-speed'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('fluid-flow-spread'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('fluid-flow-infinite'));
    expect(read().flow).toEqual({ tick_delay: 10, drop_off: 1, infinite: true });
    expect(screen.getByTestId('fluid-flow-spread-words').textContent).toBe(
      'Spreads 7 blocks from its source on flat ground',
    );
    fireEvent.click(screen.getByTestId('fluid-flow-defaults'));
    expect(read().flow).toBeUndefined();

    fireEvent.change(screen.getByTestId('fluid-tint'), { target: { value: '#ff8800' } });
    expect(read().tint).toBe(0xff8800);
    fireEvent.click(screen.getByTestId('fluid-tint-on'));
    expect(read().tint).toBeUndefined();

    fireEvent.change(screen.getByTestId('fluid-light'), { target: { value: '12' } });
    expect(read().light).toBe(12);

    const bucket = screen.getByTestId('fluid-texture-bucket');
    fireEvent.change(bucket, { target: { value: 'demo:item/swamp_bucket' } });
    fireEvent.blur(bucket);
    expect(read().textures).toEqual({
      still: 'demo:block/swamp_still',
      flowing: 'demo:block/swamp_flow',
      bucket: 'demo:item/swamp_bucket',
    });
    stack.undo();
    expect((read().textures as { bucket?: string }).bucket).toBeUndefined();
  });
});
