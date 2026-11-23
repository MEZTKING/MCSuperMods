/**
 * The one-line why of each Studio section (ADR 0130 D2): what the section is for, in the
 * subject's terms, shown under its title. Keyed by the section's test id; `Section` reads it
 * unless the section passes its own `why`. Plain words only (no ids, no file names), checked by
 * `app/test/components/studios/section-why.test.ts`.
 *
 * @packageDocumentation
 */

/** The why of each section, by test id. */
const WHY: Readonly<Record<string, string>> = Object.freeze({
  // Rules (every subject).
  'rules-section': 'What happens when players use it, in plain sentences.',
  'msm-events': 'Hand-made events that run actions; the Rules above do the same in sentences.',
  'msm-triggers': 'Which hand-made event runs when it is hit, used or held.',

  // Blocks.
  'block-type': 'What kind of block it is: a plain cube, stairs, a door, a crop and more.',
  'block-type-preview': 'How the block looks in the world as you change it.',
  'block-appearance': 'How it looks: see-through, glowing in the dark, its colour on maps.',
  'block-textures': 'The pictures on each side of the block.',
  'block-state-models': 'The 3D shapes the block uses in each of its states.',
  'block-mining': 'How long it takes to break, and which tool it needs (stone takes 1.5).',
  'block-light-sound': 'How much light it gives (a torch gives 14) and the sounds it makes.',
  'block-drops': 'What players get when they break it.',
  'block-shape': 'The outline players bump into and see when they aim at it.',
  'block-behaviour': 'Extra things it does: slipperiness, burning, falling and more.',
  'block-item': 'The item players hold to place it.',
  'block-inventory': 'Slots that hold items, like a chest or a furnace.',
  'block-ambient': 'Little particles that float around it, like a torch’s smoke.',
  'block-crop': 'How it grows from seeds to a crop you harvest, like wheat.',
  'block-sapling': 'The tree it grows into, like an oak sapling.',
  'block-leaves': 'How the leaves are tinted, decay and drop saplings.',
  'block-portal': 'Where players go when they step in, like a Nether portal.',
  'block-cake': 'How many bites it has and what each bite gives, like a cake.',
  'block-berry-bush': 'How the bush grows berries and hurts players walking through it.',
  'block-tall-plant': 'A plant two blocks tall, like a sunflower.',
  'block-potted-plant': 'The plant in a flower pot.',
  'block-vine': 'How it climbs walls and grows, like vines.',
  'block-stem': 'How it grows a fruit beside it, like a melon stem.',
  'block-cocoa': 'A pod that grows on a log, like cocoa beans.',
  'block-weathering': 'How it ages over time, like copper turning green.',
  'block-growing-plant': 'A plant that grows in a long strand, like kelp or cave vines.',
  'block-column-plant': 'A plant that grows taller in a column, like sugar cane.',
  'block-multiface': 'A thin layer that spreads over any side, like glow lichen.',
  'block-dripleaf': 'A leaf that tips over when you stand on it, like big dripleaf.',
  'block-flower-pot': 'A pot that plants can go in.',
  'block-sounds': 'The sounds it makes when placed, broken and walked on.',

  // Items.
  'item-general': 'Its name, picture and how many fit in one slot (most items stack to 64).',
  'item-food': 'Whether players can eat it and how much it fills them (bread fills 5).',
  'item-tool': 'Whether it is a tool or a weapon, and how long it lasts.',
  'item-behaviour': 'What it does when used, and how long players wait to use it again.',
  'item-throwable': 'Whether players throw it, like a snowball, and what it does when it lands.',
  'item-inventory': 'Slots inside the item, like a bundle.',
  'item-boat': 'Whether it is a boat players can sail.',
  'item-adventure': 'Which blocks it can break or be placed on in Adventure mode.',

  // Effects and potions.
  'effect-general': 'Whether it helps or harms, and its colour.',
  'effect-icon': 'The small picture shown while the effect is on.',
  'effect-preview': 'How the effect looks on the screen.',
  'effect-potion': 'A potion that gives this effect.',
  'effect-modifiers': 'How it changes speed, strength and the other stats.',
  'effect-behaviour': 'What it does while it lasts.',
  'potion-preview': 'How the potion looks in the inventory.',
  'potion-general': 'Its name and colour.',
  'potion-effects': 'The effects it gives and for how long (Swiftness lasts 3 minutes).',
  'potion-brewing': 'What to brew into which potion to make it.',
  'potion-chain': 'The stronger and longer versions brewed from it.',

  // Particles, tabs, liquids.
  'particle-preview-section': 'How the particles look as you change them.',
  'particle-pictures': 'The pictures each particle shows.',
  'particle-colour': 'Their colour and whether they glow.',
  'particle-life': 'How long each particle lasts and how big it is.',
  'particle-movement': 'How the particles move: falling, floating or spreading.',
  'creative-tab-preview': 'How the tab looks in the creative inventory.',
  'creative-tab-general': 'Its name and the picture on the tab.',
  'creative-tab-members': 'What players find in the tab.',
  'creative-tab-hand-order': 'The order you choose for what is in the tab.',
  'fluid-preview': 'How the liquid looks as you change it.',
  'fluid-liquid': 'Its name, colour and whether players can swim in it.',
  'fluid-flow': 'How far and how fast it flows (water flows 7 blocks).',
  'fluid-pictures': 'The pictures of the still and flowing liquid.',
  'fluid-mixing': 'What forms when it meets other liquids, like lava and water make stone.',
  'fluid-cauldron-bottle': 'Whether it fills cauldrons and bottles.',
  'fluid-inside': 'What it does to players and mobs inside it.',

  // Mobs.
  'entity-identity': 'Its name and size.',
  'entity-mob-kind': 'Whether it is friendly, neutral or a monster.',
  'entity-appearance': 'How it looks: its skin and its model.',
  'entity-stats': 'Its health, speed and strength (a zombie has 20 health).',
  'entity-movement': 'How it gets around: walking, swimming, flying.',
  'entity-attack': 'Whether and how it attacks.',
  'entity-ranged': 'Whether it shoots from far away, like a skeleton.',
  'entity-taming': 'Whether players can tame it, like a wolf.',
  'entity-breeding': 'Whether two of them make a baby, and with what food.',
  'entity-riding': 'Whether players can ride it, like a horse.',
  'entity-storage': 'Whether it carries a chest, like a donkey.',
  'entity-shoulder': 'Whether it sits on a player’s shoulder, like a parrot.',
  'entity-trader': 'Whether it trades with players, like a wandering trader.',
  'entity-bucket': 'Whether players can catch it in a bucket, like a fish.',
  'entity-habits': 'Little things it does on its own, like a fox sleeping by day.',
  'entity-boss-bar': 'A health bar at the top of the screen, like the Wither’s.',
  'entity-spawning': 'Where and how often it appears in the world.',
  'entity-spawn-egg': 'The egg that makes one appear.',
  'entity-sounds': 'The sounds it makes.',
  'entity-behaviour': 'What it does on its own: wandering, fleeing, following.',
  'entity-variants': 'Different looks it can have, like cat colours.',
  'profession-job': 'The job’s name and the block villagers work at.',
  'profession-pictures': 'How villagers with this job look.',
  'profession-trades': 'What villagers with this job sell and buy.',
  'profession-work': 'What they do at their work block.',
  'villager-type-biomes': 'Where villagers with this look are born.',
  'villager-type-pictures': 'How villagers with this look are dressed.',

  // Vehicles.
  'vehicle-preview': 'How the vehicle looks as you change it.',
  'vehicle-basics': 'What kind of vehicle it is.',
  'vehicle-identity': 'Its name and size.',
  'vehicle-model': 'Its model and paint.',
  'vehicle-movement': 'How fast it goes and how it handles.',
  'vehicle-engine': 'What it runs on, like coal.',
  'vehicle-health': 'How much it takes before it breaks, and how to repair it.',
  'vehicle-seats': 'Where players sit.',
  'vehicle-storage': 'Whether it carries items.',
  'vehicle-item': 'The item players use to put it down.',
  'vehicle-camera': 'How the view follows the vehicle.',
  'vehicle-exhaust': 'Smoke and particles while it runs.',
  'vehicle-parts': 'Parts that move, like wheels.',
  'vehicle-turret': 'A part that turns to aim.',
  'vehicle-weapons': 'What it shoots.',

  // Controls.
  'key-bind-name': 'What the key is called in Controls, and its group.',
  'key-bind-key': 'Which key it starts on (players can change it).',
  'key-bind-timing': 'Whether it acts on a press or while held.',
  'key-bind-when': 'When the key does something.',
  'hud-preview': 'How it looks on the screen.',
  'hud-value': 'What it shows: a number, a bar or words.',
  'hud-look': 'Its shape and size.',
  'hud-style': 'Its colours and pictures.',
  'hud-where': 'Where on the screen it goes.',
  'hud-show': 'When it shows.',

  // Commands, game rules, statistics.
  'command-preview': 'How players type it in chat.',
  'command-name-section': 'The word players type after the slash.',
  'command-arguments': 'What players type after the command, like a number or a player.',
  'command-permission-section': 'Who may use it: everyone, or only operators.',
  'command-runs-section': 'What happens when someone runs it.',
  'command-feedback-section': 'What the command says back in chat.',
  'game-rule-general': 'A setting players change with the gamerule command.',
  'stat-general': 'A number the game counts for each player, shown in Statistics.',

  // Games.
  'world-setup-map': 'What kind of world your game is played in.',
  'world-setup-world': 'The land: flat, empty sky or normal.',
  'world-setup-start': 'The island players start on.',
  'world-setup-players': 'Their game mode and difficulty.',
  'world-setup-rules': 'Settings the world starts with, like keeping items on death.',
  'world-setup-new-player': 'What each new player gets at the start.',
  'one-block-live': 'What the magic block turns into as players mine it.',
  'one-block-place': 'Where the magic block is.',
  'one-block-phases': 'The stages it goes through, each with its own blocks and mobs.',
  'team-live': 'How the team looks in the game.',
  'team-general': 'Its name and colour.',
  'team-options': 'Whether teammates can hurt each other and see each other.',
  'objective-live': 'How the score looks on the screen.',
  'objective-general': 'What the score counts.',
  'objective-numbers': 'How the numbers show.',
  'timer-live': 'How the timer looks.',
  'timer-general': 'How long it runs.',
  'timer-when': 'When it starts, and what happens at the end.',
  'area-live': 'Where the area is in the world.',
  'area-general': 'Its name and size.',
  'area-reset': 'The build it is put back from.',

  // Worldgen and additions.
  'biome-climate': 'How warm and wet it is; snow falls in cold biomes.',
  'biome-colours': 'The colours of its sky, water, grass and leaves.',
  'biome-features': 'Trees, flowers, ores and the rest that grow in it.',
  'biome-carvers': 'The caves and canyons cut into it.',
  'biome-spawns': 'The mobs that appear in it.',
  'world-addition-biomes': 'The biomes it adds to.',
  'world-addition-features': 'What it adds to those biomes, like an ore.',
  'world-addition-spawns': 'Mobs it adds to those biomes.',
  'extra-drops-tables': 'Which drops get more things.',
  'extra-drops-pools': 'What is added, and how many.',
  'placed-feature-feature-section': 'What gets placed in the world.',
  'placed-feature-modifiers': 'How many, how high and how spread out.',
  'placed-feature-used-in': 'The biomes that use it.',
  'tree-trunk-section': 'The trunk: its wood and height.',
  'tree-leaves-section': 'The leaves and their shape.',
  'tree-below-section': 'What goes under the trunk, like dirt.',
  'tree-decorators-section': 'Extras on the tree, like vines or beehives.',
  'dimension-height': 'How low and high the world goes.',
  'dimension-light': 'How bright it is without torches.',
  'dimension-sky': 'Its sky, clouds and fog.',
  'dimension-time': 'Whether it has day and night.',
  'dimension-rules': 'Whether beds and compasses work, and water stays.',
  'dimension-spawning': 'How dark it must be for monsters to appear.',

  // Enchantments (live view).
  'enchantment-levels': 'How many levels it has.',
  'enchantment-effects': 'What it does at each level.',
  'enchantment-items': 'Which items it goes on.',
  'enchantment-on-item': 'How it reads on an item.',
  'enchantment-exclusive': 'Enchantments it cannot be on an item with.',
});

/** The why of the section with `testId`, if it has one. */
export function sectionWhy(testId: string): string | undefined {
  const own = WHY[testId];
  if (own !== undefined) return own;
  if (testId.endsWith('-fuel-compost')) {
    return 'Whether it burns in a furnace (coal burns 80 seconds) or goes in a composter.';
  }
  if (testId.startsWith('vanilla-rules-')) {
    return 'Vanilla blocks this changes, and what they turn into.';
  }
  return undefined;
}

/** Every section why by test id (for tests). */
export const SECTION_WHY: Readonly<Record<string, string>> = WHY;
