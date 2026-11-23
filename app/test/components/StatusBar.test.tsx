// @vitest-environment happy-dom
import type { TargetFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBar, thingsToFixWords } from '../../src/renderer/src/components/StatusBar';
import type { SessionSnapshot } from '../../src/renderer/src/session/project-session';

afterEach(cleanup);

const base = builtInTargets[0]?.target as TargetFacts;
const snapshot = (open: boolean, more: Partial<SessionSnapshot> = {}): SessionSnapshot =>
  ({
    root: open ? '/projects/demo' : null,
    project: open ? ({ name: 'Ruby Tools', targets: ['mc-1.0'] } as never) : null,
    dirty: false,
    canUndo: false,
    canRedo: false,
    problems: [],
    ...more,
  }) as unknown as SessionSnapshot;

describe('StatusBar project target', () => {
  it('shows a release target in words without a badge', () => {
    render(
      <StatusBar
        snapshot={snapshot(true)}
        target={{ ...base, id: 'mc-1.0', mcVersion: '1.0', channel: 'release' }}
      />,
    );
    expect(screen.getByTestId('project-target').textContent).toBe('For Minecraft 1.0');
    expect(screen.queryByTestId('project-target-snapshot')).toBeNull();
  });

  it('adds the snapshot badge for a snapshot target', () => {
    render(
      <StatusBar
        snapshot={snapshot(true)}
        target={{ ...base, id: 'mc-2.0', mcVersion: '2.0-snapshot-1', channel: 'snapshot' }}
      />,
    );
    expect(screen.getByTestId('project-target').textContent).toBe(
      'For Minecraft 2.0-snapshot-1snapshot',
    );
    expect(screen.getByTestId('project-target-snapshot').textContent).toBe('snapshot');
  });

  it('shows no target without a project', () => {
    render(<StatusBar snapshot={snapshot(false)} target={{ ...base, id: 'mc-1.0' }} />);
    expect(screen.queryByTestId('project-target')).toBeNull();
  });
});

describe('StatusBar in plain words', () => {
  it('names the mod, says whether it is saved and how many things to fix', () => {
    const problem = (severity: string) => ({ severity, code: 'x', message: 'x' });
    const { rerender } = render(<StatusBar snapshot={snapshot(true)} />);
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toBe('Ruby ToolsSaved');
    expect(footer.textContent).not.toContain('/projects/demo');
    rerender(
      <StatusBar
        snapshot={snapshot(true, {
          dirty: true,
          undoLabel: 'Edit demo:ruby_sword',
          problems: [problem('error'), problem('warning'), problem('info')] as never,
        })}
      />,
    );
    expect(screen.getByText('Not saved yet')).toBeTruthy();
    expect(screen.getByText('Undo: Edit ruby sword')).toBeTruthy();
    expect(screen.getByTestId('status-things-to-fix').textContent).toBe('2 things to fix');
  });

  it('says nothing about things to fix when there are none', () => {
    render(<StatusBar snapshot={snapshot(false)} />);
    expect(screen.queryByTestId('status-things-to-fix')).toBeNull();
    expect(screen.getByRole('contentinfo').textContent).toBe('No mod is open');
    expect(thingsToFixWords(0)).toBeNull();
    expect(thingsToFixWords(1)).toBe('1 thing to fix');
    expect(thingsToFixWords(4)).toBe('4 things to fix');
  });
});
