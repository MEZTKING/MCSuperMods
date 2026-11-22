/**
 * The Custom command Creator flow (ADR 0101 D2, ADR 0096 D1): one `msm:command`, a new server
 * command typed as `/<name>` that runs an event (no function, so it needs no permission level
 * for a function and gives no `commands.runs-as-player` note): it heals you, gives you an effect,
 * gives you an item or launches you up, plays a sound and says a message back. Who may use it
 * is a question: every player (level 0, the default) or operators only (level 2, as `/give`).
 *
 * Its own game rule (ADR 0111 D5, B539): if chosen, a world setting `<ns>:allow_<name>` (an
 * on or off `msm:game_rule`, on in a new world) turns the command on and off with
 * `/gamerule`. The command then has no event of its own: a Rule book (`<ns>:<name>_rules`)
 * does what it does when a player types it and the rule is on, and says it is switched off
 * otherwise (rules with a game rule run through a script, so the Fabric mod jar export).
 *
 * Its id is the command name: `/heal` is `<ns>:heal`.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import { element, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import { booleanValue, numberValue, readValues, stringValue } from '../content/parameters';

/** The command kind (ADR 0096 D1). */
const COMMAND_KIND = 'msm:command';

/** The game rule kind (ADR 0111 D5) and the Rule book kind (ADR 0082), named by string. */
const GAME_RULE_KIND = 'msm:game_rule';
const RULES_KIND = 'msm:rules';

/** The chime every version of the command plays. */
const CHIME = 'minecraft:block.note_block.chime';

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
    id: 'own_rule',
    label: 'Its own game rule',
    description:
      'A world setting that turns the command on and off: /gamerule <your namespace>:allow_<command name> false switches it off.',
    group: 'Command',
    type: 'boolean',
    default: false,
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
  const ownRule = booleanValue(values, 'own_rule');
  // What it does, as an event action and as a Rules step.
  let does: JsonObject;
  let step: JsonObject;
  let words: string;
  switch (action) {
    case 'effect': {
      const effect = stringValue(values, 'effect');
      const seconds = Math.round(numberValue(values, 'seconds'));
      does = { type: 'apply_effect', effect, seconds };
      step = { step: 'give_effect', effect, seconds };
      words = `gives you ${effect.slice('minecraft:'.length).replaceAll('_', ' ')} for ${seconds} seconds`;
      break;
    }
    case 'item': {
      const item = stringValue(values, 'item');
      const count = Math.round(numberValue(values, 'count'));
      does = count === 1 ? { type: 'give_item', item } : { type: 'give_item', item, count };
      step = { step: 'give_item', item, count };
      words = `gives you ${count} ${item.slice('minecraft:'.length).replaceAll('_', ' ')}`;
      break;
    }
    case 'launch':
      does = { type: 'launch', strength: 1.2, direction: 'up' };
      step = { step: 'launch', direction: 'up', strength: 1.2 };
      words = 'launches you up into the air';
      break;
    default: {
      const amount = Math.round(numberValue(values, 'amount'));
      does = { type: 'heal', amount };
      step = { step: 'heal', amount };
      words = `heals you by ${amount} half hearts`;
    }
  }
  if (ownRule) return ownRuleBundle(context, name, operators, message, step, words);
  const data: JsonObject = {
    format: 1,
    name,
    event: 'run',
    events: {
      run: {
        actions: [does, { type: 'play_sound', sound: CHIME }],
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

/**
 * The command with its own game rule: the command (no event), the on or off rule
 * `<ns>:allow_<name>` and the Rule book that does what the command does while the rule is on.
 */
function ownRuleBundle(
  context: BundleContext,
  name: string,
  operators: boolean,
  message: string,
  step: JsonObject,
  words: string,
): ContentBundle {
  const { namespace, projectName } = context;
  const command = rl(namespace, name);
  const rule = rl(namespace, `allow_${name}`);
  const data: JsonObject = { format: 1, name };
  if (operators) data.permission = 2;
  const done: JsonObject[] = [step, { step: 'play_sound', sound: CHIME, where: 'player' }];
  if (message !== '') done.push({ step: 'show_message', text: [message] });
  return {
    elements: [
      packElement(namespace, `${projectName}: the /${name} command`, PACK_NOTES),
      modElement(namespace, projectName, `Adds the /${name} command and a game rule for it.`),
      element(
        command,
        COMMAND_KIND,
        data,
        `The /${name} command, typed by ${operators ? 'an operator' : 'any player'}. It has no event of its own: the Rule book ${namespace}:${name}_rules does what it does, so the game rule ${rule} can switch it off. Commands need the Fabric mod jar export.`,
      ),
      element(
        rule,
        GAME_RULE_KIND,
        {
          format: 1,
          kind: 'boolean',
          default: true,
          category: 'player',
          display_name: `Allow /${name}`,
          description: `Whether players can use the /${name} command.`,
        },
        `A game rule: a world setting that is on in a new world, listed under Player in the game rule screen and set with /gamerule ${rule} false. The Rule book reads it with "The game rule is".`,
      ),
      element(
        rl(namespace, `${name}_rules`),
        RULES_KIND,
        {
          counters: [],
          format: 1,
          rules: [
            {
              do: [
                {
                  conditions: [{ condition: 'game_rule', game_rule: rule, value: true }],
                  do: done,
                  else: [{ step: 'show_message', text: [`The /${name} command is switched off.`] }],
                  match: 'all',
                  step: 'if',
                },
              ],
              key: `use_${name}`,
              name: `Use /${name}`,
              when: { subject: command, trigger: 'command_used' },
            },
          ],
        },
        `When a player types /${name} and the game rule ${rule} is on, it ${words}, plays a chime${message === '' ? '' : ` and says "${message}"`}; while the rule is off it says the command is switched off. A rule that reads a game rule runs through a script, so it needs the Fabric mod jar export.`,
      ),
    ],
    assets: [],
  };
}
