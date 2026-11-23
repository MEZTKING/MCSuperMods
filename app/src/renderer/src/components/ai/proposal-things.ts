/**
 * The AI helper's proposal as things (ADR 0125 D3, B688): the change items grouped the way Home's
 * My things groups a mod, so the review shows "Ruby Sword, an item" with its picture rather than
 * six rows of ids.
 *
 * - One thing per Creator set (`meta.creator.setId`), else one per item of a kind My things shows
 *   (`THING_KIND_WORDS`, held equal to `home/things.ts` by `ai-status.test.ts`), in the items'
 *   order, named by `displayName` of `preview/bundle-source.ts` over the items (the language files
 *   they carry first), else by the element's own name or words of its id.
 * - Every other item (models, item looks, language files, recipes, loot tables, the mod settings,
 *   pictures and the rest) is counted behind the thing that names it: a thing (or a file already
 *   behind one) whose data names the file, then a file that names a thing (a recipe's result, a
 *   language key), then a file with the thing's own name (`blocks/ruby_ore` for `ruby_ore`). The
 *   mod and pack settings nobody names go behind the first thing. What is left is the last group,
 *   "Other files".
 * - Each thing carries its picture (`elementTextureBytes` over the proposal's own files, else the
 *   first picture behind it) and whether it is new, changed or taken out.
 *
 * Also {@link thingsOf}, the things alone, which the state line and the Apply notice count
 * (`ai-status.ts` re-exports it). Pure: no DOM and no store, so it runs in Node tests.
 *
 * @packageDocumentation
 */

import type { Json, Problem } from '@msm/core';
import type { ContentBundle } from '@msm/plugin-api';
import type { ChangeItem } from '../../changeset/changeset';
import { displayName, elementTextureBytes } from '../../preview/bundle-source';
import type { ResourceFolders } from '../../preview/model-chain';
import { MOD_METADATA_KIND, PACK_MCMETA_KIND } from '../../session/element-defaults';
import { plainProblem, wordsOfId } from '../../session/plain-problems';
import type { AiMadeThing } from '../../store/ai-store';
import { isThingKind, proposedName, THING_KIND_WORDS, type UiMode } from './ai-words';

/** One thing of a proposal, or the last group "Other files". */
export interface ProposalThing {
  /** Stable key: `set:<setId>`, the main element's id, or `other` for "Other files". */
  readonly key: string;
  /** The main element's id; `null` for "Other files". */
  readonly id: string | null;
  /** The name shown ("Ruby Sword"; "Other files" for the last group). */
  readonly name: string;
  /** What it is, in words ("Item", "Block"; "Files" for the last group). */
  readonly what: string;
  /** What adding it does: new, changed or taken out. */
  readonly op: AiMadeThing['op'];
  /** The item of the main element; `null` for "Other files". */
  readonly main: ChangeItem | null;
  /** Every item behind the thing, the main one first, then in the proposal's order. */
  readonly items: readonly ChangeItem[];
  /** The other things of a Creator set's own kinds (the gem and the ore of an ore set), by name. */
  readonly parts: readonly string[];
  /** The thing's picture (a PNG), when the proposal carries one. */
  readonly picture: Uint8Array | undefined;
  /** Whether this is the last group, "Other files". */
  readonly other: boolean;
}

/** Options of {@link proposalThings}. */
export interface ProposalThingsOptions {
  /** The target's resource folders, for the pictures (default: `textures`). */
  readonly folders?: ResourceFolders;
}

/** The kinds that go behind the first thing when nothing names them. */
const SETTINGS_KINDS: ReadonlySet<string> = new Set([MOD_METADATA_KIND, PACK_MCMETA_KIND]);

const KIND_ORDER = new Map(THING_KIND_WORDS.map((entry, index) => [entry.kind, index]));

const DEFAULT_FOLDERS = { textures: 'textures' } as unknown as ResourceFolders;

type JsonObject = { [key: string]: Json };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function kindWord(kind: string, data: unknown): string {
  if (kind === 'msm:block' && isObject(data) && data.type === 'portal') return 'Portal';
  return THING_KIND_WORDS.find((entry) => entry.kind === kind)?.word ?? 'Thing';
}

function opOf(item: ChangeItem): AiMadeThing['op'] {
  if (item.op === 'create') return 'added';
  if (item.op === 'delete') return 'removed';
  return 'changed';
}

/** The set name a Creator set stores in `meta.creator.values` (`name` or `*_name`), if any. */
function setName(item: ChangeItem): string | undefined {
  const values = item.meta?.creator?.values;
  if (values === undefined) return undefined;
  const key = Object.keys(values)
    .sort()
    .find((entry) => entry === 'name' || entry.endsWith('_name'));
  const value = key === undefined ? undefined : values[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** The proposal as a bundle: its elements (their new data) and its pictures. */
function bundleOf(items: readonly ChangeItem[]): ContentBundle {
  return {
    elements: items.flatMap((item) =>
      item.elementId === undefined || item.kind === undefined || item.after === undefined
        ? []
        : [{ id: item.elementId, kind: item.kind, data: item.after }],
    ),
    assets: items.flatMap((item) =>
      item.op === 'asset' && item.asset !== undefined
        ? [{ namespace: item.asset.namespace, path: item.asset.path, bytes: item.asset.bytes }]
        : [],
    ),
  };
}

function nameOf(bundle: ContentBundle, item: ChangeItem, id: string): string {
  const type = item.kind === 'msm:block' ? 'block' : item.kind === 'msm:item' ? 'item' : undefined;
  return (
    (type === undefined ? undefined : displayName(bundle, id, type)) ??
    proposedName({ id, data: item.after ?? item.before })
  );
}

/** The main element of a set's items: the first thing kind in My things' order, then by id. */
function mainOfSet(members: readonly ChangeItem[]): ChangeItem | undefined {
  return [...members]
    .filter((item) => isThingKind(item.kind as string))
    .sort(
      (a, b) =>
        (KIND_ORDER.get(a.kind as string) ?? 99) - (KIND_ORDER.get(b.kind as string) ?? 99) ||
        (a.elementId as string).localeCompare(b.elementId as string),
    )[0];
}

// References -------------------------------------------------------------------------------

/** Normalises an id-like string ("#ruby:gems" reads "ruby:gems"), or `undefined`. */
function idOf(text: string): string | undefined {
  const value = text.startsWith('#') ? text.slice(1) : text;
  return /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value) ? value : undefined;
}

/** The names an item answers to: its id, and for a picture its texture id and its path. */
function namesOf(item: ChangeItem): string[] {
  if (item.op === 'asset' && item.asset !== undefined) {
    const { namespace, path } = item.asset;
    const names = [`${namespace}:${path}`];
    const texture = /^textures\/(.+)\.png$/.exec(path);
    if (texture !== null) names.push(`${namespace}:${texture[1]}`);
    return names;
  }
  const names: string[] = [];
  if (item.elementId !== undefined) names.push(item.elementId);
  if (item.op === 'rename' && item.from !== undefined) names.push(item.from);
  return names;
}

/**
 * The ids an item's data names, a recipe's result first. A language file names the thing of
 * each key (`item.ruby.ruby_sword` names `ruby:ruby_sword`).
 */
function refsOf(item: ChangeItem): string[] {
  const data = item.after ?? item.before;
  const first: string[] = [];
  const rest: string[] = [];
  if (item.kind === 'minecraft:lang' && isObject(data)) {
    for (const key of Object.keys(data)) {
      const parts = key.split('.');
      if (parts.length >= 3) first.push(`${parts[1]}:${parts.slice(2).join('/')}`);
    }
    return first;
  }
  const walk = (value: unknown, into: string[]): void => {
    if (typeof value === 'string') {
      const id = idOf(value);
      if (id !== undefined) into.push(id);
    } else if (Array.isArray(value)) {
      for (const entry of value) walk(entry, into);
    } else if (isObject(value)) {
      for (const [key, entry] of Object.entries(value)) {
        walk(entry, key === 'result' ? first : into);
      }
    }
  };
  walk(data, rest);
  return [...first, ...rest];
}

/** The last part of an id's or path's name ("ruby:blocks/ruby_ore" reads "ruby_ore"). */
function lastName(name: string): string {
  const path = name.slice(name.indexOf(':') + 1).replace(/\.[a-z]+$/, '');
  return path.slice(path.lastIndexOf('/') + 1);
}

function namespaceOf(name: string): string {
  return name.slice(0, name.indexOf(':'));
}

// Grouping ---------------------------------------------------------------------------------

interface Group {
  key: string;
  main: ChangeItem;
  members: ChangeItem[];
  setName?: string;
}

/**
 * The proposal's things (see the module comment), in the items' order, "Other files" last when
 * any item is left. Every item is behind exactly one thing.
 */
export function proposalThings(
  items: readonly ChangeItem[],
  options: ProposalThingsOptions = {},
): ProposalThing[] {
  const bundle = bundleOf(items);
  const folders = options.folders ?? DEFAULT_FOLDERS;

  // Things: one per Creator set (at its first item), else per item of a thing kind.
  const sets = new Map<string, ChangeItem[]>();
  const order: ({ set: string } | { item: ChangeItem })[] = [];
  for (const item of items) {
    if (item.elementId === undefined || item.kind === undefined) continue;
    const setId = item.meta?.creator?.setId;
    if (setId !== undefined) {
      const list = sets.get(setId);
      if (list === undefined) {
        sets.set(setId, [item]);
        order.push({ set: setId });
      } else list.push(item);
    } else if (isThingKind(item.kind)) {
      order.push({ item });
    }
  }
  const groups: Group[] = [];
  const groupOf = new Map<string, Group>();
  for (const entry of order) {
    if ('item' in entry) {
      const group: Group = { key: entry.item.elementId as string, main: entry.item, members: [] };
      groups.push(group);
      groupOf.set(entry.item.itemId, group);
      continue;
    }
    const members = sets.get(entry.set) ?? [];
    const main = mainOfSet(members);
    if (main === undefined) continue;
    const name = setName(main);
    const group: Group = {
      key: `set:${entry.set}`,
      main,
      members: [],
      ...(name === undefined ? {} : { setName: name }),
    };
    groups.push(group);
    for (const member of members) groupOf.set(member.itemId, group);
  }

  // Files behind the things, by what names what, until nothing more is found.
  const names = new Map(items.map((item) => [item.itemId, namesOf(item)]));
  const refs = new Map(items.map((item) => [item.itemId, refsOf(item)]));
  const byName = new Map<string, Group>();
  const learn = (item: ChangeItem, group: Group): void => {
    for (const name of names.get(item.itemId) ?? []) if (!byName.has(name)) byName.set(name, group);
  };
  for (const item of items) {
    const group = groupOf.get(item.itemId);
    if (group !== undefined) learn(item, group);
  }
  const placed = (item: ChangeItem, group: Group): void => {
    groupOf.set(item.itemId, group);
    learn(item, group);
  };
  let open = items.filter((item) => !groupOf.has(item.itemId));
  for (let progress = true; progress && open.length > 0; ) {
    progress = false;
    for (const item of open) {
      const own = new Set(names.get(item.itemId) ?? []);
      // A thing, or a file behind one, whose data names this file.
      let found: Group | undefined;
      for (const other of items) {
        const group = groupOf.get(other.itemId);
        if (group === undefined || other === item) continue;
        if ((refs.get(other.itemId) ?? []).some((ref) => own.has(ref))) {
          found = group;
          break;
        }
      }
      // This file names a thing, or a file behind one.
      if (found === undefined) {
        for (const ref of refs.get(item.itemId) ?? []) {
          const group = byName.get(ref);
          if (group !== undefined) {
            found = group;
            break;
          }
        }
      }
      if (found !== undefined) {
        placed(item, found);
        progress = true;
      }
    }
    open = open.filter((item) => !groupOf.has(item.itemId));
  }
  // A file with a thing's own name, in the same namespace.
  for (const item of open) {
    const own = names.get(item.itemId)?.[0];
    if (own === undefined) continue;
    const group = groups.find(
      (entry) =>
        namespaceOf(entry.main.elementId as string) === namespaceOf(own) &&
        lastName(entry.main.elementId as string) === lastName(own),
    );
    if (group !== undefined) placed(item, group);
  }
  open = open.filter((item) => !groupOf.has(item.itemId));
  // The mod and pack settings nobody names go behind the first thing.
  const first = groups[0];
  if (first !== undefined) {
    for (const item of open) {
      if (item.kind !== undefined && SETTINGS_KINDS.has(item.kind)) placed(item, first);
    }
    open = open.filter((item) => !groupOf.has(item.itemId));
  }

  for (const item of items) groupOf.get(item.itemId)?.members.push(item);
  const things: ProposalThing[] = groups.map((group) => {
    const main = group.main;
    const id = main.elementId as string;
    const behind = group.members.filter((item) => item !== main);
    const parts = behind
      .filter((item) => item.kind !== undefined && isThingKind(item.kind))
      .map((item) => nameOf(bundle, item, item.elementId as string));
    return {
      key: group.key,
      id,
      name: group.setName ?? nameOf(bundle, main, id),
      what: kindWord(main.kind as string, main.after ?? main.before),
      op: opOf(main),
      main,
      items: [main, ...behind],
      parts,
      picture: pictureOf(bundle, [main, ...behind], folders),
      other: false,
    };
  });
  if (open.length > 0) {
    things.push({
      key: 'other',
      id: null,
      name: OTHER_FILES,
      what: 'Files',
      op: open.every((item) => item.op === 'delete')
        ? 'removed'
        : open.every((item) => item.op === 'create' || item.op === 'asset')
          ? 'added'
          : 'changed',
      main: null,
      items: open,
      parts: [],
      picture: undefined,
      other: true,
    });
  }
  return things;
}

/** The picture of a thing: its model's texture in the proposal, else the first picture behind it. */
function pictureOf(
  bundle: ContentBundle,
  members: readonly ChangeItem[],
  folders: ResourceFolders,
): Uint8Array | undefined {
  for (const item of members) {
    if (item.after === undefined || item.kind === undefined) continue;
    const bytes = elementTextureBytes(bundle, item.after, folders);
    if (bytes !== undefined) return bytes;
  }
  return members.find(
    (item) => item.op === 'asset' && item.asset !== undefined && item.asset.path.endsWith('.png'),
  )?.asset?.bytes;
}

/**
 * The things a list of change items stands for (ADR 0125 D4): {@link proposalThings} without
 * "Other files", as the Apply notice and the state line name them.
 */
export function thingsOf(items: readonly ChangeItem[]): AiMadeThing[] {
  return proposalThings(items)
    .filter((thing) => !thing.other)
    .map((thing) => ({
      id: thing.id as string,
      name: thing.name,
      what: thing.what,
      op: thing.op,
    }));
}

// Counts and words -------------------------------------------------------------------------

/** The counts the review's heading takes (`reviewHeading` of `ai-words.ts`). */
export function reviewCounts(
  things: readonly ProposalThing[],
  items: readonly ChangeItem[],
): { things: number; files: number; kept: number; total: number } {
  const kept = things.filter((thing) => !thing.other && thing.main?.accepted === true);
  return {
    things: kept.length,
    files: kept.reduce(
      (sum, thing) => sum + thing.items.filter((item) => item.accepted).length - 1,
      0,
    ),
    kept: items.filter((item) => item.accepted).length,
    total: items.length,
  };
}

/** Whether the kept items change or take out something already in the mod. */
export function changesSomething(items: readonly ChangeItem[]): boolean {
  return items.some(
    (item) =>
      item.accepted && (item.op === 'update' || item.op === 'delete' || item.op === 'rename'),
  );
}

/** Whether a thing is kept: every item behind it ticked (`mixed` when only some are). */
export function keptState(thing: ProposalThing): 'all' | 'none' | 'mixed' {
  const ticked = thing.items.filter((item) => item.accepted).length;
  if (ticked === thing.items.length) return 'all';
  return ticked === 0 ? 'none' : 'mixed';
}

/** The last group's name. */
export const OTHER_FILES = 'Other files';

/** The words of the review's cards beside `wordsFor(mode).review` (ADR 0125 wording table). */
export const CARD_WORDS = Object.freeze({
  op: Object.freeze({ added: 'New', changed: 'Changed', removed: 'Taken out' }),
  with: 'With',
  filesCount: (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`,
  discardTitle: 'Throw away what was made',
  discardMessage: (things: number) =>
    `Throw away ${things === 1 ? 'the thing' : `all ${things} things`} the helper made? Nothing has been added to your mod.`,
  noPicture: 'No picture',
});

/**
 * Why an item was not added, in words: the change note itself in Advanced; plain words naming no
 * id otherwise.
 */
export function notAddedWords(item: ChangeItem, mode: UiMode): string | undefined {
  const conflict = item.conflict;
  if (conflict === undefined) return undefined;
  if (mode === 'advanced') return `Not added: ${conflict}`;
  if (/no longer exists/.test(conflict)) return 'Not added: it is no longer in your mod.';
  if (/was changed after/.test(conflict)) {
    return 'Not added: it was changed in your mod after the helper made this.';
  }
  if (item.op === 'asset') return 'Not added: your mod already has this picture.';
  if (/already/.test(conflict)) return 'Not added: your mod already has one with this name.';
  return 'Not added: it does not fit your mod as it is now.';
}

/** A problem on a card, in the plain words of Very easy's Things to fix. */
export function problemWords(problem: Problem, thing: string): string {
  return plainProblem(problem, thing).text;
}

/** Words for a kind of file ("Recipe", "Model", "Names"). */
const FILE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  'minecraft:model': 'Model',
  'minecraft:item_definition': 'Item look',
  'minecraft:blockstate': 'Block look',
  'minecraft:lang': 'Names',
  'minecraft:recipe': 'Recipe',
  'minecraft:loot_table': 'What it drops',
  'minecraft:advancement': 'Advancement',
  'minecraft:function': 'Function',
  [MOD_METADATA_KIND]: 'Mod settings',
  [PACK_MCMETA_KIND]: 'Pack settings',
});

/**
 * A file behind a thing, in words with no id ("Recipe: Ruby pickaxe from rubies", "Picture:
 * Ruby pickaxe"), for Easy's **Files behind this**.
 */
export function fileWords(item: ChangeItem): string {
  if (item.op === 'asset' && item.asset !== undefined) {
    return `Picture: ${wordsOfId(item.asset.path.replace(/\.[a-z0-9]+$/, ''))}`;
  }
  const kind = item.kind ?? '';
  const word =
    FILE_WORDS[kind] ??
    (/^minecraft:tag\//.test(kind)
      ? 'Group'
      : wordsOfId(kind.slice(kind.indexOf(':') + 1).replace(/\//g, ' ')));
  const name = item.op === 'rename' ? (item.to ?? item.elementId) : item.elementId;
  const what = `${word}: ${wordsOfId(name ?? '')}`;
  if (item.op === 'delete') return `${what} (taken out)`;
  if (item.op === 'update' || item.op === 'rename') return `${what} (changed)`;
  return what;
}
