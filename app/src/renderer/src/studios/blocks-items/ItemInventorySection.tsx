/**
 * The Item Studio's Inventory section (B453, ADR 0095 D1 and D4, ADR 0101 D1): "A bag that holds
 * things" (`msm:item_inventory`: layout picture, rows for the chest, open with right-click or
 * sneak right-click, sounds, events) or "Works like a bundle" (`msm:bundle` with the element's
 * three `bundle_textures`). Switching is one undo step that removes the other choice. The
 * conflict hints are computed from the element alone (the plugin validators are B451): the stack
 * size must be 1, the tool, weapon, armour, shield, throwable, food and consumable components do
 * not go with either choice, and an item cannot be both a bag and a bundle.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { FormProblem } from '../../forms';
import { typingKey } from '../../forms/context';
import { IdField, NumberField, SelectField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { asObject, pointerOf } from './blocks-items-model';
import { EventSelect, ProblemsAt } from './parts';

/** The components a bag or a bundle cannot be combined with (ADR 0095 D1, D4), with their words. */
export const INVENTORY_CONFLICTS: readonly (readonly [string, string])[] = Object.freeze([
  ['msm:tool', 'a tool'],
  ['msm:ranged_weapon', 'a bow or crossbow'],
  ['msm:armor', 'armour'],
  ['msm:shield', 'a shield'],
  ['msm:throwable', 'a throwable'],
  ['msm:food', 'food'],
  ['msm:consumable', 'a drink or consumable'],
]);

export type ItemHolds = 'none' | 'bag' | 'bundle' | 'both';

export const BAG_PATH: readonly string[] = Object.freeze(['components', 'msm:item_inventory']);
export const BUNDLE_PATH: readonly string[] = Object.freeze(['components', 'msm:bundle']);
export const BAG_LAYOUTS: readonly string[] = Object.freeze(['chest', 'hopper', 'dispenser']);
export const BAG_LAYOUT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  chest: 'Chest (rows of 9)',
  hopper: 'Hopper (5 slots)',
  dispenser: 'Dispenser (3 by 3)',
});
export const BAG_OPEN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  use: 'Right-click',
  sneak_use: 'Sneak and right-click',
});
export const DEFAULT_BAG_ROWS = 3;
export const BUNDLE_PICTURES: readonly (readonly [string, string])[] = Object.freeze([
  ['closed', 'Closed bundle'],
  ['open_back', 'Open bundle, back'],
  ['open_front', 'Open bundle, front'],
]);

const SLOT_COUNTS: Readonly<Record<string, number>> = { hopper: 5, dispenser: 9 };

/** What the item does with its things, read from the element. */
export function itemHolds(data: Json | undefined): ItemHolds {
  const components = asObject(asObject(data).components);
  const bag = components['msm:item_inventory'] !== undefined;
  const bundle = components['msm:bundle'] !== undefined;
  if (bag && bundle) return 'both';
  return bag ? 'bag' : bundle ? 'bundle' : 'none';
}

/** The layout, defaulting to the chest. */
export function bagLayout(bag: Record<string, Json | undefined>): string {
  return typeof bag.layout === 'string' && BAG_LAYOUTS.includes(bag.layout) ? bag.layout : 'chest';
}

/** The number of slots the bag opens with. */
export function bagSlots(bag: Record<string, Json | undefined>): number {
  const layout = bagLayout(bag);
  if (layout !== 'chest') return SLOT_COUNTS[layout] ?? 27;
  const rows = typeof bag.rows === 'number' ? bag.rows : DEFAULT_BAG_ROWS;
  return Math.min(6, Math.max(1, Math.round(rows))) * 9;
}

/** The hints (plain words) for the element: empty when nothing conflicts. */
export function inventoryHints(data: Json | undefined): string[] {
  const root = asObject(data);
  const holds = itemHolds(data);
  if (holds === 'none') return [];
  const hints: string[] = [];
  if (holds === 'both') {
    hints.push('An item cannot be both a bag and a bundle: choose one.');
  }
  const stack = root.max_stack_size;
  if (typeof stack === 'number' && stack !== 1) {
    hints.push(
      `The stack size must be 1 (it is ${stack}): ${
        holds === 'bundle' ? 'a bundle' : 'a bag'
      } holds its things in one item.`,
    );
  }
  const components = asObject(root.components);
  const words = INVENTORY_CONFLICTS.filter(([key]) => components[key] !== undefined).map(
    ([, text]) => text,
  );
  if (words.length > 0) {
    hints.push(
      `${
        holds === 'bundle' ? 'A bundle' : holds === 'bag' ? 'A bag' : 'A bag or bundle'
      } cannot also be ${words.join(', ')}.`,
    );
  }
  if (root.bundle_textures !== undefined && holds !== 'bundle' && holds !== 'both') {
    hints.push('The bundle pictures are only used by a bundle.');
  }
  return hints;
}

/** The element data with the choice applied; the other choice and its pictures are removed. */
export function withItemHolds(data: Json | undefined, holds: ItemHolds): Json {
  const root = { ...asObject(data) };
  const components = { ...asObject(root.components) };
  delete components['msm:item_inventory'];
  delete components['msm:bundle'];
  if (holds === 'bag') components['msm:item_inventory'] = {};
  if (holds === 'bundle') components['msm:bundle'] = {};
  if (holds !== 'bundle') delete root.bundle_textures;
  if (Object.keys(components).length === 0) delete root.components;
  else root.components = components;
  return root as Json;
}

const HOLDS_LABELS: Readonly<Record<string, string>> = {
  none: 'Nothing',
  bag: 'A bag that holds things',
  bundle: 'Works like a bundle',
  both: 'Both (not allowed)',
};

/** A small picture of the slots the bag opens with. */
function LayoutPicture({ bag }: { bag: Record<string, Json | undefined> }) {
  const layout = bagLayout(bag);
  const slots = bagSlots(bag);
  const columns = layout === 'chest' ? 9 : layout === 'hopper' ? 5 : 3;
  const rows = Math.ceil(slots / columns);
  const size = 10;
  return (
    <svg
      role="img"
      aria-label={`${slots} slots`}
      data-testid="item-bag-picture"
      data-slots={slots}
      width={columns * size + 2}
      height={rows * size + 2}
      className="text-muted"
    >
      {Array.from({ length: slots }, (_, index) => (
        <rect
          key={index}
          x={1 + (index % columns) * size}
          y={1 + Math.floor(index / columns) * size}
          width={size - 1}
          height={size - 1}
          fill="none"
          stroke="currentColor"
        />
      ))}
    </svg>
  );
}

/** Props of {@link ItemInventorySection}. */
export interface ItemInventorySectionProps {
  data: Json;
  events: readonly string[];
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  /** Sets one value at a path (`undefined` removes it). */
  set(path: readonly (string | number)[], value: Json | undefined, coalesce?: string): void;
  /** Replaces the whole element data (one undo step). */
  replace(data: Json): void;
}

export function ItemInventorySection(props: ItemInventorySectionProps) {
  const { data, events, problems, suggest, set, replace } = props;
  const holds = itemHolds(data);
  const root = asObject(data);
  const bag = asObject(asObject(root.components)['msm:item_inventory']);
  const layout = bagLayout(bag);
  const pictures = asObject(root.bundle_textures);
  const hints = inventoryHints(data);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );
  const choices = holds === 'both' ? ['none', 'bag', 'bundle', 'both'] : ['none', 'bag', 'bundle'];
  const bagText = (key: string) => (typeof bag[key] === 'string' ? (bag[key] as string) : '');
  const bagEvent = (key: string, label: string) => (
    <EventSelect
      label={label}
      value={bag[key]}
      events={events}
      testId={`item-bag-${key.replace('_', '-')}`}
      onChange={(value) => set([...BAG_PATH, key], value)}
    />
  );
  return (
    <Section title="Inventory" testId="item-inventory">
      <div className="flex flex-col gap-0.5 text-xs">
        <label htmlFor="item-inventory-holds" className="text-muted">
          This item is
        </label>
        <select
          id="item-inventory-holds"
          className="rounded border border-border bg-surface px-1 py-0.5 text-sm"
          data-testid="item-inventory-holds"
          value={holds}
          onChange={(event) => replace(withItemHolds(data, event.target.value as ItemHolds))}
        >
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {HOLDS_LABELS[choice]}
            </option>
          ))}
        </select>
      </div>
      {hints.map((hint) => (
        <p
          key={hint}
          role="status"
          className="text-warning text-xs"
          data-testid="item-inventory-conflict"
        >
          {hint}
        </p>
      ))}
      {(holds === 'bag' || holds === 'both') && (
        <>
          <p className="text-muted text-xs">
            The things are kept in the item itself, so they stay when it is dropped or put in a
            chest. A bag cannot go inside another bag, a bundle or a shulker box.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="Layout"
              value={layout}
              choices={BAG_LAYOUTS}
              testId="item-bag-layout"
              onChange={(value) =>
                set([...BAG_PATH, 'layout'], value === 'chest' ? undefined : value)
              }
            />
            <LayoutPicture bag={bag} />
          </div>
          {layout === 'chest' && (
            <NumberField
              label="Rows (1 to 6)"
              value={bag.rows}
              integer
              allowEmpty
              testId="item-bag-rows"
              onCommit={(value) =>
                set([...BAG_PATH, 'rows'], value, typingKey('/components/msm:item_inventory/rows'))
              }
            />
          )}
          {layout !== 'chest' && typeof bag.rows === 'number' && (
            <p role="status" className="text-warning text-xs" data-testid="item-bag-rows-ignored">
              Rows only count for the chest layout; the {layout} always has {bagSlots(bag)} slots.
            </p>
          )}
          <SelectField
            label="Open it with"
            value={bag.open === 'sneak_use' ? 'sneak_use' : 'use'}
            choices={['use', 'sneak_use']}
            testId="item-bag-open"
            onChange={(value) => set([...BAG_PATH, 'open'], value === 'use' ? undefined : value)}
          />
          <p className="text-muted text-xs">
            {BAG_OPEN_LABELS[bag.open === 'sneak_use' ? 'sneak_use' : 'use']} in the air or on a
            block opens it.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <IdField
              label="Open sound"
              value={bagText('open_sound')}
              registry="sound_event"
              suggest={suggest}
              testId="item-bag-open-sound"
              onCommit={(value) =>
                set([...BAG_PATH, 'open_sound'], value === '' ? undefined : value)
              }
            />
            <IdField
              label="Close sound"
              value={bagText('close_sound')}
              registry="sound_event"
              suggest={suggest}
              testId="item-bag-close-sound"
              onCommit={(value) =>
                set([...BAG_PATH, 'close_sound'], value === '' ? undefined : value)
              }
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {bagEvent('on_open', 'When it is opened')}
            {bagEvent('on_close', 'When it is closed')}
          </div>
          {['layout', 'rows', 'open', 'open_sound', 'close_sound', 'on_open', 'on_close'].map(
            (key) => (
              <ProblemsAt key={key} problems={problems} pointer={pointerOf([...BAG_PATH, key])} />
            ),
          )}
          {at(BAG_PATH)}
        </>
      )}
      {holds === 'bundle' && (
        <>
          <p className="text-muted text-xs">
            Holds the same amount as a vanilla bundle, with its clicks, bar and tooltip. The
            pictures below make the closed and the open bundle.
          </p>
          <div className="flex flex-col gap-1">
            {BUNDLE_PICTURES.map(([key, label]) => (
              <IdField
                key={key}
                label={label}
                value={typeof pictures[key] === 'string' ? (pictures[key] as string) : ''}
                registry="texture"
                suggest={suggest}
                testId={`item-bundle-${key.replace('_', '-')}`}
                onCommit={(value) => {
                  const rest = BUNDLE_PICTURES.filter(
                    ([other]) => other !== key && pictures[other] !== undefined,
                  );
                  if (value === '' && rest.length === 0) set(['bundle_textures'], undefined);
                  else set(['bundle_textures', key], value === '' ? undefined : value);
                }}
              />
            ))}
          </div>
          {BUNDLE_PICTURES.map(([key]) => (
            <ProblemsAt
              key={key}
              problems={problems}
              pointer={pointerOf(['bundle_textures', key])}
            />
          ))}
          {at(BUNDLE_PATH)}
        </>
      )}
    </Section>
  );
}
