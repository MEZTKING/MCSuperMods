/**
 * The steps of format 1 (ADR 0082 D5), grouped as the Do picker shows them. `action` marks the
 * "(A)" steps: they compile to that format action (`action.mcdoc`) when their target matches the
 * trigger and their numbers are plain; every other step compiles to script. The HUD steps and
 * the plain explosion are ADR 0089 D7 and ADR 0090 D6 (B424).
 */
import type { SlotSpec, StepEntry, StepGroup } from './types';

const WHO: SlotSpec = { name: 'who', type: 'who', optional: true };
const WHERE: SlotSpec = { name: 'where', type: 'place', optional: true };
/** A project HUD element (ADR 0089 D7). */
const HUD: SlotSpec = { name: 'hud', type: 'hud' };

interface Spec {
  id: string;
  label: string;
  sentence: string;
  group: StepGroup;
  slots: readonly SlotSpec[];
  action?: string;
  logic?: boolean;
  needsActor?: StepEntry['needsActor'];
  defaultWho?: string;
  veryEasy?: boolean;
}

const step = (spec: Spec): StepEntry =>
  Object.freeze({
    id: spec.id,
    label: spec.label,
    sentence: spec.sentence,
    slots: Object.freeze([...spec.slots]),
    veryEasy: spec.veryEasy ?? true,
    group: spec.group,
    ...(spec.action === undefined ? {} : { action: spec.action }),
    logic: spec.logic ?? false,
    ...(spec.needsActor === undefined ? {} : { needsActor: spec.needsActor }),
    ...(spec.defaultWho === undefined ? {} : { defaultWho: spec.defaultWho }),
  });

const COUNT: SlotSpec = { name: 'count', type: 'number', optional: true, min: 1, whole: true };

export const STEPS: readonly StepEntry[] = Object.freeze([
  // Players
  step({
    id: 'give_item',
    label: 'Give an item',
    sentence: 'give {who} {count} {item}',
    group: 'players',
    slots: [WHO, COUNT, { name: 'item', type: 'item' }],
    action: 'give_item',
    defaultWho: 'player',
  }),
  step({
    id: 'take_item',
    label: 'Take an item away',
    sentence: 'take {count} {item} from {who}',
    group: 'players',
    slots: [COUNT, { name: 'item', type: 'item' }, WHO],
    defaultWho: 'player',
  }),
  step({
    id: 'heal',
    label: 'Heal',
    sentence: 'heal {who} by {amount} half hearts',
    group: 'players',
    slots: [WHO, { name: 'amount', type: 'number', min: 0 }],
    action: 'heal',
    defaultWho: 'player',
  }),
  step({
    id: 'hurt',
    label: 'Hurt',
    sentence: 'hurt {who} by {amount} half hearts',
    group: 'players',
    slots: [WHO, { name: 'amount', type: 'number', min: 0 }],
    action: 'damage',
    defaultWho: 'player',
  }),
  step({
    id: 'feed',
    label: 'Feed',
    sentence: 'feed {who} {food} food',
    group: 'players',
    slots: [
      WHO,
      { name: 'food', type: 'number', min: 0 },
      { name: 'saturation', type: 'number', optional: true, min: 0 },
    ],
    defaultWho: 'player',
  }),
  step({
    id: 'give_experience',
    label: 'Give experience',
    sentence: 'give {who} {amount} experience {levels}',
    group: 'players',
    slots: [
      WHO,
      { name: 'amount', type: 'number' },
      {
        name: 'levels',
        type: 'choice',
        optional: true,
        choices: [
          { value: false, label: 'points' },
          { value: true, label: 'levels' },
        ],
      },
    ],
    defaultWho: 'player',
  }),
  step({
    id: 'set_game_mode',
    label: 'Set the game mode',
    sentence: 'put {who} in {mode} mode',
    group: 'players',
    slots: [
      WHO,
      {
        name: 'mode',
        type: 'choice',
        choices: [
          { value: 'survival', label: 'Survival' },
          { value: 'creative', label: 'Creative' },
          { value: 'adventure', label: 'Adventure' },
          { value: 'spectator', label: 'Spectator' },
        ],
      },
    ],
    defaultWho: 'player',
  }),
  step({
    id: 'teleport',
    label: 'Teleport',
    sentence: 'teleport {who} {to}',
    group: 'players',
    slots: [WHO, { name: 'to', type: 'place' }],
    defaultWho: 'player',
  }),
  step({
    id: 'launch',
    label: 'Launch',
    sentence: 'launch {who} {direction} with strength {strength}',
    group: 'players',
    slots: [
      WHO,
      {
        name: 'direction',
        type: 'choice',
        optional: true,
        choices: [
          { value: 'look', label: 'the way they look' },
          { value: 'horizontal', label: 'forwards along the ground' },
          { value: 'up', label: 'straight up' },
        ],
      },
      { name: 'strength', type: 'number', min: 0, max: 10 },
      { name: 'up', type: 'number', optional: true, min: -10, max: 10 },
    ],
    action: 'launch',
    defaultWho: 'player',
  }),
  step({
    id: 'show_message',
    label: 'Show a chat message',
    sentence: 'show {who} the message {text}',
    group: 'players',
    slots: [WHO, { name: 'text', type: 'text' }],
    defaultWho: 'player',
  }),
  step({
    id: 'show_title',
    label: 'Show a title',
    sentence: 'show {who} the title {title}',
    group: 'players',
    slots: [
      WHO,
      { name: 'title', type: 'text' },
      { name: 'subtitle', type: 'text', optional: true },
    ],
    defaultWho: 'player',
  }),
  step({
    id: 'show_action_bar',
    label: 'Show text above the hotbar',
    sentence: 'show {who} {text} above the hotbar',
    group: 'players',
    slots: [WHO, { name: 'text', type: 'text' }],
    defaultWho: 'player',
  }),
  step({
    id: 'show_hud',
    label: 'Show on screen',
    sentence: 'show {hud} to {who}',
    group: 'players',
    slots: [HUD, WHO],
    action: 'show_hud',
    defaultWho: 'player',
  }),
  step({
    id: 'hide_hud',
    label: 'Hide from the screen',
    sentence: 'hide {hud} from {who}',
    group: 'players',
    slots: [HUD, WHO],
    action: 'hide_hud',
    defaultWho: 'player',
  }),
  step({
    id: 'set_hud',
    label: 'Show a number on screen',
    sentence: 'set {hud} to {value} {text} for {who}',
    group: 'players',
    slots: [
      HUD,
      { name: 'value', type: 'number', optional: true },
      { name: 'text', type: 'text', optional: true },
      WHO,
    ],
    action: 'set_hud',
    defaultWho: 'player',
  }),
  step({
    id: 'give_effect',
    label: 'Give an effect',
    sentence: 'give {who} {effect} {level} for {seconds}',
    group: 'players',
    slots: [
      WHO,
      { name: 'effect', type: 'effect' },
      { name: 'level', type: 'number', optional: true, min: 1, max: 256, whole: true },
      { name: 'seconds', type: 'seconds', min: 0 },
    ],
    action: 'apply_effect',
    defaultWho: 'player',
  }),
  step({
    id: 'remove_effect',
    label: 'Remove an effect',
    sentence: 'remove {effect} from {who}',
    group: 'players',
    slots: [{ name: 'effect', type: 'effect' }, WHO],
    defaultWho: 'player',
  }),
  // World
  step({
    id: 'place_block',
    label: 'Place a block',
    sentence: 'place {block} {where}',
    group: 'world',
    slots: [{ name: 'block', type: 'block' }, WHERE],
    action: 'set_block_state',
  }),
  step({
    id: 'remove_block',
    label: 'Remove a block',
    sentence: 'remove the block {where}',
    group: 'world',
    slots: [
      WHERE,
      {
        name: 'drop_items',
        type: 'choice',
        optional: true,
        choices: [
          { value: false, label: 'without drops' },
          { value: true, label: 'with drops' },
        ],
      },
    ],
  }),
  step({
    id: 'spawn_mob',
    label: 'Spawn a mob',
    sentence: 'spawn {count} {mob} {where}',
    group: 'world',
    slots: [{ ...COUNT, max: 100 }, { name: 'mob', type: 'mob' }, WHERE],
  }),
  step({
    id: 'drop_item',
    label: 'Drop an item',
    sentence: 'drop {count} {item} {where}',
    group: 'world',
    slots: [{ ...COUNT, max: 64 }, { name: 'item', type: 'item' }, WHERE],
  }),
  step({
    id: 'explode',
    label: 'Make an explosion',
    sentence: 'make an explosion of power {power} {where}',
    group: 'world',
    slots: [
      { name: 'power', type: 'number', min: 0, max: 10 },
      WHERE,
      {
        name: 'fire',
        type: 'choice',
        optional: true,
        choices: [
          { value: false, label: 'without fire' },
          { value: true, label: 'with fire' },
        ],
      },
      {
        name: 'break_blocks',
        type: 'choice',
        optional: true,
        choices: [
          { value: true, label: 'breaking blocks' },
          { value: false, label: 'without breaking blocks' },
        ],
      },
    ],
    action: 'explode',
  }),
  step({
    id: 'set_weather',
    label: 'Set the weather',
    sentence: 'set the weather to {weather} {seconds}',
    group: 'world',
    slots: [
      {
        name: 'weather',
        type: 'choice',
        choices: [
          { value: 'clear', label: 'clear' },
          { value: 'rain', label: 'rain' },
          { value: 'thunder', label: 'thunder' },
        ],
      },
      { name: 'seconds', type: 'seconds', optional: true, min: 0, max: 1000000, prefix: 'for' },
    ],
  }),
  step({
    id: 'run_function',
    label: 'Run a function',
    sentence: 'run the function {function}',
    group: 'world',
    slots: [{ name: 'function', type: 'function' }],
    action: 'run_function',
  }),
  step({
    id: 'run_command',
    label: 'Run a command',
    sentence: 'run the command {command}',
    group: 'world',
    slots: [{ name: 'command', type: 'text' }],
    veryEasy: false,
  }),
  step({
    id: 'light_portal',
    label: 'Light a portal',
    sentence: 'light {portal} {where}',
    group: 'world',
    slots: [{ name: 'portal', type: 'block' }, WHERE],
    action: 'light_portal',
  }),
  // Sounds and particles
  step({
    id: 'play_sound',
    label: 'Play a sound',
    sentence: 'play {sound} {where}',
    group: 'sounds',
    slots: [
      { name: 'sound', type: 'sound' },
      WHERE,
      { name: 'volume', type: 'number', optional: true, min: 0 },
      { name: 'pitch', type: 'number', optional: true, min: 0 },
    ],
    action: 'play_sound',
  }),
  step({
    id: 'spawn_particles',
    label: 'Spawn particles',
    sentence: 'spawn {count} {particle} {where}',
    group: 'sounds',
    slots: [
      { name: 'count', type: 'number', optional: true, min: 1, max: 1000, whole: true },
      { name: 'particle', type: 'particle' },
      WHERE,
      { name: 'spread', type: 'number', optional: true, min: 0 },
      { name: 'speed', type: 'number', optional: true, min: 0 },
    ],
    action: 'spawn_particle',
  }),
  // Mobs
  step({
    id: 'play_animation',
    label: 'Play an animation',
    sentence: 'play the animation {animation} on the mob',
    group: 'mobs',
    slots: [
      { name: 'animation', type: 'text' },
      { name: 'controller', type: 'text', optional: true },
    ],
    action: 'play_animation',
    needsActor: 'mob',
  }),
  step({
    id: 'remove_mob',
    label: 'Remove the mob',
    sentence: 'remove {who}',
    group: 'mobs',
    slots: [WHO],
    defaultWho: 'mob',
  }),
  step({
    id: 'show_boss_bar',
    label: 'Show a boss bar',
    sentence: 'show the boss bar {bar} to {who}',
    group: 'mobs',
    slots: [
      { name: 'bar', type: 'text' },
      WHO,
      { name: 'title', type: 'text', optional: true },
      { name: 'value', type: 'number', optional: true },
      { name: 'max', type: 'number', optional: true },
      {
        name: 'color',
        type: 'choice',
        optional: true,
        choices: ['pink', 'blue', 'red', 'green', 'yellow', 'purple', 'white'].map((value) => ({
          value,
          label: value,
        })),
      },
      {
        name: 'visible',
        type: 'choice',
        optional: true,
        choices: [
          { value: true, label: 'shown' },
          { value: false, label: 'hidden' },
        ],
      },
    ],
    defaultWho: 'every_player',
  }),
  // Logic
  step({
    id: 'if',
    label: 'If ... otherwise ...',
    sentence: 'if these hold, then these steps, otherwise those',
    group: 'logic',
    slots: [],
    logic: true,
  }),
  step({
    id: 'repeat',
    label: 'Repeat',
    sentence: 'repeat {times} times',
    group: 'logic',
    slots: [{ name: 'times', type: 'number', min: 1, max: 100, whole: true }],
    logic: true,
  }),
  step({
    id: 'for_each_player',
    label: 'For each player',
    sentence: 'for each player {radius}',
    group: 'logic',
    slots: [{ name: 'radius', type: 'number', optional: true, min: 1, max: 64, whole: true }],
    logic: true,
  }),
  step({
    id: 'wait',
    label: 'Wait',
    sentence: 'wait {seconds}',
    group: 'logic',
    slots: [{ name: 'seconds', type: 'seconds', min: 0.05, max: 3600 }],
  }),
  step({
    id: 'stop_normal_action',
    label: 'Stop the normal action',
    sentence: 'stop the normal action',
    group: 'logic',
    slots: [],
  }),
  // Counters
  step({
    id: 'set_counter',
    label: 'Set a counter',
    sentence: 'set {counter} to {amount}',
    group: 'counters',
    slots: [
      { name: 'counter', type: 'counter' },
      { name: 'amount', type: 'number' },
    ],
  }),
  step({
    id: 'add_to_counter',
    label: 'Add to a counter',
    sentence: 'add {amount} to {counter}',
    group: 'counters',
    slots: [
      { name: 'amount', type: 'number' },
      { name: 'counter', type: 'counter' },
    ],
  }),
  step({
    id: 'take_from_counter',
    label: 'Take from a counter',
    sentence: 'take {amount} from {counter}',
    group: 'counters',
    slots: [
      { name: 'amount', type: 'number' },
      { name: 'counter', type: 'counter' },
    ],
  }),
]);
