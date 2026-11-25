// @vitest-environment happy-dom
/**
 * The Function editor's Try it marks (B613, ADR 0120 D8): every line not run has a mark with plain
 * words, the summary under the editor, the marks following an edit within the gutter's budget,
 * and Run in Try it (with the macro values box) opening Try it with the run waiting for its area.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lineMarks,
  marksSummary,
  ONLY_WORDS,
  RUNS_WORDS,
} from '../../../src/renderer/src/components/function-editor/line-marks';
import { markLines } from '../../../src/renderer/src/components/function-editor/line-support';
import {
  runInTryIt,
  takeFunctionRuns,
} from '../../../src/renderer/src/components/function-editor/run-in-tryit';
import {
  LINE_MARKS_DEBOUNCE_MS,
  loadLineReader,
} from '../../../src/renderer/src/components/function-editor/use-line-marks';
import { useUiStore } from '../../../src/renderer/src/store/ui-store';
import { FunctionEditor } from '../../../src/renderer/src/studios/FunctionEditor';
import { useTryItStore } from '../../../src/renderer/src/tryit/tryit-store';

beforeEach(async () => {
  window.msmNoMonaco = true;
  await loadLineReader();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.msmNoMonaco;
  takeFunctionRuns();
});

const LINES = [
  '# Starts the game',
  'scoreboard objectives add lv dummy',
  'locate biome minecraft:plains',
  'give @s',
  '',
  'execute as @a run say \\',
  '  hello',
  '$say $(word)',
];

describe('the marks of each line', () => {
  it('marks every command line, with plain words for the lines Try it does not run', () => {
    const marks = markLines(LINES);
    expect(marks.map((mark) => [mark.line, mark.runs])).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [5, true],
      [6, true],
      [7, true],
    ]);
    expect(marks[0]?.words).toBe(RUNS_WORDS);
    expect(marks[1]?.words).toBe(`${ONLY_WORDS}: Try it does not run /locate.`);
    expect(marks[2]?.words).toBe(
      `${ONLY_WORDS}: the game would not read this line (Expected an item).`,
    );
    expect(marks[4]).toMatchObject({ continues: 5, words: `Part of line 6: ${RUNS_WORDS}` });
    expect(marks[5]).toMatchObject({ macro: true });
    expect(marksSummary(marks)).toEqual({ runs: 3, lines: 5 });
  });

  it('takes any reader (no simulation needed to mark)', () => {
    const marks = lineMarks(['a', 'b'], {
      support: (line) =>
        line === 'a' ? { runs: true, command: 'a' } : { runs: false, command: 'b' },
      kind: () => 'game',
    });
    expect(marks.map((mark) => mark.words)).toEqual([RUNS_WORDS, ONLY_WORDS]);
  });
});

function area(): HTMLTextAreaElement {
  return screen.getByTestId('function-editor-fallback') as HTMLTextAreaElement;
}

describe('the gutter and the summary', () => {
  it('draws a mark beside every command line and lists the lines not run', async () => {
    render(<FunctionEditor lines={LINES} onChange={vi.fn()} functionId="demo:start" />);
    await waitFor(() => expect(screen.getAllByTestId('function-line-mark')).toHaveLength(6));
    const marks = screen.getAllByTestId('function-line-mark');
    expect(marks.map((mark) => [mark.dataset.line, mark.dataset.runs])).toEqual([
      ['1', 'true'],
      ['2', 'false'],
      ['3', 'false'],
      ['5', 'true'],
      ['6', 'true'],
      ['7', 'true'],
    ]);
    expect(marks[1]?.getAttribute('title')).toBe(`${ONLY_WORDS}: Try it does not run /locate.`);
    expect(screen.getByTestId('function-run-summary').textContent).toBe(
      'Runs in Try it: 3 of 5 lines. The rest are said in What happened.',
    );
    const notRun = screen.getByTestId('function-not-run');
    expect(notRun.textContent).toContain('Line 3: Only in the game: Try it does not run /locate.');
    expect(notRun.textContent).toContain('Line 4: Only in the game');
  });

  it('follows an edit within the gutter’s budget', async () => {
    render(<FunctionEditor lines={['say hi']} onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('function-line-mark')).toHaveLength(1));
    vi.useFakeTimers();
    fireEvent.change(area(), { target: { value: 'say hi\nlocate biome minecraft:plains' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LINE_MARKS_DEBOUNCE_MS);
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getAllByTestId('function-line-mark')).toHaveLength(2));
    expect(screen.getAllByTestId('function-line-mark')[1]?.dataset.runs).toBe('false');
    expect(screen.getByTestId('function-run-summary').dataset.runs).toBe('1');
  });

  it('has no Run in Try it without the function’s id', async () => {
    render(<FunctionEditor lines={['say hi']} onChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('function-run-summary').textContent).toBe(
        'Runs in Try it: every line (1).',
      ),
    );
    expect(screen.queryByTestId('function-run-in-tryit')).toBeNull();
  });
});

describe('Run in Try it', () => {
  it('runs the function with the macro values typed', async () => {
    const onRun = vi.fn();
    render(
      <FunctionEditor
        lines={['$say $(word)']}
        onChange={vi.fn()}
        functionId="demo:greet"
        onRunInTryIt={onRun}
      />,
    );
    const values = await screen.findByTestId('function-run-values');
    fireEvent.change(values, { target: { value: '{word:"hi"}' } });
    fireEvent.click(screen.getByTestId('function-run-in-tryit'));
    expect(onRun).toHaveBeenCalledWith('demo:greet', '{word:"hi"}');
  });

  it('by default leaves the element, opens Try it and leaves the run for its area', async () => {
    useTryItStore.getState().close();
    const select = vi.spyOn(useUiStore.getState(), 'select');
    render(<FunctionEditor lines={['say hi']} onChange={vi.fn()} functionId="demo:hello" />);
    fireEvent.click(await screen.findByTestId('function-run-in-tryit'));
    expect(select).toHaveBeenCalledWith(null);
    expect(useTryItStore.getState().open).toBe(true);
    expect(takeFunctionRuns()).toEqual([{ id: 'demo:hello' }]);
    expect(takeFunctionRuns()).toEqual([]);
    useTryItStore.getState().close();
    select.mockRestore();
  });

  it('keeps macro values and drops empty ones', () => {
    runInTryIt('demo:a', '  ');
    runInTryIt('demo:b', ' {n:1} ');
    expect(takeFunctionRuns()).toEqual([{ id: 'demo:a' }, { id: 'demo:b', values: '{n:1}' }]);
    useTryItStore.getState().close();
  });
});
