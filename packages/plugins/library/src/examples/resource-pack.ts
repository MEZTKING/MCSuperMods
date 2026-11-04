/**
 * One commented example per resource pack kind.
 */
import type { ExampleProject } from '@msm/plugin-api';
import { COLOURS, element, KINDS, rl, texture } from '../content/bundle';
import { defineExample } from './define';

export const resourcePackExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_model',
    title: 'Block model',
    description: 'A full-cube block model with one texture on every side.',
    kind: KINDS.model,
    category: 'Models',
    tags: ['block', 'texture', 'cube_all'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'block/polished_ruby');
      return {
        elements: [
          element(
            id,
            KINDS.model,
            { parent: 'minecraft:block/cube_all', textures: { all: id } },
            'parent borrows the shape of the vanilla model block/cube_all, a full cube. textures fills the texture variables the parent declares; cube_all has one, all, used on every face. The texture id names textures/block/polished_ruby.png in this namespace. A blockstate (or an item definition) has to point at the model before the game shows it.',
          ),
        ],
        assets: [texture(namespace, 'block/polished_ruby', 'plain', COLOURS.ruby)],
      };
    },
  }),
  defineExample({
    id: 'example_block_definition',
    title: 'Blockstate with rotation',
    description: 'A pillar blockstate that turns one model to follow the axis property.',
    kind: KINDS.blockDefinition,
    category: 'Blockstates',
    tags: ['variants', 'rotation', 'axis'],
    build: ({ namespace }) => {
      const model = rl(namespace, 'block/ruby_pillar');
      return {
        elements: [
          element(
            rl(namespace, 'ruby_pillar'),
            KINDS.blockDefinition,
            {
              variants: {
                'axis=y': { model },
                'axis=z': { model, x: 90 },
                'axis=x': { model, x: 90, y: 90 },
              },
            },
            'Each key of variants is a combination of block properties, here the axis a pillar lies along. Every variant names a model and may rotate it in steps of 90 degrees around x and y. The game reads a blockstate only for a block that exists, so this one shows how the file works; to see it in game, give it the id of a vanilla pillar such as minecraft:quartz_pillar.',
          ),
          element(
            model,
            KINDS.model,
            {
              parent: 'minecraft:block/cube_column',
              textures: {
                end: rl(namespace, 'block/ruby_pillar_top'),
                side: rl(namespace, 'block/ruby_pillar'),
              },
            },
            'cube_column uses the end texture on the top and bottom and the side texture on the four sides.',
          ),
        ],
        assets: [
          texture(namespace, 'block/ruby_pillar', 'plain', COLOURS.ruby),
          texture(namespace, 'block/ruby_pillar_top', 'ore', COLOURS.ruby),
        ],
      };
    },
  }),
  defineExample({
    id: 'example_item_definition',
    title: 'Item definition by display context',
    description: 'An item that looks different in inventories than in the hand.',
    kind: KINDS.itemDefinition,
    category: 'Item definitions',
    tags: ['select', 'display_context', 'item_model'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'ruby_wand');
      const held = rl(namespace, 'item/ruby_wand');
      const icon = rl(namespace, 'item/ruby_wand_icon');
      return {
        elements: [
          element(
            id,
            KINDS.itemDefinition,
            {
              model: {
                type: 'minecraft:select',
                property: 'minecraft:display_context',
                cases: [{ when: 'gui', model: { type: 'minecraft:model', model: icon } }],
                fallback: { type: 'minecraft:model', model: held },
              },
            },
            `An item definition says which model an item uses. A select model picks one by a property, here the display context: gui (inventories) shows the icon, every other context the fallback. Item definitions in your own namespace are used by items whose item_model component names them; try /give @s minecraft:stick[minecraft:item_model="${id}"].`,
          ),
          element(
            held,
            KINDS.model,
            { parent: 'minecraft:item/handheld', textures: { layer0: held } },
            'item/handheld holds the item like a tool.',
          ),
          element(
            icon,
            KINDS.model,
            { parent: 'minecraft:item/generated', textures: { layer0: icon } },
            'The inventory icon, a flat item model.',
          ),
        ],
        assets: [
          texture(namespace, 'item/ruby_wand', 'plain', COLOURS.amber),
          texture(namespace, 'item/ruby_wand_icon', 'gem', COLOURS.ruby),
        ],
      };
    },
  }),
  defineExample({
    id: 'example_lang',
    title: 'Language file',
    description: 'English names for your content, and a renamed vanilla item.',
    kind: KINDS.lang,
    category: 'Text',
    tags: ['translation', 'en_us', 'names'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'en_us'),
          KINDS.lang,
          {
            [`item.${namespace}.ruby`]: 'Ruby',
            [`block.${namespace}.ruby_block`]: 'Block of Ruby',
            [`${namespace}.message.welcome`]: 'Welcome, %s!',
            'item.minecraft.emerald': 'Shiny Emerald',
          },
          `The element id names the language: en_us is English (US); add de_de, fr_fr and so on next to it. Keys are free text, but the game builds item.<namespace>.<name> and block.<namespace>.<name> keys itself. %s marks a value filled in by the text component that uses the key, for example tellraw @s {"translate":"${namespace}.message.welcome","with":["Alex"]}. Any language file may also override vanilla keys, here the emerald's name.`,
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_sounds',
    title: 'Sound events',
    description: 'A new sound event that plays vanilla sound files at random.',
    kind: KINDS.sounds,
    category: 'Sounds',
    tags: ['sounds.json', 'sound event', 'playsound'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'sounds'),
          KINDS.sounds,
          {
            'ruby.chime': {
              subtitle: `subtitles.${namespace}.ruby.chime`,
              sounds: [
                'minecraft:block/amethyst/resonate1',
                { name: 'minecraft:block/amethyst/resonate2', pitch: 1.5, volume: 0.8 },
              ],
            },
          },
          `There is one sounds element per namespace, always named sounds. Each key is a sound event, here ${namespace}:ruby.chime; the game picks one entry of sounds at random each time it plays. An entry is a sound file id (an .ogg under sounds/) or an object that also sets pitch, volume, weight or stream. Try /playsound ${namespace}:ruby.chime master @s, and import your own .ogg files to replace the vanilla ones.`,
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_pack_mcmeta',
    title: 'Pack metadata',
    description: 'The pack.mcmeta description shown in the pack lists.',
    kind: KINDS.pack,
    category: 'Pack',
    tags: ['pack.mcmeta', 'description'],
    build: ({ namespace, projectName }) => ({
      elements: [
        element(
          rl(namespace, 'pack'),
          KINDS.pack,
          { pack: { description: `${projectName}: made with MCSuperMods` } },
          'Every pack needs a pack.mcmeta. MSM writes one into the resource pack and one into the data pack from this element, and fills in the pack format of the target version for you. Only the description is yours to edit; it is shown in the resource pack screen and in /datapack list. A project needs only one pack element.',
        ),
      ],
      assets: [],
    }),
  }),
];
