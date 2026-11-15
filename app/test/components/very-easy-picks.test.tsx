// @vitest-environment happy-dom
/**
 * Very easy picks (B460, ADR 0101 D4): "Make a block" offers Lights, Bed, Cake, Sign, Bush with
 * berries and Ages like copper, "Make an item" offers A bag that holds things, in plain words
 * with no ids; each opens a Creator flow, a flow the library does not have is not shown, and
 * the Creator's picker shows the pick's words on that flow's card only when opened from the
 * tile.
 */
import type { Project } from '@msm/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorDialog } from '../../src/renderer/src/components/creator/CreatorDialog';
import { MAKE_TILES, shownTiles } from '../../src/renderer/src/components/home/tiles';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import {
  MAKE_BLOCK_PICKS,
  MAKE_ITEM_PICKS,
  type VeryEasyPick,
  veryEasyPickOf,
} from '../../src/renderer/src/studios/very-easy';
import { aiSession } from './ai-fixtures';

afterEach(cleanup);

const tile = (id: string) => MAKE_TILES.find((entry) => entry.id === id);

function renderPicker(
  session: ProjectSession,
  flowIds: readonly string[],
  picks?: readonly VeryEasyPick[],
) {
  render(
    <CreatorDialog
      session={session}
      project={session.snapshot.project as Project}
      namespaces={['demo']}
      edit={null}
      flowIds={flowIds}
      {...(picks === undefined ? {} : { picks })}
      folders={session.target.folders.resource}
      readProjectAsset={(namespace, path) => session.readAsset(namespace, path).catch(() => null)}
      vanilla={null}
      onClose={vi.fn()}
      onCreated={vi.fn()}
      newSetId={() => 'set-1'}
      webgl={false}
      debounceMs={5}
    />,
  );
}

describe('Very easy picks (ADR 0101 D4)', () => {
  it('names the new kinds of block and item in plain words, with no ids', () => {
    expect(MAKE_BLOCK_PICKS.map((pick) => pick.label)).toEqual([
      'Lights',
      'Bed',
      'Cake',
      'Sign',
      'Bush with berries',
      'Ages like copper',
    ]);
    expect(MAKE_ITEM_PICKS.map((pick) => pick.label)).toEqual(['A bag that holds things']);
    for (const pick of [...MAKE_BLOCK_PICKS, ...MAKE_ITEM_PICKS]) {
      expect(`${pick.label} ${pick.sentence}`, pick.id).not.toMatch(/[a-z]+[:_/][a-z]/);
      expect(pick.sentence, pick.id).toMatch(/^[A-Z].*\.$/);
    }
    expect(MAKE_BLOCK_PICKS.find((pick) => pick.id === 'lights')?.sentence).toBe(
      'Torches, lanterns, chains and candles.',
    );
    expect(MAKE_ITEM_PICKS[0]?.sentence).toBe('Opens when you right-click it.');
    expect(veryEasyPickOf('wood-set')?.label).toBe('Sign');
    expect(veryEasyPickOf('simple-block')).toBeUndefined();
  });

  it('feeds the Make a block and Make an item tiles', () => {
    const block = tile('block');
    expect(block?.action).toEqual({
      type: 'flows',
      flowIds: [
        'simple-block',
        'custom_ore',
        'stone-set',
        'lights',
        'bed',
        'cake',
        'wood-set',
        'crop',
        'copper-set',
      ],
      picks: MAKE_BLOCK_PICKS,
    });
    expect(tile('item')?.action).toEqual({
      type: 'flows',
      flowIds: ['throwable', 'totem', 'backpack'],
      picks: MAKE_ITEM_PICKS,
    });
    for (const id of ['block', 'item']) {
      const words = `${tile(id)?.label} ${tile(id)?.sentence}`;
      expect(words).not.toMatch(/[a-z]+[:_-][a-z]/);
    }
  });

  it('hides the picks whose flows the library does not offer', () => {
    const missing = new Set(['lights', 'bed', 'cake', 'copper-set', 'backpack']);
    const shown = shownTiles({ flowAvailable: (id) => !missing.has(id), rules: true, ai: true });
    expect(shown.find((entry) => entry.tile.id === 'block')?.flowIds).toEqual([
      'simple-block',
      'custom_ore',
      'stone-set',
      'wood-set',
      'crop',
    ]);
    expect(shown.find((entry) => entry.tile.id === 'item')?.flowIds).toEqual([
      'throwable',
      'totem',
    ]);
  });

  it('shows the pick words on the flow cards when the tile opens the Creator', async () => {
    const { session } = await aiSession();
    const flowIds = ['simple-block', 'wood-set', 'crop'];
    renderPicker(session, flowIds, MAKE_BLOCK_PICKS);
    const sign = screen.getByTestId('creator-flow-wood-set');
    expect(within(sign).getByText('Sign')).toBeTruthy();
    expect(sign.textContent).toContain('Write on it.');
    expect(screen.getByTestId('creator-flow-crop').textContent).toContain('Bush with berries');
    // A flow without a pick keeps its own words.
    expect(screen.getByTestId('creator-flow-simple-block').textContent).not.toContain('Sign');
    cleanup();
    renderPicker(session, flowIds);
    expect(screen.getByTestId('creator-flow-wood-set').textContent).not.toContain('Sign');
  });
});
