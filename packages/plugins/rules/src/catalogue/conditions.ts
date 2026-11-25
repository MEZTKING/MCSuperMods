/**
 * The conditions of format 1 (ADR 0082 D5). Every condition compiles to script; a rule with
 * conditions is never plain.
 */
import type { ConditionEntry, SlotSpec } from './types';

const COMPARE: SlotSpec = {
  name: 'compare',
  type: 'choice',
  choices: [
    { value: 'less_than', label: 'less than' },
    { value: 'at_most', label: 'at most' },
    { value: 'equal_to', label: 'equal to' },
    { value: 'at_least', label: 'at least' },
    { value: 'more_than', label: 'more than' },
  ],
};
const NUMBER: SlotSpec = { name: 'number', type: 'number' };

/** The six ways a block or someone can face (ADR 0096 D5). */
export const DIRECTIONS = Object.freeze(['north', 'east', 'south', 'west', 'up', 'down'] as const);

/** Whose facing: the block here (its `facing` or `axis`), the player, the mob or the other one. */
export const FACING_OF: SlotSpec = {
  name: 'of',
  type: 'choice',
  optional: true,
  choices: [
    { value: 'here', label: 'the block here' },
    { value: 'player', label: 'the player' },
    { value: 'mob', label: 'the mob' },
    { value: 'other', label: 'the other one' },
  ],
};

const condition = (
  entry: Omit<ConditionEntry, 'veryEasy' | 'slots'> & { slots?: readonly SlotSpec[] },
): ConditionEntry =>
  Object.freeze({ ...entry, slots: Object.freeze([...(entry.slots ?? [])]), veryEasy: true });

export const CONDITIONS: readonly ConditionEntry[] = Object.freeze([
  condition({
    id: 'player_sneaking',
    label: 'The player is sneaking',
    sentence: 'the player is sneaking',
    notSentence: 'the player is not sneaking',
    needsActor: 'player',
  }),
  condition({
    id: 'player_in_creative',
    label: 'The player is in Creative',
    sentence: 'the player is in Creative',
    notSentence: 'the player is not in Creative',
    needsActor: 'player',
  }),
  condition({
    id: 'player_holding',
    label: 'The player holds an item',
    sentence: 'the player holds {item} {hand}',
    notSentence: 'the player does not hold {item} {hand}',
    slots: [
      { name: 'item', type: 'item' },
      {
        name: 'hand',
        type: 'choice',
        optional: true,
        choices: [
          { value: 'main', label: 'in the main hand' },
          { value: 'off', label: 'in the off hand' },
          { value: 'either', label: 'in either hand' },
        ],
      },
    ],
    needsActor: 'player',
  }),
  condition({
    id: 'player_has_item',
    label: 'The player has an item',
    sentence: 'the player has at least {count} {item}',
    notSentence: 'the player has fewer than {count} {item}',
    slots: [
      { name: 'count', type: 'number', optional: true, min: 1, whole: true },
      { name: 'item', type: 'item' },
    ],
    needsActor: 'player',
  }),
  condition({
    id: 'player_health',
    label: "The player's health",
    sentence: "the player's health is {compare} {number}",
    notSentence: "the player's health is not {compare} {number}",
    slots: [COMPARE, NUMBER],
    needsActor: 'player',
  }),
  condition({
    id: 'player_food',
    label: "The player's food",
    sentence: "the player's food is {compare} {number}",
    notSentence: "the player's food is not {compare} {number}",
    slots: [COMPARE, NUMBER],
    needsActor: 'player',
  }),
  condition({
    id: 'player_level',
    label: "The player's level",
    sentence: "the player's level is {compare} {number}",
    notSentence: "the player's level is not {compare} {number}",
    slots: [COMPARE, NUMBER],
    needsActor: 'player',
  }),
  condition({
    id: 'chance',
    label: 'A chance',
    sentence: 'a {percent} chance comes up',
    notSentence: 'a {percent} chance does not come up',
    slots: [{ name: 'percent', type: 'percent', min: 0, max: 100 }],
  }),
  condition({
    id: 'is_day',
    label: 'It is day',
    sentence: 'it is day',
    notSentence: 'it is not day',
  }),
  condition({
    id: 'is_night',
    label: 'It is night',
    sentence: 'it is night',
    notSentence: 'it is not night',
  }),
  condition({
    id: 'is_raining',
    label: 'It is raining',
    sentence: 'it is raining',
    notSentence: 'it is not raining',
  }),
  condition({
    id: 'is_thundering',
    label: 'It is thundering',
    sentence: 'it is thundering',
    notSentence: 'it is not thundering',
  }),
  condition({
    id: 'block_is',
    label: 'A block is there',
    sentence: 'the block {where} is {block}',
    notSentence: 'the block {where} is not {block}',
    slots: [
      { name: 'where', type: 'place', optional: true },
      { name: 'block', type: 'block' },
    ],
  }),
  condition({
    id: 'mob_is',
    label: 'A mob is a kind',
    sentence: '{who} is {mob}',
    notSentence: '{who} is not {mob}',
    slots: [
      { name: 'who', type: 'who', optional: true },
      { name: 'mob', type: 'mob' },
    ],
  }),
  // Riding and facing (ADR 0096 D5, Script API 1.6 `Entity.vehicle`).
  condition({
    id: 'is_riding',
    label: 'Someone is riding',
    sentence: '{who} is riding {mount}',
    notSentence: '{who} is not riding {mount}',
    slots: [
      { name: 'who', type: 'who', optional: true },
      { name: 'mount', type: 'mob', optional: true },
    ],
  }),
  condition({
    id: 'is_facing',
    label: 'Something is facing a way',
    sentence: '{of} is facing {direction}',
    notSentence: '{of} is not facing {direction}',
    slots: [
      FACING_OF,
      {
        name: 'direction',
        type: 'choice',
        choices: DIRECTIONS.map((value) => ({ value, label: value })),
      },
    ],
  }),
  condition({
    id: 'caused_by',
    label: 'What caused it',
    sentence: 'it was caused by {cause}',
    notSentence: 'it was not caused by {cause}',
    slots: [{ name: 'cause', type: 'mob' }],
    triggers: ['explosion'],
  }),
  condition({
    id: 'dimension_is',
    label: 'The dimension is',
    sentence: 'this is in {dimension}',
    notSentence: 'this is not in {dimension}',
    slots: [{ name: 'dimension', type: 'dimension' }],
  }),
  // Game rules and statistics (ADR 0111 D5, D6; Script API 1.7 `World.gameRule`, `Player.stat`).
  condition({
    id: 'game_rule',
    label: 'The game rule is',
    sentence: 'the game rule {game_rule} is {compare} {value}',
    notSentence: 'the game rule {game_rule} is not {compare} {value}',
    slots: [
      { name: 'game_rule', type: 'game_rule' },
      { ...COMPARE, optional: true },
      { name: 'value', type: 'game_rule_value' },
    ],
  }),
  condition({
    id: 'stat_at_least',
    label: 'The statistic is at least',
    sentence: "the player's {stat} is at least {number}",
    notSentence: "the player's {stat} is less than {number}",
    slots: [{ name: 'stat', type: 'stat' }, NUMBER],
    needsActor: 'player',
  }),
  // Areas, teams, scores and timers (ADR 0115 D2).
  condition({
    id: 'in_area',
    label: 'The player is in the area',
    sentence: 'the player is in {area}',
    notSentence: 'the player is not in {area}',
    slots: [{ name: 'area', type: 'area' }],
    needsActor: 'player',
  }),
  condition({
    id: 'on_team',
    label: 'The player is on the team',
    sentence: '{who} is on {team}',
    notSentence: '{who} is not on {team}',
    slots: [
      { name: 'who', type: 'who', optional: true },
      { name: 'team', type: 'team' },
    ],
  }),
  condition({
    id: 'score_at_least',
    label: 'The score is at least',
    sentence: 'the {objective} score of {who} is at least {number}',
    notSentence: 'the {objective} score of {who} is less than {number}',
    slots: [
      { name: 'who', type: 'who', optional: true },
      { name: 'objective', type: 'objective' },
      { ...NUMBER, whole: true },
    ],
  }),
  condition({
    id: 'timer_running',
    label: 'The timer is running',
    sentence: '{timer} is running',
    notSentence: '{timer} is not running',
    slots: [{ name: 'timer', type: 'timer' }],
  }),
  // A game's round (ADR 0132; B729): the players still in it, by B724's tag `in`.
  condition({
    id: 'only_one_left',
    label: 'Only one is left',
    sentence: 'only one player is left in {game}',
    notSentence: 'more than one player, or nobody, is left in {game}',
    slots: [{ name: 'game', type: 'game' }],
  }),
  condition({
    id: 'counter',
    label: 'A counter',
    sentence: '{counter} is {compare} {number}',
    notSentence: '{counter} is not {compare} {number}',
    slots: [{ name: 'counter', type: 'counter' }, COMPARE, NUMBER],
  }),
]);
