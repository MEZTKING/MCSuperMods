import { describe, expect, it } from 'vitest';
import {
  aiEventSchema,
  aiModelScriptSchema,
  type BetaRawMessageStreamEvent,
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
    ]) {
      expect(aiEventSchema.safeParse(event).success).toBe(true);
    }
    expect(aiEventSchema.safeParse({ type: 'done', reason: 'nope' }).success).toBe(false);
  });
});
