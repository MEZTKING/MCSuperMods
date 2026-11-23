/**
 * Helpers shared by the search specs (ADR 0124; B671): launches with their own folders, the
 * Welcome of a new install, a watch that fails the spec on any network request, and pictures
 * read back from the page.
 *
 * @packageDocumentation
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ElectronApplication, expect, type Locator, type Page } from 'playwright/test';
import { type LaunchedApp, launchApp } from './fixtures';

/** Chromium switches for software WebGL (SwiftShader), as `showcase-path` uses them. */
export const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;

/** A launch with its own temporary folders, and a cleanup that also puts the environment back. */
export interface SearchLaunch extends LaunchedApp {
  /** The temporary base folder (removed on close). */
  readonly base: string;
  /** Every network request seen since the launch (see {@link watchNetwork}). */
  readonly network: () => Promise<string[]>;
}

/** Launches the app with folders under a fresh base; `env` is set for this launch only. */
export async function launchSearch(
  name: string,
  options: {
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
    /** Runs before the launch with the folders (to copy a project or install a plugin). */
    readonly prepare?: (folders: { projectDir: string; outDir: string; msmHome: string }) => void;
  } = {},
): Promise<SearchLaunch> {
  const base = mkdtempSync(join(tmpdir(), `msm-search-${name}-`));
  const folders = {
    projectDir: join(base, 'picked'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  options.prepare?.(folders);
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(options.env ?? {})) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  let launched: LaunchedApp;
  try {
    launched = await launchApp({ reuse: folders, ...(options.args ? { args: options.args } : {}) });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  await launched.window.waitForLoadState('domcontentloaded');
  const network = await watchNetwork(launched.app);
  return {
    ...launched,
    base,
    network,
    async close() {
      await launched.close();
      rmSync(base, { recursive: true, force: true });
    },
  };
}

/** Schemes that leave the computer. */
const NETWORK = /^(https?|wss?|ftp):/i;

/**
 * Records every request that would leave the computer: the renderer's and its workers' requests
 * (the browser context), and in main `fetch`, Electron's `net.request` and `net.fetch`, and
 * Node's `http.request`/`https.request` and `get`. The app's own `msm-app://`, `blob:`, `data:`
 * and `file:` requests are not network.
 */
export async function watchNetwork(app: ElectronApplication): Promise<() => Promise<string[]>> {
  const seen: string[] = [];
  app.context().on('request', (request) => {
    if (NETWORK.test(request.url())) seen.push(request.url());
  });
  await app.evaluate((electron) => {
    const holder = globalThis as unknown as { __msmE2eNetwork?: string[] };
    if (holder.__msmE2eNetwork !== undefined) return;
    const log: string[] = [];
    holder.__msmE2eNetwork = log;
    const describe = (input: unknown): string => {
      if (typeof input === 'string') return input;
      if (input !== null && typeof input === 'object') {
        const value = input as {
          url?: unknown;
          href?: unknown;
          host?: unknown;
          hostname?: unknown;
        };
        if (typeof value.url === 'string') return value.url;
        if (typeof value.href === 'string') return value.href;
        const host = value.hostname ?? value.host;
        if (typeof host === 'string') return `//${host}`;
      }
      return String(input);
    };
    const wrap = (owner: Record<string, unknown>, key: string): void => {
      const original = owner[key];
      if (typeof original !== 'function') return;
      owner[key] = function wrapped(this: unknown, ...args: unknown[]) {
        log.push(describe(args[0]));
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      };
    };
    wrap(globalThis as unknown as Record<string, unknown>, 'fetch');
    wrap(electron.net as unknown as Record<string, unknown>, 'request');
    wrap(electron.net as unknown as Record<string, unknown>, 'fetch');
    const builtin = (
      process as unknown as { getBuiltinModule?: (id: string) => Record<string, unknown> }
    ).getBuiltinModule;
    for (const id of ['node:http', 'node:https']) {
      const module = builtin?.(id);
      if (module === undefined) continue;
      wrap(module, 'request');
      wrap(module, 'get');
    }
  });
  return async () => {
    const main = await app.evaluate(
      () => (globalThis as unknown as { __msmE2eNetwork?: string[] }).__msmE2eNetwork ?? [],
    );
    return [...seen, ...main.filter((url) => !/^(msm-app|blob|data|file):/i.test(url))];
  };
}

/** Closes the Welcome of a new install (Very easy) and returns Home. */
export async function veryEasyHome(window: Page): Promise<Locator> {
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();
  return home;
}

/**
 * The share of an `<img>`'s opaque pixels that are blue (blue clearly above red and green), read
 * back through a 2D canvas.
 */
export async function bluePixelShare(image: Locator): Promise<number> {
  return image.evaluate(async (element) => {
    interface Picture {
      readonly naturalWidth: number;
      readonly naturalHeight: number;
      readonly complete: boolean;
      decode(): Promise<void>;
    }
    interface Context2d {
      drawImage(image: unknown, x: number, y: number): void;
      getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
    }
    const picture = element as unknown as Picture;
    if (!picture.complete) await picture.decode();
    const doc = (
      globalThis as unknown as {
        document: {
          createElement(tag: 'canvas'): {
            width: number;
            height: number;
            getContext(type: '2d'): Context2d | null;
          };
        };
      }
    ).document;
    const canvas = doc.createElement('canvas');
    canvas.width = picture.naturalWidth;
    canvas.height = picture.naturalHeight;
    const context = canvas.getContext('2d');
    if (context === null || canvas.width === 0) return 0;
    context.drawImage(picture, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let opaque = 0;
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0];
      if (a < 128) continue;
      opaque += 1;
      if (b > r + 30 && b > g + 30) blue += 1;
    }
    return opaque === 0 ? 0 : blue / opaque;
  });
}

/**
 * How many different colours a WebGL canvas shows, read with `readPixels` on a 16 by 16 grid in
 * an animation frame (the drawing buffer is not kept); the largest count of a few frames, as
 * `showcase-path` reads it. WebGL 2 contexts are read the same way.
 */
export async function canvasColours(canvas: Locator): Promise<number> {
  return canvas.evaluate(async (element) => {
    interface PixelReader {
      readonly drawingBufferWidth: number;
      readonly drawingBufferHeight: number;
      readonly RGBA: number;
      readonly UNSIGNED_BYTE: number;
      readPixels(
        x: number,
        y: number,
        w: number,
        h: number,
        f: number,
        t: number,
        out: Uint8Array,
      ): void;
    }
    const surface = element as unknown as {
      getContext(type: 'webgl' | 'webgl2'): PixelReader | null;
    };
    const page = globalThis as unknown as { requestAnimationFrame(done: () => void): void };
    const gl = surface.getContext('webgl2') ?? surface.getContext('webgl');
    if (gl === null) return 0;
    let most = 0;
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((done) => page.requestAnimationFrame(() => done()));
      const colours = new Set<number>();
      const pixel = new Uint8Array(4);
      for (let i = 0; i < 16; i += 1) {
        for (let j = 0; j < 16; j += 1) {
          const x = Math.floor(((i + 0.5) * gl.drawingBufferWidth) / 16);
          const y = Math.floor(((j + 0.5) * gl.drawingBufferHeight) / 16);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          colours.add(
            (pixel[0] ?? 0) * 0x1000000 +
              (pixel[1] ?? 0) * 0x10000 +
              (pixel[2] ?? 0) * 0x100 +
              (pixel[3] ?? 0),
          );
        }
      }
      most = Math.max(most, colours.size);
    }
    return most;
  });
}

/** The `data-testid` of the focused element (or `''`). */
export async function focusedTestId(window: Page): Promise<string> {
  return window.evaluate(() => {
    const doc = (
      globalThis as unknown as {
        document: { activeElement: { getAttribute(name: string): string | null } | null };
      }
    ).document;
    return doc.activeElement?.getAttribute('data-testid') ?? '';
  });
}

/** Presses Tab until `target` has focus (at most `limit` presses). */
export async function tabTo(window: Page, target: Locator, limit = 60): Promise<void> {
  const focused = () =>
    target.evaluate(
      (element) =>
        (globalThis as unknown as { document: { activeElement: unknown } }).document
          .activeElement === element,
    );
  for (let i = 0; i < limit; i += 1) {
    if (await focused()) return;
    await window.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}
