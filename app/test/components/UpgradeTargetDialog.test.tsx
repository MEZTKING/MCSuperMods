// @vitest-environment happy-dom
import type { MigrationReport, TargetFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  problemsOfSeverity,
  UpgradeTargetDialog,
  upgradeSummary,
} from '../../src/renderer/src/components/UpgradeTargetDialog';

afterEach(cleanup);

const base = builtInTargets[0]?.target as TargetFacts;
const target = (id: string, channel: 'release' | 'snapshot'): TargetFacts => ({
  ...base,
  id,
  mcVersion: id.slice(3),
  channel,
});
const targets = [
  target('mc-2.0', 'snapshot'),
  target('mc-1.1', 'release'),
  target('mc-1.0', 'release'),
];

const report: MigrationReport = {
  changes: [
    { elementId: 'demo:a', description: 'Renamed a field', data: {} },
    { elementId: 'demo:b', description: 'Gone in this version', kind: 'remove' },
  ],
  problems: [
    { severity: 'error', code: 'target.removed-id', message: 'Removed id', elementId: 'demo:c' },
    { severity: 'warning', code: 'target.no-migration-path', message: 'Check by hand' },
    { severity: 'info', code: 'x.note', message: 'A note' },
  ],
};

describe('UpgradeTargetDialog', () => {
  it('summarises and groups a report', () => {
    expect(upgradeSummary(report)).toBe('2 changes, 3 problems.');
    expect(upgradeSummary({ changes: [report.changes[0] as never], problems: [] })).toBe(
      '1 change, 0 problems.',
    );
    expect(problemsOfSeverity(report, 'warning').map((problem) => problem.code)).toEqual([
      'target.no-migration-path',
    ]);
  });

  it('lists the other targets, previews the chosen one and upgrades with its report', async () => {
    const preview = vi.fn(async (id: string) =>
      id === 'mc-2.0' ? report : { changes: [], problems: [] },
    );
    const onUpgrade = vi.fn();
    render(
      <UpgradeTargetDialog
        currentTargetId="mc-1.1"
        targets={targets}
        preview={preview}
        onUpgrade={onUpgrade}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByTestId('upgrade-target-dialog');
    expect(within(dialog).queryByTestId('upgrade-target-mc-1.1')).toBeNull();
    expect(within(dialog).getByTestId('upgrade-target-mc-2.0-snapshot').textContent).toBe(
      'snapshot',
    );
    expect(within(dialog).queryByTestId('upgrade-target-mc-1.0-snapshot')).toBeNull();
    expect(within(dialog).getByTestId('upgrade-target-current').textContent).toBe('Minecraft 1.1');
    // The first other target is previewed at once.
    expect(await within(dialog).findByTestId('upgrade-target-summary')).toBeTruthy();
    expect(preview).toHaveBeenCalledWith('mc-2.0');
    expect(within(dialog).getByTestId('upgrade-target-changes').textContent).toContain(
      'demo:b: Gone in this version (removed)',
    );
    expect(within(dialog).getByTestId('upgrade-target-problems-error').textContent).toBe(
      'demo:c: Removed id',
    );
    expect(within(dialog).getByTestId('upgrade-target-problems-warning').textContent).toBe(
      'Check by hand',
    );
    expect(within(dialog).getByTestId('upgrade-target-problems-info').textContent).toBe('A note');

    const user = userEvent.setup();
    await user.click(within(dialog).getByTestId('upgrade-target-mc-1.0'));
    await waitFor(() =>
      expect(within(dialog).getByTestId('upgrade-target-summary').textContent).toBe(
        '0 changes, 0 problems.',
      ),
    );
    expect(within(dialog).getByTestId('upgrade-target-mc-1.0').getAttribute('aria-pressed')).toBe(
      'true',
    );
    await user.click(within(dialog).getByTestId('upgrade-target-dialog-submit'));
    expect(onUpgrade).toHaveBeenCalledWith('mc-1.0', { changes: [], problems: [] });
  });

  it('shows a failed preview and keeps Upgrade disabled', async () => {
    render(
      <UpgradeTargetDialog
        currentTargetId="mc-1.1"
        targets={targets}
        preview={async () => {
          throw new Error('broken hook');
        }}
        onUpgrade={() => {}}
        onCancel={() => {}}
      />,
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not preview the upgrade: broken hook',
    );
    expect((screen.getByTestId('upgrade-target-dialog-submit') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('says when there is no other target and cancels', async () => {
    const onCancel = vi.fn();
    render(
      <UpgradeTargetDialog
        currentTargetId="mc-1.1"
        targets={[target('mc-1.1', 'release')]}
        preview={async () => ({ changes: [], problems: [] })}
        onUpgrade={() => {}}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByTestId('upgrade-target-none')).toBeTruthy();
    await userEvent.setup().click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
