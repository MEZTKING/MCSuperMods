import {
  type AiEvent,
  type AiHost,
  type AiRunLimits,
  type AiStartRequest,
  type AiToolRequest,
  type AiToolResult,
  DEFAULT_AI_SETTINGS,
  DEFAULT_LIMITS,
} from '../src/index';

export interface RecordingHost extends AiHost {
  events: AiEvent[];
  requests: AiToolRequest[];
  signals: AbortSignal[];
}

/** A host that records events and answers tools with `handler` (default: `{ ok: <name> }`). */
export function recordingHost(
  handler?: (request: AiToolRequest, signal: AbortSignal) => Promise<AiToolResult> | AiToolResult,
): RecordingHost {
  const host: RecordingHost = {
    events: [],
    requests: [],
    signals: [],
    emit(event) {
      host.events.push(event);
    },
    async executeTool(request, signal) {
      host.requests.push(request);
      host.signals.push(signal);
      if (handler) return handler(request, signal);
      return {
        requestId: request.requestId,
        content: JSON.stringify({ ok: request.name }),
        isError: false,
      };
    },
  };
  return host;
}

export function startRequest(overrides: Partial<AiStartRequest> = {}): AiStartRequest {
  return {
    runId: 'run1',
    conversationId: 'conv1',
    mode: 'chat',
    text: 'Hello',
    contextBlocks: [],
    ...overrides,
  };
}

export const settings = structuredClone(DEFAULT_AI_SETTINGS);

export function limits(overrides: Partial<AiRunLimits> = {}): AiRunLimits {
  return { ...DEFAULT_LIMITS.chat, ...overrides };
}

export function doneEvent(events: AiEvent[]): Extract<AiEvent, { type: 'done' }> | undefined {
  return events.find((e): e is Extract<AiEvent, { type: 'done' }> => e.type === 'done');
}
