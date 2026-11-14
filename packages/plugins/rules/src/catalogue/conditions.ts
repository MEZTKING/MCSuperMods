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
  condition({
    id: 'dimension_is',
    label: 'The dimension is',
    sentence: 'this is in {dimension}',
    notSentence: 'this is not in {dimension}',
    slots: [{ name: 'dimension', type: 'dimension' }],
  }),
  condition({
    id: 'counter',
    label: 'A counter',
    sentence: '{counter} is {compare} {number}',
    notSentence: '{counter} is not {compare} {number}',
    slots: [{ name: 'counter', type: 'counter' }, COMPARE, NUMBER],
  }),
]);
