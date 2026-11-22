/**
 * Fakes for the AI helper's renderer tests: an in-memory `AiPlatform` that records calls and
 * lets a test push run events, a session over the fake platform whose vendored target data is
 * read from disk in either test environment, and one conversation in each state of the state
 * line ({@link aiStateFixtures}).
 */

/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type {
  AiEvent,
  AiKeyTestResult,
  AiStartRequest,
  AiToolResult,
  ProposePlanInput,
} from '@msm/ai';
import { createMemoryFileSystem } from '@msm/core';
import { builtInTargets, targetById } from '@msm/targets';
import { act } from '@testing-library/react';
import type { AiStatusState } from '../../src/renderer/src/components/ai/ai-status';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';
import { ProjectSession } from '../../src/renderer/src/session/project-session';
import {
  type AiConversation,
  addUserMessage,
  applyEvent,
  decidePlan,
  newConversation,
  reachCheckpoint,
  showPlan,
  startRun,
} from '../../src/renderer/src/store/ai-store';
import type { AiKeyStatus, AiPlatform, PlatformAdapter } from '../../src/shared/platform';

const unavailable = async (): Promise<never> => {
  throw new Error('Not available in this test.');
};

/** Vendored URLs are `file:` in Node and served by Vitest (`/@fs/`) under happy-dom. */
function toPath(url: URL): string {
  if (url.protocol === 'file:') return fileURLToPath(url.href);
  const prefix = '/@fs/';
  if (url.pathname.startsWith(prefix)) {
    return decodeURIComponent(url.pathname.slice(prefix.length - 1));
  }
  throw new Error(`Cannot read ${url.href} from the file system.`);
}

/** A recording fake of main's AI services. */
export interface FakeAi extends AiPlatform {
  status: AiKeyStatus;
  testResult: AiKeyTestResult;
  starts: AiStartRequest[];
  cancels: string[];
  results: { runId: string; result: AiToolResult }[];
  drops: string[];
  keys: string[];
  clears: number;
  /** Rejects `setKey` with this error when set. */
  setKeyError: Error | null;
  /** Sends a run event to the renderer's listeners (inside `act`). */
  emit(runId: string, event: AiEvent): Promise<void>;
  /** Resolves once `results` holds `count` entries. */
  waitForResults(count: number): Promise<void>;
}

/** A fake `AiPlatform`; the key is set unless `status` says otherwise. */
export function fakeAi(status: Partial<AiKeyStatus> = {}): FakeAi {
  const listeners = new Set<(runId: string, event: AiEvent) => void>();
  const waiters: { count: number; resolve(): void }[] = [];
  const ai: FakeAi = {
    status: { set: true, tail: 'abcd', encryptionAvailable: true, ...status },
    testResult: { ok: true, model: 'claude-haiku-5-5' },
    starts: [],
    cancels: [],
    results: [],
    drops: [],
    keys: [],
    clears: 0,
    setKeyError: null,
    keyStatus: async () => ({ ...ai.status }),
    setKey: async (key) => {
      if (ai.setKeyError !== null) throw ai.setKeyError;
      ai.keys.push(key);
      ai.status = { ...ai.status, set: true, tail: key.slice(-4) };
    },
    clearKey: async () => {
      ai.clears += 1;
      ai.status = { ...ai.status, set: false, tail: null };
    },
    testKey: async () => ai.testResult,
    start: async (request) => {
      ai.starts.push(request);
    },
    cancel: async (runId) => {
      ai.cancels.push(runId);
    },
    toolResult: async (runId, result) => {
      ai.results.push({ runId, result });
      for (const waiter of [...waiters]) {
        if (ai.results.length >= waiter.count) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve();
        }
      }
    },
    newConversation: async () => {},
    dropConversation: async (id) => {
      ai.drops.push(id);
    },
    onEvent: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: async (runId, event) => {
      await act(async () => {
        for (const listener of [...listeners]) listener(runId, event);
      });
    },
    waitForResults: (count) =>
      ai.results.length >= count
        ? Promise.resolve()
        : new Promise<void>((resolve) => waiters.push({ count, resolve })),
  };
  return ai;
}

/** A platform with an in-memory project file system; services the AI tests never use reject. */
function aiTestPlatform(): PlatformAdapter {
  return {
    app: {
      info: async () => ({ version: '0.1.0-test', electron: '0', platform: 'test' }),
      launchNotice: async () => null,
    },
    dialogs: {
      pickDirectory: async () => '/projects/demo',
      confirmDiscard: async () => true,
      pickFiles: unavailable,
      saveFile: unavailable,
    },
    shell: { showItemInFolder: unavailable },
    targets: {
      readVendored: async (targetId, key) => {
        const bundle = targetById(targetId);
        if (bundle === undefined) throw new Error(`Unknown target ${targetId}`);
        const buffer = await readFile(toPath(bundle.vendored[key]));
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      },
    },
    settings: { get: unavailable, set: async () => {} },
    minecraft: {
      status: unavailable,
      listLocations: async () => ({ locations: [], selected: null }),
      extract: unavailable,
      readAsset: unavailable,
      listAssets: unavailable,
      readWorldgenFiles: unavailable,
      readDataFiles: unavailable,
      installResourcePack: unavailable,
      listWorlds: unavailable,
      installDataPack: unavailable,
    },
    thumbnails: { get: unavailable },
    mcfunction: { check: async () => [], complete: unavailable },
    exports: {
      pickFolder: unavailable,
      writeFiles: unavailable,
      runtimeJar: unavailable,
      geckolibJar: unavailable,
      writeTree: unavailable,
      gradleWrapper: unavailable,
    },
    scripting: { transpile: unavailable, check: unavailable },
    testInMinecraft: {
      status: unavailable,
      createInstance: unavailable,
      run: unavailable,
      runModpack: unavailable,
      pickLauncherProgram: unavailable,
    },
    updates: {
      check: unavailable,
      install: unavailable,
      current: async () => ({ state: 'idle' }),
      onStatus: () => () => {},
    },
    project: {
      openRoot: async () => ({ ok: true }),
      createRoot: async () => ({ ok: true }),
      closeRoot: async () => {},
      currentRoot: async () => '/projects/demo',
      recent: async () => [],
      openRecent: async () => ({ ok: false, reason: 'No recent projects in this test.' }),
      removeRecent: async () => {},
      clearRecent: async () => {},
    },
    fs: createMemoryFileSystem(),
  };
}

/** A session with a new project (`demo` namespace) and one function element. */
export async function aiSession() {
  const platform = aiTestPlatform();
  const session = new ProjectSession(platform, {
    plugins: builtInPlugins,
    targets: builtInTargets,
    now: () => '2026-01-01T00:00:00.000Z',
  });
  await session.newProject();
  session.addElement({ id: 'demo:greet', kind: 'minecraft:function', data: { lines: ['say hi'] } });
  return { session, platform };
}

const FIXTURE_PLAN: ProposePlanInput = {
  title: 'Ruby tools',
  items: [
    { itemId: 'sword', kind: 'msm:item', elementId: 'demo:ruby_sword', summary: 'A sword.' },
    { itemId: 'pick', kind: 'msm:item', elementId: 'demo:ruby_pickaxe', summary: 'A pickaxe.' },
  ],
};

function withRubySword(state: AiConversation): AiConversation {
  state.changeset.add({
    op: 'create',
    elementId: 'demo:ruby_sword',
    kind: 'msm:item',
    after: { display_name: 'Ruby Sword' },
  });
  state.changeset.add({
    op: 'create',
    elementId: 'demo:ruby_sword_model',
    kind: 'minecraft:model',
    after: { parent: 'minecraft:item/handheld' },
  });
  return { ...state, changesetItems: state.changeset.items };
}

/**
 * One conversation in each state of the state line (ADR 0125 D1), built with the store's own
 * transitions, for the panel's component tests in the three modes (B685). Each fixture's run
 * started at 0 ms; `conversationStatus(fixture, 12_000)` reads 12 seconds while it works. The
 * `run` ids are `r`, the changeset is the fixture's own.
 */
export function aiStateFixtures(): Record<AiStatusState, AiConversation> {
  const asked = () =>
    startRun(addUserMessage(newConversation('c'), 'Make ruby tools'), 'r', 'chat', 0);
  const tool = (state: AiConversation, name: string) =>
    applyEvent(state, 'r', {
      type: 'tool_request',
      request: { requestId: `q-${name}`, toolUseId: `t-${name}`, name, input: {} },
    });
  const planned = showPlan(asked(), FIXTURE_PLAN, 'r');
  const stepping = reachCheckpoint(
    decidePlan(planned, { decision: 'step', items: FIXTURE_PLAN.items, comments: '' }),
    { completedItemIds: ['sword'], summary: 'The sword is made.' },
    'r',
  );
  const ended = (state: AiConversation, event: Extract<AiEvent, { type: 'done' }>) =>
    applyEvent(state, 'r', event);
  return {
    idle: newConversation('c'),
    thinking: applyEvent(asked(), 'r', { type: 'turn_start' }, 0),
    reading: tool(asked(), 'read_element'),
    making: tool(withRubySword(asked()), 'create_elements'),
    checking: tool(asked(), 'run_checks'),
    'your-turn-plan': planned,
    'your-turn-step': stepping,
    ready: ended(withRubySword(asked()), { type: 'done', reason: 'end_turn' }),
    stopped: ended(asked(), {
      type: 'done',
      reason: 'limit',
      limit: { toolTurns: 24, outputTokens: 100_000 },
    }),
    failed: ended(asked(), {
      type: 'done',
      reason: 'error',
      errorClass: 'OverloadedError',
      message: 'Anthropic is busy just now; try again shortly.',
    }),
  };
}
