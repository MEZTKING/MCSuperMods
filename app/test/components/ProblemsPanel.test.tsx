// @vitest-environment happy-dom
import type { Problem } from '@msm/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemsPanel } from '../../src/renderer/src/components/ProblemsPanel';
import { useUiStore } from '../../src/renderer/src/store/ui-store';

afterEach(cleanup);

const schemaProblem: Problem = {
  severity: 'error',
  code: 'schema.type',
  elementId: 'demo:block/ruby_block',
  path: '/textures/all',
  message: 'Expected a string.',
};
const diskProblem: Problem = {
  severity: 'error',
  code: 'element.invalid-json',
  file: 'content/demo/model/broken.json',
  message: 'The file is not valid JSON.',
};
const exportProblem: Problem = {
  severity: 'error',
  code: 'export.schema',
  file: 'assets/demo/models/block/ruby_block.json',
  message: 'Lowered file is invalid.',
};

describe('ProblemsPanel', () => {
  it('navigates to the element and field of a schema problem', async () => {
    const onNavigate = vi.fn();
    render(<ProblemsPanel problems={[schemaProblem]} onNavigate={onNavigate} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Expected a string/ }));
    expect(onNavigate).toHaveBeenCalledWith(schemaProblem);
  });

  it('shows the file of an on-disk problem with a Reveal action', async () => {
    const onReveal = vi.fn();
    render(<ProblemsPanel problems={[diskProblem]} onReveal={onReveal} onNavigate={vi.fn()} />);
    expect(screen.getByText('content/demo/model/broken.json')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /not valid JSON/ })).toBeNull();
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: 'Reveal content/demo/model/broken.json in folder' }),
      );
    expect(onReveal).toHaveBeenCalledWith('content/demo/model/broken.json');
  });

  it('lists the last export separately, without Reveal for output files', () => {
    render(<ProblemsPanel problems={[]} exportProblems={[exportProblem]} onReveal={vi.fn()} />);
    const section = screen.getByRole('region', { name: 'Last export' });
    expect(within(section).getByText(exportProblem.file as string)).toBeTruthy();
    expect(within(section).queryByRole('button', { name: /Reveal/ })).toBeNull();
    expect(screen.getByText('No problems.')).toBeTruthy();
  });

  it('navigateTo selects the element, the Form tab and the pointer', () => {
    useUiStore.getState().setActiveTab('json');
    useUiStore.getState().navigateTo('demo:block/ruby_block', '/textures/all');
    const state = useUiStore.getState();
    expect(state.selectedId).toBe('demo:block/ruby_block');
    expect(state.selectedPointer).toBe('/textures/all');
    expect(state.activeTab).toBe('form');
  });
});

describe('ProblemsPanel Explain (ADR 0041 D8)', () => {
  it('offers Explain on each live problem when onExplain is given', async () => {
    const onExplain = vi.fn();
    render(
      <ProblemsPanel
        problems={[schemaProblem, diskProblem]}
        exportProblems={[exportProblem]}
        onExplain={onExplain}
      />,
    );
    await userEvent.setup().click(screen.getByTestId('problem-explain-1'));
    expect(onExplain).toHaveBeenCalledWith(diskProblem);
    expect(screen.getByTestId('problem-explain-0').textContent).toBe('Explain');
    // Export problems are output files, not project content.
    expect(
      within(screen.getByTestId('export-problems')).queryByRole('button', { name: /^Explain/ }),
    ).toBeNull();
  });

  it('hides Explain without onExplain', () => {
    render(<ProblemsPanel problems={[schemaProblem]} />);
    expect(screen.queryByTestId('problem-explain-0')).toBeNull();
  });
});
