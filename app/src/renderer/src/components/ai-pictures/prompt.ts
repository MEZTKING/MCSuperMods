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
      : style === 'skin'
        ? `the fur, hide or scales of ${article} ${words}`
        : style === 'painting'
          ? `a painting of ${words}`
          : style === 'pattern'
            ? `${article} ${words} emblem`
            : style === 'particle' && !/\bparticle\b/.test(words)
              ? `${article} ${words} particle`
              : `${article} ${words}`;
  const themeWords = theme === undefined ? '' : wordsOf(theme);
  return themeWords === '' ? subject : `${subject}, ${themeWords} theme`;
}

// The exact prompt (2026-11-22) ------------------------------------------------------------

/**
 * What a picture is, read from its name: the slot of a set (helmet, chestplate…), a tool, a
 * kind of item or block face, or a whole picture (a skin, a painting). Each has the noun the
 * prompt names, the Minecraft silhouette words that pin its outline, and the drawn recipe of
 * the art generator (ADR 0092) that draws the same thing, used as the reference.
 */
export interface AiSlot {
  readonly id: string;
  readonly noun: string;
  /** What its outline is, in words ("a torso piece with shoulder pads…"). */
  readonly silhouette: string;
  /** The art generator's recipe of the same thing, when it has one. */
  readonly recipe?: string;
  /** Whether it is a block face (else an item icon or a whole picture). */
  readonly face?: boolean;
}

/** The slots, in the order names are matched (longer and more particular words first). */
export const AI_SLOTS: readonly AiSlot[] = Object.freeze([
  {
    id: 'chestplate',
    noun: 'chestplate',
    recipe: 'chestplate',
    silhouette:
      'front view, a torso piece with two shoulder pads and a round neck opening, same outline as an iron chestplate',
  },
  {
    id: 'leggings',
    noun: 'leggings',
    recipe: 'leggings',
    silhouette:
      'front view, a waistband on top and two straight legs with a gap between them, same outline as iron leggings',
  },
  {
    id: 'helmet',
    noun: 'helmet',
    recipe: 'helmet',
    silhouette:
      'front view, a rounded cap with an open face below and short cheek guards, same outline as an iron helmet',
  },
  {
    id: 'boots',
    noun: 'boots',
    recipe: 'boots',
    silhouette:
      'side view, a pair of boots side by side with the toes pointing left, same outline as iron boots',
  },
  {
    id: 'pickaxe',
    noun: 'pickaxe',
    recipe: 'pickaxe',
    silhouette:
      'a curved head across the top and a wooden handle running diagonally to the bottom left, same outline as an iron pickaxe',
  },
  {
    id: 'shovel',
    noun: 'shovel',
    recipe: 'shovel',
    silhouette:
      'a rounded blade at the top right and a wooden handle running diagonally to the bottom left, same outline as an iron shovel',
  },
  {
    id: 'sword',
    noun: 'sword',
    recipe: 'sword',
    silhouette:
      'pointing from the bottom left to the top right, a straight blade, a crossguard and a short handle, same outline as an iron sword',
  },
  {
    id: 'axe',
    noun: 'axe',
    recipe: 'axe',
    silhouette:
      'a wide blade on one side of the top and a wooden handle running diagonally to the bottom left, same outline as an iron axe',
  },
  {
    id: 'hoe',
    noun: 'hoe',
    recipe: 'hoe',
    silhouette:
      'a flat blade bent to one side at the top and a wooden handle running diagonally to the bottom left, same outline as an iron hoe',
  },
  {
    id: 'crossbow',
    noun: 'crossbow',
    recipe: 'crossbow',
    silhouette:
      'a wooden stock running diagonally with a bow across its end, same outline as a crossbow',
  },
  {
    id: 'bow',
    noun: 'bow',
    recipe: 'bow',
    silhouette:
      'a curved wooden bow from the top left to the bottom right with its string, same outline as a bow',
  },
  {
    id: 'shield',
    noun: 'shield',
    recipe: 'shield',
    silhouette: 'front view, an upright rectangular shield with a rim, same outline as a shield',
  },
  {
    id: 'ingot',
    noun: 'ingot',
    recipe: 'ingot',
    silhouette: 'one bar seen at an angle, same outline as an iron ingot',
  },
  {
    id: 'nugget',
    noun: 'nugget',
    recipe: 'gem',
    silhouette: 'one small lump, same outline as a gold nugget',
  },
  {
    id: 'gem',
    noun: 'gem',
    recipe: 'gem',
    silhouette: 'one cut gemstone with facets, same outline as a diamond',
  },
  {
    id: 'trinket',
    noun: 'amulet',
    recipe: 'gem',
    silhouette: 'one round charm with a short loop at the top, same size as a diamond',
  },
  {
    id: 'food',
    noun: 'piece of food',
    recipe: 'fruit',
    silhouette: 'one piece of food, same size as an apple',
  },
  {
    id: 'ore',
    noun: 'ore',
    recipe: 'ore',
    face: true,
    silhouette:
      'grey stone with a few clusters of coloured mineral, flat front face filling the square, seamless, same layout as iron ore',
  },
  {
    id: 'planks',
    noun: 'planks',
    recipe: 'planks',
    face: true,
    silhouette:
      'horizontal wooden boards, flat front face filling the square, seamless, same layout as oak planks',
  },
  {
    id: 'log',
    noun: 'log',
    recipe: 'bark',
    face: true,
    silhouette:
      'vertical bark, flat front face filling the square, seamless, same layout as an oak log',
  },
  {
    id: 'bricks',
    noun: 'bricks',
    recipe: 'bricks',
    face: true,
    silhouette:
      'rows of bricks with mortar, flat front face filling the square, seamless, same layout as stone bricks',
  },
  {
    id: 'leaves',
    noun: 'leaves',
    recipe: 'leaves',
    face: true,
    silhouette:
      'dense leaves, flat front face filling the square, seamless, same layout as oak leaves',
  },
  {
    id: 'block',
    noun: 'block',
    recipe: 'block',
    face: true,
    silhouette:
      'a flat front face filling the whole square with a gentle even pattern, seamless, same layout as a block of gold',
  },
] as const);

/** Words that name a food. */
const FOOD_WORDS =
  /\b(food|apple|berry|berries|bread|pie|cake|cookie|meat|steak|stew|soup|fruit|carrot|potato)\b/;
/** Words that name a charm or consumable trinket. */
const TRINKET_WORDS = /\b(trinket|amulet|charm|talisman|pendant|medallion|token)\b/;
/** Words that name a gem. */
const GEM_WORDS = /\b(gem|ruby|diamond|emerald|sapphire|crystal|shard|jewel)\b/;

/** The slot a name and style suggest, or `undefined` for a plain item or whole picture. */
export function slotOf(name: string, style: AiPictureStyle): AiSlot | undefined {
  const words = ` ${wordsOf(name)} `;
  const find = (id: string) => AI_SLOTS.find((slot) => slot.id === id);
  if (style === 'skin' || style === 'painting' || style === 'pattern' || style === 'particle') {
    return undefined;
  }
  if (style === 'block') {
    for (const slot of AI_SLOTS) {
      if (slot.face === true && slot.id !== 'block' && words.includes(` ${slot.id} `)) return slot;
    }
    if (/\b(plank)\b/.test(words)) return find('planks');
    if (/\b(wood|stem|bark)\b/.test(words)) return find('log');
    if (/\b(brick)\b/.test(words)) return find('bricks');
    if (/\b(leaf)\b/.test(words)) return find('leaves');
    return find('block');
  }
  for (const slot of AI_SLOTS) {
    if (slot.face === true) continue;
    if (words.includes(` ${slot.id} `)) return slot;
  }
  if (/\b(chest|tunic|armou?r)\b/.test(words)) return find('chestplate');
  if (/\b(pants|trousers)\b/.test(words)) return find('leggings');
  if (/\b(hat|cap|helm)\b/.test(words)) return find('helmet');
  if (/\b(shoes?|boot)\b/.test(words)) return find('boots');
  if (/\b(blade|sabre|saber)\b/.test(words)) return find('sword');
  if (TRINKET_WORDS.test(words)) return find('trinket');
  if (FOOD_WORDS.test(words)) return find('food');
  if (GEM_WORDS.test(words)) return find('gem');
  return undefined;
}

/** Named colours for prompts, by hue band (and grey, white, black by lightness). */
const HUE_NAMES: readonly [number, string][] = [
  [15, 'red'],
  [38, 'orange'],
  [52, 'golden'],
  [68, 'yellow'],
  [95, 'lime green'],
  [160, 'green'],
  [190, 'cyan'],
  [250, 'blue'],
  [285, 'purple'],
  [330, 'pink'],
  [360, 'red'],
];

/** A colour in a word or two for a prompt: "golden", "dark blue", "pale grey". */
export function colourWords(rgb: readonly [number, number, number]): string {
  const [r, g, b] = rgb.map((value) => value / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  if (saturation < 0.15) {
    if (light > 0.85) return 'white';
    if (light < 0.15) return 'black';
    return light > 0.6 ? 'light grey' : light < 0.35 ? 'dark grey' : 'grey';
  }
  let hue = 0;
  const d = max - min;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) hue = ((b - r) / d + 2) * 60;
  else hue = ((r - g) / d + 4) * 60;
  const name = HUE_NAMES.find(([limit]) => hue < limit)?.[1] ?? 'red';
  if (name === 'orange' && light < 0.35) return 'brown';
  if (light < 0.3) return `dark ${name}`;
  if (light > 0.75) return `pale ${name}`;
  return name;
}

/** What a picture is, for {@link buildPrompt}. */
export interface PromptSubject {
  /** The thing's name or texture path ("sun_chestplate", "Sun Trinket"). */
  name: string;
  style: AiPictureStyle;
  /** The asked colour. */
  colour?: readonly [number, number, number];
  /** The set's or theme's words ("sun"). */
  theme?: string;
  /** A second, stronger attempt after a picture failed its check. */
  strong?: boolean;
}

/** Words that never describe the thing itself. */
const FILLER =
  /\b(texture|textures|picture|image|png|item|items|block|my|own|the|a|an|of|icon|layer|entity|equipment|humanoid|leggings layer)\b/g;

/** The material words of a name: the name without its slot words and filler ("sun"). */
export function materialWords(name: string, slot: AiSlot | undefined): string {
  let words = ` ${wordsOf(name)} `;
  if (slot !== undefined) words = words.replace(` ${slot.id} `, ' ');
  return words
    .replace(FILLER, ' ')
    .replace(/\b(chest|pants|hat|cap|shoes?|boot|trinket|amulet|charm)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The exact prompt of a picture (2026-11-22): never a bare description. It names what the
 * thing is (its slot's noun, its material and colour words), the Minecraft silhouette words of
 * that slot and, since Retro Diffusion's `negative` is ignored by its models, what the picture
 * must be only ("only the chestplate on a plain background, no creature, no plant, no text").
 * A strong attempt repeats the outline and asks for the reference's exact outline.
 */
export function buildPrompt(subject: PromptSubject): string {
  const slot = slotOf(subject.name, subject.style);
  const material = materialWords(subject.name, slot);
  const theme = subject.theme === undefined ? '' : wordsOf(subject.theme);
  const colour = subject.colour === undefined ? '' : colourWords(subject.colour);
  const what = [colour, theme !== '' && !material.includes(theme) ? theme : '', material]
    .filter((part) => part !== '')
    .join(' ');
  if (slot === undefined) {
    const base = defaultPrompt(subject.name, subject.style, subject.theme);
    const tail =
      subject.style === 'item' || subject.style === 'tool' || subject.style === 'particle'
        ? ', one object centred on a plain background, no creature, no text'
        : subject.style === 'block'
          ? ', flat front face filling the square, seamless, no text'
          : '';
    return `${colour === '' ? '' : `${colour} `}${base}${tail}`.slice(0, 1000);
  }
  const subjectWords = `${what === '' ? '' : `${what} `}${slot.noun}`;
  return [subjectWords, ...slotPromptParts(slot, subject.strong === true)]
    .join(', ')
    .slice(0, 1000);
}

/**
 * The words MSM adds after the subject for a slot: the Minecraft style and view, the silhouette,
 * the background and what the picture must be only; a strong attempt asks for the input
 * picture's exact outline.
 */
export function slotPromptParts(slot: AiSlot, strong = false): string[] {
  const parts =
    slot.face === true
      ? [
          'block texture',
          'Minecraft-style pixel art block face',
          slot.silhouette,
          `only the ${slot.noun}: no creature, no plant, no item, no text, no border`,
        ]
      : [
          `a Minecraft-style pixel art ${slot.noun} icon`,
          slot.silhouette,
          'centred, transparent background',
          `only one ${slot.noun}: no creature, no plant, no text, no background`,
        ];
  if (strong)
    parts.push(`exactly the outline of the input picture, clearly ${slotArticle(slot.noun)}`);
  return parts;
}

/** "a chestplate", "an ore", "a pair of boots", "planks". */
export function slotArticle(noun: string): string {
  if (/^(boots|leggings)$/.test(noun)) return `a pair of ${noun}`;
  if (/^(planks|bricks|leaves)$/.test(noun)) return noun;
  return `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;
}
