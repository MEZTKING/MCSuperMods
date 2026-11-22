/**
 * One item in a slot, as live views show stacks (B608; spike answer 2S15): the recipe picture's
 * slot look (`RecipeGridView`), the picture Try it's hotbar would find (`item-picture.ts`), the
 * count in the corner when more than one, and the game's tooltip lines on hover or focus. The
 * slot takes the keyboard focus, so the tooltip is reachable without a mouse; Escape hides it.
 */

import { useId, useState } from 'react';
import {
  enchantmentLine,
  type ItemPictureSource,
  itemName,
  type LangTable,
  useItemPicture,
} from './item-picture';
import { Tooltip, type TooltipLine } from './Tooltip';

/** What a slot holds (`@msm/sim`'s `LootStack` and `ItemSample` fit). */
export interface SlotItem {
  readonly id: string;
  readonly count: number;
  readonly enchantments?: Readonly<Record<string, number>>;
  /** Durability left (0 to 1), when a function set it. */
  readonly damage?: number;
}

/** The tooltip lines of an item: its name, its enchantments, then `extra`. */
export function tooltipLinesOf(
  item: SlotItem,
  lang: LangTable | null,
  options: {
    readonly name?: string;
    /** Enchantments shown in red (the game's curse tag, when the view resolved it). */
    readonly curses?: ReadonlySet<string>;
    /** Each enchantment's most level, when known (one hides the number). */
    readonly maxLevels?: Readonly<Record<string, number>>;
    readonly extra?: readonly TooltipLine[];
  } = {},
): TooltipLine[] {
  const lines: TooltipLine[] = [{ text: options.name ?? itemName(item.id, lang), tone: 'name' }];
  for (const [id, level] of Object.entries(item.enchantments ?? {})) {
    lines.push({
      text: enchantmentLine(id, level, lang, options.maxLevels?.[id]),
      tone: options.curses?.has(id) === true ? 'curse' : 'enchantment',
    });
  }
  if (item.damage !== undefined) {
    lines.push({ text: `Durability left: ${Math.round(item.damage * 100)}%`, tone: 'note' });
  }
  lines.push(...(options.extra ?? []));
  return lines;
}

/** Props of {@link ItemSlot}. */
export interface ItemSlotProps {
  /** The item, or `null` for an empty slot. */
  readonly item: SlotItem | null;
  /** Where to find the picture; without it the slot shows the item's name. */
  readonly pictures?: ItemPictureSource;
  /** `en_us` for names (`useVanillaLang`), or `null` for names made from the id. */
  readonly lang?: LangTable | null;
  /** The name to show instead of the language file's. */
  readonly name?: string;
  /** Lines added below the item's own. */
  readonly extraLines?: readonly TooltipLine[];
  /** Lines instead of the item's own. */
  readonly lines?: readonly TooltipLine[];
  /** Enchantments shown in red. */
  readonly curses?: ReadonlySet<string>;
  /** Each enchantment's most level, when known. */
  readonly maxLevels?: Readonly<Record<string, number>>;
  /** A test id for the slot. */
  readonly testId?: string;
}

/** The slot. */
export function ItemSlot(props: ItemSlotProps) {
  const { item } = props;
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const picture = useItemPicture(item?.id ?? '', item === null ? undefined : props.pictures);
  if (item === null) {
    return (
      <span
        role="img"
        aria-label="Empty slot"
        data-testid={props.testId}
        className="flex size-12 items-center justify-center rounded border border-border bg-bg"
      />
    );
  }
  const lang = props.lang ?? null;
  const lines =
    props.lines ??
    tooltipLinesOf(item, lang, {
      ...(props.name === undefined ? {} : { name: props.name }),
      ...(props.curses === undefined ? {} : { curses: props.curses }),
      ...(props.maxLevels === undefined ? {} : { maxLevels: props.maxLevels }),
      ...(props.extraLines === undefined ? {} : { extra: props.extraLines }),
    });
  const name = lines[0]?.text ?? item.id;
  const label = item.count > 1 ? `${name}, ${item.count}` : name;
  return (
    <span
      role="img"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so the tooltip is reachable from the keyboard
      tabIndex={0}
      aria-label={label}
      aria-describedby={open ? tooltipId : undefined}
      data-testid={props.testId}
      data-item={item.id}
      data-count={item.count}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
      className="relative flex size-12 items-center justify-center rounded border border-border bg-bg text-center text-[0.6rem] leading-tight outline-none [overflow-wrap:anywhere] focus-visible:ring-2 focus-visible:ring-accent"
    >
      {picture !== null ? (
        <img alt="" src={picture} className="size-10 [image-rendering:pixelated]" />
      ) : (
        <span className="overflow-hidden">{name}</span>
      )}
      {item.count > 1 && (
        <span
          data-testid="live-view-slot-count"
          className="absolute right-0.5 bottom-0 text-xs font-semibold"
        >
          {item.count}
        </span>
      )}
      {open && <Tooltip id={tooltipId} lines={lines} />}
    </span>
  );
}
