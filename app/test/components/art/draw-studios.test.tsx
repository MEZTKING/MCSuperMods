// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Draw… in the blocks and items Studios (B495, ADR 0092 D10 (b)): a texture slot of a typed
 * block drawn as a new texture that the slot then names, one undo step that Undo takes back;
 * a model's picture row drawn over an existing texture as one undoable write. Neither needs
 * an AI host.
 */
import {
  type CommandStack,
  commands,
  type Element,
  type Json,
  type ResourceLocation,
} from '@msm/core';
import { artLookPng } from '@msm/plugin-library';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../lazy-chunks';
import { renderOnStack, schemaState } from '../studios/blocks-items/harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
  // The Draw dialog is a lazy chunk (ADR 0092 D17): loaded once here, so findBy does not race
  // Vitest transforming it (over its one-second default when the whole suite ran at once).
  await preloadChunks(() => import('../../../src/renderer/src/components/art/DrawPictureDialog'));
}, PRELOAD_TIMEOUT_MS);
afterEach(cleanup);

const RUBY = [196, 28, 52] as const;
const ID = 'demo:thing' as ResourceLocation;
const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));

interface Call {
  items: readonly ChangeItem[];
  label: string;
  writes: readonly ChangeAsset[];
}

/** A host whose `applyChanges` applies the items as one command and records each call. */
function renderWithHost(subject: Element, layers: readonly string[] = []) {
  const calls: Call[] = [];
  let current: CommandStack | undefined;
  const host: BlocksItemsStudioHost = {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    textureLayers: async () => layers.map((texture) => ({ texture, layer: 'solid' as const })),
    applyChanges: async (items, label, writes) => {
      const stack = current as CommandStack;
      const plan = planChangeItems(stack.state, items);
      if (plan.skipped.length > 0) throw new Error('The project changed meanwhile.');
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
  const rendered = renderOnStack(subject, schema, { wrapper });
  current = rendered.stack;
  return { ...rendered, calls };
}

const assetsOf = (stack: CommandStack) =>
  stack.state.namespaces
    .find((entry) => entry.name === 'demo')
    ?.assets.map((asset) => asset.path) ?? [];

describe('Draw… on a Block Studio texture slot', () => {
  it('adds a new texture that the slot names, in one undo step', async () => {
    const { stack, data, calls } = renderWithHost(
      element(ID, 'msm:block', { format: 1, display_name: 'Thing', type: 'leaves' }),
    );
    const button = await screen.findByTestId('block-texture-all-draw');
    expect(button.textContent).toBe('Draw…');
    expect(screen.queryByTestId('block-texture-all-ai')).toBeNull();
    fireEvent.click(button);
    await screen.findByTestId('draw-dialog', undefined, { timeout: LAZY_CHUNK_TIMEOUT_MS });
    click('draw-option-leaves');
    click('draw-new-looks');
    click('draw-variation-2');
    click('draw-use');
    await waitFor(() => expect(calls).toHaveLength(1));
    const [call] = calls;
    expect(call?.label).toBe('Draw Leaves (every face)');
    expect(call?.writes).toEqual([]);
    const asset = call?.items.find((item) => item.op === 'asset')?.asset;
    expect(asset?.path).toBe('textures/block/thing_all.png');
    expect(asset?.bytes).toEqual(
      artLookPng({ recipe: 'leaves', colour: RUBY, detail: 'normal', seed: 8 }),
    );
    expect((data() as { textures?: Json }).textures).toEqual({ all: 'demo:block/thing_all' });
    expect(assetsOf(stack)).toContain('textures/block/thing_all.png');
    stack.undo();
    expect((data() as { textures?: Json }).textures).toBeUndefined();
    expect(assetsOf(stack)).not.toContain('textures/block/thing_all.png');
  });
});

describe('Draw… on a model picture row', () => {
  it('writes over the existing texture as one undoable write', async () => {
    const { stack, calls } = renderWithHost(
      element(ID, 'msm:item', {
        format: 1,
        display_name: 'Ruby Sword',
        model: 'demo:item/ruby_sword',
      }),
      ['demo:item/ruby_sword'],
    );
    stack.execute(
      commands.addAsset('demo', { path: 'textures/item/ruby_sword.png', mediaType: 'image/png' }),
    );
    const button = await screen.findByTestId('item-model-ai-demo-item-ruby-sword-draw');
    fireEvent.click(button);
    await screen.findByTestId('draw-dialog', undefined, { timeout: LAZY_CHUNK_TIMEOUT_MS });
    expect(screen.getByTestId('draw-option-sword').getAttribute('aria-selected')).toBe('true');
    click('draw-use');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.items).toEqual([]);
    expect(calls[0]?.label).toBe('Draw textures/item/ruby_sword.png');
    expect(calls[0]?.writes).toEqual([
      {
        namespace: 'demo',
        path: 'textures/item/ruby_sword.png',
        bytes: artLookPng({ recipe: 'sword', colour: RUBY, detail: 'normal', seed: 0 }),
      },
    ]);
  });
});
