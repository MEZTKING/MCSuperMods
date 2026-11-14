/**
 * Test helpers for triggers and actions: a small project (namespace `ev`) of blocks, items and a
 * mob with events, on top of the block and mob test projects, and a local source over it.
 */
import type { Json } from '@msm/plugin-api';
import {
  type ChanceMode,
  LocalWorldSource,
  type RuleBookInfo,
  type SimEffect,
  type WorldEvent,
} from '../../src/index.js';
import { FAKE_TARGET, testFiles } from '../blocks/helpers.js';
import { mobFiles } from '../entities/helpers.js';

export const EV = 'ev';

const event = (...actions: Json[]): Json => ({ actions });

/** Block definitions with events. */
export const EV_BLOCKS: Readonly<Record<string, Json>> = {
  chime: {
    format: 1,
    components: { 'msm:on_interact': { event: 'ring' } },
    events: {
      ring: event(
        { type: 'play_sound', sound: 'minecraft:block.note_block.chime', pitch: 2 },
        { type: 'give_item', item: 'ev:ruby', count: 2 },
      ),
    },
  },
  pad: {
    format: 1,
    type: 'slab',
    components: { 'msm:on_step': { event: 'step', cooldown_ticks: 10 } },
    events: { step: event({ type: 'spawn_particle', particle: 'minecraft:end_rod', count: 3 }) },
  },
  mist: {
    format: 1,
    components: {
      'msm:shape': { boxes: [[0, 0, 0, 16, 2, 16]], collision: false },
      'msm:on_entity_inside': { event: 'inside' },
    },
    events: { inside: event({ type: 'apply_effect', effect: 'minecraft:slowness', seconds: 2 }) },
  },
  trap: {
    format: 1,
    components: {
      'msm:on_break': { event: 'broken' },
      'msm:on_place': { event: 'placed' },
      'msm:on_random_tick': { event: 'tick', chance: 0.5 },
      'msm:machine': { on_start: 'tick' },
    },
    events: {
      broken: event({ type: 'run_function', function: 'ev:boom' }),
      placed: event(
        { type: 'set_block_state', state: 'ev:chime', offset: [0, 1, 0] },
        { type: 'trigger_event', event: 'tick' },
      ),
      tick: event({ type: 'play_sound', sound: 'ev:tick' }),
    },
  },
  lamp: {
    format: 1,
    components: { 'msm:redstone': { on_powered: 'on', on_unpowered: 'off' } },
    events: {
      on: event({ type: 'light_portal', portal: 'ev:gate' }),
      off: event({ type: 'damage', amount: 4 }),
    },
  },
  loop: {
    format: 1,
    components: { 'msm:on_interact': { event: 'again' } },
    events: { again: event({ type: 'trigger_event', event: 'again' }) },
  },
  crate: {
    format: 1,
    components: { 'msm:container': { rows: 3, on_open: 'opened', on_close: 'closed' } },
    events: { opened: event({ type: 'play_sound', sound: 'minecraft:block.barrel.open' }) },
  },
};

/** Item definitions with events. */
export const EV_ITEMS: Readonly<Record<string, Json>> = {
  ruby: { format: 1, max_stack_size: 16 },
  wand: {
    format: 1,
    components: {
      'msm:on_use': { event: 'zap', cooldown_ticks: 20 },
      'msm:on_hit': { event: 'zap' },
    },
    events: {
      zap: event(
        { type: 'launch', strength: 0, up: 1, direction: 'up' },
        { type: 'heal', amount: 3 },
      ),
    },
  },
  trowel: {
    format: 1,
    components: { 'msm:on_use_on_block': { event: 'dig' } },
    events: { dig: event({ type: 'set_block_state', state: 'minecraft:air' }) },
  },
};

/** A mob with every handled entity trigger. */
export const EV_MOBS: Readonly<Record<string, Json>> = {
  golem: {
    format: 1,
    category: 'creature',
    size: { width: 0.8, height: 1.6 },
    components: {
      'msm:animated_model': { model: 'ev:entity/golem', texture: 'ev:entity/golem' },
      'msm:on_spawn': { event: 'hello' },
      'msm:on_interact': { event: 'poke' },
      'msm:on_death': { event: 'bye' },
      'msm:on_tick': { event: 'beat', interval_ticks: 40 },
      'msm:on_hurt': { event: 'ouch' },
    },
    events: {
      hello: event({ type: 'play_animation', animation: 'wave' }),
      poke: event(
        { type: 'give_item', item: 'ev:ruby' },
        { type: 'apply_effect', effect: 'minecraft:glowing', seconds: 3, target: 'self' },
      ),
      bye: event({ type: 'give_item', item: 'ev:ruby', count: 5 }),
      beat: event(
        { type: 'give_item', item: 'ev:ruby' },
        { type: 'play_sound', sound: 'minecraft:block.note_block.bell' },
      ),
      ouch: event({ type: 'play_sound', sound: 'minecraft:entity.generic.hurt' }),
    },
  },
};

/** The test projects plus the `ev` project, as lowered files. */
export function evFiles(extra: Record<string, Json> = {}): Map<string, string> {
  const files = new Map<string, string>([...testFiles(), ...mobFiles()]);
  for (const [path, json] of Object.entries(EV_BLOCKS)) {
    files.set(`msm/${EV}/block/${path}.json`, JSON.stringify(json));
  }
  for (const [path, json] of Object.entries(EV_ITEMS)) {
    files.set(`msm/${EV}/item/${path}.json`, JSON.stringify(json));
  }
  for (const [path, json] of Object.entries(EV_MOBS)) {
    files.set(`msm/${EV}/entity/${path}.json`, JSON.stringify(json));
  }
  files.set(
    `assets/${EV}/lang/en_us.json`,
    JSON.stringify({ 'block.ev.chime': 'Chime Block', 'item.ev.ruby': 'Ruby' }),
  );
  for (const [path, json] of Object.entries(extra)) files.set(path, JSON.stringify(json));
  return files;
}

/** A local source over files, with every event and effect it sends. */
export function evSource(
  options: {
    files?: Map<string, string | Uint8Array>;
    chance?: ChanceMode;
    seed?: number;
    ruleBooks?: readonly RuleBookInfo[];
    target?: ConstructorParameters<typeof LocalWorldSource>[0]['target'];
  } = {},
): { source: LocalWorldSource; events: WorldEvent[]; effects: () => SimEffect[] } {
  const source = new LocalWorldSource({
    files: options.files ?? evFiles(),
    target: options.target ?? FAKE_TARGET,
    seed: options.seed ?? 5,
    ...(options.chance === undefined ? {} : { chance: options.chance }),
    ...(options.ruleBooks === undefined ? {} : { ruleBooks: options.ruleBooks }),
  });
  const events: WorldEvent[] = [];
  source.subscribe((event) => events.push(event));
  return {
    source,
    events,
    effects: () => events.flatMap((event) => (event.type === 'effect' ? [event.effect] : [])),
  };
}

export const floorAt = (x: number, z: number) => ({ x, y: -1, z });
export const UP = { x: 0.5, y: 1, z: 0.5 };
