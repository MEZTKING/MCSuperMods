/**
 * The record of game ids that already left MSM (ADR 0102 D4, D5): every export or install of the
 * project (content jar, vanilla packs, install into a game location, Test in Minecraft, Play)
 * merges the ids it carried into `<project>/.msm/exported-ids.json`, and the Rename dialog and the
 * delete confirmations warn when an element's id, or a generated id it owns (a block's item, a
 * fluid's bucket, an entity's spawn egg), is in it. Minecraft keeps placed blocks, items and mobs
 * by id, so a renamed or removed id empties them out of worlds that already use them.
 *
 * Ids come from the same registry view the exporters use ({@link dataRegistryIds}). Pure: no DOM,
 * no session, so it runs in Node tests; the session reads and writes the file through its project
 * file system.
 *
 * @packageDocumentation
 */

import { type Element, type Json, type Project, parseJson, stableStringify } from '@msm/core';
import { RUNTIME_REGISTRIES } from '@msm/exporters';
import type { TargetFacts } from '@msm/plugin-api';
import { dataRegistryIds, type KindRegistryLookup } from './schema-context';

/** Where the record lives, relative to the project root (MSM's own folder, never exported). */
export const EXPORTED_IDS_FILE = '.msm/exported-ids.json';

/**
 * The registries whose ids worlds keep (ADR 0102 D4): blocks (a fluid's liquid block and the
 * companions of torches, signs and stems included), items (block items, buckets, spawn eggs and
 * vehicle items included), entity types (mobs and vehicles), fluids, effects, potions,
 * enchantments, dimensions and villager professions.
 */
export const EXPORTED_ID_REGISTRIES: readonly string[] = Object.freeze([
  'block',
  'dimension',
  'enchantment',
  'entity_type',
  'fluid',
  'item',
  'mob_effect',
  'potion',
  'villager_profession',
]);

/** What an export carried: the mod jar (every id), a vanilla data pack or a resource pack. */
export type ExportedIdsScope = 'jar' | 'data-pack' | 'resource-pack';

/** How the ids left MSM, as the record's `lastExport.via` names it. */
export type ExportedVia =
  | 'content-jar'
  | 'java-project'
  | 'data-pack'
  | 'resource-pack'
  | 'both-packs'
  | 'install-data-pack'
  | 'install-resource-pack'
  | 'test-in-minecraft'
  | 'play'
  | 'reload';

/** The record's file contents. */
export interface ExportedIdsRecord {
  /** The file format; 1. */
  format: 1;
  /** Ids that left MSM, per registry: sorted, namespaced, without duplicates. */
  ids: Record<string, string[]>;
  /** The last export: when (ISO 8601), the target id and how. */
  lastExport?: { date: string; target: string; via: ExportedVia };
}

/** An empty record. */
export function emptyExportedIds(): ExportedIdsRecord {
  return { format: 1, ids: {} };
}

/** One recorded id with its registry. */
export interface ExportedId {
  registry: string;
  id: string;
}

const MOD_ONLY = new Set(RUNTIME_REGISTRIES);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The ids an export of `project` carries, per registry, from {@link dataRegistryIds} limited to
 * {@link EXPORTED_ID_REGISTRIES}. A jar carries all of them; a vanilla data pack only those of
 * registries the mod jar does not register (ADR 0066: mod-only ids are left out of it, so only
 * data pack enchantments and dimensions stay); a resource pack none.
 */
export function exportedIdsOf(
  project: Project,
  kinds: KindRegistryLookup,
  target: Pick<TargetFacts, 'blocks'> | undefined,
  scope: ExportedIdsScope,
): Record<string, string[]> {
  if (scope === 'resource-pack') return {};
  const all = dataRegistryIds(project, kinds, target);
  const out: Record<string, string[]> = {};
  for (const registry of EXPORTED_ID_REGISTRIES) {
    if (scope === 'data-pack' && MOD_ONLY.has(registry)) continue;
    const ids = all[registry];
    if (ids !== undefined && ids.length > 0) out[registry] = [...ids].sort();
  }
  return out;
}

/**
 * `record` with `ids` merged in (an id stays recorded once exported) and `lastExport` set.
 * Registries and ids are sorted, without duplicates.
 */
export function mergeExportedIds(
  record: ExportedIdsRecord | null,
  ids: Readonly<Record<string, readonly string[]>>,
  lastExport: NonNullable<ExportedIdsRecord['lastExport']>,
): ExportedIdsRecord {
  const before = record?.ids ?? {};
  const merged: Record<string, string[]> = {};
  for (const registry of [...new Set([...Object.keys(before), ...Object.keys(ids)])].sort()) {
    const list = [...new Set([...(before[registry] ?? []), ...(ids[registry] ?? [])])].sort();
    if (list.length > 0) merged[registry] = list;
  }
  return { format: 1, ids: merged, lastExport: { ...lastExport } };
}

/** The record as file text: sorted keys, 2-space, trailing newline. */
export function serialiseExportedIds(record: ExportedIdsRecord): string {
  return stableStringify(record as unknown as Json);
}

/**
 * Reads the record's text; a damaged or unknown file reads as empty (the next export writes a
 * fresh one), and entries that are not id lists are dropped.
 */
export function parseExportedIds(text: string): ExportedIdsRecord {
  let value: unknown;
  try {
    value = parseJson(text);
  } catch {
    return emptyExportedIds();
  }
  if (!isObject(value) || !isObject(value.ids)) return emptyExportedIds();
  const ids: Record<string, string[]> = {};
  for (const [registry, list] of Object.entries(value.ids)) {
    if (!Array.isArray(list)) continue;
    const strings = list.filter((id): id is string => typeof id === 'string');
    if (strings.length > 0) ids[registry] = [...new Set(strings)].sort();
  }
  const record: ExportedIdsRecord = { format: 1, ids };
  const last = value.lastExport;
  if (isObject(last) && typeof last.date === 'string' && typeof last.target === 'string') {
    record.lastExport = {
      date: last.date,
      target: last.target,
      via: (typeof last.via === 'string' ? last.via : 'content-jar') as ExportedVia,
    };
  }
  return record;
}

/** `project` holding only `elements` (each in its own namespace), for the registry view. */
function projectOf(project: Project, elements: readonly Element[]): Project {
  return {
    ...project,
    namespaces: project.namespaces.map((namespace) => ({
      ...namespace,
      elements: elements.filter((element) => element.id.startsWith(`${namespace.name}:`)),
      assets: [],
    })),
  };
}

/**
 * The game ids `elements` own in {@link EXPORTED_ID_REGISTRIES}: their own ids and the ids
 * generated for them (a block's item, a fluid's liquid block and bucket, an entity's spawn egg, a
 * potion's longer and stronger versions), as {@link dataRegistryIds} lists them.
 */
export function ownedIds(
  project: Project,
  elements: readonly Element[],
  kinds: KindRegistryLookup,
  target: Pick<TargetFacts, 'blocks'> | undefined,
): ExportedId[] {
  const ids = exportedIdsOf(projectOf(project, elements), kinds, target, 'jar');
  return Object.entries(ids).flatMap(([registry, list]) => list.map((id) => ({ registry, id })));
}

function isRecorded(record: ExportedIdsRecord | null, entry: ExportedId): boolean {
  return record?.ids[entry.registry]?.includes(entry.id) === true;
}

const keyOf = (entry: ExportedId): string => `${entry.registry} ${entry.id}`;

/** What a rename or delete of exported ids would change; `null` when nothing exported changes. */
export interface ExportedIdsWarning {
  /** The recorded ids that change (rename) or go (delete), sorted by registry then id. */
  ids: ExportedId[];
  /** For a rename: the ids they become (the element's new owned ids that are new). */
  becomes: ExportedId[];
}

const byRegistryThenId = (a: ExportedId, b: ExportedId): number =>
  a.registry === b.registry ? a.id.localeCompare(b.id) : a.registry.localeCompare(b.registry);

/**
 * The warning for renaming `element` to `newId` (ADR 0102 D5): the recorded ids it owns that the
 * rename changes (an own `item.id` of a block stays, so it does not warn). Without `newId` (no
 * valid new id typed yet): every recorded id it owns, with nothing in `becomes`. `null` when none.
 */
export function renameWarning(
  record: ExportedIdsRecord | null,
  project: Project,
  element: Element,
  newId: string | undefined,
  kinds: KindRegistryLookup,
  target: Pick<TargetFacts, 'blocks'> | undefined,
): ExportedIdsWarning | null {
  if (record === null) return null;
  const before = ownedIds(project, [element], kinds, target);
  const renamed = { ...element, id: (newId ?? element.id) as Element['id'] };
  const after = newId === undefined ? [] : ownedIds(project, [renamed], kinds, target);
  const kept = new Set(after.map(keyOf));
  const ids = before
    .filter((entry) => isRecorded(record, entry) && !kept.has(keyOf(entry)))
    .sort(byRegistryThenId);
  if (ids.length === 0) return null;
  const old = new Set(before.map(keyOf));
  const becomes = after.filter((entry) => !old.has(keyOf(entry))).sort(byRegistryThenId);
  return { ids, becomes };
}

/**
 * The warning for deleting `elements` (ADR 0102 D5): the recorded ids they own that no other
 * element of `project` still owns. `null` when none.
 */
export function deleteWarning(
  record: ExportedIdsRecord | null,
  project: Project,
  elements: readonly Element[],
  kinds: KindRegistryLookup,
  target: Pick<TargetFacts, 'blocks'> | undefined,
): ExportedIdsWarning | null {
  if (record === null) return null;
  const going = new Set(elements.map((element) => element.id));
  const others = project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((element) => !going.has(element.id));
  const remaining = new Set(ownedIds(project, others, kinds, target).map(keyOf));
  const ids = ownedIds(project, elements, kinds, target)
    .filter((entry) => isRecorded(record, entry) && !remaining.has(keyOf(entry)))
    .sort(byRegistryThenId);
  return ids.length === 0 ? null : { ids, becomes: [] };
}

/** The confirm button's text when a delete removes exported ids. */
export const DELETE_ANYWAY_LABEL = 'Delete anyway';

/** The same for the sidebar's Remove. */
export const REMOVE_ANYWAY_LABEL = 'Remove anyway';

/** The plain name of a registry for the warning text. */
const REGISTRY_WORDS: Readonly<Record<string, string>> = {
  block: 'block',
  dimension: 'dimension',
  enchantment: 'enchantment',
  entity_type: 'entity',
  fluid: 'fluid',
  item: 'item',
  mob_effect: 'effect',
  potion: 'potion',
  villager_profession: 'villager job',
};

function listOf(entries: readonly ExportedId[]): string {
  return entries
    .map((entry) => `${entry.id} (${REGISTRY_WORDS[entry.registry] ?? entry.registry})`)
    .join(', ');
}

/**
 * The warning's words (ADR 0102 D5). Plain (a thing's rename or delete) names the thing by
 * `thing` (its display name) and shows no ids; Change id (in More options) lists the ids that
 * change and what they become.
 *
 * @param action - Whether the user renames or deletes.
 * @param warning - From {@link renameWarning} or {@link deleteWarning}.
 * @param plain - Plain words without ids.
 * @param thing - The thing's display name (plain).
 */
export function exportedIdsWarningText(
  action: 'rename' | 'delete',
  warning: ExportedIdsWarning,
  plain: boolean,
  thing: string,
): string {
  if (plain) {
    const change = action === 'rename' ? 'Renaming' : 'Deleting';
    return `You have already played with ${thing} or shared it. ${change} it here takes it out of worlds that already have it: its blocks disappear, and its items and creatures are gone. Keep it as it is, or ${action === 'rename' ? 'rename' : 'delete'} it only before anyone has a world with it.`;
  }
  const count = warning.ids.length;
  const these = count === 1 ? 'This id has' : 'These ids have';
  const head = `${these} already been exported or installed: ${listOf(warning.ids)}.`;
  const what =
    action === 'rename'
      ? warning.becomes.length > 0
        ? ` The rename changes ${count === 1 ? 'it' : 'them'} to ${listOf(warning.becomes)}.`
        : ` The rename changes ${count === 1 ? 'it' : 'them'}.`
      : ` Removing the element takes ${count === 1 ? 'it' : 'them'} out of the mod.`;
  const worlds =
    ' Worlds that already use them lose the placed blocks, items or mobs with those ids.';
  const advice =
    action === 'rename'
      ? ' Keep the old id, or rename only before anyone has worlds with it.'
      : ' Keep the element, or delete it only before anyone has worlds with it.';
  return head + what + worlds + advice;
}
