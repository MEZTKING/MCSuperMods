// @vitest-environment happy-dom

import type { Element, Project } from '@msm/plugin-api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { webAudioOut, webAudioPlayer } from '../../../src/renderer/src/audio/player';
import { pickEntry, resolveSoundEvent } from '../../../src/renderer/src/audio/resolve';
import { SoundPlayButton } from '../../../src/renderer/src/audio/SoundPlayButton';
import { DATA_VIEWS } from '../../../src/renderer/src/liveviews/data';
import { EXISTING_VIEWS } from '../../../src/renderer/src/liveviews/existing';
import {
  LOOKS_PANEL_KINDS,
  LOOKS_STUDIO_KINDS,
  LOOKS_VIEWS,
} from '../../../src/renderer/src/liveviews/looks';
import { bodyFor } from '../../../src/renderer/src/liveviews/looks/bodies';
import { spriteIndex } from '../../../src/renderer/src/liveviews/looks/waypoint/sprites';
import {
  hasLiveView,
  LIVE_VIEWS,
  type LiveViewProps,
  liveViewComponent,
} from '../../../src/renderer/src/liveviews/registry';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';

afterEach(cleanup);

/** The 30 rows of the audit that wait for Live views 3. */
const THIRTY = [
  ...LOOKS_PANEL_KINDS,
  'msm:potion',
  'msm:creative_tab',
  'msm:villager_type',
] as const;

describe('the looks index (B620)', () => {
  it('puts no kind in two indexes, so no later spread wins silently', () => {
    const indexes = { data: DATA_VIEWS, existing: EXISTING_VIEWS, looks: LOOKS_VIEWS };
    const seen = new Map<string, string>();
    for (const [name, index] of Object.entries(indexes)) {
      for (const kind of Object.keys(index)) {
        expect(seen.get(kind), `${kind} is in ${seen.get(kind)} and ${name}`).toBeUndefined();
        seen.set(kind, name);
      }
    }
    expect(Object.keys(LIVE_VIEWS).length).toBe(seen.size);
  });

  it('has an entry for each of the 30 kinds and the two that gain a look', () => {
    expect(THIRTY).toHaveLength(30);
    for (const kind of [...THIRTY, 'msm:effect', 'msm:villager_profession']) {
      expect(hasLiveView(kind), kind).toBe(true);
      expect(Object.hasOwn(LOOKS_VIEWS, kind), kind).toBe(true);
    }
    expect(Object.keys(LOOKS_VIEWS)).toHaveLength(32);
  });

  it('declares previewKind live_view on the panel kinds and on no studio kind', () => {
    const preview = new Map<string, string | undefined>();
    for (const plugin of builtInPlugins) {
      for (const kind of plugin.contributes.elementKinds ?? [])
        preview.set(kind.id, kind.previewKind);
    }
    for (const kind of LOOKS_PANEL_KINDS) expect(preview.get(kind), kind).toBe('live_view');
    for (const kind of LOOKS_STUDIO_KINDS) expect(preview.get(kind), kind).not.toBe('live_view');
  });

  it('shows the frame with Not yet for a stub, and keeps B615 views where they were', async () => {
    const View = liveViewComponent('minecraft:font');
    expect(View).not.toBeNull();
    const element = { id: 'demo:f', kind: 'minecraft:font', data: {} } as unknown as Element;
    const project = {
      formatVersion: 1,
      name: 'D',
      namespaces: [],
      targets: [],
      plugins: [],
      settings: {},
    } as unknown as Project;
    const props = {
      project,
      element,
      vanilla: {} as never,
      vanillaAssets: null,
      preferences: {} as never,
      onPreferences() {},
      onSetup() {},
    } satisfies LiveViewProps;
    const Stub = View as NonNullable<typeof View>;
    render(<Stub {...props} />);
    await waitFor(() => expect(screen.getByTestId('live-view-not-yet')).toBeTruthy());
    // The six variants keep B615's flat pictures; the potion, effect and job keep theirs.
    const loaded = await Promise.all(
      ['minecraft:wolf_variant', 'msm:potion', 'msm:effect', 'msm:villager_profession'].map(
        (kind) => (LOOKS_VIEWS[kind] as () => Promise<{ default: unknown }>)(),
      ),
    );
    for (const module of loaded) expect(typeof module.default).toBe('function');
  });

  it('has safe interface stubs', () => {
    expect(bodyFor('minecraft:wolf_variant', undefined, false)).toBe('flat_sheet');
    expect(resolveSoundEvent('x:y', {}, null)).toEqual({
      event: 'x:y',
      origin: 'missing',
      entries: [],
    });
    expect(pickEntry({ event: 'x:y', origin: 'missing', entries: [] }, Math.random)).toBeNull();
    expect(webAudioPlayer()).toBeNull();
    // Try it's player is the moved one, null without Web Audio.
    expect(webAudioOut()).toBeNull();
    expect([0, 8, 20, 32, 40].map((d) => spriteIndex(d, 8, 32, 4))).toEqual([0, 1, 2, 3, 3]);
    render(<SoundPlayButton project={{} as Project} sounds={null} event="minecraft:x" />);
    expect((screen.getByTestId('sound-play-button') as HTMLButtonElement).disabled).toBe(true);
  });
});
