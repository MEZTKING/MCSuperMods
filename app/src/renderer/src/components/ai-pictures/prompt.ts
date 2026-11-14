/**
 * The description AI pictures start with (ADR 0093 D5): made from the thing's name, kind and
 * theme, editable before anything is sent. It names the subject only; each service adds its own
 * style (Retro Diffusion's Minecraft styles, OpenAI's style words in main).
 *
 * @packageDocumentation
 */

import type { AiPictureStyle } from '../../../../shared/ai-pictures';

/** Words that make a picture a tool (held diagonally, as vanilla's tools are). */
const TOOL_WORDS =
  /\b(sword|pickaxe|axe|shovel|spade|hoe|hammer|mace|spear|trident|dagger|knife|staff|wand|bow|crossbow|scythe|sickle|club|blade)\b/;

/** `ruby_ore`, `ruby-ore`, `ns:block/ruby_ore` or `textures/block/ruby_ore.png` in words. */
export function wordsOf(name: string): string {
  const last =
    name
      .replace(/\.png$/i, '')
      .split(/[:/]/)
      .pop() ?? name;
  return last
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The style a name suggests: a tool word makes a tool, else `fallback`. */
export function styleForName(name: string, fallback: AiPictureStyle): AiPictureStyle {
  if (fallback === 'block') return 'block';
  return TOOL_WORDS.test(wordsOf(name)) ? 'tool' : fallback;
}

/** The style of a texture path: `textures/block/…` is a block, else an item or a tool. */
export function styleForTexturePath(path: string): AiPictureStyle {
  const folder = path.replace(/^textures\//, '').split('/')[0];
  return styleForName(path, folder === 'block' ? 'block' : 'item');
}

/** The description of a thing: "a ruby ore block, in a volcano theme". */
export function defaultPrompt(name: string, style: AiPictureStyle, theme?: string): string {
  const words = wordsOf(name) || 'thing';
  const article = /^[aeiou]/.test(words) ? 'an' : 'a';
  const subject =
    style === 'block' && !/\b(block|ore|stone|planks|bricks|log|wood|leaves|tiles?)\b/.test(words)
      ? `${article} ${words} block`
      : `${article} ${words}`;
  const themeWords = theme === undefined ? '' : wordsOf(theme);
  return themeWords === '' ? subject : `${subject}, ${themeWords} theme`;
}
