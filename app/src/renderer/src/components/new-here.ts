/**
 * The words of each Studio's **New here?** tip (ADR 0130 D2): what a thing of the kind needs and
 * how to try it, in plain words (no ids). A kind without its own words gets the general tip.
 *
 * @packageDocumentation
 */

/** The general tip. */
export const NEW_HERE_GENERAL =
  'Change the settings below; the live view beside them follows. What you rarely need is under More options at the bottom of each part.';

const TIPS: Readonly<Record<string, string>> = Object.freeze({
  'msm:block':
    'A block needs a name and a picture. Everything else is optional. Press Try it to place it and break it.',
  'msm:item':
    'An item needs a name and a picture. Everything else is optional. Press Try it to hold it.',
  'msm:entity':
    'A mob needs a name, a look and its health. Press Try it to hatch it from its egg and watch what it does.',
  'msm:effect':
    'An effect needs a name, a colour and an icon. Give it to players with a potion or a rule.',
  'msm:potion': 'A potion needs a name and the effects it gives. Brewing says how players make it.',
  'msm:particle':
    'Particles need pictures. The preview shows them moving; use them in a rule or on a block.',
  'msm:fluid': 'A liquid needs a name, a colour and how far it flows. Players get a bucket of it.',
  'msm:vehicle':
    'A vehicle needs a model, how fast it goes and its seats. Press Try it to put it down and drive it.',
  'msm:rules': 'Each rule says when something happens and what to do then, in plain sentences.',
  'msm:command': 'A command needs the word players type after the slash and what it does.',
  'msm:key_bind': 'A key needs a name and the key it starts on. Rules say what it does.',
  'msm:hud':
    'Something on screen needs what it shows and where. The preview shows the game screen.',
  'msm:creative_tab': 'A creative tab needs a name, a picture and what is in it.',
  'msm:villager_profession':
    'A village job needs a work block and its trades. Villagers near the block take the job.',
  'msm:villager_type': 'A villager look needs the biomes it is born in and its clothes.',
  'msm:game_rule': 'A game rule needs a name and what it starts as. Rules can read it.',
  'msm:stat': 'A statistic needs a name. Rules count it up for each player.',
  'msm:world_setup':
    'A world for your game needs the kind of land and where players start. Play my game opens it.',
  'msm:one_block': 'The magic block needs its stages: what it turns into as players mine it.',
  'msm:team': 'A team needs a name and a colour.',
  'msm:objective': 'A score needs a name and what it counts.',
  'msm:timer': 'A timer needs how long it runs and what happens at the end.',
  'msm:area': 'An area needs where it is and the build it is put back from.',
  'minecraft:recipe':
    'A recipe needs what goes in and what comes out. Lay it out on the crafting grid.',
  'minecraft:function':
    'A function is a list of commands, one per line. Rules can run it, and Try it runs it here.',
});

/** The New here? tip of `kind`. */
export function newHereTip(kind: string): string {
  if (kind.startsWith('minecraft:tag/')) {
    return 'A group lists things that belong together, so rules and recipes can name them all at once.';
  }
  if (kind.startsWith('minecraft:worldgen/') || kind === 'msm:biome_addition') {
    return 'This shapes the world. The live map beside it shows the land as you change it.';
  }
  return TIPS[kind] ?? NEW_HERE_GENERAL;
}
