// @vitest-environment happy-dom
import type { TargetFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBar } from '../../src/renderer/src/components/StatusBar';
import type { SessionSnapshot } from '../../src/renderer/src/session/project-session';

afterEach(cleanup);

const base = builtInTargets[0]?.target as TargetFacts;
const snapshot = (open: boolean): SessionSnapshot =>
  ({
    root: open ? '/projects/demo' : null,
    project: open ? ({ targets: ['mc-1.0'] } as never) : null,
    dirty: false,
    canUndo: false,
    canRedo: false,
    problems: [],
  }) as unknown as SessionSnapshot;

describe('StatusBar project target', () => {
  it('shows a release target id without a badge', () => {
    render(
      <StatusBar
        snapshot={snapshot(true)}
        target={{ ...base, id: 'mc-1.0', channel: 'release' }}
      />,
    );
    expect(screen.getByTestId('project-target').textContent).toBe('mc-1.0');
    expect(screen.queryByTestId('project-target-snapshot')).toBeNull();
  });

  it('adds the snapshot badge for a snapshot target', () => {
    render(
      <StatusBar
        snapshot={snapshot(true)}
        target={{ ...base, id: 'mc-2.0', channel: 'snapshot' }}
      />,
    );
    expect(screen.getByTestId('project-target').textContent).toBe('mc-2.0snapshot');
    expect(screen.getByTestId('project-target-snapshot').textContent).toBe('snapshot');
  });

  it('shows no target without a project', () => {
    render(<StatusBar snapshot={snapshot(false)} target={{ ...base, id: 'mc-1.0' }} />);
    expect(screen.queryByTestId('project-target')).toBeNull();
  });
});
