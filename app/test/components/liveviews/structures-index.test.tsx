// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  hasLiveView,
  type LiveViewProps,
  liveViewComponent,
} from '../../../src/renderer/src/liveviews/registry';
import {
  STRUCTURES_PANEL_KINDS,
  STRUCTURES_VIEWS,
} from '../../../src/renderer/src/liveviews/structures';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';

afterEach(cleanup);

// The three views are lazy chunks: load them before the first render, so a cold import under a busy run
// is not measured by `waitFor`'s one-second wait.
beforeAll(async () => {
  await Promise.all([
    import('../../../src/renderer/src/liveviews/structures/TemplatePoolView'),
    import('../../../src/renderer/src/liveviews/structures/JigsawStructureView'),
    import('../../../src/renderer/src/liveviews/structures/ProcessorListView'),
  ]);
}, 60_000);

describe('the structures index (B635)', () => {
  it('has an entry for each of the three kinds, all declared as live_view', () => {
    expect(Object.keys(STRUCTURES_VIEWS).sort()).toEqual([...STRUCTURES_PANEL_KINDS].sort());
    const preview = new Map<string, string | undefined>();
    for (const plugin of builtInPlugins) {
      for (const kind of plugin.contributes.elementKinds ?? [])
        preview.set(kind.id, kind.previewKind);
    }
    for (const kind of STRUCTURES_PANEL_KINDS) {
      expect(hasLiveView(kind), kind).toBe(true);
      expect(preview.get(kind), kind).toBe('live_view');
    }
    // Structure sets keep their start markers on the map and have no panel view.
    expect(preview.get('minecraft:worldgen/structure_set')).not.toBe('live_view');
  });

  it('says not yet inside the frame, naming the brief', async () => {
    for (const [kind, brief] of [
      ['minecraft:worldgen/template_pool', 'B640'],
      ['minecraft:worldgen/structure', 'B640'],
      ['minecraft:worldgen/processor_list', 'B641'],
    ] as const) {
      const View = liveViewComponent(kind);
      expect(View, kind).not.toBeNull();
      if (View === null) continue;
      render(<View {...({} as LiveViewProps)} />);
      await waitFor(() => expect(screen.getByTestId('live-view-not-yet')).toBeTruthy());
      expect(screen.getByTestId('live-view').textContent).toContain(brief);
      cleanup();
    }
  });
});
