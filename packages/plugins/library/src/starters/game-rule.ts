/**
 * The Game rule Creator flow (ADR 0112 D2, ADR 0111 D5, D6; B539): a world setting of the mod's
 * own, one `msm:game_rule` that is on or off or holds a whole number, listed in the game rule
 * screen under the group picked and set with `/gamerule <ns>:<id>`. If chosen it is put to use
 * at once: a Rule book (`<ns>:<id>_rules`) greets each player who joins while the setting is on
 * (above 0 for a number), and, if chosen, counts the greetings as a statistic of each player
 * (`msm:stat` `<ns>:<id>_count`, in the Statistics screen and as the scoreboard criterion
 * `minecraft.custom:<ns>.<id>_count`). Ids derive from `rule_name`. Game rules, statistics and
 * rules that read them need the Fabric mod jar export.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  JsonObject,
  StarterParameter,
} from '@msm/plugin-api';
import { element, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  stringValue,
} from '../content/parameters';

/** The kinds the flow writes, named by string (the library imports no plugin). */
const GAME_RULE_KIND = 'msm:game_rule';
const STAT_KIND = 'msm:stat';
const RULES_KIND = 'msm:rules';

/** Vanilla's game rule groups (ADR 0111 D5), in words. */
export const GAME_RULE_CATEGORIES: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'player', label: 'Player' },
  { value: 'mobs', label: 'Mobs' },
  { value: 'spawning', label: 'Spawning' },
  { value: 'drops', label: 'Drops' },
  { value: 'updates', label: 'World updates' },
  { value: 'chat', label: 'Chat' },
  { value: 'misc', label: 'Miscellaneous' },
]);

/** The Game rule flow's questions, groups "Rule" and "Using it". */
export const GAME_RULE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'rule_name',
    label: 'What is the setting called?',
    description:
      'Its name in the game rule screen. Ids derive from it: Welcome Message gives welcome_message.',
    group: 'Rule',
    type: 'string',
    default: 'Welcome Message',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'description',
    label: 'What it does, in a sentence',
    description: 'Shown under the name in the game rule screen.',
    group: 'Rule',
    type: 'string',
    default: 'Whether players are greeted when they join.',
    maxLength: 160,
  },
  {
    id: 'kind',
    label: 'What it holds',
    group: 'Rule',
    type: 'choice',
    default: 'switch',
    choices: [
      { value: 'switch', label: 'On or off' },
      { value: 'number', label: 'A whole number' },
    ],
  },
  {
    id: 'starts_on',
    label: 'On in a new world',
    group: 'Rule',
    type: 'boolean',
    default: true,
  },
  {
    id: 'number_default',
    label: 'Number in a new world',
    group: 'Rule',
    type: 'number',
    default: 3,
    min: -1000000,
    max: 1000000,
    step: 1,
  },
  {
    id: 'number_min',
    label: 'Lowest number allowed',
    group: 'Rule',
    type: 'number',
    default: 0,
    min: -1000000,
    max: 1000000,
    step: 1,
  },
  {
    id: 'number_max',
    label: 'Highest number allowed',
    group: 'Rule',
    type: 'number',
    default: 10,
    min: -1000000,
    max: 1000000,
    step: 1,
  },
  {
    id: 'category',
    label: 'Listed under',
    description: 'The group of the game rule screen it is listed in.',
    group: 'Rule',
    type: 'choice',
    default: 'chat',
    choices: GAME_RULE_CATEGORIES.map((entry) => ({ ...entry })),
  },
  {
    id: 'greets',
    label: 'Greet players while it is on',
    description:
      'A rule that says your message to each player who joins while the setting is on (above 0 for a number).',
    group: 'Using it',
    type: 'boolean',
    default: true,
  },
  {
    id: 'greeting',
    label: 'The greeting',
    group: 'Using it',
    type: 'string',
    default: 'Welcome back!',
    maxLength: 120,
  },
  {
    id: 'counts',
    label: 'Count the greetings',
    description:
      "A statistic of each player's own, in the Statistics screen: how many times they were greeted.",
    group: 'Using it',
    type: 'boolean',
    default: false,
  },
]);

/** A whole number in `[min, max]` from a number answer. */
function wholeNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

export function gameRuleBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(GAME_RULE_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'rule_name'));
  const description = stringValue(values, 'description').trim();
  const number = stringValue(values, 'kind') === 'number';
  const category =
    GAME_RULE_CATEGORIES.find((entry) => entry.value === stringValue(values, 'category')) ??
    (GAME_RULE_CATEGORIES[0] as (typeof GAME_RULE_CATEGORIES)[number]);
  const greeting = stringValue(values, 'greeting').trim() || 'Welcome!';
  const greets = booleanValue(values, 'greets');
  const counts = greets && booleanValue(values, 'counts');
  const rule = rl(namespace, name.id);
  const stat = rl(namespace, `${name.id}_count`);

  const ruleData: JsonObject = {
    format: 1,
    kind: number ? 'integer' : 'boolean',
    category: category.value,
    display_name: name.display,
    ...(description === '' ? {} : { description }),
  };
  let words: string;
  if (number) {
    const low = wholeNumber(numberValue(values, 'number_min'), -1000000, 1000000);
    const high = Math.max(low, wholeNumber(numberValue(values, 'number_max'), -1000000, 1000000));
    const start = Math.min(high, Math.max(low, Math.round(numberValue(values, 'number_default'))));
    Object.assign(ruleData, { default: start, min: low, max: high });
    words = `a whole number from ${low} to ${high}, ${start} in a new world (/gamerule refuses numbers outside the range)`;
  } else {
    const on = booleanValue(values, 'starts_on');
    ruleData.default = on;
    words = `on or off, ${on ? 'on' : 'off'} in a new world`;
  }

  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: the ${name.lower} game rule`, PACK_NOTES),
    modElement(namespace, projectName, `Adds the ${name.lower} game rule.`),
    element(
      rule,
      GAME_RULE_KIND,
      ruleData,
      `A game rule of the mod's own: a world setting that is ${words}, listed under ${category.label} in the game rule screen and set with /gamerule ${rule}. It is saved with each world. A rule reads it with "The game rule is" and changes it with "Set a game rule"; a script with world.gameRule and world.setGameRule.`,
    ),
  ];
  if (greets) {
    const steps: JsonObject[] = [{ step: 'show_message', text: [greeting] }];
    if (counts) steps.push({ amount: 1, stat, step: 'add_to_stat' });
    elements.push(
      element(
        rl(namespace, `${name.id}_rules`),
        RULES_KIND,
        {
          counters: [],
          format: 1,
          rules: [
            {
              do: steps,
              key: `greet_${name.id}`,
              name: 'Greet players',
              only_if: {
                conditions: [
                  number
                    ? { compare: 'more_than', condition: 'game_rule', game_rule: rule, value: 0 }
                    : { condition: 'game_rule', game_rule: rule, value: true },
                ],
                match: 'all',
              },
              when: { trigger: 'player_joined' },
            },
          ],
        },
        `When a player joins and the game rule ${rule} is ${number ? 'above 0' : 'on'}, it says "${greeting}" to them${counts ? ` and adds 1 to their statistic ${stat}` : ''}. Switch the rule off with /gamerule ${rule} ${number ? '0' : 'false'} and the greeting stops. Rules that read a game rule run through a script, so they need the Fabric mod jar export.`,
      ),
    );
  }
  if (counts) {
    elements.push(
      element(
        stat,
        STAT_KIND,
        { format: 1, formatter: 'default', display_name: `${name.display} Greetings` },
        `A statistic: a number counted for each player and shown in the Statistics screen, here how many times they were greeted. A scoreboard objective follows it with the criterion minecraft.custom:${namespace}.${name.id}_count.`,
      ),
    );
  }
  return { elements, assets: [] };
}
