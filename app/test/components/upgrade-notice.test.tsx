// @vitest-environment happy-dom
/**
 * The notice that a newer Minecraft is ready (ADR 0136 D5, B817): which target is told about
 * (releases only unless **Tell me about test versions of Minecraft** is on), the Things to fix
 * note in each state (no newer version, a newer release, a newer test version with the setting
 * off and on, put off with **Not now**, a dry run that failed), the status bar's mark, Home's
 * "Made for Minecraft X", and the counts following edits over a real dry run of B816's fixture.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryFileSystem } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { clearRecentSummaries } from '../../src/renderer/src/components/home/recent-summary';
import { YourMods } from '../../src/renderer/src/components/home/YourMods';
import { StatusBar } from '../../src/renderer/src/components/StatusBar';
import {
  newerTargetFor,
  readNotNow,
  UPGRADE_NOTICE_FILE,
} from '../../src/renderer/src/components/upgrade/notice';
import {
  noticeSentence,
  UpgradeNotice,
} from '../../src/renderer/src/components/upgrade/UpgradeNotice';
import {
  type NoticeSession,
  noticeShows,
  type UpgradeNoticeInput,
  type UpgradeNoticeState,
  useUpgradeNotice,
} from '../../src/renderer/src/components/upgrade/use-upgrade-notice';
import type { SessionSnapshot } from '../../src/renderer/src/session/project-session';
import { expectPlain } from './plain-sweep';
import {
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
  clearRecentSummaries();
  globalThis.localStorage?.clear();
});
afterAll(() => {
  window.msmMoreOptionsOpen = true;
});

const base = builtInTargets[0]?.target as TargetFacts;
/** A stand-in target: version `mcVersion`, following `previous`. */
function facts(mcVersion: string, channel: 'release' | 'snapshot', previous?: string): TargetFacts {
  const made = { ...base, id: `mc-${mcVersion}`, mcVersion, channel } as TargetFacts & {
    previous?: string;
  };
  delete made.previous;
  if (previous !== undefined) made.previous = previous;
  return made;
}

// One, then a release Two after it, then a test version Three after that; Other follows nothing.
const ONE = facts('1.0', 'release');
const TWO = facts('2.0', 'release', ONE.id);
const THREE = facts('3.0-pre-1', 'snapshot', TWO.id);
const OTHER = facts('9.0', 'release');
const TARGETS = [THREE, TWO, ONE, OTHER];

describe('which newer Minecraft is told about', () => {
  it('follows previous, releases only unless test versions are on', () => {
    expect(newerTargetFor(ONE.id, TARGETS, false)?.id).toBe(TWO.id);
    expect(newerTargetFor(ONE.id, TARGETS, true)?.id).toBe(THREE.id);
    expect(newerTargetFor(TWO.id, TARGETS, false)).toBeNull();
    expect(newerTargetFor(TWO.id, TARGETS, true)?.id).toBe(THREE.id);
    expect(newerTargetFor(THREE.id, TARGETS, true)).toBeNull();
    // A target whose chain never reaches the mod's, and an unknown one.
    expect(newerTargetFor(OTHER.id, TARGETS, true)).toBeNull();
    expect(newerTargetFor('mc-unknown', TARGETS, true)).toBeNull();
    // A loop ends the walk.
    const a = facts('5.0', 'release', 'mc-6.0');
    const b = facts('6.0', 'release', 'mc-5.0');
    expect(newerTargetFor(ONE.id, [a, b, ONE], true)).toBeNull();
  });

  it('tells nothing about the built-in test version with the setting off', () => {
    // Today the target after the release is a test version (B817's default: releases only).
    const targets = builtInTargets.map((entry) => entry.target);
    expect(next.channel).toBe('snapshot');
    expect(newerTargetFor(release.id, targets, false)).toBeNull();
    expect(newerTargetFor(release.id, targets, true)?.id).toBe(next.id);
  });
});

describe('the note', () => {
  it('words the counts with the version from the facts', () => {
    expect(noticeSentence('2.0', 3, 1)).toBe(
      'Minecraft 2.0 is ready for this mod: 3 things change by themselves, 1 needs you.',
    );
    expect(noticeSentence('2.0', 1, 2)).toBe(
      'Minecraft 2.0 is ready for this mod: 1 thing changes by itself, 2 need you.',
    );
    expect(noticeSentence('2.0', 0, 1)).toBe(
      'Minecraft 2.0 is ready for this mod: 1 thing needs you.',
    );
    expect(noticeSentence('2.0', 2, 0)).toBe(
      'Minecraft 2.0 is ready for this mod: 2 things change by themselves.',
    );
    expect(noticeSentence('2.0', 0, 0)).toBe(
      'Minecraft 2.0 is ready for this mod: nothing in it needs changing.',
    );
  });

  it('names no version of its own', () => {
    const dir = join(__dirname, '..', '..', 'src', 'renderer', 'src', 'components', 'upgrade');
    for (const file of ['UpgradeNotice.tsx', 'notice.ts', 'use-upgrade-notice.ts']) {
      // A version is `<n>.<n>` in a string or comment (class names such as `px-1.5` aside).
      const text = readFileSync(join(dir, file), 'utf8').replaceAll(/[a-z]+-\d+\.\d+/g, '');
      expect(text).not.toMatch(/\b2\d\.\d+\b|\b1\.\d+\b|mc-\d/);
    }
  });

  it('shows nothing while checking, with no newer version or once put off', () => {
    const states: UpgradeNoticeState[] = [
      { status: 'none' },
      { status: 'checking', newer: TWO },
      { status: 'ready', newer: TWO, done: 1, todo: 1, dismissed: true },
      { status: 'failed', newer: TWO, message: 'Boom.', dismissed: true },
    ];
    for (const notice of states) {
      expect(noticeShows(notice)).toBe(false);
      const { container } = render(
        <UpgradeNotice notice={notice} onSee={vi.fn()} onNotNow={vi.fn()} />,
      );
      expect(container.textContent).toBe('');
      cleanup();
    }
  });

  it('a newer release: the sentence, See what changes and Not now, in plain words', () => {
    const onSee = vi.fn();
    const onNotNow = vi.fn();
    const notice: UpgradeNoticeState = {
      status: 'ready',
      newer: TWO,
      done: 3,
      todo: 1,
      dismissed: false,
    };
    expect(noticeShows(notice)).toBe(true);
    render(<UpgradeNotice notice={notice} onSee={onSee} onNotNow={onNotNow} />);
    expect(screen.getByTestId('upgrade-notice-text').textContent).toBe(
      'Minecraft 2.0 is ready for this mod: 3 things change by themselves, 1 needs you.',
    );
    expect(screen.getByRole('note')).toBeTruthy();
    expectPlain(document.body);
    fireEvent.click(screen.getByRole('button', { name: 'See what changes' }));
    expect(onSee).toHaveBeenCalledWith(TWO.id);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onNotNow).toHaveBeenCalledTimes(1);
  });

  it('a failed dry run is one quiet line under More options', () => {
    const notice: UpgradeNoticeState = {
      status: 'failed',
      newer: TWO,
      message: 'The check stopped.',
      dismissed: false,
    };
    expect(noticeShows(notice)).toBe(true);
    render(<UpgradeNotice notice={notice} onSee={vi.fn()} onNotNow={vi.fn()} />);
    expect(screen.queryByTestId('upgrade-notice')).toBeNull();
    expect(screen.queryByTestId('upgrade-notice-failed')).toBeNull();
    fireEvent.click(screen.getByTestId('more-options-upgrade-notice'));
    expect(screen.getByTestId('upgrade-notice-failed').textContent).toBe(
      'MCSuperMods could not check what moving to Minecraft 2.0 would change: The check stopped.',
    );
  });
});

/** The hook's state, rendered as text for the test to read. */
function Probe(props: UpgradeNoticeInput & { onState?: (notice: UpgradeNoticeState) => void }) {
  const { notice, notNow } = useUpgradeNotice(props);
  props.onState?.(notice);
  return (
    <div>
      <span data-testid="state">
        {notice.status}
        {notice.status === 'ready' && ` ${notice.newer.id} ${notice.done}/${notice.todo}`}
        {(notice.status === 'ready' || notice.status === 'failed') &&
          notice.dismissed &&
          ' dismissed'}
      </span>
      <button type="button" onClick={notNow}>
        not now
      </button>
    </div>
  );
}

const now = (run: () => void) => {
  run();
  return () => {};
};

function fakeSession(done = 2, todo = 1): NoticeSession & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    upgradeReport: async (targetId) => {
      calls.push(targetId);
      return {
        report: {
          done: [
            ...Array.from({ length: done }, () => ({ kind: 'update' })),
            { kind: 'note' },
          ] as never,
          todo: Array.from({ length: todo }, () => ({})) as never,
        },
      };
    },
  };
}

describe('the notice state', () => {
  const project = { name: 'Demo' };

  it('no newer version: nothing, and no dry run', async () => {
    const session = fakeSession();
    render(
      <Probe
        session={session}
        fs={null}
        root="/mods/demo"
        project={project}
        target={TWO}
        targets={TARGETS}
        testVersions={false}
        whenIdle={now}
      />,
    );
    await act(async () => {});
    expect(screen.getByTestId('state').textContent).toBe('none');
    expect(session.calls).toEqual([]);
  });

  it('a newer release: checking, then the counts (notes are not counted)', async () => {
    const session = fakeSession(2, 1);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: NoticeSession = {
      upgradeReport: async (id, options) => {
        await gate;
        return session.upgradeReport(id, options);
      },
    };
    render(
      <Probe
        session={slow}
        fs={null}
        root="/mods/demo"
        project={project}
        target={ONE}
        targets={TARGETS}
        testVersions={false}
        whenIdle={now}
      />,
    );
    expect(screen.getByTestId('state').textContent).toBe('checking');
    await act(async () => release());
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready mc-2.0 2/1'));
  });

  it('a newer test version: nothing with the setting off, told with it on', async () => {
    const session = fakeSession();
    const props = {
      session,
      fs: null,
      root: '/mods/demo',
      project,
      target: TWO,
      targets: TARGETS,
      whenIdle: now,
    };
    const { rerender } = render(<Probe {...props} testVersions={false} />);
    await act(async () => {});
    expect(screen.getByTestId('state').textContent).toBe('none');
    rerender(<Probe {...props} testVersions />);
    await waitFor(() =>
      expect(screen.getByTestId('state').textContent).toBe('ready mc-3.0-pre-1 2/1'),
    );
    expect(session.calls).toEqual([THREE.id]);
  });

  it('Not now is remembered for this mod and this version in .msm', async () => {
    const fs = createMemoryFileSystem({});
    const props = {
      session: fakeSession(),
      fs,
      root: '/mods/demo',
      project,
      target: ONE,
      targets: TARGETS,
      testVersions: false,
      whenIdle: now,
    };
    render(<Probe {...props} />);
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready mc-2.0 2/1'));
    fireEvent.click(screen.getByRole('button', { name: 'not now' }));
    expect(screen.getByTestId('state').textContent).toBe('ready mc-2.0 2/1 dismissed');
    await waitFor(async () => expect(await readNotNow(fs)).toEqual([TWO.id]));
    const text = new TextDecoder().decode(await fs.readFile(UPGRADE_NOTICE_FILE));
    expect(text).toBe('{\n  "notNow": [\n    "mc-2.0"\n  ]\n}\n');
    cleanup();
    // Opened again: still put off for this version...
    render(<Probe {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId('state').textContent).toBe('ready mc-2.0 2/1 dismissed'),
    );
    cleanup();
    // ...but not for a newer one.
    render(<Probe {...props} testVersions />);
    await waitFor(() =>
      expect(screen.getByTestId('state').textContent).toBe('ready mc-3.0-pre-1 2/1'),
    );
  });

  it('a dry run that failed, and one an edit cancelled asked again', async () => {
    const failing: NoticeSession = {
      upgradeReport: async () => {
        throw new Error('The check stopped.');
      },
    };
    const states: UpgradeNoticeState[] = [];
    render(
      <Probe
        session={failing}
        fs={null}
        root="/mods/demo"
        project={project}
        target={ONE}
        targets={TARGETS}
        testVersions={false}
        whenIdle={now}
        onState={(notice) => states.push(notice)}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('failed'));
    expect(states.at(-1)).toMatchObject({ status: 'failed', message: 'The check stopped.' });
    cleanup();

    let tries = 0;
    const cancelledOnce: NoticeSession = {
      upgradeReport: async (id, options) => {
        tries += 1;
        if (tries === 1) {
          const error = new Error('The dry run was cancelled (stale).');
          error.name = 'DryRunCancelled';
          throw error;
        }
        return fakeSession(1, 0).upgradeReport(id, options);
      },
    };
    render(
      <Probe
        session={cancelledOnce}
        fs={null}
        root="/mods/demo"
        project={project}
        target={ONE}
        targets={TARGETS}
        testVersions={false}
        whenIdle={now}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready mc-2.0 1/0'));
    expect(tries).toBe(2);
  });
});

describe('the status bar mark', () => {
  const snapshot = {
    root: '/mods/demo',
    project: { name: 'Demo', targets: [ONE.id] },
    dirty: false,
    canUndo: false,
    canRedo: false,
    problems: [],
  } as unknown as SessionSnapshot;

  it('shows "X is ready" beside the version and opens the report', () => {
    const onOpen = vi.fn();
    render(<StatusBar snapshot={snapshot} target={ONE} newer={{ mcVersion: '2.0', onOpen }} />);
    const mark = screen.getByTestId('project-target-newer');
    expect(mark.textContent).toBe('2.0 is ready');
    expect(mark.getAttribute('aria-label')).toBe(
      'Minecraft 2.0 is ready for this mod: see what changes',
    );
    fireEvent.click(mark);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expectPlain(document.body);
  });

  it('shows no mark without a ready report', () => {
    render(<StatusBar snapshot={snapshot} target={ONE} newer={null} />);
    expect(screen.queryByTestId('project-target-newer')).toBeNull();
    expect(screen.getByTestId('project-target').textContent).toBe('For Minecraft 1.0');
  });
});

describe("Home's Made for Minecraft", () => {
  const NOW = Date.parse('2026-11-23T12:00:00.000Z');
  const mods = [
    { root: '/mods/one', name: 'One Mod', openedAt: new Date(NOW).toISOString(), exists: true },
    { root: '/mods/two', name: 'Two Mod', openedAt: new Date(NOW).toISOString(), exists: true },
    { root: '/mods/odd', name: 'Odd Mod', openedAt: new Date(NOW).toISOString(), exists: true },
  ];
  const targetOf: Record<string, string | undefined> = {
    '/mods/one': ONE.id,
    '/mods/two': TWO.id,
    '/mods/odd': 'mc-unknown',
  };
  const summary = async (root: string) => ({
    things: 1,
    picture: null,
    pictureFrom: null,
    ...(targetOf[root] === undefined ? {} : { target: targetOf[root] as string }),
  });

  it('says which Minecraft each mod is for and where it can move, from its file alone', async () => {
    const { rerender } = render(
      <YourMods
        recent={mods}
        onOpen={vi.fn()}
        summary={summary}
        targets={TARGETS}
        testVersions={false}
        now={() => NOW}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('home-recent-made-for-0').textContent).toBe(
        'Made for Minecraft 1.0, can move to 2.0',
      ),
    );
    expect(screen.getByTestId('home-recent-made-for-1').textContent).toBe('Made for Minecraft 2.0');
    // A target this app does not know: no line.
    expect(screen.queryByTestId('home-recent-made-for-2')).toBeNull();
    expectPlain(document.body);
    rerender(
      <YourMods
        recent={mods}
        onOpen={vi.fn()}
        summary={summary}
        targets={TARGETS}
        testVersions
        now={() => NOW}
      />,
    );
    expect(screen.getByTestId('home-recent-made-for-0').textContent).toBe(
      'Made for Minecraft 1.0, can move to 3.0-pre-1',
    );
    expect(screen.getByTestId('home-recent-made-for-1').textContent).toBe(
      'Made for Minecraft 2.0, can move to 3.0-pre-1',
    );
  });
});

describe('the counts follow edits (live view)', () => {
  it('a real dry run of the fixture: removing the thing that needs you lowers the count', async () => {
    const { session, fs } = await openSampleWorldgen({ hills: true, spikes: true });
    const targets = session.availableTargets;
    function Live() {
      const snapshot = session.snapshot;
      const { notice } = useUpgradeNotice({
        session,
        fs,
        root: snapshot.root,
        project: snapshot.project,
        target: session.target,
        targets,
        testVersions: true,
        whenIdle: now,
      });
      return (
        <span data-testid="live">
          {notice.status === 'ready' ? `${notice.done}/${notice.todo}` : notice.status}
        </span>
      );
    }
    const { rerender } = render(<Live />);
    await waitFor(() => expect(screen.getByTestId('live').textContent).toMatch(/^\d+\/\d+$/), {
      timeout: 10_000,
    });
    const before = screen.getByTestId('live').textContent ?? '';
    const [doneBefore, todoBefore] = before.split('/').map(Number) as [number, number];
    expect(doneBefore).toBeGreaterThan(0);
    expect(todoBefore).toBeGreaterThan(0);
    // The large dripstone feature is what needs the user; removing it takes the count down.
    expect(
      session.snapshot.project?.namespaces.some((ns) => ns.elements.some((e) => e.id === SPIKES)),
    ).toBe(true);
    await act(async () => {
      session.removeElement(SPIKES);
      await session.flushValidation();
    });
    rerender(<Live />);
    await waitFor(
      () => {
        const [, todo] = (screen.getByTestId('live').textContent ?? '').split('/').map(Number);
        expect(todo).toBeLessThan(todoBefore);
      },
      { timeout: 10_000 },
    );
    // The noise settings still change by themselves.
    expect(
      session.snapshot.project?.namespaces.some((ns) => ns.elements.some((e) => e.id === HILLS)),
    ).toBe(true);
    expect(LARGE_DRIPSTONE.type).toBe('minecraft:large_dripstone');
  }, 30_000);
});
