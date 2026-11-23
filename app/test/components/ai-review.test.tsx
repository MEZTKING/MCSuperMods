// @vitest-environment happy-dom
/**
 * The AI review as things (B688; ADR 0125 D3, D13, F4, F15, F17): Very easy shows the See it
 * pane and one card per thing with its picture, name and **Keep**, nothing else and no id; Easy
 * folds each thing's files under **Files behind this**; Advanced keeps the file list. Unticking a
 * thing unticks its files and the See it pane loses it; a proposal that changes or takes out
 * something reads **Make these changes**. Only MSM's own made-up data.
 */
import type { Json, Problem, Project, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChangeItem } from '../../src/renderer/src/changeset/changeset';
import { AiChangesetReview } from '../../src/renderer/src/components/ai/AiChangesetReview';
import { forbiddenIn } from '../../src/renderer/src/components/ai/ai-words';

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

beforeAll(() => {
  (window as unknown as { msm: unknown }).msm = {
    minecraft: { readAsset: async () => null, readDataFiles: async () => null },
    fs: {
      readFile: async () => {
        throw new Error('not there');
      },
      writeFile: async () => {},
    },
  };
});

afterAll(() => {
  delete (window as unknown as { msm?: unknown }).msm;
});

afterEach(cleanup);

const oldStone = {
  id: 'demo:old_stone',
  kind: 'msm:block',
  data: { format: 1, display_name: 'Old Stone', model: 'demo:block/old_stone' },
  meta: { createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' },
};

const project = Object.freeze({
  formatVersion: 1,
  name: 'Demo',
  namespaces: [{ name: 'demo', elements: [oldStone], assets: [] }],
  plugins: [],
  settings: {},
  targets: [target.id],
}) as unknown as Project;

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let next = 0;
function create(
  id: string,
  kind: string,
  after: Json,
  extra: Partial<ChangeItem> = {},
): ChangeItem {
  next += 1;
  return {
    itemId: `item-${next}`,
    op: 'create',
    elementId: id as ResourceLocation,
    kind,
    after,
    accepted: true,
    problems: [],
    ...extra,
  };
}

const missingPicture: Problem = {
  severity: 'warning',
  code: 'entities.missing-texture',
  message: 'demo:ruby_golem names the texture demo:entity/ruby_golem, which is missing.',
  elementId: 'demo:ruby_golem' as ResourceLocation,
  path: '/texture',
};

/** "make a ruby sword" and a golem: two things, five files behind them. */
function proposal(): ChangeItem[] {
  return [
    create('demo:mod', 'msm:mod', { format: 1, name: 'Demo' }),
    create('demo:ruby_sword', 'msm:item', {
      format: 1,
      model: 'demo:item/ruby_sword',
      max_stack_size: 1,
    }),
    create('demo:item/ruby_sword', 'minecraft:model', {
      parent: 'minecraft:item/handheld',
      textures: { layer0: 'demo:item/ruby_sword' },
    }),
    create('demo:en_us', 'minecraft:lang', { 'item.demo.ruby_sword': 'Ruby Sword' }),
    create('demo:ruby_sword_from_rubies', 'minecraft:recipe', {
      type: 'minecraft:crafting_shaped',
      pattern: ['R', 'R', 'S'],
      key: { R: 'demo:ruby', S: 'minecraft:stick' },
      result: { id: 'demo:ruby_sword', count: 1 },
    }),
    {
      itemId: 'item-texture',
      op: 'asset',
      asset: { namespace: 'demo', path: 'textures/item/ruby_sword.png', bytes: png },
      accepted: true,
      problems: [],
    },
    create(
      'demo:ruby_golem',
      'msm:entity',
      {
        format: 1,
        display_name: 'Ruby Golem',
        category: 'monster',
        components: { 'msm:health': { max: 30 } },
      },
      { problems: [missingPicture] },
    ),
  ];
}

/** The review over its own ticks, as the panel holds them. */
function Review(props: { items: ChangeItem[]; running?: boolean }) {
  const [items, setItems] = useState(props.items);
  return (
    <AiChangesetReview
      items={items}
      project={project}
      running={props.running ?? false}
      applying={false}
      onToggle={(itemId, accepted) =>
        setItems((list) =>
          list.map((item) => (item.itemId === itemId ? { ...item, accepted } : item)),
        )
      }
      onApply={vi.fn()}
      onDiscard={vi.fn()}
    />
  );
}

describe('the review as things (B688)', () => {
  it('shows things with pictures and plain words, and no id or file row until More options', async () => {
    window.msmMoreOptionsOpen = false;
    globalThis.localStorage.clear();
    render(<Review items={proposal()} />);
    const review = screen.getByTestId('ai-changeset');
    expect(screen.getByTestId('ai-review-heading').textContent).toBe('Ready to add: 2 things');
    // See it first, then the cards.
    const pane = screen.getByTestId('ai-see-it');
    expect(
      pane.compareDocumentPosition(screen.getByTestId('ai-things')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const sword = screen.getByTestId('ai-thing-1');
    expect(sword.textContent).toContain('Ruby Sword');
    expect(sword.textContent).toContain('Item · New');
    expect(within(sword).getByTestId('ai-thing-1-picture').getAttribute('src')).toMatch(
      /^data:image\/png;base64,/,
    );
    const golem = screen.getByTestId('ai-thing-2');
    expect(golem.textContent).toContain('Mob · New');
    // Problems in Things to fix's words, not the message and the path.
    expect(within(golem).getByTestId('ai-thing-2-problems').textContent).toBe(
      'Ruby Golem is missing its picture.',
    );
    // Nothing else: no file rows, no files disclosure, no diff.
    expect(review.querySelectorAll('li[data-op]')).toHaveLength(0);
    expect(screen.queryByTestId('ai-thing-1-files')).toBeNull();
    expect(review.textContent).not.toContain('Before and after');
    expect(screen.getByTestId('ai-apply').textContent).toBe('Add to my mod');
    expect(screen.getByTestId('ai-discard').textContent).toBe('Throw away');
    await waitFor(() => expect(within(pane).getByTestId('ai-see-it-thing-2')).toBeTruthy(), {
      timeout: 4000,
    });
    // No id and no forbidden word anywhere in the review, the confirmation included.
    fireEvent.click(screen.getByTestId('ai-discard'));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog.textContent).toContain('Nothing has been added to your mod.');
    expect(forbiddenIn(review.textContent ?? '')).toEqual([]);
    expect(forbiddenIn(dialog.textContent ?? '')).toEqual([]);
    for (const element of review.querySelectorAll('[aria-label], img[alt]')) {
      const label = element.getAttribute('aria-label') ?? element.getAttribute('alt') ?? '';
      expect(forbiddenIn(label), label).toEqual([]);
    }
    window.msmMoreOptionsOpen = true;
  });

  it('unticks every file of a thing with its Keep, and the See it pane loses it', async () => {
    render(<Review items={proposal()} />);
    const pane = screen.getByTestId('ai-see-it');
    await waitFor(() => expect(within(pane).getByTestId('ai-see-it-thing-2')).toBeTruthy(), {
      timeout: 4000,
    });
    expect(within(pane).getByTestId('ai-see-it-thing-1').textContent).toMatch(/^Ruby sword$/i);
    const keep = screen.getByTestId('ai-thing-1-keep') as HTMLInputElement;
    expect(keep.checked).toBe(true);
    fireEvent.click(keep);
    expect((screen.getByTestId('ai-thing-1-keep') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId('ai-thing-1').dataset.kept).toBe('none');
    expect(screen.getByTestId('ai-review-heading').textContent).toBe('Ready to add: 1 thing');
    await waitFor(() => expect(within(pane).queryByTestId('ai-see-it-thing-2')).toBeNull(), {
      timeout: 1000,
    });
    expect(within(pane).getByTestId('ai-see-it-thing-1').textContent).toBe('Ruby Golem');
    // Ticking it again ticks every file again.
    fireEvent.click(screen.getByTestId('ai-thing-1-keep'));
    expect(screen.getByTestId('ai-thing-1').dataset.kept).toBe('all');
    expect(screen.getByTestId('ai-review-heading').textContent).toBe('Ready to add: 2 things');
  });

  it('says Make these changes when something is changed or taken out', () => {
    const items: ChangeItem[] = [
      create(
        'demo:old_stone',
        'msm:block',
        { ...oldStone.data, display_name: 'Older Stone' },
        {
          op: 'update',
          before: oldStone.data,
        },
      ),
      {
        itemId: 'item-gone',
        op: 'delete',
        elementId: 'demo:old_stone_slab' as ResourceLocation,
        kind: 'msm:block',
        before: { format: 1, display_name: 'Old Stone Slab' },
        accepted: true,
        problems: [],
        conflict: 'demo:old_stone_slab no longer exists.',
      },
    ];
    render(<Review items={items} />);
    expect(screen.getByTestId('ai-apply').textContent).toBe('Make these changes');
    expect(screen.getByTestId('ai-thing-1').textContent).toContain('Block · Changed');
    expect(screen.getByTestId('ai-thing-2').textContent).toContain('Block · Taken out');
    expect(screen.getByTestId('ai-thing-2-conflict').textContent).toBe(
      'Not added: it is no longer in your mod.',
    );
    expect(screen.getByTestId('ai-discard').textContent).toBe('Throw away');
  });

  it('keeps the full file list under More options, with Textures for the pictures', () => {
    render(<Review items={proposal()} />);
    const review = screen.getByTestId('ai-changeset');
    expect(screen.getByTestId('more-options-ai-review-files')).toBeTruthy();
    expect(screen.getByTestId('ai-things')).toBeTruthy();
    const rows = review.querySelectorAll('li[data-op]');
    expect(rows).toHaveLength(7);
    expect([...rows].map((row) => row.querySelector('code')?.textContent)).toContain(
      'demo:item/ruby_sword',
    );
    expect(review.textContent).toContain('New elements (6)');
    expect(review.textContent).toContain('Textures (1)');
    expect(review.textContent).not.toMatch(/placeholder/i);
    expect(screen.getByTestId('ai-change-item-texture-diff')).toBeTruthy();
    // A file's own tick still works, and the thing reads as partly kept.
    fireEvent.click(screen.getByTestId('ai-change-item-texture-accept'));
    expect(screen.getByTestId('ai-thing-1').dataset.kept).toBe('mixed');
    expect(screen.getByTestId('ai-apply').textContent).toBe('Add to my mod');
  });
});
