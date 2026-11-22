// B650 spike (throwaway): a first draft of the vocabulary the plugins will own (ADR 0124 D5,
// D7). In the built feature these lines live in each plugin's `src/search.ts`; here they are one
// file so the spike can measure them. Vanilla ids are named only by id, never by the jar's text.

export interface WordGroup {
  idea: string;
  same: string[];
  near?: string[];
  phrases?: string[];
  vanillaIds?: string[];
}

export interface Colour {
  names: string[];
  colour: string;
}

export interface Behaviour {
  id: string;
  phrases: string[];
  sentence: string;
  appliesTo: ('item' | 'block' | 'mob' | 'vehicle')[];
  answers?: Record<string, Record<string, unknown>>;
  rule?: { when: string; do: string; with?: Record<string, unknown> };
  beside?: { starter: string; values: Record<string, unknown> };
  /** Flows this behaviour points to as the thing itself ("that you can ride": the Mount flow). */
  flows?: string[];
  /** Nothing in MSM makes it today: a gap for the coverage audit. */
  gap?: string;
}

export const WORD_GROUPS: WordGroup[] = [
  { idea: 'sword', same: ['sword', 'blade', 'katana', 'sabre', 'saber', 'cutlass', 'rapier'], vanillaIds: ['minecraft:iron_sword'] },
  { idea: 'pickaxe', same: ['pickaxe', 'pick', 'pickax', 'pikaxe'], phrases: ['pick axe'], vanillaIds: ['minecraft:iron_pickaxe'] },
  { idea: 'axe', same: ['axe', 'hatchet'] },
  { idea: 'experience', same: ['experience', 'xp', 'exp', 'orbs'], phrases: ['experience orbs'] },
  { idea: 'mob', same: ['mob', 'creature', 'monster', 'animal', 'beast', 'enemy', 'npc'], near: ['entity'] },
  { idea: 'armour', same: ['armour', 'chestplate', 'helmet', 'leggings', 'boots'], near: ['gear'] },
  { idea: 'gear', same: ['gear', 'tools', 'toolset', 'set'], near: ['equipment'] },
  { idea: 'weapon', same: ['weapon', 'weapons'], near: ['sword', 'bow'] },
  { idea: 'block', same: ['block', 'cube'] },
  { idea: 'ore', same: ['ore', 'gem', 'mineral'] },
  { idea: 'teleport', same: ['teleport', 'tp', 'warp'] },
  { idea: 'skyblock', same: ['skyblock', 'sky island', 'void world'], phrases: ['sky block', 'empty sky', 'one island'] },
  { idea: 'fly', same: ['fly', 'flying', 'flies', 'flyer', 'wings', 'winged'] },
  { idea: 'fire', same: ['fire', 'burn', 'burning', 'flame', 'flames', 'ignite', 'blaze'], phrases: ['on fire', 'sets on fire', 'set on fire', 'catches fire'] },
  { idea: 'pet', same: ['pet', 'tame', 'tameable', 'companion'] },
  { idea: 'mount', same: ['mount', 'ride', 'rideable', 'saddle', 'steed'] },
  { idea: 'vehicle', same: ['vehicle', 'vehical', 'vehicel', 'car', 'kart', 'truck', 'tank', 'plane', 'aeroplane', 'airplane', 'jet', 'boat'] },
  { idea: 'dimension', same: ['dimension', 'realm', 'world'], near: ['portal'] },
  { idea: 'texture', same: ['texture', 'picture', 'skin', 'image', 'png', 'sprite'] },
  { idea: 'recipe', same: ['recipe', 'crafting', 'craft'] },
  { idea: 'loot', same: ['loot', 'drops', 'drop', 'reward'] },
  { idea: 'advancement', same: ['advancement', 'achievement', 'goal'] },
  { idea: 'food', same: ['food', 'snack', 'meal', 'eat', 'edible'] },
  { idea: 'potion', same: ['potion', 'brew', 'elixir', 'flask'] },
  { idea: 'effect', same: ['effect', 'buff', 'debuff', 'status'] },
  { idea: 'particle', same: ['particle', 'particles', 'sparkles', 'sparkle', 'glitter'] },
  { idea: 'music', same: ['music', 'song', 'disc', 'record', 'tune'] },
  { idea: 'jar', same: ['jar', 'mod jar', 'fabric'] },
  { idea: 'mace', same: ['mace', 'hammer', 'club'] },
  { idea: 'wand', same: ['wand', 'staff', 'magic'] },
  { idea: 'villager', same: ['villager', 'trader', 'merchant', 'shopkeeper'] },
  { idea: 'boss', same: ['boss', 'miniboss'] },
  { idea: 'rules', same: ['rule', 'rules', 'trigger', 'event'], near: ['when'] },
  { idea: 'script', same: ['script', 'code', 'javascript', 'typescript'] },
  { idea: 'command', same: ['command', 'slash'] },
  { idea: 'hud', same: ['hud', 'overlay', 'screen'] },
  { idea: 'zombie', same: ['zombie', 'zombies', 'undead'], vanillaIds: ['minecraft:zombie'] },
  { idea: 'creeper', same: ['creeper', 'creepers'], vanillaIds: ['minecraft:creeper'] },
  { idea: 'pig', same: ['pig', 'pigs', 'piggy', 'hog'], vanillaIds: ['minecraft:pig'] },
  { idea: 'diamond', same: ['diamond', 'diamonds', 'dia'], vanillaIds: ['minecraft:diamond'] },
  { idea: 'netherite', same: ['netherite', 'nethrite'], vanillaIds: ['minecraft:netherite_ingot'] },
  { idea: 'glow', same: ['glow', 'glows', 'glowing', 'light', 'shiny', 'bright', 'luminous'] },
  { idea: 'explode', same: ['explode', 'explodes', 'explosion', 'boom', 'blow', 'tnt', 'bomb'] },
  { idea: 'chest', same: ['chest', 'storage', 'crate', 'box', 'container', 'barrel'] },
  { idea: 'backpack', same: ['backpack', 'bag', 'pouch', 'satchel', 'rucksack'] },
  { idea: 'world', same: ['world', 'map', 'terrain', 'land'] },
  { idea: 'shader', same: ['shader', 'shaders', 'post effect'] },
  { idea: 'settings', same: ['settings', 'options', 'preferences', 'setting'] },
];

export const COLOURS: Colour[] = [
  { names: ['white'], colour: '#f9fffe' },
  { names: ['orange'], colour: '#f9801d' },
  { names: ['magenta'], colour: '#c74ebd' },
  { names: ['light blue', 'sky blue'], colour: '#3ab3da' },
  { names: ['yellow'], colour: '#fed83d' },
  { names: ['lime', 'light green'], colour: '#80c71f' },
  { names: ['pink'], colour: '#f38baa' },
  { names: ['grey', 'gray', 'dark grey'], colour: '#474f52' },
  { names: ['light grey', 'light gray', 'silver'], colour: '#9d9d97' },
  { names: ['cyan', 'teal', 'turquoise'], colour: '#169c9c' },
  { names: ['purple', 'violet'], colour: '#8932b8' },
  { names: ['blue', 'navy', 'dark blue'], colour: '#3c44aa' },
  { names: ['brown'], colour: '#835432' },
  { names: ['green', 'dark green'], colour: '#5e7c16' },
  { names: ['red', 'crimson', 'scarlet'], colour: '#b02e26' },
  { names: ['black'], colour: '#1d1d21' },
  { names: ['ruby'], colour: '#c41c34' },
  { names: ['emerald'], colour: '#17dd62' },
  { names: ['sapphire'], colour: '#2454c4' },
  { names: ['amethyst'], colour: '#9a5cc6' },
  { names: ['gold', 'golden'], colour: '#fdf55f' },
];

export const BEHAVIOURS: Behaviour[] = [
  { id: 'glows', phrases: ['glows', 'glow', 'gives light', 'lights up', 'shines'], sentence: 'Gives off light.', appliesTo: ['block'], answers: { 'simple-block': { light_level: 15 } } },
  { id: 'explodes-broken', phrases: ['explodes', 'blows up', 'goes boom'], sentence: 'When a player breaks it, make an explosion.', appliesTo: ['block'], rule: { when: 'block_broken', do: 'explode', with: { power: 3 } } },
  { id: 'explodes-used', phrases: ['explodes', 'blows up'], sentence: 'When a player uses it, make an explosion.', appliesTo: ['item'], rule: { when: 'item_used', do: 'explode', with: { power: 3 } } },
  { id: 'drops-xp', phrases: ['drops xp', 'drops experience', 'gives xp', 'gives experience'], sentence: 'When a player breaks it, give experience.', appliesTo: ['block'], rule: { when: 'block_broken', do: 'give_experience', with: { amount: 5 } } },
  { id: 'mob-drops-xp', phrases: ['drops xp', 'drops experience'], sentence: 'When it dies, give experience.', appliesTo: ['mob'], rule: { when: 'mob_died', do: 'give_experience', with: { amount: 10 } } },
  { id: 'sets-on-fire', phrases: ['sets mobs on fire', 'sets on fire', 'set on fire', 'burns mobs', 'sets things on fire', 'fire aspect'], sentence: 'An enchantment for it that sets the target on fire.', appliesTo: ['item'], beside: { starter: 'enchantment', values: { effect: 'fire', applies_to: 'swords' } } },
  { id: 'gives-speed', phrases: ['gives speed', 'makes you fast', 'makes you faster', 'run faster'], sentence: 'When a player uses it, give Speed.', appliesTo: ['item'], rule: { when: 'item_used', do: 'give_effect', with: { effect: 'minecraft:speed', seconds: 30 } } },
  { id: 'ride', phrases: ['you can ride', 'can ride', 'to ride', 'rideable'], sentence: 'You can ride it.', appliesTo: ['mob'], flows: ['mount'] },
  { id: 'flies', phrases: ['flies', 'can fly', 'that fly'], sentence: 'It flies.', appliesTo: ['mob'], flows: ['flying-mob'], answers: { mount: { flying: true } } },
  { id: 'heals', phrases: ['heals you', 'heals', 'gives health'], sentence: 'When a player uses it, heal 4 half hearts.', appliesTo: ['item'], rule: { when: 'item_used', do: 'heal', with: { amount: 4 } } },
  { id: 'teleports', phrases: ['teleports you', 'teleports'], sentence: 'When a player uses it, teleport them.', appliesTo: ['item'], rule: { when: 'item_used', do: 'teleport' } },
  { id: 'shoots-arrows', phrases: ['shoots arrows', 'shoots'], sentence: 'It shoots arrows at players.', appliesTo: ['mob'], answers: { 'flying-mob': { behaviour: 'shooter', projectile: 'minecraft:arrow' } } },
  { id: 'poisons', phrases: ['poisons', 'poisons mobs', 'is poisonous'], sentence: 'An enchantment for it that poisons the target.', appliesTo: ['item'], beside: { starter: 'enchantment', values: { effect: 'mob_effect', hit_effect: 'minecraft:poison' } } },
  { id: 'friendly', phrases: ['is friendly', 'is peaceful', 'does not attack'], sentence: 'It never fights.', appliesTo: ['mob'], answers: { 'flying-mob': { behaviour: 'peaceful' } } },
  { id: 'attacks', phrases: ['attacks players', 'attacks you', 'is hostile', 'is evil'], sentence: 'It attacks players.', appliesTo: ['mob'], answers: { 'flying-mob': { behaviour: 'hostile' } } },
  { id: 'step-launch', phrases: ['bounces you', 'launches you', 'jump pad', 'throws you up'], sentence: 'When something steps on it, launch it up.', appliesTo: ['block'], rule: { when: 'block_stepped_on', do: 'launch' } },
  { id: 'grows', phrases: ['grows', 'you can plant', 'can be planted'], sentence: 'It grows like a crop.', appliesTo: ['block'], flows: ['crop'] },
  { id: 'drops-item', phrases: ['drops diamonds', 'drops'], sentence: 'When a player breaks it, drop an item.', appliesTo: ['block'], rule: { when: 'block_broken', do: 'drop_item' } },
  { id: 'spawns-mob', phrases: ['spawns zombies', 'spawns mobs', 'summons'], sentence: 'When a player uses it, spawn a mob.', appliesTo: ['block', 'item'], rule: { when: 'item_used', do: 'spawn_mob' } },
  { id: 'plays-music', phrases: ['plays music', 'plays a song', 'makes a sound'], sentence: 'When a player uses it, play a sound.', appliesTo: ['block', 'item'], rule: { when: 'block_used', do: 'play_sound' } },
  { id: 'jump-higher', phrases: ['makes you jump higher', 'jump higher', 'jump boost'], sentence: 'When a player uses it, give Jump boost.', appliesTo: ['item'], rule: { when: 'item_used', do: 'give_effect', with: { effect: 'minecraft:jump_boost', seconds: 30 } } },
  { id: 'slows', phrases: ['slows mobs', 'freezes mobs', 'slows down'], sentence: 'An enchantment for it that gives the target Slowness.', appliesTo: ['item'], beside: { starter: 'enchantment', values: { effect: 'mob_effect', hit_effect: 'minecraft:slowness' } } },
  { id: 'message', phrases: ['sends a message', 'says hello', 'talks'], sentence: 'When a player uses it, show a chat message.', appliesTo: ['block', 'item', 'mob'], rule: { when: 'block_used', do: 'show_message' } },
  { id: 'mines-faster', phrases: ['mines faster', 'breaks blocks faster', 'digs faster'], sentence: 'An enchantment for it that mines faster.', appliesTo: ['item'], beside: { starter: 'enchantment', values: { effect: 'mining_speed', applies_to: 'tools' } } },
  { id: 'knocks-back', phrases: ['knocks back', 'knockback', 'pushes mobs away'], sentence: 'An enchantment for it with extra knockback.', appliesTo: ['item'], beside: { starter: 'enchantment', values: { effect: 'knockback' } } },
  { id: 'eat', phrases: ['you can eat', 'can be eaten', 'is edible'], sentence: 'You can eat it.', appliesTo: ['item'], flows: ['food'] },
  { id: 'stores', phrases: ['stores items', 'holds items', 'keeps items'], sentence: 'It stores items.', appliesTo: ['block', 'item'], flows: ['storage-crate', 'backpack'] },
  { id: 'follows', phrases: ['follows you', 'is tame', 'you can tame'], sentence: 'You can tame it and it follows you.', appliesTo: ['mob'], flows: ['pet'] },
  { id: 'invisible', phrases: ['makes you invisible', 'invisibility'], sentence: 'When a player uses it, give Invisibility.', appliesTo: ['item'], rule: { when: 'item_used', do: 'give_effect', with: { effect: 'minecraft:invisibility', seconds: 30 } } },
  { id: 'rain', phrases: ['makes it rain', 'summons a storm', 'changes the weather'], sentence: 'When a player uses it, set the weather to rain.', appliesTo: ['item', 'block'], rule: { when: 'item_used', do: 'set_weather', with: { weather: 'rain' } } },
  { id: 'unbreakable', phrases: ['never breaks', 'is unbreakable', 'unbreakable'], sentence: 'It never wears out.', appliesTo: ['item'], gap: 'No flow answer makes an item unbreakable; only Advanced through `msm:components` (`minecraft:unbreakable`).' },
  { id: 'walk-on-water', phrases: ['walks on water', 'freezes water', 'frost walker'], sentence: 'Freezes water under you.', appliesTo: ['item'], gap: 'The Enchantment flow has no Frost Walker-like effect; the Rules have no step that replaces nearby blocks in an area.' },
  { id: 'lightning', phrases: ['strikes lightning', 'summons lightning', 'calls lightning'], sentence: 'When it hits a mob, strike lightning there.', appliesTo: ['item'], rule: { when: 'item_hit_mob', do: 'spawn_mob', with: { mob: 'minecraft:lightning_bolt' } } },
  { id: 'mob-sets-fire', phrases: ['sets players on fire', 'burns players'], sentence: 'Its attacks set the target on fire.', appliesTo: ['mob'], gap: 'No Rules step or Script API member sets an entity on fire; a mob has no "on fire" attack answer.' },
];

/**
 * Draft `keywords` for starters, flows and tiles (ADR 0124 D13: `ProjectStarter.keywords`), by
 * corpus entry id. In the built feature they live on the starters in the library plugin.
 */
export const FLOW_KEYWORDS: Record<string, string[]> = {
  'flow:weapon': ['sword', 'bow', 'spear', 'mace', 'crossbow', 'shield', 'weapon', 'blade', 'op', 'overpowered'],
  'flow:gear-set': ['armour', 'tools', 'pickaxe', 'axe', 'shovel', 'hoe', 'helmet', 'chestplate', 'leggings', 'boots', 'gear', 'set', 'material'],
  'tile:armour': ['armour', 'armor'],
  'flow:flying-mob': ['fly', 'flies', 'flying', 'bird', 'bat', 'wings'],
  'flow:mount': ['ride', 'mount', 'saddle', 'horse', 'rideable'],
  'flow:pet': ['pet', 'tame', 'dog', 'doggo', 'puppy', 'cat', 'kitty', 'follows'],
  'flow:custom_ore': ['ore', 'gem', 'mineral'],
  'flow:world-empty-sky': ['skyblock', 'void', 'sky', 'island', 'empty'],
  'flow:simple-block': ['block', 'cube'],
  'flow:lights': ['light', 'lamp', 'torch', 'lantern', 'glowing', 'coloured'],
  'flow:music-disc-item': ['music', 'disc', 'record', 'song'],
  'flow:stone-set': ['stairs', 'slabs', 'walls', 'bricks'],
  'flow:glider': ['glider', 'wings', 'elytra'],
  'flow:scripted-item': ['wand', 'staff', 'magic', 'spell'],
  'flow:vehicle-car': ['car', 'drive', 'kart'],
  'flow:dimension': ['dimension', 'realm'],
  'starter:recipe_pack': ['recipe', 'crafting'],
  'starter:data_pack': ['datapack', 'data pack'],
  'setting:other-launchers': ['prism', 'multimc', 'polymc', 'curseforge', 'launcher'],
  'setting:official-launcher-folder': ['minecraft', 'folder', 'launcher', 'install'],
  'setting:check-for-updates-automatically': ['automatic', 'updates', 'update'],
  'setting:keep-world-backups': ['backup', 'backups', 'world'],
  'setting:ai-helper-key': ['ai', 'key', 'claude', 'api'],
  'command:exportFabricJar': ['jar', 'mod jar', 'build', 'fabric'],
  'command:whatsNew': ['whats', 'new', 'changelog', 'news'],
  'command:importBlockbench': ['blockbench', 'bbmodel', 'model'],
};
