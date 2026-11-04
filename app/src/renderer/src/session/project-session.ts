/**
 * The renderer-hosted project session (ADR 0007): one element-kind registry, one command
 * stack and load/save through the platform's file system. No DOM access, so it is testable
 * with an in-memory platform.
 *
 * @packageDocumentation
 */

import {
  CommandStack,
  commands,
  createElement,
  createEmptyProject,
  ElementKindRegistry,
  type Json,
  loadProject,
  type Problem,
  type Project,
  type ProjectFileSystem,
  type ResourceLocation,
  registerPlugin,
  saveProject,
} from '@msm/core';
import type { Plugin } from '@msm/plugin-api';
import type { PlatformAdapter } from '../../../shared/platform';

/** Everything the UI renders from the session. Replaced, never mutated. */
export interface SessionSnapshot {
  /** The absolute project directory, or `null` when no project is open. */
  root: string | null;
  /** The current (frozen) project state. */
  project: Project | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | undefined;
  redoLabel: string | undefined;
  /** Problems found when the project was loaded. */
  problems: readonly Problem[];
}

const EMPTY: SessionSnapshot = {
  root: null,
  project: null,
  dirty: false,
  canUndo: false,
  canRedo: false,
  undoLabel: undefined,
  redoLabel: undefined,
  problems: [],
};

/**
 * The load problems that block saving. `loadProject` skips element files with error-severity
 * problems and `saveProject` deletes element files it did not write, so saving such a project
 * would destroy the skipped files. Phase 0 therefore refuses to save.
 */
export function saveBlockers(problems: readonly Problem[]): Problem[] {
  return problems.filter((problem) => problem.severity === 'error');
}

/** Thrown by {@link ProjectSession.save} when {@link saveBlockers} is not empty. */
export class SaveBlockedError extends Error {
  readonly problems: readonly Problem[];

  constructor(problems: readonly Problem[]) {
    super(
      `Saving is disabled: the project loaded with ${problems.length} error(s). Fix these files on disk and reopen the project:\n${problems
        .map((problem) => `- ${problem.path ?? problem.elementId ?? ''} ${problem.message}`.trim())
        .join('\n')}`,
    );
    this.name = 'SaveBlockedError';
    this.problems = problems;
  }
}

/** The outcome of a new/open request. */
export type OpenOutcome =
  | { ok: true }
  | { ok: false; reason: string }
  | { ok: false; cancelled: true };

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '');
  return parts[parts.length - 1] ?? 'Untitled';
}

/** A project session over a {@link PlatformAdapter}. */
export class ProjectSession {
  readonly registry = new ElementKindRegistry();
  readonly #platform: PlatformAdapter;
  readonly #fs: ProjectFileSystem;
  readonly #now: (() => string) | undefined;
  readonly #listeners = new Set<(snapshot: SessionSnapshot) => void>();
  #stack: CommandStack | null = null;
  #unsubscribeStack: (() => void) | null = null;
  #root: string | null = null;
  #problems: readonly Problem[] = [];
  #snapshot: SessionSnapshot = EMPTY;

  /**
   * @param platform - Host services; `platform.fs` is scoped to the open root.
   * @param options - Plugins to register and an optional clock for element timestamps.
   */
  constructor(
    platform: PlatformAdapter,
    options: { plugins?: readonly Plugin[]; now?: () => string } = {},
  ) {
    this.#platform = platform;
    this.#fs = platform.fs;
    this.#now = options.now;
    for (const plugin of options.plugins ?? []) registerPlugin(this.registry, plugin);
  }

  /** The current snapshot. */
  get snapshot(): SessionSnapshot {
    return this.#snapshot;
  }

  /** Subscribes to snapshot changes; returns an unsubscribe function. */
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Whether saving is currently blocked by load errors. */
  get saveBlocked(): boolean {
    return saveBlockers(this.#problems).length > 0;
  }

  /**
   * Asks for an empty directory, creates an empty project there and saves it.
   */
  async newProject(): Promise<OpenOutcome> {
    if (!(await this.#confirmDiscard())) return { ok: false, cancelled: true };
    const path = await this.#platform.dialogs.pickDirectory({
      title: 'Choose an empty folder for the new project',
      mustBeEmpty: true,
    });
    if (path === null) return { ok: false, cancelled: true };
    const created = await this.#platform.project.createRoot(path);
    if (!created.ok) return created;
    const project = createEmptyProject(baseName(path));
    await saveProject(this.#fs, project, this.registry);
    this.#adopt(path, project, []);
    return { ok: true };
  }

  /**
   * Asks for a project directory and loads it.
   */
  async openProject(): Promise<OpenOutcome> {
    if (!(await this.#confirmDiscard())) return { ok: false, cancelled: true };
    const path = await this.#platform.dialogs.pickDirectory({ title: 'Open an MSM project' });
    if (path === null) return { ok: false, cancelled: true };
    const opened = await this.#platform.project.openRoot(path);
    if (!opened.ok) return opened;
    try {
      const { project, problems } = await loadProject(this.#fs, this.registry);
      this.#adopt(path, project, problems);
      return { ok: true };
    } catch (error) {
      await this.#platform.project.closeRoot();
      this.#close();
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Saves the project.
   *
   * @throws {@link SaveBlockedError} If the project loaded with error-severity problems.
   * @throws Error If no project is open.
   */
  async save(): Promise<void> {
    const stack = this.#requireStack();
    const blockers = saveBlockers(this.#problems);
    if (blockers.length > 0) throw new SaveBlockedError(blockers);
    await saveProject(this.#fs, stack.state, this.registry);
    stack.markSaved();
    this.#publish();
  }

  /** Adds an empty namespace. */
  addNamespace(name: string): void {
    this.#requireStack().execute(commands.addNamespace(name));
  }

  /** Adds an element of a registered kind. */
  addElement(input: { id: ResourceLocation; kind: string; data?: Json }): void {
    if (this.registry.get(input.kind) === undefined) {
      throw new Error(`Unknown element kind ${JSON.stringify(input.kind)}.`);
    }
    const element = createElement({
      id: input.id,
      kind: input.kind,
      data: input.data ?? {},
      ...(this.#now === undefined ? {} : { now: this.#now }),
    });
    this.#requireStack().execute(commands.addElement(element));
  }

  /** Removes an element. */
  removeElement(id: ResourceLocation): void {
    this.#requireStack().execute(commands.removeElement(id));
  }

  /** Replaces an element's data. */
  setElementData(id: ResourceLocation, data: Json): void {
    this.#requireStack().execute(commands.setElementData(id, data));
  }

  /** Undoes the last command; returns `false` if there was none. */
  undo(): boolean {
    return this.#stack?.undo() ?? false;
  }

  /** Redoes the last undone command; returns `false` if there was none. */
  redo(): boolean {
    return this.#stack?.redo() ?? false;
  }

  async #confirmDiscard(): Promise<boolean> {
    if (!this.#snapshot.dirty) return true;
    return this.#platform.dialogs.confirmDiscard(
      'The current project has unsaved changes. Discard them?',
    );
  }

  #requireStack(): CommandStack {
    if (this.#stack === null) throw new Error('No project is open.');
    return this.#stack;
  }

  #adopt(root: string, project: Project, problems: readonly Problem[]): void {
    this.#unsubscribeStack?.();
    this.#stack = new CommandStack(project);
    this.#unsubscribeStack = this.#stack.subscribe(() => this.#publish());
    this.#root = root;
    this.#problems = problems;
    this.#publish();
  }

  #close(): void {
    this.#unsubscribeStack?.();
    this.#unsubscribeStack = null;
    this.#stack = null;
    this.#root = null;
    this.#problems = [];
    this.#publish();
  }

  #publish(): void {
    const stack = this.#stack;
    this.#snapshot =
      stack === null
        ? EMPTY
        : {
            root: this.#root,
            project: stack.state,
            dirty: stack.isDirty,
            canUndo: stack.canUndo,
            canRedo: stack.canRedo,
            undoLabel: stack.undoLabel(),
            redoLabel: stack.redoLabel(),
            problems: this.#problems,
          };
    for (const listener of [...this.#listeners]) listener(this.#snapshot);
  }
}
