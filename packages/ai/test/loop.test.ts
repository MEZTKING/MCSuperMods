import { describe, expect, it } from 'vitest';
import type { ModelClient } from '../src/index';
import {
  type AiModelScript,
  type AiSettings,
  type BetaMessageParam,
  createConversation,
  FALLBACK_BETA,
  ModelClientError,
  ModelOutputError,
  type ModelRequest,
  runAssistant,
  ScriptedModelClient,
  TASK_BUDGET_BETA,
  toolParams,
} from '../src/index';
import { doneEvent, limits, recordingHost, settings, startRequest } from './helpers';

function setup(
  script: AiModelScript,
  model: 'claude-opus-5-5' | 'claude-haiku-5-5' = 'claude-opus-5-5',
) {
  return {
    client: new ScriptedModelClient(script),
    conversation: createConversation('conv1', model),
  };
}

function toolResultsOf(message: BetaMessageParam | undefined): Array<{
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}> {
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((b) => b.type === 'tool_result') as never;
}

describe('runAssistant', () => {
  it('runs a text-only turn and commits the user and assistant messages', async () => {
    const { client, conversation } = setup({
      turns: [
        {
          content: [
            { type: 'thinking', thinking: 'The user greets me.' },
            { type: 'text', text: 'Hello there, how can I help?' },
          ],
        },
      ],
    });
    const host = recordingHost();
    const result = await runAssistant({
      client,
      conversation,
      request: startRequest({ contextBlocks: ['<problem>x</problem>'] }),
      settings,
      limits: limits(),
      host,
      signal: new AbortController().signal,
    });
    expect(result.reason).toBe('end_turn');
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      requests: 1,
    });
    const text = host.events
      .filter((e) => e.type === 'text_delta')
      .map((e) => (e.type === 'text_delta' ? e.text : ''))
      .join('');
    expect(text).toBe('Hello there, how can I help?');
    const thinking = host.events
      .filter((e) => e.type === 'thinking_delta')
      .map((e) => (e.type === 'thinking_delta' ? e.text : ''))
      .join('');
    expect(thinking).toBe('The user greets me.');
    expect(host.events[0]).toEqual({ type: 'turn_start' });
    expect(host.events.at(-1)).toEqual({ type: 'done', reason: 'end_turn' });
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '<problem>x</problem>' },
        { type: 'text', text: 'Hello' },
      ],
    });
    expect(conversation.messages[1]?.role).toBe('assistant');
  });

  it('answers two parallel tool calls in one user message, in order', async () => {
    const { client, conversation } = setup({
      turns: [
        {
          content: [
            { type: 'tool_use', name: 'list_kinds', input: {} },
            { type: 'tool_use', name: 'read_element', input: { id: 'a:b' } },
          ],
        },
        { content: [{ type: 'text', text: 'Done.' }] },
      ],
    });
    // The second tool answers first; order must still follow the tool_use blocks.
    const host = recordingHost(async (request) => {
      if (request.name === 'list_kinds') await new Promise((r) => setTimeout(r, 20));
      return { requestId: request.requestId, content: `"${request.name}"`, isError: false };
    });
    const result = await runAssistant({
      client,
      conversation,
      request: startRequest(),
      settings,
      limits: limits(),
      host,
      signal: new AbortController().signal,
    });
    expect(result.reason).toBe('end_turn');
    expect(host.requests.map((r) => [r.name, r.toolUseId, r.input])).toEqual([
      ['list_kinds', 'toolu_1', {}],
      ['read_element', 'toolu_2', { id: 'a:b' }],
    ]);
    expect(host.requests[0]?.requestId).not.toBe(host.requests[1]?.requestId);
    expect(conversation.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(toolResultsOf(conversation.messages[2])).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: '"list_kinds"' },
      { type: 'tool_result', tool_use_id: 'toolu_2', content: '"read_element"' },
    ]);
    const kinds = host.events.map((e) => e.type);
    expect(kinds.filter((k) => k === 'tool_request')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'tool_done')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'usage')).toHaveLength(2);
  });

  it('answers an invalid input with is_error and never executes it', async () => {
    const { client, conversation } = setup({
      turns: [
        {
          content: [
            { type: 'tool_use', name: 'read_element', input: { id: 'NOT VALID' } },
            { type: 'tool_use', name: 'format_disk', input: {} },
          ],
        },
        { content: [{ type: 'text', text: 'Sorry.' }] },
      ],
    });
    const host = recordingHost();
    await runAssistant({
      client,
      conversation,
      request: startRequest(),
      settings,
      limits: limits(),
      host,
      signal: new AbortController().signal,
    });
    expect(host.requests).toEqual([]);
    expect(host.events.some((e) => e.type === 'tool_request')).toBe(false);
    const [first, second] = toolResultsOf(conversation.messages[2]);
    expect(first?.is_error).toBe(true);
    const body = JSON.parse(first?.content ?? '{}');
    expect(body.INVALID_INPUT).toBeInstanceOf(Array);
    expect(body.received).toEqual({ id: 'NOT VALID' });
    expect(JSON.parse(second?.content ?? '{}')).toEqual({
      UNKNOWN_TOOL: 'format_disk',
      received: {},
    });
  });

  it('turns a throwing tool into an error result', async () => {
    const { client, conversation } = setup({
      turns: [
        { content: [{ type: 'tool_use', name: 'list_kinds', input: {} }] },
        { content: [{ type: 'text', text: 'ok' }] },
      ],
    });
    const host = recordingHost(() => {
      throw new Error('boom');
    });
    await runAssistant({
      client,
      conversation,
      request: startRequest(),
      settings,
      limits: limits(),
      host,
      signal: new AbortController().signal,
    });
    expect(toolResultsOf(conversation.messages[2])).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', is_error: true, content: '{"error":"boom"}' },
    ]);
    expect(host.events).toContainEqual({ type: 'tool_done', requestId: 'run1:1', isError: true });
  });

  it.each(['max_tokens', 'refusal'] as const)('stops on %s before any tool runs', async (stop) => {
    const { client, conversation } = setup({
      turns: [
        {
          content: [{ type: 'tool_use', name: 'list_kinds', input: {} }],
          stopReason: stop,
        },
      ],
    });
    const host = recordingHost();
    const result = await runAssistant({
      client,
      conversation,
      request: startRequest(),
      settings,
      limits: limits(),
      host,
      signal: new AbortController().signal,
    });
    expect(result.reason).toBe(stop);
    expect(host.requests).toEqual([]);
    const done = doneEvent(host.events);
    expect(done?.reason).toBe(stop);
    if (stop === 'refusal') {
      expect(done?.stopDetails).toEqual({ category: null, explanation: 'Scripted refusal.' });
    }
    // History stays valid: the dangling tool_use is answered with an error.
    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(toolResultsOf(conversation.messages[2])[0]?.is_error).toBe(true);
  });

  it('stops at the tool-turn limit with error results appended', async () => {
    const turn = { content: [{ type: 'tool_use' as const, name: 'list_kinds', input: {} }] };
    const { client, conversation } = setup({ turns: [turn, turn, turn] });
    const host = recordingHost();
    const result = await runAssistant({
      client,
      conversation,
      request: startRequest(),
      settings,
      limits: limits({ maxToolTurns: 2 }),
      host,
      signal: new AbortController().signal,
    });
    expect(result.reason).toBe('limit');
    expect(host.requests).toHaveLength(2);
    expect(doneEvent(host.events)?.message).toBe(
      "The run stopped at its limit (2 tool turns / 100000 output tokens). Raise the limit under Run limits and send 'continue' to carry on.",
    );
    const last = toolResultsOf(conversation.messages.at(-1));
    expect(last).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_3',
        is_error: true,
        content: '{"error":"not run: run limit reached"}',
      },
    ]);
  });

  it('stops at the output-token limit', async () => {
    const turn = {
      content: [{ type: 'tool_use' as const, name: 'list_kinds', input: {} }],
      usage: { outputTokens: 30_000 },
    };
    const { client, conversation } = setup({ turns: [turn, turn] });
    const host = recordingHost();
    const result = await runAssistant({
      client,
      conversation,
      request: startRequest(),
      settings,
      limits: limits({ maxOutputTokens: 50_000 }),
      host,
      signal: new AbortController().signal,
    });
    expect(result.reason).toBe('limit');
    expect(result.usage.outputTokens).toBe(60_000);
    expect(host.requests).toHaveLength(1);
    const usage = host.events.filter((e) => e.type === 'usage');
    expect(usage.at(-1)).toMatchObject({ total: { outputTokens: 60_000, requests: 2 } });
  });

  it('cancels during a tool call: the tool signal fires and nothing is appended', async () => {
    const { client, conversation } = setup({
      turns: [{ content: [{ type: 'tool_use', name: 'propose_plan', input: planInput() }] }],
    });
    const controller = new AbortController();
    let toolSignal: AbortSignal | undefined;
    // A user decision that never answers until the run is cancelled.
    const host = recordingHost(
      (_request, signal) =>
        new Promise((_, reject) => {
          toolSignal = signal;
          setTimeout(() => controller.abort(), 5);
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const result = await runAssistant({
      client,
      conversation,
      request: startRequest(),
      settings,
      limits: limits(),
      host,
      signal: controller.signal,
    });
    expect(result.reason).toBe('cancelled');
    expect(toolSignal?.aborted).toBe(true);
    expect(conversation.messages).toEqual([]);
    expect(host.events.at(-1)).toEqual({ type: 'done', reason: 'cancelled' });
  });

  it('cancels mid-stream and drops the partial turn', async () => {
    const { client, conversation } = setup({
      turns: [{ content: [{ type: 'text', text: 'one two three four five six' }] }],
    });
    const controller = new AbortController();
    const host = recordingHost();
    const emit = host.emit;
    host.emit = (event) => {
      emit(event);
      if (event.type === 'text_delta' && event.text.startsWith('two')) controller.abort();
    };
    const result = await runAssistant({
      client,
      conversation,
      request: startRequest(),
      settings,
      limits: limits(),
      host,
      signal: controller.signal,
    });
    expect(result.reason).toBe('cancelled');
    expect(conversation.messages).toEqual([]);
  });

  it('keeps earlier committed turns when a later turn is cancelled', async () => {
    const { client, conversation } = setup({
      turns: [
        { content: [{ type: 'tool_use', name: 'list_kinds', input: {} }] },
        { content: [{ type: 'tool_use', name: 'propose_plan', input: planInput() }] },
      ],
    });
    const controller = new AbortController();
    const host = recordingHost((request, signal) => {
      if (request.name === 'list_kinds') {
        return { requestId: request.requestId, content: '[]', isError: false };
      }
      setTimeout(() => controller.abort(), 1);
      return new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error())),
      );
    });
    await runAssistant({
      client,
      conversation,
      request: startRequest(),
      settings,
      limits: limits(),
      host,
      signal: controller.signal,
    });
    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('emits fallback events', async () => {
    const { client, conversation } = setup({
      turns: [
        {
          content: [
            { type: 'fallback', from: 'claude-opus-5-5', to: 'claude-sonnet-5-5' },
            { type: 'text', text: 'Answer.' },
          ],
        },
      ],
    });
    const host = recordingHost();
    await runAssistant({
      client,
      conversation,
      request: startRequest(),
      settings,
      limits: limits(),
      host,
      signal: new AbortController().signal,
    });
    expect(host.events).toContainEqual({
      type: 'fallback',
      from: 'claude-opus-5-5',
      to: 'claude-sonnet-5-5',
    });
    // The fallback block is echoed back with the assistant turn.
    const assistant = conversation.messages[1];
    expect(Array.isArray(assistant?.content) && assistant.content[0]?.type).toBe('fallback');
  });

  it('keeps history append-only and passes thinking blocks back unchanged', async () => {
    const { client, conversation } = setup({
      turns: [
        {
          content: [
            { type: 'thinking', thinking: 'I should list the kinds first.' },
            { type: 'tool_use', name: 'list_kinds', input: {} },
          ],
        },
        {
          content: [
            { type: 'thinking', thinking: 'Now answer.' },
            { type: 'text', text: 'There are kinds.' },
          ],
        },
        { content: [{ type: 'text', text: 'Second answer.' }] },
      ],
    });
    const host = recordingHost();
    const run = (text: string, runId: string) =>
      runAssistant({
        client,
        conversation,
        request: startRequest({ text, runId }),
        settings,
        limits: limits(),
        host,
        signal: new AbortController().signal,
      });
    await run('What kinds are there?', 'r1');
    await run('Thanks', 'r2');
    const [a, b, c] = client.requests.map((r) => r.messages);
    expect(a).toHaveLength(1);
    expect(b?.slice(0, a?.length)).toEqual(a);
    expect(JSON.stringify(c?.slice(0, b?.length))).toBe(JSON.stringify(b));
    const assistant = b?.[1];
    expect(assistant?.content).toEqual([
      { type: 'thinking', thinking: 'I should list the kinds first.', signature: 'sig_1' },
      { type: 'tool_use', id: 'toolu_1', name: 'list_kinds', input: {} },
    ]);
    expect(conversation.messages).toHaveLength(6);
  });

  it('places the cache breakpoint on the system block and sends tools in catalogue order', async () => {
    const { client, conversation } = setup({
      turns: [
        { content: [{ type: 'tool_use', name: 'list_kinds', input: {} }] },
        { content: [{ type: 'text', text: 'ok' }] },
      ],
    });
    await runAssistant({
      client,
      conversation,
      request: startRequest({ mode: 'build' }),
      settings,
      limits: limits(),
      host: recordingHost(),
      signal: new AbortController().signal,
    });
    expect(client.requests).toHaveLength(2);
    for (const request of client.requests) {
      expect(Array.isArray(request.system)).toBe(true);
      const system = request.system as Array<{ text: string; cache_control?: unknown }>;
      expect(system).toHaveLength(1);
      expect(system[0]?.cache_control).toEqual({ type: 'ephemeral' });
      expect(request.tools).toEqual(toolParams());
      expect(request.tool_choice).toEqual({ type: 'auto' });
      expect(request.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(request.max_tokens).toBe(64_000);
      expect(request.output_config?.effort).toBe('high');
      expect(request.model).toBe('claude-opus-5-5');
    }
    expect(JSON.stringify(client.requests[0]?.system)).toBe(
      JSON.stringify(client.requests[1]?.system),
    );
    // The volatile context is in the user message, never in the system prompt.
    expect(JSON.stringify(client.requests[0]?.system)).not.toContain('Hello');
  });

  it('sends the task budget only when on and at least 20,000 tokens', async () => {
    const request = async (overrides: Parameters<typeof limits>[0]): Promise<ModelRequest> => {
      const { client, conversation } = setup({
        turns: [{ content: [{ type: 'text', text: 'ok' }] }],
      });
      await runAssistant({
        client,
        conversation,
        request: startRequest(),
        settings,
        limits: limits(overrides),
        host: recordingHost(),
        signal: new AbortController().signal,
      });
      const sent = client.requests[0];
      if (sent === undefined) throw new Error('no request');
      return sent;
    };
    const on = await request({ taskBudget: true, maxOutputTokens: 100_000 });
    expect(on.output_config?.task_budget).toEqual({ type: 'tokens', total: 100_000 });
    expect(on.betas).toContain(TASK_BUDGET_BETA);
    const small = await request({ taskBudget: true, maxOutputTokens: 19_999 });
    expect(small.output_config).not.toHaveProperty('task_budget');
    expect(small.betas ?? []).not.toContain(TASK_BUDGET_BETA);
    const off = await request({ taskBudget: false, maxOutputTokens: 100_000 });
    expect(off.output_config).not.toHaveProperty('task_budget');
  });

  it('sends fallbacks only for models that support them and when enabled', async () => {
    const send = async (model: 'claude-opus-5-5' | 'claude-haiku-5-5', s: AiSettings) => {
      const { client, conversation } = setup(
        { turns: [{ content: [{ type: 'text', text: 'ok' }] }] },
        model,
      );
      await runAssistant({
        client,
        conversation,
        request: startRequest(),
        settings: s,
        limits: limits({ taskBudget: false }),
        host: recordingHost(),
        signal: new AbortController().signal,
      });
      return client.requests[0];
    };
    const opus = await send('claude-opus-5-5', settings);
    expect(opus?.fallbacks).toBe('default');
    expect(opus?.betas).toEqual([FALLBACK_BETA]);
    const haiku = await send('claude-haiku-5-5', settings);
    expect(haiku).not.toHaveProperty('fallbacks');
    expect(haiku).not.toHaveProperty('betas');
    const off = await send('claude-opus-5-5', { ...settings, fallbacks: false });
    expect(off).not.toHaveProperty('fallbacks');
  });

  it('maps client errors to a done error and leaves the conversation untouched', async () => {
    const failing: ModelClient = {
      stream: async () => {
        throw new ModelClientError('AuthenticationError', 'invalid x-api-key', 401);
      },
    };
    const conversation = createConversation('c', 'claude-opus-5-5');
    const host = recordingHost();
    const result = await runAssistant({
      client: failing,
      conversation,
      request: startRequest(),
      settings,
      limits: limits(),
      host,
      signal: new AbortController().signal,
    });
    expect(result.reason).toBe('error');
    expect(doneEvent(host.events)?.message).toBe('The API key was rejected (AuthenticationError)');
    expect(conversation.messages).toEqual([]);
  });

  it('retries unreadable output twice, then gives up', async () => {
    let calls = 0;
    const flaky: ModelClient = {
      stream: async () => {
        calls++;
        throw new ModelOutputError('Unable to parse tool parameter JSON');
      },
    };
    const host = recordingHost();
    const result = await runAssistant({
      client: flaky,
      conversation: createConversation('c', 'claude-opus-5-5'),
      request: startRequest(),
      settings,
      limits: limits(),
      host,
      signal: new AbortController().signal,
    });
    expect(calls).toBe(3);
    expect(result.reason).toBe('error');
  });

  it('rethrows unknown errors after emitting done', async () => {
    const broken: ModelClient = {
      stream: async () => {
        throw new TypeError('bug');
      },
    };
    const host = recordingHost();
    await expect(
      runAssistant({
        client: broken,
        conversation: createConversation('c', 'claude-opus-5-5'),
        request: startRequest(),
        settings,
        limits: limits(),
        host,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('bug');
    expect(doneEvent(host.events)).toEqual({ type: 'done', reason: 'error', message: 'bug' });
  });
});

function planInput() {
  return {
    title: 'Plan',
    items: [{ itemId: 'a', kind: 'msm:block', elementId: 'x:a', summary: 'A block.' }],
  };
}
