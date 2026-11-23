// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B538 (ADR 0107 D1–D3, ADR 0109 D1–D4, ADR 0112 D1): the Mob Studio's Bucket and Habits
 * sections, the hover and phase movement modes with the hover height, both shoulders, and the
 * Trader section's reputation, demand and work site, rendered through `ElementForm` over a
 * command stack; the Very easy list.
 */
import type { CommandStack, Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { planChangeItems } from '../../../../src/renderer/src/changeset/changeset';
import { usePreferences } from '../../../../src/renderer/src/store/preferences';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import { bucketNameFallback } from '../../../../src/renderer/src/studios/entities/BucketSection';
import {
  HABITS,
  habitNeeds,
  withHabit,
} from '../../../../src/renderer/src/studios/entities/HabitsSection';
import { MOVEMENT_MODES } from '../../../../src/renderer/src/studios/entities/mob-kinds';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { MOB_COMMON_SECTIONS } from '../../../../src/renderer/src/studios/plain';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { renderOnStack, schemaState } from '../blocks-items/harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
});
afterEach(cleanup);

const MOB_ID = 'demo:glowfin' as ResourceLocation;
const mob = (components: Record<string, Json> = {}, extra: Record<string, Json> = {}): Element =>
  element(MOB_ID, 'msm:entity', {
    format: 1,
    category: 'creature',
    size: { width: 0.5, height: 0.5 },
    display_name: 'Glowfin',
    components: {
      'msm:animated_model': { model: 'demo:entity/glowfin', texture: 'demo:entity/glowfin' },
      ...components,
    },
    ...extra,
  });

type Data = { components: Record<string, Json | undefined>; [key: string]: unknown };

function withHost(subject: Element) {
  let current: CommandStack | undefined;
  const host: BlocksItemsStudioHost = {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    applyChanges: async (items, label) => {
      const stack = current as CommandStack;
      const plan = planChangeItems(stack.state, items);
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
  const rendered = renderOnStack(subject, schema, { wrapper });
  current = rendered.stack;
  return { stack: rendered.stack, data: () => rendered.data() as unknown as Data };
}

const goals = (data: Data) =>
  (
    (data.components['msm:ai_goals'] as { goals?: { type: string }[] } | undefined)?.goals ?? []
  ).map((goal) => goal.type);

describe('Bucket section', () => {
  it('switches the bucket on and off as one undo step and says when the mob does not swim', () => {
    const { stack, data } = withHost(mob({ 'msm:movement': { mode: 'swim' } }));
    fireEvent.click(screen.getByTestId('entity-bucket-on'));
    expect(data().components['msm:bucketable']).toEqual({});
    expect(screen.queryByTestId('entity-bucket-needs-swim')).toBeNull();
    expect(screen.getByTestId('entity-bucket-how').textContent).toContain('water bucket');
    fireEvent.click(screen.getByTestId('entity-bucket-water'));
    expect(data().components['msm:bucketable']).toEqual({ water: false });
    expect(screen.getByTestId('entity-bucket-how').textContent).toContain('empty bucket');
    fireEvent.change(screen.getByTestId('entity-bucket-name'), {
      target: { value: 'Jar of Glowfin' },
    });
    expect(data().bucket_display_name).toBe('Jar of Glowfin');
    act(() => stack.undo());
    act(() => stack.undo());
    act(() => stack.undo());
    expect(data().components['msm:bucketable']).toBeUndefined();
    expect(bucketNameFallback({ display_name: 'Cod' })).toBe('Bucket of Cod');
  });

  it('warns a walking mob that only swimmers fit in a bucket', () => {
    withHost(mob({ 'msm:bucketable': {} }));
    expect(screen.getByTestId('entity-bucket-needs-swim').textContent).toContain('swims');
  });
});

describe('Movement and Shoulder', () => {
  it('offers hovering and flying through walls, with the hover height for hovering', () => {
    expect(MOVEMENT_MODES).toEqual(['walk', 'fly', 'swim', 'amphibious', 'hover', 'phase']);
    const { data } = withHost(mob());
    const picker = screen.getByTestId('entity-movement-mode') as HTMLSelectElement;
    expect([...picker.options].map((option) => option.textContent)).toContain(
      'Flies through walls while charging',
    );
    fireEvent.change(picker, { target: { value: 'hover' } });
    expect(data().components['msm:movement']).toEqual({ mode: 'hover' });
    fireEvent.change(screen.getByTestId('entity-hover-height'), { target: { value: '6' } });
    expect(data().components['msm:movement']).toEqual({ mode: 'hover', hover_height: 6 });
    expect(screen.getByTestId('entity-movement-note').textContent).toContain('ghast');
    fireEvent.change(picker, { target: { value: 'phase' } });
    expect(screen.queryByTestId('entity-hover-height')).toBeNull();
    expect(screen.getByTestId('entity-movement-note').textContent).toContain('vex');
  });

  it('picks the shoulder a pet takes, by the player’s view', () => {
    const { data } = withHost(mob({ 'msm:shoulder_riding': {} }, { base: 'animal' }));
    const side = screen.getByTestId('entity-shoulder-side') as HTMLSelectElement;
    expect(side.value).toBe('either');
    fireEvent.change(side, { target: { value: 'left' } });
    expect(data().components['msm:shoulder_riding']).toEqual({ sides: 'left' });
    fireEvent.change(side, { target: { value: 'either' } });
    expect(data().components['msm:shoulder_riding']).toEqual({});
    expect(screen.getByTestId('entity-shoulder-how').textContent).toContain('two pets');
  });
});

describe('Habits section', () => {
  it('lists six habits as goals and starts each one valid enough to edit', () => {
    expect(HABITS.map((habit) => habit.label)).toEqual([
      'Swoops',
      'Roosts',
      'Collects items',
      'Digs up items',
      'Plays dead',
      'Barters',
    ]);
    const spec = HABITS[3] as (typeof HABITS)[number];
    expect(withHabit({}, spec, true)).toEqual([
      { type: 'dig_items', dig_blocks: ['minecraft:grass_block'] },
    ]);
    const restored = { type: 'dig_items', dig_blocks: ['minecraft:mud'], loot_table: 'demo:dig' };
    expect(withHabit({}, spec, true, restored)).toEqual([restored]);
    expect(habitNeeds({ components: {} }, 'swoop')).toHaveLength(2);
    expect(
      habitNeeds(
        { components: { 'msm:movement': { mode: 'hover' }, 'msm:attack': { damage: 2 } } },
        'swoop',
      ),
    ).toEqual([]);
  });

  it('switches a habit on, edits its fields, and switches it off again', () => {
    const { stack, data } = withHost(mob());
    fireEvent.click(screen.getByTestId('entity-habit-play_dead-on'));
    expect(goals(data())).toEqual(['play_dead']);
    fireEvent.change(screen.getByTestId('entity-habit-play_dead-ticks'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByTestId('entity-habit-play_dead-regenerates'));
    const goal = (data().components['msm:ai_goals'] as { goals: Json[] }).goals[0];
    expect(goal).toEqual({ type: 'play_dead', ticks: 100, regenerates: false });
    // The Behaviour list names it and sends its fields here.
    expect(screen.getByTestId('entity-goal-0').textContent).toContain('Plays dead');
    expect(screen.getByTestId('entity-goal-0').textContent).toContain('Habits section');
    fireEvent.click(screen.getByTestId('entity-habit-play_dead-on'));
    expect(goals(data())).toEqual([]);
    // Switching it on again restores the fields.
    fireEvent.click(screen.getByTestId('entity-habit-play_dead-on'));
    expect((data().components['msm:ai_goals'] as { goals: Json[] }).goals[0]).toEqual(goal);
    act(() => stack.undo());
    expect(goals(data())).toEqual([]);
  });

  it('says what swooping needs, and offers the dash only on a rideable mob', () => {
    const { data } = withHost(mob({ 'msm:rideable': {} }));
    fireEvent.click(screen.getByTestId('entity-habit-swoop-on'));
    expect(screen.getByTestId('entity-habit-swoop-needs').textContent).toContain('fly');
    fireEvent.click(screen.getByTestId('entity-habit-dash-on'));
    expect(data().components['msm:rideable']).toEqual({ dash: {} });
    fireEvent.change(screen.getByTestId('entity-dash-power'), { target: { value: '2' } });
    expect(data().components['msm:rideable']).toEqual({ dash: { power: 2 } });
    expect(screen.queryByTestId('entity-habit-dash-needs')).toBeNull();
  });

  it('hides the dash without riding', () => {
    withHost(mob());
    expect(screen.queryByTestId('entity-habit-dash')).toBeNull();
  });
});

describe('Trader section, batch 2', () => {
  it('remembers players, rises with demand and restocks at a work site', async () => {
    const { data } = withHost(
      mob({ 'msm:trader': { trade_sets: [{ trade_set: 'minecraft:mason/level_1' }] } }),
    );
    const trader = () => data().components['msm:trader'] as Record<string, Json>;
    fireEvent.click(await screen.findByTestId('entity-trader-reputation-on'));
    expect(trader().reputation).toEqual({});
    fireEvent.change(screen.getByTestId('entity-trader-reputation-hurt'), {
      target: { value: '40' },
    });
    expect(trader().reputation).toEqual({ hurt: 40 });
    const gift = screen.getByTestId('entity-trader-reputation-gift-item');
    fireEvent.change(gift, { target: { value: 'minecraft:poppy' } });
    fireEvent.blur(gift);
    expect(trader().reputation).toEqual({ hurt: 40, gift_item: 'minecraft:poppy' });
    fireEvent.click(screen.getByTestId('entity-trader-demand'));
    expect(trader().demand).toBe(false);
    const site = screen.getByTestId('entity-trader-work-site');
    fireEvent.change(site, { target: { value: 'minecraft:lectern' } });
    fireEvent.blur(site);
    expect(trader().work_site).toBe('minecraft:lectern');
    // Restocking never hides the work site.
    fireEvent.change(screen.getByTestId('entity-trader-restock'), { target: { value: 'never' } });
    expect(screen.queryByTestId('entity-trader-work-site')).toBeNull();
  });
});

describe('Very easy', () => {
  it('shows the Bucket and Habits sections', () => {
    expect(MOB_COMMON_SECTIONS).toEqual(
      expect.arrayContaining(['entity-bucket', 'entity-habits']),
    );
    const before = usePreferences.getState().mode;
    usePreferences.setState({ mode: 'very-easy' as never });
    try {
      withHost(mob());
      expect(screen.getByTestId('entity-bucket')).toBeTruthy();
      expect(screen.getByTestId('entity-habits')).toBeTruthy();
    } finally {
      usePreferences.setState({ mode: before });
    }
  });
});
