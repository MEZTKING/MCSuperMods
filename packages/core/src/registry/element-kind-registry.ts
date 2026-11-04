/**
 * The element kind registry, filled by plugins.
 *
 * @packageDocumentation
 */

import type { ElementKind } from '@msm/plugin-api';

/**
 * Thrown when a kind id or kind-folder is registered twice.
 */
export class DuplicateKindError extends Error {
  /**
   * @param message - What was duplicated.
   */
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateKindError';
  }
}

/**
 * Holds every registered {@link ElementKind}, keyed by id and by folder.
 */
export class ElementKindRegistry {
  readonly #byId = new Map<string, ElementKind>();
  readonly #byFolder = new Map<string, ElementKind>();

  /**
   * Registers a kind.
   *
   * @param kind - The kind to register.
   * @throws {@link DuplicateKindError} If the id or the folder is already registered.
   */
  register(kind: ElementKind): void {
    if (this.#byId.has(kind.id)) {
      throw new DuplicateKindError(
        `Element kind ${JSON.stringify(kind.id)} is already registered.`,
      );
    }
    const existing = this.#byFolder.get(kind.folder);
    if (existing !== undefined) {
      throw new DuplicateKindError(
        `Kind-folder ${JSON.stringify(kind.folder)} of ${JSON.stringify(kind.id)} is already used by ${JSON.stringify(existing.id)}.`,
      );
    }
    this.#byId.set(kind.id, kind);
    this.#byFolder.set(kind.folder, kind);
  }

  /** The kind with this id, if registered. */
  get(id: string): ElementKind | undefined {
    return this.#byId.get(id);
  }

  /** Every registered kind, in registration order. */
  all(): readonly ElementKind[] {
    return [...this.#byId.values()];
  }

  /** The kind-folder of a registered kind. */
  folderFor(kindId: string): string | undefined {
    return this.#byId.get(kindId)?.folder;
  }

  /** The kind that owns a kind-folder. */
  kindForFolder(folder: string): ElementKind | undefined {
    return this.#byFolder.get(folder);
  }
}
