/**
 * The pending changeset (ADR 0041 D5, shared with the Creator, ADR 0043): proposed edits that
 * the user reviews and applies as one undo step. Each {@link ChangeItem} is one create,
 * update, delete, rename or asset, with a before/after view, the problems the last check found
 * for it and, when it no longer fits the project, a conflict note.
 *
 * Items are evaluated in order: each one is checked against the project with every earlier
 * accepted, non-conflicting item applied, so an item may build on an earlier one (a rename,
 * then an update of the new id). The same evaluation ({@link planChangeItems}) builds the
 * scratch project the checks run over and the commands `session.applyChangeset` executes, so
 * what the user reviews is exactly what is applied.
 *
 * No DOM access; testable with plain projects.
 *
 * @packageDocumentation
 */

import {
  CommandStack,
  commands,
  createElement,
  type Element,
  type ElementCreatorMeta,
  isValidNamespace,
  type Json,
  mediaTypeForPath,
  type Problem,
  type Project,
  type ProjectCommand,
  type Reference,
  type ResourceLocation,
  stableStringify,
} from '@msm/core';
import type { ContentBundle } from '@msm/plugin-api';

/** What a change item does. */
export type ChangeOp = 'create' | 'update' | 'delete' | 'rename' | 'asset';

/** Every operation, in review order. */
export const CHANGE_OPS: readonly ChangeOp[] = Object.freeze([
  'create',
  'update',
  'delete',
  'rename',
  'asset',
]);

/** The bytes of an `asset` item; `path` is relative to `assets/<namespace>/`. */
export interface ChangeAsset {
  namespace: string;
  /** For example `textures/block/ruby_ore.png`. */
  path: string;
  bytes: Uint8Array;
}

/** Element metadata a `create` item writes (bundle notes and tags, the Creator's stamp). */
export interface ChangeItemMeta {
  notes?: string;
  tags?: string[];
  creator?: ElementCreatorMeta;
}

/** One proposed edit. */
export interface ChangeItem {
  /** Unique within the changeset. */
  itemId: string;
  op: ChangeOp;
  /**
   * The element the item creates, changes or deletes; for a rename the new id (`to`). Absent
   * for an asset.
   */
  elementId?: ResourceLocation;
  /** The element's kind (absent for an asset). */
  kind?: string;
  /** The element data the item expects to find (update, delete, rename). */
  before?: Json;
  /** The element data after the item (create, update). */
  after?: Json;
  /** A rename's old id. */
  from?: ResourceLocation;
  /** A rename's new id. */
  to?: ResourceLocation;
  /** An asset item's file. */
  asset?: ChangeAsset;
  /** Metadata of a created element. */
  meta?: ChangeItemMeta;
  /** Whether the user keeps the item (all items start accepted). */
  accepted: boolean;
  /** The problems the last check (`run_checks`) found for the item's element. */
  problems: Problem[];
  /** Why the item no longer fits the project; it is then not applied. */
  conflict?: string;
}

/** A new item before the changeset gives it an id. */
export type NewChangeItem = Omit<ChangeItem, 'itemId' | 'accepted' | 'problems' | 'conflict'>;

/** Hooks of {@link planChangeItems}. */
export interface ChangesetPlanOptions {
  /** Clock for element timestamps. */
  now?: () => string;
  /**
   * The references a rename of `from` must rewrite in `state` (the session's F2 rename
   * logic). Without it a rename rewrites no references.
   */
  renameReferences?: (state: Project, from: ResourceLocation) => Reference[];
  /** Whether a file already exists at `assets/<namespace>/<path>` (beyond the records). */
  assetExists?: (namespace: string, path: string) => boolean;
}

/** An item that was not applied, with the reason. */
export interface SkippedChange {
  itemId: string;
  reason: string;
}

/** The outcome of {@link planChangeItems}. */
export interface ChangesetPlan {
  /** The project with every applied item. */
  state: Project;
  /** One command per applied item, in order; replaying them on the input project gives `state`. */
  commands: ProjectCommand[];
  /** Applied item ids, in order. */
  applied: string[];
  /** Items that conflict with the project (or with an earlier item) and were left out. */
  skipped: SkippedChange[];
}

/** Counts of a changeset for the project summary and the run's context block. */
export interface ChangesetSummary {
  total: number;
  accepted: number;
  /** Items with a conflict note (from the last {@link PendingChangeset.markConflicts}). */
  conflicts: number;
  byOp: Record<ChangeOp, number>;
  /** Element items per kind (assets are not counted here). */
  byKind: Record<string, number>;
  /** One line for the model, or `''` when the changeset is empty. */
  text: string;
}

function namespaceOf(id: string): string {
  return id.slice(0, id.indexOf(':'));
}

function findElement(project: Project, id: string): Element | undefined {
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find((element) => element.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function hasAssetRecord(project: Project, namespace: string, path: string): boolean {
  return (
    project.namespaces
      .find((entry) => entry.name === namespace)
      ?.assets.some((asset) => asset.path === path) ?? false
  );
}

/** Deep equality of two JSON values (key order ignored). */
export function sameJson(a: Json | undefined, b: Json | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return stableStringify(a) === stableStringify(b);
}

/**
 * Why `item` cannot be applied to `state`, or `undefined` when it fits.
 *
 * - `create`: an element with the id exists.
 * - `update`, `delete`: the element is missing, or its data is not the `before` captured.
 * - `rename`: the old element is missing or changed, or the new id is taken.
 * - `asset`: the project records the path, or a file exists there.
 */
export function itemConflict(
  state: Project,
  item: ChangeItem,
  options: ChangesetPlanOptions = {},
): string | undefined {
  switch (item.op) {
    case 'create': {
      if (item.elementId === undefined || item.kind === undefined || item.after === undefined) {
        return 'The item is incomplete.';
      }
      return findElement(state, item.elementId) === undefined
        ? undefined
        : `An element ${item.elementId} already exists.`;
    }
    case 'update':
    case 'delete': {
      if (item.elementId === undefined) return 'The item is incomplete.';
      if (item.op === 'update' && item.after === undefined) return 'The item is incomplete.';
      const element = findElement(state, item.elementId);
      if (element === undefined) return `${item.elementId} no longer exists.`;
      if (item.before !== undefined && !sameJson(element.data, item.before)) {
        return `${item.elementId} was changed after this was proposed.`;
      }
      return undefined;
    }
    case 'rename': {
      if (item.from === undefined || item.to === undefined) return 'The item is incomplete.';
      const element = findElement(state, item.from);
      if (element === undefined) return `${item.from} no longer exists.`;
      if (item.before !== undefined && !sameJson(element.data, item.before)) {
        return `${item.from} was changed after this was proposed.`;
      }
      if (findElement(state, item.to) !== undefined) return `An element ${item.to} already exists.`;
      return undefined;
    }
    case 'asset': {
      const asset = item.asset;
      if (asset === undefined) return 'The item is incomplete.';
      if (hasAssetRecord(state, asset.namespace, asset.path)) {
        return `The project already has assets/${asset.namespace}/${asset.path}.`;
      }
      if (options.assetExists?.(asset.namespace, asset.path) === true) {
        return `A file assets/${asset.namespace}/${asset.path} already exists.`;
      }
      return undefined;
    }
  }
}

/** A command that adds `name` unless the draft has it. */
function ensureNamespace(name: string): ProjectCommand {
  const add = commands.addNamespace(name);
  return {
    id: 'app.ensure-namespace',
    label: add.label,
    apply(draft) {
      if (!draft.namespaces.some((entry) => entry.name === name)) add.apply(draft);
    },
  };
}

/** The commands of one item against `state` (which it fits). */
function itemCommands(
  state: Project,
  item: ChangeItem,
  options: ChangesetPlanOptions,
): ProjectCommand[] {
  switch (item.op) {
    case 'create': {
      const id = item.elementId as ResourceLocation;
      const element = createElement({
        id,
        kind: item.kind as string,
        data: structuredClone(item.after as Json),
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(item.meta?.notes === undefined ? {} : { notes: item.meta.notes }),
        ...(item.meta?.tags === undefined ? {} : { tags: item.meta.tags }),
        ...(item.meta?.creator === undefined ? {} : { creator: item.meta.creator }),
      });
      return [ensureNamespace(namespaceOf(id)), commands.addElement(element)];
    }
    case 'update':
      return [
        commands.setElementData(
          item.elementId as ResourceLocation,
          structuredClone(item.after as Json),
        ),
      ];
    case 'delete':
      return [commands.removeElement(item.elementId as ResourceLocation)];
    case 'rename': {
      const from = item.from as ResourceLocation;
      const to = item.to as ResourceLocation;
      const references = options.renameReferences?.(state, from) ?? [];
      return [ensureNamespace(namespaceOf(to)), commands.renameElement(from, to, references)];
    }
    case 'asset': {
      const asset = item.asset as ChangeAsset;
      return [
        ensureNamespace(asset.namespace),
        commands.addAsset(asset.namespace, {
          path: asset.path,
          mediaType: mediaTypeForPath(asset.path),
        }),
      ];
    }
  }
}

/** A frozen project as `CommandStack` needs it, without freezing the caller's object. */
function frozenStart(project: Project): Project {
  return Object.isFrozen(project) ? project : structuredClone(project);
}

/**
 * Evaluates `items` in order against `project`: rejected items (`accepted: false`) are left
 * out silently, conflicting items are skipped with their reason, and every other item becomes
 * one command. The commands replayed on `project` give `state`.
 */
export function planChangeItems(
  project: Project,
  items: readonly ChangeItem[],
  options: ChangesetPlanOptions = {},
): ChangesetPlan {
  const stack = new CommandStack(frozenStart(project), { limit: 1 });
  const plan: ChangesetPlan = { state: stack.state, commands: [], applied: [], skipped: [] };
  for (const item of items) {
    if (!item.accepted) continue;
    const conflict = itemConflict(stack.state, item, options);
    if (conflict !== undefined) {
      plan.skipped.push({ itemId: item.itemId, reason: conflict });
      continue;
    }
    let parts: ProjectCommand[];
    try {
      parts = itemCommands(stack.state, item, options);
    } catch (error) {
      plan.skipped.push({ itemId: item.itemId, reason: messageOf(error) });
      continue;
    }
    const command: ProjectCommand = {
      id: `ai.change-${item.op}`,
      label: item.itemId,
      apply(draft) {
        for (const part of parts) part.apply(draft);
      },
    };
    try {
      stack.execute(command);
    } catch (error) {
      plan.skipped.push({ itemId: item.itemId, reason: messageOf(error) });
      continue;
    }
    plan.commands.push(command);
    plan.applied.push(item.itemId);
  }
  plan.state = stack.state;
  return plan;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The outcome of {@link bundleToNewItems}. */
export interface BundleItems {
  /** One `create` item per new element, then one `asset` item per new asset. */
  items: NewChangeItem[];
  /** Element ids the project already has (not turned into items). */
  conflicts: ResourceLocation[];
  /** Assets the project already records, as `<namespace>:<path>` (not turned into items). */
  assetConflicts: string[];
}

/**
 * Turns a content bundle (a starter's, an example's, a Creator flow's) into change items
 * against `state`: elements and assets the project already has are reported, not added.
 * Shared by the AI helper's `add_starter` and the Creator (ADR 0043).
 *
 * @throws Error If an element's kind is unknown or an asset's namespace is invalid.
 */
export function bundleToNewItems(
  bundle: ContentBundle,
  state: Project,
  isKnownKind: (kind: string) => boolean,
  meta: Omit<ChangeItemMeta, 'notes' | 'tags'> = {},
): BundleItems {
  const out: BundleItems = { items: [], conflicts: [], assetConflicts: [] };
  const seen = new Set<string>();
  for (const entry of bundle.elements) {
    if (!isKnownKind(entry.kind)) {
      throw new Error(`Unknown element kind ${JSON.stringify(entry.kind)} for ${entry.id}.`);
    }
    if (findElement(state, entry.id) !== undefined || seen.has(entry.id)) {
      out.conflicts.push(entry.id);
      continue;
    }
    seen.add(entry.id);
    const itemMeta: ChangeItemMeta = { ...structuredClone(meta) };
    if (entry.notes !== undefined) itemMeta.notes = entry.notes;
    if (entry.tags !== undefined) itemMeta.tags = [...entry.tags];
    out.items.push({
      op: 'create',
      elementId: entry.id,
      kind: entry.kind,
      after: structuredClone(entry.data),
      ...(Object.keys(itemMeta).length === 0 ? {} : { meta: itemMeta }),
    });
  }
  const seenAssets = new Set<string>();
  for (const asset of bundle.assets) {
    if (!isValidNamespace(asset.namespace)) {
      throw new Error(`Invalid namespace name ${JSON.stringify(asset.namespace)}.`);
    }
    const key = `${asset.namespace}:${asset.path}`;
    if (hasAssetRecord(state, asset.namespace, asset.path) || seenAssets.has(key)) {
      out.assetConflicts.push(key);
      continue;
    }
    seenAssets.add(key);
    out.items.push({
      op: 'asset',
      asset: { namespace: asset.namespace, path: asset.path, bytes: asset.bytes },
    });
  }
  return out;
}

/**
 * The pending changeset of one conversation (or one Creator session). Items are immutable
 * objects; every change replaces the `items` array and notifies subscribers, so a store can
 * mirror it.
 */
export class PendingChangeset {
  #items: readonly ChangeItem[] = Object.freeze([]);
  #next = 1;
  #version = 0;
  readonly #listeners = new Set<(items: readonly ChangeItem[]) => void>();

  /** The items, in proposal order. */
  get items(): readonly ChangeItem[] {
    return this.#items;
  }

  /** Increases on every change. */
  get version(): number {
    return this.#version;
  }

  /** Whether the changeset has no items. */
  get isEmpty(): boolean {
    return this.#items.length === 0;
  }

  /** Subscribes to changes; returns an unsubscribe function. */
  subscribe(listener: (items: readonly ChangeItem[]) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** The item with `itemId`, if any. */
  get(itemId: string): ChangeItem | undefined {
    return this.#items.find((item) => item.itemId === itemId);
  }

  /** Adds items (accepted, without problems) and returns them with their ids. */
  add(...items: NewChangeItem[]): ChangeItem[] {
    const added = items.map(
      (item): ChangeItem => ({
        ...item,
        itemId: `item-${this.#next++}`,
        accepted: true,
        problems: [],
      }),
    );
    if (added.length > 0) this.#set([...this.#items, ...added]);
    return added;
  }

  /**
   * Proposes new data for `elementId`. An accepted `create` or `update` item of the same
   * element takes the new data (one item per element); otherwise a new `update` item expecting
   * `before` is added.
   */
  proposeUpdate(elementId: ResourceLocation, kind: string, before: Json, after: Json): ChangeItem {
    const existing = this.#latestFor(elementId);
    if (existing !== undefined && (existing.op === 'create' || existing.op === 'update')) {
      return this.#replace(existing.itemId, { after: structuredClone(after) });
    }
    const [item] = this.add({
      op: 'update',
      elementId,
      kind,
      before: structuredClone(before),
      after: structuredClone(after),
    });
    return item as ChangeItem;
  }

  /**
   * Proposes deleting `elementId`. A pending `create` of the element is dropped instead
   * (`undefined` is returned), a pending `update` becomes the delete (keeping its `before`),
   * otherwise a new `delete` item is added.
   */
  proposeDelete(elementId: ResourceLocation, kind: string, before: Json): ChangeItem | undefined {
    const existing = this.#latestFor(elementId);
    if (existing?.op === 'create') {
      this.remove(existing.itemId);
      return undefined;
    }
    if (existing?.op === 'update') {
      const { after: _after, ...rest } = existing;
      const replaced: ChangeItem = { ...rest, op: 'delete', problems: [] };
      this.#set(this.#items.map((item) => (item.itemId === existing.itemId ? replaced : item)));
      return replaced;
    }
    const [item] = this.add({ op: 'delete', elementId, kind, before: structuredClone(before) });
    return item;
  }

  /** The newest accepted element item whose `elementId` is `id`. */
  #latestFor(id: ResourceLocation): ChangeItem | undefined {
    for (let index = this.#items.length - 1; index >= 0; index -= 1) {
      const item = this.#items[index] as ChangeItem;
      if (item.accepted && item.elementId === id && item.op !== 'asset') return item;
    }
    return undefined;
  }

  /** Changes fields of one item; the item's problems are cleared when its data changes. */
  #replace(itemId: string, patch: Partial<NewChangeItem>): ChangeItem {
    let replaced: ChangeItem | undefined;
    this.#set(
      this.#items.map((item) => {
        if (item.itemId !== itemId) return item;
        replaced = { ...item, ...patch, problems: [] };
        return replaced;
      }),
    );
    if (replaced === undefined) throw new Error(`No change item ${itemId}.`);
    return replaced;
  }

  /** Removes one item. */
  remove(itemId: string): void {
    const next = this.#items.filter((item) => item.itemId !== itemId);
    if (next.length !== this.#items.length) this.#set(next);
  }

  /** Accepts or rejects one item. */
  setAccepted(itemId: string, accepted: boolean): void {
    if (this.get(itemId)?.accepted === accepted) return;
    this.#set(this.#items.map((item) => (item.itemId === itemId ? { ...item, accepted } : item)));
  }

  /** Replaces every item's problems (items missing from `byItem` get none). */
  setProblems(byItem: ReadonlyMap<string, readonly Problem[]>): void {
    this.#set(
      this.#items.map((item) => ({ ...item, problems: [...(byItem.get(item.itemId) ?? [])] })),
    );
  }

  /** Removes every item. */
  clear(): void {
    if (this.#items.length > 0) this.#set([]);
  }

  /** Removes the items with these ids (for example the applied ones). */
  removeAll(itemIds: Iterable<string>): void {
    const drop = new Set(itemIds);
    const next = this.#items.filter((item) => !drop.has(item.itemId));
    if (next.length !== this.#items.length) this.#set(next);
  }

  /** {@link planChangeItems} over the current items. */
  plan(project: Project, options: ChangesetPlanOptions = {}): ChangesetPlan {
    return planChangeItems(project, this.#items, options);
  }

  /**
   * The project with every accepted item applied through the same commands Apply executes
   * (conflicting items skipped). Never changes `project`.
   */
  scratchProject(project: Project, options: ChangesetPlanOptions = {}): Project {
    return this.plan(project, options).state;
  }

  /** The accepted items that do not fit `project`, with the reasons. */
  conflicts(project: Project, options: ChangesetPlanOptions = {}): SkippedChange[] {
    return this.plan(project, options).skipped;
  }

  /** Stores {@link conflicts} on the items (and clears the notes of items that fit again). */
  markConflicts(project: Project, options: ChangesetPlanOptions = {}): SkippedChange[] {
    const found = this.conflicts(project, options);
    const reasons = new Map(found.map((entry) => [entry.itemId, entry.reason]));
    const changed = this.#items.some((item) => item.conflict !== reasons.get(item.itemId));
    if (changed) {
      this.#set(
        this.#items.map((item) => {
          const reason = reasons.get(item.itemId);
          if (reason === item.conflict) return item;
          const { conflict: _conflict, ...rest } = item;
          return reason === undefined ? rest : { ...rest, conflict: reason };
        }),
      );
    }
    return found;
  }

  /** Counts per operation and kind, and a one-line text. */
  summary(): ChangesetSummary {
    const byOp: Record<ChangeOp, number> = { create: 0, update: 0, delete: 0, rename: 0, asset: 0 };
    const byKind: Record<string, number> = {};
    let accepted = 0;
    let conflicts = 0;
    for (const item of this.#items) {
      byOp[item.op] += 1;
      if (item.accepted) accepted += 1;
      if (item.conflict !== undefined) conflicts += 1;
      if (item.kind !== undefined) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    }
    const total = this.#items.length;
    let text = '';
    if (total > 0) {
      const ops = CHANGE_OPS.filter((op) => byOp[op] > 0).map((op) => `${byOp[op]} ${op}`);
      const kinds = Object.keys(byKind)
        .sort()
        .map((kind) => `${kind} ${byKind[kind]}`);
      text = `${total} proposed change${total === 1 ? '' : 's'} (${accepted} accepted`;
      if (conflicts > 0) text += `, ${conflicts} in conflict`;
      text += `): ${ops.join(', ')}`;
      if (kinds.length > 0) text += `; kinds: ${kinds.join(', ')}`;
      text += '.';
    }
    return { total, accepted, conflicts, byOp, byKind, text };
  }

  #set(items: ChangeItem[]): void {
    this.#items = Object.freeze(items);
    this.#version += 1;
    for (const listener of [...this.#listeners]) listener(this.#items);
  }
}
