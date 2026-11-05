import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type AiEvent,
  type AiModelScript,
  type AiSettings,
  type AiStartRequest,
  DEFAULT_AI_SETTINGS,
  type ModelClient,
  ScriptedModelClient,
} from '@msm/ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiKeyStore } from '../src/main/ai/ai-key-store';
import { type AiSender, createAiService, E2E_KEY_TAIL } from '../src/main/ai/ai-service';
import { readE2eAiScript } from '../src/main/e2e-hooks';
import { EventChannels } from '../src/shared/ipc-channels';

interface Sent {
  channel: string;
  runId: string;
  event: AiEvent;
}

function fakeSender(): AiSender & { sent: Sent[]; destroyed: boolean; events(): AiEvent[] } {
  const sender = {
    sent: [] as Sent[],
    destroyed: false,
    send(channel: string, payload: unknown) {
      const { runId, event } = payload as { runId: string; event: AiEvent };
      sender.sent.push({ channel, runId, event });
    },
    isDestroyed: () => sender.destroyed,
    events: () => sender.sent.map((entry) => entry.event),
  };
  return sender;
}

function fakeKeyStore(key: string | null): AiKeyStore & { key: string | null } {
  const store = {
    key,
    async status() {
      return {
        set: store.key !== null,
        tail: store.key?.slice(-4) ?? null,
        encryptionAvailable: true,
      };
    },
    async set(next: string) {
      store.key = next;
    },
    async clear() {
      store.key = null;
    },
    async read() {
      return store.key;
    },
  };
  return store;
}

async function until(check: () => boolean, what = 'condition'): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const done = (sender: ReturnType<typeof fakeSender>) =>
  sender.events().find((event) => event.type === 'done');

const request = (patch: Partial<AiStartRequest> = {}): AiStartRequest => ({
  runId: 'run-1',
  conversationId: 'conv-1',
  mode: 'chat',
  text: 'Hello',
  contextBlocks: [],
  ...patch,
});

const settings = async (): Promise<AiSettings> =>
  structuredClone(DEFAULT_AI_SETTINGS) as AiSettings;

describe('AI service', () => {
  it('streams a text-only run to the sender in order', async () => {
    const client = new ScriptedModelClient({
      turns: [{ content: [{ type: 'text', text: 'Your project is empty.' }] }],
    });
    const loadClient = vi.fn(async () => client as ModelClient);
    const service = createAiService({ keyStore: fakeKeyStore('sk-1234'), settings, loadClient });
    const sender = fakeSender();
    await service.start(request(), sender);
    await until(() => done(sender) !== undefined, 'done');
    const types = sender.events().map((event) => event.type);
    expect(types[0]).toBe('turn_start');
    expect(types.at(-2)).toBe('usage');
    expect(types.at(-1)).toBe('done');
    expect(done(sender)).toEqual({ type: 'done', reason: 'end_turn' });
    const text = sender
      .events()
      .flatMap((event) => (event.type === 'text_delta' ? [event.text] : []))
      .join('');
    expect(text).toBe('Your project is empty.');
    for (const entry of sender.sent) {
      expect(entry.channel).toBe(EventChannels.aiEvent);
      expect(entry.runId).toBe('run-1');
    }
    expect(loadClient).toHaveBeenCalledWith('sk-1234');
    expect(client.requests[0]?.model).toBe('claude-opus-5-5');
    expect(service.activeRuns()).toEqual([]);
  });

  it('round-trips a tool call through the renderer and memoises the client per key', async () => {
    const client = new ScriptedModelClient({
      turns: [
        { content: [{ type: 'tool_use', name: 'project_summary', input: {} }] },
        { content: [{ type: 'text', text: 'Done.' }] },
        { content: [{ type: 'text', text: 'Again.' }] },
      ],
    });
    const loadClient = vi.fn(async () => client as ModelClient);
    const service = createAiService({ keyStore: fakeKeyStore('sk-1234'), settings, loadClient });
    const sender = fakeSender();
    await service.start(request(), sender);
    await until(() => sender.events().some((event) => event.type === 'tool_request'), 'tool');
    const toolRequest = sender.events().find((event) => event.type === 'tool_request');
    if (toolRequest?.type !== 'tool_request') throw new Error('no tool request');
    expect(toolRequest.request).toMatchObject({ name: 'project_summary', toolUseId: 'toolu_1' });
    // Unknown ids are ignored.
    await service.toolResult('run-x', {
      requestId: toolRequest.request.requestId,
      content: '',
      isError: false,
    });
    await service.toolResult('run-1', { requestId: 'nope', content: '', isError: false });
    await service.toolResult('run-1', {
      requestId: toolRequest.request.requestId,
      content: '{"elements":0}',
      isError: false,
    });
    await until(() => done(sender) !== undefined, 'done');
    expect(done(sender)).toEqual({ type: 'done', reason: 'end_turn' });
    expect(sender.events()).toContainEqual({
      type: 'tool_done',
      requestId: toolRequest.request.requestId,
      isError: false,
    });
    const second = client.requests[1]?.messages.at(-1);
    expect(second?.role).toBe('user');
    expect(JSON.stringify(second?.content)).toContain('{\\"elements\\":0}');

    // The same conversation continues; the client is loaded once for the key.
    const next = fakeSender();
    await service.start(request({ runId: 'run-2', text: 'More' }), next);
    await until(() => done(next) !== undefined, 'second done');
    expect(loadClient).toHaveBeenCalledTimes(1);
    expect(client.requests[2]?.messages.length).toBe(5);
  });

  it('cancels a run waiting for a tool: done cancelled, the open tool rejected', async () => {
    const client = new ScriptedModelClient({
      turns: [{ content: [{ type: 'tool_use', name: 'list_kinds', input: {} }] }],
    });
    const service = createAiService({
      keyStore: fakeKeyStore('sk-1234'),
      settings,
      loadClient: async () => client,
    });
    const sender = fakeSender();
    await service.start(request(), sender);
    await until(() => sender.events().some((event) => event.type === 'tool_request'), 'tool');
    expect(service.activeRuns()).toEqual(['run-1']);
    await service.cancel('run-1');
    await until(() => done(sender) !== undefined, 'done');
    expect(done(sender)).toEqual({ type: 'done', reason: 'cancelled' });
    expect(service.activeRuns()).toEqual([]);
    expect(sender.events().some((event) => event.type === 'tool_done')).toBe(false);
    // A late answer is ignored.
    await service.toolResult('run-1', { requestId: 'run-1:1', content: '{}', isError: false });
  });

  it('ends with no_key when no key is stored, without loading the client', async () => {
    const loadClient = vi.fn(async (): Promise<ModelClient> => {
      throw new Error('not expected');
    });
    const service = createAiService({ keyStore: fakeKeyStore(null), settings, loadClient });
    const sender = fakeSender();
    await service.start(request(), sender);
    await until(() => done(sender) !== undefined, 'done');
    expect(sender.events()).toEqual([{ type: 'done', reason: 'no_key' }]);
    expect(loadClient).not.toHaveBeenCalled();
    expect(await service.testKey()).toMatchObject({ ok: false, errorClass: 'NoKey' });
  });

  it('refuses a second start in the same conversation while a run is going', async () => {
    const client = new ScriptedModelClient({
      turns: [{ content: [{ type: 'tool_use', name: 'list_kinds', input: {} }] }],
    });
    const service = createAiService({
      keyStore: fakeKeyStore('sk-1234'),
      settings,
      loadClient: async () => client,
    });
    const sender = fakeSender();
    await service.start(request(), sender);
    await expect(service.start(request({ runId: 'run-2' }), sender)).rejects.toThrow(
      'already answering',
    );
    await expect(service.start(request({ conversationId: 'conv-2' }), sender)).rejects.toThrow(
      'in use',
    );
    await service.dropConversation('conv-1');
    await until(() => done(sender) !== undefined, 'done');
    expect(done(sender)?.type === 'done' && done(sender)).toMatchObject({ reason: 'cancelled' });
  });

  it('binds a conversation to the Settings model when it is created', async () => {
    const client = new ScriptedModelClient({
      turns: [
        { content: [{ type: 'text', text: 'One.' }] },
        { content: [{ type: 'text', text: 'Two.' }] },
      ],
    });
    let model: AiSettings['model'] = 'claude-sonnet-5-5';
    const service = createAiService({
      keyStore: fakeKeyStore('sk-1234'),
      settings: async () => ({ ...(await settings()), model }),
      loadClient: async () => client,
    });
    await service.newConversation('conv-1');
    model = 'claude-haiku-5-5';
    const sender = fakeSender();
    await service.start(request(), sender);
    await until(() => done(sender) !== undefined, 'done');
    expect(client.requests[0]?.model).toBe('claude-sonnet-5-5');
    await service.newConversation('conv-1');
    const next = fakeSender();
    await service.start(request({ runId: 'run-2' }), next);
    await until(() => done(next) !== undefined, 'done');
    expect(client.requests[1]?.model).toBe('claude-haiku-5-5');
    expect(client.requests[1]?.messages).toHaveLength(1);
  });

  it('reports a client that fails to load as an error and tries again next time', async () => {
    const client = new ScriptedModelClient({
      turns: [{ content: [{ type: 'text', text: 'Ok.' }] }],
    });
    let fail = true;
    const service = createAiService({
      keyStore: fakeKeyStore('sk-1234'),
      settings,
      loadClient: async () => {
        if (fail) throw new Error('chunk missing');
        return client;
      },
      log: () => {},
    });
    const sender = fakeSender();
    await service.start(request(), sender);
    await until(() => done(sender) !== undefined, 'done');
    expect(done(sender)).toMatchObject({ reason: 'error' });
    fail = false;
    const next = fakeSender();
    await service.start(request({ runId: 'run-2' }), next);
    await until(() => done(next) !== undefined, 'done');
    expect(done(next)).toEqual({ type: 'done', reason: 'end_turn' });
  });

  it('tests the key with one Haiku request', async () => {
    const client = new ScriptedModelClient({
      turns: [{ content: [{ type: 'text', text: 'ok' }] }],
    });
    const keyStore = fakeKeyStore('sk-1234');
    const service = createAiService({ keyStore, settings, loadClient: async () => client });
    const result = await service.testKey();
    expect(result.ok).toBe(true);
    expect(client.requests[0]).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 16 });
    await service.clearKey();
    expect(await service.keyStatus()).toMatchObject({ set: false });
    await service.setKey('sk-5678');
    expect(await service.keyStatus()).toMatchObject({ set: true, tail: '5678' });
  });

  it('sends nothing to a destroyed window', async () => {
    const client = new ScriptedModelClient({
      turns: [{ content: [{ type: 'tool_use', name: 'list_kinds', input: {} }] }],
    });
    const service = createAiService({
      keyStore: fakeKeyStore('sk-1234'),
      settings,
      loadClient: async () => client,
    });
    const sender = fakeSender();
    await service.start(request(), sender);
    await until(() => sender.events().some((event) => event.type === 'tool_request'), 'tool');
    sender.destroyed = true;
    await service.cancel('run-1');
    await until(() => service.activeRuns().length === 0, 'run end');
    expect(done(sender)).toBeUndefined();
  });
});

describe('MSM_E2E_AI_SCRIPT', () => {
  let temp: string;
  beforeEach(async () => {
    temp = await mkdtemp(join(tmpdir(), 'msm-ai-e2e-'));
  });
  afterEach(async () => {
    await rm(temp, { recursive: true, force: true });
  });

  const script: AiModelScript = {
    turns: [{ content: [{ type: 'text', text: 'Scripted hello.' }] }],
  };

  it('is off when unset and rejects relative paths and invalid scripts', async () => {
    expect(readE2eAiScript({})).toBeNull();
    expect(readE2eAiScript({ MSM_E2E_AI_SCRIPT: '' })).toBeNull();
    expect(() => readE2eAiScript({ MSM_E2E_AI_SCRIPT: 'script.json' })).toThrow('absolute');
    const bad = join(temp, 'bad.json');
    await writeFile(bad, JSON.stringify({ turns: [{ content: [{ type: 'image' }] }] }));
    expect(() => readE2eAiScript({ MSM_E2E_AI_SCRIPT: bad })).toThrow('not a valid model script');
  });

  it('runs the scripted client without a key and reports the key as set', async () => {
    const path = join(temp, 'script.json');
    await writeFile(path, JSON.stringify(script));
    const parsed = readE2eAiScript({ MSM_E2E_AI_SCRIPT: path });
    expect(parsed).toEqual(script);
    const loadClient = vi.fn(async (): Promise<ModelClient> => {
      throw new Error('not expected');
    });
    const service = createAiService({
      keyStore: fakeKeyStore(null),
      settings,
      loadClient,
      scriptedClient: new ScriptedModelClient(parsed as AiModelScript),
    });
    expect(await service.keyStatus()).toEqual({
      set: true,
      tail: E2E_KEY_TAIL,
      encryptionAvailable: true,
    });
    expect(await service.testKey()).toEqual({ ok: true, model: 'scripted' });
    const sender = fakeSender();
    await service.start(request(), sender);
    await until(() => done(sender) !== undefined, 'done');
    expect(done(sender)).toEqual({ type: 'done', reason: 'end_turn' });
    expect(loadClient).not.toHaveBeenCalled();
  });
});
