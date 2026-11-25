// @vitest-environment happy-dom
import type { UpgradeReport } from '@msm/core';
import type { MigrationReport, TargetFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type MoveReport,
  problemsOfSeverity,
  type SavedMove,
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

/** A report with nothing in parts 1 to 3, from `from` to `to`. */
function emptyReport(from: string, to: string): UpgradeReport {
  return {
    from: { targetId: `mc-${from}`, mcVersion: from },
    to: { targetId: `mc-${to}`, mcVersion: to },
    changed: [],
    done: [],
    todo: [],
    players: {
      rows: [{ fact: 'minecraft', before: from, after: to, changed: from !== to }],
      changes: [],
      exports: [],
    },
    added: { total: 0, byKind: {} },
    inGame: { checks: [], standing: ['start-game', 'open-world'] },
    untouched: { total: 3, byArea: { ids: 3 } },
  };
}

/** The report of `report` above: part 2 from its changes, part 3 from its error. */
const upReport: UpgradeReport = {
  ...emptyReport('1.1', '2.0'),
  done: [
    {
      elementId: 'demo:a',
      kind: 'update',
      description: 'Renamed a field',
      details: [],
      changeIds: [],
    },
    {
      elementId: 'demo:b',
      kind: 'remove',
      description: 'Gone in this version',
      details: [],
      changeIds: [],
    },
  ],
  todo: [
    {
      id: 'todo:c',
      source: 'migration',
      problem: report.problems[0] as MigrationReport['problems'][number],
      check: 'manual',
    },
  ],
};

const moves: Record<string, MoveReport> = {
  'mc-2.0': { report: upReport, migration: report },
  'mc-1.0': { report: emptyReport('1.1', '1.0'), migration: { changes: [], problems: [] } },
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

  it("lists the other targets, shows the chosen one's report and moves with its dry run", async () => {
    const ask = vi.fn(async (id: string) => moves[id] as MoveReport);
    const onMove = vi.fn();
    render(
      <UpgradeTargetDialog
        currentTargetId="mc-1.1"
        targets={targets}
        report={ask}
        onMove={onMove}
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
    // The first other target is checked at once.
    expect(await within(dialog).findByTestId('upgrade-target-summary')).toBeTruthy();
    expect(ask).toHaveBeenCalledWith('mc-2.0', expect.any(AbortSignal));
    expect(within(dialog).getByTestId('upgrade-report-summary').textContent).toBe(
      '2 things change by themselves, 1 needs you.',
    );
    const changes = await within(dialog).findByTestId('upgrade-target-changes');
    // More options is open in component tests: the ids show.
    expect(changes.textContent).toContain('demo:b:');
    expect(changes.textContent).toContain('B is taken out of your mod for Minecraft 2.0.');
    expect(within(dialog).getByTestId('upgrade-todo-0-text').textContent).toBe(
      'C uses something Minecraft 2.0 no longer has.',
    );
    expect(within(dialog).getByTestId('upgrade-players-test-version')).toBeTruthy();
    expect(
      (within(dialog).getByTestId('upgrade-target-dialog-submit') as HTMLButtonElement).textContent,
    ).toBe('Move my mod to Minecraft 2.0');

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
    expect(onMove).toHaveBeenCalledWith('mc-1.0', moves['mc-1.0']);
  });

  it('is reached by keyboard: the versions, Show me and the move, each labelled', async () => {
    const onMove = vi.fn();
    const onShow = vi.fn();
    render(
      <UpgradeTargetDialog
        currentTargetId="mc-1.1"
        targets={targets}
        report={async (id) => moves[id] as MoveReport}
        onMove={onMove}
        onCancel={() => {}}
        onShow={onShow}
      />,
    );
    await screen.findByTestId('upgrade-report');
    // Each part is a region named by its heading; Show me names its thing.
    expect(screen.getByRole('region', { name: 'What you need to change' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show me C' })).toBeTruthy();
    const user = userEvent.setup();
    const submit = screen.getByTestId('upgrade-target-dialog-submit');
    for (let step = 0; step < 40 && document.activeElement !== submit; step += 1) {
      await user.tab();
    }
    expect(document.activeElement).toBe(submit);
    await user.keyboard('{Enter}');
    expect(onMove).toHaveBeenCalledWith('mc-2.0', moves['mc-2.0']);
  });

  it('shows a failed check and keeps the move disabled', async () => {
    render(
      <UpgradeTargetDialog
        currentTargetId="mc-1.1"
        targets={targets}
        report={async () => {
          throw new Error('broken hook');
        }}
        onMove={() => {}}
        onCancel={() => {}}
      />,
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not work out what moving your mod would change: broken hook',
    );
    expect((screen.getByTestId('upgrade-target-dialog-submit') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('says when there is no other target and closes with Not now', async () => {
    const onCancel = vi.fn();
    render(
      <UpgradeTargetDialog
        currentTargetId="mc-1.1"
        targets={[target('mc-1.1', 'release')]}
        report={async () => moves['mc-1.0'] as MoveReport}
        onMove={() => {}}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByTestId('upgrade-target-none')).toBeTruthy();
    await userEvent.setup().click(screen.getByText('Not now'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('asks again when the project changes, and waits for the new report to move (live)', async () => {
    let resolveSecond: ((move: MoveReport) => void) | null = null;
    const stale = Object.assign(new Error('The dry run was cancelled (stale).'), {
      name: 'DryRunCancelled',
      reason: 'stale',
    });
    const ask = vi
      .fn<(id: string, signal: AbortSignal) => Promise<MoveReport>>()
      .mockResolvedValueOnce(moves['mc-2.0'] as MoveReport)
      // The first ask after the edit meets a run cancelled by it: asked again.
      .mockRejectedValueOnce(stale)
      .mockImplementationOnce(
        () =>
          new Promise<MoveReport>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const props = {
      currentTargetId: 'mc-1.1',
      targets: [targets[0] as TargetFacts, targets[1] as TargetFacts],
      report: ask,
      onMove: vi.fn(),
      onCancel: () => {},
    };
    const { rerender } = render(<UpgradeTargetDialog {...props} project={null} />);
    expect((await screen.findByTestId('upgrade-report-summary')).textContent).toBe(
      '2 things change by themselves, 1 needs you.',
    );
    const submit = screen.getByTestId('upgrade-target-dialog-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    // A new project state: the old report stays, marked, and the move waits.
    rerender(
      <UpgradeTargetDialog
        {...props}
        project={{
          formatVersion: 1,
          name: 'Demo',
          targets: ['mc-1.1'],
          plugins: [],
          settings: {},
          namespaces: [],
        }}
      />,
    );
    expect(await screen.findByTestId('upgrade-report-checking')).toBeTruthy();
    expect(submit.disabled).toBe(true);
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(3));
    await act(async () => {
      resolveSecond?.({
        report: emptyReport('1.1', '2.0'),
        migration: { changes: [], problems: [] },
      });
    });
    expect(screen.getByTestId('upgrade-report-summary').textContent).toBe(
      'Nothing in your mod needs changing.',
    );
    expect(screen.getByTestId('upgrade-nothing').textContent).toBe(
      'Nothing in your mod needs changing for Minecraft 2.0: none of the 3 changes MCSuperMods knows about touches it.',
    );
    expect(submit.disabled).toBe(false);
  });

  it("reopens a saved move's report (What changed when I moved) with fixed items done", async () => {
    const saved: SavedMove[] = [
      {
        folder: '.msm/upgrades/mc-1.1-to-mc-2.0-x',
        from: { targetId: 'mc-1.1', mcVersion: '1.1' },
        to: { targetId: 'mc-2.0', mcVersion: '2.0' },
        movedAt: '2026-11-25T10:00:00.000Z',
        report: upReport,
        ticked: ['todo:c'],
      },
    ];
    render(
      <UpgradeTargetDialog
        currentTargetId="mc-2.0"
        targets={targets}
        project={{
          formatVersion: 1,
          name: 'Demo',
          targets: ['mc-2.0'],
          plugins: [],
          settings: {},
          namespaces: [],
        }}
        report={async () => moves['mc-1.0'] as MoveReport}
        loadSaved={async () => saved}
        onMove={() => {}}
        onCancel={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('upgrade-saved-0'));
    expect(screen.getByRole('heading', { name: 'What changed when I moved' })).toBeTruthy();
    expect(screen.getByTestId('upgrade-report-summary').textContent).toBe(
      'Moved from Minecraft 1.1 to 2.0 on 25 November 2026.',
    );
    expect(await screen.findByTestId('upgrade-part-done')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What MCSuperMods changed for you' })).toBeTruthy();
    // The item ticked by hand reads as done.
    expect(screen.getByTestId('upgrade-todo-0').getAttribute('data-done')).toBe('true');
    expect(screen.queryByTestId('upgrade-target-dialog-submit')).toBeNull();
    await user.click(screen.getByTestId('upgrade-saved-back'));
    expect(await screen.findByTestId('upgrade-target-dialog-submit')).toBeTruthy();
  });
});
