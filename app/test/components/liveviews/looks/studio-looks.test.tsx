// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B625's looks in the Studios' Preview sections (the plan's "Where" column): the Potion Studio's
 * bottles, the Effect Studio's frames and swirl and the Creative Tab Studio's page, each loaded
 * lazily and following an edit made in the Studio on a `CommandStack`.
 */

import { createElement, type Element, type Json, type ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { schemaIndex } from '../../forms/schemas';
import { renderOnStack, schemaState } from '../../studios/blocks-items/harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex(), {
    mob_effect: ['speed'],
    item: ['minecraft:diamond'],
  });
  // The looks are chunks of their own: load them once here, not inside a case's waitFor.
  await Promise.all([
    import('../../../../src/renderer/src/liveviews/looks/potion/PotionLook'),
    import('../../../../src/renderer/src/liveviews/looks/effect/EffectLook'),
    import('../../../../src/renderer/src/liveviews/looks/tab/CreativeTabView'),
    import('../../../../src/renderer/src/studios/blocks-items/CreativeTabStudio'),
  ]);
});
afterEach(cleanup);

const el = (id: string, kind: string, data: Json): Element =>
  createElement({ id: id as ResourceLocation, kind, data });

describe('the Potion Studio’s Preview', () => {
  it('draws the bottles in the colour of the effect the potion gives', async () => {
    const frost = el('demo:frost', 'msm:effect', {
      format: 1,
      category: 'harmful',
      color: 0x2244ff,
    });
    const heat = el('demo:heat', 'msm:effect', { format: 1, category: 'harmful', color: 0xff2200 });
    const potion = el('demo:chill', 'msm:potion', {
      format: 1,
      display_name: 'Chill',
      effects: [{ id: 'demo:frost', duration_ticks: 200 }],
    });
    renderOnStack(potion, schema, { others: [frost, heat] });
    await waitFor(() =>
      expect(screen.getByTestId('potion-look-potion').getAttribute('data-colour')).toBe('#2244ff'),
    );
    // The Studio keeps its own names and ids.
    expect(screen.getByTestId('potion-preview-names').textContent).toContain('Potion of Chill');
    const field = screen.getByTestId('potion-effect-0-id');
    fireEvent.change(field, { target: { value: 'demo:heat' } });
    fireEvent.blur(field);
    await waitFor(() =>
      expect(screen.getByTestId('potion-look-potion').getAttribute('data-colour')).toBe('#ff2200'),
    );
  });
});

describe('the Effect Studio’s Preview', () => {
  it('draws the frames and a swirl that follows the colour', async () => {
    const effect = el('demo:rush', 'msm:effect', {
      format: 1,
      category: 'beneficial',
      color: 0x123456,
    });
    renderOnStack(effect, schema);
    await waitFor(() =>
      expect(screen.getByTestId('effect-look-swirl').getAttribute('data-colour')).toBe('#123456'),
    );
    expect(screen.getByTestId('effect-look-hud')).toBeTruthy();
    expect(screen.getByTestId('effect-preview-name').textContent).toBe('Rush');
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: '#ff0000' } });
    await waitFor(() =>
      expect(screen.getByTestId('effect-look-swirl').getAttribute('data-colour')).toBe('#ff0000'),
    );
  });
});

describe('the Creative Tab Studio’s Preview', () => {
  it('draws the page in the hand order, which follows a move', async () => {
    const tab = el('demo:gems', 'msm:creative_tab', {
      format: 1,
      display_name: 'Gems',
      order: 'by_hand',
      items: ['demo:ruby', 'demo:opal'],
    });
    const others = [
      el('demo:opal', 'msm:item', { display_name: 'Opal', creative_tab: 'demo:gems' }),
      el('demo:ruby', 'msm:item', { display_name: 'Ruby', creative_tab: 'demo:gems' }),
    ];
    renderOnStack(tab, schema, { others });
    const names = () =>
      Array.from(document.querySelectorAll('[data-testid^="creative-tab-page-slot-"]')).map(
        (node) => node.getAttribute('data-name'),
      );
    await waitFor(() => expect(names()).toEqual(['Ruby', 'Opal']));
    fireEvent.click(await screen.findByTestId('creative-tab-hand-0-down'));
    await waitFor(() => expect(names()).toEqual(['Opal', 'Ruby']));
  });
});
