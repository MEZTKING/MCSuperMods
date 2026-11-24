// @vitest-environment happy-dom
/**
 * The Draw dialog and its buttons outside the Studios (B495, ADR 0092 D9, D10): the tiles,
 * colour, finish and detail, six variations and New looks, Use this picture, Very easy's
 * wording and fewer choices, the Creator's image fields (a humanoid skin on skin fields), the
 * painter's one undo step, and New texture from a drawn picture.
 */
import type { StarterParameter } from '@msm/plugin-api';
import { artLookPng } from '@msm/plugin-library';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawButton } from '../../../src/renderer/src/components/art/DrawButton';
import {
  DRAW_IT_FOR_ME,
  DrawPictureDialog,
} from '../../../src/renderer/src/components/art/DrawPictureDialog';
import type { DrawnPicture } from '../../../src/renderer/src/components/art/draw-model';
import { CreatorImageField } from '../../../src/renderer/src/components/creator/CreatorImageField';
import { NewTextureDialog } from '../../../src/renderer/src/components/texture-editor/NewTextureDialog';
import { TextureEditorDialog } from '../../../src/renderer/src/components/texture-editor/TextureEditorDialog';
import { usePreferences } from '../../../src/renderer/src/store/preferences';

// The painter's PNG codec needs a canvas: here a PNG is its RGBA bytes after 8 bytes of size.
vi.mock('../../../src/renderer/src/components/texture-editor/png-canvas', () => ({
  decodePicture: async (bytes: Uint8Array) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint32(0),
      height: view.getUint32(4),
      data: new Uint8ClampedArray(bytes.slice(8)),
    };
  },
  encodePicture: (image: { width: number; height: number; data: Uint8ClampedArray }) => {
    const out = new Uint8Array(8 + image.data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, image.width);
    view.setUint32(4, image.height);
    out.set(image.data, 8);
    return out;
  },
  imageDataUrl: () => '',
}));

afterEach(() => {
  cleanup();
  usePreferences.getState().setBlockStyle('blockloom');
});

const RUBY = [196, 28, 52] as const;
const FROST = [0x8f, 0xd3, 0xff] as const;

const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));
const seeds = () =>
  [0, 1, 2, 3, 4, 5].map((index) => screen.getByTestId(`draw-variation-${index}`).dataset.seed);

describe('the Draw dialog', () => {
  it('offers the fitting recipes, six variations, New looks, and hands over the pick', async () => {
    const onPick = vi.fn<(picture: DrawnPicture) => void>();
    const onClose = vi.fn();
    render(
      <DrawPictureDialog
        field={{ kinds: ['block'], width: 16, height: 16, name: 'ruby_ore' }}
        target="demo:textures/block/ruby_ore.png"
        onPick={onPick}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('heading').textContent).toBe(DRAW_IT_FOR_ME);
    expect(screen.getByText('What is it?')).toBeTruthy();
    // The guess comes first and is chosen; only block recipes are offered.
    const tiles = screen
      .getAllByRole('option')
      .filter((tile) => tile.dataset.testid?.startsWith('draw-option-'));
    expect(tiles[0]?.dataset.testid).toBe('draw-option-ore');
    expect(screen.getByTestId('draw-option-ore').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByTestId('draw-option-sword')).toBeNull();
    expect(screen.getByTestId('draw-option-bricks').textContent).toContain('Bricks');
    expect(seeds()).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(screen.getByTestId('draw-detail-normal')).toHaveProperty('checked', true);
    expect(screen.queryByTestId('draw-swatch-thing')).toBeNull();
    expect(screen.getByLabelText('Frost')).toBeTruthy();

    click('draw-option-bricks');
    click('draw-swatch-frost');
    click('draw-detail-rough');
    click('draw-new-looks');
    expect(seeds()).toEqual(['6', '7', '8', '9', '10', '11']);
    click('draw-variation-2');
    expect(screen.getByTestId('draw-variation-2').getAttribute('aria-selected')).toBe('true');
    click('draw-use');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPick).toHaveBeenCalledTimes(1);
    const picture = onPick.mock.calls[0]?.[0] as DrawnPicture;
    expect(picture.pngs).toEqual([
      artLookPng({ recipe: 'bricks', colour: FROST, detail: 'rough', seed: 8 }),
    ]);
  });

  it('offers the finishes and the second colour of the recipe that has them', () => {
    render(
      <DrawPictureDialog
        field={{ kinds: ['block'], width: 16, height: 16, name: 'ruby_block', colour: RUBY }}
        target="t"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('draw-option-block').getAttribute('aria-selected')).toBe('true');
    const finish = screen.getByTestId('draw-finish') as HTMLSelectElement;
    expect([...finish.options].map((option) => option.textContent)).toEqual([
      'Gem',
      'Metal',
      'Rough',
    ]);
    expect(screen.getByTestId('draw-swatch-thing').textContent).toBe("The thing's colour");
    click('draw-option-crop_stage3');
    expect(screen.queryByTestId('draw-finish')).toBeNull();
    expect(screen.getByTestId('draw-accent')).toBeTruthy();
    expect(screen.getByText('Its own colour until you pick one.')).toBeTruthy();
  });

  it('shows only Colour and the variations until More options is opened (ADR 0130)', () => {
    window.msmMoreOptionsOpen = false;
    render(
      <DrawPictureDialog
        field={{ kinds: ['item'], width: 16, height: 16, name: 'ruby_sword' }}
        target="Ruby sword"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading').textContent).toBe(DRAW_IT_FOR_ME);
    expect(screen.queryByText('What is it?')).toBeNull();
    expect(screen.queryByTestId('draw-detail-normal')).toBeNull();
    expect(screen.queryByTestId('draw-finish')).toBeNull();
    expect(screen.getByTestId('draw-colour')).toBeTruthy();
    expect(screen.getByTestId('draw-variation-5')).toBeTruthy();
    expect(screen.getByTestId('draw-new-looks').textContent).toBe('New looks');
    fireEvent.click(screen.getByTestId('more-options-draw-picture'));
    expect(screen.getByText('What is it?')).toBeTruthy();
    window.msmMoreOptionsOpen = true;
  });

  it('describes a block in words and follows the block style live (ADR 0135 D6)', () => {
    const onPick = vi.fn<(picture: DrawnPicture) => void>();
    render(
      <DrawPictureDialog
        field={{ kinds: ['block'], width: 16, height: 16, name: 'ruby_bricks', colour: RUBY }}
        target="demo:textures/block/ruby_bricks.png"
        onPick={onPick}
        onClose={() => {}}
      />,
    );
    const first = () =>
      screen.getByTestId('draw-variation-0').querySelector('img')?.getAttribute('src');
    const blockloom = first();
    expect(blockloom).toBe(
      `data:image/png;base64,${Buffer.from(
        artLookPng({
          recipe: 'bricks',
          colour: RUBY,
          detail: 'normal',
          seed: 0,
          style: 'blockloom',
        }),
      ).toString('base64')}`,
    );
    fireEvent.change(screen.getByTestId('draw-description'), {
      target: { value: 'mossy netherrack with cyan crystals' },
    });
    const described = first();
    expect(described).not.toBe(blockloom);
    expect(described).toBe(
      `data:image/png;base64,${Buffer.from(
        artLookPng({
          recipe: 'bricks',
          colour: RUBY,
          detail: 'normal',
          seed: 0,
          style: 'blockloom',
          description: 'mossy netherrack with cyan crystals',
        }),
      ).toString('base64')}`,
    );
    // The style under More options is Settings' choice: Classic draws MSM's own bricks, no words.
    // More options remembers being opened by an earlier test.
    if (screen.queryByTestId('draw-style-classic') === null) click('more-options-draw-picture');
    click('draw-style-classic');
    expect(usePreferences.getState().blockStyle).toBe('classic');
    expect(screen.queryByTestId('draw-description')).toBeNull();
    expect(first()).toBe(
      `data:image/png;base64,${Buffer.from(
        artLookPng({ recipe: 'bricks', colour: RUBY, detail: 'normal', seed: 0, style: 'classic' }),
      ).toString('base64')}`,
    );
    click('draw-style-blockloom');
    expect(first()).toBe(described);
  });

  it('offers no words for pictures Blockloom does not draw', () => {
    render(
      <DrawPictureDialog
        field={{ kinds: ['item'], width: 16, height: 16, name: 'ruby_sword' }}
        target="demo:textures/item/ruby_sword.png"
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId('draw-description')).toBeNull();
  });

  it('says when nothing can be drawn at the size', () => {
    render(
      <DrawPictureDialog
        field={{ kinds: ['block'], width: 32, height: 32 }}
        target="t"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('draw-empty')).toBeTruthy();
    expect(screen.getByTestId('draw-use')).toHaveProperty('disabled', true);
  });

  it('shows the error of a pick that cannot be written and stays open', async () => {
    const onClose = vi.fn();
    render(
      <DrawPictureDialog
        field={{ kinds: ['block'], width: 16, height: 16 }}
        target="t"
        onPick={() => {
          throw new Error('The project changed meanwhile.');
        }}
        onClose={onClose}
      />,
    );
    click('draw-use');
    expect((await screen.findByTestId('draw-error')).textContent).toBe(
      'The project changed meanwhile.',
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the Draw button', () => {
  it('reads "Draw it for me" and opens the dialog lazily', async () => {
    const field = { kinds: ['item'] as const, width: 16, height: 16 };
    const { unmount } = render(
      <DrawButton
        testId="x-draw"
        field={{ ...field, kinds: [...field.kinds] }}
        target="t"
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByTestId('x-draw').textContent).toBe('Draw it for me');
    unmount();
    render(
      <DrawButton
        testId="x-draw"
        field={{ ...field, kinds: ['item'] }}
        target="t"
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByTestId('x-draw').textContent).toBe('Draw it for me');
    click('x-draw');
    const dialog = await screen.findByTestId('draw-dialog');
    expect(dialog.textContent).toContain(DRAW_IT_FOR_ME);
  });
});

const imageParameter = (
  id: string,
  label: string,
  extra: Partial<StarterParameter> = {},
): StarterParameter & { type: 'image' } =>
  ({ id, label, type: 'image', ...extra }) as StarterParameter & { type: 'image' };

describe('the Creator image field', () => {
  it('draws a picture into the field without any AI host', async () => {
    const onChange = vi.fn();
    render(
      <CreatorImageField
        parameter={imageParameter('sword_picture', 'Sword picture')}
        value=""
        error={null}
        pickImage={async () => []}
        onChange={onChange}
        nameHint="Ruby Sword"
        colourHint="#c41c34"
      />,
    );
    expect(screen.queryByTestId('param-sword_picture-ai')).toBeNull();
    click('param-sword_picture-draw');
    await screen.findByTestId('draw-dialog');
    expect(screen.getByTestId('draw-option-sword').getAttribute('aria-selected')).toBe('true');
    click('draw-swatch-thing');
    click('draw-use');
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const url = onChange.mock.calls[0]?.[0] as string;
    const bytes = artLookPng({ recipe: 'sword', colour: RUBY, detail: 'normal', seed: 0 });
    expect(url).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
  });

  it('draws a humanoid box skin on a skin field', async () => {
    render(
      <CreatorImageField
        parameter={imageParameter('skin', 'Skin')}
        value=""
        error={null}
        pickImage={async () => []}
        onChange={vi.fn()}
      />,
    );
    click('param-skin-draw');
    await screen.findByTestId('draw-dialog');
    expect(screen.getByTestId('draw-option-humanoid_skin').textContent).toContain('Skin');
    expect(screen.getAllByTestId(/^draw-option-/)).toHaveLength(1);
    const finish = screen.getByTestId('draw-finish') as HTMLSelectElement;
    expect([...finish.options].map((option) => option.textContent)).toEqual([
      'Fur',
      'Scales',
      'Smooth',
      'Stone',
      'Slime',
    ]);
  });
});

describe('the painter', () => {
  it('replaces the canvas with the drawn picture as one painter undo step', async () => {
    const onSave = vi.fn();
    render(
      <TextureEditorDialog
        name="demo:textures/block/ruby_ore.png"
        bytes={null}
        size={{ width: 16, height: 16 }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    const undo = await screen.findByRole('button', { name: 'Undo' });
    expect(undo).toHaveProperty('disabled', true);
    click('texture-draw');
    await screen.findByTestId('draw-dialog');
    expect(screen.getByTestId('draw-option-ore').getAttribute('aria-selected')).toBe('true');
    click('draw-use');
    await waitFor(() => expect(screen.queryByTestId('draw-dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', false);
    click('texture-save');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]?.[0] as Uint8Array;
    const drawnPixels = saved.slice(8);
    expect(drawnPixels.some((value) => value !== 0)).toBe(true);
    expect([...drawnPixels.slice(3, 4)]).toEqual([255]);
  });

  it('saves a new texture opened on a drawn picture without any change', async () => {
    render(
      <TextureEditorDialog
        name="demo:textures/item/ruby.png"
        bytes={new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 1, 2, 3, 255])}
        isNew
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByTestId('texture-save')).toHaveProperty('disabled', false);
  });
});

describe('New texture', () => {
  it('starts from a drawn picture: Draw… opens the dialog and the painter gets the bytes', async () => {
    const onPaint = vi.fn();
    render(<NewTextureDialog namespace="demo" existing={[]} onPaint={onPaint} onClose={vi.fn()} />);
    expect(screen.getByTestId('new-texture-start-blank')).toHaveProperty('checked', true);
    fireEvent.change(screen.getByTestId('new-texture-name'), { target: { value: 'ruby_pickaxe' } });
    click('new-texture-start-drawn');
    const submit = screen.getByRole('button', { name: 'Draw…' });
    fireEvent.click(submit);
    await screen.findByTestId('draw-dialog');
    expect(screen.getByTestId('draw-option-pickaxe').getAttribute('aria-selected')).toBe('true');
    click('draw-use');
    await waitFor(() => expect(onPaint).toHaveBeenCalledTimes(1));
    expect(onPaint).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ruby_pickaxe',
        path: 'textures/item/ruby_pickaxe.png',
        bytes: artLookPng({ recipe: 'pickaxe', colour: RUBY, detail: 'normal', seed: 0 }),
      }),
    );
  });

  it('keeps paintings blank', () => {
    render(<NewTextureDialog namespace="demo" existing={[]} onPaint={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('new-texture-kind'), { target: { value: 'painting' } });
    expect(screen.getByTestId('new-texture-start-drawn')).toHaveProperty('disabled', true);
    expect(screen.getByText('Paintings start blank.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Paint…' })).toBeTruthy();
  });
});
