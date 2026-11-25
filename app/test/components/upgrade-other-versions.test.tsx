// @vitest-environment happy-dom
/**
 * Check on other versions and moving back in the report (ADR 0136 D7, B820): a row per
 * version from the dry run ("works as it is", "works after a move", "would break"), each
 * opening its report in the dialog and asked again when the project changes; a move back lists
 * first what cannot be put back, the things changed since the move, and, for a move up with no
 * record, the honest list, in plain words with ids only under More options; the export dialogs'
 * More options line opens the move dialog.
 */
import type { UpgradeReport } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExportFabricJarDialog } from '../../src/renderer/src/components/ExportFabricJarDialog';
import { ExportJavaProjectDialog } from '../../src/renderer/src/components/ExportJavaProjectDialog';
import {
  type MoveReport,
  UpgradeTargetDialog,
} from '../../src/renderer/src/components/UpgradeTargetDialog';
import {
  MoveBackLead,
  OtherVersions,
  versionStatus,
  versionStatusText,
} from '../../src/renderer/src/components/upgrade/OtherVersions';
import { changeSentence } from '../../src/renderer/src/components/upgrade/sentences';
import { expectPlain } from './plain-sweep';
import { DEFAULT_BLOCK, HILLS, next, openSampleWorldgen, release } from './upgrade-fixture';

beforeAll(() => {
  window.msmMoreOptionsOpen = false;
});
afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear();
});
afterAll(() => {
  window.msmMoreOptionsOpen = true;
});

type Opened = Awaited<ReturnType<typeof openSampleWorldgen>>;

/** The dialog over a session with B820's extras, as App mounts it. */
function dialogOf(opened: Opened, initialTargetId: string, onShow = vi.fn()) {
  const { session } = opened;
  const current = session.availableTargets.find((target) => target.id === session.target.id);
  const report = (id: string, signal: AbortSignal) => session.upgradeReport(id, { signal });
  return (
    <UpgradeTargetDialog
      currentTargetId={session.target.id}
      targets={session.availableTargets as TargetFacts[]}
      project={session.snapshot.project}
      problems={session.snapshot.problems}
      report={report}
      initialTargetId={initialTargetId}
      onMove={vi.fn()}
      onCancel={vi.fn()}
      onShow={onShow}
      extras={(targetId, move, { choose }) => ({
        ...(move.inverted === undefined
          ? {}
          : {
              lead: (
                <MoveBackLead inverted={move.inverted} fromVersion={current?.mcVersion ?? ''} />
              ),
            }),
        after: (
          <OtherVersions
            currentTargetId={session.target.id}
            targets={session.availableTargets as TargetFacts[]}
            chosenId={targetId}
            project={session.snapshot.project}
            report={report}
            onOpen={choose}
          />
        ),
      })}
    />
  );
}

function reportStub(over: Partial<UpgradeReport> = {}): UpgradeReport {
  return {
    from: { targetId: 'mc-a', mcVersion: '1' },
    to: { targetId: 'mc-b', mcVersion: '2' },
    changed: [],
    done: [],
    todo: [],
    players: { rows: [], packs: [], exports: [] },
    added: { total: 0, byKind: {} },
    inGame: { checks: [], standing: [] },
    untouched: { total: 0, byArea: {} },
    ...over,
  } as UpgradeReport;
}

describe('Check on other versions', () => {
  it('words each status from the dry run', () => {
    const as = (move: Partial<MoveReport>): MoveReport =>
      ({ report: reportStub(), migration: { changes: [], problems: [] }, ...move }) as MoveReport;
    expect(versionStatusText(versionStatus(as({})))).toBe('Works as it is.');
    expect(
      versionStatusText(
        versionStatus(
          as({
            migration: {
              changes: [{ elementId: 'a:b', description: 'x', data: {} }],
              problems: [],
            },
          }),
        ),
      ),
    ).toBe('Works after a move: 1 change.');
    const todo = [{}, {}] as unknown as UpgradeReport['todo'];
    expect(versionStatusText(versionStatus(as({ report: reportStub({ todo }) })))).toBe(
      '2 things would break.',
    );
  });

  it('lists every version with its status, opens a report and asks again on edits', async () => {
    const targets = [
      { id: 'mc-c', mcVersion: '3', channel: 'snapshot' },
      { id: 'mc-b', mcVersion: '2', channel: 'release' },
      { id: 'mc-a', mcVersion: '1', channel: 'release' },
    ] as TargetFacts[];
    const answers: Record<string, MoveReport> = {
      'mc-c': {
        report: reportStub({ todo: [{}] as unknown as UpgradeReport['todo'] }),
        migration: { changes: [], problems: [] },
      },
      'mc-a': { report: reportStub(), migration: { changes: [], problems: [] } },
    };
    const ask = vi.fn(async (id: string) => answers[id] as MoveReport);
    const onOpen = vi.fn();
    const project = { formatVersion: 1, targets: ['mc-b'], namespaces: [] };
    const view = render(
      <OtherVersions
        currentTargetId="mc-b"
        targets={targets}
        chosenId="mc-c"
        project={project as never}
        report={ask}
        onOpen={onOpen}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('upgrade-other-mc-a-status').textContent).toBe('Works as it is.'),
    );
    expect(screen.getByTestId('upgrade-other-mc-c-status').textContent).toBe(
      '1 thing would break.',
    );
    expect(screen.getByTestId('upgrade-other-mc-b').textContent).toContain(
      'your mod is made for this one',
    );
    // The open one says so; another opens its report.
    expect(screen.queryByTestId('upgrade-other-mc-c-open')).toBeNull();
    await userEvent.click(screen.getByTestId('upgrade-other-mc-a-open'));
    expect(onOpen).toHaveBeenCalledWith('mc-a');
    expectPlain(view.container);
    // A new project state asks again.
    expect(ask).toHaveBeenCalledTimes(2);
    view.rerender(
      <OtherVersions
        currentTargetId="mc-b"
        targets={targets}
        chosenId="mc-c"
        project={{ ...project } as never}
        report={ask}
        onOpen={onOpen}
      />,
    );
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(4));
  });

  it('shows the rows from real dry runs in the dialog and opens another version', async () => {
    const opened = await openSampleWorldgen({ hills: true });
    render(dialogOf(opened, next.id));
    const dialog = screen.getByTestId('upgrade-target-dialog');
    await within(dialog).findByTestId('upgrade-part-other-versions', {}, { timeout: 10_000 });
    await waitFor(() =>
      expect(within(dialog).getByTestId(`upgrade-other-${next.id}-status`).textContent).toBe(
        'Works after a move: 1 change.',
      ),
    );
    opened.session.dispose();
  });
});

describe('Moving back in the report', () => {
  it('lists what cannot be put back first, and the things changed since the move', async () => {
    const opened = await openSampleWorldgen({ hills: true });
    const { session } = opened;
    const up = await session.upgradeReport(next.id);
    await session.upgradeTarget(next.id, up.migration, { upgradeReport: up.report });
    const moved = session.snapshot.project?.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((element) => element.id === HILLS)?.data as Record<string, unknown>;
    session.setElementData(HILLS, {
      ...moved,
      default_block: { Name: 'minecraft:deepslate' },
    } as never);
    await session.flushValidation();

    const onShow = vi.fn();
    render(dialogOf(opened, release.id, onShow));
    const lead = await screen.findByTestId('upgrade-move-back', {}, { timeout: 10_000 });
    const notRestored = within(lead).getByTestId('upgrade-move-back-not-restored-0');
    expect(notRestored.textContent).toContain(
      'not put back, because something else is in its place now, and that is kept.',
    );
    expect(within(lead).getByTestId('upgrade-move-back-edited-0')).toBeTruthy();
    // It comes before the report's parts.
    const report = screen.getByTestId('upgrade-report');
    expect(report.firstElementChild).toBe(lead);
    await userEvent.click(within(lead).getByTestId('upgrade-move-back-not-restored-0-show'));
    expect(onShow).toHaveBeenCalledWith(HILLS, '/default_block');
    expectPlain(lead);
    session.dispose();
  });

  it('says honestly what a move up with no record cannot put back', async () => {
    const opened = await openSampleWorldgen({ hills: true });
    const { session } = opened;
    const up = await session.upgradeReport(next.id);
    await session.upgradeTarget(next.id, up.migration, { keepCopy: false });

    render(dialogOf(opened, release.id));
    const lead = await screen.findByTestId('upgrade-move-back', {}, { timeout: 10_000 });
    expect(within(lead).getByTestId('upgrade-move-back-no-record').textContent).toContain(
      `MCSuperMods has no record of the move to Minecraft ${next.mcVersion}`,
    );
    const items = within(lead)
      .getAllByTestId(/^upgrade-move-back-unrecorded-\d+$/)
      .map((item) => item.textContent ?? '');
    const defaultBlock = next.changes?.changes.find((change) => change.id === DEFAULT_BLOCK);
    if (defaultBlock === undefined) throw new Error('No default_block change.');
    expect(items.some((text) => text.includes(changeSentence(defaultBlock, next.mcVersion)))).toBe(
      true,
    );
    expect(items.some((text) => text.includes('with no record MCSuperMods cannot undo it'))).toBe(
      true,
    );
    expect(within(lead).queryByTestId('upgrade-move-back-restored')).toBeNull();
    expectPlain(lead);
    session.dispose();
  });
});

describe('The report the host adds to (B821 wired by B820)', () => {
  it('shows the report the host gives before the move', async () => {
    const opened = await openSampleWorldgen({ hills: true });
    const { session } = opened;
    const shownReport = vi.fn((_targetId: string, move: MoveReport) => ({
      ...move.report,
      todo: [
        ...move.report.todo,
        {
          id: 'modpack.mod-no-build:/packs/a:LUMEN001',
          source: 'export' as const,
          problem: {
            severity: 'warning' as const,
            code: 'modpack.mod-no-build',
            message: 'Lumen in the modpack Pack has no build for this version yet.',
          },
          hint: 'wait for one',
          check: 'manual' as const,
        },
      ],
    }));
    render(
      <UpgradeTargetDialog
        currentTargetId={session.target.id}
        targets={session.availableTargets as TargetFacts[]}
        project={session.snapshot.project}
        report={(id, signal) => session.upgradeReport(id, { signal })}
        initialTargetId={next.id}
        shownReport={shownReport}
        onMove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByTestId('upgrade-report', {}, { timeout: 10_000 });
    expect(screen.getByTestId('upgrade-report-summary').textContent).toContain('1 needs you');
    expect(screen.getByTestId('upgrade-report').textContent).toContain('Lumen in the modpack Pack');
    session.dispose();
  });
});

describe('The export dialogs’ More options line', () => {
  it('opens the move dialog from the jar and Java project dialogs', async () => {
    window.msmMoreOptionsOpen = true;
    const onJar = vi.fn();
    render(
      <ExportFabricJarDialog
        options={[]}
        onExport={vi.fn()}
        onClose={vi.fn()}
        onCheckOtherVersions={onJar}
      />,
    );
    await userEvent.click(screen.getByTestId('fabric-jar-other-versions'));
    expect(onJar).toHaveBeenCalledOnce();
    cleanup();
    const onJava = vi.fn();
    render(
      <ExportJavaProjectDialog
        scripts={[]}
        onExport={vi.fn()}
        onClose={vi.fn()}
        onCheckOtherVersions={onJava}
      />,
    );
    await userEvent.click(screen.getByTestId('java-project-other-versions'));
    expect(onJava).toHaveBeenCalledOnce();
    window.msmMoreOptionsOpen = false;
  });
});
