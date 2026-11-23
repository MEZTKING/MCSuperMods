// @vitest-environment happy-dom

/**
 * The assembly view (B640) over the real structures worker host and `@msm/terrain`'s assembler
 * in this thread: Step adds one piece and lists it, a pool edit assembles again within the
 * budget, a refused piece shows its reason, a structure that is not a jigsaw structure says 4L2,
 * without WebGL only the step list shows, and Very easy shows no ids. MSM's own made-up pools.
 */

import type { Element, Project } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { forbiddenIn } from '../../../../src/renderer/src/components/ai/ai-words';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import { STRUCTURES_VIEWS } from '../../../../src/renderer/src/liveviews/structures';
import AssemblyView, {
  ASSEMBLY_DEBOUNCE_MS,
} from '../../../../src/renderer/src/liveviews/structures/assembly/AssemblyView';
import {
  BUILDING_LINE,
  NO_WEBGL_LINE,
  NOT_JIGSAW_LINE,
  REFUSAL_WORDS,
} from '../../../../src/renderer/src/liveviews/structures/assembly/steps';
import {
  createVanillaDataReader,
  NOT_SET_UP_VANILLA_DATA,
} from '../../../../src/renderer/src/liveviews/vanilla-data';
import { DEFAULT_PREFS } from '../../../../src/renderer/src/liveviews/view-prefs';
import { arm, cross, element, hub, hubProject, pool, projectOf } from './assembly-fixtures';

const webgl = vi.hoisted(() => ({ on: false }));

vi.mock('../../../../src/renderer/src/preview/webgl', () => ({ hasWebGL: () => webgl.on }));

vi.mock('../../../../src/renderer/src/preview/PreviewCanvas', () => ({
  default: (props: { subject: { data: { blocks: unknown[] } } }) => (
    <div data-testid="fake-canvas" data-blocks={props.subject.data.blocks.length} />
  ),
}));

vi.mock(
  '../../../../src/renderer/src/liveviews/structures/assembly/client',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/renderer/src/liveviews/structures/assembly/client')
      >();
    let client: InstanceType<typeof actual.AssemblyClient> | null = null;
    return {
      ...actual,
      sharedAssemblyClient: () => {
        client ??= new actual.AssemblyClient({
          createWorker: async () => (await import('./assembly-fixtures')).hostWorker(),
        });
        return client;
      },
    };
  },
);

beforeAll(async () => {
  // The engine and the lazy chunks load once, before anything is timed.
  await import('@msm/terrain');
  await STRUCTURES_VIEWS['minecraft:worldgen/template_pool']?.();
}, 60_000);

afterEach(() => {
  cleanup();
  webgl.on = false;
});

interface Shown {
  rerender(next: { project?: Project; element?: Element }): void;
}

function show(project: Project, shown: Element, vanilla = NOT_SET_UP_VANILLA_DATA): Shown {
  let state = { project, element: shown };
  const props = (): LiveViewProps => ({
    project: state.project,
    element: state.element,
    vanilla,
    vanillaAssets: null,
    preferences: DEFAULT_PREFS,
    onPreferences: () => {},
    onSetup: () => {},
  });
  const view = render(<AssemblyView {...props()} />);
  return {
    rerender(next) {
      state = { ...state, ...next };
      view.rerender(<AssemblyView {...props()} />);
    },
  };
}

const count = () => screen.getByTestId('assembly-count').textContent ?? '';
const placedLines = () =>
  screen
    .queryAllByTestId('assembly-step')
    .filter((item) => item.dataset.kind === 'placed')
    .map((item) => item.textContent ?? '');

async function untilDone(text = '2 of 2 pieces'): Promise<void> {
  await waitFor(() => expect(count()).toBe(text), { timeout: 5000 });
}

describe('the assembly view', () => {
  it('assembles a pool, and Step adds one piece and lists it', async () => {
    const project = hubProject();
    show(project, project.namespaces[0]?.elements[0] as Element);
    await untilDone();
    expect(placedLines()).toHaveLength(2);
    fireEvent.click(screen.getByTestId('assembly-start-over'));
    expect(count()).toBe('1 of 2 pieces');
    expect(placedLines()).toHaveLength(1);
    expect(placedLines()[0]).toContain('the start piece');
    fireEvent.click(screen.getByTestId('assembly-step-button'));
    expect(count()).toBe('2 of 2 pieces');
    const lines = placedLines();
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Piece 2: Arm, joined to piece 1');
    expect(lines[1]).toContain('the two jigsaw blocks that met are lit');
    expect((screen.getByTestId('assembly-step-button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('live-view-notes').textContent).toContain(BUILDING_LINE);
  });

  it('assembles again within the budget after a pool edit', async () => {
    const project = hubProject();
    const start = project.namespaces[0]?.elements[0] as Element;
    const shown = show(project, start);
    await untilDone();
    // The pool's arms now come from another pool, with another piece.
    const edited = projectOf(
      start,
      pool('demo:arms', 'demo:arm'),
      pool('demo:arms_two', 'demo:arm_two'),
      hub('demo:arms_two'),
      arm(),
      arm('demo:arm_two'),
    );
    const began = performance.now();
    act(() => shown.rerender({ project: edited }));
    await waitFor(() => expect(placedLines().join(' ')).toContain('Arm Two'), { timeout: 5000 });
    const ms = performance.now() - began;
    // The view waits 150 ms for edits to stop; the assembler itself takes a few milliseconds.
    // A generous margin for a loaded test machine (ADR 0122 D10's budget is 250 ms for the
    // first pieces).
    expect(ms).toBeGreaterThanOrEqual(ASSEMBLY_DEBOUNCE_MS - 20);
    expect(ms).toBeLessThan(ASSEMBLY_DEBOUNCE_MS + 1500);
  });

  it('shows a refused piece with its reason', async () => {
    const project = projectOf(
      pool('demo:start', 'demo:hub'),
      pool('demo:arms', 'demo:wall'),
      hub(),
      arm('demo:wall', 'demo:wall_in'),
    );
    show(project, project.namespaces[0]?.elements[0] as Element);
    await untilDone('1 of 1 pieces');
    const refused = screen
      .getAllByTestId('assembly-step')
      .find((item) => item.dataset.kind === 'refused');
    expect(refused?.dataset.reason).toBe('no_matching_jigsaw');
    expect(refused?.textContent).toContain('Wall');
    expect(refused?.textContent).toContain(REFUSAL_WORDS.no_matching_jigsaw);
  });

  it('assembles a jigsaw structure, and says 4L2 for any other type', async () => {
    const project = hubProject();
    const castle = element('demo:castle', 'minecraft:worldgen/structure', {
      type: 'minecraft:jigsaw',
      start_pool: 'demo:start',
      size: 2,
      start_height: { absolute: 0 },
      max_distance_from_center: 80,
    });
    show(projectOf(...(project.namespaces[0]?.elements ?? []), castle), castle);
    await untilDone();
    cleanup();
    const igloo = element('demo:igloo', 'minecraft:worldgen/structure', {
      type: 'minecraft:igloo',
    });
    show(projectOf(igloo), igloo);
    expect(screen.getByTestId('assembly-not-jigsaw').textContent).toBe(NOT_JIGSAW_LINE);
    expect(screen.getByTestId('live-view-fidelity').dataset.fidelity).toBe('only_in_game');
    expect(screen.queryByTestId('assembly-steps')).toBeNull();
  });

  it('shows the step list alone without WebGL, and the 3D view with it', async () => {
    const project = hubProject();
    show(project, project.namespaces[0]?.elements[0] as Element);
    await untilDone();
    expect(screen.queryByTestId('assembly-canvas')).toBeNull();
    expect(screen.getByTestId('assembly-steps')).toBeTruthy();
    expect(screen.getByTestId('live-view-notes').textContent).toContain(NO_WEBGL_LINE);
    cleanup();
    webgl.on = true;
    show(project, project.namespaces[0]?.elements[0] as Element);
    await untilDone();
    await waitFor(() => expect(screen.getByTestId('fake-canvas')).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByTestId('live-view-notes').textContent).not.toContain(NO_WEBGL_LINE);
  });

  it('shows no ids in Very easy', async () => {
    const project = projectOf(
      pool('demo:start', 'demo:hub'),
      pool('demo:arms', 'demo:arm', 'demo:wall'),
      hub(),
      arm(),
      arm('demo:wall', 'demo:wall_in'),
    );
    show(project, project.namespaces[0]?.elements[0] as Element);
    await waitFor(() => expect(count()).toMatch(/^2 of 2 pieces$/), { timeout: 5000 });
    const view = screen.getByTestId('live-view');
    const texts: string[] = [view.textContent ?? ''];
    for (const node of view.querySelectorAll('*')) {
      for (const name of ['title', 'aria-label', 'placeholder', 'alt', 'value']) {
        const value = node.getAttribute(name);
        if (value !== null) texts.push(value);
      }
    }
    expect(texts.flatMap((text) => forbiddenIn(text))).toEqual([]);
    expect(view.textContent).toContain('Arm');
  });

  it('says it needs the Minecraft folder for Minecraft’s own pieces', async () => {
    const project = projectOf(pool('demo:start', 'demo:hub'), hub('minecraft:made_up/arms'));
    show(project, project.namespaces[0]?.elements[0] as Element);
    await waitFor(() => expect(screen.getByTestId('live-view-set-up')).toBeTruthy(), {
      timeout: 5000,
    });
    cleanup();
    // With the folder set up but no such pool, the piece is refused and no banner shows.
    const vanilla = createVanillaDataReader({
      mcVersion: '9.1',
      read: async (version, folders) => ({
        version,
        folders: Object.fromEntries(folders.map((folder) => [folder, {}])),
        fileCount: 0,
      }),
    });
    show(project, project.namespaces[0]?.elements[0] as Element, vanilla);
    await untilDone('1 of 1 pieces');
    expect(screen.queryByTestId('live-view-set-up')).toBeNull();
  });

  it('stops at 500 pieces, and the limit can be raised', async () => {
    const project = projectOf(
      pool('demo:start', 'demo:cross'),
      pool('demo:grid', 'demo:cross'),
      cross(),
    );
    show(project, project.namespaces[0]?.elements[0] as Element);
    fireEvent.change(screen.getByTestId('assembly-depth'), { target: { value: '20' } });
    await waitFor(
      () =>
        expect(screen.getByTestId('assembly-stopped').textContent).toContain(
          'Stopped at 500 pieces.',
        ),
      {
        timeout: 10_000,
      },
    );
    fireEvent.click(screen.getByTestId('assembly-raise-limit'));
    await waitFor(() => expect(screen.queryByTestId('assembly-stopped')).toBeNull(), {
      timeout: 10_000,
    });
    await waitFor(() => expect(count()).toMatch(/^(\d+) of \1 pieces$/), { timeout: 10_000 });
    expect(Number(count().split(' ')[0])).toBeGreaterThan(500);
  }, 30_000);
});
