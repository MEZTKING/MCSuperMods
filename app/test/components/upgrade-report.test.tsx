// @vitest-environment happy-dom
/**
 * The dialog as the report (ADR 0136 D4, D6, D12, D13, D15; B818), over B816's fixtures: a real
 * dry run of `fixtures/sample-worldgen` moved to the next target with noise settings, a large
 * dripstone feature and a function pouring flowing lava. Each part shows in plain words with
 * Show me and Ask the helper, ids only under More options; a mod nothing touches gets one
 * sentence and the in-game list; the open report follows edits; the move puts part 3 into
 * Things to fix under After moving, where each item leaves by itself when fixed, and **What
 * changed when I moved** reopens the saved report with the fixed items done.
 */
import type { TargetFacts } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { afterMovingGroup, ThingsToFix } from '../../src/renderer/src/components/ThingsToFix';
import { UpgradeTargetDialog } from '../../src/renderer/src/components/UpgradeTargetDialog';
import { changeSentence } from '../../src/renderer/src/components/upgrade/sentences';
import { expectPlain } from './plain-sweep';
import {
  DEFAULT_BLOCK,
  HILLS,
  LARGE_DRIPSTONE,
  next,
  openSampleWorldgen,
  release,
  SPIKES,
} from './upgrade-fixture';

beforeAll(() => {
  // The default view: every More options closed (the test setup opens them).
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

/** The dialog over a session, as App mounts it. */
function dialogOf(
  opened: Opened,
  handlers: Partial<Parameters<typeof UpgradeTargetDialog>[0]> = {},
) {
  const { session } = opened;
  return (
    <UpgradeTargetDialog
      currentTargetId={session.target.id}
      targets={session.availableTargets as TargetFacts[]}
      project={session.snapshot.project}
      problems={session.snapshot.problems}
      report={(id, signal) => session.upgradeReport(id, { signal })}
      loadSaved={() => session.savedUpgradeReports()}
      initialTargetId={next.id}
      onMove={vi.fn()}
      onCancel={vi.fn()}
      onShow={vi.fn()}
      onAsk={vi.fn()}
      {...handlers}
    />
  );
}

describe('The upgrade report in the dialog', () => {
  it('shows the six parts of a real dry run in plain words, with Show me and Ask the helper', async () => {
    const opened = await openSampleWorldgen({ hills: true, spikes: true, pour: true });
    const onShow = vi.fn();
    const onAsk = vi.fn();
    render(dialogOf(opened, { onShow, onAsk }));
    const dialog = screen.getByTestId('upgrade-target-dialog');
    await within(dialog).findByTestId('upgrade-report', {}, { timeout: 10_000 });
    expect(within(dialog).getByTestId('upgrade-report-summary').textContent).toBe(
      '1 thing changes by itself, 5 need you.',
    );

    // Part 1: each change once, with the things it touches.
    const changed = within(dialog).getByRole('region', {
      name: 'What changed in Minecraft for this mod',
    });
    const sentences = within(changed)
      .getAllByTestId(/^upgrade-changed-\d+-text$/)
      .map((node) => node.textContent);
    const defaultBlock = next.changes?.changes.find((change) => change.id === DEFAULT_BLOCK);
    if (defaultBlock === undefined) throw new Error('The change set lost default_block.');
    expect(sentences).toContain(changeSentence(defaultBlock, next.mcVersion));
    expect(sentences.join(' ')).toContain('no default block');
    expect(sentences.join(' ')).toContain('large speleothem');
    expect(sentences).toHaveLength(new Set(sentences).size);

    // Part 2: Hills loses its default block.
    const done = within(dialog).getByRole('region', { name: 'What MCSuperMods changes for you' });
    expect(within(done).getByTestId('upgrade-done-0-thing').textContent).toBe('Hills');
    expect(within(done).getByTestId('upgrade-done-0-steps').textContent).toBe(
      `Its default block setting goes: Minecraft ${next.mcVersion} no longer has it.`,
    );

    // Part 3: the large dripstone feature, with its hint, Show me at the field and Ask.
    const todo = within(dialog).getByRole('region', { name: 'What you need to change' });
    const rows = within(todo).getAllByTestId(/^upgrade-todo-\d+$/);
    const spikes = rows.find((row) =>
      within(row).queryByText(`Spikes uses something Minecraft ${next.mcVersion} no longer has.`),
    );
    if (spikes === undefined) throw new Error('The large dripstone feature is not listed.');
    expect(within(spikes).getByTestId(/-hint$/).textContent).toBe(
      'How: Use large speleothem and add its required base block (for example dripstone block).',
    );
    const user = userEvent.setup();
    await user.click(within(spikes).getByRole('button', { name: 'Show me Spikes' }));
    expect(onShow).toHaveBeenCalledWith(SPIKES, '/type');
    await user.click(within(spikes).getByRole('button', { name: 'Ask the helper' }));
    expect(onAsk).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'target.removed-id', elementId: SPIKES, path: '/type' }),
    );
    // The function's removed id in its text.
    expect(
      within(todo).getByText(
        `Pour names something in its text that Minecraft ${next.mcVersion} no longer has.`,
      ),
    ).toBeTruthy();

    // Part 4: what players need, from both versions' facts.
    const players = within(dialog).getByRole('region', { name: 'What your players need' });
    const minecraft = within(players).getByTestId('upgrade-players-minecraft');
    expect(minecraft.textContent).toBe(`Minecraft${release.mcVersion}${next.mcVersion}`);
    expect(minecraft.getAttribute('data-changed')).toBe('true');
    expect(within(players).getByTestId('upgrade-players-java').textContent).toContain('the same');
    // Parts 5 and 6, and the line on what does not touch the mod.
    expect(within(dialog).getByTestId('upgrade-added-text').textContent).toMatch(
      new RegExp(`^Minecraft ${next.mcVersion.replaceAll('.', '\\.')} adds \\d+ new things`),
    );
    const inGame = within(dialog).getByRole('region', { name: 'What to check in the game' });
    expect(within(inGame).getByTestId('upgrade-ingame-start-game').textContent).toBe(
      `Start Minecraft ${next.mcVersion} once with your mod.`,
    );
    expect(within(inGame).getByText(/look at the stone under the surface/)).toBeTruthy();
    expect(within(inGame).getByTestId('upgrade-ingame-limit')).toBeTruthy();
    expect(within(dialog).getByTestId('upgrade-untouched').textContent).toMatch(
      /^\d+ other changes in Minecraft .* do not touch your mod, as far as MCSuperMods knows\.\s*$/,
    );

    // Plain by default; the ids show with More options open.
    expectPlain(dialog);
    fireEvent.click(within(dialog).getByTestId('more-options-dialog-upgrade-target'));
    expect(within(changed).getAllByText(DEFAULT_BLOCK).length).toBeGreaterThan(0);
    expect(within(done).getByTestId('upgrade-done-0-description').textContent).toContain(
      '/default_block',
    );
    expect(within(players).getByText('(Fabric API)', { exact: false })).toBeTruthy();
    opened.session.dispose();
  }, 30_000);

  it('says in one sentence when nothing touches the mod, with the in-game list', async () => {
    const opened = await openSampleWorldgen();
    render(dialogOf(opened));
    const nothing = await screen.findByTestId('upgrade-nothing', {}, { timeout: 10_000 });
    expect(nothing.textContent).toMatch(
      new RegExp(
        `^Nothing in your mod needs changing for Minecraft ${next.mcVersion.replaceAll('.', '\\.')}: none of the \\d+ changes MCSuperMods knows about touches it\\.$`,
      ),
    );
    // Parts 1 to 3 and the separate untouched line are hidden; players and the checks stay.
    for (const part of ['changed', 'done', 'todo']) {
      expect(screen.queryByTestId(`upgrade-part-${part}`)).toBeNull();
    }
    expect(screen.queryByTestId('upgrade-untouched')).toBeNull();
    expect(screen.getByTestId('upgrade-part-players')).toBeTruthy();
    expect(screen.getByTestId('upgrade-ingame').children.length).toBeGreaterThan(0);
    expect(screen.getByTestId('upgrade-report-summary').textContent).toBe(
      'Nothing in your mod needs changing.',
    );
    expectPlain(screen.getByTestId('upgrade-target-dialog'));
    opened.session.dispose();
  }, 30_000);

  it('follows edits: removing the noise settings takes them out of the open report', async () => {
    const opened = await openSampleWorldgen({ hills: true });
    const { rerender } = render(dialogOf(opened));
    expect(
      (await screen.findByTestId('upgrade-done-0-thing', {}, { timeout: 10_000 })).textContent,
    ).toBe('Hills');
    act(() => {
      opened.session.removeElement(HILLS);
    });
    rerender(dialogOf(opened));
    await waitFor(() => expect(screen.queryByTestId('upgrade-part-done')).toBeNull(), {
      timeout: 10_000,
    });
    expect(screen.getByTestId('upgrade-nothing')).toBeTruthy();
    opened.session.dispose();
  }, 30_000);

  it('moves with the dry run, lists part 3 under After moving and reopens the saved report', async () => {
    const opened = await openSampleWorldgen({ spikes: true });
    const { session } = opened;
    const onMove = vi.fn(async (targetId: string, move: { report: unknown; migration: unknown }) =>
      session.upgradeTarget(
        targetId,
        move.migration as Parameters<typeof session.upgradeTarget>[1],
        { upgradeReport: move.report as never },
      ),
    );
    render(dialogOf(opened, { onMove }));
    const submit = await screen.findByRole('button', {
      name: `Move my mod to Minecraft ${next.mcVersion}`,
    });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false), {
      timeout: 10_000,
    });
    await userEvent.setup().click(submit);
    await act(async () => {
      await onMove.mock.results[0]?.value;
    });
    cleanup();
    expect(session.snapshot.project?.targets).toEqual([next.id]);

    // Things to fix: the After moving group, each problem once.
    const things = () => (
      <ThingsToFix
        project={session.snapshot.project}
        problems={session.snapshot.problems}
        onShow={vi.fn()}
        afterMoving={afterMovingGroup(session.openUpgradeItems())}
        onOpenMoveReport={vi.fn()}
      />
    );
    const { rerender } = render(things());
    expect(screen.getByTestId('things-to-fix-after-moving-title').textContent).toMatch(
      new RegExp(`^After moving to Minecraft ${next.mcVersion.replaceAll('.', '\\.')} \\(\\d+\\)$`),
    );
    const listed = screen.getAllByTestId(/^things-to-fix-after-moving-\d+$/).length;
    expect(listed).toBeGreaterThan(0);
    expectPlain(screen.getByTestId('things-to-fix'));
    // Fixing the feature's type takes its items away by themselves.
    act(() => {
      session.setElementData(SPIKES, { ...LARGE_DRIPSTONE, type: 'minecraft:ore' });
    });
    await act(() => session.flushValidation());
    rerender(things());
    const left = screen.queryAllByTestId(/^things-to-fix-after-moving-\d+$/).length;
    expect(left).toBeLessThan(listed);
    cleanup();

    // What changed when I moved: the saved report, the fixed items done.
    const saved = await session.savedUpgradeReports();
    const folder = saved[0]?.folder;
    if (folder === undefined) throw new Error('The move was not saved.');
    render(dialogOf(opened, { initialSavedFolder: folder }));
    expect(
      (await screen.findByTestId('upgrade-report-summary', {}, { timeout: 10_000 })).textContent,
    ).toMatch(/^Moved from Minecraft .* to .* on \d+ \w+ \d{4}\.$/);
    const todo = await screen.findByTestId('upgrade-todo');
    const doneRows = within(todo)
      .getAllByTestId(/^upgrade-todo-\d+$/)
      .filter((row) => row.getAttribute('data-done') === 'true');
    expect(doneRows.length).toBeGreaterThan(0);
    expectPlain(screen.getByTestId('upgrade-target-dialog'));
    session.dispose();
  }, 60_000);
});
