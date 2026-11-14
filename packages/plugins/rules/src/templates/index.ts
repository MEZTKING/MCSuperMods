/**
 * "New element" templates of `@msm/plugin-rules` (ADR 0082 D11), category "Rules": Welcome
 * message, Jump pad, Lucky block, Healing spring, Click counter and Mob drops a reward. Each is a
 * rule book naming only vanilla subjects (player and world triggers, or the `any_` triggers), so
 * it validates and compiles on its own in any project; the descriptions say which ids to change
 * to the user's own things.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { RULES_KIND } from '../kinds';

const CATEGORY = 'Rules';

/** Rule book data. */
const book = (rules: Json[], counters: Json[] = []): Json => ({ counters, format: 1, rules });

export const rulesTemplates: readonly ElementTemplate[] = Object.freeze([
  {
    id: 'msm_rules_welcome_message',
    kind: RULES_KIND,
    category: CATEGORY,
    title: 'Welcome message',
    description:
      'When a player joins, shows a big welcome title, a chat message and a chime. Change the words to your own.',
    data: () =>
      book([
        {
          do: [
            { step: 'show_title', subtitle: ['Have fun exploring'], title: ['Welcome!'] },
            { step: 'show_message', text: ['Welcome to the world. Have fun!'] },
            { sound: 'minecraft:block.note_block.chime', step: 'play_sound', where: 'player' },
          ],
          key: 'welcome',
          name: 'Welcome',
          when: { trigger: 'player_joined' },
        },
      ]),
  },
  {
    id: 'msm_rules_jump_pad',
    kind: RULES_KIND,
    category: CATEGORY,
    title: 'Jump pad',
    description:
      'Players standing on a Slime Block are launched high into the air with a bounce sound. Change the block to your own jump pad.',
    data: () =>
      book([
        {
          do: [
            { direction: 'up', step: 'launch', strength: 1.5, who: 'player' },
            { sound: 'minecraft:block.slime_block.fall', step: 'play_sound', where: 'player' },
          ],
          key: 'jump_pad',
          name: 'Jump pad',
          only_if: {
            conditions: [
              {
                block: 'minecraft:slime_block',
                condition: 'block_is',
                where: { from: 'player', offset: [0, -1, 0], place: 'offset' },
              },
            ],
            match: 'all',
          },
          when: { options: { interval_seconds: 0.25 }, trigger: 'player_every' },
        },
      ]),
  },
  {
    id: 'msm_rules_lucky_block',
    kind: RULES_KIND,
    category: CATEGORY,
    title: 'Lucky block',
    description:
      'Breaking a Sponge is a gamble: half the time it drops one to three diamonds, otherwise a zombie appears. Change the block to your own lucky block.',
    data: () =>
      book([
        {
          do: [
            {
              conditions: [{ condition: 'chance', percent: 50 }],
              do: [
                {
                  count: { max: 3, min: 1, value: 'random' },
                  item: 'minecraft:diamond',
                  step: 'drop_item',
                },
                { step: 'show_action_bar', text: ['Lucky!'] },
              ],
              else: [
                { count: 1, mob: 'minecraft:zombie', step: 'spawn_mob' },
                { step: 'show_action_bar', text: ['Unlucky...'] },
              ],
              match: 'all',
              step: 'if',
            },
          ],
          key: 'lucky_block',
          name: 'Lucky block',
          when: { subject: 'minecraft:sponge', trigger: 'any_block_broken' },
        },
      ]),
  },
  {
    id: 'msm_rules_healing_spring',
    kind: RULES_KIND,
    category: CATEGORY,
    title: 'Healing spring',
    description:
      'Players standing in water heal a little every second, with hearts around them. Change the block to make your own healing spot.',
    data: () =>
      book([
        {
          do: [
            { amount: 1, step: 'heal', who: 'player' },
            {
              count: 3,
              particle: 'minecraft:heart',
              spread: 0.5,
              step: 'spawn_particles',
              where: 'player',
            },
          ],
          key: 'healing_spring',
          name: 'Healing spring',
          only_if: {
            conditions: [{ block: 'minecraft:water', condition: 'block_is', where: 'player' }],
            match: 'all',
          },
          when: { options: { interval_seconds: 1 }, trigger: 'player_every' },
        },
      ]),
  },
  {
    id: 'msm_rules_click_counter',
    kind: RULES_KIND,
    category: CATEGORY,
    title: 'Click counter',
    description:
      'Counts how many times each player has used a Lever and shows the count above the hotbar. Change the block to your own.',
    data: () =>
      book(
        [
          {
            do: [
              { amount: 1, counter: 'clicks', scope: 'player', step: 'add_to_counter' },
              {
                step: 'show_action_bar',
                text: ['Clicks: ', { counter: 'clicks', scope: 'player', value: 'counter' }],
              },
            ],
            key: 'count_clicks',
            name: 'Count clicks',
            when: { subject: 'minecraft:lever', trigger: 'any_block_used' },
          },
        ],
        [{ name: 'clicks', scope: 'player', start: 0 }],
      ),
  },
  {
    id: 'msm_rules_mob_reward',
    kind: RULES_KIND,
    category: CATEGORY,
    title: 'Mob drops a reward',
    description:
      'Zombies drop an emerald one time in ten when they die. Change the mob to your own and the item to your own reward.',
    data: () =>
      book([
        {
          do: [{ count: 1, item: 'minecraft:emerald', step: 'drop_item' }],
          key: 'zombie_reward',
          name: 'Zombie reward',
          only_if: { conditions: [{ condition: 'chance', percent: 10 }], match: 'all' },
          when: { subject: 'minecraft:zombie', trigger: 'any_mob_died' },
        },
      ]),
  },
]);
