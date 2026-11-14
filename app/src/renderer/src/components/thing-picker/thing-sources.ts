/**
 * What the ThingPicker offers (ADR 0082 D7): the project's own things first, then the vanilla
 * things of the target by category, each with a name and where its picture comes from. Pure:
 * no DOM and no platform, so it runs in Node tests. Pictures are only described here; the
 * picker loads them through {@link ThingPictures} (project thumbnails, the extracted client jar
 * of ADR 0011) and shows a generic icon when there is none (limit R12).
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';

/** The sorts of thing a picker offers; the rule slot types that name an id. */
export type ThingSort =
  | 'item'
  | 'block'
  | 'mob'
  | 'sound'
  | 'particle'
  | 'effect'
  | 'function'
  | 'dimension';

/** Where a thing's picture comes from. */
export type ThingPicture =
  /** A project texture, `assets/<namespace>/<path>.png`, through the host's thumbnails. */
  | { readonly from: 'project'; readonly assetPath: string }
  /** Vanilla jar paths to try in order, from the extracted asset cache (ADR 0011). */
  | { readonly from: 'vanilla'; readonly paths: readonly string[] };

/** One thing in the picker. */
export interface Thing {
  /** The namespaced id written into the data. */
  readonly id: string;
  /** The display name: the project's `display_name`, else words made from the id. */
  readonly name: string;
  readonly sort: ThingSort;
  /** The project's own thing, or one of the game's. */
  readonly source: 'project' | 'vanilla';
  /** Where the picture comes from, or `null` for the generic icon. */
  readonly picture: ThingPicture | null;
}

/** A group of things under one heading ("Your things", "Minecraft blocks"). */
export interface ThingSection {
  readonly id: string;
  readonly label: string;
  readonly things: readonly Thing[];
}

/** Read access to ids: the session's registry view (`SchemaContext.registries`). */
export interface ThingRegistries {
  /** Every id of `registry`, namespaced and sorted. */
  ids(registry: string): readonly string[];
}

/** What {@link thingSections} reads. */
export interface ThingSourceInput {
  readonly project: Project;
  /** Vanilla plus project ids. */
  readonly registries: ThingRegistries;
  readonly sort: ThingSort;
  /** The target's texture folder under `assets/<namespace>/` (`target.folders.resource.textures`). */
  readonly texturesFolder: string;
  /** Only the project's own things (a definition trigger's subject). */
  readonly projectOnly?: boolean;
  /** Only project elements of these kinds (for example `msm:block`), when given. */
  readonly kinds?: readonly string[];
}

/** The registry each sort's ids come from. */
export const THING_REGISTRIES: Readonly<Record<ThingSort, string>> = Object.freeze({
  item: 'item',
  block: 'block',
  mob: 'entity_type',
  sound: 'sound_event',
  particle: 'particle_type',
  effect: 'mob_effect',
  function: 'function',
  dimension: 'dimension',
});

/** The element kinds whose elements are things of each sort (for names and pictures). */
const PROJECT_KINDS: Readonly<Record<ThingSort, readonly string[]>> = Object.freeze({
  item: ['msm:item', 'msm:block'],
  block: ['msm:block'],
  mob: ['msm:entity'],
  sound: [],
  particle: ['msm:particle'],
  effect: ['msm:effect'],
  function: ['minecraft:function'],
  dimension: ['minecraft:dimension'],
});

/** Plain words for each sort, singular and plural. */
export const THING_WORDS: Readonly<Record<ThingSort, { one: string; many: string }>> =
  Object.freeze({
    item: { one: 'an item', many: 'items' },
    block: { one: 'a block', many: 'blocks' },
    mob: { one: 'a mob', many: 'mobs' },
    sound: { one: 'a sound', many: 'sounds' },
    particle: { one: 'particles', many: 'particles' },
    effect: { one: 'an effect', many: 'effects' },
    function: { one: 'a function', many: 'functions' },
    dimension: { one: 'a dimension', many: 'dimensions' },
  });

type JsonObject = { [key: string]: Json };

const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

const namespaceOf = (id: string): string => (id.includes(':') ? id.slice(0, id.indexOf(':')) : '');
const pathOf = (id: string): string => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id);
const normalise = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

const capitalise = (text: string): string =>
  text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Words made from an id for a picker tile. Sounds keep their whole path ("Note block chime"
 * for `minecraft:block.note_block.chime`, the first category part left out); everything else
 * uses its last path part ("Diamond sword").
 */
export function thingWords(id: string, sort?: ThingSort): string {
  const path = pathOf(id);
  if (sort === 'sound') {
    const parts = path.split('.').filter((part) => part.length > 0);
    const kept = parts.length > 1 ? parts.slice(1) : parts;
    return capitalise(kept.join(' ').replace(/_/g, ' ').trim()) || id;
  }
  const last =
    path
      .split(/[/.]/)
      .filter((part) => part.length > 0)
      .pop() ?? path;
  return capitalise(last.replace(/_/g, ' ').trim()) || id;
}

/** The project's elements by id, with their kind. */
function projectElements(project: Project): Map<string, Element> {
  const out = new Map<string, Element>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) out.set(element.id, element);
  }
  return out;
}

/** The `display_name` of an element's data, when it is a non-empty string. */
function displayNameOf(element: Element | undefined): string | undefined {
  const name = asObject(element?.data)?.display_name;
  return typeof name === 'string' && name.trim().length > 0 ? name : undefined;
}

/** Whether the project has the asset `path` in `namespace`. */
function hasAsset(project: Project, namespace: string, path: string): boolean {
  return (
    project.namespaces
      .find((entry) => entry.name === namespace)
      ?.assets.some((asset) => asset.path === path) ?? false
  );
}

/** The first texture a model (or one of its parents in the project) names. */
function firstModelTexture(elements: Map<string, Element>, modelId: string): string | undefined {
  const seen = new Set<string>();
  let id: string | undefined = normalise(modelId);
  while (id !== undefined && !seen.has(id)) {
    seen.add(id);
    const model = elements.get(id);
    if (model === undefined || model.kind !== 'minecraft:model') return undefined;
    const data = asObject(model.data);
    const textures = asObject(data?.textures);
    if (textures !== undefined) {
      const preferred = ['layer0', 'all', 'side', 'top', 'texture', 'particle'];
      for (const key of [...preferred, ...Object.keys(textures)]) {
        const value = textures[key];
        if (typeof value === 'string' && !value.startsWith('#')) return value;
      }
    }
    id = typeof data?.parent === 'string' ? normalise(data.parent) : undefined;
  }
  return undefined;
}

/** The project texture of a project thing, when the project has the picture. */
function projectPicture(
  project: Project,
  elements: Map<string, Element>,
  element: Element | undefined,
  id: string,
  sort: ThingSort,
  texturesFolder: string,
): ThingPicture | null {
  const candidates: { namespace: string; path: string }[] = [];
  const data = asObject(element?.data);
  if (typeof data?.model === 'string') {
    const texture = firstModelTexture(elements, data.model);
    if (texture !== undefined) {
      const full = normalise(texture);
      candidates.push({
        namespace: namespaceOf(full),
        path: `${texturesFolder}/${pathOf(full)}.png`,
      });
    }
  }
  const namespace = namespaceOf(id);
  const path = pathOf(id);
  if (sort === 'effect')
    candidates.push({ namespace, path: `${texturesFolder}/mob_effect/${path}.png` });
  if (sort === 'item' || sort === 'block') {
    candidates.push({ namespace, path: `${texturesFolder}/item/${path}.png` });
    candidates.push({ namespace, path: `${texturesFolder}/block/${path}.png` });
  }
  if (sort === 'particle')
    candidates.push({ namespace, path: `${texturesFolder}/particle/${path}.png` });
  const found = candidates.find((candidate) =>
    hasAsset(project, candidate.namespace, candidate.path),
  );
  return found === undefined
    ? null
    : { from: 'project', assetPath: `assets/${found.namespace}/${found.path}` };
}

/** The vanilla jar paths that may hold a vanilla thing's picture, in the order to try. */
export function vanillaPicturePaths(
  id: string,
  sort: ThingSort,
  texturesFolder: string,
): readonly string[] {
  const namespace = namespaceOf(normalise(id));
  const path = pathOf(id);
  const base = `assets/${namespace}/${texturesFolder}`;
  switch (sort) {
    case 'item':
      return [`${base}/item/${path}.png`, `${base}/block/${path}.png`];
    case 'block':
      return [`${base}/block/${path}.png`, `${base}/item/${path}.png`];
    case 'mob':
      return [`${base}/item/${path}_spawn_egg.png`];
    case 'effect':
      return [`${base}/mob_effect/${path}.png`];
    case 'particle':
      return [`${base}/particle/${path}.png`];
    default:
      return [];
  }
}

/** The ids of `sort` in the registry view; dimensions fall back to the dimension types. */
function idsOf(registries: ThingRegistries, sort: ThingSort): readonly string[] {
  const ids = registries.ids(THING_REGISTRIES[sort]);
  if (sort === 'dimension' && ids.length === 0) return registries.ids('dimension_type');
  return ids;
}

/** The vanilla category a vanilla id goes under. */
function vanillaSection(
  id: string,
  sort: ThingSort,
  blocks: ReadonlySet<string>,
): { id: string; label: string } {
  if (sort === 'item') {
    if (pathOf(id).endsWith('_spawn_egg')) return { id: 'spawn-eggs', label: 'Spawn eggs' };
    if (blocks.has(id)) return { id: 'blocks', label: 'Minecraft blocks' };
    return { id: 'items', label: 'Minecraft items' };
  }
  const label = `Minecraft ${THING_WORDS[sort].many}`;
  return { id: sort, label: capitalise(label) };
}

/**
 * The picker's sections for one sort: "Your things" (the project's own, from its namespaces),
 * then the vanilla categories (empty ones left out). Ids are sorted within each section.
 */
export function thingSections(input: ThingSourceInput): ThingSection[] {
  const { project, registries, sort, texturesFolder } = input;
  const elements = projectElements(project);
  const ownNamespaces = new Set(project.namespaces.map((namespace) => namespace.name));
  const kinds = input.kinds ?? PROJECT_KINDS[sort];
  const own: Thing[] = [];
  const seen = new Set<string>();

  const addOwn = (id: string, element: Element | undefined): void => {
    if (seen.has(id)) return;
    seen.add(id);
    own.push({
      id,
      name: displayNameOf(element) ?? thingWords(id, sort),
      sort,
      source: 'project',
      picture: projectPicture(project, elements, element, id, sort, texturesFolder),
    });
  };

  if (input.kinds !== undefined) {
    // A definition trigger's subject: only project elements of the given kinds.
    for (const element of elements.values()) {
      if (kinds.includes(element.kind)) addOwn(element.id, element);
    }
  } else {
    for (const id of idsOf(registries, sort)) {
      if (ownNamespaces.has(namespaceOf(id))) addOwn(id, elements.get(id));
    }
    for (const element of elements.values()) {
      if (kinds.includes(element.kind)) addOwn(element.id, element);
    }
  }
  own.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const sections: ThingSection[] = [];
  if (own.length > 0) sections.push({ id: 'own', label: 'Your things', things: own });
  if (input.projectOnly === true) return sections;

  const blocks = new Set(sort === 'item' ? registries.ids('block') : []);
  const vanilla = new Map<string, { label: string; things: Thing[] }>();
  for (const id of idsOf(registries, sort)) {
    if (seen.has(id) || ownNamespaces.has(namespaceOf(id))) continue;
    seen.add(id);
    const section = vanillaSection(id, sort, blocks);
    const entry = vanilla.get(section.id) ?? { label: section.label, things: [] };
    const paths = vanillaPicturePaths(id, sort, texturesFolder);
    entry.things.push({
      id,
      name: thingWords(id, sort),
      sort,
      source: 'vanilla',
      picture: paths.length === 0 ? null : { from: 'vanilla', paths },
    });
    vanilla.set(section.id, entry);
  }
  const order = ['blocks', 'items', 'spawn-eggs'];
  const keys = [...vanilla.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b);
  });
  for (const key of keys) {
    const entry = vanilla.get(key);
    if (entry === undefined || entry.things.length === 0) continue;
    entry.things.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    sections.push({ id: key, label: entry.label, things: entry.things });
  }
  return sections;
}

/** Lower-case words of a query, for matching. */
const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[\s:_./]+/)
    .filter((word) => word.length > 0);

/**
 * The sections with only the things matching `query` (every word of the query starts a word
 * of the name or the id); empty sections are left out. An empty query keeps everything.
 */
export function filterThings(sections: readonly ThingSection[], query: string): ThingSection[] {
  const wanted = words(query);
  if (wanted.length === 0) return [...sections];
  const out: ThingSection[] = [];
  for (const section of sections) {
    const things = section.things.filter((thing) => {
      const have = [...words(thing.name), ...words(thing.id)];
      return wanted.every((word) => have.some((part) => part.startsWith(word)));
    });
    if (things.length > 0) out.push({ ...section, things });
  }
  return out;
}

/**
 * The display name of `id` for a chip: a project element's `display_name`, else words made
 * from the id.
 */
export function thingName(project: Project, id: string, sort?: ThingSort): string {
  for (const namespace of project.namespaces) {
    const element = namespace.elements.find((entry) => entry.id === id);
    const name = displayNameOf(element);
    if (name !== undefined) return name;
  }
  return thingWords(id, sort);
}
