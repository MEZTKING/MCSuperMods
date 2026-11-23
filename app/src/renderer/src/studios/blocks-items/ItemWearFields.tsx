/**
 * "Never wears out" and "Starts with enchantments" in the Item Studio's "Tool and durability"
 * section (ADR 0127 D2, D3; `item-wear-model.ts`): the vanilla components
 * `minecraft:unbreakable` and `minecraft:enchantments` in the item's `msm:components`. Its live
 * view is the tooltip below the fields, the lines the game shows over the item (its name, each
 * starting enchantment, "Unbreakable", and the Adventure mode lists the Studio passes in),
 * redrawn on every edit.
 */

import type { JsonObject } from '@msm/plugin-api';
import { X } from 'lucide-react';
import { buttonClass, iconButtonClass } from '../../components/ui/Button';
import type { SuggestIds } from '../../forms';
import { Tooltip, type TooltipLine } from '../../liveviews/frame/Tooltip';
import { IdField, NumberField } from '../structures/pickers';
import {
  ENCHANTMENTS,
  enchantmentsValue,
  enchantmentWords,
  isUnbreakable,
  MAX_ENCHANTMENT_LEVEL,
  nextEnchantment,
  type StartingEnchantment,
  startingEnchantments,
  UNBREAKABLE,
  withPassthrough,
} from './item-wear-model';
import { CheckField } from './parts';

export interface ItemWearFieldsProps {
  /** The item's `components`. */
  readonly components: JsonObject;
  /** The item's display name, for the tooltip. */
  readonly name: string;
  readonly suggest?: SuggestIds | undefined;
  /** Sets the item's `msm:components` (undefined removes it). */
  setPassthrough(next: JsonObject | undefined): void;
  /**
   * The item's whole tooltip, when the Studio adds lines of its own (the Adventure mode lists,
   * ADR 0117 Y16); absent: {@link wearTooltipLines}.
   */
  tooltip?: readonly TooltipLine[] | undefined;
}

/** The tooltip lines of the item's name, starting enchantments and "Unbreakable", in order. */
export function wearTooltipLines(components: JsonObject, name: string): TooltipLine[] {
  return [
    { text: name, tone: 'name' },
    ...startingEnchantments(components).map(
      ({ id, level }): TooltipLine => ({ text: enchantmentWords(id, level), tone: 'enchantment' }),
    ),
    ...(isUnbreakable(components) ? [{ text: 'Unbreakable', tone: 'note' } as const] : []),
  ];
}

export function ItemWearFields(props: ItemWearFieldsProps) {
  const { components } = props;
  const unbreakable = isUnbreakable(components);
  const list = startingEnchantments(components);
  const setList = (next: readonly StartingEnchantment[]) =>
    props.setPassthrough(withPassthrough(components, ENCHANTMENTS, enchantmentsValue(next)));
  const own = wearTooltipLines(components, props.name);
  const lines = props.tooltip ?? own;
  return (
    <div className="flex flex-col gap-2" data-testid="item-wear">
      <CheckField
        label="Never wears out"
        checked={unbreakable}
        testId="item-unbreakable"
        onChange={(checked) =>
          props.setPassthrough(withPassthrough(components, UNBREAKABLE, checked ? {} : undefined))
        }
      />
      <div className="flex flex-col gap-1" data-testid="item-enchantments">
        <span className="text-xs">Starts with enchantments</span>
        {list.length === 0 && (
          <p className="text-muted text-xs">None: the item is made plain, as vanilla items are.</p>
        )}
        {list.map((entry, index) => (
          <div key={entry.id} className="flex flex-wrap items-end gap-2">
            <IdField
              label="Enchantment"
              value={entry.id}
              registry="enchantment"
              suggest={props.suggest}
              testId={`item-enchantment-${index}`}
              onCommit={(id) =>
                setList(list.map((other, at) => (at === index ? { ...other, id } : other)))
              }
            />
            <NumberField
              label="Level"
              value={entry.level}
              integer
              testId={`item-enchantment-${index}-level`}
              onCommit={(level) => {
                if (level === undefined || level < 1 || level > MAX_ENCHANTMENT_LEVEL) return;
                setList(list.map((other, at) => (at === index ? { ...other, level } : other)));
              }}
            />
            <button
              type="button"
              className={iconButtonClass}
              aria-label={`Remove ${enchantmentWords(entry.id, entry.level)}`}
              data-testid={`item-enchantment-${index}-remove`}
              onClick={() => setList(list.filter((_, at) => at !== index))}
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className={buttonClass}
            data-testid="item-enchantment-add"
            onClick={() => setList([...list, { id: nextEnchantment(list), level: 1 }])}
          >
            Add an enchantment
          </button>
        </div>
      </div>
      {own.length > 1 && (
        <div className="flex flex-col gap-1" data-testid="item-wear-tooltip">
          <span className="text-muted text-xs">In the game, its tooltip reads:</span>
          <Tooltip inline lines={lines} />
        </div>
      )}
    </div>
  );
}
