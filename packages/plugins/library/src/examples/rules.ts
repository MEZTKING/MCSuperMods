/**
 * The Rules examples (ADR 0082 D11): "Rules: a lucky block", the per-kind example of
 * `msm:rules` (a block, an item and a rule book with a chance, a random reward and a counter),
 * and "Rules: a guard mob", a rules behaviour example (a mob whose book runs every few seconds
 * and does something for each player nearby).
 *
 * The subjects are the example's own block, item and mob; none of the triggers used needs a
 * component the subject lacks (`msm:container`, `msm:machine`, `msm:attack`, `msm:throwable`
 * or `msm:armor`), so the books compile with zero problems. Both books need a script, so they
 * work in the Fabric mod jar export only; rule books leave nothing in the vanilla packs.
 */
import type { ExampleProject, Json } from '@msm/plugin-api';
import { COLOURS, element, itemModel, KINDS, rl, texture } from '../content/bundle';
import { hasFabric } from '../content/supports';
import { defineExample } from './define';
import { presetMob } from './entities';

/** The kind of rule books (`@msm/plugin-rules`); the library does not import the plugin. */
export const RULES_KIND = 'msm:rules';

/** The gallery category of the Rules examples. */
const CATEGORY = 'Rules';

/** Rule book data with its counters. */
const book = (rules: Json[], counters: Json[] = []): Json => ({ counters, format: 1, rules });

/** The per-kind example of `msm:rules`: the lucky block. */
export const rulesKindExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_rules',
    title: 'Rules: a lucky block',
    description:
      'A lucky block and a lucky coin made with rules, no code: breaking the block is a gamble between a few coins and a silverfish, a counter keeps score, and spending a coin gives Luck.',
    kind: RULES_KIND,
    category: CATEGORY,
    tags: ['rules', 'chance', 'random', 'counter', 'block_broken', 'item_used', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => {
      const block = rl(namespace, 'lucky_block');
      const blockModel = rl(namespace, 'block/lucky_block');
      const coin = rl(namespace, 'lucky_coin');
      const counter = { counter: 'lucky_blocks', scope: 'player', value: 'counter' };
      return {
        elements: [
          element(
            rl(namespace, 'lucky_block_rules'),
            RULES_KIND,
            book(
              [
                {
                  do: [
                    { amount: 1, counter: 'lucky_blocks', scope: 'player', step: 'add_to_counter' },
                    {
                      conditions: [{ condition: 'chance', percent: 60 }],
                      do: [
                        {
                          count: { max: 3, min: 1, value: 'random' },
                          item: coin,
                          step: 'drop_item',
                        },
                        {
                          sound: 'minecraft:entity.player.levelup',
                          step: 'play_sound',
                          where: 'player',
                        },
                        { step: 'show_action_bar', text: ['Lucky!'] },
                      ],
                      else: [
                        { count: 1, mob: 'minecraft:silverfish', step: 'spawn_mob' },
                        { step: 'show_action_bar', text: ['Unlucky...'] },
                      ],
                      match: 'all',
                      step: 'if',
                    },
                    { step: 'show_message', text: ['Lucky blocks opened: ', counter] },
                  ],
                  key: 'open_lucky_block',
                  name: 'Open a lucky block',
                  when: { subject: block, trigger: 'block_broken' },
                },
                {
                  do: [
                    { count: 1, item: coin, step: 'take_item' },
                    { effect: 'minecraft:luck', seconds: 60, step: 'give_effect' },
                    {
                      sound: 'minecraft:block.amethyst_block.chime',
                      step: 'play_sound',
                      where: 'player',
                    },
                  ],
                  key: 'spend_coin',
                  name: 'Spend a lucky coin',
                  when: { options: { cooldown_seconds: 1 }, subject: coin, trigger: 'item_used' },
                },
              ],
              [{ name: 'lucky_blocks', scope: 'player', start: 0 }],
            ),
            `A rule book: each rule says when something happens, what must be true and what to do, with no code. The first rule runs when a player breaks ${block}: it adds one to the player's counter lucky_blocks, then with a 60 per cent chance drops a random number of coins, from one to three, and otherwise spawns a silverfish. The counter is saved with the world, one value per player, and the chat shows it after each block. The second rule runs when a player uses ${coin}: it takes the coin and gives Luck for a minute. On export the book becomes events on the block and the coin plus a generated script, so it needs the Fabric mod jar export.`,
          ),
          element(
            block,
            KINDS.block,
            {
              format: 1,
              model: blockModel,
              display_name: 'Lucky Block',
              sound_type: 'amethyst',
              item: { creative_tab: 'minecraft:building_blocks' },
              components: { 'msm:breakable': { hardness: 0.5, resistance: 0.5 } },
            },
            'The lucky block itself. It has no loot of its own (no loot field), so breaking it drops only what the rule book decides. The book adds the break event (msm:on_break) when the project is exported.',
          ),
          element(
            blockModel,
            KINDS.model,
            { parent: 'minecraft:block/cube_all', textures: { all: blockModel } },
            'A full cube drawn from textures/block/lucky_block.png on every side.',
          ),
          element(
            coin,
            KINDS.item,
            {
              format: 1,
              model: rl(namespace, 'item/lucky_coin'),
              display_name: 'Lucky Coin',
              max_stack_size: 64,
              rarity: 'uncommon',
              creative_tab: 'minecraft:ingredients',
            },
            'The reward of the lucky block. The rule book adds the use event (msm:on_use) on export: using a coin spends it for a minute of Luck.',
          ),
          itemModel(
            namespace,
            'lucky_coin',
            'minecraft:item/generated',
            'A flat item model drawn from textures/item/lucky_coin.png.',
          ),
        ],
        assets: [
          texture(namespace, 'block/lucky_block', 'gem', COLOURS.amber, COLOURS.frost),
          texture(namespace, 'item/lucky_coin', 'disc', COLOURS.amber),
        ],
      };
    },
  }),
];

/** The rules behaviour examples, in gallery order: the guard mob. */
export const rulesBehaviourExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_rules_guard_mob',
    title: 'Rules: a guard mob',
    description:
      'A guard made with rules, no code: every five seconds it lights up each player within 12 blocks and warns them, and it calls out when hurt.',
    kind: RULES_KIND,
    category: CATEGORY,
    tags: ['rules', 'mob_every', 'for_each_player', 'mob_hurt', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => {
      const guard = rl(namespace, 'guard');
      const mob = presetMob({
        namespace,
        name: 'guard',
        preset: 'biped',
        colour: COLOURS.slate,
        entity: {
          display_name: 'Guard',
          category: 'creature',
        },
        components: {
          'msm:health': { max: 30 },
          'msm:movement': { speed: 0.2 },
          'msm:ai_goals': {
            goals: [
              { type: 'wander', speed: 0.6 },
              { type: 'look_at_player', distance: 12 },
              { type: 'look_around' },
            ],
          },
        },
        notes: {
          entity:
            'A calm guard that wanders slowly and watches players. It has no attack and no events of its own: the rule book adds the tick and hurt events (msm:on_tick, msm:on_hurt) on export. It does not spawn by itself; use its spawn egg.',
          model: 'The biped preset model.',
          animations: 'The biped preset animations: idle and walk.',
        },
      });
      return {
        elements: [
          element(
            rl(namespace, 'guard_rules'),
            RULES_KIND,
            book([
              {
                do: [
                  {
                    do: [
                      { effect: 'minecraft:glowing', seconds: 6, step: 'give_effect' },
                      { step: 'show_action_bar', text: ['The guard is watching you.'] },
                    ],
                    radius: 12,
                    step: 'for_each_player',
                  },
                  {
                    count: 5,
                    particle: 'minecraft:end_rod',
                    spread: 0.4,
                    step: 'spawn_particles',
                    where: 'here',
                  },
                ],
                key: 'watch',
                name: 'Watch the players nearby',
                when: { options: { interval_seconds: 5 }, subject: guard, trigger: 'mob_every' },
              },
              {
                do: [
                  {
                    sound: 'minecraft:entity.villager.no',
                    step: 'play_sound',
                    where: 'here',
                  },
                  {
                    step: 'show_message',
                    text: ['The guard calls for help!'],
                    who: { radius: 24, who: 'players_nearby' },
                  },
                ],
                key: 'call_for_help',
                name: 'Call for help',
                when: { subject: guard, trigger: 'mob_hurt' },
              },
            ]),
            `A rule book for ${guard}. The first rule runs every five seconds while a guard is alive: for each player within 12 blocks of it, it gives Glowing for six seconds and shows a warning above the hotbar, then sparkles at the guard. The second rule runs when a guard is hurt: it plays a sound at the guard and tells every player within 24 blocks in the chat. On export the book becomes events on the mob plus a generated script, so it needs the Fabric mod jar export.`,
          ),
          ...mob.elements,
        ],
        assets: mob.assets,
      };
    },
  }),
];
