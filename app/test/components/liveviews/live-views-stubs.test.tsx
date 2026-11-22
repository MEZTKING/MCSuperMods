// @vitest-environment happy-dom

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Element, Project } from '@msm/plugin-api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LiveViewClient,
  type LiveViewWorkerLike,
} from '../../../src/renderer/src/liveviews/client';
import { weakest } from '../../../src/renderer/src/liveviews/frame/fidelity';
import { hasLiveView, liveViewKinds } from '../../../src/renderer/src/liveviews/registry';
import { answerRequest } from '../../../src/renderer/src/liveviews/worker';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import type { ResourceFolders } from '../../../src/renderer/src/preview/model-chain';
import { PreviewPanel } from '../../../src/renderer/src/preview/PreviewPanel';

afterEach(cleanup);

const folders = {} as unknown as ResourceFolders;

// A kind whose view is still a stub (B614's); the loot table's is built (B609).
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
  it('shows a selected block transformer in the frame, saying not yet', async () => {
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
    await waitFor(() => expect(screen.getByTestId('live-view-not-yet')).toBeTruthy());
    expect(screen.getByTestId('live-view-tag').textContent).toBe('Preview');
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'only_in_game',
    );
    expect(screen.getByTestId('live-view-notes').textContent).toContain('not built yet');
  });

  it('has a view for exactly the kinds that declare previewKind live_view', async () => {
    const declared: string[] = [];
    for (const plugin of builtInPlugins) {
      for (const kind of plugin.contributes.elementKinds ?? []) {
        if (kind.previewKind === 'live_view') declared.push(kind.id);
      }
    }
    expect(declared.sort()).toEqual([...liveViewKinds()]);
    expect(declared).toHaveLength(34);
    expect(hasLiveView('minecraft:tag/villager_trade')).toBe(false);
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
