/**
 * The built-in project commands.
 *
 * @packageDocumentation
 */

import type { Element, Json, Namespace, Project, ResourceLocation } from '@msm/plugin-api';
import type { Draft } from 'immer';
import { isValidNamespace, parseResourceLocation } from '../model/resource-location';
import type { ProjectCommand } from './command-stack';

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

function sortedIndex<T>(items: readonly T[], key: (item: T) => string, value: string): number {
  let index = 0;
  while (index < items.length && key(items[index] as T) < value) index++;
  return index;
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
  setElementData(id: ResourceLocation, data: Json): ProjectCommand {
    const copy = structuredClone(data);
    return {
      id: 'core.set-element-data',
      label: `Edit ${id}`,
      apply(draft) {
        const { namespace, index } = locate(draft, id);
        (namespace.elements[index] as Draft<Element>).data = copy;
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
};
