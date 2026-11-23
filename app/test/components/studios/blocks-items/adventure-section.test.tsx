// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Item Studio's Adventure mode section (ADR 0117 Y16): Can break and Can place on in the
 * item's `msm:components`, blocks picked with the ThingPicker and groups from a list, each change
 * one undo step on a real command stack, the tooltip lines the game adds, the old or richer forms
 * kept as they are, and no ids in Very easy.
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { forbiddenIn } from '../../../../src/renderer/src/components/ai/ai-words';
import { usePreferences } from '../../../../src/renderer/src/store/preferences';
import {
  adventureListOf,
  adventureValue,
  CAN_BREAK,
  CAN_PLACE_ON,
  withAdventureList,
} from '../../../../src/renderer/src/studios/blocks-items/adventure-model';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { ITEM_VERY_EASY_SECTIONS } from '../../../../src/renderer/src/studios/very-easy';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { renderOnStack, schemaState } from './harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
const modeBefore = usePreferences.getState().mode;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex(), {
    block: ['minecraft:dirt', 'minecraft:grass_block', 'minecraft:stone'],
    'tag/block': ['minecraft:logs', 'minecraft:mineable/pickaxe'],
  });
});
afterEach(() => {
  cleanup();
  usePreferences.setState({ mode: modeBefore });
});

const pick = (id: string): Element =>
  element(id as ResourceLocation, 'msm:item', {
    format: 1,
    display_name: 'Adventure Pick',
    model: 'minecraft:item/iron_pickaxe',
  });

const ruby = element('demo:ruby_block' as ResourceLocation, 'msm:block', {
  format: 1,
  display_name: 'Ruby Block',
  model: 'minecraft:block/stone',
});

const passthrough = (data: Json): Json =>
  (data as { components?: Record<string, Json> }).components?.['msm:components'] ?? null;

describe('adventure model', () => {
  it('writes one predicate, or a list with each tag apart', () => {
    expect(adventureValue([])).toBeUndefined();
    expect(adventureValue(['minecraft:stone'])).toEqual({ blocks: ['minecraft:stone'] });
    expect(adventureValue(['#minecraft:logs'])).toEqual({ blocks: '#minecraft:logs' });
    expect(adventureValue(['minecraft:stone', '#minecraft:logs', 'demo:ruby_block'])).toEqual([
      { blocks: ['minecraft:stone', 'demo:ruby_block'] },
      { blocks: '#minecraft:logs' },
    ]);
  });

  it('reads both forms, with or without the prefix, and keeps richer values', () => {
    expect(
      adventureListOf(
        { 'msm:components': { can_break: [{ blocks: 'stone' }, { blocks: '#minecraft:logs' }] } },
        CAN_BREAK,
      ),
    ).toEqual({ entries: ['stone', '#minecraft:logs'], simple: true });
    expect(
      adventureListOf(
        { 'msm:components': { 'minecraft:can_place_on': { predicates: [{ blocks: 'stone' }] } } },
        CAN_PLACE_ON,
      ).simple,
    ).toBe(false);
    expect(
      adventureListOf(
        {
          'msm:components': {
            'minecraft:can_break': { blocks: 'minecraft:furnace', state: { lit: 'true' } },
          },
        },
        CAN_BREAK,
      ).simple,
    ).toBe(false);
    expect(withAdventureList({ 'msm:components': { can_break: {} } }, CAN_BREAK, [])).toBe(
      undefined,
    );
  });
});

describe('Item Studio: Adventure mode', () => {
  it('picks blocks and groups, removes them, and undoes each step', () => {
    usePreferences.setState({ mode: 'easy' });
    const { stack, data } = renderOnStack(pick('demo:pick'), schema, { others: [ruby] });
    const section = screen.getByTestId('item-adventure');
    expect(screen.queryByTestId('item-adventure-tooltip')).toBeNull();

    fireEvent.click(within(section).getByTestId('item-can-break-add'));
    fireEvent.click(
      within(screen.getByTestId('thing-picker')).getByTestId('thing-minecraft:stone'),
    );
    expect(passthrough(data())).toEqual({
      'minecraft:can_break': { blocks: ['minecraft:stone'] },
    });

    fireEvent.click(within(section).getByTestId('item-can-break-add'));
    fireEvent.click(
      within(screen.getByTestId('thing-picker')).getByTestId('thing-demo:ruby_block'),
    );
    fireEvent.change(within(section).getByTestId('item-can-break-add-group'), {
      target: { value: '#minecraft:logs' },
    });
    expect(passthrough(data())).toEqual({
      'minecraft:can_break': [
        { blocks: ['minecraft:stone', 'demo:ruby_block'] },
        { blocks: '#minecraft:logs' },
      ],
    });

    fireEvent.click(within(section).getByTestId('item-can-place-on-add'));
    fireEvent.click(
      within(screen.getByTestId('thing-picker')).getByTestId('thing-minecraft:grass_block'),
    );
    expect(passthrough(data())).toMatchObject({
      'minecraft:can_place_on': { blocks: ['minecraft:grass_block'] },
    });

    // The tooltip, as the game draws it.
    const tooltip = within(screen.getByTestId('item-adventure-tooltip'));
    expect(tooltip.getByText('Adventure Pick')).toBeTruthy();
    expect(tooltip.getByText('Can break:')).toBeTruthy();
    expect(tooltip.getByText('Stone')).toBeTruthy();
    expect(tooltip.getByText('Ruby Block')).toBeTruthy();
    expect(tooltip.getByText('Logs (a group)')).toBeTruthy();
    expect(tooltip.getByText('Can be placed on:')).toBeTruthy();
    expect(tooltip.getByText('Grass block')).toBeTruthy();

    // Remove the ruby block: one step, undone in one step.
    fireEvent.click(within(section).getByTestId('item-can-break-1-remove'));
    expect(passthrough(data())).toMatchObject({
      'minecraft:can_break': [{ blocks: ['minecraft:stone'] }, { blocks: '#minecraft:logs' }],
    });
    act(() => stack.undo());
    expect(passthrough(data())).toMatchObject({
      'minecraft:can_break': [
        { blocks: ['minecraft:stone', 'demo:ruby_block'] },
        { blocks: '#minecraft:logs' },
      ],
    });
    act(() => stack.undo());
    expect(passthrough(data())).toEqual({
      'minecraft:can_break': [
        { blocks: ['minecraft:stone', 'demo:ruby_block'] },
        { blocks: '#minecraft:logs' },
      ],
    });
    // The group, the ruby block and the stone: one undo each.
    act(() => stack.undo());
    expect(adventureListOf({ 'msm:components': passthrough(data()) }, CAN_BREAK).entries).toEqual([
      'minecraft:stone',
      'demo:ruby_block',
    ]);
    act(() => stack.undo());
    act(() => stack.undo());
    expect(passthrough(data())).toBeNull();
    expect(stack.canUndo).toBe(false);
  });

  it('keeps a richer list as it is', () => {
    usePreferences.setState({ mode: 'easy' });
    const subject = pick('demo:old_pick');
    (subject.data as Record<string, Json>).components = {
      'msm:components': { 'minecraft:can_break': { predicates: [{ blocks: 'minecraft:stone' }] } },
    };
    renderOnStack(subject, schema);
    expect(screen.getByTestId('item-can-break-kept')).toBeTruthy();
    expect(screen.queryByTestId('item-can-break-add')).toBeNull();
    expect(screen.getByTestId('item-can-place-on-add')).toBeTruthy();
  });

  it('shows ids only in Advanced', () => {
    const subject = pick('demo:id_pick');
    (subject.data as Record<string, Json>).components = {
      'msm:components': {
        'minecraft:can_break': [{ blocks: ['minecraft:stone'] }, { blocks: '#minecraft:logs' }],
      },
    };
    usePreferences.setState({ mode: 'advanced' });
    renderOnStack(subject, schema);
    const section = screen.getByTestId('item-adventure');
    expect(within(section).getByText('minecraft:stone')).toBeTruthy();
    expect(within(section).getByText('#minecraft:logs')).toBeTruthy();
    cleanup();
    usePreferences.setState({ mode: 'easy' });
    renderOnStack(subject, schema);
    expect(within(screen.getByTestId('item-adventure')).queryByText('minecraft:stone')).toBeNull();
  });

  it('shows no ids in Very easy', () => {
    expect(ITEM_VERY_EASY_SECTIONS).toContain('item-adventure');
    const subject = pick('demo:easy_pick');
    (subject.data as Record<string, Json>).components = {
      'msm:components': {
        'minecraft:can_break': [{ blocks: ['minecraft:stone'] }, { blocks: '#minecraft:logs' }],
        'minecraft:can_place_on': { predicates: [{ blocks: 'minecraft:stone' }] },
      },
    };
    usePreferences.setState({ mode: 'very-easy' });
    renderOnStack(subject, schema);
    const section = screen.getByTestId('item-adventure');
    const texts: string[] = [];
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      texts.push(node.textContent ?? '');
    }
    for (const element of section.querySelectorAll('[aria-label], [title], [placeholder]')) {
      for (const attribute of ['aria-label', 'title', 'placeholder']) {
        texts.push(element.getAttribute(attribute) ?? '');
      }
    }
    const leaks = texts.filter((text) => forbiddenIn(text).length > 0);
    expect(leaks).toEqual([]);
    expect(within(screen.getByTestId('item-can-break-0')).getByText('Stone')).toBeTruthy();
    // A group's option reads as words.
    expect(
      within(section)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toContain('Pickaxe (a group)');
  });
});
