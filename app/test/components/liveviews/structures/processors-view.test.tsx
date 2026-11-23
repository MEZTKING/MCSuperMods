// @vitest-environment happy-dom

/**
 * The processor view (B641) over the real processors host and `@msm/terrain` in this thread:
 * each processor's count and level, the swipe line, the seed, an edit to the list redrawing (the
 * time measured), the building picker, a refused list, no buildings, without WebGL, and plain
 * words (no ids) until More options is open. MSM's own made-up buildings and lists.
 */

import type { Element, Project } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { forbiddenIn } from '../../../../src/renderer/src/components/ai/ai-words';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import { STRUCTURES_VIEWS } from '../../../../src/renderer/src/liveviews/structures';
import ProcessorListView, {
  NO_TEMPLATE_LINE,
  NO_WEBGL_LINE,
  PROCESSORS_DEBOUNCE_MS,
  SEED_LINE,
} from '../../../../src/renderer/src/liveviews/structures/processors/ProcessorListView';
import { NOT_SET_UP_VANILLA_DATA } from '../../../../src/renderer/src/liveviews/vanilla-data';
import {
  DEFAULT_PREFS,
  type LiveViewPrefs,
} from '../../../../src/renderer/src/liveviews/view-prefs';
import {
  element,
  hut,
  LIST,
  mossList,
  pool,
  projectOf,
  randomList,
  refusedList,
} from './processors-fixtures';

const webgl = vi.hoisted(() => ({ on: false }));

vi.mock('../../../../src/renderer/src/preview/webgl', () => ({ hasWebGL: () => webgl.on }));

vi.mock('../../../../src/renderer/src/preview/PreviewCanvas', () => ({
  default: (props: { subject: { data: { blocks: unknown[]; palette: string[] } } }) => (
    <div
      data-testid="fake-canvas"
      data-blocks={props.subject.data.blocks.length}
      data-palette={props.subject.data.palette.join(' ')}
    />
  ),
}));

vi.mock(
  '../../../../src/renderer/src/liveviews/structures/processors/client',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/renderer/src/liveviews/structures/processors/client')
      >();
    let client: InstanceType<typeof actual.ProcessorClient> | null = null;
    return {
      ...actual,
      sharedProcessorClient: () => {
        client ??= new actual.ProcessorClient({
          createWorker: async () => (await import('./processors-fixtures')).hostWorker(),
        });
        return client;
      },
    };
  },
);

beforeAll(async () => {
  await import('@msm/terrain');
  await STRUCTURES_VIEWS['minecraft:worldgen/processor_list']?.();
}, 60_000);

afterEach(() => {
  cleanup();
  webgl.on = false;
  window.msmMoreOptionsOpen = true;
});

interface Shown {
  rerender(next: { project?: Project; element?: Element; seed?: string }): void;
}

function show(project: Project, shown: Element): Shown {
  let state = { project, element: shown, prefs: DEFAULT_PREFS as LiveViewPrefs };
  const props = (): LiveViewProps => ({
    project: state.project,
    element: state.element,
    vanilla: NOT_SET_UP_VANILLA_DATA,
    vanillaAssets: null,
    preferences: state.prefs,
    onPreferences: (patch) => {
      state = { ...state, prefs: { ...state.prefs, ...patch } };
      view.rerender(<ProcessorListView {...props()} />);
    },
    onSetup: () => {},
  });
  const view = render(<ProcessorListView {...props()} />);
  return {
    rerender(next) {
      state = {
        ...state,
        ...(next.project === undefined ? {} : { project: next.project }),
        ...(next.element === undefined ? {} : { element: next.element }),
        ...(next.seed === undefined ? {} : { prefs: { ...state.prefs, seed: next.seed } }),
      };
      view.rerender(<ProcessorListView {...props()} />);
    },
  };
}

const changedText = () => screen.getByTestId('processors-changed').textContent ?? '';

async function untilChanged(text: string): Promise<void> {
  await waitFor(() => expect(changedText()).toBe(text), { timeout: 5000 });
}

describe('the processor view', () => {
  it('shows what each processor changed, and its level', async () => {
    const list = mossList();
    show(projectOf(hut(), list), list);
    await untilChanged('16 of 32 blocks changed');
    const row = screen.getByTestId('processors-rule-0');
    expect(row.dataset.fidelity).toBe('checked');
    expect(row.textContent).toContain('Swaps blocks by rules');
    expect(row.textContent).toContain('16 blocks changed');
    expect(row.textContent).toContain('As in the game, checked');
    expect(screen.getByTestId('live-view-fidelity').dataset.fidelity).toBe('checked');
  });

  it('says about right and gives the seed line for random processors; a new seed redraws', async () => {
    const list = randomList();
    const shown = show(projectOf(hut(), list), list);
    await waitFor(() => expect(screen.getByTestId('processors-rule-1')).toBeTruthy(), {
      timeout: 5000,
    });
    expect(screen.getByTestId('processors-rule-0').dataset.fidelity).toBe('checked');
    expect(screen.getByTestId('processors-rule-1').dataset.fidelity).toBe('about_right');
    expect(screen.getByTestId('live-view-fidelity').dataset.fidelity).toBe('about_right');
    expect(screen.getByTestId('live-view-notes').textContent).toContain(SEED_LINE);
    const counts = new Set<string>([changedText()]);
    for (const seed of ['2', '3', '4', '5', '6']) {
      shown.rerender({ seed });
      await waitFor(
        () => expect(screen.getByTestId('processors-ms').textContent).toMatch(/\d+ ms/),
        { timeout: 5000 },
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, PROCESSORS_DEBOUNCE_MS + 50));
      });
      counts.add(changedText());
    }
    expect(counts.size).toBeGreaterThan(1);
  });

  it('follows an edit to the list, and says how long it took', async () => {
    const list = mossList();
    const project = projectOf(hut(), list);
    const shown = show(project, list);
    await untilChanged('16 of 32 blocks changed');
    const edited = element(list.id, LIST, {
      processors: [
        {
          processor_type: 'minecraft:block_ignore',
          blocks: ['minecraft:cobblestone'],
        },
      ],
    });
    const began = performance.now();
    shown.rerender({ project: projectOf(hut(), edited), element: edited });
    await untilChanged('12 of 32 blocks changed');
    const took = performance.now() - began;
    // The debounce (100 ms) and the work; reported by the brief, not a pass line here.
    console.info(`processor view: an edit redrew in ${Math.round(took)} ms`);
    expect(screen.getByTestId('processors-rule-0').textContent).toContain('Leaves some blocks out');
  });

  it('draws the building cut by the swipe line', async () => {
    webgl.on = true;
    const list = mossList();
    show(projectOf(hut(), list), list);
    await untilChanged('16 of 32 blocks changed');
    const canvas = await screen.findByTestId('fake-canvas');
    expect(screen.getByTestId('processors-canvas').dataset.cut).toBe('2');
    expect(canvas.dataset.palette).toContain('minecraft:stone');
    expect(canvas.dataset.palette).toContain('minecraft:mossy_cobblestone');
    fireEvent.change(screen.getByTestId('processors-swipe'), { target: { value: '0' } });
    await waitFor(() =>
      expect(screen.getByTestId('fake-canvas').dataset.palette).not.toMatch(/minecraft:stone\b/),
    );
    fireEvent.change(screen.getByTestId('processors-swipe'), { target: { value: '4' } });
    await waitFor(() =>
      expect(screen.getByTestId('fake-canvas').dataset.palette).not.toContain('mossy'),
    );
  });

  it('without WebGL shows the counts and says so', async () => {
    const list = mossList();
    show(projectOf(hut(), list), list);
    await untilChanged('16 of 32 blocks changed');
    expect(screen.queryByTestId('processors-canvas')).toBeNull();
    expect(screen.getByTestId('live-view-notes').textContent).toContain(NO_WEBGL_LINE);
  });

  it('offers first the building a pool places with this list', async () => {
    const list = mossList();
    show(
      projectOf(hut('demo:a_hut'), hut('demo:b_hut'), list, pool('demo:p', 'demo:b_hut', list.id)),
      list,
    );
    const picker = (await screen.findByTestId('processors-template')) as HTMLSelectElement;
    expect(picker.value).toBe('demo:b_hut');
    expect(picker.options[0]?.textContent).toContain('placed with this list');
    fireEvent.change(picker, { target: { value: 'demo:a_hut' } });
    await waitFor(() =>
      expect(screen.getByTestId('processors-template-id').textContent).toContain('demo:a_hut'),
    );
    await untilChanged('16 of 32 blocks changed');
  });

  it('says the game refuses a list, and when the mod has no buildings', async () => {
    const wrong = refusedList();
    const shown = show(projectOf(hut(), wrong), wrong);
    expect(
      (await screen.findByTestId('processors-refused', {}, { timeout: 5000 })).textContent,
    ).toMatch(/refuses/);
    const list = mossList();
    shown.rerender({ project: projectOf(list), element: list });
    expect((await screen.findByTestId('processors-no-template')).textContent).toBe(
      NO_TEMPLATE_LINE,
    );
  });

  it('uses plain words, and shows ids only inside More options', async () => {
    window.msmMoreOptionsOpen = false;
    const list = mossList();
    show(projectOf(hut(), list, pool('demo:p', 'demo:hut', list.id)), list);
    await untilChanged('16 of 32 blocks changed');
    const view = screen.getByTestId('live-view');
    const outside = [...view.querySelectorAll('*')]
      .filter((node) => node.closest('[data-more-options]') === null && node.children.length === 0)
      .map((node) => node.textContent ?? '')
      .join(' ');
    expect(forbiddenIn(outside)).toEqual([]);
    fireEvent.click(screen.getByTestId('more-options-processors-view'));
    expect(screen.getByTestId('processors-template-id').textContent).toContain('demo:hut');
    expect(screen.getByTestId('processors-types').textContent).toContain('minecraft:rule');
  });
});
