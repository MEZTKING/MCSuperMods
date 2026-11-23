// @vitest-environment happy-dom

/**
 * B626: the day strip. A keyframe edit moves the strip; `period_ticks` rescales it (a world
 * clock has no fields, B619 3S10); a value type the strip cannot draw is named; a world clock
 * draws the timelines tied to it; the scrubber moves "now" and the sampled values follow. The
 * schema is the real vendored one of 26.3 (built once in `beforeAll`); every timeline is MSM's own.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { targetById } from '@msm/targets';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type AttributeTable,
  attributeTable,
} from '../../../../../src/renderer/src/liveviews/looks/day/attributes';
import { DayStripView } from '../../../../../src/renderer/src/liveviews/looks/day/DayStrip';
import {
  NOT_SET_UP_VANILLA_DATA,
  type VanillaDataReader,
} from '../../../../../src/renderer/src/liveviews/vanilla-data';
import {
  DEFAULT_PREFS,
  type LiveViewPrefs,
} from '../../../../../src/renderer/src/liveviews/view-prefs';
import { schemaIndexFor } from '../../../forms/schemas';

let table: AttributeTable;

beforeAll(async () => {
  const bundle = targetById('mc-26.3');
  if (bundle === undefined) throw new Error('no 26.3 target');
  table = attributeTable(await schemaIndexFor(bundle));
});

afterEach(() => cleanup());

function element(id: string, kind: string, data: Json): Element {
  return { formatVersion: 1, id, kind, data, meta: {} } as unknown as Element;
}

function projectOf(elements: readonly Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Days',
    namespaces: [{ name: 'demo', assets: [], elements: [...elements] }],
    targets: ['mc-26.3'],
    plugins: [],
    settings: {},
  } as unknown as Project;
}

function Harness(props: {
  shown: Element;
  others?: readonly Element[];
  vanilla?: VanillaDataReader;
}) {
  const [prefs, setPrefs] = useState<LiveViewPrefs>(DEFAULT_PREFS);
  return (
    <DayStripView
      project={projectOf([props.shown, ...(props.others ?? [])])}
      element={props.shown}
      vanilla={props.vanilla ?? NOT_SET_UP_VANILLA_DATA}
      vanillaAssets={null}
      preferences={prefs}
      onPreferences={(patch) => setPrefs((old) => ({ ...old, ...patch }))}
      onSetup={() => {}}
      loadAttributes={async () => table}
    />
  );
}

function timeline(data: Json): Element {
  return element('demo:my_day', 'minecraft:timeline', data);
}

const SKY = (tick: number, period = 24_000): Json => ({
  clock: 'minecraft:overworld',
  period_ticks: period,
  time_markers: { noon: 6000 },
  tracks: {
    'minecraft:visual/sky_color': {
      keyframes: [
        { ticks: 0, value: '#000000' },
        { ticks: tick, value: '#ffffff' },
      ],
    },
    'minecraft:visual/star_brightness': {
      keyframes: [
        { ticks: 0, value: 0 },
        { ticks: tick, value: 1 },
      ],
    },
  },
});

function track(attribute: string): HTMLElement {
  const row = screen
    .getAllByTestId('day-track')
    .find((entry) => entry.getAttribute('data-attribute') === attribute);
  if (row === undefined) throw new Error(`no track ${attribute}`);
  return row;
}

function keyframeXs(attribute: string): string[] {
  return within(track(attribute))
    .getAllByTestId('day-keyframe')
    .map((line) => line.getAttribute('data-x') ?? '');
}

describe('the day strip (B626)', () => {
  it('draws each track across one period, and a keyframe edit moves the strip', async () => {
    const view = render(<Harness shown={timeline(SKY(6000))} />);
    await waitFor(() =>
      expect(track('minecraft:visual/sky_color').getAttribute('data-kind')).toBe('colour'),
    );
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'about_right',
    );
    expect(track('minecraft:visual/star_brightness').getAttribute('data-kind')).toBe('number');
    expect(keyframeXs('minecraft:visual/sky_color')).toEqual(['0', '25']);
    expect(within(track('minecraft:visual/sky_color')).getAllByTestId('day-swatch')).toHaveLength(
      2,
    );
    expect(screen.getByTestId('day-marker').getAttribute('data-x')).toBe('25');
    const before = track('minecraft:visual/star_brightness')
      .querySelector('polyline')
      ?.getAttribute('points');

    view.rerender(<Harness shown={timeline(SKY(12_000))} />);
    await waitFor(() => expect(keyframeXs('minecraft:visual/sky_color')).toEqual(['0', '50']));
    const after = track('minecraft:visual/star_brightness')
      .querySelector('polyline')
      ?.getAttribute('points');
    expect(after).not.toBe(before);
  });

  it('rescales by period_ticks', async () => {
    const view = render(<Harness shown={timeline(SKY(6000, 24_000))} />);
    await waitFor(() => expect(keyframeXs('minecraft:visual/sky_color')).toEqual(['0', '25']));
    expect(screen.getByTestId('day-period').getAttribute('data-span')).toBe('24000');

    view.rerender(<Harness shown={timeline(SKY(6000, 12_000))} />);
    await waitFor(() => expect(keyframeXs('minecraft:visual/sky_color')).toEqual(['0', '50']));
    expect(screen.getByTestId('day-period').getAttribute('data-span')).toBe('12000');
    expect(screen.getByTestId('day-marker').getAttribute('data-x')).toBe('50');
    expect(screen.getByTestId('day-scrubber').getAttribute('max')).toBe('11999');
  });

  it('names a value type the strip cannot draw', async () => {
    render(
      <Harness
        shown={timeline({
          clock: 'minecraft:overworld',
          period_ticks: 24_000,
          tracks: {
            'minecraft:audio/ambient_sounds': {
              keyframes: [{ ticks: 0, value: { loop: 'minecraft:ambient.cave' } }],
            },
            'minecraft:visual/fog_color': {
              modifier: 'blend_to_gray',
              keyframes: [{ ticks: 0, value: { brightness: 0.5, factor: 1 } }],
            },
            'demo:made_up': { keyframes: [{ ticks: 0, value: 1 }] },
          },
        })}
      />,
    );
    await waitFor(() => expect(screen.getAllByTestId('day-undrawable')).toHaveLength(3));
    const lines = screen.getAllByTestId('day-undrawable').map((line) => line.textContent);
    expect(lines).toContain(
      'The strip cannot draw audio/ambient_sounds: its value is a structured value (loop, mood, additions).',
    );
    expect(lines).toContain(
      'The strip cannot draw visual/fog_color: its value under the modifier blend_to_gray is a structured value (brightness, factor).',
    );
    expect(lines).toContain(
      'The strip cannot draw demo:made_up: it is not an environment attribute of mc-26.3.',
    );
    expect(screen.getByTestId('live-view-notes').textContent).toContain(
      'Not drawn: audio/ambient_sounds',
    );
  });

  it('moves now with the scrubber, and the sampled value follows', async () => {
    render(<Harness shown={timeline(SKY(12_000))} />);
    await waitFor(() => track('minecraft:visual/star_brightness'));
    fireEvent.change(screen.getByTestId('day-scrubber'), { target: { value: '6000' } });
    await waitFor(() => expect(screen.getByTestId('day-now').getAttribute('data-x')).toBe('25'));
    expect(
      within(track('minecraft:visual/star_brightness')).getByTestId('day-now-value').textContent,
    ).toBe('0.5');
    expect(
      within(track('minecraft:visual/sky_color')).getByTestId('day-now-value').textContent,
    ).toBe('#808080');
    expect(screen.getByRole('button', { name: 'Play' })).toBeDefined();
  });

  it('plays: the now marker moves by itself', async () => {
    render(<Harness shown={timeline(SKY(12_000))} />);
    const scrubber = () => screen.getByTestId('day-scrubber') as HTMLInputElement;
    const first = Number(scrubber().value);
    await waitFor(() => expect(Number(scrubber().value)).toBeGreaterThan(first));
  });

  it('draws the timelines tied to a world clock, the project’s and Minecraft’s', async () => {
    const vanilla: VanillaDataReader = {
      ...NOT_SET_UP_VANILLA_DATA,
      mcVersion: '26.3',
      folder: async (folder) => ({
        status: 'ready',
        version: '26.3',
        files:
          folder === 'timeline'
            ? {
                'minecraft:fake_other': { clock: 'minecraft:the_end', tracks: {} },
                'minecraft:fake_shared': SKY(3000) as Record<string, Json>,
              }
            : {},
      }),
    };
    const clock = element('demo:my_clock', 'minecraft:world_clock', {});
    const tied = element('demo:tied', 'minecraft:timeline', {
      ...(SKY(6000, 48_000) as Record<string, Json>),
      clock: 'demo:my_clock',
    });
    render(<Harness shown={clock} others={[tied]} vanilla={vanilla} />);
    await waitFor(() => expect(screen.getAllByTestId('day-timeline')).toHaveLength(1));
    expect(screen.getByTestId('day-timeline').getAttribute('data-id')).toBe('demo:tied');
    expect(screen.getByTestId('day-period').getAttribute('data-span')).toBe('48000');
    cleanup();

    const overworld = element('minecraft:overworld', 'minecraft:world_clock', {});
    render(<Harness shown={overworld} vanilla={vanilla} />);
    await waitFor(() => expect(screen.getAllByTestId('day-timeline')).toHaveLength(1));
    expect(screen.getByTestId('day-timeline').getAttribute('data-id')).toBe(
      'minecraft:fake_shared',
    );
    cleanup();

    render(<Harness shown={overworld} />);
    await waitFor(() => expect(screen.getByTestId('live-view-set-up')).toBeDefined());
    expect(screen.getByTestId('day-no-timelines')).toBeDefined();
  });
});
