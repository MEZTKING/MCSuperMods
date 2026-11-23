// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Make with AI wherever MSM makes a picture (ADR 0093 D6 as amended, 2026-11-22), with the fake
 * service: the shape of each kind of texture (blocks, items, skins, armour layers, villager
 * looks, paintings, banner, shield and pot patterns, particles), the layouts that turn a cleaned
 * picture into the texture (a coat laid on boxes, a pale mask on the flag, a motif pressed into
 * clay), the Creator's skin and painting fields, New texture's "Made with AI" for a painting, a
 * villager look's picture in one undo step, the price shown before a request, and Very easy's
 * "Draw it for me" offering Make it with AI when a key is set.
 */
import type { StarterParameter } from '@msm/plugin-api';
import { boxFaces, encodePng, HUMANOID_SKIN_BOXES } from '@msm/plugin-library';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiPicturesContext,
  type AiPicturesHost,
  type PictureCodec,
} from '../../src/renderer/src/components/ai-pictures/ai-pictures-host';
import { cleanUpPicture } from '../../src/renderer/src/components/ai-pictures/cleanup';
import {
  ARMOUR_BOXES,
  applyLayout,
  BANNER_FACE,
  COAT_TILE,
  LEGGINGS_BOXES,
  layOnBoxes,
  POT_CLAY,
  paintingShape,
  shapeForTexture,
  VILLAGER_CLOTHES_BOXES,
} from '../../src/renderer/src/components/ai-pictures/shapes';
import {
  DrawButton,
  MAKE_IT_WITH_AI_INSTEAD,
} from '../../src/renderer/src/components/art/DrawButton';
import {
  aiShapeOf,
  blocksHintOf,
  CreatorImageField,
} from '../../src/renderer/src/components/creator/CreatorImageField';
import { NewTextureDialog } from '../../src/renderer/src/components/texture-editor/NewTextureDialog';
import type { RgbaImage } from '../../src/renderer/src/components/texture-editor/pixels';
import { villagerLookChange } from '../../src/renderer/src/studios/entities/VillagerTypeStudio';
import { fakePictures, testCodec } from './ai-pictures-fake';

afterEach(() => {
  cleanup();
});

/** The test codec reading the fake service's pictures and writing real PNGs (the Creator checks them). */
const pngCodec: PictureCodec = {
  decode: testCodec.decode,
  encode: (image) => encodePng(new Uint8Array(image.data), image.width, image.height),
};

function host(platform = fakePictures()): AiPicturesHost {
  return {
    platform,
    status: {
      service: 'retro-diffusion',
      keys: { 'retro-diffusion': { set: true, tail: 'wxyz' }, openai: { set: false, tail: null } },
      encryptionAvailable: true,
    },
    refresh: vi.fn(),
    openSettings: vi.fn(),
    codec: pngCodec,
  };
}

function withHost(value: AiPicturesHost) {
  return ({ children }: { children: ReactNode }) => (
    <AiPicturesContext.Provider value={value}>{children}</AiPicturesContext.Provider>
  );
}

function solid(width: number, height: number, rgb: readonly [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < data.length; at += 4) data.set([...rgb, 255], at);
  return { width, height, data };
}

const alpha = (image: RgbaImage, x: number, y: number) => image.data[(y * image.width + x) * 4 + 3];

describe('the shape of each kind of texture', () => {
  it('reads the folder and the size', () => {
    const at = (path: string, w: number, h: number) => shapeForTexture(path, w, h);
    expect(at('ns:textures/block/ruby_ore.png', 16, 16)).toMatchObject({
      style: 'block',
      width: 16,
    });
    expect(at('ns:textures/item/ruby.png', 32, 32)).toMatchObject({ style: 'item', width: 32 });
    expect(at('ns:textures/painting/sunset.png', 32, 16)).toMatchObject({
      style: 'painting',
      width: 32,
      height: 16,
    });
    // A painting drawn at 64 pixels a block is made at 16 a block.
    expect(at('ns:textures/painting/big.png', 256, 128)).toMatchObject({ width: 64, height: 32 });
    expect(at('ns:textures/entity/banner/sun.png', 64, 64)).toMatchObject({
      style: 'pattern',
      width: 20,
      height: 40,
      layout: { kind: 'banner' },
    });
    expect(at('ns:textures/entity/shield/sun.png', 64, 64)).toMatchObject({
      style: 'pattern',
      layout: { kind: 'shield' },
    });
    expect(at('ns:textures/entity/decorated_pot/sun.png', 16, 16)).toMatchObject({
      style: 'pattern',
      width: 12,
      layout: { kind: 'pot' },
    });
    expect(at('ns:textures/entity/equipment/humanoid/sun.png', 64, 32)).toMatchObject({
      style: 'skin',
      width: COAT_TILE,
      outWidth: 64,
      outHeight: 32,
      layout: { kind: 'boxes', boxes: ARMOUR_BOXES },
    });
    expect(at('ns:textures/entity/equipment/humanoid_leggings/sun.png', 64, 32).layout).toEqual({
      kind: 'boxes',
      boxes: LEGGINGS_BOXES,
    });
    expect(at('ns:textures/entity/villager/type/sun.png', 64, 64).layout).toEqual({
      kind: 'boxes',
      boxes: VILLAGER_CLOTHES_BOXES,
    });
    expect(at('ns:textures/entity/sun_fox.png', 64, 64).layout).toEqual({
      kind: 'boxes',
      boxes: HUMANOID_SKIN_BOXES,
    });
    expect(at('ns:textures/particle/spark_0.png', 8, 8)).toMatchObject({
      style: 'particle',
      width: 8,
    });
  });
});

describe('the layouts', () => {
  it('lays a coat on every face of the boxes, shaded by side, nothing outside', () => {
    const tile = solid(COAT_TILE, COAT_TILE, [200, 120, 40]);
    const skin = layOnBoxes(tile, ARMOUR_BOXES, 64, 32);
    expect(skin.width).toBe(64);
    for (const face of boxFaces(ARMOUR_BOXES[0] as never)) {
      expect(alpha(skin, face.x, face.y), face.side).toBe(255);
    }
    expect(alpha(skin, 63, 31)).toBe(0);
    // The top face (8, 0) is lighter than the front (8, 8).
    const light = (x: number, y: number) =>
      (skin.data[(y * 64 + x) * 4] ?? 0) + (skin.data[(y * 64 + x) * 4 + 1] ?? 0);
    expect(light(10, 2)).toBeGreaterThan(light(10, 12));
  });

  it('puts a pale mask on the banner front and, mirrored, its back', () => {
    const motif = cleanUpPicture(solid(40, 80, [30, 30, 200]), {
      size: 20,
      width: 20,
      height: 40,
      style: 'block',
    });
    const banner = applyLayout(motif, shapeForTexture('textures/entity/banner/x.png', 64, 64));
    expect(alpha(banner, 0, 0)).toBe(0);
    expect(alpha(banner, BANNER_FACE.x, BANNER_FACE.y)).toBe(255);
    expect(alpha(banner, BANNER_FACE.backX, BANNER_FACE.y)).toBe(255);
    const red = banner.data[(BANNER_FACE.y * 64 + BANNER_FACE.x) * 4] ?? 0;
    expect(red).toBeGreaterThan(170);
  });

  it('presses a pot motif into opaque fired clay', () => {
    const motif: RgbaImage = { width: 12, height: 12, data: new Uint8ClampedArray(12 * 12 * 4) };
    motif.data.set([255, 255, 255, 255], (6 * 12 + 6) * 4);
    const pot = applyLayout(motif, shapeForTexture('textures/entity/decorated_pot/x.png', 16, 16));
    for (let at = 3; at < pot.data.length; at += 4) expect(pot.data[at]).toBe(255);
    expect(Math.abs((pot.data[0] ?? 0) - POT_CLAY[0])).toBeLessThan(30);
  });

  it('cleans a painting up to its own size, opaque', () => {
    const shape = paintingShape(2, 1);
    const painting = cleanUpPicture(solid(128, 64, [60, 140, 220]), {
      size: 32,
      width: shape.width,
      height: shape.height,
      style: 'painting',
    });
    expect([painting.width, painting.height]).toEqual([32, 16]);
    expect(painting.data[3]).toBe(255);
  });
});

function imageParameter(id: string, label: string, extra: Partial<StarterParameter> = {}) {
  return { id, label, type: 'image', default: null, maxSize: 64, ...extra } as StarterParameter & {
    type: 'image';
  };
}

describe('the Creator’s image fields', () => {
  it('a skin field makes a coat laid on the humanoid boxes, with the price shown first', async () => {
    const platform = fakePictures();
    const onChange = vi.fn();
    render(
      <CreatorImageField
        parameter={imageParameter('skin', 'Skin')}
        value=""
        error={null}
        pickImage={async () => []}
        onChange={onChange}
        nameHint="Sun Fox"
      />,
      { wrapper: withHost(host(platform)) },
    );
    fireEvent.click(screen.getByTestId('param-skin-ai'));
    expect((await screen.findByTestId('ai-pictures-shape')).textContent).toBe(
      'Mob skin: 64 × 64, laid on a humanoid',
    );
    await waitFor(() =>
      expect(screen.getByTestId('ai-pictures-cost').textContent).toContain('4 pictures cost $0.24'),
    );
    expect(platform.costs[0]?.style).toBe('skin');
    fireEvent.click(screen.getByTestId('ai-pictures-generate'));
    await screen.findByTestId('ai-pictures-result-0');
    expect(platform.requests[0]).toMatchObject({ style: 'skin', size: 16, transparent: false });
    expect(platform.requests[0]?.prompt).toContain('the fur, hide or scales of a sun fox');
    fireEvent.click(screen.getByTestId('ai-pictures-use'));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(String(onChange.mock.calls[0]?.[0])).toMatch(/^data:image\/png;base64,/);
  });

  it('a painting field takes the flow’s size answer', () => {
    const parameters: StarterParameter[] = [
      {
        id: 'size',
        label: 'Size',
        type: 'choice',
        default: '2x1',
        choices: [{ value: '2x1', label: '2 by 1' }],
      } as StarterParameter,
    ];
    const blocks = blocksHintOf(parameters, { size: '4x3' });
    expect(blocks).toEqual({ wide: 4, tall: 3 });
    expect(aiShapeOf(imageParameter('image', 'Picture', { maxSize: 256 }), blocks)).toMatchObject({
      style: 'painting',
      width: 64,
      height: 48,
    });
    expect(aiShapeOf(imageParameter('variant_1_picture', 'Variant 1 picture'))?.style).toBe('skin');
    expect(
      aiShapeOf(
        imageParameter('picture', 'My own picture', {
          description: "8 by 8 as vanilla's particles",
        }),
      )?.style,
    ).toBe('particle');
    expect(aiShapeOf(imageParameter('top', 'Top', { maxSize: 256 }))).toBeUndefined();
  });
});

describe('New texture, Made with AI', () => {
  it('offers it with a key, for paintings too, and opens the painter on the pick', async () => {
    const onPaint = vi.fn();
    render(
      <NewTextureDialog namespace="sun_mod" existing={[]} onPaint={onPaint} onClose={vi.fn()} />,
      {
        wrapper: withHost(host()),
      },
    );
    fireEvent.change(screen.getByTestId('new-texture-name'), { target: { value: 'sunset' } });
    fireEvent.change(screen.getByTestId('new-texture-kind'), { target: { value: 'painting_2x1' } });
    fireEvent.click(screen.getByTestId('new-texture-start-ai'));
    fireEvent.click(screen.getByText('Make with AI…'));
    expect((await screen.findByTestId('ai-pictures-shape')).textContent).toBe(
      'Painting: 32 × 16, 2 by 1 blocks',
    );
    fireEvent.click(screen.getByTestId('ai-pictures-generate'));
    await screen.findByTestId('ai-pictures-result-0');
    fireEvent.click(screen.getByTestId('ai-pictures-use'));
    await waitFor(() => expect(onPaint).toHaveBeenCalledTimes(1));
    expect(onPaint.mock.calls[0]?.[0]).toMatchObject({
      path: 'textures/painting/sunset.png',
      name: 'sunset',
    });
    expect(onPaint.mock.calls[0]?.[0].bytes).toBeInstanceOf(Uint8Array);
  });

  it('is not offered without a key', () => {
    const value = host();
    value.status = {
      ...(value.status as NonNullable<AiPicturesHost['status']>),
      keys: { 'retro-diffusion': { set: false, tail: null }, openai: { set: false, tail: null } },
    };
    render(
      <NewTextureDialog namespace="sun_mod" existing={[]} onPaint={vi.fn()} onClose={vi.fn()} />,
      { wrapper: withHost(value) },
    );
    expect(screen.queryByTestId('new-texture-start-ai')).toBeNull();
  });
});

describe('a villager look’s picture', () => {
  it('goes to the fixed place and is named in one change', () => {
    const element = {
      id: 'sun_mod:sunny' as never,
      kind: 'msm:villager_type',
      data: { biomes: [] },
    };
    const change = villagerLookChange(null, element, 'villager', new Uint8Array([1]));
    expect(change.items.map((item) => item.op)).toEqual(['asset', 'update']);
    expect(change.items[0]?.asset?.path).toBe('textures/entity/villager/type/sunny.png');
    expect(change.items[1]?.after).toEqual({
      biomes: [],
      textures: { villager: 'sun_mod:entity/villager/type/sunny' },
    });
  });
});

describe('Very easy, Draw it for me', () => {
  it('offers Make it with AI instead when a key is set', async () => {
    render(
      <DrawButton
        testId="d"
        target="sun_mod:textures/item/sun_helmet.png"
        field={{ kinds: ['item'], width: 16, height: 16, name: 'sun_helmet' }}
        onPick={vi.fn()}
        ai={{
          defaultPrompt: 'a sun helmet',
          defaultStyle: 'item',
          size: 16,
          colour: [230, 180, 40],
          onPick: vi.fn(),
        }}
      />,
      { wrapper: withHost(host()) },
    );
    fireEvent.click(screen.getByTestId('d'));
    const offer = await screen.findByTestId('d-ai-instead');
    expect(offer.textContent).toBe(MAKE_IT_WITH_AI_INSTEAD);
    fireEvent.click(offer);
    expect((await screen.findByTestId('ai-pictures-sent')).textContent).toContain(
      'golden a sun helmet, a Minecraft-style pixel art helmet icon',
    );
    expect(await screen.findByTestId('ai-pictures-use-drawing')).toBeTruthy();
  });

  it('offers nothing without a key', async () => {
    render(
      <DrawButton
        testId="d"
        target="x"
        field={{ kinds: ['item'], width: 16, height: 16 }}
        onPick={vi.fn()}
        ai={{ defaultPrompt: 'x', defaultStyle: 'item', size: 16, onPick: vi.fn() }}
      />,
      { wrapper: withHost({ ...host(), status: null }) },
    );
    fireEvent.click(screen.getByTestId('d'));
    await screen.findByTestId('draw-dialog');
    expect(screen.queryByTestId('d-ai-instead')).toBeNull();
  });
});
