/**
 * An item's tooltip as MSM draws it (ADR 0120 D6; B608): the lines the game shows over a slot,
 * the name first, then enchantments, lore and the rest, in the game's colours. The words come
 * from `en_us` (`item-picture.ts`); the drawing is MSM's own (about right).
 */

/** How a line is coloured, as the game colours tooltip lines. */
export type TooltipTone = 'name' | 'enchantment' | 'curse' | 'lore' | 'note';

/** One line of a tooltip. */
export interface TooltipLine {
  readonly text: string;
  readonly tone?: TooltipTone;
}

/** The game's colours for each tone (a drawing of the game, so fixed, not theme tokens). */
export const TOOLTIP_COLOURS: Readonly<Record<TooltipTone, string>> = {
  name: '#ffffff',
  enchantment: '#aaaaaa',
  curse: '#ff5555',
  lore: '#aa00aa',
  note: '#8a8a8a',
};

/** Props of {@link Tooltip}. */
export interface TooltipProps {
  /** The element id, for the slot's `aria-describedby`. */
  readonly id?: string;
  readonly lines: readonly TooltipLine[];
  /** Drawn in place (true) or floating over the slot (false, the default). */
  readonly inline?: boolean;
}

/** The tooltip box: a dark panel with a purple edge, one row per line. */
export function Tooltip({ id, lines, inline = false }: TooltipProps) {
  if (lines.length === 0) return null;
  return (
    <div
      id={id}
      role="tooltip"
      data-testid="live-view-tooltip"
      className={`${
        inline ? '' : 'pointer-events-none absolute top-full left-0 z-20 mt-1 '
      }w-max max-w-64 rounded-sm border-2 border-[#25015b] bg-[#100010f0] px-2 py-1 font-mono text-xs leading-snug [overflow-wrap:anywhere]`}
    >
      {lines.map((line, index) => (
        <div
          // Lines may repeat (two lore lines alike); their order is their identity.
          key={index}
          data-tone={line.tone ?? 'name'}
          style={{ color: TOOLTIP_COLOURS[line.tone ?? 'name'] }}
          className={line.tone === 'lore' ? 'italic' : undefined}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}
