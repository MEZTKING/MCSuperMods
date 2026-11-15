/**
 * "New element" templates of server commands and creative tabs (ADR 0101 D3; B461). The command
 * templates run an event of their own, so they need no function or script and the validators
 * report nothing; a command that teleports or reads arguments needs a function, which a template
 * cannot create (the Server helper example holds one). The tab template is an `msm:creative_tab`
 * element: the blocks-items plugin owns that kind, but its templates sit here with the commands
 * (plan B461). Only vanilla ids are named.
 */
import type { ElementTemplate, Json, TemplateContext } from '@msm/plugin-api';
import { COMMAND_KIND } from '../kinds';

/** Kind id of creative tabs, owned by `@msm/plugin-blocks-items` (a plugin imports no plugin). */
const CREATIVE_TAB_KIND = 'msm:creative_tab';

const COMMAND_CATEGORY = 'Commands';
const TAB_CATEGORY = 'Creative tabs';

/** `ores/Ruby Ore` becomes `Ruby Ore`: the last path segment in title case. */
function title(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last
    .split(/[_\-.]+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/** The command word of an element: the last path segment, lower case, `[a-z0-9_]` only. */
function commandWord(context: TemplateContext): string {
  const last = context.path.split('/').pop() ?? context.path;
  const word = last.toLowerCase().replaceAll(/[^a-z0-9_]/g, '_');
  return word === '' ? 'command' : word;
}

export const commandTemplates: readonly ElementTemplate[] = Object.freeze([
  {
    id: 'msm_command_help',
    kind: COMMAND_KIND,
    category: COMMAND_CATEGORY,
    title: 'Help command',
    description:
      'A command every player can use, typed as /helpme (or /tips): it plays a chime and answers in chat. Change the answer in "Feedback text". It runs an event of its own, so it needs no function.',
    defaultName: 'helpme',
    data: (context): Json => ({
      format: 1,
      name: commandWord(context),
      aliases: ['tips'],
      event: 'help',
      events: {
        help: {
          actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.chime' }],
        },
      },
      feedback_text: 'Welcome! Ask an operator if you are stuck.',
    }),
  },
  {
    id: 'msm_command_hop',
    kind: COMMAND_KIND,
    category: COMMAND_CATEGORY,
    title: 'Hop command',
    description:
      'A command that throws the player who types it a few blocks up and lets them float down gently, typed as /hop. It shows an event with several actions and no function.',
    defaultName: 'hop',
    data: (context): Json => ({
      format: 1,
      name: commandWord(context),
      event: 'hop',
      events: {
        hop: {
          actions: [
            { type: 'launch', direction: 'up', strength: 0.8 },
            { type: 'apply_effect', effect: 'minecraft:slow_falling', seconds: 6 },
            { type: 'play_sound', sound: 'minecraft:entity.firework_rocket.launch' },
          ],
        },
      },
      feedback_text: 'Up you go!',
    }),
  },
  {
    id: 'msm_creative_tab',
    kind: CREATIVE_TAB_KIND,
    category: TAB_CATEGORY,
    title: 'Creative tab',
    description:
      'A tab of its own in the creative inventory with a crafting table as its icon. Items and blocks join it by naming it in their "Creative tab" field; they show in the order they are made.',
    data: (context): Json => ({
      format: 1,
      icon: 'minecraft:crafting_table',
      display_name: title(context.path),
    }),
  },
] satisfies ElementTemplate[]);
