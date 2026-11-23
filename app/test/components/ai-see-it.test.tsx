// @vitest-environment happy-dom
/**
 * The AI review's See it pane (B615; ADR 0120 D7, ADR 0125 D3): a proposal that adds a block, a
 * mob and a loot table shows all three before Apply, over the project as it would be; unticking
 * takes a thing out 150 ms later; deleted and renamed elements are named; a running proposal says
 * "More may follow"; nothing is applied, written or stored by looking. Only MSM's own made-up data.
 */
import type { Json, Project, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChangeItem } from '../../src/renderer/src/changeset/changeset';
import { AiChangesetReview } from '../../src/renderer/src/components/ai/AiChangesetReview';
import { AiSeeIt, seeItPreview } from '../../src/renderer/src/components/ai/AiSeeIt';
import { thingsOf } from '../../src/renderer/src/components/ai/proposal-things';
import { useLiveViewPrefs } from '../../src/renderer/src/liveviews/view-prefs';

vi.mock('../../src/renderer/src/liveviews/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/renderer/src/liveviews/client')>();
  let client: InstanceType<typeof actual.LiveViewClient> | null = null;
  return {
    ...actual,
    sharedLiveViewClient: () => {
      client ??= new actual.LiveViewClient({
        createWorker: async () => {
          const { SIM_ENGINE } = await import('../../src/renderer/src/liveviews/worker');
          const { hostWorker } = await import('./liveviews/frame/fakes');
          return hostWorker(SIM_ENGINE);
        },
      });
      return client;
    },
  };
});

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const writes: string[] = [];

beforeAll(() => {
  (window as unknown as { msm: unknown }).msm = {
    minecraft: { readAsset: async () => null, readDataFiles: async () => null },
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

afterEach(cleanup);

const existing = {
  id: 'demo:old_stone',
  kind: 'msm:block',
  data: { format: 1, display_name: 'Old Stone', model: 'demo:block/old_stone' },
  meta: { createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' },
};

const project = Object.freeze({
  formatVersion: 1,
  name: 'Demo',
  namespaces: [{ name: 'demo', elements: [existing], assets: [] }],
  plugins: [],
  settings: {},
  targets: [target.id],
}) as unknown as Project;

let next = 0;
function create(id: string, kind: string, after: Json): ChangeItem {
  next += 1;
  return {
    itemId: `item-${next}`,
    op: 'create',
    elementId: id as ResourceLocation,
    kind,
    after,
    accepted: true,
    problems: [],
  };
}

const block = create('demo:ruby_block', 'msm:block', {
  format: 1,
  display_name: 'Ruby Block',
  model: 'demo:block/ruby_block',
});
const mob = create('demo:ruby_golem', 'msm:entity', {
  format: 1,
  display_name: 'Ruby Golem',
  category: 'monster',
  components: { 'msm:health': { max: 30 } },
});
const table = create('demo:entities/ruby_golem', 'minecraft:loot_table', {
  type: 'minecraft:entity',
  pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:emerald' }] }],
});
const items = [block, mob, table];

describe('seeItPreview', () => {
  it('lays every kept, fitting change over the project, changed elements included', () => {
    const update: ChangeItem = {
      itemId: 'item-update',
      op: 'update',
      elementId: 'demo:old_stone' as ResourceLocation,
      kind: 'msm:block',
      before: existing.data,
      after: { ...existing.data, display_name: 'New Stone' },
      accepted: true,
      problems: [],
    };
    const shown = seeItPreview(project, [...items, update]);
    expect(shown.things.map((thing) => thing.name)).toEqual([
      'Ruby Block',
      'Ruby Golem',
      'Ruby golem',
      'New Stone',
    ]);
    // The project itself is not changed.
    expect(project.namespaces[0]?.elements).toHaveLength(1);
    const unticked = seeItPreview(project, [{ ...block, accepted: false }, mob, table]);
    expect(unticked.things.map((thing) => thing.element.id)).toEqual([
      'demo:ruby_golem',
      'demo:entities/ruby_golem',
    ]);
  });

  it('names deleted and renamed elements and counts what it cannot picture', () => {
    const removed: ChangeItem = {
      itemId: 'item-delete',
      op: 'delete',
      elementId: 'demo:old_stone' as ResourceLocation,
      kind: 'msm:block',
      before: existing.data,
      accepted: true,
      problems: [],
    };
    const lang = create('demo:en_us', 'minecraft:lang', { 'block.demo.x': 'X' });
    const shown = seeItPreview(project, [removed, lang]);
    expect(shown.things).toEqual([]);
    expect(shown.removed).toEqual(['Old Stone deleted']);
    expect(shown.unpictured).toBe(1);
  });
});

describe('See it names things as the cards do (ADR 0125 open items)', () => {
  const sword = create('demo:ruby_sword', 'msm:item', { format: 1, model: 'demo:item/ruby_sword' });
  const swordNames = create('demo:en_us', 'minecraft:lang', {
    'item.demo.ruby_sword': 'Ruby Sword',
  });

  it('takes the names from the proposal’s language file first, like the cards', () => {
    const shown = seeItPreview(project, [sword, swordNames]);
    expect(shown.things.map((thing) => thing.name)).toEqual(['Ruby Sword']);
    expect(thingsOf([sword, swordNames]).map((thing) => thing.name)).toEqual(['Ruby Sword']);
  });

  const rename: ChangeItem = {
    itemId: 'item-rename',
    op: 'rename',
    elementId: 'demo:ruby_stone' as ResourceLocation,
    from: 'demo:old_stone' as ResourceLocation,
    to: 'demo:ruby_stone' as ResourceLocation,
    kind: 'msm:block',
    before: existing.data,
    after: existing.data,
    accepted: true,
    problems: [],
  };

  it('says a rename in names', () => {
    const shown = seeItPreview(project, [rename]);
    expect(shown.removed).toEqual(['Old Stone renamed']);
    expect(shown.removed.join(' ')).not.toMatch(/\b[a-z0-9_]+:[a-z0-9_/]+\b/);
    const renamed = { ...rename, after: { ...existing.data, display_name: 'Ruby Stone' } };
    expect(seeItPreview(project, [renamed]).removed).toEqual(['Old Stone renamed to Ruby Stone']);
  });

  it('draws the rename line', () => {
    render(<AiSeeIt project={project} items={[rename]} projectRoot={null} />);
    expect(screen.getByTestId('ai-see-it-removed').textContent).toBe(
      'Not drawn: Old Stone renamed.',
    );
  });
});

describe('the See it pane (B615)', () => {
  it('shows the block, the mob and the loot table before Apply, first in the review', async () => {
    const onApply = vi.fn();
    render(
      <AiChangesetReview
        items={items}
        project={project}
        running={false}
        applying={false}
        onToggle={vi.fn()}
        onApply={onApply}
        onDiscard={vi.fn()}
      />,
    );
    const pane = screen.getByTestId('ai-see-it');
    const review = screen.getByTestId('ai-changeset');
    // The pane comes before the rows of the review.
    expect(
      pane.compareDocumentPosition(within(review).getAllByRole('checkbox')[0] as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await waitFor(() => expect(within(pane).getByTestId('ai-see-it-thing-3')).toBeTruthy(), {
      timeout: 4000,
    });
    expect(within(pane).getByTestId('ai-see-it-thing-1').textContent).toBe('Ruby Block');
    expect(within(pane).getByTestId('ai-see-it-thing-2').textContent).toBe('Ruby Golem');
    expect(within(pane).getByTestId('ai-see-it-thing-3').textContent).toBe('Ruby golem');
    await waitFor(() => expect(within(pane).getByTestId('live-piece-words')).toBeTruthy(), {
      timeout: 4000,
    });
    expect(within(pane).getByTestId('live-view-tag').textContent).toBe('Preview');
    fireEvent.click(within(pane).getByTestId('ai-see-it-thing-2'));
    await waitFor(
      () => expect(within(pane).getByTestId('live-mob-words').textContent).toContain('30 health'),
      { timeout: 4000 },
    );
    fireEvent.click(within(pane).getByTestId('ai-see-it-thing-3'));
    await waitFor(() => expect(within(pane).getByTestId('roll-it-stacks')).toBeTruthy(), {
      timeout: 4000,
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('follows the ticks 150 ms later and a running proposal', async () => {
    useLiveViewPrefs.getState().reset();
    const stored = localStorage.getItem('msm.live-view-prefs.v1');
    const view = render(<AiSeeIt project={project} items={items} running projectRoot={null} />);
    expect(screen.getByTestId('ai-see-it-more').textContent).toBe('More may follow.');
    await waitFor(() => expect(screen.getByTestId('ai-see-it-thing-3')).toBeTruthy());
    const started = performance.now();
    act(() =>
      view.rerender(
        <AiSeeIt
          project={project}
          items={[{ ...block, accepted: false }, mob, table]}
          projectRoot={null}
        />,
      ),
    );
    expect(screen.queryByTestId('ai-see-it-more')).toBeNull();
    await waitFor(() => expect(screen.queryByTestId('ai-see-it-thing-3')).toBeNull(), {
      timeout: 1000,
    });
    expect(performance.now() - started).toBeGreaterThanOrEqual(140);
    expect(screen.getByTestId('ai-see-it-thing-1').textContent).toBe('Ruby Golem');
    expect(localStorage.getItem('msm.live-view-prefs.v1')).toBe(stored);
  });

  it('says in one line when there is nothing to picture, and names what goes', () => {
    const lang = create('demo:en_us', 'minecraft:lang', { 'block.demo.x': 'X' });
    const removed: ChangeItem = {
      itemId: 'item-gone',
      op: 'delete',
      elementId: 'demo:old_stone' as ResourceLocation,
      kind: 'msm:block',
      before: existing.data,
      accepted: true,
      problems: [],
    };
    render(<AiSeeIt project={project} items={[lang, removed]} />);
    expect(screen.getByTestId('ai-see-it-empty').textContent).toBe(
      'Nothing to picture: 1 file without a view.',
    );
    expect(screen.getByTestId('ai-see-it-removed').textContent).toBe(
      'Not drawn: Old Stone deleted.',
    );
  });
});
