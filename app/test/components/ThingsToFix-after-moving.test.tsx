// @vitest-environment happy-dom
/**
 * Things to fix's After moving group and note slot (ADR 0136 D5, D6; B818): the open items of
 * the newest saved move in plain words with Show me, Fix it, Ask the helper, the hint and Done
 * for items with no check of their own; their problems not repeated below; **What changed when
 * I moved**; and one note above everything.
 */
import type { Element, Problem, Project, UpgradeTodoItem } from '@msm/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AfterMovingGroup,
  ThingsToFix,
  WHAT_CHANGED_WHEN_I_MOVED,
} from '../../src/renderer/src/components/ThingsToFix';
import { expectPlain } from './plain-sweep';

afterEach(cleanup);

const element = (id: string, kind: string, data: Element['data']): Element => ({
  id: id as Element['id'],
  kind,
  formatVersion: 1,
  data,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

const PROJECT: Project = {
  formatVersion: 1,
  name: 'Caves',
  targets: ['mc-26.4'],
  plugins: [],
  settings: {},
  namespaces: [
    {
      name: 'caves',
      elements: [
        element('caves:big_drip', 'minecraft:worldgen/configured_feature', {
          type: 'minecraft:large_dripstone',
        }),
        element('caves:spark', 'msm:entity', { display_name: 'Spark' }),
      ],
      assets: [],
    },
  ],
};

const removed: Problem = {
  severity: 'error',
  code: 'target.removed-id',
  message: 'minecraft:large_dripstone is not in Minecraft 26.4.',
  elementId: 'caves:big_drip' as Problem['elementId'] & string,
  path: '/type',
};
const unknownKey: Problem = {
  severity: 'warning',
  code: 'schema.unknown-key',
  message: 'Unknown key "equip_sound".',
  elementId: 'caves:spark' as Problem['elementId'] & string,
  path: '/equip_sound',
};

const ITEMS: UpgradeTodoItem[] = [
  {
    id: 'todo:a',
    source: 'migration',
    problem: removed,
    changeId: 'ids:worldgen/feature_type/large_dripstone',
    targetId: 'mc-26.4',
    hint: 'use minecraft:large_speleothem and add its required base_block (for example minecraft:dripstone_block)',
    check: 'value',
    value: 'minecraft:large_dripstone',
  },
  { id: 'todo:b', source: 'validation', problem: unknownKey, check: 'manual' },
];

const GROUP: AfterMovingGroup = { folder: '.msm/upgrades/x', mcVersion: '26.4', items: ITEMS };

describe('ThingsToFix: After moving to Minecraft X', () => {
  it('lists the open items in plain words, each once, with Show me, Ask, the hint and Done', async () => {
    const onShow = vi.fn();
    const onAsk = vi.fn();
    const onTick = vi.fn();
    const onOpen = vi.fn();
    render(
      <ThingsToFix
        project={PROJECT}
        problems={[removed, unknownKey]}
        afterMoving={GROUP}
        onShow={onShow}
        onAsk={onAsk}
        onTickUpgradeItem={onTick}
        onOpenMoveReport={onOpen}
      />,
    );
    const root = screen.getByTestId('things-to-fix');
    expect(root.textContent).toContain('Things to fix (2)');
    const group = screen.getByTestId('things-to-fix-after-moving');
    expect(screen.getByTestId('things-to-fix-after-moving-title').textContent).toBe(
      'After moving to Minecraft 26.4 (2)',
    );
    expect(screen.getByTestId('things-to-fix-after-moving-0-text').textContent).toBe(
      'Big drip uses something Minecraft 26.4 no longer has.',
    );
    expect(screen.getByTestId('things-to-fix-after-moving-0-hint').textContent).toBe(
      'How: Use large speleothem and add its required base block (for example dripstone block).',
    );
    expect(screen.getByTestId('things-to-fix-after-moving-1-text').textContent).toBe(
      'Something in Spark may need changing for Minecraft 26.4.',
    );
    // The group's problems are not repeated in the lists below it.
    expect(screen.queryByTestId('things-to-fix-0')).toBeNull();
    expect(screen.queryByTestId('things-to-fix-tips')).toBeNull();
    expect(screen.queryByTestId('things-to-fix-none')).toBeNull();
    expectPlain(root);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('things-to-fix-after-moving-0-show'));
    expect(onShow).toHaveBeenCalledWith(removed);
    await user.click(screen.getByTestId('things-to-fix-after-moving-1-ask'));
    expect(onAsk).toHaveBeenCalledWith(unknownKey);
    // Only the item with no check of its own has Done.
    expect(screen.queryByTestId('things-to-fix-after-moving-0-done')).toBeNull();
    await user.click(screen.getByTestId('things-to-fix-after-moving-1-done'));
    expect(onTick).toHaveBeenCalledWith('.msm/upgrades/x', 'todo:b', true);
    await user.click(within(group).getByText(WHAT_CHANGED_WHEN_I_MOVED));
    expect(onOpen).toHaveBeenCalledWith('.msm/upgrades/x');
  });

  it('shows no group without open items, and the note above everything', () => {
    render(
      <ThingsToFix
        project={PROJECT}
        problems={[]}
        afterMoving={{ ...GROUP, items: [] }}
        onShow={vi.fn()}
        note={<p data-testid="a-note">Minecraft 26.5 is ready for this mod.</p>}
      />,
    );
    expect(screen.queryByTestId('things-to-fix-after-moving')).toBeNull();
    expect(screen.getByTestId('things-to-fix').textContent).toContain('Nothing to fix');
    expect(screen.getByTestId('things-to-fix-none')).toBeTruthy();
    expect(within(screen.getByTestId('things-to-fix-note')).getByTestId('a-note')).toBeTruthy();
  });
});
