/**
 * **Before and after** (ADR 0136 D13, brief B819): under each thing MCSuperMods changes for you
 * (the report's part 2), its own live view drawn twice: from the project as it is on its
 * version, and from the dry run's moved copy on the new one. As B810 V10 found, a view is a
 * function of a project and an element, so the after view is the same view given the moved
 * copy (and a reader of the new version's Minecraft files): no second lowering path into the
 * views and no second Try it world.
 *
 * - A thing the preview panel draws (a model, a loot table, any registered live view) is drawn
 *   by two preview panels, side by side, or one over the other with a slider on a narrow window
 *   (`before-after/PairLayout`).
 * - A world generation thing uses the live world map with "Before the move" in the compare
 *   view's place (`before-after/WorldgenPair`, a lazy chunk of its own).
 * - When the lowered files the view reads are the same on both sides, the report says it looks
 *   the same, in words, and draws nothing.
 * - A thing with no view shows the text difference of its lowered files and says why; for the
 *   others it is under More options.
 * - Minecraft's own pictures and files come from the user's installed game of each version;
 *   where a version is not set up its side uses stand-ins and says so.
 * - One pair is open at a time (the Showcase's rule): opening one closes the other.
 *
 * The pair follows edits: a new project state or a new dry run draws both sides again. This
 * module is a lazy chunk: nothing of it loads before a report shows.
 *
 * @packageDocumentation
 */

import type { UpgradeDoneItem } from '@msm/core';
import type { Element, Project, Target } from '@msm/plugin-api';
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import type { VanillaAssetReader } from '../../preview/model-chain';
import { PreviewPanel } from '../../preview/PreviewPanel';
import type { LoweredElements } from '../../session/project-session';
import type { WorldgenSession } from '../../terrain/files';
import type { MoveReport } from '../UpgradeTargetDialog';
import { MoreOptions } from '../ui/MoreOptions';
import type { UpgradeViewsHost } from './before-after/host';
import { PairLayout } from './before-after/PairLayout';
import {
  elementOf,
  fileDifferences,
  type PairView,
  pairViewOf,
  panelPreviewKind,
  sameFiles,
  sideFiles,
  usePair,
} from './before-after/sides';
import { TextDifference } from './before-after/TextDifference';
import { thingName } from './parts/shared';

export type { UpgradeViewsHost } from './before-after/host';
export { MovedVanillaFiles } from './before-after/MovedVanillaFiles';

const WorldgenPair = lazy(() => import('./before-after/WorldgenPair'));

/** Props of {@link BeforeAfter}. */
export interface BeforeAfterProps {
  readonly host: UpgradeViewsHost;
  /** The project as it is now. */
  readonly project: Project;
  /** The dry run the report is of (its moved copy and lowered files). */
  readonly move: MoveReport;
  /** The thing of part 2. */
  readonly item: UpgradeDoneItem;
  /** Test hook: the layout of two views (default: by the width there is). */
  readonly layout?: 'wide' | 'narrow';
}

/** Whether the user's Minecraft files of `mcVersion` are set up: a reader of them, or `null`. */
function useVanilla(
  host: UpgradeViewsHost,
  mcVersion: string,
): { state: 'checking' | 'ready' | 'missing'; reader: VanillaAssetReader | null } {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    setReady(null);
    host.minecraftStatus(mcVersion).then(
      (status) => {
        if (live) setReady(status.cache !== undefined && status.cache !== null);
      },
      () => {
        if (live) setReady(false);
      },
    );
    return () => {
      live = false;
    };
  }, [host, mcVersion]);
  const reader = useMemo<VanillaAssetReader | null>(
    () => (ready === true ? { readAsset: (path) => host.readVanillaAsset(mcVersion, path) } : null),
    [ready, host, mcVersion],
  );
  return { state: ready === null ? 'checking' : ready ? 'ready' : 'missing', reader };
}

/** One side as the views draw it. */
interface Side {
  readonly project: Project;
  readonly element: Element | undefined;
  readonly lowered: LoweredElements;
}

type Sides =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; before: Side; after: Side };

/** The thing's pair: a button, and the two views while open. */
export default function BeforeAfter(props: BeforeAfterProps) {
  const { item, move, project } = props;
  const key = `${move.report.from.targetId}>${move.report.to.targetId}:${item.elementId}`;
  const [open, setOpen] = usePair(key);
  // A pair that goes away (the report closed, the thing fixed) is no longer the open one.
  useEffect(() => () => setOpen(false), [setOpen]);
  const name = thingName(project, item.elementId);
  return (
    <div className="flex flex-col gap-1.5 pl-1" data-testid="upgrade-before-after">
      <button
        type="button"
        className="cursor-pointer self-start rounded px-1.5 py-0.5 text-accent text-xs underline-offset-2 hover:underline"
        aria-expanded={open}
        aria-label={open ? `Hide ${name} before and after` : `See ${name} before and after`}
        data-testid="upgrade-before-after-toggle"
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide before and after' : 'See it before and after'}
      </button>
      {open && <Pair {...props} name={name} />}
    </div>
  );
}

/** The two sides of an open pair. */
function Pair(props: BeforeAfterProps & { name: string }) {
  const { host, item, move, project, name } = props;
  const { from, to } = move.report;
  const moved = move.moved;
  const [sides, setSides] = useState<Sides>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    if (moved === undefined) {
      setSides({ state: 'failed', message: 'the moved copy is not there' });
      return;
    }
    Promise.all([
      host.loweredElements(project, from.targetId),
      host.loweredElements(moved, to.targetId),
    ]).then(
      ([before, after]) => {
        if (!live) return;
        setSides({
          state: 'ready',
          before: { project, element: elementOf(project, item.elementId), lowered: before },
          after: { project: moved, element: elementOf(moved, item.elementId), lowered: after },
        });
      },
      (error: unknown) => {
        if (live) {
          setSides({
            state: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [host, project, moved, from.targetId, to.targetId, item.elementId]);
  const beforeJar = useVanilla(host, from.mcVersion);
  const afterJar = useVanilla(host, to.mcVersion);

  if (sides.state === 'loading') {
    return (
      <p className="text-muted text-xs" role="status" data-testid="upgrade-before-after-loading">
        Making it on both versions…
      </p>
    );
  }
  if (sides.state === 'failed') {
    return (
      <p className="text-error text-xs" role="alert" data-testid="upgrade-before-after-failed">
        {`It could not be made on both versions: ${sides.message}`}
      </p>
    );
  }
  const { before, after } = sides;
  const beforeFiles = sideFiles(before.lowered.files.get(item.elementId), move.filesBefore);
  const afterFiles = sideFiles(after.lowered.files.get(item.elementId), move.filesAfter);
  const differences = fileDifferences(beforeFiles, afterFiles);
  const same = after.element !== undefined && sameFiles(beforeFiles, afterFiles);
  const shown = after.element ?? before.element;
  const view: PairView =
    shown === undefined
      ? 'none'
      : pairViewOf(shown, after.project, host.registry.get(shown.kind)?.previewKind);
  const beforeLabel = `Before the move, Minecraft ${from.mcVersion}`;
  const afterLabel = `After the move, Minecraft ${to.mcVersion}`;
  const text = <TextDifference differences={differences} testId="upgrade-before-after-diff" />;

  let body: ReactNode;
  if (after.element === undefined) {
    body = (
      <p className="text-sm" data-testid="upgrade-before-after-gone">
        {`${name} is not in your mod after the move, so there is nothing to show on the new version.`}
      </p>
    );
  } else if (same) {
    body = (
      <p className="text-sm" data-testid="upgrade-before-after-same">
        Looks the same: what MCSuperMods makes of it is the same on both versions.
      </p>
    );
  } else if (view === 'none' || before.element === undefined) {
    body = (
      <>
        <p className="text-sm" data-testid="upgrade-before-after-no-view">
          {before.element === undefined
            ? 'It is new after the move, so there is no before to show. Here is what it makes.'
            : 'There is no picture of this kind of thing to show twice, so here is what changes in its files.'}
        </p>
        {text}
      </>
    );
  } else {
    const missing = [
      beforeJar.state === 'missing' ? { version: from.mcVersion, side: 'before' } : null,
      afterJar.state === 'missing' ? { version: to.mcVersion, side: 'after' } : null,
    ].filter((entry): entry is { version: string; side: string } => entry !== null);
    body = (
      <>
        {missing.map((entry) => (
          <p
            key={entry.side}
            className="text-muted text-xs"
            data-testid={`upgrade-before-after-stand-ins-${entry.side}`}
          >
            {`Minecraft ${entry.version} is not set up on this computer, so the ${entry.side} side uses stand-ins where it needs Minecraft's own pictures or files.`}
          </p>
        ))}
        {view === 'worldgen' ? (
          <Suspense fallback={<p className="text-muted text-xs">Loading the map…</p>}>
            <WorldgenPair
              registry={host.registry}
              project={before.project}
              from={before.lowered.target}
              moved={after.project}
              to={after.lowered.target}
              before={before.element}
              after={after.element}
              beforeLabel={beforeLabel}
              afterLabel={afterLabel}
              beforeNote={`Your mod as it is now, on Minecraft ${from.mcVersion}, at the same seed and place.`}
              vanillaReady={afterJar.state === 'ready'}
              root={host.projectRoot}
              onSetup={host.onSetup}
              {...(props.layout === undefined ? {} : { layout: props.layout })}
            />
          </Suspense>
        ) : (
          <PairLayout
            beforeLabel={beforeLabel}
            afterLabel={afterLabel}
            {...(props.layout === undefined ? {} : { layout: props.layout })}
            before={
              <PanelSide
                host={host}
                project={before.project}
                element={before.element}
                target={before.lowered.target}
                vanilla={beforeJar.reader}
              />
            }
            after={
              <PanelSide
                host={host}
                project={after.project}
                element={after.element}
                target={after.lowered.target}
                vanilla={afterJar.reader}
              />
            }
          />
        )}
      </>
    );
  }
  return (
    <div
      className="flex flex-col gap-2 rounded border border-border p-2"
      data-testid="upgrade-before-after-pair"
      data-view={view}
      data-same={same ? 'yes' : 'no'}
    >
      {body}
      {view === 'none' || before.element === undefined ? null : (
        <MoreOptions storageKey="upgrade-before-after-text">
          <p className="text-muted text-xs">What changes in the files it makes:</p>
          {text}
        </MoreOptions>
      )}
    </div>
  );
}

/** One side drawn by the preview panel, with that side's project, target and Minecraft files. */
function PanelSide(props: {
  host: UpgradeViewsHost;
  project: Project;
  element: Element;
  target: Target;
  vanilla: VanillaAssetReader | null;
}) {
  const { host, project, element, target } = props;
  // The panel reads the version of a live view's Minecraft files from the session it is given.
  const session = useMemo<WorldgenSession>(
    () => ({
      snapshot: { project },
      subscribe: () => () => undefined,
      registry: host.registry,
      target,
    }),
    [project, host.registry, target],
  );
  return (
    <PreviewPanel
      key={`${target.id} ${element.kind} ${element.id}`}
      project={project}
      element={element}
      previewKind={panelPreviewKind(element.kind, host.registry.get(element.kind)?.previewKind)}
      folders={target.folders.resource}
      readProjectAsset={host.readProjectAsset}
      vanilla={props.vanilla}
      onSetup={host.onSetup}
      terrainSession={session}
      projectRoot={host.projectRoot}
      {...(host.webgl === undefined ? {} : { webgl: host.webgl })}
    />
  );
}
