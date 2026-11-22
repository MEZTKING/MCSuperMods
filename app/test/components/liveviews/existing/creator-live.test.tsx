// @vitest-environment happy-dom
/**
 * The Creator's Live tab (B615, ADR 0120 D7): the 9 mob flows, the 4 vehicle flows, Particle,
 * Fluid, Villager trade, Village job, Wandering merchant and Extra drop open on Live, show a
 * non-empty live view of what their answers make (today's previews wrapped as registry entries),
 * and the view changes with an answer within 150 ms plus the budget. Only MSM's own library
 * flows and a made-up vanilla table; no Mojang file. Nothing is applied by looking.
 */
import type { Project } from '@msm/core';
import type { ContentBundle, Json, ProjectStarter, Target } from '@msm/plugin-api';
import { libraryStarters } from '@msm/plugin-library';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CreatorPreview } from '../../../../src/renderer/src/components/creator/CreatorPreview';
import {
  CREATOR_TABS,
  firstTab,
  mainThing,
} from '../../../../src/renderer/src/components/creator/creator-model';
import { useLiveViewPrefs } from '../../../../src/renderer/src/liveviews/view-prefs';

vi.mock('../../../../src/renderer/src/liveviews/client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/renderer/src/liveviews/client')>();
  let client: InstanceType<typeof actual.LiveViewClient> | null = null;
  return {
    ...actual,
    sharedLiveViewClient: () => {
      client ??= new actual.LiveViewClient({
        createWorker: async () => {
          const { SIM_ENGINE } = await import('../../../../src/renderer/src/liveviews/worker');
          const { hostWorker } = await import('../frame/fakes');
          return hostWorker(SIM_ENGINE);
        },
      });
      return client;
    },
  };
});

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target as Target;

/** A made-up vanilla zombie table (MSM's own: one bone), for the Extra drop flow. */
const VANILLA_FOLDERS: Record<string, Record<string, Json>> = {
  loot_table: {
    'minecraft:entities/zombie': {
      type: 'minecraft:entity',
      pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:bone' }] }],
    },
  },
};

const writes: string[] = [];

beforeAll(() => {
  (window as unknown as { msm: unknown }).msm = {
    minecraft: {
      readDataFiles: async (version: string, folders: readonly string[]) => ({
        version,
        folders: Object.fromEntries(
          folders.map((folder) => [folder, VANILLA_FOLDERS[folder] ?? {}]),
        ),
        fileCount: 1,
      }),
      readAsset: async () => null,
    },
    fs: {
      readFile: async () => {
        throw new Error('not there');
      },
      writeFile: async (path: string) => {
        writes.push(path);
      },
    },
  };
});

afterAll(() => {
  delete (window as unknown as { msm?: unknown }).msm;
});

afterEach(() => {
  cleanup();
});

function build(id: string, values: Record<string, Json> = {}): ContentBundle {
  const flow = libraryStarters.find((entry) => entry.id === id) as ProjectStarter;
  const defaults = Object.fromEntries(
    (flow.parameters ?? []).map((parameter) => [parameter.id, parameter.default]),
  );
  return flow.build({
    namespace: 'demo',
    projectName: 'Demo',
    target,
    values: { ...defaults, ...values },
  }) as ContentBundle;
}

/** One answer that changes what the flow makes: its name, else a number or an item. */
function changedAnswer(id: string): Record<string, Json> {
  if (id === 'villager-trade') return { emeralds: 7 };
  if (id === 'extra-drop') return { item: 'minecraft:diamond' };
  const flow = libraryStarters.find((entry) => entry.id === id) as ProjectStarter;
  const name = (flow.parameters ?? []).find((parameter) => parameter.id.endsWith('_name'));
  if (name === undefined) throw new Error(`${id} has no name question`);
  return { [name.id]: `${String(name.default)} Two` };
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
      vanilla={{ readAsset: async () => null }}
      overwrite={new Set<string>()}
      onOverwriteChange={vi.fn()}
      tab="live"
      onTabChange={vi.fn()}
      webgl={false}
    />
  );
}

/** The flows of the exit criteria, with the kind of their main thing. */
const FLOWS: readonly [string, string][] = [
  ['custom_mob', 'msm:entity'],
  ['pet', 'msm:entity'],
  ['farm-animal', 'msm:entity'],
  ['mount', 'msm:entity'],
  ['wandering-merchant', 'msm:entity'],
  ['flying-mob', 'msm:entity'],
  ['water-mob', 'msm:entity'],
  ['boss', 'msm:entity'],
  ['mob-skin', 'minecraft:wolf_variant'],
  ['vehicle-car', 'msm:vehicle'],
  ['vehicle-tank', 'msm:vehicle'],
  ['vehicle-plane', 'msm:vehicle'],
  ['vehicle-boat', 'msm:vehicle'],
  ['particle', 'msm:particle'],
  ['fluid', 'msm:fluid'],
  ['villager-trade', 'minecraft:villager_trade'],
  ['village-job', 'msm:villager_profession'],
  ['extra-drop', 'msm:loot_addition'],
];

/** The Live tab's view text, once it has drawn more than its loading line. */
async function drawn(): Promise<string> {
  let text = '';
  await waitFor(
    () => {
      const live = screen.getByTestId('creator-live');
      const view = within(live).getByTestId('live-view');
      text = view.textContent ?? '';
      expect(text).not.toMatch(/Loading|Reading the trades/);
      expect(text.length).toBeGreaterThan(20);
    },
    { timeout: 4000 },
  );
  return text;
}

describe('the Creator’s Live tab (B615)', () => {
  it('is the first of the preview tabs', () => {
    expect(CREATOR_TABS[0]).toEqual({ id: 'live', label: 'Live' });
  });

  it.each(FLOWS)(
    '%s opens on Live and its view follows an answer',
    async (id, kind) => {
      const bundle = build(id);
      expect(mainThing(bundle)?.kind).toBe(kind);
      expect(firstTab(bundle)).toBe('live');
      const view = render(preview(bundle));
      expect(screen.getByTestId('creator-tab-live').getAttribute('aria-selected')).toBe('true');
      const before = await drawn();
      expect(screen.getByTestId('live-view-tag').textContent).toBe('Preview');
      const started = performance.now();
      act(() => view.rerender(preview(build(id, changedAnswer(id)))));
      // 150 ms of the views' own debounce plus a budget of one second for a test machine.
      await waitFor(
        async () => {
          expect(await drawn()).not.toBe(before);
        },
        { timeout: 1150 },
      );
      expect(performance.now() - started).toBeLessThan(1150);
    },
    15_000,
  );

  it('shows the merchant screen of the wandering merchant with its wares', async () => {
    render(preview(build('wandering-merchant')));
    await waitFor(() => expect(screen.getByTestId('tryit-merchant-offer-1')).toBeTruthy(), {
      timeout: 4000,
    });
    const offers = screen.getByTestId('tryit-merchant-offers').textContent ?? '';
    expect(offers).toContain('Glow berries');
    // Minecraft's own trade sets are named, not drawn.
    expect(screen.getByTestId('live-mob-merchant-vanilla').textContent).toContain(
      'minecraft:wandering_trader/common',
    );
  });

  it('lists every thing a flow makes in the strip, and keeps a block flow on Blocks', async () => {
    const custom = build('custom_mob');
    render(preview(custom));
    await drawn();
    const things = screen.getByTestId('creator-live-things');
    expect(within(things).getByTestId('creator-live-thing-1').getAttribute('data-element')).toBe(
      'demo:ruby_golem',
    );
    // The mob's loot table and its function have views of their own.
    expect(within(things).getAllByRole('button').length).toBeGreaterThanOrEqual(2);
    expect(firstTab(build('simple-block'))).toBe('blocks');
    expect(firstTab(build('status-effect'))).toBe('card');
    expect(firstTab(build('enchantment'))).toBe('card');
  });

  it('says so in one line when a flow makes nothing to picture', () => {
    render(preview(build('custom-command')));
    expect(screen.getByTestId('creator-live-empty').textContent).toMatch(
      /^Nothing to picture: \d+ files without a view\.$/,
    );
  });

  it('writes nothing by looking', async () => {
    useLiveViewPrefs.getState().reset();
    const stored = localStorage.getItem('msm.live-view-prefs.v1');
    render(preview(build('extra-drop')));
    await drawn();
    expect(writes).toEqual([]);
    expect(localStorage.getItem('msm.live-view-prefs.v1')).toBe(stored);
  });
});
