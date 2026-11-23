/**
 * Colour names with their colours (ADR 0124 D5, D7): the sixteen dye colours by their names in
 * British and American spelling, the gems and metals the flows are made of, and the everyday
 * colour words people type. A colour typed in words answers a flow's colour question; the first
 * colour of a query goes to the flow's main colour (`role: 'main-colour'` in `questions.ts`).
 *
 * The dye colours are the game's own dye colours (the numbers, not any file of the game). Gem
 * and metal colours are MSM's own picks, the ones the flows draw with by default where one
 * exists (ruby `#c41c34`, sapphire `#2454c4`). Plain data: no Minecraft version fact lives here.
 */

import type { SearchColour } from '@msm/plugin-api';

/** The sixteen dye colours, by every name a player uses for them. */
const DYES: SearchColour[] = [
  { names: ['white', 'snow white', 'pure white'], colour: '#f9fffe' },
  { names: ['orange', 'amber orange'], colour: '#f9801d' },
  { names: ['magenta', 'fuchsia', 'hot pink'], colour: '#c74ebd' },
  { names: ['light blue', 'sky blue', 'baby blue', 'pale blue'], colour: '#3ab3da' },
  { names: ['yellow', 'lemon', 'lemon yellow'], colour: '#fed83d' },
  { names: ['lime', 'lime green', 'light green', 'bright green'], colour: '#80c71f' },
  { names: ['pink', 'light pink'], colour: '#f38baa' },
  { names: ['grey', 'gray', 'dark grey', 'dark gray'], colour: '#474f52' },
  { names: ['light grey', 'light gray', 'pale grey', 'pale gray'], colour: '#9d9d97' },
  { names: ['cyan', 'teal'], colour: '#169c9c' },
  { names: ['purple', 'violet'], colour: '#8932b8' },
  { names: ['blue', 'dark blue', 'royal blue'], colour: '#3c44aa' },
  { names: ['brown', 'dark brown'], colour: '#835432' },
  { names: ['green', 'dark green', 'forest green'], colour: '#5e7c16' },
  { names: ['red', 'dark red'], colour: '#b02e26' },
  { names: ['black', 'jet black'], colour: '#1d1d21' },
];

/** Gems, metals and materials as colours ("a ruby sword", "a copper lamp"). */
const MATERIALS: SearchColour[] = [
  { names: ['ruby', 'ruby red'], colour: '#c41c34' },
  { names: ['sapphire'], colour: '#2454c4' },
  { names: ['emerald', 'emerald green'], colour: '#17dd62' },
  { names: ['amethyst'], colour: '#9a5cc6' },
  { names: ['jade'], colour: '#28a060' },
  { names: ['topaz'], colour: '#f0b030' },
  { names: ['amber'], colour: '#de9420' },
  { names: ['diamond', 'diamond blue'], colour: '#4aedd9' },
  { names: ['lapis', 'lapis lazuli'], colour: '#2a4fa8' },
  { names: ['quartz'], colour: '#ece6dc' },
  { names: ['obsidian'], colour: '#1e1430' },
  { names: ['redstone'], colour: '#b80c0c' },
  { names: ['gold', 'golden'], colour: '#fdf55f' },
  { names: ['silver'], colour: '#c0c6cc' },
  { names: ['iron'], colour: '#d8d8d8' },
  { names: ['copper'], colour: '#c86c46' },
  { names: ['bronze'], colour: '#b07838' },
  { names: ['brass'], colour: '#c8a840' },
  { names: ['tin'], colour: '#b0b6be' },
  { names: ['steel'], colour: '#8a929c' },
  { names: ['netherite'], colour: '#4a4446' },
  { names: ['onyx'], colour: '#222024' },
  { names: ['pearl'], colour: '#ece8e0' },
  { names: ['opal'], colour: '#a8d8e0' },
  { names: ['garnet'], colour: '#8c1c2c' },
  { names: ['peridot'], colour: '#a0c030' },
  { names: ['aquamarine'], colour: '#7cd0d0' },
  { names: ['slate'], colour: '#606878' },
  { names: ['frost', 'ice', 'icy'], colour: '#d6e2ee' },
];

/** Everyday colour words that are not dye names. */
const EVERYDAY: SearchColour[] = [
  { names: ['crimson', 'scarlet', 'blood red', 'cherry red'], colour: '#b02e26' },
  { names: ['maroon', 'burgundy', 'wine red'], colour: '#7a1c24' },
  { names: ['navy', 'navy blue', 'midnight blue'], colour: '#1c2458' },
  { names: ['turquoise', 'aqua'], colour: '#30c8c0' },
  { names: ['indigo'], colour: '#40307c' },
  { names: ['lavender', 'lilac'], colour: '#b8a0dc' },
  { names: ['rose', 'rose pink'], colour: '#e0607c' },
  { names: ['coral'], colour: '#f07060' },
  { names: ['salmon'], colour: '#f08870' },
  { names: ['peach'], colour: '#f8b890' },
  { names: ['beige', 'tan'], colour: '#d8c090' },
  { names: ['cream', 'ivory', 'off white'], colour: '#f4ece2' },
  { names: ['olive', 'olive green', 'khaki'], colour: '#7c8030' },
  { names: ['mint', 'mint green'], colour: '#3cc88c' },
  { names: ['sea green'], colour: '#2e8c6c' },
  { names: ['charcoal'], colour: '#303438' },
  { names: ['chocolate', 'dark chocolate'], colour: '#5c3420' },
  { names: ['rust', 'rusty'], colour: '#a0461e' },
  { names: ['wood', 'wooden', 'oak brown'], colour: '#a47444' },
  { names: ['blush'], colour: '#d67896' },
  { names: ['neon green'], colour: '#40ff40' },
  { names: ['neon pink'], colour: '#ff40c0' },
];

/** Every colour line of the library (ADR 0124 D5). */
export const COLOURS: SearchColour[] = [...DYES, ...MATERIALS, ...EVERYDAY];
