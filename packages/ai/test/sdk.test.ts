import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type BetaRawMessageStreamEvent,
  createConversation,
  ModelClientError,
  runAssistant,
} from '../src/index';
import { createAnthropicModelClient, testApiKey } from '../src/sdk/index';
import { limits, recordingHost, settings, startRequest } from './helpers';

interface Seen {
  url: string;
  headers: IncomingMessage['headers'];
  body: Record<string, unknown>;
}

const seen: Seen[] = [];
let server: Server;
let baseURL: string;

function sse(res: ServerResponse, events: object[]): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const event of events) {
    res.write(`event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  res.end();
}

function message(model: string) {
  return {
    id: 'msg_stub',
    type: 'message',
    role: 'assistant',
    model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: 12,
      output_tokens: 1,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}') as Record<string, unknown>;
      seen.push({ url: req.url ?? '', headers: req.headers, body });
      if (req.headers.authorization === 'Bearer bad-key') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            type: 'error',
            error: { type: 'authentication_error', message: 'invalid x-api-key' },
          }),
        );
        return;
      }
      const model = String(body.model);
      if (model === 'claude-sonnet-5-5') {
        // Starts a stream and never finishes it, for the cancel test.
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(
          `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: message(model) })}\n\n`,
        );
        return;
      }
      sse(res, [
        { type: 'message_start', message: message(model) },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'from the stub.' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 5 },
        },
        { type: 'message_stop' },
      ]);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('createAnthropicModelClient against a local stub', () => {
  it('streams a run through the real SDK with the beta request shape', async () => {
    seen.length = 0;
    const client = createAnthropicModelClient({ apiKey: 'sk-test-dummy', baseURL, maxRetries: 0 });
    const conversation = createConversation('c', 'claude-opus-5-5');
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
    expect(result.reason).toBe('end_turn');
    expect(result.usage.outputTokens).toBe(5);
    expect(
      host.events
        .filter((e) => e.type === 'text_delta')
        .map((e) => (e.type === 'text_delta' ? e.text : ''))
        .join(''),
    ).toBe('Hello from the stub.');
    const request = seen[0];
    expect(request?.url).toBe('/v1/messages?beta=true');
    // SDK 1.x sends the API key as a bearer token.
    expect(request?.headers.authorization).toBe('Bearer sk-test-dummy');
    expect(String(request?.headers['anthropic-beta'])).toBe(
      'task-budgets-2026-03-13,server-side-fallback-2026-07-01',
    );
    expect(request?.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 64_000,
      stream: true,
      fallbacks: 'default',
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'medium', task_budget: { type: 'tokens', total: 100_000 } },
      tool_choice: { type: 'auto' },
      cache_control: { type: 'ephemeral' },
    });
    expect(request?.body).not.toHaveProperty('betas');
    expect(request?.body.tools).toHaveLength(22);
    expect(conversation.messages).toHaveLength(2);
  });

  it('maps an authentication failure to ModelClientError and the key test result', async () => {
    const client = createAnthropicModelClient({ apiKey: 'bad-key', baseURL, maxRetries: 0 });
    const events: BetaRawMessageStreamEvent[] = [];
    await expect(
      client.stream(
        { model: 'claude-haiku-5-5', max_tokens: 16, messages: [{ role: 'user', content: 'x' }] },
        new AbortController().signal,
        (e) => events.push(e),
      ),
    ).rejects.toBeInstanceOf(ModelClientError);
    expect(await testApiKey(client)).toEqual({
      ok: false,
      errorClass: 'AuthenticationError',
      error: expect.stringContaining('invalid x-api-key'),
    });
    const good = createAnthropicModelClient({ apiKey: 'sk-test-dummy', baseURL, maxRetries: 0 });
    expect(await testApiKey(good)).toEqual({ ok: true, model: 'claude-haiku-5-5' });
  });

  it('cancels a hanging stream through the abort signal', async () => {
    const client = createAnthropicModelClient({ apiKey: 'sk-test-dummy', baseURL, maxRetries: 0 });
    const conversation = createConversation('c', 'claude-sonnet-5-5');
    const controller = new AbortController();
    const host = recordingHost();
    const emit = host.emit;
    host.emit = (event) => {
      emit(event);
      if (event.type === 'turn_start') setTimeout(() => controller.abort(), 50);
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

  it('maps an unreachable host to APIConnectionError', async () => {
    const client = createAnthropicModelClient({
      apiKey: 'sk-test-dummy',
      baseURL: 'http://127.0.0.1:1',
      maxRetries: 0,
    });
    expect(await testApiKey(client)).toMatchObject({ ok: false, errorClass: 'APIConnectionError' });
  });
});
