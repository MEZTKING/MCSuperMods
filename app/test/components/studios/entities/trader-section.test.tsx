// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B480 (ADR 0098 D1, D3, D4, ADR 0101 D1): the trade editor's model (price, second price,
 * product, uses, XP, level; ADR 0060's trade, tag and trade set elements), and the Mob Studio's
 * Trader, Storage and Shoulder sections rendered through `ElementForm` over a command stack,
 * with the host's `applyChanges` as one undo step.
 */
import type { CommandStack, Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { planChangeItems } from '../../../../src/renderer/src/changeset/changeset';
import { usePreferences } from '../../../../src/renderer/src/store/preferences';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import { shoulderNeeds } from '../../../../src/renderer/src/studios/entities/ShoulderSection';
import { storageRowWords } from '../../../../src/renderer/src/studios/entities/StorageSection';
import { tradeWords } from '../../../../src/renderer/src/studios/entities/TradeEditor';
import {
  addTradeChange,
  levelCountChange,
  levelTradeIds,
  newTradeDraft,
  professionLevelLayout,
  removeTradeChange,
  type TradeDraft,
  tradeData,
  tradeDraftOf,
  tradeDraftProblem,
  traderLevelLayout,
  traderOnChange,
  tradeSetWords,
  updateTradeChange,
} from '../../../../src/renderer/src/studios/entities/trade-model';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { MOB_VERY_EASY_SECTIONS } from '../../../../src/renderer/src/studios/very-easy';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { projectOf, renderOnStack, schemaState } from '../blocks-items/harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(cleanup);

const MOB_ID = 'demo:merchant' as ResourceLocation;
const mob = (components: Record<string, Json> = {}, extra: Record<string, Json> = {}): Element =>
  element(MOB_ID, 'msm:entity', {
    format: 1,
    category: 'creature',
    size: { width: 0.6, height: 1.9 },
    display_name: 'Merchant',
    components: {
      'msm:animated_model': { model: 'demo:entity/merchant', texture: 'demo:entity/merchant' },
      ...components,
    },
    ...extra,
  });

const SELLS_BREAD: TradeDraft = {
  price: { item: 'minecraft:emerald', count: 3 },
  product: { item: 'minecraft:bread', count: 6 },
  uses: 8,
  xp: 5,
};

const dataOf = (stack: CommandStack, id: string) =>
  stack.state.namespaces[0]?.elements.find((entry) => entry.id === id)?.data as
    | { [key: string]: Json }
    | undefined;
const ids = (stack: CommandStack) =>
  stack.state.namespaces[0]?.elements.map((entry) => entry.id).sort() ?? [];

function withHost(subject: Element, others: Element[] = []) {
  let current: CommandStack | undefined;
  const host: BlocksItemsStudioHost = {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    applyChanges: async (items, label) => {
      const stack = current as CommandStack;
      const plan = planChangeItems(stack.state, items);
      if (plan.skipped.length > 0) throw new Error('changed');
      stack.execute({
        id: 'test.apply',
        label,
        apply(draft) {
          for (const part of plan.commands) part.apply(draft);
        },
      });
    },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BlocksItemsStudioHostContext.Provider value={host}>
      {children}
    </BlocksItemsStudioHostContext.Provider>
  );
  const rendered = renderOnStack(subject, schema, { wrapper, others });
  current = rendered.stack;
  return rendered;
}

/** Types into an id field and commits it. */
function commitId(testId: string, value: string) {
  const input = screen.getByTestId(testId);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('trade model', () => {
  it('writes price, second price, product, uses and XP as a villager trade', () => {
    expect(tradeData(SELLS_BREAD)).toEqual({
      wants: { id: 'minecraft:emerald', count: 3 },
      gives: { id: 'minecraft:bread', count: 6 },
      max_uses: 8,
      xp: 5,
      reputation_discount: 0.05,
    });
    const withSecond = tradeData({ ...SELLS_BREAD, second: { item: 'book', count: 1 } });
    expect(withSecond.additional_wants).toEqual({ id: 'minecraft:book', count: 1 });
    expect(tradeDraftOf(withSecond)).toEqual({
      ...SELLS_BREAD,
      second: { item: 'minecraft:book', count: 1 },
    });
    // Fields the editor does not show are kept; an empty second price is dropped.
    const before = { ...withSecond, merchant_predicate: { condition: 'minecraft:random_chance' } };
    const after = tradeData({ ...SELLS_BREAD, second: { item: '', count: 1 }, xp: 1 }, before);
    expect(after.merchant_predicate).toEqual({ condition: 'minecraft:random_chance' });
    expect(after.additional_wants).toBeUndefined();
    expect(after.xp).toBe(1);
  });

  it('says what a trade still needs', () => {
    expect(tradeDraftProblem(newTradeDraft())).toBe('Pick what the trade gives.');
    expect(tradeDraftProblem(SELLS_BREAD)).toBeUndefined();
    expect(tradeDraftProblem({ ...SELLS_BREAD, uses: 0 })).toMatch(/at least once/);
    expect(tradeDraftProblem({ ...SELLS_BREAD, xp: -1 })).toMatch(/XP/);
  });

  it('adds a trade with its tag and trade set, and removes it again', () => {
    const project = projectOf(mob());
    const layout = traderLevelLayout(MOB_ID, 2);
    expect(layout).toEqual({
      level: 2,
      tagId: 'demo:merchant/level_2_trades',
      setId: 'demo:merchant/level_2',
    });
    const { items, tradeId } = addTradeChange(project, layout, SELLS_BREAD);
    expect(tradeId).toBe('demo:merchant/level_2/emerald_bread');
    expect(items.map((item) => [item.op, item.kind, item.elementId])).toEqual([
      ['create', 'minecraft:villager_trade', tradeId],
      ['create', 'minecraft:tag/villager_trade', 'demo:merchant/level_2_trades'],
      ['create', 'minecraft:trade_set', 'demo:merchant/level_2'],
    ]);
    expect(items[2]?.after).toEqual({ trades: '#demo:merchant/level_2_trades', amount: 1 });
    const one = planChangeItems(project, items).state;
    // A second trade with the same items gets its own id, and the set draws both.
    const second = addTradeChange(one, layout, SELLS_BREAD);
    expect(second.tradeId).toBe('demo:merchant/level_2/emerald_bread_2');
    const two = planChangeItems(one, second.items).state;
    expect(levelTradeIds(two, layout)).toEqual([tradeId, second.tradeId]);
    const set = two.namespaces[0]?.elements.find((entry) => entry.id === layout.setId);
    expect(set?.data).toEqual({ trades: '#demo:merchant/level_2_trades', amount: 2 });
    // Changing a trade updates only that trade.
    const change = updateTradeChange(two, tradeId, { ...SELLS_BREAD, uses: 3 });
    expect(change).toHaveLength(1);
    expect(change[0]?.after).toMatchObject({ max_uses: 3 });
    // Removing: out of the tag, deleted, and the set draws one again.
    const removed = planChangeItems(two, removeTradeChange(two, layout, tradeId)).state;
    expect(levelTradeIds(removed, layout)).toEqual([second.tradeId]);
    expect(removed.namespaces[0]?.elements.some((entry) => entry.id === tradeId)).toBe(false);
    expect(
      removed.namespaces[0]?.elements.find((entry) => entry.id === layout.setId)?.data,
    ).toEqual({ trades: '#demo:merchant/level_2_trades', amount: 1 });
  });

  it("writes only the level tag for a profession's own trade sets", () => {
    const layout = professionLevelLayout('demo:smith', 3);
    const { items, tradeId } = addTradeChange(projectOf(), layout, SELLS_BREAD);
    expect(tradeId).toBe('demo:smith/level_3/emerald_bread');
    expect(items.map((item) => item.elementId)).toEqual([tradeId, 'demo:smith/level_3']);
    expect(items[1]?.after).toEqual({ values: [tradeId] });
  });

  it('switches a trader on and changes its number of levels in one step each', () => {
    const project = projectOf(mob());
    const on = traderOnChange(project, mob());
    expect(on.map((item) => item.elementId)).toEqual([
      MOB_ID,
      'demo:merchant/level_1_trades',
      'demo:merchant/level_1',
    ]);
    const state = planChangeItems(project, on).state;
    const trader = state.namespaces[0]?.elements.find((entry) => entry.id === MOB_ID) as Element;
    const three = levelCountChange(state, trader, 3);
    expect(three[0]?.after).toMatchObject({
      components: {
        'msm:trader': {
          trade_sets: [
            { trade_set: 'demo:merchant/level_1' },
            { trade_set: 'demo:merchant/level_2' },
            { trade_set: 'demo:merchant/level_3' },
          ],
        },
      },
    });
    expect(three).toHaveLength(5);
  });

  it('words trades and trade sets plainly', () => {
    const project = projectOf(mob());
    expect(
      tradeWords(project, { ...SELLS_BREAD, second: { item: 'minecraft:book', count: 1 } }),
    ).toBe('3 Emerald and 1 Book for 6 Bread (8 uses, 5 XP)');
    expect(tradeSetWords('minecraft:mason/level_3')).toBe('Mason, level 3');
    expect(tradeSetWords('minecraft:wandering_trader/common')).toBe('Wandering trader, common');
  });
});

describe('Trader section', () => {
  it('switches trading on as one undo step and adds a trade from the form', async () => {
    const { stack, data } = withHost(mob());
    fireEvent.click(await screen.findByTestId('entity-trader-on'));
    await waitFor(() => expect(ids(stack)).toContain('demo:merchant/level_1'));
    expect(ids(stack)).toContain('demo:merchant/level_1_trades');
    expect((data() as { components: Record<string, Json> }).components['msm:trader']).toEqual({
      trade_sets: [{ trade_set: 'demo:merchant/level_1' }],
    });

    // Price, product, uses and XP.
    commitId('trade-price-item', 'minecraft:emerald');
    fireEvent.change(screen.getByTestId('trade-price-count'), { target: { value: '3' } });
    commitId('trade-product-item', 'bread');
    fireEvent.change(screen.getByTestId('trade-product-count'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('trade-uses'), { target: { value: '8' } });
    fireEvent.change(screen.getByTestId('trade-xp'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('trade-second-on'));
    commitId('trade-second-item', 'minecraft:book');
    fireEvent.click(screen.getByTestId('trade-add'));
    const tradeId = 'demo:merchant/level_1/emerald_bread';
    await waitFor(() => expect(dataOf(stack, tradeId)).toBeDefined());
    expect(dataOf(stack, tradeId)).toEqual({
      wants: { id: 'minecraft:emerald', count: 3 },
      additional_wants: { id: 'minecraft:book', count: 1 },
      gives: { id: 'minecraft:bread', count: 6 },
      max_uses: 8,
      xp: 5,
      reputation_discount: 0.05,
    });
    expect(dataOf(stack, 'demo:merchant/level_1_trades')).toEqual({ values: [tradeId] });
    const row = await screen.findByTestId(`entity-trader-trades-row-${tradeId}`);
    expect(row.textContent).toContain('3 Emerald and 1 Book for 6 Bread (8 uses, 5 XP)');

    // One undo removes the trade again.
    stack.undo();
    expect(dataOf(stack, tradeId)).toBeUndefined();
    expect(dataOf(stack, 'demo:merchant/level_1_trades')).toEqual({ values: [] });
    stack.redo();

    // Change the trade's uses.
    fireEvent.click(screen.getByTestId(`entity-trader-trades-change-${tradeId}`));
    fireEvent.change(screen.getByTestId('trade-uses'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('trade-save'));
    await waitFor(() => expect(dataOf(stack, tradeId)?.max_uses).toBe(2));

    // Remove it.
    fireEvent.click(screen.getByTestId(`entity-trader-trades-remove-${tradeId}`));
    await waitFor(() => expect(dataOf(stack, tradeId)).toBeUndefined());
    expect(screen.getByTestId('entity-trader-trades-empty')).toBeTruthy();
  });

  it('adds levels and borrows a villager trade set for one', async () => {
    const { stack, data } = withHost(
      mob({ 'msm:trader': { trade_sets: [{ trade_set: 'demo:merchant/level_1' }] } }),
    );
    fireEvent.change(await screen.findByTestId('entity-trader-levels'), {
      target: { value: '2' },
    });
    await waitFor(() => expect(ids(stack)).toContain('demo:merchant/level_2'));
    fireEvent.click(screen.getByTestId('entity-trader-level-2'));
    expect(screen.getByTestId('entity-trader-level-title').textContent).toBe(
      'Apprentice (level 2)',
    );
    const source = screen.getByTestId('entity-trader-source') as HTMLSelectElement;
    expect(within(source).getByText('A villager: Mason, level 3')).toBeTruthy();
    fireEvent.change(source, { target: { value: 'minecraft:mason/level_3' } });
    await waitFor(() =>
      expect(
        (data() as { components: { 'msm:trader': { trade_sets: Json[] } } }).components[
          'msm:trader'
        ].trade_sets,
      ).toEqual([{ trade_set: 'demo:merchant/level_1' }, { trade_set: 'minecraft:mason/level_3' }]),
    );
    expect(screen.getByTestId('entity-trader-borrowed').textContent).toContain('Mason, level 3');
    // XP to the next level is set on level 1 only (the last level has none).
    expect(screen.queryByTestId('entity-trader-xp-to-next')).toBeNull();
    fireEvent.click(screen.getByTestId('entity-trader-level-1'));
    fireEvent.change(screen.getByTestId('entity-trader-xp-to-next'), { target: { value: '20' } });
    expect(
      (data() as { components: { 'msm:trader': { trade_sets: { xp_to_next?: number }[] } } })
        .components['msm:trader'].trade_sets[0]?.xp_to_next,
    ).toBe(20);
  });

  it('notes that a monster does not trade at night', async () => {
    withHost(
      mob(
        { 'msm:trader': { trade_sets: [{ trade_set: 'minecraft:mason/level_1' }] } },
        { base: 'monster' },
      ),
    );
    expect(await screen.findByTestId('entity-trader-monster')).toBeTruthy();
  });
});

describe('Storage and Shoulder sections', () => {
  it('edits the storage rows and the chest switch', async () => {
    const { data } = withHost(mob());
    fireEvent.click(await screen.findByTestId('entity-storage-on'));
    const storage = () =>
      (data() as { components: Record<string, Json> }).components['msm:storage'];
    expect(storage()).toEqual({});
    fireEvent.change(screen.getByTestId('entity-storage-rows'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('entity-storage-needs-chest'));
    expect(storage()).toEqual({ rows: 6, needs_chest: true });
    fireEvent.change(screen.getByTestId('entity-storage-rows'), { target: { value: '3' } });
    expect(storage()).toEqual({ needs_chest: true });
    expect(storageRowWords(1)).toBe('1 row (9 slots)');
    expect(screen.getByTestId('entity-storage-how').textContent).toContain('anyone');
  });

  it('switches the shoulder pet on and says what it still needs', async () => {
    const { data } = withHost(mob());
    fireEvent.click(await screen.findByTestId('entity-shoulder-on'));
    expect(
      (data() as { components: Record<string, Json> }).components['msm:shoulder_riding'],
    ).toEqual({});
    expect(screen.getByTestId('entity-shoulder-needs').textContent).toContain('animal');
    expect(
      shoulderNeeds({
        base: 'animal',
        size: { width: 0.5, height: 0.5 },
        components: { 'msm:tameable': {} },
      }),
    ).toEqual([]);
    expect(shoulderNeeds({ base: 'animal', size: { width: 0.9 } })).toEqual([
      'It must be tameable (switch on Taming).',
      'It is 0.9 blocks wide; a shoulder pet is at most 0.7.',
    ]);
  });
});

describe('Very easy', () => {
  it('shows the Trader, Storage and Shoulder sections and hides the rest of the advanced ones', async () => {
    expect(MOB_VERY_EASY_SECTIONS).toEqual(
      expect.arrayContaining(['entity-trader', 'entity-storage', 'entity-shoulder']),
    );
    const before = usePreferences.getState().mode;
    usePreferences.setState({ mode: 'very-easy' as never });
    try {
      withHost(mob());
      expect(await screen.findByTestId('entity-trader')).toBeTruthy();
      expect(screen.getByTestId('entity-storage')).toBeTruthy();
      expect(screen.getByTestId('entity-shoulder')).toBeTruthy();
      expect(screen.getByTestId('entity-trader-on')).toBeTruthy();
      expect(screen.queryByTestId('entity-variants')).toBeNull();
    } finally {
      usePreferences.setState({ mode: before });
    }
  });
});
