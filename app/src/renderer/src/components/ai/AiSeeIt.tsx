/**
 * The AI review's **See it** pane (B615; ADR 0120 D7, ADR 0125 D3): the project as it would be
 * with every kept, fitting change applied (the state `planChangeItems` builds, so a changed
 * element shows its new look), one live view at a time with the other things in a strip, picked
 * by the names the proposal's cards use (`proposalNames`: its language files first). Deleted and
 * renamed elements are named in a line, not drawn; a rename is said in names in Very easy and
 * Easy and with both ids in Advanced. Unticking a
 * change takes it out of the picture 150 ms later; while the helper is still working the pane
 * says "More may follow". A proposal with nothing to picture says so in one line.
 *
 * Looking changes nothing: no session write, no preference write without a project folder, no
 * call to the AI service. The proposal's own pictures (its asset items) draw first, then the
 * project's files; without the Minecraft folder project-only data draws and the rest shows the
 * set-up banner.
 *
 * The seam for B688: {@link AiSeeIt} takes `{ project, items }`; {@link seeItPreview} is the
 * pure function building what it shows; the test ids are `ai-see-it`, `ai-see-it-thing-<n>` (from
 * 1), `ai-see-it-empty`, `ai-see-it-removed` and `ai-see-it-more`.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import { targetById } from '@msm/targets';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { type ChangeItem, planChangeItems } from '../../changeset/changeset';
import { LIVE_VIEW_DEBOUNCE_MS } from '../../liveviews/frame/live-data';
import { type LiveThing, liveThings, nothingToPicture } from '../../liveviews/live-things';
import { hasLiveView } from '../../liveviews/registry';
import type { VanillaAssetReader } from '../../preview/model-chain';
import { usePreferences } from '../../store/preferences';
import { useUiStore } from '../../store/ui-store';
import { thingName } from '../thing-picker/thing-sources';
import type { UiMode } from './ai-words';
import { proposalNames } from './proposal-things';

const LiveThings = lazy(() => import('../../liveviews/LiveThings'));

/** What the pane shows of a proposal. */
export interface SeeItPreview {
  /** The project with every kept, fitting change applied. */
  readonly project: Project;
  /** The things to picture, in proposal order. */
  readonly things: readonly LiveThing[];
  /** One plain phrase per deleted or renamed element ("Ruby Ore deleted"). */
  readonly removed: readonly string[];
  /** Kept, fitting changes with no view (files and elements), for the empty line. */
  readonly unpictured: number;
  /** The proposal's own files by path (`assets/<ns>/<path>`). */
  readonly files: ReadonlyMap<string, Uint8Array>;
}

/**
 * The removed line's phrase for a rename: "Old Stone renamed to Ruby Stone" (or "Old Stone
 * renamed" when the name stays) in Very easy and Easy, "demo:a renamed to demo:b" in Advanced.
 */
export function renameWords(
  item: ChangeItem,
  before: Project,
  after: Project,
  names: ReadonlyMap<string, string>,
  mode: UiMode,
): string {
  const from = item.from ?? item.elementId;
  const to = item.to ?? item.elementId;
  if (mode === 'advanced') return `${from ?? '?'} renamed to ${to ?? '?'}`;
  const old = from === undefined ? 'Something' : thingName(before, from);
  const now = to === undefined ? undefined : (names.get(to) ?? thingName(after, to));
  return now === undefined || now === old ? `${old} renamed` : `${old} renamed to ${now}`;
}

/** What {@link seeItPreview} shows; pure (the project is never changed). */
export function seeItPreview(
  project: Project,
  items: readonly ChangeItem[],
  mode: UiMode = 'easy',
): SeeItPreview {
  const plan = planChangeItems(project, items);
  const names = proposalNames(items);
  const applied = new Set(plan.applied);
  const ids: string[] = [];
  const removed: string[] = [];
  const files = new Map<string, Uint8Array>();
  let unpictured = 0;
  for (const item of items) {
    if (!applied.has(item.itemId)) continue;
    if (item.op === 'asset') {
      if (item.asset !== undefined) {
        files.set(`assets/${item.asset.namespace}/${item.asset.path}`, item.asset.bytes);
      }
      unpictured += 1;
    } else if (item.op === 'delete') {
      if (item.elementId !== undefined) {
        removed.push(`${thingName(project, item.elementId)} deleted`);
      }
    } else if (item.op === 'rename') {
      removed.push(renameWords(item, project, plan.state, names, mode));
    } else if (item.elementId !== undefined && item.kind !== undefined && hasLiveView(item.kind)) {
      ids.push(item.elementId);
    } else {
      unpictured += 1;
    }
  }
  const things = liveThings(plan.state, ids).map((thing) => {
    const name = names.get(thing.element.id);
    return name === undefined ? thing : { ...thing, name };
  });
  return { project: plan.state, things, removed, unpictured, files };
}

const identities = new WeakMap<object, number>();
let nextIdentity = 0;

/** A number per object, so a key changes when an item's data is replaced. */
function identity(value: unknown): number {
  if (typeof value !== 'object' || value === null) return -1;
  let id = identities.get(value);
  if (id === undefined) {
    nextIdentity += 1;
    id = nextIdentity;
    identities.set(value, id);
  }
  return id;
}

/**
 * What the pane draws of the items, as a key: the same items, ticks and data give the same key,
 * so a review that hands a new list on every render (a running proposal) does not restart the
 * 150 ms wait.
 */
export function itemsKey(items: readonly ChangeItem[]): string {
  return items
    .map(
      (item) =>
        `${item.itemId}|${item.op}|${item.accepted ? 1 : 0}|${item.conflict ?? ''}|${identity(item.after)}|${identity(item.asset)}`,
    )
    .join('\n');
}

/** Reads a file of the open project through the preload bridge, or `null`. */
async function readOpenProject(path: string): Promise<Uint8Array | null> {
  const msm = (window as Partial<Window>).msm;
  if (msm === undefined) return null;
  return await msm.fs.readFile(path).catch(() => null);
}

/** Props of {@link AiSeeIt}. */
export interface AiSeeItProps {
  readonly project: Project;
  readonly items: readonly ChangeItem[];
  /** Whether the helper is still proposing ("More may follow"). */
  readonly running?: boolean;
  /** Reads a project file by its path; default: the open project's, through the bridge. */
  readonly readProject?: (path: string) => Promise<Uint8Array | null>;
  /** Vanilla's pictures, or `null`; default: the jar cache when it is ready. */
  readonly vanillaAssets?: VanillaAssetReader | null;
  /** The project's folder; default: the open project's. */
  readonly projectRoot?: string | null;
  /** The view mode; default: the preference. */
  readonly mode?: UiMode;
}

/** The pane; see the module comment. */
export function AiSeeIt(props: AiSeeItProps) {
  const { project, items } = props;
  // The ticks are followed 150 ms after the last change; the first picture is drawn at once.
  const key = itemsKey(items);
  const latest = useRef(items);
  latest.current = items;
  const [shown, setShown] = useState({ key, items });
  useEffect(() => {
    if (shown.key === key) return;
    const timer = setTimeout(() => setShown({ key, items: latest.current }), LIVE_VIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, shown.key]);
  const preferred = usePreferences((state) => state.mode);
  const mode = props.mode ?? preferred;
  const preview = useMemo(() => seeItPreview(project, shown.items, mode), [project, shown, mode]);
  const openRoot = useUiStore((state) => state.snapshot?.root ?? null);
  const cacheReady = useUiStore((state) => state.minecraft.status?.cache != null);
  const targetId = project.targets[0];
  const mcVersion =
    targetId === undefined ? null : (targetById(targetId)?.target.mcVersion ?? null);
  const vanillaAssets = useMemo<VanillaAssetReader | null>(() => {
    if (props.vanillaAssets !== undefined) return props.vanillaAssets;
    const msm = (window as Partial<Window>).msm;
    return cacheReady && mcVersion !== null && msm !== undefined
      ? { readAsset: (path) => msm.minecraft.readAsset(mcVersion, path) }
      : null;
  }, [props.vanillaAssets, cacheReady, mcVersion]);
  const own = props.readProject ?? readOpenProject;
  const files = preview.files;
  const readProject = useMemo(
    () => async (path: string) => files.get(path) ?? (await own(path)),
    [files, own],
  );
  return (
    <section aria-label="See it" data-testid="ai-see-it" className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">See it</h4>
      {preview.things.length === 0 ? (
        <p className="text-xs text-muted" data-testid="ai-see-it-empty">
          {nothingToPicture(preview.unpictured)}
        </p>
      ) : (
        <Suspense fallback={<p className="text-xs text-muted">Loading the view…</p>}>
          <LiveThings
            project={preview.project}
            things={preview.things}
            testId="ai-see-it"
            vanillaAssets={vanillaAssets}
            mcVersion={mcVersion}
            projectRoot={props.projectRoot === undefined ? openRoot : props.projectRoot}
            readProject={readProject}
            onSetup={() =>
              useUiStore.getState().setMessage({
                kind: 'info',
                text: 'Set up your Minecraft folder in Settings, under Game locations, to see Minecraft’s own parts here.',
              })
            }
          />
        </Suspense>
      )}
      {preview.removed.length > 0 && (
        <p className="text-xs text-muted" data-testid="ai-see-it-removed">
          {`Not drawn: ${preview.removed.join('; ')}.`}
        </p>
      )}
      {props.running === true && (
        <p className="text-xs text-muted" data-testid="ai-see-it-more">
          More may follow.
        </p>
      )}
    </section>
  );
}
