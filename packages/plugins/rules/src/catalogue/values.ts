/**
 * Value readings (ADR 0082 D2, D5), places and "who" (ADR 0082 D5) of format 1.
 */
import { FACING_OF } from './conditions';
import type { PlaceEntry, SlotSpec, ValueEntry, WhoEntry } from './types';

const value = (
  entry: Omit<ValueEntry, 'veryEasy' | 'slots' | 'plain'> & {
    slots?: readonly SlotSpec[];
    plain?: boolean;
  },
): ValueEntry =>
  Object.freeze({
    ...entry,
    slots: Object.freeze([...(entry.slots ?? [])]),
    veryEasy: true,
    plain: entry.plain ?? true,
    ...(entry.triggers === undefined ? {} : { triggers: Object.freeze([...entry.triggers]) }),
  });

export const VALUES: readonly ValueEntry[] = Object.freeze([
  value({
    id: 'random',
    label: 'A random number',
    sentence: 'a random number from {min} to {max}',
    slots: [
      { name: 'min', type: 'number' },
      { name: 'max', type: 'number' },
      {
        name: 'whole',
        type: 'choice',
        optional: true,
        choices: [
          { value: true, label: 'whole numbers' },
          { value: false, label: 'any number' },
        ],
      },
    ],
  }),
  value({
    id: 'counter',
    label: 'A counter',
    sentence: '{counter}',
    slots: [{ name: 'counter', type: 'counter' }],
  }),
  value({
    id: 'player_health',
    label: "The player's health",
    sentence: "the player's health",
    needsActor: 'player',
  }),
  value({
    id: 'player_food',
    label: "The player's food",
    sentence: "the player's food",
    needsActor: 'player',
  }),
  value({
    id: 'player_level',
    label: "The player's level",
    sentence: "the player's level",
    needsActor: 'player',
  }),
  value({
    id: 'player_position',
    label: "The player's position",
    sentence: "the player's {axis} position",
    slots: [
      {
        name: 'axis',
        type: 'choice',
        choices: [
          { value: 'x', label: 'x' },
          { value: 'y', label: 'y' },
          { value: 'z', label: 'z' },
        ],
      },
    ],
    needsActor: 'player',
  }),
  value({
    id: 'player_count',
    label: 'The number of players',
    sentence: 'the number of players',
  }),
  value({
    id: 'time_of_day',
    label: 'The time of day',
    sentence: 'the time of day',
  }),
  // The vehicle of a vehicle trigger, else the one the player rides (ADR 0089 D7, Script API 1.5).
  value({
    id: 'vehicle_fuel',
    label: "The vehicle's fuel",
    sentence: "the vehicle's fuel in seconds",
    needsActor: 'player',
  }),
  value({
    id: 'vehicle_damage',
    label: "The vehicle's damage",
    sentence: "the vehicle's damage",
    needsActor: 'player',
  }),
  value({
    id: 'vehicle_ammo',
    label: "The vehicle's ammunition",
    sentence: "the vehicle's ammunition {weapon}",
    slots: [{ name: 'weapon', type: 'weapon', optional: true, prefix: 'for' }],
    needsActor: 'player',
  }),
  // The way the block here, the player, the mob or the other one faces, in words (ADR 0096 D5).
  value({
    id: 'facing',
    label: 'The way it faces',
    sentence: 'the way {of} faces',
    slots: [FACING_OF],
    plain: false,
    words: true,
  }),
  // What was typed for one of the command's arguments (ADR 0111 D1): a number for `integer`
  // and `number`, one part of a `position` or `block_position` by `axis`, and words for the
  // others Rules can read (`word`, `text`, `player` by name, `entity` by UUID, `item`, `block`,
  // `dimension`, `effect`; limit N20). The compiler checks the type against the command.
  value({
    id: 'command_argument',
    label: 'What the player typed',
    sentence: 'what the player typed for {name}',
    slots: [
      { name: 'name', type: 'argument' },
      {
        name: 'axis',
        type: 'choice',
        optional: true,
        choices: [
          { value: 'x', label: 'x' },
          { value: 'y', label: 'y' },
          { value: 'z', label: 'z' },
        ],
      },
    ],
    triggers: ['command_used'],
  }),
  // Scores, timers and teams (ADR 0115 D3), read through commands' results.
  value({
    id: 'score',
    label: 'The score of',
    sentence: 'the {objective} score of {who}',
    slots: [
      { name: 'who', type: 'who', optional: true },
      { name: 'objective', type: 'objective' },
    ],
  }),
  value({
    id: 'timer_left',
    label: 'Time left on the timer',
    sentence: 'the seconds left on {timer}',
    slots: [{ name: 'timer', type: 'timer' }],
  }),
  value({
    id: 'team_size',
    label: 'Players on the team',
    sentence: 'the number of players on {team}',
    slots: [{ name: 'team', type: 'team' }],
  }),
  value({
    id: 'math',
    label: 'Sums',
    sentence: '{a} {op} {b}',
    slots: [
      { name: 'a', type: 'number' },
      {
        name: 'op',
        type: 'choice',
        choices: [
          { value: '+', label: 'plus' },
          { value: '-', label: 'minus' },
          { value: '*', label: 'times' },
          { value: '/', label: 'divided by' },
        ],
      },
      { name: 'b', type: 'number' },
    ],
    plain: false,
  }),
]);

const place = (
  entry: Omit<PlaceEntry, 'veryEasy' | 'slots'> & {
    slots?: readonly SlotSpec[];
    veryEasy?: boolean;
  },
): PlaceEntry =>
  Object.freeze({
    ...entry,
    slots: Object.freeze([...(entry.slots ?? [])]),
    veryEasy: entry.veryEasy ?? true,
  });

/** Named places (strings) and the place objects (`place` field). */
export const PLACES: readonly PlaceEntry[] = Object.freeze([
  place({ id: 'here', label: 'Here', sentence: 'here', needsHere: true }),
  place({ id: 'above_here', label: 'Above here', sentence: 'above here', needsHere: true }),
  // One block along the facing (or axis) of the block here (ADR 0096 D5).
  place({
    id: 'in_front_of_here',
    label: 'In front of here',
    sentence: 'in front of here',
    needsHere: true,
  }),
  place({
    id: 'player',
    label: 'At the player',
    sentence: 'at the player',
    needsActor: 'player',
    needsHere: false,
  }),
  place({
    id: 'mob',
    label: 'At the mob',
    sentence: 'at the mob',
    needsActor: 'mob',
    needsHere: false,
  }),
  place({
    id: 'player_looking',
    label: 'Where the player looks',
    sentence: 'where the player looks',
    slots: [{ name: 'distance', type: 'number', optional: true, min: 1, max: 64, whole: true }],
    needsActor: 'player',
    needsHere: false,
  }),
  place({
    id: 'offset',
    label: 'Offset',
    sentence: '{offset} from {from}',
    slots: [
      { name: 'offset', type: 'number' },
      { name: 'from', type: 'place', optional: true },
    ],
    needsHere: false,
    veryEasy: false,
  }),
]);

const who = (
  entry: Omit<WhoEntry, 'veryEasy' | 'slots'> & { slots?: readonly SlotSpec[] },
): WhoEntry =>
  Object.freeze({ ...entry, slots: Object.freeze([...(entry.slots ?? [])]), veryEasy: true });

/** Named "who" (strings) and the nearby-players object (`who` field). */
export const WHO: readonly WhoEntry[] = Object.freeze([
  who({
    id: 'player',
    label: 'The player',
    sentence: 'the player',
    needsActor: 'player',
    needsHere: false,
    many: false,
  }),
  who({
    id: 'mob',
    label: 'The mob',
    sentence: 'the mob',
    needsActor: 'mob',
    needsHere: false,
    many: false,
  }),
  who({
    id: 'other',
    label: 'The other one',
    sentence: 'the other one',
    needsActor: 'other',
    needsHere: false,
    many: false,
  }),
  who({
    id: 'every_player',
    label: 'Every player',
    sentence: 'every player',
    needsHere: false,
    many: true,
  }),
  who({
    id: 'players_nearby',
    label: 'Every player nearby',
    sentence: 'every player within {radius} blocks',
    slots: [{ name: 'radius', type: 'number', min: 1, max: 64, whole: true }],
    needsHere: true,
    many: true,
  }),
]);
