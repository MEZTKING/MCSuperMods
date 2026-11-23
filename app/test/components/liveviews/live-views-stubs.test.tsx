// @vitest-environment happy-dom

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Element, Project } from '@msm/plugin-api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  LiveViewClient,
  type LiveViewWorkerLike,
} from '../../../src/renderer/src/liveviews/client';
import { EXISTING_VIEWS } from '../../../src/renderer/src/liveviews/existing';
import { weakest } from '../../../src/renderer/src/liveviews/frame/fidelity';
import { hasLiveView, liveViewKinds } from '../../../src/renderer/src/liveviews/registry';
import { answerRequest } from '../../../src/renderer/src/liveviews/worker';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import type { ResourceFolders } from '../../../src/renderer/src/preview/model-chain';
import { PreviewPanel } from '../../../src/renderer/src/preview/PreviewPanel';

afterEach(cleanup);

const folders = {} as unknown as ResourceFolders;

// A kind routed through the live view (built by B614; the stubs said "not yet" until then).
const table: Element = {
  id: 'demo:ruby_rule',
  kind: 'minecraft:block_transformer',
  data: {},
} as unknown as Element;

const project = {
  formatVersion: 1,
  name: 'Demo',
  namespaces: [{ name: 'demo', assets: [], elements: [table] }],
  targets: [],
  plugins: [],
  settings: {},
} as unknown as Project;

describe('the live view stubs (B601)', () => {
  // The view is a lazy chunk: load it once here, not inside the case's one-second waitFor, which
  // a cold import on a busy machine outran (2026-11-23).
  beforeAll(async () => {
    await import('../../../src/renderer/src/liveviews/data/block-rules/BlockRules');
  });

  it('shows a selected block transformer in the frame through the live view route', async () => {
    render(
      <PreviewPanel
        project={project}
        element={table}
        previewKind="live_view"
        folders={folders}
        readProjectAsset={async () => null}
        vanilla={null}
        onSetup={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('block-rules-used-by')).toBeTruthy());
    expect(screen.getByTestId('live-view-tag').textContent).toBe('Preview');
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'only_in_game',
    );
    // An object without a block state provider is named, never guessed.
    expect(screen.getByTestId('block-rules-row-0-0-unknown').textContent).toContain(
      'a transform without a provider',
    );
  });

  it('has a view for exactly the kinds that declare previewKind live_view, and today’s previews (B615)', async () => {
    const declared: string[] = [];
    for (const plugin of builtInPlugins) {
      for (const kind of plugin.contributes.elementKinds ?? []) {
        if (kind.previewKind === 'live_view') declared.push(kind.id);
      }
    }
    expect(declared).toHaveLength(34);
    const existing = Object.keys(EXISTING_VIEWS);
    expect(existing.filter((kind) => declared.includes(kind))).toEqual([]);
    expect([...declared, ...existing].sort()).toEqual([...liveViewKinds()]);
    // The merchant trade tag has the merchant screen (B615), not the tag members.
    expect(hasLiveView('minecraft:tag/villager_trade')).toBe(true);
  });

  it('answers the worker stub with not yet, and drops a replaced request', async () => {
    expect(answerRequest({ token: 3, lane: 'a', kind: 'ping' })).toEqual({
      token: 3,
      kind: 'not_yet',
    });
    expect(answerRequest({ token: 3, lane: 'a', kind: 'cancel' })).toBeNull();
    const posted: number[] = [];
    const worker: LiveViewWorkerLike = {
      onmessage: null,
      terminate() {},
      postMessage(message) {
        posted.push(message.token);
      },
    };
    const client = new LiveViewClient({ createWorker: () => worker });
    const first = client.ping('lane');
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = client.ping('lane');
    expect(await first).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    worker.onmessage?.({ data: { token: posted[1] as number, kind: 'not_yet' } });
    expect(await second).toEqual({ token: 2, kind: 'not_yet' });
    client.dispose();
  });

  it('claims the weakest level of its parts', () => {
    expect(weakest([])).toBe('checked');
    expect(weakest(['checked', 'about_right'])).toBe('about_right');
    expect(weakest(['about_right', 'only_in_game', 'checked'])).toBe('only_in_game');
  });

  it('keeps every view out of the session store (a function of files)', () => {
    const root = join(__dirname, '../../../src/renderer/src/liveviews');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/from '(\.\.\/)+session|store\/session/);
    }
  });
});
