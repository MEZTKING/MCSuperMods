// @vitest-environment happy-dom
/**
 * Before and after (ADR 0136 D13, B819) over B816's fixtures: real dry runs of
 * `fixtures/sample-worldgen` moved to the next target. Noise settings are drawn by the live
 * world map with the project before the move in the compare view's place; a loot table and a
 * model by the preview panel twice, side by side or with a slider on a narrow window; a loot
 * table the move leaves alone is said to look the same and drawn nothing; a thing with no view
 * shows the text difference and says why; one pair is open at a time; a version not set up
 * draws stand-ins and says so; the pair follows edits; and Minecraft changed these too is wired
 * over the session's lowering of the moved copy.
 *
 * The preview panel and the world map are stubs that show what they were given: the views
 * themselves are tested where they live.
 */
import type { UpgradeDoneItem } from '@msm/core';
import type { Element, Project, ResourceLocation } from '@msm/plugin-api';
import { targetById } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpgradeViewsHost } from '../../src/renderer/src/components/upgrade/BeforeAfter';
import BeforeAfter, {
  MovedJavaProject,
  MovedVanillaFiles,
} from '../../src/renderer/src/components/upgrade/BeforeAfter';
import {
  fileDifferences,
  openPair,
  pairViewOf,
  sameFiles,
  setOpenPair,
  sideFiles,
} from '../../src/renderer/src/components/upgrade/before-after/sides';
import { foldedLines } from '../../src/renderer/src/components/upgrade/before-after/TextDifference';
import type { UpgradeDryRun } from '../../src/renderer/src/session/upgrade/dry-run';
import { HILLS, next, openSampleWorldgen, release } from './upgrade-fixture';

vi.mock('../../src/renderer/src/preview/PreviewPanel', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/renderer/src/preview/PreviewPanel')>();
  return {
    ...actual,
    PreviewPanel: (props: {
      project: Project;
      element: Element;
      previewKind?: string;
      vanilla: unknown;
      folders: unknown;
      terrainSession?: { target: { mcVersion: string } };
    }) => (
      <div
        data-testid="stub-panel"
        data-kind={props.previewKind ?? ''}
        data-version={props.terrainSession?.target.mcVersion ?? ''}
        data-vanilla={props.vanilla === null ? 'none' : 'jar'}
        data-target={props.project.targets[0] ?? ''}
      >
        {JSON.stringify(props.element.data)}
      </div>
    ),
  };
});

vi.mock('../../src/renderer/src/terrain/WorldMap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/renderer/src/terrain/WorldMap')>();
  const handle = () => ({
    client: { dispose: () => undefined },
    files: { dispose: () => undefined },
    subscribe: () => () => undefined,
    getSnapshot: () => ({ state: null, error: null }),
    changedAt: () => null,
  });
  return {
    ...actual,
    createTerrainSession: handle,
    default: (props: {
      project: Project;
      element: Element;
      session: { target: { mcVersion: string } };
      compareWith?: { label: string; note?: string };
    }) => (
      <div
        data-testid="stub-map"
        data-version={props.session.target.mcVersion}
        data-compare={props.compareWith?.label ?? ''}
        data-note={props.compareWith?.note ?? ''}
      >
        {JSON.stringify(props.element.data)}
      </div>
    ),
  };
});

afterEach(() => {
  cleanup();
  setOpenPair(null);
});

type Session = Awaited<ReturnType<typeof openSampleWorldgen>>['session'];

/** The host as App builds it, over a session; `jars` are the versions set up here. */
function hostOf(session: Session, jars: readonly string[] = []): UpgradeViewsHost {
  return {
    loweredElements: (project, targetId) => session.loweredElements(project, targetId),
    registry: session.registry,
    targets: session.availableTargets,
    targetOf: (id) => targetById(id)?.target,
    minecraftStatus: async (version) => ({ cache: jars.includes(version) ? {} : null }),
    readVanillaAsset: async () => null,
    readProjectAsset: async () => null,
    projectRoot: '/projects/demo',
    onShow: vi.fn(),
    onSetup: vi.fn(),
    webgl: false,
  };
}

/** A part 2 item of `elementId` (the report's own when it has one). */
function itemOf(dry: UpgradeDryRun, elementId: string): UpgradeDoneItem {
  return (
    dry.report.done.find((item) => item.elementId === elementId) ?? {
      elementId: elementId as ResourceLocation,
      kind: 'update',
      description: 'Changed for the new version.',
      details: [],
      changeIds: [],
    }
  );
}

/** The dry run with `elementId`'s data in the moved copy replaced by `data`. */
function withMovedData(
  dry: UpgradeDryRun,
  elementId: string,
  data: Element['data'],
): UpgradeDryRun {
  const moved = structuredClone(dry.moved);
  for (const namespace of moved.namespaces) {
    for (const element of namespace.elements) if (element.id === elementId) element.data = data;
  }
  // The whole lowered set was made from the dry run's own copy: the views then read the
  // changed thing's own lowering.
  return { ...dry, moved, filesAfter: [] };
}

function show(
  session: Session,
  dry: UpgradeDryRun,
  item: UpgradeDoneItem,
  options: { jars?: readonly string[]; layout?: 'wide' | 'narrow' } = {},
) {
  const host = hostOf(session, options.jars);
  const view = (move: UpgradeDryRun, project = session.snapshot.project as Project) => (
    <BeforeAfter
      host={host}
      project={project}
      move={move}
      item={item}
      {...(options.layout === undefined ? {} : { layout: options.layout })}
    />
  );
  const rendered = render(view(dry));
  return { host, rendered, view };
}

async function openIt(): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId('upgrade-before-after-toggle'));
  return await screen.findByTestId('upgrade-before-after-pair');
}

const LOOT = 'msm_sample_worldgen:chest' as ResourceLocation;
const LOOT_DATA = {
  type: 'minecraft:chest',
  pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:apple' }] }],
};
const MODEL = 'msm_sample_worldgen:block/crate' as ResourceLocation;
const MODEL_DATA = {
  parent: 'minecraft:block/cube_all',
  textures: { all: 'minecraft:block/oak_planks' },
};

describe('before and after views (B819)', () => {
  it('draws noise settings on the live world map, before the move in the compare view', async () => {
    const { session } = await openSampleWorldgen({ hills: true });
    const dry = await session.upgradeReport(next.id);
    const item = itemOf(dry, HILLS);
    expect(item.details.length).toBeGreaterThan(0);
    show(session, dry, item);
    const pair = await openIt();
    expect(pair.dataset.view).toBe('worldgen');
    expect(pair.dataset.same).toBe('no');
    const map = await screen.findByTestId('stub-map');
    expect(map.dataset.version).toBe(next.mcVersion);
    expect(map.dataset.compare).toBe('Before the move');
    expect(map.dataset.note).toContain(`on Minecraft ${release.mcVersion}`);
    // The after side is the moved copy: the field the new version dropped is gone.
    expect(map.textContent).not.toContain('default_block');
    // Neither version is set up here: both sides say they use stand-ins.
    expect(screen.getByTestId('upgrade-before-after-stand-ins-before').textContent).toContain(
      `Minecraft ${release.mcVersion} is not set up on this computer`,
    );
    expect(screen.getByTestId('upgrade-before-after-stand-ins-after')).toBeTruthy();
    // The text difference of its lowered files, under More options.
    const diff = within(pair).getByTestId('upgrade-before-after-diff');
    const removed = [...diff.querySelectorAll('[data-line="removed"]')].map(
      (line) => line.textContent,
    );
    expect(removed.some((line) => line?.includes('"default_block"'))).toBe(true);
  });

  it('says a loot table the move leaves alone looks the same, and draws nothing', async () => {
    const { session } = await openSampleWorldgen();
    session.addElement({ id: LOOT, kind: 'minecraft:loot_table', data: LOOT_DATA });
    await session.flushValidation();
    const dry = await session.upgradeReport(next.id);
    show(session, dry, itemOf(dry, LOOT));
    const pair = await openIt();
    expect(pair.dataset.same).toBe('yes');
    expect(screen.getByTestId('upgrade-before-after-same').textContent).toBe(
      'Looks the same: what MCSuperMods makes of it is the same on both versions.',
    );
    expect(screen.queryByTestId('stub-panel')).toBeNull();
  });

  it('draws a changed loot table twice, side by side, and with a slider on a narrow window', async () => {
    const { session } = await openSampleWorldgen();
    session.addElement({ id: LOOT, kind: 'minecraft:loot_table', data: LOOT_DATA });
    await session.flushValidation();
    const dry = withMovedData(await session.upgradeReport(next.id), LOOT, {
      ...LOOT_DATA,
      pools: [{ rolls: 2, entries: [{ type: 'minecraft:item', name: 'minecraft:apple' }] }],
    });
    show(session, dry, itemOf(dry, LOOT), { jars: [next.mcVersion] });
    const pair = await openIt();
    expect(pair.dataset.view).toBe('panel');
    const panels = await screen.findAllByTestId('stub-panel');
    expect(panels.map((panel) => panel.dataset.kind)).toEqual(['live_view', 'live_view']);
    expect(panels.map((panel) => panel.dataset.version)).toEqual([
      release.mcVersion,
      next.mcVersion,
    ]);
    expect(panels.map((panel) => panel.dataset.target)).toEqual([release.id, next.id]);
    // Only the newer version is set up: the before side says it uses stand-ins.
    expect(panels.map((panel) => panel.dataset.vanilla)).toEqual(['none', 'jar']);
    expect(screen.getByTestId('upgrade-before-after-stand-ins-before')).toBeTruthy();
    expect(screen.queryByTestId('upgrade-before-after-stand-ins-after')).toBeNull();
    expect(screen.getByTestId('upgrade-pair').dataset.layout).toBe('wide');
    expect(
      within(screen.getByTestId('upgrade-pair-before')).getByText(
        `Before the move, Minecraft ${release.mcVersion}`,
      ),
    ).toBeTruthy();
    expect(panels[1]?.textContent).toContain('"rolls":2');

    cleanup();
    setOpenPair(null);
    show(session, dry, itemOf(dry, LOOT), { layout: 'narrow' });
    await openIt();
    expect((await screen.findByTestId('upgrade-pair')).dataset.layout).toBe('narrow');
    const slider = screen.getByTestId('upgrade-pair-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '20' } });
    expect(screen.getByTestId('upgrade-pair-after').style.clipPath).toBe('inset(0 0 0 20%)');
  });

  it('draws a model with the preview panel on both versions', async () => {
    const { session } = await openSampleWorldgen();
    session.addElement({ id: MODEL, kind: 'minecraft:model', data: MODEL_DATA });
    await session.flushValidation();
    const dry = withMovedData(await session.upgradeReport(next.id), MODEL, {
      ...MODEL_DATA,
      textures: { all: 'minecraft:block/spruce_planks' },
    });
    show(session, dry, itemOf(dry, MODEL), { jars: [release.mcVersion, next.mcVersion] });
    const pair = await openIt();
    expect(pair.dataset.view).toBe('panel');
    const panels = await screen.findAllByTestId('stub-panel');
    expect(panels.map((panel) => panel.dataset.kind)).toEqual(['model', 'model']);
    expect(panels.map((panel) => panel.dataset.vanilla)).toEqual(['jar', 'jar']);
    expect(panels[0]?.textContent).toContain('oak_planks');
    expect(panels[1]?.textContent).toContain('spruce_planks');
    expect(screen.queryByTestId('upgrade-before-after-stand-ins-before')).toBeNull();
    const changed = within(pair).getAllByTestId('upgrade-before-after-diff-file');
    expect(changed.map((file) => file.dataset.status)).toEqual(['changed']);
  });

  it('falls back to the text difference for a thing with no live view, and says why', async () => {
    const { session } = await openSampleWorldgen();
    const kind = 'minecraft:lang';
    const id = 'msm_sample_worldgen:de_de' as ResourceLocation;
    session.addElement({ id, kind, data: { 'block.msm_sample_worldgen.crate': 'Crate' } });
    await session.flushValidation();
    const dry = withMovedData(await session.upgradeReport(next.id), id, {
      'block.msm_sample_worldgen.crate': 'Big crate',
    });
    const before = (session.snapshot.project as Project).namespaces
      .flatMap((namespace) => namespace.elements)
      .find((element) => element.id === id) as Element;
    expect(
      pairViewOf(
        before,
        session.snapshot.project as Project,
        session.registry.get(kind)?.previewKind,
      ),
    ).toBe('none');
    show(session, dry, itemOf(dry, id));
    const pair = await openIt();
    expect(pair.dataset.view).toBe('none');
    expect(screen.getByTestId('upgrade-before-after-no-view').textContent).toBe(
      'There is no picture of this kind of thing to show twice, so here is what changes in its files.',
    );
    // Shown openly, not under More options.
    expect(pair.querySelector('[data-more-options]')).toBeNull();
    const diff = within(pair).getByTestId('upgrade-before-after-diff');
    expect(diff.querySelector('[data-line="added"]')?.textContent).toContain('Big crate');
    expect(screen.queryByTestId('stub-panel')).toBeNull();
  });

  it('keeps one pair open at a time and follows edits', async () => {
    const { session } = await openSampleWorldgen({ hills: true });
    session.addElement({ id: LOOT, kind: 'minecraft:loot_table', data: LOOT_DATA });
    await session.flushValidation();
    const dry = withMovedData(await session.upgradeReport(next.id), LOOT, {
      ...LOOT_DATA,
      pools: [],
    });
    const host = hostOf(session);
    const project = session.snapshot.project as Project;
    const both = (move: UpgradeDryRun, state: Project) => (
      <>
        <div data-testid="first">
          <BeforeAfter host={host} project={state} move={move} item={itemOf(move, HILLS)} />
        </div>
        <div data-testid="second">
          <BeforeAfter host={host} project={state} move={move} item={itemOf(move, LOOT)} />
        </div>
      </>
    );
    const { rerender } = render(both(dry, project));
    const first = screen.getByTestId('first');
    const second = screen.getByTestId('second');
    fireEvent.click(within(first).getByTestId('upgrade-before-after-toggle'));
    await within(first).findByTestId('upgrade-before-after-pair');
    fireEvent.click(within(second).getByTestId('upgrade-before-after-toggle'));
    await within(second).findByTestId('upgrade-before-after-pair');
    expect(within(first).queryByTestId('upgrade-before-after-pair')).toBeNull();
    expect(
      within(first).getByTestId('upgrade-before-after-toggle').getAttribute('aria-expanded'),
    ).toBe('false');
    expect(openPair()).toContain(LOOT);

    // An edit: the loot table gets a second pool, and the open pair draws the new state.
    session.setElementValue(LOOT, '/pools/1', {
      rolls: 3,
      entries: [{ type: 'minecraft:item', name: 'minecraft:stick' }],
    });
    await session.flushValidation();
    const again = withMovedData(await session.upgradeReport(next.id), LOOT, {
      ...LOOT_DATA,
      pools: [],
    });
    rerender(both(again, session.snapshot.project as Project));
    await waitFor(() => {
      const panels = within(second).getAllByTestId('stub-panel');
      expect(panels[0]?.textContent).toContain('minecraft:stick');
    });
    // The next dry run's copy has the edit too: then the pair says it looks the same.
    rerender(both(await session.upgradeReport(next.id), session.snapshot.project as Project));
    await waitFor(() =>
      expect(within(second).getByTestId('upgrade-before-after-pair').dataset.same).toBe('yes'),
    );
    await act(async () => undefined);
  });

  it('lowers a project and its moved copy for the views, kept per state and target', async () => {
    const { session } = await openSampleWorldgen({ hills: true });
    const dry = await session.upgradeReport(next.id);
    const project = session.snapshot.project as Project;
    const before = await session.loweredElements(project, release.id);
    expect(session.loweredElements(project, release.id)).toBe(
      session.loweredElements(project, release.id),
    );
    const after = await session.loweredElements(dry.moved, next.id);
    expect(before.target.id).toBe(release.id);
    expect(after.target.id).toBe(next.id);
    const old = sideFiles(before.files.get(HILLS), dry.filesBefore);
    const moved = sideFiles(after.files.get(HILLS), dry.filesAfter);
    expect(old.map((file) => file.path)).toEqual(moved.map((file) => file.path));
    expect(JSON.stringify(old[0]?.contents)).toContain('default_block');
    expect(JSON.stringify(moved[0]?.contents)).not.toContain('default_block');
    expect(sameFiles(old, moved)).toBe(false);
    expect(fileDifferences(old, moved).map((file) => file.status)).toEqual(['changed']);
    await expect(session.loweredElements(project, 'no-such-target')).rejects.toThrow(
      'Unknown target',
    );
  });

  it('wires Minecraft changed these too over the moved copy', async () => {
    const { session } = await openSampleWorldgen();
    const igloo = 'minecraft:chests/igloo_chest' as ResourceLocation;
    expect(next.changes?.vanillaFiles?.changed).toContain(
      'data/minecraft/loot_table/chests/igloo_chest.json',
    );
    session.addElement({ id: igloo, kind: 'minecraft:loot_table', data: LOOT_DATA });
    await session.flushValidation();
    const dry = await session.upgradeReport(next.id);
    const host = hostOf(session);
    render(
      <MovedVanillaFiles host={host} project={session.snapshot.project as Project} move={dry} />,
    );
    const part = await screen.findByTestId('upgrade-vanilla-files');
    expect(within(part).getByTestId('upgrade-vanilla-file-0').dataset.change).toBe('changed');
    fireEvent.click(within(part).getByTestId('upgrade-vanilla-file-0-show'));
    expect(host.onShow).toHaveBeenCalledWith(igloo);
  });

  it('wires If you exported a Java project for a move up, and not for moving back', async () => {
    const { session } = await openSampleWorldgen();
    const dry = await session.upgradeReport(next.id);
    const host = hostOf(session);
    const saveFile = vi.fn(async () => null);
    const { rerender } = render(
      <MovedJavaProject host={host} move={dry} scanJavaProject={undefined} saveFile={saveFile} />,
    );
    expect(screen.getByTestId('upgrade-part-java-project')).toBeTruthy();
    expect(screen.getByTestId('upgrade-java-eject').textContent).toContain(
      `Minecraft ${next.mcVersion}`,
    );
    rerender(
      <MovedJavaProject
        host={host}
        move={{ ...dry, hops: [{ from: next.id, to: release.id, direction: 'down' }] }}
        scanJavaProject={undefined}
        saveFile={saveFile}
      />,
    );
    expect(screen.queryByTestId('upgrade-part-java-project')).toBeNull();
  });

  it('folds long runs of unchanged lines in the text difference', () => {
    const same = (text: string) => ({ type: 'same' as const, text });
    const lines = [
      ...Array.from({ length: 10 }, (_, index) => same(`a${index}`)),
      { type: 'removed' as const, text: 'old' },
      { type: 'added' as const, text: 'new' },
      ...Array.from({ length: 10 }, (_, index) => same(`b${index}`)),
    ];
    const folded = foldedLines(lines);
    expect(folded[0]).toEqual({ type: 'folded', count: 7 });
    expect(folded.filter((line) => line.type !== 'folded')).toHaveLength(8);
    expect(folded.at(-1)).toEqual({ type: 'folded', count: 7 });
  });
});
