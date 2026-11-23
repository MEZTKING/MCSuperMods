// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Draw a skin in the Mob Studio (B496, ADR 0092 D10 (c), plan limit A4): a box-UV model drawn
 * on its own boxes and written as a new texture that the mob then names, in one undo step that
 * Undo takes back; a texture the mob names written over; the coat and second colour reaching
 * the drawing; per-face models and mobs without a model greyed out with the reason; Very
 * easy's words. Rendered through the real Entity Studio on a command stack.
 */
import {
  type CommandStack,
  commands,
  type Element,
  type Json,
  type ResourceLocation,
} from '@msm/core';
import { boxesOfGeoModel, boxSkinArtPng } from '@msm/plugin-library';
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
  AiPicturesContext,
  type AiPicturesHost,
} from '../../../src/renderer/src/components/ai-pictures/ai-pictures-host';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../src/renderer/src/studios/blocks-items/host';
import {
  geometryTextureSize,
  PER_FACE_MODEL,
  skinPlan,
} from '../../../src/renderer/src/studios/entities/SkinSection';
import type { SchemaContextState } from '../../../src/renderer/src/studios/use-schema-context';
import { fakeHost, fakePictures, testCodec } from '../ai-pictures-fake';
import { element } from '../fixtures';
import { schemaIndex } from '../forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../lazy-chunks';
import { projectOf, renderOnStack, schemaState } from '../studios/blocks-items/harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
  // The Draw dialog and MSM's drawing for the AI window are lazy chunks (ADR 0092 D17): loaded
  // once here, so no wait below races Vitest transforming them, which took over findBy's
  // one-second default when the whole suite ran at once.
  await preloadChunks(
    () => import('../../../src/renderer/src/components/art/DrawPictureDialog'),
    () => import('../../../src/renderer/src/components/ai-pictures/reference'),
  );
}, PRELOAD_TIMEOUT_MS);

/** Waits for what follows a click that draws or makes pictures (real work, slow under load). */
const WORK = { timeout: LAZY_CHUNK_TIMEOUT_MS };
afterEach(() => {
  cleanup();
});

const RUBY = [196, 28, 52] as const;
const MOB = 'demo:golem' as ResourceLocation;
const MODEL = 'demo:entity/golem' as ResourceLocation;
const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));

/** A two-bone box-UV creature on a 64 by 32 texture. */
const BOX_GEOMETRY: Json = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: { identifier: 'geometry.golem', texture_width: 64, texture_height: 32 },
      bones: [
        {
          name: 'body',
          pivot: [0, 0, 0],
          cubes: [{ origin: [-4, 0, -3], size: [8, 6, 6], uv: [0, 12] }],
        },
        {
          name: 'head',
          pivot: [0, 6, 0],
          cubes: [{ origin: [-3, 6, -3], size: [6, 6, 6], uv: [0, 0] }],
        },
      ],
    },
  ],
};

/** The same creature with its head mapped face by face. */
const PER_FACE_GEOMETRY: Json = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: { identifier: 'geometry.golem', texture_width: 16, texture_height: 16 },
      bones: [
        {
          name: 'head',
          cubes: [
            {
              origin: [0, 0, 0],
              size: [4, 4, 4],
              uv: { north: { uv: [0, 0], uv_size: [4, 4] } },
            },
          ],
        },
      ],
    },
  ],
};

function mob(model: string, texture = ''): Element {
  return element(MOB, 'msm:entity', {
    format: 1,
    components: { 'msm:animated_model': { model, animations: '', texture } },
  });
}

interface Call {
  items: readonly ChangeItem[];
  label: string;
  writes: readonly ChangeAsset[];
}

/** The Entity Studio with a host whose `applyChanges` applies one command per call. */
function renderMob(subject: Element, geometry: Json | null, ai: AiPicturesHost | null = null) {
  const calls: Call[] = [];
  let current: CommandStack | undefined;
  const host: BlocksItemsStudioHost = {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
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
    <AiPicturesContext.Provider value={ai}>
      <BlocksItemsStudioHostContext.Provider value={host}>
        {children}
      </BlocksItemsStudioHostContext.Provider>
    </AiPicturesContext.Provider>
  );
  const others = geometry === null ? [] : [element(MODEL, 'msm:geo_model', geometry)];
  const rendered = renderOnStack(subject, schema, { wrapper, others });
  current = rendered.stack;
  return { ...rendered, calls };
}

const textureOf = (data: Json): Json | undefined =>
  (data as { components?: { 'msm:animated_model'?: { texture?: Json } } }).components?.[
    'msm:animated_model'
  ]?.texture;

const assetsOf = (stack: CommandStack) =>
  stack.state.namespaces
    .find((entry) => entry.name === 'demo')
    ?.assets.map((asset) => asset.path) ?? [];

const boxes = () => boxesOfGeoModel(BOX_GEOMETRY as Parameters<typeof boxesOfGeoModel>[0]) ?? [];

describe('Draw a skin', () => {
  it('draws the model’s own boxes and names the new texture in one undo step', async () => {
    const { stack, data, calls } = renderMob(mob(MODEL), BOX_GEOMETRY);
    const button = screen.getByTestId('entity-draw-skin') as HTMLButtonElement;
    expect(button.textContent).toBe('Draw its skin');
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    const dialog = await screen.findByTestId('draw-dialog', undefined, WORK);
    expect(dialog.textContent).toContain('Draw its skin');
    expect(dialog.textContent).toContain('Saved as demo:textures/entity/golem.png');
    const coats = Array.from(
      (screen.getByTestId('draw-finish') as HTMLSelectElement).options,
      (option) => option.textContent,
    );
    expect(coats).toEqual(['Fur', 'Scales', 'Smooth', 'Stone', 'Slime']);
    expect(screen.getByTestId('draw-accent')).toBeTruthy();
    expect(screen.getAllByTestId(/^draw-variation-\d$/)).toHaveLength(6);
    click('draw-variation-2');
    expect(screen.getByTestId('draw-use').textContent).toBe('Use this skin');
    click('draw-use');
    await waitFor(() => expect(calls).toHaveLength(1), WORK);
    const [call] = calls;
    expect(call?.label).toBe('Draw a skin textures/entity/golem.png');
    expect(call?.writes).toEqual([]);
    const asset = call?.items.find((item) => item.op === 'asset')?.asset;
    expect(asset?.path).toBe('textures/entity/golem.png');
    expect(asset?.bytes).toEqual(
      boxSkinArtPng(boxes(), 64, 32, { colour: RUBY, coat: 'fur', detail: 'normal', seed: 2 }),
    );
    expect(textureOf(data())).toBe('demo:entity/golem');
    expect(assetsOf(stack)).toContain('textures/entity/golem.png');
    expect(stack.undoLabel()).toBe('Draw a skin textures/entity/golem.png');
    stack.undo();
    expect(textureOf(data())).toBe('');
    expect(assetsOf(stack)).not.toContain('textures/entity/golem.png');
  });

  it('writes over the texture the mob names, with the coat and second colour chosen', async () => {
    const { stack, data, calls } = renderMob(mob(MODEL, 'demo:entity/golem_skin'), BOX_GEOMETRY);
    stack.execute(
      commands.addAsset('demo', {
        path: 'textures/entity/golem_skin.png',
        mediaType: 'image/png',
      }),
    );
    click('entity-draw-skin');
    await screen.findByTestId('draw-dialog', undefined, WORK);
    fireEvent.change(screen.getByTestId('draw-finish'), { target: { value: 'scales' } });
    fireEvent.change(screen.getByTestId('draw-accent'), { target: { value: '#f0e0a0' } });
    click('draw-use');
    await waitFor(() => expect(calls).toHaveLength(1), WORK);
    expect(calls[0]?.items).toEqual([]);
    expect(calls[0]?.writes).toEqual([
      {
        namespace: 'demo',
        path: 'textures/entity/golem_skin.png',
        bytes: boxSkinArtPng(boxes(), 64, 32, {
          colour: RUBY,
          accent: [240, 224, 160],
          coat: 'scales',
          detail: 'normal',
          seed: 0,
        }),
      },
    ]);
    expect(textureOf(data())).toBe('demo:entity/golem_skin');
  });

  it('is greyed out with the limit’s words for a per-face model', () => {
    renderMob(mob(MODEL), PER_FACE_GEOMETRY);
    expect((screen.getByTestId('entity-draw-skin') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('entity-draw-skin-note').textContent).toBe(PER_FACE_MODEL);
    expect(PER_FACE_MODEL).toBe("This model's faces are mapped one by one");
  });

  it('is greyed out without a model, or with one outside the project', () => {
    renderMob(mob(''), null);
    expect((screen.getByTestId('entity-draw-skin') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('entity-draw-skin-note').textContent).toBe('Choose a model first.');
    const project = projectOf(mob('demo:entity/missing'));
    expect(skinPlan(project, mob('demo:entity/missing'))).toEqual({
      ok: false,
      reason: 'The model is not part of this project.',
    });
  });

  it('reads "Draw its skin", the finish under More options', async () => {
    window.msmMoreOptionsOpen = false;
    renderMob(mob(MODEL), BOX_GEOMETRY);
    const button = screen.getByTestId('entity-draw-skin');
    expect(button.textContent).toBe('Draw its skin');
    fireEvent.click(button);
    const dialog = await screen.findByTestId('draw-dialog', undefined, WORK);
    expect(dialog.textContent).toContain('Draw its skin');
    expect(screen.queryByTestId('draw-finish')).toBeNull();
    expect(screen.getAllByTestId(/^draw-variation-\d$/)).toHaveLength(6);
    window.msmMoreOptionsOpen = true;
  });

  it('is not shown without a host that can write', () => {
    renderOnStack(mob(MODEL), schema, { others: [element(MODEL, 'msm:geo_model', BOX_GEOMETRY)] });
    expect(screen.queryByTestId('entity-draw-skin')).toBeNull();
  });
});

describe('geometryTextureSize', () => {
  it('reads the declared size, the old form and the 64 by 64 default', () => {
    expect(geometryTextureSize(BOX_GEOMETRY)).toEqual({ width: 64, height: 32 });
    expect(
      geometryTextureSize({ 'geometry.old': { texturewidth: 32, textureheight: 16, bones: [] } }),
    ).toEqual({ width: 32, height: 16 });
    expect(geometryTextureSize({})).toEqual({ width: 64, height: 64 });
  });
});

describe('Make a skin with AI (ADR 0093, 2026-11-22)', () => {
  it('lays the service’s coat on the model’s own boxes and names the texture in one undo step', async () => {
    const platform = fakePictures();
    const { stack, data, calls } = renderMob(mob(MODEL), BOX_GEOMETRY, fakeHost(platform));
    const button = screen.getByTestId('entity-ai-skin') as HTMLButtonElement;
    expect(button.textContent).toBe('Make it with AI');
    fireEvent.click(button);
    expect((await screen.findByTestId('ai-pictures-shape', undefined, WORK)).textContent).toBe(
      'Mob skin: 64 × 32, laid on the model',
    );
    await waitFor(
      () => expect(screen.getByTestId('ai-pictures-cost').textContent).toContain('$0.24'),
      WORK,
    );
    fireEvent.click(screen.getByTestId('ai-pictures-generate'));
    await screen.findByTestId('ai-pictures-result-0', undefined, WORK);
    expect(platform.requests[0]).toMatchObject({ style: 'skin', size: 16, transparent: false });
    fireEvent.click(screen.getByTestId('ai-pictures-use'));
    await waitFor(() => expect(calls).toHaveLength(1), WORK);
    expect(calls[0]?.label).toBe('Make with AI textures/entity/golem.png');
    const asset = calls[0]?.items.find((item) => item.op === 'asset')?.asset;
    const skin = await testCodec.decode(asset?.bytes ?? new Uint8Array(8));
    expect([skin.width, skin.height]).toEqual([64, 32]);
    // The head's front face (6, 6) is drawn; a pixel outside every box (63, 31) is clear.
    expect(skin.data[(6 * 64 + 6) * 4 + 3]).toBe(255);
    expect(skin.data[(31 * 64 + 63) * 4 + 3]).toBe(0);
    expect(textureOf(data())).toBe('demo:entity/golem');
    stack.undo();
    expect(textureOf(data())).toBe('');
  });

  it('is greyed out with the reason when the model maps faces one by one', () => {
    renderMob(mob(MODEL), PER_FACE_GEOMETRY, fakeHost(fakePictures()));
    expect((screen.getByTestId('entity-ai-skin') as HTMLButtonElement).disabled).toBe(true);
  });
});
