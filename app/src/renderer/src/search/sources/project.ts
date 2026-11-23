/**
 * The open mod's source (ADR 0124 D3; B660): its own things for the project layer, rebuilt from
 * the session's project and patched into the index 300 ms after an edit (`sources/index.ts`).
 *
 * - **Elements:** one entry per element, titled with its display name, its id as an exact id and
 *   its kind's friendly name as words; technical kinds are marked for Very easy.
 * - **Creator sets:** one entry per set (elements sharing `meta.creator.setId`), named by its
 *   name answer, opening its main element: the same action as that element, so the two fold.
 * - **Pictures and sounds:** one entry per asset file under `textures/` and `sounds/`.
 * - **Rules:** one entry per rule of each rule book, in the Rule book's words (`rules.ts`).
 * - **Things to fix:** the live problems (`problems.ts`), in the same layer.
 *
 * Also the things the answer reader may name (`projectThings`: blocks, items, mobs and vehicles
 * with their names) and the ids of the entries the mod already uses (`SearchContext.inMod`).
 *
 * @packageDocumentation
 */

import type { Element, Problem, Project } from '@msm/core';
import { RULES_KIND } from '@msm/plugin-rules';
import type { SearchEntry, SearchThing } from '@msm/search';
import { displayNameOf } from '../../session/plain-problems';
import { problemEntries } from './problems';
import { projectRuleEntries } from './rules';
import { asAction, asPreview, entryIds, idWords, sentenceField, wordsField } from './shared';
import type { KindWords } from './templates';

/** The kinds whose elements the answer reader may name, with their sort (behaviours' subjects). */
export const THING_SORTS: Readonly<Record<string, string>> = {
  'msm:block': 'block',
  'msm:fluid': 'block',
  'msm:item': 'item',
  'msm:potion': 'item',
  'msm:entity': 'mob',
  'msm:villager_profession': 'mob',
  'msm:vehicle': 'vehicle',
};

/** The kinds a set opens on first (as Home's cards), then the others by id. */
const MAIN_ORDER = [
  'msm:vehicle',
  'msm:villager_profession',
  'msm:fluid',
  'msm:block',
  'msm:item',
  'msm:entity',
  'msm:effect',
  'msm:potion',
  RULES_KIND,
  'msm:command',
  'msm:key_bind',
  'msm:hud',
  'msm:creative_tab',
];

const elementsOf = (project: Project): Element[] =>
  project.namespaces.flatMap((namespace) => namespace.elements);

/** The name stored in a set's `meta.creator.values` (`name` or `*_name`), if any. */
function setName(element: Element): string | undefined {
  const values = element.meta.creator?.values;
  if (values === undefined) return undefined;
  const key = Object.keys(values)
    .sort()
    .find((entry) => entry === 'name' || entry.endsWith('_name'));
  const value = key === undefined ? undefined : values[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function mainOf(elements: readonly Element[]): Element | undefined {
  const rank = (kind: string): number => {
    const index = MAIN_ORDER.indexOf(kind);
    return index < 0 ? MAIN_ORDER.length : index;
  };
  return [...elements].sort((a, b) => rank(a.kind) - rank(b.kind) || a.id.localeCompare(b.id))[0];
}

/** What the project collector needs beside the project. */
export interface ProjectSourceInput {
  readonly project: Project | null;
  readonly problems: readonly Problem[];
  /** Flow titles by starter id ("Gear set"), for the sets' sentences. */
  readonly flowTitles?: Readonly<Record<string, string>>;
  /** The app's kind words (friendly names, technical kinds). */
  readonly kinds?: KindWords;
}

const ASSET_FOLDERS: readonly { prefix: string; word: string }[] = [
  { prefix: 'textures/', word: 'picture' },
  { prefix: 'sounds/', word: 'sound' },
];

/** The project layer's entries. */
export function projectEntries(input: ProjectSourceInput): SearchEntry[] {
  const { project } = input;
  if (project === null) return [];
  const kinds = input.kinds ?? {};
  const elements = elementsOf(project);
  const names = new Map<string, string>(
    elements.map((element) => [element.id, displayNameOf(element)]),
  );
  const out: SearchEntry[] = [];

  for (const element of elements) {
    const label = kinds.label?.(element.kind);
    const action = { type: 'element', element: element.id } as const;
    const tags = element.meta.tags ?? [];
    out.push({
      id: entryIds.element(element.id),
      source: 'project',
      title: names.get(element.id) ?? idWords(element.id),
      ...sentenceField(label),
      ...wordsField([label, idWords(element.id), ...tags]),
      ids: [element.id, element.kind],
      available: true,
      ...(kinds.technical?.(element.kind) === true ? { technical: true } : {}),
      action: asAction(action),
      preview: asPreview(action),
    });
  }

  const sets = new Map<string, Element[]>();
  for (const element of elements) {
    const setId = element.meta.creator?.setId;
    if (setId === undefined || setId === '') continue;
    const list = sets.get(setId) ?? [];
    list.push(element);
    sets.set(setId, list);
  }
  for (const [setId, members] of [...sets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const main = mainOf(members);
    if (main === undefined) continue;
    const flowId = main.meta.creator?.flowId ?? '';
    const flowTitle = input.flowTitles?.[flowId];
    const action = { type: 'element', element: main.id } as const;
    out.push({
      id: entryIds.set(setId),
      source: 'project',
      title: setName(main) ?? names.get(main.id) ?? idWords(main.id),
      ...sentenceField(flowTitle),
      ...wordsField([flowTitle, ...members.map((member) => names.get(member.id))]),
      ids: members.map((member) => member.id),
      available: true,
      action: asAction(action),
      preview: asPreview(action),
    });
  }

  for (const namespace of project.namespaces) {
    for (const asset of namespace.assets) {
      const folder = ASSET_FOLDERS.find((entry) => asset.path.startsWith(entry.prefix));
      if (folder === undefined) continue;
      const file = asset.path.slice(asset.path.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');
      const action = { type: 'asset', namespace: namespace.name, path: asset.path } as const;
      out.push({
        id: entryIds.asset(namespace.name, asset.path),
        source: 'project',
        title: idWords(file),
        sentence: folder.word === 'picture' ? 'A picture in your mod.' : 'A sound in your mod.',
        words: [folder.word, idWords(asset.path.slice(folder.prefix.length))],
        ids: [`${namespace.name}:${asset.path}`],
        available: true,
        action: asAction(action),
        preview: asPreview(action),
      });
    }
  }

  const bookName = (book: Element): string => names.get(book.id) ?? idWords(book.id);
  out.push(...projectRuleEntries(project, (id) => names.get(id), bookName));
  out.push(...problemEntries(project, input.problems));
  return out;
}

/** The things of the mod the answer reader may name ("make a ruby sword"). */
export function projectThings(project: Project | null): SearchThing[] {
  if (project === null) return [];
  const out: SearchThing[] = [];
  for (const element of elementsOf(project)) {
    const sort = THING_SORTS[element.kind];
    if (sort === undefined) continue;
    out.push({ id: element.id, name: displayNameOf(element), sort });
  }
  return out;
}

/** Entry ids the open mod already uses: its kinds and the flows of its Creator sets. */
export function inModIds(project: Project | null): string[] {
  if (project === null) return [];
  const out = new Set<string>();
  for (const element of elementsOf(project)) {
    out.add(entryIds.kind(element.kind));
    const flowId = element.meta.creator?.flowId;
    if (flowId !== undefined && flowId !== '') out.add(entryIds.flow(flowId));
  }
  return [...out].sort();
}
