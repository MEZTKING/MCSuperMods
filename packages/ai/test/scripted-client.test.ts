import { describe, expect, it } from 'vitest';
import {
  aiEventSchema,
  aiModelScriptSchema,
  type BetaRawMessageStreamEvent,
  ModelClientError,
  type ModelRequest,
  ScriptedModelClient,
  testApiKey,
} from '../src/index';

const request: ModelRequest = {
  model: 'claude-opus-5-5',
  max_tokens: 100,
  messages: [{ role: 'user', content: 'hi' }],
};

describe('ScriptedModelClient', () => {
  it('emits realistic stream events and assigns tool ids', async () => {
    const client = new ScriptedModelClient({
      turns: [
        {
          content: [
            { type: 'text', text: 'Let me look.' },
            { type: 'tool_use', name: 'read_element', input: { id: 'a:b' } },
            { type: 'tool_use', name: 'list_kinds', input: {} },
          ],
          usage: { inputTokens: 7, outputTokens: 9 },
        },
      ],
    });
    const events: BetaRawMessageStreamEvent[] = [];
    const message = await client.stream(request, new AbortController().signal, (e) =>
      events.push(e),
    );
    expect(events[0]?.type).toBe('message_start');
    expect(events.at(-1)?.type).toBe('message_stop');
    expect(events.at(-2)).toMatchObject({
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' },
      usage: { output_tokens: 9 },
    });
    const text = events
      .map((e) =>
        e.type === 'content_block_delta' && e.delta.type === 'text_delta' ? e.delta.text : '',
      )
      .join('');
    expect(text).toBe('Let me look.');
    expect(
      events.filter((e) => e.type === 'content_block_delta' && e.delta.type === 'text_delta'),
    ).toHaveLength(3);
    const json = events
      .map((e) =>
        e.type === 'content_block_delta' && e.delta.type === 'input_json_delta' && e.index === 1
          ? e.delta.partial_json
          : '',
      )
      .join('');
    expect(JSON.parse(json)).toEqual({ id: 'a:b' });
    expect(message.stop_reason).toBe('tool_use');
    expect(message.usage.input_tokens).toBe(7);
    expect(message.usage.output_tokens).toBe(9);
    expect(message.content.map((b) => (b.type === 'tool_use' ? b.id : b.type))).toEqual([
      'text',
      'toolu_1',
      'toolu_2',
    ]);
  });

  it('records deep copies of requests and throws past the last turn', async () => {
    const client = new ScriptedModelClient({ turns: [{ content: [{ type: 'text', text: 'a' }] }] });
    const sent = structuredClone(request);
    await client.stream(sent, new AbortController().signal, () => {});
    sent.max_tokens = 1;
    expect(client.requests).toEqual([request]);
    expect(client.remaining).toBe(0);
    await expect(client.stream(request, new AbortController().signal, () => {})).rejects.toThrow(
      /no scripted turn left/,
    );
  });

  it('rejects once the signal aborts', async () => {
    const client = new ScriptedModelClient({
      turns: [{ content: [{ type: 'text', text: 'one two three' }] }],
    });
    const controller = new AbortController();
    await expect(
      client.stream(request, controller.signal, (e) => {
        if (e.type === 'content_block_start') controller.abort();
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('validates scripts with its schema', () => {
    expect(
      aiModelScriptSchema.safeParse({
        turns: [{ content: [{ type: 'tool_use', name: 'x', input: {} }], stopReason: 'tool_use' }],
      }).success,
    ).toBe(true);
    expect(
      aiModelScriptSchema.safeParse({ turns: [{ content: [{ type: 'image' }] }] }).success,
    ).toBe(false);
  });

  it('waits for a delayed turn before its first event', async () => {
    const client = new ScriptedModelClient({
      turns: [{ content: [{ type: 'text', text: 'late' }], delayMs: 80 }],
    });
    const events: BetaRawMessageStreamEvent[] = [];
    const started = Date.now();
    const pending = client.stream(request, new AbortController().signal, (e) => events.push(e));
    await new Promise((resolve) => setTimeout(resolve, 30));
    // The request is recorded at once; nothing is emitted before the delay.
    expect(client.requests).toHaveLength(1);
    expect(events).toEqual([]);
    const message = await pending;
    expect(Date.now() - started).toBeGreaterThanOrEqual(75);
    expect(events[0]?.type).toBe('message_start');
    expect(message.content).toEqual([{ type: 'text', text: 'late', citations: null }]);
  });

  it('cancels a delayed turn while it waits', async () => {
    const client = new ScriptedModelClient({
      turns: [{ content: [{ type: 'text', text: 'never' }], delayMs: 60_000 }],
    });
    const controller = new AbortController();
    const events: BetaRawMessageStreamEvent[] = [];
    const started = Date.now();
    setTimeout(() => controller.abort(), 20);
    await expect(
      client.stream(request, controller.signal, (e) => events.push(e)),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(events).toEqual([]);
    // An aborted signal ends the wait before it starts.
    const again = new ScriptedModelClient({
      turns: [{ content: [{ type: 'text', text: 'x' }], delayMs: 60_000 }],
    });
    await expect(again.stream(request, controller.signal, () => {})).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('throws the error of an error turn, after its delay', async () => {
    const client = new ScriptedModelClient({
      turns: [
        { error: { errorClass: 'APIError', message: 'credit balance is too low', status: 402 } },
        { error: { errorClass: 'APIConnectionError', message: 'Connection error.' }, delayMs: 10 },
        { content: [{ type: 'text', text: 'ok' }] },
      ],
    });
    const events: BetaRawMessageStreamEvent[] = [];
    const first = client.stream(request, new AbortController().signal, (e) => events.push(e));
    await expect(first).rejects.toBeInstanceOf(ModelClientError);
    await expect(first).rejects.toMatchObject({
      errorClass: 'APIError',
      message: 'credit balance is too low',
      status: 402,
    });
    await expect(
      client.stream(request, new AbortController().signal, (e) => events.push(e)),
    ).rejects.toMatchObject({ errorClass: 'APIConnectionError', status: undefined });
    expect(events).toEqual([]);
    // The next turn answers normally (Try again).
    await client.stream(request, new AbortController().signal, () => {});
    expect(client.remaining).toBe(0);
    expect(client.requests).toHaveLength(3);
  });

  it('validates delays and error turns', () => {
    const ok = aiModelScriptSchema.safeParse({
      turns: [
        { content: [{ type: 'text', text: 'a' }], delayMs: 2000 },
        { error: { errorClass: 'RateLimitError', message: 'slow', status: 429 }, delayMs: 5 },
      ],
    });
    expect(ok.success).toBe(true);
    expect(aiModelScriptSchema.safeParse({ turns: [{ content: [], delayMs: -1 }] }).success).toBe(
      false,
    );
    expect(
      aiModelScriptSchema.safeParse({ turns: [{ error: { errorClass: '', message: 'x' } }] })
        .success,
    ).toBe(false);
  });

  it('reports one-hour cache writes in the usage', async () => {
    const client = new ScriptedModelClient({
      turns: [
        {
          content: [{ type: 'text', text: 'a' }],
          usage: { cacheCreationInputTokens: 1000, cacheCreation1hInputTokens: 800 },
        },
      ],
    });
    const message = await client.stream(request, new AbortController().signal, () => {});
    expect(message.usage.cache_creation).toEqual({
      ephemeral_1h_input_tokens: 800,
      ephemeral_5m_input_tokens: 200,
    });
  });

  it('answers the key test', async () => {
    const client = new ScriptedModelClient({
      turns: [{ content: [{ type: 'text', text: 'ok' }] }],
    });
    expect(await testApiKey(client)).toEqual({ ok: true, model: 'claude-haiku-5-5' });
    expect(client.requests[0]).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 16 });
  });
});

describe('aiEventSchema', () => {
  it('accepts every event shape', () => {
    const usage = {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      requests: 1,
    };
    for (const event of [
      { type: 'turn_start' },
      { type: 'text_delta', text: 'a' },
      { type: 'thinking_delta', text: 'a' },
      { type: 'tool_request', request: { requestId: 'r', toolUseId: 't', name: 'n', input: {} } },
      { type: 'tool_done', requestId: 'r', isError: false },
      { type: 'usage', turn: usage, total: usage },
      { type: 'fallback', from: 'a', to: 'b' },
      { type: 'done', reason: 'refusal', stopDetails: { category: null, explanation: 'x' } },
      { type: 'done', reason: 'error', message: 'x', errorClass: 'BillingError' },
      { type: 'done', reason: 'limit', message: 'x', limit: { toolTurns: 24, outputTokens: 1 } },
      { type: 'usage', turn: { ...usage, cacheCreation1hInputTokens: 1 }, total: usage },
    ]) {
      expect(aiEventSchema.safeParse(event).success).toBe(true);
    }
    expect(aiEventSchema.safeParse({ type: 'done', reason: 'nope' }).success).toBe(false);
  });
});
