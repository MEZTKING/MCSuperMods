// @vitest-environment happy-dom
/**
 * The function's live view (B613): each line with its mark in the frame (the Preview tag, about
 * right), the summary, the project's load and tick tags that make Try it run it by itself, and
 * the marks following an edit to the element.
 */
import type { Element, Project } from '@msm/plugin-api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FunctionLines, {
  selfRuns,
} from '../../../../../src/renderer/src/liveviews/data/function/FunctionLines';
import type { LiveViewProps } from '../../../../../src/renderer/src/liveviews/registry';
import { liveViewComponent } from '../../../../../src/renderer/src/liveviews/registry';
import { NOT_SET_UP_VANILLA_DATA } from '../../../../../src/renderer/src/liveviews/vanilla-data';

afterEach(cleanup);

const fn = (lines: string[]): Element =>
  ({ id: 'demo:start', kind: 'minecraft:function', data: { lines } }) as unknown as Element;

const load: Element = {
  id: 'minecraft:load',
  kind: 'minecraft:tag/function',
  data: { values: ['demo:start'] },
} as unknown as Element;

const projectWith = (...elements: Element[]): Project =>
  ({
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ name: 'demo', assets: [], elements }],
    targets: [],
    plugins: [],
    settings: {},
  }) as unknown as Project;

function props(element: Element, project: Project): LiveViewProps {
  return {
    project,
    element,
    vanilla: NOT_SET_UP_VANILLA_DATA,
    vanillaAssets: null,
    preferences: {},
    onPreferences: vi.fn(),
    onSetup: vi.fn(),
  } as unknown as LiveViewProps;
}

describe('the function view', () => {
  it('is the registry’s view of a function', () => {
    expect(liveViewComponent('minecraft:function')).not.toBeNull();
  });

  it('marks each line in the frame and names what Try it runs by itself', async () => {
    const element = fn(['say hi', 'locate structure minecraft:village_plains', '# a comment']);
    render(<FunctionLines {...props(element, projectWith(element, load))} />);
    await waitFor(() =>
      expect(screen.getByTestId('function-view-summary').textContent).toBe(
        'Runs in Try it: 1 of 2 lines.',
      ),
    );
    expect(screen.getByTestId('live-view-tag').textContent).toBe('Preview');
    expect(screen.getByTestId('live-view-fidelity').dataset.fidelity).toBe('about_right');
    const rows = screen.getAllByTestId('function-view-line');
    expect(rows.map((row) => row.dataset.runs)).toEqual(['true', 'false', undefined]);
    expect(rows[1]?.textContent).toContain('Only in the game: Try it does not run /locate.');
    expect(screen.getByTestId('function-view-self-run').textContent).toBe(
      'Try it runs it by itself when Try it starts and after you change a function (#minecraft:load).',
    );
    expect(screen.getByTestId('live-view-notes').textContent).toContain('/function demo:start');
  });

  it('follows an edit to the element', async () => {
    const project = projectWith();
    const view = render(<FunctionLines {...props(fn(['say hi']), project)} />);
    await waitFor(() =>
      expect(screen.getByTestId('function-view-summary').textContent).toBe(
        'Runs in Try it: every line (1).',
      ),
    );
    view.rerender(
      <FunctionLines
        {...props(fn(['say hi', 'locate structure minecraft:village_plains']), project)}
      />,
    );
    await waitFor(
      () =>
        expect(screen.getByTestId('function-view-summary').textContent).toBe(
          'Runs in Try it: 1 of 2 lines.',
        ),
      { timeout: 1000 },
    );
  });

  it('finds the load and tick tags that name the function', () => {
    const tick = {
      id: 'minecraft:tick',
      kind: 'minecraft:tag/function',
      data: { values: [{ id: 'demo:start', required: false }] },
    } as unknown as Element;
    expect(selfRuns(projectWith(load, tick), 'demo:start')).toHaveLength(2);
    expect(selfRuns(projectWith(load), 'demo:other')).toEqual([]);
  });
});
