// @vitest-environment happy-dom
/**
 * The Creator's Live tab for batch 3's flows (B630, ADR 0121 goal 3): Music disc, Goat horn,
 * Banner pattern, Armour trim, Pot pattern, Creative tab and Villager look each list their
 * pattern, song, call, tab or look among the things to picture, and its view draws in the frame.
 * Only MSM's own library flows; no Mojang file. Nothing is applied by looking.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Project } from '@msm/core';
import type { ContentBundle, Json, ProjectStarter, Target } from '@msm/plugin-api';
import { libraryStarters } from '@msm/plugin-library';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CreatorPreview } from '../../../../src/renderer/src/components/creator/CreatorPreview';
import { LOOKS_VIEWS } from '../../../../src/renderer/src/liveviews/looks';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target as Target;

beforeAll(async () => {
  (window as unknown as { msm: unknown }).msm = {
    minecraft: {
      readDataFiles: async (version: string, folders: readonly string[]) => ({
        version,
        folders: Object.fromEntries(folders.map((folder) => [folder, {}])),
        fileCount: 0,
      }),
      readAsset: async () => null,
    },
  };
  // Every view of these flows, once, outside the cases' timeouts.
  await Promise.all(
    [
      'minecraft:jukebox_song',
      'minecraft:instrument',
      'minecraft:banner_pattern',
      'minecraft:trim_pattern',
      'minecraft:decorated_pot_pattern',
      'msm:creative_tab',
      'msm:villager_type',
    ].map((kind) => (LOOKS_VIEWS[kind] as () => Promise<unknown>)()),
  );
  await import('../../../../src/renderer/src/liveviews/LiveThings');
});

afterAll(() => {
  delete (window as unknown as { msm?: unknown }).msm;
});

afterEach(cleanup);

function build(id: string): ContentBundle {
  const flow = libraryStarters.find((entry) => entry.id === id) as ProjectStarter;
  expect(flow, id).toBeDefined();
  const values = Object.fromEntries(
    (flow.parameters ?? []).map((parameter) => [parameter.id, parameter.default as Json]),
  );
  return flow.build({ namespace: 'demo', projectName: 'Demo', target, values }) as ContentBundle;
}

const project = {
  formatVersion: 1,
  name: 'Demo',
  namespaces: [{ name: 'demo', elements: [], assets: [] }],
  plugins: [],
  settings: {},
  targets: [target.id],
} as unknown as Project;

function preview(bundle: ContentBundle) {
  return (
    <CreatorPreview
      bundle={bundle}
      revision={1}
      plan={null}
      project={project}
      folders={target.folders.resource as never}
      readProjectAsset={async () => null}
      vanilla={null}
      overwrite={new Set<string>()}
      onOverwriteChange={vi.fn()}
      tab="live"
      onTabChange={vi.fn()}
      webgl={false}
    />
  );
}

const LOOKS = join(import.meta.dirname, '../../../../src/renderer/src/liveviews/looks');

/** The flows of the exit criteria, the kind of the thing each must picture and its view file. */
const FLOWS: readonly [string, string, string][] = [
  ['music-disc-item', 'minecraft:jukebox_song', 'jukebox/JukeboxSongView.tsx'],
  ['goat-horn', 'minecraft:instrument', 'instrument/InstrumentView.tsx'],
  ['banner-pattern', 'minecraft:banner_pattern', 'banner/BannerView.tsx'],
  ['armour-trim', 'minecraft:trim_pattern', 'trim/TrimView.tsx'],
  ['pot-pattern', 'minecraft:decorated_pot_pattern', 'pot/PotPatternView.tsx'],
  ['creative-tab', 'msm:creative_tab', 'tab/CreativeTabView.tsx'],
  ['villager-look', 'msm:villager_type', 'villager/VillagerTypeView.tsx'],
];

describe("the Creator's Live tab for looks and sounds (B630)", () => {
  it.each(FLOWS)(
    '%s pictures its %s in the Live tab',
    async (id, kind, file) => {
      const bundle = build(id);
      const made = bundle.elements.find((entry) => entry.kind === kind);
      expect(made, `${id} makes a ${kind}`).toBeDefined();
      render(preview(bundle));
      const live = await screen.findByTestId('creator-live', {}, { timeout: 4000 });
      // Pick the thing in the strip when the flow makes more than one to picture.
      const strip = within(live).queryByTestId('creator-live-things');
      if (strip !== null) {
        const button = within(strip)
          .getAllByRole('button')
          .find((entry) => entry.getAttribute('data-element') === made?.id);
        expect(button, `${made?.id} is in the strip`).toBeDefined();
        await act(async () => {
          fireEvent.click(button as HTMLElement);
        });
      }
      let text = '';
      await waitFor(
        () => {
          const view = within(live).getByTestId('live-view');
          text = view.textContent ?? '';
          expect(text).not.toMatch(/^Loading/);
          expect(text.length).toBeGreaterThan(20);
        },
        { timeout: 4000 },
      );
      expect(within(live).queryByTestId('live-view-none')).toBeNull();
      // A view still a B620 stub in this tree (B627 and B628 build theirs beside this brief)
      // says "Not yet"; once built, its Live tab must show the look itself.
      const stub = /<NotYet\b/.test(readFileSync(join(LOOKS, file), 'utf8'));
      if (!stub) expect(within(live).queryByTestId('live-view-not-yet')).toBeNull();
    },
    15_000,
  );

  it('plays the Music disc song and states its length in the Live tab', async () => {
    render(preview(build('music-disc-item')));
    const live = await screen.findByTestId('creator-live', {}, { timeout: 4000 });
    const strip = within(live).queryByTestId('creator-live-things');
    if (strip !== null) {
      const button = within(strip)
        .getAllByRole('button')
        .find((entry) => entry.getAttribute('data-element') === 'demo:ruby_waltz');
      await act(async () => {
        fireEvent.click(button as HTMLElement);
      });
    }
    await waitFor(() => expect(within(live).getByTestId('song-view')).toBeTruthy(), {
      timeout: 4000,
    });
    expect(within(live).getByTestId('song-play')).toBeTruthy();
    expect(within(live).getByTestId('song-stated').textContent).toContain('3 min 5 s');
  });
});
