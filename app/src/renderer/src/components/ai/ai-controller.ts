/**
 * The AI helper's controller (ADR 0041 D3, D5, D8): glues `platform.ai` (main), the
 * conversation store (`useAiStore`), the tool executor and the project session together.
 *
 * - {@link AiController.send} starts a run: the user's message goes into the transcript, the
 *   project context block (target, namespaces, counts, the pending changeset) and any visible
 *   context blocks go with it to main, and every `tool_request` of the run is answered by the
 *   conversation's executor.
 * - {@link AiController.apply} applies the accepted change items as one undo step;
 *   {@link AiController.discard} drops them.
 * - {@link AiController.explainProblem} and {@link AiController.askAboutElement} open the panel
 *   in chat mode with a context block waiting in the input area; nothing is sent until the user
 *   presses Send.
 *
 * The panel's own state (the key status, the Settings model, the conversation's model and the
 * input drafts) lives in {@link useAiPanelStore}.
 *
 * @packageDocumentation
 */

import {
  type AiEvent,
  type AiMode,
  type AiModelId,
  type AiSettings,
  DEFAULT_AI_SETTINGS,
  modelInfo,
  projectContextBlock,
} from '@msm/ai';
import type { Problem, Project, ResourceLocation } from '@msm/core';
import { create } from 'zustand';
import type { AiKeyStatus, AiPlatform, AppSettingsView } from '../../../../shared/platform';
import { elementContextBlock, problemContextBlock } from '../../ai/context-blocks';
import { projectContextOf } from '../../ai/project-context';
import { createToolExecutor } from '../../ai/tool-executor';
import type { ChangesetPlanOptions } from '../../changeset/changeset';
import type { ApplyChangesetResult, ProjectSession } from '../../session/project-session';
import {
  type AiConversation,
  addNotice,
  isRunning,
  recordToolResult,
  useAiStore,
} from '../../store/ai-store';
import { useUiStore } from '../../store/ui-store';
import type { AiPicture } from './ai-pictures';

/** A context block waiting in the input area, shown as a chip with its text quoted. */
export interface AiContextDraft {
  /** The chip's label, for example "Problem schema.type on ruby:ruby_ore". */
  label: string;
  /** The block sent with the message. */
  block: string;
}

/** The input area of one conversation. */
export interface AiDraft {
  text: string;
  context: AiContextDraft | null;
  /** Pictures to send with the message (ADR 0048). */
  pictures?: readonly AiPicture[];
}

/** The panel's state beside the conversations. */
export interface AiPanelState {
  /** The key status from main, or `null` before the first read. */
  keyStatus: AiKeyStatus | null;
  /** The AI settings as last read, or `null` before the first read. */
  settings: AiSettings | null;
  /** The model each conversation (by project root) was started with. */
  models: Record<string, AiModelId>;
  /** The input area per project root. */
  drafts: Record<string, AiDraft>;
  /** `true` while Apply runs. */
  applying: boolean;
  /** Increases when the input should take the focus (an entry point filled it). */
  focusRequest: number;
}

/** The panel's store. */
export const useAiPanelStore = create<AiPanelState>()(() => ({
  keyStatus: null,
  settings: null,
  models: {},
  drafts: {},
  applying: false,
  focusRequest: 0,
}));

/** An empty draft. */
export const EMPTY_DRAFT: AiDraft = Object.freeze({ text: '', context: null }) as AiDraft;

/** The default text of "Explain" (editable before sending). */
export const EXPLAIN_PROBLEM_TEXT = 'Explain this problem and how to fix it.';
/** The default text of "Ask AI" (editable before sending). */
export const ASK_ELEMENT_TEXT = 'Tell me about this element.';

/** The model's short label: "Opus 5.5" for "Claude Opus 5.5". */
export function shortModelLabel(model: AiModelId): string {
  return modelInfo(model).label.replace(/^Claude /, '');
}

/** The notice after a model change while a conversation exists. */
export function modelChangeNotice(model: AiModelId): string {
  return `Start a new conversation to use ${shortModelLabel(model)}.`;
}

/** The notice after Apply. */
export function applyNotice(result: ApplyChangesetResult): string {
  const applied = result.applied.length;
  const skipped = result.skipped.length;
  if (applied === 0) {
    return skipped === 0
      ? 'Nothing was applied.'
      : `Nothing was applied: ${skipped} change${skipped === 1 ? '' : 's'} no longer fit the project.`;
  }
  let text = `Applied ${applied} change${applied === 1 ? '' : 's'}. Undo reverts ${applied === 1 ? 'it' : 'them'} in one step.`;
  if (skipped > 0) {
    text += ` ${skipped} change${skipped === 1 ? '' : 's'} no longer fit the project and ${skipped === 1 ? 'was' : 'were'} left out.`;
  }
  return text;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What the controller needs from the app. */
export interface AiControllerDeps {
  session: ProjectSession;
  /** Main's AI services; `undefined` in hosts without them (the panel then says so). */
  ai: AiPlatform | undefined;
  /** Reads the app settings (for the model, the efforts and the default limits). */
  loadSettings(): Promise<AppSettingsView>;
  /** New conversation and run ids; `crypto.randomUUID` by default. */
  newId?: () => string;
}

/** One run the controller is answering tool requests for. */
interface ActiveRun {
  root: string;
  abort: AbortController;
  execute: ReturnType<typeof createToolExecutor>;
}

/** The AI helper's controller; one per app window. */
export class AiController {
  readonly #session: ProjectSession;
  readonly #ai: AiPlatform | undefined;
  readonly #loadSettings: () => Promise<AppSettingsView>;
  readonly #newId: () => string;
  readonly #runs = new Map<string, ActiveRun>();
  #detach: (() => void) | null = null;

  constructor(deps: AiControllerDeps) {
    this.#session = deps.session;
    this.#ai = deps.ai;
    this.#loadSettings = deps.loadSettings;
    this.#newId = deps.newId ?? (() => crypto.randomUUID());
  }

  /** Whether main offers the AI helper. */
  get available(): boolean {
    return this.#ai !== undefined;
  }

  /** The open project's root, or `null`. */
  get root(): string | null {
    return this.#session.snapshot.root;
  }

  /**
   * Subscribes to main's run events and to project changes (runs of a project that is no
   * longer open are cancelled). Returns the detach function; calling it twice is harmless.
   */
  attach(): () => void {
    if (this.#detach !== null) return this.#detach;
    const offEvents =
      this.#ai?.onEvent((runId, event) => this.#onEvent(runId, event)) ?? (() => {});
    let root = this.root;
    const offSession = this.#session.subscribe((snapshot) => {
      if (snapshot.root === root) return;
      root = snapshot.root;
      for (const [runId, run] of this.#runs) {
        if (run.root !== root) void this.#cancel(runId);
      }
    });
    this.#detach = () => {
      offEvents();
      offSession();
      this.#detach = null;
    };
    return this.#detach;
  }

  /** Reads the key status and the AI settings into the panel store. */
  async refresh(): Promise<void> {
    await Promise.all([this.refreshKey(), this.refreshSettings()]);
  }

  /** Reads the key status (a failure reads as "no key"). */
  async refreshKey(): Promise<AiKeyStatus | null> {
    if (this.#ai === undefined) return null;
    let status: AiKeyStatus;
    try {
      status = await this.#ai.keyStatus();
    } catch {
      status = { set: false, tail: null, encryptionAvailable: false };
    }
    useAiPanelStore.setState({ keyStatus: status });
    return status;
  }

  /**
   * Reads the AI settings; the open conversations take the new default limits, and a model
   * change adds the notice "Start a new conversation to use <model>" to every conversation
   * started with another model.
   */
  async refreshSettings(): Promise<AiSettings> {
    let settings: AiSettings = DEFAULT_AI_SETTINGS;
    try {
      settings = (await this.#loadSettings()).ai ?? DEFAULT_AI_SETTINGS;
    } catch {
      // Keep the defaults.
    }
    const before = useAiPanelStore.getState().settings;
    useAiPanelStore.setState({ settings });
    const store = useAiStore.getState();
    for (const root of Object.keys(store.conversations)) store.setLimits(root, settings.limits);
    if (before !== null && before.model !== settings.model) this.modelChanged(settings.model);
    return settings;
  }

  /** Adds the model-change notice to every conversation started with another model. */
  modelChanged(model: AiModelId): void {
    const { models } = useAiPanelStore.getState();
    const store = useAiStore.getState();
    for (const [root, conversation] of Object.entries(store.conversations)) {
      const used = models[root];
      if (used === undefined || used === model || conversation.messages.length === 0) continue;
      store.update(root, (current) => addNotice(current, 'info', modelChangeNotice(model)));
    }
  }

  /** The open project's conversation, created when missing. */
  conversation(): AiConversation | null {
    const root = this.root;
    if (root === null) return null;
    const settings = useAiPanelStore.getState().settings ?? DEFAULT_AI_SETTINGS;
    return useAiStore.getState().ensureConversation(root, this.#newId, {
      limits: settings.limits,
    });
  }

  /** Switches the open conversation's mode (not while a run is in progress). */
  setMode(mode: AiMode): void {
    const conversation = this.conversation();
    const root = this.root;
    if (conversation === null || root === null || isRunning(conversation)) return;
    useAiStore.getState().setMode(root, mode);
  }

  /** The open project's input area. */
  draft(): AiDraft {
    const root = this.root;
    return root === null ? EMPTY_DRAFT : (useAiPanelStore.getState().drafts[root] ?? EMPTY_DRAFT);
  }

  /** Replaces the open project's input area. */
  setDraft(draft: AiDraft): void {
    const root = this.root;
    if (root === null) return;
    useAiPanelStore.setState((state) => ({ drafts: { ...state.drafts, [root]: draft } }));
  }

  /** Opens the AI helper tab, or goes back to Problems when it is open. */
  toggle(): void {
    const ui = useUiStore.getState();
    if (ui.rightDock === 'assistant') ui.setRightDock('problems');
    else this.open();
  }

  /** Opens the AI helper tab and re-reads the key status. */
  open(): void {
    useUiStore.getState().setRightDock('assistant');
    void this.refresh();
  }

  /**
   * Opens the panel in chat mode with the problem as a context block (its code, message,
   * element id and path, and the element's kind and data) and a default question.
   */
  explainProblem(problem: Problem): void {
    const project = this.#session.snapshot.project;
    const element =
      problem.elementId === undefined || project === null
        ? null
        : findElement(project, problem.elementId);
    const where = problem.elementId === undefined ? '' : ` on ${problem.elementId}`;
    this.#prefill(
      { label: `Problem ${problem.code}${where}`, block: problemContextBlock(problem, element) },
      EXPLAIN_PROBLEM_TEXT,
    );
  }

  /** Opens the panel in chat mode with the element (kind and data) as a context block. */
  askAboutElement(id: ResourceLocation): void {
    const project = this.#session.snapshot.project;
    const element = project === null ? null : findElement(project, id);
    if (element === null) return;
    this.#prefill(
      { label: `Element ${element.id} (${element.kind})`, block: elementContextBlock(element) },
      ASK_ELEMENT_TEXT,
    );
  }

  #prefill(context: AiContextDraft, text: string): void {
    this.open();
    this.setMode('chat');
    const current = this.draft();
    this.setDraft({ text: current.text.trim() === '' ? text : current.text, context });
    useAiPanelStore.setState((state) => ({ focusRequest: state.focusRequest + 1 }));
  }

  /**
   * Sends a message: adds it to the transcript, starts a run in main and answers its tool
   * requests. Does nothing while a run is in progress or without a project.
   *
   * @returns The run id, or `null` when nothing was sent.
   */
  async send(
    text: string,
    contextBlocks: readonly string[] = [],
    pictures: readonly AiPicture[] = [],
  ): Promise<string | null> {
    const ai = this.#ai;
    const root = this.root;
    const conversation = this.conversation();
    if (ai === undefined || root === null || conversation === null) return null;
    if (isRunning(conversation) || (text.trim() === '' && pictures.length === 0)) return null;
    if (text.trim() === '') {
      // The API needs some text with the pictures.
      text =
        conversation.mode === 'build'
          ? 'Build what this picture shows.'
          : 'What does this picture show, and how could I make it?';
    }
    const store = useAiStore.getState();
    const panel = useAiPanelStore.getState();
    if (panel.models[root] === undefined) {
      const model = (panel.settings ?? DEFAULT_AI_SETTINGS).model;
      useAiPanelStore.setState((state) => ({ models: { ...state.models, [root]: model } }));
    }
    const runId = this.#newId();
    store.appendUser(
      root,
      text,
      contextBlocks,
      pictures.map((picture) => picture.url),
    );
    store.startRun(root, runId);
    const started = useAiStore.getState().conversations[root];
    const run = started?.run;
    if (started === undefined || run == null) return null;
    const execute = createToolExecutor(this.#session, started.changeset, {
      proposePlan: (plan) => useAiStore.getState().proposePlan(root, plan, runId),
      checkpoint: (input) => useAiStore.getState().checkpoint(root, input, runId),
    });
    // Registered before `start`, whose first events may arrive before it resolves.
    this.#runs.set(runId, { root, abort: new AbortController(), execute });
    const projectBlock = projectContextBlock(projectContextOf(this.#session, started.changeset));
    try {
      await ai.start({
        runId,
        conversationId: started.id,
        mode: run.mode,
        text,
        contextBlocks: [projectBlock, ...contextBlocks],
        ...(pictures.length > 0
          ? {
              images: pictures.map(({ mediaType, data }) => ({ mediaType, data })),
            }
          : {}),
        limits: run.limits,
      });
    } catch (error) {
      this.#onEvent(runId, { type: 'done', reason: 'error', message: messageOf(error) });
    }
    return runId;
  }

  /** Sends the open project's draft (text plus its context block) and clears it. */
  async sendDraft(): Promise<string | null> {
    const draft = this.draft();
    const conversation = this.conversation();
    const pictures = draft.pictures ?? [];
    if (conversation === null || isRunning(conversation)) return null;
    if (draft.text.trim() === '' && pictures.length === 0) return null;
    this.setDraft(EMPTY_DRAFT);
    return this.send(draft.text, draft.context === null ? [] : [draft.context.block], pictures);
  }

  /** Stops the open conversation's run. */
  async stop(): Promise<void> {
    const runId = this.conversation()?.run?.runId;
    const conversation = this.conversation();
    if (runId === undefined || conversation === null || !isRunning(conversation)) return;
    await this.#cancel(runId);
  }

  async #cancel(runId: string): Promise<void> {
    const run = this.#runs.get(runId);
    run?.abort.abort();
    try {
      await this.#ai?.cancel(runId);
    } catch {
      // Main ends the run either way.
    }
  }

  /**
   * Starts the open project's conversation afresh: the run is stopped, main forgets the
   * conversation, the transcript, plan and pending changeset are cleared. The panel asks
   * for confirmation first when the changeset has items.
   */
  async newConversation(): Promise<void> {
    const root = this.root;
    const conversation = this.conversation();
    if (root === null || conversation === null) return;
    const runId = conversation.run?.runId;
    if (runId !== undefined && isRunning(conversation)) await this.#cancel(runId);
    try {
      await this.#ai?.dropConversation(conversation.id);
    } catch {
      // A conversation main does not know is already gone.
    }
    useAiStore.getState().resetConversation(root, this.#newId());
    useAiPanelStore.setState((state) => {
      const { [root]: _model, ...models } = state.models;
      const { [root]: _draft, ...drafts } = state.drafts;
      return { models, drafts };
    });
  }

  /** The plan options that make conflicts match what Apply does (renames rewrite references). */
  #planOptions(): ChangesetPlanOptions {
    return { renameReferences: (state, from) => this.#session.referencesForRename(state, from) };
  }

  /** Marks the changeset items that no longer fit the project. */
  markConflicts(): void {
    const project = this.#session.snapshot.project;
    const conversation = this.conversation();
    if (project === null || conversation === null) return;
    conversation.changeset.markConflicts(project, this.#planOptions());
  }

  /**
   * Applies the accepted change items as one undo step ("Apply AI helper changes"), removes the
   * applied ones from the changeset, marks the rest's conflicts and adds a notice.
   */
  async apply(): Promise<ApplyChangesetResult | null> {
    const root = this.root;
    const conversation = this.conversation();
    if (root === null || conversation === null || useAiPanelStore.getState().applying) return null;
    useAiPanelStore.setState({ applying: true });
    try {
      const result = await this.#session.applyChangeset(conversation.changeset.items);
      conversation.changeset.removeAll(result.applied);
      this.markConflicts();
      useAiStore
        .getState()
        .update(root, (current) => addNotice(current, 'info', applyNotice(result)));
      return result;
    } catch (error) {
      useAiStore
        .getState()
        .update(root, (current) =>
          addNotice(current, 'error', `Apply failed: ${messageOf(error)}`),
        );
      return null;
    } finally {
      useAiPanelStore.setState({ applying: false });
    }
  }

  /** Drops every pending change item (the panel confirms first). */
  discard(): void {
    const root = this.root;
    const conversation = this.conversation();
    if (root === null || conversation === null || conversation.changeset.isEmpty) return;
    conversation.changeset.clear();
    useAiStore
      .getState()
      .update(root, (current) => addNotice(current, 'info', 'Discarded the proposed changes.'));
  }

  #onEvent(runId: string, event: AiEvent): void {
    const run = this.#runs.get(runId);
    if (run === undefined) return;
    const store = useAiStore.getState();
    store.applyRunEvent(run.root, runId, event);
    if (event.type === 'tool_request') {
      const { request } = event;
      void run.execute(request, run.abort.signal).then(async (result) => {
        useAiStore
          .getState()
          .update(run.root, (current) =>
            recordToolResult(current, runId, request.requestId, result.content),
          );
        if (run.abort.signal.aborted) return;
        try {
          await this.#ai?.toolResult(runId, result);
        } catch {
          // The run has ended; main ignores late results.
        }
      });
    } else if (event.type === 'done') {
      run.abort.abort();
      this.#runs.delete(runId);
      if (run.root === this.root) this.markConflicts();
    }
  }
}

function findElement(project: Project, id: string) {
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find((element) => element.id === id);
    if (found !== undefined) return found;
  }
  return null;
}
