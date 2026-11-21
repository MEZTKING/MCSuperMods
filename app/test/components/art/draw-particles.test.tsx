// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Draw frames… in the Particle Studio (B495, ADR 0092 D10 (b)): all four frames of a particle
 * recipe drawn in one step, as the pictures `<id>_0` to `<id>_3` and the frame list naming them,
 * one undo step. The particle recipes are still stubs until B494 draws them, so this file
 * marks them drawn; their pictures are then the placeholder frames, which is enough to check
 * the write.
 */
import type { CommandStack, Json, ResourceLocation } from '@msm/core';
import { type ArtRecipeInfo, artFramePngs } from '@msm/plugin-library';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type ChangeAsset,
  type ChangeItem,
  planChangeItems,
} from '../../../src/renderer/src/changeset/changeset';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../src/renderer/src/studios/blocks-items/host';
import type { SchemaContextState } from '../../../src/renderer/src/studios/use-schema-context';
import { element } from '../fixtures';
import { schemaIndex } from '../forms/schemas';
import { renderOnStack, schemaState } from '../studios/blocks-items/harness';

vi.mock('@msm/plugin-library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@msm/plugin-library')>();
  return {
    ...actual,
    ART_RECIPE_INFO: actual.ART_RECIPE_INFO.map((info: ArtRecipeInfo) =>
      info.kind === 'particle' ? { ...info, drawn: true } : info,
    ),
  };
});

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(cleanup);

const RUBY = [196, 28, 52] as const;
const ID = 'demo:spark' as ResourceLocation;
const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));

describe('Draw frames… in the Particle Studio', () => {
  it('draws all four frames in one undo step', async () => {
    const calls: { items: readonly ChangeItem[]; label: string; writes: readonly ChangeAsset[] }[] =
      [];
    let current: CommandStack | undefined;
    const host: BlocksItemsStudioHost = {
      thumbnail: async () => new Uint8Array(),
      revision: 0,
      paintTexture: () => undefined,
      applyChanges: async (items, label, writes) => {
        const stack = current as CommandStack;
        const plan = planChangeItems(stack.state, items);
        calls.push({ items, label, writes });
        stack.execute({
          id: 'test.apply',
          label,
          apply(draft) {
            for (const part of plan.commands) part.apply(draft);
          },
        });
      },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BlocksItemsStudioHostContext.Provider value={host}>
        {children}
      </BlocksItemsStudioHostContext.Provider>
    );
    const { stack, data } = renderOnStack(
      element(ID, 'msm:particle', { format: 1, textures: ['minecraft:glow'] }),
      schema,
      { wrapper },
    );
    current = stack;
    const button = await screen.findByTestId('particle-draw-frames');
    expect(button.textContent).toBe('Draw frames…');
    fireEvent.click(button);
    await screen.findByTestId('draw-dialog');
    expect(screen.getByTestId('draw-option-particle_spark')).toBeTruthy();
    expect(screen.getByTestId('draw-variation-0').textContent).toContain('4 frames');
    click('draw-option-particle_orb');
    click('draw-variation-1');
    click('draw-use');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.label).toBe('Draw frames');
    const frames = artFramePngs({
      recipe: 'particle_orb',
      colour: RUBY,
      detail: 'normal',
      seed: 1,
    });
    const assets = calls[0]?.items.filter((item) => item.op === 'asset').map((item) => item.asset);
    expect(assets?.map((asset) => asset?.path)).toEqual([
      'textures/particle/spark_0.png',
      'textures/particle/spark_1.png',
      'textures/particle/spark_2.png',
      'textures/particle/spark_3.png',
    ]);
    expect(assets?.map((asset) => asset?.bytes)).toEqual(frames);
    expect((data() as { textures?: Json }).textures).toEqual([
      'demo:spark_0',
      'demo:spark_1',
      'demo:spark_2',
      'demo:spark_3',
    ]);
    stack.undo();
    expect((data() as { textures?: Json }).textures).toEqual(['minecraft:glow']);
  });

  it('is disabled where the host cannot write pictures', async () => {
    renderOnStack(element(ID, 'msm:particle', { format: 1, textures: ['minecraft:glow'] }), schema);
    expect(await screen.findByTestId('particle-draw-frames')).toHaveProperty('disabled', true);
  });
});
