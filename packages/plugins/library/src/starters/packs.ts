/**
 * The minimal starters: blank, resource pack, data pack and combined (ADR 0020, section 2.2
 * of the library plan). Each fills one layer (or both) with just enough to see the pack work
 * in game.
 */
import type { BundleContext, ContentBundle } from '@msm/plugin-api';
import {
  COLOURS,
  concatBundles,
  element,
  KINDS,
  packElement,
  rl,
  texture,
} from '../content/bundle';

/** The blank starter: no content; the host adds `<namespace>:pack`. */
export function blankBundle(): ContentBundle {
  return { elements: [], assets: [] };
}

/**
 * Resource pack content without `pack.mcmeta`: a painted stick model, its texture, the
 * vanilla stick's item definition pointing at it and a language file renaming the stick.
 */
export function resourcePackContent({ namespace }: BundleContext): ContentBundle {
  return {
    elements: [
      element(
        rl(namespace, 'item/painted_stick'),
        KINDS.model,
        {
          parent: 'minecraft:item/generated',
          textures: { layer0: rl(namespace, 'item/painted_stick') },
        },
        'A flat item model drawn from one texture. Replace textures/item/painted_stick.png with your own 16x16 picture to change how the stick looks.',
      ),
      element(
        'minecraft:stick',
        KINDS.itemDefinition,
        { model: { type: 'minecraft:model', model: rl(namespace, 'item/painted_stick') } },
        'Overrides the vanilla stick so it uses the painted stick model. Item definitions live in the namespace of the item they change, here minecraft.',
      ),
      element(
        rl(namespace, 'en_us'),
        KINDS.lang,
        { 'item.minecraft.stick': 'Painted Stick' },
        'Renames the vanilla stick in English. Any language file may override any key, including keys of the minecraft namespace.',
      ),
    ],
    assets: [texture(namespace, 'item/painted_stick', 'gem', COLOURS.amber)],
  };
}

/**
 * Data pack content without `pack.mcmeta`: a `load` function run by `#minecraft:load`, a
 * `greet` function and one shaped recipe.
 */
export function dataPackContent({ namespace }: BundleContext): ContentBundle {
  return {
    elements: [
      element(
        rl(namespace, 'load'),
        KINDS.function,
        {
          lines: [
            '# Runs on every /reload through the #minecraft:load function tag.',
            `tellraw @a {"text":"${namespace} loaded. Run /function ${namespace}:greet","color":"green"}`,
          ],
        },
        'Runs once each time the data pack loads, because the minecraft:load function tag lists it.',
      ),
      element(
        rl(namespace, 'greet'),
        KINDS.function,
        {
          lines: [
            `# Run with /function ${namespace}:greet`,
            'say Hello from my data pack!',
            'give @s minecraft:cobblestone 4',
          ],
        },
        'A function you run yourself. Each line is one command, without the leading slash.',
      ),
      element(
        'minecraft:load',
        KINDS.tagFunction,
        { values: [rl(namespace, 'load')] },
        'The game runs every function in #minecraft:load when the data pack loads.',
      ),
      element(
        rl(namespace, 'mossy_cobblestone_from_vines'),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'building',
          pattern: ['CV', 'VC'],
          key: { C: 'minecraft:cobblestone', V: 'minecraft:vine' },
          result: { id: 'minecraft:mossy_cobblestone', count: 2 },
        },
        'A shaped crafting recipe: each letter of the pattern stands for the ingredient in key. Try it in a crafting table after /reload.',
      ),
    ],
    assets: [],
  };
}

export function resourcePackBundle(context: BundleContext): ContentBundle {
  return concatBundles(
    {
      elements: [packElement(context.namespace, `${context.projectName}: a painted stick`)],
      assets: [],
    },
    resourcePackContent(context),
  );
}

export function dataPackBundle(context: BundleContext): ContentBundle {
  return concatBundles(
    {
      elements: [
        packElement(
          context.namespace,
          `${context.projectName}: /function ${context.namespace}:greet`,
        ),
      ],
      assets: [],
    },
    dataPackContent(context),
  );
}

export function combinedBundle(context: BundleContext): ContentBundle {
  return concatBundles(
    {
      elements: [packElement(context.namespace, `${context.projectName}: resources and data`)],
      assets: [],
    },
    resourcePackContent(context),
    dataPackContent(context),
  );
}
