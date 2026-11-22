// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChangeItem } from '../../src/renderer/src/changeset/changeset';
import { AiPicturesSettingsSection } from '../../src/renderer/src/components/ai-pictures/AiPicturesSettingsSection';
import {
  AiPicturesSwitch,
  useAiBatch,
} from '../../src/renderer/src/components/ai-pictures/AiPicturesSwitch';
import {
  AiPicturesContext,
  type AiPicturesHost,
  type PictureCodec,
} from '../../src/renderer/src/components/ai-pictures/ai-pictures-host';
import { fromHsl } from '../../src/renderer/src/components/ai-pictures/cleanup';
import { aiTextures, batchNote } from '../../src/renderer/src/components/ai-pictures/generate';
import {
  MAKE_IT_WITH_AI,
  MAKE_WITH_AI,
  MakeWithAiButton,
  SET_UP_AI_PICTURES,
} from '../../src/renderer/src/components/ai-pictures/MakeWithAiButton';
import { sizesUpTo } from '../../src/renderer/src/components/ai-pictures/MakeWithAiDialog';
import {
  defaultPrompt,
  styleForName,
  styleForTexturePath,
  wordsOf,
} from '../../src/renderer/src/components/ai-pictures/prompt';
import {
  textureAsset,
  textureChange,
} from '../../src/renderer/src/components/ai-pictures/texture-write';
import type { RgbaImage } from '../../src/renderer/src/components/texture-editor/pixels';
import { usePreferences } from '../../src/renderer/src/store/preferences';
import type {
  AiPictureRaster,
  AiPictureRequest,
  AiPictureResult,
  AiPicturesPlatform,
  AiPicturesStatus,
} from '../../src/shared/ai-pictures';

afterEach(() => {
  cleanup();
  usePreferences.setState({ mode: 'advanced' });
});

/** A codec without a canvas: 8 bytes of size, then the RGBA bytes. */
const codec: PictureCodec = {
  async decode(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(0);
    const height = view.getUint32(4);
    return { width, height, data: new Uint8ClampedArray(bytes.slice(8)) };
  },
  encode(image) {
    const out = new Uint8Array(8 + image.data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, image.width);
    view.setUint32(4, image.height);
    out.set(image.data, 8);
    return out;
  },
};

/** A photo-like ball of `hue` on a white background, 64 by 64, in the test codec. */
function ball(hue: number): Uint8Array {
  const size = 64;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inside = (x - 32) ** 2 + (y - 32) ** 2 < 24 ** 2;
      const [r, g, b] = fromHsl(hue, 0.7, 0.25 + 0.5 * (1 - (x + y) / 128));
      data.set(inside ? [r, g, b, 255] : [255, 255, 255, 255], (y * size + x) * 4);
    }
  }
  return codec.encode({ width: size, height: size, data });
}

/** An RGB raster scaled up `scale` times, opaque, in the test codec. */
function fromRaster(raster: AiPictureRaster, scale: number): Uint8Array {
  const width = raster.width * scale;
  const height = raster.height * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (Math.floor(y / scale) * raster.width + Math.floor(x / scale)) * 3;
      data.set(
        [raster.rgb[from] ?? 0, raster.rgb[from + 1] ?? 0, raster.rgb[from + 2] ?? 0, 255],
        (y * width + x) * 4,
      );
    }
  }
  return codec.encode({ width, height, data });
}

const READY: AiPicturesStatus = {
  service: 'retro-diffusion',
  keys: { 'retro-diffusion': { set: true, tail: 'wxyz' }, openai: { set: false, tail: null } },
  encryptionAvailable: true,
};

interface FakePlatform extends AiPicturesPlatform {
  requests: AiPictureRequest[];
  cancelled: string[];
  keys: string[];
  next: AiPictureResult | 'hang' | null;
}

function fakePlatform(status: AiPicturesStatus = READY): FakePlatform {
  let current = structuredClone(status);
  const pending = new Map<string, (result: AiPictureResult) => void>();
  const fake: FakePlatform = {
    requests: [],
    cancelled: [],
    keys: [],
    next: null,
    status: async () => structuredClone(current),
    setService: async (service) => {
      current = { ...current, service };
    },
    setKey: async (service, key) => {
      fake.keys.push(key);
      current = {
        ...current,
        keys: { ...current.keys, [service]: { set: true, tail: key.slice(-4) } },
      };
    },
    clearKey: async (service) => {
      current = { ...current, keys: { ...current.keys, [service]: { set: false, tail: null } } };
    },
    testKey: async () => ({ ok: true }),
    generate: (request) => {
      fake.requests.push(request);
      const reference = request.reference;
      if (fake.next === null && reference !== undefined) {
        // As img2img: MSM's drawing back, four times larger, for every picture.
        return Promise.resolve({
          ok: true,
          images: Array.from({ length: request.count }, () => fromRaster(reference, 4)),
        });
      }
      if (fake.next === 'hang') {
        return new Promise((resolve) => pending.set(request.requestId, resolve));
      }
      if (fake.next !== null) return Promise.resolve(fake.next);
      return Promise.resolve({
        ok: true,
        images: Array.from({ length: request.count }, (_, index) => ball(index * 80)),
      });
    },
    cancel: async (requestId) => {
      fake.cancelled.push(requestId);
      pending.get(requestId)?.({ ok: false, error: 'Cancelled.', errorClass: 'cancelled' });
    },
  };
  return fake;
}

function hostOf(platform: AiPicturesPlatform, status: AiPicturesStatus | null = READY) {
  const host: AiPicturesHost = {
    platform,
    status,
    refresh: vi.fn(),
    openSettings: vi.fn(),
    codec,
  };
  return host;
}

function renderButton(
  host: AiPicturesHost | null,
  onPick = vi.fn(async (_bytes: Uint8Array) => {}),
) {
  render(
    <AiPicturesContext.Provider value={host}>
      <MakeWithAiButton
        testId="make-ai"
        target="ruby_mod:textures/item/ruby.png"
        defaultPrompt="a ruby"
        defaultStyle="item"
        size={16}
        onPick={onPick}
      />
    </AiPicturesContext.Provider>,
  );
  return { onPick, user: userEvent.setup() };
}

describe('Make with AI', () => {
  it('is hidden without a host and points to Settings without a key', async () => {
    renderButton(null);
    expect(screen.queryByTestId('make-ai')).toBeNull();
    cleanup();
    const platform = fakePlatform();
    const host = hostOf(platform, {
      ...READY,
      keys: { 'retro-diffusion': { set: false, tail: null }, openai: { set: true, tail: 'abcd' } },
    });
    const { user } = renderButton(host);
    const setup = screen.getByTestId('make-ai-setup');
    expect(setup.textContent).toBe(SET_UP_AI_PICTURES);
    await user.click(setup);
    expect(host.openSettings).toHaveBeenCalled();
  });

  it('reads "Make it with AI" in Very easy mode', () => {
    usePreferences.setState({ mode: 'very-easy' });
    renderButton(hostOf(fakePlatform()));
    expect(screen.getByTestId('make-ai').textContent).toBe(MAKE_IT_WITH_AI);
    cleanup();
    usePreferences.setState({ mode: 'easy' });
    renderButton(hostOf(fakePlatform()));
    expect(screen.getByTestId('make-ai').textContent).toBe(MAKE_WITH_AI);
  });

  it('makes four pictures, shows them before and after clean-up, and hands over the pick', async () => {
    const platform = fakePlatform();
    const { user, onPick } = renderButton(hostOf(platform));
    await user.click(screen.getByTestId('make-ai'));
    const prompt = screen.getByTestId('ai-pictures-prompt') as HTMLTextAreaElement;
    expect(prompt.value).toBe('a ruby');
    expect((screen.getByTestId('ai-pictures-style-item') as HTMLInputElement).checked).toBe(true);
    await user.clear(prompt);
    await user.type(prompt, 'a glowing ruby');
    await user.click(screen.getByTestId('ai-pictures-style-tool'));
    // MSM's drawing of a gem (the name says ruby) is the reference and the shape.
    await screen.findByTestId('ai-pictures-reference');
    expect(screen.getByTestId('ai-pictures-sent').textContent).toContain(
      'a glowing ruby gem, a Minecraft-style pixel art gem icon',
    );
    expect(screen.getByTestId('ai-pictures-cost').textContent).toBeTruthy();
    await user.click(screen.getByTestId('ai-pictures-generate'));
    await waitFor(() => expect(screen.getByTestId('ai-pictures-result-3')).toBeTruthy());
    expect(platform.requests).toEqual([
      expect.objectContaining({
        prompt: expect.stringContaining('a glowing ruby gem'),
        reference: expect.objectContaining({ width: 16, height: 16 }),
        strength: 0.5,
        style: 'tool',
        size: 16,
        count: 4,
        transparent: true,
      }),
    ]);
    for (let index = 0; index < 4; index += 1) {
      expect(screen.getByTestId(`ai-pictures-before-${index}`).getAttribute('src')).toMatch(
        /^data:/,
      );
      expect(screen.getByTestId(`ai-pictures-after-${index}`).getAttribute('src')).toMatch(
        /^data:/,
      );
    }
    await user.click(screen.getByTestId('ai-pictures-result-2'));
    await user.click(screen.getByTestId('ai-pictures-use'));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    const picked = await codec.decode(onPick.mock.calls[0]?.[0] ?? new Uint8Array(8));
    expect(picked.width).toBe(16);
    expect(picked.data[3]).toBe(0);
    await waitFor(() => expect(screen.queryByTestId('ai-pictures-dialog')).toBeNull());
  });

  it('cancels a running request', async () => {
    const platform = fakePlatform();
    platform.next = 'hang';
    const { user, onPick } = renderButton(hostOf(platform));
    await user.click(screen.getByTestId('make-ai'));
    await user.click(screen.getByTestId('ai-pictures-generate'));
    await user.click(await screen.findByTestId('ai-pictures-cancel'));
    expect(await screen.findByTestId('ai-pictures-error')).toHaveProperty(
      'textContent',
      'Cancelled.',
    );
    expect(platform.cancelled).toEqual([platform.requests[0]?.requestId]);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('shows the service error in plain words', async () => {
    const platform = fakePlatform();
    platform.next = {
      ok: false,
      error: 'The account has run out of credit or quota.',
      errorClass: 'quota',
    };
    const { user } = renderButton(hostOf(platform));
    await user.click(screen.getByTestId('make-ai'));
    await user.click(screen.getByTestId('ai-pictures-generate'));
    expect((await screen.findByTestId('ai-pictures-error')).textContent).toContain(
      'run out of credit',
    );
    expect((screen.getByTestId('ai-pictures-use') as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers only sizes up to the field limit', () => {
    expect(sizesUpTo(undefined, 16)).toEqual([16, 32]);
    expect(sizesUpTo(16, 16)).toEqual([16]);
    expect(sizesUpTo(8, 8)).toEqual([8]);
  });
});

describe('Settings, AI pictures', () => {
  it('saves a key, shows only its tail, tests and clears it', async () => {
    const platform = fakePlatform({
      ...READY,
      keys: { 'retro-diffusion': { set: false, tail: null }, openai: { set: false, tail: null } },
    });
    const onChanged = vi.fn();
    render(<AiPicturesSettingsSection aiPictures={platform} onChanged={onChanged} />);
    const user = userEvent.setup();
    const status = () => screen.getByTestId('settings-ai-pictures-status').textContent;
    await waitFor(() => expect(status()).toBe('No key'));
    expect(screen.getByTestId('settings-ai-pictures-privacy').textContent).toContain('never sent');
    const input = screen.getByTestId('settings-ai-pictures-key') as HTMLInputElement;
    expect(input.type).toBe('password');
    await user.type(input, 'rdpk-secret-abcd');
    await user.click(screen.getByTestId('settings-ai-pictures-save-key'));
    await waitFor(() => expect(status()).toBe('Key set (…abcd)'));
    expect(input.value).toBe('');
    expect(document.body.textContent).not.toContain('rdpk-secret');
    expect(onChanged).toHaveBeenCalled();
    await user.click(screen.getByTestId('settings-ai-pictures-test-key'));
    expect(await screen.findByText('The key works.')).toBeTruthy();
    await user.selectOptions(screen.getByTestId('settings-ai-pictures-service'), 'openai');
    await waitFor(() => expect(status()).toBe('No key'));
    await user.selectOptions(screen.getByTestId('settings-ai-pictures-service'), 'retro-diffusion');
    await waitFor(() => expect(status()).toBe('Key set (…abcd)'));
    await user.click(screen.getByTestId('settings-ai-pictures-clear-key'));
    await waitFor(() => expect(status()).toBe('No key'));
  });
});

function textureItem(path: string, bytes: Uint8Array): ChangeItem {
  return {
    itemId: path,
    op: 'asset',
    asset: { namespace: 'ruby_mod', path, bytes },
    accepted: true,
    problems: [],
  };
}

/** A golden disc on a clear ground: MSM's built-in picture in the tests. */
const builtIn = (() => {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if ((x - 7.5) ** 2 + (y - 7.5) ** 2 < 36) data.set([214, 168, 40, 255], (y * 16 + x) * 4);
    }
  }
  return codec.encode({ width: 16, height: 16, data } satisfies RgbaImage);
})();

describe('Use AI pictures (the Creator and Surprise me)', () => {
  it('replaces block and item textures, one request each, keeping the rest', async () => {
    const platform = fakePlatform();
    const items = [
      textureItem('textures/block/ruby_ore.png', builtIn),
      textureItem('textures/item/ruby_pickaxe.png', builtIn),
      textureItem('sounds/ruby.ogg', new Uint8Array([1])),
      {
        itemId: 'e',
        op: 'create',
        elementId: 'ruby_mod:ruby',
        kind: 'msm:item',
        after: {},
        accepted: true,
        problems: [],
      } as ChangeItem,
    ];
    const progress: number[] = [];
    const result = await aiTextures(items, {
      platform,
      codec,
      theme: 'volcano',
      onProgress: (entry) => progress.push(entry.done),
    });
    expect(platform.requests.map((request) => [request.style, request.count])).toEqual([
      ['block', 1],
      ['tool', 1],
    ]);
    expect(platform.requests[0]?.prompt).toContain('volcano ruby ore, block texture');
    expect(platform.requests[1]?.prompt).toContain('golden volcano ruby pickaxe');
    expect(platform.requests[1]?.prompt).toContain('same outline as an iron pickaxe');
    expect(result.made).toHaveLength(2);
    expect(result.items[0]?.asset?.bytes).not.toBe(builtIn);
    expect(result.items[2]).toBe(items[2]);
    expect(result.items[3]).toBe(items[3]);
    expect(progress.at(-1)).toBe(2);
    expect(batchNote(result)).toBe('AI pictures made 2 textures.');
  });

  it('keeps the built-in picture when a request fails, with a note', async () => {
    const platform = fakePlatform();
    platform.next = { ok: false, error: 'The service had a problem.', errorClass: 'server' };
    const items = [textureItem('textures/item/ruby.png', builtIn)];
    const result = await aiTextures(items, { platform, codec });
    expect(result.items[0]).toBe(items[0]);
    expect(batchNote(result)).toBe('1 kept the built-in picture: The service had a problem.');
  });

  it('stops when cancelled', async () => {
    const platform = fakePlatform();
    const items = [
      textureItem('textures/item/a.png', builtIn),
      textureItem('textures/item/b.png', builtIn),
    ];
    let calls = 0;
    const result = await aiTextures(items, {
      platform,
      codec,
      cancelled: () => {
        calls += 1;
        return calls > 1;
      },
    });
    expect(platform.requests).toHaveLength(1);
    expect(result.cancelled).toBe(true);
    expect(result.items[1]).toBe(items[1]);
  });

  it('shows the switch only with a key, off by default', async () => {
    function Probe() {
      const batch = useAiBatch();
      return <AiPicturesSwitch batch={batch} testId="switch" />;
    }
    render(
      <AiPicturesContext.Provider value={hostOf(fakePlatform())}>
        <Probe />
      </AiPicturesContext.Provider>,
    );
    expect((screen.getByTestId('switch') as HTMLInputElement).checked).toBe(false);
    cleanup();
    render(
      <AiPicturesContext.Provider
        value={hostOf(fakePlatform(), {
          ...READY,
          keys: {
            'retro-diffusion': { set: false, tail: null },
            openai: { set: false, tail: null },
          },
        })}
      >
        <Probe />
      </AiPicturesContext.Provider>,
    );
    expect(screen.queryByTestId('switch')).toBeNull();
  });
});

describe('Prompts and writes', () => {
  it('builds the description from the name, kind and theme', () => {
    expect(wordsOf('ruby_mod:block/ruby_ore')).toBe('ruby ore');
    expect(defaultPrompt('Ruby', 'block')).toBe('a ruby block');
    expect(defaultPrompt('amber_ore', 'block', 'Desert')).toBe('an amber ore, desert theme');
    expect(styleForName('Ruby Sword', 'item')).toBe('tool');
    expect(styleForName('Ruby', 'item')).toBe('item');
    expect(styleForTexturePath('textures/block/x.png')).toBe('block');
    expect(styleForTexturePath('textures/item/ruby_axe.png')).toBe('tool');
  });

  it('writes over a recorded texture and adds a new one as an asset item', () => {
    const project = {
      namespaces: [
        { name: 'ruby_mod', elements: [], assets: [{ path: 'textures/item/ruby.png' }] },
      ],
    } as never;
    const bytes = new Uint8Array([1]);
    expect(textureChange(project, 'ruby_mod', 'textures/item/ruby.png', bytes)).toEqual({
      items: [],
      writes: [{ namespace: 'ruby_mod', path: 'textures/item/ruby.png', bytes }],
    });
    const added = textureChange(project, 'ruby_mod', 'textures/item/new.png', bytes);
    expect(added.writes).toEqual([]);
    expect(added.items[0]).toMatchObject({ op: 'asset', asset: { path: 'textures/item/new.png' } });
    expect(textureAsset('ruby_mod:block/ruby')).toEqual({
      namespace: 'ruby_mod',
      path: 'textures/block/ruby.png',
    });
    expect(textureAsset('minecraft:block/stone')).toBeNull();
  });
});
