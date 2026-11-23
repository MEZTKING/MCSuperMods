// @vitest-environment happy-dom
/**
 * Start from a Minecraft texture (ADR 0129 D4): the picker lists and filters the user's
 * textures (names only in Very easy, ids in Advanced), says when the Minecraft folder is not set
 * up, and a pick opens in New texture's painter and replaces the painter's canvas as one undo
 * step. The "jar" is a made-up listing with MSM's own stand-in pictures: no Mojang file is read.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MinecraftTexturesContext,
  type MinecraftTexturesHost,
} from '../../../src/renderer/src/components/mc-textures/host';
import {
  MinecraftTexturePicker,
  NOT_SET_UP_WORDS,
} from '../../../src/renderer/src/components/mc-textures/MinecraftTexturePicker';
import { NewTextureDialog } from '../../../src/renderer/src/components/texture-editor/NewTextureDialog';
import { TextureEditorDialog } from '../../../src/renderer/src/components/texture-editor/TextureEditorDialog';
import { PlainContext } from '../../../src/renderer/src/components/ui/MoreOptions';
import { PATHS } from './paths';

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
  vi.unstubAllGlobals();
});

/** A stand-in picture in the mocked codec's format, every pixel `rgba`. */
function picture(width: number, height: number, rgba = [10, 200, 30, 255]): Uint8Array {
  const out = new Uint8Array(8 + width * height * 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  for (let index = 8; index < out.length; index += 4) out.set(rgba, index);
  return out;
}

const MCMETA = new TextEncoder().encode(JSON.stringify({ animation: { frametime: 2 } }));

function fakeHost(ready = true): MinecraftTexturesHost & { reads: string[] } {
  const reads: string[] = [];
  return {
    ready,
    reads,
    list: vi.fn(async () => PATHS),
    read: vi.fn(async (path: string) => {
      reads.push(path);
      if (path.endsWith('.mcmeta')) return MCMETA;
      return path.includes('water_still') ? picture(2, 8) : picture(4, 4);
    }),
    openSetUp: vi.fn(),
  };
}

function withHost(host: MinecraftTexturesHost, children: ReactNode) {
  return (
    <MinecraftTexturesContext.Provider value={host}>{children}</MinecraftTexturesContext.Provider>
  );
}

const names = () =>
  screen
    .getAllByRole('button')
    .filter((button) => button.dataset.testid?.startsWith('mc-texture-') === true)
    .filter((button) => !/folder|cancel|more|set-up/.test(button.dataset.testid ?? ''))
    .map((button) => button.textContent);

describe('the Minecraft texture picker (ADR 0129 D4)', () => {
  it('lists the textures by name, filters by folder and search, and shows no ids in Very easy', async () => {
    // Every thumbnail is in view at once.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        readonly #callback: (entries: { isIntersecting: boolean }[]) => void;
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          this.#callback = callback;
        }
        observe() {
          this.#callback([{ isIntersecting: true }]);
        }
        disconnect() {}
      },
    );
    const host = fakeHost();
    render(<MinecraftTexturePicker host={host} title="Pick" onPick={vi.fn()} onClose={vi.fn()} />);
    await screen.findByTestId('mc-texture-block-stone');
    expect(screen.getByTestId('mc-texture-count').textContent).toBe('10 pictures');
    expect(screen.queryByText('minecraft:block/stone')).toBeNull();
    expect(screen.getByTestId('mc-texture-picker').textContent).not.toContain('minecraft:');
    fireEvent.click(screen.getByTestId('mc-texture-folder-entity'));
    expect(names()).toEqual(['Cow', 'Normal (chest)']);
    fireEvent.click(screen.getByTestId('mc-texture-folder-all'));
    fireEvent.change(screen.getByTestId('mc-texture-search'), { target: { value: 'stone' } });
    expect(names()).toEqual(['Stone', 'Stone bricks']);
    fireEvent.change(screen.getByTestId('mc-texture-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('mc-texture-none')).toBeTruthy();
    // Thumbnails load once in view and draw pixelated.
    fireEvent.change(screen.getByTestId('mc-texture-search'), { target: { value: 'dirt' } });
    await waitFor(() => expect(host.reads).toContain('assets/minecraft/textures/block/dirt.png'));
    await waitFor(() =>
      expect(screen.getByTestId('mc-texture-block-dirt').querySelector('img')?.className).toContain(
        'pixelated',
      ),
    );
  });

  it('shows ids when opened from a More options (ADR 0130)', async () => {
    render(
      <PlainContext.Provider value={false}>
        <MinecraftTexturePicker host={fakeHost()} title="Pick" onPick={vi.fn()} onClose={vi.fn()} />
      </PlainContext.Provider>,
    );
    const stone = await screen.findByTestId('mc-texture-block-stone');
    expect(stone.textContent).toContain('minecraft:block/stone');
  });

  it('says in one line when the Minecraft folder is not set up and offers the set-up', () => {
    const host = fakeHost(false);
    const onClose = vi.fn();
    render(<MinecraftTexturePicker host={host} title="Pick" onPick={vi.fn()} onClose={onClose} />);
    expect(screen.getByTestId('mc-texture-not-set-up').textContent).toContain(NOT_SET_UP_WORDS);
    expect(host.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('mc-texture-set-up'));
    expect(host.openSetUp).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('hands over the picked picture and MSM’s sidecar of an animated one', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <MinecraftTexturePicker host={fakeHost()} title="Pick" onPick={onPick} onClose={onClose} />,
    );
    fireEvent.click(await screen.findByTestId('mc-texture-block-water-still'));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    const pick = onPick.mock.calls[0]?.[0];
    expect(pick.texture.assetPath).toBe('textures/block/water_still.png');
    expect(pick.bytes).toEqual(picture(2, 8));
    expect(JSON.parse(new TextDecoder().decode(pick.mcmeta))).toEqual({
      animation: { frametime: 2 },
    });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Start from a Minecraft texture (ADR 0129 D4)', () => {
  it('starts a new texture from a Minecraft texture in New texture', async () => {
    const onPaint = vi.fn();
    render(
      withHost(
        fakeHost(),
        <NewTextureDialog namespace="demo" existing={[]} onPaint={onPaint} onClose={vi.fn()} />,
      ),
    );
    fireEvent.change(screen.getByTestId('new-texture-name'), { target: { value: 'mossy' } });
    fireEvent.change(screen.getByTestId('new-texture-kind'), { target: { value: 'block' } });
    fireEvent.click(screen.getByTestId('new-texture-start-minecraft'));
    fireEvent.click(screen.getByRole('button', { name: 'Pick…' }));
    // The picker opens on the kind's folder.
    await screen.findByTestId('mc-texture-picker');
    expect(screen.getByTestId('mc-texture-folder-block').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(await screen.findByTestId('mc-texture-block-stone'));
    await waitFor(() => expect(onPaint).toHaveBeenCalledTimes(1));
    expect(onPaint.mock.calls[0]?.[0]).toMatchObject({
      name: 'mossy',
      path: 'textures/block/mossy.png',
      bytes: picture(4, 4),
      mcmeta: null,
    });
  });

  it('has no Minecraft start without a host', () => {
    render(<NewTextureDialog namespace="demo" existing={[]} onPaint={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('new-texture-start-minecraft')).toBeNull();
  });

  it('replaces the painter’s canvas at the picked size as one undo step, and saves the sidecar of a strip', async () => {
    const onSave = vi.fn();
    render(
      withHost(
        fakeHost(),
        <TextureEditorDialog
          name="demo:textures/block/ruby.png"
          bytes={null}
          size={{ width: 16, height: 16 }}
          onSave={onSave}
          onClose={vi.fn()}
        />,
      ),
    );
    const canvas = await screen.findByTestId('texture-canvas');
    expect(canvas.getAttribute('aria-label')).toContain('16 by 16');
    fireEvent.click(screen.getByTestId('texture-start-minecraft'));
    fireEvent.click(await screen.findByTestId('mc-texture-block-water-still'));
    await waitFor(() =>
      expect(screen.getByTestId('texture-canvas').getAttribute('aria-label')).toContain('2 by 8'),
    );
    // One undo step takes the whole picture back.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(screen.getByTestId('texture-canvas').getAttribute('aria-label')).toContain('16 by 16'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() =>
      expect(screen.getByTestId('texture-canvas').getAttribute('aria-label')).toContain('2 by 8'),
    );
    fireEvent.click(screen.getByTestId('texture-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [bytes, mcmeta] = onSave.mock.calls[0] ?? [];
    expect(bytes).toEqual(picture(2, 8));
    expect(JSON.parse(new TextDecoder().decode(mcmeta))).toEqual({ animation: { frametime: 2 } });
  });
});
