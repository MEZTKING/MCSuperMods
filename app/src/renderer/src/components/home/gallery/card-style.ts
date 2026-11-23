/**
 * The one card look of Home's gallery (ADR 0129 D5, the user's layout A "Store rows"), shared by
 * the gallery's cards and the Showcase's cards in their store look, so every card on Home has the
 * same picture ratio (16:10), tag, title, sentence, actions, hover and focus.
 *
 * @packageDocumentation
 */

/**
 * The card's size in CSS pixels: 242 wide (the rows' columns: the 240 by 150 picture box and the
 * 1-pixel border; whole pixels, so a picture is drawn at exact device pixels, where the old
 * `15.125rem` of the app's 14-pixel root was 211.75) and {@link STORE_CARD_HEIGHT} high (the
 * picture box, the words and the actions, as laid out). The More ideas row places its cards by
 * these (`ideas/idea-seeds.ts`); `home-gallery-path` holds both to the gallery's own cards.
 */
export const STORE_CARD_WIDTH = 242;
// The border, the picture box, the words and the actions in the app's 14-pixel rem (their line
// heights are set by the classes, not the font), as `home-gallery-path` measures it.
export const STORE_CARD_HEIGHT = 272.25;
/** The gap between cards (`gap-[12px]` in the rows and grids). */
export const STORE_CARD_GAP = 12;

/** The card's frame. */
export const storeCardClass =
  'group/card flex min-w-0 snap-start flex-col overflow-hidden rounded-lg border border-border bg-panel ' +
  'transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-accent ' +
  'focus-within:border-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0';

/** The picture's box: 16:10, no border radius of its own (the card clips it). */
export const storePictureClass = 'relative block aspect-[16/10] w-full overflow-hidden bg-bg';

/** The words and actions under the picture. */
export const storeBodyClass = 'flex flex-1 flex-col gap-1 px-3 pt-2.5 pb-3';

/** The small group tag above the title. */
export const storeTagClass = 'font-semibold text-[10px] text-muted uppercase tracking-wider';

/** The title. */
export const storeTitleClass = 'truncate font-semibold text-sm';

/** The sentence: two lines kept, so cards in a row line up. */
export const storeSentenceClass = 'line-clamp-2 min-h-[2lh] text-muted text-xs';

/** The actions row. */
export const storeActionsClass = 'mt-auto flex flex-wrap gap-1.5 pt-2';

/** The primary action (**Make this**). */
export const primaryButtonClass =
  'inline-flex cursor-pointer items-center gap-1.5 rounded border border-accent bg-accent px-2.5 py-1 ' +
  'font-semibold text-panel text-xs hover:opacity-90 focus-visible:outline-2 ' +
  'focus-visible:outline-accent focus-visible:outline-offset-2';

/** The secondary action (**See the example**). */
export const secondaryButtonClass =
  'inline-flex cursor-pointer items-center gap-1.5 rounded border border-border bg-panel px-2.5 py-1 ' +
  'text-xs hover:border-accent focus-visible:outline-2 focus-visible:outline-accent ' +
  'focus-visible:outline-offset-2';

/** A row of cards: one sideways-scrolling line that snaps to cards and shows part of the next. */
export const railClass =
  'm-0 grid list-none auto-cols-[242px] grid-flow-col gap-[12px] overflow-x-auto scroll-smooth p-0 pt-1 pb-2 ' +
  'snap-x snap-mandatory [scrollbar-width:thin] motion-reduce:scroll-auto';

/** A whole group as a grid (Show all). */
export const gridClass =
  'm-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-[12px] p-0';

/** The picture of a card, drawn pixel for pixel. */
export const pixelImageClass = 'block size-full object-cover [image-rendering:pixelated]';
