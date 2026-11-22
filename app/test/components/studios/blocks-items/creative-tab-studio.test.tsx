// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Creative Tab Studio (B460, ADR 0096 D2, ADR 0101 D1): the pure helpers of
 * `creative-tab-model.ts` (who is in a tab, in which order, and the change items that move
 * things in and out) and the Studio rendered through `ElementForm` (lazily, from the registry)
 * on a real `CommandStack`, with a host whose `applyChanges` applies the items as one command,
 * as the session does: adding and taking out things is one undo step, however many change.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ProjectCommand,
  type ResourceLocation,
} from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChangeItem } from '../../../../src/renderer/src/changeset/changeset';
import {
  TAB_ORDER_LABELS,
  tabCandidateOf,
  tabCandidates,
  tabMembers,
  tabMembershipItems,
  tabNonMembers,
  tabOrderOf,
} from '../../../../src/renderer/src/studios/blocks-items/creative-tab-model';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../../lazy-chunks';
import { kindOf, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex(), { item: ['minecraft:diamond'] });
  // The Studio is a lazy chunk: load it here, not inside the first findBy.
  await preloadChunks(
    () => import('../../../../src/renderer/src/studios/blocks-items/CreativeTabStudio'),
  );
}, PRELOAD_TIMEOUT_MS);
afterEach(cleanup);

const TAB = 'demo:gems' as ResourceLocation;
const OTHER_TAB = 'demo:tools' as ResourceLocation;

const elements = (): Element[] => [
  element('demo:amethyst_rod' as ResourceLocation, 'msm:item', {
    display_name: 'Wand',
    creative_tab: 'demo:gems',
  }),
  element('demo:gems' as ResourceLocation, 'msm:creative_tab', {
    format: 1,
    icon: 'demo:ruby',
    display_name: 'Gems',
  }),
  element('demo:hammer' as ResourceLocation, 'msm:item', {
    display_name: 'Hammer',
    creative_tab: 'demo:tools',
  }),
  element('demo:ruby' as ResourceLocation, 'msm:item', {
    display_name: 'Ruby',
    creative_tab: 'demo:gems',
  }),
  element('demo:ruby_block' as ResourceLocation, 'msm:block', { display_name: 'Block of ruby' }),
  element('demo:sprite' as ResourceLocation, 'msm:entity', { display_name: 'Sprite' }),
  element('demo:stone_door' as ResourceLocation, 'msm:block', { item: false }),
  element('demo:tools' as ResourceLocation, 'msm:creative_tab', {
    format: 1,
    icon: 'demo:hammer',
    display_name: 'Tools',
  }),
];

const projectOf = (list: Element[]): Project => ({
  formatVersion: 1,
  name: 'Demo',
  targets: [],
  plugins: [],
  settings: {},
  namespaces: [{ name: 'demo', elements: list, assets: [] }],
});

/** The change items as one project command, as the session's `applyChangeset` makes them. */
function itemsCommand(items: readonly ChangeItem[], label: string): ProjectCommand {
  return {
    id: 'test.apply-changes',
    label,
    apply(draft) {
      for (const item of items) {
        for (const namespace of draft.namespaces) {
          const found = namespace.elements.find((entry) => entry.id === item.elementId);
          if (found !== undefined) found.data = structuredClone(item.after) as never;
        }
      }
    },
  };
}

function Harness({ stack }: { stack: CommandStack }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const subject = stack.state.namespaces[0]?.elements.find((entry) => entry.id === TAB);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={stack.state}
      element={subject}
      kind={kindOf('msm:creative_tab')}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(TAB, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

async function renderOnStack(withHost = true) {
  const stack = new CommandStack(projectOf(elements()));
  const applyChanges = vi.fn<NonNullable<BlocksItemsStudioHost['applyChanges']>>(
    async (items, label) => {
      stack.execute(itemsCommand(items, label));
    },
  );
  const host: BlocksItemsStudioHost = {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: vi.fn(),
    applyChanges,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BlocksItemsStudioHostContext.Provider value={withHost ? host : null}>
      {children}
    </BlocksItemsStudioHostContext.Provider>
  );
  render(<Harness stack={stack} />, { wrapper });
  await screen.findByTestId('creative-tab-studio', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });
  const tabOf = (id: string): Json | undefined => {
    const found = stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
    return found === undefined ? undefined : tabCandidateOf(found)?.tab;
  };
  return { stack, applyChanges, tabOf };
}

const orderOf = (stack: CommandStack): Json | undefined => {
  const data = stack.state.namespaces[0]?.elements.find((entry) => entry.id === TAB)?.data;
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? data.order : undefined;
};

const memberIds = () =>
  screen
    .queryAllByTestId(/^creative-tab-member-/)
    .map((node) => node.getAttribute('data-testid')?.replace('creative-tab-member-', ''));

describe('Creative tab helpers', () => {
  it('registers the Creative Tab Studio', () => {
    expect(
      DISCOVERED_STUDIOS.find((entry) => entry.id === 'msm.blocks-items.creative-tab'),
    ).toMatchObject({ kindId: 'msm:creative_tab' });
  });

  it('finds the items, block items and spawn eggs and the tab each names', () => {
    const project = projectOf(elements());
    expect(
      tabCandidates(project).map((entry) => [entry.elementId, entry.itemId, entry.name, entry.tab]),
    ).toEqual([
      ['demo:amethyst_rod', 'demo:amethyst_rod', 'Wand', 'demo:gems'],
      ['demo:hammer', 'demo:hammer', 'Hammer', 'demo:tools'],
      ['demo:ruby', 'demo:ruby', 'Ruby', 'demo:gems'],
      ['demo:ruby_block', 'demo:ruby_block', 'Block of ruby', undefined],
      ['demo:sprite', 'demo:sprite_spawn_egg', 'Sprite spawn egg', undefined],
    ]);
  });

  it('lists members in the project order or by name', () => {
    const project = projectOf(elements());
    expect(tabOrderOf({})).toBe('as_listed');
    expect(tabOrderOf({ order: 'by_name' })).toBe('by_name');
    expect(tabMembers(project, TAB, 'as_listed').map((entry) => entry.name)).toEqual([
      'Wand',
      'Ruby',
    ]);
    const renamed = projectOf(
      elements().map((entry) =>
        entry.id === 'demo:amethyst_rod'
          ? { ...entry, data: { display_name: 'Wand', creative_tab: 'demo:gems' } }
          : entry,
      ),
    );
    expect(tabMembers(renamed, TAB, 'as_listed').map((entry) => entry.name)).toEqual([
      'Wand',
      'Ruby',
    ]);
    expect(tabMembers(renamed, TAB, 'by_name').map((entry) => entry.name)).toEqual([
      'Ruby',
      'Wand',
    ]);
    expect(tabNonMembers(project, TAB).map((entry) => entry.elementId)).toEqual([
      'demo:hammer',
      'demo:ruby_block',
      'demo:sprite',
    ]);
    expect(Object.values(TAB_ORDER_LABELS).join(' ')).not.toMatch(/_/);
  });

  it('writes the field at each kind’s own path, and clears it without leftovers', () => {
    const project = projectOf(elements());
    const items = tabMembershipItems(
      project,
      ['demo:ruby_block', 'demo:sprite', 'demo:ruby', 'demo:stone_door'],
      TAB,
    );
    // The ruby is already there and the door has no item: two updates.
    expect(items.map((item) => [item.elementId, item.after])).toEqual([
      ['demo:ruby_block', { display_name: 'Block of ruby', item: { creative_tab: 'demo:gems' } }],
      ['demo:sprite', { display_name: 'Sprite', spawn_egg: { creative_tab: 'demo:gems' } }],
    ]);
    expect(items.every((item) => item.op === 'update' && item.before !== undefined)).toBe(true);
    const joined = projectOf(
      elements().map((entry) => {
        const item = items.find((candidate) => candidate.elementId === entry.id);
        return item === undefined ? entry : { ...entry, data: item.after as Json };
      }),
    );
    const out = tabMembershipItems(joined, ['demo:ruby_block', 'demo:sprite'], undefined);
    expect(out.map((item) => item.after)).toEqual([
      { display_name: 'Block of ruby' },
      { display_name: 'Sprite' },
    ]);
  });
});

describe('Creative Tab Studio', () => {
  it('shows the title, icon, order and the members', async () => {
    await renderOnStack();
    expect((screen.getByTestId('creative-tab-title') as HTMLInputElement).value).toBe('Gems');
    expect(screen.getByTestId('creative-tab-preview-title').textContent).toBe('Gems');
    expect(screen.getByTestId('creative-tab-preview-icon').textContent).toBe('Icon: Ruby');
    const order = screen.getByTestId('creative-tab-order') as HTMLSelectElement;
    expect(order.selectedOptions[0]?.textContent).toBe('In the order the mod adds them');
    expect(memberIds()).toEqual(['demo:amethyst_rod', 'demo:ruby']);
    const pick = screen.getByTestId('creative-tab-add-pick') as HTMLSelectElement;
    expect([...pick.options].map((option) => option.textContent)).toEqual([
      '(choose a thing)',
      'Hammer (now in Tools)',
      'Block of ruby',
      'Sprite spawn egg',
    ]);
  });

  it('reorders the list by name through the order field', async () => {
    const { stack } = await renderOnStack();
    act(() => {
      fireEvent.change(screen.getByTestId('creative-tab-order'), {
        target: { value: 'by_name' },
      });
    });
    expect(memberIds()).toEqual(['demo:ruby', 'demo:amethyst_rod']);
    expect(orderOf(stack)).toBe('by_name');
    act(() => stack.undo());
    expect(orderOf(stack)).toBeUndefined();
    expect(memberIds()).toEqual(['demo:amethyst_rod', 'demo:ruby']);
  });

  it('adds a thing from another tab and takes one out, each one undo step', async () => {
    const { stack, applyChanges, tabOf } = await renderOnStack();
    act(() => {
      fireEvent.change(screen.getByTestId('creative-tab-add-pick'), {
        target: { value: 'demo:hammer' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('creative-tab-add'));
    });
    expect(applyChanges).toHaveBeenCalledTimes(1);
    expect(tabOf('demo:hammer')).toBe('demo:gems');
    expect(memberIds()).toEqual(['demo:amethyst_rod', 'demo:hammer', 'demo:ruby']);
    await act(async () => {
      fireEvent.click(screen.getByTestId('creative-tab-remove-demo:ruby'));
    });
    expect(tabOf('demo:ruby')).toBeUndefined();
    act(() => stack.undo());
    expect(tabOf('demo:ruby')).toBe('demo:gems');
    act(() => stack.undo());
    expect(tabOf('demo:hammer')).toBe(OTHER_TAB);
    expect(stack.canUndo).toBe(false);
  });

  it('adds everything without a tab in one undo step', async () => {
    const { stack, applyChanges, tabOf } = await renderOnStack();
    expect(screen.getByTestId('creative-tab-add-loose').textContent).toContain('(2)');
    await act(async () => {
      fireEvent.click(screen.getByTestId('creative-tab-add-loose'));
    });
    expect(applyChanges).toHaveBeenCalledTimes(1);
    expect(applyChanges.mock.calls[0]?.[0]).toHaveLength(2);
    expect(applyChanges.mock.calls[0]?.[1]).toBe('Add 2 things to the tab');
    expect(tabOf('demo:ruby_block')).toBe('demo:gems');
    expect(tabOf('demo:sprite')).toBe('demo:gems');
    act(() => stack.undo());
    expect(tabOf('demo:ruby_block')).toBeUndefined();
    expect(tabOf('demo:sprite')).toBeUndefined();
    expect(stack.canUndo).toBe(false);
  });

  it('without a host lists the members read-only', async () => {
    await renderOnStack(false);
    expect(memberIds()).toEqual(['demo:amethyst_rod', 'demo:ruby']);
    expect(screen.getByTestId('creative-tab-read-only')).toBeTruthy();
    expect(screen.queryByTestId('creative-tab-add')).toBeNull();
  });
});
