/**
 * The built-in project commands.
 *
 * @packageDocumentation
 */

import type {
  Asset,
  Element,
  Json,
  JsonObject,
  Namespace,
  Project,
  ResourceLocation,
} from '@msm/plugin-api';
import type { Draft } from 'immer';
import { assertProjectRelativePath } from '../fs/paths';
import { isValidNamespace, parseResourceLocation } from '../model/resource-location';
import { normaliseReferenceId, type Reference } from '../refs/reference-index';
import type { ProjectCommand } from './command-stack';
import { parseJsonPointer } from './json-pointer';

/** Thrown when adding an element whose id is already used in the project. */
export class DuplicateElementError extends Error {
  /**
   * @param id - The duplicated id.
   */
  constructor(id: string) {
    super(`An element with id "${id}" already exists.`);
    this.name = 'DuplicateElementError';
  }
}

/** Thrown when a command targets an element that does not exist. */
export class ElementNotFoundError extends Error {
  /**
   * @param id - The missing id.
   */
  constructor(id: string) {
    super(`No element with id "${id}" exists.`);
    this.name = 'ElementNotFoundError';
  }
}

type DraftNamespace = Draft<Namespace>;

function findNamespace(draft: Draft<Project>, name: string): DraftNamespace | undefined {
  return draft.namespaces.find((namespace) => namespace.name === name);
}

function locate(
  draft: Draft<Project>,
  id: ResourceLocation,
): { namespace: DraftNamespace; index: number } {
  const { namespace: name } = parseResourceLocation(id);
  const namespace = findNamespace(draft, name);
  const index = namespace?.elements.findIndex((element) => element.id === id) ?? -1;
  if (namespace === undefined || index < 0) throw new ElementNotFoundError(id);
  return { namespace, index };
}

/** Options shared by the element data commands. */
export interface EditOptions {
  /**
   * Coalescing key. Consecutive commands with the same key merge into one undo step while
   * they arrive within the command stack's coalescing window, for example `typing:/name`.
   */
  coalesce?: string;
}

const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/;

function isContainer(value: unknown): value is JsonObject | Json[] {
  return typeof value === 'object' && value !== null;
}

/** The pointer to the first `count` segments, quoted, for error messages. */
function describe(segments: readonly string[], count: number): string {
  return JSON.stringify(
    segments
      .slice(0, count)
      .map((segment) => `/${segment.replaceAll('~', '~0').replaceAll('/', '~1')}`)
      .join(''),
  );
}

/** A new empty container for a member whose next pointer segment is `next`. */
function containerFor(next: string): JsonObject | Json[] {
  return next === '-' || ARRAY_INDEX.test(next) ? [] : {};
}

/**
 * The array index a pointer segment names: a non-negative integer no greater than the
 * length, or the length itself for `-` (the append position).
 */
function arrayIndex(array: readonly Json[], segment: string, where: string): number {
  if (segment === '-') return array.length;
  if (!ARRAY_INDEX.test(segment)) {
    throw new Error(`${where} is an array; ${JSON.stringify(segment)} is not an array index.`);
  }
  const index = Number(segment);
  if (index > array.length) {
    throw new Error(`${where}: index ${index} is beyond the end of the array (${array.length}).`);
  }
  return index;
}

/**
 * Sets (or with `undefined`, deletes) the value at `segments` inside `root`, creating
 * missing intermediate containers. Mutates `root` in place and returns the new root, which
 * differs from `root` only when `segments` is empty.
 */
function setAt(root: Json, segments: readonly string[], value: Json | undefined): Json {
  if (segments.length === 0) {
    if (value === undefined) throw new Error('The whole element data cannot be deleted.');
    return value;
  }
  if (!isContainer(root)) {
    throw new Error('The element data is not an object or array, so it has no members.');
  }
  let container: JsonObject | Json[] = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i] as string;
    const next = segments[i + 1] as string;
    let child: Json | undefined;
    if (Array.isArray(container)) {
      const index = arrayIndex(container, segment, describe(segments, i));
      if (index === container.length) {
        if (value === undefined) return root;
        container.push(containerFor(next));
      }
      child = container[index];
    } else {
      if (!Object.hasOwn(container, segment)) {
        if (value === undefined) return root;
        container[segment] = containerFor(next);
      }
      child = container[segment];
    }
    if (!isContainer(child)) {
      throw new Error(
        `${describe(segments, i + 1)} is not an object or array, so it has no members.`,
      );
    }
    container = child;
  }
  const last = segments[segments.length - 1] as string;
  if (Array.isArray(container)) {
    const index = arrayIndex(container, last, describe(segments, segments.length - 1));
    if (value === undefined) {
      if (index < container.length) container.splice(index, 1);
    } else if (index === container.length) {
      container.push(value);
    } else {
      container[index] = value;
    }
  } else if (value === undefined) {
    delete container[last];
  } else {
    container[last] = value;
  }
  return root;
}

function sortedIndex<T>(items: readonly T[], key: (item: T) => string, value: string): number {
  let index = 0;
  while (index < items.length && key(items[index] as T) < value) index++;
  return index;
}

/** The value at `segments` inside `root`, or `undefined` when the path does not exist. */
function getAt(root: Json, segments: readonly string[]): Json | undefined {
  let current: Json | undefined = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!ARRAY_INDEX.test(segment)) return undefined;
      current = current[Number(segment)];
    } else if (isContainer(current)) {
      current = Object.hasOwn(current, segment) ? current[segment] : undefined;
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * The string that replaces `written` (a reference to the renamed id) when the id becomes
 * `newId`: a `#` prefix is kept, and an omitted namespace stays omitted only when `newId` is
 * in `minecraft`.
 */
function rewrittenReference(written: string, newId: string): string {
  const tag = written.startsWith('#') ? '#' : '';
  const bare = tag === '' ? written : written.slice(1);
  const omitted = !bare.includes(':');
  const MINECRAFT = 'minecraft:';
  const id = omitted && newId.startsWith(MINECRAFT) ? newId.slice(MINECRAFT.length) : newId;
  return `${tag}${id}`;
}

/** Renames the key `oldKey` of `object` to `newKey`, keeping the key order. */
function renameKey(object: JsonObject, oldKey: string, newKey: string, where: string): void {
  if (Object.hasOwn(object, newKey)) {
    throw new Error(`${where} already has a key ${JSON.stringify(newKey)}.`);
  }
  const entries = Object.entries(object);
  for (const [key] of entries) delete object[key];
  for (const [key, value] of entries) object[key === oldKey ? newKey : key] = value;
}

/**
 * Rewrites the references of one element in place. Value references go first (their paths
 * may pass through a renamed key), then key references deepest first, and text references
 * from the end of each line backwards so earlier ranges stay valid. A reference whose
 * current text no longer names `oldId` is skipped.
 */
function rewriteReferences(
  element: Draft<Element>,
  references: readonly Reference[],
  oldId: string,
  newId: string,
): number {
  const order = (reference: Reference): number =>
    reference.range !== undefined ? 0 : reference.key === true ? 2 : 1;
  const sorted = [...references].sort(
    (a, b) =>
      order(a) - order(b) ||
      (order(a) === 2 ? b.path.length - a.path.length : 0) ||
      (b.range?.start ?? 0) - (a.range?.start ?? 0),
  );
  let rewritten = 0;
  for (const reference of sorted) {
    const segments = parseJsonPointer(reference.path);
    if (reference.range !== undefined) {
      const line = getAt(element.data as Json, segments);
      if (typeof line !== 'string') continue;
      const { start, end } = reference.range;
      const token = line.slice(start, end);
      if (!token.includes(':') || normaliseReferenceId(token) !== oldId) continue;
      const next = `${line.slice(0, start)}${newId}${line.slice(end)}`;
      element.data = setAt(element.data as Json, segments, next) as Draft<Json>;
    } else if (reference.key === true) {
      if (segments.length === 0) continue;
      const parent = getAt(element.data as Json, segments.slice(0, -1));
      const key = segments[segments.length - 1] as string;
      if (!isContainer(parent) || Array.isArray(parent) || !Object.hasOwn(parent, key)) continue;
      if (normaliseReferenceId(key) !== oldId) continue;
      renameKey(
        parent,
        key,
        rewrittenReference(key, newId),
        `${element.id} ${describe(segments, segments.length - 1)}`,
      );
    } else {
      const value = getAt(element.data as Json, segments);
      if (typeof value !== 'string' || normaliseReferenceId(value) !== oldId) continue;
      element.data = setAt(
        element.data as Json,
        segments,
        rewrittenReference(value, newId),
      ) as Draft<Json>;
    }
    rewritten++;
  }
  return rewritten;
}

/** Factories for the built-in commands. Each returns a fresh {@link ProjectCommand}. */
export const commands = {
  /**
   * Adds an empty namespace, keeping namespaces sorted by name.
   *
   * @throws Error If the name is invalid (immediately) or already exists (on execute).
   */
  addNamespace(name: string): ProjectCommand {
    if (!isValidNamespace(name)) {
      throw new Error(`Invalid namespace name ${JSON.stringify(name)}.`);
    }
    return {
      id: 'core.add-namespace',
      label: `Add namespace "${name}"`,
      apply(draft) {
        if (findNamespace(draft, name) !== undefined) {
          throw new Error(`Namespace "${name}" already exists.`);
        }
        const index = sortedIndex(draft.namespaces, (namespace) => namespace.name, name);
        draft.namespaces.splice(index, 0, { name, elements: [], assets: [] });
      },
    };
  },

  /**
   * Removes a namespace with all its elements and asset records.
   *
   * @throws Error On execute, if the namespace does not exist.
   */
  removeNamespace(name: string): ProjectCommand {
    return {
      id: 'core.remove-namespace',
      label: `Remove namespace "${name}"`,
      apply(draft) {
        const index = draft.namespaces.findIndex((namespace) => namespace.name === name);
        if (index < 0) throw new Error(`Namespace "${name}" does not exist.`);
        draft.namespaces.splice(index, 1);
      },
    };
  },

  /**
   * Adds an element to the namespace of its id, keeping elements sorted by id.
   *
   * @throws `InvalidResourceLocationError` If the id is malformed (immediately).
   * @throws {@link DuplicateElementError} On execute, if the id is already used.
   * @throws Error On execute, if the namespace does not exist.
   */
  addElement(element: Element): ProjectCommand {
    const { namespace: name } = parseResourceLocation(element.id);
    const copy = structuredClone(element);
    return {
      id: 'core.add-element',
      label: `Add ${element.id}`,
      apply(draft) {
        const namespace = findNamespace(draft, name);
        if (namespace === undefined) throw new Error(`Namespace "${name}" does not exist.`);
        for (const other of draft.namespaces) {
          if (other.elements.some((existing) => existing.id === element.id)) {
            throw new DuplicateElementError(element.id);
          }
        }
        const index = sortedIndex(namespace.elements, (existing) => existing.id, element.id);
        namespace.elements.splice(index, 0, copy as Draft<Element>);
      },
    };
  },

  /**
   * Removes an element.
   *
   * @throws {@link ElementNotFoundError} On execute, if the element does not exist.
   */
  removeElement(id: ResourceLocation): ProjectCommand {
    return {
      id: 'core.remove-element',
      label: `Remove ${id}`,
      apply(draft) {
        const { namespace, index } = locate(draft, id);
        namespace.elements.splice(index, 1);
      },
    };
  },

  /**
   * Replaces an element's data.
   *
   * @throws {@link ElementNotFoundError} On execute, if the element does not exist.
   */
  setElementData(id: ResourceLocation, data: Json, options: EditOptions = {}): ProjectCommand {
    const copy = structuredClone(data);
    return {
      id: 'core.set-element-data',
      label: `Edit ${id}`,
      ...(options.coalesce === undefined ? {} : { coalesce: options.coalesce }),
      apply(draft) {
        const { namespace, index } = locate(draft, id);
        (namespace.elements[index] as Draft<Element>).data = copy;
      },
    };
  },

  /**
   * Sets one value inside an element's data, addressed by an RFC 6901 pointer.
   *
   * Missing intermediate containers are created: an array when the next segment is an array
   * index or `-`, otherwise an object. `undefined` deletes the value (array items are
   * spliced out); deleting something that does not exist changes nothing. In an array, an
   * existing index is replaced and the index equal to the length, or `-`, appends. The
   * pointer `""` replaces the whole data.
   *
   * @param id - The element.
   * @param pointer - RFC 6901 pointer into the element's data, for example `/textures/all`.
   * @param value - The new value, or `undefined` to delete.
   * @param options - Coalescing key.
   * @throws Error If the pointer is malformed (immediately).
   * @throws {@link ElementNotFoundError} On execute, if the element does not exist.
   * @throws Error On execute, if the pointer passes through a non-container value, names a
   *   non-index member of an array or an index beyond its end, or deletes the whole data.
   */
  setElementValue(
    id: ResourceLocation,
    pointer: string,
    value: Json | undefined,
    options: EditOptions = {},
  ): ProjectCommand {
    const segments = parseJsonPointer(pointer);
    const copy = value === undefined ? undefined : structuredClone(value);
    return {
      id: 'core.set-element-value',
      label: `Edit ${id}`,
      ...(options.coalesce === undefined ? {} : { coalesce: options.coalesce }),
      apply(draft) {
        const { namespace, index } = locate(draft, id);
        const element = namespace.elements[index] as Draft<Element>;
        const next = setAt(element.data as Json, segments, copy);
        if (next !== element.data) element.data = next;
      },
    };
  },

  /**
   * Adds an asset record to a namespace, keeping assets sorted by path. The bytes are
   * written by the host before this command runs; this command only records them.
   *
   * @throws Error If the asset path is not a relative POSIX path (immediately).
   * @throws Error On execute, if the namespace does not exist or already has an asset at
   *   that path.
   */
  addAsset(namespace: string, asset: Asset): ProjectCommand {
    assertProjectRelativePath(asset.path);
    const copy: Asset = { path: asset.path, mediaType: asset.mediaType };
    return {
      id: 'core.add-asset',
      label: `Add asset ${namespace}:${asset.path}`,
      apply(draft) {
        const target = findNamespace(draft, namespace);
        if (target === undefined) throw new Error(`Namespace "${namespace}" does not exist.`);
        if (target.assets.some((existing) => existing.path === copy.path)) {
          throw new Error(`Namespace "${namespace}" already has an asset at "${copy.path}".`);
        }
        const index = sortedIndex(target.assets, (existing) => existing.path, copy.path);
        target.assets.splice(index, 0, copy);
      },
    };
  },

  /**
   * Removes an asset record from a namespace. The host deletes the bytes.
   *
   * @throws Error On execute, if the namespace or the asset does not exist.
   */
  removeAsset(namespace: string, path: string): ProjectCommand {
    return {
      id: 'core.remove-asset',
      label: `Remove asset ${namespace}:${path}`,
      apply(draft) {
        const target = findNamespace(draft, namespace);
        if (target === undefined) throw new Error(`Namespace "${namespace}" does not exist.`);
        const index = target.assets.findIndex((existing) => existing.path === path);
        if (index < 0) throw new Error(`Namespace "${namespace}" has no asset at "${path}".`);
        target.assets.splice(index, 1);
      },
    };
  },

  /**
   * Renames an element and rewrites the references to it, as one undoable step (ADR 0016).
   *
   * The element keeps its kind, data and `meta`; it moves to the namespace of `newId` when
   * that differs (save then moves its file through the manifest). Each reference whose
   * `to` is `oldId` is rewritten in the element named by its `from` (the renamed element
   * itself included): string values and map keys keep a `#` prefix and keep an omitted
   * namespace only when `newId` is in `minecraft`; text references replace the token at
   * their `range` with `newId`. References whose current text no longer names `oldId`, or
   * whose element or path no longer exists, are skipped. Build `references` from a
   * `ReferenceIndex` of the state the command runs on, for example
   * `index.referencesTo(oldId)`.
   *
   * @param oldId - The element to rename.
   * @param newId - Its new id.
   * @param references - The references to rewrite.
   * @throws `InvalidResourceLocationError` If `newId` is malformed (immediately).
   * @throws {@link ElementNotFoundError} On execute, if `oldId` does not exist.
   * @throws {@link DuplicateElementError} On execute, if `newId` is already used; the
   *   session reports this as `refs.rename-conflict`.
   * @throws Error On execute, if the namespace of `newId` does not exist, or a renamed map
   *   key would collide with an existing key.
   */
  renameElement(
    oldId: ResourceLocation,
    newId: ResourceLocation,
    references: readonly Reference[],
  ): ProjectCommand {
    const { namespace: newName } = parseResourceLocation(newId);
    const relevant = references
      .filter((reference) => reference.to === oldId)
      .map((reference) => structuredClone(reference));
    return {
      id: 'core.rename-element',
      label: `Rename ${oldId} to ${newId}`,
      apply(draft) {
        const { namespace, index } = locate(draft, oldId);
        for (const other of draft.namespaces) {
          if (other.elements.some((existing) => existing.id === newId)) {
            throw new DuplicateElementError(newId);
          }
        }
        const target = findNamespace(draft, newName);
        if (target === undefined) throw new Error(`Namespace "${newName}" does not exist.`);

        const bySource = new Map<string, Reference[]>();
        for (const reference of relevant) {
          const list = bySource.get(reference.from);
          if (list === undefined) bySource.set(reference.from, [reference]);
          else list.push(reference);
        }
        for (const [from, list] of bySource) {
          let source: Draft<Element> | undefined;
          for (const candidate of draft.namespaces) {
            source = candidate.elements.find((existing) => existing.id === from);
            if (source !== undefined) break;
          }
          if (source !== undefined) rewriteReferences(source, list, oldId, newId);
        }

        const [element] = namespace.elements.splice(index, 1) as [Draft<Element>];
        element.id = newId;
        const position = sortedIndex(target.elements, (existing) => existing.id, newId);
        target.elements.splice(position, 0, element);
      },
    };
  },

  /**
   * Sets or clears an element's notes.
   *
   * @throws {@link ElementNotFoundError} On execute, if the element does not exist.
   */
  setElementNotes(id: ResourceLocation, notes: string | undefined): ProjectCommand {
    return {
      id: 'core.set-element-notes',
      label: `Edit notes of ${id}`,
      apply(draft) {
        const { namespace, index } = locate(draft, id);
        const meta = (namespace.elements[index] as Draft<Element>).meta;
        if (notes === undefined) delete meta.notes;
        else meta.notes = notes;
      },
    };
  },

  /** Renames the project. */
  renameProject(name: string): ProjectCommand {
    return {
      id: 'core.rename-project',
      label: 'Rename project',
      apply(draft) {
        draft.name = name;
      },
    };
  },

  /** Sets one project setting. */
  setSetting(key: string, value: Json): ProjectCommand {
    const copy = structuredClone(value);
    return {
      id: 'core.set-setting',
      label: `Change setting "${key}"`,
      apply(draft) {
        draft.settings[key] = copy;
      },
    };
  },

  /**
   * Replaces the project's target ids (`/targets` in `msm.project.json`), for example when the
   * user upgrades the project to another target. One undo step; never coalesced, so two
   * consecutive target changes stay two steps.
   *
   * @param targets - The new target ids, first the primary one, for example `['mc-<version>']`.
   * @throws Error If the list is empty, holds an empty or non-string id, or names an id twice
   *   (immediately).
   */
  setTargets(targets: readonly string[]): ProjectCommand {
    if (targets.length === 0) throw new Error('A project needs at least one target.');
    for (const id of targets) {
      if (typeof id !== 'string' || id.trim() === '') {
        throw new Error(`Invalid target id ${JSON.stringify(id)}.`);
      }
    }
    if (new Set(targets).size !== targets.length) {
      throw new Error(`Target ids must be unique: ${JSON.stringify(targets)}.`);
    }
    const copy = [...targets];
    return {
      id: 'core.set-targets',
      label: `Change target to ${copy.join(', ')}`,
      apply(draft) {
        draft.targets = [...copy];
      },
    };
  },
};
