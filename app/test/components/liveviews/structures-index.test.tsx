// @vitest-environment happy-dom

import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { hasLiveView, liveViewComponent } from '../../../src/renderer/src/liveviews/registry';
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
    import('../../../src/renderer/src/liveviews/structures/assembly/AssemblyView'),
    import('../../../src/renderer/src/liveviews/structures/processors/ProcessorListView'),
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

  it('loads the built views, none a stub (B640, B641)', async () => {
    const assembly = await import(
      '../../../src/renderer/src/liveviews/structures/assembly/AssemblyView'
    );
    const processors = await import(
      '../../../src/renderer/src/liveviews/structures/processors/ProcessorListView'
    );
    const built: Record<string, unknown> = {
      'minecraft:worldgen/template_pool': assembly.default,
      'minecraft:worldgen/structure': assembly.default,
      'minecraft:worldgen/processor_list': processors.default,
    };
    for (const kind of STRUCTURES_PANEL_KINDS) {
      expect(liveViewComponent(kind), kind).not.toBeNull();
      expect((await STRUCTURES_VIEWS[kind]?.())?.default, kind).toBe(built[kind]);
    }
  });
});
