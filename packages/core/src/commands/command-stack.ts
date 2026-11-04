/**
 * The undoable command stack. Every edit to a project goes through it.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/plugin-api';
import {
  applyPatches,
  type Draft,
  enablePatches,
  freeze,
  type Patch,
  produceWithPatches,
} from 'immer';
import { immerPatchesToJsonPatch, type JsonPatchOperation } from './json-pointer';

enablePatches();

/**
 * One undoable edit: an Immer recipe applied to a draft of the project.
 */
export interface ProjectCommand {
  /** Stable command id, for example `core.add-element`. */
  id: string;
  /** Label shown in the Edit menu ("Undo <label>"), in British English. */
  label: string;
  /**
   * Mutates the draft. Throwing aborts the command and leaves the state unchanged.
   *
   * @param draft - A mutable draft of the project.
   */
  apply(draft: Draft<Project>): void;
}

/** Sent to subscribers after every state change. */
export interface CommandEvent {
  /** What happened. */
  type: 'execute' | 'undo' | 'redo' | 'reset';
  /** The label of the command executed, undone or redone. */
  label?: string;
  /** The new state. */
  state: Project;
  /** The RFC 6902 patch that turned the previous state into `state`; empty for `reset`. */
  patches: JsonPatchOperation[];
}

interface HistoryEntry {
  label: string;
  forward: Patch[];
  inverse: Patch[];
  forwardJson: JsonPatchOperation[];
  inverseJson: JsonPatchOperation[];
  version: number;
}

/**
 * An Immer-based undo/redo stack over an immutable {@link Project}.
 *
 * States are deeply frozen. The project is dirty when its current version differs from the
 * version last marked as saved, so undoing back to the saved point makes it clean again.
 */
export class CommandStack {
  #state: Project;
  #history: HistoryEntry[] = [];
  /** Number of history entries currently applied. */
  #position = 0;
  /** Version of the state before the first history entry. */
  #baseVersion: number;
  #savedVersion: number;
  #nextVersion = 0;
  readonly #limit: number;
  readonly #listeners = new Set<(event: CommandEvent) => void>();

  /**
   * @param initial - The starting state. It is deeply frozen and treated as saved.
   * @param options - `limit` caps the number of undo steps (default 200).
   */
  constructor(initial: Project, options: { limit?: number } = {}) {
    const limit = options.limit ?? 200;
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('CommandStack limit must be a positive integer.');
    }
    this.#limit = limit;
    this.#state = freeze(initial, true);
    this.#baseVersion = this.#nextVersion++;
    this.#savedVersion = this.#baseVersion;
  }

  /** The current project state (deeply frozen). */
  get state(): Project {
    return this.#state;
  }

  /** Whether there is a command to undo. */
  get canUndo(): boolean {
    return this.#position > 0;
  }

  /** Whether there is a command to redo. */
  get canRedo(): boolean {
    return this.#position < this.#history.length;
  }

  /** Whether the state differs from the last saved state. */
  get isDirty(): boolean {
    return this.#currentVersion() !== this.#savedVersion;
  }

  /** The label of the command `undo` would revert. */
  undoLabel(): string | undefined {
    return this.#history[this.#position - 1]?.label;
  }

  /** The label of the command `redo` would re-apply. */
  redoLabel(): string | undefined {
    return this.#history[this.#position]?.label;
  }

  /**
   * Runs a command and records it. Commands that change nothing are not recorded.
   * Executing discards any redo history.
   *
   * @param command - The command.
   * @returns The RFC 6902 patch the command produced.
   */
  execute(command: ProjectCommand): JsonPatchOperation[] {
    const [next, forward, inverse] = produceWithPatches(this.#state, (draft) => {
      command.apply(draft);
    });
    if (forward.length === 0) return [];
    const forwardJson = immerPatchesToJsonPatch(forward);
    const entry: HistoryEntry = {
      label: command.label,
      forward,
      inverse,
      forwardJson,
      inverseJson: immerPatchesToJsonPatch(inverse),
      version: this.#nextVersion++,
    };
    this.#history.splice(this.#position);
    this.#history.push(entry);
    while (this.#history.length > this.#limit) {
      const dropped = this.#history.shift() as HistoryEntry;
      this.#baseVersion = dropped.version;
    }
    this.#position = this.#history.length;
    this.#state = next;
    this.#emit({ type: 'execute', label: entry.label, state: next, patches: forwardJson });
    return forwardJson;
  }

  /**
   * Reverts the last applied command.
   *
   * @returns `false` if there was nothing to undo.
   */
  undo(): boolean {
    const entry = this.#history[this.#position - 1];
    if (entry === undefined) return false;
    this.#state = applyPatches(this.#state, entry.inverse);
    this.#position--;
    this.#emit({
      type: 'undo',
      label: entry.label,
      state: this.#state,
      patches: entry.inverseJson,
    });
    return true;
  }

  /**
   * Re-applies the last undone command.
   *
   * @returns `false` if there was nothing to redo.
   */
  redo(): boolean {
    const entry = this.#history[this.#position];
    if (entry === undefined) return false;
    this.#state = applyPatches(this.#state, entry.forward);
    this.#position++;
    this.#emit({
      type: 'redo',
      label: entry.label,
      state: this.#state,
      patches: entry.forwardJson,
    });
    return true;
  }

  /**
   * Replaces the state, clears the history and marks the new state as saved. Used after
   * opening a project.
   *
   * @param state - The new state. It is deeply frozen.
   */
  reset(state: Project): void {
    this.#state = freeze(state, true);
    this.#history = [];
    this.#position = 0;
    this.#baseVersion = this.#nextVersion++;
    this.#savedVersion = this.#baseVersion;
    this.#emit({ type: 'reset', state: this.#state, patches: [] });
  }

  /** Records the current state as saved. */
  markSaved(): void {
    this.#savedVersion = this.#currentVersion();
  }

  /**
   * Subscribes to state changes.
   *
   * @param listener - Called after every execute, undo, redo and reset.
   * @returns A function that unsubscribes.
   */
  subscribe(listener: (event: CommandEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #currentVersion(): number {
    return this.#position === 0
      ? this.#baseVersion
      : (this.#history[this.#position - 1] as HistoryEntry).version;
  }

  #emit(event: CommandEvent): void {
    for (const listener of [...this.#listeners]) listener(event);
  }
}
