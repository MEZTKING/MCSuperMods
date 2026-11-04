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
   * Coalescing key. When the previous history entry was recorded with the same key less than
   * the stack's coalescing window ago, and nothing was undone, redone, reset or saved since,
   * this command merges into that entry instead of adding a new undo step.
   */
  coalesce?: string;
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
  coalesce?: string;
  /** When the entry was last executed or merged into, from the stack's clock. */
  time: number;
}

/** Options for {@link CommandStack}. */
export interface CommandStackOptions {
  /** Maximum number of undo steps (default 200). */
  limit?: number;
  /** How long, in milliseconds, commands with the same coalescing key keep merging (default 800). */
  coalesceWindowMs?: number;
  /** The clock used for coalescing, in milliseconds (default `Date.now`). */
  now?: () => number;
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
  readonly #coalesceWindowMs: number;
  readonly #now: () => number;
  /** The entry the next command may merge into; cleared by undo, redo, reset and save. */
  #coalesceTarget: HistoryEntry | undefined;
  readonly #listeners = new Set<(event: CommandEvent) => void>();

  /**
   * @param initial - The starting state. It is deeply frozen and treated as saved.
   * @param options - `limit` caps the number of undo steps (default 200); `coalesceWindowMs`
   *   (default 800) and `now` (default `Date.now`) control command coalescing.
   */
  constructor(initial: Project, options: CommandStackOptions = {}) {
    const limit = options.limit ?? 200;
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('CommandStack limit must be a positive integer.');
    }
    const window = options.coalesceWindowMs ?? 800;
    if (!Number.isFinite(window) || window < 0) {
      throw new RangeError('CommandStack coalesceWindowMs must be a non-negative number.');
    }
    this.#limit = limit;
    this.#coalesceWindowMs = window;
    this.#now = options.now ?? Date.now;
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
   * Executing discards any redo history. A command with a `coalesce` key merges into the
   * previous entry when that entry has the same key, was recorded within the coalescing
   * window and nothing was undone, redone, reset or saved since; the merged entry keeps its
   * label and undoes both edits in one step.
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
    const inverseJson = immerPatchesToJsonPatch(inverse);
    const time = this.#now();

    const previous = this.#coalesceTarget;
    if (
      command.coalesce !== undefined &&
      previous !== undefined &&
      previous.coalesce === command.coalesce &&
      previous === this.#history[this.#position - 1] &&
      this.#position === this.#history.length &&
      time - previous.time < this.#coalesceWindowMs
    ) {
      previous.forward = [...previous.forward, ...forward];
      previous.inverse = [...inverse, ...previous.inverse];
      previous.forwardJson = [...previous.forwardJson, ...forwardJson];
      previous.inverseJson = [...inverseJson, ...previous.inverseJson];
      previous.version = this.#nextVersion++;
      previous.time = time;
      this.#state = next;
      this.#emit({ type: 'execute', label: previous.label, state: next, patches: forwardJson });
      return forwardJson;
    }

    const entry: HistoryEntry = {
      label: command.label,
      forward,
      inverse,
      forwardJson,
      inverseJson,
      version: this.#nextVersion++,
      time,
      ...(command.coalesce === undefined ? {} : { coalesce: command.coalesce }),
    };
    this.#coalesceTarget = entry;
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
    this.#coalesceTarget = undefined;
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
    this.#coalesceTarget = undefined;
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
    this.#coalesceTarget = undefined;
    this.#position = 0;
    this.#baseVersion = this.#nextVersion++;
    this.#savedVersion = this.#baseVersion;
    this.#emit({ type: 'reset', state: this.#state, patches: [] });
  }

  /** Records the current state as saved. The next command starts a new undo step. */
  markSaved(): void {
    this.#coalesceTarget = undefined;
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
