/**
 * Plain-language problems for Very easy mode (ADR 0083 D5): one sentence per problem code that a
 * beginner can meet through the Creator flows, Rules and the Very easy Studios, naming the thing
 * by its display name (never an id or a pointer), and the one-step fix when there is one. Codes
 * without an entry read "Something in <thing> needs fixing" with the original message behind
 * "Show details". The same words appear on Rule cards (`PlainProblemWordsContext`). Pure: no DOM,
 * no session, so it runs in Node tests.
 *
 * @packageDocumentation
 */

import type { Element, Json, Problem, Project } from '@msm/core';

/** A fix "Things to fix" offers as one click. */
export type PlainFix =
  /** Removes the rule step the problem points at (a rule book's `do` or `else` entry). */
  | 'remove-step'
  /** Opens the picture painter on the missing picture, which Save then adds to the project. */
  | 'paint-picture';

/** The button labels of the fixes. */
export const PLAIN_FIX_LABELS: Readonly<Record<PlainFix, string>> = {
  'remove-step': 'Remove this step',
  'paint-picture': 'Paint the picture',
};

/** One entry of the table: the words, given the thing's display name, and the fix. */
export interface PlainProblemEntry {
  readonly words: (thing: string) => string;
  readonly fix?: PlainFix;
}

const entry = (words: (thing: string) => string, fix?: PlainFix): PlainProblemEntry =>
  fix === undefined ? { words } : { words, fix };

const step = (words: (thing: string) => string): PlainProblemEntry => entry(words, 'remove-step');

/** The table, keyed by problem code. */
export const PLAIN_PROBLEMS: Readonly<Record<string, PlainProblemEntry>> = {
  // Rules (ADR 0082) ---------------------------------------------------------------------
  'rules.unknown-trigger': entry(
    (t) => `A rule in ${t} starts with a "When" this version of MCSuperMods does not know.`,
  ),
  'rules.unknown-step': step(
    (t) => `A step in ${t} is one this version of MCSuperMods does not know.`,
  ),
  'rules.unknown-condition': entry(
    (t) => `A rule in ${t} checks something this version of MCSuperMods does not know.`,
  ),
  'rules.unknown-value': step(
    (t) => `A step in ${t} uses a number this version of MCSuperMods does not know.`,
  ),
  'rules.unknown-place': step(
    (t) => `A step in ${t} names a place or a someone this version of MCSuperMods does not know.`,
  ),
  'rules.unknown-subject': entry(
    (t) => `A rule in ${t} is about a thing that is not in your mod any more. Pick another one.`,
  ),
  'rules.wrong-trigger': entry(
    (t) =>
      `A rule in ${t} waits for something that cannot happen to that thing. Pick another "When".`,
  ),
  'rules.needs-component': entry(
    (t) =>
      `A rule in ${t} needs its thing to be able to do this first (for example, to be thrown or to hold things).`,
  ),
  'rules.no-such-actor': step(
    (t) => `A step in ${t} names someone who is not there when the rule happens.`,
  ),
  'rules.no-such-place': step(
    (t) => `A step in ${t} says "here", but this rule does not happen in one place.`,
  ),
  'rules.cannot-stop': step(
    (t) => `A rule in ${t} tries to stop something that cannot be stopped.`,
  ),
  'rules.needs-plain': step(
    (t) => `"Light a portal" in ${t} only works in a rule without "if", "repeat" or counters.`,
  ),
  'rules.event-id-clash': entry(
    (t) => `A rule in ${t} clashes with something the thing already does. Rename the rule.`,
  ),
  'rules.too-deep': step(
    (t) => `A rule in ${t} has steps inside steps more than three times. Make it simpler.`,
  ),
  'rules.too-many-steps': entry((t) => `A rule in ${t} has more than 50 steps. Split it in two.`),
  'rules.bad-key': entry(
    (t) => `A rule in ${t} has a broken name inside. Duplicate it and delete the old one.`,
  ),
  'rules.no-scripts': entry(
    (t) => `Rules with "if", "repeat" or counters in ${t} need the Fabric version of Minecraft.`,
  ),
  'rules.duplicate-key': entry(
    (t) => `Two rules in ${t} share a name inside. Duplicate one of them and delete the original.`,
  ),
  'rules.bad-counter-name': entry((t) => `A counter in ${t} has a name that is too long or empty.`),
  'rules.duplicate-counter': entry((t) => `Two counters in ${t} have the same name.`),
  'rules.undeclared-counter': entry(
    (t) => `A rule in ${t} uses a counter that has not been made yet. Pick it again from the list.`,
  ),
  'rules.script-path-clash': entry(
    (t) => `${t} clashes with another rule book's hidden file. Rename one of the books.`,
  ),
  'rules.needs-jar': entry(() => 'Rules only work in the Fabric mod jar. Share my mod makes one.'),
  'rules.not-in-eject': entry(
    (t) => `A rule in ${t} needs code, so it does nothing in the Java project.`,
  ),

  // Blocks and items -----------------------------------------------------------------------
  'blocks-items.missing-model': entry(
    (t) => `${t} has no shape picture (model) to show. Pick a picture for it.`,
  ),
  'blocks-items.unknown-event': entry(
    (t) => `${t} runs something that is not in your mod any more.`,
  ),
  'blocks-items.event-cycle': entry(
    (t) => `${t} has actions that start each other forever. Remove one of them.`,
  ),
  'blocks-items.bad-mod-id': entry(
    () => 'Your mod has a name Minecraft cannot use. Use small letters, numbers and _ only.',
  ),
  'blocks-items.reserved-mod-id': entry(
    () => 'Your mod has a name another mod already uses. Pick another name.',
  ),
  'blocks-items.unknown-tool-tier': entry((t) => `${t} uses a tool strength that does not exist.`),
  'blocks-items.item-collision': entry(
    (t) => `${t} has the same name inside as a block's item. Rename one of them.`,
  ),
  'blocks-items.unknown-armor-material': entry(
    (t) => `${t} is made of an armour material that does not exist.`,
  ),
  'blocks-items.unknown-equipment-asset': entry(
    (t) => `${t} has no picture for how it looks when worn.`,
  ),
  'blocks-items.component-conflict': entry(
    (t) => `${t} is set to do two things when used that cannot go together. Turn one off.`,
  ),
  'blocks-items.missing-pull-model': entry((t) => `${t} has no picture for being pulled back.`),
  'blocks-items.passthrough-needs-data-pack': entry(
    (t) => `Part of ${t} only works once the world has loaded, so the game leaves it out.`,
  ),
  'blocks-items.model-not-cube': entry(
    (t) => `${t} does not look like a full block, but it acts like one. Pick a shape for it.`,
  ),
  'blocks-items.transparent-texture-on-solid-block': entry(
    (t) =>
      `The picture of ${t} has see-through parts, but the block is solid. Turn on "See-through".`,
  ),
  'blocks-items.while-worn-without-armor': entry(
    (t) => `${t} does something while worn, but it cannot be worn.`,
  ),
  'blocks-items.entity-inside-solid-block': entry(
    (t) => `Nothing can be inside ${t}, because it is a full solid block. Change its shape.`,
  ),
  'blocks-items.fast-tick-trigger': entry(
    (t) => `${t} does something big very often, which can slow the game down.`,
  ),
  'blocks-items.spawn-group-size': entry(
    (t) => `${t} has a biggest group smaller than its smallest group.`,
  ),
  'blocks-items.duplicate-biome-feature': entry(
    (t) => `${t} adds something to a place in your mod that already has it.`,
  ),
  'blocks-items.addition-vanilla-feature': entry(
    (t) =>
      `${t} adds one of the game's own world features, which can stop worlds from loading. Make your own copy of it.`,
  ),
  'blocks-items.bad-loot-pool': entry((t) => `The extra drops of ${t} are set up wrong.`),
  'blocks-items.unknown-loot-item': entry((t) => `${t} drops something that does not exist.`),
  'blocks-items.potion-effect-missing': entry(
    (t) => `${t} gives an effect that is not in your mod any more.`,
  ),
  'blocks-items.potion-duplicate-brewing': entry(
    (t) => `${t} is brewed the same way as another potion. Change what goes in.`,
  ),
  'blocks-items.potion-id-collision': entry(
    (t) => `${t} has the same name inside as another potion. Rename it.`,
  ),
  'blocks-items.potion-needs-jar': entry(
    () => 'Potions only work in the Fabric mod jar. Share my mod makes one.',
  ),
  'blocks-items.component-not-for-type': entry(
    (t) => `${t} has a setting its kind of block cannot use.`,
  ),
  'blocks-items.type-needs-appearance': entry((t) => `${t} needs pictures to show.`),
  'blocks-items.generated-model-clash': entry(
    (t) => `${t} makes a shape picture whose name another one already has.`,
  ),
  'blocks-items.unknown-model-slot': entry(
    (t) => `${t} has a picture for a side its kind of block does not have.`,
  ),
  'blocks-items.missing-model-slot': entry(
    (t) => `${t} is missing a picture for one of its sides.`,
  ),
  'blocks-items.unknown-set-type': entry(
    (t) => `${t} uses a kind of door and button sound this Minecraft does not have.`,
  ),
  'blocks-items.unknown-wood-type': entry(
    (t) => `${t} uses a kind of wood this Minecraft does not have.`,
  ),
  'blocks-items.stairs-base-unknown': entry(
    (t) => `${t} is made from a block that does not exist.`,
  ),
  'blocks-items.stairs-base-cycle': entry(
    (t) => `${t} is made from itself. Pick another block to make it from.`,
  ),
  'blocks-items.strippable-target-unknown': entry(
    (t) => `${t} turns into a block that does not exist when an axe is used on it.`,
  ),
  'blocks-items.crop-stage-heights-length': entry(
    (t) => `${t} has a different number of heights than growing steps.`,
  ),
  'blocks-items.crop-bonemeal-range': entry(
    (t) => `${t} grows more with bone meal than it has growing steps.`,
  ),
  'blocks-items.crop-without-produce': entry((t) => `${t} gives nothing when it is fully grown.`),
  'blocks-items.sapling-tree-unknown': entry(
    (t) => `${t} grows into a tree that is not in your mod any more.`,
  ),
  'blocks-items.sapling-tree-not-tree': entry(
    (t) => `${t} grows into something that is not a tree.`,
  ),
  'blocks-items.leaves-will-decay': entry(
    (t) => `${t} will disappear on its own, because no log of its tree is near it.`,
  ),
  'blocks-items.block-item-id-clash': entry(
    (t) => `${t} has an item whose name another thing already has. Rename one of them.`,
  ),
  'blocks-items.particle-on-tinted-leaves': entry(
    (t) => `The falling leaves of ${t} do not take the colour of the trees around them.`,
  ),
  'blocks-items.portal-destination-unknown': entry(
    (t) => `${t} leads to a world that does not exist.`,
  ),
  'blocks-items.portal-same-dimension': entry((t) => `${t} leads back to the world it is in.`),
  'blocks-items.portal-frame-unknown': entry(
    (t) => `The frame of ${t} is made of a block that does not exist.`,
  ),
  'blocks-items.portal-frame-block-needed': entry(
    (t) => `${t} needs a block to build its frame from.`,
  ),
  'blocks-items.portal-igniter-unknown': entry(
    (t) => `${t} is lit with an item that does not exist.`,
  ),
  'blocks-items.portal-particle-options': entry(
    (t) => `The sparkles of ${t} need a colour or a block picked.`,
  ),
  'blocks-items.portal-sound-unknown': entry((t) => `${t} plays a sound that does not exist.`),
  'blocks-items.portal-event-unknown': entry(
    (t) => `${t} runs something that is not in your mod any more when someone travels.`,
  ),
  'blocks-items.portal-frame-clash': entry(
    (t) => `${t} uses the same frame as another portal. Pick another frame block.`,
  ),
  'blocks-items.light-portal-not-portal': step(
    (t) => `A step in ${t} lights a block that is not a portal.`,
  ),
  'blocks-items.particle-lifetime-range': entry(
    (t) => `${t} lives for a shortest time longer than its longest time.`,
  ),
  'blocks-items.particle-frame-ticks-unused': entry(
    (t) => `${t} has a picture speed, but only one picture.`,
  ),
  'blocks-items.particle-description-clash': entry(
    (t) => `${t} has the same name as one of your particles. Rename it.`,
  ),
  'blocks-items.particle-needs-options': entry(
    (t) => `The particles of ${t} need a colour or a block picked.`,
  ),
  'blocks-items.particle-options-unknown-type': entry(
    (t) => `${t} uses particles that do not exist.`,
  ),
  'blocks-items.particle-options-invalid': entry(
    (t) => `The particle settings of ${t} are not right. Pick the colour or block again.`,
  ),
  'blocks-items.particle-texture-missing': entry(
    (t) => `${t} is missing one of its pictures.`,
    'paint-picture',
  ),
  'blocks-items.container-layout-fields': entry(
    (t) => `${t} has a setting that does not fit its kind of inventory.`,
  ),
  'blocks-items.keep-contents-layout': entry(
    (t) => `${t} can only keep its contents when broken if it holds 3 rows.`,
  ),
  'blocks-items.container-sound-unknown': entry(
    (t) => `${t} plays a sound that does not exist when opened or closed.`,
  ),
  'blocks-items.container-event-unknown': entry(
    (t) => `${t} runs something that is not in your mod any more when opened or closed.`,
  ),
  'blocks-items.machine-and-container': entry(
    (t) => `${t} is both a machine and a storage block. Pick one.`,
  ),
  'blocks-items.machine-recipe-type-unknown': entry(
    (t) => `${t} uses a kind of recipe that does not exist.`,
  ),
  'blocks-items.machine-recipe-item-unknown': entry(
    (t) => `A recipe of ${t} uses an item that does not exist.`,
  ),
  'blocks-items.machine-without-recipes': entry((t) => `${t} has no recipes, so it makes nothing.`),
  'blocks-items.machine-fuel-unused': entry(
    (t) => `${t} does not burn fuel, so its fuel slot stays empty.`,
  ),
  'blocks-items.machine-time-range': entry((t) => `${t} takes too long to make something.`),
  'blocks-items.machine-event-unknown': entry(
    (t) => `${t} runs something that is not in your mod any more when it works.`,
  ),
  'blocks-items.machine-recipes-without-machine': entry(
    (t) => `${t} has machine recipes but no machine to use them.`,
  ),
  'blocks-items.weathering-next-unknown': entry(
    (t) => `${t} ages into a block that is not in your mod any more. Pick another one.`,
  ),
  'blocks-items.weathering-cycle': entry(
    (t) => `${t} ages in a circle and would never stop. Let the last stage stop ageing.`,
  ),
  'blocks-items.weathering-stage-order': entry(
    (t) => `${t} skips or repeats a stage when it ages, so it ages unevenly.`,
  ),
  'blocks-items.waxable-not-weathering': entry(
    (t) => `${t} can be waxed, but it does not age. Make it age or turn waxing off.`,
  ),
  'blocks-items.waxable-target-unknown': entry(
    (t) => `${t} turns into a waxed block that is not in your mod any more. Pick another one.`,
  ),
  'blocks-items.waxed-block-invalid': entry(
    (t) =>
      `The waxed block of ${t} still ages, or is shared with another block. Give it its own waxed block that does not age.`,
  ),
  'blocks-items.max-stack-size': entry(
    (t) => `${t} holds things inside, so it can only stack to 1. Set its stack size to 1.`,
  ),

  // Mobs -----------------------------------------------------------------------------------
  'entities.unknown-event': entry((t) => `${t} runs something that is not in your mod any more.`),
  'entities.event-cycle': entry(
    (t) => `${t} has actions that start each other forever. Remove one of them.`,
  ),
  'entities.unknown-model': entry((t) => `${t} has no body shape. Pick one for it.`),
  'entities.unknown-animations': entry((t) => `${t} uses moves that do not exist.`),
  'entities.unknown-animation-name': entry((t) => `${t} plays a move it does not have.`),
  'entities.missing-texture': entry((t) => `${t} is missing its picture.`, 'paint-picture'),
  'entities.egg-texture-missing': entry(
    (t) => `The spawn egg of ${t} is missing its picture.`,
    'paint-picture',
  ),
  'entities.group-range': entry((t) => `${t} has a biggest group smaller than its smallest group.`),
  'entities.goal-needs-targets': entry((t) => `${t} is set to hunt, but has nothing to hunt.`),
  'entities.melee-without-attack': entry(
    (t) => `${t} is set to fight up close, but has no attack strength.`,
  ),
  'entities.component-needs-base': entry(
    (t) => `${t} needs to be an animal to do this. Change its kind of mob to an animal.`,
  ),
  'entities.ranged-goal-without-component': entry(
    (t) => `${t} is set to shoot, but has nothing to shoot.`,
  ),
  'entities.ranged-without-goal': entry((t) => `${t} has something to shoot, but never shoots.`),
  'entities.unknown-projectile': entry((t) => `${t} shoots something that does not exist.`),
  'entities.controlled-by-owner-needs-tameable': entry(
    (t) => `${t} can only be steered by its owner if it can be tamed.`,
  ),
  'entities.variant-texture-missing': entry(
    (t) => `One of the looks of ${t} is missing its picture.`,
    'paint-picture',
  ),
  'entities.duplicate-variant-id': entry((t) => `Two looks of ${t} have the same name.`),
  'entities.variants-without-biomes': entry(
    (t) => `One of the looks of ${t} never shows, because no place is picked for it.`,
  ),
  'entities.saddle-bone-unknown': entry((t) => `${t} has no part to put the saddle on.`),
  'entities.vanilla-renderer-subset': entry(
    (t) => `Some moves of ${t} are not shown without GeckoLib.`,
  ),
  'entities.geckolib-renderer-target': entry(
    (t) => `${t} needs GeckoLib, which this Minecraft does not have.`,
  ),
  'entities.mode-category': entry((t) => `${t} swims, but spawns like a land mob.`),
  'entities.monster-base-creature': entry(
    (t) => `${t} is a monster but spawns like a friendly animal.`,
  ),

  // Fields filled in by hand ---------------------------------------------------------------
  'schema.missing-field': entry((t) => `${t} is missing something it needs. Fill it in.`),
  'schema.unknown-field': entry((t) => `${t} has a setting Minecraft does not know.`),
  'schema.type-mismatch': entry((t) => `${t} has a setting with the wrong kind of value.`),
  'schema.out-of-range': entry((t) => `A number in ${t} is too big or too small.`),
  'schema.not-integer': entry((t) => `A number in ${t} must be a whole number.`),
  'schema.invalid-enum': entry((t) => `${t} has a choice Minecraft does not know.`),
  'schema.invalid-literal': entry((t) => `${t} has a choice Minecraft does not know.`),
  'schema.invalid-length': entry((t) => `${t} has a list or a text that is too long or too short.`),
  'schema.unknown-id': entry((t) => `${t} names something that does not exist.`),
  'schema.no-union-match': entry((t) => `${t} has a setting that is not filled in right.`),
  'schema.missing-discriminator': entry((t) => `${t} is missing what kind of thing it is.`),
  'schema.unknown-dispatch-key': entry((t) => `${t} is a kind of thing Minecraft does not know.`),

  // Vehicles ---------------------------------------------------------------------------------
  'vehicles.unknown-mode': entry((t) => `${t} moves in a way this Minecraft does not have.`),
  'vehicles.too-fast': entry(
    (t) => `${t} is too fast for the game, which would pull it back. Lower its top speed.`,
  ),
  'vehicles.takeoff-too-fast': entry(
    (t) => `${t} needs more speed to take off than it can reach, so it never leaves the ground.`,
  ),
  'vehicles.unknown-geometry': entry((t) => `${t} uses a shape (model) that is not in your mod.`),
  'vehicles.unknown-bone': entry((t) => `${t} names a part of its shape that does not exist.`),
  'vehicles.unknown-animations': entry(
    (t) => `${t} uses a set of movements that is not in your mod.`,
  ),
  'vehicles.vanilla-renderer-subset': entry(
    (t) => `${t} uses animation tricks that the plain drawing of vehicles cannot play.`,
  ),
  'vehicles.unknown-projectile': entry((t) => `${t} fires something that does not exist.`),
  'vehicles.duplicate-weapon-id': entry((t) => `Two weapons of ${t} have the same name.`),
  'vehicles.unknown-seat-weapon': entry(
    (t) => `A seat of ${t} fires a weapon the vehicle does not have.`,
  ),
  'vehicles.turret-seat-missing': entry(
    (t) => `The turret of ${t} is aimed from a seat that is not there, so nobody aims it.`,
  ),
  'vehicles.duplicate-paint-id': entry((t) => `Two paints of ${t} have the same name.`),
  'vehicles.item-used-twice': entry((t) => `${t} uses one item for two different jobs.`),
  'vehicles.item-picture-missing': entry((t) => `The item of ${t} has no picture to show.`),
  'vehicles.unknown-event': entry((t) => `${t} runs something that is not in your mod any more.`),
  'vehicles.needs-jar': entry(
    () => 'Vehicles only work in the Fabric mod jar. Share my mod makes one.',
  ),

  // Key binds and HUD ------------------------------------------------------------------------
  'controls.unknown-key': entry((t) => `${t} uses a key that Minecraft does not know.`),
  'controls.vanilla-key-clash': entry(
    (t) => `${t} uses a key that already does something in Minecraft.`,
  ),
  'controls.runtime-key-clash': entry((t) => `${t} uses a key that your vehicles already use.`),
  'controls.duplicate-key': entry((t) => `${t} uses the same key as another key bind.`),
  'controls.bad-category': entry(
    (t) => `${t} has a group name Minecraft cannot use. Use small letters, numbers and _ only.`,
  ),
  'controls.name-conflict': entry(
    (t) => `${t} shares a name with another key bind but shows different words.`,
  ),
  'controls.unknown-event': entry((t) => `${t} runs something that is not in your mod any more.`),
  'controls.key-runs-function': entry(
    (t) => `${t} runs a function, which needs permission to work in a server.`,
  ),
  'controls.vehicle-without-when': entry(
    (t) => `${t} names a vehicle but is not set to work only in it.`,
  ),
  'controls.vehicle-without-show': entry(
    (t) => `${t} names a vehicle but is not set to show only in it.`,
  ),
  'controls.unknown-vehicle': entry((t) => `${t} names a vehicle that is not in your mod.`),
  'controls.icons-need-icon': entry((t) => `${t} shows a row of icons but has no icon picked.`),
  'controls.bad-color': entry((t) => `${t} has a colour Minecraft cannot read.`),
  'controls.field-not-for-type': entry((t) => `${t} has a setting its kind of display ignores.`),
  'controls.unknown-objective': entry(
    (t) => `${t} shows a score that nothing in your mod creates yet.`,
  ),
  'controls.unknown-hud': entry((t) => `${t} changes a display that is not in your mod.`),
  'controls.needs-jar': entry(
    () =>
      'Key binds and the screen display only work in the Fabric mod jar. Share my mod makes one.',
  ),
  'export.not-in-eject': entry(
    (t) => `${t} is left out of the Java project, which has no part to run it.`,
  ),

  // Play and Share my mod ------------------------------------------------------------------
  'export.no-fabric-target': entry(
    () => 'This mod is for a Minecraft without Fabric, so it cannot be played or shared as a mod.',
  ),
  'export.runtime-missing': entry(
    () => 'MCSuperMods is missing a part it needs to build mods. Reinstall MCSuperMods.',
  ),
  'export.geckolib-missing': entry(
    () =>
      'Your mobs need GeckoLib, which could not be downloaded. Check your internet and try again.',
  ),
  'export.no-geckolib-target': entry(
    (t) => `${t} needs GeckoLib, which this Minecraft does not have.`,
  ),
};

/** What "Things to fix" and the Rule cards show for one problem. */
export interface PlainProblem {
  /** The sentence to show. */
  readonly text: string;
  /** Whether the table had words for the code (else the text is the fallback). */
  readonly known: boolean;
  /** The one-step fix, when there is one. */
  readonly fix?: PlainFix;
}

type JsonObject = { [key: string]: Json };

const asObject = (value: Json | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;

const capitalise = (text: string): string =>
  text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);

/** Words made from an id's last path part ("ruby_lamp" reads "Ruby lamp"). */
export function wordsOfId(id: string): string {
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  const last =
    path
      .split('/')
      .filter((part) => part.length > 0)
      .pop() ?? path;
  return capitalise(last.replace(/_/g, ' ').trim()) || id;
}

/** An element's display name: its `display_name` (or `name`), else words made from its id. */
export function displayNameOf(element: Element): string {
  const data = asObject(element.data);
  for (const key of ['display_name', 'name']) {
    const value = data?.[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    const object = asObject(value);
    const text = object?.text ?? object?.translate;
    if (typeof text === 'string' && text.trim() !== '') return text.trim();
  }
  return wordsOfId(element.id);
}

/** The element of `project` with `id`, if any. */
export function findProjectElement(project: Project | null, id: string): Element | undefined {
  if (project === null) return undefined;
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find((element) => element.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The display name of the thing a problem is on; "your mod" when it is on none. */
export function problemThingName(project: Project | null, problem: Problem): string {
  if (problem.elementId === undefined) return 'your mod';
  const element = findProjectElement(project, problem.elementId);
  return element === undefined ? wordsOfId(problem.elementId) : displayNameOf(element);
}

/** The plain words and fix of `problem`, with the fallback for codes the table lacks. */
export function plainProblem(problem: Problem, thing: string): PlainProblem {
  const known = PLAIN_PROBLEMS[problem.code];
  if (known === undefined) {
    return { text: `Something in ${thing} needs fixing.`, known: false };
  }
  return known.fix === undefined
    ? { text: known.words(thing), known: true }
    : { text: known.words(thing), known: true, fix: known.fix };
}

/**
 * The Rule cards' lookup (`PlainProblemWordsContext`): the table's words for a known code,
 * naming the thing from `project`; `undefined` for unknown codes, so the card keeps the message.
 */
export function plainProblemWords(
  project: Project | null,
): (problem: Problem) => string | undefined {
  return (problem) =>
    PLAIN_PROBLEMS[problem.code] === undefined
      ? undefined
      : plainProblem(problem, problemThingName(project, problem)).text;
}

/** The pointer of the rule step a problem's path is in (`/rules/0/do/2/else/1`), if any. */
export function stepPointerOf(path: string | undefined): string | null {
  if (path === undefined) return null;
  const match = /^\/rules\/\d+(?:\/(?:do|else)\/\d+)+/.exec(path);
  return match === null ? null : match[0];
}

/** `data` with the list entry at `pointer` removed; `null` when the pointer is not a list entry. */
export function removeAtPointer(data: Json, pointer: string): Json | null {
  const parts = pointer
    .split('/')
    .slice(1)
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  const index = Number(parts.pop());
  if (!Number.isInteger(index) || index < 0) return null;
  const clone = structuredClone(data) as Json;
  let at: Json | undefined = clone;
  for (const part of parts) {
    if (Array.isArray(at)) at = at[Number(part)];
    else at = asObject(at)?.[part];
    if (at === undefined) return null;
  }
  if (!Array.isArray(at) || index >= at.length) return null;
  at.splice(index, 1);
  return clone;
}

/** The value at `pointer` in `data`. */
function valueAt(data: Json, pointer: string): Json | undefined {
  let at: Json | undefined = data;
  for (const raw of pointer.split('/').slice(1)) {
    const part = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(at)) at = at[Number(part)];
    else at = asObject(at)?.[part];
    if (at === undefined) return undefined;
  }
  return at;
}

/**
 * The project picture a "Paint the picture" fix paints: the texture id at the problem's path
 * (or its `texture` field), as a namespace and an asset path under `assets/<namespace>/`.
 * `null` when the problem names no texture id.
 */
export function missingPictureOf(
  project: Project | null,
  problem: Problem,
  texturesFolder = 'textures',
): { namespace: string; path: string } | null {
  if (problem.elementId === undefined) return null;
  const element = findProjectElement(project, problem.elementId);
  if (element === undefined) return null;
  const at = valueAt(element.data, problem.path ?? '');
  const id = typeof at === 'string' ? at : asObject(at)?.texture;
  if (typeof id !== 'string' || id.trim() === '') return null;
  const namespace = id.includes(':') ? id.slice(0, id.indexOf(':')) : 'minecraft';
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  if (namespace === 'minecraft' || path === '') return null;
  const relative = path.endsWith('.png') ? path : `${path}.png`;
  return {
    namespace,
    path: relative.startsWith(`${texturesFolder}/`) ? relative : `${texturesFolder}/${relative}`,
  };
}
