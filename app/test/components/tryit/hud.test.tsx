// @vitest-environment happy-dom
/// <reference types="node" />

/**
 * Try it's keys and HUD in the view (B429): the HUD layer's placement against the cross-language
 * golden `fixtures/hud-layout/golden.json` (every screen, the dashboard rows included), what an
 * element draws (bars, icons, text, text values on bars), the dashboard items, the GUI scale, the
 * game key names of the browser's keys, and a project key bind that fills a bar and shows a
 * hidden text through the view's own keys.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OutputFile } from '@msm/plugin-api';
import type { CatalogueHud, HudFrameItem } from '@msm/sim';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guiSize } from '../../../src/renderer/src/studios/controls/hud-layout';
import {
  autoGuiScale,
  DASHBOARD,
  dashboardItems,
  hudItemOf,
  placeHud,
  type TryItHudItem,
  tryItGui,
} from '../../../src/renderer/src/tryit/hud/hud-model';
import { gameKeyName, gameMouseName, projectKey } from '../../../src/renderer/src/tryit/hud/keys';
import TryItView from '../../../src/renderer/src/tryit/TryItView';
import { useTryItStore } from '../../../src/renderer/src/tryit/tryit-store';
import { demoOutputs, fakeSession, NS, TARGET } from './tryit-fixture';

interface Golden {
  elements: {
    id: string;
    anchor: string;
    order: number;
    size: [number, number];
    offset?: [number, number];
  }[];
  screens: {
    window: [number, number];
    scale: number;
    gui: [number, number];
    positions: Record<string, [number, number]>;
  }[];
}

const golden = JSON.parse(
  readFileSync(join(__dirname, '../../../../fixtures/hud-layout/golden.json'), 'utf8'),
) as Golden;

/** A frame item of a HUD element with `definition` showing `value`. */
function frameItem(
  id: string,
  definition: Record<string, unknown>,
  value: number | string | null,
  max: number | string | null = 20,
): HudFrameItem {
  const type = definition.type === 'bar' || definition.type === 'icons' ? definition.type : 'text';
  const hud = {
    id,
    displayName: id,
    definition,
    type,
    show: 'always',
    startsHidden: false,
    text: typeof definition.text === 'string' ? definition.text : '{value}',
    value: { source: 'set' },
    max: typeof max === 'number' ? max : 20,
    origin: { elementId: id },
  } as unknown as CatalogueHud;
  return { hud, value, max };
}

describe('the HUD layer against the golden', () => {
  it('places every element and the dashboard rows where the runtime does, on every screen', () => {
    // Project elements as bars of the golden's sizes, the dashboard rows as dashboard items.
    const items: TryItHudItem[] = golden.elements.map((element) => {
      if (element.id.startsWith('msm_runtime:dashboard/')) {
        const k = Number(element.id.split('/')[1]);
        return {
          kind: 'dashboard',
          box: {
            id: element.id,
            anchor: 'bottom_right',
            order: DASHBOARD.order + k,
            size: element.size,
          },
          label: '',
          barX: 0,
          filled: 0,
          colour: '#000000',
        };
      }
      const item = hudItemOf(
        frameItem(
          element.id,
          {
            type: 'bar',
            anchor: element.anchor,
            order: element.order,
            size: element.size,
            ...(element.offset === undefined ? {} : { offset: element.offset }),
          },
          5,
        ),
      );
      if (item === null) throw new Error(element.id);
      return item;
    });
    for (const one of golden.screens) {
      const gui = guiSize(one.window, one.scale);
      expect(gui).toEqual(one.gui);
      const placed = placeHud(items, gui);
      const positions = Object.fromEntries(placed.map((item) => [item.box.id, item.position]));
      expect(positions, `${one.window.join('x')} at ${one.scale}`).toEqual(one.positions);
    }
  });

  it('gives the dashboard rows the golden ids, orders and the runtime row size', () => {
    const items = dashboardItems(
      [
        { label: 'Health', fraction: 0.5, kind: 'health' },
        { label: 'Fuel', fraction: 1, kind: 'fuel' },
      ],
      (line) => line.length * 6,
    );
    expect(items.map((item) => item.box.id)).toEqual([
      'msm_runtime:dashboard/0',
      'msm_runtime:dashboard/1',
    ]);
    const golden0 = golden.elements.find((element) => element.id === 'msm_runtime:dashboard/0');
    expect(items[0]?.box.order).toBe(golden0?.order);
    expect(items[0]?.box.anchor).toBe('bottom_right');
    // Labels 36 wide, a gap of 4 and a 50-pixel bar; the lowest row is the last (fuel).
    expect(items[0]?.box.size).toEqual([90, 9]);
    expect(items[0]?.kind === 'dashboard' && items[0].label).toBe('Fuel');
    expect(items[1]?.kind === 'dashboard' && items[1].filled).toBe(25);
  });
});

describe('what an element draws', () => {
  it('fills bars, draws nothing for a text value on a bar and counts max 20 until known', () => {
    const bar = hudItemOf(frameItem('a:b', { type: 'bar', size: [100, 4] }, 30, 60));
    expect(bar?.kind === 'bar' && bar.filled).toBe(50);
    expect(hudItemOf(frameItem('a:b', { type: 'bar' }, 'full'))).toBeNull();
    const unknownMax = hudItemOf(frameItem('a:b', { type: 'bar' }, 10, null));
    expect(unknownMax?.kind === 'bar' && unknownMax.filled).toBe(41);
    const empty = hudItemOf(frameItem('a:b', { type: 'bar' }, null));
    expect(empty?.kind === 'bar' && empty.filled).toBe(0);
  });

  it('draws icons only with an icon, and text with its value and max', () => {
    expect(hudItemOf(frameItem('a:i', { type: 'icons' }, 7))).toBeNull();
    const icons = hudItemOf(frameItem('a:i', { type: 'icons', icon: 'a:hud/heart' }, 7));
    expect(icons?.kind === 'icons' && icons.icons.full).toBe(3);
    expect(icons?.box.size).toEqual([81, 9]);
    const text = hudItemOf(
      frameItem('a:t', { type: 'text', text: '{value} of {max}', color: '#ff0000' }, 12.5, 100),
    );
    expect(text?.kind === 'text' && text.line).toBe('12.5 of 100');
    expect(text?.kind === 'text' && text.colour).toBe('#ff0000');
  });

  it('picks the game’s automatic GUI scale', () => {
    expect(autoGuiScale([854, 480])).toBe(2);
    expect(autoGuiScale([1920, 1080])).toBe(4);
    expect(autoGuiScale([300, 200])).toBe(1);
    expect(tryItGui([1280, 720])).toEqual({ gui: [427, 240], scale: 3 });
  });

  it('names browser keys and mouse buttons as the game does', () => {
    expect(gameKeyName(TARGET, 'KeyK')).toBe('key.keyboard.k');
    expect(gameKeyName(TARGET, 'AltLeft')).toBe('key.keyboard.left.alt');
    expect(gameMouseName(TARGET, 3)).toBe('key.mouse.4');
    expect(gameKeyName({}, 'KeyK')).toBeNull();
    const keys = { press: vi.fn(), release: vi.fn(), uses: (key: string) => key === 'k' };
    expect(projectKey(keys, 'k', true, true)).toBe('k');
    expect(keys.press).not.toHaveBeenCalled();
    projectKey(keys, 'k', false);
    expect(keys.release).toHaveBeenCalledWith('k');
  });
});

const json = (path: string, contents: unknown): OutputFile =>
  ({ path, contents, layer: 'msm' }) as OutputFile;

/** The demo project with a mana bar, a hidden note and a key (K) that fills and shows them. */
function hudOutputs(): OutputFile[] {
  return [
    ...demoOutputs(),
    json(`msm/${NS}/hud/mana.json`, {
      format: 1,
      type: 'bar',
      value: { source: 'set' },
      max: 100,
      fill_color: '#3c6cf0',
    }),
    json(`msm/${NS}/hud/note.json`, {
      format: 1,
      type: 'text',
      anchor: 'top_left',
      show: 'always',
      starts_hidden: true,
      text: 'Charged',
    }),
    json(`msm/${NS}/key_bind/charge.json`, {
      format: 1,
      default_key: 'key.keyboard.k',
      'msm:on_press': 'charge',
      events: {
        charge: {
          actions: [
            { type: 'set_hud', hud: `${NS}:mana`, value: 60 },
            { type: 'show_hud', hud: `${NS}:note` },
          ],
        },
      },
    }),
    json(`msm/${NS}/key_bind/pause_too.json`, {
      format: 1,
      default_key: 'key.keyboard.z',
    }),
  ];
}

describe('keys and the HUD in the Try it view', () => {
  beforeEach(() => {
    useTryItStore.getState().reset();
    useTryItStore.setState({ cardSeen: true, smaller: null });
  });
  afterEach(() => {
    cleanup();
    useTryItStore.getState().reset();
  });

  it('a project key fills the mana bar and shows the hidden note; Z stays the project’s', async () => {
    const fake = fakeSession(hudOutputs());
    render(
      <TryItView
        session={fake.session}
        root="/projects/demo"
        vanilla={null}
        readProjectAsset={async () => null}
        playAvailable
        onPlay={vi.fn()}
        onTestInMinecraft={vi.fn()}
        webgl={false}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('tryit-keys').textContent).toContain('Charge (your key)'),
    );
    expect(screen.queryAllByTestId('tryit-hud-item')).toHaveLength(0);
    const canvas = screen.getByTestId('tryit-canvas');
    act(() => {
      fireEvent.keyDown(canvas, { code: 'KeyK' });
      fireEvent.keyUp(canvas, { code: 'KeyK' });
    });
    await waitFor(() => expect(screen.getAllByTestId('tryit-hud-item')).toHaveLength(2));
    const items = screen.getAllByTestId('tryit-hud-item');
    const mana = items.find((item) => item.getAttribute('data-id') === `${NS}:mana`);
    expect(mana?.getAttribute('data-value')).toBe('60');
    expect(mana?.getAttribute('data-filled')).toBe('49');
    const note = items.find((item) => item.getAttribute('data-id') === `${NS}:note`);
    expect(note?.getAttribute('data-text')).toBe('Charged');
    expect([note?.getAttribute('data-x'), note?.getAttribute('data-y')]).toEqual(['2', '2']);
    expect(screen.getByTestId('tryit-log').textContent).toContain(
      'You pressed Charge (K), so its event "charge" ran.',
    );
    // Z is the project's key here: the clock is not paused, and the log says why once.
    const paused = () => screen.getByTestId('tryit-state').getAttribute('data-paused');
    act(() => {
      fireEvent.keyDown(canvas, { code: 'KeyZ' });
      fireEvent.keyUp(canvas, { code: 'KeyZ' });
    });
    expect(paused()).toBe('false');
    await waitFor(() =>
      expect(screen.getByTestId('tryit-log').textContent).toContain(
        'Z is your key Pause Too here, so it does not pause the clock in Try it',
      ),
    );
  });
});
