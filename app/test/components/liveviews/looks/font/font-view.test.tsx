// @vitest-environment happy-dom

/**
 * B624: the font view. A bitmap provider draws the typed line from its sheet's cells at GUI
 * scales 1 to 4; a missing glyph is marked; a provider the view cannot draw is named. The 2D
 * context is a fake that records the drawing; every file is MSM's own (`fixtures.ts`).
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import FontView from '../../../../../src/renderer/src/liveviews/looks/font/FontView';
import {
  setSharedUnihexClient,
  UnihexClient,
} from '../../../../../src/renderer/src/liveviews/looks/font/unihex-client';
import type { LiveViewProps } from '../../../../../src/renderer/src/liveviews/registry';
import { NOT_SET_UP_VANILLA_DATA } from '../../../../../src/renderer/src/liveviews/vanilla-data';
import {
  DEFAULT_PREFS,
  type LiveViewPrefs,
} from '../../../../../src/renderer/src/liveviews/view-prefs';
import {
  fontElement,
  hexZip,
  hostWorker,
  projectOf,
  readerOf,
  SPIKE_FONTS,
  spikeSheet,
} from './fixtures';

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
  readonly canvas: HTMLCanvasElement;
}

const calls: Call[] = [];

function fakeContext(canvas: HTMLCanvasElement): unknown {
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args, canvas });
    };
  return {
    imageSmoothingEnabled: true,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textBaseline: 'alphabetic',
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    fillText: record('fillText'),
    drawImage: record('drawImage'),
    putImageData: record('putImageData'),
    measureText: () => ({ width: 5 }),
  };
}

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return fakeContext(this) as never;
  });
  setSharedUnihexClient(new UnihexClient(hostWorker));
});

afterAll(() => {
  vi.restoreAllMocks();
  setSharedUnihexClient(null);
});

afterEach(() => {
  cleanup();
  calls.length = 0;
});

const SHEET = { 'assets/demo/textures/font/glyphs.png': spikeSheet() };
const BITMAP8 = {
  providers: [{ type: 'bitmap', file: 'demo:font/glyphs.png', chars: ['ABCD', 'EFGH'], ascent: 7 }],
};

function Harness(props: {
  data: Json;
  text: string;
  others?: readonly Element[];
  files?: Readonly<Record<string, Uint8Array>>;
  vanillaAssets?: LiveViewProps['vanillaAssets'];
}) {
  const [prefs, setPrefs] = useState<LiveViewPrefs>({ ...DEFAULT_PREFS, sampleText: props.text });
  const element = fontElement('demo:shown', props.data);
  const project: Project = projectOf([element, ...(props.others ?? [])]);
  return (
    <FontView
      project={project}
      element={element}
      vanilla={NOT_SET_UP_VANILLA_DATA}
      vanillaAssets={props.vanillaAssets ?? null}
      readProject={readerOf(props.files ?? SHEET)}
      preferences={prefs}
      onPreferences={(patch) => setPrefs((old) => ({ ...old, ...patch }))}
      onSetup={() => {}}
    />
  );
}

function lineAt(scale: number): HTMLCanvasElement {
  const canvas = screen
    .getAllByTestId('font-line')
    .find((element) => element.getAttribute('data-scale') === String(scale));
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`no line at scale ${scale}`);
  return canvas;
}

/** The calls `name` of the last drawing of `canvas` (since its last clear). */
function drawn(canvas: HTMLCanvasElement, name: string): Call[] {
  const own = calls.filter((call) => call.canvas === canvas);
  const start = own.map((call) => call.name).lastIndexOf('clearRect');
  return own.slice(start + 1).filter((call) => call.name === name);
}

describe('the font view (B624)', () => {
  it('draws the typed line from a bitmap provider at GUI scales 1 to 4', async () => {
    render(<Harness data={BITMAP8} text="ABBA" />);
    await waitFor(() => expect(lineAt(1).getAttribute('data-width')).toBe('30'));
    expect(screen.getAllByTestId('font-line')).toHaveLength(4);
    expect(lineAt(4).getAttribute('data-width')).toBe('120');
    // Each letter from its own cell of the sheet, scaled with no smoothing.
    const images = drawn(lineAt(2), 'drawImage');
    expect(images.map((call) => call.args.slice(1, 6))).toEqual([
      [0, 0, 8, 8, 4],
      [8, 0, 8, 8, 4 + 9 * 2],
      [8, 0, 8, 8, 4 + 15 * 2],
      [0, 0, 8, 8, 4 + 21 * 2],
    ]);
    expect(screen.queryByTestId('font-missing')).toBeNull();
    const frame = screen.getByTestId('live-view-fidelity');
    expect(frame.getAttribute('data-fidelity')).toBe('checked');

    // Typing follows at once.
    await userEvent.type(screen.getByTestId('font-sample-text'), 'H');
    await waitFor(() => expect(lineAt(1).getAttribute('data-width')).toBe('39'));
  });

  it('marks a missing glyph and names it', async () => {
    render(<Harness data={BITMAP8} text="AZ中" />);
    await waitFor(() => expect(screen.getByTestId('font-missing')).toBeTruthy());
    expect(lineAt(1).getAttribute('data-width')).toBe(String(9 + 6 + 6));
    expect(screen.getByTestId('font-missing').textContent).toContain('Z (U+005A)');
    expect(screen.getByTestId('font-missing').textContent).toContain('中 (U+4E2D)');
    // Each missing letter drawn as a marked box.
    expect(drawn(lineAt(1), 'strokeRect')).toHaveLength(2);
  });

  it('names a provider it cannot draw, and says so in the level', async () => {
    const data = {
      providers: [
        ...BITMAP8.providers,
        { type: 'legacy_unicode', sizes: 'minecraft:font/glyph_sizes.bin', template: 'x' },
        { type: 'sparkle' },
        { type: 'bitmap', file: 'demo:font/none.png', chars: ['Z'], ascent: 7 },
        { type: 'ttf', file: 'demo:sans.ttf', size: 11 },
      ],
    };
    render(<Harness data={data} text="AZ" />);
    await waitFor(() => expect(screen.getByTestId('font-providers')).toBeTruthy());
    const items = [...screen.getByTestId('font-providers').querySelectorAll('li')];
    expect(items.map((item) => item.getAttribute('data-drawn'))).toEqual([
      'yes',
      'no',
      'no',
      'no',
      'no',
    ]);
    expect(items[1]?.textContent).toContain('legacy_unicode');
    expect(items[1]?.textContent).toContain('1.20');
    expect(items[2]?.textContent).toContain('sparkle');
    expect(items[3]?.textContent).toContain(
      'assets/demo/textures/font/none.png is not in the project',
    );
    expect(items[4]?.textContent).toContain('demo:sans.ttf');
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'only_in_game',
    );
    // The bitmap still draws; Z is still missing.
    expect(lineAt(1).getAttribute('data-width')).toBe('15');
  });

  it('follows references, later providers filling the gaps', async () => {
    const others = [fontElement('demo:base', BITMAP8)];
    const data = {
      providers: [
        { type: 'reference', id: 'demo:base' },
        { type: 'space', advances: { ' ': 4, Z: 12.5 } },
      ],
    };
    render(<Harness data={data} text="A Z" others={others} />);
    await waitFor(() => expect(lineAt(1).getAttribute('data-width')).toBe(String(9 + 4 + 13)));
    const items = [...screen.getByTestId('font-providers').querySelectorAll('li')];
    expect(items.map((item) => item.getAttribute('data-type'))).toEqual([
      'reference',
      'bitmap',
      'space',
    ]);
    expect(items[1]?.textContent).toContain('through demo:base');
  });

  it('asks for the Minecraft folder when a vanilla font is named without it', async () => {
    const data = { providers: [{ type: 'reference', id: 'minecraft:default' }] };
    render(<Harness data={data} text="A" />);
    await waitFor(() => expect(screen.getByTestId('live-view-set-up')).toBeTruthy());
    expect(screen.getByTestId('font-providers').textContent).toContain('Minecraft folder');
  });

  it('draws a unihex provider from the font worker', async () => {
    const data = { providers: [{ type: 'unihex', hex_file: 'demo:font/test.zip' }] };
    const files = { 'assets/demo/font/test.zip': hexZip() };
    render(<Harness data={data} text="中A" files={files} />);
    await waitFor(() =>
      expect(lineAt(1).getAttribute('data-width')).toBe(String(Math.ceil(8 + 1.5))),
    );
    const item = screen.getByTestId('font-providers').querySelector('li');
    expect(item?.getAttribute('data-fidelity')).toBe('about_right');
    expect(screen.queryByTestId('font-missing')).toBeNull();
    // 14 columns by 16 rows of half-pixel dots for 中, one for A.
    expect(drawn(lineAt(2), 'fillRect')).toHaveLength(14 * 16 + 1);
  });

  it('keeps the vanilla unifont named while the Minecraft folder is not set up', async () => {
    const data = { providers: [{ type: 'unihex', hex_file: 'minecraft:font/unifont.zip' }] };
    render(<Harness data={data} text="A" />);
    await waitFor(() => expect(screen.getByTestId('font-providers')).toBeTruthy());
    const item = screen.getByTestId('font-providers').querySelector('li');
    expect(item?.getAttribute('data-drawn')).toBe('no');
    expect(item?.textContent).toContain('unifont');
    expect(screen.getByTestId('live-view-set-up')).toBeTruthy();
  });
});

// The spike's own fonts also draw through the view (one, as a smoke check of the fixtures).
describe('the spike fonts', () => {
  it('draws msm_b619:ref', async () => {
    const others = [fontElement('msm_b619:bitmap8', SPIKE_FONTS['msm_b619:bitmap8'] as Json)];
    const files = { 'assets/msm_b619/textures/font/glyphs.png': spikeSheet() };
    render(
      <Harness
        data={SPIKE_FONTS['msm_b619:ref'] as Json}
        text="Hello"
        others={others}
        files={files}
      />,
    );
    await waitFor(() => expect(lineAt(1).getAttribute('data-width')).toBe('33'));
  });
});
