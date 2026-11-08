/**
 * The AI helper's main-process service (ADR 0041 D1, D3): conversations, runs and the tool round
 * trip with the renderer. Main owns each conversation's API history; the renderer only sees the
 * events of `msm:v1:ai:event` and answers tool requests with `msm:v1:ai:toolResult`.
 *
 * The Claude SDK is loaded through `loadClient` (in `index.ts` a dynamic `import('@msm/ai/sdk')`,
 * a lazy chunk), memoised per key. With a scripted client (the e2e hook `MSM_E2E_AI_SCRIPT`)
 * no key and no SDK are needed.
 *
 * @packageDocumentation
 */
import {
  type AiEvent,
  type AiKeyTestResult,
  type AiSettings,
  type AiStartRequest,
  type AiToolRequest,
  type AiToolResult,
  aiModelIdSchema,
  type ConversationState,
  createConversation,
  DEFAULT_AI_MODEL,
  type ModelClient,
  runAssistant,
  testApiKey,
} from '@msm/ai';
import { type AiEventPayload, EventChannels } from '../../shared/ipc-channels';
import type { AiKeyStatus } from '../../shared/platform';
import type { AiHistoryStore } from './ai-history';
import type { AiKeyStore } from './ai-key-store';

/** Where a run's events go: the calling renderer's `webContents`. */
export interface AiSender {
  send(channel: string, payload: unknown): void;
  isDestroyed(): boolean;
}

/** The tail reported for the scripted client's pretend key. */
export const E2E_KEY_TAIL = 'e2e!';

/** The `errorClass` of a key test without a stored key. */
export const NO_KEY_ERROR_CLASS = 'NoKey';

export interface AiServiceDeps {
  keyStore: AiKeyStore;
  /** The current AI helper settings (read when a conversation or run starts). */
  settings: () => Promise<AiSettings>;
  /** Creates the real client for a key; called at most once per key. */
  loadClient: (apiKey: string) => Promise<ModelClient>;
  /** Replaces the real client for every conversation (e2e); no key is needed then. */
  scriptedClient?: ModelClient;
  /** Logs unexpected run failures (never the key). Defaults to `console.error`. */
  log?: (message: string, error?: unknown) => void;
  /** Saved conversations (ADR 0055); without it nothing is saved. */
  history?: AiHistoryStore;
}

/** The AI helper service behind `PlatformAdapter.ai`. */
export interface AiService {
  keyStatus(): Promise<AiKeyStatus>;
  setKey(key: string): Promise<void>;
  clearKey(): Promise<void>;
  testKey(): Promise<AiKeyTestResult>;
  /** Starts a run; resolves once it has started. Events go to `sender`. */
  start(request: AiStartRequest, sender: AiSender): Promise<void>;
  cancel(runId: string): Promise<void>;
  toolResult(runId: string, result: AiToolResult): Promise<void>;
  newConversation(conversationId: string): Promise<void>;
  dropConversation(conversationId: string): Promise<void>;
  /**
   * Saves a conversation's API history with the panel's transcript for `root` (ADR 0055).
   * Does nothing when the settings say not to remember conversations.
   */
  saveHistory(conversationId: string, root: string, transcript: string): Promise<void>;
  /**
   * Restores `root`'s saved conversation into `conversationId` (unless it has a run) and
   * returns the transcript and the model, or `null` when there is none.
   */
  loadHistory(
    conversationId: string,
    root: string,
  ): Promise<{ transcript: string; model: string; savedAt: string } | null>;
  /** Deletes `root`'s saved conversation. */
  forgetHistory(root: string): Promise<void>;
  /** Run ids still running (tests and diagnostics). */
  activeRuns(): string[];
}

interface PendingTool {
  resolve(result: AiToolResult): void;
  reject(error: Error): void;
}

interface Run {
  id: string;
  conversationId: string;
  controller: AbortController;
  pending: Map<string, PendingTool>;
}

interface Conversation {
  state: ConversationState;
  runId: string | null;
}

/** The error an open tool request is rejected with when its run ends. */
function cancelledError(): Error {
  const error = new Error('The run was cancelled.');
  error.name = 'AbortError';
  return error;
}

/** Creates the service. */
export function createAiService(deps: AiServiceDeps): AiService {
  const conversations = new Map<string, Conversation>();
  const runs = new Map<string, Run>();
  const log =
    deps.log ??
    ((message: string, error?: unknown) =>
      error === undefined ? console.error(message) : console.error(message, error));
  let memo: { key: string; client: Promise<ModelClient> } | null = null;

  const clientFor = (key: string): Promise<ModelClient> => {
    if (memo === null || memo.key !== key) {
      const client = deps.loadClient(key);
      memo = { key, client };
      // A failed load is not memoised, so the next run tries again.
      client.catch(() => {
        if (memo?.client === client) memo = null;
      });
    }
    return memo.client;
  };

  const send = (sender: AiSender, runId: string, event: AiEvent): void => {
    if (sender.isDestroyed()) return;
    const payload: AiEventPayload<AiEvent> = { runId, event };
    sender.send(EventChannels.aiEvent, payload);
  };

  const cancelConversationRun = (conversationId: string): void => {
    const runId = conversations.get(conversationId)?.runId;
    if (runId !== null && runId !== undefined) runs.get(runId)?.controller.abort();
  };

  const execute = async (
    request: AiStartRequest,
    sender: AiSender,
    conversation: Conversation,
    run: Run,
  ): Promise<void> => {
    const emit = (event: AiEvent): void => {
      // A closed window cannot answer tool requests: end the run.
      if (sender.isDestroyed()) run.controller.abort();
      send(sender, run.id, event);
    };
    try {
      let client: ModelClient;
      if (deps.scriptedClient !== undefined) client = deps.scriptedClient;
      else {
        const key = await deps.keyStore.read();
        if (key === null) {
          emit({ type: 'done', reason: 'no_key' });
          return;
        }
        try {
          client = await clientFor(key);
        } catch (error) {
          log('MSM AI helper: the Claude client could not be loaded.', error);
          emit({
            type: 'done',
            reason: 'error',
            message: 'The AI helper could not start its Claude client.',
          });
          return;
        }
      }
      const settings = await deps.settings();
      const limits = request.limits ?? settings.limits[request.mode];
      await runAssistant({
        client,
        conversation: conversation.state,
        request,
        settings,
        limits,
        signal: run.controller.signal,
        host: {
          emit,
          // `runAssistant` emits `tool_request` (sent to the renderer by `emit`) right before
          // it calls this; the promise settles when the renderer answers or the run ends.
          executeTool(toolRequest: AiToolRequest, signal: AbortSignal) {
            return new Promise<AiToolResult>((resolve, reject) => {
              if (signal.aborted) {
                reject(cancelledError());
                return;
              }
              const onAbort = (): void => {
                run.pending.delete(toolRequest.requestId);
                reject(cancelledError());
              };
              signal.addEventListener('abort', onAbort, { once: true });
              run.pending.set(toolRequest.requestId, {
                resolve(result) {
                  signal.removeEventListener('abort', onAbort);
                  resolve(result);
                },
                reject(error) {
                  signal.removeEventListener('abort', onAbort);
                  reject(error);
                },
              });
            });
          },
        },
      });
    } catch (error) {
      // `runAssistant` has already emitted `done { reason: 'error' }` for unknown errors.
      log('MSM AI helper: the run failed.', error);
    } finally {
      for (const pending of run.pending.values()) pending.reject(cancelledError());
      run.pending.clear();
      runs.delete(run.id);
      if (conversation.runId === run.id) conversation.runId = null;
    }
  };

  return {
    async keyStatus() {
      if (deps.scriptedClient !== undefined) {
        return { set: true, tail: E2E_KEY_TAIL, encryptionAvailable: true };
      }
      return deps.keyStore.status();
    },
    async setKey(key) {
      await deps.keyStore.set(key);
      memo = null;
    },
    async clearKey() {
      await deps.keyStore.clear();
      memo = null;
    },
    async testKey() {
      if (deps.scriptedClient !== undefined) return { ok: true, model: 'scripted' };
      const key = await deps.keyStore.read();
      if (key === null) {
        return { ok: false, error: 'No API key is saved.', errorClass: NO_KEY_ERROR_CLASS };
      }
      let client: ModelClient;
      try {
        client = await clientFor(key);
      } catch (error) {
        log('MSM AI helper: the Claude client could not be loaded.', error);
        return {
          ok: false,
          error: 'The AI helper could not start its Claude client.',
          errorClass: 'ClientLoadError',
        };
      }
      try {
        return await testApiKey(client);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          errorClass: 'Error',
        };
      }
    },
    async start(request, sender) {
      // Checked and reserved synchronously, so two quick starts cannot both pass.
      if (runs.has(request.runId)) throw new Error(`The run id ${request.runId} is in use.`);
      const existing = conversations.get(request.conversationId);
      if (existing?.runId !== null && existing?.runId !== undefined) {
        throw new Error('The AI helper is already answering in this conversation.');
      }
      const run: Run = {
        id: request.runId,
        conversationId: request.conversationId,
        controller: new AbortController(),
        pending: new Map(),
      };
      runs.set(run.id, run);
      let conversation = existing;
      const created = conversation === undefined;
      if (conversation === undefined) {
        conversation = {
          state: createConversation(request.conversationId, DEFAULT_AI_MODEL),
          runId: null,
        };
        conversations.set(request.conversationId, conversation);
      }
      conversation.runId = run.id;
      if (created) {
        // A conversation is bound to the Settings model when it is created; later model
        // changes leave it alone (the renderer starts a new conversation instead).
        try {
          conversation.state.model = (await deps.settings()).model;
        } catch (error) {
          runs.delete(run.id);
          conversations.delete(request.conversationId);
          throw error;
        }
      }
      void execute(request, sender, conversation, run);
    },
    async cancel(runId) {
      runs.get(runId)?.controller.abort();
    },
    async toolResult(runId, result) {
      const run = runs.get(runId);
      const pending = run?.pending.get(result.requestId);
      if (run === undefined || pending === undefined) return;
      run.pending.delete(result.requestId);
      pending.resolve(result);
    },
    async newConversation(conversationId) {
      cancelConversationRun(conversationId);
      const model = (await deps.settings()).model;
      conversations.set(conversationId, {
        state: createConversation(conversationId, model),
        runId: null,
      });
    },
    async saveHistory(conversationId, root, transcript) {
      const conversation = conversations.get(conversationId);
      if (deps.history === undefined || conversation === undefined) return;
      if ((await deps.settings()).remember === false) return;
      await deps.history.write({
        format: 1,
        root,
        savedAt: new Date().toISOString(),
        model: conversation.state.model,
        messages: structuredClone(conversation.state.messages) as unknown[],
        transcript,
      });
    },
    async loadHistory(conversationId, root) {
      if (deps.history === undefined) return null;
      if ((await deps.settings()).remember === false) return null;
      const existing = conversations.get(conversationId);
      if (existing?.runId != null) return null;
      const record = await deps.history.read(root);
      if (record === null) return null;
      const parsed = aiModelIdSchema.safeParse(record.model);
      const state = createConversation(
        conversationId,
        parsed.success ? parsed.data : DEFAULT_AI_MODEL,
      );
      state.messages = record.messages as typeof state.messages;
      conversations.set(conversationId, { state, runId: null });
      return { transcript: record.transcript, model: state.model, savedAt: record.savedAt };
    },
    async forgetHistory(root) {
      await deps.history?.remove(root);
    },
    async dropConversation(conversationId) {
      cancelConversationRun(conversationId);
      conversations.delete(conversationId);
    },
    activeRuns() {
      return [...runs.keys()];
    },
  };
}
