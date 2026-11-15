/**
 * The Custom command Creator flow (ADR 0101 D2, ADR 0096 D1): one `msm:command`, a new server
 * command typed as `/<name>` that runs an event (no function, so it needs no permission level
 * for a function and gives no `commands.runs-as-player` note): it heals you, gives you an effect,
 * gives you an item or launches you up, plays a sound and says a message back. Who may use it
 * is a question: every player (level 0, the default) or operators only (level 2, as `/give`).
 *
 * Its id is the command name: `/heal` is `<ns>:heal`.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import { element, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import { numberValue, readValues, stringValue } from '../content/parameters';

/** The command kind (ADR 0096 D1). */
const COMMAND_KIND = 'msm:command';

/** What a command can do, by event action. */
const ACTIONS: readonly { value: string; label: string }[] = [
  { value: 'heal', label: 'Heal you' },
  { value: 'effect', label: 'Give you an effect' },
  { value: 'item', label: 'Give you an item' },
  { value: 'launch', label: 'Launch you up' },
];

/** Effects the command can give (vanilla, both targets). */
const EFFECTS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:speed', label: 'Speed' },
  { value: 'minecraft:night_vision', label: 'Night vision' },
  { value: 'minecraft:regeneration', label: 'Regeneration' },
  { value: 'minecraft:jump_boost', label: 'Jump boost' },
  { value: 'minecraft:fire_resistance', label: 'Fire resistance' },
  { value: 'minecraft:water_breathing', label: 'Water breathing' },
];

/** Items the command can give (vanilla, both targets). */
const ITEMS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:bread', label: 'Bread' },
  { value: 'minecraft:torch', label: 'Torches' },
  { value: 'minecraft:cookie', label: 'Cookies' },
  { value: 'minecraft:arrow', label: 'Arrows' },
  { value: 'minecraft:oak_log', label: 'Oak logs' },
];

/** The Custom command questions, groups "Command" and "What it does". */
export const CUSTOM_COMMAND_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'command_name',
    label: 'Command name',
    description:
      'What players type after the slash: small letters, digits and _, starting with a letter. It must not be a vanilla command.',
    group: 'Command',
    type: 'string',
    default: 'heal',
    pattern: '^[a-z][a-z0-9_]*$',
    maxLength: 32,
  },
  {
    id: 'who',
    label: 'Who can use it',
    group: 'Command',
    type: 'choice',
    default: 'everyone',
    choices: [
      { value: 'everyone', label: 'Every player' },
      { value: 'operators', label: 'Operators only (as /give)' },
    ],
  },
  {
    id: 'message',
    label: 'Message back',
    description: 'What the command says to the player who used it.',
    group: 'Command',
    type: 'string',
    default: 'You feel better.',
    maxLength: 120,
  },
  {
    id: 'action',
    label: 'What it does',
    group: 'What it does',
    type: 'choice',
    default: 'heal',
    choices: ACTIONS.map((entry) => ({ ...entry })),
  },
  {
    id: 'amount',
    label: 'Health restored',
    description: 'In half hearts (20 is full health).',
    group: 'What it does',
    type: 'number',
    default: 20,
    min: 1,
    max: 40,
    step: 1,
  },
  {
    id: 'effect',
    label: 'Effect',
    group: 'What it does',
    type: 'choice',
    default: 'minecraft:speed',
    choices: EFFECTS.map((entry) => ({ ...entry })),
  },
  {
    id: 'seconds',
    label: 'Effect seconds',
    group: 'What it does',
    type: 'number',
    default: 30,
    min: 1,
    max: 600,
    step: 1,
  },
  {
    id: 'item',
    label: 'Item',
    group: 'What it does',
    type: 'choice',
    default: 'minecraft:bread',
    choices: ITEMS.map((entry) => ({ ...entry })),
  },
  {
    id: 'count',
    label: 'How many',
    group: 'What it does',
    type: 'number',
    default: 1,
    min: 1,
    max: 64,
    step: 1,
  },
]);

export function customCommandBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(CUSTOM_COMMAND_PARAMETERS, context);
  const typed = stringValue(values, 'command_name');
  const name = /^[a-z][a-z0-9_]{0,63}$/.test(typed) ? typed : 'heal';
  const operators = stringValue(values, 'who') === 'operators';
  const message = stringValue(values, 'message').trim();
  const action = stringValue(values, 'action');
  let does: JsonObject;
  let words: string;
  switch (action) {
    case 'effect': {
      const effect = stringValue(values, 'effect');
      const seconds = Math.round(numberValue(values, 'seconds'));
      does = { type: 'apply_effect', effect, seconds };
      words = `gives you ${effect.slice('minecraft:'.length).replaceAll('_', ' ')} for ${seconds} seconds`;
      break;
    }
    case 'item': {
      const item = stringValue(values, 'item');
      const count = Math.round(numberValue(values, 'count'));
      does = count === 1 ? { type: 'give_item', item } : { type: 'give_item', item, count };
      words = `gives you ${count} ${item.slice('minecraft:'.length).replaceAll('_', ' ')}`;
      break;
    }
    case 'launch':
      does = { type: 'launch', strength: 1.2, direction: 'up' };
      words = 'launches you up into the air';
      break;
    default: {
      const amount = Math.round(numberValue(values, 'amount'));
      does = { type: 'heal', amount };
      words = `heals you by ${amount} half hearts`;
    }
  }
  const data: JsonObject = {
    format: 1,
    name,
    event: 'run',
    events: {
      run: {
        actions: [does, { type: 'play_sound', sound: 'minecraft:block.note_block.chime' }],
      },
    },
  };
  if (operators) data.permission = 2;
  if (message !== '') data.feedback_text = message;
  return {
    elements: [
      packElement(namespace, `${projectName}: the /${name} command`, PACK_NOTES),
      modElement(namespace, projectName, `Adds the /${name} command.`),
      element(
        rl(namespace, name),
        COMMAND_KIND,
        data,
        `The /${name} command: typed by ${operators ? 'an operator' : 'any player'}, it ${words} and plays a chime${message === '' ? '' : `, then says "${message}"`}. It runs the event run, so no function or script is needed. Commands need the Fabric mod jar export.`,
      ),
    ],
    assets: [],
  };
}
