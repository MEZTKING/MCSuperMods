/**
 * The Creator's side of the shared changeset (ADR 0043 D3, D4): a flow's bundle becomes change
 * items stamped with `meta.creator`, and a reopened set is planned against the project by the
 * kept-edits rule. Generators are pure, so the output of the stored values is rebuilt rather
 * than stored: an element whose current data equals what the flow makes for its stored values
 * is untouched and may be replaced; anything else was edited by hand and is kept unless the
 * user ticks "Overwrite". Assets follow the same rule by bytes.
 *
 * Language files and tags are shared by many sets, so an id that already exists in one of
 * those kinds is merged (missing keys or values added, nothing overwritten) instead of being
 * skipped as a conflict.
 *
 * No DOM access; testable with plain projects.
 *
 * @packageDocumentation
 */

import {
  type Element,
  type ElementCreatorMeta,
  type Json,
  type Project,
  type ResourceLocation,
  stableStringify,
} from '@msm/core';
import type { ContentBundle, ProjectStarter, TargetFacts } from '@msm/plugin-api';
import { isMergeableKind, mergeShared, SINGLETON_KINDS } from '../session/element-defaults';
import {
  type ChangeAsset,
  type ChangeItem,
  type NewChangeItem,
  PendingChangeset,
  sameJson,
} from './changeset';

export { isMergeableKind, mergeShared, SINGLETON_KINDS };

/** The values `meta.creator` stores (the JSON a flow's parameters produce). */
export type CreatorValues = ElementCreatorMeta['values'];

/** What every element of one Create shares. */
export interface CreatorStamp {
  flowId: string;
  setId: string;
  values: CreatorValues;
}

/** What happens to one element or asset when the plan is applied. */
export type CreatorEntryStatus =
  /** A new element or asset. */
  | 'create'
  /** An untouched element of the set, rewritten with the new output. */
  | 'replace'
  /** Already what the flow makes; only the stored values change. */
  | 'unchanged'
  /** Edited by hand: kept unless the user ticks "Overwrite". */
  | 'keep'
  /** An untouched element the new values no longer make: removed. */
  | 'remove'
  /** An edited element the new values no longer make: kept unless overwritten (removed). */
  | 'keep-removed'
  /** A shared language file or tag: the missing keys or values are added. */
  | 'merge'
  /** The id or file exists outside the set: skipped. */
  | 'conflict'
  /** An asset the new values no longer use; assets are never removed by the Creator. */
  | 'unused';

/** One row of the plan (the Creator's Elements tab). */
export interface CreatorEntry {
  /** The element id (its current id when renamed), or `<namespace>:<path>` for an asset. */
  key: string;
  status: CreatorEntryStatus;
  /** The element kind; absent for an asset. */
  kind?: string;
  /** The asset file; absent for an element. */
  asset?: { namespace: string; path: string };
  /** The id the flow produces, when it differs from {@link key} (a renamed element). */
  generatedId?: string;
  /** The element's data now (or the asset's bytes). */
  current?: Json;
  /** What the new values make. */
  next?: Json;
  /** Why the entry is a conflict, or what a merge adds. */
  note?: string;
  /** The change applied by default. */
  change?: CreatorChange;
  /** The change applied when the user overwrites a kept entry. */
  overwrite?: CreatorChange;
}

/** A change of one entry: a change item or an asset byte write. */
export type CreatorChange = { item: NewChangeItem } | { write: ChangeAsset };

/** A planned Create (new set) or Update (reopened set). */
export interface CreatorPlan {
  mode: 'create' | 'update';
  /** The stamp written on every element the plan creates or replaces. */
  stamp: CreatorStamp;
  entries: CreatorEntry[];
}

/** The changes of a plan, ready for {@link applyCreatorPlan}. */
export interface CreatorChanges {
  items: NewChangeItem[];
  /** Bytes written over assets the project already records (replaced untouched textures). */
  writes: ChangeAsset[];
}

/** The project's element of a singleton kind, if any. */
function singletonOf(project: Project, kind: string): Element | undefined {
  return SINGLETON_KINDS.includes(kind)
    ? elementsOf(project).find((element) => element.kind === kind)
    : undefined;
}

/** Keeps the parameter values `meta.creator` can store. */
export function creatorValues(values: Readonly<Record<string, Json>>): CreatorValues {
  const out: CreatorValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
      out[key] = [...(value as string[])];
    }
  }
  return out;
}

/** The `meta.creator` of one generated element. */
export function creatorMeta(stamp: CreatorStamp, generatedId: string): ElementCreatorMeta {
  return {
    flowId: stamp.flowId,
    setId: stamp.setId,
    values: structuredClone(stamp.values),
    generatedId,
  };
}

/**
 * Stamps every `create` item with `meta.creator` (its `generatedId` the item's id). Used by the
 * AI helper's `add_starter` for flows, so its sets reopen in the Creator (ADR 0043 D5).
 */
export function stampItems(items: readonly NewChangeItem[], stamp: CreatorStamp): NewChangeItem[] {
  return items.map((item) =>
    item.op === 'create' && item.elementId !== undefined
      ? { ...item, meta: { ...item.meta, creator: creatorMeta(stamp, item.elementId) } }
      : item,
  );
}

function elementsOf(project: Project): Element[] {
  return project.namespaces.flatMap((namespace) => namespace.elements);
}

function findElement(project: Project, id: string): Element | undefined {
  return elementsOf(project).find((element) => element.id === id);
}

function hasAssetRecord(project: Project, namespace: string, path: string): boolean {
  return (
    project.namespaces
      .find((entry) => entry.name === namespace)
      ?.assets.some((asset) => asset.path === path) ?? false
  );
}

function sameBytes(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (a == null || b == null) return false;
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** The entry of a bundle element whose id exists outside the set. */
function existingEntry(
  existing: Element,
  entry: { id: string; kind: string; data: Json },
): CreatorEntry {
  if (existing.kind === entry.kind && isMergeableKind(entry.kind)) {
    const merged = mergeShared(entry.kind, existing.data, entry.data);
    if (sameJson(merged, existing.data)) {
      return { key: existing.id, kind: entry.kind, status: 'unchanged', current: existing.data };
    }
    return {
      key: existing.id,
      kind: entry.kind,
      status: 'merge',
      current: existing.data,
      next: merged,
      note: 'Adds what is missing to the existing file.',
      change: {
        item: {
          op: 'update',
          elementId: existing.id,
          kind: entry.kind,
          before: structuredClone(existing.data),
          after: merged,
        },
      },
    };
  }
  return {
    key: existing.id,
    kind: existing.kind,
    status: 'conflict',
    current: existing.data,
    next: entry.data,
    note: `${existing.id} is already in the project, so it is skipped.`,
  };
}

/**
 * The plan of a new set: every bundle element is created (stamped with `meta.creator`), every
 * asset added; ids and files the project already has are conflicts (shared language files and
 * tags are merged instead).
 *
 * @throws Error If an element's kind is unknown.
 */
export function planCreate(
  bundle: ContentBundle,
  project: Project,
  stamp: CreatorStamp,
  isKnownKind: (kind: string) => boolean,
): CreatorPlan {
  const entries: CreatorEntry[] = [];
  const seen = new Set<string>();
  for (const entry of bundle.elements) {
    if (!isKnownKind(entry.kind)) {
      throw new Error(`Unknown element kind ${JSON.stringify(entry.kind)} for ${entry.id}.`);
    }
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(newEntry(project, entry, stamp));
  }
  const seenAssets = new Set<string>();
  for (const asset of bundle.assets) {
    const key = `${asset.namespace}:${asset.path}`;
    if (seenAssets.has(key)) continue;
    seenAssets.add(key);
    const file = { namespace: asset.namespace, path: asset.path };
    if (hasAssetRecord(project, asset.namespace, asset.path)) {
      entries.push({
        key,
        asset: file,
        status: 'conflict',
        note: `assets/${asset.namespace}/${asset.path} is already in the project, so it is skipped.`,
      });
      continue;
    }
    entries.push({
      key,
      asset: file,
      status: 'create',
      next: null,
      change: { item: { op: 'asset', asset: { ...file, bytes: asset.bytes } } },
    });
  }
  return { mode: 'create', stamp, entries };
}

/**
 * A new set's bundle as change items stamped with `meta.creator` (the `add_starter` conversion
 * plus the stamp): {@link planCreate}'s default changes.
 *
 * @throws Error If an element's kind is unknown.
 */
export function bundleToChangeItems(
  bundle: ContentBundle,
  project: Project,
  stamp: CreatorStamp,
  isKnownKind: (kind: string) => boolean,
): NewChangeItem[] {
  return creatorChanges(planCreate(bundle, project, stamp, isKnownKind)).items;
}

/** The entry of a bundle element the set does not have yet. */
function newEntry(
  project: Project,
  entry: { id: string; kind: string; data: Json; notes?: string; tags?: string[] },
  stamp: CreatorStamp,
): CreatorEntry {
  const existing = findElement(project, entry.id);
  if (existing !== undefined) return existingEntry(existing, entry);
  const single = singletonOf(project, entry.kind);
  if (single !== undefined) {
    return {
      key: entry.id,
      kind: entry.kind,
      status: 'conflict',
      next: entry.data,
      note: `The project already has ${single.id}, and it holds only one.`,
    };
  }
  return createEntry(entry, stamp);
}

function createEntry(
  entry: { id: string; kind: string; data: Json; notes?: string; tags?: string[] },
  stamp: CreatorStamp,
): CreatorEntry {
  return {
    key: entry.id,
    kind: entry.kind,
    status: 'create',
    next: entry.data,
    change: {
      item: {
        op: 'create',
        elementId: entry.id as ResourceLocation,
        kind: entry.kind,
        after: structuredClone(entry.data),
        meta: {
          ...(entry.notes === undefined ? {} : { notes: entry.notes }),
          ...(entry.tags === undefined ? {} : { tags: [...entry.tags] }),
          creator: creatorMeta(stamp, entry.id),
        },
      },
    },
  };
}

/** The elements of one Creator set (matched by flow and set id). */
export function creatorSetElements(project: Project, flowId: string, setId: string): Element[] {
  return elementsOf(project).filter(
    (element) => element.meta.creator?.flowId === flowId && element.meta.creator.setId === setId,
  );
}

/** What {@link reopenPlan} needs. */
export interface ReopenInput {
  project: Project;
  flow: ProjectStarter;
  setId: string;
  /** The namespace the set was built for (the namespace of its generated ids). */
  namespace: string;
  /** The values the set was opened with (the clicked element's `meta.creator.values`). */
  storedValues: Readonly<Record<string, Json>>;
  /** The values the user chose now. */
  newValues: Readonly<Record<string, Json>>;
  target: TargetFacts;
  isKnownKind(kind: string): boolean;
  /** Reads a project asset's bytes, or `null` when the file is missing. */
  readAsset(namespace: string, path: string): Promise<Uint8Array | null>;
  /** Builds the bundle of `values` (default `flow.build`); tests may count calls. */
  build?(values: Readonly<Record<string, Json>>): Promise<ContentBundle> | ContentBundle;
}

/**
 * The plan of a reopened set (ADR 0043 D4). For each element the flow makes now:
 *
 * - the set's element (matched by `meta.creator.generatedId`, so a renamed one still counts)
 *   is **untouched** when its data equals what the flow makes for its own stored values: it is
 *   replaced (`replace`, or `unchanged` when the output did not change); otherwise it was
 *   edited and is **kept** (`keep`, overwrite to replace);
 * - an id the set does not have is created (`create`), or a `conflict` when it exists outside
 *   the set (shared language files and tags are merged);
 *
 * then each element of the set the new values no longer make is removed when untouched
 * (`remove`) or kept (`keep-removed`, overwrite to remove). Assets compare by bytes: an
 * untouched file is rewritten, an edited one kept; files no longer made are left (`unused`).
 */
export async function reopenPlan(input: ReopenInput): Promise<CreatorPlan> {
  const { project, flow, setId, namespace, target } = input;
  const build =
    input.build ??
    ((values: Readonly<Record<string, Json>>) =>
      flow.build({ namespace, projectName: project.name, target, values }));
  const cache = new Map<string, Promise<ContentBundle>>();
  const bundleFor = (values: Readonly<Record<string, Json>>): Promise<ContentBundle> => {
    const key = stableStringify(values as Json);
    let found = cache.get(key);
    if (found === undefined) {
      found = Promise.resolve(build(values));
      cache.set(key, found);
    }
    return found;
  };
  const stamp: CreatorStamp = { flowId: flow.id, setId, values: creatorValues(input.newValues) };
  const next = await bundleFor(input.newValues);
  const previous = await bundleFor(input.storedValues);
  const setElements = creatorSetElements(project, flow.id, setId);
  const byGenerated = new Map<string, Element>();
  for (const element of setElements) {
    byGenerated.set(element.meta.creator?.generatedId ?? element.id, element);
  }
  const previousData = async (element: Element): Promise<Json | undefined> => {
    const meta = element.meta.creator;
    const values = meta?.values ?? input.storedValues;
    const bundle = await bundleFor(values as Record<string, Json>);
    return bundle.elements.find((entry) => entry.id === (meta?.generatedId ?? element.id))?.data;
  };

  const entries: CreatorEntry[] = [];
  const consumed = new Set<string>();
  const seen = new Set<string>();
  for (const entry of next.elements) {
    if (!input.isKnownKind(entry.kind)) {
      throw new Error(`Unknown element kind ${JSON.stringify(entry.kind)} for ${entry.id}.`);
    }
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const own = byGenerated.get(entry.id);
    if (own === undefined) {
      entries.push(newEntry(project, entry, stamp));
      continue;
    }
    consumed.add(own.id);
    const renamed = own.id === entry.id ? {} : { generatedId: entry.id };
    const replace: CreatorChange = {
      item: {
        op: 'update',
        elementId: own.id,
        kind: own.kind,
        before: structuredClone(own.data),
        after: structuredClone(entry.data),
        meta: { creator: creatorMeta(stamp, entry.id) },
      },
    };
    const before = await previousData(own);
    if (before !== undefined && sameJson(own.data, before)) {
      entries.push({
        key: own.id,
        kind: own.kind,
        ...renamed,
        status: sameJson(own.data, entry.data) ? 'unchanged' : 'replace',
        current: own.data,
        next: entry.data,
        change: replace,
      });
      continue;
    }
    if (isMergeableKind(own.kind) && own.kind === entry.kind) {
      const merged = mergeShared(own.kind, own.data, entry.data);
      const changed = !sameJson(merged, own.data);
      entries.push({
        key: own.id,
        kind: own.kind,
        ...renamed,
        status: changed ? 'merge' : 'keep',
        current: own.data,
        next: entry.data,
        ...(changed
          ? {
              note: 'Adds what is missing to your edited file.',
              change: {
                item: {
                  op: 'update',
                  elementId: own.id,
                  kind: own.kind,
                  before: structuredClone(own.data),
                  after: merged,
                },
              },
            }
          : {}),
        overwrite: replace,
      });
      continue;
    }
    entries.push({
      key: own.id,
      kind: own.kind,
      ...renamed,
      status: 'keep',
      current: own.data,
      next: entry.data,
      overwrite: replace,
    });
  }
  for (const element of setElements) {
    if (consumed.has(element.id)) continue;
    const remove: CreatorChange = {
      item: {
        op: 'delete',
        elementId: element.id,
        kind: element.kind,
        before: structuredClone(element.data),
      },
    };
    const generated = element.meta.creator?.generatedId ?? element.id;
    const before = await previousData(element);
    const untouched = before !== undefined && sameJson(element.data, before);
    entries.push({
      key: element.id,
      kind: element.kind,
      ...(generated === element.id ? {} : { generatedId: generated }),
      status: untouched ? 'remove' : 'keep-removed',
      current: element.data,
      ...(untouched ? { change: remove } : { overwrite: remove }),
    });
  }

  const seenAssets = new Set<string>();
  for (const asset of next.assets) {
    const key = `${asset.namespace}:${asset.path}`;
    if (seenAssets.has(key)) continue;
    seenAssets.add(key);
    const file = { namespace: asset.namespace, path: asset.path };
    const write: CreatorChange = { write: { ...file, bytes: asset.bytes } };
    if (!hasAssetRecord(project, asset.namespace, asset.path)) {
      entries.push({
        key,
        asset: file,
        status: 'create',
        change: { item: { op: 'asset', asset: { ...file, bytes: asset.bytes } } },
      });
      continue;
    }
    const disk = await input.readAsset(asset.namespace, asset.path).catch(() => null);
    const old = previous.assets.find(
      (entry) => entry.namespace === asset.namespace && entry.path === asset.path,
    )?.bytes;
    if (sameBytes(disk, asset.bytes)) {
      entries.push({ key, asset: file, status: 'unchanged' });
    } else if (sameBytes(disk, old)) {
      entries.push({ key, asset: file, status: 'replace', change: write });
    } else {
      entries.push({ key, asset: file, status: 'keep', overwrite: write });
    }
  }
  for (const asset of previous.assets) {
    const key = `${asset.namespace}:${asset.path}`;
    if (seenAssets.has(key) || !hasAssetRecord(project, asset.namespace, asset.path)) continue;
    seenAssets.add(key);
    entries.push({
      key,
      asset: { namespace: asset.namespace, path: asset.path },
      status: 'unused',
      note: 'No longer used by the set; left in the project.',
    });
  }
  return { mode: 'update', stamp, entries };
}

/**
 * The changes of a plan: each entry's default change, or its overwrite change when its key is
 * in `overwrite`. Element items come first in plan order, then asset items.
 */
export function creatorChanges(
  plan: CreatorPlan,
  overwrite: ReadonlySet<string> = new Set(),
): CreatorChanges {
  const elements: NewChangeItem[] = [];
  const assets: NewChangeItem[] = [];
  const writes: ChangeAsset[] = [];
  for (const entry of plan.entries) {
    const change =
      overwrite.has(entry.key) && entry.overwrite !== undefined ? entry.overwrite : entry.change;
    if (change === undefined) continue;
    if ('write' in change) writes.push(change.write);
    else if (change.item.op === 'asset') assets.push(change.item);
    else elements.push(change.item);
  }
  return { items: [...elements, ...assets], writes };
}

/** The undo label of a Create or Update (ADR 0043 D3, D4). */
export function creatorLabel(plan: CreatorPlan, flowTitle: string): string {
  return `${plan.mode === 'create' ? 'Create' : 'Update'} ${flowTitle}`;
}

/** What {@link applyCreatorPlan} needs of the session. */
export interface CreatorApplyHost {
  /** `ProjectSession.applyChangeset`; `options.writes` must be applied in the same undo step. */
  applyChangeset(
    items: readonly ChangeItem[],
    label: string,
    options?: { writes?: readonly ChangeAsset[] },
  ): Promise<{ applied: string[]; skipped: string[]; written?: string[] }>;
}

/** The outcome of {@link applyCreatorPlan}. */
export interface CreatorApplyResult {
  /** Change items applied (elements and new assets). */
  applied: number;
  /** Accepted items that no longer fit the project. */
  skipped: number;
  /** Asset files rewritten. */
  written: number;
}

/**
 * Applies a plan: every change item and the bytes of replaced assets go in through
 * `applyChangeset` as one undo step labelled `label`, so Undo also restores the old bytes
 * (ADR 0045). The records of replaced assets do not change.
 *
 * @throws Error If an asset write is refused (nothing is applied then).
 */
export async function applyCreatorPlan(
  host: CreatorApplyHost,
  changes: CreatorChanges,
  label: string,
): Promise<CreatorApplyResult> {
  const items = new PendingChangeset().add(...changes.items);
  if (items.length === 0 && changes.writes.length === 0) {
    return { applied: 0, skipped: 0, written: 0 };
  }
  const result = await host.applyChangeset(items, label, { writes: changes.writes });
  return {
    applied: result.applied.length,
    skipped: result.skipped.length,
    written: result.written?.length ?? changes.writes.length,
  };
}

/** The namespace of a resource location. */
export function namespaceOfId(id: ResourceLocation | string): string {
  const colon = id.indexOf(':');
  return colon < 0 ? 'minecraft' : id.slice(0, colon);
}
